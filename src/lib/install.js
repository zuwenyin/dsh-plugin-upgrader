/**
 * Installing one version, and putting the plugin's state back afterwards.
 *
 * `installBundle` refuses a spec that names an already-installed dependency, so
 * replacing a version means removing first. These helpers wrap that two-step in
 * one call and undo the side effects a reinstall has on the enabled flag.
 *
 * @module dsh-plugin-upgrader/lib/install
 */

/**
 * Re-apply the enabled state a step asked for after the package was replaced.
 * `installBundle` activates what it installs, so a disabled plugin would
 * otherwise come back enabled; the bundle switch is the persistent lever.
 * @param {any} manager - the plugin manager.
 * @param {{ name: string }} step - the step that just ran.
 * @param {boolean | undefined} wanted - the state to restore, if any.
 * @param {(message: string) => void} log - progress sink.
 * @returns {Promise<boolean | undefined>} the state now in effect, if known.
 */
export async function restoreEnabledState(manager, step, wanted, log) {
  if (wanted === undefined) return undefined
  let current
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
 * @param {any} manager - the plugin manager.
 * @param {{ name: string, version: string, enabled?: boolean, approveBuilds?: string[] }} step - the requested change.
 * @param {(message: string) => void} log - progress sink.
 * @returns {Promise<any>} the outcome record.
 */
export async function runStep(manager, step, log) {
  const spec = `${step.name}@${step.version}`
  const requestId = globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const buildApproval = Array.isArray(step.approveBuilds) && step.approveBuilds.length > 0
    ? { approvedBuilds: step.approveBuilds }
    : {}
  const base = { name: step.name, version: step.version, spec, requestId }
  const restoreEnabled = typeof step.enabled === 'boolean' ? step.enabled : undefined
  log(`install ${spec}`)

  let result
  try {
    result = await manager.installBundle(spec, {
      saveExact: true,
      requestId,
      ...(restoreEnabled === undefined ? {} : { enabled: restoreEnabled }),
      ...buildApproval,
    })
  } catch (error) {
    return { ...base, ok: false, stage: 'install', message: error instanceof Error ? error.message : String(error) }
  }
  if (result?.error?.code === 'already-installed') {
    log(`remove ${step.name} (replacing an installed dependency)`)
    let removed
    try {
      removed = await manager.removeBundle(step.name)
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
    try {
      result = await manager.installBundle(spec, {
        saveExact: true,
        requestId: undefined,
        ...(restoreEnabled === undefined ? {} : { enabled: restoreEnabled }),
        ...buildApproval,
      })
    } catch (error) {
      return {
        ...base,
        ok: false,
        stage: 'install',
        application: 'failed',
        message: `install after removal failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  const enabled = await restoreEnabledState(manager, step, restoreEnabled, log)
  return {
    ...base,
    ...(enabled === undefined ? {} : { enabled }),
    ok: result?.application === 'applied' || result?.application === 'restart-required',
    application: result?.application,
    changed: result?.changed === true,
    stage: result?.stage,
    restartReason: result?.restartReason,
    version: result?.version ?? step.version,
    message: result?.error === undefined ? undefined : result.error.code,
    detail: result?.error?.diagnostic,
    pendingBuilds: result?.pendingBuilds,
    warnings: result?.warnings,
    packageResult: result?.packageResult === undefined
      ? undefined
      : {
          exitCode: result.packageResult.exitCode,
          kind: result.packageResult.kind,
          timedOut: result.packageResult.timedOut,
          tail: typeof result.packageResult.output === 'string'
            ? result.packageResult.output.slice(-1600)
            : undefined,
        },
  }
}

/**
 * Whether a step names something this plugin is willing to install.
 * @param {unknown} step - one element of the request body.
 * @returns {string | undefined} an error code, or undefined when valid.
 */
export function validateStep(step) {
  if (step === null || typeof step !== 'object') return 'invalid-step'
  const record = /** @type {Record<string, unknown>} */ (step)
  if (typeof record.name !== 'string' || typeof record.version !== 'string') return 'invalid-step'
  if (record.action !== undefined && !ACTIONS.has(/** @type {string} */ (record.action))) {
    return 'invalid-action'
  }
  return undefined
}

/** Allowed per-step actions. */
export const ACTIONS = new Set(['upgrade', 'switch'])
