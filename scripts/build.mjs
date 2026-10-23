/**
 * Build every shipped artifact of dsh-plugin-upgrader.
 *
 * Two independent jobs, run so a failure stops the release:
 *
 *   1. `lib/` — the host half. tsc is the compiler of record: it checks the
 *      package and emits plain ESM plus `.d.ts` files. The package's `main`
 *      points at `lib/index.js`.
 *   2. `lib/client.js` — the browser half, bundled by esbuild into ONE file and
 *      wrapped in the loader envelope the DSH web shell expects. The client
 *      cannot use bare imports at runtime, so everything is inlined and `react`
 *      stays a `require` call that the envelope passes in.
 *
 * Run once with `pnpm run build`, or keep both halves compiling with
 * `pnpm run dev` (`--watch`). The two watchers own disjoint outputs — tsc writes
 * `lib/index.js` and `lib/host/**`, esbuild writes `lib/client.js` — so they can
 * run side by side without fighting over `lib/`.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { build as esbuild, context as esbuildContext } from 'esbuild'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'lib')
const watch = process.argv.includes('--watch')

const TSC = resolve(root, 'node_modules/typescript/bin/tsc')
const TSCONFIG_BUILD = resolve(root, 'tsconfig.build.json')

/** Loader envelope: the id must match the package name the profile installs. */
const MODULE_ID = 'dsh-plugin-upgrader'

/** Host half: tsc is the compiler of record, so types ship with the code. */
async function buildHost() {
  await run(process.execPath, [TSC, '-p', TSCONFIG_BUILD], { cwd: root, env: process.env })
}

/**
 * Wrap the bundled client in the DSH loader envelope.
 *
 * The bundle is emitted as CommonJS so `require('react')` stays a call on the
 * `require` parameter the envelope supplies. Wrapping afterwards (rather than
 * emitting an IIFE with a global) keeps the plugin's factory a real function,
 * so the loader's `require` never has to be faked by a bundler shim.
 *
 * @param source - the bundled CommonJS module body.
 * @returns the file the loader evaluates.
 */
function envelope(source) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(MODULE_ID)},
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
${source
  .split('\n')
  .map((line) => (line === '' ? '' : `    ${line}`))
  .join('\n')}
    return module.exports.createPlugin(require)
  },
})
`
}

/** Everything esbuild needs, shared by the one-shot and the watcher. */
function clientOptions() {
  return {
    entryPoints: [resolve(root, 'src/client/index.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome110', 'firefox110', 'safari16'],
    external: ['react'],
    legalComments: 'none',
    // `write: false` keeps the bundle in memory so it can be wrapped before it
    // ever reaches disk; no temporary file is involved.
    write: false,
  }
}

/** Browser half, one shot: bundle, wrap, write. */
async function buildClient() {
  const result = await esbuild({ ...clientOptions(), logLevel: 'warning' })
  const code = result.outputFiles[0]?.text ?? ''
  await writeFile(resolve(out, 'client.js'), envelope(code), 'utf8')
  const bytes = (await readFile(resolve(out, 'client.js'))).length
  process.stdout.write(`lib/client.js  ${bytes} bytes\n`)
}

/**
 * Watch both halves until interrupted.
 *
 * tsc runs as a child process with `--watch` because it is the only thing that
 * can emit the host half with its declarations. The client is rebuilt by the
 * esbuild context, whose `onEnd` hook re-wraps and rewrites `lib/client.js`.
 */
async function watchAll() {
  // `esbuild()` builds once; only `esbuild.context()` can be watched.
  const context = await esbuildContext({
    ...clientOptions(),
    logLevel: 'warning',
    plugins: [
      {
        name: 'loader-envelope',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length > 0) {
              process.stdout.write('lib/client.js  build failed, keeping the last good file\n')
              return
            }
            const code = result.outputFiles?.[0]?.text ?? ''
            if (code === '') return
            const file = resolve(out, 'client.js')
            await writeFile(file, envelope(code), 'utf8')
            const bytes = (await readFile(file)).length
            process.stdout.write(`lib/client.js  ${bytes} bytes (rebuilt)\n`)
          })
        },
      },
    ],
  })

  const tsc = spawn(
    process.execPath,
    [TSC, '-p', TSCONFIG_BUILD, '--watch', '--preserveWatchOutput', '--pretty', 'false'],
    { cwd: root, stdio: 'inherit' },
  )

  await context.watch()
  process.stdout.write('\nwatching src/**  —  Ctrl+C to stop\n')
  process.stdout.write('client types are stripped by esbuild; run `pnpm run typecheck` to check them\n\n')

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    process.stdout.write('\nstopping watchers\n')
    await context.dispose().catch(() => {})
    tsc.kill()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  tsc.on('exit', (code) => {
    if (stopping) return
    // tsc dying on its own means the emit is gone; do not pretend to watch.
    process.stderr.write(`tsc watcher exited with code ${code}\n`)
    void stop().then(() => {
      process.exitCode = code ?? 1
    })
  })
}

async function main() {
  // A watch run must not wipe `lib/` on start-up more than once: the tsc child
  // emits into it right away and would otherwise race the removal.
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  await buildHost()
  await buildClient()
  if (watch) await watchAll()
}

main().catch((error) => {
  process.stderr.write(`${error?.stderr ?? error?.message ?? error}\n`)
  process.exitCode = 1
})
