/**
 * Reading and writing the settings this bundle exposes.
 *
 * The values live in the profile's Cordis patch, not in the browser, so they are
 * the same on every browser that opens this page. The host's settings service is
 * what actually writes them; the `configForms` client service is the only
 * supported way to reach that service from a tab, because it writes through the
 * providing fiber and fences every write with a revision.
 *
 * Two fields back the source dialog: `registry` (the address in use, empty for
 * "follow pnpm") and `customRegistries` (the addresses the user added). The two
 * built-in addresses are constants here and in `./host/config.ts`; they are
 * never written into `customRegistries`, so no sequence of clicks can delete or
 * edit them — the edits simply have nothing to act on.
 *
 * Everything here degrades to "not available" instead of throwing: a host that
 * predates the settings service still gets a working tab, just with the source
 * shown and not editable.
 *
 * @module dsh-plugin-upgrader/client/registry
 */
import { getReact } from './env.ts'
import type { ConfigFormSnapshotLike, ConfigFormsLike } from './types.ts'

/** The config field naming the source in use. */
export const REGISTRY_FIELD = 'registry'

/** The config field holding the sources the user added. */
export const SOURCES_FIELD = 'customRegistries'

/**
 * The two addresses worth offering without asking the host.
 *
 * A user who wants to leave a private registry for the public one, or the other
 * way round, should not have to type a URL from memory. Both are also what the
 * manager itself treats as public. They are built in: the dialog shows them,
 * tests them and switches to them, but never edits or removes them.
 */
export const WELL_KNOWN_REGISTRIES: readonly string[] = [
  'https://registry.npmjs.org/',
  'https://registry.npmmirror.com/',
]

/**
 * Whether an address is one of the built-in ones.
 *
 * Compared on the normalized key so `https://registry.npmjs.org` and
 * `https://registry.npmjs.org/` are the same source; a custom entry that
 * happens to spell a built-in address is therefore treated as built in, which
 * keeps the list from showing the same source twice under two sets of buttons.
 *
 * @param url - an address.
 * @returns whether it is built in.
 */
export function isBuiltinRegistry(url: string): boolean {
  const key = comparisonKey(url)
  return WELL_KNOWN_REGISTRIES.some((known) => comparisonKey(known) === key)
}

/** What a picker needs to know about the settings. */
export interface RegistrySetting {
  /** The saved choice, verbatim; empty means "follow pnpm". */
  saved: string
  /** The sources the user added, verbatim. */
  custom: readonly string[]
  /** Whether the host would accept a write right now. */
  writable: boolean
  /** Why the picker cannot be used, when it cannot. */
  unavailable: string | undefined
  /** Persist the source in use; empty clears it. */
  save: (value: string) => Promise<boolean>
  /** Persist a new list of custom sources, replacing the stored one. */
  saveSources: (value: readonly string[]) => Promise<boolean>
}

/** A setting that cannot be changed, with the reason kept for the caller. */
const LOCKED = (reason: string): RegistrySetting => ({
  saved: '',
  custom: [],
  writable: false,
  unavailable: reason,
  save: () => Promise.resolve(false),
  saveSources: () => Promise.resolve(false),
})

/**
 * Compare two addresses as one source.
 *
 * @param url - an address.
 * @returns its comparison key.
 */
export function comparisonKey(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * Give an address the trailing slash a registry base URL carries.
 *
 * @param url - an address.
 * @returns the address with exactly one trailing slash.
 */
export function normalizeSource(url: string): string {
  const trimmed = url.trim()
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

/**
 * Whether a string is something `installBundle` would accept as a registry.
 *
 * @param url - a candidate address.
 * @returns whether it is an absolute http(s) URL.
 */
export function isRegistryAddress(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim())
}

/**
 * Read the two fields out of one form snapshot.
 *
 * @param snapshot - the form snapshot, when there is one.
 * @returns the values and whether they can be written.
 */
function read(snapshot: ConfigFormSnapshotLike | undefined): {
  saved: string
  custom: string[]
  writable: boolean
} {
  const saved = snapshot?.value?.[REGISTRY_FIELD]
  const custom = snapshot?.value?.[SOURCES_FIELD]
  return {
    saved: typeof saved === 'string' ? saved : '',
    custom: Array.isArray(custom)
      ? custom.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [],
    writable: snapshot?.writable === true && snapshot.status === 'ready',
  }
}

/**
 * Read the saved settings, and keep them live while the form is open.
 *
 * The controller is created once per entry and cached by the service, so
 * subscribing here is cheap; the subscription is what makes a write from
 * another browser show up without a reload.
 *
 * @param configForms - the client service, when the host provides one.
 * @param namespace - the plugin entry id the settings are filed under.
 * @returns the setting, its current values, and the writers.
 */
export function useRegistrySetting(configForms: ConfigFormsLike | undefined, namespace: string): RegistrySetting {
  const React = getReact()
  const [snapshot, setSnapshot] = React.useState<ConfigFormSnapshotLike | undefined>(undefined)

  React.useEffect(() => {
    if (configForms === undefined) return undefined
    let live = true
    const form = configForms.get(namespace)
    const sync = (): void => {
      if (live) setSnapshot(form.getSnapshot())
    }
    sync()
    const off = form.subscribe(sync)
    return () => {
      live = false
      if (typeof off === 'function') off()
    }
  }, [configForms, namespace])

  if (configForms === undefined) {
    /*
     * The tab is also mounted by hosts that do not ship the settings UI. There
     * is no way to persist a choice there, and silently pretending otherwise
     * would leave a user thinking they had changed the source when they had
     * not, so say so instead.
     */
    return LOCKED('no-config-forms')
  }

  const { saved, custom, writable } = read(snapshot)
  return {
    saved,
    custom,
    writable,
    unavailable: snapshot === undefined ? 'loading' : writable ? undefined : 'not-writable',
    save: async (value: string): Promise<boolean> => {
      if (configForms === undefined) return false
      return configForms.get(namespace).set(REGISTRY_FIELD, value)
    },
    saveSources: async (value: readonly string[]): Promise<boolean> => {
      if (configForms === undefined) return false
      /*
       * The whole array, not an index path: schemastery validates every element
       * on the way in, so one bad entry would fail an index write just as hard,
       * and restating the list keeps an edit and a removal the same code path.
       */
      return configForms.get(namespace).set(SOURCES_FIELD, [...value])
    },
  }
}

/**
 * The addresses a source list should offer.
 *
 * The two well-known registries come first so the common choice is one click,
 * then whatever the host's manager is configured with. Duplicates collapse on
 * a normalized key, because `https://registry.npmjs.org` and
 * `https://registry.npmjs.org/` are the same source and listing both reads as
 * a bug.
 *
 * @param known - addresses the host reported.
 * @returns distinct addresses, in offer order.
 */
export function offeredRegistries(known: readonly (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const candidate of [...known]) {
    if (typeof candidate !== 'string') continue
    const url = candidate.trim()
    if (url === '') continue
    const key = comparisonKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalizeSource(url))
  }
  return out
}

/**
 * Add one source to the user's list, refusing what is already there.
 *
 * @param custom - the current list.
 * @param url - the address to add.
 * @returns the new list, or undefined when the address cannot be added.
 */
export function addSource(custom: readonly string[], url: string): string[] | undefined {
  const trimmed = url.trim()
  if (!isRegistryAddress(trimmed)) return undefined
  const key = comparisonKey(trimmed)
  if (isBuiltinRegistry(trimmed)) return undefined
  if (custom.some((entry) => comparisonKey(entry) === key)) return undefined
  return [...custom, normalizeSource(trimmed)]
}

/**
 * Replace one source in the user's list.
 *
 * The index addresses a row the dialog is showing, so it is validated here
 * rather than trusted: a stale index after another browser's write must not
 * silently edit the wrong row.
 *
 * @param custom - the current list.
 * @param index - the row being edited.
 * @param url - the replacement address.
 * @returns the new list, or undefined when the edit cannot be applied.
 */
export function editSource(custom: readonly string[], index: number, url: string): string[] | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= custom.length) return undefined
  const trimmed = url.trim()
  if (!isRegistryAddress(trimmed)) return undefined
  const key = comparisonKey(trimmed)
  if (isBuiltinRegistry(trimmed)) return undefined
  if (custom.some((entry, at) => at !== index && comparisonKey(entry) === key)) return undefined
  const next = [...custom]
  next[index] = normalizeSource(trimmed)
  return next
}

/**
 * Drop one source from the user's list.
 *
 * @param custom - the current list.
 * @param index - the row being removed.
 * @returns the new list, or undefined when the index addresses no row.
 */
export function removeSource(custom: readonly string[], index: number): string[] | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= custom.length) return undefined
  return custom.filter((_entry, at) => at !== index)
}

