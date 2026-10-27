/**
 * Shapes shared by every client module.
 *
 * The client half is bundled into one file that the DSH module loader
 * evaluates, so nothing here may reference a Node built-in.
 *
 * @module dsh-plugin-upgrader/client/types
 */

/** One rendered version line, as the host shapes it. */
export interface VersionRow {
  version: string
  time?: string
  deprecated?: string
  engine?: string
  current: boolean
  latest: boolean
  /** A GitHub path such as `/releases/tag/v1.2.3`, relative to `repoUrl`. */
  url?: string
  /** A fully resolvable address, when the host sent one. */
  href?: string
}

/** One installed plugin, as the host reports it. */
export interface OverviewRow {
  name: string
  version?: string
  official: boolean
  availability: string
  installed: boolean
  enabled: boolean
  removable: boolean
  managed: boolean
  source?: string
  kind: string
  title: string
  description?: string
  icon?: string
  readOnlyReason?: string
  error: { code: string; diagnostic?: string } | null
  latest?: string
  repoUrl?: string
  upgradable: boolean
  versions: VersionRow[]
  tags: Record<string, string>
  totalVersions: number
  versionError?: string
  pendingBuilds?: string[]
}

/** The overview response body. */
export interface Overview {
  generatedAt: number
  registry: string
  registries: { registry: string | null; fallbackRegistries: readonly string[]; resolved: string | null }
  runtimeVersion: string | null
  bundles: OverviewRow[]
  active?: JobSnapshot | null
  jobs?: { id: string; status: string; failed: number; done: number; total: number; finishedAt?: number }[]
}

/** One step's outcome inside a finished job. */
export interface StepResult {
  name: string
  version: string
  ok: boolean
  message?: string
  detail?: string
  application?: string
}

/** A batch job, as polled and as adopted from the overview. */
export interface JobSnapshot {
  id: string
  status: 'queued' | 'running' | 'finished' | 'cancelled' | string
  total: number
  done: number
  failed: number
  current?: string
  /** What the current step is doing, when the host knows. */
  phase?: 'installing' | 'cancelling' | 'applying' | 'waiting'
  /** Which registry is being tried, out of how many. */
  attempt?: { index: number; total: number; registry: string | null }
  startedAt?: number
  /** When the current step started; drives the live elapsed clock. */
  stepStartedAt?: number
  finishedAt?: number
  abandoned?: boolean
  log: string[]
  results?: StepResult[]
}

/** One step sent to the host. */
export interface StepRecord {
  name: string
  version: string
  action?: 'upgrade' | 'switch'
  enabled?: boolean
  approveBuilds?: string[]
}

/** A message shown above the list. */
export interface Banner {
  tone: 'err' | 'warn' | 'info'
  text: string
}

/** Best-effort translator: a locale binding, or the built-in copy. */
export type T = (key: string, ...args: unknown[]) => string

/** Locale entry: a string, or a function taking positional arguments. */
export type CopyValue = string | ((...args: never[]) => string)

/** One language's copy. */
export type Copy = Record<string, CopyValue>

/** The locale service, as far as this bundle calls it. */
export interface LocaleLike {
  getLocale?: () => { active?: unknown } | undefined
  subscribe?: (listener: () => void) => (() => void) | undefined
  register?: (namespace: string, dictionaries: Record<string, Copy>) => unknown
  bind?: (namespace: string) => ((key: string, ...args: never[]) => unknown) | undefined
}

/** The client plugin context, as far as this bundle calls it. */
export interface ClientContext {
  get: <T>(name: string, strict?: boolean) => T | undefined
  effect: (body: () => (() => void) | void, label?: string) => unknown
  slots: {
    inject: (name: string, body: () => unknown) => unknown
    register: (options: SlotOptions, component: unknown) => unknown
  }
}

/** Slot registration options for a Plugins-page tab. */
export interface SlotOptions {
  name: string
  id: string
  order: number
  label: () => string
}

/** Owner props the Plugins page hands a tab. */
export interface OwnerProps {
  install?: (target: { spec: string; title: string; version: string; registry?: string }) => void
  openPackage?: (packageName: string) => void
}

/** Everything a row component needs to render and to act. */
export interface RowActions {
  busy: boolean
  picked: boolean
  onToggle: (name: string) => void
  onUpgrade: (row: OverviewRow) => void
  onSwitch: (row: OverviewRow, version: string) => void
  onApprove: (row: OverviewRow) => void
  onOpenPage?: (name: string) => void
  /**
   * Whether this row is the upgrader itself.
   *
   * It is answered separately because a plugin cannot replace itself through the
   * batch job: the first thing that job does for a version change is
   * `removeBundle`, which unloads the very code that would run the install. The
   * page's own install flow is owned by its manager rather than by this plugin,
   * so it is the only route that survives.
   */
  self?: boolean
  /** The package name this row would install, for the self-update route. */
  onInstallSelf?: (row: OverviewRow, version: string) => void
  /** Force a fresh registry read for this row after its lookup failed. */
  onRetryHistory?: () => void
}
