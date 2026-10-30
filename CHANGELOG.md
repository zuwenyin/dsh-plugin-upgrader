# Changelog

## 1.5.0 — 2026-10-30

- **The package now passes the DSH Store's fixed-commit review on everything a
  package can control.** The store reviews one commit's file tree, looks for the
  runtime files named by `files`, and refuses to run `prepare` to fill them in.
  Three changes follow from that: `lib/` is committed instead of ignored, the
  build moved from `prepare` to `prepack` (so installing no longer executes
  anything), and `engines` now declares `dsh` as well as `node`. Re-running the
  store's own review code against the staged tree drops the reasons from seven to
  three: the missing artifacts, the `prepare` lifecycle script, the undeclared
  DSH range and the incomplete scan are all gone.
- **A guard keeps the committed output honest.** `scripts/verify-build-committed.mjs`
  compares `lib/` on disk against the index and runs from `pnpm run check`, CI and
  the publish workflow — so a source change that forgets to rebuild cannot reach
  the registry. It needs the build to be reproducible to mean anything, which it
  is: two consecutive builds produce byte-identical output.
- **The three remaining reasons are the plugin's actual capabilities**, and the
  store routes those to its review lane rather than rejecting them: it reads and
  writes the profile manifest (`files`), it fetches packuments (`network`), and
  it reads the environment to find the profile (`credentials` — `DSH_PROFILE_DIR`
  and `DSH_PROFILE`, neither of which is a secret; the store's benign-variable
  allow-list names `DSH_HOME` but not those two).

## 1.4.3 — 2026-10-28

- **`AGENTS.md` records the behaviour that must not regress.** Eleven rules, each
  with the code location and the test that guards it: the `GH` links (rows *and*
  historical versions), the in-place version replacement, the manifest journal,
  the boot-document check before a reload, the `latest`-must-not-be-a-downgrade
  rule, the mirror-gap report, the install phases, the writer-lock message, the
  ban on upgrading itself, `bundle-in-use`, and the smaller conventions
  (loopback-only routes, one batch at a time, the concurrency cap, the enabled
  flag, never a blank failure reason, zh + en copy only). Both READMEs now link
  to it, and several statements that had drifted out of date were corrected: the
  packument timeout is 20 s (not 10), an upgrade no longer removes and reinstalls
  (the in-place route has run since 1.4.1), and there are four install phases
  rather than three.
- **The upgrade log now says what it is doing instead of looking like a
  removal.** A version replacement logs `install <name>@<new>` first, which the
  manager refuses with `already-installed` before pnpm ever runs, and then logs
  the retry — so a reader sees two installs with nothing in between and reads
  the gap as a removal. The refusal is now named (`already declared, so a plain
  install was refused; the bundle stays loaded`), the in-place line spells out
  that the bundle is not unloaded (`in place: no removal, the bundle stays
  loaded`), and the fallback that really does remove says so
  (`in-place replacement declined`). No behaviour changed: the in-place route
  introduced in 1.2.0 is still the first choice, and a real removal only runs
  when it declines.

## 1.4.2 — 2026-10-28

- **GitHub links are back on every row and every historical version.** The
  abbreviated packument form the registry serves to
  `Accept: application/vnd.npm.install-v1+json` carries no `repository` fields,
  so rows rendered without a repository link and the history drawer lost the
  per-version GitHub address. The registry reader now detects an abbreviated
  document whose versions lack repository metadata and re-fetches that package
  once in the full `application/json` form, merging the repository fields
  (homepage, bugs, repository) back into every version entry. Verified live:
  all 12 installed plugins resolve their `repoUrl`, and historical versions
  carry their own repository links again.

## 1.4.1 — 2026-10-28

- **The 1.4.0 repairs now actually run inside the desktop app.** Every profile
  path this plugin resolves went through `DSH_PROFILE_DIR` / `DSH_HOME` +
  `DSH_PROFILE`, but the desktop shell spawns the plugin host with the profile
  directory as the working directory and neither variable in the environment —
  so inside the real app both lookups missed and the host half of 1.4.0 (journal
  recovery, the writer-lock explanation, the install progress) was silently
  inert. The resolution now falls back to the working directory when its
  `package.json` parses and carries the `dsh.profile` key, so a random cwd is
  never mistaken for a profile.

## 1.4.0 — 2026-10-28

- **A failed upgrade can no longer leave the profile missing a dependency.** An
  in-place version replacement works by deleting the package's entry from
  `profile/package.json` so the manager's `already-installed` guard stops firing,
  then letting pnpm write the new version back. If the process dies inside that
  window — a restart, a crash, a killed pnpm — nothing on disk remembered the
  entry, and the package stayed on disk while being invisible to the manager.
  That is how a theme update removed the theme: the entry never came back, and
  the next `pnpm install` moved the orphan directory to `node_modules/.ignored`,
  after which the plugin could not be upgraded, removed, or even seen again
  without editing JSON by hand.

  The intent is now written to `package.json.upgrader-journal.json` *before* the
  entry leaves the manifest, and every load of this plugin repairs a record it
  finds: an entry still missing is put back at the range it carried, and one that
  pnpm did write is settled and the record cleared. Recovery is best-effort and
  never a precondition — a profile that cannot be repaired still loads the tab,
  which is the only way to fix it.

- **The panel now says what pnpm is doing, instead of showing one frozen label.**
  A lockfile verification is the longest phase on a cold profile and the least
  self-explanatory: it prints one line and then nothing for minutes while the tab
  sat on `准备中`. That phase is now named (`正在校验依赖锁文件`), and the newest
  line pnpm printed is shown live beside it — a registry timeout and a download
  both used to read as "installing", and only one of them means keep waiting. The
  staleness detector counts that line too, so a step that keeps printing no longer
  reports itself as stale.

- **A writer-lock timeout now explains itself.** The harness serializes writers of
  `profile/package.json` through a `package.json.lock` sibling, and the shared
  `atomic-write` helper gives a caller that states no budget two seconds. When an
  upgrade ran long enough for another writer to hold that lock, the tab reported
  `atomic-write: timed out waiting for the writer lock at …/package.json.lock` —
  which names a file and a pid that nobody watching the tab can act on. The
  message is now preceded by what it means and what to do: another operation is
  rewriting the manifest (wait it out), or the lock was never released by an
  upgrade that was killed (restarting DSH clears it). The original sentence is
  kept in brackets, because it is the string to search for in a log.

## 1.3.0 — 2026-10-27

- **A batch upgrade no longer greets the next start with a startup-error dialog.**
  The desktop shell builds the page from an injection table it takes from the Host
  once, when the Host starts, and serves that same table to every later document.
  It ends in the boot manifest, whose batch URLs carry a revision hash, and the
  Host keeps the response for the current revision plus exactly one previous one.
  An upgrade that replaces two or more plugins rotates that hash twice, so the
  table the shell still hands out names batches the Host has already dropped —
  fetching them gets a bare 404, every entry in the batch fails to load, and the
  shell reports `web boot: N entries did not activate` and shows a fatal dialog
  over a page that was working a second earlier. Nothing in a plugin can rebuild
  the table, and a second launch always starts from a fresh one, which is why the
  dialog looks so arbitrary.

  One thing made it likely: after replacing a theme plugin the tab reloaded the
  page itself to restore the theme's stylesheet, and that reload could land on a
  dead table. The reload now asks the Host first — a `HEAD` per boot batch — and
  when a batch is gone it says a restart is needed instead of walking into the
  fatal boot. An unclear answer (a refused socket, a 500) is not treated as a
  verdict, so a flaky moment never turns a working reload into a refusal.

- **A mirror that is behind no longer looks like an up-to-date package.** The tab
  reads its version list from the registry the profile installs from, and a mirror
  lags the registry it copies — sometimes by hours. The lag is invisible in the
  mirror's own document: it simply does not list the newer release, so the row
  shows an older `latest` and nothing hints that anything is missing. That matters
  because a version absent from the configured registry cannot be installed at
  all — pnpm resolves through it and fails with `ERR_PNPM_NO_MATCHING_VERSION`,
  which takes the whole command down, unrelated packages in the same batch
  included. Each row now also asks the upstream registry what it is missing above
  the installed version and names those releases, so "there is a newer version,
  your mirror has not caught up" reads differently from "nothing to do".

## 1.2.0 — 2026-10-27

- **A version replacement no longer makes the plugin disappear while it runs.**
  The manager refuses a spec whose package name is already in the profile's
  `dependencies`, and the documented answer is remove-then-install. But
  `removeBundle` deselects the bundle, so the plugin leaves the page for as long
  as pnpm takes — and a replacement runs pnpm twice, which on a slow mirror is
  minutes. An upgrade therefore looked like "the plugin vanished", and a failure
  in between left it that way.

  That guard reads `profile/package.json`, not the disk. Dropping just the
  dependency entry satisfies it, pnpm `add` overwrites the installed version, and
  the manager writes the entry back itself — so nothing is ever deselected and
  the plugin keeps loading throughout. Measured on this profile: **7.9 s instead
  of 4 m 42 s**, for the same single command that also used to be two.

  The removal path is still there and still used whenever the in-place attempt
  cannot be made to work (no profile directory, an unreadable manifest, a package
  that is not a plain dependency, a refusal or throw from the attempt itself).
  Every failed attempt restores the entry it dropped first, so a version that can
  only be replaced the slow way is never left worse off for having tried.

- **A batch upgrade no longer greets the next start with a startup-error dialog.**
  The desktop shell builds the page from an injection table it takes from the Host
  once, when the Host starts, and serves that same table to every later document.
  It ends in the boot manifest, whose batch URLs carry a revision hash, and the
  Host keeps the response for the current revision plus exactly one previous one.
  An upgrade that replaces two or more plugins rotates that hash twice, so the
  table the shell still hands out names batches the Host has already dropped —
  fetching them gets a bare 404, every entry in the batch fails to load, and the
  shell reports `web boot: N entries did not activate` and shows a fatal dialog
  over a page that was working a second earlier. Nothing in a plugin can rebuild
  the table, and a second launch always starts from a fresh one, which is why the
  dialog looks so arbitrary.

  One thing made it likely: after replacing a theme plugin the tab reloaded the
  page itself to restore the theme's stylesheet, and that reload could land on a
  dead table. The reload now asks the Host first — a `HEAD` per boot batch — and
  when a batch is gone it says a restart is needed instead of walking into the
  fatal boot. An unclear answer (a refused socket, a 500) is not treated as a
  verdict, so a flaky moment never turns a working reload into a refusal.

## 1.1.2 — 2026-10-27

- **A failed replacement no longer leaves the plugin unloaded and invisible.**
  Replacing a version means `removeBundle` first, and that deselects the bundle
  so the loader drops its rows. If the install that follows fails — a registry
  timeout, a killed pnpm, anything — the package was left in `dependencies`, on
  disk, and NOT selected: the plugin disappeared from the page entirely, and the
  only way back was the same toggle by hand. A failed re-install now re-selects
  the bundle before reporting, and says so in the log. The repair is skipped when
  the package is no longer installed at all, since selecting that would only fail
  louder.

## 1.1.1 — 2026-10-27

- **The row no longer offers to switch the running version to itself.** A
  path-installed bundle asked the registry for its version list but did not pass
  its installed version along, so no row was marked as the one loaded. The row
  the user is already on then drew a live "back to latest" button that pointed at
  that same version. Two fixes: the installed version is passed through for path
  installs too, and the button label no longer keys on "this is the latest
  release" alone — a row that is both current and latest reads "switch", disabled.

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
