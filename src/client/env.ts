/**
 * The one external dependency, held in one place.
 *
 * The DSH module loader hands the bundle a `require` that resolves the host's
 * own React instance; the bundle must never import React itself, or the tab
 * would render with a second copy and lose the host's context. Every component
 * module therefore reads the installed instance from here instead of importing
 * a package.
 *
 * @module dsh-plugin-upgrader/client/env
 */

/** Stand-in for React's element factory. */
export type H = (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
) => unknown

/** The React surface this bundle uses. */
export interface ReactLike {
  createElement: H
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((current: S) => S)) => void]
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void
  useMemo: <T>(factory: () => T, deps: unknown[]) => T
  useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps: unknown[]) => T
  useRef: <T>(initial: T) => { current: T }
}

let installed: ReactLike | undefined

/**
 * Record the host's React instance.
 *
 * @param react - the instance the loader provided.
 */
export function installReact(react: ReactLike): void {
  installed = react
}

/**
 * The host's React instance.
 *
 * @returns the instance recorded by {@link installReact}.
 * @throws when a component renders before the instance was installed.
 */
export function getReact(): ReactLike {
  if (installed === undefined) throw new Error('plugin-upgrader: React was not installed')
  return installed
}

/**
 * The host's element factory.
 *
 * @returns `React.createElement`.
 */
export function getH(): H {
  return getReact().createElement
}
