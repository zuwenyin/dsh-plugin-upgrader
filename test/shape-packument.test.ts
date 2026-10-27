import test from 'node:test'
import assert from 'node:assert/strict'

import { shapePackument, type FullPackument } from '../src/host/registry.ts'

/** A packument with the given versions and tags. */
function doc(versions: string[], tags: Record<string, string> = {}): FullPackument {
  return {
    versions: Object.fromEntries(versions.map((version) => [version, {}])),
    'dist-tags': tags,
  } as FullPackument
}

test('the latest tag is trusted when it is above the installed version', () => {
  const shaped = shapePackument(doc(['1.0.0', '1.1.0'], { latest: '1.1.0' }), '1.0.0', undefined)
  assert.equal(shaped.latest, '1.1.0')
  assert.equal(shaped.staleTag, undefined)
  assert.equal(shaped.versions.find((row) => row.version === '1.1.0')?.latest, true)
})

test('a prerelease above the latest tag does not steal it', () => {
  // The stable line must not advertise a beta just because it sorts higher.
  const shaped = shapePackument(
    doc(['1.0.0', '1.1.0', '2.0.0-beta.1'], { latest: '1.1.0' }),
    '1.0.0',
    undefined,
  )
  assert.equal(shaped.latest, '1.1.0')
  assert.equal(shaped.versions.find((row) => row.version === '2.0.0-beta.1')?.latest, false)
})

test('a latest tag below the installed version is rejected as broken', () => {
  // npmmirror really serves this shape for @deepseek-ai/dsh-subagent-codex:
  // latest 0.0.1-rc.1 while the profile runs 0.2.1-rc.3.
  const shaped = shapePackument(
    doc(['0.0.1-rc.1', '0.2.1-rc.1', '0.2.1-rc.3', '0.2.1-rc.4'], {
      latest: '0.0.1-rc.1',
      next: '0.2.1-rc.4',
    }),
    '0.2.1-rc.3',
    undefined,
  )
  assert.equal(shaped.latest, '0.2.1-rc.4')
  assert.equal(shaped.staleTag, '0.0.1-rc.1')
})

test('recovering from a broken tag prefers a stable release over a prerelease', () => {
  const shaped = shapePackument(
    doc(['0.1.0', '1.0.0', '1.2.0', '1.3.0-rc.1'], { latest: '0.1.0' }),
    '1.0.0',
    undefined,
  )
  assert.equal(shaped.latest, '1.2.0')
  assert.equal(shaped.staleTag, '0.1.0')
})

test('a broken tag with nothing above the installed version keeps the tag', () => {
  // Nothing to upgrade to: leaving the tag alone is the honest answer, and the
  // row then simply reports no upgrade.
  const shaped = shapePackument(doc(['0.1.0', '0.2.0'], { latest: '0.1.0' }), '0.2.0', undefined)
  assert.equal(shaped.latest, '0.1.0')
})

test('a packument without any versions reports why instead of an empty list', () => {
  const shaped = shapePackument({} as FullPackument, '1.0.0', undefined)
  assert.deepEqual(shaped.versions, [])
  assert.equal(shaped.versionError, 'registry returned no versions')
})
