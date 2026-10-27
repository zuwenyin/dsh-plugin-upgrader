# Changelog

## 1.1.0 — 2026-10-27

The first published release since 1.0.2: the `1.0.3` entries below shipped in
this version, together with everything listed here.

- **Upgrading a theme plugin no longer leaves the page unstyled.** Replacing an
  appearance plugin (`dsh-dream-skin`, `*-skin-*`, `dsh-client-ui-theme`) unloads
  the code that injected its stylesheet, so the page snaps back to the host's
  default look. The settings are NOT lost — `dsh-dream-skin` keeps them in
  `$DSH_HOME/dream-skin.json`, outside the profile and written atomically, which
  is why that file survives an upgrade untouched — but the injected CSS and the
  `data-*` attributes on `<html>` lived only in the page, and the restarted
  plugin has no way to put them back without being asked. A batch that actually
  replaced such a plugin now says so and reloads the page once, after the plugin
  has restarted, so the look comes back from that file. The reload is skipped for
  failed steps, for steps that changed nothing, and for every ordinary plugin — a
  failed upgrade must not also throw the page away.
- **The upgrader's own row explains itself, and can update itself.** Both halves
  of "这个插件没法管理自己" were real, and they are different problems:
  - *The row was blank.* Installing as `link:`/`file:` made the overview skip the
    registry lookup entirely, so the row showed a version, an arrow with nothing
    after it, and no history. A path install now still reads the published list
    (the directory keeps its own version, which is what is actually loaded) and
    says so, instead of looking like a package that was never published. It stays
    non-upgradable: replacing a `link:` with a registry tarball is a different
    install, not an upgrade.
  - *It could not update itself.* A version change through the batch job starts
    with `removeBundle`, and removing this bundle unloads the very code that
    would run the install that follows — the batch dies with the plugin that was
    driving it, leaving the profile without it. The row now offers the page's own
    installer instead (`plugins.tab` owner prop `install`), which is owned by the
    plugin manager and therefore survives the unload. The batch and "Select all"
    skip this row for the same reason, so one click can no longer strand the
    profile.
- **The version list no longer silently disappears.** Several plugins drew no
  history button and no explanation, which looked like "this package has no
  published versions" — it was a failed registry lookup being swallowed. Three
  separate causes, all measured against `registry.npmmirror.com`:
  - **The tab asked for every package at once.** Eleven concurrent connections
    timed out at the 10 s deadline while the same eleven asked one at a time
    answered in under 1.2 s. Lookups now go through a four-at-a-time cap.
  - **The documents are large.** `billion-context` is a 26 MB packument and
    10 MB even abbreviated, so a healthy request could lose a 10 s race on its
    own. Lookups now ask for npm's abbreviated form
    (`application/vnd.npm.install-v1+json`, which keeps `time`, `engines` and
    `deprecated`), the deadline moved to 20 s, and a transport failure is
    retried once — a `UND_ERR_CONNECT_TIMEOUT` is socket contention, not a
    verdict about the package.
  - **The failure was invisible.** A row whose lookup failed is now drawn with
    the reason (`版本列表读取失败，点「检查更新」可重试`) instead of looking
    like a package with no history. A failed lookup is also cached for a shorter
    window than a successful one, so one bad render does not make the next
    mount slow too.
- **A mirror's stale `latest` tag no longer turns an upgrade into a downgrade.**
  npmmirror serves `@deepseek-ai/dsh-subagent-codex` with `latest: 0.0.1-rc.1`
  while the profile runs `0.2.1-rc.3`, so the row claimed the installed build
  was newer than latest and offered a downgrade as an upgrade. A tag that sorts
  below the installed version is now treated as broken and recovered from the
  published list, preferring a stable release over a prerelease. A prerelease
  that merely sorts above a healthy tag still does not steal `latest`.
- **An upgrade no longer dies on `bundle-in-use`.** Replacing a version means
  remove + install, and `removeBundle` only unloads a bundle it reads as enabled.
  A plugin that is disabled but still holds a live loader fiber therefore went
  straight to the "in use" check and was refused, which made every upgrade of a
  disabled plugin fail. The removal now clears that fiber and retries once.
- **The unload asks the right question.** 1.0.3's follow-up assumed
  `setBundleEnabled(name, false)` reloads unconditionally, so it would dispose the
  fiber. It does not: `selectBundle` returns early when the bundle is already
  deselected, so the manifest does not change, so `reconcileProfile` has no
  dropped row to dispose and the fiber survives — the retry then failed for
  exactly the same reason. The removal now reads `enabled` first and, for a
  bundle the manager already reads as disabled, re-selects it and deselects it
  again, which is the only form of the toggle that produces a change a live
  process can act on.
- **A refusal the host cannot fix says so.** A second `bundle-in-use` now comes
  back with the manager's code *and* a bilingual diagnostic ("the loader still
  holds its plugin row; restart DSH and upgrade again"), and the tab shows the
  diagnostic instead of the bare code. Retrying in the same process cannot clear
  it, so the panel has to name the one action that does. The re-select is also
  undone on the way out, so a failed upgrade never leaves the plugin enabled.
- **The primary button follows the theme.** Its label colour comes from
  `--dsw-alias-label-primary-inverted` instead of a hard-coded white, so it stays
  readable when the host theme uses a light primary fill.
- **Tests**: `test/install.test.ts` covers the replacement path (the remove +
  install fallback and its fresh request id, the unload retry, the
  already-disabled re-select including a refused one, the enabled-state restore,
  and the restart diagnostic on both refusal spellings); `test/registry.test.ts`
  covers the abbreviated request, the single retry, the shorter failure cache and
  the 404-is-not-contention rule; `test/overview.test.ts` fails if a page load
  stops respecting the cap; `test/shape-packument.test.ts` pins the stale-tag
  rule. `scripts/verify-overview-live.mjs` runs the built host half against the
  real mirror.

## 1.0.3 — unreleased as its own version

These changes were staged for 1.0.3, which was never published on its own; they
first shipped in 1.1.0.

- **Upgrades report what pnpm is doing.** The host subscribes to
  `plugin-manager/install-log` and `plugin-manager/install-state`, so pnpm's own
  output ("Verifying lockfile against supply-chain policies", `ETIMEDOUT` retries,
  registry fallbacks) now streams into the job log while the step runs, instead of
  only surfacing after it ends. An upgrade that sits for five minutes on the mirror
  retry ladder finally looks like what it is.
- **The progress bar is honest about long steps.** While a step is in flight the
  panel shows a live elapsed clock, the phase (`installing` / `applying` /
  `cancelling`), the registry attempt when a fallback is in progress, and an
  indeterminate bar. `done/total` only moves when a step really finishes, which
  previously left it pinned at 0% for minutes.
- **Cancel works at every stage.** The second install of a remove + install used to
  pass `requestId: undefined`, so that whole stretch was uncancellable; each install
  now mints its own id and the job reports it back. Cancelling also explains what
  happened: settled already, past the point of no return, or stopping now.
- **The heartbeat is a timer (2 s) instead of a per-step write.** A single step over
  the 15-minute stale window was declared abandoned mid-work, which both killed a
  healthy job and let a second batch start against the same profile.
- **A failed install no longer tries to restore the enabled state** of a package it
  never added, which used to report a second `operation-error` on top of the real
  failure.
- **The panel no longer sticks after a batch settles.** `submitJob` resolves only
  after the whole batch finished, and the tab wrote a fresh `queued` snapshot over
  the result, leaving the spinner and the disabled buttons behind until the tab was
  remounted.

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
