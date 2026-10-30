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