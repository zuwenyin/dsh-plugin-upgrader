import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { dropDependency, profileDirFrom, restoreDependency } from '../src/host/manifest.ts'
import {
  JOURNAL_FILE,
  clearJournal,
  readJournal,
  recoverPendingDrop,
} from '../src/host/manifest.ts'

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
  assert.equal(profileDirFrom({} as NodeJS.ProcessEnv, join('D:/nowhere', 'x')), undefined)
})

test('a desktop host with no DSH variables falls back to a cwd that is a profile', () => {
  // The desktop spawns the host with cwd = the profile dir and no DSH_PROFILE*;
  // the manifest's `dsh.profile` key is what makes the cwd recognisable.
  const fixture = profile()
  try {
    assert.equal(profileDirFrom({} as NodeJS.ProcessEnv, fixture.dir), fixture.dir)
  } finally {
    fixture.cleanup()
  }
})

test('a cwd that is not a profile is never mistaken for one', () => {
  const bare = mkdtempSync(join(tmpdir(), 'dsh-pu-bare-'))
  const notJson = mkdtempSync(join(tmpdir(), 'dsh-pu-notjson-'))
  const noProfileKey = mkdtempSync(join(tmpdir(), 'dsh-pu-nokey-'))
  try {
    // No manifest at all.
    assert.equal(profileDirFrom({} as NodeJS.ProcessEnv, bare), undefined)
    // A manifest that is not JSON.
    writeFileSync(join(notJson, 'package.json'), '{broken', 'utf8')
    assert.equal(profileDirFrom({} as NodeJS.ProcessEnv, notJson), undefined)
    // A manifest without the dsh.profile key — an ordinary package.
    writeFileSync(join(noProfileKey, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8')
    assert.equal(profileDirFrom({} as NodeJS.ProcessEnv, noProfileKey), undefined)
  } finally {
    for (const dir of [bare, notJson, noProfileKey]) rmSync(dir, { recursive: true, force: true })
  }
})

test('an explicit environment still wins over the cwd fallback', () => {
  const fixture = profile()
  try {
    assert.equal(
      profileDirFrom({ DSH_PROFILE_DIR: 'D:/p' } as NodeJS.ProcessEnv, fixture.dir),
      'D:/p',
    )
    assert.equal(
      profileDirFrom({ DSH_HOME: 'D:/h', DSH_PROFILE: 'desktop' } as NodeJS.ProcessEnv, fixture.dir),
      join('D:/h', 'profiles', 'desktop'),
    )
  } finally {
    fixture.cleanup()
  }
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

test('the journal is a file beside the manifest, not a rewrite of it', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    // Recovery is only possible if the record is durable and separate: a manifest
    // that merely lacks the entry cannot distinguish "dropped" from "never had it".
    assert.deepEqual(readdirSync(fixture.dir).sort(), ['package.json', JOURNAL_FILE])
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

test('a drop records what it removed, so the loss is undoable', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    // The record exists *after* the entry is gone — that is the whole point:
    // the manifest alone cannot say what used to be there.
    assert.deepEqual(readJournal(fixture.dir)?.name, 'dsh-plugin-upgrader')
    assert.deepEqual(readJournal(fixture.dir)?.spec, '1.1.1')
  } finally {
    fixture.cleanup()
  }
})

test('restoring clears the record instead of leaving it to be replayed', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    restoreDependency(fixture.dir, 'dsh-plugin-upgrader', '1.1.1')
    assert.equal(readJournal(fixture.dir), undefined)
    // A second recovery must not think the entry is missing.
    assert.deepEqual(recoverPendingDrop(fixture.dir), { kind: 'none' })
  } finally {
    fixture.cleanup()
  }
})

test('an interrupted upgrade is repaired on the next load', () => {
  const fixture = profile()
  try {
    // What a killed process leaves behind: the entry gone, the package still on
    // disk, and nothing else in the profile remembering either fact.
    const dropped = dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    assert.equal(dropped.kind, 'dropped')
    assert.equal((fixture.manifest().dependencies as Record<string, string>)['dsh-plugin-upgrader'], undefined)

    const recovery = recoverPendingDrop(fixture.dir)
    assert.deepEqual(recovery, { kind: 'restored', name: 'dsh-plugin-upgrader', spec: '1.1.1' })
    assert.equal((fixture.manifest().dependencies as Record<string, string>)['dsh-plugin-upgrader'], '1.1.1')
    assert.equal(readJournal(fixture.dir), undefined)
  } finally {
    fixture.cleanup()
  }
})

test('an install that landed is not undone by its own record', () => {
  const fixture = profile()
  try {
    dropDependency(fixture.dir, 'dsh-plugin-upgrader')
    // pnpm wrote the new version before the process died.
    const manifest = fixture.manifest()
    ;(manifest.dependencies as Record<string, string>)['dsh-plugin-upgrader'] = '10.28.1'
    writeFileSync(join(fixture.dir, 'package.json'), JSON.stringify(manifest, undefined, 2), 'utf8')

    assert.deepEqual(recoverPendingDrop(fixture.dir), { kind: 'settled', name: 'dsh-plugin-upgrader' })
    assert.equal((fixture.manifest().dependencies as Record<string, string>)['dsh-plugin-upgrader'], '10.28.1')
    assert.equal(readJournal(fixture.dir), undefined)
  } finally {
    fixture.cleanup()
  }
})

test('a profile with no record is left exactly as it is', () => {
  const fixture = profile()
  try {
    const before = readFileSync(join(fixture.dir, 'package.json'), 'utf8')
    assert.deepEqual(recoverPendingDrop(fixture.dir), { kind: 'none' })
    assert.equal(readFileSync(join(fixture.dir, 'package.json'), 'utf8'), before)
  } finally {
    fixture.cleanup()
  }
})

test('a record that no longer describes the manifest is discarded, not applied', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-noapply-'))
  try {
    // The manifest was rewritten by something that never knew about the record.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8')
    writeFileSync(
      join(dir, JOURNAL_FILE),
      JSON.stringify({ name: 'dsh-dream-skin', spec: '10.27.1', at: Date.now() }),
      'utf8',
    )
    assert.deepEqual(recoverPendingDrop(dir), { kind: 'none' })
    // Inventing a `dependencies` object would undo a deliberate edit.
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')), { name: 'x' })
    assert.equal(existsSync(join(dir, JOURNAL_FILE)), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a corrupt record is ignored rather than trusted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-corrupt-'))
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { other: '1.0.0' } }),
      'utf8',
    )
    writeFileSync(join(dir, JOURNAL_FILE), '{not json', 'utf8')
    assert.equal(readJournal(dir), undefined)
    assert.deepEqual(recoverPendingDrop(dir), { kind: 'none' })
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies, { other: '1.0.0' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('clearing a record that is not there is not an error', () => {
  const fixture = profile()
  try {
    assert.doesNotThrow(() => clearJournal(fixture.dir))
    assert.equal(existsSync(join(fixture.dir, JOURNAL_FILE)), false)
  } finally {
    fixture.cleanup()
  }
})
