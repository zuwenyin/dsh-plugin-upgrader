/**
 * Reading the profile's writer lock, and explaining a timeout on it.
 *
 * The harness serializes writers of `profile/package.json` through a `wx`-created
 * sibling, `package.json.lock`, that records the holder's pid. The manager takes
 * that lock with a two-minute budget; the shared `atomic-write` default for a
 * caller that states none is two seconds. Both have been observed as the last
 * thing an upgrade said before it failed, and the message names a file and a pid
 * nobody watching the tab can act on:
 *
 *   atomic-write: timed out waiting for the writer lock at …/package.json.lock
 *
 * Two things are worth doing with that. Before touching the manifest, look at
 * the lock: an entry cannot be dropped while somebody else is rewriting the file,
 * and finding that out first is the difference between a refusal and a profile
 * left without its dependency. And when the manager's own run does time out,
 * say what it means instead of relaying the internal sentence.
 *
 * `atomic-write` never takes over a lock whose recorded pid is its own
 * (`holderExited` returns false for `process.pid`), so a nested acquisition
 * cannot succeed by waiting: it always ends in exactly this timeout. That is the
 * most likely way a step ends up holding a lock it can never get.
 *
 * @module dsh-plugin-upgrader/lib/lock
 */
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The lock file's name, as `atomic-write` derives it.
 *
 * Spelled out rather than built from `manifest.ts`'s `MANIFEST_FILE` on purpose:
 * `manifest.ts` imports this module, and a top-level `${MANIFEST_FILE}.lock` here
 * would be evaluated before that constant exists. `test/lock.test.ts` pins the
 * two together, so the spelling cannot drift unnoticed.
 */
export const LOCK_FILE = 'package.json.lock'

/**
 * How long a manifest edit waits for the writer lock before giving up.
 *
 * Short on purpose. Nobody is ever waiting for a *competing* read-modify-write
 * to finish so much as checking that none is in flight: the caller has a correct
 * answer when this returns `undefined` (fall back to the manager's own
 * remove-then-install, which takes the lock itself), so waiting longer than a
 * second would only make an upgrade look hung for a lock nobody is going to
 * hand over inside that budget anyway.
 */
export const LOCK_WAIT_MS = 1_000

/** First retry delay when the lock is contended; doubles up to `LOCK_RETRY_MAX_MS`. */
const LOCK_RETRY_INITIAL_MS = 10

/** Longest retry delay, matching `atomic-write`'s own backoff ceiling. */
const LOCK_RETRY_MAX_MS = 200

/** Why an edit could not start: the sentence callers put in a log line. */
export const LOCK_BUSY = 'the profile writer lock is held by another operation'

/**
 * Block the thread for a moment.
 *
 * `Atomics.wait` rather than a timer: the manifest helpers are synchronous, and
 * making them async to await `setTimeout` would ripple into every caller for no
 * benefit — the only thing this sleep guards is a retry against a lock that is
 * about to be released by another process.
 *
 * @param ms - how long to block.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Knobs for {@link withManifestLock}, all injectable so tests stay instant. */
export interface ManifestLockOptions {
  /** How long to keep retrying before giving up. */
  waitMs?: number
  /** How to pass time between retries. */
  sleep?: (ms: number) => void
  /** Liveness probe used to recognise a lock this very process holds. */
  alive?: LivenessProbe
}

/**
 * Run `body` while holding the profile's writer lock.
 *
 * The manifest edits in `manifest.ts` are read-modify-write cycles on a file the
 * harness also rewrites. Doing them outside `package.json.lock` means a
 * concurrent writer can read the manifest while an entry is temporarily dropped
 * and then persist its own stale snapshot on top of the restore — the entry is
 * gone, and because the restore had already cleared the journal there is nothing
 * left for the next start to repair. Holding the same lock the manager holds
 * closes that window: a competing operation either waits for us or keeps us out,
 * never interleaves.
 *
 * **The lock is never taken over, however stale it looks.** A record whose pid is
 * dead may still belong to a writer that is about to wake up, and the harness's
 * own `atomic-write` already grew takeover logic for exactly that case. What this
 * function must never do is delete a lock it did not create: returning `undefined`
 * leaves the caller on the manager's own remove-then-install path, which is slower
 * but always correct.
 *
 * A lock whose recorded pid is *this* process is the one shape that cannot be
 * waited out: `atomic-write` refuses to take over its own holder, so a nested
 * acquisition ends in a two-minute timeout rather than in the lock. It is also the
 * shape a manager install has while pnpm runs, so it is reported as busy at once
 * instead of being retried for a second.
 *
 * @param dir - the profile directory.
 * @param body - the edit to perform while the lock is held.
 * @param options - wait budget, sleep and liveness probe.
 * @returns whatever `body` returned, or `undefined` when the lock was not ours.
 */
export function withManifestLock<T>(
  dir: string,
  body: () => T,
  options: ManifestLockOptions = {},
): T | undefined {
  const lockPath = join(dir, LOCK_FILE)
  const deadline = Date.now() + (options.waitMs ?? LOCK_WAIT_MS)
  const sleep = options.sleep ?? sleepSync
  const alive = options.alive ?? pidIsAlive
  let delay = LOCK_RETRY_INITIAL_MS
  for (;;) {
    let fd: number
    try {
      fd = openSync(lockPath, 'wx', 0o600)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      // Any reason other than contention means this profile cannot be locked at
      // all (read-only mount, permissions). Editing it anyway is the one thing
      // that must not happen.
      if (code !== 'EEXIST') return undefined
      const holder = readWriterLock(dir, alive)
      if (holder?.pid === process.pid) return undefined
      const remaining = deadline - Date.now()
      if (remaining <= 0) return undefined
      sleep(Math.min(delay, remaining))
      delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS)
      continue
    }
    try {
      writeFileSync(fd, `${process.pid}\n`, 'utf8')
    } finally {
      closeSync(fd)
    }
    try {
      return body()
    } finally {
      try {
        rmSync(lockPath, { force: true })
      } catch {
        // A lock this process could not remove only blocks later writers, who
        // have their own fallback; failing the edit now would be worse.
      }
    }
  }
}

/** What the lock says about its holder. */
export interface WriterLock {
  /** The pid the holder recorded, when the record is readable. */
  pid?: number
  /** Whether a process with that pid is running right now. */
  alive: boolean
}

/** Whether a pid names a live process. Never throws. */
export type LivenessProbe = (pid: number) => boolean

/**
 * Whether a pid is running, by the same signal-probe `atomic-write` uses.
 *
 * @param pid - the process id to probe.
 * @returns true when the process exists and this account may signal it.
 */
export function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid > 2147483647) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists under another account: still a holder.
    return (error as { code?: unknown })?.code !== 'ESRCH'
  }
}

/**
 * Read the profile's writer lock.
 *
 * A lock whose pid cannot be read is reported as alive: the file exists, so
 * somebody created it, and treating an unreadable record as free would defeat
 * the lock it represents.
 *
 * @param dir - the profile directory.
 * @param alive - liveness probe, injectable for tests.
 * @returns the record, or `undefined` when nothing holds the lock.
 */
export function readWriterLock(
  dir: string,
  alive: LivenessProbe = pidIsAlive,
): WriterLock | undefined {
  let raw: string
  try {
    raw = readFileSync(join(dir, LOCK_FILE), 'utf8')
  } catch {
    return undefined
  }
  const match = /^(\d+)\s*$/u.exec(raw.trim())
  if (match === null) return { alive: true }
  const pid = Number(match[1])
  return { pid, alive: alive(pid) }
}

/**
 * Whether a failure message is the writer-lock timeout.
 *
 * Matched on the `atomic-write` prefix and the sentence rather than on the path:
 * the message is assembled by another package, and the path is the one part of
 * it that varies per profile.
 *
 * @param message - a failure message, or anything that might be one.
 * @returns whether this is the lock timeout.
 */
export function isWriterLockTimeout(message: unknown): boolean {
  return typeof message === 'string' && /atomic-write: timed out waiting for the writer lock/u.test(message)
}

/**
 * What the operator can do about a held lock, in both languages.
 *
 * Both travel together for the same reason `restartHint` does: the job log is one
 * stream shown to readers of either language, and the panel cannot translate a
 * sentence the host composed.
 *
 * @param lock - what the lock said, when it was read.
 * @returns one bilingual sentence.
 */
export function describeWriterLock(lock: WriterLock | undefined): string {
  if (lock !== undefined && lock.alive) {
    const zh = '另一个操作正在改写 profile 的 package.json（写入锁仍被占用）；等它结束再试'
    const en = 'another operation is rewriting the profile manifest and still holds its writer lock; retry once it finishes'
    return `${zh} / ${en}`
  }
  const zh = 'profile 写入锁没有被释放，可能是上一次升级被强制结束时留下的；重启 DSH 后会自行恢复'
  const en = 'the profile writer lock was never released, most likely left by an upgrade that was killed; restarting DSH clears it'
  return `${zh} / ${en}`
}

/**
 * Turn a writer-lock timeout into something the operator can act on.
 *
 * The original sentence is kept in brackets rather than dropped: it names the
 * file and comes from the package that raised it, so it is the string to search
 * for in a log or a bug report. What it cannot say is whose fault it is or what
 * to do, which is what the leading sentence is for.
 *
 * Any other message is returned untouched.
 *
 * @param message - the failure message.
 * @param dir - the profile directory, used to read the lock's current state.
 * @returns a message to show, or the original when this is not a lock timeout.
 */
export function explainLockTimeout(message: string, dir: string | undefined): string {
  if (!isWriterLockTimeout(message)) return message
  const lock = dir === undefined ? undefined : readWriterLock(dir)
  return `${describeWriterLock(lock)} [${message}]`
}
