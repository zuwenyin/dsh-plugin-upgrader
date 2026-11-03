import test from 'node:test'
import assert from 'node:assert/strict'

import { compareVersions, parseVersion, releasePathOf, satisfiesRange, tagOf } from '../src/host/version.ts'

test('parseVersion accepts plain, prerelease and build metadata', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, pre: [] })
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, pre: [] })
  assert.deepEqual(parseVersion('1.2.3-rc.1'), { major: 1, minor: 2, patch: 3, pre: ['rc', '1'] })
  assert.deepEqual(parseVersion('1.2.3+build.5'), { major: 1, minor: 2, patch: 3, pre: [] })
  assert.equal(parseVersion('not-a-version'), null)
  assert.equal(parseVersion('1.2'), null)
  assert.equal(parseVersion(undefined), null)
})

test('compareVersions orders release versions', () => {
  assert.ok(compareVersions('1.2.3', '1.2.4') < 0)
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0)
})

test('a release outranks its own prerelease', () => {
  assert.ok(compareVersions('1.2.3-rc.1', '1.2.3') < 0)
  assert.ok(compareVersions('1.2.3', '1.2.3-rc.1') > 0)
  assert.ok(compareVersions('1.2.3-alpha', '1.2.3-beta') < 0)
  assert.ok(compareVersions('1.2.3-rc.2', '1.2.3-rc.10') < 0)
  assert.ok(compareVersions('1.2.3-rc', '1.2.3-rc.1') < 0)
})

test('unparsable versions compare equal instead of throwing', () => {
  assert.equal(compareVersions('nonsense', '1.2.3'), 0)
  assert.equal(compareVersions('1.2.3', undefined), 0)
})

test('tagOf only adds the v when it is missing', () => {
  assert.equal(tagOf('1.2.3'), 'v1.2.3')
  assert.equal(tagOf('v1.2.3'), 'v1.2.3')
})

test('releasePathOf prefers the release page of a real tag', () => {
  assert.equal(releasePathOf(new Set(['v1.2.3', 'v1.2.4']), '1.2.3'), '/releases/tag/v1.2.3')
  assert.equal(releasePathOf(new Set(['v1.2.3']), 'v1.2.3'), '/releases/tag/v1.2.3')
})

test('releasePathOf falls back to the release feed', () => {
  assert.equal(releasePathOf(new Set(['v1.2.3']), '1.2.4'), '/releases')
  assert.equal(releasePathOf(undefined, '1.2.3'), '/releases')
})

/*
 * The host refuses to install a plugin whose declared DSH range does not admit
 * the running runtime, so the page has to reach the same verdict before it
 * offers a version. Every case below was checked against `node-semver` with the
 * same `includePrerelease: true` option the gate passes; matching it is the
 * whole point, because a page that says "fine" about a version the host then
 * rejects is worse than a page that says nothing.
 */

test('a range admits the runtime it was written for', () => {
  assert.equal(satisfiesRange('0.2.1-rc.5', '>=0.1.7-rc.1 <0.1.8-0'), false)
  assert.equal(satisfiesRange('0.2.1-rc.5', '>=0.1.7-rc.1 <0.3.0-0'), true)
  assert.equal(satisfiesRange('0.2.1-rc.5', '>=0.2.0-rc.2 <0.3.0-0'), true)
})

test('prereleases take part in matching, as includePrerelease makes them', () => {
  assert.equal(satisfiesRange('0.2.1-rc.5', '>=0.2.0-rc.2'), true)
  assert.equal(satisfiesRange('0.2.0-rc.1', '>=0.2.0'), false)
  assert.equal(satisfiesRange('0.3.0-rc.1', '<0.3.0-0'), false)
})

test('caret and tilde expand the way semver expands them', () => {
  assert.equal(satisfiesRange('0.2.1', '^0.2.0'), true)
  assert.equal(satisfiesRange('0.3.0', '^0.2.0'), false)
  assert.equal(satisfiesRange('1.9.9', '^1.2.3'), true)
  assert.equal(satisfiesRange('2.0.0', '^1.2.3'), false)
  // `^0.0.3` allows only patch releases, not `0.1.0`.
  assert.equal(satisfiesRange('0.0.4', '^0.0.3'), false)
  assert.equal(satisfiesRange('1.2.9', '~1.2.3'), true)
  assert.equal(satisfiesRange('1.3.0', '~1.2.3'), false)
  /*
   * `~0.1.7-rc.1` keeps the patch in its lower bound. Reading `~` as `>=0.1.0`
   * would let `0.1.6` through and mark an incompatible build usable.
   */
  assert.equal(satisfiesRange('0.1.6', '~0.1.7-rc.1'), false)
})

test('a partial version is a range, prereleases of it included', () => {
  assert.equal(satisfiesRange('1.2.0-rc.1', '1.x'), true)
  assert.equal(satisfiesRange('2.0.0', '1.x'), false)
  assert.equal(satisfiesRange('1.2.0-rc.1', '1.2'), true)
  assert.equal(satisfiesRange('1.2.0-rc.1', '1.2.3'), false)
})

test('alternatives and hyphen ranges are understood', () => {
  assert.equal(satisfiesRange('0.1.7', '0.2.0 || 0.1.7'), true)
  assert.equal(satisfiesRange('0.1.9', '0.2.0 || 0.1.7'), false)
  assert.equal(satisfiesRange('1.2.3-beta.1', '1.2.3 - 2.0.0'), true)
  assert.equal(satisfiesRange('2.0.1', '1.2.3 - 2.0.0'), false)
})

test('an operator may be separated from its version by a space', () => {
  assert.equal(satisfiesRange('0.1.0', '>= 0.2.0'), false)
  assert.equal(satisfiesRange('0.2.5', '>= 0.2.0'), true)
})

test('an empty or unreadable range never blocks a version', () => {
  /*
   * A manifest written in a way this parser does not know must not be the
   * reason a version is called incompatible: the host stays the judge, and the
   * page only loses a hint. Answering `false` here would hide real releases.
   */
  assert.equal(satisfiesRange('0.2.1-rc.5', ''), true)
  assert.equal(satisfiesRange('0.2.1-rc.5', '*'), true)
  assert.equal(satisfiesRange('0.2.1-rc.5', 'not a range at all'), true)
  assert.equal(satisfiesRange(undefined, '>=9.0.0'), true)
  assert.equal(satisfiesRange('0.2.1-rc.5', undefined), true)
})
