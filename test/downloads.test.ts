import test from 'node:test'
import assert from 'node:assert/strict'

import { dayOf, lagDaysOf, medianOf, releaseDaysOf, rolloff, splitDays, summarise } from '../scripts/downloads.mjs'

/** Rows in day order, the way the range API returns them. */
function series(...downloads: number[]) {
  return downloads.map((value, index) => ({
    day: `2026-11-${String(index + 1).padStart(2, '0')}`,
    downloads: value,
  }))
}

test('a trailing run of zeroes is the reporting lag, not a drop in usage', () => {
  // The bug this guards: treating the zeroes as real makes every report say the
  // package collapsed, because npm always ends the series with unreported days.
  assert.equal(lagDaysOf(series(275, 483, 38, 0, 0)), 2)
  assert.equal(lagDaysOf(series(275, 483, 38)), 0)
})

test('a zero in the middle of the series is not lag', () => {
  // Only the tail is unreported. A quiet day in the middle is a real zero and
  // must stay in the window, or the baseline would be computed from a series
  // that silently skipped the days it was meant to measure.
  assert.equal(lagDaysOf(series(275, 0, 483, 0)), 1)
})

test('a series that is entirely zero is all lag, not an empty series', () => {
  assert.equal(lagDaysOf(series(0, 0, 0)), 3)
})

test('release days are the days a version was published', () => {
  const days = releaseDaysOf({
    created: '2026-10-22T09:01:54.138Z',
    modified: '2026-11-04T04:53:28.459Z',
    '1.0.0': '2026-10-22T09:02:52.123Z',
    '1.0.1': '2026-10-23T07:21:29.265Z',
    '1.0.2': '2026-10-23T07:30:12.748Z',
  })
  // `created` and `modified` share the `time` object with the versions but are
  // bookkeeping: counting them would make the first day look like a two-version
  // release day and the last day look like one too.
  assert.deepEqual([...days.keys()].sort(), ['2026-10-22', '2026-10-23'])
  assert.deepEqual(days.get('2026-10-23'), ['1.0.1', '1.0.2'])
})

test('a timestamp is bucketed by UTC day, not local day', () => {
  // An evening release east of Greenwich lands on the next UTC day. Bucketing by
  // local time would attribute it to the day before and make a quiet day look
  // like a release day.
  assert.equal(dayOf('2026-11-03T18:30:00.000Z'), '2026-11-03')
  assert.equal(dayOf('2026-11-03T23:59:59.999Z'), '2026-11-03')
  assert.equal(dayOf('2026-11-04T00:00:00.000Z'), '2026-11-04')
  assert.equal(dayOf('not a date'), undefined)
})

test('an epoch is a day too, because that is what the clock returns', () => {
  // The bug this guards: the caller asks "what day is it" with `Date.now()`, and
  // `Date.parse(String(1712345678901))` is NaN, so the whole report asked npm for
  // `range/undefined:undefined` and died on a 400.
  assert.equal(dayOf(Date.parse('2026-11-03T12:00:00.000Z')), '2026-11-03')
  assert.equal(dayOf(0), '1970-01-01')
})

test('the window is split by whether the day published anything', () => {
  const rows = series(275, 483, 38, 41, 0, 0)
  const releases = releaseDaysOf({
    '1.0.0': '2026-11-01T09:00:00.000Z',
    '1.0.1': '2026-11-02T09:00:00.000Z',
  })
  const reported = rows.slice(0, rows.length - lagDaysOf(rows))
  assert.deepEqual(splitDays(reported, releases), { released: [275, 483], quiet: [38, 41] })
})

test('the quiet baseline is the median, so one resync day cannot move it', () => {
  // A mean over quiet days is dragged up by a single mirror resync and then
  // reads as growth. The median is what "a typical day" actually means here.
  assert.equal(medianOf([38, 41, 62, 891, 100]), 62)
  assert.equal(medianOf([38, 41, 62, 100]), 51.5)
  assert.equal(medianOf([]), undefined)
})

test('the summary separates release days from quiet days and reports the lag it dropped', () => {
  const rows = series(0, 668, 0, 66, 0)
  const releases = releaseDaysOf({ '1.1.0': '2026-11-02T09:00:00.000Z' })
  const summary = summarise({ series: rows, releases })
  assert.equal(summary.lagDays, 1)
  assert.equal(summary.reportedDays, 4)
  assert.equal(summary.reportedTotal, 734)
  assert.equal(summary.released.days, 1)
  assert.equal(summary.released.perDay, 668)
  assert.equal(summary.quiet.days, 3)
  assert.equal(summary.quiet.median, 0)
})

test('a release day being much louder than a quiet day is reported as a multiplier', () => {
  const rows = series(38, 41, 62, 0, 668, 0)
  const releases = releaseDaysOf({ '1.1.0': '2026-11-05T09:00:00.000Z' })
  const summary = summarise({ series: rows, releases })
  // 668 / 47 = 14.2 — comfortably past the point where week-to-week totals are
  // tracking the release calendar rather than usage.
  assert.ok(summary.multiplier !== undefined && summary.multiplier > 2)
})

test('a series with no quiet days has no multiplier instead of dividing by zero', () => {
  // Every reported day published something, so there is no quiet baseline to
  // divide by. Dividing by zero would print Infinity and read as a real ratio.
  const rows = series(668, 891, 0)
  const releases = releaseDaysOf({
    '1.1.0': '2026-11-01T09:00:00.000Z',
    '1.2.0': '2026-11-02T09:00:00.000Z',
  })
  const summary = summarise({ series: rows, releases })
  assert.equal(summary.quiet.days, 0)
  assert.equal(summary.multiplier, undefined)
})

test('the rolloff names the day each old day leaves the 30-day window', () => {
  // npm's last-month is a rolling window: the day that falls out on `D` is
  // `D-30`. For a package a month old the days that leave are the ones with real
  // numbers, so a decline arriving on a known date must not be read as users
  // leaving — the report has to say which day went and how many it took.
  const rows = series(...Array.from({ length: 12 }, (_, index) => 100 + index))
  const future = rolloff(rows, 20)
  const first = future[0]
  // The series ends on 2026-11-12, so 2026-11-01 leaves 30 days after its own
  // day, which is 19 days ahead of the last row.
  assert.equal(first.onDay, '2026-12-01')
  assert.equal(first.drops, '2026-11-01')
  assert.equal(first.downloads, 100)
  assert.equal(future.length, 2)
  assert.deepEqual(future.map((row) => row.drops), ['2026-11-01', '2026-11-02'])
  assert.deepEqual(future.map((row) => row.onDay), ['2026-12-01', '2026-12-02'])
})

test('the rolloff skips unreported days, which drop nothing real', () => {
  const rows = series(275, 0, 0)
  const future = rolloff(rows, 30)
  // The two trailing zeroes are lag: they never counted toward a total, so the
  // report must not claim they will be subtracted from one.
  assert.deepEqual(future.map((row) => row.drops), ['2026-11-01'])
})

test('a series with no reported days has no rolloff at all', () => {
  assert.deepEqual(rolloff(series(0, 0, 0)), [])
})
