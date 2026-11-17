/**
 * The pnpm settings that decide how long one install spends retrying.
 *
 * pnpm 11 verifies every lockfile entry against the registry before an install
 * finishes, with its own 64-way fan-out. On a mirror that drops concurrent
 * connections that fan-out produces `ETIMEDOUT`s, and pnpm's stock backoff waits
 * ten seconds, then a minute, per retry — a single batch measured two minutes of
 * wall clock on entries that had already resolved in three seconds.
 *
 * The cure is entirely in the timeout numbers, not in the fanned-out count: a
 * shorter `fetchTimeout` fails a wedged connection quickly instead of hanging on
 * it, and a sub-second `fetchRetryMintimeout` turns each retry into a rounding
 * error rather than a stall. Neither raises the number of requests, so the
 * supply-chain policy still runs and still gates the install; only the waiting
 * changes. Measured on this profile: 2m14s → 24s for a cold verification, and
 * 4m8s → 48.8s for a real `pnpm add`.
 *
 * These keys have exactly one home. pnpm reads them from `pnpm-workspace.yaml`
 * in the directory it runs in; the same names in `.npmrc` are silently ignored
 * (verified with `pnpm config get fetch-retries` → undefined), the child process
 * environment is scrubbed by the host, and `installBundle` accepts no CLI
 * arguments. So the profile's own workspace file is the only place a plugin can
 * put them.
 *
 * The edit is deliberately the smallest one that can work: append the keys that
 * are missing at the end of the file and touch nothing else. pnpm writes to the
 * same file itself (`allowBuilds`, `minimumReleaseAgeExclude`), and rewriting it
 * from here would race those writes and reformat a list this module has no
 * business parsing. A key the user already set is left exactly as they set it —
 * including a value this module would not have chosen.
 *
 * @module dsh-plugin-upgrader/host/pnpm-tuning
 */
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { withManifestLock, type ManifestLockOptions } from './lock.ts'

/** The file pnpm reads its settings from, relative to the profile directory. */
export const TUNING_FILE = 'pnpm-workspace.yaml'

/**
 * Where the untouched original is kept.
 *
 * Written once, before the first edit, and never overwritten: the useful thing
 * to have afterwards is what the file looked like before this plugin touched
 * it, not what it looked like before the last batch.
 */
export const TUNING_BACKUP_FILE = 'pnpm-workspace.yaml.upgrader-bak'

/** One setting this module knows how to add. */
export interface TuningSetting {
  /** The camelCase spelling pnpm accepts in a workspace manifest. */
  key: string
  /** The value written, in milliseconds. */
  value: number
  /**
   * Other spellings that mean the same setting.
   *
   * A hand-written file may use pnpm's kebab-case CLI spelling. Treating those
   * as already-set is what keeps this module from writing a second value for a
   * key the user already controlled.
   */
  aliases?: readonly string[]
}

/**
 * The settings added before a batch.
 *
 * `fetchRetries: 4` with a 500 ms floor and a 2.5 s ceiling keeps the total
 * wait for one dropped connection under ten seconds, where pnpm's defaults
 * (2 retries, 10 s → 60 s) take over two minutes. `fetchTimeout: 30000` is the
 * least aggressive value that still beat the defaults reproducibly; it also
 * feeds undici's connect/headers/body timeouts, which is why lowering it is
 * what makes a wedged connection give up.
 */
export const TUNING_SETTINGS: readonly TuningSetting[] = [
  { key: 'fetchRetries', value: 4, aliases: ['fetch-retries'] },
  { key: 'fetchRetryMintimeout', value: 500, aliases: ['fetch-retry-mintimeout'] },
  { key: 'fetchRetryMaxtimeout', value: 2500, aliases: ['fetch-retry-maxtimeout'] },
  { key: 'fetchTimeout', value: 30000, aliases: ['fetch-timeout'] },
]

/**
 * Why a tuning pass did not write anything.
 *
 * `lock-busy` is the one worth naming separately: it means another operation was
 * writing the profile, so nothing was read or written and the batch simply runs
 * with whatever the file already says. The rest are failures worth logging.
 */
export type TuningSkipReason = 'lock-busy' | 'no-profile' | 'unreadable' | 'write-failed'

/** What one tuning pass did. */
export interface TuningResult {
  /** `written` added at least one key, `unchanged` found them all, `skipped` did nothing. */
  status: 'written' | 'unchanged' | 'skipped'
  /** The keys this pass appended, in file order. */
  added: readonly string[]
  /** Set only when `status` is `skipped`. */
  reason?: TuningSkipReason
  /** Detail for the log line: the filesystem error, or the lock holder. */
  detail?: string
  /** Whether a backup was created by this pass. */
  backup?: boolean
}

/**
 * Collect the keys already present at the top level of a workspace manifest.
 *
 * Top level only: `minimumReleaseAgeExclude` is a list, and a nested key that
 * happens to be called `fetchTimeout` belongs to somebody else's section. Lines
 * inside a block scalar are skipped too, which is why indentation is the test
 * rather than "contains a colon".
 *
 * @param text - the file's contents.
 * @returns the lowercase keys found, for case-insensitive comparison.
 */
export function topLevelKeys(text: string): Set<string> {
  const keys = new Set<string>()
  for (const line of text.split(/\r?\n/u)) {
    if (line === '' || /^\s/u.test(line)) continue
    const match = /^([A-Za-z0-9_$][\w$.-]*)\s*:/u.exec(line)
    if (match === null) continue
    keys.add(match[1]!.toLowerCase())
  }
  return keys
}

/**
 * Pick the settings a given file still needs.
 *
 * @param text - the file's current contents.
 * @param settings - the settings to consider; defaults to {@link TUNING_SETTINGS}.
 * @returns the settings whose name is absent, in declaration order.
 */
export function missingSettings(
  text: string,
  settings: readonly TuningSetting[] = TUNING_SETTINGS,
): TuningSetting[] {
  const present = topLevelKeys(text)
  return settings.filter(
    (setting) =>
      !present.has(setting.key.toLowerCase()) &&
      !(setting.aliases ?? []).some((alias) => present.has(alias.toLowerCase())),
  )
}

/**
 * Build the file's new contents by appending only what is missing.
 *
 * Everything that was already there is preserved byte for byte, including the
 * comment header, the quoting style of the exclude list, and a missing final
 * newline (which is supplied rather than duplicated).
 *
 * @param text - the file's current contents.
 * @param settings - the settings to append; usually the result of
 *   {@link missingSettings}.
 * @returns the new contents.
 */
export function appendSettings(text: string, settings: readonly TuningSetting[]): string {
  if (settings.length === 0) return text
  const head = text === '' || text.endsWith('\n') ? text : `${text}\n`
  const separator = head === '' || head.endsWith('\n\n') ? '' : '\n'
  const comment =
    '# Added by dsh-plugin-upgrader so pnpm retries stop dominating an install.\n' +
    '# Turn it off in the Versions tab; deleting these lines has the same effect.\n'
  const body = settings.map((setting) => `${setting.key}: ${String(setting.value)}\n`).join('')
  return `${head}${separator}${comment}${body}`
}

/**
 * Add the tuning keys to a profile's workspace manifest.
 *
 * Runs inside the profile writer lock, because this file sits beside the
 * manifest and a write that raced pnpm's own edit would lose one side's change.
 * When the lock cannot be taken nothing is read or written — the batch runs with
 * the settings already on disk, which is exactly what the profile had before
 * this feature existed.
 *
 * @param dir - the profile directory, or `undefined` when the host did not say.
 * @param options - lock tuning, forwarded to {@link withManifestLock}.
 * @returns what happened, for the run log.
 */
export function applyTuning(dir: string | undefined, options: ManifestLockOptions = {}): TuningResult {
  if (typeof dir !== 'string' || dir.trim() === '') {
    return { status: 'skipped', added: [], reason: 'no-profile' }
  }
  const outcome = withManifestLock(
    dir,
    () => writeTuning(dir),
    options,
  )
  if (outcome === undefined) {
    return { status: 'skipped', added: [], reason: 'lock-busy' }
  }
  return outcome
}

/**
 * The body of {@link applyTuning}, already inside the lock.
 *
 * @param dir - the profile directory.
 * @returns what happened.
 */
function writeTuning(dir: string): TuningResult {
  const target = join(dir, TUNING_FILE)
  let current = ''
  let existed = false
  try {
    current = readFileSync(target, 'utf8')
    existed = true
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'ENOENT') {
      return { status: 'skipped', added: [], reason: 'unreadable', detail: messageOf(error) }
    }
  }

  const missing = missingSettings(current)
  if (missing.length === 0) return { status: 'unchanged', added: [] }

  let backup = false
  if (existed) {
    try {
      if (!existsSync(join(dir, TUNING_BACKUP_FILE))) {
        copyFileSync(target, join(dir, TUNING_BACKUP_FILE))
        backup = true
      }
    } catch (error) {
      /*
       * No backup, no edit. The whole point of the copy is that the change is
       * reversible without this plugin; an edit that skipped it would be the one
       * case where a user cannot get their file back.
       */
      return { status: 'skipped', added: [], reason: 'write-failed', detail: messageOf(error) }
    }
  }

  const temporary = `${target}.upgrader-tmp`
  try {
    writeFileSync(temporary, appendSettings(current, missing), 'utf8')
    renameSync(temporary, target)
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The failure being reported is the write itself.
    }
    return { status: 'skipped', added: [], reason: 'write-failed', detail: messageOf(error), backup }
  }
  return { status: 'written', added: missing.map((setting) => setting.key), backup }
}

/**
 * Turn a thrown value into a log-safe string.
 *
 * @param error - the caught value.
 * @returns its message.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
