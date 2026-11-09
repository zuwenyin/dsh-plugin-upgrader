/**
 * The placeholder the manager writes for a build nobody has answered for.
 *
 * Matched as an exact string, not as "anything that is not a boolean": once the
 * question is answered `allowBuilds` holds `true` or `false`, so this literal is
 * the only "still asking" state there is. A typo in a hand-edited file then
 * stays a typo instead of turning into an approval prompt.
 */
export declare const PENDING_BUILD = "set this to true or false";
/**
 * Every package in this profile whose build scripts are still undecided.
 *
 * @param dir - the profile directory, or undefined when it is unknown.
 * @returns the `allowBuilds` keys, as `name@version`, in file order.
 */
export declare function readPendingBuilds(dir: string | undefined): string[];
/**
 * The entries of {@link readPendingBuilds} that belong to one package.
 *
 * The list is the whole profile's, so a failed install of one package also
 * reports the packages that were already waiting. Approving them together would
 * decide for code the user never asked about, so every caller narrows first.
 *
 * @param pending - the profile's list.
 * @param name - the package to narrow to.
 * @returns the entries for that package, as `name@version`.
 */
export declare function pendingFor(pending: readonly string[], name: string): string[];
//# sourceMappingURL=builds.d.ts.map