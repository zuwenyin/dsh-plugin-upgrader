/**
 * The lock file's name, as `atomic-write` derives it.
 *
 * Spelled out rather than built from `manifest.ts`'s `MANIFEST_FILE` on purpose:
 * `manifest.ts` imports this module, and a top-level `${MANIFEST_FILE}.lock` here
 * would be evaluated before that constant exists. `test/lock.test.ts` pins the
 * two together, so the spelling cannot drift unnoticed.
 */
export declare const LOCK_FILE = "package.json.lock";
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
export declare const LOCK_WAIT_MS = 1000;
/** Why an edit could not start: the sentence callers put in a log line. */
export declare const LOCK_BUSY = "the profile writer lock is held by another operation";
/** Knobs for {@link withManifestLock}, all injectable so tests stay instant. */
export interface ManifestLockOptions {
    /** How long to keep retrying before giving up. */
    waitMs?: number;
    /** How to pass time between retries. */
    sleep?: (ms: number) => void;
    /** Liveness probe used to recognise a lock this very process holds. */
    alive?: LivenessProbe;
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
export declare function withManifestLock<T>(dir: string, body: () => T, options?: ManifestLockOptions): T | undefined;
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