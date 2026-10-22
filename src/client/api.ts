/**
 * Data loading and the operations the tab performs.
 *
 * Every call goes to this bundle's own host routes: the browser cannot read the
 * profile's dependency list, and a private registry would be unreachable from a
 * page anyway.
 *
 * @module dsh-plugin-upgrader/client/api
 */
import { getReact } from './env.ts'
import { isRequestFailure, readJson, type RequestFailure } from './format.ts'
import type { JobSnapshot, Overview, StepRecord } from './types.ts'

/** Host route prefix registered by the host half. */
export const API = '/api/plugin-upgrader'

/** How often a running batch job is polled. */
export const POLL_MS = 800

/** The loaded overview plus its request state. */
export interface OverviewState {
  data: Overview | undefined
  error: string | undefined
  loading: boolean
  reload: (force?: boolean) => void
}

/** What a finished job's results say the tab should show. */
export interface Settled {
  failures: { name: string; message?: string; detail?: string }[]
  restartRequired: boolean
}

/**
 * Load the overview once and on demand.
 *
 * @param localeId - active locale id for localized metadata.
 * @returns the load state and a reload trigger.
 */
export function useOverview(localeId: string): OverviewState {
  const React = getReact()
  const [state, setState] = React.useState<{ data: Overview | undefined; error: string | undefined; loading: boolean }>(
    { data: undefined, error: undefined, loading: true },
  )
  const [tick, setTick] = React.useState(0)
  const [force, setForce] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: undefined }))
    const query = new URLSearchParams({ refresh: force ? '1' : '0', locale: localeId })
    fetch(`${API}/overview?${query.toString()}`, { credentials: 'same-origin' })
      .then((response) => readJson<Overview>(response))
      .then((data) => {
        if (cancelled) return
        setState({ data, error: undefined, loading: false })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        }))
      })
    return () => {
      cancelled = true
    }
  }, [localeId, tick, force])

  const reload = React.useCallback((shouldForce = false) => {
    setForce(shouldForce)
    setTick((value) => value + 1)
  }, [])

  return { ...state, reload }
}

/**
 * Start a batch of steps.
 *
 * @param steps - the steps to run.
 * @returns the new job id.
 * @throws a {@link RequestFailure}; a 409 carries the id of the running job.
 */
export async function startJob(steps: StepRecord[]): Promise<string> {
  const response = await fetch(`${API}/job`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ steps }),
  })
  const started = await readJson<{ id: string }>(response)
  return started.id
}

/** Polling controls for one batch. */
export interface WatchOptions {
  /** False once the tab unmounted; polling stops. */
  isAlive: () => boolean
  /** Called with every snapshot. */
  onSnapshot: (snapshot: JobSnapshot) => void
}

/**
 * Poll a job until it settles.
 *
 * @param id - the job id.
 * @param options - liveness probe and snapshot sink.
 * @returns the settled snapshot, or undefined when polling stopped early.
 */
export async function watchJob(id: string, options: WatchOptions): Promise<JobSnapshot | undefined> {
  for (;;) {
    if (!options.isAlive()) return undefined
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${API}/job?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await readJson<JobSnapshot>(response).catch(() => undefined)
    if (snapshot === undefined) return undefined
    if (options.isAlive()) options.onSnapshot(snapshot)
    if (snapshot.status !== 'running' && snapshot.status !== 'queued') return snapshot
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
}

/**
 * Start a batch, adopting a job that is already running.
 *
 * A batch already in flight is not an error the user caused: the tab adopts it
 * and keeps reporting its progress rather than showing a dead "busy".
 *
 * @param steps - the steps to run.
 * @param watch - polls an adopted or fresh job to completion.
 * @returns either the started id, an adopted snapshot, or a failure.
 */
export async function submitJob(
  steps: StepRecord[],
  watch: (id: string) => Promise<JobSnapshot | undefined>,
): Promise<
  | { kind: 'started'; id: string; settled: JobSnapshot | undefined }
  | { kind: 'adopted'; settled: JobSnapshot | undefined }
  | { kind: 'failed'; error: unknown }
> {
  try {
    const id = await startJob(steps)
    return { kind: 'started', id, settled: await watch(id) }
  } catch (error) {
    if (isRequestFailure(error) && error.status === 409 && typeof error.body?.id === 'string') {
      return { kind: 'adopted', settled: await watch(error.body.id) }
    }
    return { kind: 'failed', error }
  }
}

/**
 * Ask the host to stop the in-flight step.
 *
 * @returns nothing; the poll loop reports the final state anyway.
 */
export async function cancelJob(): Promise<void> {
  try {
    await fetch(`${API}/cancel`, { method: 'POST', credentials: 'same-origin' })
  } catch {
    /* the poll loop reports the final state anyway */
  }
}

/**
 * Summarize a settled job for the banner.
 *
 * @param settled - the finished snapshot.
 * @returns the failures and whether a restart is pending.
 */
export function summarize(settled: JobSnapshot | undefined): Settled {
  const results = Array.isArray(settled?.results) ? settled.results : []
  return {
    failures: results
      .filter((result) => result.ok !== true)
      .map((result) => ({ name: result.name, message: result.message, detail: result.detail })),
    restartRequired: results.some((result) => result.application === 'restart-required'),
  }
}
