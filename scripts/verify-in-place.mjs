/**
 * Watch whether a real replacement removes the bundle or installs in place.
 *
 * This drives the BUILT host half against a throwaway profile whose manifest
 * holds the package, and records the manager calls. What matters is one thing:
 * `removeBundle` must not be called, because that is the call that deselects
 * the bundle and makes the plugin disappear from the page.
 *
 * The manager is a stand-in that models the real guard: it refuses a spec whose
 * package name is in the manifest, and otherwise reports success while writing
 * the new version back — which is what pnpm + the manager do together.
 *
 * Usage: node scripts/verify-in-place.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { runStep } = await import('../lib/host/install.js')

const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-inplace-'))
const manifestPath = join(dir, 'package.json')
const NAME = 'dsh-plugin-upgrader'

/**
 * A manifest writer that behaves like the harness: 2-space JSON, trailing newline.
 *
 * @param value - the manifest to persist.
 */
const write = (value) => writeFileSync(manifestPath, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8')
const read = () => JSON.parse(readFileSync(manifestPath, 'utf8'))

write({ name: 'desktop', private: true, dependencies: { [NAME]: '1.2.0' }, dsh: { profile: { bundles: [NAME] } } })

const calls = { install: [], remove: [], enable: [] }
const manager = {
  async listBundles() {
    return [{ name: NAME, installed: true, enabled: true, version: read().dependencies?.[NAME] ?? '1.2.0' }]
  },
  async registries() {
    return { registry: null, fallbackRegistries: [], resolved: null }
  },
  async installBundle(spec, options) {
    calls.install.push({ spec, options })
    const name = spec.includes('@') ? spec.slice(0, spec.lastIndexOf('@')) : spec
    const version = spec.slice(spec.lastIndexOf('@') + 1)
    const current = read()
    // The real guard: refuse when the name is still a declared dependency.
    if (Object.hasOwn(current.dependencies ?? {}, name)) {
      return { changed: false, application: 'failed', stage: 'install', target: spec, error: { code: 'already-installed' } }
    }
    // pnpm `add` writes the new version back, exactly as the real one does.
    current.dependencies = { ...(current.dependencies ?? {}), [name]: version }
    write(current)
    return { changed: true, application: 'applied', stage: 'enable', target: name, version }
  },
  async removeBundle(name) {
    calls.remove.push(name)
    const current = read()
    delete current.dependencies?.[name]
    write(current)
    return { changed: true, application: 'applied', stage: 'remove', target: name }
  },
  async setBundleEnabled(name, enabled) {
    calls.enable.push({ name, enabled })
    return { changed: true, application: 'applied', stage: 'enable', target: name }
  },
  async cancelInstall() {
    return { status: 'not-running' }
  },
}

const previous = process.env.DSH_PROFILE_DIR
process.env.DSH_PROFILE_DIR = dir
const log = []
let outcome
try {
  outcome = await runStep(manager, { name: NAME, version: '1.1.0', enabled: true }, (line) => log.push(line))
} finally {
  if (previous === undefined) delete process.env.DSH_PROFILE_DIR
  else process.env.DSH_PROFILE_DIR = previous
}

const finalDependency = read().dependencies?.[NAME]
const stillSelected = (read().dsh?.profile?.bundles ?? []).includes(NAME)
rmSync(dir, { recursive: true, force: true })

console.log('log:')
for (const line of log) console.log(`  ${line}`)
console.log(`\ninstalls: ${calls.install.length}   removes: ${calls.remove.length}`)
console.log(`outcome:  ok=${outcome.ok} application=${outcome.application}`)
console.log(`manifest: ${NAME} = ${finalDependency}   still selected: ${stillSelected}`)

let bad = 0
const check = (label, condition) => {
  console.log(`  ${condition ? 'ok     ' : 'FAILED '} ${label}`)
  if (!condition) bad += 1
}
console.log('')
check('the bundle was never removed', calls.remove.length === 0)
check('nothing was deselected', stillSelected)
check('it installed the requested version', finalDependency === '1.1.0')
check('the step reported success', outcome.ok === true)
check('the log says no removal was needed', log.join('\n').includes('no removal needed'))

if (bad > 0) {
  console.error(`\nFAILED: ${bad} check(s)`)
  process.exit(1)
}
console.log('\nin-place replacement verified: the plugin never leaves the page')
