/**
 * Why does the upgrader's own row show no version history?
 *
 * It is installed as `link:` (a path dependency), so the overview is expected to
 * refuse it. This checks the exact `source` string the manager reports and what
 * `sourceKind` makes of it, so the answer is evidence rather than a guess.
 *
 * Usage: node scripts/diagnose-self.mjs
 */
import { sourceKind } from '../lib/host/bundle.js'
import { buildOverview } from '../lib/host/overview.js'

// 1. What does sourceKind do with each spelling of a path dependency?
for (const source of [
  'link:D:/DeepseekHarnessWorkspace/dsh-plugin-upgrader',
  'file:../dsh-plugin-upgrader',
  'D:/DeepseekHarnessWorkspace/dsh-plugin-upgrader',
  '1.0.3',
  '^1.0.3',
  'npm:dsh-plugin-upgrader@1.0.3',
]) {
  console.log(`${String(sourceKind(source)).padEnd(9)} ${source}`)
}

// 2. What does the built overview say about a link-installed bundle?
const context = {
  get(name) {
    if (name === 'pluginManager') {
      return {
        async listBundles() {
          return [
            {
              name: 'dsh-plugin-upgrader',
              version: '1.0.3',
              official: false,
              availability: 'profile',
              enabled: true,
              installed: true,
              optional: false,
              removable: true,
              source: 'link:D:/DeepseekHarnessWorkspace/dsh-plugin-upgrader',
              rows: [],
              overrides: [],
            },
          ]
        },
        async registries() {
          return { registry: 'https://registry.npmmirror.com/', fallbackRegistries: [], resolved: null }
        },
      }
    }
    return undefined
  },
}

const overview = await buildOverview(context, new Map(), new Map(), {})
const row = overview.bundles[0]
console.log('\noverview row:')
console.log(JSON.stringify(
  {
    name: row.name,
    version: row.version,
    kind: row.kind,
    managed: row.managed,
    upgradable: row.upgradable,
    latest: row.latest,
    totalVersions: row.totalVersions,
    versionError: row.versionError,
  },
  null,
  2,
))
