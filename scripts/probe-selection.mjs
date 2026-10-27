/**
 * Ask the manager what it thinks of one bundle, and the profile what is really
 * on disk, side by side.
 *
 * The tab is driven by `listBundles()`. If that view and `package.json` disagree
 * about whether a bundle is selected, restoring state through the manager can
 * silently no-op: the manager compares against its own idea, finds it already
 * "enabled", and never re-adds the row to `dsh.profile.bundles`.
 *
 * Usage: node scripts/probe-selection.mjs <name>
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const name = process.argv[2] ?? 'dsh-plugin-upgrader'
const profile = process.env.DSH_PROFILE_DIR ?? 'D:/dsh-data/profiles/desktop'

const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
const selected = (manifest.dsh?.profile?.bundles ?? []).includes(name)
const declared = Object.hasOwn(manifest.dependencies ?? {}, name)
console.log('package.json:')
console.log(`  dependency: ${declared ? manifest.dependencies[name] : '(absent)'}`)
console.log(`  selected:   ${selected}`)

// On-disk state of the package itself.
try {
  const installed = JSON.parse(readFileSync(join(profile, 'node_modules', name, 'package.json'), 'utf8'))
  console.log(`  on disk:    ${installed.version}`)
} catch {
  console.log('  on disk:    (not installed)')
}
