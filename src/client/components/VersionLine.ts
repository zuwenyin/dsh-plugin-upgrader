/**
 * One version line inside an expanded history list.
 *
 * The version name itself is the link, which is what makes "click the version,
 * land on that release" work: a row whose exact tag is published opens the tag,
 * and a row without one opens the repository's release feed rather than a dead
 * address.
 *
 * @module dsh-plugin-upgrader/client/components/VersionLine
 */
import { getH } from '../env.ts'
import { formatDate, openExternal, resolveVersionLink } from '../format.ts'
import type { OverviewRow, T, VersionRow } from '../types.ts'

/** Props of {@link VersionLine}. */
export interface VersionLineProps {
  row: OverviewRow
  version: VersionRow
  t: T
  busy: boolean
  onSwitch: (row: OverviewRow, version: string) => void
}

/**
 * Render one version line.
 *
 * @param props - the row, the version, and the switch action.
 * @returns the element.
 */
export function VersionLine(props: VersionLineProps): unknown {
  const h = getH()
  const { row, version, t, busy, onSwitch } = props
  const note = version.deprecated !== undefined ? `⚠ ${version.deprecated}` : ''
  const link = resolveVersionLink(row, version)
  /** A row without a tag of its own points at the repository's release feed. */
  const linkLabel = link !== undefined && /\/releases\/tag\//.test(link) ? t('githubVersion') : t('githubReleases')
  const title = link === undefined ? undefined : `${linkLabel} →${link}`
  return h(
    'div',
    { className: `dsh-pu-hist-row${version.current ? ' is-current' : ''}` },
    link !== undefined
      ? h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-mono dsh-pu-link',
            title,
            onClick: () => openExternal(link),
          },
          version.version,
        )
      : h('span', { className: 'dsh-pu-mono' }, version.version),
    h('time', null, formatDate(version.time)),
    version.latest ? h('span', { className: 'dsh-pu-tag is-new' }, t('latest')) : null,
    version.current ? h('span', { className: 'dsh-pu-tag' }, t('current')) : null,
    h('span', { className: 'dsh-pu-note' }, note),
    link === undefined
      ? null
      : h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-ghost is-tiny',
            title,
            'aria-label':
              linkLabel === t('githubVersion') ? `${linkLabel}: ${version.version}` : linkLabel,
            onClick: () => openExternal(link),
          },
          '→',
        ),
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-pu-btn is-tiny',
        disabled: busy || version.current === true,
        onClick: () => onSwitch(row, version.version),
      },
      /*
       * "Back to latest" is only meaningful when the row is not already on it.
       * The label used to key on `version.version === row.latest` alone, so the
       * version the user is running offered to switch to itself whenever the
       * host had not marked it current.
       */
      version.version === row.latest && version.current !== true ? t('back') : t('switchTo'),
    ),
  )
}
