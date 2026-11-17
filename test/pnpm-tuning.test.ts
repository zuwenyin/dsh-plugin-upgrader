import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LOCK_FILE } from '../src/host/lock.ts'
import {
  TUNING_BACKUP_FILE,
  TUNING_FILE,
  TUNING_SETTINGS,
  appendSettings,
  applyTuning,
  missingSettings,
  topLevelKeys,
} from '../src/host/pnpm-tuning.ts'

/** A throwaway profile directory. */
function profile(): string {
  return mkdtempSync(join(tmpdir(), 'upgrader-tuning-'))
}

/**
 * A workspace manifest shaped like the real one.
 *
 * The quoting style, the exclude list and the trailing newline are copied from
 * `D:\dsh-data\profiles\desktop\pnpm-workspace.yaml`: the interesting failure is
 * not "can this append a line" but "does it leave everything else byte for
 * byte".
 */
const REAL = [
  "packages:",
  "  - '.'",
  '',
  'nodeLinker: hoisted',
  'autoInstallPeers: false',
  '',
  'allowBuilds:',
  '  protobufjs: true',
  "  'dsh-xdpool@2.6.4': true",
  '',
  'minimumReleaseAgeExclude:',
  "  - '@linxin666/dsh-pet@0.4.11 || 0.4.14 || 0.4.19'",
  '  - dsh-context@0.78.2 || 0.79.0 || 0.83.1',
  '',
].join('\n')

test('the tuning values are the ones the benchmark chose', () => {
  // Pinned rather than described: these four numbers are the whole fix, and a
  // "tidier" value (a longer timeout, a rounder backoff) silently returns the
  // install to its two-minute wait.
  assert.deepEqual(
    TUNING_SETTINGS.map((setting) => [setting.key, setting.value]),
    [
      ['fetchRetries', 4],
      ['fetchRetryMintimeout', 500],
      ['fetchRetryMaxtimeout', 2500],
      ['fetchTimeout', 30000],
    ],
  )
})

test('the top-level keys are read, and nested ones are not', () => {
  const keys = topLevelKeys(REAL)
  assert.equal(keys.has('packages'), true)
  assert.equal(keys.has('nodelinker'), true)
  // `protobufjs` is indented, so it belongs to allowBuilds rather than to the
  // file. Treating it as a top-level key would make an unrelated section name
  // able to suppress one of our settings.
  assert.equal(keys.has('protobufjs'), false)
})

test('a missing setting is noticed, and a present one is not', () => {
  const missing = missingSettings(REAL)
  assert.deepEqual(missing.map((setting) => setting.key), [
    'fetchRetries',
    'fetchRetryMintimeout',
    'fetchRetryMaxtimeout',
    'fetchTimeout',
  ])
  assert.deepEqual(missingSettings(appendSettings(REAL, missing)), [])
})

test('a hand-written kebab-case spelling counts as already set', () => {
  // pnpm's CLI flag and `pnpm config` key keep npm's spelling. A user who wrote
  // `fetch-retries: 0` in this file has already made the decision; appending
  // `fetchRetries: 4` as well would leave two values for one setting.
  const text = `${REAL}fetch-retries: 0\n`
  const missing = missingSettings(text).map((setting) => setting.key)
  assert.equal(missing.includes('fetchRetries'), false)
  assert.equal(missing.includes('fetchTimeout'), true)
})

test('appending keeps every existing byte and adds one line per setting', () => {
  const next = appendSettings(REAL, missingSettings(REAL))
  assert.equal(next.startsWith(REAL), true, 'the original must survive untouched')
  assert.match(next, /\nfetchRetries: 4\n/u)
  assert.match(next, /fetchTimeout: 30000\n$/u)
  assert.equal(next.endsWith('\n'), true)
})

test('a file without a trailing newline still gets a well-formed line', () => {
  const next = appendSettings('packages:\n  - .', missingSettings('packages:\n  - .'))
  // The last existing line gains the newline it lacked; the settings follow the
  // comment block, and none of them is glued onto `- .`.
  assert.match(next, /- \.\n\n# Added by/u)
  assert.match(next, /\nfetchRetries: 4\n/u)
})

test('an empty file is created from nothing, without a leading blank line', () => {
  const next = appendSettings('', TUNING_SETTINGS)
  assert.equal(next.startsWith('# Added by'), true)
  assert.equal(next.endsWith('\n'), true)
})

test('reasoning about the lock: a held lock writes nothing at all', () => {
  const dir = profile()
  try {
    writeFileSync(join(dir, TUNING_FILE), REAL, 'utf8')
    const heldByAnotherProcess = '4242\n'
    writeFileSync(join(dir, LOCK_FILE), heldByAnotherProcess, 'utf8')
    const result = applyTuning(dir, { waitMs: 0 })
    assert.equal(result.status, 'skipped')
    assert.equal(result.reason, 'lock-busy')
    // The one thing that must not happen: a write outside the lock.
    assert.equal(readFileSync(join(dir, TUNING_FILE), 'utf8'), REAL)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a profile path nobody supplied is not guessed at', () => {
  assert.deepEqual(applyTuning(undefined), { status: 'skipped', added: [], reason: 'no-profile' })
})

test('the first pass writes, backs the original up, and the second is a no-op', () => {
  const dir = profile()
  try {
    writeFileSync(join(dir, TUNING_FILE), REAL, 'utf8')
    const first = applyTuning(dir)
    assert.equal(first.status, 'written')
    assert.deepEqual(first.added, ['fetchRetries', 'fetchRetryMintimeout', 'fetchRetryMaxtimeout', 'fetchTimeout'])
    assert.equal(first.backup, true)
    assert.equal(readFileSync(join(dir, TUNING_BACKUP_FILE), 'utf8'), REAL)

    const written = readFileSync(join(dir, TUNING_FILE), 'utf8')
    assert.equal(written.startsWith(REAL), true)

    const second = applyTuning(dir)
    assert.equal(second.status, 'unchanged')
    assert.deepEqual(second.added, [])
    // Idempotence matters: a batch that added a second copy every time would
    // grow the file until pnpm complained about a duplicate key.
    assert.equal(readFileSync(join(dir, TUNING_FILE), 'utf8'), written)
    // The backup stays the pre-tuning file, not the tuned one.
    assert.equal(readFileSync(join(dir, TUNING_BACKUP_FILE), 'utf8'), REAL)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a profile with a workspace manifest of its own gets one written', () => {
  const dir = profile()
  try {
    const result = applyTuning(dir)
    assert.equal(result.status, 'written')
    // Nothing to back up, and no empty backup file left behind.
    assert.equal(result.backup, false)
    assert.match(readFileSync(join(dir, TUNING_FILE), 'utf8'), /fetchTimeout: 30000/u)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a path that cannot be written is reported, not thrown at the batch', () => {
  const parent = profile()
  try {
    /*
     * A directory named `pnpm-workspace.yaml`: `readFileSync` raises EISDIR, so
     * the read path — not the lock and not the rename — is what fails. A batch
     * must run with the settings it found rather than dying inside its own
     * optimisation.
     */
    const dir = join(parent, 'profile')
    mkdirSync(join(dir, TUNING_FILE), { recursive: true })
    const result = applyTuning(dir)
    assert.equal(result.status, 'skipped')
    assert.equal(result.reason, 'unreadable')
    assert.equal(typeof result.detail, 'string')
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('a missing profile directory is not a crash', () => {
  const parent = profile()
  try {
    const result = applyTuning(join(parent, 'never-created'))
    assert.equal(result.status, 'skipped')
    // No lock can be taken in a directory that is not there, which is reported as
    // the lock being unavailable rather than as a write failure.
    assert.equal(result.reason, 'lock-busy')
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
