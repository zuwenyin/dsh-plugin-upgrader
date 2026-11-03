/**
 * Which DSH runtime this host process is actually running.
 *
 * The compatibility gate inside the host compares a plugin's declared DSH
 * requirement against one specific version, and that comparison decides whether
 * an install happens at all. To mark versions before anyone clicks, the page has
 * to know the same number.
 *
 * That number is NOT the version of anything reachable from the profile:
 * `@deepseek-ai/dsh-app-boot` in a profile's `node_modules` is a link into an
 * npx cache and can be a completely different build (a 0.1.2 copy next to a
 * 0.2.1 runtime was measured on a real install). Resolution therefore starts from
 * the host's own entry point, which lives beside the packages the running
 * process actually loaded.
 *
 * @module dsh-plugin-upgrader/lib/runtime
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** The package whose version the host's compatibility gate quotes. */
const RUNTIME_PACKAGE = '@deepseek-ai/dsh-app-boot'

/** Every candidate entry point the lookup walks up from. */
const ENTRY_DEPTH = 6

/** How many process entries the runtime package may be found under. */
const MAX_WALK = 10

/**
 * Read a version out of a package manifest.
 *
 * @param path - the `package.json` to read.
 * @returns its `version`, or `undefined` when it cannot be read.
 */
function versionAt(path: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' && raw.version.trim() !== '' ? raw.version.trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * Find the runtime package's manifest by walking up from an entry point.
 *
 * A plugin cannot import the host's dependency graph, but every layout that
 * ships DSH puts the entry point inside `node_modules`, so the sibling install
 * is reachable by path. The walk stops at the first `@deepseek-ai` directory
 * containing the package, which is the copy the host itself resolves to.
 *
 * @param entry - a file path inside the running host.
 * @returns the manifest path, or `undefined`.
 */
function manifestBeside(entry: string): string | undefined {
  let directory = dirname(entry)
  for (let depth = 0; depth < MAX_WALK; depth += 1) {
    const candidate = join(directory, 'node_modules', RUNTIME_PACKAGE, 'package.json')
    if (versionAt(candidate) !== undefined) return candidate
    const next = dirname(directory)
    if (next === directory) return undefined
    directory = next
  }
  return undefined
}

/**
 * Resolve the runtime version from one entry point.
 *
 * @param entry - a file path inside the running host.
 * @returns the version, or `undefined` when nothing could be read.
 */
function versionFrom(entry: string): string | undefined {
  try {
    const resolved = createRequire(entry).resolve(`${RUNTIME_PACKAGE}/package.json`)
    const version = versionAt(resolved)
    if (version !== undefined) return version
  } catch {
    // Resolution from a bundled or asar entry can fail outright; the path walk
    // below covers the layouts where it does.
  }
  const manifest = manifestBeside(entry)
  return manifest === undefined ? undefined : versionAt(manifest)
}

/**
 * The DSH runtime version behind one process's argv.
 *
 * `argv[1]` is the host entry point. `ENV` overrides are deliberately not
 * consulted: guessing a version would make the page disagree with the gate,
 * and a page that says "compatible" about a version the host then refuses is
 * worse than a page that says nothing.
 *
 * @param argv - `process.argv` of the host process.
 * @returns the version, or `undefined` when it cannot be determined.
 */
export function runtimeVersionOf(argv: readonly string[]): string | undefined {
  for (const candidate of argv.slice(1, 1 + ENTRY_DEPTH)) {
    if (typeof candidate !== 'string' || candidate === '') continue
    if (!candidate.endsWith('.js') && !candidate.endsWith('.cjs') && !candidate.endsWith('.mjs')) continue
    const version = versionFrom(candidate)
    if (version !== undefined) return version
  }
  return undefined
}
