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
import { diagnosticsReport, needsAttention } from '../diagnostics.ts'
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
import { RestartDialog } from './RestartDialog.ts'
import { RegistrySourceButton } from './SourceDialog.ts'

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
  /**
   * Whether the list is filtered down to the rows that need a decision.
   *
   * Kept apart from `query` on purpose: the two filters answer different
   * questions ("which plugin did I type" and "which ones need me") and a person
   * who typed a name should still be able to see only the broken ones among the
   * matches.
   */
  const [onlyNeedsAttention, setOnlyNeedsAttention] = React.useState(false)
  const [diagnosticsCopied, setDiagnosticsCopied] = React.useState(false)
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set<string>())
  const [job, setJob] = React.useState<JobSnapshot | undefined>(undefined)
  const [busyName, setBusyName] = React.useState<string | undefined>(undefined)
  const [cancelling, setCancelling] = React.useState(false)
  const [banner, setBanner] = React.useState<Banner | undefined>(undefined)
  /**
   * Whether the restart dialog is open.
   *
   * Kept beside the banner rather than on it: `Banner` is the text of one
   * message, and a flag that changes what the banner can *do* would make every
   * other banner carry a field it has no use for.
   */
  const [restartOpen, setRestartOpen] = React.useState(false)
  /**
   * Whether a restart would finish what the banner is talking about.
   *
   * `warn` alone is not the answer: the same tone carries "no install entry on
   * this page" and "a reload was stopped", and only one of those is finished by
   * restarting DSH. So the fact is recorded when the result says
   * `restart-required`, and cleared when the next batch starts — the button
   * disappears the moment it stops being the right advice.
   */
  const [restartPending, setRestartPending] = React.useState(false)
  const alive = useAlive()

  /** Poll a job until it settles, then reload the overview. */
  const watch = React.useCallback(
    async (id: string): Promise<JobSnapshot | undefined> => {
      const settled = await watchJob(id, { isAlive: () => alive.current, onSnapshot: (snapshot) => setJob(snapshot) })
      if (!alive.current) return settled
      setBusyName(undefined)
      setCancelling(false)
      /**
       * Cleared before the branches rather than inside one: the previous batch
       * may have left a restart pending, and every outcome below either raises
       * the restart banner again (the `restart-required` branch) or talks about
       * something a restart does not finish.
       */
      setRestartPending(false)
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
      /**
       * A step whose rollback put the files back but could not activate them is
       * the one failure a generic line gets wrong: "not installed" sends the
       * user to install a package that is already there, and saying nothing
       * hides a plugin that is missing from the page. Say which of the two it
       * is, for each affected plugin, before anything else.
       */
      const inactive = failures.filter((failure) => failure.inactive !== undefined)
      if (inactive.length > 0) {
        setBanner({
          tone: 'err',
          text: inactive
            .map((failure) =>
              t(
                'inactiveAfterRollback',
                failure.name,
                failure.inactive ?? '',
                failure.rollbackReason ?? (failure.message ?? 'error'),
              ),
            )
            .join(' · '),
        })
      } else if (failures.some((failure) => (failure.pendingBuilds ?? []).length > 0)) {
        /**
         * A package whose build scripts the host has not approved fails with
         * the manager's generic `operation-error` and a whole pnpm log as its
         * detail — every timeout the registry had, the ignored-builds line
         * buried in the middle. Printing that is what the user got before this
         * branch existed, and it said nothing they could act on.
         *
         * The decision is theirs to make (approving runs someone else's code at
         * install time), so this names it and points at the row, which is where
         * the approve button is. Saying "approve it" without saying where would
         * be the same dead end in fewer words.
         */
        setBanner({
          tone: 'warn',
          text: failures
            .filter((failure) => (failure.pendingBuilds ?? []).length > 0)
            .map((failure) => t('buildBlockedFailed', failure.name))
            .join(' · '),
        })
      } else if (failures.length > 0) {
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
        setRestartPending(true)
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
              if (!alive.current) return
              setBanner({ tone: 'warn', text: t('reloadBlocked') })
              /**
               * This banner is the other one a restart finishes: the host has
               * already rotated past the document this page booted from, so no
               * reload can work and only a new host can hand out a live one.
               */
              setRestartPending(true)
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
      setRestartPending(false)
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
   *
   * A row whose build scripts are not approved is excluded too, and for a
   * plainer reason: that step cannot succeed until the question is answered.
   * Leaving it in the batch made every 「一键升级」 fail with the same package and
   * the same wall of pnpm output, and the batch retried it forever because
   * nothing recorded that it had already been refused. The row keeps its own
   * upgrade button and its approve button, so the decision stays with the user;
   * approving build scripts is running someone else's code, which a batch count
   * is not allowed to decide.
   */
  const batchable = (row: OverviewRow): boolean =>
    row.upgradable === true &&
    row.name !== SELF_NAME &&
    (Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []).length === 0
  const upgradable = rows.filter(batchable)
  /**
   * Rows with a newer version, whether or not a batch may take them.
   *
   * The 可升级 stat counts these, not the batchable ones. It answers "is there a
   * newer version?", which stays true for a row whose build scripts are pending;
   * the batch button answers a narrower question and shows its own, smaller
   * number right next to the banner that explains the difference.
   */
  const upgradableRows = rows.filter((row) => row.upgradable === true)
  /**
   * Upgradable rows a batch had to leave out because of build scripts.
   *
   * Counted separately so the page can say so out loud. Without it a profile
   * whose only pending upgrade is a build-blocked one would show "全部已是最新"
   * with a greyed-out batch button — both true statements about a batch, and
   * together a lie about the page.
   */
  const skippedBuilds = rows.filter(
    (row) =>
      row.name !== SELF_NAME && row.upgradable === true && (Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []).length > 0,
  )
  const attention = rows.filter(needsAttention)
  const needle = query.trim().toLowerCase()
  const filtered = rows
    .filter((row) => (onlyNeedsAttention ? needsAttention(row) : true))
    .filter(
      (row) =>
        needle === '' ||
        row.name.toLowerCase().includes(needle) ||
        String(row.title ?? '').toLowerCase().includes(needle),
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

  /**
   * The version an upgrade of this row should install.
   *
   * `latest` is not always the answer: the host refuses a release whose DSH
   * requirement this runtime does not meet, and `recommended` is the newest one
   * that passes. Both the row button and every batch path go through here, so a
   * batch cannot quietly install a version the single-row button declined to.
   */
  const targetOf = (row: OverviewRow): string => row.recommended ?? row.latest ?? row.version ?? ''

  const upgradeOne = (row: OverviewRow): void => {
    void run([stepOf(row, targetOf(row), 'upgrade')], row.name)
  }

  const switchOne = (row: OverviewRow, version: string): void => {
    void run([stepOf(row, version, 'switch')], row.name)
  }

  const approveAndRetry = (row: OverviewRow): void => {
    const pendingBuilds = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []
    void run([stepOf(row, targetOf(row), 'upgrade', pendingBuilds)], row.name)
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
      setRestartPending(false)
      install({ spec: `${row.name}@${version}`, title: row.title, version })
    },
    [props.install, t],
  )

  const upgradeAll = (): void => {
    void run(
      upgradable.map((row) => stepOf(row, targetOf(row), 'upgrade')),
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
        .map((row) => stepOf(row, targetOf(row), 'upgrade')),
      t('upgradeSelected'),
    )
  }

  /**
   * Put what this tab knows on the clipboard, as markdown.
   *
   * The point is a bug report someone can paste without transcribing versions
   * by hand — and the reason it is built in the browser rather than on the host
   * is that the host already sends everything it has: `runtimeVersion`, every
   * row's `versionError`, `blocked`, `installedIncompatible`, the mirror gap. A
   * new route would be a second way to ask the same question, and a new place
   * for `capabilities` to grow.
   */
  const copyDiagnostics = (): void => {
    const text = diagnosticsReport(
      { runtimeVersion: data?.runtimeVersion, registry: data?.registry, generatedAt: data?.generatedAt, rows },
      t,
    )
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setDiagnosticsCopied(true))
      .catch(() => {})
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
            { className: `dsh-pu-stat${upgradableRows.length > 0 ? ' is-warn' : ''}` },
            t('upgradable'),
            ' ',
            h('b', null, String(upgradableRows.length)),
          ),
          /*
           * The one number that answers "is anything wrong?". It is a button, not
           * a label: a count nobody can act on only adds a second thing to read.
           * Zero is rendered as plain text so the header does not grow a control
           * that would do nothing when pressed.
           */
          attention.length > 0
            ? h(
                'button',
                {
                  type: 'button',
                  className: `dsh-pu-stat is-err is-action${onlyNeedsAttention ? ' is-on' : ''}`,
                  title: t('onlyNeedsAttention'),
                  'aria-pressed': onlyNeedsAttention ? 'true' : 'false',
                  onClick: () => setOnlyNeedsAttention((value) => !value),
                },
                t('needsAttention'),
                ' ',
                h('b', null, String(attention.length)),
              )
            : null,
          data?.registry === undefined
            ? null
            : h(RegistrySourceButton, {
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
        /*
         * Only drawn when there is something to put in it. The overview is also
         * fetched by hosts that mount no manager at all, and a button that copies
         * an empty report is worse than no button.
         */
        rows.length > 0
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn',
                onClick: copyDiagnostics,
                title: t('copyDiagnostics'),
              },
              diagnosticsCopied ? t('copied') : t('copyDiagnostics'),
            )
          : null,
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
          /**
           * The restart button belongs to the restart banner only. A `warn`
           * banner is also raised for "the reload was stopped" and for "this
           * page has no install entry", and offering a restart for those would
           * be advice that does not apply — so the flag set by the result
           * decides, not the tone.
           */
          restartPending
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny',
                  onClick: () => setRestartOpen(true),
                },
                t('restartOpen'),
              )
            : null,
          h(
            'button',
            { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: () => setBanner(undefined) },
            '✕',
          ),
        ),

    restartOpen ? h(RestartDialog, { t, onClose: () => setRestartOpen(false) }) : null,

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
      ? h(
          'div',
          { className: 'dsh-pu-empty' },
          h(
            'span',
            null,
            // "No match" would be the wrong word when the only filter is the
            // attention toggle: nothing was searched for, and the answer is good
            // news rather than a typo.
            onlyNeedsAttention && needle === '' ? t('nothingNeedsAttention') : t('noMatch'),
          ),
          onlyNeedsAttention
            ? h(
                'div',
                null,
                h(
                  'button',
                  { type: 'button', className: 'dsh-pu-btn is-tiny', onClick: () => setOnlyNeedsAttention(false) },
                  t('showAll'),
                ),
              )
            : null,
        )
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

    /*
     * Said out loud, next to the batch button it applies to. A batch that
     * silently skipped a row would leave the user clicking 「一键升级」, watching
     * it report success, and finding the same upgrade still offered afterwards.
     * The count is in the sentence rather than a tooltip because the button next
     * to it shows a number that no longer matches the 可升级 stat above.
     */
    skippedBuilds.length > 0
      ? h('div', { className: 'dsh-pu-banner is-warn' }, h('span', null, t('batchSkippedBuilds', skippedBuilds.length)))
      : null,

    rows.length > 0 && upgradable.length === 0 && skippedBuilds.length === 0
      ? h('div', { className: 'dsh-pu-banner' }, h('span', null, t('upToDate')))
      : null,

    h(
      'div',
      { className: 'dsh-pu-foot' },
      /*
       * Which DSH this page is judging against.
       *
       * Every compatibility answer on this screen is relative to one version, and
       * until it was printed the only way to know it was to read `engines` and
       * compare by hand. "Unknown" is said out loud rather than hidden: an empty
       * space here would look like the plugin is fine.
       */
      h(
        'span',
        {
          className: `dsh-pu-mono${data?.runtimeVersion === null || data?.runtimeVersion === undefined ? ' is-warn' : ''}`,
          title: data?.runtimeVersion === null || data?.runtimeVersion === undefined ? t('runtimeUnknown') : undefined,
        },
        data?.runtimeVersion === null || data?.runtimeVersion === undefined
          ? t('runtimeVersionUnknown')
          : `DSH ${data.runtimeVersion}`,
      ),
      data?.generatedAt === undefined
        ? null
        : h('span', null, `${t('generated')} ${new Date(data.generatedAt).toLocaleTimeString()}`),
      data?.registry === undefined ? null : h('span', { className: 'dsh-pu-mono' }, data.registry),
    ),
  )
}
