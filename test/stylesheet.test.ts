import test from 'node:test'
import assert from 'node:assert/strict'

import { CSS } from '../src/client/styles.ts'

/** One `selector { body }` pair of the sheet. */
interface Rule {
  selector: string
  body: string
}

/**
 * Split the sheet into rules.
 *
 * A body is matched only up to the next brace, so a rule nested in `@media` or
 * `@keyframes` still comes back on its own — the outer at-rule block is skipped
 * because its own body then contains braces.
 *
 * @returns every rule of the sheet, in source order.
 */
const rules = (): Rule[] => {
  const out: Rule[] = []
  for (const match of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: match[1]!.trim(), body: match[2]!.trim() })
  }
  return out
}

/** The rule for an exact selector, or undefined. */
const ruleFor = (selector: string): Rule | undefined =>
  rules().find(rule => rule.selector === selector)

test('each layer gets an opaque surface with the host token as fallback', () => {
  // The skin publishes `…-layer-src-N` only while it is washing the page; with
  // no skin active the plain host token is what the surface has always used.
  for (const layer of [1, 2, 3]) {
    assert.ok(
      CSS.includes(
        `--dsh-pu-surface-${layer}: var(--dsh-dream-skin-layer-src-${layer}, var(--dsw-alias-bg-layer-${layer}));`,
      ),
      `surface-${layer} does not fall back to the host layer token`,
    )
  }
  // A fill with no skin is 100%, which is the opaque declaration on its own.
  assert.ok(CSS.includes('--dsh-pu-surface-fill: var(--dsh-dream-skin-modal-fill, 100%);'))
})

test('no surface paints straight from a token a skin is allowed to thin', () => {
  // This is the defect: a wallpaper skin repaints these as
  // `color-mix(… <page-fill>%, transparent)`, and a page fill of 0% leaves the
  // dialog floating with no surface at all.
  assert.equal(
    CSS.includes('background: var(--dsw-alias-bg-layer-'),
    false,
    'a background reads the layer token directly instead of the opaque surface',
  )
})

test('every surface keeps its opaque base under the fill mix', () => {
  // The plain declaration is the fallback for a browser without color-mix; the
  // mix then applies the skin's dialog opacity on top of an opaque colour.
  for (const rule of rules()) {
    for (const use of rule.body.matchAll(/background: var\(--dsh-pu-surface-(\d)\);/g)) {
      const layer = use[1]
      assert.ok(
        rule.body.includes(
          `background: color-mix(in srgb, var(--dsh-pu-surface-${layer}) var(--dsh-pu-surface-fill), transparent);`,
        ),
        `${rule.selector} paints surface-${layer} without the fill mix`,
      )
    }
  }
})

test('the dialog and its rows are among the rescued surfaces', () => {
  // Both modals (换源 and 重启) share these classes, so covering them here
  // covers both dialogs.
  for (const selector of [
    '.dsh-pu-modal-body',
    '.dsh-pu-src-row',
    '.dsh-pu-src-input',
    '.dsh-pu-banner',
  ]) {
    const rule = ruleFor(selector)
    assert.ok(rule !== undefined, `${selector} has no rule`)
    assert.ok(
      rule!.body.includes('var(--dsh-pu-surface-'),
      `${selector} still paints from the washable layer token`,
    )
  }
})

test('the row in use is highlighted over a surface, not over nothing', () => {
  const rule = ruleFor('.dsh-pu-src-row.is-active')
  assert.ok(rule !== undefined, 'the active row has no rule')
  // "9% brand over transparent" was the old value: the tint had no surface
  // under it, so the row in use read as washed out rather than emphasized.
  assert.ok(rule!.body.includes('9%, transparent') === false)
  assert.ok(
    rule!.body.includes(
      'background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, var(--dsh-pu-surface-2));',
    ),
  )
})
