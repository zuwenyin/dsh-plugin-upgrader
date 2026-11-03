import test from 'node:test'
import assert from 'node:assert/strict'

import { fingerprint, staleness, type Liveness } from '../src/client/components/JobPanel.ts'
import type { JobSnapshot } from '../src/client/types.ts'

/**
 * The regression these pin.
 *
 * The panel used to call a snapshot stale when *pnpm* had printed nothing new
 * for 20 seconds. But pnpm is quiet for a minute while it retries a registry,
 * and the panel said "status stopped updating — check for updates" on a batch
 * that was in fact running fine. The host already keeps a heartbeat that is
 * re-stamped on a timer, independently of pnpm's output; the panel now judges
 * liveness by that instead.
 */

/** A snapshot of a running step, with only the fields the panel looks at. */
function snapshot(over: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: 'job',
    status: 'running',
    total: 1,
    done: 0,
    failed: 0,
    current: 'pkg@1.0.0',
    stepStartedAt: 1_000,
    log: [],
    ...over,
  }
}

const THRESHOLD = 20 * 1000

test('a host that keeps heartbeating is not stale, even while pnpm is quiet', () => {
  // The panel's first look at a snapshot.
  const first = staleness({ stamp: fingerprint(snapshot()), at: 0 }, snapshot(), 1_000, THRESHOLD)
  assert.equal(first.stale, false, 'a fresh snapshot is never stale')

  /*
   * Twenty-five seconds later: pnpm printed nothing, but the host kept
   * re-stamping its heartbeat. That is a healthy install, not a stall.
   */
  const quiet = snapshot({ heartbeatAt: 25_000 })
  const second = staleness(first.liveness, quiet, 25_000, THRESHOLD)
  assert.equal(second.stale, false, 'a heartbeat means the host is still working')
  assert.notEqual(second.liveness.stamp, first.liveness.stamp, 'the heartbeat moves the fingerprint')
})

test('a host that stopped reporting is stale', () => {
  const seen = snapshot({ heartbeatAt: 25_000 })
  const first = staleness({ stamp: fingerprint(seen), at: 25_000 }, seen, 25_000, THRESHOLD)
  assert.equal(first.stale, false)

  // Nothing changes at all for half a minute: the host is gone or wedged.
  const later = staleness(first.liveness, seen, 55_000, THRESHOLD)
  assert.equal(later.stale, true, 'a snapshot that stopped moving is stale')
})

test('the heartbeat is part of the fingerprint', () => {
  const before = snapshot({ heartbeatAt: 1 })
  const after = snapshot({ heartbeatAt: 2 })
  assert.notEqual(fingerprint(before), fingerprint(after))
})

test('any real progress resets the clock', () => {
  const first = staleness({ stamp: fingerprint(snapshot()), at: 0 }, snapshot(), 1_000, THRESHOLD)
  // A step that finishes moves `done` and `status`.
  const done = snapshot({ done: 1, status: 'finished' })
  const second = staleness(first.liveness, done, 40_000, THRESHOLD)
  assert.equal(second.stale, false)
  assert.notEqual(second.liveness.stamp, first.liveness.stamp)
})

test('a snapshot without a heartbeat still counts as unchanged', () => {
  // The optimistic placeholder the tab shows before the first poll has no
  // heartbeat at all; it must not look like a heartbeat that is standing still.
  const noHeartbeat = snapshot()
  const liveness: Liveness = { stamp: fingerprint(noHeartbeat), at: 0 }
  const later = staleness(liveness, noHeartbeat, 60_000, THRESHOLD)
  assert.equal(later.stale, true)
})
