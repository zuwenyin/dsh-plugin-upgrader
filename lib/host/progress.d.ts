/**
 * Deriving a job's phase from the raw package-manager output.
 *
 * The manager announces its phases through `plugin-manager/install-state`, but
 * that event is optional: a host that does not emit it leaves the panel stuck
 * on whatever `runStep` last wrote, which is `waiting` — the tab then shows
 * "preparing" for the entire install, however long that is. The log itself is
 * the fallback signal: the moment pnpm prints anything, the step is installing,
 * not preparing.
 *
 * @module dsh-plugin-upgrader/lib/progress
 */
import type { InstallLogChunk, InstallState } from './manager.ts';
/** The phase a job reports, including the state before the step starts. */
export type Phase = InstallState['phase'] | 'waiting' | 'verifying';
/**
 * The phase a log chunk puts a job in.
 *
 * Only the pre-start state is ever overwritten here. `applying` and
 * `cancelling` come from the manager and are more specific than anything pnpm's
 * own output could imply, so a late chunk must not walk them back.
 *
 * @param current - the phase the job is in now.
 * @param chunk - the chunk that just arrived.
 * @returns the phase to report.
 */
export declare function nextPhase(current: Phase | undefined, chunk: InstallLogChunk): Phase;
//# sourceMappingURL=progress.d.ts.map