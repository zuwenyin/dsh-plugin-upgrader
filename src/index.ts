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
 * The one user setting is `registry` (see `./host/config.ts`): it decides both
 * which registry the version list is read from and which one an install asks
 * first. It is declared volatile so the host's settings service exposes it, and
 * so a change reaches the running plugin without restarting DSH.
 *
 * @module dsh-plugin-upgrader
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { savedRegistry, type UpgraderConfig } from './host/config.ts'
import { writeJson, isLoopbackRequest, readJsonBody } from './host/http.ts'
import { buildOverview } from './host/overview.ts'
import { runStep, validateStep, type StepOutcome } from './host/install.ts'
import { profileDirFrom, recoverPendingDrop } from './host/manifest.ts'
import { nextPhase, type Phase } from './host/progress.ts'
import {
  asPluginManager,
  type HostContext,
  type InstallLogChunk,
  type InstallState,
  type PackumentEntryLike,
  type PluginManager,
  type TagEntryLike,
} from './host/manager.ts'

/**
 * The plugin's config schema, read by the loader before `apply` runs.
 *
 * Exported as a value rather than declared inside `apply` because the loader
 * looks for `Config` on the module namespace itself; a schema the running
 * plugin never exposes is a schema the settings page cannot find.
 */
export { Config } from './host/config.ts'

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
 * and no longer blocks new work.
 *
 * The heartbeat is a timer, not a per-step write: a single installation can
 * legitimately run for minutes while pnpm verifies a lockfile, and that work is
 * not visible as a finished step.
 */
const STALE_JOB_MS = 15 * 60 * 1000

/** How often a running job re-stamps its heartbeat, independently of steps. */
const HEARTBEAT_MS = 2 * 1000

/** How many log lines one job keeps for the panel. */
const JOB_LOG_LIMIT = 400

/** How many characters of pnpm output one job keeps across all its steps. */
const JOB_LOG_CHARS = 24 * 1024

/** How many log lines the overview ships for a job the tab adopts. */
const ADOPTED_LOG_LIMIT = 60

/**
 * How much of the newest pnpm line the panel shows.
 *
 * A single warning line can carry a whole URL plus retry bookkeeping; the tab
 * renders this inline next to the phase, so it is clipped from the left — the
 * tail of a pnpm warning says what failed, the head only repeats the registry.
 */
const ACTIVITY_CHARS = 120

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
  /** Characters kept in `log`, so a chatty pnpm run cannot grow without limit. */
  logChars: number
  cancelled: boolean
  startedAt: number
  finishedAt?: number
  heartbeatAt?: number
  /** The step being worked on, when one is in flight. */
  current?: string
  /** When that step started, so the panel can show a live elapsed time. */
  stepStartedAt?: number
  /** What that step is doing right now. */
  phase?: Phase
  /**
   * The last thing pnpm printed, trimmed.
   *
   * A phase alone cannot distinguish "downloading" from "stuck on the eleventh
   * registry timeout", and those look identical to somebody watching a clock
   * climb. This is the newest non-blank line, so the panel can show the actual
   * work instead of only its category.
   */
  activity?: string
  /** 1-based number of the registry being tried, and how many there are. */
  attempt?: { index: number; total: number; registry: string | null }
  cacheDirty?: boolean
  abandoned?: boolean
  /** The request ids this job has run under, newest last. */
  requestIds: string[]
}

/** One step as the request body carries it, before validation. */
interface RawStep {
  name: string
  version: string
  action?: 'upgrade' | 'switch'
  enabled?: boolean
  approveBuilds?: string[]
}

/**
 * Mount the host half.
 *
 * @param ctx - the plugin context.
 * @param config - the validated config; `registry` is a live reference, so it
 *   is read per request instead of copied once at load.
 */
export function apply(ctx: HostContext, config?: UpgraderConfig): void {
  const packumentCache = new Map<string, PackumentEntryLike>()
  const tagCache = new Map<string, TagEntryLike>()
  const jobs = new Map<string, JobRecord>()
  let inFlight: { requestId: string } | null = null
  /** The job a manager event belongs to, while one is running. */
  let liveJob: JobRecord | null = null

  /**
   * The registry the user picked, read fresh on every use.
   *
   * The reference is updated in place when the settings form writes, so
   * capturing the value once at load would pin the plugin to the registry it
   * started with — the exact bug a reload-free setting exists to avoid.
   */
  const chosenRegistry = (): string => savedRegistry(config)

  const pruneJobs = (): void => {
    const cutoff = Date.now() - JOB_RETENTION_MS
    for (const [id, job] of jobs) {
      if (job.finishedAt !== undefined && job.finishedAt < cutoff) jobs.delete(id)
    }
  }

  /**
   * Append one line, dropping the oldest once the job holds too much text.
   *
   * @param job - the job to append to.
   * @param message - the text of the line.
   */
  const appendLog = (job: JobRecord, message: string): void => {
    const text = message.trimEnd()
    if (text === '') return
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '') continue
      job.log.push(line)
      job.logChars += line.length
    }
    while (job.logChars > JOB_LOG_CHARS && job.log.length > 1) {
      job.logChars -= job.log.shift()?.length ?? 0
    }
    while (job.log.length > JOB_LOG_LIMIT) {
      job.logChars -= job.log.shift()?.length ?? 0
    }
  }

  /** The manager, or a reason the request cannot be served. */
  const requireManager = (): PluginManager | undefined => asPluginManager(ctx.get('pluginManager', false))

  /**
   * Run a batch job to completion in the background.
   *
   * The heartbeat is a timer, not a per-step write. One upgrade can spend
   * minutes inside a single pnpm run — verifying a lockfile, retrying a
   * registry — and none of that finishes a step, so a step-driven heartbeat
   * would declare a healthy job abandoned and let a second batch start.
   *
   * @param job - the mutable job record.
   * @param steps - the requested steps.
   */
  const runJob = async (job: JobRecord, steps: RawStep[]): Promise<void> => {
    const manager = requireManager()
    if (manager === undefined) {
      job.status = 'finished'
      job.finishedAt = Date.now()
      appendLog(job, 'job failed: plugin manager unavailable')
      return
    }
    job.status = 'running'
    job.heartbeatAt = Date.now()
    liveJob = job
    const beat = setInterval(() => {
      job.heartbeatAt = Date.now()
    }, HEARTBEAT_MS)
    try {
      for (const step of steps) {
        if (job.cancelled) break
        job.current = `${step.name}@${step.version}`
        job.stepStartedAt = Date.now()
        job.phase = 'waiting'
        job.activity = undefined
        job.attempt = undefined
        appendLog(job, `→ ${job.current}`)
        const outcome = await runStep(
          manager,
          step,
          (message) => appendLog(job, message),
          (requestId) => {
            job.requestIds.push(requestId)
            inFlight = { requestId }
          },
          chosenRegistry(),
        )
        inFlight = null
        job.heartbeatAt = Date.now()
        job.results.push(outcome)
        job.done = job.results.length
        if (!outcome.ok) job.failed += 1
        appendLog(
          job,
          outcome.ok
            ? `✓ ${job.current} ${outcome.application ?? 'applied'}`
            : `✗ ${job.current} ${outcome.message ?? 'failed'}`,
        )
      }
    } finally {
      clearInterval(beat)
      liveJob = null
      inFlight = null
    }
    job.status = job.cancelled ? 'cancelled' : 'finished'
    job.current = undefined
    job.stepStartedAt = undefined
    job.phase = undefined
    job.activity = undefined
    job.attempt = undefined
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
      appendLog(job, '! job abandoned: no progress for 15 minutes')
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
          ...(await buildOverview(ctx, packumentCache, tagCache, {
            force,
            locale,
            registry: chosenRegistry(),
          })),
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
                  stepStartedAt: live.stepStartedAt,
                  phase: live.phase,
                  activity: live.activity,
                  attempt: live.attempt,
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
          logChars: 0,
          cancelled: false,
          startedAt: Date.now(),
          requestIds: [],
        }
        jobs.set(id, job)
        void runJob(job, steps as RawStep[]).catch((error: unknown) => {
          job.status = 'finished'
          job.finishedAt = Date.now()
          appendLog(job, `job failed: ${error instanceof Error ? error.message : String(error)}`)
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
        writeJson(res, 200, {
          id: job.id,
          status: job.status,
          total: job.total,
          done: job.done,
          failed: job.failed,
          current: job.current,
          phase: job.phase,
          activity: job.activity,
          attempt: job.attempt,
          startedAt: job.startedAt,
          stepStartedAt: job.stepStartedAt,
          finishedAt: job.finishedAt,
          abandoned: job.abandoned,
          log: job.log,
          results: job.results,
        })
        return
      }
      if (req.method === 'POST' && route === 'cancel') {
        const running = [...jobs.values()].find((job) => job.status === 'running')
        if (running === undefined) {
          writeJson(res, 200, { status: 'not-running' })
          return
        }
        running.cancelled = true
        appendLog(running, '! cancel requested')
        const manager = requireManager()
        const target = inFlight?.requestId ?? running.requestIds.at(-1)
        if (manager !== undefined && target !== undefined && target !== '') {
          try {
            const outcome = await manager.cancelInstall(target)
            appendLog(
              running,
              outcome.status === 'not-running'
                ? '! the installation already settled; the batch stops after it'
                : outcome.status === 'too-late'
                  ? '! past the point of cancellation; finishing the current step'
                  : 'stopping the running installation…',
            )
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

  /**
   * Mirror the manager's running pnpm output and phases into the job log.
   *
   * Without this the panel has nothing to show between a step starting and
   * finishing: a lockfile verification or a registry retry can occupy minutes.
   * Chunks from a removal carry no request id (the manager only tags the runs
   * its caller identified), so a chunk with no id is attributed to whatever job
   * is live — there is only ever one.
   *
   * The listeners are optional: a host whose manager does not emit these
   * events must still load the tab, so a failed subscription is ignored and
   * the panel simply falls back to per-step progress.
   *
   * @param name - the event name.
   * @param listener - the callback.
   * @param label - the effect label.
   */
  const subscribe = (name: string, listener: (payload: never) => void, label: string): void => {
    try {
      ctx.effect(
        () => ctx.on(name as 'plugin-manager/install-log', listener as (chunk: InstallLogChunk) => void),
        label,
      )
    } catch {
      /* the panel degrades to step-level progress */
    }
  }

  subscribe(
    'plugin-manager/install-log',
    (chunk: InstallLogChunk) => {
      const job = liveJob
      if (job === null) return
      const tagged = chunk.requestId !== undefined && chunk.requestId !== ''
      if (tagged && !job.requestIds.includes(chunk.requestId as string)) return
      if (chunk.exitCode !== undefined && chunk.exitCode !== 0 && chunk.exitCode !== null) {
        appendLog(job, `! pnpm exited with ${chunk.exitCode}`)
      }
      appendLog(job, chunk.text)
      /**
       * The manager's `install-state` event is optional. Without this, a host
       * that does not emit it leaves the panel on `waiting` for the whole
       * install, which is what makes a two-minute step read as a hang.
       */
      job.phase = nextPhase(job.phase, chunk)
      /*
       * Keep the newest line as the activity. Everything pnpm says is one more
       * fact about what it is doing, and the phase is too coarse to answer the
       * only question a waiting person has: is it working or is it stuck?
       */
      const text = typeof chunk.text === 'string' ? chunk.text.trim() : ''
      if (text !== '') {
        const line = text.split(/\r?\n/).filter((part) => part.trim() !== '').at(-1) ?? ''
        const trimmed = line.trim()
        if (trimmed !== '') job.activity = trimmed.length > ACTIVITY_CHARS ? `…${trimmed.slice(-ACTIVITY_CHARS)}` : trimmed
      }
    },
    'plugin-upgrader: install output',
  )

  subscribe(
    'plugin-manager/install-state',
    (state: InstallState) => {
      const job = liveJob
      if (job === null) return
      if (!job.requestIds.includes(state.requestId)) return
      job.phase = state.phase
      job.attempt =
        state.attempt === undefined
          ? undefined
          : {
              index: state.attempt.index,
              total: state.attempt.total,
              registry: state.attempt.registry,
            }
      if (state.attempt !== undefined && state.attempt.total > 1) {
        appendLog(
          job,
          `registry ${state.attempt.index}/${state.attempt.total}: ${state.attempt.registry ?? 'default'}`,
        )
      } else if (state.phase === 'applying') {
        appendLog(job, 'applying the change…')
      }
    },
    'plugin-upgrader: install phase',
  )

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    'plugin-upgrader: routes',
  )

  /**
   * Repair a drop whose install never finished.
   *
   * An upgrade replaces a version by removing the dependency entry and letting
   * pnpm write the new one back. If the process dies inside that window — a
   * restart, a crash, a killed pnpm — the entry is gone and the package is
   * still on disk, which makes the plugin invisible to the manager. The journal
   * written before the drop is what makes that state recoverable, so it is read
   * here, on every load, before anything else can look at the profile.
   */
  const dir = profileDirFrom()
  if (dir !== undefined) {
    try {
      const recovery = recoverPendingDrop(dir)
      if (recovery.kind === 'restored') {
        console.warn(
          `[plugin-upgrader] an interrupted upgrade left ${recovery.name} out of the profile manifest; ` +
            `restored it at ${recovery.spec}. Upgrade it again to finish.`,
        )
      }
    } catch (error) {
      // Recovery is a repair, never a precondition: a profile that cannot be
      // repaired must still load the tab, which is the only way to fix it.
      console.warn(
        `[plugin-upgrader] could not repair an interrupted upgrade: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
