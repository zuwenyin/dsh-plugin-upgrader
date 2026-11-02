/**
 * The dialog behind the banner's restart button.
 *
 * It cannot restart anything, and it says so: a plugin page has no channel to
 * the process that would have to exit. The desktop shell keeps relaunch in its
 * main process and exposes no IPC for it, and a host started from a terminal
 * has nobody to start it again. So the dialog does the two things a page *can*
 * do — name the exact action that finishes the restart, and notice when it has
 * happened — instead of showing a button that would quietly reload the page and
 * leave the change unapplied.
 *
 * The pid from `GET /api/plugin-upgrader/host` is what makes the second part
 * work: it is the one value that changes when the process is replaced, and the
 * page polls it until it does.
 *
 * @module dsh-plugin-upgrader/client/components/RestartDialog
 */
import { readHostInfo } from '../api.ts'
import { reloadWhenBootDocumentFresh } from '../boot.ts'
import { getH, getReact } from '../env.ts'
import type { HostInfo, T } from '../types.ts'

/** How often the page asks whether the host came back. */
const PROBE_MS = 1000

/**
 * How long the page waits before it stops claiming to be waiting.
 *
 * Long enough for a real restart on a slow disk, short enough that the dialog
 * says what is wrong instead of spinning through a coffee break.
 */
const WAIT_LIMIT_MS = 120_000

/** What the dialog is doing. */
type Phase = 'loading' | 'ready' | 'failed' | 'waiting' | 'stalled'

/** Props for {@link RestartDialog}. */
export interface RestartDialogProps {
  t: T
  onClose: () => void
}

/**
 * Render the restart instructions for the running host.
 *
 * @param props - the translator and the close handler.
 * @returns the dialog.
 */
export function RestartDialog(props: RestartDialogProps): unknown {
  const { t, onClose } = props
  const h = getH()
  const React = getReact()
  const [host, setHost] = React.useState<HostInfo | undefined>(undefined)
  const [phase, setPhase] = React.useState<Phase>('loading')
  const [problem, setProblem] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  /**
   * The poll timer, held in a ref so it outlives re-renders and can be cleared
   * from the unmount effect. Without it a dialog closed mid-wait would keep
   * asking forever and reload the page long after the user left.
   */
  const timerRef = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    let live = true
    void readHostInfo()
      .then((info) => {
        if (!live) return
        setHost(info)
        setPhase('ready')
      })
      .catch((error: unknown) => {
        if (!live) return
        setProblem(error instanceof Error ? error.message : String(error))
        setPhase('failed')
      })
    return () => {
      live = false
    }
  }, [])

  /** Stop the wait, so a closed dialog stops reloading the page behind it. */
  const stop = React.useCallback(() => {
    const timer = timerRef.current
    if (timer === undefined) return
    timerRef.current = undefined
    window.clearInterval(timer)
  }, [])

  React.useEffect(() => stop, [stop])

  /**
   * Poll the host until its pid changes, then reload.
   *
   * A failed request is expected while the host is down and is not reported:
   * the whole point of the wait is that the process is gone for a moment. Only
   * a pid that does not change before the deadline is worth saying out loud.
   */
  const waitForRestart = React.useCallback(() => {
    const before = host?.pid
    if (before === undefined) return
    setPhase('waiting')
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      void readHostInfo()
        .then((info) => {
          if (info.pid === before) {
            if (Date.now() - startedAt > WAIT_LIMIT_MS) {
              stop()
              setPhase('stalled')
            }
            return
          }
          stop()
          /**
           * The page is served by the process that just changed, so it must be
           * re-fetched rather than trusted: a reload onto a boot document the new
           * generation no longer answers 404s every module in it.
           */
          let blocked = false
          void reloadWhenBootDocumentFresh({
            onBlocked: () => {
              blocked = true
              setProblem(t('restartReloadBlocked'))
              setPhase('stalled')
            },
          }).then((done) => {
            // A page that cannot reload at all still needs to say so.
            if (!done && !blocked) setPhase('stalled')
          })
        })
        .catch(() => {
          /* the host is between lives; keep asking */
        })
    }, PROBE_MS)
    timerRef.current = timer
  }, [host?.pid, stop, t])

  const copy = React.useCallback(() => {
    const command = host?.command ?? ''
    if (command === '') return
    void navigator.clipboard
      ?.writeText(command)
      .then(() => {
        setCopied(true)
      })
      .catch(() => {
        /* selecting the text is still possible; the button is a convenience */
      })
  }, [host?.command])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const desktop = host?.kind === 'desktop'

  return h(
    'div',
    { className: 'dsh-pu-modal' },
    h('div', { className: 'dsh-pu-modal-backdrop', onClick: onClose, 'aria-hidden': 'true' }),
    h(
      'div',
      {
        className: 'dsh-pu-modal-body',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('restartTitle'),
      },
      h(
        'div',
        { className: 'dsh-pu-modal-head' },
        h('span', { className: 'dsh-pu-modal-title' }, t('restartTitle')),
        h('button', { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: onClose }, '✕'),
      ),
      h('p', { className: 'dsh-pu-modal-sub' }, t('restartBody')),

      phase === 'loading' ? h('p', { className: 'dsh-pu-hint' }, t('restartLoading')) : null,

      phase === 'failed'
        ? h('p', { className: 'dsh-pu-hint' }, t('restartLoadFailed', problem))
        : null,

      desktop
        ? h('p', { className: 'dsh-pu-hint' }, t('restartDesktopHint'))
        : host === undefined
          ? null
          : h(
              'div',
              { className: 'dsh-pu-cmdbox' },
              h('p', { className: 'dsh-pu-hint' }, t('restartCommandHint')),
              h('code', { className: 'dsh-pu-cmd' }, host.command),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny',
                  onClick: copy,
                  disabled: host.command === '',
                },
                copied ? t('restartCopied') : t('restartCopy'),
              ),
            ),

      host === undefined
        ? null
        : h('p', { className: 'dsh-pu-hint' }, t('restartPid', host.pid, host.profileName ?? '—')),

      phase === 'waiting' ? h('p', { className: 'dsh-pu-hint' }, t('restartWaiting')) : null,
      phase === 'stalled' ? h('p', { className: 'dsh-pu-hint' }, t('restartStillOld')) : null,

      h(
        'div',
        { className: 'dsh-pu-src-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-primary is-tiny',
            onClick: waitForRestart,
            disabled: host === undefined || phase === 'waiting',
          },
          phase === 'waiting' ? t('restartWaiting') : t('restartRefresh'),
        ),
        h(
          'button',
          { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: onClose },
          t('sourcesClose'),
        ),
      ),
    ),
  )
}
