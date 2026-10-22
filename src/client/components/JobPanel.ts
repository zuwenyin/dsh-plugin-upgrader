/**
 * Batch progress panel.
 *
 * A batch outlives the tab, so this panel is fed by polling rather than by the
 * request that started it: reopening the Plugins page mid-batch shows the same
 * progress the previous tab was showing.
 *
 * @module dsh-plugin-upgrader/client/components/JobPanel
 */
import { getH, getReact } from '../env.ts'
import type { JobSnapshot, T } from '../types.ts'

/** Props of {@link JobPanel}. */
export interface JobPanelProps {
  job: JobSnapshot
  t: T
  onCancel: () => void
  cancelling: boolean
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
        running ? t('progress', done, total) : job.status === 'cancelled' ? t('jobCancelled') : t('jobDone'),
        job.current === undefined ? null : h('span', { className: 'dsh-pu-mono' }, ` ${job.current}`),
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
    h('div', { className: 'dsh-pu-bar' }, h('div', { style: { width: `${percent}%` } })),
    showLog && Array.isArray(job.log) ? h('pre', { className: 'dsh-pu-log' }, job.log.join('\n')) : null,
  )
}
