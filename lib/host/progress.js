/**
 * pnpm's own words for "nothing is downloaded yet, I am checking a lockfile".
 *
 * This is the line that appears first and then sits unchanged for minutes on a
 * healthy profile, which is why the tab looked frozen: the phase stayed on the
 * pre-start state until the install itself printed something.
 */
const VERIFYING = /verifying lockfile|supply-chain policies/i;
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
export function nextPhase(current, chunk) {
    if (current === 'applying' || current === 'cancelling' || current === 'installing') {
        return current;
    }
    // A whitespace-only chunk is a keep-alive, not evidence of work.
    if (typeof chunk.text !== 'string' || chunk.text.trim() === '')
        return current ?? 'waiting';
    /*
     * Verification is worth naming. It reads as the same frozen phase as the
     * pre-start state, and it is the phase that lasts longest: a cold profile
     * spends minutes here while pnpm asks the registry about every lockfile entry.
     */
    if (VERIFYING.test(chunk.text))
        return 'verifying';
    return 'installing';
}
//# sourceMappingURL=progress.js.map