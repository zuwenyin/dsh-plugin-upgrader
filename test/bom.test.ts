import test from 'node:test'
import assert from 'node:assert/strict'

import { BOM_BYTES, SAMPLE_BYTES, bomsIn, looksTextual, startsWithBom } from '../scripts/bom.mjs'

/**
 * Bytes of a sample.
 *
 * Written out rather than using `Buffer.from(text)` so a test can build a sample
 * that is not valid text at all — which is the point of several cases below.
 *
 * @param values - byte values.
 * @returns a plain array, the loosest thing `startsWithBom` accepts.
 */
function bytes(...values: number[]): number[] {
  return values
}

/** The mark itself, as bytes. */
const BOM = bytes(0xef, 0xbb, 0xbf)

/**
 * The mark followed by `text`, as UTF-8 bytes.
 *
 * @param text - ASCII payload, so one byte per character.
 * @returns the sample.
 */
function withBom(text: string): number[] {
  return [...BOM, ...Array.from(text, (char) => char.charCodeAt(0))]
}

// --- recognising the mark ------------------------------------------------

test('the mark at the front is a mark', () => {
  assert.equal(startsWithBom(withBom('{"a":1}')), true)
})

test('the mark alone at the very end of the sample is still a mark', () => {
  // Three bytes is the minimum: a file whose entire content is the mark.
  assert.equal(startsWithBom(BOM), true)
})

test('two bytes of the mark are not the mark', () => {
  // This is the off-by-one that would make the check silently useless.
  assert.equal(startsWithBom(bytes(0xef, 0xbb)), false)
})

test('the mark somewhere later in the file is not a mark', () => {
  assert.equal(startsWithBom(withBom('x').slice(1)), false, 'the sample starts with the mark now')
  assert.equal(startsWithBom(bytes(0x7b, 0xef, 0xbb, 0xbf)), false)
})

test('a mark-like start that differs in one byte is not the mark', () => {
  assert.equal(startsWithBom(bytes(0xef, 0xbb, 0xbe)), false, 'U+FEFF encoded differently is not this')
  assert.equal(startsWithBom(bytes(0xef, 0xba, 0xbf)), false)
  assert.equal(startsWithBom(bytes(0xee, 0xbb, 0xbf)), false)
})

test('mojibake of the mark is not the mark', () => {
  /*
   * What the pnpm log actually held: the mark read as GBK and then re-encoded,
   * which is three different bytes. The check must not accept the damage it is
   * supposed to prevent.
   */
  assert.equal(startsWithBom([0xe9, 0x8d, 0xa8]), false)
})

test('an empty sample is not a mark', () => {
  assert.equal(startsWithBom(bytes()), false)
  assert.equal(startsWithBom(undefined), false)
  assert.equal(startsWithBom(null), false)
})

test('a typed array works as well as a plain array', () => {
  assert.equal(startsWithBom(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b])), true)
  assert.equal(startsWithBom(new Uint8Array([0x7b])), false)
})

// --- telling text from binary -------------------------------------------

test('a sample with no NUL byte is text', () => {
  assert.equal(looksTextual(withBom('{"a":1}')), true)
  assert.equal(looksTextual(bytes()), true, 'an empty file is not binary, it is empty')
})

test('a sample with a NUL byte is binary', () => {
  assert.equal(looksTextual(bytes(0x50, 0x4b, 0x00, 0x01)), false, 'a ZIP header is not text')
})

test('a NUL byte anywhere in the sample is enough', () => {
  const sample = [...Array.from({ length: 64 }, () => 0x61), 0x00]
  assert.equal(looksTextual(sample), false)
})

test('undefined and null are not text', () => {
  assert.equal(looksTextual(undefined), false)
  assert.equal(looksTextual(null), false)
})

// --- scanning a set of files --------------------------------------------

test('only the files that start with the mark are reported', () => {
  const found = bomsIn([
    ['clean.ts', bytes(0x65, 0x78, 0x70)],
    ['damaged.json', withBom('{}')],
    ['also-clean.md', bytes(0x23, 0x20)],
  ])
  assert.deepEqual(found, ['damaged.json'])
})

test('the order of the report matches the order given', () => {
  const found = bomsIn([
    ['a.json', withBom('{}')],
    ['b.json', bytes(0x7b)],
    ['c.json', withBom('{}')],
  ])
  assert.deepEqual(found, ['a.json', 'c.json'])
})

test('a binary file that happens to start with the mark is not reported', () => {
  /*
   * A real case: several binary formats carry a BOM as part of their header, and
   * reporting those would make the check unusable on any repository with assets.
   */
  const found = bomsIn([['icon.png', [...BOM, 0x00, 0x50]]])
  assert.deepEqual(found, [], 'a binary file is skipped before the mark is considered')
})

test('an empty or unreadable file is not reported', () => {
  const found = bomsIn([
    ['gone.ts', bytes()],
    ['empty.ts', bytes()],
  ])
  assert.deepEqual(found, [])
})

test('a clean set reports nothing, not an empty string', () => {
  const found = bomsIn([['a.ts', bytes(0x61)], ['b.ts', bytes(0x62)]])
  assert.deepEqual(found, [])
  assert.equal(found.length, 0)
})

test('an empty set reports nothing', () => {
  assert.deepEqual(bomsIn([]), [])
})

test('the sample size is large enough to reach a NUL byte in a small binary', () => {
  // The constant exists so this reasoning is stated once: 4 KiB is the same
  // window git uses, and a smaller one would read a real binary as text.
  assert.ok(SAMPLE_BYTES >= 4096, `the sample must be at least 4 KiB, got ${SAMPLE_BYTES}`)
})

test('the exported mark is the three bytes a BOM is', () => {
  assert.deepEqual([...BOM_BYTES], [0xef, 0xbb, 0xbf])
})
