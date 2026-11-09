/**
 * Fail when `AGENTS.md` has grown past its budget.
 *
 * `AGENTS.md` is the always-loaded instruction file for this repository: the
 * harness reads it into the context of every session that touches the repo, so
 * every line in it is paid for on every single turn, by every task, whether or
 * not that task goes anywhere near the rule. That is the opposite of a wiki
 * page, and it is why the file has a hard cap rather than a guideline.
 *
 * Two things go wrong without the cap, and both already happened here:
 *
 * - The file grows one reasonable paragraph at a time. Nothing about adding a
 *   paragraph feels wrong, so nothing stops it, and 500 lines later the rules
 *   that matter are a fraction of what the model actually reads.
 * - Past roughly two hundred instruction lines, compliance drops rather than
 *   degrades gracefully: the tail of the file stops changing behaviour long
 *   before it stops costing tokens. The file gets slower and less effective at
 *   the same time, which is the one combination nobody notices in review.
 *
 * The shape that keeps it small is in the file itself: 判据 here, 详证 in
 * `docs/rules/NN-*.md`, and the rule text carries a "改之前先读" pointer to the
 * page that holds the story. Those pages are only opened when a rule is about
 * to be changed, so the incident narratives, symbol-by-symbol checks and dead
 * ends can be as long as they need to be — just not here.
 *
 * Run by `pnpm run check` (`check:agents` alone runs it standalone). It must
 * stay early in that chain: it is nearly free, and a bloated file should fail
 * before the twenty-second build, not after it.
 *
 * Usage: node scripts/verify-agents-md.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { checkBudget, measure, report, structuralProblems } from './agents-md-budget.mjs'

const root = resolve(import.meta.dirname, '..')
const path = resolve(root, 'AGENTS.md')

let text
try {
  text = readFileSync(path, 'utf8')
} catch (error) {
  // The published tarball has no AGENTS.md (`files` in package.json does not
  // include it), and there the question "is the instruction file under budget"
  // has no answer — same reasoning as the committed-build check outside a git
  // work tree. Only a missing file means that; any other read failure is real.
  if (error?.code !== 'ENOENT') {
    console.error(`could not read ${path}:`)
    console.error(String(error?.message ?? error))
    process.exit(1)
  }
  console.log('no AGENTS.md here (published tarball) — skipping the instruction-budget check')
  process.exit(0)
}

const metrics = measure(text)
const budget = checkBudget(metrics)
const problems = [...budget.problems, ...structuralProblems(text)]

if (problems.length > 0) {
  console.error(report(metrics, problems))
  process.exit(1)
}

const grouped = (value) => value.toLocaleString('en-US')
console.log(
  `AGENTS.md budget check passed (${grouped(metrics.lines)} lines, ` +
    `${grouped(metrics.chars)} chars, ~${grouped(metrics.tokens)} tokens)`,
)
