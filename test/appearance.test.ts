import test from 'node:test'
import assert from 'node:assert/strict'

import { isAppearancePackage, replacedAppearance } from '../src/client/hooks.ts'

test('appearance plugins are recognised by name', () => {
  // The plugins a normal profile actually installs.
  assert.equal(isAppearancePackage('dsh-dream-skin'), true)
  assert.equal(isAppearancePackage('dsh-dream-skin'), true)
  assert.equal(isAppearancePackage('@smalltailqwq/dsh-client-ui-skin-maid-atelier'), true)
  // Official theme rows too.
  assert.equal(isAppearancePackage('@deepseek-ai/dsh-client-ui-theme'), true)
})

test('ordinary plugins are not mistaken for appearance plugins', () => {
  // "skin" and "theme" appear inside longer words that mean something else.
  assert.equal(isAppearancePackage('dsh-context'), false)
  assert.equal(isAppearancePackage('billion-context'), false)
  assert.equal(isAppearancePackage('dshmarket'), false)
  assert.equal(isAppearancePackage('@linxin666/dsh-pet'), false)
  assert.equal(isAppearancePackage('dsh-connect-workbuddy'), false)
  assert.equal(isAppearancePackage('@windypro-rourou/dsh-code-studio'), false)
  // A hyphenated compound that happens to contain "skin" as a substring only.
  assert.equal(isAppearancePackage('dsh-askinning'), false)
})

test('only a step that actually replaced an appearance plugin asks for a reload', () => {
  assert.equal(replacedAppearance([{ name: 'dsh-dream-skin', ok: true, changed: true }]), true)
  // A failed step never unloaded the stylesheet.
  assert.equal(replacedAppearance([{ name: 'dsh-dream-skin', ok: false, changed: true }]), false)
  // A step that changed nothing did not replace the package either.
  assert.equal(replacedAppearance([{ name: 'dsh-dream-skin', ok: true, changed: false }]), false)
  // An ordinary plugin upgrading must not throw the page away.
  assert.equal(replacedAppearance([{ name: 'dsh-context', ok: true, changed: true }]), false)
  assert.equal(replacedAppearance([]), false)
  assert.equal(replacedAppearance(undefined), false)
})

test('one appearance step in a mixed batch is enough', () => {
  const results = [
    { name: 'dsh-context', ok: true, changed: true },
    { name: 'dsh-dream-skin', ok: true, changed: true },
  ]
  assert.equal(replacedAppearance(results), true)
})
