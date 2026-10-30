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
 * Registry base URL: `null` is pnpm's own configured registry.
 *
 * @param registries - manager answer.
 * @returns a URL without a trailing slash.
 */
export declare function registryBase(registries: RegistryReport | undefined | null): string;
//# sourceMappingURL=bundle.d.ts.map