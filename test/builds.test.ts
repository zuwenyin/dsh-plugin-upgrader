import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PENDING_BUILD, pendingFor, readPendingBuilds } from '../src/host/builds.ts'

/**
 * A throwaway directory holding one `pnpm-workspace.yaml`.
 *
 * The scanner only ever reads this file, so a temporary directory is enough and
 * the running harness's own profile is never touched.
 */
function profile(text: string | undefined): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-builds-'))
  if (text !== undefined) writeFileSync(join(dir, 'pnpm-workspace.yaml'), text, 'utf8')
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('reads the placeholder the manager writes', () => {
  const only = profile(`packages:\n  - .\nallowBuilds:\n  dsh-xdpool@2.6.4: ${PENDING_BUILD}\n`)
  try {
    assert.deepEqual(readPendingBuilds(only.dir), ['dsh-xdpool@2.6.4'])
  } finally {
    only.cleanup()
  }
})

test('an answered build is not pending', () => {
  const answered = profile('allowBuilds:\n  protobufjs: true\n  esbuild: false\n')
  try {
    assert.deepEqual(readPendingBuilds(answered.dir), [])
  } finally {
    answered.cleanup()
  }
})

test('the section ends at the next top-level key', () => {
  /*
   * The real profile puts a long `minimumReleaseAgeExclude` list right after
   * `allowBuilds`. Its entries are indented list items, so a scanner that only
   * looked at indentation would keep reading them as build decisions.
   */
  const trailing = profile(
    [
      'allowBuilds:',
      `  dsh-xdpool@2.6.4: ${PENDING_BUILD}`,
      'minimumReleaseAgeExclude:',
      '  - dsh-xdpool@2.4.2 || 2.4.3 || 2.5.0 || 2.6.4',
      '  - other-pkg@1.0.0',
      '',
    ].join('\n'),
  )
  try {
    assert.deepEqual(readPendingBuilds(trailing.dir), ['dsh-xdpool@2.6.4'])
  } finally {
    trailing.cleanup()
  }
})

test('a key in a later section is not counted', () => {
  const later = profile(`allowBuilds:\n  one: true\notherSection:\n  two: ${PENDING_BUILD}\n`)
  try {
    assert.deepEqual(readPendingBuilds(later.dir), [])
  } finally {
    later.cleanup()
  }
})

test('wildcard keys are skipped', () => {
  /*
   * A pattern is not one package, so there is nothing to approve or refuse for
   * it. The manager skips these for the same reason, and approving a pattern
   * would decide for every package it matches.
   */
  const patterns = profile(`allowBuilds:\n  '@scope/*': ${PENDING_BUILD}\n  'pkg?': ${PENDING_BUILD}\n`)
  try {
    assert.deepEqual(readPendingBuilds(patterns.dir), [])
  } finally {
    patterns.cleanup()
  }
})

test('quoted keys are unquoted', () => {
  const quoted = profile(`allowBuilds:\n  "@scope/thing@0.2.16": ${PENDING_BUILD}\n  'plain@1.0.0': ${PENDING_BUILD}\n`)
  try {
    assert.deepEqual(readPendingBuilds(quoted.dir), ['@scope/thing@0.2.16', 'plain@1.0.0'])
  } finally {
    quoted.cleanup()
  }
})

test('a trailing comment does not hide the placeholder', () => {
  const commented = profile(`allowBuilds:\n  pkg@1.0.0: ${PENDING_BUILD} # written by the manager\n`)
  try {
    assert.deepEqual(readPendingBuilds(commented.dir), ['pkg@1.0.0'])
  } finally {
    commented.cleanup()
  }
})

test('a flow mapping on the section line is read too', () => {
  const flow = profile(`allowBuilds: { pkg@1.0.0: ${PENDING_BUILD}, done: true }\n`)
  try {
    assert.deepEqual(readPendingBuilds(flow.dir), ['pkg@1.0.0'])
  } finally {
    flow.cleanup()
  }
})

test('the placeholder must match exactly', () => {
  /*
   * A hand edit that says something else is not an approval prompt. Treating
   * any non-boolean as pending would turn a typo into a button that runs
   * arbitrary install scripts.
   */
  const typo = profile('allowBuilds:\n  pkg@1.0.0: set this to true or falze\n')
  try {
    assert.deepEqual(readPendingBuilds(typo.dir), [])
  } finally {
    typo.cleanup()
  }
})

test('no file, no directory, or no profile is not an error', () => {
  const empty = profile(undefined)
  try {
    assert.deepEqual(readPendingBuilds(empty.dir), [])
  } finally {
    empty.cleanup()
  }
  assert.deepEqual(readPendingBuilds(undefined), [])
  assert.deepEqual(readPendingBuilds(''), [])
})

test('pendingFor narrows to one package', () => {
  const pending = ['dsh-xdpool@2.6.4', 'dsh-xdpooler@1.0.0', 'other@1.0.0']
  assert.deepEqual(pendingFor(pending, 'dsh-xdpool'), ['dsh-xdpool@2.6.4'])
  assert.deepEqual(pendingFor(pending, 'other'), ['other@1.0.0'])
  assert.deepEqual(pendingFor(pending, 'missing'), [])
  assert.deepEqual(pendingFor(pending, ''), [])
})

test('pendingFor matches the bare name but not a longer package', () => {
  /*
   * `name@` is the separator, not just `name`: `dsh-xdpool` must not pick up
   * `dsh-xdpooler`, whose build scripts were refused for a different package.
   */
  assert.deepEqual(pendingFor(['dsh-xdpooler@1.0.0'], 'dsh-xdpool'), [])
  assert.deepEqual(pendingFor(['dsh-xdpool'], 'dsh-xdpool'), ['dsh-xdpool'])
})
