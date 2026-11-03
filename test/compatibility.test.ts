/**
 * The two compatibility situations the version page has to get right.
 *
 * Both start from the same failure mode, seen on a real profile: the host's
 * compatibility gate refuses an install *after* the manager has already begun
 * replacing the bundle, so the click either installs nothing or leaves the
 * package removed. The page can prevent that only by judging every version
 * against the runtime before it offers the button.
 *
 * @module dsh-plugin-upgrader/test/compatibility
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { dshRequirementOf, meetsDshRequirement, shapePackument, type FullPackument } from '../src/host/registry.ts'

/** The skin plugin whose history reproduced the real incident. */
const SKIN = '@smalltailqwq/dsh-client-ui-skin-maid-atelier'

/** Peer ranges published by that plugin, as the mirror serves them. */
const SKIN_PEERS: Record<string, string> = {
  '0.1.3': '',
  '0.1.4': '>=0.1.7-rc.1 <0.1.8-0',
  '0.1.5': '>=0.1.7-rc.1 <0.1.8-0',
  '0.1.6': '>=0.1.7-rc.1 <0.1.8-0',
  '0.1.7': '>=0.1.7-rc.1 <0.3.0-0',
  '0.1.8': '>=0.1.7-rc.1 <0.3.0-0',
  '0.1.9': '>=0.2.0-rc.2 <0.3.0-0',
}

/** Build a packument shaped like the real one: no engines, peers only. */
function skinPackument(latest: string): FullPackument {
  const versions = Object.fromEntries(
    Object.entries(SKIN_PEERS).map(([version, range]) => [
      version,
      range === ''
        ? { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' } }
        : { peerDependencies: { '@deepseek-ai/dsh': range, '@deepseek-ai/cordis': '^4.0.1' } },
    ]),
  )
  return { versions, 'dist-tags': { latest } } as FullPackument
}

test('a version that declares only a workspace peer declares no requirement', () => {
  /*
   * `workspace:^` names the build tree, and the host reads it as "the running
   * runtime". Treating it as a literal range would mark every such version
   * incompatible with everything.
   */
  assert.equal(dshRequirementOf({ peerDependencies: { '@deepseek-ai/dsh': 'workspace:^' } }), undefined)
  assert.equal(dshRequirementOf({ peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' } }), undefined)
})

test('engines wins over peers, exactly as the host decides it', () => {
  /*
   * The gate's rule: when the manifest declares `engines.dsh`, that range alone
   * decides and peer ranges are ignored. Reading peers first would disagree with
   * the gate on any manifest that declares both.
   */
  const requirement = dshRequirementOf({
    engines: { dsh: '>=0.2.0-rc.2 <0.3.0-0' },
    peerDependencies: { '@deepseek-ai/dsh': '>=9.0.0' },
  })
  assert.deepEqual(requirement, { range: '>=0.2.0-rc.2 <0.3.0-0', source: 'engines', count: 1 })
})

test('the dsh- packages count too, because the host checks their names too', () => {
  const requirement = dshRequirementOf({
    peerDependencies: {
      '@deepseek-ai/dsh': '>=0.2.0-rc.2 <0.3.0-0',
      '@deepseek-ai/dsh-client-locale': '^0.2.1-rc.2',
      react: '^19.0.0',
    },
  })
  assert.equal(requirement?.source, 'peers')
  assert.equal(requirement?.count, 2)
})

test('scene one: a newer DSH refuses the older plugin versions it used to run', () => {
  /*
   * The runtime moved to 0.2.1-rc.5. Going *down* the history now crosses the
   * line where the plugin still demanded `>=0.1.7-rc.1 <0.1.8-0`, and the host
   * refuses those builds. They stay listed — they are published history — but
   * they have to be marked, and the switch button must not offer them.
   */
  const runtime = '0.2.1-rc.5'
  const shaped = shapePackument(skinPackument('0.1.9'), '0.1.9', undefined, runtime)
  const byVersion = new Map(shaped.versions.map((row) => [row.version, row]))

  assert.equal(byVersion.get('0.1.4')?.compatible, false)
  assert.equal(byVersion.get('0.1.5')?.compatible, false)
  assert.equal(byVersion.get('0.1.6')?.compatible, false)
  assert.equal(byVersion.get('0.1.7')?.compatible, undefined)
  assert.equal(byVersion.get('0.1.9')?.compatible, undefined)
  // The requirement travels with the row so the tooltip can name it.
  assert.equal(byVersion.get('0.1.5')?.requires, '>=0.1.7-rc.1 <0.1.8-0')
})

test('scene two: an older DSH refuses the newer plugin versions it cannot run', () => {
  /*
   * The same document read by a 0.1.6 runtime. The skill is inverted: the newest
   * release is now the one that cannot be installed, which is what makes an
   * "upgrade" button wrong rather than merely unhelpful.
   */
  const runtime = '0.1.6'
  const shaped = shapePackument(skinPackument('0.1.9'), '0.1.3', undefined, runtime)
  const byVersion = new Map(shaped.versions.map((row) => [row.version, row]))

  assert.equal(byVersion.get('0.1.4')?.compatible, false)
  assert.equal(byVersion.get('0.1.7')?.compatible, false)
  assert.equal(byVersion.get('0.1.9')?.compatible, false)
  // 0.1.3 declares no DSH requirement at all, so nothing can be said about it.
  assert.equal(byVersion.get('0.1.3')?.compatible, undefined)
})

test('an unknown runtime marks nothing, because nothing is known', () => {
  /*
   * Reporting `false` when the host version could not be read would hide every
   * version on a machine where the lookup failed — and the lookup does fail on
   * layouts this plugin cannot see into. Silence is the honest answer.
   */
  const shaped = shapePackument(skinPackument('0.1.9'), '0.1.9', undefined, undefined)
  assert.equal(shaped.versions.every((row) => row.compatible === undefined), true)
  assert.equal(meetsDshRequirement({ peerDependencies: { '@deepseek-ai/dsh': '>=9.0.0' } }, undefined), undefined)
})

test('a manifest without a requirement is not evidence either way', () => {
  assert.equal(meetsDshRequirement({}, '0.2.1-rc.5'), undefined)
  assert.equal(
    meetsDshRequirement({ peerDependencies: { '@deepseek-ai/dsh': '>=0.2.0-rc.2 <0.3.0-0' } }, '0.2.1-rc.5'),
    true,
  )
  assert.equal(
    meetsDshRequirement({ peerDependencies: { '@deepseek-ai/dsh': '>=0.1.7-rc.1 <0.1.8-0' } }, '0.2.1-rc.5'),
    false,
  )
})

test('the plugin name used here is the one from the reported incident', () => {
  // Guards the fixture above against being quietly repointed at another package.
  assert.equal(SKIN, '@smalltailqwq/dsh-client-ui-skin-maid-atelier')
})
