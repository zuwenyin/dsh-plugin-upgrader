# Changelog

## 1.0.1 — 2026-10-23

- **Rewritten in TypeScript.** The whole project is now typed; `pnpm run typecheck`
  covers both the host program and the tests.
- **The browser half is split into modules** (`src/client/`) instead of one 1100-line
  file: components, copy, styles, hooks, api and formatting each live on their own.
  esbuild bundles them back into the single `lib/client.js` the DSH client loader
  expects.
- **A real build step.** `pnpm run build` runs `tsc` for the host half and `esbuild`
  for the client half; `lib/` is the published artifact and is git-ignored.
- **`pnpm run dev` watches both halves.** `tsc --watch` keeps `lib/index.js` and
  `lib/host/**` current while the esbuild context rebuilds `lib/client.js`; a failed
  client build keeps the last good file on disk instead of truncating it.
- **pnpm replaces npm** as the package manager (`packageManager` is pinned);
  `pnpm-lock.yaml` is the lockfile CI installs from.
- `pnpm run check` now means typecheck + build + test, and CI runs it on every push.
- **The row checkbox is drawn by the plugin.** `<input type="checkbox">` rendered
  unchecked in the Harness window even when its `checked` state was set (the tick was
  painted by the native control the app's WebView never drew), so selection looked
  broken while the selection bar still counted the rows. The box is now a styled
  element driven by `aria-checked`, and it looks identical on every platform.
- **A 4.9× smaller package.** The published tarball drops from 196.5 KB to 50.4 KB
  because `files` no longer ships `screenshots/` (130 KB of storefront images),
  `screenshots.json`, `RELEASING.md` or `src/**/*.ts` — none of them are read at
  runtime, and the sources are on GitHub. Sourcemaps *are* shipped now: every
  `lib/*.js` ends with a `sourceMappingURL` comment, so leaving the maps out only
  produced 404s in the consumer's devtools.

## 1.0.0

First public release.

- **Versions tab** on the DeepSeek Harness Plugins page, next to *Installed* and *Discover*.
- **One-click upgrade** of every upgradable plugin, with progress, per-plugin results and failure reasons.
- **Multi-select upgrade**: tick a subset and upgrade only those.
- **Version history and rollback**: every published version with its publish date, engine requirement and deprecation notice; one click switches to it.
- **GitHub links**: `GH` opens the repository homepage, a version number opens that version's release page.
- Routes are loopback-only; the enabled / disabled state of a plugin survives an upgrade; one batch at a time with adoption of work in progress.

### Notes

- Switching versions is a remove + install, because `installBundle` refuses an already-installed package name (`already-installed`). The same path the official Update action takes.
- A version without its own git tag falls back to the repository's release feed, so no version link is a dead end.
