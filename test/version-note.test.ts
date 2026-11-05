import test from 'node:test'
import assert from 'node:assert/strict'

import { versionNoteOf } from '../src/client/format.ts'
import { EN, ZH } from '../src/client/copy.ts'
import type { T } from '../src/client/types.ts'

/**
 * Translate through one dictionary, so a test that expects Chinese gets Chinese
 * and a typo in a key name fails here rather than rendering the key.
 */
function translator(dict: Record<string, unknown>): T {
  return ((key: string, ...args: unknown[]): string => {
    const value = dict[key]
    if (typeof value === 'function') return String((value as (...rest: unknown[]) => string)(...args))
    if (typeof value === 'string') return value
    throw new Error(`missing copy key: ${key}`)
  }) as T
}

const zh = translator(ZH as unknown as Record<string, unknown>)
const en = translator(EN as unknown as Record<string, unknown>)

/**
 * Why these strings matter.
 *
 * The host reports a few version problems as fixed English sentences, and the
 * row used to show them verbatim — so the five most common "why is this row
 * blank" states were English-only in a Chinese UI, which breaks the repository's
 * own rule that user-facing text goes through `copy.ts`. Anything not on this
 * list has to survive untouched: a registry error is the only clue in the row.
 */

test('nothing wrong means nothing to say', () => {
  assert.equal(versionNoteOf(undefined, zh), undefined)
  // The host sends `''` rather than omitting the field when it has nothing.
  assert.equal(versionNoteOf('', zh), undefined)
})

test('a package the profile does not manage is not called a path install', () => {
  // The row used to fall back to "installed from a local path" for every kind of
  // unmanaged bundle, including ones installed from the registry.
  assert.equal(versionNoteOf('not a profile-managed package', zh), ZH.sourcePath)
  assert.equal(versionNoteOf('not a profile-managed package', en), EN.sourcePath)
})

test('the two local-path problems are told apart', () => {
  /*
   * They are different answers to the same question. "the registry has no
   * published copy" means the name is not on npm at all; "the version comes from
   * the directory" means it is, but the installed copy is not that one-looking
   * at the registry would answer the wrong question.
   */
  assert.equal(versionNoteOf('local path install: the registry has no published copy', zh), ZH.pathNoPublished)
  assert.equal(
    versionNoteOf('local path install: the version comes from the directory, not the registry', zh),
    ZH.pathFromDirectory,
  )
  assert.notEqual(ZH.pathNoPublished, ZH.pathFromDirectory)
})

test('a failed lookup is translated but keeps its original in the row', () => {
  // The translated sentence is only the label; `PluginRow` still renders the raw
  // `failure` under the retry banner, so the cause is never lost.
  assert.equal(versionNoteOf('registry lookup failed', zh), ZH.registryLookupFailed)
})

test('a non-registry install names its kind inside the sentence', () => {
  const text = versionNoteOf('git source: no registry history', zh)
  assert.equal(text, (ZH.noRegistryHistory as (kind: string) => string)('git'))
  assert.match(text as string, /git/)
  // A kind that does not parse as a single lowercase word is not this sentence.
  assert.equal(versionNoteOf('My Kind source: no registry history', zh), 'My Kind source: no registry history')
})

test('anything unrecognised is passed through word for word', () => {
  /*
   * This is the load-bearing half. A registry timeout, an HTTP status, a GitHub
   * rate limit — the exact wording is what someone greps for and what the retry
   * regex matches on. Rewriting it into a friendly sentence would hide the only
   * fact the row has.
   */
  const raw = 'registry unreachable: fetch failed (ECONNREFUSED)'
  assert.equal(versionNoteOf(raw, zh), raw)
  assert.equal(versionNoteOf('registry 500 while fetching packument', en), 'registry 500 while fetching packument')
})

test('the translations are actually translated', () => {
  // A key that exists in both dictionaries but was filled with the English text
  // in the Chinese one would pass every other test here.
  assert.notEqual(ZH.pathNoPublished, EN.pathNoPublished)
  assert.notEqual(ZH.pathFromDirectory, EN.pathFromDirectory)
  assert.notEqual(ZH.registryLookupFailed, EN.registryLookupFailed)
})
