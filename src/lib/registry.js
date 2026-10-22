/**
 * Registry and GitHub lookups.
 *
 * The browser half cannot reach npm reliably (CORS, private registries, tokens)
 * and cannot reach the GitHub API at all without leaking rate limits to every
 * page load, so both lookups happen here, behind a cache.
 *
 * @module dsh-plugin-upgrader/lib/registry
 */

import { compareVersions, releasePathOf } from './version.js'
import { githubUrlOf } from './repo.js'

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

/**
 * Fetch one package's packument, with a short-lived cache.
 * @param {string} base - registry base URL.
 * @param {string} packageName - package name.
 * @param {Map<string, { at: number, data: any }>} cache - shared cache.
 * @param {boolean} force - bypass a fresh cache entry.
 * @returns {Promise<{ data?: any, error?: string }>} the document or a reason.
 */
export async function fetchPackument(base, packageName, cache, force) {
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
    const data = await response.json()
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
 * @param {string} repoUrl - the repository URL.
 * @param {number} at - the time the lookup started.
 * @returns {Promise<{ tags?: Set<string>, error?: string, at: number }>} the outcome.
 */
export async function fetchTags(repoUrl, at) {
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
    const list = await response.json()
    if (!Array.isArray(list)) return { error: 'github returned no tag list', at }
    const tags = new Set()
    for (const entry of list) {
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
 * @param {string} repoUrl - the repository URL.
 * @param {Map<string, { at: number, tags?: Set<string>, error?: string }>} cache - shared cache.
 * @param {boolean} force - bypass a fresh cache entry.
 * @returns {Promise<Set<string> | undefined>} the tag names, or undefined when unknown.
 */
export async function cachedTags(repoUrl, cache, force) {
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
 * @param {string} packageName - the package asked for.
 * @param {any} packument - the full registry document.
 * @param {string | undefined} installedVersion - the version in the profile.
 * @param {Set<string> | undefined} tagNames - the repository's tag names, when known.
 * @returns {{
 *   latest?: string,
 *   repoUrl?: string,
 *   versions: any[],
 *   tags: Record<string, string>,
 *   totalVersions?: number,
 *   versionError?: string,
 * }} the slice.
 */
export function shapePackument(packageName, packument, installedVersion, tagNames) {
  const versionsRecord = packument?.versions
  if (versionsRecord === null || typeof versionsRecord !== 'object') {
    return { versions: [], tags: {}, versionError: 'registry returned no versions' }
  }
  const tags = packument['dist-tags'] !== null && typeof packument['dist-tags'] === 'object'
    ? packument['dist-tags']
    : {}
  const newest = tags.latest
  const timeRecord = packument.time !== null && typeof packument.time === 'object' ? packument.time : {}
  const names = Object.keys(versionsRecord)
  const newestManifest = typeof newest === 'string' ? versionsRecord[newest] : undefined
  const repoUrl = githubUrlOf(packument, newestManifest)
  const rows = names.map((version) => {
    const manifest = versionsRecord[version] ?? {}
    const engine = manifest?.engines?.dsh ?? manifest?.dsh?.engines?.dsh
    return {
      version,
      time: typeof timeRecord[version] === 'string' ? timeRecord[version] : undefined,
      deprecated: typeof manifest.deprecated === 'string' ? manifest.deprecated : undefined,
      engine: typeof engine === 'string' ? engine : undefined,
      current: version === installedVersion,
      latest: version === newest,
      url: repoUrl === undefined ? undefined : releasePathOf(tagNames, version),
    }
  })
  rows.sort((left, right) => compareVersions(right.version, left.version))
  const kept = rows.slice(0, MAX_VERSIONS)
  const currentRow = rows.find((row) => row.current === true)
  if (currentRow !== undefined && !kept.includes(currentRow)) kept.push(currentRow)
  return {
    latest: typeof newest === 'string' ? newest : undefined,
    repoUrl,
    versions: kept,
    tags: Object.fromEntries(
      Object.entries(tags).filter(([, value]) => typeof value === 'string'),
    ),
    totalVersions: rows.length,
  }
}
