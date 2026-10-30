/**
 * Repository-URL normalisation.
 *
 * A registry packument can declare its `repository` in half a dozen shapes, and
 * the tab only ever wants one thing out of it: the https URL of the project
 * page. Turning that into data is pure work, so it lives here rather than in
 * the request handler.
 *
 * @module dsh-plugin-upgrader/lib/repo
 */
/** The manifest fields this module reads. */
export interface RepoManifest {
    repository?: unknown;
    homepage?: unknown;
    bugs?: unknown;
}
/** The shape of the registry document this module reads. */
export interface PackumentLike {
    'dist-tags'?: {
        latest?: unknown;
    } | undefined;
    versions?: Record<string, RepoManifest | undefined> | undefined;
    repository?: unknown;
    homepage?: unknown;
    bugs?: unknown;
}
/**
 * Turn any of the shapes npm allows for `repository` into an https URL.
 *
 * Handles `owner/repo`, `github:owner/repo`, `git@host:owner/repo.git`,
 * `git+https://…`, and plain URLs; returns `undefined` for anything else.
 *
 * @param raw - the manifest field.
 * @returns an https URL without a trailing slash.
 */
export declare function normalizeRepoUrl(raw: unknown): string | undefined;
/**
 * Is this a github.com URL?
 *
 * @param url - an absolute URL.
 * @returns whether the host is GitHub.
 */
export declare function isGithubUrl(url: string): boolean;
/**
 * The project page a user would recognise as "the plugin's GitHub".
 *
 * `repository` wins; `homepage`/`bugs` are only used when they point at GitHub,
 * so a marketing site never stands in for the source link.
 *
 * @param packument - the registry document.
 * @param manifest - one version manifest.
 * @returns an https GitHub URL.
 */
export declare function githubUrlOf(packument: PackumentLike | undefined, manifest: RepoManifest | undefined): string | undefined;
/**
 * The repository a packument points at, independent of any version row.
 *
 * @param packument - the registry document.
 * @returns an https GitHub URL.
 */
export declare function repoUrlOf(packument: PackumentLike | undefined): string | undefined;
//# sourceMappingURL=repo.d.ts.map