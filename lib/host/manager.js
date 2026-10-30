/**
 * The slice of the host services this plugin uses.
 *
 * The published `@deepseek-ai/dsh-plugin-manager` types describe the manager as
 * the DSH shell sees it, including branded ids and fields this plugin never
 * touches. Depending on the whole surface would tie the build to one exact
 * runtime build, so the plugin declares the handful of methods it calls and
 * accepts the live service structurally. The shapes below follow the runtime
 * contract and are the only place a contract change has to be edited.
 *
 * @module dsh-plugin-upgrader/lib/manager
 */
/**
 * Narrow `unknown` to the manager, without asserting the whole surface blindly.
 *
 * @param value - whatever the context returned.
 * @returns the manager, or `undefined` when the service is absent.
 */
export function asPluginManager(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const candidate = value;
    if (typeof candidate.listBundles !== 'function' || typeof candidate.installBundle !== 'function') {
        return undefined;
    }
    return candidate;
}
//# sourceMappingURL=manager.js.map