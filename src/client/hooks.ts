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
