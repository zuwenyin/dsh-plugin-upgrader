import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHostInfo, hostKindOf, relaunchCommand } from '../src/host/hostinfo.ts'

/**
 * The two entry points a host can have, copied from a real install.
 *
 * The desktop one is the path the shell spawns; the cli one is what a terminal
 * runs. The distinction is the whole point: only the desktop shell can bring
 * the host back by itself, and only the cli start has a command to replay.
 */
const DESKTOP_ENTRY = 'D:\\MySoft\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\index.js'
const CLI_ENTRY = 'D:\\MySoft\\nvm\\node_cache\\_npx\\1e7f6d9597241db0\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'

test('a host spawned by the desktop shell is recognised from its entry point', () => {
  assert.equal(hostKindOf(DESKTOP_ENTRY), 'desktop')
  // The same path with forward slashes, which is how it is written on posix.
  assert.equal(hostKindOf(DESKTOP_ENTRY.replaceAll('\\', '/')), 'desktop')
  assert.equal(hostKindOf(CLI_ENTRY), 'cli')
})

test('a directory that merely mentions the desktop package is not the entry', () => {
  // `dsh-desktop-host` appears in the middle of a profile path, not as the entry.
  assert.equal(hostKindOf('D:\\dsh-desktop-host\\profiles\\x\\something.js'), 'cli')
  // A file that ends the same way but sits outside the package's lib.
  assert.equal(hostKindOf('D:\\x\\dsh-desktop-host\\index.js'), 'cli')
})

test('the desktop shell is never given a command to replay', () => {
  // Replaying the child's own argv would start a second host on the same profile.
  assert.equal(relaunchCommand('C:\\app\\DeepSeek Harness.exe', ['exe', CLI_ENTRY], 'desktop'), '')
})

test('a cli start is rebuilt into a command that can be pasted', () => {
  const command = relaunchCommand('C:\\Program Files\\nodejs\\node.exe', ['node', CLI_ENTRY], 'cli')
  assert.equal(command, `"C:\\Program Files\\nodejs\\node.exe" ${CLI_ENTRY}`)
})

test('arguments are quoted only when they need it', () => {
  const command = relaunchCommand('/usr/bin/node', ['node', '/opt/dsh/bin.js', '--profile', 'my profile'], 'cli')
  assert.equal(command, '/usr/bin/node /opt/dsh/bin.js --profile "my profile"')
})

test('an interpreter with no arguments is still a command', () => {
  assert.equal(relaunchCommand('/usr/bin/node', ['node'], 'cli'), '/usr/bin/node')
})

test('the interpreter is quoted when its own path has whitespace', () => {
  // The no-argument branch builds the command from the interpreter alone, so it
  // is the one place where quoting has to happen without any argv entry to carry
  // it — and a default Windows install lives under "Program Files".
  const command = relaunchCommand('C:\\Program Files\\nodejs\\node.exe', ['node'], 'cli')
  assert.equal(command, '"C:\\Program Files\\nodejs\\node.exe"')
})

test('the answer carries the pid, which is what a polling page watches', () => {
  const info = buildHostInfo({
    pid: 15844,
    startedAt: 1_700_000_000_000,
    execPath: '/usr/bin/node',
    argv: ['node', CLI_ENTRY],
    profileDir: '/home/me/.dsh/profiles/desktop',
  })
  assert.equal(info.pid, 15844)
  assert.equal(info.kind, 'cli')
  assert.equal(info.profileName, 'desktop')
  assert.equal(info.profileDir, '/home/me/.dsh/profiles/desktop')
  assert.equal(info.command, `/usr/bin/node ${CLI_ENTRY}`)
})

test('a windows profile path still yields a readable name', () => {
  const info = buildHostInfo({
    pid: 1,
    startedAt: 0,
    execPath: 'C:\\node.exe',
    argv: ['node', DESKTOP_ENTRY],
    profileDir: 'D:\\dsh-data\\profiles\\desktop\\',
  })
  assert.equal(info.profileName, 'desktop')
  assert.equal(info.kind, 'desktop')
  assert.equal(info.command, '')
})

test('an unknown profile directory is reported, not guessed', () => {
  const info = buildHostInfo({
    pid: 1,
    startedAt: 0,
    execPath: '/usr/bin/node',
    argv: ['node', CLI_ENTRY],
    profileDir: null,
  })
  assert.equal(info.profileDir, null)
  assert.equal(info.profileName, null)
})
