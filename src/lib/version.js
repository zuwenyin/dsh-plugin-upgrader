/**
 * Version ordering and release-link helpers.
 *
 * Everything here is pure: no I/O, no clock, no ambient state. The host half
 * uses it to sort published versions and to decide which GitHub page a version
 * line opens, and the test suite exercises it directly.
 *
 * @module dsh-plugin-upgrader/lib/version
 */

/**
 * Parse a semver string into comparable parts.
 * @param {string} value - a version like `1.2.3-rc.1`.
 * @returns {{ major: number, minor: number, patch: number, pre: string[] } | null} parts, or null.
 */
export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(value ?? '').trim(),
  )
  if (match === null) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] === undefined ? [] : match[4].split('.'),
  }
}

/**
 * Compare two prerelease identifier lists, semver order.
 * @param {string[]} left - identifiers of the left version.
 * @param {string[]} right - identifiers of the right version.
 * @returns {number} negative, zero, or positive.
 */
export function comparePre(left, right) {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const delta = Number(a) - Number(b)
      if (delta !== 0) return delta
      continue
    }
    if (aNumeric) return -1
    if (bNumeric) return 1
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

/**
 * Compare two versions, semver order; unparsable pairs compare equal.
 * @param {string} left - left version.
 * @param {string} right - right version.
 * @returns {number} negative when left is older.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) return 0
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    comparePre(a.pre, b.pre)
  )
}

/**
 * The tag a published version was released under.
 * @param {string} version - the published version.
 * @returns {string} `v<version>` unless the version already carries the `v`.
 */
export function tagOf(version) {
  return version.startsWith('v') ? version : `v${version}`
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
 * @param {Set<string> | undefined} tags - the repository's tag names, when known.
 * @param {string} version - the published version.
 * @returns {string} a protocol-relative path such as `/releases/tag/v1.2.3`.
 */
export function releasePathOf(tags, version) {
  const tag = tagOf(version)
  return tags?.has(tag) === true ? `/releases/tag/${tag}` : '/releases'
}
