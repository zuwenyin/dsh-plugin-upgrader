import test from 'node:test'
import assert from 'node:assert/strict'

import { stalledMessage } from '../src/client/components/RestartDialog.ts'
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
