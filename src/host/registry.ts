/**
 * Registry and GitHub lookups.
 *
 * The browser half cannot reach npm reliably (CORS, private registries, tokens)
 * and cannot reach the GitHub API at all without leaking rate limits to every
 * page load, so both lookups happen here, behind a cache.
 *
 * @module dsh-plugin-upgrader/lib/registry
 */
import { compareVersions, releasePathOf } from './version.ts'
import { githubUrlOf, type PackumentLike, type RepoManifest } from './repo.ts'

/** How long one registry packument stays fresh. */
export const PACKUMENT_TTL_MS = 5 * 60 * 1000

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
export const PACKUMENT_TIMEOUT_MS = 20 * 1000

/**
 * The npm registry's abbreviated document, which is what pnpm itself downloads.
 *
 * It drops the readme, the per-version tarball metadata and the maintainer
 * lists — 26 MB becomes 10 MB for `billion-context` — while keeping the three
 * fields the version list renders: `time`, `engines` and `deprecated`.
 */
const ABBREVIATED_ACCEPT = 'application/vnd.npm.install-v1+json'

/**
 * The abbreviated document also drops the fields the GitHub links need.
 *
 * `repository`, `homepage` and `bugs` are absent from
 * `application/vnd.npm.install-v1+json` — measured live on the mirror:
 * `dshmarket`'s abbreviated document has `repository: undefined` where the full
 * one carries `git+https://github.com/dsh-market/dsh-market.git`. Every row
 * therefore lost its `GH` button and every history entry its release link the
 * moment the abbreviated format was adopted. A document that carries none of
 * the three fields is re-fetched in the full form once; the full document is
 * cached in place of the abbreviated one, so the extra request happens at most
 * once per package per TTL window.
 */
const FULL_ACCEPT = 'application/json'

/** Version lists are capped so one huge package cannot flood the tab. */
export const MAX_VERSIONS = 80

/**
 * How long one repository's tag list stays fresh. The GitHub API allows 60
 * unauthenticated requests an hour and one tag list costs a request per 100
 * tags, so this is deliberately much longer than the packument TTL.
 */
export const TAGS_TTL_MS = 30 * 60 * 1000

/** A failed tag lookup is retried sooner than a good one is refreshed. */
export const TAGS_RETRY_MS = 5 * 60 * 1000

/** Tag lookups must not hang a page render. */
export const TAGS_TIMEOUT_MS = 8 * 1000

/** A version manifest, as far as this module reads it. */
export interface VersionManifest extends RepoManifest {
  deprecated?: unknown
  engines?: { dsh?: unknown } | undefined
  dsh?: { engines?: { dsh?: unknown } } | undefined
}

/** The packument fields this module reads beyond {@link PackumentLike}. */
export interface FullPackument extends PackumentLike {
  versions?: Record<string, VersionManifest | undefined> | undefined
  time?: Record<string, unknown> | undefined
}

/** One cached packument. */
export interface PackumentEntry {
  at: number
  data: unknown
  /** Set when the last attempt failed, so a later render can say why. */
  error?: string
}

/** One cached tag lookup. */
export interface TagEntry {
  at: number
  tags?: Set<string>
  error?: string
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
export const PACKUMENT_RETRY_MS = 45 * 1000

/** How many package lookups may be in flight at once. */
export const PACKUMENT_CONCURRENCY = 4

/** One version line the tab renders. */
export interface VersionRow {
  version: string
  time?: string
  deprecated?: string
  engine?: string
  current: boolean
  latest: boolean
  /** A GitHub path such as `/releases/tag/v1.2.3`, relative to `repoUrl`. */
  url?: string
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
  unavailable?: string
}

/** The packument slice the tab renders. */
export interface ShapedPackument {
  latest?: string
  repoUrl?: string
  versions: VersionRow[]
  tags: Record<string, string>
  totalVersions?: number
  versionError?: string
  /** The `dist-tags.latest` that was rejected as broken, when there was one. */
  staleTag?: string
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
export async function fetchPackument(
  base: string,
  packageName: string,
  cache: Map<string, PackumentEntry>,
  force: boolean,
): Promise<{ data?: unknown; error?: string }> {
  const key = `${base}|${packageName}`
  const hit = cache.get(key)
  if (force !== true && hit !== undefined) {
    // A remembered failure is served only within its own, shorter window.
    if (hit.error === undefined && Date.now() - hit.at < PACKUMENT_TTL_MS) return { data: hit.data }
    if (hit.error !== undefined && Date.now() - hit.at < PACKUMENT_RETRY_MS) return { error: hit.error }
  }
  const url = `${base}/${packageName.startsWith('@') ? '@' + encodeURIComponent(packageName.slice(1)) : encodeURIComponent(packageName)}`
  let lastError = 'registry unreachable'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: ABBREVIATED_ACCEPT },
        signal: AbortSignal.timeout(PACKUMENT_TIMEOUT_MS),
      })
      if (!response.ok) {
        // A missing package is a verdict, not contention: do not retry it.
        const error = `registry ${response.status}${response.status === 404 ? ' (not found)' : ''}`
        cache.set(key, { at: Date.now(), data: undefined, error })
        return { error }
      }
      let data: unknown = await response.json()
      if (dropsRepositoryFields(data) === true) {
        // The abbreviated format hid the repository fields; ask once more with
        // the full document, which keeps them. A failure here is not fatal —
        // the version list still renders, only the links stay missing.
        try {
          const full = await fetch(url, {
            headers: { accept: FULL_ACCEPT },
            signal: AbortSignal.timeout(PACKUMENT_TIMEOUT_MS),
          })
          if (full.ok) data = await full.json()
        } catch {
          // Keep the abbreviated document.
        }
      }
      cache.set(key, { at: Date.now(), data })
      return { data }
    } catch (error) {
      lastError = `registry unreachable: ${describeFetchError(error)}`
    }
  }
  cache.set(key, { at: Date.now(), data: undefined, error: lastError })
  return { error: lastError }
}

/**
 * Does this packument lack every field the GitHub links read?
 *
 * The abbreviated document omits `repository`, `homepage` and `bugs` outright —
 * the keys are simply not present. A full document from a package that genuinely
 * publishes no repository still carries one of them as `undefined` at worst on
 * the top level and never as a *missing* key across all three when any version
 * declares one, so "no key anywhere" is the abbreviated signature. Checking the
 * top level plus the latest manifest keeps a repository-less package from
 * triggering the second request forever.
 *
 * @param data - the parsed document.
 * @returns whether a full-document re-fetch could add the fields.
 */
function dropsRepositoryFields(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (record.repository !== undefined || record.homepage !== undefined || record.bugs !== undefined) {
    return false
  }
  const versions = record.versions
  if (versions === null || typeof versions !== 'object') return false
  const tags = record['dist-tags']
  const latest = tags !== null && typeof tags === 'object' ? (tags as Record<string, unknown>).latest : undefined
  const candidates =
    typeof latest === 'string' && typeof (versions as Record<string, unknown>)[latest] === 'object'
      ? [(versions as Record<string, unknown>)[latest]]
      : Object.values(versions as Record<string, unknown>).slice(0, 5)
  const manifests = candidates.filter(
    (candidate): candidate is Record<string, unknown> => candidate !== null && typeof candidate === 'object',
  )
  if (manifests.length === 0) return false
  return manifests.every(
    (manifest) =>
      manifest.repository === undefined && manifest.homepage === undefined && manifest.bugs === undefined,
  )
}

/**
 * Say what actually failed, not just that `fetch` did.
 *
 * Node reports every transport fault as `TypeError: fetch failed` and hangs the
 * reason off `cause`; without unwrapping it, a DNS rejection, a refused
 * connection and a socket timeout all read the same in the tab, which is the
 * difference between "try again" and "this registry is wrong".
 *
 * @param error - whatever `fetch` threw.
 * @returns a sentence with the underlying cause and code.
 */
function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as { cause?: unknown }).cause
  if (cause === undefined || cause === null) {
    return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`
  }
  const record = cause as { code?: unknown; message?: unknown }
  const code = typeof record.code === 'string' ? record.code : undefined
  const message = typeof record.message === 'string' ? record.message : String(cause)
  if (code !== undefined) return `${code}: ${message}`
  return message === '' ? error.message : message
}

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
export async function fetchTags(repoUrl: string, at: number): Promise<TagEntry> {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/.exec(repoUrl)
  if (match === null) return { error: 'not a github repository', at }
  const [, owner, repo] = match
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`,
      {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-plugin-upgrader' },
        signal: AbortSignal.timeout(TAGS_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      const suffix = response.status === 403 || response.status === 429 ? ' (rate limited)' : ''
      return { error: `github ${response.status}${suffix}`, at }
    }
    const list: unknown = await response.json()
    if (!Array.isArray(list)) return { error: 'github returned no tag list', at }
    const tags = new Set<string>()
    for (const entry of list as { name?: unknown }[]) {
      if (typeof entry?.name === 'string') tags.add(entry.name)
    }
    return { tags, at }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `github unreachable: ${message}`, at }
  }
}

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
export async function cachedTags(
  repoUrl: string,
  cache: Map<string, TagEntry>,
  force: boolean,
): Promise<Set<string> | undefined> {
  const hit = cache.get(repoUrl)
  if (hit !== undefined && force !== true) {
    const ttl = hit.tags === undefined ? TAGS_RETRY_MS : TAGS_TTL_MS
    if (Date.now() - hit.at < ttl) return hit.tags
  }
  const outcome = await fetchTags(repoUrl, Date.now())
  cache.set(repoUrl, outcome)
  return outcome.tags
}

/** The registry every mirror copies, used to answer "does this version exist at all". */
export const UPSTREAM_REGISTRY = 'https://registry.npmjs.org'

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
export async function versionsMissingFromMirror(
  base: string,
  packageName: string,
  above: string | undefined,
  cache: Map<string, PackumentEntry>,
  force: boolean,
): Promise<string[]> {
  // The upstream registry is the configured one: nothing can be missing.
  if (base.replace(/\/+$/, '') === UPSTREAM_REGISTRY) return []
  const { data } = await fetchPackument(base, packageName, cache, force)
  const local = (data as { versions?: Record<string, unknown> } | undefined)?.versions ?? {}
  const { data: upstream } = await fetchPackument(UPSTREAM_REGISTRY, packageName, cache, force)
  if (upstream === undefined) return []
  const remote = (upstream as { versions?: Record<string, unknown> }).versions ?? {}
  const missing: string[] = []
  for (const version of Object.keys(remote)) {
    if (Object.hasOwn(local, version)) continue
    if (above !== undefined && compareVersions(version, above) <= 0) continue
    missing.push(version)
  }
  missing.sort((left, right) => compareVersions(right, left))
  return missing
}

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
export function shapePackument(
  packument: FullPackument | undefined,
  installedVersion: string | undefined,
  tagNames: ReadonlySet<string> | undefined,
): ShapedPackument {
  const versionsRecord = packument?.versions
  if (versionsRecord === null || versionsRecord === undefined || typeof versionsRecord !== 'object') {
    return { versions: [], tags: {}, versionError: 'registry returned no versions' }
  }
  const rawTags = packument?.['dist-tags']
  const tags = rawTags !== null && rawTags !== undefined && typeof rawTags === 'object'
    ? (rawTags as Record<string, unknown>)
    : {}
  const tagged = typeof tags.latest === 'string' ? tags.latest : undefined
  const timeRecord = packument?.time !== null && packument?.time !== undefined && typeof packument.time === 'object'
    ? (packument.time as Record<string, unknown>)
    : {}
  const names = Object.keys(versionsRecord)
  const taggedManifest = tagged === undefined ? undefined : versionsRecord[tagged]
  const repoUrl = githubUrlOf(packument, taggedManifest)
  const rows: VersionRow[] = names.map((version) => {
    const manifest = versionsRecord[version] ?? {}
    const engine = manifest?.engines?.dsh ?? manifest?.dsh?.engines?.dsh
    return {
      version,
      time: typeof timeRecord[version] === 'string' ? (timeRecord[version] as string) : undefined,
      deprecated: typeof manifest.deprecated === 'string' ? manifest.deprecated : undefined,
      engine: typeof engine === 'string' ? engine : undefined,
      current: version === installedVersion,
      latest: false,
      url: repoUrl === undefined ? undefined : releasePathOf(tagNames, version),
    }
  })
  rows.sort((left, right) => compareVersions(right.version, left.version))
  /** A tag below what is already installed is broken, not a release channel. */
  const broken =
    tagged !== undefined &&
    installedVersion !== undefined &&
    compareVersions(tagged, installedVersion) < 0
  let newest = tagged
  if (broken) {
    // Recover the real head of the line: the highest version above the
    // installed one, preferring a stable release over a prerelease.
    const above = rows.filter((row) => compareVersions(row.version, installedVersion as string) > 0)
    const stable = above.find((row) => !row.version.includes('-'))
    newest = (stable ?? above[0])?.version ?? tagged
  }
  for (const row of rows) row.latest = row.version === newest
  const kept = rows.slice(0, MAX_VERSIONS)
  const currentRow = rows.find((row) => row.current)
  if (currentRow !== undefined && !kept.includes(currentRow)) kept.push(currentRow)
  return {
    latest: newest,
    repoUrl,
    versions: kept,
    tags: Object.fromEntries(
      Object.entries(tags).filter((entry): boolean => typeof entry[1] === 'string'),
    ) as Record<string, string>,
    totalVersions: rows.length,
    ...(broken ? { staleTag: tagged } : {}),
  }
}
