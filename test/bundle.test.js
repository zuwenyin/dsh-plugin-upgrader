import test from 'node:test'
import assert from 'node:assert/strict'

import { inlineIcon, pickText, registryBase, sourceKind } from '../src/lib/bundle.js'

test('sourceKind classifies registry ranges', () => {
  assert.equal(sourceKind('^1.2.3'), 'registry')
  assert.equal(sourceKind('1.2.3'), 'registry')
  assert.equal(sourceKind('~0.4'), 'registry')
  assert.equal(sourceKind('npm:@scope/other@2.0.0'), 'registry')
  assert.equal(sourceKind('latest'), 'registry')
  assert.equal(sourceKind('beta'), 'registry')
})

test('sourceKind classifies local paths', () => {
  assert.equal(sourceKind('link:D:/work/plugin'), 'path')
  assert.equal(sourceKind('file:../plugin'), 'path')
  assert.equal(sourceKind('./plugin'), 'path')
  assert.equal(sourceKind('/abs/plugin'), 'path')
})

test('sourceKind classifies git and tarball sources', () => {
  assert.equal(sourceKind('git+https://github.com/owner/repo.git'), 'git')
  assert.equal(sourceKind('github:owner/repo'), 'git')
  assert.equal(sourceKind('https://example.com/plugin.tgz'), 'tarball')
  assert.equal(sourceKind(undefined), 'unknown')
})

test('pickText follows the requested language', () => {
  assert.equal(pickText('plain', 'zh'), 'plain')
  assert.equal(pickText({ en: 'Version', zh: '版本' }, 'zh'), '版本')
  assert.equal(pickText({ en: 'Version', zh: '版本' }, 'en'), 'Version')
  assert.equal(pickText({ zh: '版本' }, 'en'), '版本')
  assert.equal(pickText({ ja: 'バージョン' }, 'en'), 'バージョン')
  assert.equal(pickText(undefined, 'en'), undefined)
})

test('inlineIcon drops only oversized inline images', () => {
  assert.equal(inlineIcon('data:image/png;base64,AAAA', 64), 'data:image/png;base64,AAAA')
  assert.equal(inlineIcon(`data:image/png;base64,${'A'.repeat(64)}`, 16), undefined)
  assert.equal(inlineIcon('https://example.com/icon.svg', 16), 'https://example.com/icon.svg')
  assert.equal(inlineIcon('', 16), undefined)
  assert.equal(inlineIcon(undefined, 16), undefined)
})

test('registryBase prefers the configured registry and strips the slash', () => {
  assert.equal(registryBase({ registry: 'https://registry.npmmirror.com/', resolved: null }), 'https://registry.npmmirror.com')
  assert.equal(registryBase({ registry: null, resolved: 'https://registry.yarnpkg.com/' }), 'https://registry.yarnpkg.com')
  assert.equal(registryBase(undefined), 'https://registry.npmjs.org')
})
