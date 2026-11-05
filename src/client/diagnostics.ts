/**
 * What the tab counts as "needs a decision", and how it writes that down.
 *
 * Both live here rather than inside `Tab` because both are rules with an answer
 * that can be wrong, and a rule inside a component can only be checked by
 * rendering it. The tab itself only draws the number and copies the text.
 *
 * @module dsh-plugin-upgrader/client/diagnostics
 */
import type { OverviewRow, T } from './types.ts'

/**
 * Whether this row has something a person has to act on.
 *
 * Deliberately not "is it broken": a mirror that is behind and a build waiting
 * for approval are both fine packages that cannot be finished without a click,
 * and a row whose version lookup failed is not wrong so much as unknown. What
 * they share is that leaving them alone leaves the profile in a worse state than
 * the person thinks — which is exactly what a single count should name.
 *
 * An incompatible *upgrade* is not in the list: `blocked` is a release that was
 * never installed and that the page already explains inline; counting it would
 * make the badge show a number for a plugin that needs nothing.
 */
export function needsAttention(row: OverviewRow): boolean {
  return (
    row.installedIncompatible !== undefined ||
    (Array.isArray(row.mirrorMissing) && row.mirrorMissing.length > 0) ||
    (row.versionError !== undefined && row.versionError !== '') ||
    (Array.isArray(row.pendingBuilds) && row.pendingBuilds.length > 0)
  )
}

/** Everything the diagnostics report is written from. */
export interface DiagnosticsInput {
  /** The DSH version the page judged compatibility against, when it knows it. */
  runtimeVersion: string | null | undefined
  /** The registry the versions were read from. */
  registry: string | undefined
  /** When the overview was built. */
  generatedAt: number | undefined
  rows: readonly OverviewRow[]
}

/**
 * Render the tab's state as markdown for a bug report.
 *
 * Plain text on purpose: it is pasted into an issue, where a table or a code
 * fence would have to be reflowed by hand. Only facts the page already holds are
 * included — this never triggers a lookup, so pressing the button is free even
 * when the registry is the thing that is broken.
 *
 * @param input - the page state.
 * @param t - the translator, for the one label that is prose.
 * @returns the report, one fact per line.
 */
export function diagnosticsReport(input: DiagnosticsInput, t: T): string {
  const dsh = input.runtimeVersion ?? t('runtimeVersionUnknown')
  const lines: string[] = [
    '# dsh-plugin-upgrader diagnostics',
    '',
    `- DSH: ${dsh}`,
    `- registry: ${input.registry ?? '?'}`,
    `- generated: ${input.generatedAt === undefined ? '?' : new Date(input.generatedAt).toISOString()}`,
    `- plugins: ${input.rows.length}`,
    '',
  ]
  for (const row of input.rows) {
    const facts = [`${row.name}@${row.version ?? '?'}`]
    if (row.latest !== undefined) facts.push(`latest ${row.latest}`)
    /*
     * Only when it differs: on an ordinary row the two are the same version and
     * repeating it would suggest the page is choosing between them.
     */
    if (row.recommended !== undefined && row.recommended !== row.latest) {
      facts.push(`recommended ${row.recommended}`)
    }
    if (row.enabled === false) facts.push('disabled')
    lines.push(`- ${facts.join(' · ')}`)
    if (row.blocked !== undefined) {
      lines.push(`  - blocked: ${row.blocked.version} requires DSH ${row.blocked.requires}`)
    }
    if (row.installedIncompatible !== undefined) {
      lines.push(`  - installed requires DSH ${row.installedIncompatible.requires}`)
    }
    if (row.versionError !== undefined && row.versionError !== '') {
      lines.push(`  - version: ${row.versionError}`)
    }
    if (Array.isArray(row.mirrorMissing) && row.mirrorMissing.length > 0) {
      lines.push(`  - mirror missing: ${row.mirrorMissing.join(', ')}`)
    }
    if (Array.isArray(row.pendingBuilds) && row.pendingBuilds.length > 0) {
      lines.push(`  - pending builds: ${row.pendingBuilds.join(', ')}`)
    }
  }
  return lines.join('\n')
}
