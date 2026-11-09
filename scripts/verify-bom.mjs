/**
 * Fail when a committed file starts with a UTF-8 byte order mark.
 *
 * A BOM is legal UTF-8 and invisible everywhere a human looks: every editor
 * hides it, `git diff` does not show it, and the file reads normally through
 * anything that strips it. The damage only appears at the one program that does
 * not strip it — `JSON.parse` throws, and the error names the *second* character
 * of the file, so the message ("Unexpected token ...") does not even say "BOM".
 *
 * That is exactly how this repository broke itself: a `package.json` written by a
 * tool that adds a BOM made the profile refuse to load the linked plugin, the
 * version tab disappeared, and the page reported nothing at all. Finding it meant
 * reading `dsh: warning: Cannot validate installed package ...` in a pnpm log and
 * decoding the mojibake back into `EF BB BF 7B`.
 *
 * So the check does not rely on remembering. It looks at the bytes.
 *
 * Which files: everything git tracks or would track (untracked-but-not-ignored
 * included, so a bad file is caught before it is committed), minus anything that
 * looks binary.
 *
 * Usage: node scripts/verify-bom.mjs
 * `pnpm run check` runs it.
 */
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'

import { SAMPLE_BYTES, bomsIn } from './bom.mjs'

const root = resolve(import.meta.dirname, '..')

/**
 * Run git and return its stdout, or `undefined` when this is not a git checkout.
 *
 * The published tarball has no `.git`, and there the question cannot be asked —
 * which is not a failure. A repository that errors for any other reason is a
 * real failure and must not read as "skipped".
 *
 * @param args - git arguments.
 * @returns stdout, or `undefined` outside a work tree.
 */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    })
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
  console.log('not a git work tree — skipping the byte order mark check')
  process.exit(0)
}

/*
 * `--cached --others --exclude-standard` is tracked plus untracked-and-not-ignored.
 * `-z` because a path may contain a newline; splitting on anything else would
 * silently skip the file it could not represent.
 */
const listing = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']) ?? ''
const paths = listing.split('\0').filter((path) => path !== '')

/**
 * Read a file's first bytes.
 *
 * Synchronous on purpose: an async walk over every tracked file buys nothing and
 * makes the failure ordering harder to read.
 *
 * Only the "this file cannot be read right now" cases are treated as empty — a
 * tracked file deleted from the work tree is `git status`'s problem, not this
 * check's. Anything else is rethrown, because a check that swallows a programming
 * error reports a clean tree it never looked at. That is not hypothetical: an
 * undefined sample size once made this script read zero bytes from every file and
 * still print `passed (0 text files)`.
 *
 * @param path - absolute path.
 * @returns the bytes actually read, or an empty buffer when the file is gone.
 */
function head(path) {
  let handle
  try {
    handle = openSync(path, 'r')
  } catch (error) {
    const code = error?.code
    if (code === 'ENOENT' || code === 'EISDIR' || code === 'EACCES' || code === 'EPERM') {
      return Buffer.alloc(0)
    }
    throw error
  }
  try {
    const buffer = Buffer.alloc(SAMPLE_BYTES)
    const read = readSync(handle, buffer, 0, SAMPLE_BYTES, 0)
    return buffer.subarray(0, read)
  } finally {
    closeSync(handle)
  }
}

const samples = paths.map((path) => [path, head(resolve(root, path))])
const damaged = bomsIn(samples)
const scanned = samples.filter(([, sample]) => sample.length > 0 && !sample.includes(0)).length

if (damaged.length > 0) {
  console.error('files start with a UTF-8 byte order mark (EF BB BF):')
  for (const path of damaged) console.error(`  ${path}`)
  console.error('')
  console.error('A BOM is invisible in editors and in git diff, but `JSON.parse` throws on it,')
  console.error('and the error names the wrong character — see the package.json incident behind')
  console.error('this check. Rewrite the file without the mark:')
  console.error('')
  console.error('  node scripts/strip-bom.mjs <files>')
  console.error('')
  process.exit(1)
}

console.log(`byte order mark check passed (${scanned} text files)`)
