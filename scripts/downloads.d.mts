/**
 * Types for `downloads.mjs`, which ships as plain ESM for the same reason
 * `release-notes.mjs` does: every other script in `scripts/` is plain ESM, and
 * it has to run on a bare Node before any build step.
 *
 * Only the pure helpers are declared. The CLI half (network, stdout, exit codes)
 * is not unit-tested, and typing it here would suggest that it is.
 */

/** One day's reported downloads. */
export interface DownloadRow {
  day: string
  downloads: number
}

/** What {@link splitDays} returns: the two groups, as raw numbers. */
export interface SplitDays {
  released: number[]
  quiet: number[]
}

/** The figures {@link summarise} produces. */
export interface DownloadSummary {
  firstDay: string | undefined
  lastDay: string | undefined
  lastReportedDay: string | undefined
  windowDays: number
  lagDays: number
  reportedDays: number
  total: number
  reportedTotal: number
  released: { days: number; total: number; perDay: number | undefined }
  quiet: { days: number; total: number; perDay: number | undefined; median: number | undefined }
  multiplier: number | undefined
}

/** One future day that removes a reported day from the rolling 30-day window. */
export interface RolloffRow {
  onDay: string | undefined
  drops: string
  downloads: number
}

/**
 * The UTC day a timestamp falls on.
 *
 * Takes an epoch as well as a string: the caller asks "what day is it" with
 * `Date.now()`, and `Date.parse(String(<epoch>))` is NaN.
 *
 * @param iso - an ISO timestamp or an epoch in milliseconds.
 */
export function dayOf(iso: string | number): string | undefined

/**
 * Which days published a version, and what was published on each.
 *
 * @param time - the registry document's `time` field.
 */
export function releaseDaysOf(time: Record<string, string> | undefined): Map<string, string[]>

/**
 * How many days at the end of the series have not been reported yet.
 *
 * @param series - rows in day order.
 */
export function lagDaysOf(series: DownloadRow[]): number

/**
 * Split a reported window into days that published and days that did not.
 *
 * @param series - rows with the lag already removed.
 * @param releases - the Map from {@link releaseDaysOf}.
 */
export function splitDays(series: DownloadRow[], releases: Map<string, string[]>): SplitDays

/**
 * The middle value of a list.
 *
 * @param values - the numbers to summarise.
 */
export function medianOf(values: number[]): number | undefined

/**
 * Summarise a download series against the days that published.
 *
 * @param options - `series` in day order, `releases` from {@link releaseDaysOf}.
 */
export function summarise(options: {
  series: DownloadRow[]
  releases: Map<string, string[]>
}): DownloadSummary

/**
 * Which upcoming days remove which reported days from the rolling window.
 *
 * @param series - rows in day order.
 * @param daysAhead - how many future days to project.
 */
export function rolloff(series: DownloadRow[], daysAhead?: number): RolloffRow[]
