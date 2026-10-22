/**
 * The overview payload the Versions tab renders.
 *
 * One request answers everything the tab needs — installed bundles, their
 * published versions, which of them are upgradable — because a per-bundle
 * request would turn one page open into a dozen round trips.
 *
 * @module dsh-plugin-upgrader/lib/overview
 */

import { compareVersions } from './version.js'
import { repoUrlOf } from './repo.js'
import { inlineIcon, pickText, registryBase, sourceKind } from './bundle.js'
import { cachedTags, fetchPackument, shapePackument } from './registry.js'

/** Inline data-URL icons above this size are dropped from the overview payload. */
const INLINE_ICON_LIMIT = 2048

/**
 * Build the overview the tab renders.
 * @param {any} ctx - the plugin context.
 * @param {Map<string, { at: number, data: any }>} cache - packument cache.
 * @param {Map<string, { at: number, tags?: Set<string>, error?: string }>} tagCache - repository tag cache.
 * @param {{ force?: boolean, locale?: 'zh' | 'en' }} options - refresh + language.
 * @returns {Promise<any>} the overview payload.
 */
export async function buildOverview(ctx, cache, tagCache, options) {
  const manager = ctx.get('pluginManager', false)
  if (manager === undefined || manager === null) {
    throw Object.assign(new Error('plugin manager unavailable'), { status: 503 })
  }
  const [bundles, registries] = await Promise.all([manager.listBundles(), manager.registries()])
  const base = registryBase(registries)
  const locale = options.locale === 'zh' ? 'zh' : 'en'

  const rows = await Promise.all(
    bundles.filter((bundle) => bundle.installed === true).map(async (bundle) => {
      const kind = sourceKind(bundle.source)
      /** Official rows live inside the installation and cannot be replaced. */
      const managed = bundle.availability === 'profile' && bundle.installed === true
      const entry = {
        name: bundle.name,
        version: bundle.version,
        official: bundle.official === true,
        availability: bundle.availability,
        installed: bundle.installed === true,
        enabled: bundle.enabled === true,
        removable: bundle.removable === true,
        managed,
        source: bundle.source,
        kind,
        title: pickText(bundle.meta?.title, locale) ?? bundle.name,
        description: pickText(bundle.meta?.description ?? bundle.description, locale),
        icon: inlineIcon(bundle.meta?.icon, INLINE_ICON_LIMIT),
        readOnlyReason: bundle.readOnlyReason,
        error: bundle.error ?? null,
        latest: undefined,
        repoUrl: undefined,
        upgradable: false,
        versions: [],
        tags: {},
        totalVersions: 0,
        versionError: undefined,
      }
      if (!managed || bundle.version === undefined) {
        entry.versionError = managed ? 'version unknown' : 'not a profile-managed package'
        return entry
      }
      if (kind !== 'registry' && kind !== 'unknown') {
        entry.versionError = `${kind} source: no registry history`
        return entry
      }
      const { data, error } = await fetchPackument(base, bundle.name, cache, options.force === true)
      if (error !== undefined || data === undefined) {
        entry.versionError = error ?? 'registry lookup failed'
        return entry
      }
      const repoUrl = repoUrlOf(data)
      const tagNames = repoUrl === undefined
        ? undefined
        : await cachedTags(repoUrl, tagCache, options.force === true)
      const shaped = shapePackument(bundle.name, data, bundle.version, tagNames)
      entry.latest = shaped.latest
      entry.repoUrl = shaped.repoUrl
      entry.versions = shaped.versions
      entry.tags = shaped.tags
      entry.totalVersions = shaped.totalVersions ?? shaped.versions.length
      entry.versionError = shaped.versionError
      entry.upgradable =
        entry.latest !== undefined && compareVersions(entry.latest, bundle.version) > 0
      return entry
    }),
  )

  rows.sort((left, right) => {
    if (left.upgradable !== right.upgradable) return left.upgradable ? -1 : 1
    if (left.managed !== right.managed) return left.managed ? -1 : 1
    return left.name.localeCompare(right.name)
  })

  return {
    generatedAt: Date.now(),
    registry: base,
    registries,
    runtimeVersion: ctx.get('dshVersion', false) ?? null,
    bundles: rows,
  }
}
