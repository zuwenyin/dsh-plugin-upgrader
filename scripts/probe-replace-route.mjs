/**
 * Prove the "drop the dependency, then install over it" route works.
 *
 * The host's `installBundle` refuses a spec whose package name is already in
 * `profile/package.json`'s `dependencies`. That check reads the manifest, not
 * the disk, so removing the entry first should let a plain `installBundle` run
 * pnpm `add` over the existing version — one command instead of remove+install,
 * with no window where the bundle is deselected.
 *
 * This is a probe, not the production change: it edits the profile and prints
 * what happened, so the assumption is checked before any code depends on it.
 *
 * Usage: node scripts/probe-replace-route.mjs [--apply]
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const profile = process.env.DSH_PROFILE_DIR ?? 'D:/dsh-data/profiles/desktop'
const manifestPath = join(profile, 'package.json')
const name = process.argv[2] ?? 'dsh-plugin-upgrader'
const target = process.argv[3] ?? '1.1.2'
const apply = process.argv.includes('--apply')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const current = manifest.dependencies?.[name]
console.log(`profile dependency: ${current ?? '(absent)'}`)
console.log(`target version:     ${target}`)
console.log(`mode:               ${apply ? 'APPLY (edits the profile)' : 'dry run'}`)

if (current === undefined) {
  console.log('\nnothing to drop: the guard cannot fire, a plain install already works')
  process.exit(0)
}

// What the dropped manifest would look like.
const dropped = structuredClone(manifest)
delete dropped.dependencies[name]
console.log(`\nafter dropping the entry: ${Object.keys(dropped.dependencies).length} dependencies remain`)
console.log(`bundles list untouched:   ${(dropped.dsh?.profile?.bundles ?? []).includes(name)}`)

if (!apply) {
  console.log('\ndry run: re-run with --apply to test the real install')
  process.exit(0)
}

copyFileSync(manifestPath, `${manifestPath}.probe-backup`)
writeFileSync(manifestPath, `${JSON.stringify(dropped, null, 2)}\n`, 'utf8')
console.log(`\nwrote the dropped manifest (backup at ${manifestPath}.probe-backup)`)
console.log('now run: plugin_manager install_bundle <name>@<version>')
