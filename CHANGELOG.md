# Changelog

## Unreleased

- **Rewritten in TypeScript.** The whole project is now typed; `npm run typecheck`
  covers both the host program and the tests.
- **The browser half is split into modules** (`src/client/`) instead of one 1100-line
  file: components, copy, styles, hooks, api and formatting each live on their own.
  esbuild bundles them back into the single `lib/client.js` the DSH client loader
  expects.
- **A real build step.** `npm run build` runs `tsc` for the host half and `esbuild`
  for the client half; `lib/` is the published artifact and is git-ignored.
- `npm run check` now means typecheck + build + test, and CI runs it on every push.

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
