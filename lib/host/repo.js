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
/**
 * Turn any of the shapes npm allows for `repository` into an https URL.
 *
 * Handles `owner/repo`, `github:owner/repo`, `git@host:owner/repo.git`,
 * `git+https://…`, and plain URLs; returns `undefined` for anything else.
 *
 * @param raw - the manifest field.
 * @returns an https URL without a trailing slash.
 */
export function normalizeRepoUrl(raw) {
    const text = typeof raw === 'string'
        ? raw
        : raw !== null && typeof raw === 'object' && typeof raw.url === 'string'
            ? raw.url
            : undefined;
    if (text === undefined)
        return undefined;
    let value = text.trim();
    if (value === '')
        return undefined;
    const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(value);
    if (shorthand !== null)
        value = `https://github.com/${shorthand[1]}`;
    else if (value.startsWith('git@'))
        value = `https://${value.slice(4).replace(':', '/')}`;
    else if (value.startsWith('ssh://git@'))
        value = `https://${value.slice('ssh://git@'.length)}`;
    else
        value = value.replace(/^git\+/, '');
    value = value.replace(/\.git$/, '').replace(/\/+$/, '');
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
            return undefined;
        parsed.hash = '';
        parsed.search = '';
        return parsed.toString().replace(/\/+$/, '');
    }
    catch {
        return undefined;
    }
}
/**
 * Is this a github.com URL?
 *
 * @param url - an absolute URL.
 * @returns whether the host is GitHub.
 */
export function isGithubUrl(url) {
    try {
        return /^(www\.)?github\.com$/.test(new URL(url).hostname);
    }
    catch {
        return false;
    }
}
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
export function githubUrlOf(packument, manifest) {
    const direct = [
        normalizeRepoUrl(manifest?.repository),
        normalizeRepoUrl(packument?.repository),
    ].find((url) => url !== undefined && isGithubUrl(url));
    if (direct !== undefined)
        return direct;
    const fallbacks = [
        normalizeRepoUrl(packument?.homepage),
        normalizeRepoUrl(manifest?.homepage),
        normalizeRepoUrl(packument?.bugs),
    ];
    return fallbacks.find((url) => url !== undefined && isGithubUrl(url));
}
/**
 * The repository a packument points at, independent of any version row.
 *
 * @param packument - the registry document.
 * @returns an https GitHub URL.
 */
export function repoUrlOf(packument) {
    const latest = packument?.['dist-tags']?.latest;
    const manifest = typeof latest === 'string' ? packument?.versions?.[latest] : undefined;
    return githubUrlOf(packument, manifest);
}
//# sourceMappingURL=repo.js.map