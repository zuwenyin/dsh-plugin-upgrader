/**
 * Installing one version, and putting the plugin's state back afterwards.
 *
 * `installBundle` refuses a spec that names an already-installed dependency, so
 * replacing a version means removing first. These helpers wrap that two-step in
 * one call and undo the side effects a reinstall has on the enabled flag.
 *
 * @module dsh-plugin-upgrader/lib/install
 */
import type { ChangeResult, PluginManager, StepRecord } from './manager.ts'

/** Progress sink for one job. */
export type LogSink = (message: string) => void

/**
 * Called with the id of the installation currently in flight.
 *
 * `runStep` mints the id it hands the manager, and cancellation needs exactly
 * that id: the manager answers `not-running` for anything else. Reporting it
 * here lets the job record stay cancellable across the whole step, including
 * the removal a version replacement starts with.
 */
export type RequestIdSink = (requestId: string) => void

/** One step's outcome, including every failure stage. */
export interface StepOutcome {
  name: string
  version: string
  spec: string
  requestId: string
  ok: boolean
  enabled?: boolean
  application?: ChangeResult['application']
  changed?: boolean
  stage?: 'install' | 'remove' | 'enable'
  restartReason?: string
  message?: string
  detail?: string
  pendingBuilds?: string[]
  warnings?: string[]
  packageResult?: {
    exitCode: number
    kind?: string
    timedOut?: boolean
    tail?: string
  }
}

/** Allowed per-step actions. */
export const ACTIONS = new Set<string>(['upgrade', 'switch'])

/** The manager's code for "a live loader fiber still owns this bundle". */
const IN_USE = 'bundle-in-use'

/**
 * Read the manager's failure code off a result or a throw.
 *
 * `change()` folds operation failures into `result.error`; only a lock or
 * disposal fault rejects, so both spellings have to be checked.
 *
 * @param failure - a result or an error.
 * @returns the code, when one is present.
 */
function codeOf(failure: unknown): string | undefined {
  if (failure === null || typeof failure !== 'object') return undefined
  const record = failure as { code?: unknown; error?: { code?: unknown } }
  if (typeof record.code === 'string') return record.code
  return typeof record.error?.code === 'string' ? record.error.code : undefined
}

/**
 * Remove a bundle, forcing the unload the manager skips for a disabled one.
 *
 * `removeBundle` deselects and reloads only when the bundle reads as enabled.
 * A bundle that is disabled but still has a live loader fiber therefore goes
 * straight to the "in use" check and is refused, which is the failure behind
 * every `bundle-in-use` upgrade. `setBundleEnabled` reloads unconditionally, so
 * turning the bundle off first clears the fiber and the retry succeeds.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to remove.
 * @param log - progress sink.
 * @returns the removal result.
 */
async function removeForReplacement(
  manager: PluginManager,
  name: string,
  log: LogSink,
): Promise<ChangeResult> {
  let first: ChangeResult | undefined
  let thrown: unknown
  try {
    first = await manager.removeBundle(name)
  } catch (error) {
    thrown = error
  }
  const code = codeOf(first) ?? codeOf(thrown)
  if (code !== IN_USE) {
    if (thrown !== undefined) throw thrown
    return first as ChangeResult
  }
  log(`  ! ${name} is still loaded; unloading it before the retry`)
  try {
    const unloaded = await manager.setBundleEnabled(name, false)
    const unloadCode = codeOf(unloaded)
    if (unloadCode !== undefined) log(`  ! unload reported ${unloadCode}`)
  } catch (error) {
    log(`  ! unload failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  // Once the plugin has been switched off, a second refusal needs the job log
  // to say so: from the outside, an unload that reported `bundle-in-use` and a
  // removal that refused for the same reason look identical otherwise.
  try {
    return await manager.removeBundle(name)
  } catch (error) {
    const retryCode = codeOf(error)
    if (retryCode === IN_USE) {
      log(`  ! ${name} is still loaded after unloading; it needs a restart`)
    }
    throw error
  }
}

/**
 * Re-apply the enabled state a step asked for after the package was replaced.
 *
 * `installBundle` activates what it installs, so a disabled plugin would
 * otherwise come back enabled; the bundle switch is the persistent lever.
 *
 * @param manager - the plugin manager.
 * @param step - the step that just ran.
 * @param wanted - the state to restore, if any.
 * @param log - progress sink.
 * @returns the state now in effect, if known.
 */
export async function restoreEnabledState(
  manager: PluginManager,
  step: Pick<StepRecord, 'name'>,
  wanted: boolean | undefined,
  log: LogSink,
): Promise<boolean | undefined> {
  if (wanted === undefined) return undefined
  let current: boolean | undefined
  try {
    const bundles = await manager.listBundles()
    const entry = Array.isArray(bundles) ? bundles.find((item) => item?.name === step.name) : undefined
    current = entry?.enabled
  } catch {
    current = undefined
  }
  if (current === wanted) return current
  log(`${wanted ? 'enable' : 'disable'} ${step.name} (restoring the previous state)`)
  try {
    const outcome = await manager.setBundleEnabled(step.name, wanted)
    if (outcome?.error !== undefined) {
      log(`  ! could not restore the enabled state: ${outcome.error.code}`)
      return current
    }
    return wanted
  } catch (error) {
    log(`  ! could not restore the enabled state: ${error instanceof Error ? error.message : String(error)}`)
    return current
  }
}

/**
 * Run one step: install the exact version, falling back to remove + install,
 * then restore the plugin's previous enabled state.
 *
 * Every outcome — including a thrown manager call — comes back as one record so
 * the job log can report per-plugin success without a second error channel.
 *
 * @param manager - the plugin manager.
 * @param step - the requested change.
 * @param log - progress sink.
 * @param announce - receives the request id the step installs under.
 * @returns the outcome record.
 */
export async function runStep(
  manager: PluginManager,
  step: StepRecord,
  log: LogSink,
  announce?: RequestIdSink,
): Promise<StepOutcome> {
  const spec = `${step.name}@${step.version}`
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
  announce?.(requestId)
  const buildApproval =
    Array.isArray(step.approveBuilds) && step.approveBuilds.length > 0
      ? { approvedBuilds: step.approveBuilds }
      : {}
  const base = { name: step.name, version: step.version, spec, requestId }
  const restoreEnabled = typeof step.enabled === 'boolean' ? step.enabled : undefined
  log(`install ${spec}`)

  const options = {
    saveExact: true,
    ...(restoreEnabled === undefined ? {} : { enabled: restoreEnabled }),
    ...buildApproval,
  }

  let result: ChangeResult
  try {
    result = await manager.installBundle(spec, { ...options, requestId })
  } catch (error) {
    return {
      ...base,
      ok: false,
      stage: 'install',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  if (result?.error?.code === 'already-installed') {
    log(`remove ${step.name} (replacing an installed dependency)`)
    let removed: ChangeResult
    try {
      removed = await removeForReplacement(manager, step.name, log)
    } catch (error) {
      return {
        ...base,
        ok: false,
        stage: 'remove',
        application: 'failed',
        message: `removal failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    if (removed?.application === 'failed' || removed?.error !== undefined) {
      return {
        ...base,
        ok: false,
        stage: 'remove',
        application: removed?.application,
        message: removed?.error?.code ?? 'removal refused',
        detail: removed?.error?.diagnostic,
      }
    }
    // A fresh id, not `undefined`: the re-install has to stay cancellable, and
    // reusing the first one races the manager dropping the settled request.
    const retryId =
      globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
    announce?.(retryId)
    try {
      result = await manager.installBundle(spec, { ...options, requestId: retryId })
    } catch (error) {
      return {
        ...base,
        requestId: retryId,
        ok: false,
        stage: 'install',
        application: 'failed',
        message: `install after removal failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  // Only a change that landed has an enabled state to restore: a failed install
  // left nothing behind, and asking to toggle it would report a second, louder
  // error (`operation-error`) for a package that was never added.
  const installed = result?.application === 'applied' || result?.application === 'restart-required'
  const enabled = installed ? await restoreEnabledState(manager, step, restoreEnabled, log) : undefined
  return {
    ...base,
    ...(enabled === undefined ? {} : { enabled }),
    ok: installed,
    application: result?.application,
    changed: result?.changed === true,
    stage: result?.stage,
    restartReason: result?.restartReason,
    version: result?.version ?? step.version,
    message: result?.error === undefined ? undefined : result.error.code,
    detail: result?.error?.diagnostic,
    pendingBuilds: result?.pendingBuilds,
    warnings: result?.warnings,
    packageResult:
      result?.packageResult === undefined
        ? undefined
        : {
            exitCode: result.packageResult.exitCode,
            kind: result.packageResult.kind,
            timedOut: result.packageResult.timedOut,
            tail:
              typeof result.packageResult.output === 'string'
                ? result.packageResult.output.slice(-1600)
                : undefined,
          },
  }
}

/**
 * Whether a step names something this plugin is willing to install.
 *
 * @param step - one element of the request body.
 * @returns an error code, or undefined when valid.
 */
export function validateStep(step: unknown): string | undefined {
  if (step === null || typeof step !== 'object') return 'invalid-step'
  const record = step as Record<string, unknown>
  if (typeof record.name !== 'string' || typeof record.version !== 'string') return 'invalid-step'
  if (record.action !== undefined && !ACTIONS.has(String(record.action))) return 'invalid-action'
  return undefined
}
