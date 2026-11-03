import test from 'node:test'
import assert from 'node:assert/strict'

import { nextPhase } from '../src/host/progress.ts'
import type { InstallLogChunk } from '../src/host/manager.ts'

function chunk(text: string): InstallLogChunk {
  return { jobId: 'job', argv: ['pnpm'], cwd: '.', stream: 'stdout', text }
}

/** pnpm's own words, taken from a real run of `pnpm add` on a cold profile. */
const CHECK_STARTED = '? Verifying lockfile against supply-chain policies (91 entries)...'
const CHECK_PASSED = '✓ Lockfile passes supply-chain policies (91 entries in 2m 13.6s)'
const CHECK_CACHED = '✓ Lockfile passes supply-chain policies (previously verified)'
const CHECK_FAILED = '✗ Lockfile failed supply-chain policy check (91 entries in 2m 13.6s)'
const REGISTRY_RETRY =
  '[WARN] GET https://registry.npmmirror.com/@jimp%2fplugin-contain error (ETIMEDOUT). Will retry in 1 minute. 1 retries left.'
const INSTALL_PROGRESS = 'Progress: resolved 94, reused 3, downloaded 0, added 2'

test('the first line of output ends the preparing phase', () => {
  assert.equal(nextPhase('waiting', chunk('Progress: resolved 1, reused 0')), 'installing')
  assert.notEqual(nextPhase(undefined, chunk('Verifying lockfile')), 'waiting')
})

test('a lockfile check is named instead of looking like an idle prepare', () => {
  assert.equal(nextPhase('waiting', chunk(CHECK_STARTED)), 'verifying')
  assert.equal(nextPhase(undefined, chunk(CHECK_STARTED)), 'verifying')
})

test('a check that starts after the manager said installing is still named', () => {
  // The manager announces "installing" before pnpm is even started, so the
  // check happens *inside* the install. Latching the phase on "installing"
  // named a phase pnpm had already left, for as long as the check took — a
  // two-minute check was reported as "downloading and installing".
  assert.equal(nextPhase('installing', chunk(CHECK_STARTED)), 'verifying')
})

test('the check keeps its name until pnpm gives the verdict', () => {
  // The registry retries and the progress counters are printed *inside* the
  // check, so they do not end it; only pnpm's own verdict does.
  assert.equal(nextPhase('verifying', chunk(REGISTRY_RETRY)), 'verifying')
  assert.equal(nextPhase('verifying', chunk(INSTALL_PROGRESS)), 'verifying')
  assert.equal(nextPhase('verifying', chunk(CHECK_PASSED)), 'installing')
  assert.equal(nextPhase('verifying', chunk(CHECK_CACHED)), 'installing')
})

test('a failed check is not dressed up as an install', () => {
  // The failure belongs to the check, so the phase keeps pointing at it.
  assert.equal(nextPhase('verifying', chunk(CHECK_FAILED)), 'verifying')
  assert.equal(nextPhase('installing', chunk(CHECK_FAILED)), 'verifying')
})

test('real install work moves the phase on from verifying', () => {
  // pnpm prints the verdict before its progress lines, so the phase leaves
  // "verifying" at the verdict and the progress lines keep it there.
  assert.equal(nextPhase('verifying', chunk(CHECK_PASSED)), 'installing')
  assert.equal(nextPhase('installing', chunk(INSTALL_PROGRESS)), 'installing')
})

test('a blank chunk is a keep-alive, not evidence of work', () => {
  assert.equal(nextPhase('waiting', chunk('   \n  ')), 'waiting')
  assert.equal(nextPhase('waiting', chunk('')), 'waiting')
  assert.equal(nextPhase('verifying', chunk('  ')), 'verifying')
})

test('the manager keeps the specific phases it reported', () => {
  assert.equal(nextPhase('applying', chunk('dependencies:')), 'applying')
  assert.equal(nextPhase('cancelling', chunk('dependencies:')), 'cancelling')
  // "applying" and "cancelling" are the manager's last words: the change is
  // being written, or the batch is being stopped. Nothing pnpm prints after
  // that is more specific.
  assert.equal(nextPhase('applying', chunk(CHECK_STARTED)), 'applying')
  assert.equal(nextPhase('cancelling', chunk(CHECK_PASSED)), 'cancelling')
  assert.equal(nextPhase('installing', chunk('anything')), 'installing')
})
