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
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/** Where a profile keeps its manifest. */
export const MANIFEST_FILE = 'package.json'

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
  delete record[name]
  try {
    writeManifest(dir, manifest)
  } catch (writeError) {
    return {
      kind: 'unavailable',
      reason: writeError instanceof Error ? writeError.message : String(writeError),
    }
  }
  return { kind: 'dropped', dependency: typeof previous === 'string' ? previous : '' }
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
  if (Object.hasOwn(record, name)) return true
  record[name] = spec
  try {
    writeManifest(dir, manifest)
    return true
  } catch {
    return false
  }
}
