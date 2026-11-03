import test from 'node:test'
import assert from 'node:assert/strict'

import { apply } from '../src/index.ts'
import type { HostContext, PluginManager, ChangeResult } from '../src/host/manager.ts'

/**
 * The regression this pins.
 *
 * A batch is what upgrades other plugins, and the host replaces this plugin's
 * module whenever its own files change — so the install a user is watching can
 * evict the code tracking it. While the job map lived in `apply()`'s closure,
 * the replacement instance answered `unknown-job` for the id the tab was
 * polling, and the tab said "lost contact" over an install that finished fine.
 *
 * The test drives the real route: it starts a job through `apply`, captures the
 * id, then builds a *second* `apply` against the same process — which is what a
 * module replacement does — and asserts the second instance can still answer
 * for that id.
 */

/** A manager that lists nothing and refuses to run anything, so jobs settle fast. */
function manager(): PluginManager {
  return {
    async listBundles() {
      return []
    },
    async registries() {
      return { registry: null, fallbackRegistries: [], resolved: null }
    },
    async installBundle() {
      return { name: 'x', changed: true, application: 'applied' } as unknown as ChangeResult
    },
    async removeBundle() {
      return { name: 'x', changed: true, application: 'applied' } as unknown as ChangeResult
    },
    async setBundleEnabled() {
      return { name: 'x', changed: true, application: 'applied' } as unknown as ChangeResult
    },
    async cancelInstall() {
      return { status: 'not-running' as const }
    },
  } as unknown as PluginManager
}

/** A context whose web server records the route handler instead of serving it. */
function context(): { ctx: HostContext; route: () => (req: unknown, res: unknown) => Promise<void> } {
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined
  const ctx = {
    get(name: string) {
      return name === 'pluginManager' ? manager() : undefined
    },
    effect(callback: () => () => void) {
      callback()
    },
    on() {
      return () => {}
    },
    webServer: {
      register(route: { handler: (req: unknown, res: unknown) => Promise<void> }) {
        handler = route.handler
        return () => {}
      },
    },
  } as unknown as HostContext
  return {
    ctx,
    route() {
      assert.ok(handler !== undefined, 'apply must register its route')
      return handler as (req: unknown, res: unknown) => Promise<void>
    },
  }
}

/**
 * Drive the handler with one request and collect the JSON body it writes.
 *
 * @param handler - the registered route handler.
 * @param method - the HTTP method.
 * @param path - the request path, including `?id=`.
 * @param body - the JSON body to send, when the route reads one.
 * @returns the status and parsed body.
 */
async function call(
  handler: (req: unknown, res: unknown) => Promise<void>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let status = 0
  let payload = ''
  const res = {
    writeHead(code: number) {
      status = code
    },
    end(text: string) {
      payload = text
    },
    setHeader() {},
  }
  const req = {
    method,
    url: path,
    headers: { host: '127.0.0.1:10036' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
  await handler(req, res)
  return { status, body: payload === '' ? {} : (JSON.parse(payload) as Record<string, unknown>) }
}

test('a replaced module still answers for the batch the previous one started', async () => {
  const first = context()
  apply(first.ctx)
  const started = await call(first.route(), 'POST', '/api/plugin-upgrader/job', {
    steps: [{ name: 'left-pad', version: '1.0.0' }],
  })
  assert.equal(started.status, 202, 'the batch should start')
  const id = started.body.id
  assert.equal(typeof id, 'string')

  /**
   * The replacement instance. Its module scope is new; only `globalThis` is
   * shared, which is exactly the condition the fix is about.
   */
  const second = context()
  apply(second.ctx)
  const polled = await call(second.route(), 'GET', `/api/plugin-upgrader/job?id=${encodeURIComponent(id as string)}`)

  assert.equal(polled.status, 200, 'the replacement instance must know the id, not answer unknown-job')
  assert.equal(polled.body.id, id)
})

test('the batch reports the heartbeat the panel judges liveness by', async () => {
  // The panel used to call a batch stale when pnpm had printed nothing new,
  // which fired on a healthy install during a registry retry. It now judges
  // liveness by the host's heartbeat — so the host has to report it.
  const first = context()
  apply(first.ctx)
  const started = await call(first.route(), 'POST', '/api/plugin-upgrader/job', {
    steps: [{ name: 'left-pad', version: '1.0.0' }],
  })
  const id = started.body.id as string
  const polled = await call(first.route(), 'GET', `/api/plugin-upgrader/job?id=${encodeURIComponent(id)}`)
  assert.equal(polled.status, 200)
  assert.equal(typeof polled.body.heartbeatAt, 'number', 'the job payload must carry the heartbeat')
})
