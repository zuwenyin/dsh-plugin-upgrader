/** The lock file's name, as `atomic-write` derives it. */
export declare const LOCK_FILE = "package.json.lock";
/** What the lock says about its holder. */
export interface WriterLock {
    /** The pid the holder recorded, when the record is readable. */
    pid?: number;
    /** Whether a process with that pid is running right now. */
    alive: boolean;
}
/** Whether a pid names a live process. Never throws. */
export type LivenessProbe = (pid: number) => boolean;
/**
 * Whether a pid is running, by the same signal-probe `atomic-write` uses.
 *
 * @param pid - the process id to probe.
 * @returns true when the process exists and this account may signal it.
 */
export declare function pidIsAlive(pid: number): boolean;
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
export declare function readWriterLock(dir: string, alive?: LivenessProbe): WriterLock | undefined;
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
export declare function isWriterLockTimeout(message: unknown): boolean;
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
export declare function describeWriterLock(lock: WriterLock | undefined): string;
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
export declare function explainLockTimeout(message: string, dir: string | undefined): string;
//# sourceMappingURL=lock.d.ts.map