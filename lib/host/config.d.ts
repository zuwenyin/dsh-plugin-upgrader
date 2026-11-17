/**
 * The settings this bundle lets a user change without editing files.
 *
 * `registry` is the source both halves work against: the overview asks it for
 * published versions and every install passes it to the manager. Leaving it
 * empty means "whatever pnpm itself is configured with", which is the behaviour
 * every earlier version had.
 *
 * `customRegistries` is the user's own source list, shown beside the two
 * built-in addresses so a private registry does not have to be retyped every
 * time. The built-ins live in this module, not in that array, which is exactly
 * why the browser cannot edit or delete them.
 *
 * Both fields are declared `volatile`, which is what makes them editable from
 * the browser at all: the host's settings service derives a form from a plugin's
 * Config schema and only exposes fields marked that way, and a volatile-only
 * write is committed into the running plugin's references instead of
 * restarting it. So a registry change applies to the next request, and the
 * choice survives in the profile patch without a DSH restart.
 *
 * @module dsh-plugin-upgrader/host/config
 */
import z from '@deepseek-ai/schemastery';
/** A live reference to one volatile config field. */
export interface Volatile<T> {
    get(): T;
}
/** What the loader hands `apply` as its second argument. */
export interface UpgraderConfig {
    registry: Volatile<string>;
    /**
     * The user's source list.
     *
     * Optional, and unread on this side: the list is only ever rendered and
     * rewritten from the browser, through the settings service. Declaring it here
     * keeps the interface describing the whole schema instead of half of it, and
     * keeps a hand-written config object (or a test's) compiling.
     */
    customRegistries?: Volatile<string[]>;
    /**
     * Whether a batch may add pnpm's retry settings to the profile's workspace
     * manifest.
     *
     * Optional here and defaulted on in the schema, so a profile patched before
     * this field existed (and a test's hand-written config) still gets the faster
     * behaviour. The switch exists because the change is visible outside this tab:
     * it edits a file pnpm also writes.
     */
    pnpmTuning?: Volatile<boolean>;
}
/** The public registry, named so the picker can offer it without a lookup. */
export declare const OFFICIAL_REGISTRY = "https://registry.npmjs.org/";
/** The mainland China mirror, for the same reason. */
export declare const MIRROR_REGISTRY = "https://registry.npmmirror.com/";
/** The plugin's config schema. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    registry: z<string, string, "volatile-defined">;
    /**
     * Sources the user added, kept separate from the two built-in ones.
     *
     * The built-ins are compiled in, never written here, so they cannot be
     * deleted or edited from the browser: there is no row to remove. They are also
     * what keeps the list usable after a user removes every source they added.
     */
    customRegistries: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    /**
     * Whether a batch may shorten pnpm's retry waits in the profile.
     *
     * On by default because the default pnpm numbers cost minutes per install on a
     * mirror that drops connections, and the alternative a user actually wants is
     * not "wait longer" but "stop waiting". Off is for a profile whose workspace
     * manifest somebody else manages.
     */
    pnpmTuning: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    registry: z<string, string, "volatile-defined">;
    /**
     * Sources the user added, kept separate from the two built-in ones.
     *
     * The built-ins are compiled in, never written here, so they cannot be
     * deleted or edited from the browser: there is no row to remove. They are also
     * what keeps the list usable after a user removes every source they added.
     */
    customRegistries: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    /**
     * Whether a batch may shorten pnpm's retry waits in the profile.
     *
     * On by default because the default pnpm numbers cost minutes per install on a
     * mirror that drops connections, and the alternative a user actually wants is
     * not "wait longer" but "stop waiting". Off is for a profile whose workspace
     * manifest somebody else manages.
     */
    pnpmTuning: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
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
export declare function savedRegistry(config: UpgraderConfig | undefined | null): string;
/**
 * Whether a batch may tune pnpm's retry settings for this profile.
 *
 * Defaults to true, and reads the live reference on every call for the same
 * reason the registry does: a switch flipped in the browser must reach the next
 * batch without restarting the host. Only an explicit `false` turns it off — an
 * older config that never heard of the field keeps the faster behaviour.
 *
 * @param config - the config `apply` received, possibly undefined.
 * @returns whether the tuning may run.
 */
export declare function savedPnpmTuning(config: UpgraderConfig | undefined | null): boolean;
/**
 * Normalize an address for comparison, never for use.
 *
 * Two spellings of one registry must collapse to one picker entry, but the
 * address that is finally saved has to keep its own case and path.
 *
 * @param url - a registry address.
 * @returns a comparison key.
 */
export declare function registryKey(url: string): string;
//# sourceMappingURL=config.d.ts.map