/**
 * Bundle metadata helpers.
 *
 * These translate what the profile manager reports into the fields the tab
 * renders. Pure functions again: given the same bundle they answer the same
 * thing, which is what makes them testable.
 *
 * @module dsh-plugin-upgrader/lib/bundle
 */

/** How a profile dependency was declared. */
export type SourceKind = 'registry' | 'path' | 'git' | 'tarball' | 'unknown'

/** The display languages this bundle ships. */
export type Locale = 'zh' | 'en'

/**
 * Classify how a profile dependency was declared.
 *
 * @param source - `BundleInfo.source`.
 * @returns the source family.
 */
export function sourceKind(source: unknown): SourceKind {
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
 *
 * @param text - a string or `{ en, zh, … }`.
 * @param locale - the requested language.
 * @returns the best available text.
 */
export function pickText(text: unknown, locale: Locale): string | undefined {
  if (typeof text === 'string') return text
  if (text !== null && typeof text === 'object') {
    const record = text as Record<string, string | undefined>
    return record[locale] ?? record.en ?? record.zh ?? Object.values(record)[0]
  }
  return undefined
}

/**
 * Keep an icon only when it is cheap to send.
 *
 * Bundle metadata often embeds a base64 data URL, which would bloat every
 * overview response by ~150 KB.
 *
 * @param icon - the manifest icon.
 * @param limit - the largest inline data URL worth sending.
 * @returns a usable reference.
 */
export function inlineIcon(icon: unknown, limit: number): string | undefined {
  if (typeof icon !== 'string' || icon === '') return undefined
  return icon.startsWith('data:') && icon.length > limit ? undefined : icon
}

/** What `pluginManager.registries()` reports. */
export interface RegistryReport {
  registry?: string | null
  resolved?: string | null
}

/**
 * Registry base URL: `null` is pnpm's own configured registry.
 *
 * @param registries - manager answer.
 * @returns a URL without a trailing slash.
 */
export function registryBase(registries: RegistryReport | undefined | null): string {
  const candidate = registries?.registry ?? registries?.resolved ?? null
  const value = typeof candidate === 'string' && candidate !== '' ? candidate : 'https://registry.npmjs.org/'
  return value.replace(/\/+$/, '')
}
