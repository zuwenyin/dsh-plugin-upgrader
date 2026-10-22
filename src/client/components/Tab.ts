/**
 * The Plugins-page tab.
 *
 * The component owns one piece of long-lived state that the old single-file
 * version spread across three refs: a batch job can outlive the tab, so the
 * tab adopts whatever the host reports as `active` on load and then polls it
 * exactly as if it had started it. That is what keeps a reopened page from
 * showing a dead "busy" while a batch is still installing.
 *
 * @module dsh-plugin-upgrader/client/components/Tab
 */
import { cancelJob, submitJob, useOverview, watchJob } from '../api.ts'
import { getH, getReact } from '../env.ts'
import { activeLocaleId, useAlive, useLocaleRevision } from '../hooks.ts'
import { CSS, STYLE_ID } from '../styles.ts'
import type { Banner, JobSnapshot, LocaleLike, OverviewRow, OwnerProps, StepRecord, T } from '../types.ts'
import { JobPanel } from './JobPanel.ts'
import { PluginRow } from './PluginRow.ts'

/** Props of {@link Tab}. */
export interface TabProps extends OwnerProps {
  t: T
  locale?: LocaleLike | undefined
}

/**
 * Render the tab.
 *
 * @param props - the translator, the locale service, and the owner props.
 * @returns the element.
 */
export function Tab(props: TabProps): unknown {
  const h = getH()
  const React = getReact()
  const { t, locale } = props
  const revision = useLocaleRevision(locale)
  const localeId = React.useMemo(() => activeLocaleId(locale), [locale, revision])
  const { data, error, loading, reload } = useOverview(localeId)

  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set<string>())
  const [job, setJob] = React.useState<JobSnapshot | undefined>(undefined)
  const [busyName, setBusyName] = React.useState<string | undefined>(undefined)
  const [cancelling, setCancelling] = React.useState(false)
  const [banner, setBanner] = React.useState<Banner | undefined>(undefined)
  const alive = useAlive()

  /** Poll a job until it settles, then reload the overview. */
  const watch = React.useCallback(
    async (id: string): Promise<JobSnapshot | undefined> => {
      const settled = await watchJob(id, { isAlive: () => alive.current, onSnapshot: (snapshot) => setJob(snapshot) })
      if (!alive.current) return settled
      setBusyName(undefined)
      setCancelling(false)
      reload(false)
      const failures = Array.isArray(settled?.results) ? settled.results.filter((result) => result.ok !== true) : []
      if (failures.length > 0) {
        setBanner({
          tone: 'err',
          text: failures.map((failure) => `${failure.name}: ${failure.message ?? failure.detail ?? 'error'}`).join(' · '),
        })
      } else if (settled?.results?.some((result) => result.application === 'restart-required') === true) {
        setBanner({ tone: 'warn', text: t('restart') })
      }
      return settled
    },
    [alive, reload, t],
  )

  /**
   * Adopt a job that is still running on the host. The tab is remounted
   * whenever the Plugins page is reopened, and the host keeps the job, so a
   * fresh tab would otherwise look idle while a batch is in flight.
   */
  const adopted = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    const live = data?.active
    if (live === undefined || live === null) return
    if (adopted.current === live.id) return
    adopted.current = live.id
    setJob(live)
    setBusyName(live.current)
    void watch(live.id)
  }, [data, watch])

  /** Start one batch and report its outcome. */
  const run = React.useCallback(
    async (steps: StepRecord[], label: string): Promise<void> => {
      if (steps.length === 0) return
      setBanner(undefined)
      setBusyName(label)
      const outcome = await submitJob(steps, watch)
      if (!alive.current) return
      if (outcome.kind === 'started') {
        setJob({
          id: outcome.id,
          status: 'queued',
          total: steps.length,
          done: 0,
          failed: 0,
          log: [],
        })
        return
      }
      if (outcome.kind === 'adopted') {
        // A batch already running is not an error the user caused: adopt it and
        // keep reporting its progress rather than showing a dead "busy".
        setBanner({ tone: 'warn', text: t('busyAdopted') })
        return
      }
      setBusyName(undefined)
      const failure = outcome.error
      setBanner({ tone: 'err', text: failure instanceof Error ? failure.message : String(failure) })
    },
    [alive, t, watch],
  )

  const rows = Array.isArray(data?.bundles) ? data.bundles : []
  const upgradable = rows.filter((row) => row.upgradable === true)
  const needle = query.trim().toLowerCase()
  const filtered =
    needle === ''
      ? rows
      : rows.filter(
          (row) => row.name.toLowerCase().includes(needle) || String(row.title ?? '').toLowerCase().includes(needle),
        )

  const busy = busyName !== undefined || (job !== undefined && (job.status === 'running' || job.status === 'queued'))

  // Only upgradable rows can be picked, so a stale pick (a plugin that just got
  // upgraded, or dropped out of the registry) never blocks the button.
  const pickedCount = upgradable.reduce((count, row) => (picked.has(row.name) ? count + 1 : count), 0)

  const stepOf = (row: OverviewRow, version: string, action: 'upgrade' | 'switch', approveBuilds?: string[]): StepRecord => ({
    name: row.name,
    version,
    action,
    enabled: row.enabled !== false,
    ...(approveBuilds === undefined ? {} : { approveBuilds }),
  })

  const upgradeOne = (row: OverviewRow): void => {
    void run([stepOf(row, row.latest ?? row.version ?? '', 'upgrade')], row.name)
  }

  const switchOne = (row: OverviewRow, version: string): void => {
    void run([stepOf(row, version, 'switch')], row.name)
  }

  const approveAndRetry = (row: OverviewRow): void => {
    const pendingBuilds = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []
    void run([stepOf(row, row.latest ?? row.version ?? '', 'upgrade', pendingBuilds)], row.name)
  }

  const upgradeAll = (): void => {
    void run(
      upgradable.map((row) => stepOf(row, row.latest ?? row.version ?? '', 'upgrade')),
      t('upgradeAll'),
    )
  }

  /** Toggle one plugin in the selection. */
  const togglePick = (name: string): void => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  /** Select every upgradable row. */
  const pickAll = (): void => setPicked(new Set(upgradable.map((row) => row.name)))

  /** Drop the whole selection. */
  const clearPicked = (): void => setPicked(new Set<string>())

  /** Upgrade only the checked plugins, in list order. */
  const upgradePicked = (): void => {
    void run(
      upgradable
        .filter((row) => picked.has(row.name))
        .map((row) => stepOf(row, row.latest ?? row.version ?? '', 'upgrade')),
      t('upgradeSelected'),
    )
  }

  const cancel = (): void => {
    setCancelling(true)
    void cancelJob()
  }

  return h(
    'div',
    { className: 'dsh-pu' },
    h('style', { key: STYLE_ID }, CSS),
    h(
      'div',
      { className: 'dsh-pu-head' },
      h(
        'div',
        { className: 'dsh-pu-head-main' },
        h('div', { className: 'dsh-pu-title' }, t('title')),
        h('div', { className: 'dsh-pu-sub' }, t('subtitle')),
        h(
          'div',
          { className: 'dsh-pu-stats' },
          h('span', { className: 'dsh-pu-stat' }, t('installed'), ' ', h('b', null, String(rows.length))),
          h(
            'span',
            { className: `dsh-pu-stat${upgradable.length > 0 ? ' is-warn' : ''}` },
            t('upgradable'),
            ' ',
            h('b', null, String(upgradable.length)),
          ),
          data?.registry === undefined
            ? null
            : h('span', { className: 'dsh-pu-mono' }, `${t('registry')}: ${data.registry}`),
        ),
      ),
      h(
        'div',
        { className: 'dsh-pu-actions' },
        h(
          'div',
          { className: 'dsh-pu-search' },
          h('input', {
            type: 'search',
            placeholder: t('search'),
            value: query,
            onChange: (event: { target: { value: string } }) => setQuery(event.target.value),
            'aria-label': t('search'),
          }),
        ),
        h(
          'button',
          { type: 'button', className: 'dsh-pu-btn', disabled: loading === true || busy, onClick: () => reload(true) },
          loading === true ? h('span', { className: 'dsh-pu-spin' }) : null,
          loading === true ? t('refreshing') : t('refresh'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-primary',
            disabled: upgradable.length === 0 || busy,
            onClick: upgradeAll,
          },
          t('upgradeAll'),
          upgradable.length > 0 ? ` (${upgradable.length})` : '',
        ),
      ),
    ),

    banner === undefined
      ? null
      : h(
          'div',
          {
            className: `dsh-pu-banner${banner.tone === 'err' ? ' is-err' : banner.tone === 'warn' ? ' is-warn' : ''}`,
          },
          h('span', null, banner.text),
          banner.tone === 'warn' ? h('span', null, t('restartHint')) : null,
          h(
            'button',
            { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: () => setBanner(undefined) },
            '✕',
          ),
        ),

    job === undefined ? null : h(JobPanel, { job, t, onCancel: cancel, cancelling }),

    rows.length === 0
      ? null
      : h(
          'div',
          { className: `dsh-pu-selbar${pickedCount > 0 ? ' is-active' : ''}` },
          h('span', { className: 'dsh-pu-grow' }, pickedCount > 0 ? t('selected', pickedCount) : t('nothingSelected')),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-pu-btn is-tiny',
              disabled: busy || upgradable.length === 0,
              onClick: pickAll,
            },
            t('selectAll'),
          ),
          pickedCount > 0
            ? h(
                'button',
                { type: 'button', className: 'dsh-pu-btn is-tiny', disabled: busy, onClick: clearPicked },
                t('clearSelection'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-pu-btn is-tiny is-primary',
              disabled: busy || pickedCount === 0,
              onClick: upgradePicked,
            },
            t('upgradeSelected'),
            pickedCount > 0 ? ` (${pickedCount})` : '',
          ),
        ),

    loading === true && rows.length === 0 ? h('div', { className: 'dsh-pu-empty' }, h('span', null, t('loading'))) : null,

    error !== undefined && rows.length === 0
      ? h(
          'div',
          { className: 'dsh-pu-empty' },
          h('span', null, `${t('loadFailed')} →${error}`),
          h(
            'div',
            null,
            h('button', { type: 'button', className: 'dsh-pu-btn is-tiny', onClick: () => reload(true) }, t('retry')),
          ),
        )
      : null,

    rows.length === 0 && loading !== true && error === undefined
      ? h('div', { className: 'dsh-pu-empty' }, h('span', null, t('empty')), h('small', null, t('emptyHint')))
      : null,

    filtered.length === 0 && rows.length > 0
      ? h('div', { className: 'dsh-pu-empty' }, h('span', null, t('noMatch')))
      : null,

    filtered.length === 0
      ? null
      : h(
          'div',
          { className: 'dsh-pu-list' },
          filtered.map((row) =>
            h(PluginRow, {
              key: row.name,
              row,
              t,
              busy,
              picked: picked.has(row.name),
              onToggle: togglePick,
              onUpgrade: upgradeOne,
              onSwitch: switchOne,
              onApprove: approveAndRetry,
              onOpenPage: typeof props.openPackage === 'function' ? props.openPackage : undefined,
            }),
          ),
        ),

    rows.length > 0 && upgradable.length === 0
      ? h('div', { className: 'dsh-pu-banner' }, h('span', null, t('upToDate')))
      : null,

    h(
      'div',
      { className: 'dsh-pu-foot' },
      data?.generatedAt === undefined
        ? null
        : h('span', null, `${t('generated')} ${new Date(data.generatedAt).toLocaleTimeString()}`),
      data?.registry === undefined ? null : h('span', { className: 'dsh-pu-mono' }, data.registry),
    ),
  )
}
