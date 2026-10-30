import test from 'node:test'
import assert from 'node:assert/strict'

import { bodyOf, sectionOf } from '../scripts/release-notes.mjs'

const CHANGELOG = [
  '# Changelog',
  '',
  '## 1.6.10 — 2026-11-01',
  '',
  '- ten.',
  '',
  '## 1.6.1 — 2026-10-30',
  '',
  '- **Fixed the probe.** Two paragraphs,',
  '  wrapped across lines.',
  '',
  '## 1.6.0 — 2026-10-30',
  '',
  '- first.',
  '',
].join('\n')

test('the section for one version stops at the next heading', () => {
  const section = sectionOf(CHANGELOG, '1.6.1')
  assert.equal(section, ['## 1.6.1 — 2026-10-30', '', '- **Fixed the probe.** Two paragraphs,', '  wrapped across lines.'].join('\n'))
})

test('a version number is matched whole, not as a prefix', () => {
  // The bug this guards: `startsWith('## 1.6.1')` also matches `## 1.6.10`, so a
  // release would ship the wrong version's notes with no visible symptom.
  assert.match(sectionOf(CHANGELOG, '1.6.1') ?? '', /Fixed the probe/)
  assert.match(sectionOf(CHANGELOG, '1.6.10') ?? '', /ten\./)
  assert.doesNotMatch(sectionOf(CHANGELOG, '1.6.10') ?? '', /Fixed the probe/)
})

test('a tag name resolves to the same section as the bare version', () => {
  assert.equal(sectionOf(CHANGELOG, 'v1.6.0'), sectionOf(CHANGELOG, '1.6.0'))
})

test('a version with no section is absent, not empty', () => {
  // Returning '' would let publish.yml create a release page with no body, which
  // is the silent failure this whole script exists to prevent.
  assert.equal(sectionOf(CHANGELOG, '1.2.0'), undefined)
  assert.equal(sectionOf(CHANGELOG, ''), undefined)
})

test('a curated note wins over the changelog section', () => {
  const read = (path: string) => {
    if (path.endsWith('release-notes/1.6.1.md') || path.endsWith('release-notes\\1.6.1.md')) return '  hand-written notes  \n'
    if (path.endsWith('CHANGELOG.md')) return CHANGELOG
    return undefined
  }
  assert.equal(bodyOf('1.6.1', read), 'hand-written notes')
})

test('a curated note named after the tag is found too', () => {
  // The tag is spelled `v1.6.1`, so a hand-written file naturally follows it. A
  // lookup that only accepted the bare name would fall through to the changelog
  // while the note sat in the tree looking used.
  const read = (path: string) => {
    if (path.endsWith('release-notes/v1.6.1.md') || path.endsWith('release-notes\\v1.6.1.md')) return 'from the v-file'
    if (path.endsWith('CHANGELOG.md')) return CHANGELOG
    return undefined
  }
  assert.equal(bodyOf('1.6.1', read), 'from the v-file')
})

test('an empty curated note does not shadow the changelog', () => {
  const read = (path: string) => {
    if (path.includes('release-notes')) return '   \n\n'
    if (path.endsWith('CHANGELOG.md')) return CHANGELOG
    return undefined
  }
  assert.match(bodyOf('1.6.1', read) ?? '', /Fixed the probe/)
})

test('nothing anywhere resolves to undefined so the job fails', () => {
  const read = (path: string) => (path.endsWith('CHANGELOG.md') ? CHANGELOG : undefined)
  assert.equal(bodyOf('9.9.9', read), undefined)
})
