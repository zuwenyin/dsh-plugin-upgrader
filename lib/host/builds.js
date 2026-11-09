/**
 * Which build scripts the profile has not decided about yet.
 *
 * pnpm will not run a dependency's install scripts unless the profile allows
 * them, and the host's manager records the refusal instead of guessing: it
 * writes the package into `allowBuilds` in `pnpm-workspace.yaml` with a
 * placeholder value and then fails the install. The decision belongs to the
 * user — approving runs someone else's code — so the refusal has to be visible
 * as a decision, not as a generic install failure that repeats forever.
 *
 * The manager keeps that list to itself: `recordPendingBuilds` and
 * `approveBuilds` are internal to its install path and are not part of the
 * package's exports, and an install that fails returns after the write with
 * nothing else to read. So this module reads the one file those functions
 * write, and reads it narrowly: no YAML parser, no dependency, and only the
 * shape the manager itself produces.
 *
 * @module dsh-plugin-upgrader/lib/builds
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * The placeholder the manager writes for a build nobody has answered for.
 *
 * Matched as an exact string, not as "anything that is not a boolean": once the
 * question is answered `allowBuilds` holds `true` or `false`, so this literal is
 * the only "still asking" state there is. A typo in a hand-edited file then
 * stays a typo instead of turning into an approval prompt.
 */
export const PENDING_BUILD = 'set this to true or false';
/** The pnpm settings file the build policy lives in. */
const WORKSPACE_FILE = 'pnpm-workspace.yaml';
/** The map inside that file. */
const SECTION = 'allowBuilds';
/**
 * Keys carrying a wildcard are patterns rather than package names.
 *
 * The manager skips them for the same reason: a pattern is never a single
 * package whose scripts could be approved, and pnpm matches it against
 * everything the profile installs.
 */
const PATTERN = /[*?]/;
/** A top-level key, which ends the section. */
const TOP_LEVEL = /^([A-Za-z0-9_.-]+):(.*)$/;
/** One `key: value` pair indented under the section. */
const ENTRY = /^\s+(.+?):(.*)$/;
/**
 * Read the scalar a pair's right-hand side holds.
 *
 * Unquotes the value and drops one trailing comment. YAML would allow far more
 * than this; the file is written by the manager, so the scalar is either a
 * boolean or the placeholder, and a hand edit that stays within those is read
 * the same way.
 *
 * @param raw - the text after the colon.
 * @returns the scalar, without quotes or a trailing comment.
 */
function scalarOf(raw) {
    let text = raw.trim();
    const comment = text.indexOf(' #');
    if (comment !== -1)
        text = text.slice(0, comment).trim();
    const quoted = (text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'));
    if (quoted && text.length >= 2)
        text = text.slice(1, -1);
    return text.trim();
}
/**
 * Read the pairs of a flow mapping written on the section's own line.
 *
 * `allowBuilds: { pkg: true }` is a perfectly good way to write the same thing,
 * and a file edited by hand may use it. Only the shape matters here, so this
 * splits on commas rather than parsing YAML.
 *
 * @param rest - everything after the colon on the section line.
 * @param into - the list to append pending keys to.
 */
function readFlowSection(rest, into) {
    const text = rest.trim();
    if (!text.startsWith('{'))
        return;
    const body = text.endsWith('}') ? text.slice(1, -1) : text.slice(1);
    for (const pair of body.split(',')) {
        const colon = pair.indexOf(':');
        if (colon === -1)
            continue;
        const key = scalarOf(pair.slice(0, colon));
        if (key === '' || PATTERN.test(key))
            continue;
        if (scalarOf(pair.slice(colon + 1)) === PENDING_BUILD)
            into.push(key);
    }
}
/**
 * Every package in this profile whose build scripts are still undecided.
 *
 * @param dir - the profile directory, or undefined when it is unknown.
 * @returns the `allowBuilds` keys, as `name@version`, in file order.
 */
export function readPendingBuilds(dir) {
    if (typeof dir !== 'string' || dir === '')
        return [];
    let text;
    try {
        text = readFileSync(join(dir, WORKSPACE_FILE), 'utf8');
    }
    catch {
        /*
         * No file is not an error: a profile that never installed a package with
         * build scripts has none, and neither has one whose manager has not written
         * a policy yet. Reporting a read failure here would put a banner on a page
         * that is working correctly.
         */
        return [];
    }
    /** Keys whose value is the placeholder, in the order the file lists them. */
    const pending = [];
    let inside = false;
    for (const line of text.split(/\r?\n/)) {
        if (line.trim() === '')
            continue;
        if (line.trimStart().startsWith('#'))
            continue;
        const indented = line.startsWith(' ') || line.startsWith('\t');
        if (!indented) {
            const match = TOP_LEVEL.exec(line);
            inside = match !== null && match[1] === SECTION;
            if (inside && match !== null)
                readFlowSection(match[2], pending);
            continue;
        }
        if (!inside)
            continue;
        const entry = ENTRY.exec(line);
        if (entry === null)
            continue;
        const key = scalarOf(entry[1]);
        if (key === '' || PATTERN.test(key))
            continue;
        if (scalarOf(entry[2]) === PENDING_BUILD)
            pending.push(key);
    }
    return pending;
}
/**
 * The entries of {@link readPendingBuilds} that belong to one package.
 *
 * The list is the whole profile's, so a failed install of one package also
 * reports the packages that were already waiting. Approving them together would
 * decide for code the user never asked about, so every caller narrows first.
 *
 * @param pending - the profile's list.
 * @param name - the package to narrow to.
 * @returns the entries for that package, as `name@version`.
 */
export function pendingFor(pending, name) {
    if (typeof name !== 'string' || name === '')
        return [];
    const prefix = `${name}@`;
    return pending.filter((key) => key === name || key.startsWith(prefix));
}
//# sourceMappingURL=builds.js.map