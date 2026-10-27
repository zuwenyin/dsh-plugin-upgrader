/**
 * Hooks that are not about network state.
 *
 * @module dsh-plugin-upgrader/client/hooks
 */
import { getReact } from './env.ts'
import type { LocaleLike } from './types.ts'

/**
 * Re-render on locale changes so copy follows the active language live.
 *
 * @param locale - the locale service, when the host provides one.
 * @returns a revision counter.
 */
export function useLocaleRevision(locale: LocaleLike | undefined): number {
  const React = getReact()
  const [revision, setRevision] = React.useState(0)
  React.useEffect(() => {
    const subscribe = locale?.subscribe
    if (locale === undefined || locale === null || typeof subscribe !== 'function') return undefined
    return subscribe.call(locale, () => setRevision((value) => value + 1))
  }, [locale])
  return revision
}

/**
 * Read the active locale id without trusting the service to be well behaved.
 *
 * @param locale - the locale service.
 * @returns a lowercase id such as `zh` or `en`.
 */
export function activeLocaleId(locale: LocaleLike | undefined): string {
  try {
    const read = locale?.getLocale
    if (typeof read !== 'function') return 'en'
    return String(read.call(locale)?.active ?? 'en')
  } catch {
    return 'en'
  }
}

/**
 * Keep a flag that answers "is this tab still mounted".
 *
 * A batch keeps running on the host after the page is closed, so every poll
 * loop has to stop touching state once the tab is gone.
 *
 * @returns a ref whose `current` is true while mounted.
 */
export function useAlive(): { current: boolean } {
  const React = getReact()
  const alive = React.useRef(true)
  React.useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )
  return alive
}

/**
 * Packages whose whole job is restyling the page.
 *
 * Replacing one of these unloads the code that injected its stylesheet, so the
 * page snaps back to the host's default look until the plugin starts again and
 * re-applies its state. `dsh-dream-skin`, for one, keeps its configuration in
 * `$DSH_HOME/dream-skin.json` — outside the profile, written atomically — so the
 * settings survive an upgrade; only the injected CSS and `data-*` attributes on
 * `<html>` are gone. Reloading the page is what makes the restarted plugin read
 * that file and inject them again.
 */
const APPEARANCE_PATTERN = /(^|[/@-])(skin|theme|dream-skin|wallpaper|appearance)([/@.-]|$)/i

/**
 * Whether upgrading this package unloads the page's current styling.
 *
 * @param name - npm package name.
 * @returns whether it is an appearance plugin.
 */
export function isAppearancePackage(name: string): boolean {
  return APPEARANCE_PATTERN.test(name)
}

/**
 * Whether a settled batch replaced an appearance plugin.
 *
 * Only a step that actually changed something counts: a failed or skipped step
 * never unloaded the stylesheet, so reloading for it would throw away the page
 * for no reason.
 *
 * @param results - the settled job's step outcomes.
 * @returns whether the page's styling may need re-applying.
 */
export function replacedAppearance(
  results: readonly { name?: unknown; ok?: unknown; changed?: unknown }[] | undefined,
): boolean {
  if (!Array.isArray(results)) return false
  return results.some(
    (result) =>
      result.ok === true && result.changed !== false && typeof result.name === 'string' && isAppearancePackage(result.name),
  )
}
