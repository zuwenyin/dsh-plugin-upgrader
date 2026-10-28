/**
 * Batch progress panel.
 *
 * A batch outlives the tab, so this panel is fed by polling rather than by the
 * request that started it: reopening the Plugins page mid-batch shows the same
 * progress the previous tab was showing.
 *
 * Progress is reported per step, and one step can occupy minutes on its own —
 * a lockfile verification, a registry retry. A bar that only moves when a step
 * ends reads as a hang, so while a step is in flight the panel shows an
 * indeterminate bar, a live elapsed clock, and the phase the host reports.
 *
 * @module dsh-plugin-upgrader/client/components/JobPanel
 */
import { getH, getReact } from '../env.ts'
import { formatElapsed } from '../format.ts'
import type { JobSnapshot, T } from '../types.ts'

/** Props of {@link JobPanel}. */
export interface JobPanelProps {
  job: JobSnapshot
  t: T
  onCancel: () => void
  cancelling: boolean
}

/** How often the elapsed clock redraws while a step runs. */
const CLOCK_MS = 1000

/**
 * How long the panel trusts a snapshot it has not seen change.
 *
 * Polling delivers a fresh object every round, so a snapshot that stops
 * changing means the tab stopped hearing from the host — a dropped request, a
 * sleeping window, a host that restarted. The clock has to notice: a step that
 * "has been running" for eighteen minutes because nobody updated it is worse
 * than no clock at all.
 */
const STALE_SNAPSHOT_MS = 20 * 1000

/**
 * A clock that ticks only while `running`, so a settled panel stops redrawing.
 *
 * @param running - whether time is still passing.
 * @param from - the timestamp the window started at.
 * @returns the current time, or `from`.
 */
function useNow(running: boolean, from: number | undefined): number {
  const React = getReact()
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!running || from === undefined) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [running, from])
  return now
}

/**
 * Render the running or finished batch.
 *
 * @param props - the snapshot and cancel action.
 * @returns the element.
 */
export function JobPanel(props: JobPanelProps): unknown {
  const h = getH()
  const React = getReact()
  const { job, t, onCancel, cancelling } = props
  const [showLog, setShowLog] = React.useState(true)
  const total = job.total ?? 0
  const done = job.done ?? 0
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const running = job.status === 'running' || job.status === 'queued'
  const failed = job.failed ?? 0
  const inStep = running && job.current !== undefined
  const now = useNow(inStep, job.stepStartedAt)
  /**
   * A snapshot is stale when the panel has not seen a *different* one for a
   * while. `startedAt`/`stepStartedAt`/`done` stand in for the whole payload:
   * any real progress moves at least one of them. The activity line counts too —
   * a step that keeps printing is alive even when nothing else has moved.
   */
  const stamp = `${job.id}|${job.stepStartedAt ?? ''}|${job.done ?? 0}|${job.status}|${job.activity ?? ''}`
  const lastChange = React.useRef({ stamp, at: Date.now() })
  if (lastChange.current.stamp !== stamp) lastChange.current = { stamp, at: Date.now() }
  const stale = inStep && Date.now() - lastChange.current.at > STALE_SNAPSHOT_MS
  const stepMs =
    job.stepStartedAt === undefined ? 0 : Math.max(0, now - job.stepStartedAt)
  const phaseKey =
    job.phase === 'installing'
      ? 'phaseInstalling'
      : job.phase === 'applying'
        ? 'phaseApplying'
        : job.phase === 'cancelling'
          ? 'phaseCancelling'
          : job.phase === 'verifying'
            ? 'phaseVerifying'
            : 'phaseWaiting'
  const phaseText =
    job.attempt !== undefined && job.attempt.total > 1
      ? t('registryAttempt', job.attempt.index, job.attempt.total)
      : t(phaseKey)
  const headline = running
    ? t('progress', done, total)
    : job.status === 'cancelled'
      ? t('jobCancelled')
      : t('jobDone')
  return h(
    'div',
    { className: 'dsh-pu-job' },
    h(
      'div',
      { className: 'dsh-pu-job-head' },
      running ? h('span', { className: 'dsh-pu-spin' }) : null,
      h(
        'span',
        { className: 'dsh-pu-grow' },
        headline,
        job.current === undefined ? null : h('span', { className: 'dsh-pu-mono' }, ` ${job.current}`),
        inStep
          ? h(
              'span',
              { className: 'dsh-pu-dim' },
              ` · ${phaseText} · ${t('elapsed', formatElapsed(stepMs))}`,
            )
          : null,
        // Once the snapshot stops moving the clock is reporting a number nobody
        // is updating, so say so instead of letting it climb.
        stale ? h('span', { className: 'dsh-pu-dim' }, ` · ${t('staleSnapshot')}`) : null,
        job.abandoned === true ? h('span', { className: 'dsh-pu-dim' }, ` · ${t('stalled')}`) : null,
      ),
      failed > 0 ? h('span', { className: 'dsh-pu-tag is-err' }, t('failedSome', failed)) : null,
      running
        ? h(
            'button',
            { type: 'button', className: 'dsh-pu-btn is-tiny', disabled: cancelling, onClick: onCancel },
            cancelling ? t('cancelling') : t('cancel'),
          )
        : null,
      h(
        'button',
        { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: () => setShowLog((value) => !value) },
        showLog ? t('hideLog') : t('showLog'),
      ),
    ),
    h(
      'div',
      { className: 'dsh-pu-bar' },
      inStep
        ? h('div', { className: 'dsh-pu-bar-inner is-busy' })
        : h('div', { className: 'dsh-pu-bar-inner', style: { width: `${percent}%` } }),
    ),
    /*
     * The live line pnpm last printed. A phase name says which category of wait
     * this is; this says whether anything is actually happening — a registry
     * timeout and a download both read as "installing" otherwise.
     */
    inStep && job.activity !== undefined
      ? h('div', { className: 'dsh-pu-activity', title: job.activity }, job.activity)
      : null,
    inStep ? h('div', { className: 'dsh-pu-hint' }, t('slowHint')) : null,
    showLog && Array.isArray(job.log) ? h('pre', { className: 'dsh-pu-log' }, job.log.join('\n')) : null,
  )
}
