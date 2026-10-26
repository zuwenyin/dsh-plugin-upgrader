import test from 'node:test'
import assert from 'node:assert/strict'

import { nextPhase } from '../src/host/progress.ts'
import type { InstallLogChunk } from '../src/host/manager.ts'

/** A chunk carrying one line of pnpm output. */
function chunk(text: string): InstallLogChunk {
  return { jobId: 'job', argv: ['pnpm'], cwd: '.', stream: 'stdout', text }
}

test('the first line of output ends the preparing phase', () => {
  // This is the fix: without it the panel sits on `waiting` for the whole
  // install, and a two-minute lockfile check reads as a hang.
  assert.equal(nextPhase('waiting', chunk('Progress: resolved 1, reused 0')), 'installing')
  assert.equal(nextPhase(undefined, chunk('Verifying lockfile')), 'installing')
})

test('a blank chunk is a keep-alive, not evidence of work', () => {
  assert.equal(nextPhase('waiting', chunk('   \n  ')), 'waiting')
  assert.equal(nextPhase('waiting', chunk('')), 'waiting')
})

test('the manager keeps the specific phases it reported', () => {
  // pnpm's output cannot tell "writing the profile" from "downloading", so a
  // late chunk must not walk the phase back.
  assert.equal(nextPhase('applying', chunk('dependencies:')), 'applying')
  assert.equal(nextPhase('cancelling', chunk('dependencies:')), 'cancelling')
  assert.equal(nextPhase('installing', chunk('anything')), 'installing')
})
