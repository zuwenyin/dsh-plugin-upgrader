/**
 * Host half of the dsh-plugin-upgrader bundle.
 *
 * The Plugins page's own tabs run in the browser, and the browser cannot read
 * the profile's dependency list or reach the npm registry reliably (CORS,
 * private registries, tokens). This half owns the four things the page needs:
 *
 *   GET  /api/plugin-upgrader/overview      installed bundles + published versions
 *   POST /api/plugin-upgrader/job           start a batch of upgrade/switch steps
 *   GET  /api/plugin-upgrader/job?id=<id>   poll that batch
 *   POST /api/plugin-upgrader/cancel        stop the in-flight step
 *
 * Every route is loopback-only: a batch installs packages, so a paired remote
 * device or a cross-site page must never reach it.
 *
 * Upgrade semantics follow the profile manager itself: a different version of
 * an already-installed package is a removal plus an installation, because
 * `installBundle` refuses a spec that names an installed dependency
 * (`already-installed`). The old version is reported back so the caller can
 * offer a restore.
 *
 * @module dsh-plugin-upgrader
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeJson, isLoopbackRequest, readJsonBody } from './host/http.ts'
import { buildOverview } from './host/overview.ts'
import { runStep, validateStep, type StepOutcome } from './host/install.ts'
import {
  asPluginManager,
  type HostContext,
  type PackumentEntryLike,
  type PluginManager,
  type TagEntryLike,
} from './host/manager.ts'

/** Stable plugin name; matches the cordis.patch.yml insert id. */
export const name = 'plugin-upgrader'

/** The web server is the only hard dependency; pluginManager is read lazily. */
export const inject = ['webServer']

/**
 * Prefix every route this bundle owns. The prefix is registered without a
 * trailing slash because the carrier matches `path` exactly or `path + '/'`;
 * a trailing slash here would only ever match the bare prefix itself.
 */
const API_PREFIX = '/api/plugin-upgrader'

/** Path segments are sliced off after the registered prefix. */
const API_BASE = `${API_PREFIX}/`

/** Finished jobs are kept only long enough for the last poll to read them. */
const JOB_RETENTION_MS = 10 * 60 * 1000

/**
 * A job that stops reporting progress for this long is treated as abandoned
 * and no longer blocks new work. Installs report progress per step, so a step
 * that legitimately runs longer than this is a hung child process, not work.
 */
const STALE_JOB_MS = 15 * 60 * 1000

/** How many log lines one job keeps for the panel. */
const JOB_LOG_LIMIT = 200

/** How many log lines the overview ships for a job the tab adopts. */
const ADOPTED_LOG_LIMIT = 40

/** Lifecycle of one batch. */
type JobStatus = 'queued' | 'running' | 'finished' | 'cancelled'

/** One batch of steps, as the browser polls it. */
interface JobRecord {
  id: string
  status: JobStatus
  total: number
  done: number
  failed: number
  results: StepOutcome[]
  log: string[]
  cancelled: boolean
  startedAt: number
  finishedAt?: number
  heartbeatAt?: number
  current?: string
  cacheDirty?: boolean
  abandoned?: boolean
}

/** One step as the request body carries it, before validation. */
interface RawStep {
  name: string
  version: string
  action?: 'upgrade' | 'switch'
  enabled?: boolean
  approveBuilds?: string[]
  requestId?: string
}

/**
 * Mount the host half.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx: HostContext): void {
  const packumentCache = new Map<string, PackumentEntryLike>()
  const tagCache = new Map<string, TagEntryLike>()
  const jobs = new Map<string, JobRecord>()
  let inFlight: { requestId: string } | null = null

  const pruneJobs = (): void => {
    const cutoff = Date.now() - JOB_RETENTION_MS
    for (const [id, job] of jobs) {
      if (job.finishedAt !== undefined && job.finishedAt < cutoff) jobs.delete(id)
    }
  }

  /** The manager, or a reason the request cannot be served. */
  const requireManager = (): PluginManager | undefined => asPluginManager(ctx.get('pluginManager', false))

  /**
   * Run a batch job to completion in the background.
   *
   * @param job - the mutable job record.
   * @param steps - the requested steps.
   */
  const runJob = async (job: JobRecord, steps: RawStep[]): Promise<void> => {
    const manager = requireManager()
    if (manager === undefined) {
      job.status = 'finished'
      job.finishedAt = Date.now()
      job.log.push('job failed: plugin manager unavailable')
      return
    }
    job.status = 'running'
    job.heartbeatAt = Date.now()
    for (const step of steps) {
      if (job.cancelled) break
      inFlight = { requestId: step.requestId ?? '' }
      job.current = `${step.name}@${step.version}`
      job.log.push(`→ ${job.current}`)
      const outcome = await runStep(manager, step, (message) => {
        job.log.push(message)
        if (job.log.length > JOB_LOG_LIMIT) job.log.splice(0, job.log.length - JOB_LOG_LIMIT)
      })
      inFlight = null
      job.heartbeatAt = Date.now()
      job.results.push(outcome)
      job.done = job.results.length
      if (!outcome.ok) job.failed += 1
      job.log.push(
        outcome.ok
          ? `✓ ${job.current} ${outcome.application ?? 'applied'}`
          : `✗ ${job.current} ${outcome.message ?? 'failed'}`,
      )
    }
    job.status = job.cancelled ? 'cancelled' : 'finished'
    job.current = undefined
    job.finishedAt = Date.now()
    job.cacheDirty = true
  }

  /**
   * A running job is only blocking while it is actually making progress.
   *
   * @returns the live job, if one is genuinely running.
   */
  const activeJob = (): JobRecord | undefined => {
    for (const job of jobs.values()) {
      if (job.status !== 'running' && job.status !== 'queued') continue
      const seen = job.heartbeatAt ?? job.startedAt ?? 0
      if (Date.now() - seen < STALE_JOB_MS) return job
      job.status = 'finished'
      job.abandoned = true
      job.current = undefined
      job.finishedAt = Date.now()
      job.log.push('! job abandoned: no progress for 15 minutes')
    }
    return undefined
  }

  /**
   * One dispatcher for every route under the prefix.
   *
   * @param req - the request.
   * @param res - the response.
   */
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'loopback-only' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname =
      url.pathname.endsWith('/') && url.pathname.length > API_BASE.length
        ? url.pathname.slice(0, -1)
        : url.pathname
    const route = pathname.startsWith(API_BASE) ? pathname.slice(API_BASE.length) : ''
    try {
      if (req.method === 'GET' && route === 'overview') {
        const force = url.searchParams.get('refresh') === '1'
        const locale: 'zh' | 'en' = url.searchParams.get('locale') === 'zh' ? 'zh' : 'en'
        pruneJobs()
        const live = activeJob()
        writeJson(res, 200, {
          ...(await buildOverview(ctx, packumentCache, tagCache, { force, locale })),
          /**
           * The tab is remounted whenever the Plugins page is reopened, and the
           * job map only lives in this process. Reporting the live job lets a
           * fresh tab adopt work that is still running instead of firing a
           * second batch into a 409.
           */
          active:
            live === undefined
              ? null
              : {
                  id: live.id,
                  status: live.status,
                  total: live.total,
                  done: live.done,
                  failed: live.failed,
                  current: live.current,
                  startedAt: live.startedAt,
                  log: live.log.slice(-ADOPTED_LOG_LIMIT),
                },
          jobs: [...jobs.entries()]
            .filter(([, job]) => job.finishedAt !== undefined)
            .map(([id, job]) => ({
              id,
              status: job.status,
              failed: job.failed,
              done: job.done,
              total: job.total,
              finishedAt: job.finishedAt,
            })),
        })
        return
      }
      if (req.method === 'POST' && route === 'job') {
        const body = await readJsonBody(req)
        const rawSteps = body?.steps
        const steps: unknown[] = Array.isArray(rawSteps) ? (rawSteps as unknown[]) : []
        if (steps.length === 0) {
          writeJson(res, 400, { error: 'no-steps' })
          return
        }
        for (const step of steps) {
          const problem = validateStep(step)
          if (problem !== undefined) {
            writeJson(res, 400, { error: problem })
            return
          }
        }
        const running = activeJob()
        if (running !== undefined) {
          writeJson(res, 409, {
            error: 'busy',
            id: running.id,
            current: running.current,
            done: running.done,
            total: running.total,
          })
          return
        }
        const id =
          globalThis.crypto?.randomUUID?.() ??
          `job-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const job: JobRecord = {
          id,
          status: 'queued',
          total: steps.length,
          done: 0,
          failed: 0,
          results: [],
          log: [],
          cancelled: false,
          startedAt: Date.now(),
        }
        jobs.set(id, job)
        void runJob(job, steps as RawStep[]).catch((error: unknown) => {
          job.status = 'finished'
          job.finishedAt = Date.now()
          job.log.push(`job failed: ${error instanceof Error ? error.message : String(error)}`)
        })
        writeJson(res, 202, { id })
        return
      }
      if (req.method === 'GET' && route === 'job') {
        const id = url.searchParams.get('id')
        const job = id === null ? undefined : jobs.get(id)
        if (job === undefined) {
          writeJson(res, 404, { error: 'unknown-job' })
          return
        }
        writeJson(res, 200, job)
        return
      }
      if (req.method === 'POST' && route === 'cancel') {
        const running = [...jobs.values()].find((job) => job.status === 'running')
        if (running === undefined) {
          writeJson(res, 200, { status: 'not-running' })
          return
        }
        running.cancelled = true
        const manager = requireManager()
        const target = inFlight
        if (manager !== undefined && target !== null && target.requestId !== '') {
          try {
            await manager.cancelInstall(target.requestId)
          } catch {
            /* the step settles on its own; the flag above already stops the batch */
          }
        }
        writeJson(res, 200, { status: 'cancelling' })
        return
      }
      writeJson(res, 404, { error: 'not-found' })
    } catch (error) {
      const status =
        typeof (error as { status?: unknown })?.status === 'number'
          ? (error as { status: number }).status
          : 500
      writeJson(res, status, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    'plugin-upgrader: routes',
  )
}
