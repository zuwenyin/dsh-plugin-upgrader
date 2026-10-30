/**
 * The one setting this bundle lets a user change without editing files.
 *
 * `registry` is the source both halves work against: the overview asks it for
 * published versions and every install passes it to the manager. Leaving it
 * empty means "whatever pnpm itself is configured with", which is the behaviour
 * every earlier version had.
 *
 * The field is declared `volatile`, which is what makes it editable from the
 * browser at all: the host's settings service derives a form from a plugin's
 * Config schema and only exposes fields marked that way, and a volatile-only
 * write is committed into the running plugin's references instead of
 * restarting it. So a registry change applies to the next request, and the
 * choice survives in the profile patch without a DSH restart.
 *
 * @module dsh-plugin-upgrader/host/config
 */
import z from '@deepseek-ai/schemastery';
/** The public registry, named so the picker can offer it without a lookup. */
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
/** The mainland China mirror, for the same reason. */
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com/';
/**
 * Accepts an empty string (follow pnpm) or an absolute http(s) address.
 *
 * The same shape the manager enforces on its own `registry` option, so a value
 * this form accepts is a value `installBundle` will not reject.
 */
const REGISTRY_PATTERN = /^$|^https?:\/\/\S+$/;
/** The plugin's config schema. */
export const Config = z.object({
    registry: z.string().default('').pattern(REGISTRY_PATTERN).volatile(),
});
/**
 * Read the saved choice, tolerating a config object from an older host.
 *
 * A missing or non-volatile field, a plain string instead of a reference, and a
 * throwing accessor all mean the same thing here: nothing is saved, so follow
 * pnpm. Guessing anything else would silently redirect an install.
 *
 * @param config - the config `apply` received, possibly undefined.
 * @returns the saved registry, or an empty string.
 */
export function savedRegistry(config) {
    try {
        const value = config?.registry?.get?.();
        return typeof value === 'string' ? value.trim() : '';
    }
    catch {
        return '';
    }
}
/**
 * Normalize an address for comparison, never for use.
 *
 * Two spellings of one registry must collapse to one picker entry, but the
 * address that is finally saved has to keep its own case and path.
 *
 * @param url - a registry address.
 * @returns a comparison key.
 */
export function registryKey(url) {
    return url.trim().replace(/\/+$/, '').toLowerCase();
}
//# sourceMappingURL=config.js.map