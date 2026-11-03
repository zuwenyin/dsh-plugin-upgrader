/**
 * The DSH runtime version behind one process's argv.
 *
 * `argv[1]` is the host entry point. `ENV` overrides are deliberately not
 * consulted: guessing a version would make the page disagree with the gate,
 * and a page that says "compatible" about a version the host then refuses is
 * worse than a page that says nothing.
 *
 * @param argv - `process.argv` of the host process.
 * @returns the version, or `undefined` when it cannot be determined.
 */
export declare function runtimeVersionOf(argv: readonly string[]): string | undefined;
//# sourceMappingURL=runtime.d.ts.map