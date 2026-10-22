/**
 * The client plugin: one tab on the Plugins page.
 *
 * @module dsh-plugin-upgrader/client/plugin
 */
import { Tab } from './components/Tab.ts'
import { EN, ZH } from './copy.ts'
import { getH } from './env.ts'
import { makeT } from './format.ts'
import { activeLocaleId } from './hooks.ts'
import type { ClientContext, LocaleLike } from './types.ts'

/** The locale namespace this bundle registers its copy under. */
export const NS = 'plugin-upgrader'

/** Stable plugin name; matches the package and the patch insert id. */
export const name = 'plugin-upgrader'

/** Hard client dependencies: the slot registry and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Mount the browser half.
 *
 * The copy is registered under this bundle's own namespace and the tab's label
 * is a thunk, so switching the display language relabels the tab without
 * remounting the plugin.
 *
 * @param ctx - the client plugin context.
 */
export function apply(ctx: ClientContext): void {
  const locale = ctx.get<LocaleLike>('locale', false)
  const active = (): string => activeLocaleId(locale)
  let bound: ((key: string, ...args: never[]) => unknown) | undefined
  if (locale !== undefined && locale !== null) {
    try {
      locale.register?.(NS, { zh: ZH, en: EN })
      bound = locale.bind?.(NS)
    } catch (error) {
      console.warn('[plugin-upgrader] locale namespace unavailable, using built-in copy', error)
    }
  }
  const t = makeT(bound, active)

  ctx.slots.inject('plugins.tab', () =>
    ctx.slots.register({ name: 'plugins.tab', id: name, order: 5, label: () => t('tab') }, (ownerProps: unknown) =>
      getH()(Tab, { ...(ownerProps as Record<string, unknown>), t, locale }),
    ),
  )
}
