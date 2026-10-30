/**
 * Types for `release-notes.mjs`, which ships as plain ESM because every other
 * script in `scripts/` is plain ESM and it runs in CI on a bare Node before any
 * build step.
 *
 * Only the two pure helpers are declared: the CLI half (`process.argv`, writing
 * to stdout) is exercised by `publish.yml`, not by the unit tests, and typing it
 * here would suggest the tests cover it.
 */

/** Reads a file by absolute path; `undefined` when it does not exist. */
export type ReadFile = (path: string) => string | undefined

/**
 * The markdown section for one version, or `undefined` when absent.
 *
 * @param changelog - the whole CHANGELOG document.
 * @param version - the version to extract, with or without a leading `v`.
 */
export function sectionOf(changelog: string, version: string): string | undefined

/**
 * The body to publish for one version: a curated note first, the changelog
 * section second, `undefined` when neither has it.
 *
 * @param version - the version, with or without a leading `v`.
 * @param read - reads a file by absolute path.
 */
export function bodyOf(version: string, read: ReadFile): string | undefined
