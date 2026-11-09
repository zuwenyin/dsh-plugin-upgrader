import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runStep, validateStep } from '../src/host/install.ts'
import { readJournal, recoverPendingDrops } from '../src/host/manifest.ts'
import { LOCK_FILE } from '../src/host/lock.ts'
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

test('a chosen registry is passed to the manager', async () => {
  const { manager, calls } = fakeManager({})
  await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {}, undefined, 'https://registry.npmmirror.com/')

  assert.equal(calls.install.length, 1)
  assert.equal(calls.install[0]?.options?.registry, 'https://registry.npmmirror.com/')
})

test('no choice leaves the manager own registry in charge', async () => {
  /*
   * `undefined` and `null` are different to the manager: `null` means "ask
   * pnpm", while omitting the option keeps whatever `pluginManager.registry`
   * the profile configured. Sending `null` for an unset choice would quietly
   * override that config, so the option must be absent.
   */
  const { manager, calls } = fakeManager({})
  await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {})

  assert.equal(calls.install.length, 1)
  assert.equal(Object.hasOwn(calls.install[0]?.options ?? {}, 'registry'), false)
})

test('a blank choice is treated as no choice', async () => {
  const { manager, calls } = fakeManager({})
  await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {}, undefined, '   ')

  assert.equal(Object.hasOwn(calls.install[0]?.options ?? {}, 'registry'), false)
})

test('the chosen registry is trimmed before it reaches the manager', async () => {
  const { manager, calls } = fakeManager({})
  await runStep(manager, { name: 'pkg', version: '1.2.3' }, () => {}, undefined, '  https://registry.npmmirror.com/  ')

  assert.equal(calls.install[0]?.options?.registry, 'https://registry.npmmirror.com/')
})

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

test('an approval is never presented a second time', async () => {
  /*
   * The reported bug, as a shape: `approvedBuilds` names a `name@version` that
   * the manager is still waiting on, and the first pnpm run answers it. Handing
   * the same names to the retry after the removal — or, worse, to the rollback —
   * gets `stale-approval` before pnpm starts, which replaced the real failure
   * (a peer dependency the package's own postinstall needs) with a word that
   * explains nothing, and made the rollback fail too. The plugin was then gone
   * from the profile.
   */
  await withProfile({ name: 'desktop', dependencies: { pkg: '1.0.0' } }, async () => {
    const { manager, calls } = fakeManager({
      installs: (call) => {
        if (call === 0) return refused('already-installed', 'install')
        if (call === 1) return new Error('postinstall: peer @earendil-works/pi-ai is missing')
        if (call === 2) return new Error('postinstall: peer @earendil-works/pi-ai is missing')
        return applied({ version: '1.0.0' })
      },
    })
    const listed = [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
    ]
    let reads = 0
    manager.listBundles = async () => (reads++ === 0 ? listed : [])

    const log: string[] = []
    await runStep(
      manager,
      { name: 'pkg', version: '2.0.0', approveBuilds: ['pkg@2.0.0'] },
      (line) => log.push(line),
    )

    assert.deepEqual(
      calls.install.map((entry) => entry.options?.approvedBuilds),
      [['pkg@2.0.0'], ['pkg@2.0.0'], undefined, undefined],
      'the first install and the in-place replacement may ask; the retry and the rollback may not',
    )
    assert.match(log.join('\n'), /rollback|rolled back|back where it was/)
  })
})

test('a settled approval is repaired instead of reported', async () => {
  /*
   * Somebody already answered the question — with `pnpm approve-builds`, or by
   * spending the approval on an earlier attempt. The manager then refuses the
   * whole call before pnpm runs, so nothing is wrong with the package: dropping
   * the credential and asking once more installs it.
   */
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('stale-approval', 'install') : applied({ version: '2.0.0' })),
  })
  const log: string[] = []
  const outcome = await runStep(
    manager,
    { name: 'pkg', version: '2.0.0', approveBuilds: ['pkg@2.0.0'] },
    (line) => log.push(line),
  )

  assert.equal(outcome.ok, true)
  assert.equal(calls.install.length, 2)
  assert.equal(calls.install[1]?.options?.approvedBuilds, undefined)
  assert.match(log.join('\n'), /no longer waiting for approval/)
})

test('the stale approval does not travel into the rollback either', async () => {
  /*
   * The second half of the same bug. A refusal is reported as a result, not a
   * throw, so it walks straight into the shared tail and from there into the
   * rollback. If the credential survives that, the rollback is refused too —
   * and a failed upgrade takes the plugin out of the profile.
   */
  await withProfile({ name: 'desktop', dependencies: { pkg: '1.0.0' } }, async () => {
    const { manager, calls } = fakeManager({
      installs: (call) => {
        if (call === 0) return refused('stale-approval', 'install')
        if (call === 1) return refused('stale-approval', 'install')
        return applied({ version: '1.0.0' })
      },
    })
    const listed = [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
    ]
    let reads = 0
    manager.listBundles = async () => (reads++ === 0 ? listed : [])

    await runStep(manager, { name: 'pkg', version: '2.0.0', approveBuilds: ['pkg@2.0.0'] }, () => {})

    const rollback = calls.install.find((entry) => entry.spec === 'pkg@1.0.0')
    assert.notEqual(rollback, undefined, 'the rollback has to run at all')
    assert.equal(rollback?.options?.approvedBuilds, undefined, 'an approval for 2.0.0 does not name 1.0.0')
  })
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

test('a version the host would refuse is never installed at all', async () => {
  /*
   * The incident this guards: switching to an older version that declares a DSH
   * range excluding the running build. The gate fires after pnpm has already
   * rewritten the lockfile, so by the time it answers the old package is gone.
   * Asking the manifest first means pnpm never runs and nothing is removed.
   */
  const { manager, calls } = fakeManager({})
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '0.1.5' }, (line) => log.push(line), undefined, undefined, {
    runtimeVersion: '0.2.1-rc.5',
    requirementOf: async () => ({ range: '>=0.1.7-rc.1 <0.1.8-0' }),
  })

  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, 'incompatible-version')
  assert.equal(outcome.detail, '>=0.1.7-rc.1 <0.1.8-0')
  assert.deepEqual(calls.install, [], 'nothing was installed')
  assert.deepEqual(calls.remove, [], 'nothing was removed')
  assert.match(log.join('\n'), /excludes DSH 0\.2\.1-rc\.5; nothing was changed/)
})

test('a version that fits the running host still installs', async () => {
  // The guard must not be a blanket refusal: the same plugin at 0.1.9 passes.
  const { manager, calls } = fakeManager({})
  const outcome = await runStep(manager, { name: 'pkg', version: '0.1.9' }, () => {}, undefined, undefined, {
    runtimeVersion: '0.2.1-rc.5',
    requirementOf: async () => ({ range: '>=0.2.0-rc.2 <0.3.0-0' }),
  })

  assert.equal(outcome.ok, true)
  assert.equal(calls.install.length, 1)
})

test('an unknown requirement is not treated as a refusal', async () => {
  /*
   * A package the registry never described, or a manifest without a DSH range,
   * has to install exactly as before. Refusing on "I could not read it" would
   * break every plugin that predates the compatibility field.
   */
  const { manager, calls } = fakeManager({})
  const outcome = await runStep(manager, { name: 'pkg', version: '1.0.0' }, () => {}, undefined, undefined, {
    runtimeVersion: '0.2.1-rc.5',
    requirementOf: async () => undefined,
  })

  assert.equal(outcome.ok, true)
  assert.equal(calls.install.length, 1)
})

test('a package the manager destroyed is put back at its old version', async () => {
  /*
   * The repair that the old code could not do. `restoreSelection` only puts the
   * bundle back in the list; when pnpm has already deleted the files there is
   * nothing to select, and the plugin disappears from the page. Re-installing
   * the version that was there before is the only thing that actually works.
   */
  await withProfile(
    { name: 'desktop', dependencies: { pkg: '1.0.0' } },
    async () => {
      const gone = [
        { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
      ]
      const { manager, calls } = fakeManager({
        installs: (call) => {
          if (call === 0) return refused('already-installed', 'install')
          // The in-place retry is refused, which demotes the step to the
          // removal route; the install after the removal is what the host's
          // compatibility gate rejects, leaving the package gone.
          if (call === 1) return refused('operation-error', 'install')
          if (call === 2) return refused('incompatible-version', 'install')
          return applied({ version: '1.0.0' })
        },
        bundles: gone,
      })
      // After the removal the package is gone from the list.
      const realList = manager.listBundles
      let reads = 0
      manager.listBundles = async () => {
        reads += 1
        // The first read captures the version to roll back to; from then on the
        // package is missing, exactly as it was in the incident.
        return reads === 1 ? realList.call(manager) : []
      }

      const log: string[] = []
      const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

      assert.equal(outcome.ok, false)
      assert.equal(outcome.rolledBack, '1.0.0', 'the outcome says what was put back')
      const specs = calls.install.map((entry) => entry.spec)
      assert.deepEqual(specs, ['pkg@2.0.0', 'pkg@2.0.0', 'pkg@2.0.0', 'pkg@1.0.0'])
      assert.match(log.join('\n'), /roll back: install pkg@1\.0\.0 again/)
    },
  )
})

test('a package still on disk is re-selected instead of reinstalled', async () => {
  /*
   * The other half of the distinction. A refused install that left the files
   * alone must not trigger a second pnpm run — that would be slower, and the
   * version on disk is already the right one.
   */
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : refused('operation-error', 'install')),
    bundles: [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: false, availability: 'profile', removable: true } as BundleInfo,
    ],
  })

  const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

  assert.equal(outcome.ok, false)
  assert.equal(outcome.rolledBack, undefined)
  assert.equal(calls.install.length, 2, 'no third install was attempted')
  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: true }])
})

test('a failed upgrade leaves a plugin that was switched off switched off', async () => {
  /*
   * The recovery used to re-select whatever was still on disk, and re-selecting
   * means enabling: a user who keeps a plugin switched off, upgrades it, and
   * watches the upgrade fail would find it switched ON. The removal is what
   * deselected it, so putting the selection back is only right for a step that
   * wanted the plugin loaded.
   */
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : refused('operation-error', 'install')),
    bundles: [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: false, availability: 'profile', removable: true } as BundleInfo,
    ],
  })
  const log: string[] = []
  const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0', enabled: false }, (line) => log.push(line))

  assert.equal(outcome.ok, false)
  assert.deepEqual(calls.enable, [], 'a plugin the user keeps off is not loaded by a failed upgrade')
  assert.doesNotMatch(log.join('\n'), /re-select pkg/)
})

test('a thrown install after the removal keeps that state too', async () => {
  // The other failure shape: `pnpm` dying is the same window, so it needs the
  // same answer rather than only the manager-refused path.
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : new Error('pnpm died')),
    bundles: [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: false, availability: 'profile', removable: true } as BundleInfo,
    ],
  })
  const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0', enabled: false }, () => {})

  assert.equal(outcome.ok, false)
  assert.deepEqual(calls.enable, [])
})

test('a failed upgrade still puts back a plugin the step wanted loaded', async () => {
  // The fix must not become "never restore": a step that wanted the plugin on
  // is the case the recovery was written for.
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : refused('operation-error', 'install')),
    bundles: [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: false, availability: 'profile', removable: true } as BundleInfo,
    ],
  })
  const log: string[] = []
  await runStep(manager, { name: 'pkg', version: '2.0.0', enabled: true }, (line) => log.push(line))

  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: true }])
  assert.match(log.join('\n'), /re-select pkg/)
})

test('a failed upgrade does not toggle a plugin that is already on', async () => {
  // Same end state, so there is nothing to ask the manager for.
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : refused('operation-error', 'install')),
    bundles: [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
    ],
  })
  await runStep(manager, { name: 'pkg', version: '2.0.0', enabled: true }, () => {})

  assert.deepEqual(calls.enable, [])
})

test('a failed upgrade switches off a plugin the manager reports as loaded', async () => {
  /*
   * `enabled: false` is the state the step wants, not a claim about the current
   * one: a manager that still reads the bundle as loaded has to be told to drop
   * it, otherwise "I kept it off and the upgrade failed" ends with a plugin
   * running that nobody asked for.
   */
  const { manager, calls } = fakeManager({
    installs: (call) => (call === 0 ? refused('already-installed', 'install') : refused('operation-error', 'install')),
    bundles: [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
    ],
  })
  const log: string[] = []
  await runStep(manager, { name: 'pkg', version: '2.0.0', enabled: false }, (line) => log.push(line))

  assert.deepEqual(calls.enable, [{ name: 'pkg', enabled: false }])
  assert.match(log.join('\n'), /disable pkg \(restoring the previous state\)/)
})

test('a failed first step does not lose its entry when the next step succeeds', async () => {
  /*
   * The multi-plugin incident: step one drops its entry, the in-place install
   * dies, and the restore cannot run because another writer holds the lock — so
   * the only thing that remembers the entry was ever there is its record. Step
   * two then drops its own entry and succeeds. With one record per profile that
   * write replaced the first record and the confirmation removed it, leaving the
   * first plugin gone from the manifest with nothing left to repair it.
   */
  await withProfile(
    {
      name: 'desktop',
      dependencies: { first: '1.0.0', second: '1.0.0' },
      dsh: { profile: { bundles: ['first', 'second'] } },
    },
    async (dir) => {
      const { manager } = fakeManager({
        installs: (call) => {
          if (call === 0) return refused('already-installed', 'install')
          if (call === 1) {
            // The in-place attempt dies, and a competing writer already holds
            // the lock, so the restore right behind it cannot run either.
            writeFileSync(join(dir, LOCK_FILE), '4242\n', 'utf8')
            return new Error('registry died')
          }
          if (call === 2) return refused('already-installed', 'install')
          // pnpm is what writes a landed entry back into the profile.
          const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
            dependencies: Record<string, string>
          }
          manifest.dependencies.second = '2.0.0'
          writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')
          return applied({ version: '2.0.0' })
        },
        // The removal that would have replaced the first plugin is refused too,
        // which is what leaves the step without a usable fallback.
        removes: () => refused('operation-error', 'remove'),
      })

      const first = await runStep(manager, { name: 'first', version: '2.0.0' }, () => {})
      assert.equal(first.ok, false)

      // The competitor is done with the profile; the batch carries on.
      rmSync(join(dir, LOCK_FILE), { force: true })
      const second = await runStep(manager, { name: 'second', version: '2.0.0' }, () => {})
      assert.equal(second.ok, true)

      assert.equal(readJournal(dir, 'first')?.spec, '1.0.0', 'the failed step is still on record')
      const after = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }
      assert.equal(after.dependencies.second, '2.0.0')
      assert.equal(Object.hasOwn(after.dependencies, 'first'), false)

      // The next load is what has to put the first plugin back.
      assert.deepEqual(recoverPendingDrops(dir), [{ kind: 'restored', name: 'first', spec: '1.0.0' }])
      const repaired = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }
      assert.equal(repaired.dependencies.first, '1.0.0')
      assert.equal(repaired.dependencies.second, '2.0.0')
    },
  )
})

test('a rollback that is refused says so instead of pretending', async () => {
  // The step already failed; the rollback must not swallow the fact that the
  // plugin is still missing.
  await withProfile({ name: 'desktop', dependencies: { pkg: '1.0.0' } }, async () => {
    const { manager, calls } = fakeManager({
      installs: (call) => {
        if (call === 0) return refused('already-installed', 'install')
        if (call === 1) return refused('operation-error', 'install')
        if (call === 2) return refused('incompatible-version', 'install')
        return refused('operation-error', 'install')
      },
    })
    const listed = [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
    ]
    let reads = 0
    manager.listBundles = async () => (reads++ === 0 ? listed : [])

    const log: string[] = []
    const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

    assert.equal(outcome.ok, false)
    assert.equal(outcome.rolledBack, undefined)
    assert.equal(outcome.inactive, undefined)
    assert.match(log.join('\n'), /rollback refused \(operation-error\); pkg@1\.0\.0 is not installed/)
    assert.equal(calls.install.length, 4)
  })
})

test('a rollback that installs but cannot activate is not called "not installed"', async () => {
  /*
   * The failure this pins: pnpm put 1.0.0 back on disk and the profile points at
   * it, but the host refused to activate it (`stage: 'enable'`, clean pnpm run).
   * The old code read `application` alone, so it printed "pkg@1.0.0 is not
   * installed — install it again from the Installed tab" for a package that IS
   * installed, and following that advice gets `already-installed` back. Say what
   * actually happened instead, and do not claim the version was rolled back.
   */
  await withProfile({ name: 'desktop', dependencies: { pkg: '1.0.0' } }, async () => {
    const { manager } = fakeManager({
      installs: (call) => {
        if (call === 0) return refused('already-installed', 'install')
        if (call === 1) return refused('operation-error', 'install')
        if (call === 2) return refused('incompatible-version', 'install')
        // The rollback: pnpm succeeded, the profile is written, activation failed.
        return {
          changed: true,
          application: 'failed',
          stage: 'enable',
          target: 'pkg',
          packageResult: { exitCode: 0, output: 'added 1 package', truncated: false, logPath: 'x' },
          error: { code: 'operation-error', diagnostic: 'dsh: warning: 1 entry did not activate' },
        } as ChangeResult
      },
    })
    const listed = [
      { name: 'pkg', version: '1.0.0', installed: true, enabled: true, availability: 'profile', removable: true } as BundleInfo,
    ]
    let reads = 0
    manager.listBundles = async () => (reads++ === 0 ? listed : [])

    const log: string[] = []
    const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

    assert.equal(outcome.ok, false)
    assert.equal(outcome.rolledBack, undefined, 'the plugin does not run, so it is not rolled back')
    assert.equal(outcome.inactive, '1.0.0', 'the package is back on disk, though')
    assert.equal(outcome.rollbackReason, 'dsh: warning: 1 entry did not activate')
    const text = log.join('\n')
    assert.doesNotMatch(text, /pkg@1\.0\.0 is not installed/)
    assert.match(text, /pkg@1\.0\.0 is installed but did not activate \(dsh: warning: 1 entry did not activate\)/)
  })
})

/*
 * A refused build script is a question, not a dead end.
 *
 * pnpm stops the install and the manager writes `name@version: set this to true
 * or false` into the profile's pnpm settings, so the next run can be told yes.
 * The step has to carry that name back: without it the page can only show the
 * pnpm log, and every retry asks the same unanswerable question again.
 */
async function buildBlockedProfile(
  body: (dir: string) => Promise<void>,
  workspace = 'allowBuilds:\n  pkg@2.0.0: set this to true or false\n',
): Promise<void> {
  await withProfile({ name: 'desktop', dependencies: { pkg: '1.0.0' } }, async (dir) => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), workspace, 'utf8')
    await body(dir)
  })
}

test('a build-script refusal names what has to be approved', async () => {
  await buildBlockedProfile(async () => {
    const { manager } = fakeManager({
      installs: () =>
        ({
          changed: false,
          application: 'failed',
          stage: 'install',
          target: 'pkg',
          error: { code: 'operation-error', diagnostic: 'ERR_PNPM_IGNORED_BUILDS Ignored build scripts: pkg@2.0.0' },
          pendingBuilds: ['pkg@2.0.0', 'other@1.0.0'],
        }) as ChangeResult,
    })
    const log: string[] = []
    const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, (line) => log.push(line))

    assert.equal(outcome.ok, false)
    assert.equal(outcome.message, 'build-blocked', 'the page needs a nameable reason, not operation-error')
    // Only this package's entry: the manager answers with the whole profile.
    assert.deepEqual(outcome.pendingBuilds, ['pkg@2.0.0'])
    assert.match(log.join('\n'), /pnpm skipped the build scripts of pkg@2\.0\.0; they need an explicit approval/)
  })
})

test('the diagnostic alone is enough when the manager could not read the file', async () => {
  await buildBlockedProfile(async () => {
    const { manager } = fakeManager({
      installs: () =>
        ({
          changed: false,
          application: 'failed',
          stage: 'install',
          target: 'pkg',
          error: { code: 'operation-error', diagnostic: 'ERR_PNPM_IGNORED_BUILDS Ignored build scripts: pkg@2.0.0' },
        }) as ChangeResult,
    })
    const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

    assert.equal(outcome.message, 'build-blocked')
    assert.deepEqual(outcome.pendingBuilds, ['pkg@2.0.0'])
  })
})

test('an answered script is not offered for approval again', async () => {
  await buildBlockedProfile(
    async () => {
      const { manager } = fakeManager({
        installs: () =>
          ({
            changed: false,
            application: 'failed',
            stage: 'install',
            target: 'pkg',
            error: { code: 'operation-error', diagnostic: 'Ignored build scripts: pkg@2.0.0' },
          }) as ChangeResult,
      })
      const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

      // Nothing is pending any more, so there is nothing to approve and the
      // failure has to keep its original code.
      assert.equal(outcome.pendingBuilds, undefined)
      assert.equal(outcome.message, 'operation-error')
    },
    'allowBuilds:\n  pkg@2.0.0: true\n',
  )
})

test('an ordinary failure is not relabelled as a build refusal', async () => {
  await buildBlockedProfile(async () => {
    const { manager } = fakeManager({ installs: () => refused('network', 'install') })
    const outcome = await runStep(manager, { name: 'pkg', version: '2.0.0' }, () => {})

    assert.equal(outcome.message, 'network')
    assert.equal(outcome.pendingBuilds, undefined)
  })
})


