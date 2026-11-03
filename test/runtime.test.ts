import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runtimeVersionOf } from '../src/host/runtime.ts'

/*
 * The lookup has to answer with the version of the `@deepseek-ai/dsh-app-boot`
 * copy the running process loaded, because that manifest is what the host's
 * compatibility gate reads. Which copy that is depends on the entry point, and
 * getting it wrong is not a harmless miss: a version that is too old marks
 * installable releases uninstallable.
 */

/** Lay out a host whose `@deepseek-ai/dsh-app-boot` sits beside the entry. */
function hostWith(version: string): { entry: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-'))
  const packageDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version }))
  const lib = join(root, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib')
  mkdirSync(lib, { recursive: true })
  const entry = join(lib, 'index.js')
  writeFileSync(entry, '')
  return { entry, root }
}

test('the version is read from the copy beside the entry point', () => {
  const { entry, root } = hostWith('0.2.1-rc.5')
  try {
    assert.equal(runtimeVersionOf(['node', entry]), '0.2.1-rc.5')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a second entry point is tried when the first one leads nowhere', () => {
  /*
   * The desktop shell passes several paths on argv: its own entry, the runtime
   * root, the profile. Walking only `argv[1]` would miss the install on any
   * shape where the entry is not first.
   */
  const { entry, root } = hostWith('0.3.0-rc.1')
  try {
    const missing = join(root, 'not-a-host', 'index.js')
    assert.equal(runtimeVersionOf(['node', '--expose-internals', missing, entry]), '0.3.0-rc.1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an entry with no readable runtime reports nothing rather than guessing', () => {
  /*
   * "I could not tell" must stay distinguishable from "this version is wrong":
   * the caller turns this into "mark nothing", so a guess here would hide real
   * releases. Directory arguments and non-script arguments are skipped, not
   * treated as failures.
   */
  const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-empty-'))
  try {
    const entry = join(root, 'index.js')
    writeFileSync(entry, '')
    assert.equal(runtimeVersionOf(['node', entry]), undefined)
    assert.equal(runtimeVersionOf(['node', 'D:\\dsh-data\\profiles\\desktop']), undefined)
    assert.equal(runtimeVersionOf([]), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a package manifest without a usable version is not a version', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-blank-'))
  try {
    const packageDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ version: '   ' }))
    const entry = join(root, 'index.js')
    writeFileSync(entry, '')
    assert.equal(runtimeVersionOf(['node', entry]), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
