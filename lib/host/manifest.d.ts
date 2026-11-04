import type { ManifestLockOptions } from './lock.ts';
/** Where a profile keeps its manifest. */
export declare const MANIFEST_FILE = "package.json";
/**
 * Where pending drops are recorded, next to the manifest they belong to.
 *
 * The drop has to survive a crash to be undoable. Writing the intent to disk
 * before the entry disappears means the next process to load this plugin can
 * put the entry back, instead of inheriting a profile that declares a package
 * it no longer lists — which is how a failed upgrade lost a theme: pnpm spent
 * two minutes verifying a lockfile, the app was restarted, and the dependency
 * entry was never written back.
 *
 * The file holds one record **per package**. One record for the whole profile is
 * what made a batch lose a plugin: a step that failed could not restore its
 * entry, the next step's drop overwrote the only record, and that step's success
 * then cleared it. The record the first step depended on was gone, and the next
 * load found nothing to repair.
 */
export declare const JOURNAL_FILE = "package.json.upgrader-journal.json";
/** What a drop records, so a later process can undo it. */
export interface DropJournal {
    /** The package whose entry was removed. */
    name: string;
    /** The range the entry carried, so it goes back byte for byte. */
    spec: string;
    /** When the drop happened; only ever used for diagnostics. */
    at: number;
}
/**
 * Resolve the profile directory the running host is managing.
 *
 * The harness exports this to every process it starts, so the value names the
 * same profile the manager is working on rather than a guess from the disk.
 *
 * The desktop host is an exception: it spawns the plugin host with
 * `cwd: this.projectDir` (the profile directory) and no `DSH_PROFILE*`
 * variables in the child environment, so the env-only lookups both miss. In
 * that case fall back to the working directory — but only when it really
 * looks like a profile (its `package.json` parses and carries a `dsh.profile`
 * object), so a random cwd can never be mistaken for one.
 *
 * @param env - the process environment.
 * @param cwd - the working directory to fall back to (overridable in tests).
 * @returns the absolute profile directory, or `undefined` when unknown.
 */
export declare function profileDirFrom(env?: NodeJS.ProcessEnv, cwd?: string): string | undefined;
/** What happened when the entry was dropped. */
export type DropResult = {
    kind: 'dropped';
    dependency: string;
} | {
    kind: 'absent';
} | {
    kind: 'unavailable';
    reason: string;
};
/**
 * Forget every pending drop.
 *
 * Kept because the journal is a whole file and a caller may legitimately want it
 * gone (tests, and a profile being reset). Nothing in the upgrade path uses it:
 * there, records are settled one package at a time.
 *
 * @param dir - the profile directory.
 */
export declare function clearJournal(dir: string): void;
/**
 * Read the pending drop, when one is recorded.
 *
 * Without a name this reports the first record, which is enough for diagnostics
 * and for the single-record cases; with a name it reports that package's record.
 * The upgrade path never decides anything from this — it works from
 * {@link readRecords} inside the lock — so this is not where a stale record can
 * be acted on.
 *
 * @param dir - the profile directory.
 * @param name - the package to read, or omitted for the first record.
 * @returns the record, or `undefined` when there is none to read.
 */
export declare function readJournal(dir: string, name?: string): DropJournal | undefined;
/** What a recovery pass did, for the caller to report. */
export type RecoveryResult = {
    kind: 'none';
} | {
    kind: 'restored';
    name: string;
    spec: string;
} | {
    kind: 'settled';
    name: string;
} | {
    kind: 'failed';
    name: string;
    reason: string;
};
/**
 * Undo every drop whose install never finished.
 *
 * This is the crash repair. A drop writes its intent to the journal before the
 * entry leaves the manifest, so whichever process loads the plugin next can see
 * that an entry is missing and put it back. For each record two outcomes are
 * possible:
 *
 *   - the entry is still absent, so pnpm never wrote the new version: restore it;
 *   - the entry is present, so the install landed and simply outlived the drop
 *     record: forget the record and leave the manifest alone.
 *
 * Every record is repaired, not just one: a batch whose first step failed leaves
 * its record behind while the later steps run, and the profile is only whole
 * again once all of them have been settled.
 *
 * Doing this at load time rather than at next upgrade matters: a profile with a
 * package on disk and no dependency entry is invisible to the manager, so the
 * plugin cannot be upgraded, removed or seen again until somebody edits JSON by
 * hand.
 *
 * @param dir - the profile directory.
 * @param options - lock budget; tests pass a zero wait.
 * @returns one result per record, in the order the records were written.
 */
export declare function recoverPendingDrops(dir: string, options?: ManifestLockOptions): RecoveryResult[];
/**
 * Undo one drop, reported as a single result.
 *
 * Kept for callers that only care about the common single-record case.
 *
 * @param dir - the profile directory.
 * @param options - lock budget; tests pass a zero wait.
 * @returns the first record's outcome, or `none` when there was nothing to do.
 */
export declare function recoverPendingDrop(dir: string, options?: ManifestLockOptions): RecoveryResult;
/**
 * Forget the pending drop once the entry is visibly back.
 *
 * Called after an install reported success. pnpm is what writes the new version
 * into the manifest, so a success that left no entry means the write did not
 * happen after all — and then the record is the only thing that can repair the
 * profile, so it stays until it can actually be settled.
 *
 * @param dir - the profile directory.
 * @param name - the package whose entry should be present.
 * @returns whether the entry was there, and the record therefore cleared.
 */
export declare function confirmDependency(dir: string, name: string, options?: ManifestLockOptions): boolean;
/**
 * Remove one dependency entry, leaving everything else untouched.
 *
 * @param dir - the profile directory.
 * @param name - the package name to drop.
 * @returns what happened; `absent` means the guard cannot fire anyway.
 */
export declare function dropDependency(dir: string, name: string, options?: ManifestLockOptions): DropResult;
/**
 * Put a dropped entry back, for when the install did not reach pnpm.
 *
 * Without this a failed step would leave the profile with a package still on
 * disk, no dependency entry, and no way for the manager to see it — strictly
 * worse than the problem this module exists to avoid.
 *
 * @param dir - the profile directory.
 * @param name - the package name to restore.
 * @param spec - the dependency range to write back.
 * @returns whether the entry was restored.
 */
export declare function restoreDependency(dir: string, name: string, spec: string, options?: ManifestLockOptions): boolean;
//# sourceMappingURL=manifest.d.ts.map