import { type UpgraderConfig } from './host/config.ts';
import { type HostContext } from './host/manager.ts';
/**
 * The plugin's config schema, read by the loader before `apply` runs.
 *
 * Exported as a value rather than declared inside `apply` because the loader
 * looks for `Config` on the module namespace itself; a schema the running
 * plugin never exposes is a schema the settings page cannot find.
 */
export { Config } from './host/config.ts';
/** Stable plugin name; matches the cordis.patch.yml insert id. */
export declare const name = "plugin-upgrader";
/** The web server is the only hard dependency; pluginManager is read lazily. */
export declare const inject: string[];
/**
 * Mount the host half.
 *
 * @param ctx - the plugin context.
 * @param config - the validated config; `registry` is a live reference, so it
 *   is read per request instead of copied once at load.
 */
export declare function apply(ctx: HostContext, config?: UpgraderConfig): void;
//# sourceMappingURL=index.d.ts.map