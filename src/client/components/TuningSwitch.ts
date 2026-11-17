/**
 * The switch for the pnpm retry tuning.
 *
 * A batch may rewrite four timeout keys in the profile's `pnpm-workspace.yaml`
 * so that pnpm's verification stops spending minutes per install on retries it
 * would win in seconds (see `../../host/pnpm-tuning.ts` for the measurements).
 * That file belongs to pnpm and the user, not to this plugin, so the change is
 * visible and reversible from here: this button says which state it is in, and
 * pressing it turns the rewrite off for every later batch without touching the
 * lines already written.
 *
 * Rendered as one small pill beside the source picker rather than a dialog: the
 * setting has two states and one sentence of explanation, and a page that
 * already carries a modal for sources does not need a second one for a boolean.
 *
 * @module dsh-plugin-upgrader/client/components/TuningSwitch
 */
import { getH, getReact } from '../env.ts'
import type { TuningSetting } from '../registry.ts'
import type { T } from '../types.ts'

/** Props of {@link TuningSwitch}. */
export interface TuningSwitchProps {
  t: T
  setting: TuningSetting
  /** Whether a batch is running; the next batch is what a change would affect. */
  disabled: boolean
}

/**
 * Render the tuning switch.
 *
 * @param props - the translator, the setting, and whether it may be pressed.
 * @returns the element.
 */
export function TuningSwitch(props: TuningSwitchProps): unknown {
  const h = getH()
  const React = getReact()
  const { t, setting, disabled } = props
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const toggle = (): void => {
    if (busy || setting.writable !== true) return
    setFailed(false)
    setBusy(true)
    void setting.save(!setting.enabled).then((ok: boolean) => {
      setBusy(false)
      if (!ok) setFailed(true)
    })
  }

  const label = setting.enabled ? t('tuningOn') : t('tuningOff')
  /*
   * A host without the settings service cannot remember a choice, so the pill is
   * shown as read-only rather than hidden: the fact that a batch rewrites the
   * workspace manifest is worth knowing even where it cannot be switched off,
   * and the hint beside it is the only place that says so.
   */
  const locked = setting.writable !== true
  const title = failed
    ? t('tuningSaveFailed')
    : locked
      ? setting.unavailable === 'loading'
        ? t('registryLoading')
        : t('registryLocked')
      : t('tuningHint')

  return h(
    'div',
    { className: 'dsh-pu-reg' },
    h(
      'button',
      {
        type: 'button',
        className: `dsh-pu-stat is-action${setting.enabled ? ' is-on' : ''}`,
        disabled: disabled || busy || locked,
        title,
        'aria-pressed': setting.enabled ? 'true' : 'false',
        onClick: toggle,
      },
      t('tuning'),
      ' ',
      h('b', null, busy ? t('tuningSaving') : label),
    ),
  )
}
