import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnosticsReport, needsAttention } from '../src/client/diagnostics.ts'
import { EN, ZH } from '../src/client/copy.ts'
import type { OverviewRow, T } from '../src/client/types.ts'

/** A row with nothing wrong, so each test can add exactly one problem. */
function row(over: Partial<OverviewRow> = {}): OverviewRow {
  return {
    name: 'pkg',
    version: '1.0.0',
    official: false,
    availability: 'profile',
    installed: true,
    enabled: true,
    removable: true,
    managed: true,
    kind: 'registry',
    title: 'pkg',
    error: null,
    latest: '1.1.0',
    upgradable: true,
    versions: [],
    tags: {},
    totalVersions: 2,
    ...over,
  }
}

/** The built-in English dictionary as the translator, like `makeT` falls back to. */
const t = ((key: string, ...args: unknown[]): string => {
  const value = (EN as Record<string, unknown>)[key]
  if (typeof value === 'function') return String((value as (...rest: unknown[]) => string)(...args))
  if (typeof value === 'string') return value
  throw new Error(`missing copy key: ${key}`)
}) as T

/**
 * The count exists to answer one question, so each of these pins one of the
 * things that can make the answer wrong. A predicate that returned `true` for
 * every row would be caught by the first case; one that returned `false` for
 * every row by all the others.
 */
test('an ordinary upgradable row needs nothing', () => {
  assert.equal(needsAttention(row()), false)
})

test('a release the host would refuse is explained inline, not counted', () => {
  /*
   * `blocked` is about a version that was never installed. The row already says
   * why and there is nothing to do about it, so putting it in a "needs
   * attention" badge would be a count that never goes down.
   */
  assert.equal(needsAttention(row({ blocked: { version: '1.2.0', requires: '>=0.3.0' } })), false)
})

test('an installed version this host refuses needs a decision', () => {
  assert.equal(needsAttention(row({ installedIncompatible: { requires: '>=0.3.0' } })), true)
})

test('a mirror that is behind needs a decision', () => {
  assert.equal(needsAttention(row({ mirrorMissing: ['1.2.0'] })), true)
  // An empty list is the ordinary answer and must not count.
  assert.equal(needsAttention(row({ mirrorMissing: [] })), false)
})

test('a version lookup that failed needs a decision', () => {
  assert.equal(needsAttention(row({ versionError: 'registry lookup failed' })), true)
  // The host sends `''` rather than omitting the field when it has nothing to
  // say; that is not a failure.
  assert.equal(needsAttention(row({ versionError: '' })), false)
})

test('a build waiting for approval needs a decision', () => {
  assert.equal(needsAttention(row({ pendingBuilds: ['esbuild'] })), true)
  assert.equal(needsAttention(row({ pendingBuilds: [] })), false)
})

test('the report names the runtime the page judged against', () => {
  const text = diagnosticsReport({ runtimeVersion: '0.2.1-rc.5', registry: 'https://r.example', generatedAt: 0, rows: [] }, t)
  assert.match(text, /- DSH: 0\.2\.1-rc\.5/)
  assert.match(text, /- registry: https:\/\/r\.example/)
  assert.match(text, /- plugins: 0/)
})

test('an unreadable runtime says so instead of leaving a blank', () => {
  // A blank between "DSH:" and the newline reads as "fine"; the whole reason
  // this line exists is that compatibility answers depend on it.
  const text = diagnosticsReport({ runtimeVersion: null, registry: undefined, generatedAt: undefined, rows: [] }, t)
  assert.match(text, /- DSH: DSH version unknown/)
  assert.match(text, /- registry: \?/)
  assert.match(text, /- generated: \?/)
})

test('a report carries every problem a row can have', () => {
  const text = diagnosticsReport(
    {
      runtimeVersion: '0.1.0',
      registry: 'https://r.example',
      generatedAt: 0,
      rows: [
        row({
          name: 'broken',
          version: '1.0.0',
          latest: '1.2.0',
          recommended: '1.1.0',
          enabled: false,
          blocked: { version: '1.2.0', requires: '>=0.3.0' },
          installedIncompatible: { requires: '>=0.2.0' },
          versionError: 'registry unreachable',
          mirrorMissing: ['1.3.0'],
          pendingBuilds: ['esbuild'],
        }),
      ],
    },
    t,
  )
  assert.match(text, /- broken@1\.0\.0 · latest 1\.2\.0 · recommended 1\.1\.0 · disabled/)
  assert.match(text, / {2}- blocked: 1\.2\.0 requires DSH >=0\.3\.0/)
  assert.match(text, / {2}- installed requires DSH >=0\.2\.0/)
  assert.match(text, / {2}- version: registry unreachable/)
  assert.match(text, / {2}- mirror missing: 1\.3\.0/)
  assert.match(text, / {2}- pending builds: esbuild/)
})

test('a recommendation equal to the newest release is not repeated', () => {
  /*
   * On an ordinary row `recommended` and `latest` are the same version. Printing
   * both would read as though the page had chosen between two candidates, which
   * is exactly the case that needs explaining.
   */
  const text = diagnosticsReport(
    { runtimeVersion: '0.1.0', registry: undefined, generatedAt: 0, rows: [row({ recommended: '1.1.0' })] },
    t,
  )
  assert.match(text, /- pkg@1\.0\.0 · latest 1\.1\.0$/m)
  assert.doesNotMatch(text, /recommended/)
})

test('the report is markdown a person can paste, not a data dump', () => {
  const text = diagnosticsReport({ runtimeVersion: '0.2.0', registry: undefined, generatedAt: 0, rows: [row()] }, t)
  assert.ok(text.startsWith('# dsh-plugin-upgrader diagnostics\n'))
  // No trailing newline: pasting it into an issue should not add a blank line.
  assert.equal(text.endsWith('\n'), false)
})

test('the one prose label it needs exists in both languages', () => {
  // The report is the only place this key is used, so a missing translation
  // would show up as the literal key inside a pasted bug report.
  assert.equal(typeof ZH.runtimeVersionUnknown, 'string')
  assert.equal(typeof EN.runtimeVersionUnknown, 'string')
  assert.notEqual(ZH.runtimeVersionUnknown, '')
  assert.notEqual(EN.runtimeVersionUnknown, '')
})
