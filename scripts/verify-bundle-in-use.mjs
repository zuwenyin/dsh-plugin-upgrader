/**
 * Drive the BUILT host half against a manager that reproduces the real one.
 *
 * The unit tests use a permissive fake. This one encodes the two behaviours
 * from the shipped `@deepseek-ai/dsh-plugin-manager` that produced the bug, so
 * the compiled `lib/host/install.js` is what gets exercised:
 *
 *   1. `removeBundle` deselects only when it reads the bundle as enabled.
 *   2. `setBundleEnabled` writes the selection, and the reload disposes the rows
 *      that the previous patch list had and the new one does not. Asking for a
 *      state the manifest is already in writes nothing, so nothing is dropped.
 *
 * Run with: node scripts/verify-bundle-in-use.mjs
 */
import assert from 'node:assert/strict'
import { runStep } from '../lib/host/install.js'

/**
 * A manager that models the shipped selection/fiber semantics.
 *
 * @param options - the starting fibre state and the selection.
 * @returns the fake manager plus the calls it recorded.
 */
function modelManager({ staleFiber }) {
  const calls = { install: [], remove: [], enable: [] }
  /** Which bundles the profile manifest selects. */
  const selected = new Set()
  /** Bundles that still own a live loader fibre. */
  let fibers = new Set(staleFiber ? ['pkg'] : [])

  /** The reload: dispose exactly the rows the deselection dropped. */
  const reload = () => {
    if (!selected.has('pkg')) fibers.delete('pkg')
  }

  const manager = {
    async listBundles() {
      return [{ name: 'pkg', enabled: selected.has('pkg') }]
    },
    async registries() {
      return { registry: null, fallbackRegistries: [], resolved: null }
    },
    async installBundle(spec, opts) {
      calls.install.push({ spec, opts })
      if (calls.install.length === 1) {
        return { changed: false, application: 'failed', stage: 'install', target: spec, error: { code: 'already-installed' } }
      }
      return { changed: true, application: 'applied', stage: 'install', target: 'pkg', version: '9.9.9' }
    },
    async removeBundle(name) {
      calls.remove.push(name)
      // Only a bundle read as enabled is deselected before the check.
      if (selected.has(name)) {
        selected.delete(name)
        reload()
      }
      if (fibers.has(name)) {
        return { changed: false, application: 'failed', stage: 'remove', target: name, error: { code: 'bundle-in-use' } }
      }
      return { changed: true, application: 'applied', stage: 'remove', target: name }
    },
    async setBundleEnabled(name, enabled) {
      calls.enable.push({ name, enabled })
      const already = selected.has(name) === enabled
      if (enabled) selected.add(name)
      else selected.delete(name)
      // The no-op case: nothing written, so the reload drops nothing.
      if (!already) reload()
      return { changed: !already, application: 'applied', stage: 'enable', target: name, enabled }
    },
    async cancelInstall() {
      return { status: 'not-running' }
    },
  }
  return { manager, calls, selected }
}

/** Collect the job log. */
async function drive(manager) {
  const log = []
  const outcome = await runStep(manager, { name: 'pkg', version: '9.9.9' }, (line) => log.push(line))
  return { outcome, log }
}

// 1. The reported bug: disabled but still loaded. Old code gave up here.
{
  const { manager, calls } = modelManager({ staleFiber: true })
  const { outcome, log } = await drive(manager)

  console.log('— disabled bundle with a live fiber —')
  console.log(log.join('\n'))
  assert.equal(outcome.ok, true, 'the step must succeed now')
  // The manifest is already "not selected", so asking for disabled again writes
  // nothing and drops nothing. Only the reselect + deselect pair produces the
  // change the reload can act on.
  assert.deepEqual(
    calls.enable.map((call) => call.enabled),
    [true, false],
    'a bundle the manager reads as disabled is reselected, then dropped',
  )
  assert.equal(calls.remove.length, 2, 'one refusal, then the successful retry')
}

// 2. The same bug when the manifest still selects it.
{
  const { manager, calls } = modelManager({ staleFiber: true })
  await manager.setBundleEnabled('pkg', true)
  const { outcome } = await drive(manager)

  console.log('\n— selected bundle with a live fiber —')
  assert.equal(outcome.ok, true)
  // A selected bundle takes the ordinary one-way unload: removeBundle deselects
  // it, the reload drops the row, and the retry succeeds with no toggle at all.
  assert.deepEqual(calls.enable.map((call) => call.enabled), [true])
}

// 3. A fiber no toggle can clear: the step must fail with an actionable hint.
{
  const { manager } = modelManager({ staleFiber: true })
  manager.setBundleEnabled = async (name, enabled) => ({
    changed: false, application: 'applied', stage: 'enable', target: name, enabled,
  })
  manager.removeBundle = async () => ({
    changed: false,
    application: 'failed',
    stage: 'remove',
    target: 'pkg',
    error: { code: 'bundle-in-use' },
  })
  const { outcome } = await drive(manager)

  console.log('\n— a fiber neither toggle nor reload can clear —')
  console.log(JSON.stringify({ message: outcome.message, detail: outcome.detail }, null, 2))
  assert.equal(outcome.ok, false)
  assert.equal(outcome.stage, 'remove')
  assert.equal(outcome.message, 'bundle-in-use', 'the code survives for bug reports')
  assert.match(String(outcome.detail), /重启 DSH/)
  assert.match(String(outcome.detail), /restart DSH/)
}

console.log('\nall bundle-in-use scenarios behave as designed')
