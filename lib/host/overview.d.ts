import { type SourceKind } from './bundle.ts';
import { type PackumentEntry, type TagEntry, type VersionRow } from './registry.ts';
import type { BundleInfo, HostContext, ManagementError, RegistriesReport, ReadOnlyReason } from './manager.ts';
/** One installed bundle, flattened for the tab. */
export interface OverviewRow {
    name: string;
    version?: string;
    official: boolean;
    availability: BundleInfo['availability'];
    installed: boolean;
    enabled: boolean;
    removable: boolean;
    managed: boolean;
    source?: string;
    kind: SourceKind;
    title: string;
    description?: string;
    icon?: string;
    readOnlyReason?: ReadOnlyReason;
    error: ManagementError | null;
    latest?: string;
    repoUrl?: string;
    upgradable: boolean;
    versions: VersionRow[];
    tags: Record<string, string>;
    totalVersions: number;
    versionError?: string;
    /**
     * Releases the upstream registry has that the configured one does not.
     *
     * Newest first. Present only when the profile installs from a mirror that is
     * behind: the tab names them so a lagging mirror is visible instead of looking
     * like an up-to-date package.
     */
    mirrorMissing?: string[];
    /**
     * The DSH requirement of {@link latest}, when that release cannot run here.
     *
     * The upgrade button targets `latest`, so a newer release the host would
     * refuse has to be visible as a refusal, not as an upgrade that fails halfway
     * through. Set only when `latest` is newer than what is installed and its
     * declared requirement excludes this runtime.
     */
    blocked?: {
        version: string;
        requires: string;
    };
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
    installedIncompatible?: {
        requires: string;
    };
    /**
     * The newest release this runtime is allowed to install, above the installed
     * one.
     *
     * Equal to {@link latest} in the ordinary case. It differs when `latest`
     * cannot run here: the row then offers the best release it *can* install
     * instead of going dead. Never above `latest` — a prerelease published after
     * the tag is not something this tab gets to promote (AGENTS.md §5).
     */
    recommended?: string;
}
/** The whole overview response body. */
export interface Overview {
    generatedAt: number;
    /** The registry the versions were read from, without a trailing slash. */
    registry: string;
    /**
     * The registry saved in this plugin's own config, verbatim.
     *
     * Empty means "follow pnpm", which is not the same as `registry` above: that
     * one has already been resolved to a concrete address, so it cannot tell the
     * picker whether the user made a choice or is riding on pnpm's config.
     */
    savedRegistry: string;
    registries: RegistriesReport;
    runtimeVersion: string | null;
    bundles: OverviewRow[];
}
/** Options for one overview build. */
export interface OverviewOptions {
    force?: boolean;
    locale?: 'zh' | 'en';
    /** The registry saved in this plugin's config; empty follows pnpm. */
    registry?: string;
    /**
     * The DSH runtime version to judge versions against.
     *
     * Injected by the tests; the host call leaves it out and the version is read
     * from the running process instead.
     */
    runtimeVersion?: string;
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
export declare function buildOverview(ctx: HostContext, cache: Map<string, PackumentEntry>, tagCache: Map<string, TagEntry>, options: OverviewOptions): Promise<Overview>;
//# sourceMappingURL=overview.d.ts.map