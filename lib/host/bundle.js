/**
 * Bundle metadata helpers.
 *
 * These translate what the profile manager reports into the fields the tab
 * renders. Pure functions again: given the same bundle they answer the same
 * thing, which is what makes them testable.
 *
 * @module dsh-plugin-upgrader/lib/bundle
 */
/**
 * Classify how a profile dependency was declared.
 *
 * @param source - `BundleInfo.source`.
 * @returns the source family.
 */
export function sourceKind(source) {
    if (typeof source !== 'string' || source.trim() === '')
        return 'unknown';
    const value = source.trim();
    if (value.startsWith('file:') || value.startsWith('link:') || value.startsWith('.') || value.startsWith('/')) {
        return 'path';
    }
    if (/^(git|git\+|github:|https?:\/\/[^/]*\.git)/.test(value))
        return 'git';
    if (/\.(tgz|tar\.gz)$/.test(value))
        return 'tarball';
    if (/^(npm:|[\^~]?\d|[\^~]?(latest|next|beta|canary|rc)\b)/.test(value))
        return 'registry';
    return 'unknown';
}
/**
 * Localized metadata value for the active display language.
 *
 * @param text - a string or `{ en, zh, … }`.
 * @param locale - the requested language.
 * @returns the best available text.
 */
export function pickText(text, locale) {
    if (typeof text === 'string')
        return text;
    if (text !== null && typeof text === 'object') {
        const record = text;
        return record[locale] ?? record.en ?? record.zh ?? Object.values(record)[0];
    }
    return undefined;
}
/**
 * Keep an icon only when it is cheap to send.
 *
 * Bundle metadata often embeds a base64 data URL, which would bloat every
 * overview response by ~150 KB.
 *
 * @param icon - the manifest icon.
 * @param limit - the largest inline data URL worth sending.
 * @returns a usable reference.
 */
export function inlineIcon(icon, limit) {
    if (typeof icon !== 'string' || icon === '')
        return undefined;
    return icon.startsWith('data:') && icon.length > limit ? undefined : icon;
}
/**
 * The registry this tab reads versions from.
 *
 * Three layers, in order: the choice saved in this plugin's own config, then
 * whatever the manager was configured with, then whatever pnpm itself names.
 * `null` means "not configured", not "no registry": pnpm always has one, and
 * the last resort is the public registry.
 *
 * The saved choice wins because it is the only one the user can change from
 * this page, and a choice that only affected installs would make the version
 * list answer from a different source than the one a click would fetch from.
 *
 * @param registries - manager answer.
 * @param preferred - the choice saved in this plugin's config, if any.
 * @returns a URL without a trailing slash.
 */
export function registryBase(registries, preferred) {
    const chosen = typeof preferred === 'string' && preferred.trim() !== '' ? preferred : null;
    const candidate = chosen ?? registries?.registry ?? registries?.resolved ?? null;
    const value = typeof candidate === 'string' && candidate !== '' ? candidate : 'https://registry.npmjs.org/';
    return value.replace(/\/+$/, '');
}
//# sourceMappingURL=bundle.js.map