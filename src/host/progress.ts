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
 * pnpm's own words for "the lockfile check has started".
 *
 * The line is `? Verifying lockfile against supply-chain policies (91 entries)...`.
 *
 * It matters that this arrives *after* the manager already said `installing`:
 * the manager announces that phase before pnpm is even started, so the check is
 * something that happens inside the install, not a state the install left.
 */
const CHECK_STARTED = /verifying lockfile/i

/**
 * pnpm's own words for "the lockfile check is over, and it passed".
 *
 * Two spellings exist: `✓ Lockfile passes supply-chain policies (91 entries in
 * 2m 13.6s)` for a check that just ran, and `✓ Lockfile passes supply-chain
 * policies (previously verified)` for one that was cached.
 */
const CHECK_PASSED = /lockfile.*passes supply-chain policies/i

/**
 * pnpm's own words for "the lockfile check failed".
 *
 * `✗ Lockfile failed supply-chain policy check (91 entries in 2m 13.6s)`.
 */
const CHECK_FAILED = /lockfile.*failed supply-chain policy check/i

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
export function nextPhase(current: Phase | undefined, chunk: InstallLogChunk): Phase {
  if (current === 'applying' || current === 'cancelling') return current
  // A whitespace-only chunk is a keep-alive, not evidence of work.
  if (typeof chunk.text !== 'string' || chunk.text.trim() === '') return current ?? 'waiting'
  const text = chunk.text
  /*
   * The check passed, so pnpm is past it and is applying the change. The
   * *starting* line also says "supply-chain policies", which is why the
   * verdict is read from its own words and not from that phrase.
   */
  if (CHECK_PASSED.test(text)) return 'installing'
  /*
   * The check failed. The step is about to fail, and the last thing pnpm
   * really did was check — calling that an install would be a lie.
   */
  if (CHECK_FAILED.test(text)) return 'verifying'
  if (CHECK_STARTED.test(text)) return 'verifying'
  /*
   * The check is still running. Ordinary lines — progress counters, registry
   * retries — are printed *inside* the check, so they do not end it; only the
   * verdict does.
   */
  if (current === 'verifying') return 'verifying'
  return 'installing'
}
