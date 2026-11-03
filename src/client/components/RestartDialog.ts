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
type Phase = 'loading' | 'ready' | 'failed' | 'waiting' | 'idle' | 'stalled'

/**
 * What a stalled wait should say.
 *
 * Both dead ends land in `stalled` and they are not the same advice: the pid
 * never changed (restart again), or it did but the page could not reload onto
 * the new host (`problem` says so, and only another restart helps). Telling
 * someone whose host *did* restart that it "has not been replaced yet" sends
 * them to check a process that no longer exists.
 *
 * Extracted so the rule can be tested without rendering the dialog.
 *
 * @param problem - the message set by the caller, empty when there is none.
 * @param t - the translator.
 * @returns the sentence to show.
 */
export function stalledMessage(problem: string, t: T): string {
  return problem.trim() === '' ? t('restartStillOld') : problem
}

/** What one poll of the host should do next. */
export type ProbeVerdict = 'keep-waiting' | 'give-up' | 'restarted'

/**
 * Decide what a single poll means.
 *
 * Three rules, and each of them was a bug the other way round:
 *
 * - A changed pid is a restart, whatever the clock says. Quitting and
 *   reopening DSH takes as long as the person takes, so a slow restart that
 *   lands past the deadline must not be thrown away.
 * - The deadline only stops the dialog *claiming* to wait; it does not stop the
 *   watch. `give-up` means "say so", not "stop asking" — someone who comes back
 *   to the window later should still be told the host is up.
 * - A pid that cannot be read is not a restart. Only a number that differs from
 *   the one the page was talking to counts.
 *
 * Extracted so those three rules can be tested without a DOM.
 *
 * @param before - the pid the page was talking to when the wait started.
 * @param now - the pid the host just reported, or `undefined` when it did not.
 * @param elapsed - milliseconds since the wait started.
 * @param deadline - whether this wait may report running out of time.
 * @param limit - the deadline in milliseconds.
 * @returns what the dialog should do with this poll.
 */
export function probeVerdict(
  before: number,
  now: number | undefined,
  elapsed: number,
  deadline: boolean,
  limit: number,
): ProbeVerdict {
  if (now !== undefined && now !== before) return 'restarted'
  return deadline && elapsed > limit ? 'give-up' : 'keep-waiting'
}

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

  /**
   * The wait as the load effect sees it.
   *
   * The load effect must run exactly once (a second run would re-read the pid
   * the wait is anchored to), yet it has to start the wait with the pid it just
   * learned. Going through a ref keeps that one-shot effect from having to
   * depend on a callback whose identity can change.
   */
  const beginWaitRef = React.useRef<((pid: number, deadline: boolean) => void) | undefined>(undefined)

  React.useEffect(() => {
    let live = true
    void readHostInfo()
      .then((info) => {
        if (!live) return
        setHost(info)
        setPhase('ready')
        /**
         * Start watching immediately: the user still has to quit and reopen
         * DSH, and making them come back to press a second button afterwards
         * asks for a click at the exact moment they are least likely to be
         * looking at this window.
         */
        beginWaitRef.current?.(info.pid, true)
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
   * the whole point of the wait is that the process is gone for a moment.
   *
   * The deadline exists to keep an open dialog honest, not to end the watch:
   * quitting and reopening DSH takes as long as the person takes. When it
   * passes, the dialog stops saying "waiting" and offers to check again, while
   * the watch itself keeps running — someone who does come back to the window
   * is then told the host is back instead of having to press anything.
   *
   * @param pid - the process the page is currently talking to.
   * @param deadline - whether this start may report a stalled wait.
   */
  const waitForRestart = React.useCallback(
    (pid: number, deadline: boolean) => {
      stop()
      setProblem('')
      setPhase('waiting')
      const startedAt = Date.now()
      let reported = false
      const timer = window.setInterval(() => {
        void readHostInfo()
          .then((info) => {
            const elapsed = Date.now() - startedAt
            const verdict = probeVerdict(pid, info.pid, elapsed, deadline, WAIT_LIMIT_MS)
            if (verdict === 'keep-waiting') return
            if (verdict === 'give-up') {
              /**
               * Say so, but keep the timer: the wait is still the only thing
               * that can notice the restart, and it must not depend on someone
               * pressing a button after they already did the hard part. The
               * flag keeps the message from re-rendering on every poll.
               */
              if (reported) return
              reported = true
              setPhase('idle')
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
              /**
               * A page that cannot reload at all takes the same dead end as one
               * that was stopped, but not the same advice: nothing here says the
               * plugin list is out of date, only that this page cannot refresh
               * itself. "It has not been replaced yet" would be wrong either way,
               * because the host *did* restart.
               */
              if (!done && !blocked) {
                setProblem(t('restartReloadRefused'))
                setPhase('stalled')
              }
            })
          })
          .catch(() => {
            /* the host is between lives; keep asking */
          })
      }, PROBE_MS)
      timerRef.current = timer
    },
    [stop, t],
  )

  /**
   * Hand the wait to the load effect.
   *
   * Assigned in an effect rather than during render: the load effect always
   * resolves a fetch later, so this assignment is in place long before the pid
   * arrives, and nothing writes to a ref while React is rendering.
   */
  React.useEffect(() => {
    beginWaitRef.current = waitForRestart
  }, [waitForRestart])

  /**
   * Check again on demand.
   *
   * Rarely needed — the wait starts by itself — but it is the only way back
   * from `stalled`, where the timer was stopped because the host *did* change
   * and the page could not follow it.
   */
  const checkAgain = React.useCallback(() => {
    const pid = host?.pid
    if (pid === undefined) return
    waitForRestart(pid, true)
  }, [host?.pid, waitForRestart])

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
      phase === 'idle' ? h('p', { className: 'dsh-pu-hint' }, t('restartIdle')) : null,
      phase === 'stalled' ? h('p', { className: 'dsh-pu-hint' }, stalledMessage(problem, t)) : null,

      h(
        'div',
        { className: 'dsh-pu-src-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-primary is-tiny',
            onClick: checkAgain,
            /**
             * The wait starts on its own, so pressing this is never required.
             * It stays disabled while a wait is running — the answer arrives
             * without a click — and comes back when the wait gave up, so a
             * person who fixed the problem by hand is not stuck reloading.
             */
            disabled: host === undefined || phase === 'waiting' || phase === 'loading',
          },
          phase === 'waiting' ? t('restartWaiting') : t('restartRecheck'),
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
