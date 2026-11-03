import test from 'node:test'
import assert from 'node:assert/strict'

import { probeVerdict, stalledMessage } from '../src/client/components/RestartDialog.ts'
import type { T } from '../src/client/types.ts'

/**
 * A translator that only knows the two keys this rule can reach, so a typo in
 * the key name fails here instead of rendering the key in the dialog.
 */
const t: T = ((key: string): string => {
  if (key === 'restartStillOld') return 'the old process is still answering'
  throw new Error(`unexpected key: ${key}`)
}) as T

/**
 * `stalled` is where two different dead ends meet, and they are not the same
 * advice. Reporting "the host has not been replaced yet" to someone whose host
 * *did* restart sends them to look for a process that no longer exists — and
 * the dialog gives no other hint, so the wrong sentence is the whole message.
 */
test('a stalled wait with no separate problem blames the process that never left', () => {
  assert.equal(stalledMessage('', t), 'the old process is still answering')
})

test('a stalled wait with a reason keeps the reason', () => {
  const blocked = 'the host restarted but this page cannot reload'
  assert.equal(stalledMessage(blocked, t), blocked)
})

test('a blank reason is not mistaken for a reason', () => {
  // `problem` starts as '' and is cleared on every new wait; a whitespace-only
  // value would otherwise render as a blank line under the dialog.
  assert.equal(stalledMessage('   ', t), 'the old process is still answering')
})

const LIMIT = 120_000

test('a new pid is a restart, no matter how long it took', () => {
  // Quitting and reopening DSH takes as long as the person takes. Throwing the
  // restart away because it landed past the deadline would leave the dialog in
  // a dead end even though the thing it was waiting for had just happened.
  assert.equal(probeVerdict(4242, 5151, LIMIT * 10, true, LIMIT), 'restarted')
})

test('an unchanged pid past the deadline stops claiming to wait', () => {
  assert.equal(probeVerdict(4242, 4242, LIMIT + 1, true, LIMIT), 'give-up')
})

test('an unchanged pid before the deadline keeps waiting', () => {
  assert.equal(probeVerdict(4242, 4242, 5_000, true, LIMIT), 'keep-waiting')
})

test('a host that cannot be read is not a restart', () => {
  // `readHostInfo` reports `undefined` while the process is gone; treating that
  // as a new pid would reload the page onto a dead host.
  assert.equal(probeVerdict(4242, undefined, 5_000, true, LIMIT), 'keep-waiting')
})

test('a wait that may not report a deadline never gives up', () => {
  // The second start (after the message is already showing) exists to check on
  // demand; announcing the same deadline twice would replace the hint with
  // itself and never let the reopened host be noticed.
  assert.equal(probeVerdict(4242, 4242, LIMIT * 5, false, LIMIT), 'keep-waiting')
})
