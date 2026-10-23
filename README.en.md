# dsh-plugin-upgrader

[![npm](https://img.shields.io/npm/v/dsh-plugin-upgrader.svg)](https://www.npmjs.com/package/dsh-plugin-upgrader)
[![license](https://img.shields.io/npm/l/dsh-plugin-upgrader.svg)](./LICENSE)

> One-click upgrades plus version history and rollback for the DeepSeek Harness
> **Plugins** page.

DSH's built-in Plugins page installs, removes and lists plugins, but two things are
missing: upgrading everything at once, and going back to an older version. This
plugin adds a **Versions** tab to that page and fills both gaps.

English · [中文](./README.md)

![Versions tab](./screenshots/history.png)

## Features

- **One-click upgrade** — bump every upgradable plugin to its newest version, with
  progress, per-plugin results and failure reasons.
- **Multi-select upgrade** — tick any subset of plugins and upgrade only those.
- **Version history / rollback** — expand any plugin to see every published version
  (with publish date and engine requirement) and switch to it in one click.
- **GitHub links** — the `GH` button opens the plugin's repository; clicking a
  version number opens that version's GitHub release page.

## Where it shows up

A **Versions** tab appears next to *Installed* and *Discover* on the Plugins page:

- Header counts: upgradable / installed / version count
- **Upgrade all** handles every upgradable plugin; the selection bar below handles
  **Upgrade selected**
- **Check for updates** bypasses the 5-minute registry cache
- The search box filters by package name
- One row per plugin; **history (n)** expands the full version list
- `GH` opens the repository homepage (hidden for plugins without one)
- Each version number is itself a link to GitHub:
  - the version was tagged → `releases/tag/v<version>` (the tag list is consulted, so
    a guessed, dead link never reaches the page)
  - the version was not tagged, or the GitHub list is unreadable (rate limit,
    offline) → the repository's `releases` feed

![Expanded history](./screenshots/selection.png)

## Install

Search `dsh-plugin-upgrader` on the Plugins page's **Discover** tab and hit install.
On the desktop app use its own plugin manager — the CLI cannot change the profile
an app has open.

With the `dsh` CLI (swap `web` for your profile name):

```bash
dsh plugin --profile web add dsh-plugin-upgrader
```

From source:

```bash
git clone https://github.com/zuwenyin/dsh-plugin-upgrader.git
cd dsh-plugin-upgrader
dsh plugin --profile web add "$PWD"
```

Open the Plugins page and the **Versions** tab is there. No build step, no restart.

## How it works

A browser tab cannot read the profile's dependency list and cannot reliably reach
npm (CORS, private registries, tokens), so every package operation happens on the
host half:

| Route | Purpose |
| --- | --- |
| `GET /api/plugin-upgrader/overview` | installed plugins plus their published versions (registry packument, 5-minute cache, 10-second timeout) |
| `POST /api/plugin-upgrader/job` | queue a batch of upgrade / switch steps, return a job id immediately |
| `GET /api/plugin-upgrader/job?id=…` | poll progress and per-plugin results |
| `POST /api/plugin-upgrader/cancel` | abort the step in flight |

Every route is loopback-only: a batch installs packages, so a paired remote device
or a cross-site page must never reach it.

### Why switching versions is remove + install

`pluginManager.installBundle` refuses a spec that names an already-installed
dependency (`already-installed`), so replacing a version is a removal followed by an
installation — the same path the official Update action takes. The previous version
is reported back so the UI can warn about a downgrade.

### Preserving the enabled flag

Removing a plugin drops its enabled / disabled state, so each step re-applies
`setBundleEnabled` with the state it had before the upgrade. A disabled plugin stays
disabled after being upgraded.

### One batch at a time

The host runs one job at a time. A second submission gets `409 busy` with the id of
the job that is running, and the UI **adopts** that batch instead of showing an
error:

- opening a second Plugins tab, or clicking *Upgrade all* while a batch runs, shows
  the running batch
- `overview` carries an `active` field, so a freshly mounted tab reconnects to work
  in progress
- a job writes a heartbeat every few seconds; a job left behind by a host restart is
  declared abandoned once the heartbeat goes stale, so it cannot block every later
  upgrade with a permanent `busy`

A restart interrupts the job in flight; the UI reports that as a failure rather than
spinning forever.

## Project layout

```
dsh-plugin-upgrader/
├── src/                  sources (TypeScript)
│   ├── index.ts          host entry: route registration, job scheduling
│   ├── host/             host-side logic (Node, no DOM)
│   │   ├── overview.ts   assembles the overview payload
│   │   ├── registry.ts   packument fetch / shaping, GitHub tag lists
│   │   ├── install.ts    one install step plus enabled-state restore
│   │   ├── bundle.ts     bundle metadata (source kind, i18n fields, icons)
│   │   ├── repo.ts       repository URL normalisation
│   │   ├── version.ts    semver comparison, release links
│   │   ├── http.ts       loopback guard, JSON read/write
│   │   └── manager.ts    the minimal host pluginManager type contract
│   └── client/           browser side (modules, bundled into one file)
│       ├── index.ts      createPlugin(require): slot registration entry
│       ├── components/   Tab / PluginRow / VersionLine / JobPanel
│       ├── copy.ts       zh / en strings
│       ├── styles.ts     scoped CSS
│       ├── hooks.ts      locale subscription, overview fetching
│       ├── api.ts        fetch wrappers, job polling
│       ├── format.ts     versions / dates / external links
│       ├── env.ts        minimal window typings
│       └── types.ts      payload types
├── lib/                  build output (git-ignored, produced by `pnpm run build`)
│   ├── index.js          host entry (tsc output)
│   ├── host/*.js         host modules plus .d.ts
│   └── client.js         the browser bundle, wrapped in __ModuleLoader__
├── scripts/build.mjs     build: tsc for the host, esbuild for the client
├── test/                 node:test unit tests (.ts, stripped natively by Node 24)
├── locale/               (reserved) language files
├── assets/icon.svg       icon
├── cordis.patch.yml      bundle registration
└── package.json
```

The browser half is split into `.ts` modules, but esbuild bundles it back into a
single `lib/client.js` wrapped in `window.__ModuleLoader__.load({ id, factory(require) { … } })`.
At runtime it can only `require` modules the host provides (`react`), not its own
siblings, so the split happens in the sources only.

## Development

Dependencies are managed with pnpm (`packageManager` is pinned in `package.json`,
and CI uses pnpm too):

```bash
pnpm install       # installs dependencies (runs prepare → one build)
pnpm run dev       # watch src/, rebuild the host and the client on save
pnpm run build     # tsc for the host + esbuild for the client → lib/
pnpm run typecheck # tsc over src and test
pnpm test          # node:test unit tests (.ts runs directly)
pnpm run check     # all of the above (typecheck + build + test)
```

The host half lives in `src/index.ts` (a `webServer` prefix route at
`/api/plugin-upgrader`), the browser half in `src/client/index.ts` (registering the
`plugins.tab` slot).

`pnpm run dev` runs two watchers side by side: `tsc --watch` owns `lib/index.js`
and `lib/host/**`, esbuild owns `lib/client.js`, so neither overwrites the other.
esbuild only strips types, it does not check them — run `pnpm run typecheck` after
editing the browser half.

Either way the profile's `link:` points at this directory but loads `lib/`, not
`src/`, so the build has to run. `pnpm run dev` keeps the output current, but the
plugin itself does **not** hot-reload — reload it without restarting the app by
calling `pluginManager.setBundleEnabled(name, false)` and then
`setBundleEnabled(name, true)`.

## License

[MIT](./LICENSE)
