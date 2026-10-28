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
import type { InstallLogChunk, InstallState } from './manager.ts'

/** The phase a job reports, including the state before the step starts. */
export type Phase = InstallState['phase'] | 'waiting' | 'verifying'

/**
 * pnpm's own words for "nothing is downloaded yet, I am checking a lockfile".
 *
 * This is the line that appears first and then sits unchanged for minutes on a
 * healthy profile, which is why the tab looked frozen: the phase stayed on the
 * pre-start state until the install itself printed something.
 */
const VERIFYING = /verifying lockfile|supply-chain policies/i

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
export function nextPhase(current: Phase | undefined, chunk: InstallLogChunk): Phase {
  if (current === 'applying' || current === 'cancelling' || current === 'installing') {
    return current
  }
  // A whitespace-only chunk is a keep-alive, not evidence of work.
  if (typeof chunk.text !== 'string' || chunk.text.trim() === '') return current ?? 'waiting'
  /*
   * Verification is worth naming. It reads as the same frozen phase as the
   * pre-start state, and it is the phase that lasts longest: a cold profile
   * spends minutes here while pnpm asks the registry about every lockfile entry.
   */
  if (VERIFYING.test(chunk.text)) return 'verifying'
  return 'installing'
}
