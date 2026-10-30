import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addSource,
  comparisonKey,
  editSource,
  isBuiltinRegistry,
  isRegistryAddress,
  offeredRegistries,
  removeSource,
  WELL_KNOWN_REGISTRIES,
} from '../src/client/registry.ts'

test('the built-in sources are the official registry and the mainland mirror', () => {
  /*
   * Same list the tab has always offered. They are the two the manager itself
   * treats as public, so a source list that started anywhere else would be
   * surprising on a fresh machine.
   */
  assert.deepEqual(WELL_KNOWN_REGISTRIES, ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'])
})

test('the built-in sources are recognized however they are spelled', () => {
  /*
   * This predicate is what keeps the dialog from offering edit and delete on a
   * built-in row: the row is not "disabled", those addresses simply are never
   * part of the editable list. A spelling that slipped past it would hand the
   * user a delete button for a source that cannot be deleted.
   */
  assert.equal(isBuiltinRegistry('https://registry.npmjs.org/'), true)
  assert.equal(isBuiltinRegistry('https://registry.npmjs.org'), true)
  assert.equal(isBuiltinRegistry('HTTPS://Registry.NPMJS.org'), true)
  assert.equal(isBuiltinRegistry('https://registry.example.com/'), false)
})

test('a custom source can be added, and is stored with one trailing slash', () => {
  assert.deepEqual(addSource([], 'https://registry.example.com'), ['https://registry.example.com/'])
  assert.deepEqual(addSource([], '  https://registry.example.com/  '), ['https://registry.example.com/'])
  assert.deepEqual(addSource(['https://a.example.com/'], 'http://npm.internal:4873'), [
    'https://a.example.com/',
    'http://npm.internal:4873/',
  ])
})

test('adding refuses what is not an address, what is built in, and what is already there', () => {
  /*
   * All four refusals matter: the first two would store something the host
   * rejects (schemastery validates every element, so one bad entry fails the
   * whole write), and the last two would list the same source twice.
   */
  assert.equal(addSource([], 'not a url'), undefined)
  assert.equal(addSource([], 'ftp://registry.example.com/'), undefined)
  assert.equal(addSource([], 'https://registry.npmjs.org/'), undefined)
  assert.equal(addSource(['https://a.example.com/'], 'https://A.example.com'), undefined)
})

test('editing replaces one row and leaves the rest alone', () => {
  const custom = ['https://a.example.com/', 'https://b.example.com/']
  assert.deepEqual(editSource(custom, 1, 'https://c.example.com'), [
    'https://a.example.com/',
    'https://c.example.com/',
  ])
  // Re-saving a row unchanged must be allowed; only *other* rows are duplicates.
  assert.deepEqual(editSource(custom, 0, 'https://a.example.com/'), custom)
})

test('editing refuses a stale index instead of editing the wrong row', () => {
  /*
   * The index comes from a rendered list. Another browser can remove a row
   * between the render and the click, and silently editing whatever moved into
   * that slot would corrupt a source the user never touched.
   */
  const custom = ['https://a.example.com/']
  assert.equal(editSource(custom, 3, 'https://b.example.com'), undefined)
  assert.equal(editSource(custom, -1, 'https://b.example.com'), undefined)
  assert.equal(editSource(custom, 0.5, 'https://b.example.com'), undefined)
})

test('editing refuses a duplicate of another row and a built-in address', () => {
  const custom = ['https://a.example.com/', 'https://b.example.com/']
  assert.equal(editSource(custom, 0, 'https://b.example.com'), undefined)
  assert.equal(editSource(custom, 0, 'https://registry.npmmirror.com/'), undefined)
  assert.equal(editSource(custom, 0, ''), undefined)
})

test('removing drops exactly one row', () => {
  const custom = ['https://a.example.com/', 'https://b.example.com/', 'https://c.example.com/']
  assert.deepEqual(removeSource(custom, 1), ['https://a.example.com/', 'https://c.example.com/'])
  assert.deepEqual(removeSource(custom, 2), ['https://a.example.com/', 'https://b.example.com/'])
  assert.equal(removeSource(custom, 9), undefined)
})

test('addresses are compared the way a registry would', () => {
  assert.equal(comparisonKey(' https://Registry.NPMJS.org/ '), 'https://registry.npmjs.org')
  assert.equal(comparisonKey('https://registry.npmjs.org///'), 'https://registry.npmjs.org')
})

test('only absolute http(s) addresses are registry addresses', () => {
  assert.equal(isRegistryAddress('https://registry.example.com/'), true)
  assert.equal(isRegistryAddress('http://npm.internal:4873'), true)
  assert.equal(isRegistryAddress('registry.example.com'), false)
  assert.equal(isRegistryAddress('file:///tmp/registry'), false)
  assert.equal(isRegistryAddress(''), false)
})

test('the offered list never lists one source twice', () => {
  assert.deepEqual(offeredRegistries(['https://registry.npmjs.org', 'https://registry.npmjs.org/', null, '']), [
    'https://registry.npmjs.org/',
  ])
})

test('every offered address ends in a slash', () => {
  /*
   * The manager joins `base` and a package name with `/`. An address without
   * the slash still works there, but a source saved from this dialog must not be
   * the one spelling the manager has to repair.
   */
  assert.deepEqual(offeredRegistries(['http://npm.internal:4873', 'https://registry.npmjs.org/']), [
    'http://npm.internal:4873/',
    'https://registry.npmjs.org/',
  ])
})

test('case and slashes do not make two entries out of one registry', () => {
  assert.deepEqual(offeredRegistries(['HTTPS://Registry.NPMJS.org', 'https://registry.npmjs.org/']), [
    'HTTPS://Registry.NPMJS.org/',
  ])
})
