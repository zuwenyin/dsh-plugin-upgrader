import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fetchPackument,
  PACKUMENT_CONCURRENCY,
  PACKUMENT_RETRY_MS,
  PACKUMENT_TIMEOUT_MS,
  type PackumentEntry,
} from '../src/host/registry.ts'

/** Replace `globalThis.fetch` for one test, and restore it afterwards. */
function stubFetch(handler: (url: string, init: RequestInit | undefined) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

/** A registry answer carrying one version. */
function packument(body: unknown = { versions: { '1.0.0': { repository: { url: 'git+https://github.com/x/x.git', type: 'git' } } }, 'dist-tags': { latest: '1.0.0' } }): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('a packument is asked for in its abbreviated form', async () => {
  let accept: string | undefined
  const restore = stubFetch(async (_url, init) => {
    accept = new Headers(init?.headers).get('accept') ?? undefined
    return packument()
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const result = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(result.error, undefined)
    // The full document is what made a 26 MB transfer lose a 10 s deadline.
    assert.equal(accept, 'application/vnd.npm.install-v1+json')
  } finally {
    restore()
  }
})

test('an abbreviated document without repository fields is re-fetched in the full form', async () => {
  const accepts: string[] = []
  const restore = stubFetch(async (_url, init) => {
    accepts.push(new Headers(init?.headers).get('accept') ?? '')
    if (accepts.length === 1) {
      // The abbreviated document omits repository/homepage/bugs entirely.
      return packument({ versions: { '1.0.0': {} }, 'dist-tags': { latest: '1.0.0' } })
    }
    return packument()
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const result = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(result.error, undefined)
    assert.deepEqual(accepts, ['application/vnd.npm.install-v1+json', 'application/json'])
    const data = result.data as { versions?: Record<string, { repository?: { url?: string } }> }
    assert.match(String(data.versions?.['1.0.0']?.repository?.url), /github\.com/)
  } finally {
    restore()
  }
})

test('a full-document re-fetch that fails keeps the abbreviated document', async () => {
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    if (calls === 1) return packument({ versions: { '1.0.0': {} }, 'dist-tags': { latest: '1.0.0' } })
    throw new Error('fetch failed')
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const result = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(result.error, undefined, 'the version list still renders')
    const data = result.data as { repository?: unknown }
    assert.equal(data.repository, undefined, 'the abbreviated document is what is cached')
  } finally {
    restore()
  }
})

test('a timeout is retried once, and the retry can succeed', async () => {
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    if (calls === 1) throw Object.assign(new Error('fetch failed'), { name: 'TimeoutError' })
    return packument()
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const result = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(calls, 2)
    assert.equal(result.error, undefined)
    assert.ok(result.data !== undefined)
  } finally {
    restore()
  }
})

test('two timeouts report the failure and remember it briefly', async () => {
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    throw new Error('The operation was aborted due to timeout')
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const first = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(calls, 2, 'exactly one retry, not a loop')
    assert.match(String(first.error), /registry unreachable/)

    // A second render inside the window is answered from the cache: retrying a
    // just-timed-out mirror on every mount is what turned one slow render into
    // a permanent one.
    const second = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(calls, 2)
    assert.equal(second.error, first.error)
  } finally {
    restore()
  }
})

test('a remembered failure expires sooner than a remembered success', async () => {
  let calls = 0
  let failing = true
  const restore = stubFetch(async () => {
    calls += 1
    if (failing) throw new Error('timeout')
    return packument()
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(calls, 2)

    // Move the entry past the short failure window but inside the success TTL.
    const key = 'https://r.example|pkg'
    const entry = cache.get(key)
    assert.ok(entry !== undefined)
    cache.set(key, { ...entry, at: Date.now() - (PACKUMENT_RETRY_MS + 1) })

    failing = false
    const retried = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(calls, 3, 'the failure window expired, so it asked again')
    assert.equal(retried.error, undefined)
  } finally {
    restore()
  }
})

test('a 404 is a verdict, not contention: it is not retried', async () => {
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    return new Response('nope', { status: 404 })
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const result = await fetchPackument('https://r.example', 'missing', cache, false)
    assert.equal(calls, 1)
    assert.equal(result.error, 'registry 404 (not found)')
  } finally {
    restore()
  }
})

test('a fresh success is served from the cache', async () => {
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    return packument()
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    await fetchPackument('https://r.example', 'pkg', cache, false)
    await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.equal(calls, 1)
    // `force` is the "Check for updates" button: it must bypass the cache.
    await fetchPackument('https://r.example', 'pkg', cache, true)
    assert.equal(calls, 2)
  } finally {
    restore()
  }
})

test('the exported limits stay in the range the measurements support', () => {
  // 10 s was measured to be too short for a 26 MB document on this mirror.
  assert.ok(PACKUMENT_TIMEOUT_MS >= 15_000)
  // Eleven concurrent connections timed out; fewer than three is needlessly slow.
  assert.ok(PACKUMENT_CONCURRENCY >= 2 && PACKUMENT_CONCURRENCY <= 6)
})

test('a transport failure reports its cause, not just "fetch failed"', async () => {
  // Node wraps every transport fault in `TypeError: fetch failed` and hangs the
  // reason off `cause`; a tab that only sees the wrapper cannot tell "try again"
  // from "this registry is wrong".
  const restore = stubFetch(async () => {
    throw Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), { code: 'ECONNREFUSED' }),
    })
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    const result = await fetchPackument('https://r.example', 'pkg', cache, false)
    assert.match(String(result.error), /ECONNREFUSED/)
    assert.doesNotMatch(String(result.error), /^registry unreachable: fetch failed$/)
  } finally {
    restore()
  }
})

test('a cache-bypassing read ignores a remembered failure', async () => {
  let failing = true
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    if (failing) throw new Error('timeout')
    return packument()
  })
  try {
    const cache = new Map<string, PackumentEntry>()
    await fetchPackument('https://r.example', 'pkg', cache, false)
    failing = false
    // "Check for updates" must be able to clear a failure the person can see.
    const forced = await fetchPackument('https://r.example', 'pkg', cache, true)
    assert.equal(forced.error, undefined)
    assert.ok(calls > 2)
  } finally {
    restore()
  }
})
