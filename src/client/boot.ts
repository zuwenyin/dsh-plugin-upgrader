/**
 * Whether this page may reload itself without losing the plugin bundles.
 *
 * The desktop shell builds the page it serves from an injection table it takes
 * from the Host ONCE, when the Host starts, and hands the same table to every
 * later `dsh-app://app` document. That table ends in a `__DSH_BOOT__` value
 * whose batch URLs carry a revision hash. The Host keeps the batch response for
 * the current revision and for exactly one previous one, so a document built
 * from a table older than that asks for URLs the Host answers with a bare 404.
 * Every entry in such a batch then fails to load, and the shell reports the
 * whole boot as failed 鈥?the dialog that greets a restart after a batch update.
 *
 * Nothing in a plugin can rebuild the table, but a plugin CAN refuse to walk
 * into the trap: before a reload it checks that the document it is about to
 * reload is still served. When it is not, a restart is the only route, and the
 * page says so instead of blinking into a fatal boot.
 *
 * @module dsh-plugin-upgrader/client/boot
 */

/** One batch of the boot manifest, as the shell validated it. */
export interface BootBatch {
  phase: 'bootstrap' | 'application'
  url: string
  rev: string
}

/** What a {@link checkBootDocument} look-up concluded. */
export type BootFreshness = 'fresh' | 'stale' | 'unknown'

/** The parts of `window.__DSH_BOOT__` this module reads. */
export interface BootWire {
  batches?: unknown
}

/** The slice of `fetch` this module needs, so a test can stand in for it. */
export type FetchLike = (input: string, init?: { method?: string; cache?: string }) => Promise<{ status: number }>

/** The slice of `window` this module needs, so a test can stand in for it. */
export interface BootWindow {
  __DSH_BOOT__?: BootWire
  location?: { href?: string; reload?: () => void }
}

/**
 * Read the batch rows out of the boot manifest.
 *
 * The shell validates the manifest before this plugin ever runs, so the rows
 * are well formed in practice; this still tolerates a missing or reshaped
 * global, because a reload guard that throws would be worse than no guard.
 *
 * @param wire - the value of `window.__DSH_BOOT__`.
 * @returns every batch that carries a usable url, in document order.
 */
export function bootBatches(wire: unknown): BootBatch[] {
  if (typeof wire !== 'object' || wire === null) return []
  const batches = (wire as BootWire).batches
  if (!Array.isArray(batches)) return []
  const rows: BootBatch[] = []
  for (const value of batches) {
    if (typeof value !== 'object' || value === null) continue
    const batch = value as { phase?: unknown; url?: unknown; rev?: unknown }
    if (typeof batch.url !== 'string' || batch.url === '') continue
    if (typeof batch.rev !== 'string') continue
    const phase = batch.phase === 'bootstrap' ? 'bootstrap' : 'application'
    rows.push({ phase, url: batch.url, rev: batch.rev })
  }
  return rows
}

/**
 * Decide whether the document's batches are still served by the Host.
 *
 * A `HEAD` costs a header round-trip and the Host answers it from the same
 * table a `GET` would use, which is enough to tell "this revision is still
 * here" from "this revision is gone". Any other answer 鈥?a refused socket, a
 * 500 鈥?proves nothing either way, and a page that refuses to reload on an
 * unclear answer would look hung; only a definite 404 blocks the reload.
 *
 * @param options - the manifest to read, and the look-up to run.
 * @returns `stale` when at least one batch is gone, `fresh` when every batch
 * answered as served, and `unknown` when some batch answered in a way that
 * settles nothing.
 */
export async function checkBootDocument(options: {
  wire?: unknown
  href?: string | undefined
  fetch?: FetchLike | undefined
}): Promise<BootFreshness> {
  const rows = bootBatches(options.wire)
  if (rows.length === 0) return 'fresh'
  const lookup = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch
  if (lookup === undefined) return 'unknown'
  const base = options.href ?? 'dsh-app://app/'
  let unclear = false
  for (const row of rows) {
    let url: string
    try {
      url = new URL(row.url, base).href
    } catch {
      return 'unknown'
    }
    let status: number
    try {
      status = (await lookup(url, { method: 'HEAD', cache: 'no-store' })).status
    } catch {
      return 'unknown'
    }
    if (status === 404) return 'stale'
    if (status < 200 || status > 299) unclear = true
  }
  return unclear ? 'unknown' : 'fresh'
}

/**
 * Reload the page only when the document it would reload is still intact.
 *
 * Called after a plugin was replaced, because its stylesheet left `<head>` with
 * the code that injected it. The reload restores the look 鈥?unless the boot
 * document has already outlived the Host's batch table, in which case the
 * reload is exactly what turns an upgrade into the startup-failure dialog.
 *
 * @param options - the page, the manifest, and where to report a blocked reload.
 * @returns whether the reload was started.
 */
export async function reloadWhenBootDocumentFresh(options: {
  window?: BootWindow | undefined
  fetch?: FetchLike | undefined
  onBlocked?: (() => void) | undefined
}): Promise<boolean> {
  const page = options.window ?? (globalThis as unknown as BootWindow)
  const freshness = await checkBootDocument({
    wire: page.__DSH_BOOT__,
    href: page.location?.href,
    fetch: options.fetch,
  })
  if (freshness === 'stale') {
    options.onBlocked?.()
    return false
  }
  const reload = page.location?.reload
  if (typeof reload !== 'function') return false
  try {
    reload.call(page.location)
  } catch {
    return false
  }
  return true
}
