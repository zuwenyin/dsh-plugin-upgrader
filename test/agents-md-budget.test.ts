import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MAX_CHARS,
  MAX_LINES,
  checkBudget,
  measure,
  report,
  structuralProblems,
} from '../scripts/agents-md-budget.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const AGENTS_MD = resolve(here, '..', 'AGENTS.md')

/**
 * Read the real `AGENTS.md`, or skip when this checkout does not have one.
 *
 * The published tarball does not ship `AGENTS.md` (`files` in package.json
 * leaves it out), so the real-file tests have nothing to assert there. They must
 * still run in this repo — that is the whole point of the guard.
 *
 * @param t - the test context, used to skip.
 * @returns the file contents, or `undefined` after skipping.
 */
function readAgentsMd(t: TestContext): string | undefined {
  try {
    return readFileSync(AGENTS_MD, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    t.skip('AGENTS.md is not in this checkout (published tarball)')
    return undefined
  }
}

/**
 * Build a document of exactly `lineCount` short lines.
 *
 * Short on purpose: this fixture must violate the LINE limit only, so the test
 * cannot pass because the character limit happened to fire too.
 *
 * @param lineCount - how many lines to produce.
 * @returns the document, ending in a newline.
 */
function linesDoc(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => `line ${index}`).join('\n') + '\n'
}

/**
 * Build a document that is over the character limit but under the line limit.
 *
 * @param lines - how many lines to produce.
 * @param width - how many ASCII characters per line.
 * @returns the document, ending in a newline.
 */
function wideDoc(lines: number, width: number): string {
  return Array.from({ length: lines }, () => 'x'.repeat(width)).join('\n') + '\n'
}

// --- the real file -------------------------------------------------------

test('the real AGENTS.md is inside the line and character budget', (t) => {
  const text = readAgentsMd(t)
  if (text === undefined) return

  const metrics = measure(text)
  const budget = checkBudget(metrics)

  // The numbers go into the assertion message: when this goes red, the log has
  // to say HOW far over the file is, not just "expected true, got false".
  assert.deepEqual(
    budget.problems,
    [],
    `AGENTS.md is over budget at ${metrics.lines} lines / ${metrics.chars} chars ` +
      `(limits ${MAX_LINES} / ${MAX_CHARS}). Move 详证 into docs/rules/NN-*.md; ` +
      'do not delete a 判据 to make the number go down.',
  )
})

test('the real AGENTS.md gives every numbered rule its own 详证 page', (t) => {
  const text = readAgentsMd(t)
  if (text === undefined) return

  const problems = structuralProblems(text)
  assert.deepEqual(problems, [], `AGENTS.md has rules with no detail page:\n${problems.join('\n')}`)
})

// --- the two limits are independent --------------------------------------

test('a 200-line document is rejected for its line count', () => {
  const metrics = measure(linesDoc(200))
  assert.ok(metrics.lines > MAX_LINES, 'the fixture must actually exceed the line limit')
  assert.ok(metrics.chars <= MAX_CHARS, 'the fixture must stay under the character limit')

  const budget = checkBudget(metrics)
  assert.equal(budget.ok, false)
  assert.deepEqual(budget.problems, [`AGENTS.md is 200 lines; the budget is ${MAX_LINES}`])
})

test('a 9,500-character document is rejected for its character count', () => {
  const text = wideDoc(100, 95)
  const metrics = measure(text)
  assert.ok(metrics.chars > MAX_CHARS, 'the fixture must actually exceed the character limit')
  assert.ok(metrics.lines <= MAX_LINES, 'the fixture must stay under the line limit')

  const budget = checkBudget(metrics)
  assert.equal(budget.ok, false)
  assert.equal(budget.problems.length, 1, 'only the character limit was violated')
  assert.ok(
    budget.problems[0].includes(`${metrics.chars.toLocaleString('en-US')} chars`),
    `the problem must state the measured value, got: ${budget.problems[0]}`,
  )
  assert.ok(
    budget.problems[0].includes(`the budget is ${MAX_CHARS.toLocaleString('en-US')}`),
    `the problem must state the limit, got: ${budget.problems[0]}`,
  )
})

test('a document over both limits reports both problems, not just the first', () => {
  const metrics = measure(wideDoc(400, 40))
  assert.ok(metrics.lines > MAX_LINES, 'the fixture must exceed the line limit')
  assert.ok(metrics.chars > MAX_CHARS, 'the fixture must exceed the character limit too')

  const { ok, problems } = checkBudget(metrics)
  assert.equal(ok, false)
  assert.equal(problems.length, 2, 'a file can be too long and too wide at once')
  assert.match(problems[0], /lines/)
  assert.match(problems[1], /chars/)
})

// --- counting rules ------------------------------------------------------

test('a CRLF document measures the same as its LF twin', () => {
  const lf = '# t\n\n## 1. a\n\nbody\n'
  const crlf = lf.replace(/\n/g, '\r\n')
  assert.deepEqual(measure(crlf), measure(lf))
})

test('a trailing newline does not count as an extra line', () => {
  assert.equal(measure('a\nb\nc\n').lines, 3)
  assert.equal(measure('a\nb\nc').lines, 3)
})

test('a lone newline is one line, not two', () => {
  assert.equal(measure('\n').lines, 1)
  assert.equal(measure('a').lines, 1)
})

test('CJK characters count as one character each', () => {
  // Ten ideographs. Counting UTF-8 bytes would say 30; counting code points says 10.
  assert.equal(measure('一二三四五六七八九十').chars, 10)
})

test('an astral character counts once, not once per UTF-16 unit', () => {
  // U+20BB7 is a single code point that `.length` reports as 2. This is the
  // assertion that fails if `chars` is ever changed to `text.length`.
  const text = '𠮷'
  assert.equal(text.length, 2, 'the fixture must be astral, or it proves nothing')
  assert.equal(measure(text).chars, 1)
})

test('sections counts the `## ` headings only', () => {
  const text = '# title\n\n## one\n\n### sub\n\n## two\n'
  assert.equal(measure(text).sections, 2)
})

test('the token estimate is a report-only number, and CJK weighs more than ASCII', () => {
  // Not a gate — but if ASCII cost a full token each, the two documents would
  // measure the same, and the log line would be misleading.
  const ascii = measure('a'.repeat(70)).tokens
  const cjk = measure('一'.repeat(70)).tokens
  assert.ok(cjk > ascii, `70 CJK characters must outweigh 70 ASCII ones (${cjk} vs ${ascii})`)
  assert.equal(cjk, 70, 'CJK is one token per character')
})

// --- structural rule -----------------------------------------------------

test('a numbered rule with no docs/rules link is reported', () => {
  const text = '## 3. Profile manifest\n\n**不可退化。** something.\n'
  const problems = structuralProblems(text)
  assert.equal(problems.length, 1)
  assert.ok(problems[0].includes('## 3.'), `the message must be findable by heading: ${problems[0]}`)
  assert.ok(problems[0].includes('docs/rules/03-'), 'the message must name the page to add')
})

test('a numbered rule linking its own page is accepted', () => {
  const text = '## 3. Profile manifest\n\n**改之前先读** [`docs/rules/03-journal.md`](docs/rules/03-journal.md)\n'
  assert.deepEqual(structuralProblems(text), [])
})

test('a rule that links RELEASING.md is accepted, like §14 and §25', () => {
  const text = '## 14. Release\n\n**改之前先读** [`RELEASING.md`](RELEASING.md)\n'
  assert.deepEqual(structuralProblems(text), [])
})

test('a link to another rule page does not satisfy the check', () => {
  // The failure mode this catches: appending a new §27 next to §26's pointer,
  // so the section looks documented while its own narrative has nowhere to go.
  const text = '## 3. Profile manifest\n\n**改之前先读** [`docs/rules/04-boot-reload.md`](docs/rules/04-boot-reload.md)\n'
  const problems = structuralProblems(text)
  assert.equal(problems.length, 1, 'a sibling page is not this rule page')
  assert.ok(problems[0].includes('## 3.'))
})

test('a rule body stops at the next heading', () => {
  const text =
    '## 3. no page\n\nbody\n\n## 4. has one\n\n[`docs/rules/04-x.md`](docs/rules/04-x.md)\n'
  const problems = structuralProblems(text)
  assert.equal(problems.length, 1, 'only §3 lacks a page; §4 must not borrow §3 its failure')
  assert.ok(problems[0].includes('## 3.'))
})

test('unnumbered headings are not rules and are not checked', () => {
  const text = '# title\n\n## 改哪读哪\n\nno links here\n\n## 改完必须做的事\n'
  assert.deepEqual(structuralProblems(text), [])
})

// --- the message ---------------------------------------------------------

test('the report names the measured values and the limits', () => {
  const metrics = measure(linesDoc(200))
  const { problems } = checkBudget(metrics)
  const message = report(metrics, problems)

  assert.ok(message.includes('200 lines'), `the message must state the measurement: ${message}`)
  assert.ok(message.includes(`the budget is ${MAX_LINES}`), 'the message must state the limit')
  assert.ok(message.includes('docs/rules/'), 'the message must send people to the detail layer')
  assert.ok(message.includes('判据'), 'the message must name the rule layer it protects')
  assert.ok(
    /never delete a 判据/i.test(message),
    'the message must forbid shrinking the file by deleting a rule',
  )
})
