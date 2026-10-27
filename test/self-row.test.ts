import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOverview } from '../src/host/overview.ts'
import { sourceKind } from '../src/host/bundle.ts'
import type { BundleInfo, HostContext } from '../src/host/manager.ts'

/** A profile-installed bundle. */
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
    source: 'pkg@1.0.0',
    rows: [],
    overrides: [],
    ...over,
  } as BundleInfo
}

/** A context whose manager reports the given bundles. */
function context(bundles: BundleInfo[]): HostContext {
  return {
    get(name: string) {
      if (name === 'pluginManager') {
        return {
          async listBundles() {
            return bundles
          },
          async registries() {
            return { registry: null, fallbackRegistries: [], resolved: null }
          },
        }
      }
      return undefined
    },
  } as unknown as HostContext
}

/** A registry that publishes two versions of anything asked. */
function stubRegistry(): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).includes('api.github.com')) {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(
      JSON.stringify({ versions: { '0.9.0': {}, '1.0.0': {}, '1.1.0': {} }, 'dist-tags': { latest: '1.1.0' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test('every spelling of a local path is classified as a path source', () => {
  // The upgrader itself is installed as a `link:` dependency, which is why its
  // own row used to be short-circuited out of the registry lookup entirely.
  assert.equal(sourceKind('link:D:/work/dsh-plugin-upgrader'), 'path')
  assert.equal(sourceKind('file:../dsh-plugin-upgrader'), 'path')
  assert.equal(sourceKind('./plugin'), 'path')
  assert.equal(sourceKind('/abs/plugin'), 'path')
  // A registry dependency must never be mistaken for a path one.
  assert.equal(sourceKind('1.0.3'), 'registry')
  assert.equal(sourceKind('npm:dsh-plugin-upgrader@1.0.3'), 'registry')
})

test('a path install still shows the published versions, but is not upgradable', async () => {
  const restore = stubRegistry()
  try {
    const overview = await buildOverview(
      context([bundle({ name: 'dsh-plugin-upgrader', version: '1.0.3', source: 'link:D:/work/dsh-plugin-upgrader' })]),
      new Map(),
      new Map(),
      {},
    )
    const row = overview.bundles[0]
    assert.ok(row !== undefined)
    // The directory's own version is what is installed...
    assert.equal(row.version, '1.0.3')
    // ...but the published list is still readable, which is what makes the row
    // informative instead of an arrow with no numbers.
    assert.ok(row.versions.length > 0)
    assert.equal(row.latest, '1.1.0')
    assert.match(String(row.versionError), /local path install/)
    // Replacing a link: with a registry tarball is not an upgrade.
    assert.equal(row.upgradable, false)
  } finally {
    restore()
  }
})

test('a path install marks the version it is running as current', async () => {
  // The stub publishes 0.9.0 / 1.0.0 / 1.1.0 and the directory is on 1.1.0,
  // which is also `latest`. Omitting the installed version here left every row
  // `current: false`, so the row the user is already on still offered a
  // "back to latest" button that switched it to itself.
  const restore = stubRegistry()
  try {
    const overview = await buildOverview(
      context([bundle({ name: 'dsh-plugin-upgrader', version: '1.1.0', source: 'link:D:/work/dsh-plugin-upgrader' })]),
      new Map(),
      new Map(),
      {},
    )
    const row = overview.bundles[0]
    assert.ok(row !== undefined)
    assert.equal(row.latest, '1.1.0')
    const current = row.versions.filter((version) => version.current === true)
    assert.equal(current.length, 1, 'exactly one row is the loaded version')
    assert.equal(current[0]?.version, '1.1.0')
  } finally {
    restore()
  }
})

test('a path install on a version the registry does not publish marks nothing current', async () => {
  // A local build can be ahead of the registry. No published row is the running
  // one, and saying otherwise would mislabel a version the user is not on.
  const restore = stubRegistry()
  try {
    const overview = await buildOverview(
      context([bundle({ name: 'dsh-plugin-upgrader', version: '9.9.9', source: 'link:D:/work/dsh-plugin-upgrader' })]),
      new Map(),
      new Map(),
      {},
    )
    const row = overview.bundles[0]
    assert.ok(row !== undefined)
    assert.equal(row.version, '9.9.9')
    assert.equal(row.versions.some((version) => version.current === true), false)
  } finally {
    restore()
  }
})

test('a path install whose package is not published says so plainly', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch
  try {
    const overview = await buildOverview(
      context([bundle({ name: 'private-plugin', source: 'link:D:/work/private-plugin' })]),
      new Map(),
      new Map(),
      {},
    )
    const row = overview.bundles[0]
    assert.ok(row !== undefined)
    assert.deepEqual(row.versions, [])
    assert.match(String(row.versionError), /no published copy/)
  } finally {
    globalThis.fetch = original
  }
})
