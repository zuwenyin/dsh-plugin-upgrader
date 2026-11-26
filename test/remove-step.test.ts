/**
 * The removal entry point, on its own.
 *
 * `install.test.ts` covers `runStep`, whose whole job is to end with a version
 * on disk. These tests cover the opposite promise: a removal either takes the
 * package away or says why not, and *never* installs anything — not on the
 * happy path, not when the manager refuses, not when pnpm fails.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { removeStep, validateStep } from '../src/host/install.ts'
import type { BundleInfo, ChangeResult, PluginManager } from '../src/host/manager.ts'

/** One handler's answer: a result, or an error to reject with. */
type Plan = (call: number) => ChangeResult | Error

/** What a fake manager recorded while a removal ran. */
interface Calls {
  install: string[]
  remove: string[]
  enable: { name: string; enabled: boolean }[]
}

/** A settled change, shaped the way the manager reports one. */
function applied(over: Partial<ChangeResult> = {}): ChangeResult {
  return { changed: true, application: 'applied', stage: 'remove', target: 'pkg', ...over }
}

/** A change the manager refused, with the code that says why. */
function refused(code: string): ChangeResult {
  return { changed: false, application: 'failed', stage: 'remove', target: 'pkg', error: { code } }
}

/** A bundle the manager would report for a profile dependency. */
function bundle(over: Partial<BundleInfo> = {}): BundleInfo {
  return {
    name: 'pkg',
    official: false,
    availability: 'profile',
    version: '1.0.0',
    enabled: true,
    installed: true,
    optional: false,
    removable: true,
    rows: [],
    overrides: [],
    ...over,
  }
}

/**
 * A manager that answers removals from a plan and records every call.
 *
 * @param plan - the removal answers, the enable answer and the bundle list.
 * @returns the manager and its call log.
 */
function fakeManager(plan: {
  removes?: Plan
  enable?: (name: string, enabled: boolean) => ChangeResult | Error
  bundles?: BundleInfo[]
}): { manager: PluginManager; calls: Calls } {
  const calls: Calls = { install: [], remove: [], enable: [] }
  let removes = 0
  const settle = (value: ChangeResult | Error): ChangeResult => {
    if (value instanceof Error) throw value
    return value
  }
  const manager: PluginManager = {
    async listBundles() {
      return plan.bundles ?? [bundle()]
    },
    async registries() {
      return { registry: null, fallbackRegistries: [], resolved: null }
    },
    async installBundle(spec) {
      /*
       * Recorded rather than assumed: the single most important property of
       * this entry point is that this array stays empty.
       */
      calls.install.push(spec)
      return applied({ stage: 'install' })
    },
    async removeBundle(name) {
      calls.remove.push(name)
      return settle(plan.removes?.(removes++) ?? applied())
    },
    async setBundleEnabled(name, enabled) {
      calls.enable.push({ name, enabled })
      return applied({ stage: 'enable' })
    },
    async cancelInstall() {
      return { status: 'not-running' as const }
    },
  }
  return { manager, calls }
}

test('a removal takes the package away and installs nothing', async () => {
  const { manager, calls } = fakeManager({})

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, true)
  assert.equal(outcome.name, 'pkg')
  assert.equal(outcome.stage, 'remove')
  assert.equal(outcome.application, 'applied')
  assert.equal(outcome.changed, true)
  assert.deepEqual(calls.remove, ['pkg'])
  assert.deepEqual(calls.install, [])
  assert.deepEqual(calls.enable, [])
})

test('a removal step carries no version', async () => {
  const { manager } = fakeManager({})

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.version, '')
  assert.equal(outcome.spec, 'pkg')
})

test('a bundle the manager will not give up is reported, not removed', async () => {
  const { manager, calls } = fakeManager({ bundles: [bundle({ removable: false, readOnlyReason: 'management-required' })] })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, 'not-removable')
  assert.equal(outcome.detail, 'management-required')
  assert.deepEqual(calls.remove, [])
  assert.deepEqual(calls.install, [])
})

test('a bundle the loader still holds is unloaded and retried', async () => {
  const { manager, calls } = fakeManager({
    removes: (call) => (call === 0 ? refused('bundle-in-use') : applied()),
  })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, true)
  assert.deepEqual(calls.remove, ['pkg', 'pkg'])
  /* Unloading the bundle is what lets the loader drop the row it kept. */
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: false }])
  assert.deepEqual(calls.install, [])
})

test('a bundle that already reads as disabled is reselected before unloading', async () => {
  /*
   * The manager cannot unload a row it does not consider selected, so a bundle
   * that reads as disabled has to be turned on first — otherwise the retry hits
   * the same wall and the person is told to restart for no reason.
   */
  const { manager, calls } = fakeManager({
    removes: (call) => (call === 0 ? refused('bundle-in-use') : applied()),
    bundles: [bundle({ enabled: false })],
  })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, true)
  assert.deepEqual(calls.enable, [
    { name: 'pkg', enabled: true },
    { name: 'pkg', enabled: false },
  ])
  assert.deepEqual(calls.install, [])
})

test('a refusal that survives the retry says to restart, in the right verb', async () => {
  const { manager } = fakeManager({ removes: () => refused('bundle-in-use') })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, 'bundle-in-use')
  /* Telling someone to "upgrade again" after a failed uninstall is the inverse. */
  assert.match(String(outcome.detail), /卸载/)
  assert.doesNotMatch(String(outcome.detail), /升级/)
  assert.match(String(outcome.detail), /remove it again/)
})

test('a bundle the profile starts is refused with its own advice', async () => {
  const { manager, calls } = fakeManager({ removes: () => refused('stop-profile') })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, 'stop-profile')
  /*
   * `stop-profile` is not `bundle-in-use`: restarting brings the same list
   * back, so the hint has to point somewhere else entirely.
   */
  assert.match(String(outcome.detail), /已安装/)
  assert.doesNotMatch(String(outcome.detail), /重启 DSH 后再卸载/)
  assert.deepEqual(calls.install, [])
})

test('a failed removal is never reported as a successful install', async () => {
  const { manager, calls } = fakeManager({ removes: () => refused('operation-error') })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, 'operation-error')
  assert.equal(outcome.application, 'failed')
  assert.deepEqual(calls.install, [])
})

test('a thrown failure is caught and reported', async () => {
  const { manager, calls } = fakeManager({ removes: () => new Error('pnpm exploded') })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, 'operation-error')
  assert.match(String(outcome.detail), /pnpm exploded/)
  assert.deepEqual(calls.install, [])
})

test('a removal that only needs a restart still counts as removed', async () => {
  const { manager } = fakeManager({
    removes: () => applied({ application: 'restart-required', restartReason: 'no-hmr' }),
  })

  const outcome = await removeStep(manager, { name: 'pkg' }, () => {})

  assert.equal(outcome.ok, true)
  assert.equal(outcome.application, 'restart-required')
  assert.equal(outcome.restartReason, 'no-hmr')
})

test('the log names the package rather than an install spec', async () => {
  const { manager } = fakeManager({})
  const log: string[] = []

  await removeStep(manager, { name: 'pkg' }, (message) => {
    log.push(message)
  })

  assert.deepEqual(log, ['remove pkg'])
})

test('validateStep lets a removal through without a version', () => {
  assert.equal(validateStep({ name: 'pkg', action: 'remove' }), undefined)
  assert.equal(validateStep({ name: 'pkg', version: '', action: 'remove' }), undefined)
})

test('validateStep still refuses an install step with no version', () => {
  /* The removal exemption must not leak into the install verbs. */
  assert.equal(validateStep({ name: 'pkg', action: 'upgrade' }), 'invalid-step')
  assert.equal(validateStep({ name: 'pkg', action: 'switch' }), 'invalid-step')
  assert.equal(validateStep({ name: 'pkg' }), 'invalid-step')
})
