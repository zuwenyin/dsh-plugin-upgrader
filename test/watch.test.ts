import test from 'node:test'
import assert from 'node:assert/strict'

import { WATCH_MISS_LIMIT, watchJob } from '../src/client/api.ts'
import type { JobSnapshot } from '../src/client/types.ts'

/**
 * A snapshot with the fields the poll loop looks at.
 *
 * @param status - the job status to report.
 * @returns the snapshot.
 */
function snapshot(status: JobSnapshot['status']): JobSnapshot {
  return { id: 'job-1', status, total: 1, done: 1, failed: 0, log: [] }
}

/** A wait that resolves immediately, so the retry loop does not sleep. */
const nowait = (): Promise<void> => Promise.resolve()

/**
 * The regression this pins: a single unanswered poll used to end the batch, and
 * the tab read that as "the host restarted" — while the install was still
 * running and went on to succeed. Users saw a lost-contact banner over a
 * finished upgrade.
 */
test('one failed poll does not lose a batch that is still running', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    // The first poll dies, the rest answer normally.
    if (calls === 1) throw new Error('socket hang up')
    return new Response(JSON.stringify(snapshot('finished')), { status: 200 })
  }) as typeof fetch
  try {
    const settled = await watchJob('job-1', { isAlive: () => true, onSnapshot: () => {}, delay: nowait })
    assert.equal(settled?.status, 'finished')
    assert.equal(calls, 2, 'the failed poll should have been retried once')
  } finally {
    globalThis.fetch = original
  }
})

/**
 * Retrying forever would turn a host that really is gone into a spinner that
 * never reports. The limit is what keeps "the batch is over" answerable.
 */
test('a host that stays silent ends the watch after the miss limit', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response('{"error":"unknown-job"}', { status: 404 })
  }) as typeof fetch
  try {
    const settled = await watchJob('job-1', { isAlive: () => true, onSnapshot: () => {}, delay: nowait })
    assert.equal(settled, undefined)
    assert.equal(calls, WATCH_MISS_LIMIT)
  } finally {
    globalThis.fetch = original
  }
})

/**
 * A poll that succeeds resets the count: an install that stalls for a moment
 * every few seconds must not accumulate its way to a false verdict.
 */
test('a good poll in between resets the miss count', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    // Fail, succeed, fail, succeed, then finish: never two misses in a row.
    if (calls % 2 === 1 && calls < 5) return new Response('{"error":"unknown-job"}', { status: 404 })
    if (calls >= 6) return new Response(JSON.stringify(snapshot('finished')), { status: 200 })
    return new Response(JSON.stringify(snapshot('running')), { status: 200 })
  }) as typeof fetch
  try {
    const settled = await watchJob('job-1', { isAlive: () => true, onSnapshot: () => {}, delay: nowait })
    assert.equal(settled?.status, 'finished')
  } finally {
    globalThis.fetch = original
  }
})

/** An unmounted tab must stop asking, whatever the host is doing. */
test('an unmounted tab stops polling immediately', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify(snapshot('running')), { status: 200 })
  }) as typeof fetch
  try {
    const settled = await watchJob('job-1', { isAlive: () => false, onSnapshot: () => {}, delay: nowait })
    assert.equal(settled, undefined)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = original
  }
})
