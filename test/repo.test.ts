import test from 'node:test'
import assert from 'node:assert/strict'

import { githubUrlOf, isGithubUrl, normalizeRepoUrl, repoUrlOf } from '../src/host/repo.ts'

test('normalizeRepoUrl understands every shape npm allows', () => {
  assert.equal(normalizeRepoUrl('owner/repo'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepoUrl('github:owner/repo'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepoUrl('git+https://github.com/owner/repo.git'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepoUrl('git@github.com:owner/repo.git'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepoUrl('ssh://git@github.com/owner/repo.git'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepoUrl('https://github.com/owner/repo/'), 'https://github.com/owner/repo')
  assert.equal(normalizeRepoUrl({ url: 'git+https://github.com/owner/repo.git' }), 'https://github.com/owner/repo')
})

test('normalizeRepoUrl drops the query and the fragment', () => {
  assert.equal(normalizeRepoUrl('https://github.com/owner/repo?tab=readme#top'), 'https://github.com/owner/repo')
})

test('normalizeRepoUrl rejects what it cannot use', () => {
  assert.equal(normalizeRepoUrl(undefined), undefined)
  assert.equal(normalizeRepoUrl(''), undefined)
  assert.equal(normalizeRepoUrl('ftp://example.com/repo'), undefined)
  assert.equal(normalizeRepoUrl('not a url'), undefined)
})

test('isGithubUrl only accepts github.com', () => {
  assert.equal(isGithubUrl('https://github.com/owner/repo'), true)
  assert.equal(isGithubUrl('https://www.github.com/owner/repo'), true)
  assert.equal(isGithubUrl('https://gitlab.com/owner/repo'), false)
  assert.equal(isGithubUrl('https://github.com.example.com/owner/repo'), false)
  assert.equal(isGithubUrl('nonsense'), false)
})

test('githubUrlOf prefers the repository over a marketing homepage', () => {
  const packument = {
    repository: { type: 'git', url: 'git+https://github.com/owner/repo.git' },
    homepage: 'https://owner.dev/repo',
    'dist-tags': { latest: '1.0.0' },
    versions: { '1.0.0': {} },
  }
  assert.equal(githubUrlOf(packument, undefined), 'https://github.com/owner/repo')
})

test('githubUrlOf falls back to the version manifest', () => {
  const packument = { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { repository: 'owner/repo' } } }
  assert.equal(githubUrlOf(packument, { repository: 'owner/repo' }), 'https://github.com/owner/repo')
})

test('githubUrlOf uses a GitHub homepage only as a last resort', () => {
  const packument = { homepage: 'https://github.com/owner/repo' }
  assert.equal(githubUrlOf(packument, undefined), 'https://github.com/owner/repo')
  assert.equal(githubUrlOf({ homepage: 'https://owner.dev' }, undefined), undefined)
})

test('repoUrlOf reads the latest manifest without a separate lookup', () => {
  const packument = {
    'dist-tags': { latest: '2.0.0' },
    versions: { '2.0.0': { repository: 'https://github.com/owner/repo' }, '1.0.0': {} },
  }
  assert.equal(repoUrlOf(packument), 'https://github.com/owner/repo')
  assert.equal(repoUrlOf({}), undefined)
})
