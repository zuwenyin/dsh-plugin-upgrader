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
import { runtimeVersionOf } from './runtime.ts'
import {
  cachedTags,
  fetchPackument,
  shapePackument,
  versionsMissingFromMirror,
  PACKUMENT_CONCURRENCY,
  type FullPackument,
  type PackumentEntry,
  type TagEntry,
  type VersionRow,
} from './registry.ts'
import type { BundleInfo, HostContext, ManagementError, RegistriesReport, ReadOnlyReason } from './manager.ts'

/** Inline data-URL icons above this size are dropped from the overview payload. */
const INLINE_ICON_LIMIT = 2048

/**
 * Run `task` over every item, with at most `limit` running at once.
 *
 * The first version of this used `Promise.all`, which fired every package
 * lookup at the mirror simultaneously. Eleven concurrent connections to
 * `registry.npmmirror.com` timed out, while the same eleven asked one at a time
 * answered in under 1.2 s — and each timeout rendered as a plugin with no
 * version history. The cap is what keeps one page load from becoming a burst.
 *
 * @param items - the work items.
 * @param limit - how many may run at once.
 * @param task - the work itself.
 * @returns the results, in the order the items were given.
 */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) return
      results[index] = await task(item)
    }
  })
  await Promise.all(workers)
  return results
}

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
  /**
   * Releases the upstream registry has that the configured one does not.
   *
   * Newest first. Present only when the profile installs from a mirror that is
   * behind: the tab names them so a lagging mirror is visible instead of looking
   * like an up-to-date package.
   */
  mirrorMissing?: string[]
  /**
   * The DSH requirement of {@link latest}, when that release cannot run here.
   *
   * The upgrade button targets `latest`, so a newer release the host would
   * refuse has to be visible as a refusal, not as an upgrade that fails halfway
   * through. Set only when `latest` is newer than what is installed and its
   * declared requirement excludes this runtime.
   */
  blocked?: { version: string; requires: string }
  /**
   * The DSH requirement of the release that is *already installed*, when that
   * release cannot run here.
   *
   * This is the mirror image of {@link blocked}: `blocked` says "the newer one
   * would be refused", this says "the one you are running was never allowed".
   * Without it a plugin that DSH has already silently stopped activating looks
   * like an ordinary up-to-date row, because every field that describes it is
   * about the versions it could move to.
   *
   * Read from the registry's copy of the installed version. A `link:`/`file:`
   * install is deliberately left out: the local directory is authoritative
   * there, and judging it by the published manifest of the same version number
   * would report a requirement that is not the one actually declared.
   */
  installedIncompatible?: { requires: string }
  /**
   * The newest release this runtime is allowed to install, above the installed
   * one.
   *
   * Equal to {@link latest} in the ordinary case. It differs when `latest`
   * cannot run here: the row then offers the best release it *can* install
   * instead of going dead. Never above `latest` — a prerelease published after
   * the tag is not something this tab gets to promote (AGENTS.md §5).
   */
  recommended?: string
}

/** The whole overview response body. */
export interface Overview {
  generatedAt: number
  /** The registry the versions were read from, without a trailing slash. */
  registry: string
  /**
   * The registry saved in this plugin's own config, verbatim.
   *
   * Empty means "follow pnpm", which is not the same as `registry` above: that
   * one has already been resolved to a concrete address, so it cannot tell the
   * picker whether the user made a choice or is riding on pnpm's config.
   */
  savedRegistry: string
  registries: RegistriesReport
  runtimeVersion: string | null
  bundles: OverviewRow[]
}

/** Options for one overview build. */
export interface OverviewOptions {
  force?: boolean
  locale?: 'zh' | 'en'
  /** The registry saved in this plugin's config; empty follows pnpm. */
  registry?: string
  /**
   * The DSH runtime version to judge versions against.
   *
   * Injected by the tests; the host call leaves it out and the version is read
   * from the running process instead.
   */
  runtimeVersion?: string
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
  const savedRegistry = typeof options.registry === 'string' ? options.registry.trim() : ''
  const base = registryBase(registries, savedRegistry)
  const locale = options.locale === 'zh' ? 'zh' : 'en'
  /*
   * The runtime version the host's own gate quotes decides whether a published
   * version can be installed at all. It is read from this process rather than
   * from the profile, because a profile's `node_modules` holds links into an npx
   * cache that can be a different build entirely.
   */
  const runtimeVersion = typeof options.runtimeVersion === 'string'
    ? options.runtimeVersion
    : runtimeVersionOf(process.argv)

  const installed = bundles.filter((bundle) => bundle.installed === true)
  const rows = await mapLimited(installed, PACKUMENT_CONCURRENCY, async (bundle): Promise<OverviewRow> => {
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
    if (kind === 'path') {
      /**
       * A `link:`/`file:` dependency has no published history of its own, but it
       * is not an unanswerable row either: the local directory has a version and
       * the registry may publish the same package name. Saying only "path
       * source" left the row with an arrow and no numbers at all, which reads as
       * a broken plugin. Ask the registry anyway and keep the local version as
       * what is installed.
       */
      const { data } = await fetchPackument(base, bundle.name, cache, options.force === true)
      if (data === undefined) {
        entry.versionError = 'local path install: the registry has no published copy'
        return entry
      }
      /*
       * Pass the installed version through even though this package did not come
       * from the registry: `shapePackument` uses it to mark which row is the one
       * actually loaded. Omitting it left every row `current: false`, so the
       * version the user already has still offered a "back to latest" button.
       */
      const shaped = shapePackument(data as FullPackument, bundle.version, undefined, runtimeVersion)
      entry.latest = shaped.latest
      entry.repoUrl = shaped.repoUrl
      entry.versions = shaped.versions
      entry.tags = shaped.tags
      entry.totalVersions = shaped.totalVersions ?? shaped.versions.length
      entry.versionError = 'local path install: the version comes from the directory, not the registry'
      // Never upgradable: replacing a `link:` with a registry tarball would
      // change how the plugin is installed, which is not an upgrade.
      entry.upgradable = false
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
    const shaped = shapePackument(data as FullPackument, bundle.version, tagNames, runtimeVersion)
    entry.latest = shaped.latest
    entry.repoUrl = shaped.repoUrl
    entry.versions = shaped.versions
    entry.tags = shaped.tags
    entry.totalVersions = shaped.totalVersions ?? shaped.versions.length
    entry.versionError = shaped.versionError
    entry.upgradable =
      entry.latest !== undefined && compareVersions(entry.latest, bundle.version) > 0
    /*
     * A newer release the host would refuse is not an upgrade. The install would
     * be rejected by the compatibility gate after the manager had already
     * started replacing the bundle, which is how a "switch version" click used
     * to leave the package removed. Mark it instead: the row says why, and the
     * version list keeps the same answer for every older release.
     */
    if (entry.upgradable && entry.latest !== undefined) {
      const head = shaped.versions.find((version) => version.version === entry.latest)
      if (head !== undefined && head.compatible === false) {
        entry.upgradable = false
        entry.blocked = { version: head.version, requires: head.requires ?? '' }
      }
    }
    /*
     * The best release this runtime can actually install. `versions` is already
     * sorted newest first, and `compatible` is only ever `false` when the host
     * gate would refuse the install, so the first allowed entry above the
     * installed version is the answer. It is usually `latest` itself; when it
     * is not, the row keeps a working button instead of a dead one that only
     * explains why it cannot be pressed.
     */
    const recommended = shaped.versions.find(
      (version) =>
        version.compatible !== false &&
        compareVersions(version.version, bundle.version ?? '') > 0 &&
        entry.latest !== undefined &&
        compareVersions(version.version, entry.latest) <= 0,
    )
    if (recommended !== undefined) {
      entry.recommended = recommended.version
      /*
       * `blocked` above turned the upgrade off because `latest` would be
       * refused. If some other release does pass the gate, the row is still
       * upgradable — to that one. Without this the whole row goes dead, which is
       * the state a person cannot act on.
       */
      entry.upgradable = true
    }
    /*
     * The release that is installed can be incompatible too, and that is the
     * worse half of the same story: DSH already refuses to activate it, so the
     * tab is looking at a plugin that is not running. `blocked` never covered
     * this — it is computed from `latest`, not from what is on disk.
     */
    const current = shaped.versions.find((version) => version.current === true)
    if (current !== undefined && current.compatible === false) {
      entry.installedIncompatible = { requires: current.requires ?? '' }
    }
    /*
     * Ask the upstream registry what this mirror is missing. The mirror's own
     * document cannot answer that — it simply omits the version — so without
     * this the tab looks up to date while npm has a newer release that the
     * profile cannot install. Naming it is the difference between "nothing to do"
     * and "there is a newer version, your mirror has not caught up".
     */
    const missing = await versionsMissingFromMirror(
      base,
      bundle.name,
      bundle.version,
      cache,
      options.force === true,
    )
    if (missing.length > 0) entry.mirrorMissing = missing
    return entry
  })

  rows.sort((left, right) => {
    if (left.upgradable !== right.upgradable) return left.upgradable ? -1 : 1
    if (left.managed !== right.managed) return left.managed ? -1 : 1
    return left.name.localeCompare(right.name)
  })

  const runtime = ctx.get('dshVersion', false)
  return {
    generatedAt: Date.now(),
    registry: base,
    savedRegistry,
    registries,
    runtimeVersion: typeof runtime === 'string' ? runtime : (runtimeVersion ?? null),
    bundles: rows,
  }
}
