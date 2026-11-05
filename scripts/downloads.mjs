/**
 * What do the npm download numbers actually mean for this package?
 *
 * npm shows two numbers that people read as "is anyone using this": the weekly
 * count and the monthly count. Both are bad at answering it, for three reasons
 * that have nothing to do with real usage.
 *
 * 1. **The data lags.** `api.npmjs.org` (which is what the website reads too)
 *    reports 0 for the current day and often for the day before. A weekly count
 *    fetched on a Tuesday is a count through Saturday. Nothing is wrong; the
 *    number is just younger than it looks. `react` shows the same trailing
 *    zeros, which is the only reason to trust that reading.
 *
 * 2. **The window rolls, so the number moves by itself.** `last-week` is a
 *    sliding seven days: yesterday's 668 drops out on the same tick that today's
 *    614 comes in. Comparing yesterday's number with today's says nothing about
 *    usage — it says which day was busier, and one 8x day is enough to flip the
 *    sign.
 *
 * 3. **Publishing is itself traffic.** Every release triggers a fixed burst:
 *    the workflow installs the package, npm mirrors (npmmirror, cnpm) sync the
 *    tarball, and every catalog scanner (dsh.so, dshbase, the awesome feeds)
 *    fetches it. On this package that burst is roughly eight times a quiet day,
 *    which means the download graph is mostly a picture of the release calendar.
 *    The number worth watching is not the total — it is the **quiet-day
 *    baseline**, the downloads that happen on days when nothing was published.
 *
 * So this script reports the baseline instead of the total, separates release
 * days from quiet days, and refuses to draw a conclusion from a lagging window.
 * Run it before a release to see whether the last month changed anything that
 * outlives the release itself.
 *
 * Usage:
 *   node scripts/downloads.mjs                 # the last 30 days
 *   node scripts/downloads.mjs --days 60
 *   node scripts/downloads.mjs --baseline 66   # compare against a known baseline
 *   node scripts/downloads.mjs --json
 *
 * Exit code is 0 whether or not the numbers are good: a download graph is
 * evidence, not a test, and a script that fails CI over it would train people to
 * ignore it. Pass `--fail-below <n>` when you want it to fail on a baseline
 * regression in an intentional place.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const DAY_MS = 86_400_000
const DEFAULT_DAYS = 30

/**
 * The `YYYY-MM-DD` day a timestamp falls on, in UTC.
 *
 * npm buckets by UTC day, so using the local day here would shift an evening
 * release into the wrong bucket by one day for anyone east of Greenwich.
 *
 * Accepts an epoch number as well as a string on purpose: `Date.now()` is the
 * obvious way to ask "what day is it", and `Date.parse(String(1_700_000_000_000))`
 * returns `NaN`, which would turn a clock call into an `undefined` day.
 *
 * @param iso - an ISO timestamp or an epoch in milliseconds.
 * @returns the UTC day, or `undefined` when the value is not a date.
 */
export function dayOf(iso) {
  const at = typeof iso === 'number' ? iso : Date.parse(String(iso))
  if (Number.isNaN(at)) return undefined
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * Which days published a version, and what was published on each.
 *
 * `created` and `modified` sit in the same `time` object as the versions but are
 * registry bookkeeping, not releases: counting them would make the first day
 * look like a two-version release day.
 *
 * @param time - the registry document's `time` field.
 * @returns a Map from day to the sorted versions published that day.
 */
export function releaseDaysOf(time) {
  const days = new Map()
  for (const [version, stamp] of Object.entries(time ?? {})) {
    if (version === 'created' || version === 'modified') continue
    const day = dayOf(stamp)
    if (day === undefined) continue
    const list = days.get(day) ?? []
    list.push(version)
    days.set(day, list)
  }
  return days
}

/**
 * How many days at the end of the series have not been reported yet.
 *
 * A trailing run of zeros is the reporting lag, not a collapse in usage — no
 * package goes from 614 downloads to zero and stays there while `react` does the
 * same thing on the same days. The count is returned rather than filtered away
 * so the caller can say how much of the window it is actually judging.
 *
 * @param series - rows of `{ day, downloads }`, in day order.
 * @returns the number of trailing days reporting zero.
 */
export function lagDaysOf(series) {
  let lag = 0
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].downloads !== 0) break
    lag += 1
  }
  return lag
}

/**
 * Split a reported window into days that published and days that did not.
 *
 * The split is the whole point of this script: a release day and a quiet day
 * measure different things, and averaging them together produces a number that
 * moves with the release calendar rather than with usage.
 *
 * @param series - rows of `{ day, downloads }` with the lag already removed.
 * @param releases - the Map from {@link releaseDaysOf}.
 * @returns the two groups, each as an array of numbers.
 */
export function splitDays(series, releases) {
  const released = []
  const quiet = []
  for (const row of series) {
    if (releases.has(row.day)) released.push(row.downloads)
    else quiet.push(row.downloads)
  }
  return { released, quiet }
}

/**
 * The middle value, which is what a "typical day" means here.
 *
 * The mean is the wrong summary for a quiet-day baseline: one day when a mirror
 * happened to resync would drag it up and hide a real change. The median is the
 * number that stops moving for that reason.
 *
 * @param values - the numbers to summarise.
 * @returns the median, or `undefined` for an empty list.
 */
export function medianOf(values) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * Summarise a download series against the days that published.
 *
 * @param options - `series` (day order), `releases` (from {@link releaseDaysOf}).
 * @returns the figures the CLI prints; every field is present even when a group
 *   is empty, so the caller never has to guess why a number is missing.
 */
export function summarise({ series, releases }) {
  const lagDays = lagDaysOf(series)
  const reported = series.slice(0, series.length - lagDays)
  const { released, quiet } = splitDays(reported, releases)
  const sum = (values) => values.reduce((total, value) => total + value, 0)
  const mean = (values) => (values.length === 0 ? undefined : sum(values) / values.length)

  const releasedMean = mean(released)
  const quietMean = mean(quiet)
  const quietMedian = medianOf(quiet)

  return {
    firstDay: series[0]?.day,
    lastDay: series[series.length - 1]?.day,
    lastReportedDay: reported[reported.length - 1]?.day,
    windowDays: series.length,
    lagDays,
    reportedDays: reported.length,
    total: sum(series.map((row) => row.downloads)),
    reportedTotal: sum(reported.map((row) => row.downloads)),
    released: { days: released.length, total: sum(released), perDay: releasedMean },
    quiet: { days: quiet.length, total: sum(quiet), perDay: quietMean, median: quietMedian },
    /*
     * How much louder a release day is than a quiet one. Above roughly 2, the
     * download graph is dominated by publishing rather than by use, and totals
     * from week to week stop meaning anything.
     */
    multiplier:
      releasedMean !== undefined && quietMean !== undefined && quietMean > 0
        ? releasedMean / quietMean
        : undefined,
  }
}

/** The window npm's `last-month` counts over. */
const WINDOW_DAYS = 30

/**
 * Which upcoming day removes which old day from the rolling 30-day window.
 *
 * On day `D` the window covers `D-29` through `D`, so the day that falls out on
 * `D` is `D-30`. A package younger than 30 days has not started losing anything
 * yet — the days leaving are still the zeroes from before it existed — but once
 * it is a month old, a good day slides out and takes its downloads with it with
 * nobody watching. Naming the day and the number stops that scheduled decline
 * from being read as a regression.
 *
 * Days the API has not reported yet never counted toward a total, so they drop
 * nothing real and are left out.
 *
 * @param series - rows of `{ day, downloads }` in day order.
 * @param daysAhead - how many future days to project.
 * @returns one row per future day that drops a reported day out of the window.
 */
export function rolloff(series, daysAhead = WINDOW_DAYS) {
  const last = series[series.length - 1]
  if (last === undefined || !series.some((row) => row.downloads > 0)) return []

  const byDay = new Map(series.map((row) => [row.day, row.downloads]))
  const future = []
  for (let ahead = 1; ahead <= daysAhead; ahead += 1) {
    const onDay = shiftDay(last.day, ahead)
    const leaving = shiftDay(onDay, -WINDOW_DAYS)
    if (onDay === undefined || leaving === undefined) continue
    const downloads = byDay.get(leaving)
    if (downloads === undefined || downloads === 0) continue
    future.push({ onDay, drops: leaving, downloads })
  }
  return future
}

/**
 * Read a JSON document over HTTP, failing with the URL in the message.
 *
 * This machine reaches `api.npmjs.org` and `registry.npmjs.org` over a link that
 * drops connections often enough that a bare failure is not actionable, so the
 * URL is included and the name of the failing call is left to the caller.
 *
 * @param url - absolute URL.
 * @returns the parsed document.
 */
async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

/**
 * Add `days` to a `YYYY-MM-DD` day.
 *
 * `dayOf` wants something `Date.parse` understands, so the arithmetic result has
 * to be turned back into an ISO string here: handing it an epoch number lands in
 * the NaN branch and silently yields `undefined`.
 *
 * @param day - the starting day.
 * @param days - how many days to move, negative to go back.
 * @returns the resulting day, or `undefined` when `day` is not a day.
 */
function shiftDay(day, days) {
  const at = Date.parse(`${day}T00:00:00.000Z`)
  if (Number.isNaN(at)) return undefined
  return new Date(at + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Print the report for one package.
 *
 * @param options - the parsed CLI flags.
 */
async function report({ days, baseline, json, failBelow }) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const name = manifest.name
  if (typeof name !== 'string' || name === '') throw new Error('package.json has no name')

  const today = dayOf(Date.now())
  const start = shiftDay(today, -(days - 1))

  const [range, registry] = await Promise.all([
    getJson(`https://api.npmjs.org/downloads/range/${start}:${today}/${encodeURIComponent(name)}`),
    getJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`),
  ])

  const series = (range.downloads ?? []).map((row) => ({ day: row.day, downloads: row.downloads }))
  if (series.length === 0) throw new Error(`no download rows for ${name} between ${start} and ${today}`)

  const releases = releaseDaysOf(registry.time)
  const created = dayOf(registry.time?.created)
  // Days before the package existed are zeroes npm reports because there was
  // nothing to download, not because nobody downloaded it. Leaving them in pulls
  // the quiet median to 0 and makes every report look dead. Drop them and say so.
  const lifeline = created === undefined ? series : series.filter((row) => row.day >= created)
  const beforeBirth = series.length - lifeline.length
  const summary = summarise({ series: lifeline, releases })
  const upcoming = rolloff(lifeline)
  const ageDays =
    created === undefined ? undefined : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${created}T00:00:00Z`)) / DAY_MS)

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ name, summary, rolloff: upcoming, created, ageDays, beforeBirth }, null, 2)}\n`,
    )
  } else {
    const round = (value) => (value === undefined ? 'n/a' : Math.round(value).toLocaleString('en-US'))
    console.log(`${name} — downloads by day, ${series[0].day} to ${series[series.length - 1].day}`)
    console.log('')
    if (beforeBirth > 0) {
      console.log(
        `  ${beforeBirth} day(s) at the start are before ${created}, the package was not published yet — excluded,` +
          ' because a zero from before the package existed is not a quiet day.',
      )
      console.log('')
    }
    if (summary.lagDays > 0) {
      console.log(
        `  ${summary.lagDays} day(s) at the end are not reported yet; everything below covers ` +
          `${summary.reportedDays} days, through ${summary.lastReportedDay}.`,
      )
      console.log('  npm reports 0 for the current day and often the one before it — that is lag, not usage.')
      console.log('')
    }
    console.log(`  release days   ${String(summary.released.days).padStart(3)}  avg ${round(summary.released.perDay).padStart(7)}/day`)
    console.log(`  quiet days     ${String(summary.quiet.days).padStart(3)}  avg ${round(summary.quiet.perDay).padStart(7)}/day`)
    console.log(`  quiet baseline ${' '.repeat(3)}  median ${round(summary.quiet.median).padStart(4)}/day   <- the number that means usage`)
    if (summary.multiplier !== undefined) {
      console.log(`  release day is ${summary.multiplier.toFixed(1)}x a quiet day`)
      console.log(
        summary.multiplier > 2
          ? '  => publishing is most of the traffic here; week-to-week totals follow the release calendar'
          : '  => publishing is not driving the numbers; the totals are mostly organic',
      )
    }
    console.log('')

    if (baseline !== undefined && summary.quiet.median !== undefined) {
      const delta = summary.quiet.median - baseline
      const percent = baseline === 0 ? undefined : (delta / baseline) * 100
      const shown = percent === undefined ? 'n/a' : `${percent >= 0 ? '+' : ''}${percent.toFixed(0)}%`
      console.log(`  baseline vs the ${baseline} you gave: ${delta >= 0 ? '+' : ''}${delta} (${shown})`)
      console.log('')
    }

    if (ageDays !== undefined && ageDays < 30) {
      console.log(`  this package is ${ageDays} day(s) old, so the rolling 30-day total is still filling.`)
      console.log('  Days that leave the window, with nothing new coming in:')
      for (const row of upcoming.slice(0, 6)) {
        console.log(`    ${row.onDay}  -${String(row.downloads).padStart(4)}   (${row.drops} leaves the window)`)
      }
      console.log('  A falling last-month number before the window is full is arithmetic, not a regression.')
      console.log('')
    }

    // The chart uses the same lifeline as the figures above, so a day drawn as
    // quiet is a day the package existed and nobody downloaded it.
    const shown = lifeline.slice(-14)
    const peak = Math.max(...shown.map((row) => row.downloads), 1)
    console.log('  last days:')
    for (const row of shown) {
      const bar = row.downloads === 0 ? '' : '#'.repeat(Math.max(1, Math.round((row.downloads / peak) * 40)))
      const mark = releases.has(row.day) ? `  release ${releases.get(row.day).join(',')}` : ''
      console.log(`    ${row.day}  ${String(row.downloads).padStart(5)} ${bar}${mark}`)
    }
  }

  if (failBelow !== undefined) {
    const value = summary.quiet.median
    if (value === undefined) {
      console.error(`\nFAIL: no quiet days in the window, so the baseline cannot be compared to ${failBelow}`)
      process.exit(1)
    }
    if (value < failBelow) {
      console.error(`\nFAIL: quiet-day baseline ${value} is below the ${failBelow} this run requires`)
      process.exit(1)
    }
  }
}

/**
 * Parse the command line.
 *
 * @param argv - the arguments after the script name.
 * @returns the flags, with defaults applied.
 */
function parseArgs(argv) {
  const flags = { days: DEFAULT_DAYS, baseline: undefined, json: false, failBelow: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length) throw new Error(`${arg} needs a value`)
      return argv[index]
    }
    if (arg === '--json') flags.json = true
    else if (arg === '--days') flags.days = Number.parseInt(next(), 10)
    else if (arg === '--baseline') flags.baseline = Number.parseInt(next(), 10)
    else if (arg === '--fail-below') flags.failBelow = Number.parseInt(next(), 10)
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node scripts/downloads.mjs [--days N] [--baseline N] [--json] [--fail-below N]')
      process.exit(0)
    } else throw new Error(`unknown argument: ${arg}`)
  }
  for (const key of ['days', 'baseline', 'failBelow']) {
    const value = flags[key]
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`--${key === 'failBelow' ? 'fail-below' : key} must be a number of 0 or more`)
    }
  }
  if (flags.days < 1) throw new Error('--days must be at least 1')
  return flags
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename

if (invokedDirectly) {
  try {
    await report(parseArgs(process.argv.slice(2)))
  } catch (error) {
    console.error(`could not read the download numbers: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
