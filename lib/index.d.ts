import { type HostContext } from './host/manager.ts';
/** Stable plugin name; matches the cordis.patch.yml insert id. */
export declare const name = "plugin-upgrader";
/** The web server is the only hard dependency; pluginManager is read lazily. */
export declare const inject: string[];
/**
 * Mount the host half.
 *
 * @param ctx - the plugin context.
 */
export declare function apply(ctx: HostContext): void;
//# sourceMappingURL=index.d.ts.map