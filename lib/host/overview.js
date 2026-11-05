/**
 * The overview payload the Versions tab renders.
 *
 * One request answers everything the tab needs — installed bundles, their
 * published versions, which of them are upgradable — because a per-bundle
 * request would turn one page open into a dozen round trips.
 *
 * @module dsh-plugin-upgrader/lib/overview
 */
import { compareVersions } from './version.js';
import { repoUrlOf } from './repo.js';
import { inlineIcon, pickText, registryBase, sourceKind } from './bundle.js';
import { runtimeVersionOf } from './runtime.js';
import { cachedTags, fetchPackument, shapePackument, versionsMissingFromMirror, PACKUMENT_CONCURRENCY, } from './registry.js';
/** Inline data-URL icons above this size are dropped from the overview payload. */
const INLINE_ICON_LIMIT = 2048;
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
async function mapLimited(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        for (;;) {
            const index = next;
            next += 1;
            const item = items[index];
            if (item === undefined)
                return;
            results[index] = await task(item);
        }
    });
    await Promise.all(workers);
    return results;
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
export async function buildOverview(ctx, cache, tagCache, options) {
    const manager = ctx.get('pluginManager', false);
    if (manager === null || manager === undefined) {
        throw Object.assign(new Error('plugin manager unavailable'), { status: 503 });
    }
    const [bundles, registries] = await Promise.all([manager.listBundles(), manager.registries()]);
    const savedRegistry = typeof options.registry === 'string' ? options.registry.trim() : '';
    const base = registryBase(registries, savedRegistry);
    const locale = options.locale === 'zh' ? 'zh' : 'en';
    /*
     * The runtime version the host's own gate quotes decides whether a published
     * version can be installed at all. It is read from this process rather than
     * from the profile, because a profile's `node_modules` holds links into an npx
     * cache that can be a different build entirely.
     */
    const runtimeVersion = typeof options.runtimeVersion === 'string'
        ? options.runtimeVersion
        : runtimeVersionOf(process.argv);
    const installed = bundles.filter((bundle) => bundle.installed === true);
    const rows = await mapLimited(installed, PACKUMENT_CONCURRENCY, async (bundle) => {
        const kind = sourceKind(bundle.source);
        /** Official rows live inside the installation and cannot be replaced. */
        const managed = bundle.availability === 'profile' && bundle.installed === true;
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
        };
        if (bundle.version === undefined) {
            entry.versionError = managed ? 'version unknown' : 'not a profile-managed package';
            return entry;
        }
        if (!managed) {
            entry.versionError = 'not a profile-managed package';
            return entry;
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
            const { data } = await fetchPackument(base, bundle.name, cache, options.force === true);
            if (data === undefined) {
                entry.versionError = 'local path install: the registry has no published copy';
                return entry;
            }
            /*
             * Pass the installed version through even though this package did not come
             * from the registry: `shapePackument` uses it to mark which row is the one
             * actually loaded. Omitting it left every row `current: false`, so the
             * version the user already has still offered a "back to latest" button.
             */
            const shaped = shapePackument(data, bundle.version, undefined, runtimeVersion);
            entry.latest = shaped.latest;
            entry.repoUrl = shaped.repoUrl;
            entry.versions = shaped.versions;
            entry.tags = shaped.tags;
            entry.totalVersions = shaped.totalVersions ?? shaped.versions.length;
            entry.versionError = 'local path install: the version comes from the directory, not the registry';
            // Never upgradable: replacing a `link:` with a registry tarball would
            // change how the plugin is installed, which is not an upgrade.
            entry.upgradable = false;
            return entry;
        }
        if (kind !== 'registry' && kind !== 'unknown') {
            entry.versionError = `${kind} source: no registry history`;
            return entry;
        }
        const { data, error } = await fetchPackument(base, bundle.name, cache, options.force === true);
        if (error !== undefined || data === undefined) {
            entry.versionError = error ?? 'registry lookup failed';
            return entry;
        }
        const repoUrl = repoUrlOf(data);
        const tagNames = repoUrl === undefined
            ? undefined
            : await cachedTags(repoUrl, tagCache, options.force === true);
        const shaped = shapePackument(data, bundle.version, tagNames, runtimeVersion);
        entry.latest = shaped.latest;
        entry.repoUrl = shaped.repoUrl;
        entry.versions = shaped.versions;
        entry.tags = shaped.tags;
        entry.totalVersions = shaped.totalVersions ?? shaped.versions.length;
        entry.versionError = shaped.versionError;
        entry.upgradable =
            entry.latest !== undefined && compareVersions(entry.latest, bundle.version) > 0;
        /*
         * A newer release the host would refuse is not an upgrade. The install would
         * be rejected by the compatibility gate after the manager had already
         * started replacing the bundle, which is how a "switch version" click used
         * to leave the package removed. Mark it instead: the row says why, and the
         * version list keeps the same answer for every older release.
         */
        if (entry.upgradable && entry.latest !== undefined) {
            const head = shaped.versions.find((version) => version.version === entry.latest);
            if (head !== undefined && head.compatible === false) {
                entry.upgradable = false;
                entry.blocked = { version: head.version, requires: head.requires ?? '' };
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
        const recommended = shaped.versions.find((version) => version.compatible !== false &&
            compareVersions(version.version, bundle.version ?? '') > 0 &&
            entry.latest !== undefined &&
            compareVersions(version.version, entry.latest) <= 0);
        if (recommended !== undefined) {
            entry.recommended = recommended.version;
            /*
             * `blocked` above turned the upgrade off because `latest` would be
             * refused. If some other release does pass the gate, the row is still
             * upgradable — to that one. Without this the whole row goes dead, which is
             * the state a person cannot act on.
             */
            entry.upgradable = true;
        }
        /*
         * The release that is installed can be incompatible too, and that is the
         * worse half of the same story: DSH already refuses to activate it, so the
         * tab is looking at a plugin that is not running. `blocked` never covered
         * this — it is computed from `latest`, not from what is on disk.
         */
        const current = shaped.versions.find((version) => version.current === true);
        if (current !== undefined && current.compatible === false) {
            entry.installedIncompatible = { requires: current.requires ?? '' };
        }
        /*
         * Ask the upstream registry what this mirror is missing. The mirror's own
         * document cannot answer that — it simply omits the version — so without
         * this the tab looks up to date while npm has a newer release that the
         * profile cannot install. Naming it is the difference between "nothing to do"
         * and "there is a newer version, your mirror has not caught up".
         */
        const missing = await versionsMissingFromMirror(base, bundle.name, bundle.version, cache, options.force === true);
        if (missing.length > 0)
            entry.mirrorMissing = missing;
        return entry;
    });
    rows.sort((left, right) => {
        if (left.upgradable !== right.upgradable)
            return left.upgradable ? -1 : 1;
        if (left.managed !== right.managed)
            return left.managed ? -1 : 1;
        return left.name.localeCompare(right.name);
    });
    const runtime = ctx.get('dshVersion', false);
    return {
        generatedAt: Date.now(),
        registry: base,
        savedRegistry,
        registries,
        runtimeVersion: typeof runtime === 'string' ? runtime : (runtimeVersion ?? null),
        bundles: rows,
    };
}
//# sourceMappingURL=overview.js.map