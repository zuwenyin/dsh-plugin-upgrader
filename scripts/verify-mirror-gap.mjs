/**
 * Does the overview now report releases the mirror is missing?
 *
 * The case that caused a failed batch: `dsh-plugin-upgrader@1.2.0` is published
 * on npm but absent from registry.npmmirror.com. The mirror's own document simply
 * omits it, so before this change the tab looked up to date.
 *
 * Usage: node scripts/verify-mirror-gap.mjs
 */
const { buildOverview } = await import('../lib/host/overview.js')

const MIRROR = 'https://registry.npmmirror.com'
const UPSTREAM = 'https://registry.npmjs.org'

/**
 * A context whose manager answers for one profile-installed bundle.
 *
 * @param registry - the registry the profile installs from.
 * @returns a host context.
 */
function context(registry) {
  return {
    get(name) {
      if (name === 'pluginManager') {
        return {
          async listBundles() {
            return [
              {
                name: 'dsh-plugin-upgrader',
                version: '1.1.2',
                official: false,
                availability: 'profile',
                enabled: true,
                installed: true,
                optional: false,
                removable: true,
                source: '1.1.2',
                rows: [],
                overrides: [],
              },
            ]
          },
          async registries() {
            return { registry, fallbackRegistries: [], resolved: null }
          },
        }
      }
      return undefined
    },
  }
}

/** What npm actually publishes, for the comparison this test depends on. */
async function upstreamVersions() {
  const res = await fetch(`${UPSTREAM}/dsh-plugin-upgrader`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  const body = await res.json()
  return Object.keys(body.versions ?? {})
}

const upstream = await upstreamVersions()
console.log(`upstream versions: ${upstream.join(', ')}`)

for (const [label, registry] of [['mirror', MIRROR], ['upstream', UPSTREAM]]) {
  const overview = await buildOverview(context(registry), new Map(), new Map(), {})
  const row = overview.bundles[0]
  console.log(`\n=== ${label} (${registry}) ===`)
  console.log(`  installed:      ${row.version}`)
  console.log(`  latest seen:    ${row.latest ?? '(none)'}`)
  console.log(`  upgradable:     ${row.upgradable}`)
  console.log(`  mirrorMissing:  ${JSON.stringify(row.mirrorMissing ?? null)}`)

  if (label === 'mirror') {
    // The mirror is behind, so the row must name what it cannot install.
    const missing = row.mirrorMissing ?? []
    const expected = upstream.filter((v) => v.startsWith('1.2.'))
    let bad = 0
    const check = (name, ok) => {
      console.log(`  ${ok ? 'ok     ' : 'FAILED '} ${name}`)
      if (!ok) bad += 1
    }
    console.log('')
    check('the gap is reported', missing.length > 0)
    check(`1.2.0 is named (expected ${expected.join(', ')})`, missing.some((v) => v === '1.2.0'))
    check('nothing at or below the installed version is named', missing.every((v) => v !== '1.1.2'))
    if (bad > 0) process.exit(1)
  } else {
    // Pointing at the upstream registry means nothing can be missing.
    if (row.mirrorMissing !== undefined) {
      console.error('  FAILED: an upstream profile must not report a mirror gap')
      process.exit(1)
    }
    console.log('  ok       no gap reported when already on the upstream registry')
  }
}

console.log('\nmirror gap detected and named')
