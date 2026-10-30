/**
 * Reading and writing the one setting this bundle exposes.
 *
 * The value lives in the profile's Cordis patch, not in the browser, so it is
 * the same on every browser that opens this page. The host's settings service
 * is what actually writes it; the `configForms` client service is the only
 * supported way to reach that service from a tab, because it writes through
 * the providing fiber and fences every write with a revision.
 *
 * Everything here degrades to "not available" instead of throwing: a host that
 * predates the settings service still gets a working tab, just with the
 * registry shown and not editable.
 *
 * @module dsh-plugin-upgrader/client/registry
 */
import { getReact } from './env.ts'
import type { ConfigFormSnapshotLike, ConfigFormsLike } from './types.ts'

/** The config field this bundle exposes. */
export const REGISTRY_FIELD = 'registry'

/**
 * The two addresses worth offering without asking the host.
 *
 * A user who wants to leave a private registry for the public one, or the other
 * way round, should not have to type a URL from memory. Both are also what the
 * manager itself treats as public.
 */
export const WELL_KNOWN_REGISTRIES: readonly string[] = [
  'https://registry.npmjs.org/',
  'https://registry.npmmirror.com/',
]

/** What a picker needs to know about the setting. */
export interface RegistrySetting {
  /** The saved choice, verbatim; empty means "follow pnpm". */
  saved: string
  /** Whether the host would accept a write right now. */
  writable: boolean
  /** Why the picker cannot be used, when it cannot. */
  unavailable: string | undefined
  /** Persist a choice; empty clears it. */
  save: (value: string) => Promise<boolean>
}

/** A setting that cannot be changed, with the reason kept for the caller. */
const LOCKED = (reason: string): RegistrySetting => ({
  saved: '',
  writable: false,
  unavailable: reason,
  save: () => Promise.resolve(false),
})

/**
 * Turn one form snapshot into the picker's view of it.
 *
 * @param snapshot - the form snapshot, when there is one.
 * @returns the saved value and whether it can be written.
 */
function read(snapshot: ConfigFormSnapshotLike | undefined): { saved: string; writable: boolean } {
  const raw = snapshot?.value?.[REGISTRY_FIELD]
  const saved = typeof raw === 'string' ? raw : ''
  return { saved, writable: snapshot?.writable === true && snapshot.status === 'ready' }
}

/**
 * Read the saved registry, and keep it live while the form is open.
 *
 * The controller is created once per entry and cached by the service, so
 * subscribing here is cheap; the subscription is what makes a write from
 * another browser show up without a reload.
 *
 * @param configForms - the client service, when the host provides one.
 * @returns the setting, its current value, and a writer.
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

  const { saved, writable } = read(snapshot)
  return {
    saved,
    writable,
    unavailable: snapshot === undefined ? 'loading' : writable ? undefined : 'not-writable',
    save: async (value: string): Promise<boolean> => {
      if (configForms === undefined) return false
      const form = configForms.get(namespace)
      return form.set(REGISTRY_FIELD, value)
    },
  }
}

/**
 * The addresses a picker should offer.
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
    const key = url.replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(url.endsWith('/') ? url : `${url}/`)
  }
  return out
}
