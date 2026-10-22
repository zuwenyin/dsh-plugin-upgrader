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
  const [open, setOpen] = React.useState(false)
  const versions = Array.isArray(row.versions) ? row.versions : []
  const hasHistory = versions.length > 0
  const selectable = row.upgradable === true
  const status = row.error !== undefined && row.error !== null ? 'err' : row.upgradable ? 'new' : 'idle'
  const versionNote =
    row.versionError !== undefined
      ? row.versionError === 'not a profile-managed package'
        ? t('sourcePath')
        : row.versionError
      : undefined
  const pendingBuilds = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []

  return h(
    'div',
    { className: `dsh-pu-row${open ? ' is-open' : ''}${picked ? ' is-picked' : ''}` },
    h(
      'div',
      { className: 'dsh-pu-row-main' },
      h(
        'span',
        { className: 'dsh-pu-check' },
        h('input', {
          type: 'checkbox',
          checked: picked === true,
          disabled: busy || !selectable,
          title: selectable ? t('selectRow') : undefined,
          'aria-label': `${t('selectRow')}: ${row.name}`,
          onChange: () => onToggle(row.name),
        }),
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
