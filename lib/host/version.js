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
/**
 * Parse a semver string into comparable parts.
 *
 * @param value - a version like `1.2.3-rc.1`.
 * @returns parts, or `null` when the string is not semver.
 */
export function parseVersion(value) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value ?? '').trim());
    if (match === null)
        return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        pre: match[4] === undefined ? [] : match[4].split('.'),
    };
}
/**
 * Compare two prerelease identifier lists, semver order.
 *
 * @param left - identifiers of the left version.
 * @param right - identifiers of the right version.
 * @returns negative, zero, or positive.
 */
export function comparePre(left, right) {
    if (left.length === 0 && right.length === 0)
        return 0;
    if (left.length === 0)
        return 1;
    if (right.length === 0)
        return -1;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a === undefined)
            return -1;
        if (b === undefined)
            return 1;
        const aNumeric = /^\d+$/.test(a);
        const bNumeric = /^\d+$/.test(b);
        if (aNumeric && bNumeric) {
            const delta = Number(a) - Number(b);
            if (delta !== 0)
                return delta;
            continue;
        }
        if (aNumeric)
            return -1;
        if (bNumeric)
            return 1;
        if (a !== b)
            return a < b ? -1 : 1;
    }
    return 0;
}
/**
 * Compare two versions, semver order; unparsable pairs compare equal.
 *
 * @param left - left version.
 * @param right - right version; an absent value compares equal to anything.
 * @returns negative when left is older.
 */
export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (a === null || b === null)
        return 0;
    return (a.major - b.major ||
        a.minor - b.minor ||
        a.patch - b.patch ||
        comparePre(a.pre, b.pre));
}
/** A wildcard segment, which a range may write as `x`, `X`, or `*`. */
const WILDCARD = /^[xX*]$/;
/**
 * Parse one possibly-partial version, the way a range writes it.
 *
 * @param value - `1`, `1.2`, `1.2.3`, `1.2.x`, `1.2.3-rc.1`.
 * @returns the parts, with `null` for absent or wildcard segments, or `null`
 * when the text is not a version at all.
 */
function parsePartial(value) {
    const text = value.trim().replace(/^v/, '');
    const match = /^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text);
    if (match === null)
        return null;
    const segment = (raw) => {
        if (raw === undefined || WILDCARD.test(raw))
            return null;
        return Number(raw);
    };
    const major = segment(match[1]);
    // A wildcard in a lower segment means "any value here", so the segments
    // after it cannot narrow the range either: `1.x.3` is `1.x`.
    const minor = major === null ? null : segment(match[2]);
    const patch = minor === null ? null : segment(match[3]);
    return {
        major,
        minor,
        patch,
        pre: match[4] === undefined ? [] : match[4].split('.'),
    };
}
/**
 * Build one comparator.
 *
 * @param op - the comparison.
 * @param major - major segment.
 * @param minor - minor segment.
 * @param patch - patch segment.
 * @param pre - prerelease identifiers.
 * @returns the comparator.
 */
function bound(op, major, minor, patch, pre = []) {
    return { op, parts: { major, minor, patch, pre: [...pre] } };
}
/**
 * The lower bound semver writes for a partial range, `>=x.y.z-0`.
 *
 * A missing segment means "any value here", so the range has to start below
 * that segment's first release — prereleases of it included. That is why
 * `1.2` expands to `>=1.2.0-0`, not `>=1.2.0`: the latter would reject
 * `1.2.0-rc.1`, which a partial range accepts.
 *
 * `>=0.0.0-0` is true of every version, so it is dropped rather than emitted;
 * carrying it would only make the comparator list longer than the one semver
 * builds, and these lists are compared against semver's in the test suite.
 *
 * @param major - major segment.
 * @param minor - minor segment.
 * @param patch - patch segment.
 * @param pre - prerelease identifiers; `['0']` when a segment was missing.
 * @returns zero or one comparator.
 */
function atLeast(major, minor, patch, pre = []) {
    if (major === 0 && minor === 0 && patch === 0 && pre.length === 1 && pre[0] === '0')
        return [];
    return [bound('>=', major, minor, patch, pre)];
}
/**
 * The exclusive upper bound semver writes as `<x.y.z-0` for a partial range.
 *
 * The `-0` matters: with prereleases in play, `<0.3.0` would still admit
 * `0.3.0-rc.1`, while `<0.3.0-0` does not. Plugin authors write this bound by
 * hand (`<0.3.0-0`) and the ranges below have to mean the same thing.
 *
 * @param major - upper major.
 * @param minor - upper minor.
 * @param patch - upper patch.
 * @returns the comparator.
 */
function belowRelease(major, minor, patch) {
    return bound('<', major, minor, patch, ['0']);
}
/**
 * Expand one written version into the comparators it stands for.
 *
 * The expansions follow `node-semver`, which is what the host's compatibility
 * gate uses; agreeing with it is the whole point, because a version this page
 * calls usable and the host then refuses is worse than no marking at all.
 * `test/version.test.ts` pins the table below against the real package.
 *
 * @param partial - the version as written.
 * @param op - the operator in front of it, `^` and `~` included.
 * @returns comparators, or `null` when the range is not understood.
 */
function expand(partial, op) {
    const { major, minor, patch, pre } = partial;
    if (major === null)
        return [];
    const M = major;
    const m = minor ?? 0;
    const p = patch ?? 0;
    /** A missing segment widens the range downwards, prereleases included. */
    const open = ['0'];
    switch (op) {
        case '^':
            if (minor === null)
                return [...atLeast(M, 0, 0, open), belowRelease(M + 1, 0, 0)];
            if (patch === null) {
                return M === 0
                    ? [...atLeast(0, m, 0, open), belowRelease(0, m + 1, 0)]
                    : [...atLeast(M, m, 0, open), belowRelease(M + 1, 0, 0)];
            }
            if (M !== 0)
                return [bound('>=', M, m, p, pre), belowRelease(M + 1, 0, 0)];
            if (m !== 0)
                return [bound('>=', 0, m, p, pre), belowRelease(0, m + 1, 0)];
            return [bound('>=', 0, 0, p, pre), belowRelease(0, 0, p + 1)];
        case '~':
            // `~1.2.3` is `>=1.2.3 <1.3.0`, so the lower bound keeps the patch —
            // that is what makes `~0.1.7-rc.1` refuse `0.1.6`.
            if (minor === null)
                return [...atLeast(M, 0, 0, open), belowRelease(M + 1, 0, 0)];
            if (patch === null)
                return [...atLeast(M, m, 0, open), belowRelease(M, m + 1, 0)];
            return [bound('>=', M, m, p, pre), belowRelease(M, m + 1, 0)];
        case '>':
            if (minor === null)
                return [bound('>=', M + 1, 0, 0)];
            if (patch === null)
                return [bound('>=', M, m + 1, 0)];
            return [bound('>', M, m, p, pre)];
        case '>=':
            if (minor === null)
                return atLeast(M, 0, 0, open);
            if (patch === null)
                return atLeast(M, m, 0, open);
            return [bound('>=', M, m, p, pre)];
        case '<':
            if (minor === null)
                return [belowRelease(M, 0, 0)];
            if (patch === null)
                return [belowRelease(M, m, 0)];
            return [bound('<', M, m, p, pre)];
        case '<=':
            if (minor === null)
                return [belowRelease(M + 1, 0, 0)];
            if (patch === null)
                return [belowRelease(M, m + 1, 0)];
            return [bound('<=', M, m, p, pre)];
        default:
            if (minor === null)
                return [...atLeast(M, 0, 0, open), belowRelease(M + 1, 0, 0)];
            if (patch === null)
                return [...atLeast(M, m, 0, open), belowRelease(M, m + 1, 0)];
            return [bound('=', M, m, p, pre)];
    }
}
/**
 * Turn one alternative such as `>=0.2.0-rc.2 <0.3.0-0` into comparators.
 *
 * Two pieces of syntax are handled before the comparator loop: a hyphen range
 * (`1.2.3 - 2.0.0`) and an operator separated from its version by a space
 * (`>= 0.2.0`). Both are written by hand in real manifests, and refusing to
 * read them would silently turn a real bound into "anything goes".
 *
 * @param text - one alternative, already split on `||`.
 * @returns comparators, or `null` when a piece is not understood.
 */
function parseAlternative(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return [];
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(trimmed);
    if (hyphen !== null) {
        const low = parsePartial(hyphen[1]);
        const high = parsePartial(hyphen[2]);
        if (low === null || high === null)
            return null;
        /*
         * A hyphen range is inclusive on both ends, and with prereleases in play
         * semver widens it: `1.2.3 - 2.0.0` becomes `>=1.2.3-0 <2.0.1-0`. The lower
         * `-0` admits `1.2.3-beta.1`; the upper bound bumps the last written
         * segment so `2.0.1-rc.1` stays out.
         */
        const from = low.pre.length === 0 ? atLeast(low.major ?? 0, low.minor ?? 0, low.patch ?? 0, ['0']) : expand(low, '>=');
        const upperMajor = high.major === null ? 0 : high.major;
        const upperMinor = high.minor === null ? 0 : high.minor;
        const upperPatch = high.patch === null ? 0 : high.patch;
        const to = high.minor === null
            ? [belowRelease(upperMajor + 1, 0, 0)]
            : high.patch === null
                ? [belowRelease(upperMajor, upperMinor + 1, 0)]
                : [belowRelease(upperMajor, upperMinor, upperPatch + 1)];
        if (from === null)
            return null;
        return [...from, ...to];
    }
    const comparators = [];
    const normalized = trimmed.replace(/(~|\^|>=|<=|>|<|=)\s+(\S)/g, '$1$2');
    for (const token of normalized.split(/\s+/)) {
        const match = /^(~|\^|>=|<=|>|<|=)?(.+)$/.exec(token);
        if (match === null)
            return null;
        const partial = parsePartial(match[2]);
        if (partial === null)
            return null;
        const expanded = expand(partial, match[1] ?? '=');
        if (expanded === null)
            return null;
        comparators.push(...expanded);
    }
    return comparators;
}
/**
 * Compare two parsed versions.
 *
 * @param left - left version.
 * @param right - right version.
 * @returns negative, zero, or positive.
 */
function compareParts(left, right) {
    return (left.major - right.major ||
        left.minor - right.minor ||
        left.patch - right.patch ||
        comparePre(left.pre, right.pre));
}
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
export function satisfiesRange(version, range) {
    const text = String(range ?? '').trim();
    if (text === '')
        return true;
    const parts = parseVersion(version);
    if (parts === null)
        return true;
    for (const alternative of text.split('||')) {
        const comparators = parseAlternative(alternative);
        if (comparators === null)
            return true;
        const passes = comparators.every((comparator) => {
            const delta = compareParts(parts, comparator.parts);
            switch (comparator.op) {
                case '<':
                    return delta < 0;
                case '<=':
                    return delta <= 0;
                case '>':
                    return delta > 0;
                case '>=':
                    return delta >= 0;
                default:
                    return delta === 0;
            }
        });
        if (passes)
            return true;
    }
    return false;
}
/**
 * The tag a published version was released under.
 *
 * @param version - the published version.
 * @returns `v<version>` unless the version already carries the `v`.
 */
export function tagOf(version) {
    return version.startsWith('v') ? version : `v${version}`;
}
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
export function releasePathOf(tags, version) {
    const tag = tagOf(version);
    return tags?.has(tag) === true ? `/releases/tag/${tag}` : '/releases';
}
//# sourceMappingURL=version.js.map