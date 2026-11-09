/**
 * The size budget for `AGENTS.md`, as pure functions.
 *
 * `AGENTS.md` is not documentation: the harness loads it into the context of
 * every session that touches this repo. Its length is therefore a per-session
 * cost, and past a few hundred instruction lines the rules themselves start to
 * lose weight — the file still gets read, but the tail of it stops changing
 * behaviour. The repo's arrangement follows from that: the rules ("判据") live
 * here, the long-form reasoning ("详证") lives in `docs/rules/NN-*.md`, which
 * are only opened when a rule is about to be changed.
 *
 * That arrangement only survives if something fails when the bloat returns, so
 * this module measures the file and `scripts/verify-agents-md.mjs` (its only
 * caller) fails `pnpm run check` when the measurement is over budget.
 *
 * Why a module rather than a script: the counting rules ARE the value here —
 * code points versus UTF-16 units, CRLF versus LF, a trailing newline that must
 * not become an extra line — and a hand-rolled `wc -l` got each of those wrong
 * at some point. They are unit-tested in `test/agents-md-budget.test.ts`, which
 * is only possible because nothing in this file touches the filesystem or
 * `process`: decoding is the caller's job.
 */

/** The hard line budget for `AGENTS.md`. */
export const MAX_LINES = 160

/** The hard character budget for `AGENTS.md`, counted in Unicode code points. */
export const MAX_CHARS = 9000

/**
 * Non-CJK code points per token, for the rough estimate only.
 *
 * English prose runs about 3.5 characters per token; CJK runs about one token
 * per character, which is handled by counting those code points at weight 1.
 */
const CHARS_PER_TOKEN = 3.5

/**
 * The code point ranges that count as CJK in the token estimate.
 *
 * This is a coarse union of the blocks a Chinese/Japanese/Korean document
 * actually uses, not a full Unicode script property. The estimate is never a
 * gate, so approximate is fine — but it must not drift into "counts every
 * character as one token", which would make an all-Latin file look tiny.
 */
const CJK_RANGES = [
  [0x2e80, 0x2fdf], // CJK Radicals Supplement, Kangxi Radicals
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3040, 0x30ff], // Hiragana, Katakana
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xac00, 0xd7af], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
  [0x20000, 0x3ffff], // CJK Unified Ideographs Extensions B and later
]

/** Any Unicode whitespace, so the token estimate can skip it. */
const WHITESPACE = /\s/u

/** The heading that opens a numbered rule, e.g. `## 7. 慢的时候必须看得见在干什么`. */
const RULE_HEADING = /^## (\d+)\.\s*(.*)$/

/** A heading that ends the previous section's body. `###` subheadings do not. */
const SECTION_END = /^#{1,2} /

/**
 * Group thousands so the numbers in the messages are readable.
 *
 * Fixed to `en-US` on purpose: the CI logs and the failure text must be
 * byte-identical everywhere, and the default locale is whatever the machine
 * happens to have.
 *
 * @param value - a non-negative integer.
 * @returns the number with `,` separators.
 */
function group(value) {
  return value.toLocaleString('en-US')
}

/**
 * Whether a code point belongs to one of {@link CJK_RANGES}.
 *
 * @param codePoint - a Unicode code point value.
 * @returns true for CJK punctuation, kana, hangul and ideographs.
 */
function isCjk(codePoint) {
  return CJK_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)
}

/**
 * Measure a document against the budget's counting rules.
 *
 * The rules, and why each one is a rule:
 *
 * - Line endings are normalized first: a CRLF checkout must measure the same as
 *   its LF twin, or the check would fail on Windows for every file.
 * - `chars` counts Unicode code points, not UTF-16 units, so an astral
 *   character costs 1 and a CJK character costs 1 rather than 1 or 2 by luck.
 * - `lines` does not invent a line for the final newline: a 3-line file ending
 *   in `\n` has 3 lines, not 4.
 * - `tokens` is a rough estimate for the log line only. It is never a gate and
 *   must never become one: the tokenizer the model actually uses is not this
 *   function.
 *
 * @param text - the document, already decoded to a string.
 * @returns `{ lines, chars, tokens, sections }`.
 */
export function measure(text) {
  const normalized = text.replace(/\r\n/g, '\n')

  const parts = normalized.split('\n')
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()

  const codePoints = [...normalized]
  let cjk = 0
  let other = 0
  for (const character of codePoints) {
    if (WHITESPACE.test(character)) continue
    if (isCjk(character.codePointAt(0) ?? 0)) cjk += 1
    else other += 1
  }

  return {
    lines: parts.length,
    chars: codePoints.length,
    tokens: Math.round(cjk + other / CHARS_PER_TOKEN),
    sections: (normalized.match(/^## /gm) ?? []).length,
  }
}

/**
 * Compare a measurement against the two limits.
 *
 * The limits are independent and every violation is reported, because a single
 * "too big" verdict makes people shave the number that is easiest to shave
 * rather than the prose that is actually too long.
 *
 * @param metrics - the result of {@link measure}.
 * @returns `{ ok, problems }`, one `problems` entry per violated limit.
 */
export function checkBudget(metrics) {
  const problems = []
  if (metrics.lines > MAX_LINES) {
    problems.push(`AGENTS.md is ${group(metrics.lines)} lines; the budget is ${group(MAX_LINES)}`)
  }
  if (metrics.chars > MAX_CHARS) {
    problems.push(`AGENTS.md is ${group(metrics.chars)} chars; the budget is ${group(MAX_CHARS)}`)
  }
  return { ok: problems.length === 0, problems }
}

/**
 * Find numbered rules that have no long-form page to point at.
 *
 * The budget is only half the guard. The other half is the shape that keeps the
 * file small in the first place: every `## N.` rule carries a link to its own
 * `docs/rules/NN-*.md` page (or to `RELEASING.md`, where §14 and §25 keep their
 * 详证). A rule added without one has nowhere to push its prose later, so the
 * prose ends up back in `AGENTS.md` — this is what turns that into a failure at
 * the moment the rule is added rather than a year later.
 *
 * A link to a DIFFERENT rule's page does not count: that is how a new §27 ends
 * up looking documented while its own narrative is missing.
 *
 * @param text - the document, already decoded to a string.
 * @returns one message per numbered rule that has no page of its own.
 */
export function structuralProblems(text) {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const problems = []

  for (let index = 0; index < lines.length; index += 1) {
    const heading = RULE_HEADING.exec(lines[index])
    if (heading === null) continue

    const [, number, title] = heading
    let end = index + 1
    while (end < lines.length && !SECTION_END.test(lines[end])) end += 1
    const body = lines.slice(index + 1, end).join('\n')

    // Two-digit zero padding is the repo's file naming (`07-progress.md`), but
    // a page named `7-progress.md` still points somewhere, so accept both.
    const ownPage = new RegExp(`\\]\\([^)]*docs/rules/0*${number}-`)
    if (!ownPage.test(body) && !/\]\([^)]*RELEASING\.md/.test(body)) {
      problems.push(
        `\`## ${number}. ${title.trim()}\` has no 详证 page of its own — ` +
          `add \`docs/rules/${String(number).padStart(2, '0')}-<slug>.md\` ` +
          `(or link \`RELEASING.md\`) and point at it from inside the section`,
      )
    }

    index = end - 1
  }

  return problems
}

/**
 * Format the failure message for one failing run.
 *
 * Kept apart from `verify-agents-md.mjs` so the message can be asserted on: the
 * message IS the deliverable here, because the person who sees it is the person
 * who just made `pnpm run check` red and has no idea what the file is for.
 *
 * Only called with at least one problem; the caller never prints it on success.
 *
 * @param metrics - the result of {@link measure}.
 * @param problems - the combined verdict from {@link checkBudget} and
 *   {@link structuralProblems}.
 * @returns the multi-line message, without a trailing newline.
 */
export function report(metrics, problems) {
  return [
    'AGENTS.md failed the instruction budget.',
    '',
    `  measured: ${group(metrics.lines)} lines, ${group(metrics.chars)} chars, ` +
      `~${group(metrics.tokens)} tokens, ${group(metrics.sections)} sections`,
    `  budget:   ${group(MAX_LINES)} lines, ${group(MAX_CHARS)} chars`,
    '',
    'Problems:',
    ...problems.map((problem) => `  - ${problem}`),
    '',
    'How to get under the budget without losing a rule:',
    '',
    '  1. Move the 详证 out: the incident narrative, the line-by-line symbol',
    '     checks, the "what people got wrong before" — all of it goes into the',
    '     matching docs/rules/NN-*.md page (or RELEASING.md where that page',
    '     already exists). Those pages are not loaded into every session, so',
    '     there the prose is free.',
    '  2. Keep only the 判据 here: what must not regress, the symbols involved,',
    '     the tests that guard it, and the one-line "改之前先读" pointer.',
    '  3. Never delete a 判据 to make the number go down. Every rule in this',
    '     file was already a bug that happened twice; a rule that is gone from',
    '     here is a rule that comes back.',
    '',
    'Every numbered rule also needs its own docs/rules/NN-*.md page, added in',
    'the same change as the rule.',
  ].join('\n')
}
