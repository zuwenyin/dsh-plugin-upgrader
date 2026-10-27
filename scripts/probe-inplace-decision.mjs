/**
 * Which branch does the in-place route take for a given package?
 *
 * The reported failure showed `remove dsh-connect-workbuddy` in the job log,
 * which means `replaceWithoutRemoval` returned `undefined` — but there are four
 * different reasons it can do that, and only two of them log anything. This
 * prints the decision for the real profile so the reason is a fact rather than
 * a guess.
 *
 * Usage: node scripts/probe-inplace-decision.mjs <name>
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { profileDirFrom } = await import('../lib/host/manifest.js')

const name = process.argv[2] ?? 'dsh-connect-workbuddy'

console.log('environment seen by this process:')
for (const key of ['DSH_HOME', 'DSH_PROFILE', 'DSH_PROFILE_DIR']) {
  console.log(`  ${key} = ${JSON.stringify(process.env[key] ?? null)}`)
}

const dir = profileDirFrom()
console.log(`\nprofileDirFrom() -> ${dir ?? 'undefined  <-- in-place route is disabled'}`)
if (dir === undefined) process.exit(0)

// Read the same manifest the route would read. Note: never call dropDependency
// here — it WRITES the manifest, and this probe must not touch a live profile.
const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
const dependencies = manifest.dependencies ?? {}
console.log(`\n${name} in dependencies: ${Object.hasOwn(dependencies, name)}`)
if (Object.hasOwn(dependencies, name)) console.log(`  declared as: ${dependencies[name]}`)
console.log(`\nthe route would ${Object.hasOwn(dependencies, name) ? 'PROCEED in place' : 'return "absent" and fall back'}`)
