/**
 * Print the release body for one released version.
 *
 * npm and GitHub Releases are two separate systems: pushing a `v*` tag publishes
 * the package and creates no release page at all. That is exactly how this
 * repository ended up with 15 tags and 6 releases — the release page stopped at
 * v1.2.0 while npm kept shipping to v1.6.1, and GitHub points "Latest" at the
 * newest RELEASE, not the newest tag, so the project looked abandoned at 1.2.0.
 *
 * The fix is not "remember to run `gh release create`": a manual step that
 * nothing checks is the bug. `publish.yml` runs this script for the tag being
 * published and feeds the output to `gh release`, so a release page cannot be
 * forgotten again.
 *
 * Two sources, in order:
 *
 * 1. `release-notes/<version>.md`, when it exists. This is the place for notes
 *    written for people rather than for a diff — the existing release pages are
 *    Chinese prose while CHANGELOG.md is English, and that difference is worth
 *    keeping deliberate instead of accidental.
 * 2. The `## <version>` section of `CHANGELOG.md`, verbatim. That text was
 *    reviewed in the same commit as the code, so it is always safe to ship; it
 *    just reads like a changelog.
 *
 * Usage: node scripts/release-notes.mjs <version>   (e.g. `1.6.1`, or `v1.6.1`)
 * Exit 1 with a message on stderr when neither source has the version, so a
 * release without notes fails loudly instead of publishing an empty page.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/**
 * Extract the markdown section for `version` from a CHANGELOG document.
 *
 * A section runs from its `## <version>` heading to the next `## ` heading. The
 * heading is kept: a body that opens with `## 1.6.1` reads the same as the
 * changelog it came from.
 *
 * Matching is exact on the version word, so `1.6` never matches `1.6.0` and
 * `1.0.1` never matches `1.0.10`. A section may carry a date suffix
 * (`## 1.6.1 - 2026-10-30`) or none; only the version has to line up.
 *
 * @param changelog - the whole CHANGELOG file.
 * @param version - the version to extract, with or without a leading `v`.
 * @returns the section text, or `undefined` when there is no such section.
 */
export function sectionOf(changelog, version) {
  const wanted = String(version).trim().replace(/^v/, '')
  if (wanted === '') return undefined

  const lines = changelog.split(/\r?\n/)
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^##\\s+v?${escaped}(?![\\w.+-])`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return undefined

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      end = index
      break
    }
  }

  return lines.slice(start, end).join('\n').replace(/^\n+/, '').replace(/\s+$/, '')
}

/**
 * Resolve the body to publish for `version`.
 *
 * Accepts both `release-notes/1.6.1.md` and `release-notes/v1.6.1.md`: the tag is
 * spelled with the `v`, so a hand-written file naturally follows it, and a lookup
 * that only accepted the bare form would silently fall through to the changelog —
 * the note would look present in the tree while the release page showed different
 * text.
 *
 * @param version - the version, with or without a leading `v`.
 * @param read - reads a file by absolute path; injected so the order is testable.
 * @returns the body, or `undefined` when no source has this version.
 */
export function bodyOf(version, read) {
  const wanted = String(version).trim().replace(/^v/, '')
  if (wanted === '') return undefined

  const directory = join(root, 'release-notes')
  const curated = [join(directory, `${wanted}.md`), join(directory, `v${wanted}.md`)]
    .map((path) => read(path))
    .find((text) => text !== undefined && text.trim() !== '')
  if (curated !== undefined) return curated.trim()

  const changelog = read(join(root, 'CHANGELOG.md'))
  return changelog === undefined ? undefined : sectionOf(changelog, wanted)
}

/**
 * Read a file, treating "not there" as an absent value rather than an error.
 *
 * @param path - absolute path.
 * @returns the contents, or `undefined` when the file does not exist.
 */
function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename

if (invokedDirectly) {
  const version = process.argv[2]
  if (version === undefined || version.trim() === '') {
    console.error('usage: node scripts/release-notes.mjs <version>')
    process.exit(2)
  }

  let body
  try {
    body = bodyOf(version, readIfPresent)
  } catch (error) {
    console.error(`could not read the release notes: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  if (body === undefined) {
    console.error(`No release notes for ${version}.`)
    console.error(`Add release-notes/${version.replace(/^v/, '')}.md, or a "## ${version.replace(/^v/, '')}" section in CHANGELOG.md.`)
    console.error('A release page with no notes is worse than no release page, so this fails instead of publishing one.')
    process.exit(1)
  }

  process.stdout.write(`${body}\n`)
}
