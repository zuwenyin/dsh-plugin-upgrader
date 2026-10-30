import test from 'node:test'
import assert from 'node:assert/strict'

import { offeredRegistries, WELL_KNOWN_REGISTRIES } from '../src/client/registry.ts'

test('the picker always offers the official registry and the mainland mirror', () => {
  /*
   * The issue this feature answers is "I want the mainland mirror without
   * asking an AI to edit a file". Requiring the user to type the address would
   * answer it only for people who already knew the URL.
   */
  assert.deepEqual(WELL_KNOWN_REGISTRIES, ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'])
  const offered = offeredRegistries([...WELL_KNOWN_REGISTRIES])
  assert.ok(offered.includes('https://registry.npmmirror.com/'))
  assert.ok(offered.includes('https://registry.npmjs.org/'))
})

test('the picker offers each registry once, in the order given', () => {
  /*
   * The active address and the manager's own registry are usually the same
   * source spelled with and without a trailing slash. Listing both would read
   * as two sources that do the same thing.
   */
  const offered = offeredRegistries([
    'https://registry.npmmirror.com',
    'https://registry.npmmirror.com/',
    'https://registry.npmjs.org/',
    null,
    undefined,
    '',
  ])
  assert.deepEqual(offered, ['https://registry.npmmirror.com/', 'https://registry.npmjs.org/'])
})

test('every offered address ends in a slash', () => {
  /*
   * The manager joins `base` and a package name with `/`. An address without
   * the slash still works there, but the same address saved from this picker
   * must not be the one spelling the manager has to repair.
   */
  assert.deepEqual(offeredRegistries(['http://npm.internal:4873', 'https://registry.npmjs.org/']), [
    'http://npm.internal:4873/',
    'https://registry.npmjs.org/',
  ])
})

test('the picker never invents an address', () => {
  assert.deepEqual(offeredRegistries([]), [])
  assert.deepEqual(offeredRegistries([null, undefined, '  ']), [])
})

test('case and slashes do not make two entries out of one registry', () => {
  assert.deepEqual(offeredRegistries(['HTTPS://Registry.NPMJS.org', 'https://registry.npmjs.org/']), [
    'HTTPS://Registry.NPMJS.org/',
  ])
})
