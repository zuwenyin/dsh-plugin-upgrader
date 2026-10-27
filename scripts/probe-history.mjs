/**
 * Replay the operations that touched one package, in order.
 *
 * The batch that failed produced several pnpm logs; reading one in isolation
 * cannot show whether a removal was followed by an install. This prints every
 * operation in time order with the dependency lines that mention the package,
 * which is what makes the sequence legible.
 *
 * Usage: node scripts/probe-history.mjs <name>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'

const root = 'D:/dsh-data/profiles/desktop/.plugin-manager/logs'
const name = process.argv[2] ?? 'dsh-connect-workbuddy'

const entries = []
for (const dir of readdirSync(root)) {
  const file = `${root}/${dir}/pnpm.log`
  try {
    entries.push({ dir, file, at: statSync(file).mtimeMs })
  } catch {
    // Not every operation directory keeps a pnpm log.
  }
}
entries.sort((left, right) => left.at - right.at)

console.log(`${entries.length} pnpm operations, oldest first\n`)
for (const entry of entries.slice(-12)) {
  const text = readFileSync(entry.file, 'utf8')
  const related = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(name) || /^[-+]/.test(line))
  const failed = /ERR_PNPM|error/i.test(text)
  const time = new Date(entry.at).toLocaleTimeString()
  console.log(`${entry.dir}  ${time}  ${failed ? 'FAILED' : 'ok'}`)
  for (const line of related) console.log(`    ${line}`)
  if (related.length === 0) console.log('    (no dependency lines)')
}
