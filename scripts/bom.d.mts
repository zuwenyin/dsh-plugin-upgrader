/**
 * Types for `bom.mjs`, which ships as plain ESM for the same reason the other
 * scripts in this directory do: things that run before the build have to run on
 * a bare Node.
 *
 * The split mirrors `agents-md-budget.d.mts`: only the pure half is declared
 * here. `verify-bom.mjs` and `strip-bom.mjs` (reading git, reading files, stdout,
 * exit codes) are the CLI half and are deliberately absent — declaring them would
 * suggest they are unit-tested, and what is tested is the decisions, not the I/O.
 *
 * Every function below is covered by `test/bom.test.ts`.
 */

/** The three UTF-8 byte order mark bytes, in order: `EF BB BF`. */
export declare const BOM_BYTES: readonly [0xef, 0xbb, 0xbf]

/** How many leading bytes are enough to decide both questions. */
export declare const SAMPLE_BYTES: number

/**
 * Does this sample start with a UTF-8 byte order mark?
 *
 * @param sample - the file's first bytes.
 * @returns true when the first three bytes are the mark.
 */
export declare function startsWithBom(sample: ArrayLike<number> | undefined | null): boolean

/**
 * Is this sample text rather than binary?
 *
 * @param sample - the file's first bytes.
 * @returns true when the sample has no NUL byte.
 */
export declare function looksTextual(sample: ArrayLike<number> | undefined | null): boolean

/**
 * Which of these files carry a byte order mark.
 *
 * @param files - pairs of path and the file's first bytes.
 * @returns the paths that start with the mark, in the order given.
 */
export declare function bomsIn(
  files: Iterable<readonly [string, ArrayLike<number>]>,
): string[]
