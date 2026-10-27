/**
 * Does the DSH host process itself know which profile it is running?
 *
 * The in-place route needs `profileDirFrom()`, which reads `DSH_PROFILE_DIR`
 * (or `DSH_HOME` + `DSH_PROFILE`). Those variables are exported into a shell
 * started by the harness — but the harness's OWN process may not carry them,
 * and that is the process the plugin's host half runs in. If they are missing
 * there, every in-place attempt silently falls back to remove + install, which
 * is exactly the behaviour that was reported as still happening.
 *
 * Usage: node scripts/probe-host-env.mjs <pid>
 */
const pid = process.argv[2]

if (pid === undefined) {
  console.error('usage: node scripts/probe-host-env.mjs <pid>')
  process.exit(1)
}

// On Windows the environment block is not readable from Node; report what the
// current process sees instead and let the caller compare.
const relevant = ['DSH_HOME', 'DSH_PROFILE', 'DSH_PROFILE_DIR']
console.log(`this process (pid ${process.pid}):`)
for (const name of relevant) console.log(`  ${name} = ${JSON.stringify(process.env[name] ?? null)}`)
console.log(`\nthe harness process is pid ${pid}`)
