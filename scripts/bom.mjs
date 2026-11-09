/**
 * Detect a UTF-8 byte order mark at the front of a file.
 *
 * Split out from `scripts/verify-bom.mjs` so the rules can be tested without a
 * git checkout: the check itself has to run in CI, but the *decisions* it makes
 * — what counts as a BOM, and what counts as a file worth looking at — are where
 * it can be wrong.
 *
 * Why this repository cares: a BOM in `package.json` made `JSON.parse` throw
 * when the profile read the linked checkout at startup. The host reported
 * `Cannot validate installed package dsh-plugin-upgrader`, denied the bundle,
 * and the version tab disappeared with no error anywhere in the page.
 */

/** The three UTF-8 byte order mark bytes, in order. */
export const BOM_BYTES = Object.freeze([0xef, 0xbb, 0xbf])

/** How many leading bytes are enough to decide both questions. */
export const SAMPLE_BYTES = 4096

/**
 * Does this buffer start with a UTF-8 byte order mark?
 *
 * Three bytes minimum, compared in order. A file shorter than the mark cannot
 * carry one.
 *
 * @param sample - the file's first bytes.
 * @returns true when the first three bytes are the mark.
 */
export function startsWithBom(sample) {
  if (sample === undefined || sample === null || sample.length < BOM_BYTES.length) return false
  return BOM_BYTES.every((byte, index) => sample[index] === byte)
}

/**
 * Is this sample text rather than binary?
 *
 * A NUL byte in the first few kilobytes is the same heuristic git uses, and it
 * is a fact about the bytes rather than a guess from the file extension. A BOM
 * at the front of a binary file is not a defect — plenty of formats carry one —
 * so those files are skipped entirely instead of reported.
 *
 * @param sample - the file's first bytes.
 * @returns true when the sample has no NUL byte.
 */
export function looksTextual(sample) {
  return sample !== undefined && sample !== null && !sample.includes(0)
}

/**
 * Which of these files carry a byte order mark.
 *
 * Takes already-read samples so the caller owns the I/O and this stays pure.
 * Files that are empty, unreadable (an empty sample), or binary are skipped:
 * `git status` is the place to complain about a tracked file that vanished.
 *
 * @param files - pairs of path and the file's first bytes.
 * @returns the paths that start with the mark, in the order given.
 */
export function bomsIn(files) {
  const found = []
  for (const [path, sample] of files) {
    if (!looksTextual(sample)) continue
    if (startsWithBom(sample)) found.push(path)
  }
  return found
}
