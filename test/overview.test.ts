import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOverview } from '../src/host/overview.ts'
import { PACKUMENT_CONCURRENCY, type PackumentEntry, type TagEntry } from '../src/host/registry.ts'
import type { BundleInfo, HostContext } from '../src/host/manager.ts'

/** One installed bundle the overview must describe. */
function bundle(name: string): BundleInfo {
  return {
    name,
    official: false,
    availability: 'profile',
    version: '1.0.0',
    enabled: true,
    installed: true,
    optional: false,
    removable: true,
    source: `${name}@1.0.0`,
    rows: [],
    overrides: [],
  } as BundleInfo
}

/** A context whose manager lists the given bundles. */
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
    effect() {},
    on() {
      return () => {}
    },
    webServer: { register: () => () => {} },
  } as unknown as HostContext
}

/** Replace `globalThis.fetch`, counting how many requests overlap. */
function stubFetch(track: (overlap: number) => void): { restore: () => void; peak: () => number } {
  const original = globalThis.fetch
  let live = 0
  let peak = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    // GitHub tag lookups are not part of the package burst; answer them empty.
    if (url.includes('api.github.com')) {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    live += 1
    peak = Math.max(peak, live)
    track(live)
    await new Promise((resolve) => setTimeout(resolve, 25))
    live -= 1
    return new Response(
      JSON.stringify({ versions: { '1.0.0': {}, '1.1.0': {} }, 'dist-tags': { latest: '1.1.0' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  return {
    restore: () => {
      globalThis.fetch = original
    },
    peak: () => peak,
  }
}

test('a page load does not fire every registry lookup at once', async () => {
  const names = Array.from({ length: 12 }, (_, index) => `pkg-${index}`)
  const stub = stubFetch(() => {})
  try {
    const overview = await buildOverview(
      context(names.map(bundle)),
      new Map<string, PackumentEntry>(),
      new Map<string, TagEntry>(),
      {},
    )
    // The bug: `Promise.all` opened one connection per package and the mirror
    // dropped most of them at the deadline, which the tab drew as "no history".
    assert.ok(stub.peak() <= PACKUMENT_CONCURRENCY, `peak ${stub.peak()} exceeded the cap`)
    assert.equal(overview.bundles.length, names.length)
    assert.ok(overview.bundles.every((row) => row.versions.length > 0))
  } finally {
    stub.restore()
  }
})

test('a failed lookup leaves a reason on the row instead of an empty list', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('The operation was aborted due to timeout')
  }) as typeof fetch
  try {
    const overview = await buildOverview(
      context([bundle('pkg')]),
      new Map<string, PackumentEntry>(),
      new Map<string, TagEntry>(),
      {},
    )
    const row = overview.bundles[0]
    assert.ok(row !== undefined)
    assert.deepEqual(row.versions, [])
    // Without this the row is indistinguishable from a package that has never
    // been published, and the history button simply is not drawn.
    assert.match(String(row.versionError), /registry unreachable/)
  } finally {
    globalThis.fetch = original
  }
})

test('the saved registry is what versions are read from', async () => {
  /*
   * The picker's whole point is that the list and the install agree on one
   * source. Reading versions from pnpm's registry while installing from the
   * chosen one would show versions that the chosen source may not have.
   */
  const requested: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('api.github.com')) return new Response('[]', { status: 200 })
    requested.push(url)
    return new Response(JSON.stringify({ versions: { '1.0.0': {}, '1.1.0': {} }, 'dist-tags': { latest: '1.1.0' } }), {
      status: 200,
    })
  }) as typeof fetch
  try {
    const overview = await buildOverview(
      context([bundle('pkg')]),
      new Map<string, PackumentEntry>(),
      new Map<string, TagEntry>(),
      { registry: 'https://registry.example.com/' },
    )
    assert.ok(
      requested.some((url) => url.startsWith('https://registry.example.com/')),
      `expected a read from the saved registry, got ${requested.join(', ')}`,
    )
    assert.equal(overview.registry, 'https://registry.example.com')
    // The saved value is reported verbatim so the picker can tell "chose this"
    // from "rode on pnpm's config".
    assert.equal(overview.savedRegistry, 'https://registry.example.com/')
  } finally {
    globalThis.fetch = original
  }
})

test('no saved registry still reports an empty choice', async () => {
  const stub = stubFetch(() => {})
  try {
    const overview = await buildOverview(
      context([bundle('pkg')]),
      new Map<string, PackumentEntry>(),
      new Map<string, TagEntry>(),
      {},
    )
    assert.equal(overview.savedRegistry, '')
    assert.equal(overview.registry, 'https://registry.npmjs.org')
  } finally {
    stub.restore()
  }
})
