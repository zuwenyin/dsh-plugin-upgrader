/**
 * Verify what `pnpm pack` would actually publish.
 *
 * Written as a script rather than a shell one-liner because both previous
 * inline attempts produced false readings: the first ran a regex over text that
 * was not there, and the second parsed a stream the shell had mixed with
 * stderr. A release gate has to be unambiguous.
 *
 * Usage: node scripts/verify-pack.mjs
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pnpm = resolve(process.env.DSH_PNPM ?? 'D:/dsh-data/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs')

let stdout
try {
  stdout = execFileSync(process.execPath, [pnpm, 'pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  console.error('pnpm pack failed')
  console.error(String(error.stdout ?? ''))
  console.error(String(error.stderr ?? ''))
  process.exit(1)
}

/**
 * Pull the tarball report out of pnpm's stdout.
 *
 * `pnpm pack --json` is not guaranteed to be a bare JSON document: the install
 * preparation it runs first can print its own lines, and a script that assumes
 * otherwise crashes on someone else's output. Scan for the object that carries
 * `filename`, which is the one field every report has.
 *
 * @param text - the process's stdout.
 * @returns the parsed report.
 */
function parseReport(text) {
  const candidates = []
  for (let index = text.indexOf('{'); index !== -1; index = text.indexOf('{', index + 1)) {
    // Try the shortest balanced object first; the report is small.
    let depth = 0
    let inString = false
    let escaped = false
    for (let cursor = index; cursor < text.length; cursor += 1) {
      const char = text[cursor]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          candidates.push(text.slice(index, cursor + 1))
          break
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate)
      const record = Array.isArray(value) ? value[0] : value
      if (record !== null && typeof record === 'object' && typeof record.filename === 'string') return record
    } catch {
      // Not the report; keep looking.
    }
  }
  return undefined
}

const report = parseReport(stdout)
if (report === undefined) {
  console.error('could not find a tarball report in pnpm output:')
  console.error(stdout.slice(0, 2000))
  process.exit(1)
}

console.log(`filename:  ${report.filename}`)
console.log(`files:     ${report.files.length}`)

// pnpm lists `{ path }` only — no sizes — so the check is by path alone.
const shipped = new Set(report.files.map((file) => file.path))

const REQUIRED = [
  'lib/client.js',
  'lib/index.js',
  'lib/host/install.js',
  'lib/host/registry.js',
  'cordis.patch.yml',
  'assets/icon.svg',
  'package.json',
  'README.md',
  'LICENSE',
]
let missing = 0
console.log('\nrequired files:')
for (const path of REQUIRED) {
  if (shipped.has(path)) {
    console.log(`  ok       ${path}`)
  } else {
    console.log(`  MISSING  ${path}`)
    missing += 1
  }
}

// Source and test files must never ship: they are not read at runtime.
const leaked = [...shipped].filter(
  (path) => path.startsWith('src/') || path.startsWith('test/') || path.startsWith('scripts/'),
)
if (leaked.length > 0) {
  console.log('\nunexpected files that should not ship:')
  for (const path of leaked.slice(0, 10)) console.log(`  ${path}`)
  missing += leaked.length
}

if (missing > 0) {
  console.error(`\npack check FAILED (${missing} problem(s))`)
  process.exit(1)
}
console.log('\npack check passed')
