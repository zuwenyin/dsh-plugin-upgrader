/**
 * Does a `name@version` spec slip past the host's already-installed guard?
 *
 * The whole "upgrade without remove" idea rests on this. Reading the compiled
 * host, `installBundle` refuses when:
 *
 *   const known = specPackageName(spec, before, this.profile.dir)
 *   if (hmr && known !== undefined && Object.hasOwn(before, known)) throw 'already-installed'
 *
 * `specPackageName` parses the NAME out of the spec, so `pkg@2.0.0` resolves to
 * `pkg` — which IS in dependencies — and the guard fires. The client-side check
 * that compares `pkg.name === spec` never sees that, because the host runs its
 * own check too. This script proves which one wins by looking at the code that
 * actually runs, not at the client.
 *
 * Usage: node scripts/probe-install-guard.mjs
 */
import { readFileSync } from 'node:fs'

const host = readFileSync('D:/DeepseekHarnessWorkspace/.probe/out/pm-index.js', 'utf8')

// Locate the guard and show it verbatim with a little context.
const guardIndex = host.indexOf('"already-installed"')
if (guardIndex === -1) {
  console.log('guard not found — the host may have changed shape')
  process.exit(1)
}
const around = host.slice(Math.max(0, guardIndex - 420), guardIndex + 80)
console.log('=== host guard ===')
console.log(around.split('\n').slice(-14).join('\n'))

// And the helper that decides what the spec names.
const helperIndex = host.indexOf('function specPackageName')
console.log('\n=== how the spec is resolved to a name ===')
console.log(host.slice(helperIndex, helperIndex + 520))

// Verdict, from behaviour rather than from reading: replicate the parse.
const parse = (spec) => {
  // `parseInstallSpec` treats a leading `@scope/name` as a name, then splits the
  // version off after the last `@` that is not the scope marker.
  const at = spec.lastIndexOf('@')
  return at > 0 ? spec.slice(0, at) : spec
}
for (const spec of ['dsh-plugin-upgrader', 'dsh-plugin-upgrader@1.1.2', '@scope/pkg@2.0.0']) {
  console.log(`  ${spec.padEnd(32)} → ${parse(spec)}`)
}
