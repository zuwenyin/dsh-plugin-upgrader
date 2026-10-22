/**
 * Bundle entry for the browser half.
 *
 * The DSH module loader hands every client bundle a `factory(require)` whose
 * `require` resolves the host's own modules. React must come from that argument
 * and nowhere else: a second copy of React would render the tab outside the
 * host's renderer and lose every context the page provides.
 *
 * The bundle therefore exports a factory and never touches the loader itself.
 * `scripts/build.mjs` wraps this file in the envelope that registers it, which
 * keeps `require` a real parameter of a real function instead of a global that
 * a bundler would have to shim.
 *
 * @module dsh-plugin-upgrader/client
 */
import { installReact, type ReactLike } from './env.ts'
import { apply, inject, name } from './plugin.ts'

/** What the plugin manager's client loader expects a bundle factory to return. */
export interface ClientPlugin {
  name: string
  inject: string[]
  apply: (ctx: unknown) => void
}

/**
 * Build the client plugin.
 *
 * @param require - the loader's module resolver.
 * @returns the plugin definition.
 */
export function createPlugin(require: (id: string) => unknown): ClientPlugin {
  installReact(require('react') as ReactLike)
  return { name, inject, apply: (ctx: unknown) => apply(ctx as Parameters<typeof apply>[0]) }
}
