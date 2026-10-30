/**
 * Fail when the committed `lib/` is not what `src/` currently builds.
 *
 * `lib/` is committed on purpose (AGENTS.md §12): the DSH Store reviews a fixed
 * commit and refuses to run `prepare` to fill in missing runtime files, so the
 * build output has to be in the tree. The cost of that decision is exactly one
 * new way to break a release — edit `src/`, forget to rebuild, and the published
 * package runs code that no longer matches its sources. Nothing about the
 * package would look wrong; only a diff would show it.
 *
 * Written as a script rather than a YAML one-liner because the check needs three
 * different git queries and has to say WHICH files are stale. A bare
 * `git diff --exit-code` prints a diff, not a verdict, and `git status` alone
 * misses a rebuild that changed a tracked file back to its committed bytes.
 *
 * Usage: node scripts/verify-build-committed.mjs
 * Run it after `pnpm run build`; `pnpm run check` does both.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/**
 * Run git and return its stdout, or `undefined` when this is not a git checkout.
 *
 * The published tarball and any unpacked copy have no `.git`, and there the
 * question "does the commit match the build" has no answer — which is not a
 * failure. Anything else (git present but erroring) is a real failure and must
 * not be swallowed: a broken repository would otherwise read as "skipped".
 *
 * @param args - git arguments.
 * @returns stdout, or `undefined` outside a work tree.
 */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    const stderr = String(error?.stderr ?? '')
    if (/not a git repository|not a work tree/i.test(stderr)) return undefined
    console.error(`git ${args.join(' ')} failed:`)
    console.error(stderr)
    process.exit(1)
  }
}

const inside = git(['rev-parse', '--is-inside-work-tree'])
if (inside === undefined || inside.trim() !== 'true') {
  console.log('not a git work tree — skipping the committed-build check')
  process.exit(0)
}

// Compare the work tree against the INDEX, not against HEAD. In CI the two are
// the same (a fresh checkout has nothing staged), so a rebuild that differs from
// the commit still fails. Locally it lets the documented order work — build,
// `git add`, then `pnpm run check` — instead of demanding a commit before the
// check that is supposed to gate that commit.
const modified = git(['diff', '--name-status', '--', 'lib/']) ?? ''
const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'lib/']) ?? ''
const dirty = [
  ...modified.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== ''),
  ...untracked.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '').map((path) => `?? ${path}`),
]

if (dirty.length > 0) {
  console.error('lib/ on disk is not what would be committed:')
  for (const line of dirty) console.error(`  ${line}`)
  console.error('')
  console.error('lib/ is committed (AGENTS.md §12). Run `pnpm run build`, then `git add lib/`,')
  console.error('and commit it together with the sources that produced it.')
  process.exit(1)
}

console.log(`committed build check passed (${countTracked()} files under lib/)`)

/**
 * Count the tracked files under `lib/`, so a check that silently stopped looking
 * at anything (an empty pathspec, a renamed directory) is visible in the log.
 *
 * @returns the number of tracked entries.
 */
function countTracked() {
  const listing = git(['ls-files', '-z', '--', 'lib/']) ?? ''
  return listing.split('\0').filter(Boolean).length
}
