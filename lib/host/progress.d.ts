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
 * The manager's `applying` and `cancelling` are its last words — the change is
 * being written, or the batch is being stopped — and nothing pnpm prints after
 * that is more specific, so they are never walked back.
 *
 * `installing` is deliberately *not* in that list. The manager announces it
 * before pnpm runs (`announce("installing")` happens ahead of the pnpm call),
 * so it says "pnpm is running" and not "the install is past the check". Latching
 * it meant a two-minute lockfile check was reported as "downloading and
 * installing" for its whole length — the panel was naming a phase pnpm had
 * already left.
 *
 * @param current - the phase the job is in now.
 * @param chunk - the chunk that just arrived.
 * @returns the phase to report.
 */
export declare function nextPhase(current: Phase | undefined, chunk: InstallLogChunk): Phase;
//# sourceMappingURL=progress.d.ts.map