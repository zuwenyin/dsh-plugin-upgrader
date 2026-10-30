/**
 * Version ordering and release-link helpers.
 *
 * Everything here is pure: no I/O, no clock, no ambient state. The host half
 * uses it to sort published versions and to decide which GitHub page a version
 * line opens, and the test suite exercises it directly.
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