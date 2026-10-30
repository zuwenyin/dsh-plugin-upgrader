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
import { reloadWhenBootDocumentFresh } from '../boot.ts'
import { getH, getReact } from '../env.ts'
import { activeLocaleId, replacedAppearance, useAlive, useLocaleRevision } from '../hooks.ts'
import { useRegistrySetting } from '../registry.ts'
import { CSS, STYLE_ID } from '../styles.ts'
import type {
  Banner,
  ConfigFormsLike,
  JobSnapshot,
  LocaleLike,
  OverviewRow,
  OwnerProps,
  StepRecord,
  T,
} from '../types.ts'
import { JobPanel } from './JobPanel.ts'
import { PluginRow } from './PluginRow.ts'
import { RegistryPicker } from './RegistryPicker.ts'

/**
 * This package's own name.
 *
 * The row for it is answered differently from every other row: it cannot be
 * replaced through the batch job, because that job unloads this code before the
 * install that should follow it could run.
 */
const SELF_NAME = 'dsh-plugin-upgrader'

/**
 * How long a page reload waits after an appearance plugin was replaced.
 *
 * The plugin is restarted by the host a moment after the step settles, and a
 * reload that beats that restart would leave the page unstyled with nothing
 * left to re-apply it. Long enough to cover the restart, short enough that the
 * reload still reads as part of the upgrade the person just ran.
 */
const APPEARANCE_RELOAD_DELAY_MS = 1200

/** Props of {@link Tab}. */
export interface TabProps extends OwnerProps {
  t: T
  locale?: LocaleLike | undefined
  /** The settings service, when this host mounts one. */
  configForms?: ConfigFormsLike | undefined
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
  const { t, locale, configForms } = props
  const revision = useLocaleRevision(locale)
  const localeId = React.useMemo(() => activeLocaleId(locale), [locale, revision])
  const { data, error, loading, reload } = useOverview(localeId)
  const registry = useRegistrySetting(configForms, 'plugin-upgrader')

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
      /**
       * Polling returns nothing when the tab unmounted *or* when the host
       * stopped answering — the job was dropped by a restart, or the request
       * failed. The panel would otherwise keep the last `running` snapshot on
       * screen with its clock climbing, which reads as a hang that never ends.
       * Re-read the overview and say the status was lost instead.
       */
      if (settled === undefined) {
        setJob(undefined)
        setBanner({ tone: 'warn', text: t('lostJob') })
        return settled
      }
      const failures = Array.isArray(settled?.results) ? settled.results.filter((result) => result.ok !== true) : []
      if (failures.length > 0) {
        /**
         * `message` is the manager's code (`bundle-in-use`, `not-removable`),
         * which says nothing about what to do; `detail` is the host's hint at
         * what the operator can act on. Show the hint when there is one, and
         * keep the code beside it so a bug report still carries it.
         */
        setBanner({
          tone: 'err',
          text: failures
            .map((failure) => {
              const code = failure.message ?? 'error'
              return failure.detail === undefined
                ? `${failure.name}: ${code}`
                : `${failure.name}: ${failure.detail} (${code})`
            })
            .join(' · '),
        })
      } else if (settled?.results?.some((result) => result.application === 'restart-required') === true) {
        setBanner({ tone: 'warn', text: t('restart') })
      } else if (replacedAppearance(settled?.results)) {
        /**
         * An appearance plugin was replaced, so the page is now wearing the
         * host's default look: its stylesheet lived in `<head>` and went away
         * with the code that injected it. Its own configuration does NOT go
         * away — `dsh-dream-skin` keeps it in `$DSH_HOME/dream-skin.json` and
         * rewrites it atomically, which is why reloading restores the look
         * instead of losing it. Wait a beat so the restart is observed, then
         * reload once; a banner explains why the page blinked.
         */
        setBanner({ tone: 'info', text: t('reloadForAppearance') })
        window.setTimeout(() => {
          /**
           * The reload is what restores the look, but it is also where a batch
           * update can turn into a startup failure: the shell serves this page
           * from an injection table it took from the Host when the Host started,
           * and the batch URLs in it die as soon as the Host has rotated its
           * responses twice. Reloading onto such a document loads a batch the
           * Host answers with 404, and every entry in it fails to boot. Ask
           * first; when the document is gone, say a restart is needed instead.
           */
          void reloadWhenBootDocumentFresh({
            onBlocked: () => {
              if (alive.current) setBanner({ tone: 'warn', text: t('reloadBlocked') })
            },
          })
        }, APPEARANCE_RELOAD_DELAY_MS)
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
      /**
       * A placeholder for the round trip, not a result: `submitJob` resolves
       * only once the batch settled, so writing a "queued" snapshot after it
       * would overwrite the finished one and leave the panel spinning for good.
       * The first poll replaces this within a frame.
       */
      setJob({ id: '', status: 'queued', total: steps.length, done: 0, failed: 0, log: [] })
      const outcome = await submitJob(steps, watch)
      if (!alive.current) return
      if (outcome.kind === 'started' || outcome.kind === 'adopted') {
        // A batch already running is not an error the user caused: adopt it and
        // keep reporting its progress rather than showing a dead "busy".
        if (outcome.kind === 'adopted') setBanner({ tone: 'warn', text: t('busyAdopted') })
        return
      }
      setBusyName(undefined)
      setJob(undefined)
      const failure = outcome.error
      setBanner({ tone: 'err', text: failure instanceof Error ? failure.message : String(failure) })
    },
    [alive, t, watch],
  )

  const rows = Array.isArray(data?.bundles) ? data.bundles : []
  /**
   * Rows a batch may touch.
   *
   * This plugin is excluded on purpose: a batch step for a version change starts
   * with `removeBundle`, which unloads the code running the batch, so including
   * it would strand the profile mid-upgrade. Its own row carries a separate
   * action that goes through the page's installer instead.
   */
  const batchable = (row: OverviewRow): boolean => row.upgradable === true && row.name !== SELF_NAME
  const upgradable = rows.filter(batchable)
  const needle = query.trim().toLowerCase()
  const filtered =
    needle === ''
      ? rows
      : rows.filter(
          (row) => row.name.toLowerCase().includes(needle) || String(row.title ?? '').toLowerCase().includes(needle),
        )

  const busy = busyName !== undefined || (job !== undefined && (job.status === 'running' || job.status === 'queued'))

  /**
   * Every address the picker should offer, best first.
   *
   * The active one comes first because it is what the versions below were read
   * from; the manager's configured registry and its fallbacks follow, so a
   * private registry set up in the profile is selectable without typing it.
   */
  const knownRegistries = [
    data?.registry,
    data?.registries?.registry,
    ...(data?.registries?.fallbackRegistries ?? []),
    data?.registries?.resolved,
  ]

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

  /**
   * Upgrade this plugin through the page's own installer.
   *
   * The batch job cannot do it: a version change starts with `removeBundle`,
   * which unloads the plugin that is running the batch, so the install that
   * should follow never happens. The page's installer is owned by the plugin
   * manager instead, so it keeps running across the unload. When the page does
   * not hand a tab an installer there is nothing safe to do, and the row says
   * why rather than starting a batch that would strand the profile.
   */
  const installSelf = React.useCallback(
    (row: OverviewRow, version: string): void => {
      const install = props.install
      if (typeof install !== 'function') {
        setBanner({ tone: 'warn', text: t('selfUpdateUnavailable') })
        return
      }
      setBanner(undefined)
      install({ spec: `${row.name}@${version}`, title: row.title, version })
    },
    [props.install, t],
  )

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
            : h(RegistryPicker, {
                t,
                active: data.registry,
                known: knownRegistries,
                setting: registry,
                disabled: busy,
                onChanged: () => reload(true),
              }),
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
              self: row.name === SELF_NAME,
              onInstallSelf: installSelf,
              onRetryHistory: () => reload(true),
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
