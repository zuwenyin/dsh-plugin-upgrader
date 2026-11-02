/**
 * How this host was started, in terms a person can act on.
 *
 * A change the manager reports as `restart-required` can only be finished by
 * restarting the process that refused it, and nothing here can do that to
 * itself: the desktop shell exposes no relaunch channel to a page, and a host
 * started from a terminal has nobody to start it again. What the page *can* do
 * is name the one action that finishes the job, and for that it needs two
 * facts that only the host process has — whether it was started by the desktop
 * app or by a command line, and what that command line was.
 *
 * `pid` is the load-bearing half of the answer. Every other field describes the
 * profile, which survives a restart untouched; the pid is the only value that
 * tells a polling page whether the host answering it is still the old one.
 *
 * @module dsh-plugin-upgrader/host/hostinfo
 */

/**
 * Who started this process.
 *
 * `desktop` means the Electron shell owns the lifecycle and the user finishes
 * the restart by quitting and reopening the app; `cli` means the host *is* the
 * terminal command and the user finishes it by running that command again.
 */
export type HostKind = 'desktop' | 'cli'

/** What `/api/plugin-upgrader/host` answers with. */
export interface HostInfo {
  /** The process id; a restart is the only thing that changes it. */
  pid: number
  /** When this process started, in the same clock as `Date.now()`. */
  startedAt: number
  kind: HostKind
  /** The profile directory's last path segment, for display only. */
  profileName: string | null
  /** The profile directory this host opened, when it could be resolved. */
  profileDir: string | null
  /** A command line that starts this same host again; empty for `desktop`. */
  command: string
}

/** The entry point the desktop shell spawns for its host child process. */
const DESKTOP_ENTRY = /[\\/]dsh-desktop-host[\\/]lib[\\/]index\.js$/i

/**
 * Decide who owns this process's lifecycle from its entry point.
 *
 * The check is on the entry script rather than on an environment variable
 * because the entry script is what the shell actually executes: the desktop
 * shell runs `dsh-desktop-host/lib/index.js` and nothing else in this install
 * runs from that path.
 *
 * @param entry - `process.argv[1]`, possibly absent.
 * @returns which kind of start this was.
 */
export function hostKindOf(entry: string): HostKind {
  return DESKTOP_ENTRY.test(entry) ? 'desktop' : 'cli'
}

/**
 * Quote one argument for the platform's shell.
 *
 * Only the case a person can paste is handled: an argument with whitespace is
 * wrapped in double quotes, which both `cmd.exe` and POSIX shells accept.
 *
 * @param argument - one raw argv entry.
 * @returns the entry as it would be typed.
 */
function quoted(argument: string): string {
  return /\s/.test(argument) ? `"${argument}"` : argument
}

/**
 * Rebuild the command that started this process.
 *
 * The desktop shell is deliberately answered with an empty string: its host is
 * a child of the app, and replaying the child's own command line would start a
 * second host holding the same profile. The instruction that actually works
 * there is "quit the app and open it again", which the page writes itself.
 *
 * @param execPath - `process.execPath`.
 * @param argv - `process.argv`.
 * @param kind - who owns the lifecycle.
 * @returns the command line, or an empty string when there is none to give.
 */
export function relaunchCommand(execPath: string, argv: readonly string[], kind: HostKind): string {
  if (kind === 'desktop') return ''
  const rest = argv.slice(1).map(quoted).join(' ')
  return rest === '' ? quoted(execPath) : `${quoted(execPath)} ${rest}`
}

/**
 * Assemble the answer for one host process.
 *
 * Pure on purpose: the pid, the start time and the profile directory are all
 * inputs, so the shape can be tested without a host.
 *
 * @param input - the facts the process has about itself.
 * @returns what the page may show.
 */
export function buildHostInfo(input: {
  pid: number
  startedAt: number
  execPath: string
  argv: readonly string[]
  profileDir: string | null
}): HostInfo {
  const kind = hostKindOf(input.argv[1] ?? '')
  const profileDir = input.profileDir
  const profileName =
    profileDir === null
      ? null
      : (profileDir
          .split(/[\\/]/)
          .filter((segment) => segment !== '')
          .at(-1) ?? null)
  return {
    pid: input.pid,
    startedAt: input.startedAt,
    kind,
    profileName,
    profileDir,
    command: relaunchCommand(input.execPath, input.argv, kind),
  }
}
