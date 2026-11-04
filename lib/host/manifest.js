/**
 * Dropping a dependency entry so a replacement can be installed in one step.
 *
 * The manager's `installBundle` refuses any spec whose package NAME is already
 * in the profile's `dependencies`, with `already-installed`. That check reads
 * `profile/package.json`, not the disk, so it fires even when the point of the
 * call is to replace that very version. The documented workaround is
 * remove-then-install, which deselects the bundle first: the plugin leaves the
 * page for as long as pnpm takes, and a failure in between strands it.
 *
 * Removing just the manifest entry is enough to get past the check. pnpm `add`
 * happily overwrites an existing dependency, and the manager's own bookkeeping
 * still finds the package:
 *
 *   const after = readProfileManifest(...).dependencies
 *   const installed = Object.keys(after).filter((name) => before[name] !== after[name])
 *   if (installed.length === 0) { ...specPackageName(spec, after, ...) }
 *
 * The entry comes back the moment pnpm writes the new version, so the bundle is
 * never deselected and never stops loading.
 *
 * @module dsh-plugin-upgrader/lib/manifest
 */
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LOCK_BUSY, withManifestLock } from './lock.js';
/** Where a profile keeps its manifest. */
export const MANIFEST_FILE = 'package.json';
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
export const JOURNAL_FILE = 'package.json.upgrader-journal.json';
/** The version this module writes. */
const JOURNAL_VERSION = 2;
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
export function profileDirFrom(env = process.env, cwd = process.cwd()) {
    const explicit = env.DSH_PROFILE_DIR;
    if (typeof explicit === 'string' && explicit.trim() !== '')
        return explicit.trim();
    const home = env.DSH_HOME;
    const name = env.DSH_PROFILE;
    if (typeof home === 'string' && home.trim() !== '' && typeof name === 'string' && name.trim() !== '') {
        return join(home.trim(), 'profiles', name.trim());
    }
    return profileDirFromCwd(cwd);
}
/**
 * Recognise a profile directory by its manifest alone.
 *
 * @param cwd - the candidate directory.
 * @returns the directory when its `package.json` carries a `dsh.profile` object.
 */
function profileDirFromCwd(cwd) {
    try {
        const parsed = JSON.parse(readFileSync(join(cwd, MANIFEST_FILE), 'utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return undefined;
        const dsh = parsed['dsh'];
        if (dsh === null || typeof dsh !== 'object' || Array.isArray(dsh))
            return undefined;
        if (typeof dsh['profile'] !== 'object')
            return undefined;
        return cwd;
    }
    catch {
        return undefined;
    }
}
/**
 * Read a profile manifest, or explain why it could not be read.
 *
 * @param dir - the profile directory.
 * @returns the parsed manifest, or an error string.
 */
function readManifest(dir) {
    try {
        const raw = readFileSync(join(dir, MANIFEST_FILE), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { error: 'manifest is not a JSON object' };
        }
        return { manifest: parsed };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Persist a manifest the way the harness does: 2-space JSON, trailing newline.
 *
 * Written to a sibling temp file and renamed so a crash mid-write cannot leave
 * the profile with a truncated manifest — the one file whose corruption would
 * break every plugin, not just this one.
 *
 * @param dir - the profile directory.
 * @param manifest - the value to persist.
 */
function writeManifest(dir, manifest) {
    const target = join(dir, MANIFEST_FILE);
    const temporary = `${target}.upgrader-tmp`;
    writeFileSync(temporary, `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8');
    renameSync(temporary, target);
}
/**
 * Read every pending drop from the journal.
 *
 * Two shapes are accepted. The current one is an envelope with a `records`
 * array; the older one was a single bare record, which a profile upgraded from
 * an earlier version may still carry. Reading the old shape as a one-record set
 * means an interrupted upgrade from before this change is still repaired.
 *
 * @param dir - the profile directory.
 * @returns the records, newest last; empty when there is nothing to read.
 */
function readRecords(dir) {
    let raw;
    try {
        raw = readFileSync(join(dir, JOURNAL_FILE), 'utf8');
    }
    catch {
        return [];
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return [];
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return [];
    const envelope = parsed;
    const candidates = Array.isArray(envelope.records) ? envelope.records : [parsed];
    const records = [];
    for (const candidate of candidates) {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate))
            continue;
        const record = candidate;
        if (typeof record.name !== 'string' || record.name === '')
            continue;
        if (typeof record.spec !== 'string')
            continue;
        records.push({ name: record.name, spec: record.spec, at: typeof record.at === 'number' ? record.at : 0 });
    }
    return records;
}
/**
 * Persist the whole record set, or the empty state.
 *
 * Written with the same temp-then-rename dance as the manifest: a half-written
 * journal would be worse than none, because recovery trusts it.
 *
 * @param dir - the profile directory.
 * @param records - the records to keep; an empty set removes the file.
 * @returns whether the write reached the disk.
 */
function writeRecords(dir, records) {
    const target = join(dir, JOURNAL_FILE);
    if (records.length === 0) {
        try {
            rmSync(target, { force: true });
            return true;
        }
        catch {
            return false;
        }
    }
    const temporary = `${target}.upgrader-tmp`;
    const envelope = { version: JOURNAL_VERSION, records };
    try {
        writeFileSync(temporary, `${JSON.stringify(envelope, undefined, 2)}\n`, 'utf8');
        renameSync(temporary, target);
        return true;
    }
    catch {
        try {
            rmSync(temporary, { force: true });
        }
        catch {
            // Nothing left to clean up: the failure is already being reported.
        }
        return false;
    }
}
/**
 * Add or replace one package's record, leaving every other record alone.
 *
 * @param dir - the profile directory.
 * @param journal - the record to store.
 * @returns whether the record reached the disk.
 */
function upsertRecord(dir, journal) {
    const kept = readRecords(dir).filter((record) => record.name !== journal.name);
    return writeRecords(dir, [...kept, journal]);
}
/**
 * Forget one package's pending drop, leaving every other record alone.
 *
 * Dropping the whole file is what lost a plugin in a batch: one step's record
 * was the only thing that knew a different step's entry had gone missing.
 *
 * @param dir - the profile directory.
 * @param name - the package whose record is settled.
 */
function clearRecord(dir, name) {
    const records = readRecords(dir);
    const kept = records.filter((record) => record.name !== name);
    if (kept.length === records.length && records.length > 0)
        return;
    writeRecords(dir, kept);
}
/**
 * Forget every pending drop.
 *
 * Kept because the journal is a whole file and a caller may legitimately want it
 * gone (tests, and a profile being reset). Nothing in the upgrade path uses it:
 * there, records are settled one package at a time.
 *
 * @param dir - the profile directory.
 */
export function clearJournal(dir) {
    writeRecords(dir, []);
}
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
export function readJournal(dir, name) {
    const records = readRecords(dir);
    if (name === undefined)
        return records[0];
    return records.find((record) => record.name === name);
}
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
export function recoverPendingDrops(dir, options) {
    /*
     * Read once without the lock, for two things only: skipping the lock entirely
     * when nothing is pending, and naming what was left undone if the lock is
     * held. Neither acts on a record. The repair below re-reads the journal inside
     * the lock, so a record that changed in between is seen at its current value.
     */
    const pending = readRecords(dir);
    if (pending.length === 0) {
        /*
         * Nothing readable is pending — but there might still be a file, left behind
         * corrupt or emptied by an older version. Removing it is what keeps a
         * profile from carrying a record nobody can act on forever.
         */
        if (existsSync(join(dir, JOURNAL_FILE)))
            withManifestLock(dir, () => writeRecords(dir, []), options);
        return [];
    }
    const applied = withManifestLock(dir, () => undoDrops(dir), options);
    if (applied !== undefined)
        return applied;
    /*
     * Somebody is rewriting the manifest right now. Leaving the records alone is
     * the whole point: the next load will try again, and a repair that raced a
     * live writer is exactly how an entry ends up lost for good.
     */
    return pending.map((record) => ({ kind: 'failed', name: record.name, reason: LOCK_BUSY }));
}
/**
 * Undo one drop, reported as a single result.
 *
 * Kept for callers that only care about the common single-record case.
 *
 * @param dir - the profile directory.
 * @param options - lock budget; tests pass a zero wait.
 * @returns the first record's outcome, or `none` when there was nothing to do.
 */
export function recoverPendingDrop(dir, options) {
    return recoverPendingDrops(dir, options)[0] ?? { kind: 'none' };
}
/**
 * The repair itself, run under the writer lock.
 *
 * @param dir - the profile directory.
 * @returns one result per record that was handled.
 */
function undoDrops(dir) {
    const records = readRecords(dir);
    if (records.length === 0) {
        // Nothing recorded, so nothing to undo. The file is removed for the same
        // reason the empty state is never written: a leftover empty journal only
        // makes the next load do work that cannot change anything.
        writeRecords(dir, []);
        return [];
    }
    const results = [];
    for (const journal of records)
        results.push(undoDrop(dir, journal));
    return results;
}
/**
 * Undo exactly one record.
 *
 * The record is cleared by name, never wholesale: another package's entry may
 * still be missing, and its record is the only thing that remembers it.
 *
 * @param dir - the profile directory.
 * @param journal - the record describing the entry that went missing.
 * @returns what happened.
 */
function undoDrop(dir, journal) {
    const { manifest, error } = readManifest(dir);
    if (manifest === undefined)
        return { kind: 'failed', name: journal.name, reason: error ?? 'unreadable manifest' };
    const dependencies = manifest.dependencies;
    const record = dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
        ? dependencies
        : undefined;
    if (record === undefined) {
        // No dependencies at all: the manifest was rewritten by something else, so
        // the record no longer describes it. Dropping the record is the only safe
        // move — inventing a `dependencies` object could undo a deliberate edit.
        clearRecord(dir, journal.name);
        return { kind: 'none' };
    }
    if (Object.hasOwn(record, journal.name)) {
        clearRecord(dir, journal.name);
        return { kind: 'settled', name: journal.name };
    }
    record[journal.name] = journal.spec;
    try {
        writeManifest(dir, manifest);
    }
    catch (writeError) {
        return {
            kind: 'failed',
            name: journal.name,
            reason: writeError instanceof Error ? writeError.message : String(writeError),
        };
    }
    clearRecord(dir, journal.name);
    return { kind: 'restored', name: journal.name, spec: journal.spec };
}
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
export function confirmDependency(dir, name, options) {
    const confirmed = withManifestLock(dir, () => settleRecord(dir, name), options);
    return confirmed ?? false;
}
/**
 * The confirmation itself, run under the writer lock.
 *
 * @param dir - the profile directory.
 * @param name - the package whose entry should be present.
 * @returns whether the entry was there, and the record therefore cleared.
 */
function settleRecord(dir, name) {
    const { manifest } = readManifest(dir);
    if (manifest === undefined)
        return false;
    const dependencies = manifest.dependencies;
    if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies))
        return false;
    if (!Object.hasOwn(dependencies, name))
        return false;
    /*
     * Only this package's record. Clearing the file here is what let one step's
     * success erase a different step's pending drop, whose entry was still
     * missing.
     */
    clearRecord(dir, name);
    return true;
}
/**
 * Remove one dependency entry, leaving everything else untouched.
 *
 * @param dir - the profile directory.
 * @param name - the package name to drop.
 * @returns what happened; `absent` means the guard cannot fire anyway.
 */
export function dropDependency(dir, name, options) {
    const dropped = withManifestLock(dir, () => removeEntry(dir, name), options);
    return dropped ?? { kind: 'unavailable', reason: LOCK_BUSY };
}
/**
 * The removal itself, run under the writer lock.
 *
 * @param dir - the profile directory.
 * @param name - the package name to drop.
 * @returns what happened.
 */
function removeEntry(dir, name) {
    const { manifest, error } = readManifest(dir);
    if (manifest === undefined)
        return { kind: 'unavailable', reason: error ?? 'unreadable manifest' };
    const dependencies = manifest.dependencies;
    if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies))
        return { kind: 'absent' };
    const record = dependencies;
    if (!Object.hasOwn(record, name))
        return { kind: 'absent' };
    const previous = record[name];
    const spec = typeof previous === 'string' ? previous : '';
    /*
     * Journal first, then the manifest. The other order leaves a window where the
     * entry is gone and nothing on disk remembers what it was — the exact state
     * that turned a killed install into a missing theme.
     *
     * This adds or replaces this package's record and leaves the others alone. One
     * record per profile meant a step that failed to restore its entry lost it for
     * good as soon as the next step dropped something: this write replaced the
     * only reminder, and that step's confirmation then removed it.
     */
    if (!upsertRecord(dir, { name, spec, at: Date.now() })) {
        return { kind: 'unavailable', reason: 'could not record the pending drop' };
    }
    delete record[name];
    try {
        writeManifest(dir, manifest);
    }
    catch (writeError) {
        // The manifest still has the entry, so this package's record is stale:
        // remove it, and only it.
        clearRecord(dir, name);
        return {
            kind: 'unavailable',
            reason: writeError instanceof Error ? writeError.message : String(writeError),
        };
    }
    return { kind: 'dropped', dependency: spec };
}
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
export function restoreDependency(dir, name, spec, options) {
    const restored = withManifestLock(dir, () => putEntryBack(dir, name, spec), options);
    return restored ?? false;
}
/**
 * The restore itself, run under the writer lock.
 *
 * Clearing the journal is part of the same critical section on purpose. An
 * earlier version cleared it after releasing the lock, reasoning that the entry
 * was "on disk either way" — but a writer that had already read the manifest
 * while the entry was dropped could commit its stale snapshot afterwards, taking
 * the entry with it while the record that could have repaired it was already
 * gone. Only a restore that is still holding the lock can honestly claim the
 * entry will survive.
 *
 * @param dir - the profile directory.
 * @param name - the package name to restore.
 * @param spec - the dependency range to write back.
 * @returns whether the entry was restored.
 */
function putEntryBack(dir, name, spec) {
    const { manifest } = readManifest(dir);
    if (manifest === undefined)
        return false;
    const dependencies = manifest.dependencies;
    const record = dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
        ? dependencies
        : undefined;
    if (record === undefined)
        return false;
    const present = Object.hasOwn(record, name);
    if (!present) {
        record[name] = spec;
        try {
            writeManifest(dir, manifest);
        }
        catch {
            return false;
        }
    }
    // The entry just went to disk under the lock, so nothing can overwrite it
    // with a snapshot that predates this write: this package's record has served
    // its purpose. Other packages' records stay — their entries may still be
    // missing.
    clearRecord(dir, name);
    return true;
}
//# sourceMappingURL=manifest.js.map