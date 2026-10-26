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

/** Reasons a profile control cannot modify its target. */
export type ReadOnlyReason = 'management-required' | 'unaddressable'

/** Localizable management failure. */
export interface ManagementError {
  code: string
  diagnostic?: string
}

/** Display metadata a bundle manifest can carry, per language. */
export interface LocalizedMeta {
  title?: unknown
  description?: unknown
  icon?: unknown
}

/** One row a bundle's patch declares. */
export interface BundleRowInfo {
  rowId: string
  moduleName: string
  entryId?: string
}

/** One shipped, profile-installed, or discoverable on-demand bundle. */
export interface BundleInfo {
  name: string
  official: boolean
  availability: 'installation' | 'profile' | 'missing'
  installTarget?: { spec: string; version: string }
  version?: string
  meta?: LocalizedMeta
  description?: string
  enabled: boolean
  installed: boolean
  source?: string
  optional: boolean
  removable: boolean
  readOnlyReason?: ReadOnlyReason
  error?: ManagementError
  rows: BundleRowInfo[]
  overrides: string[]
}

/** How a package operation failed. */
export type InstallFailureKind =
  | 'pnpm-missing'
  | 'timeout'
  | 'not-found'
  | 'no-matching-version'
  | 'network'
  | 'disk-full'
  | 'permission'
  | 'build-blocked'
  | 'integrity'
  | 'unknown'

/** Package operation completion. */
export interface PackageResult {
  exitCode: number
  output: string
  truncated: boolean
  logPath: string
  kind?: InstallFailureKind
  timedOut?: boolean
}

/** Persisted change and its application outcome. */
export interface ChangeResult {
  changed: boolean
  application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  restartReason?: string
  stage: 'install' | 'enable' | 'remove'
  target: string
  enabled?: boolean
  error?: ManagementError
  warnings?: string[]
  packageResult?: PackageResult
  bundle?: string
  version?: string
  pendingBuilds?: string[]
  approvedBuilds?: string[]
  registries?: (string | null)[]
  failedAt?: 'registry' | 'spec-host'
}

/** What one installation asks for. */
export interface InstallBundleOptions {
  enabled?: boolean
  saveExact?: boolean
  requestId?: string
  approvedBuilds?: string[]
  registry?: string | null
}

/** What `registries()` reports. */
export interface RegistriesReport {
  registry: string | null
  fallbackRegistries: readonly string[]
  resolved: string | null
}

/** One step of a batch job, as the browser sends it. */
export interface StepRecord {
  name: string
  version: string
  action?: 'upgrade' | 'switch'
  enabled?: boolean
  approveBuilds?: string[]
}

/** The manager methods this plugin calls. */
export interface PluginManager {
  listBundles(): Promise<BundleInfo[]>
  registries(): Promise<RegistriesReport>
  installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>
  removeBundle(name: string): Promise<ChangeResult>
  setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>
  cancelInstall(requestId: string): Promise<{ status: 'cancelled' | 'too-late' | 'not-running' }>
}

/**
 * One chunk of a pnpm run's output.
 *
 * The manager streams these while a package operation runs, which is the only
 * way to see what pnpm is doing: an upgrade that stalls on a registry timeout
 * reports nothing else for minutes.
 */
export interface InstallLogChunk {
  /** The installation the run belongs to, when its caller supplied an id. */
  requestId?: string
  jobId: string
  argv: readonly string[]
  cwd: string
  stream: 'stdout' | 'stderr'
  text: string
  /** Present on the run's last chunk. */
  exitCode?: number | null
}

/**
 * The phase one installation moved into.
 *
 * `installing` is announced once per registry the installation asks, so
 * `attempt` is the only place a fallback retry becomes visible.
 */
export interface InstallState {
  requestId: string
  phase: 'installing' | 'cancelling' | 'applying'
  attempt?: { registry: string | null; index: number; total: number }
}

/** The host plugin context, as far as this plugin reads it. */
export interface HostContext {
  get(name: string, strict: false): unknown
  effect(callback: () => () => void, label?: string): void
  on(name: 'plugin-manager/install-log', listener: (chunk: InstallLogChunk) => void): () => void
  on(name: 'plugin-manager/install-state', listener: (state: InstallState) => void): () => void
  webServer: WebServer
}

/** The host web-server service. */
export interface WebServer {
  register(route: WebRoute): () => void
}

/** One route the plugin contributes. */
export interface WebRoute {
  kind: 'exact' | 'prefix'
  /** Absolute pathname, no trailing slash. */
  path: string
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>
}

/** One cached packument, as the overview cache stores it. */
export interface PackumentEntryLike {
  at: number
  data: unknown
}

/** One cached tag lookup, as the overview cache stores it. */
export interface TagEntryLike {
  at: number
  tags?: Set<string>
  error?: string
}

/**
 * Narrow `unknown` to the manager, without asserting the whole surface blindly.
 *
 * @param value - whatever the context returned.
 * @returns the manager, or `undefined` when the service is absent.
 */
export function asPluginManager(value: unknown): PluginManager | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value as Partial<PluginManager>
  if (typeof candidate.listBundles !== 'function' || typeof candidate.installBundle !== 'function') {
    return undefined
  }
  return candidate as PluginManager
}
