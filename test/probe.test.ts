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

/** A rejection shaped like the one `AbortSignal.timeout` produces. */
function timeoutError(): Error {
  return Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
}

test('a source that answers is reachable', async () => {
  /*
   * This is the button the request added: "test whether the current source is
   * usable". Both paths are asked at once, so a slow ping cannot hide a fast
   * root — see the mirror test below for why that matters.
   */
  const stub = stubFetch(async () => new Response('{}', { status: 200 }))
  try {
    const result = await probeRegistry('https://registry.npmmirror.com/')
    assert.equal(result.ok, true)
    assert.equal(result.detail, 'HTTP 200')
    assert.equal(typeof result.ms, 'number')
    assert.deepEqual(stub.calls, ['https://registry.npmmirror.com/-/ping', 'https://registry.npmmirror.com/'])
  } finally {
    stub.restore()
  }
})

test('a slow ping does not hide a fast root', async () => {
  /*
   * The regression this test pins: registry.npmmirror.com answers `/-/ping` in 3
   * to 15 seconds on some networks while its root answers in a quarter of a
   * second. Probing the paths in sequence spent the whole deadline on the ping
   * and reported the mainland mirror — the mirror this whole feature exists for —
   * as unreachable. Racing them means the cheap answer is the one that counts.
   *
   * The assertion is on elapsed time, not just on `ok`: a sequential probe also
   * ends up reachable here, it just makes the user wait for the slow path first.
   */
  const stub = stubFetch(async (url) => {
    if (url.endsWith('/-/ping')) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      throw timeoutError()
    }
    return new Response('{}', { status: 200 })
  })
  try {
    const startedAt = Date.now()
    const result = await probeRegistry('https://registry.npmmirror.com/')
    const elapsed = Date.now() - startedAt
    assert.equal(result.ok, true)
    assert.equal(result.detail, 'HTTP 200')
    assert.ok(elapsed < 150, `answered after ${elapsed} ms; the slow ping was awaited`)
  } finally {
    stub.restore()
  }
})

test('a ping endpoint that refuses still lets the registry root answer', async () => {
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

test('a status line is reported instead of a timeout', async () => {
  /*
   * "HTTP 503" says the host is up and unhappy; "timed out" only says it was
   * slow. When one path gives a status and the other times out, the specific
   * cause is the one worth showing.
   */
  const stub = stubFetch(async (url) => {
    if (url.endsWith('/-/ping')) throw timeoutError()
    return new Response('down', { status: 503 })
  })
  try {
    const result = await probeRegistry('https://registry.example.com/')
    assert.equal(result.ok, false)
    assert.equal(result.detail, 'HTTP 503')
  } finally {
    stub.restore()
  }
})

test('a timeout says so, in milliseconds', async () => {
  /*
   * `AbortSignal.timeout` rejects with the opaque message "The operation was
   * aborted due to timeout". The probe knows its own deadline, so it says which
   * one, rather than passing the DOM string through to the dialog.
   */
  const stub = stubFetch(async () => {
    throw timeoutError()
  })
  try {
    const result = await probeRegistry('https://slow.example.com/')
    assert.equal(result.ok, false)
    assert.equal(result.detail, `timed out after ${PROBE_TIMEOUT_MS} ms`)
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

test('the probe deadline fits a slow mirror', () => {
  /*
   * 1500 ms was the harness's own number, but that probe races two addresses it
   * already trusts to pick a default. This one is asked about an address the user
   * typed, on a link that may be slow, and both paths share the deadline.
   */
  assert.equal(PROBE_TIMEOUT_MS, 5000)
})
