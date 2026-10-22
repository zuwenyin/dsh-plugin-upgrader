/**
 * Build every shipped artifact of dsh-plugin-upgrader.
 *
 * Three independent jobs, run in order so a failure stops the release:
 *
 *   1. `lib/` — the host half. tsc is the compiler of record: it checks the
 *      package and emits plain ESM plus `.d.ts` files. The package's `main`
 *      points at `lib/index.js`.
 *   2. `lib/client.js` — the browser half, bundled by esbuild into ONE file and
 *      wrapped in the loader envelope the DSH web shell expects. The client
 *      cannot use bare imports at runtime, so everything is inlined and `react`
 *      stays a `require` call that the envelope passes in.
 *
 * Run with `npm run build`, or `npm run build:watch` while iterating.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { build as esbuild } from 'esbuild'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'lib')
const watch = process.argv.includes('--watch')

/** Loader envelope: the id must match the package name the profile installs. */
const MODULE_ID = 'dsh-plugin-upgrader'

/** Host half: tsc is the compiler of record, so types ship with the code. */
async function buildHost() {
  await run(
    process.execPath,
    [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.build.json')],
    { cwd: root, env: process.env },
  )
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

/** Browser half: one CommonJS bundle, then wrapped for the loader. */
async function buildClient() {
  const result = await esbuild({
    entryPoints: [resolve(root, 'src/client/index.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome110', 'firefox110', 'safari16'],
    external: ['react'],
    legalComments: 'none',
    logLevel: 'warning',
    write: false,
  })
  const code = result.outputFiles[0]?.text ?? ''
  await writeFile(resolve(out, 'client.js'), envelope(code), 'utf8')
  const bytes = (await readFile(resolve(out, 'client.js'))).length
  process.stdout.write(`lib/client.js  ${bytes} bytes\n`)
}

async function main() {
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  await buildHost()
  await buildClient()
  if (watch) {
    // Only the client is watched: the host is a straight tsc emit, and watching
    // both would fight over `lib/`.
    const ctx = await esbuild({
      entryPoints: [resolve(root, 'src/client/index.ts')],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      external: ['react'],
      outfile: resolve(root, '.client-watch.tmp.js'),
      logLevel: 'silent',
      plugins: [
        {
          name: 'envelope',
          setup(build) {
            build.onEnd(async (result) => {
              const code = result.outputFiles?.[0]?.text
              const text = code === undefined ? await readFile(resolve(root, '.client-watch.tmp.js'), 'utf8') : code
              await writeFile(resolve(out, 'client.js'), envelope(text), 'utf8')
              process.stdout.write('rebuilt lib/client.js\n')
            })
          },
        },
      ],
    })
    await ctx.watch()
    process.stdout.write('watching src/client/**\n')
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stderr ?? error?.message ?? error}\n`)
  process.exitCode = 1
})
