import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  LOCK_FILE,
  describeWriterLock,
  explainLockTimeout,
  isWriterLockTimeout,
  pidIsAlive,
  readWriterLock,
} from '../src/host/lock.ts'

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
