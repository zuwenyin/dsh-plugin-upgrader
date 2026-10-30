import type { ChangeResult, PluginManager, StepRecord } from './manager.ts';
/** Progress sink for one job. */
export type LogSink = (message: string) => void;
/**
 * Called with the id of the installation currently in flight.
 *
 * `runStep` mints the id it hands the manager, and cancellation needs exactly
 * that id: the manager answers `not-running` for anything else. Reporting it
 * here lets the job record stay cancellable across the whole step, including
 * the removal a version replacement starts with.
 */
export type RequestIdSink = (requestId: string) => void;
/** One step's outcome, including every failure stage. */
export interface StepOutcome {
    name: string;
    version: string;
    spec: string;
    requestId: string;
    ok: boolean;
    enabled?: boolean;
    application?: ChangeResult['application'];
    changed?: boolean;
    stage?: 'install' | 'remove' | 'enable';
    restartReason?: string;
    message?: string;
    detail?: string;
    pendingBuilds?: string[];
    warnings?: string[];
    packageResult?: {
        exitCode: number;
        kind?: string;
        timedOut?: boolean;
        tail?: string;
    };
}
/** Allowed per-step actions. */
export declare const ACTIONS: Set<string>;
/**
 * Re-apply the enabled state a step asked for after the package was replaced.
 *
 * `installBundle` activates what it installs, so a disabled plugin would
 * otherwise come back enabled; the bundle switch is the persistent lever.
 *
 * @param manager - the plugin manager.
 * @param step - the step that just ran.
 * @param wanted - the state to restore, if any.
 * @param log - progress sink.
 * @returns the state now in effect, if known.
 */
export declare function restoreEnabledState(manager: PluginManager, step: Pick<StepRecord, 'name'>, wanted: boolean | undefined, log: LogSink): Promise<boolean | undefined>;
/**
 * Put a bundle back in the profile's selection after a failed replacement.
 *
 * `removeBundle` has to deselect the bundle to get the loader to drop its rows,
 * and a step that removes but then fails to install leaves it deselected: the
 * package stays in `dependencies`, the code stays on disk, and nothing loads it
 * — the plugin simply disappears from the page with no way back except the same
 * toggle by hand. This is the recovery for that window.
 *
 * Best effort by design: the step has already failed for the reported reason,
 * and turning a recovery failure into a louder second error would bury it.
 *
 * @param manager - the plugin manager.
 * @param name - the bundle to re-select.
 * @param log - progress sink.
 * @returns whether the bundle was re-selected.
 */
export declare function restoreSelection(manager: PluginManager, name: string, log: LogSink): Promise<boolean>;
/**
 * Run one step: install the exact version, falling back to remove + install,
 * then restore the plugin's previous enabled state.
 *
 * Every outcome — including a thrown manager call — comes back as one record so
 * the job log can report per-plugin success without a second error channel.
 *
 * @param manager - the plugin manager.
 * @param step - the requested change.
 * @param log - progress sink.
 * @param announce - receives the request id the step installs under.
 * @param registry - the registry chosen in this plugin's config, if any.
 * @returns the outcome record.
 */
export declare function runStep(manager: PluginManager, step: StepRecord, log: LogSink, announce?: RequestIdSink, registry?: string): Promise<StepOutcome>;
/**
 * Whether a step names something this plugin is willing to install.
 *
 * @param step - one element of the request body.
 * @returns an error code, or undefined when valid.
 */
export declare function validateStep(step: unknown): string | undefined;
//# sourceMappingURL=install.d.ts.map