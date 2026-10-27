/**
 * How long does the upstream-registry lookup take from this machine?
 *
 * The mirror-gap feature asks registry.npmjs.org what a mirror is missing. From
 * a network where npmjs.org is slow or blocked — which is exactly why a profile
 * is pointed at a mirror in the first place — that lookup runs on EVERY overview
 * build, once per installed package. The overview cannot answer until they all
 * settle, so this measures what that costs and whether it fails.
 *
 * Usage: node scripts/probe-upstream-cost.mjs
 */
import { readFileSync } from 'node:fs'

const profile = 'D:/dsh-data/profiles/desktop'
const manifest = JSON.parse(readFileSync(`${profile}/package.json`, 'utf8'))
const names = Object.keys(manifest.dependencies ?? {})
const base = 'https://registry.npmjs.org'

console.log(`probing ${names.length} packages against ${base}\n`)

/**
 * Time one package lookup, the same way the plugin does it.
 *
 * @param name - package name.
 * @returns the elapsed time and outcome.
 */
async function timeOne(name) {
  const started = Date.now()
  const url = `${base}/${name.startsWith('@') ? '@' + encodeURIComponent(name.slice(1)) : encodeURIComponent(name)}`
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(20_000),
    })
    return { name, ms: Date.now() - started, ok: response.ok, status: response.status }
  } catch (error) {
    return { name, ms: Date.now() - started, ok: false, status: error.name }
  }
}

const startedAll = Date.now()
// Four at a time, the plugin's own concurrency cap.
const results = []
for (let index = 0; index < names.length; index += 4) {
  // eslint-disable-next-line no-await-in-loop
  const batch = await Promise.all(names.slice(index, index + 4).map(timeOne))
  results.push(...batch)
}
const total = Date.now() - startedAll

for (const result of results.sort((left, right) => right.ms - left.ms)) {
  console.log(`  ${String(result.ms).padStart(6)}ms  ${String(result.status).padEnd(22)} ${result.name}`)
}

const slowest = Math.max(...results.map((r) => r.ms))
const failures = results.filter((r) => !r.ok).length
console.log(`\ntotal for all ${names.length}: ${total}ms`)
console.log(`slowest single lookup:      ${slowest}ms`)
console.log(`failures:                   ${failures}/${names.length}`)
console.log(
  slowest > 2000 || failures > 0
    ? '\nVERDICT: the upstream probe is expensive here — it delays every overview build'
    : '\nVERDICT: upstream is cheap from this machine',
)
