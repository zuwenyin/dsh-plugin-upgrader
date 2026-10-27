/**
 * One installed plugin.
 *
 * The row is the whole interaction surface: the checkbox feeds the batch
 * selection, the history disclosure holds every published version, and the
 * buttons that mutate the profile are disabled while any batch is running so
 * two writers can never race on the same profile.
 *
 * @module dsh-plugin-upgrader/client/components/PluginRow
 */
import { getH, getReact } from '../env.ts'
import { openExternal } from '../format.ts'
import type { OverviewRow, RowActions, T } from '../types.ts'
import { VersionLine } from './VersionLine.ts'

/** Props of {@link PluginRow}. */
export interface PluginRowProps extends RowActions {
  row: OverviewRow
  t: T
}

/**
 * Render one plugin row.
 *
 * @param props - the row and its actions.
 * @returns the element.
 */
export function PluginRow(props: PluginRowProps): unknown {
  const h = getH()
  const React = getReact()
  const { row, t, busy, picked, onToggle, onUpgrade, onSwitch, onApprove, onOpenPage } = props
  const { self, onInstallSelf } = props
  const { onRetryHistory } = props
  const [open, setOpen] = React.useState(false)
  const versions = Array.isArray(row.versions) ? row.versions : []
  const hasHistory = versions.length > 0
  /**
   * The upgrader cannot replace itself through the batch job, and must not try:
   * that job starts a version change with `removeBundle`, which unloads this very
   * code, so the install that follows would never run. The page's own install
   * flow belongs to its manager, so the row offers that instead.
   */
  const selfUpdate = self === true && row.latest !== undefined && row.latest !== row.version
  const selectable = row.upgradable === true && self !== true
  const status = row.error !== undefined && row.error !== null ? 'err' : row.upgradable ? 'new' : 'idle'
  /**
   * Why this row has no version list, when the host knows.
   *
   * The history button used to be the only thing that mentioned a version
   * problem, and it was simply not rendered — so a registry timeout and a
   * package with genuinely no published history looked identical: a row with no
   * history button and no explanation. A lookup that failed is worth a retry, so
   * it is shown as its own line rather than folded into the description.
   */
  const failure = row.versionError !== undefined && row.versionError !== '' ? row.versionError : undefined
  const retriable = failure !== undefined && /unreachable|timeout|registry \d|github/i.test(failure)
  const versionNote =
    failure === undefined
      ? undefined
      : failure === 'not a profile-managed package'
        ? t('sourcePath')
        : failure
  const pendingBuilds = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []

  return h(
    'div',
    { className: `dsh-pu-row${open ? ' is-open' : ''}${picked ? ' is-picked' : ''}` },
    h(
      'div',
      { className: 'dsh-pu-row-main' },
      h(
        'span',
        {
          className: `dsh-pu-check${picked ? ' is-on' : ''}${busy || !selectable ? ' is-off' : ''}`,
          role: 'checkbox',
          'aria-checked': picked === true ? 'true' : 'false',
          'aria-disabled': busy || !selectable ? 'true' : undefined,
          'aria-label': `${t('selectRow')}: ${row.name}`,
          tabIndex: busy || !selectable ? undefined : 0,
          title: selectable ? t('selectRow') : undefined,
          onClick: busy || !selectable ? undefined : () => onToggle(row.name),
          onKeyDown: (event: KeyboardEvent) => {
            if (busy || !selectable) return
            if (event.key !== ' ' && event.key !== 'Enter') return
            event.preventDefault()
            onToggle(row.name)
          },
        },
        h('span', { className: 'dsh-pu-tick', 'aria-hidden': 'true' }),
      ),
      h('span', { className: `dsh-pu-dot${status === 'idle' ? '' : status === 'new' ? ' is-new' : ' is-err'}` }),
      h(
        'div',
        { className: 'dsh-pu-id' },
        h(
          'div',
          { className: 'dsh-pu-name' },
          h('span', { title: row.name }, row.title === row.name ? row.name : `${row.title} · ${row.name}`),
          row.enabled === false ? h('span', { className: 'dsh-pu-tag' }, 'off') : null,
          row.upgradable ? h('span', { className: 'dsh-pu-tag is-new' }, t('upgradable')) : null,
        ),
        h(
          'div',
          { className: 'dsh-pu-desc' },
          row.description !== undefined && row.description !== '' ? row.description : versionNote ?? row.name,
        ),
        failure !== undefined && retriable
          ? h(
              'div',
              { className: 'dsh-pu-note is-err', title: failure },
              `${t('historyFailed')}: ${failure}`,
              typeof onRetryHistory === 'function'
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-pu-btn is-ghost is-tiny',
                      disabled: busy,
                      onClick: onRetryHistory,
                    },
                    t('retry'),
                  )
                : null,
            )
          : null,
      ),
      h(
        'div',
        { className: 'dsh-pu-vers' },
        h('b', null, row.version ?? t('unknownVersion')),
        row.upgradable ? h('i', null, '→') : null,
        row.upgradable ? h('b', null, row.latest) : null,
      ),
      h(
        'div',
        { className: 'dsh-pu-row-actions' },
        row.upgradable
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-primary is-tiny',
                disabled: busy,
                onClick: () => onUpgrade(row),
              },
              t('upgrade'),
            )
          : selfUpdate && typeof onInstallSelf === 'function'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-primary is-tiny',
                  disabled: busy,
                  title: `${t('selfUpdateHint')} →${row.latest}`,
                  onClick: () => onInstallSelf(row, row.latest as string),
                },
                t('selfUpdate'),
              )
            : null,
        typeof row.repoUrl === 'string'
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-tiny',
                title: `${t('github')} →${row.repoUrl}`,
                onClick: () => openExternal(row.repoUrl),
              },
              'GH',
            )
          : null,
        hasHistory
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-tiny',
                onClick: () => setOpen((value) => !value),
                'aria-expanded': open,
              },
              open ? t('hideHistory') : `${t('history')} (${versions.length})`,
            )
          : null,
        typeof onOpenPage === 'function'
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-ghost is-tiny',
                title: t('openPage'),
                onClick: () => onOpenPage(row.name),
              },
              '→',
            )
          : null,
      ),
    ),
    pendingBuilds.length > 0
      ? h(
          'div',
          { className: 'dsh-pu-hist' },
          h(
            'div',
            { className: 'dsh-pu-banner is-warn' },
            h('span', null, t('buildBlocked')),
            h(
              'button',
              { type: 'button', className: 'dsh-pu-btn is-tiny', onClick: () => onApprove(row) },
              t('approve'),
            ),
          ),
        )
      : null,
    open
      ? h(
          'div',
          { className: 'dsh-pu-hist' },
          h(
            'div',
            { className: 'dsh-pu-hist-head' },
            h('span', null, t('versions', row.totalVersions ?? versions.length)),
            typeof row.totalVersions === 'number' && row.totalVersions > versions.length
              ? h('span', { className: 'dsh-pu-dim' }, t('showingNewest', versions.length))
              : null,
            h('span', { className: 'dsh-pu-mono' }, row.name),
          ),
          h(
            'div',
            { className: 'dsh-pu-hist-list' },
            versions.map((version) => h(VersionLine, { key: version.version, row, version, t, busy, onSwitch })),
          ),
        )
      : null,
  )
}
