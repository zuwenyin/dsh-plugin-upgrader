/**
 * Installing one version, and putting the plugin's state back afterwards.
 *
 * `installBundle` refuses a spec that names an already-installed dependency, so
 * replacing a version means removing first. These helpers wrap that two-step in
 * one call and undo the side effects a reinstall has on the enabled flag.
 *
 * @module dsh-plugin-upgrader/lib/install
 */
import { explainLockTimeout } from './lock.ts'
import type { BundleInfo, ChangeResult, PluginManager, StepRecord } from './manager.ts'
import { confirmDependency, dropDependency, profileDirFrom, restoreDependency } from './manifest.ts'

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
 * A failure message with the writer-lock timeout spelled out.
 *
 * The manager composes that sentence inside `atomic-write`, so it cannot be
 * improved at its source; this is the last place that still knows which profile
 * the lock belongs to. Every other message comes back untouched.
 *
 * @param message - the failure message.
 * @returns a message to show the operator.
 */
function describeFailure(message: string): string {
  return explainLockTimeout(message, profileDirFrom())
}

/**
 * What the operator can do about a bundle the loader will not release.
 *
 * Attached as the failure's `diagnostic` so the panel can say something better
 * than the bare code: the removal was refused on the host, and no amount of
 * retrying inside one process changes it. Both languages travel together
 * because the job log is a single stream shared by every display language —
 * the existing `statusMessage` copy is split the same way.
 *
 * @param enabled - what the manager reads the bundle as, when known.
 * @returns one bilingual sentence.
 */
function restartHint(enabled: boolean | undefined): string {
  const disabled = enabled === false
  const zh = disabled
    ? '它读起来是禁用状态，但加载器仍持有它的插件行；重启 DSH 后再升级'
    : '加载器仍持有它的插件行；重启 DSH 后再升级'
  const en = disabled
    ? 'the loader still holds its plugin row even though the bundle reads as disabled; restart DSH and upgrade again'
    : 'the loader still holds its plugin row; restart DSH and upgrade again'
  return `${zh} / ${en}`
}

/**
 * Read whether the manager currently reads a bundle as enabled.
 *
 * The distinction matters: a bundle the manager already reads as disabled
 * cannot be unloaded by asking for disabled again, because that request changes
 * nothing and therefore disposes nothing.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to read.
 * @returns the flag, or `undefined` when the list could not be read.
 */
async function readsAsEnabled(manager: PluginManager, name: string): Promise<boolean | undefined> {
  try {
    const bundles = await manager.listBundles()
    const list: BundleInfo[] = Array.isArray(bundles) ? bundles : []
    return list.find((item) => item?.name === name)?.enabled
  } catch {
    return undefined
  }
}

/**
 * Call `setBundleEnabled`, reporting a refusal instead of throwing it.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to toggle.
 * @param enabled - the state to ask for.
 * @param log - progress sink.
 * @returns the manager's code, or `undefined` when the call succeeded.
 */
async function toggle(
  manager: PluginManager,
  name: string,
  enabled: boolean,
  log: LogSink,
): Promise<string | undefined> {
  try {
    return codeOf(await manager.setBundleEnabled(name, enabled))
  } catch (error) {
    const code = codeOf(error)
    log(
      `  ! ${enabled ? `enable ${name}` : 'unload'} failed: ${
        code ?? (error instanceof Error ? error.message : String(error))
      }`,
    )
    return code ?? 'operation-error'
  }
}

/**
 * Remove a bundle, clearing the loader fiber the manager will not unload.
 *
 * `removeBundle` deselects and reloads only when it reads the bundle as
 * enabled, and the deselect step of a *selection change* is what lets the
 * reload drop the rows: `reconcileProfile` disposes exactly the rows that the
 * previous patch list had and the new one does not. A bundle the manager
 * already reads as disabled therefore cannot be unloaded by asking for
 * disabled again — the manifest does not change, so nothing is dropped, so the
 * fiber survives and the retry is refused for the same reason. Re-selecting it
 * and then deselecting it does produce that change, which is the only lever a
 * live process has; a fiber that outlives even that needs a restart.
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
  const enabled = await readsAsEnabled(manager, name)
  log(`  ! ${name} is still loaded; unloading it before the retry`)
  if (enabled === false) {
    log(`  ! ${name} already reads as disabled, so deselecting it again would change nothing`)
    const reselect = await toggle(manager, name, true, log)
    if (reselect !== undefined) {
      log(`  ! could not re-select ${name} (${reselect}); the removal cannot clear its fiber`)
    } else {
      const deselect = await toggle(manager, name, false, log)
      if (deselect !== undefined) {
        log(`  ! ${name} may have been left enabled; turn it off again from the Installed tab`)
      }
    }
  } else {
    const unload = await toggle(manager, name, false, log)
    if (unload !== undefined) log(`  ! unload reported ${unload}`)
  }
  // Once the plugin has been switched off, a second refusal needs the job log
  // to say so: from the outside, an unload that reported `bundle-in-use` and a
  // removal that refused for the same reason look identical otherwise.
  let retried: ChangeResult | undefined
  let retryThrown: unknown
  try {
    retried = await manager.removeBundle(name)
  } catch (error) {
    retryThrown = error
  }
  const retryCode = codeOf(retried) ?? codeOf(retryThrown)
  if (retryCode !== IN_USE) {
    if (retryThrown !== undefined) throw retryThrown
    return retried as ChangeResult
  }
  log(`  ! ${name} is still loaded after unloading; it needs a restart`)
  const detail = restartHint(enabled)
  if (retryThrown !== undefined) {
    // Keep the manager's own code on the line the panel reads, and carry the
    // hint beside it: the caller turns both into the step's outcome.
    if (retryThrown !== null && typeof retryThrown === 'object') {
      Object.assign(retryThrown, { code: IN_USE, detail })
    }
    throw retryThrown
  }
  return { ...(retried as ChangeResult), error: { code: IN_USE, diagnostic: detail } }
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
 * Put a bundle back in the profile's selection after a failed replacement.
 *
 * `removeBundle` has to deselect the bundle to get the loader to drop its rows,
 * and a step that removes but then fails to install leaves it deselected: the
 * package stays in `dependencies`, the code stays on disk, and nothing loads it
 * — the plugin simply disappears from the page with no way back except the same
 * toggle by hand. This is the recovery for that window.
 *
 * Best effort by design: the step has already failed for the reported reason,
 * and turning a recovery failure into a louder second error would bury it.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to re-select.
 * @param log - progress sink.
 * @returns whether the bundle was re-selected.
 */
export async function restoreSelection(
  manager: PluginManager,
  name: string,
  log: LogSink,
): Promise<boolean> {
  let selected = false
  try {
    const bundles = await manager.listBundles()
    const entry = Array.isArray(bundles) ? bundles.find((item) => item?.name === name) : undefined
    // A bundle that is not installed at all cannot be selected: leave it alone.
    if (entry === undefined || entry.installed !== true) return false
    selected = entry.enabled === true
  } catch {
    return false
  }
  if (selected) return false
  log(`re-select ${name} (a failed replacement must not leave it unloaded)`)
  const code = await toggle(manager, name, true, log)
  if (code !== undefined) {
    log(`  ! could not re-select ${name}: ${code} — enable it from the Installed tab`)
    return false
  }
  return true
}

/**
 * Replace a version without removing the bundle first.
 *
 * The manager refuses a spec whose package name is already a dependency, and
 * the documented answer is remove-then-install. That answer costs the user a
 * visible window: `removeBundle` deselects the bundle, so the plugin leaves the
 * page until pnpm finishes — twice, because a replacement runs two commands.
 *
 * The guard reads the profile manifest rather than the disk, so removing just
 * the dependency entry satisfies it. pnpm `add` then overwrites the installed
 * version, and because nothing was deselected the bundle keeps loading the whole
 * time.
 *
 * Returns `undefined` whenever this route should not be taken or did not work
 * out: the caller then falls back to the removal, which is still correct, just
 * slower. Every exit that leaves the manifest without its entry restores it
 * first, so a failed attempt cannot make the profile worse than it found it.
 *
 * @param manager - the plugin manager.
 * @param step - the requested change.
 * @param options - the install options the caller already built.
 * @param log - progress sink.
 * @param announce - receives the request id the retry installs under.
 * @returns the outcome, or `undefined` to fall back to remove + install.
 */
async function replaceWithoutRemoval(
  manager: PluginManager,
  step: StepRecord,
  options: Record<string, unknown>,
  log: LogSink,
  announce?: RequestIdSink,
): Promise<StepOutcome | undefined> {
  const dir = profileDirFrom()
  if (dir === undefined) return undefined
  const dropped = dropDependency(dir, step.name)
  if (dropped.kind === 'unavailable') {
    log(`  ! cannot rewrite the profile manifest (${dropped.reason}); removing instead`)
    return undefined
  }
  if (dropped.kind === 'absent') {
    // The guard should not have fired without an entry: leave this to the
    // removal path rather than guessing what the manager is looking at.
    return undefined
  }

  const spec = `${step.name}@${step.version}`
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
  log(`install ${spec} over ${dropped.dependency} (no removal needed)`)
  announce?.(requestId)

  let result: ChangeResult
  try {
    result = await manager.installBundle(spec, { ...options, requestId })
  } catch (error) {
    restoreDependency(dir, step.name, dropped.dependency)
    log(`  ! in-place install failed: ${describeFailure(error instanceof Error ? error.message : String(error))}`)
    return undefined
  }

  const installed = result?.application === 'applied' || result?.application === 'restart-required'
  if (result?.error !== undefined || !installed) {
    /*
     * pnpm may have rewritten the entry itself before failing. Restoring an
     * entry that is already there is a no-op, so this is safe either way.
     */
    const back = restoreDependency(dir, step.name, dropped.dependency)
    log(
      `  ! in-place install refused (${result?.error?.code ?? 'no change'})` +
        (back ? '; the dependency entry is back' : '; could NOT restore the dependency entry'),
    )
    return undefined
  }

  const enabled = await restoreEnabledState(manager, step, options.enabled as boolean | undefined, log)
  /*
   * The manifest is what the journal guards, so the journal is only settled by
   * what the manifest now says — not by the manager's answer. A success that
   * left no entry is exactly the crash state this record exists to repair, and
   * dropping it there would make the loss permanent.
   */
  if (!confirmDependency(dir, step.name)) {
    log(`  ! ${step.name} is installed but not recorded in the profile manifest; the next start restores it`)
  }
  return {
    name: step.name,
    version: result.version ?? step.version,
    spec,
    requestId,
    ...(enabled === undefined ? {} : { enabled }),
    ok: true,
    application: result.application,
    changed: result.changed === true,
    stage: result.stage,
    restartReason: result.restartReason,
    pendingBuilds: result.pendingBuilds,
    warnings: result.warnings,
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
      message: describeFailure(error instanceof Error ? error.message : String(error)),
    }
  }
  if (result?.error?.code === 'already-installed') {
    /*
     * First choice: drop the manifest entry and install again. pnpm overwrites
     * an existing dependency, the manager's guard only reads the manifest, and
     * the bundle is never deselected — so the plugin stays on the page for the
     * whole upgrade instead of vanishing for the length of two pnpm runs.
     */
    const direct = await replaceWithoutRemoval(manager, step, options, log, announce)
    if (direct !== undefined) return direct
    log(`remove ${step.name} (replacing an installed dependency)`)
    let removed: ChangeResult
    try {
      removed = await removeForReplacement(manager, step.name, log)
    } catch (error) {
      /**
       * A refused removal rejects only when the manager could not fold the
       * failure into a result. The code and the restart hint still belong on
       * the outcome: without them the panel shows "removal failed: …" and the
       * operator has nothing to act on.
       */
      const code = codeOf(error)
      const diagnostic = (error as { detail?: unknown } | null | undefined)?.detail
      return {
        ...base,
        ok: false,
        stage: 'remove',
        application: 'failed',
        message: code ?? `removal failed: ${describeFailure(error instanceof Error ? error.message : String(error))}`,
        ...(typeof diagnostic === 'string' ? { detail: diagnostic } : {}),
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
      /*
       * The removal above already deselected the bundle, so a throw here leaves
       * it installed-but-unloaded: still in `dependencies`, still on disk, no
       * longer selected, and therefore invisible on the page. Put the selection
       * back before reporting, or the operator has to repair it by hand.
       */
      await restoreSelection(manager, step.name, log)
      return {
        ...base,
        requestId: retryId,
        ok: false,
        stage: 'install',
        application: 'failed',
        message: `install after removal failed: ${describeFailure(
          error instanceof Error ? error.message : String(error),
        )}`,
      }
    }
  }
  /*
   * A manager that refuses the install instead of throwing reaches here with a
   * removal already done. Same hazard, same repair; the reported reason stays
   * whatever the manager said.
   */
  if (result?.error !== undefined) await restoreSelection(manager, step.name, log)
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
