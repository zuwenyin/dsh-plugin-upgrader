/**
 * Ask the BUILT host half to build an overview against the real mirror.
 *
 * This is the check the unit tests cannot make: the fake registry answers
 * instantly, so only a real one shows whether the cap and the deadline actually
 * survive `registry.npmmirror.com` under the burst a page open produces.
 *
 * Usage: node scripts/verify-overview-live.mjs
 */
import { buildOverview } from '../lib/host/overview.js'

const BUNDLES = [
  'dsh-context',
  'dshmarket',
  'dsh-xdpool',
  'billion-context',
  'dsh-connect-workbuddy',
  'dsh-dream-skin',
  '@kenz1117/dsh-ui-usage-billing',
  '@linxin666/dsh-client-ui-skill-explorer',
  '@linxin666/dsh-pet',
  '@smalltailqwq/dsh-client-ui-skin-maid-atelier',
  '@windypro-rourou/dsh-code-studio',
]

/** The context slice `buildOverview` reads. */
const context = {
  get(name) {
    if (name === 'pluginManager') {
      return {
        async listBundles() {
          return BUNDLES.map((name) => ({
            name,
            version: '0.0.1',
            official: false,
            availability: 'profile',
            enabled: true,
            installed: true,
            optional: false,
            removable: true,
            source: `${name}@0.0.1`,
            rows: [],
            overrides: [],
          }))
        },
        async registries() {
          return { registry: 'https://registry.npmmirror.com/', fallbackRegistries: [], resolved: null }
        },
      }
    }
    return undefined
  },
}

const rounds = Number(process.argv[2] ?? 3)
for (let round = 1; round <= rounds; round += 1) {
  const t0 = Date.now()
  const overview = await buildOverview(context, new Map(), new Map(), {})
  const failed = overview.bundles.filter((row) => row.versions.length === 0)
  console.log(
    `round ${round}: ${overview.bundles.length - failed.length}/${overview.bundles.length} with history in ${Date.now() - t0}ms`,
  )
  for (const row of overview.bundles) {
    const note = row.versions.length === 0 ? `  ← ${row.versionError ?? 'no versions'}` : ''
    console.log(`  ${String(row.totalVersions).padStart(5)} versions  ${row.name.padEnd(46)}${note}`)
  }
}
