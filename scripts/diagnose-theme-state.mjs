/**
 * Reproduce the theme-change timing the user sees during an upgrade.
 *
 * The claim to test: the durable theme state lives in `$DSH_HOME/dream-skin.json`
 * and is written atomically, so the *file* survives an upgrade — what changes is
 * which values the freshly-started client half adopts, and when. A loader row
 * that is torn down and recreated mid-session restarts that adoption from
 * scratch against a fresh origin.
 *
 * This script only measures the file side: it must be untouched by package
 * operations, which is what rules the state file out as the cause.
 *
 * Usage: node scripts/diagnose-theme-state.mjs
 */
import { readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const home = process.env.DSH_HOME ?? 'D:\\dsh-data'
const file = join(home, 'dream-skin.json')
const profile = process.env.DSH_PROFILE_DIR ?? 'D:\\dsh-data\\profiles\\desktop'

console.log(`state file: ${file}`)
console.log(`exists:     ${existsSync(file)}`)
if (existsSync(file)) {
  const stat = statSync(file)
  console.log(`bytes:      ${stat.size}`)
  console.log(`modified:   ${stat.mtime.toLocaleString()}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(raw)) {
    const shown = typeof value === 'string' && value.length > 60 ? `${value.slice(0, 57)}…` : value
    console.log(`  ${key} = ${JSON.stringify(shown)}`)
  }
}

// Does the profile itself carry any theme configuration that an upgrade
// could rewrite? If not, a package operation cannot be the cause.
const patch = join(profile, 'cordis.patch.yml')
const composed = join(profile, 'cordis.yml')
for (const candidate of [patch, composed]) {
  if (!existsSync(candidate)) {
    console.log(`\n${candidate}: (absent)`)
    continue
  }
  const text = readFileSync(candidate, 'utf8')
  const lines = text.split(/\r?\n/)
  const hits = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /dream-skin|skin|wallpaper|theme/i.test(line))
  console.log(`\n${candidate}: ${hits.length} theme-related line(s)`)
  for (const { line, index } of hits.slice(0, 15)) console.log(`  ${index + 1}: ${line}`)
}

// A theme plugin's own install state, which IS what an upgrade replaces.
const manifest = join(profile, 'package.json')
const deps = JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {}
console.log('\ninstalled theme/UI packages:')
for (const [name, spec] of Object.entries(deps)) {
  if (/skin|theme|dream|maid/i.test(name)) console.log(`  ${name} = ${spec}`)
}
