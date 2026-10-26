import test from 'node:test'
import assert from 'node:assert/strict'

import { runStep, validateStep } from '../src/host/install.ts'
import type {
  BundleInfo,
  ChangeResult,
  InstallBundleOptions,
  PluginManager,
} from '../src/host/manager.ts'

/** What a fake manager recorded while a step ran. */
interface Calls {
  install: { spec: string; options: InstallBundleOptions | undefined }[]
  remove: string[]
  enable: { name: string; enabled: boolean }[]
}

/** One handler's answer: a result, or an error to reject with. */
type Plan<T> = (call: number) => ChangeResult | T | Error

/** A settled change, shaped the way the manager reports one. */
function applied(over: Partial<ChangeResult> = {}): ChangeResult {
  return { changed: true, application: 'applied', stage: 'install', target: 'pkg', ...over }
}

/** A change the manager refused, with the code that says why. */
function refused(code: string, stage: ChangeResult['stage'] = 'remove'): ChangeResult {
  return {
    changed: false,
    application: 'failed',
    stage,
    target: 'pkg',
    error: { code },
  }
}

/**
 * A manager that answers from a plan and records every call.
 *
 * `runStep` only talks to four methods, so a plan per method is enough to pin
 * the behaviour without pulling in the real profile.
 *
 * @param plan - per-method answers and the bundle list.
 * @returns the manager and its call log.
 */
function fakeManager(plan: {
  installs?: Plan<never>
  removes?: Plan<never>
  enable?: (name: string, enabled: boolean) => ChangeResult | Error
  bundles?: BundleInfo[]
}): { manager: PluginManager; calls: Calls } {
  const calls: Calls = { install: [], remove: [], enable: [] }
  let installs = 0
  let removes = 0
  const settle = <T>(value: ChangeResult | T | Error): T | ChangeResult => {
    if (value instanceof Error) throw value
    return value
  }
  const manager: PluginManager = {
    async listBundles() {
      return plan.bundles ?? []
    },
    async registries() {
      return { registry: null, fallbackRegistries: [], resolved: null }
    },
    async installBundle(spec, options) {
      calls.install.push({ spec, options })
      return settle(plan.installs?.(installs++) ?? applied()) as ChangeResult
    },
    async removeBundle(name) {
      calls.remove.push(name)
      return settle(plan.removes?.(removes++) ?? applied({ stage: 'remove' })) as ChangeResult
    },
    async setBundleEnabled(name, enabled) {
      calls.enable.push({ name, enabled })
      return settle(plan.enable?.(name, enabled) ?? applied({ stage: 'enable' })) as ChangeResult
    },
    async cancelInstall() {
      return { status: 'not-running' as const }
    },
  }
  return { manager, calls }
}

test('a plain install asks for the exact version and reports success', async () => {
  const { manager, calls } = fakeManager({})
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, (line) => log.push(line))

  assert.equal(calls.install.length, 1)
  assert.equal(calls.install[0]?.spec, 'pkg@1.2.3')
  assert.equal(calls.install[0]?.options?.saveExact, true)
  assert.equal(outcome.ok, true)
  assert.equal(outcome.spec, 'pkg@1.2.3')
  assert.deepEqual(log, ['install pkg@1.2.3'])
})

test('an already-installed refusal becomes remove + install under a fresh id', async () => {
  const { manager, calls } = fakeManager({
    installs: (call) =>
      call === 0 ? refused('already-installed', 'install') : applied({ version: '2.0.0' }),
  })
  const announced: string[] = []
  const outcome = await runStep(
    manager,
    { name: 'pkg', version: '2.0.0' },
    () => {},
    (id) => announced.push(id),
  )

  assert.equal(calls.install.length, 2)
  assert.deepEqual(calls.remove, ['pkg'])
  assert.equal(outcome.ok, true)
  // The re-install must carry its own id: reusing the settled one would make
  // that stretch uncancellable, which is the bug this guards.
  assert.equal(announced.length, 2)
  assert.notEqual(announced[0], announced[1])
  assert.equal(calls.install[1]?.options?.requestId, announced[1])
  // `runStep` reports the spec it was asked for, not what the manager answered,
  // so the field is `version` that carries the new number.
  assert.equal(outcome.version, '2.0.0')
})

test('a bundle-in-use removal unloads the plugin and retries once', async () => {
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: (call) => (call === 0 ? refused('bundle-in-use') : applied({ stage: 'remove' })),
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, (line) => log.push(line))

  assert.equal(calls.remove.length, 2)
  // The forced unload is the whole fix: a disabled bundle keeps its loader
  // fiber, and removeBundle only unloads what reads as enabled.
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: false }])
  assert.equal(outcome.ok, true)
  assert.ok(log.some((line) => line.includes('still loaded')))
})

test('a bundle-in-use thrown rather than returned is retried too', async () => {
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: (call) =>
      call === 0
        ? Object.assign(new Error('bundle is in use'), { code: 'bundle-in-use' })
        : applied({ stage: 'remove' }),
  })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {})

  assert.equal(calls.remove.length, 2)
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: false }])
  assert.equal(outcome.ok, true)
})

test('an unload that throws still gets the retry', async () => {
  const { manager } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: (call) => (call === 0 ? refused('bundle-in-use') : applied({ stage: 'remove' })),
    enable: () => new Error('cannot toggle'),
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, (line) => log.push(line))

  assert.equal(outcome.ok, true)
  assert.ok(log.some((line) => line.includes('unload failed')))
})

test('a removal still refused after the unload says a restart is needed', async () => {
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: () => Object.assign(new Error('still loaded'), { code: 'bundle-in-use' }),
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, (line) => log.push(line))

  // The unload is attempted exactly once; a second refusal is reported rather
  // than retried in a loop.
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: false }])
  assert.equal(calls.remove.length, 2)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.stage, 'remove')
  assert.ok(log.some((line) => line.includes('needs a restart')))
})

test('a removal refused for another reason stops the step', async () => {
  const { manager, calls } = fakeManager({
    installs: () => refused('already-installed', 'install'),
    removes: () => refused('no-matching-version'),
  })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {})

  assert.equal(calls.install.length, 1)
  assert.equal(calls.enable.length, 0)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.stage, 'remove')
  assert.equal(outcome.message, 'no-matching-version')
})

test('a rejected install comes back as an outcome, not a throw', async () => {
  const { manager } = fakeManager({ installs: () => new Error('lock held') })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.stage, 'install')
  assert.equal(outcome.message, 'lock held')
})

test('a failed install does not try to restore the enabled state', async () => {
  const { manager, calls } = fakeManager({ installs: () => refused('network', 'install') })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3', enabled: true }, () => {})

  assert.equal(outcome.ok, false)
  // Toggling a package that was never added only produces a second, louder
  // error on top of the real one.
  assert.deepEqual(calls.enable, [])
  assert.equal(outcome.enabled, undefined)
})

test('the enabled state survives a replacement', async () => {
  const bundles = [{ name: 'pkg', enabled: false } as BundleInfo]
  const { manager, calls } = fakeManager({ bundles })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3', enabled: true }, () => {})

  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: true }])
  assert.equal(outcome.enabled, true)
})

test('a manager that refuses the restore reports the state it found', async () => {
  const bundles = [{ name: 'pkg', enabled: false } as BundleInfo]
  const { manager } = fakeManager({ bundles, enable: () => refused('operation-error', 'enable') })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3', enabled: true }, () => {})

  assert.equal(outcome.enabled, false)
})

test('approved builds travel with the installation', async () => {
  const { manager, calls } = fakeManager({})
  await runStep(manager, { name: 'pkg', version: '1.2.3', approveBuilds: ['esbuild'] }, () => {})

  assert.deepEqual(calls.install[0]?.options?.approvedBuilds, ['esbuild'])
})

test('an empty approval list is left out instead of sent as empty', async () => {
  const { manager, calls } = fakeManager({})
  await runStep(manager, { name: 'pkg', version: '1.2.3', approveBuilds: [] }, () => {})

  assert.equal(calls.install[0]?.options?.approvedBuilds, undefined)
})

test('validateStep accepts a well-formed step', () => {
  assert.equal(validateStep({ name: 'pkg', version: '1.0.0' }), undefined)
  assert.equal(validateStep({ name: 'pkg', version: '1.0.0', action: 'upgrade' }), undefined)
  assert.equal(validateStep({ name: 'pkg', version: '1.0.0', action: 'switch' }), undefined)
})

test('validateStep rejects what it cannot act on', () => {
  assert.equal(validateStep(null), 'invalid-step')
  assert.equal(validateStep('pkg'), 'invalid-step')
  assert.equal(validateStep({ name: 'pkg' }), 'invalid-step')
  assert.equal(validateStep({ version: '1.0.0' }), 'invalid-step')
  assert.equal(validateStep({ name: 'pkg', version: '1.0.0', action: 'delete' }), 'invalid-action')
})
