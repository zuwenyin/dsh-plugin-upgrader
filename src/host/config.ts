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
import z from '@deepseek-ai/schemastery'

/** A live reference to one volatile config field. */
export interface Volatile<T> {
  get(): T
}

/** What the loader hands `apply` as its second argument. */
export interface UpgraderConfig {
  registry: Volatile<string>
  /**
   * The user's source list.
   *
   * Optional, and unread on this side: the list is only ever rendered and
   * rewritten from the browser, through the settings service. Declaring it here
   * keeps the interface describing the whole schema instead of half of it, and
   * keeps a hand-written config object (or a test's) compiling.
   */
  customRegistries?: Volatile<string[]>
}

/** The public registry, named so the picker can offer it without a lookup. */
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/'

/** The mainland China mirror, for the same reason. */
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com/'

/**
 * Accepts an empty string (follow pnpm) or an absolute http(s) address.
 *
 * The same shape the manager enforces on its own `registry` option, so a value
 * this form accepts is a value `installBundle` will not reject.
 */
const REGISTRY_PATTERN = /^$|^https?:\/\/\S+$/

/**
 * A source the user added themselves: a real address, never empty.
 *
 * An empty string has a meaning for `registry` ("follow pnpm") but none inside
 * a list of sources, so the two fields do not share a pattern.
 */
const SOURCE_PATTERN = /^https?:\/\/\S+$/

/** The plugin's config schema. */
export const Config = z.object({
  registry: z.string().default('').pattern(REGISTRY_PATTERN).volatile(),
  /**
   * Sources the user added, kept separate from the two built-in ones.
   *
   * The built-ins are compiled in, never written here, so they cannot be
   * deleted or edited from the browser: there is no row to remove. They are also
   * what keeps the list usable after a user removes every source they added.
   */
  customRegistries: z.array(z.string().pattern(SOURCE_PATTERN)).default([]).volatile(),
})

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
export function savedRegistry(config: UpgraderConfig | undefined | null): string {
  try {
    const value = config?.registry?.get?.()
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
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
export function registryKey(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}
