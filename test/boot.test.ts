/**
 * The reload guard, as the tab uses it.
 *
 * `reloadWhenBootDocumentFresh` decides whether a page reload would land on a
 * batch the Host no longer serves — the failure that turns a finished batch
 * upgrade into a startup-error dialog. These tests pin the decision, not the
 * browser.
 *
 * @module dsh-plugin-upgrader/test/boot
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootBatches, checkBootDocument, reloadWhenBootDocumentFresh } from '../src/client/boot.ts'
import type { BootWire, FetchLike } from '../src/client/boot.ts'

/** A manifest with the two batches a real page carries. */
function wire(...urls: string[]): BootWire {
  return {
    batches: urls.map((url, index) => ({
      phase: index === 0 ? 'bootstrap' : 'application',
      url,
      rev: `rev-${String(index)}`,
    })),
  }
}

/** Answer every request with one status, and record what was asked. */
function answering(status: number, seen: string[] = []): FetchLike {
  return async (input) => {
    seen.push(input)
    return { status }
  }
}

test('reads every usable batch out of the boot manifest', () => {
  const manifest = wire('plugins/??a/client.js&rev=1', 'plugins/??b/client.js&rev=2')
  const rows = bootBatches(manifest)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { phase: 'bootstrap', url: 'plugins/??a/client.js&rev=1', rev: 'rev-0' })
  assert.deepEqual(rows[1], { phase: 'application', url: 'plugins/??b/client.js&rev=2', rev: 'rev-1' })
})

test('an absent or reshaped manifest yields no batches instead of throwing', () => {
  assert.deepEqual(bootBatches(undefined), [])
  assert.deepEqual(bootBatches(null), [])
  assert.deepEqual(bootBatches({}), [])
  assert.deepEqual(bootBatches({ batches: 'nope' }), [])
  assert.deepEqual(bootBatches({ batches: [null, 7, { url: 1 }, { url: 'u' }] }), [])
})

test('a manifest with no batches counts as fresh, so a reload still happens', async () => {
  assert.equal(await checkBootDocument({ wire: {}, fetch: answering(404) }), 'fresh')
})

test('every batch answering means the document is still served', async () => {
  const seen: string[] = []
  const freshness = await checkBootDocument({
    wire: wire('plugins/??a/client.js&rev=1'),
    href: 'dsh-app://app/',
    fetch: answering(200, seen),
  })
  assert.equal(freshness, 'fresh')
  assert.deepEqual(seen, ['dsh-app://app/plugins/??a/client.js&rev=1'])
})

test('a single batch answering 404 means the document is gone', async () => {
  const manifest = wire('plugins/??a/client.js&rev=1')
  const freshness = await checkBootDocument({ wire: manifest, fetch: answering(404) })
  assert.equal(freshness, 'stale')
})

test('the guard stops at the first dead batch instead of probing the rest', async () => {
  const seen: string[] = []
  const freshness = await checkBootDocument({
    wire: wire('plugins/??a/client.js&rev=1', 'plugins/??b/client.js&rev=2'),
    fetch: answering(404, seen),
  })
  assert.equal(freshness, 'stale')
  assert.equal(seen.length, 1)
})

test('an unclear answer settles nothing, so the reload is allowed', async () => {
  for (const status of [500, 403, 0]) {
    const freshness = await checkBootDocument({
      wire: wire('plugins/??a/client.js&rev=1'),
      fetch: answering(status),
    })
    assert.equal(freshness, 'unknown', `status ${String(status)}`)
  }
})

test('an unclear answer does not stop the reload, only a dead batch does', async () => {
  let reloads = 0
  const started = await reloadWhenBootDocumentFresh({
    window: {
      __DSH_BOOT__: wire('plugins/??a/client.js&rev=1'),
      location: {
        href: 'dsh-app://app/',
        reload: () => {
          reloads += 1
        },
      },
    },
    fetch: answering(500),
  })
  assert.equal(started, true)
  assert.equal(reloads, 1)
})

test('a refused request proves nothing either', async () => {
  const freshness = await checkBootDocument({
    wire: wire('plugins/??a/client.js&rev=1'),
    fetch: async () => {
      throw new TypeError('fetch failed')
    },
  })
  assert.equal(freshness, 'unknown')
})

test('without a fetch the answer is unknown and the reload still goes ahead', async () => {
  const status = await reloadWhenBootDocumentFresh({
    window: { __DSH_BOOT__: wire('plugins/??a/client.js&rev=1'), location: { reload: () => {} } },
    fetch: undefined,
  })
  assert.equal(status, true)
})

test('the reload is skipped and reported when the document is stale', async () => {
  let reloads = 0
  let blocked = 0
  const started = await reloadWhenBootDocumentFresh({
    window: {
      __DSH_BOOT__: wire('plugins/??a/client.js&rev=1'),
      location: {
        href: 'dsh-app://app/',
        reload: () => {
          reloads += 1
        },
      },
    },
    fetch: answering(404),
    onBlocked: () => {
      blocked += 1
    },
  })
  assert.equal(started, false)
  assert.equal(reloads, 0)
  assert.equal(blocked, 1)
})

test('the reload runs when every batch is still served', async () => {
  let reloads = 0
  const started = await reloadWhenBootDocumentFresh({
    window: {
      __DSH_BOOT__: wire('plugins/??a/client.js&rev=1'),
      location: {
        href: 'dsh-app://app/',
        reload: () => {
          reloads += 1
        },
      },
    },
    fetch: answering(200),
  })
  assert.equal(started, true)
  assert.equal(reloads, 1)
})

test('the reload is never claimed when the page offers none', async () => {
  const started = await reloadWhenBootDocumentFresh({
    window: { __DSH_BOOT__: wire('plugins/??a/client.js&rev=1'), location: {} },
    fetch: answering(200),
  })
  assert.equal(started, false)
})
