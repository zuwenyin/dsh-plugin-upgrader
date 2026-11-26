/**
 * The confirmation step in front of a batch of removals.
 *
 * Everything else this page does is reversible. A version change can be undone
 * by switching back, and a failed one is rolled back for you. A removal is the
 * one action with no way back: the package is gone from the profile, and the
 * only undo is installing it again — which is a different decision with a
 * different version. So the list is spelled out, by name, and the confirm button
 * is the only button here that looks dangerous.
 *
 * It also names what is *not* deleted: a plugin's own settings usually live in
 * `$DSH_HOME`, not in its package, and leaving that unsaid makes people either
 * expect their configuration to be gone or assume the whole plugin is.
 *
 * @module dsh-plugin-upgrader/client/components/RemoveDialog
 */
import { getH, getReact } from '../env.ts'
import type { T } from '../types.ts'

/** Props of {@link RemoveDialog}. */
export interface RemoveDialogProps {
  t: T
  /** The rows that will be removed, in list order. */
  names: string[]
  /** Whether a batch is already running; the buttons say so. */
  busy: boolean
  /** Close without doing anything. */
  onClose: () => void
  /** Start the removal batch. */
  onConfirm: () => void
}

/**
 * Ask once before removing a batch of plugins.
 *
 * @param props - the dialog's properties.
 * @returns the element.
 */
export function RemoveDialog(props: RemoveDialogProps): unknown {
  const h = getH()
  const React = getReact()
  const { t, names, busy, onClose, onConfirm } = props

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

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
        'aria-label': t('removeTitle'),
      },
      h(
        'div',
        { className: 'dsh-pu-modal-head' },
        h('span', { className: 'dsh-pu-modal-title' }, t('removeTitle')),
        h('button', { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: onClose }, '✕'),
      ),
      h('p', { className: 'dsh-pu-modal-sub' }, t('removeBody')),
      h(
        'div',
        { className: 'dsh-pu-rm-list' },
        h('span', { className: 'dsh-pu-rm-head' }, t('removeListTitle')),
        ...names.map((name) =>
          h(
            'span',
            { key: name, className: 'dsh-pu-rm-name' },
            h('span', { className: 'dsh-pu-mono' }, name),
          ),
        ),
      ),
      h(
        'div',
        { className: 'dsh-pu-src-foot' },
        h('span', { className: 'dsh-pu-hint' }, t('removeHint')),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-tiny',
            onClick: onClose,
          },
          t('cancel'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-tiny is-danger',
            /**
             * A disabled confirm is not a safety feature by itself — the dialog
             * exists because the list has to be read — but it keeps a stray
             * double-click from starting the batch twice. `run` would answer the
             * second one with the busy banner instead.
             */
            disabled: busy || names.length === 0,
            onClick: onConfirm,
          },
          `${t('removeConfirm')} (${names.length})`,
        ),
      ),
    ),
  )
}
