import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  LOCK_BUSY,
  LOCK_FILE,
  describeWriterLock,
  explainLockTimeout,
  isWriterLockTimeout,
  pidIsAlive,
  readWriterLock,
  withManifestLock,
} from '../src/host/lock.ts'
import { MANIFEST_FILE } from '../src/host/manifest.ts'

/** The message `atomic-write` raises, with a path of its own. */
const TIMEOUT =
  'atomic-write: timed out waiting for the writer lock at D:\\dsh-data\\profiles\\desktop\\package.json.lock'

/** A throwaway profile directory. */
function profile(): string {
  return mkdtempSync(join(tmpdir(), 'upgrader-lock-'))
}

/** Write a lock whose record is `content`. */
function holdLock(dir: string, content: string): void {
  writeFileSync(join(dir, LOCK_FILE), content, 'utf8')
}

/** A sleep that records how often it was asked to wait, and how long. */
function recordedSleep(): { sleep: (ms: number) => void; calls: number[] } {
  const calls: number[] = []
  return { sleep: (ms: number) => void calls.push(ms), calls }
}

test('an absent lock is not a lock', () => {
  const dir = profile()
  try {
    assert.equal(readWriterLock(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a lock names the pid that holds it, and whether it is alive', () => {
  const dir = profile()
  try {
    holdLock(dir, '4242\n')
    assert.deepEqual(readWriterLock(dir, () => true), { pid: 4242, alive: true })
    // The probe decides liveness, so a dead holder is reported as dead rather
    // than as no lock at all: the file is still there and still blocks writers.
    assert.deepEqual(readWriterLock(dir, () => false), { pid: 4242, alive: false })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a lock nobody can read still counts as held', () => {
  const dir = profile()
  try {
    // atomic-write writes the bare pid, but a torn or foreign file must not be
    // mistaken for a free lock — that would defeat the lock it represents.
    holdLock(dir, '')
    assert.deepEqual(readWriterLock(dir, () => false), { alive: true })
    holdLock(dir, 'not a pid')
    assert.deepEqual(readWriterLock(dir, () => false), { alive: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the liveness probe answers for this process and for nonsense', () => {
  assert.equal(pidIsAlive(process.pid), true)
  assert.equal(pidIsAlive(0), false)
  assert.equal(pidIsAlive(-1), false)
  assert.equal(pidIsAlive(2 ** 31), false)
  assert.equal(pidIsAlive(1.5), false)
})

test('the timeout is recognised by its sentence, not by a path', () => {
  assert.equal(isWriterLockTimeout(TIMEOUT), true)
  assert.equal(
    isWriterLockTimeout('atomic-write: timed out waiting for the writer lock at /home/x/profile/package.json.lock'),
    true,
  )
  assert.equal(isWriterLockTimeout('EACCES: permission denied'), false)
  assert.equal(isWriterLockTimeout(undefined), false)
  assert.equal(isWriterLockTimeout(''), false)
})

test('a live holder is described as another operation, a dead one as a leftover', () => {
  const live = describeWriterLock({ pid: 1, alive: true })
  assert.match(live, /另一个操作正在改写/u)
  assert.match(live, /another operation is rewriting/u)

  const stale = describeWriterLock({ pid: 1, alive: false })
  assert.match(stale, /写入锁没有被释放/u)
  assert.match(stale, /restarting DSH clears it/u)

  // No record at all reads the same as a dead holder: nothing is running that
  // could still be using it.
  assert.match(describeWriterLock(undefined), /写入锁没有被释放/u)
})

test('the timeout is explained, and every other message is left alone', () => {
  const dir = profile()
  try {
    // This process is the one holder guaranteed to be alive, so the "another
    // operation" wording is exercised against the real probe rather than a stub.
    holdLock(dir, `${process.pid}\n`)
    const explained = explainLockTimeout(TIMEOUT, dir)
    assert.match(explained, /另一个操作正在改写/u)
    // The original sentence stays: it names the file and is the string to grep
    // for in a log or a report.
    assert.ok(explained.includes(TIMEOUT), 'the original diagnostic is kept')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(explainLockTimeout('pnpm exited with 1', undefined), 'pnpm exited with 1')
  assert.equal(explainLockTimeout('pnpm exited with 1', 'C:\\nowhere'), 'pnpm exited with 1')
})

test('a lock left by a dead process is explained as a leftover', () => {
  const dir = profile()
  try {
    // 4242 was never started by this machine; even if it was, it is not running
    // now, which is exactly the state a killed upgrade leaves behind.
    holdLock(dir, '4242\n')
    const explained = explainLockTimeout(TIMEOUT, dir)
    assert.match(explained, /写入锁没有被释放/u)
    assert.ok(explained.includes(TIMEOUT))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown profile still explains the timeout', () => {
  // The profile directory is unavailable when neither DSH_PROFILE_DIR nor
  // DSH_HOME/DSH_PROFILE is set; the sentence must still be actionable.
  const explained = explainLockTimeout(TIMEOUT, undefined)
  assert.match(explained, /写入锁没有被释放/u)
  assert.ok(explained.includes(TIMEOUT))
})

test('the lock name is the one atomic-write derives from the manifest', () => {
  // Spelled out in lock.ts to avoid an import cycle, so pin it here: if either
  // file is renamed the lock would silently stop excluding the real writers.
  assert.equal(LOCK_FILE, `${MANIFEST_FILE}.lock`)
})

test('an unlocked profile runs the body and leaves no lock behind', () => {
  const dir = profile()
  try {
    const result = withManifestLock(dir, () => 'done')
    assert.equal(result, 'done')
    assert.equal(existsSync(join(dir, LOCK_FILE)), false, 'the lock is released')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the lock names this process while the body runs', () => {
  const dir = profile()
  try {
    const seen = withManifestLock(dir, () => readFileSync(join(dir, LOCK_FILE), 'utf8'))
    assert.equal(seen, `${process.pid}\n`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a lock this very process holds is reported busy without waiting', () => {
  const dir = profile()
  try {
    // The shape that cannot be waited out: atomic-write refuses to take over its
    // own holder, so retrying would burn the whole budget and still fail.
    holdLock(dir, `${process.pid}\n`)
    const { sleep, calls } = recordedSleep()
    assert.equal(withManifestLock(dir, () => 'ran', { sleep, waitMs: 5_000 }), undefined)
    assert.equal(calls.length, 0, 'a self-held lock is not retried')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a foreign lock is retried and given up on at the deadline', () => {
  const dir = profile()
  try {
    // A pid that is not running: still a held lock, because the file exists.
    holdLock(dir, '4242\n')
    const { sleep, calls } = recordedSleep()
    const result = withManifestLock(dir, () => 'ran', { sleep, waitMs: 0, alive: () => false })
    assert.equal(result, undefined)
    assert.equal(calls.length, 0, 'no point sleeping past a deadline that already passed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a foreign lock that clears up is taken, and the body is not run twice', () => {
  const dir = profile()
  try {
    holdLock(dir, '4242\n')
    const { calls } = recordedSleep()
    let ran = 0
    const result = withManifestLock(
      dir,
      () => {
        ran += 1
        return 'ran'
      },
      {
        alive: () => false,
        waitMs: 5_000,
        // Release the lock on the second wait, as another process finishing up
        // would; before that the first wait must not have touched the body.
        sleep: (ms) => {
          calls.push(ms)
          if (calls.length === 2) rmSync(join(dir, LOCK_FILE), { force: true })
        },
      },
    )
    assert.equal(result, 'ran')
    assert.equal(ran, 1)
    assert.equal(calls.length, 2, 'two waits: the second one freed the lock')
    assert.deepEqual(
      calls,
      [10, 20],
      'the delay doubles between attempts instead of hammering the file',
    )
    assert.equal(existsSync(join(dir, LOCK_FILE)), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a body that throws still releases the lock', () => {
  const dir = profile()
  try {
    assert.throws(() => withManifestLock(dir, () => {
      throw new Error('boom')
    }), /boom/u)
    assert.equal(existsSync(join(dir, LOCK_FILE)), false, 'the lock is released on throw')
    // And the profile is usable again, which is the point of releasing it.
    assert.equal(withManifestLock(dir, () => 'after'), 'after')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the busy sentence names the lock rather than the caller', () => {
  assert.match(LOCK_BUSY, /writer lock/u)
})
