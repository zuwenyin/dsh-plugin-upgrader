/**
 * HTTP helpers shared by every route.
 *
 * The host half answers a small, fixed set of JSON endpoints, so these helpers
 * stay deliberately narrow: one trust fence, one bounded body reader, one
 * response writer.
 *
 * @module dsh-plugin-upgrader/lib/http
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Whether a socket address names the loopback range.
 *
 * @param address - `req.socket.remoteAddress`.
 * @returns true for 127/8 and ::1.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  const v4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized
  const parts = v4.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part))
}

/**
 * Request-level trust fence for a route that can install packages.
 *
 * This endpoint can add and remove packages, so it must not be reachable from a
 * page on another origin: a remote address outside loopback is refused, a
 * cross-site fetch is refused, and a stated `Origin` must match the served host.
 *
 * @param req - the incoming request.
 * @returns true when the request comes from this machine and origin.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === new URL(`http://${host}`).host
  } catch {
    return false
  }
}

/**
 * Read a bounded JSON object body.
 *
 * @param req - the request.
 * @param maxBytes - cap before the body is dropped.
 * @returns the parsed object, or `null` when the body is absent, oversized, or
 * not a JSON object.
 */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 256 * 1024,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      size += buffer.length
      if (size > maxBytes) {
        req.destroy()
        return null
      }
      chunks.push(buffer)
    }
  } catch {
    return null
  }
  let text = Buffer.concat(chunks).toString('utf8')
  // A UTF-8 BOM survives `JSON.parse` on some clients and fails the parse.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  if (text === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}

/**
 * Write one JSON response.
 *
 * @param res - the response.
 * @param status - HTTP status.
 * @param body - JSON payload.
 */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}
