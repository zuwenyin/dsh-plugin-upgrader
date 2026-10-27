/**
 * Drive the built boot guard against the running Host.
 *
 * Two runs, differing only in the revision baked into the batch URL:
 *   - the revision the Host is serving right now, and
 *   - the revision recorded in the crash log that produced the dialog.
 *
 * The guard must call the first `fresh` and the second `stale`, which is the
 * whole fix: the page refuses to reload onto a document the Host has dropped.
 *
 * The guard is compiled to a plain ES module first, because `lib/client.js` ships
 * as the loader envelope rather than as importable exports:
 *
 *   node node_modules/esbuild/bin/esbuild src/client/boot.ts \
 *     --bundle --format=esm --platform=neutral --outfile=../.probe/boot-guard.mjs
 *
 * Usage: node scripts/verify-boot-guard-live.mjs [base]
 */
import { fileURLToPath } from 'node:url'

const guardUrl = new URL('../../.probe/boot-guard.mjs', import.meta.url)
const { checkBootDocument, reloadWhenBootDocumentFresh } = await import(guardUrl.href).catch(() => {
  throw new Error(
    `build the guard first: esbuild src/client/boot.ts --bundle --format=esm --platform=neutral --outfile=${fileURLToPath(guardUrl)}`,
  )
})

const base = process.argv[2] ?? 'http://127.0.0.1:12757'
const CRASH_REV = '943b3cf367c3'

/** The live graph, straight off the Host's event stream. */
async function liveGraph() {
  const response = await fetch(`${base}/plugins/events`, { headers: { accept: 'text/event-stream' } })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      // The frame arrives in pieces, so the parse is the completion test.
      const match = /^data: (.+)$/m.exec(text)
      if (match === null) continue
      try {
        return JSON.parse(match[1]).graph
      } catch {
        continue
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  throw new Error('no complete graph frame')
}

const graph = await liveGraph()
const batch = graph.batches.find((row) => row.entries.includes('dsh-plugin-upgrader'))
if (batch === undefined) throw new Error('the upgrader is not in any live batch')

/** A manifest row shaped exactly as `window.__DSH_BOOT__` carries it. */
function manifest(url) {
  return { batches: [{ phase: batch.phase, url, rev: batch.rev }] }
}

const liveUrl = batch.url
const deadUrl = batch.url.replace(/rev=[^&]*/, `rev=${CRASH_REV}`)

/** Probe a real URL, the way the page does. */
const probe = (input, init) => fetch(`${base}/${input.replace(/^dsh-app:\/\/app\//, '')}`, init)

console.log(`live batch:  ${liveUrl}`)
console.log(`dead batch:  ${deadUrl}`)
console.log(`crash log rev ${CRASH_REV} came from crash-2026-10-27T08-10-08-770Z-web-boot.log`)

const head = async (url) => (await probe(url, { method: 'HEAD' })).status
console.log(`HEAD live:   ${String(await head(liveUrl))}`)
console.log(`HEAD dead:   ${String(await head(deadUrl))}`)

const freshnessOfLive = await checkBootDocument({
  wire: manifest(liveUrl),
  href: 'dsh-app://app/',
  fetch: probe,
})
const freshnessOfDead = await checkBootDocument({
  wire: manifest(deadUrl),
  href: 'dsh-app://app/',
  fetch: probe,
})

let reloads = 0
let blocked = 0
const page = (wire) => ({
  __DSH_BOOT__: wire,
  location: {
    href: 'dsh-app://app/',
    reload: () => {
      reloads += 1
    },
  },
})

const { reloadWhenBootDocumentFresh: reloadGuard } = { reloadWhenBootDocumentFresh }
const startedLive = await reloadGuard({
  window: page(manifest(liveUrl)),
  fetch: probe,
  onBlocked: () => {
    blocked += 1
  },
})
const startedDead = await reloadGuard({
  window: page(manifest(deadUrl)),
  fetch: probe,
  onBlocked: () => {
    blocked += 1
  },
})

console.log('')
console.log(`live document:  ${freshnessOfLive}  reload=${String(startedLive)}`)
console.log(`dead document:  ${freshnessOfDead}  reload=${String(startedDead)}`)
console.log(`reloads started: ${String(reloads)} (expected 1), blocked: ${String(blocked)} (expected 1)`)

const ok =
  freshnessOfLive === 'fresh' &&
  freshnessOfDead === 'stale' &&
  startedLive === true &&
  startedDead === false &&
  reloads === 1 &&
  blocked === 1
console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
