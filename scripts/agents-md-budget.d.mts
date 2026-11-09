/**
 * Types for `agents-md-budget.mjs`, which ships as plain ESM for the same reason
 * `downloads.mjs` and `release-notes.mjs` do: every script in `scripts/` is plain
 * ESM, and this one has to run on a bare Node before any build step.
 *
 * Only the pure half is declared. The CLI half (`verify-agents-md.mjs`: reading
 * the file, stdout, exit codes) is not unit-tested, and typing it here would
 * suggest that it is. Everything below is covered by
 * `test/agents-md-budget.test.ts`.
 */

/** What {@link measure} returns. */
export interface AgentsMdMetrics {
  /** Lines, with a trailing newline not counted as an extra line. */
  lines: number
  /** Unicode code points, so astral and CJK characters each cost one. */
  chars: number
  /** Rough token estimate for the log line only. Never a gate. */
  tokens: number
  /** Number of `## ` headings. */
  sections: number
}

/** What {@link checkBudget} returns. */
export interface BudgetVerdict {
  /** True when neither limit is exceeded. */
  ok: boolean
  /** One entry per violated limit, each naming the measured value and the limit. */
  problems: string[]
}

/** The hard line budget for `AGENTS.md`. */
export const MAX_LINES: number

/** The hard character budget for `AGENTS.md`, in Unicode code points. */
export const MAX_CHARS: number

/**
 * Measure a document against the budget's counting rules.
 *
 * @param text - the document, already decoded to a string.
 */
export function measure(text: string): AgentsMdMetrics

/**
 * Compare a measurement against the two independent limits.
 *
 * @param metrics - the result of {@link measure}.
 */
export function checkBudget(metrics: AgentsMdMetrics): BudgetVerdict

/**
 * Find numbered rules that have no long-form page of their own.
 *
 * @param text - the document, already decoded to a string.
 * @returns one message per numbered rule with no `docs/rules/` or `RELEASING.md` link.
 */
export function structuralProblems(text: string): string[]

/**
 * Format the failure message for one failing run.
 *
 * @param metrics - the result of {@link measure}.
 * @param problems - the combined verdict from {@link checkBudget} and {@link structuralProblems}.
 * @returns the multi-line message, without a trailing newline.
 */
export function report(metrics: AgentsMdMetrics, problems: string[]): string
