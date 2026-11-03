import { type UpgraderConfig } from './host/config.ts';
import { type StepOutcome } from './host/install.ts';
import { type Phase } from './host/progress.ts';
import { type HostContext } from './host/manager.ts';
/**
 * The plugin's config schema, read by the loader before `apply` runs.
 *
 * Exported as a value rather than declared inside `apply` because the loader
 * looks for `Config` on the module namespace itself; a schema the running
 * plugin never exposes is a schema the settings page cannot find.
 */
export { Config } from './host/config.ts';
/** Stable plugin name; matches the cordis.patch.yml insert id. */
export declare const name = "plugin-upgrader";
/** The web server is the only hard dependency; pluginManager is read lazily. */
export declare const inject: string[];
/** Lifecycle of one batch. */
type JobStatus = 'queued' | 'running' | 'finished' | 'cancelled';
/** One batch of steps, as the browser polls it. */
interface JobRecord {
    id: string;
    status: JobStatus;
    total: number;
    done: number;
    failed: number;
    results: StepOutcome[];
    log: string[];
    /** Characters kept in `log`, so a chatty pnpm run cannot grow without limit. */
    logChars: number;
    cancelled: boolean;
    startedAt: number;
    finishedAt?: number;
    heartbeatAt?: number;
    /** The step being worked on, when one is in flight. */
    current?: string;
    /** When that step started, so the panel can show a live elapsed time. */
    stepStartedAt?: number;
    /** What that step is doing right now. */
    phase?: Phase;
    /**
     * The last thing pnpm printed, trimmed.
     *
     * A phase alone cannot distinguish "downloading" from "stuck on the eleventh
     * registry timeout", and those look identical to somebody watching a clock
     * climb. This is the newest non-blank line, so the panel can show the actual
     * work instead of only its category.
     */
    activity?: string;
    /** 1-based number of the registry being tried, and how many there are. */
    attempt?: {
        index: number;
        total: number;
        registry: string | null;
    };
    cacheDirty?: boolean;
    abandoned?: boolean;
    /**
     * The request ids this job has run under, newest last.
     */
    requestIds: string[];
}
/**
 * The state that has to outlive a module replacement.
 *
 * `jobs` is keyed by job id and read by the poll route; `live` is the batch the
 * manager events belong to. Both are reached through `globalThis` so a
 * replacement module instance adopts a batch that is still running rather than
 * answering `unknown-job` for it.
 */
interface JobStore {
    jobs: Map<string, JobRecord>;
    /** The job manager events belong to, while one is running. */
    live: JobRecord | null;
    /** The installation the manager is currently running, for cancellation. */
    inFlight: {
        requestId: string;
    } | null;
}
/**
 * The shared batch store, created once per process.
 *
 * Read through `globalThis` rather than a module-level constant: a replaced
 * module gets a fresh scope, so a module-level map would be empty again and the
 * very batch that caused the replacement would vanish.
 *
 * Exported so a test can prove a re-evaluated module adopts the same map
 * instead of starting empty — which is the whole point of keeping it off the
 * module scope.
 *
 * @returns the process-wide store.
 */
export declare function sharedJobStore(): JobStore;
/**
 * Mount the host half.
 *
 * @param ctx - the plugin context.
 * @param config - the validated config; `registry` is a live reference, so it
 *   is read per request instead of copied once at load.
 */
export declare function apply(ctx: HostContext, config?: UpgraderConfig): void;
//# sourceMappingURL=index.d.ts.map