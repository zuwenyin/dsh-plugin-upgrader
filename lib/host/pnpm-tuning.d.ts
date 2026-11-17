import { type ManifestLockOptions } from './lock.ts';
/** The file pnpm reads its settings from, relative to the profile directory. */
export declare const TUNING_FILE = "pnpm-workspace.yaml";
/**
 * Where the untouched original is kept.
 *
 * Written once, before the first edit, and never overwritten: the useful thing
 * to have afterwards is what the file looked like before this plugin touched
 * it, not what it looked like before the last batch.
 */
export declare const TUNING_BACKUP_FILE = "pnpm-workspace.yaml.upgrader-bak";
/** One setting this module knows how to add. */
export interface TuningSetting {
    /** The camelCase spelling pnpm accepts in a workspace manifest. */
    key: string;
    /** The value written, in milliseconds. */
    value: number;
    /**
     * Other spellings that mean the same setting.
     *
     * A hand-written file may use pnpm's kebab-case CLI spelling. Treating those
     * as already-set is what keeps this module from writing a second value for a
     * key the user already controlled.
     */
    aliases?: readonly string[];
}
/**
 * The settings added before a batch.
 *
 * `fetchRetries: 4` with a 500 ms floor and a 2.5 s ceiling keeps the total
 * wait for one dropped connection under ten seconds, where pnpm's defaults
 * (2 retries, 10 s → 60 s) take over two minutes. `fetchTimeout: 30000` is the
 * least aggressive value that still beat the defaults reproducibly; it also
 * feeds undici's connect/headers/body timeouts, which is why lowering it is
 * what makes a wedged connection give up.
 */
export declare const TUNING_SETTINGS: readonly TuningSetting[];
/**
 * Why a tuning pass did not write anything.
 *
 * `lock-busy` is the one worth naming separately: it means another operation was
 * writing the profile, so nothing was read or written and the batch simply runs
 * with whatever the file already says. The rest are failures worth logging.
 */
export type TuningSkipReason = 'lock-busy' | 'no-profile' | 'unreadable' | 'write-failed';
/** What one tuning pass did. */
export interface TuningResult {
    /** `written` added at least one key, `unchanged` found them all, `skipped` did nothing. */
    status: 'written' | 'unchanged' | 'skipped';
    /** The keys this pass appended, in file order. */
    added: readonly string[];
    /** Set only when `status` is `skipped`. */
    reason?: TuningSkipReason;
    /** Detail for the log line: the filesystem error, or the lock holder. */
    detail?: string;
    /** Whether a backup was created by this pass. */
    backup?: boolean;
}
/**
 * Collect the keys already present at the top level of a workspace manifest.
 *
 * Top level only: `minimumReleaseAgeExclude` is a list, and a nested key that
 * happens to be called `fetchTimeout` belongs to somebody else's section. Lines
 * inside a block scalar are skipped too, which is why indentation is the test
 * rather than "contains a colon".
 *
 * @param text - the file's contents.
 * @returns the lowercase keys found, for case-insensitive comparison.
 */
export declare function topLevelKeys(text: string): Set<string>;
/**
 * Pick the settings a given file still needs.
 *
 * @param text - the file's current contents.
 * @param settings - the settings to consider; defaults to {@link TUNING_SETTINGS}.
 * @returns the settings whose name is absent, in declaration order.
 */
export declare function missingSettings(text: string, settings?: readonly TuningSetting[]): TuningSetting[];
/**
 * Build the file's new contents by appending only what is missing.
 *
 * Everything that was already there is preserved byte for byte, including the
 * comment header, the quoting style of the exclude list, and a missing final
 * newline (which is supplied rather than duplicated).
 *
 * @param text - the file's current contents.
 * @param settings - the settings to append; usually the result of
 *   {@link missingSettings}.
 * @returns the new contents.
 */
export declare function appendSettings(text: string, settings: readonly TuningSetting[]): string;
/**
 * Add the tuning keys to a profile's workspace manifest.
 *
 * Runs inside the profile writer lock, because this file sits beside the
 * manifest and a write that raced pnpm's own edit would lose one side's change.
 * When the lock cannot be taken nothing is read or written — the batch runs with
 * the settings already on disk, which is exactly what the profile had before
 * this feature existed.
 *
 * @param dir - the profile directory, or `undefined` when the host did not say.
 * @param options - lock tuning, forwarded to {@link withManifestLock}.
 * @returns what happened, for the run log.
 */
export declare function applyTuning(dir: string | undefined, options?: ManifestLockOptions): TuningResult;
//# sourceMappingURL=pnpm-tuning.d.ts.map