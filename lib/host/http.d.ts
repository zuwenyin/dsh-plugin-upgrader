/**
 * HTTP helpers shared by every route.
 *
 * The host half answers a small, fixed set of JSON endpoints, so these helpers
 * stay deliberately narrow: one trust fence, one bounded body reader, one
 * response writer.
 *
 * @module dsh-plugin-upgrader/lib/http
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/**
 * Whether a socket address names the loopback range.
 *
 * @param address - `req.socket.remoteAddress`.
 * @returns true for 127/8 and ::1.
 */
export declare function isLoopbackAddress(address: string | undefined): boolean;
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
export declare function isLoopbackRequest(req: IncomingMessage): boolean;
/**
 * Read a bounded JSON object body.
 *
 * @param req - the request.
 * @param maxBytes - cap before the body is dropped.
 * @returns the parsed object, or `null` when the body is absent, oversized, or
 * not a JSON object.
 */
export declare function readJsonBody(req: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown> | null>;
/**
 * Write one JSON response.
 *
 * @param res - the response.
 * @param status - HTTP status.
 * @param body - JSON payload.
 */
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
//# sourceMappingURL=http.d.ts.map