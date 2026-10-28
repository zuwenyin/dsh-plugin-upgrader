import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

test('the log says why the first install did nothing', async () => {
  /*
   * A bare `install <spec>` followed by `install <spec> over <old>` reads as a
   * removal sandwiched between two installs. Naming the guard's refusal is what
   * makes the in-place route legible in a screenshot.
   */
  await withProfile({ name: 'desktop', dependencies: { pkg: '1.0.0' } }, async () => {
    const { manager } = fakeManager({
      installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    })
    const log: string[] = []
    await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

    const refusedLine = log.findIndex((line) => /already declared/.test(line))
    const inPlaceLine = log.findIndex((line) => /in place: no removal/.test(line))
    assert.notEqual(refusedLine, -1, 'the refusal is named')
    assert.notEqual(inPlaceLine, -1, 'the in-place route is named')
    assert.ok(refusedLine < inPlaceLine, 'the refusal is explained before the retry')
    assert.equal(
      log.some((line) => /^remove /.test(line)),
      false,
      'nothing claims a removal happened',
    )
  })
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

test('a bundle the manager already reads as disabled is re-selected, then dropped', async () => {
  // Asking for `disabled` again changes nothing, so nothing is disposed and the
  // retry is refused the same way. Toggling up first is what makes the
  // deselection a real change the reload can act on.
  const bundles = [{ name: 'pkg', enabled: false } as BundleInfo]
  const { manager, calls } = fakeManager({
    bundles,
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: (call) => (call === 0 ? refused('bundle-in-use') : applied({ stage: 'remove' })),
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, (line) => log.push(line))

  assert.deepEqual(calls.enable, [
    { name: 'pkg', enabled: true },
    { name: 'pkg', enabled: false },
  ])
  assert.equal(outcome.ok, true)
  assert.ok(log.some((line) => line.includes('already reads as disabled')))
})

test('a re-select the manager refuses still gets the removal retry', async () => {
  const bundles = [{ name: 'pkg', enabled: false } as BundleInfo]
  const { manager, calls } = fakeManager({
    bundles,
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: (call) => (call === 0 ? refused('bundle-in-use') : applied({ stage: 'remove' })),
    enable: (_name, enabled) => (enabled ? refused('incompatible-version', 'enable') : applied({ stage: 'enable' })),
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, (line) => log.push(line))

  // No point asking for `disabled` after the re-select was refused.
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: true }])
  assert.ok(log.some((line) => line.includes('could not re-select')))
  assert.equal(outcome.ok, true)
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
  // The panel shows `message`; the code has to survive there, and the hint has
  // to travel beside it or the failure reads as an unexplained code.
  assert.equal(outcome.message, 'bundle-in-use')
  assert.match(String(outcome.detail), /restart DSH/)
})

test('a second refusal reported as a result carries the same hint', async () => {
  const { manager } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    removes: () => refused('bundle-in-use'),
  })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.stage, 'remove')
  assert.equal(outcome.message, 'bundle-in-use')
  assert.match(String(outcome.detail), /重启 DSH/)
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

test('a re-install that fails puts the selection back', async () => {
  /*
   * The removal already deselected the bundle. A failure after it leaves the
   * package in `dependencies`, on disk, and NOT selected — the plugin vanishes
   * from the page with no way back but the same toggle by hand. This is the
   * exact shape of the reported "整个版本都没了".
   */
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : new Error('pnpm died')),
    bundles: [
      {
        name: 'pkg',
        installed: true,
        enabled: false,
        version: '1.2.3',
        availability: 'profile',
        removable: true,
      } as BundleInfo,
    ],
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

  assert.equal(outcome.ok, false)
  assert.deepEqual(calls.remove, ['pkg'])
  // The whole point: the bundle is asked back on.
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: true }])
  assert.match(log.join('\n'), /re-select pkg/)
})

test('a refused re-install also puts the selection back', async () => {
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : refused('operation-error', 'install')),
    bundles: [
      { name: 'pkg', installed: true, enabled: false, availability: 'profile', removable: true } as BundleInfo,
    ],
  })
  const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

  assert.equal(outcome.ok, false)
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: true }])
})

test('a plain install that fails never touches the selection', async () => {
  // No removal happened, so nothing was deselected and there is nothing to fix.
  const { manager, calls } = fakeManager({ installs: () => new Error('network down') })
  const outcome = await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {})

  assert.equal(outcome.ok, false)
  assert.deepEqual(calls.remove, [])
  assert.deepEqual(calls.enable, [])
})

test('a package that is no longer installed is not re-selected', async () => {
  // Selecting something that is not on disk would only fail louder.
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : new Error('gone')),
    bundles: [
      { name: 'pkg', installed: false, enabled: false, availability: 'profile', removable: false } as BundleInfo,
    ],
  })
  await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

  assert.deepEqual(calls.enable, [])
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

/**
 * Run `body` against a throwaway profile, restoring the environment after.
 *
 * The in-place route reads `DSH_PROFILE_DIR` and rewrites that manifest, so a
 * test that forgot to redirect it would edit the profile of the harness that is
 * running the suite.
 *
 * @param manifest - what the profile should declare.
 * @param body - the test body, given the directory.
 */
async function withProfile(
  manifest: Record<string, unknown>,
  body: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-step-'))
  const previous = process.env.DSH_PROFILE_DIR
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')
  process.env.DSH_PROFILE_DIR = dir
  try {
    await body(dir)
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a replacement installs in place instead of removing first', async () => {
  /*
   * The whole point of the in-place route: the bundle is never deselected, so
   * the plugin never leaves the page. Removing first is what made it vanish.
   */
  await withProfile(
    { name: 'desktop', dependencies: { pkg: '1.0.0' }, dsh: { profile: { bundles: ['pkg'] } } },
    async (dir) => {
      const { manager, calls } = fakeManager({
        installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied({ version: '2.0.0' })),
      })
      const log: string[] = []
      const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

      assert.equal(outcome.ok, true)
      assert.deepEqual(calls.remove, [], 'nothing was removed')
      assert.equal(calls.install.length, 2)
      assert.match(log.join('\n'), /in place: no removal, the bundle stays loaded/)
      // The entry is dropped while pnpm runs; the fake manager never writes it
      // back, so the manifest is left as the drop found it.
      const after = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }
      assert.equal(Object.hasOwn(after.dependencies, 'pkg'), false)
    },
  )
})

test('an in-place attempt that fails restores the entry and falls back', async () => {
  await withProfile(
    { name: 'desktop', dependencies: { pkg: '1.0.0' } },
    async (dir) => {
      const { manager, calls } = fakeManager({
        // Refuse the first, throw on the in-place retry, then succeed on the
        // remove path.
        installs: (call) => {
          if (call === 0) return refused('already-installed', 'install')
          if (call === 1) return new Error('registry died')
          return applied({ version: '2.0.0' })
        },
      })
      const log: string[] = []
      const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

      // It still finishes, by the slower route.
      assert.equal(outcome.ok, true)
      assert.deepEqual(calls.remove, ['pkg'], 'fell back to the removal')
      assert.match(log.join('\n'), /in-place install failed/)
      // A failed attempt must not leave the profile without its entry.
      const after = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }
      assert.equal(after.dependencies.pkg, '1.0.0')
    },
  )
})

test('an unreadable profile falls back to the removal instead of guessing', async () => {
  await withProfile({ name: 'desktop' }, async () => {
    // No `dependencies` object at all: the drop reports `absent` and the
    // removal path takes over.
    const { manager, calls } = fakeManager({
      installs: (call) => (call === 0 ? refused('already-installed', 'install') : applied()),
    })
    const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

    assert.equal(outcome.ok, true)
    assert.deepEqual(calls.remove, ['pkg'])
  })
})

