/**
 * Drive one upgrade through the plugin's own job API.
 *
 * This is the path a person's click takes: POST /job, then poll /job?id=.
 * Running it here is what makes the timing and the recovery observable without
 * a browser, and it is the only way to see the log the tab shows.
 *
 * Usage: node scripts/run-upgrade.mjs <name> <version>
 */
const base = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:13191'
const api = `${base}/api/plugin-upgrader`
const name = process.argv[2] ?? 'dsh-plugin-upgrader'
const version = process.argv[3] ?? '1.1.2'

const steps = [{ name, version, action: 'upgrade', enabled: true }]
console.log(`POST ${api}/job  ${name}@${version}`)
const started = await fetch(`${api}/job`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ steps }),
})
if (!started.ok) {
  console.error('start failed', started.status, await started.text())
  process.exit(1)
}
const { id } = await started.json()
console.log(`job ${id}`)

let printed = 0
let last
for (;;) {
  const res = await fetch(`${api}/job?id=${encodeURIComponent(id)}`)
  if (!res.ok) {
    console.error('poll failed', res.status)
    process.exit(1)
  }
  const job = await res.json()
  const log = Array.isArray(job.log) ? job.log : []
  for (const line of log.slice(printed)) console.log(`  ${line}`)
  printed = log.length
  last = job
  if (job.status !== 'running' && job.status !== 'queued') break
  await new Promise((resolve) => setTimeout(resolve, 1500))
}

console.log(`\nstatus: ${last.status}  done: ${last.done}/${last.total}  failed: ${last.failed}`)
const results = Array.isArray(last.results) ? last.results : []
for (const result of results) {
  console.log(
    JSON.stringify(
      {
        name: result.name,
        ok: result.ok,
        application: result.application,
        changed: result.changed,
        message: result.message,
        detail: result.detail,
      },
      null,
      2,
    ),
  )
}
