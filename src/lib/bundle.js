/**
 * Bundle metadata helpers.
 *
 * These translate what the profile manager reports into the fields the tab
 * renders. Pure functions again: given the same bundle they answer the same
 * thing, which is what makes them testable.
 *
 * @module dsh-plugin-upgrader/lib/bundle
 */

/**
 * Classify how a profile dependency was declared.
 * @param {string | undefined} source - `BundleInfo.source`.
 * @returns {'registry' | 'path' | 'git' | 'tarball' | 'unknown'} the source family.
 */
export function sourceKind(source) {
  if (typeof source !== 'string' || source.trim() === '') return 'unknown'
  const value = source.trim()
  if (value.startsWith('file:') || value.startsWith('link:') || value.startsWith('.') || value.startsWith('/')) {
    return 'path'
  }
  if (/^(git|git\+|github:|https?:\/\/[^/]*\.git)/.test(value)) return 'git'
  if (/\.(tgz|tar\.gz)$/.test(value)) return 'tarball'
  if (/^(npm:|[\^~]?\d|[\^~]?(latest|next|beta|canary|rc)\b)/.test(value)) return 'registry'
  return 'unknown'
}

/**
 * Localized metadata value for the active display language.
 * @param {unknown} text - a string or `{ en, zh, … }`.
 * @param {'zh' | 'en'} locale - the requested language.
 * @returns {string | undefined} the best available text.
 */
export function pickText(text, locale) {
  if (typeof text === 'string') return text
  if (text !== null && typeof text === 'object') {
    const record = /** @type {Record<string, string>} */ (text)
    return record[locale] ?? record.en ?? record.zh ?? Object.values(record)[0]
  }
  return undefined
}

/**
 * Keep an icon only when it is cheap to send: bundle metadata often embeds a
 * base64 data URL, which would bloat every overview response by ~150 KB.
 * @param {unknown} icon - the manifest icon.
 * @param {number} limit - the largest inline data URL worth sending.
 * @returns {string | undefined} a usable reference.
 */
export function inlineIcon(icon, limit) {
  if (typeof icon !== 'string' || icon === '') return undefined
  return icon.startsWith('data:') && icon.length > limit ? undefined : icon
}

/**
 * Registry base URL: `null` is pnpm's own configured registry.
 * @param {{ registry?: string | null, resolved?: string | null } | undefined} registries - manager answer.
 * @returns {string} a URL without a trailing slash.
 */
export function registryBase(registries) {
  const candidate = registries?.registry ?? registries?.resolved ?? null
  const value = typeof candidate === 'string' && candidate !== '' ? candidate : 'https://registry.npmjs.org/'
  return value.replace(/\/+$/, '')
}
