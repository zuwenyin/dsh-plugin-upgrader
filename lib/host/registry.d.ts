import { type PackumentLike, type RepoManifest } from './repo.ts';
/** How long one registry packument stays fresh. */
export declare const PACKUMENT_TTL_MS: number;
/**
 * Registry lookups must not hang a page render.
 *
 * Raised from 10 s once the documents were measured: the largest package in a
 * normal profile (`billion-context`, 6 624 versions) is a 26 MB JSON document
 * and 10 MB even abbreviated, which takes a second on a fast mirror and much
 * longer on a busy one. A deadline that the healthy case can miss is not a
 * deadline, it is a coin flip — and its losing side was being drawn as "this
 * plugin has no version history".
 */
export declare const PACKUMENT_TIMEOUT_MS: number;
/** Version lists are capped so one huge package cannot flood the tab. */
export declare const MAX_VERSIONS = 80;
/**
 * How long one repository's tag list stays fresh. The GitHub API allows 60
 * unauthenticated requests an hour and one tag list costs a request per 100
 * tags, so this is deliberately much longer than the packument TTL.
 */
export declare const TAGS_TTL_MS: number;
/** A failed tag lookup is retried sooner than a good one is refreshed. */
export declare const TAGS_RETRY_MS: number;
/** Tag lookups must not hang a page render. */
export declare const TAGS_TIMEOUT_MS: number;
/** A version manifest, as far as this module reads it. */
export interface VersionManifest extends RepoManifest {
    deprecated?: unknown;
    engines?: {
        dsh?: unknown;
    } | undefined;
    dsh?: {
        engines?: {
            dsh?: unknown;
        };
    } | undefined;
}
/** The packument fields this module reads beyond {@link PackumentLike}. */
export interface FullPackument extends PackumentLike {
    versions?: Record<string, VersionManifest | undefined> | undefined;
    time?: Record<string, unknown> | undefined;
}
/** One cached packument. */
export interface PackumentEntry {
    at: number;
    data: unknown;
    /** Set when the last attempt failed, so a later render can say why. */
    error?: string;
}
/** One cached tag lookup. */
export interface TagEntry {
    at: number;
    tags?: Set<string>;
    error?: string;
}
/**
 * How long a failed packument lookup is remembered.
 *
 * A failure has to be remembered at all: the tab rebuilds the overview on every
 * mount, and retrying a mirror that just timed out on every mount turns one
 * slow render into a permanently slow page. It is kept much shorter than a
 * successful entry, though — the failure is usually contention, not a broken
 * package, so the next open should get a fresh chance.
 */
export declare const PACKUMENT_RETRY_MS: number;
/** How many package lookups may be in flight at once. */
export declare const PACKUMENT_CONCURRENCY = 4;
/** One version line the tab renders. */
export interface VersionRow {
    version: string;
    time?: string;
    deprecated?: string;
    engine?: string;
    current: boolean;
    latest: boolean;
    /** A GitHub path such as `/releases/tag/v1.2.3`, relative to `repoUrl`. */
    url?: string;
    /**
     * Published upstream but absent from the registry this profile installs from.
     *
     * A mirror lags the registry it copies — sometimes for hours — and a version
     * that exists on npm but not on the mirror cannot be installed at all: pnpm
     * resolves every dependency through the configured registry, so asking for it
     * fails with `ERR_PNPM_NO_MATCHING_VERSION`, and that failure takes the whole
     * command down, including unrelated packages in the same batch. Offering such
     * a version as an ordinary upgrade sets the person up for exactly that.
     */
    unavailable?: string;
}
/** The packument slice the tab renders. */
export interface ShapedPackument {
    latest?: string;
    repoUrl?: string;
    versions: VersionRow[];
    tags: Record<string, string>;
    totalVersions?: number;
    versionError?: string;
    /** The `dist-tags.latest` that was rejected as broken, when there was one. */
    staleTag?: string;
}
/**
 * Fetch one package's packument, with a short-lived cache.
 *
 * Two failure modes were measured on the npmmirror mirror, and both produced
 * the same symptom — a plugin drawn with no version history at all:
 *
 *   - the tab asks for every installed package at once, and eleven concurrent
 *     connections to the mirror time out at a 10 s deadline while the same
 *     eleven asked one at a time answer in under 1.2 s;
 *   - the largest document in a normal profile is 26 MB, so even a healthy
 *     request is slow enough to lose that race.
 *
 * The abbreviated document cuts the transfer, the deadline was raised, and a
 * timeout is retried once — a `UND_ERR_CONNECT_TIMEOUT` is contention on the
 * socket, not a verdict about the package.
 *
 * @param base - registry base URL.
 * @param packageName - package name.
 * @param cache - shared cache.
 * @param force - bypass a fresh cache entry.
 * @returns the document or a reason.
 */
export declare function fetchPackument(base: string, packageName: string, cache: Map<string, PackumentEntry>, force: boolean): Promise<{
    data?: unknown;
    error?: string;
}>;
/**
 * Read a repository's tag names from the GitHub API.
 *
 * The git ref advertisement (`/info/refs?service=git-upload-pack`) would avoid
 * the rate limit but stalls for most repositories behind this network, while the
 * REST list answers in well under a second. Only the first page is read: the
 * version list itself is capped at 80 newest rows, and tags are ordered newest
 * first, so a repository with more than 100 tags still resolves every row that
 * can be shown.
 *
 * @param repoUrl - the repository URL.
 * @param at - the time the lookup started.
 * @returns the outcome.
 */
export declare function fetchTags(repoUrl: string, at: number): Promise<TagEntry>;
/**
 * The tag names of a repository, cached.
 *
 * A tag list is the only way to know whether `/releases/tag/v<version>` exists.
 * A failed lookup is cached too, but for less time: the tab must still render
 * (with repository-level links) while GitHub is rate limiting.
 *
 * @param repoUrl - the repository URL.
 * @param cache - shared cache.
 * @param force - bypass a fresh cache entry.
 * @returns the tag names, or `undefined` when unknown.
 */
export declare function cachedTags(repoUrl: string, cache: Map<string, TagEntry>, force: boolean): Promise<Set<string> | undefined>;
/** The registry every mirror copies, used to answer "does this version exist at all". */
export declare const UPSTREAM_REGISTRY = "https://registry.npmjs.org";
/**
 * Find versions that exist upstream but are missing from the configured registry.
 *
 * A mirror lags the registry it copies, sometimes for hours. The lag is invisible
 * from the mirror's own document — it simply does not list the version — so a
 * profile pointed at a mirror sees an older `latest` and no hint that anything is
 * missing. That matters because a version which is absent from the configured
 * registry cannot be installed at all: pnpm resolves every dependency through it,
 * and `ERR_PNPM_NO_MATCHING_VERSION` fails the whole command, taking unrelated
 * packages in the same batch down with it.
 *
 * Only versions ABOVE the given floor are reported: an old version the mirror
 * never carried is not something the tab would offer, and listing it would bury
 * the one line that matters.
 *
 * @param base - the registry the profile installs from.
 * @param packageName - package name.
 * @param above - report only versions greater than this one.
 * @param cache - shared cache.
 * @param force - bypass a fresh cache entry.
 * @returns the missing versions, newest first.
 */
export declare function versionsMissingFromMirror(base: string, packageName: string, above: string | undefined, cache: Map<string, PackumentEntry>, force: boolean): Promise<string[]>;
/**
 * How long a reachability probe waits before calling a source unreachable.
 *
 * The harness's own registry probe uses the same 1500 ms deadline, measured
 * against the same two addresses. Long enough for a mirror on a slow link,
 * short enough that a user clicking "test" gets an answer instead of a spinner.
 */
export declare const PROBE_TIMEOUT_MS = 1500;
/** What a reachability probe found. */
export interface ProbeResult {
    /** Whether the source answered with a 2xx. */
    ok: boolean;
    /** One sentence for the tab: the status, or what failed. */
    detail: string;
    /** Round-trip time in milliseconds, when the request completed. */
    ms?: number;
}
/**
 * Ask one registry whether it is reachable right now.
 *
 * A registry's `/-/ping` endpoint is the cheapest thing it serves, and both the
 * public registry and the mainland mirror implement it; a source that is not an
 * npm registry still answers the bare root, so a failed ping falls back to the
 * root rather than declaring a working mirror broken.
 *
 * The answer must not carry the package-specific wording `fetchPackument` uses
 * ("not found" would be a lie — the probe asks for no package), but it must
 * carry the same underlying cause, because "unreachable" alone does not tell a
 * user whether they typed the address wrong or their network is down.
 *
 * @param base - the registry address to probe.
 * @returns whether it answered, and what to show the user.
 */
export declare function probeRegistry(base: string): Promise<ProbeResult>;
/**
 * Trim one packument down to what the tab renders.
 *
 * `dist-tags.latest` is normally the newest stable release, and it is trusted as
 * is — a prerelease above it must NOT become "latest", or every `-next` build
 * would advertise itself over the stable line. The one case it cannot be
 * trusted is a tag that sorts *below the version already installed*: that is not
 * a release decision, it is a broken tag. npmmirror serves
 * `@deepseek-ai/dsh-subagent-codex` with `latest: 0.0.1-rc.1` while the profile
 * runs `0.2.1-rc.3`, which made the row claim the installed build was newer than
 * latest and offered an "upgrade" that was really a downgrade.
 *
 * @param packument - the full registry document.
 * @param installedVersion - the version in the profile.
 * @param tagNames - the repository's tag names, when known.
 * @returns the slice.
 */
export declare function shapePackument(packument: FullPackument | undefined, installedVersion: string | undefined, tagNames: ReadonlySet<string> | undefined): ShapedPackument;
//# sourceMappingURL=registry.d.ts.map