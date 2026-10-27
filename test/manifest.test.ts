import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { dropDependency, profileDirFrom, restoreDependency } from '../src/host/manifest.ts'

/**
 * A throwaway profile directory with one dependency.
 *
 * These tests must never touch the real profile: they write a manifest, and the
 * live one belongs to the running harness.
 */
function profile(): { dir: string; manifest: () => Record<string, unknown>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-manifest-'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'desktop',
        private: true,
        dependencies: { 'dsh-plugin-upgrader': '1.1.1', other: '^2.0.0' },
        dsh: { profile: { bundles: ['other', 'dsh-plugin-upgrader'] } },
      },
      undefined,
      2,
    ),
    'utf8',
  )
  return {
    dir,
    manifest: () => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

test('the profile directory comes from the environment the harness exports', () => {
  assert.equal(profileDirFrom({ DSH_PROFILE_DIR: 'D:/p' } as NodeJS.ProcessEnv), 'D:/p')
  // Fallback for a process that only got the two older variables.
  assert.equal(
    profileDirFrom({ DSH_HOME: 'D:/h', DSH_PROFILE: 'desktop' } as NodeJS.ProcessEnv),
    join('D:/h', 'profiles', 'desktop'),
  )
  assert.equal(profileDirFrom({} as NodeJS.ProcessEnv), undefined)
})

test('dropping an entry leaves every other field alone', () => {
  const fixture = profile()
  try {
    const result = dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    assert.deepEqual(result, { kind: 'dropped', dependency: '1.1.1' })
    const after = fixture.manifest()
    assert.equal(after.dependencies?.['dsh-plugin-upgrader' as never], undefined)
    // The neighbour, the selection and the name survive.
    assert.equal((after.dependencies as Record<string, string>).other, '^2.0.0')
    assert.deepEqual(after.dsh, { profile: { bundles: ['other', 'dsh-plugin-upgrader'] } })
    assert.equal(after.name, 'desktop')
  } finally {
    fixture.cleanup()
  }
})

test('the manifest keeps the harness format after a drop', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    const text = readFileSync(join(fixture.dir, 'package.json'), 'utf8')
    // The harness writes 2-space JSON with a trailing newline; anything else is
    // a diff every time a person opens the file.
    assert.ok(text.endsWith('\n'))
    assert.match(text, /\n {2}"name":/)
  } finally {
    fixture.cleanup()
  }
})

test('no temp file is left behind', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    const strays = readdirSync(fixture.dir).filter((name) => name.includes('upgrader-tmp'))
    assert.deepEqual(strays, [])
  } finally {
    fixture.cleanup()
  }
})

test('an entry that is not there is reported, not invented', () => {
  const fixture = profile()
  try {
    assert.deepEqual(dropDependency(fixture.dir, 'not-installed'), { kind: 'absent' })
    // The manifest is untouched.
    assert.equal((fixture.manifest().dependencies as Record<string, string>)['dsh-plugin-upgrader'], '1.1.1')
  } finally {
    fixture.cleanup()
  }
})

test('a missing profile is a reason, not a crash', () => {
  const result = dropDependency(join(tmpdir(), 'dsh-pu-does-not-exist-xyz'), 'pkg')
  assert.equal(result.kind, 'unavailable')
})

test('a restored entry goes back exactly as it was', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    assert.equal(restoreDependency(fixture.dir, 'dsh-plugin-upgrader', '1.1.1'), true)
    assert.equal((fixture.manifest().dependencies as Record<string, string>)['dsh-plugin-upgrader'], '1.1.1')
  } finally {
    fixture.cleanup()
  }
})

test('restoring an entry that is already present changes nothing', () => {
  const fixture = profile()
  try {
    // pnpm may have written the new version before the call reported a failure.
    assert.equal(restoreDependency(fixture.dir, 'dsh-plugin-upgrader', '9.9.9'), true)
    assert.equal((fixture.manifest().dependencies as Record<string, string>)['dsh-plugin-upgrader'], '1.1.1')
  } finally {
    fixture.cleanup()
  }
})

test('a profile without a dependencies object is left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-nodeps-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8')
    assert.deepEqual(dropDependency(dir, 'pkg'), { kind: 'absent' })
    assert.equal(existsSync(join(dir, 'package.json')), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
