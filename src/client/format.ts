/**
 * Small helpers shared by the tab's components.
 *
 * @module dsh-plugin-upgrader/client/format
 */
import { EN, ZH } from './copy.ts'
import type { Copy, T } from './types.ts'

/**
 * Best-effort copy lookup that survives an unregistered locale namespace.
 *
 * The `locale` service is optional at runtime: when the namespace registration
 * or the binding throws, `bound` is undefined and the built-in dictionaries
 * answer instead. A key the locale service does not know comes back as the key
 * itself, which is why that case falls through rather than rendering `title`.
 *
 * @param bound - the locale service translator.
 * @param active - reads the current locale id.
 * @returns a translator.
 */
export function makeT(bound: ((key: string, ...args: never[]) => unknown) | undefined, active: () => string): T {
  return (key: string, ...args: unknown[]): string => {
    let text: string | undefined
    if (bound !== undefined) {
      try {
        const value = bound(key, ...(args as never[]))
        if (typeof value === 'string' && value !== key) text = value
      } catch {
        /* fall through to the local dictionaries */
      }
    }
    if (text === undefined) {
      const dict: Copy = active().toLowerCase().startsWith('zh') ? ZH : EN
      const fallback = dict[key] ?? EN[key] ?? key
      text = typeof fallback === 'function' ? fallback(...(args as never[])) : String(fallback)
    }
    return text
  }
}

/**
 * Format a registry timestamp.
 *
 * @param iso - ISO timestamp.
 * @returns a short local date, or an empty string.
 */
export function formatDate(iso: string | undefined): string {
  if (typeof iso !== 'string') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/**
 * Open a URL in a new browser tab.
 *
 * Only http(s) links are ever passed in, and `noopener,noreferrer` keeps the
 * opened page away from this window.
 *
 * @param url - the address to open.
 */
export function openExternal(url: string | undefined): void {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Format a duration for the progress line.
 *
 * Installs that look stuck are usually just slow, and a number that keeps
 * moving is the difference between "working" and "frozen" for the user.
 *
 * @param ms - elapsed milliseconds.
 * @returns a short duration such as `12s` or `2m 05s`.
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s'
  const total = Math.floor(ms / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * Resolve a version row's GitHub target.
 *
 * The host sends either a full address or a repository-relative path, and both
 * have to survive a locale change, a cached payload from an older host build,
 * and a row whose repository is unknown. Anything that is not an http(s)
 * address is treated as "no link" so the caller renders plain text.
 *
 * @param row - the plugin row, for its repository.
 * @param version - the version row.
 * @returns the address, or undefined.
 */
export function resolveVersionLink(
  row: { repoUrl?: string },
  version: { url?: string; href?: string },
): string | undefined {
  const raw =
    typeof version.href === 'string'
      ? version.href
      : typeof version.url === 'string' && typeof row.repoUrl === 'string' && version.url.startsWith('/')
        ? `${row.repoUrl}${version.url}`
        : version.url
  return typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : undefined
}

/** A failed host request. */
export interface RequestFailure extends Error {
  status: number
  body: { error?: string; id?: string; current?: string; done?: number; total?: number } | undefined
}

/**
 * Read a JSON response, turning a failure into a thrown error.
 *
 * @param response - the fetch response.
 * @returns the parsed body.
 */
export async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!response.ok) {
    const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : undefined
    const message = typeof record?.error === 'string' ? record.error : `HTTP ${response.status}`
    const failure = new Error(message) as RequestFailure
    failure.status = response.status
    failure.body = record as RequestFailure['body']
    throw failure
  }
  return body as T
}

/**
 * Whether an unknown value is a failed host request.
 *
 * @param value - the caught value.
 * @returns true when it carries a status.
 */
export function isRequestFailure(value: unknown): value is RequestFailure {
  return value instanceof Error && typeof (value as RequestFailure).status === 'number'
}
