/**
 * Bundle metadata helpers.
 *
 * These translate what the profile manager reports into the fields the tab
 * renders. Pure functions again: given the same bundle they answer the same
 * thing, which is what makes them testable.
 *
 * @module dsh-plugin-upgrader/lib/bundle
 */
/** How a profile dependency was declared. */
export type SourceKind = 'registry' | 'path' | 'git' | 'tarball' | 'unknown';
/** The display languages this bundle ships. */
export type Locale = 'zh' | 'en';
/**
 * Classify how a profile dependency was declared.
 *
 * @param source - `BundleInfo.source`.
 * @returns the source family.
 */
export declare function sourceKind(source: unknown): SourceKind;
/**
 * Localized metadata value for the active display language.
 *
 * @param text - a string or `{ en, zh, … }`.
 * @param locale - the requested language.
 * @returns the best available text.
 */
export declare function pickText(text: unknown, locale: Locale): string | undefined;
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
export declare function inlineIcon(icon: unknown, limit: number): string | undefined;
/** What `pluginManager.registries()` reports. */
export interface RegistryReport {
    registry?: string | null;
    resolved?: string | null;
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
export declare function registryBase(registries: RegistryReport | undefined | null, preferred?: string | null): string;
//# sourceMappingURL=bundle.d.ts.map