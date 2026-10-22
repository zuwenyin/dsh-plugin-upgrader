import test from 'node:test'
import assert from 'node:assert/strict'

import { compareVersions, parseVersion, releasePathOf, tagOf } from '../src/host/version.ts'

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
