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
import { pendingFor, readPendingBuilds } from './builds.ts'
import { confirmDependency, dropDependency, profileDirFrom, restoreDependency } from './manifest.ts'
import { satisfiesRange } from './version.ts'

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
  /** The version this step put back after destroying the one that was there. */
  rolledBack?: string
  /**
   * The version that is on disk again but that the host could not activate.
   *
   * Separate from `rolledBack` on purpose. Both mean "the old files are back";
   * only `rolledBack` means the plugin runs again. A user told the wrong one
   * either thinks a missing plugin is fine, or goes off to install a package
   * that is already installed.
   */
  inactive?: string
  /** Why a repair did not fully work: the host's diagnostic, when it had one. */
  rollbackReason?: string
  packageResult?: {
    exitCode: number
    kind?: string
    timedOut?: boolean
    tail?: string
  }
}

/** Allowed per-step actions. */
export const ACTIONS = new Set<string>(['upgrade', 'switch'])

/**
 * What a rollback ended up doing.
 *
 * `back` and `inactive` both leave the old version on disk; they differ in
 * whether the host managed to activate it. Only `refused` means the user has to
 * install something again, so the panel must not use one sentence for all three.
 */
type Rollback = { kind: 'back' } | { kind: 'inactive'; reason: string } | { kind: 'refused'; reason: string }

/** The manager's code for "a live loader fiber still owns this bundle". */
const IN_USE = 'bundle-in-use'

/**
 * The manager's code for "this version does not admit the running DSH".
 *
 * Worth naming: it is the one refusal that is *certain* to repeat. Every other
 * failure might be a flaky registry or a busy lock, but a version whose declared
 * range rejects this runtime will be rejected again no matter how many times the
 * replacement is retried — so retrying it by removing first only destroys more.
 */
const INCOMPATIBLE = 'incompatible-version'

/**
 * The name this plugin reports for "pnpm refused to run a build script".
 *
 * The manager knows the same sentence-shaped refusal (`build-blocked`), but it
 * reaches us as `operation-error` with the whole pnpm output as the diagnostic:
 * the pnpm failure is thrown inside the change and folded into a generic error.
 * Reporting it under the generic code is what left the page with a wall of
 * registry timeouts and no way to answer the actual question.
 */
const BUILD_BLOCKED = 'build-blocked'

/**
 * The line pnpm prints when it skipped install scripts, matched exactly as the
 * manager matches it, so the two never disagree about what happened.
 */
const IGNORED_BUILDS = /\bIgnored build scripts: (.+)/

/**
 * Which unapproved build scripts are holding one package back.
 *
 * The captured pnpm text names packages, but the profile's pnpm settings are
 * the authority: the manager writes the placeholder there *before* it reports
 * the failure, and only what is still unanswered there may be approved. Reading
 * it back also keeps a retry from sending a name the manager would reject as
 * stale.
 *
 * @param name - the package the step is about.
 * @param failure - the manager's diagnostic, or a thrown error.
 * @returns the pending entries for this package, or undefined when this is not
 *   a build-script refusal (including when nothing is left to approve).
 */
function buildBlockedPending(name: string, failure: unknown): string[] | undefined {
  const message = failure instanceof Error ? failure.message : String(failure ?? '')
  if (!IGNORED_BUILDS.test(message)) return undefined
  const pending = pendingFor(readPendingBuilds(profileDirFrom()), name)
  return pending.length > 0 ? pending : undefined
}

/**
 * Turn a build-script refusal into the fields the panel reads, or undefined
 * when this is not one.
 *
 * The logged sentence says what has to happen rather than what pnpm did: in the
 * throw path nothing landed at all, so "was installed" would be a lie, and the
 * only useful fact either way is that a decision is outstanding.
 *
 * @param name - the package the step is about.
 * @param failure - the manager's diagnostic, or a thrown error.
 * @param log - where to record that the run stopped on a question.
 * @param spec - `name@version`, for the log line.
 * @returns the outcome fields, or undefined when this is another failure.
 */
function buildBlockedOutcome(
  name: string,
  failure: unknown,
  log: LogSink,
  spec: string,
): Pick<StepOutcome, 'message' | 'detail' | 'pendingBuilds'> | undefined {
  const pendingBuilds = buildBlockedPending(name, failure)
  if (pendingBuilds === undefined) return undefined
  const message = failure instanceof Error ? failure.message : String(failure ?? '')
  log(`  ! pnpm skipped the build scripts of ${spec}; they need an explicit approval first`)
  return { message: BUILD_BLOCKED, detail: describeFailure(message), pendingBuilds }
}

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
 * One bundle as the manager currently reports it.
 *
 * "Absent" and "present but with no version" have to be told apart: the first
 * means a rollback has to reinstall, the second only means the listing did not
 * carry a version — re-selecting is still the right repair there.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to read.
 * @returns the entry, or `undefined` when it is not listed at all.
 */
async function bundleOf(manager: PluginManager, name: string): Promise<BundleInfo | undefined> {
  try {
    const bundles = await manager.listBundles()
    const list: BundleInfo[] = Array.isArray(bundles) ? bundles : []
    return list.find((item) => item?.name === name)
  } catch {
    return undefined
  }
}

/**
 * The version a bundle currently has on disk, read before anything is removed.
 *
 * This is the value a failed replacement rolls back to. It has to be read up
 * front: after `removeForReplacement` the package is gone, and the manager has
 * nothing left to report a version for — which is precisely the moment the
 * rollback needs to know what to put back.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to read.
 * @returns the installed version, or `undefined` when it cannot be read.
 */
async function installedVersion(manager: PluginManager, name: string): Promise<string | undefined> {
  const version = (await bundleOf(manager, name))?.version
  return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined
}

/**
 * One version's DSH requirement, looked up only when a step is about to run.
 *
 * The lookup is injected rather than imported so this module keeps no registry
 * client: the caller already has the packument cache and the chosen registry,
 * and asking the network here would duplicate both.
 */
export interface InstallGuard {
  /** The DSH build this process runs, when it could be read. */
  runtimeVersion?: string | undefined
  /** The requirement `name@version` declares, or `undefined` when unknown. */
  requirementOf: (name: string, version: string) => Promise<{ range: string } | undefined>
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
 * Put the previous version back after a replacement destroyed it.
 *
 * The in-place route only knows the install was refused after pnpm has run, and
 * the manager's compatibility gate runs *after* pnpm rewrote the lockfile — so a
 * version the host refuses can leave the package gone while the manifest entry
 * is the only thing that got restored. The plugin then disappears from the page
 * with no way back except reinstalling by hand.
 *
 * Installing the old version again is the repair that actually works: pnpm puts
 * the files back, and the manager activates them exactly as it did before. It is
 * deliberately attempted for every failure that follows a removal, not only the
 * compatibility one — an entry pointing at a version that is not on disk is
 * broken either way.
 *
 * Best effort: the step has already failed for its own reason, and a rollback
 * that also fails must not replace that reason.
 *
 * @param manager - the plugin manager.
 * @param step - the step that failed.
 * @param previous - the version that was installed before the step ran.
 * @param options - the install options the caller already built.
 * @param log - progress sink.
 * @param announce - receives the request id the rollback installs under.
 * @returns what the old version ended up as: back, on disk but inactive, or not there.
 */
async function rollBack(
  manager: PluginManager,
  step: StepRecord,
  previous: string,
  options: Record<string, unknown>,
  log: LogSink,
  announce?: RequestIdSink,
): Promise<Rollback> {
  const spec = `${step.name}@${previous}`
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
  announce?.(requestId)
  log(`roll back: install ${spec} again (the failed replacement already removed it)`)
  try {
    const result = await manager.installBundle(spec, { ...options, requestId })
    const settled = result?.application === 'applied' || result?.application === 'restart-required'
    if (settled) {
      log(`  ✓ ${step.name}@${previous} is back where it was`)
      return { kind: 'back' }
    }
    /*
     * "pnpm did nothing" and "pnpm put the files back but the host could not
     * activate them" are different facts, and only the first one means the user
     * has to install anything again. Collapsing them — which is what reading
     * `application` alone does — prints "is not installed" for a package that is
     * on disk, and sends the user to an install the manager then refuses with
     * `already-installed`.
     */
    const reason = result?.error?.diagnostic ?? result?.error?.code ?? 'no change'
    if (landedOnDisk(result)) {
      log(
        `  ! ${step.name}@${previous} is installed but did not activate (${reason}); ` +
          `the package is back on disk - enable it again from the Installed tab`,
      )
      return { kind: 'inactive', reason }
    }
    log(
      `  ! rollback refused (${result?.error?.code ?? 'no change'}); ${step.name}@${previous} is not installed — ` +
        'install it again from the Installed tab',
    )
    return { kind: 'refused', reason }
  } catch (error) {
    log(
      `  ! rollback failed: ${describeFailure(error instanceof Error ? error.message : String(error))}; ` +
        `${step.name}@${previous} is not installed`,
    )
    return { kind: 'refused', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Whether a failed change still left the package files on disk.
 *
 * Three independent signals have to agree, because each one alone lies: `changed`
 * says the profile was rewritten, `packageResult.exitCode` says pnpm succeeded,
 * and `stage` says how far the host got. A change that stopped at `enable` with a
 * clean pnpm run is installed-but-not-activated; anything else that failed while
 * pnpm was still running (or never started) is a package that is not there.
 *
 * @param result - the manager's answer, when there was one.
 * @returns whether the package is on disk despite the failure.
 */
function landedOnDisk(result: ChangeResult | undefined): boolean {
  if (result === undefined || result.changed !== true) return false
  if (result.stage !== 'enable') return false
  const exit = result.packageResult?.exitCode
  return exit === undefined || exit === 0
}

/**
 * Put the profile back the way the step found it, whatever it managed to break.
 *
 * Two different damages need two different repairs, and picking the wrong one
 * makes things worse:
 *
 * - the package is still on disk but was deselected — re-selecting it is enough,
 *   and installing an old version over it would be a pointless pnpm run;
 * - the package is gone — re-selecting nothing, which is what the old code did,
 *   leaves an entry in `dependencies` that nothing can load, so the plugin is
 *   simply missing from the page.
 *
 * Neither repair may change whether the plugin runs. The removal deselects the
 * bundle, and putting the selection back is only right for a step that wanted
 * the bundle loaded: an upgrade of a plugin the user keeps switched off that
 * fails must leave it switched off, not load it.
 *
 * @param manager - the plugin manager.
 * @param step - the step that failed.
 * @param previous - the version installed before the step ran, when known.
 * @param options - the install options the caller already built.
 * @param log - progress sink.
 * @param announce - receives the request id a rollback installs under.
 * @returns what the failed step left the plugin as, or `undefined` when the
 *   profile never lost it (re-selecting a bundle is not a rollback).
 */
async function recover(
  manager: PluginManager,
  step: StepRecord,
  previous: string | undefined,
  options: Record<string, unknown>,
  log: LogSink,
  announce?: RequestIdSink,
): Promise<Rollback | undefined> {
  const entry = await bundleOf(manager, step.name)
  if (entry !== undefined && entry.installed !== false) {
    /*
     * The removal only ever deselected the bundle, so the repair is a question
     * of what the step wanted, not of what it found: an upgrade of a plugin the
     * user keeps switched off must not end with that plugin loaded. A step that
     * did not say (`undefined`) keeps the older answer — the failed replacement
     * must not leave the plugin unloaded.
     */
    if (step.enabled === false) await restoreEnabledState(manager, step, false, log)
    else await restoreSelection(manager, step.name, log)
    return undefined
  }
  if (previous === undefined) {
    log(`  ! ${step.name} is no longer installed, and its previous version was not recorded`)
    return { kind: 'refused', reason: 'previous-version-unknown' }
  }
  return rollBack(manager, step, previous, options, log, announce)
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
  log(`install ${spec} over ${dropped.dependency} (in place: no removal, the bundle stays loaded)`)
  announce?.(requestId)

  let result: ChangeResult
  try {
    result = await manager.installBundle(spec, { ...options, requestId })
  } catch (error) {
    /*
     * The entry has to go back before anything else happens, and the restore can
     * itself fail when another writer holds the lock. Say which of the two
     * happened: the record survives either way, so a restore that could not run
     * is repaired at the next load rather than lost.
     */
    const back = restoreDependency(dir, step.name, dropped.dependency)
    log(
      `  ! in-place install failed: ${describeFailure(error instanceof Error ? error.message : String(error))}` +
        (back ? '; the dependency entry is back' : '; could NOT restore the dependency entry, the next start repairs it'),
    )
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
        (back
          ? '; the dependency entry is back'
          : '; could NOT restore the dependency entry, the next start repairs it'),
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
  const inPlacePending = pendingFor(result.pendingBuilds ?? [], step.name)
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
    ...(inPlacePending.length > 0 ? { pendingBuilds: inPlacePending } : {}),
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
 * @param registry - the registry chosen in this plugin's config, if any.
 * @param guard - the compatibility check, when the caller can supply one.
 * @returns the outcome record.
 */
export async function runStep(
  manager: PluginManager,
  step: StepRecord,
  log: LogSink,
  announce?: RequestIdSink,
  registry?: string,
  guard?: InstallGuard,
): Promise<StepOutcome> {
  const spec = `${step.name}@${step.version}`
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
  announce?.(requestId)
  /*
   * The approval, spent at most once.
   *
   * `approvedBuilds` makes the manager rewrite the profile's `allowBuilds`
   * before pnpm starts, and it refuses a name that is no longer waiting there.
   * That waiting state is exactly what the first pnpm run of the step answers —
   * so presenting the same names a second time is refused with `stale-approval`
   * before pnpm even starts, which says nothing about the package and hides
   * whatever really failed.
   *
   * Only two calls may present it, because only they can legitimately run pnpm
   * *for the new version*: the first install, and the in-place replacement that
   * answers the manager's `already-installed` guard (that guard runs at manager
   * lib/index.js:1991, before the approval is read at :1992, so being refused by
   * it does not spend the credential). The retry after a removal and the
   * rollback get plain options: by then the question has been answered, and the
   * rollback installs a different version that the `name@version` key was never
   * about — a rollback is the one install that must not fail for a bookkeeping
   * reason.
   *
   * It is downgraded to nothing when the manager reports the names as stale, so
   * a profile that was already answered upstream does not turn every later call
   * into the same refusal.
   */
  let approval: { approvedBuilds?: string[] } =
    Array.isArray(step.approveBuilds) && step.approveBuilds.length > 0
      ? { approvedBuilds: step.approveBuilds }
      : {}
  const base = { name: step.name, version: step.version, spec, requestId }
  const restoreEnabled = typeof step.enabled === 'boolean' ? step.enabled : undefined
  log(`install ${spec}`)

  /*
   * Ask the version itself before touching anything.
   *
   * The host's own gate is the final word and it runs inside pnpm's wake-up, so
   * without this check a refusal arrives after the manager has already deselected
   * — or removed — the bundle. Reading the published requirement first turns
   * "your plugin is gone" into "this version was never going to work", which is
   * the difference between a repair and a loss.
   */
  const requirement = guard === undefined ? undefined : await guard.requirementOf(step.name, step.version)
  if (requirement !== undefined && guard?.runtimeVersion !== undefined) {
    if (!satisfiesRange(guard.runtimeVersion, requirement.range)) {
      log(
        `  ! ${spec} declares ${requirement.range}, which excludes DSH ${guard.runtimeVersion}; nothing was changed`,
      )
      return {
        ...base,
        ok: false,
        application: 'failed',
        stage: 'install',
        message: INCOMPATIBLE,
        detail: requirement.range,
      }
    }
  }

  const options = {
    saveExact: true,
    ...(restoreEnabled === undefined ? {} : { enabled: restoreEnabled }),
    /*
     * No `approvedBuilds` here on purpose: this object is reused by the retry
     * and by the rollback, and the approval may only be presented once. Only the
     * two calls below that can run pnpm for the new version spread `approval`.
     */
    /*
     * Only a registry the user actually chose is sent. Leaving the option out
     * keeps the manager's own `registry` config in charge, which is the
     * behaviour of every version before this one; sending `null` here would
     * override that config with pnpm's registry instead.
     */
    ...(typeof registry === 'string' && registry.trim() !== '' ? { registry: registry.trim() } : {}),
  }

  let result: ChangeResult
  /*
   * Read the version on disk *before* the manager can take it away. This is the
   * value a failed replacement rolls back to, and once `removeForReplacement`
   * has run there is nothing left to ask.
   */
  const previous = await installedVersion(manager, step.name)
  try {
    result = await manager.installBundle(spec, { ...options, ...approval, requestId })
  } catch (error) {
    /*
     * A build-script refusal is the one failure here that is *not* about the
     * network, the registry or the disk: pnpm stopped because nobody said
     * whether this package may run scripts at install time. Left generic it
     * arrives as `operation-error` carrying every pnpm retry line, which reads
     * as "something went wrong" when the page actually has a question to ask.
     */
    const blocked = buildBlockedOutcome(step.name, error, log, spec)
    if (blocked !== undefined) return { ...base, ok: false, stage: 'install', ...blocked }
    return {
      ...base,
      ok: false,
      stage: 'install',
      message: describeFailure(error instanceof Error ? error.message : String(error)),
    }
  }
  /*
   * The approval was answered before this step got to it — somebody ran
   * `pnpm approve-builds`, or an earlier attempt spent it. The manager refuses
   * the whole call for that, and it does so *before* pnpm starts, so nothing was
   * attempted and nothing is wrong with the package. Dropping the credential and
   * asking once more is the truthful repair: when the question really is settled
   * the install does not need the answer, and when it is not, the retry comes
   * back `build-blocked` and says so. Without this, a settled approval turned a
   * perfectly installable version into `stale-approval` on the page.
   */
  if (result?.error?.code === 'stale-approval') {
    approval = {}
    log(`  ! the build scripts of ${spec} are no longer waiting for approval; installing again without it`)
    // A fresh id, not the first one: the manager drops a settled request, so
    // reusing an id races that cleanup and loses cancel for this attempt.
    const settledId =
      globalThis.crypto?.randomUUID?.() ?? `pu-${Date.now()}-${Math.random().toString(36).slice(2)}`
    announce?.(settledId)
    try {
      result = await manager.installBundle(spec, { ...options, requestId: settledId })
    } catch (error) {
      const blocked = buildBlockedOutcome(step.name, error, log, spec)
      if (blocked !== undefined) {
        return { ...base, requestId: settledId, ok: false, stage: 'install', ...blocked }
      }
      return {
        ...base,
        requestId: settledId,
        ok: false,
        stage: 'install',
        message: describeFailure(error instanceof Error ? error.message : String(error)),
      }
    }
  }
  if (result?.error?.code === 'already-installed') {
    /*
     * The guard refuses a declared dependency before pnpm ever runs, so the
     * `install` line above did nothing. Without saying that, the log reads as
     * two separate installs, which is what makes an in-place replacement look
     * like a removal followed by an install.
     */
    log(`  ! ${step.name} is already declared, so a plain install was refused; the bundle stays loaded`)
    /*
     * First choice: drop the manifest entry and install again. pnpm overwrites
     * an existing dependency, the manager's guard only reads the manifest, and
     * the bundle is never deselected — so the plugin stays on the page for the
     * whole upgrade instead of vanishing for the length of two pnpm runs.
     */
    const direct = await replaceWithoutRemoval(manager, step, { ...options, ...approval }, log, announce)
    if (direct !== undefined) return direct
    log(`remove ${step.name} (in-place replacement declined; replacing an installed dependency)`)
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
       * The removal above happened for real, so a throw here can leave the
       * plugin gone. `recover` tells the two damages apart: still-on-disk means
       * re-select it, gone means install the previous version again. Confusing
       * them is what made "upgrade failed" also mean "plugin disappeared".
       */
      const repair = await recover(manager, step, previous, options, log, announce)
      const blocked = buildBlockedOutcome(step.name, error, log, spec)
      if (blocked !== undefined) {
        return {
          ...base,
          requestId: retryId,
          ok: false,
          stage: 'install',
          application: 'failed',
          ...blocked,
          ...repairOutcome(repair, previous),
        }
      }
      return {
        ...base,
        requestId: retryId,
        ok: false,
        stage: 'install',
        application: 'failed',
        message: `install after removal failed: ${describeFailure(
          error instanceof Error ? error.message : String(error),
        )}`,
        ...repairOutcome(repair, previous),
      }
    }
  }
  /*
   * A manager that refuses the install instead of throwing reaches here with a
   * removal already done. Same hazard, same repair; the reported reason stays
   * whatever the manager said.
   */
  const repair =
    result?.error === undefined ? undefined : await recover(manager, step, previous, options, log, announce)
  /*
   * The manager answers with the whole profile's unanswered scripts, not just
   * this package's. Narrowed here so a row is only ever told about itself, and
   * left off entirely when there is nothing to answer.
   */
  const listed = pendingFor(result?.pendingBuilds ?? [], step.name)
  /*
   * Two routes to the same question, because either one alone can miss it: the
   * manager fills `pendingBuilds` on a failed run, while a project whose pnpm
   * settings it could not read only leaves the sentence in the diagnostic. The
   * reading on disk stays authoritative for *what* may be approved — a retry
   * that names something already answered is refused as stale.
   */
  const blocked =
    listed.length > 0 || result?.error === undefined
      ? undefined
      : buildBlockedOutcome(step.name, result.error.diagnostic ?? '', log, spec)
  const pendingBuilds = listed.length > 0 ? listed : (blocked?.pendingBuilds ?? [])
  if (listed.length > 0) {
    log(`  ! pnpm skipped the build scripts of ${spec}; they need an explicit approval first`)
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
    ...repairOutcome(repair, previous),
    application: result?.application,
    changed: result?.changed === true,
    stage: result?.stage,
    restartReason: result?.restartReason,
    version: result?.version ?? step.version,
    message:
      pendingBuilds.length > 0
        ? BUILD_BLOCKED
        : result?.error === undefined
          ? undefined
          : result.error.code,
    detail: result?.error?.diagnostic,
    ...(pendingBuilds.length > 0 ? { pendingBuilds } : {}),
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
 * Turn a repair into the outcome fields the panel reads.
 *
 * `rolledBack` means "the old version is usable again". A rollback that put the
 * files back but could not activate them is *not* that — reporting it as one
 * would tell the user everything is fine while the plugin is missing from the
 * page; reporting it as "not installed", which is what the single boolean did,
 * is worse: it sends them to install a package that is already there.
 *
 * @param repair - what `recover` managed to do, when it had to do anything.
 * @param previous - the version the step destroyed.
 * @returns the fields to spread into the outcome.
 */
function repairOutcome(
  repair: Rollback | undefined,
  previous: string | undefined,
): Pick<StepOutcome, 'rolledBack' | 'inactive' | 'rollbackReason'> {
  if (repair === undefined || previous === undefined) return {}
  if (repair.kind === 'back') return { rolledBack: previous }
  if (repair.kind === 'inactive') return { inactive: previous, rollbackReason: repair.reason }
  return { rollbackReason: repair.reason }
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
