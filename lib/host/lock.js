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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_FILE } from './manifest.js';
/** The lock file's name, as `atomic-write` derives it. */
export const LOCK_FILE = `${MANIFEST_FILE}.lock`;
/**
 * Whether a pid is running, by the same signal-probe `atomic-write` uses.
 *
 * @param pid - the process id to probe.
 * @returns true when the process exists and this account may signal it.
 */
export function pidIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0 || pid > 2147483647)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        // EPERM means the process exists under another account: still a holder.
        return error?.code !== 'ESRCH';
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
export function readWriterLock(dir, alive = pidIsAlive) {
    let raw;
    try {
        raw = readFileSync(join(dir, LOCK_FILE), 'utf8');
    }
    catch {
        return undefined;
    }
    const match = /^(\d+)\s*$/u.exec(raw.trim());
    if (match === null)
        return { alive: true };
    const pid = Number(match[1]);
    return { pid, alive: alive(pid) };
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
export function isWriterLockTimeout(message) {
    return typeof message === 'string' && /atomic-write: timed out waiting for the writer lock/u.test(message);
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
export function describeWriterLock(lock) {
    if (lock !== undefined && lock.alive) {
        const zh = '另一个操作正在改写 profile 的 package.json（写入锁仍被占用）；等它结束再试';
        const en = 'another operation is rewriting the profile manifest and still holds its writer lock; retry once it finishes';
        return `${zh} / ${en}`;
    }
    const zh = 'profile 写入锁没有被释放，可能是上一次升级被强制结束时留下的；重启 DSH 后会自行恢复';
    const en = 'the profile writer lock was never released, most likely left by an upgrade that was killed; restarting DSH clears it';
    return `${zh} / ${en}`;
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
export function explainLockTimeout(message, dir) {
    if (!isWriterLockTimeout(message))
        return message;
    const lock = dir === undefined ? undefined : readWriterLock(dir);
    return `${describeWriterLock(lock)} [${message}]`;
}
//# sourceMappingURL=lock.js.map