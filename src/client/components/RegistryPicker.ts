/**
 * The registry picker.
 *
 * This is the answer to "the source is wrong and I do not want to ask an AI to
 * edit a YAML file": the address the tab reads versions from is also the
 * address an install asks first, and both follow this one choice.
 *
 * The control is a button that opens a small panel rather than a `<select>`,
 * because the useful entries are a URL each and a native select would either
 * truncate them or show a blank box on a narrow panel. Picking a mirror is one
 * click; typing an address is the fallback for a private registry.
 *
 * @module dsh-plugin-upgrader/client/components/RegistryPicker
 */
import { getH, getReact } from '../env.ts'
import { offeredRegistries, WELL_KNOWN_REGISTRIES, type RegistrySetting } from '../registry.ts'
import type { T } from '../types.ts'

/** Props of {@link RegistryPicker}. */
export interface RegistryPickerProps {
  t: T
  /** The resolved address the overview was read from. */
  active: string
  /** Addresses the host knows about, best first. */
  known: readonly (string | null | undefined)[]
  setting: RegistrySetting
  /** Called after a successful write so the caller can re-read versions. */
  onChanged: () => void
  /** Whether a batch is running; changing the source mid-batch would be confusing. */
  disabled: boolean
}

/**
 * Render the picker.
 *
 * @param props - the translator, the current source, and the setting.
 * @returns the element.
 */
export function RegistryPicker(props: RegistryPickerProps): unknown {
  const h = getH()
  const React = getReact()
  const { t, active, known, setting, onChanged, disabled } = props

  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [problem, setProblem] = React.useState<string | undefined>(undefined)

  const options = offeredRegistries([active, ...WELL_KNOWN_REGISTRIES, ...known])
  const current = setting.saved.trim()

  /**
   * Persist one choice and re-read the versions from it.
   *
   * @param value - the address to save; empty follows pnpm again.
   */
  const choose = async (value: string): Promise<void> => {
    if (saving) return
    setProblem(undefined)
    const trimmed = value.trim()
    if (trimmed !== '' && !/^https?:\/\/\S+$/i.test(trimmed)) {
      setProblem(t('registryInvalid'))
      return
    }
    setSaving(true)
    const ok = await setting.save(trimmed)
    setSaving(false)
    if (!ok) {
      /*
       * A failed write is almost always a stale revision, which the form
       * recovers from on its own; the value on screen is re-read, so asking the
       * user to try again is honest rather than a guess.
       */
      setProblem(t('registrySaveFailed'))
      return
    }
    setOpen(false)
    setDraft('')
    onChanged()
  }

  if (setting.unavailable === 'no-config-forms') {
    /*
     * Without the settings service there is nowhere to persist a choice. The
     * address is still worth showing — it is what the versions below came from
     * — but a control that silently forgot the choice would be worse than none.
     */
    return h('span', { className: 'dsh-pu-mono' }, `${t('registry')}: ${active}`)
  }

  const label = current === '' ? t('registryFollowPnpm') : current

  return h(
    'div',
    { className: 'dsh-pu-reg' },
    h(
      'button',
      {
        type: 'button',
        className: `dsh-pu-btn is-tiny dsh-pu-reg-btn${open ? ' is-open' : ''}`,
        disabled: disabled || saving || setting.writable !== true,
        title: setting.writable === true ? t('registryChange') : t('registryLocked'),
        onClick: () => setOpen((value: boolean) => !value),
      },
      h('span', { className: 'dsh-pu-reg-label' }, `${t('registry')}:`),
      h('span', { className: 'dsh-pu-mono dsh-pu-reg-value' }, label),
      h('span', { className: 'dsh-pu-reg-caret' }, open ? '▴' : '▾'),
    ),

    setting.writable === true
      ? null
      : h('span', { className: 'dsh-pu-hint' }, setting.unavailable === 'loading' ? t('registryLoading') : t('registryLocked')),

    open
      ? h(
          'div',
          { className: 'dsh-pu-reg-panel' },
          options.map((url) =>
            h(
              'button',
              {
                key: url,
                type: 'button',
                className: `dsh-pu-reg-item${sameRegistry(url, active) && current !== '' ? ' is-active' : ''}`,
                disabled: saving,
                onClick: () => {
                  void choose(url)
                },
              },
              h('span', { className: 'dsh-pu-mono' }, url),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: `dsh-pu-reg-item${current === '' ? ' is-active' : ''}`,
              disabled: saving,
              onClick: () => {
                void choose('')
              },
            },
            h('span', null, t('registryFollowPnpm')),
            h('small', null, t('registryFollowPnpmHint')),
          ),
          h(
            'div',
            { className: 'dsh-pu-reg-custom' },
            h('input', {
              type: 'url',
              inputMode: 'url',
              placeholder: t('registryPlaceholder'),
              value: draft,
              onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
              onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                void choose(draft)
              },
              'aria-label': t('registryPlaceholder'),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-tiny',
                disabled: saving || draft.trim() === '',
                onClick: () => {
                  void choose(draft)
                },
              },
              t('registryUse'),
            ),
          ),
          problem === undefined ? null : h('div', { className: 'dsh-pu-reg-problem' }, problem),
        )
      : null,
  )
}

/**
 * Compare two addresses the way a registry treats them.
 *
 * @param a - one address.
 * @param b - the other.
 * @returns whether they name the same source.
 */
function sameRegistry(a: string, b: string): boolean {
  return a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase()
}
