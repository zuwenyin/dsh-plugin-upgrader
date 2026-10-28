/**
 * Dropping a dependency entry so a replacement can be installed in one step.
 *
 * The manager's `installBundle` refuses any spec whose package NAME is already
 * in the profile's `dependencies`, with `already-installed`. That check reads
 * `profile/package.json`, not the disk, so it fires even when the point of the
 * call is to replace that very version. The documented workaround is
 * remove-then-install, which deselects the bundle first: the plugin leaves the
 * page for as long as pnpm takes, and a failure in between strands it.
 *
 * Removing just the manifest entry is enough to get past the check. pnpm `add`
 * happily overwrites an existing dependency, and the manager's own bookkeeping
 * still finds the package:
 *
 *   const after = readProfileManifest(...).dependencies
 *   const installed = Object.keys(after).filter((name) => before[name] !== after[name])
 *   if (installed.length === 0) { ...specPackageName(spec, after, ...) }
 *
 * The entry comes back the moment pnpm writes the new version, so the bundle is
 * never deselected and never stops loading.
 *
 * @module dsh-plugin-upgrader/lib/manifest
 */
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** Where a profile keeps its manifest. */
export const MANIFEST_FILE = 'package.json'

/**
 * Where a pending drop is recorded, next to the manifest it belongs to.
 *
 * The drop has to survive a crash to be undoable. Writing the intent to disk
 * before the entry disappears means the next process to load this plugin can
 * put the entry back, instead of inheriting a profile that declares a package
 * it no longer lists — which is how a failed upgrade lost a theme: pnpm spent
 * two minutes verifying a lockfile, the app was restarted, and the dependency
 * entry was never written back.
 */
export const JOURNAL_FILE = 'package.json.upgrader-journal.json'

/** What a drop records, so a later process can undo it. */
export interface DropJournal {
  /** The package whose entry was removed. */
  name: string
  /** The range the entry carried, so it goes back byte for byte. */
  spec: string
  /** When the drop happened; only ever used for diagnostics. */
  at: number
}

/**
 * Resolve the profile directory the running host is managing.
 *
 * The harness exports this to every process it starts, so the value names the
 * same profile the manager is working on rather than a guess from the disk.
 *
 * @param env - the process environment.
 * @returns the absolute profile directory, or `undefined` when unknown.
 */
export function profileDirFrom(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.DSH_PROFILE_DIR
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim()
  const home = env.DSH_HOME
  const name = env.DSH_PROFILE
  if (typeof home === 'string' && home.trim() !== '' && typeof name === 'string' && name.trim() !== '') {
    return join(home.trim(), 'profiles', name.trim())
  }
  return undefined
}

/** What happened when the entry was dropped. */
export type DropResult =
  | { kind: 'dropped'; dependency: string }
  | { kind: 'absent' }
  | { kind: 'unavailable'; reason: string }

/**
 * Read a profile manifest, or explain why it could not be read.
 *
 * @param dir - the profile directory.
 * @returns the parsed manifest, or an error string.
 */
function readManifest(dir: string): { manifest?: Record<string, unknown>; error?: string } {
  try {
    const raw = readFileSync(join(dir, MANIFEST_FILE), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'manifest is not a JSON object' }
    }
    return { manifest: parsed as Record<string, unknown> }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Persist a manifest the way the harness does: 2-space JSON, trailing newline.
 *
 * Written to a sibling temp file and renamed so a crash mid-write cannot leave
 * the profile with a truncated manifest — the one file whose corruption would
 * break every plugin, not just this one.
 *
 * @param dir - the profile directory.
 * @param manifest - the value to persist.
 */
function writeManifest(dir: string, manifest: Record<string, unknown>): void {
  const target = join(dir, MANIFEST_FILE)
  const temporary = `${target}.upgrader-tmp`
  writeFileSync(temporary, `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')
  renameSync(temporary, target)
}

/**
 * Record that an entry is about to disappear, before it disappears.
 *
 * Written with the same temp-then-rename dance as the manifest: a half-written
 * journal would be worse than none, because recovery trusts it.
 *
 * @param dir - the profile directory.
 * @param journal - what is being dropped.
 * @returns whether the record reached the disk.
 */
function writeJournal(dir: string, journal: DropJournal): boolean {
  const target = join(dir, JOURNAL_FILE)
  const temporary = `${target}.upgrader-tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(journal, undefined, 2)}\n`, 'utf8')
    renameSync(temporary, target)
    return true
  } catch {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // Nothing left to clean up: the failure is already being reported.
    }
    return false
  }
}

/**
 * Forget the pending drop.
 *
 * Called once the entry is back, or once pnpm has written a new version in its
 * place — either way there is nothing left to undo.
 *
 * @param dir - the profile directory.
 */
export function clearJournal(dir: string): void {
  try {
    rmSync(join(dir, JOURNAL_FILE), { force: true })
  } catch {
    // A journal that cannot be removed only causes one more no-op recovery.
  }
}

/**
 * Read the pending drop, when one is recorded.
 *
 * @param dir - the profile directory.
 * @returns the record, or `undefined` when there is none to read.
 */
export function readJournal(dir: string): DropJournal | undefined {
  let raw: string
  try {
    raw = readFileSync(join(dir, JOURNAL_FILE), 'utf8')
  } catch {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const record = parsed as Partial<DropJournal>
    if (typeof record.name !== 'string' || record.name === '') return undefined
    if (typeof record.spec !== 'string') return undefined
    return { name: record.name, spec: record.spec, at: typeof record.at === 'number' ? record.at : 0 }
  } catch {
    return undefined
  }
}

/** What a recovery pass did, for the caller to report. */
export type RecoveryResult =
  | { kind: 'none' }
  | { kind: 'restored'; name: string; spec: string }
  | { kind: 'settled'; name: string }
  | { kind: 'failed'; name: string; reason: string }

/**
 * Undo a drop whose install never finished.
 *
 * This is the crash repair. A drop writes its intent to the journal before the
 * entry leaves the manifest, so whichever process loads the plugin next can see
 * that an entry is missing and put it back. Two outcomes are possible:
 *
 *   - the entry is still absent, so pnpm never wrote the new version: restore it;
 *   - the entry is present, so the install landed and simply outlived the drop
 *     record: forget the record and leave the manifest alone.
 *
 * Doing this at load time rather than at next upgrade matters: a profile with a
 * package on disk and no dependency entry is invisible to the manager, so the
 * plugin cannot be upgraded, removed or seen again until somebody edits JSON by
 * hand.
 *
 * @param dir - the profile directory.
 * @returns what happened.
 */
export function recoverPendingDrop(dir: string): RecoveryResult {
  const journal = readJournal(dir)
  if (journal === undefined) {
    clearJournal(dir)
    return { kind: 'none' }
  }
  const { manifest, error } = readManifest(dir)
  if (manifest === undefined) return { kind: 'failed', name: journal.name, reason: error ?? 'unreadable manifest' }
  const dependencies = manifest.dependencies
  const record =
    dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
      ? (dependencies as Record<string, unknown>)
      : undefined
  if (record === undefined) {
    // No dependencies at all: the manifest was rewritten by something else, so
    // the record no longer describes it. Dropping the record is the only safe
    // move — inventing a `dependencies` object could undo a deliberate edit.
    clearJournal(dir)
    return { kind: 'none' }
  }
  if (Object.hasOwn(record, journal.name)) {
    clearJournal(dir)
    return { kind: 'settled', name: journal.name }
  }
  record[journal.name] = journal.spec
  try {
    writeManifest(dir, manifest)
  } catch (writeError) {
    return {
      kind: 'failed',
      name: journal.name,
      reason: writeError instanceof Error ? writeError.message : String(writeError),
    }
  }
  clearJournal(dir)
  return { kind: 'restored', name: journal.name, spec: journal.spec }
}

/**
 * Forget the pending drop once the entry is visibly back.
 *
 * Called after an install reported success. pnpm is what writes the new version
 * into the manifest, so a success that left no entry means the write did not
 * happen after all — and then the record is the only thing that can repair the
 * profile, so it stays until it can actually be settled.
 *
 * @param dir - the profile directory.
 * @param name - the package whose entry should be present.
 * @returns whether the entry was there, and the record therefore cleared.
 */
export function confirmDependency(dir: string, name: string): boolean {
  const { manifest } = readManifest(dir)
  if (manifest === undefined) return false
  const dependencies = manifest.dependencies
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) return false
  if (!Object.hasOwn(dependencies as Record<string, unknown>, name)) return false
  clearJournal(dir)
  return true
}

/**
 * Remove one dependency entry, leaving everything else untouched.
 *
 * @param dir - the profile directory.
 * @param name - the package name to drop.
 * @returns what happened; `absent` means the guard cannot fire anyway.
 */
export function dropDependency(dir: string, name: string): DropResult {
  const { manifest, error } = readManifest(dir)
  if (manifest === undefined) return { kind: 'unavailable', reason: error ?? 'unreadable manifest' }
  const dependencies = manifest.dependencies
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) return { kind: 'absent' }
  const record = dependencies as Record<string, unknown>
  if (!Object.hasOwn(record, name)) return { kind: 'absent' }
  const previous = record[name]
  const spec = typeof previous === 'string' ? previous : ''
  /*
   * Journal first, then the manifest. The other order leaves a window where the
   * entry is gone and nothing on disk remembers what it was — the exact state
   * that turned a killed install into a missing theme.
   */
  if (!writeJournal(dir, { name, spec, at: Date.now() })) {
    return { kind: 'unavailable', reason: 'could not record the pending drop' }
  }
  delete record[name]
  try {
    writeManifest(dir, manifest)
  } catch (writeError) {
    // The manifest still has the entry, so the record is stale: remove it.
    clearJournal(dir)
    return {
      kind: 'unavailable',
      reason: writeError instanceof Error ? writeError.message : String(writeError),
    }
  }
  return { kind: 'dropped', dependency: spec }
}

/**
 * Put a dropped entry back, for when the install did not reach pnpm.
 *
 * Without this a failed step would leave the profile with a package still on
 * disk, no dependency entry, and no way for the manager to see it — strictly
 * worse than the problem this module exists to avoid.
 *
 * @param dir - the profile directory.
 * @param name - the package name to restore.
 * @param spec - the dependency range to write back.
 * @returns whether the entry was restored.
 */
export function restoreDependency(dir: string, name: string, spec: string): boolean {
  const { manifest } = readManifest(dir)
  if (manifest === undefined) return false
  const dependencies = manifest.dependencies
  const record = dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
    ? (dependencies as Record<string, unknown>)
    : undefined
  if (record === undefined) return false
  const present = Object.hasOwn(record, name)
  if (!present) {
    record[name] = spec
    try {
      writeManifest(dir, manifest)
    } catch {
      return false
    }
  }
  // The entry is on disk either way, so the pending record has served its
  // purpose: leaving it would make the next load try to restore it again.
  clearJournal(dir)
  return true
}
