import test from 'node:test'
import assert from 'node:assert/strict'

import { EN, ZH } from '../src/client/copy.ts'

/**
 * Every string this bundle shows goes through one dictionary pair, and a key
 * that exists in only one of them renders as the key itself — a literal
 * `restartOpen` in the banner. Nothing else catches that: the dictionaries are
 * typed as `Record<string, CopyValue>`, so a missing key is not a type error.
 */
test('both languages define exactly the same keys', () => {
  const zh = new Set(Object.keys(ZH))
  const en = new Set(Object.keys(EN))
  const missingFromEn = [...zh].filter((key) => !en.has(key))
  const missingFromZh = [...en].filter((key) => !zh.has(key))
  assert.deepEqual(missingFromEn, [], `EN is missing: ${missingFromEn.join(', ')}`)
  assert.deepEqual(missingFromZh, [], `ZH is missing: ${missingFromZh.join(', ')}`)
})

test('no string is left empty in either language', () => {
  for (const [name, dict] of [
    ['ZH', ZH],
    ['EN', EN],
  ] as const) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string') continue
      assert.ok(value.trim() !== '', `${name}.${key} is empty`)
    }
  }
})

test('the restart dialog explains itself instead of promising a button that cannot work', () => {
  // The body must not claim the page restarts the host: it cannot.
  assert.match(ZH.restartBody as string, /不能/)
  assert.match(EN.restartBody as string, /cannot/)
  // Both the desktop and the cli route have an instruction of their own.
  assert.ok((ZH.restartDesktopHint as string).length > 0)
  assert.ok((EN.restartDesktopHint as string).length > 0)
})
