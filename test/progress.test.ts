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
  assert.notEqual(nextPhase(undefined, chunk('Verifying lockfile')), 'waiting')
})

test('a lockfile check is named instead of looking like an idle prepare', () => {
  // The verification is the longest phase on a cold profile and prints one line
  // and then nothing, so it has to be distinguishable from "about to start".
  assert.equal(
    nextPhase('waiting', chunk('? Verifying lockfile against supply-chain policies (95 entries)...')),
    'verifying',
  )
  assert.equal(nextPhase(undefined, chunk('✓ Lockfile passes supply-chain policies (95 entries in 2m)')), 'verifying')
})

test('real install work moves the phase on from verifying', () => {
  assert.equal(nextPhase('verifying', chunk('Progress: resolved 96, reused 96, downloaded 0, added 39')), 'installing')
  // A later verification line cannot walk back a phase that is already further
  // along in the same run.
  assert.equal(nextPhase('installing', chunk('Verifying lockfile against supply-chain policies')), 'installing')
})

test('a blank chunk is a keep-alive, not evidence of work', () => {
  assert.equal(nextPhase('waiting', chunk('   \n  ')), 'waiting')
  assert.equal(nextPhase('waiting', chunk('')), 'waiting')
  assert.equal(nextPhase('verifying', chunk('  ')), 'verifying')
})

test('the manager keeps the specific phases it reported', () => {
  // pnpm's output cannot tell "writing the profile" from "downloading", so a
  // late chunk must not walk the phase back.
  assert.equal(nextPhase('applying', chunk('dependencies:')), 'applying')
  assert.equal(nextPhase('cancelling', chunk('dependencies:')), 'cancelling')
  assert.equal(nextPhase('installing', chunk('anything')), 'installing')
})
