import test from 'node:test'
import assert from 'node:assert/strict'

import { PROBE_TIMEOUT_MS, probeRegistry } from '../src/host/registry.ts'

/** Replace `globalThis.fetch` for one test, and restore it afterwards. */
function stubFetch(handler: (url: string) => Promise<Response>): { calls: string[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    return handler(url)
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

test('a source that answers its ping endpoint is reachable', async () => {
  /*
   * This is the button the request added: "test whether the current source is
   * usable". A mirror that answers `/-/ping` is usable whatever else it serves,
   * so the cheapest endpoint is what is asked first.
   */
  const stub = stubFetch(async () => new Response('{}', { status: 200 }))
  try {
    const result = await probeRegistry('https://registry.npmmirror.com/')
    assert.equal(result.ok, true)
    assert.equal(result.detail, 'HTTP 200')
    assert.equal(typeof result.ms, 'number')
    assert.deepEqual(stub.calls, ['https://registry.npmmirror.com/-/ping'])
  } finally {
    stub.restore()
  }
})

test('a ping endpoint that refuses falls back to the registry root', async () => {
  /*
   * Not every registry serves `/-/ping` — a private Verdaccio, or a plain file
   * server behind a proxy, answers the root only. Declaring those unreachable
   * would be wrong in the direction that makes a user change a working source.
   */
  const stub = stubFetch(async (url) =>
    url.endsWith('/-/ping') ? new Response('nope', { status: 404 }) : new Response('{}', { status: 200 }),
  )
  try {
    const result = await probeRegistry('http://npm.internal:4873')
    assert.equal(result.ok, true)
    assert.equal(result.detail, 'HTTP 200')
    assert.deepEqual(stub.calls, ['http://npm.internal:4873/-/ping', 'http://npm.internal:4873/'])
  } finally {
    stub.restore()
  }
})

test('a source that answers neither path is unreachable, with the reason', async () => {
  /*
   * "Unreachable" on its own does not tell a user whether they typed the
   * address wrong or their network is down, so the failure carries the
   * underlying cause — here the DNS failure `node` reports.
   */
  const stub = stubFetch(async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  })
  try {
    const result = await probeRegistry('https://nope.example.com/')
    assert.equal(result.ok, false)
    assert.match(result.detail, /ENOTFOUND|fetch failed/)
  } finally {
    stub.restore()
  }
})

test('the last status wins when both paths answer but neither succeeds', async () => {
  const stub = stubFetch(async () => new Response('down', { status: 503 }))
  try {
    const result = await probeRegistry('https://registry.example.com/')
    assert.equal(result.ok, false)
    assert.equal(result.detail, 'HTTP 503')
  } finally {
    stub.restore()
  }
})

test('an empty address is refused without a request', async () => {
  /*
   * The route validates before calling this, but the function must not treat a
   * blank string as the current directory and start probing the host itself.
   */
  const stub = stubFetch(async () => new Response('{}', { status: 200 }))
  try {
    const result = await probeRegistry('   ')
    assert.equal(result.ok, false)
    assert.deepEqual(stub.calls, [])
  } finally {
    stub.restore()
  }
})

test('the probe keeps the harness deadline', () => {
  // Same budget the harness's own registry probe uses; a longer one would make
  // the button feel stuck, a shorter one would call a slow mirror dead.
  assert.equal(PROBE_TIMEOUT_MS, 1500)
})
