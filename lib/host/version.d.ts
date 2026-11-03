/**
 * Version ordering, release-link helpers, and range matching.
 *
 * Everything here is pure: no I/O, no clock, no ambient state. The host half
 * uses it to sort published versions, to decide which GitHub page a version
 * line opens, and to answer whether a published version is allowed on the
 * runtime this profile is actually running.
 *
 * @module dsh-plugin-upgrader/lib/version
 */
/** A semver split into comparable parts. */
export interface VersionParts {
    major: number;
    minor: number;
    patch: number;
    /** Prerelease identifiers, empty for a stable release. */
    pre: string[];
}
/**
 * Parse a semver string into comparable parts.
 *
 * @param value - a version like `1.2.3-rc.1`.
 * @returns parts, or `null` when the string is not semver.
 */
export declare function parseVersion(value: string | undefined | null): VersionParts | null;
/**
 * Compare two prerelease identifier lists, semver order.
 *
 * @param left - identifiers of the left version.
 * @param right - identifiers of the right version.
 * @returns negative, zero, or positive.
 */
export declare function comparePre(left: readonly string[], right: readonly string[]): number;
/**
 * Compare two versions, semver order; unparsable pairs compare equal.
 *
 * @param left - left version.
 * @param right - right version; an absent value compares equal to anything.
 * @returns negative when left is older.
 */
export declare function compareVersions(left: string | undefined | null, right: string | undefined | null): number;
/**
 * Does a version fall inside a manifest range?
 *
 * The host gate calls `semver.satisfies(version, range, { includePrerelease:
 * true })` before it installs anything, so prereleases take part in comparisons
 * here for the same reason: a plugin declaring `>=0.2.0-rc.2 <0.3.0-0` accepts
 * the `0.2.1-rc.5` build people actually run, and marking that version
 * unusable would be a lie.
 *
 * Ranges this module cannot parse answer `true`. A manifest written in a way
 * this parser does not understand must never be the reason a version is called
 * incompatible — the host stays the judge, and the page only loses a hint.
 *
 * @param version - the version to test, such as `0.2.1-rc.5`.
 * @param range - a range as a manifest writes it; `''` means "no limit".
 * @returns whether the version is inside the range.
 */
export declare function satisfiesRange(version: string | undefined | null, range: string | undefined | null): boolean;
/**
 * The tag a published version was released under.
 *
 * @param version - the published version.
 * @returns `v<version>` unless the version already carries the `v`.
 */
export declare function tagOf(version: string): string;
/**
 * The GitHub path a version line opens.
 *
 * Users read a version line as "what did this release change", so the target is
 * the release page. That only resolves when the repository actually tagged the
 * version — `dsh-pet` publishes 59 versions with 8 tags — so the tag list
 * decides, and a version without a tag of its own falls back to the repository's
 * release feed rather than to a page GitHub would answer with 404. When the tag
 * list cannot be read at all (rate limit, offline) the same feed is the only
 * honest answer: guessing a tag would make one link in six a dead end.
 *
 * The result is the `releases` tail only: the row already carries the project
 * URL, and repeating it on all ~80 rows costs tens of kilobytes.
 *
 * @param tags - the repository's tag names, when known.
 * @param version - the published version.
 * @returns a path such as `/releases/tag/v1.2.3`.
 */
export declare function releasePathOf(tags: ReadonlySet<string> | undefined, version: string): string;
//# sourceMappingURL=version.d.ts.map