import test from 'node:test'
import assert from 'node:assert/strict'

import { versionsMissingFromMirror, UPSTREAM_REGISTRY } from '../src/host/registry.ts'
import type { PackumentEntry } from '../src/host/registry.ts'

/**
 * Serve a fixed packument per registry base.
 *
 * @param documents - base URL -> versions published there.
 */
function stubRegistries(documents: Record<string, string[] | number>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    const base = url.startsWith(UPSTREAM_REGISTRY) ? UPSTREAM_REGISTRY : 'https://mirror.example'
    const answer = documents[base]
    if (answer === undefined) return new Response('nope', { status: 404 })
    if (typeof answer === 'number') return new Response('nope', { status: answer })
    return new Response(
      JSON.stringify({ versions: Object.fromEntries(answer.map((v) => [v, {}])), 'dist-tags': {} }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test('versions the mirror lacks are reported, newest first', async () => {
  const restore = stubRegistries({
    'https://mirror.example': ['1.0.0', '1.1.0'],
    [UPSTREAM_REGISTRY]: ['1.0.0', '1.1.0', '1.2.0', '1.3.0'],
  })
  try {
    const missing = await versionsMissingFromMirror(
      'https://mirror.example',
      'pkg',
      '1.0.0',
      new Map<string, PackumentEntry>(),
      false,
    )
    assert.deepEqual(missing, ['1.3.0', '1.2.0'])
  } finally {
    restore()
  }
})

test('nothing is reported when the profile already uses the upstream registry', async () => {
  // Asking npm whether npm is missing something is a wasted round trip, and the
  // answer would be wrong the moment it returned anything.
  let called = false
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    called = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  try {
    const missing = await versionsMissingFromMirror(
      `${UPSTREAM_REGISTRY}/`,
      'pkg',
      '1.0.0',
      new Map<string, PackumentEntry>(),
      false,
    )
    assert.deepEqual(missing, [])
    assert.equal(called, false, 'no request should be made')
  } finally {
    globalThis.fetch = original
  }
})

test('versions at or below what is installed are never reported', async () => {
  // An old release the mirror never carried is not something the tab offers, and
  // listing it would bury the one line that matters.
  const restore = stubRegistries({
    'https://mirror.example': ['1.1.0'],
    [UPSTREAM_REGISTRY]: ['0.9.0', '1.0.0', '1.1.0'],
  })
  try {
    const missing = await versionsMissingFromMirror(
      'https://mirror.example',
      'pkg',
      '1.1.0',
      new Map<string, PackumentEntry>(),
      false,
    )
    assert.deepEqual(missing, [])
  } finally {
    restore()
  }
})

test('an unreadable upstream is reported as no gap, not as every version missing', async () => {
  const restore = stubRegistries({
    'https://mirror.example': ['1.0.0'],
    [UPSTREAM_REGISTRY]: 500,
  })
  try {
    const missing = await versionsMissingFromMirror(
      'https://mirror.example',
      'pkg',
      '0.1.0',
      new Map<string, PackumentEntry>(),
      false,
    )
    assert.deepEqual(missing, [])
  } finally {
    restore()
  }
})

test('a mirror that is current reports nothing', async () => {
  const restore = stubRegistries({
    'https://mirror.example': ['1.0.0', '1.1.0'],
    [UPSTREAM_REGISTRY]: ['1.0.0', '1.1.0'],
  })
  try {
    const missing = await versionsMissingFromMirror(
      'https://mirror.example',
      'pkg',
      '1.0.0',
      new Map<string, PackumentEntry>(),
      false,
    )
    assert.deepEqual(missing, [])
  } finally {
    restore()
  }
})
