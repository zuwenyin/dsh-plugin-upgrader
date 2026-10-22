/**
 * The overview payload the Versions tab renders.
 *
 * One request answers everything the tab needs — installed bundles, their
 * published versions, which of them are upgradable — because a per-bundle
 * request would turn one page open into a dozen round trips.
 *
 * @module dsh-plugin-upgrader/lib/overview
 */
import { compareVersions } from './version.ts'
import { repoUrlOf, type PackumentLike } from './repo.ts'
import { inlineIcon, pickText, registryBase, sourceKind, type SourceKind } from './bundle.ts'
import {
  cachedTags,
  fetchPackument,
  shapePackument,
  type FullPackument,
  type PackumentEntry,
  type TagEntry,
  type VersionRow,
} from './registry.ts'
import type { BundleInfo, HostContext, ManagementError, RegistriesReport, ReadOnlyReason } from './manager.ts'

/** Inline data-URL icons above this size are dropped from the overview payload. */
const INLINE_ICON_LIMIT = 2048

/** One installed bundle, flattened for the tab. */
export interface OverviewRow {
  name: string
  version?: string
  official: boolean
  availability: BundleInfo['availability']
  installed: boolean
  enabled: boolean
  removable: boolean
  managed: boolean
  source?: string
  kind: SourceKind
  title: string
  description?: string
  icon?: string
  readOnlyReason?: ReadOnlyReason
  error: ManagementError | null
  latest?: string
  repoUrl?: string
  upgradable: boolean
  versions: VersionRow[]
  tags: Record<string, string>
  totalVersions: number
  versionError?: string
}

/** The whole overview response body. */
export interface Overview {
  generatedAt: number
  registry: string
  registries: RegistriesReport
  runtimeVersion: string | null
  bundles: OverviewRow[]
}

/** Options for one overview build. */
export interface OverviewOptions {
  force?: boolean
  locale?: 'zh' | 'en'
}

/**
 * Build the overview the tab renders.
 *
 * @param ctx - the plugin context.
 * @param cache - packument cache.
 * @param tagCache - repository tag cache.
 * @param options - refresh + language.
 * @returns the overview payload.
 */
export async function buildOverview(
  ctx: HostContext,
  cache: Map<string, PackumentEntry>,
  tagCache: Map<string, TagEntry>,
  options: OverviewOptions,
): Promise<Overview> {
  const manager = ctx.get('pluginManager', false) as
    | { listBundles(): Promise<BundleInfo[]>; registries(): Promise<RegistriesReport> }
    | null
    | undefined
  if (manager === null || manager === undefined) {
    throw Object.assign(new Error('plugin manager unavailable'), { status: 503 })
  }
  const [bundles, registries] = await Promise.all([manager.listBundles(), manager.registries()])
  const base = registryBase(registries)
  const locale = options.locale === 'zh' ? 'zh' : 'en'

  const rows = await Promise.all(
    bundles.filter((bundle) => bundle.installed === true).map(async (bundle): Promise<OverviewRow> => {
      const kind = sourceKind(bundle.source)
      /** Official rows live inside the installation and cannot be replaced. */
      const managed = bundle.availability === 'profile' && bundle.installed === true
      const entry: OverviewRow = {
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
      if (bundle.version === undefined) {
        entry.versionError = managed ? 'version unknown' : 'not a profile-managed package'
        return entry
      }
      if (!managed) {
        entry.versionError = 'not a profile-managed package'
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
      const repoUrl = repoUrlOf(data as PackumentLike)
      const tagNames = repoUrl === undefined
        ? undefined
        : await cachedTags(repoUrl, tagCache, options.force === true)
      const shaped = shapePackument(data as FullPackument, bundle.version, tagNames)
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

  const runtime = ctx.get('dshVersion', false)
  return {
    generatedAt: Date.now(),
    registry: base,
    registries,
    runtimeVersion: typeof runtime === 'string' ? runtime : null,
    bundles: rows,
  }
}
