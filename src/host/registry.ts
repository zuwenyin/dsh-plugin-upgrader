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

/** Registry lookups must not hang a page render. */
export const PACKUMENT_TIMEOUT_MS = 10 * 1000

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
}

/** One cached tag lookup. */
export interface TagEntry {
  at: number
  tags?: Set<string>
  error?: string
}

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
}

/** The packument slice the tab renders. */
export interface ShapedPackument {
  latest?: string
  repoUrl?: string
  versions: VersionRow[]
  tags: Record<string, string>
  totalVersions?: number
  versionError?: string
}

/**
 * Fetch one package's packument, with a short-lived cache.
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
  if (force !== true && hit !== undefined && Date.now() - hit.at < PACKUMENT_TTL_MS) {
    return { data: hit.data }
  }
  const url = `${base}/${packageName.startsWith('@') ? '@' + encodeURIComponent(packageName.slice(1)) : encodeURIComponent(packageName)}`
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PACKUMENT_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { error: `registry ${response.status}${response.status === 404 ? ' (not found)' : ''}` }
    }
    const data: unknown = await response.json()
    cache.set(key, { at: Date.now(), data })
    return { data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `registry unreachable: ${message}` }
  }
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

/**
 * Trim one packument down to what the tab renders.
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
  const newest = tags.latest
  const timeRecord = packument?.time !== null && packument?.time !== undefined && typeof packument.time === 'object'
    ? (packument.time as Record<string, unknown>)
    : {}
  const names = Object.keys(versionsRecord)
  const newestManifest = typeof newest === 'string' ? versionsRecord[newest] : undefined
  const repoUrl = githubUrlOf(packument, newestManifest)
  const rows: VersionRow[] = names.map((version) => {
    const manifest = versionsRecord[version] ?? {}
    const engine = manifest?.engines?.dsh ?? manifest?.dsh?.engines?.dsh
    return {
      version,
      time: typeof timeRecord[version] === 'string' ? (timeRecord[version] as string) : undefined,
      deprecated: typeof manifest.deprecated === 'string' ? manifest.deprecated : undefined,
      engine: typeof engine === 'string' ? engine : undefined,
      current: version === installedVersion,
      latest: version === newest,
      url: repoUrl === undefined ? undefined : releasePathOf(tagNames, version),
    }
  })
  rows.sort((left, right) => compareVersions(right.version, left.version))
  const kept = rows.slice(0, MAX_VERSIONS)
  const currentRow = rows.find((row) => row.current)
  if (currentRow !== undefined && !kept.includes(currentRow)) kept.push(currentRow)
  return {
    latest: typeof newest === 'string' ? newest : undefined,
    repoUrl,
    versions: kept,
    tags: Object.fromEntries(
      Object.entries(tags).filter((entry): boolean => typeof entry[1] === 'string'),
    ) as Record<string, string>,
    totalVersions: rows.length,
  }
}
