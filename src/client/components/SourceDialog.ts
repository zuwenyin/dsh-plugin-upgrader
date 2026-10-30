/**
 * The install-source dialog.
 *
 * This is the answer to "the source is wrong and I do not want to ask an AI to
 * edit a YAML file": the address the tab reads versions from is also the
 * address an install asks first, and both follow this one choice. The dialog is
 * where the whole set of sources lives — the two built-in ones, the ones the
 * user added, and the option of following pnpm's own config.
 *
 * The built-in rows deliberately have no edit and no delete control. That is not
 * a disabled button: those addresses are compiled in (`WELL_KNOWN_REGISTRIES`)
 * and are never written into the saved list, so there is nothing to edit and
 * nothing to remove. A user who wants a variation adds it as a custom source.
 *
 * @module dsh-plugin-upgrader/client/components/SourceDialog
 */
import { probeRegistry, type RegistryProbe } from '../api.ts'
import { getH, getReact } from '../env.ts'
import {
  addSource,
  comparisonKey,
  editSource,
  isBuiltinRegistry,
  isRegistryAddress,
  offeredRegistries,
  removeSource,
  WELL_KNOWN_REGISTRIES,
  type RegistrySetting,
} from '../registry.ts'
import type { T } from '../types.ts'

/** Props of {@link RegistrySourceButton}. */
export interface RegistrySourceButtonProps {
  t: T
  /** The resolved address the overview was read from. */
  active: string
  /** Addresses the host's manager is configured with, best first. */
  known: readonly (string | null | undefined)[]
  setting: RegistrySetting
  /** Called after a successful write so the caller can re-read versions. */
  onChanged: () => void
  /** Whether a batch is running; changing the source mid-batch would be confusing. */
  disabled: boolean
}

/** What a row is doing right now. */
interface ProbeState {
  status: 'testing' | 'ok' | 'fail'
  detail?: string
}

/**
 * Render the trigger button and, while it is open, the dialog.
 *
 * @param props - the translator, the current source, and the setting.
 * @returns the element.
 */
export function RegistrySourceButton(props: RegistrySourceButtonProps): unknown {
  const h = getH()
  const React = getReact()
  const { t, active, known, setting, onChanged, disabled } = props

  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [editing, setEditing] = React.useState<number | undefined>(undefined)
  const [editDraft, setEditDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | undefined>(undefined)
  const [probes, setProbes] = React.useState<Record<string, ProbeState>>({})

  /*
   * Escape closes the dialog. A modal that only closes by hitting the backdrop
   * traps keyboard users, and this one covers the whole tab.
   */
  React.useEffect(() => {
    if (!open) return undefined
    const onKey = (event: { key: string; preventDefault: () => void }): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('keydown', onKey as unknown as EventListener)
    return () => document.removeEventListener('keydown', onKey as unknown as EventListener)
  }, [open])

  const saved = setting.saved.trim()
  const current: string = saved === '' ? t('registryFollowPnpm') : saved
  const custom = setting.custom
  /*
   * Addresses the host's manager is configured with but that are neither built
   * in nor something the user added. They are worth showing — a private registry
   * configured in `pluginManager.registry` is a source this tab already uses —
   * and the user can keep one in their own list with one click.
   */
  const hostSources = offeredRegistries(known).filter(
    (url) =>
      !isBuiltinRegistry(url) &&
      !custom.some((entry) => comparisonKey(entry) === comparisonKey(url)) &&
      comparisonKey(url) !== comparisonKey(saved),
  )

  if (setting.unavailable === 'no-config-forms') {
    /*
     * Without the settings service there is nowhere to persist a choice. The
     * address is still worth showing — it is what the versions below came from
     * — but a control that silently forgot the choice would be worse than none.
     */
    return h('span', { className: 'dsh-pu-mono' }, `${t('registry')}: ${active}`)
  }

  /**
   * Persist the source in use.
   *
   * @param value - the address to save; empty follows pnpm again.
   * @returns whether it was written.
   */
  const apply = async (value: string): Promise<boolean> => {
    if (busy) return false
    setProblem(undefined)
    const trimmed = value.trim()
    if (trimmed !== '' && !isRegistryAddress(trimmed)) {
      setProblem(t('registryInvalid'))
      return false
    }
    setBusy(true)
    const ok = await setting.save(trimmed)
    setBusy(false)
    if (!ok) {
      setProblem(t('registrySaveFailed'))
      return false
    }
    onChanged()
    return true
  }

  /**
   * Persist the user's source list.
   *
   * @param next - the complete list to store.
   * @returns whether it was written.
   */
  const writeSources = async (next: readonly string[]): Promise<boolean> => {
    setProblem(undefined)
    setBusy(true)
    const ok = await setting.saveSources(next)
    setBusy(false)
    if (!ok) {
      setProblem(t('registrySaveFailed'))
      return false
    }
    return true
  }

  /**
   * Add one source to the user's list.
   *
   * @param value - the address to add; the input's contents when omitted.
   */
  const add = async (value?: string): Promise<void> => {
    const candidate = value ?? draft
    const next = addSource(custom, candidate)
    if (next === undefined) {
      setProblem(isRegistryAddress(candidate) ? t('sourceExists') : t('registryInvalid'))
      return
    }
    if (!(await writeSources(next))) return
    if (value === undefined) setDraft('')
  }

  /**
   * Apply the edit of one custom row.
   *
   * @param index - the row being edited.
   */
  const commitEdit = async (index: number): Promise<void> => {
    const next = editSource(custom, index, editDraft)
    if (next === undefined) {
      setProblem(isRegistryAddress(editDraft) ? t('sourceExists') : t('registryInvalid'))
      return
    }
    const wasActive = comparisonKey(custom[index] ?? '') === comparisonKey(saved)
    if (!(await writeSources(next))) return
    setEditing(undefined)
    setEditDraft('')
    /*
     * Editing the address that is in use would leave `registry` naming a source
     * the list no longer holds, so follow the edit instead of silently pointing
     * an install at the old address.
     */
    if (wasActive) await apply(next[index] ?? '')
  }

  /**
   * Remove one custom row.
   *
   * @param index - the row to remove.
   */
  const drop = async (index: number): Promise<void> => {
    const next = removeSource(custom, index)
    if (next === undefined) return
    const wasActive = comparisonKey(custom[index] ?? '') === comparisonKey(saved)
    if (!(await writeSources(next))) return
    if (editing === index) setEditing(undefined)
    /* A deleted source must not stay the one installs ask first. */
    if (wasActive) await apply('')
  }

  /**
   * Test one address through the host.
   *
   * @param url - the address to probe.
   */
  const test = async (url: string): Promise<void> => {
    const key = comparisonKey(url)
    setProbes((previous: Record<string, ProbeState>) => ({ ...previous, [key]: { status: 'testing' } }))
    let result: RegistryProbe
    try {
      result = await probeRegistry(url)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setProbes((previous: Record<string, ProbeState>) => ({
        ...previous,
        [key]: { status: 'fail', detail },
      }))
      return
    }
    setProbes((previous: Record<string, ProbeState>) => ({
      ...previous,
      [key]: {
        status: result.ok ? 'ok' : 'fail',
        detail: result.ok && result.ms !== undefined ? `${result.detail} · ${result.ms} ms` : result.detail,
      },
    }))
  }

  /**
   * One probe verdict, as a line under a row.
   *
   * @param url - the address the verdict belongs to.
   * @returns the element, or null when nothing was tested.
   */
  const verdict = (url: string): unknown => {
    const state = probes[comparisonKey(url)]
    if (state === undefined) return null
    if (state.status === 'testing') {
      return h(
        'span',
        { className: 'dsh-pu-src-verdict' },
        h('i', { className: 'dsh-pu-spin' }),
        t('sourceTesting'),
      )
    }
    const ok = state.status === 'ok'
    return h(
      'span',
      { className: `dsh-pu-src-verdict ${ok ? 'is-ok' : 'is-err'}` },
      `${ok ? t('sourceReachable') : t('sourceUnreachable')}${state.detail === undefined ? '' : ` · ${state.detail}`}`,
    )
  }

  /**
   * The controls one source row carries.
   *
   * @param url - the address.
   * @param inUse - whether it is the address in use right now.
   * @param editable - whether it is a custom row (built-ins never are).
   * @param index - the custom row index, when editable.
   * @returns the row element.
   */
  const row = (url: string, inUse: boolean, editable: boolean, index: number): unknown =>
    h(
      'div',
      { className: `dsh-pu-src-row${inUse ? ' is-active' : ''}`, key: url },
      h(
        'div',
        { className: 'dsh-pu-src-id' },
        h('span', { className: 'dsh-pu-mono dsh-pu-src-url' }, url),
        h(
          'div',
          { className: 'dsh-pu-src-meta' },
          editable
            ? null
            : h('span', { className: 'dsh-pu-tag' }, t('sourceBuiltin')),
          inUse ? h('span', { className: 'dsh-pu-tag is-new' }, t('sourceInUse')) : null,
        ),
      ),
      h(
        'div',
        { className: 'dsh-pu-src-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-tiny',
            disabled: busy || probes[comparisonKey(url)]?.status === 'testing',
            onClick: () => {
              void test(url)
            },
          },
          t('sourceTest'),
        ),
        editable
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-tiny',
                disabled: busy,
                onClick: () => {
                  setProblem(undefined)
                  setEditing(index)
                  setEditDraft(url)
                },
              },
              t('sourceEdit'),
            )
          : null,
        editable
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-tiny is-ghost',
                disabled: busy,
                onClick: () => {
                  void drop(index)
                },
              },
              t('sourceDelete'),
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            className: `dsh-pu-btn is-tiny${inUse ? '' : ' is-primary'}`,
            disabled: busy || inUse,
            onClick: () => {
              void apply(url)
            },
          },
          inUse ? t('sourceApplied') : t('sourceApply'),
        ),
      ),
      verdict(url),
    )

  return h(
    'div',
    { className: 'dsh-pu-reg' },
    h(
      'button',
      {
        type: 'button',
        className: `dsh-pu-btn is-tiny dsh-pu-reg-btn${open ? ' is-open' : ''}`,
        disabled: disabled || setting.writable !== true,
        title: setting.writable === true ? t('registryChange') : t('registryLocked'),
        onClick: () => setOpen((value: boolean) => !value),
      },
      h('span', { className: 'dsh-pu-reg-label' }, `${t('registry')}:`),
      h('span', { className: 'dsh-pu-mono dsh-pu-reg-value' }, current),
      h('span', { className: 'dsh-pu-reg-caret' }, '⋯'),
    ),

    setting.writable === true
      ? null
      : h(
          'span',
          { className: 'dsh-pu-hint' },
          setting.unavailable === 'loading' ? t('registryLoading') : t('registryLocked'),
        ),

    open
      ? h(
          'div',
          { className: 'dsh-pu-modal' },
          h('div', {
            className: 'dsh-pu-modal-backdrop',
            onClick: () => setOpen(false),
            'aria-hidden': 'true',
          }),
          h(
            'div',
            {
              className: 'dsh-pu-modal-body',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('sourcesTitle'),
            },
            h(
              'div',
              { className: 'dsh-pu-modal-head' },
              h('span', { className: 'dsh-pu-modal-title' }, t('sourcesTitle')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-ghost is-tiny',
                  onClick: () => setOpen(false),
                  'aria-label': t('sourcesClose'),
                },
                '✕',
              ),
            ),
            h('p', { className: 'dsh-pu-modal-sub' }, t('sourcesHint')),

            h('div', { className: 'dsh-pu-src-group' }, t('sourcesBuiltin')),
            h(
              'div',
              { className: 'dsh-pu-src-list' },
              WELL_KNOWN_REGISTRIES.map((url) =>
                row(url, comparisonKey(saved) === comparisonKey(url), false, -1),
              ),
            ),

            hostSources.length === 0
              ? null
              : h(
                  'div',
                  null,
                  h('div', { className: 'dsh-pu-src-group' }, t('sourcesHost')),
                  h('p', { className: 'dsh-pu-hint' }, t('sourcesHostHint')),
                  h(
                    'div',
                    { className: 'dsh-pu-src-list' },
                    hostSources.map((url) =>
                      h(
                        'div',
                        { className: 'dsh-pu-src-row', key: url },
                        h(
                          'div',
                          { className: 'dsh-pu-src-id' },
                          h('span', { className: 'dsh-pu-mono dsh-pu-src-url' }, url),
                          h(
                            'div',
                            { className: 'dsh-pu-src-meta' },
                            h('span', { className: 'dsh-pu-tag' }, t('sourceHost')),
                          ),
                        ),
                        h(
                          'div',
                          { className: 'dsh-pu-src-actions' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-pu-btn is-tiny',
                              disabled: busy || probes[comparisonKey(url)]?.status === 'testing',
                              onClick: () => {
                                void test(url)
                              },
                            },
                            t('sourceTest'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-pu-btn is-tiny',
                              disabled: busy,
                              onClick: () => {
                                void add(url)
                              },
                            },
                            t('sourceKeep'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-pu-btn is-tiny is-primary',
                              disabled: busy,
                              onClick: () => {
                                void apply(url)
                              },
                            },
                            t('sourceApply'),
                          ),
                        ),
                        verdict(url),
                      ),
                    ),
                  ),
                ),

            h('div', { className: 'dsh-pu-src-group' }, t('sourcesCustom')),
            custom.length === 0
              ? h('p', { className: 'dsh-pu-hint' }, t('sourcesNone'))
              : h(
                  'div',
                  { className: 'dsh-pu-src-list' },
                  custom.map((url, index) =>
                    editing === index
                      ? h(
                          'div',
                          { className: 'dsh-pu-src-row is-editing', key: `${url}#edit` },
                          h('input', {
                            type: 'url',
                            inputMode: 'url',
                            className: 'dsh-pu-src-input',
                            value: editDraft,
                            'aria-label': t('sourceEdit'),
                            onChange: (event: { target: { value: string } }) => setEditDraft(event.target.value),
                            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void commitEdit(index)
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                setEditing(undefined)
                              }
                            },
                          }),
                          h(
                            'div',
                            { className: 'dsh-pu-src-actions' },
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-pu-btn is-tiny is-primary',
                                disabled: busy || editDraft.trim() === '',
                                onClick: () => {
                                  void commitEdit(index)
                                },
                              },
                              t('sourceSave'),
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-pu-btn is-tiny is-ghost',
                                disabled: busy,
                                onClick: () => setEditing(undefined),
                              },
                              t('sourceCancel'),
                            ),
                          ),
                        )
                      : row(url, comparisonKey(saved) === comparisonKey(url), true, index),
                  ),
                ),

            h(
              'div',
              { className: 'dsh-pu-src-add' },
              h('input', {
                type: 'url',
                inputMode: 'url',
                className: 'dsh-pu-src-input',
                placeholder: t('registryPlaceholder'),
                value: draft,
                'aria-label': t('sourcesAdd'),
                onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
                onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void add()
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny',
                  disabled: busy || draft.trim() === '',
                  onClick: () => {
                    void add()
                  },
                },
                t('sourcesAdd'),
              ),
            ),

            problem === undefined ? null : h('div', { className: 'dsh-pu-reg-problem' }, problem),

            h(
              'div',
              { className: 'dsh-pu-src-foot' },
              h(
                'span',
                { className: 'dsh-pu-hint' },
                h('span', null, `${t('sourcesCurrent')}: `),
                h('span', { className: 'dsh-pu-mono' }, active === '' ? t('registryFollowPnpm') : active),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny',
                  disabled: active === '' || probes[comparisonKey(active)]?.status === 'testing',
                  onClick: () => {
                    void test(active)
                  },
                },
                t('sourceTestCurrent'),
              ),
            ),
            active === '' ? null : verdict(active),

            h(
              'div',
              { className: 'dsh-pu-src-foot' },
              h('span', { className: 'dsh-pu-hint' }, t('registryFollowPnpmHint')),
              h(
                'button',
                {
                  type: 'button',
                  className: `dsh-pu-btn is-tiny${saved === '' ? ' is-ghost' : ''}`,
                  disabled: busy || saved === '',
                  onClick: () => {
                    void apply('')
                  },
                },
                saved === '' ? t('sourceApplied') : t('registryFollowPnpm'),
              ),
            ),
          ),
        )
      : null,
  )
}

/**
 * Whether an address is one of the fixed sources, re-exported for the tab.
 *
 * @param url - an address.
 * @returns whether it is built in.
 */
export { isBuiltinRegistry }
