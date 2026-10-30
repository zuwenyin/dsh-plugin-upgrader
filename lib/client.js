window.__ModuleLoader__.load({
  id: "dsh-plugin-upgrader",
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // src/client/index.ts
    var index_exports = {};
    __export(index_exports, {
      createPlugin: () => createPlugin
    });
    module.exports = __toCommonJS(index_exports);

    // src/client/env.ts
    var installed;
    function installReact(react) {
      installed = react;
    }
    function getReact() {
      if (installed === void 0) throw new Error("plugin-upgrader: React was not installed");
      return installed;
    }
    function getH() {
      return getReact().createElement;
    }

    // src/client/copy.ts
    var ZH = {
      tab: "\u7248\u672C",
      title: "\u63D2\u4EF6\u7248\u672C\u7BA1\u7406",
      subtitle: "\u4E00\u952E\u5347\u7EA7\uFF0C\u6216\u5207\u6362\u5230\u4EFB\u610F\u5386\u53F2\u7248\u672C\u3002",
      refresh: "\u68C0\u67E5\u66F4\u65B0",
      refreshing: "\u68C0\u67E5\u4E2D\u2026",
      upgradeAll: "\u4E00\u952E\u5347\u7EA7",
      upgradeSelected: "\u5347\u7EA7\u9009\u4E2D",
      selectAll: "\u5168\u9009\u53EF\u5347\u7EA7",
      clearSelection: "\u6E05\u9664\u9009\u62E9",
      selected: (n) => `\u5DF2\u9009 ${n} \u9879`,
      selectRow: "\u9009\u4E2D\u8FD9\u4E2A\u63D2\u4EF6",
      nothingSelected: "\u5148\u52FE\u9009\u8981\u5347\u7EA7\u7684\u63D2\u4EF6",
      installed: "\u5DF2\u5B89\u88C5",
      upgradable: "\u53EF\u5347\u7EA7",
      upToDate: "\u5168\u90E8\u5DF2\u662F\u6700\u65B0",
      upgrade: "\u5347\u7EA7",
      upgrading: "\u5347\u7EA7\u4E2D\u2026",
      selfUpdate: "\u7528\u9875\u9762\u5B89\u88C5\u5668\u5347\u7EA7",
      selfUpdateHint: "\u63D2\u4EF6\u4E0D\u80FD\u5378\u8F7D\u81EA\u5DF1\u518D\u88C5\u56DE\u81EA\u5DF1\uFF0C\u6240\u4EE5\u8FD9\u4E00\u6B65\u4EA4\u7ED9\u63D2\u4EF6\u9875\u81EA\u5DF1\u7684\u5B89\u88C5\u6D41\u7A0B",
      selfUpdateUnavailable: "\u8FD9\u4E00\u9875\u6CA1\u6709\u63D0\u4F9B\u5B89\u88C5\u5165\u53E3\uFF0C\u8BF7\u5728\u300C\u5DF2\u5B89\u88C5\u300D\u91CC\u7528\u5B98\u65B9\u5B89\u88C5\u5BF9\u8BDD\u6846\u5347\u7EA7\u672C\u63D2\u4EF6\u3002",
      history: "\u5386\u53F2\u7248\u672C",
      hideHistory: "\u6536\u8D77\u5386\u53F2",
      github: "GitHub \u4E3B\u9875",
      githubVersion: "\u5728 GitHub \u4E0A\u6253\u5F00\u8FD9\u4E2A\u7248\u672C\u7684\u53D1\u5E03\u9875",
      githubReleases: "\u5728 GitHub \u4E0A\u6253\u5F00\u53D1\u5E03\u5217\u8868",
      noRepo: "\u8FD9\u4E2A\u5305\u6CA1\u6709\u767B\u8BB0 GitHub \u4ED3\u5E93",
      switchTo: "\u5207\u6362",
      current: "\u5F53\u524D",
      latest: "\u6700\u65B0",
      older: "\u964D\u7EA7",
      back: "\u8FD4\u56DE\u6700\u65B0",
      empty: "\u8FD8\u6CA1\u6709\u53EF\u7BA1\u7406\u7684\u63D2\u4EF6",
      emptyHint: "\u8FD9\u4E2A\u6807\u7B7E\u9875\u5217\u51FA\u968F\u914D\u7F6E\u5B89\u88C5\uFF08profile \u4F9D\u8D56\uFF09\u7684\u63D2\u4EF6\uFF1B\u5185\u7F6E\u63D2\u4EF6\u4E0D\u5728\u6B64\u5217\u3002",
      search: "\u641C\u7D22\u63D2\u4EF6",
      noMatch: "\u6CA1\u6709\u5339\u914D\u7684\u63D2\u4EF6",
      loading: "\u6B63\u5728\u8BFB\u53D6\u5DF2\u5B89\u88C5\u63D2\u4EF6\u2026",
      loadFailed: "\u8BFB\u53D6\u5931\u8D25",
      retry: "\u91CD\u8BD5",
      openPage: "\u5728\u5DF2\u5B89\u88C5\u4E2D\u67E5\u770B",
      noHistory: "\u6CA1\u6709\u53EF\u7528\u7684\u7248\u672C\u8BB0\u5F55",
      noHistoryWhy: "\u8FD9\u4E2A\u5305\u4E0D\u662F\u4ECE npm \u6CE8\u518C\u8868\u5B89\u88C5\u7684\uFF0C\u6CA1\u6709\u53D1\u5E03\u5386\u53F2\u3002",
      historyFailed: "\u7248\u672C\u5217\u8868\u8BFB\u53D6\u5931\u8D25\uFF0C\u70B9\u300C\u68C0\u67E5\u66F4\u65B0\u300D\u53EF\u91CD\u8BD5",
      mirrorBehind: "\u955C\u50CF\u6E90\u5C1A\u672A\u540C\u6B65\u8FD9\u4E9B\u5DF2\u53D1\u5E03\u7248\u672C\uFF0C\u88C5\u4E0D\u4E86",
      versions: (n) => `${n} \u4E2A\u7248\u672C`,
      showingNewest: (n) => `\u5217\u51FA\u6700\u65B0 ${n} \u4E2A`,
      progress: (done, total) => `\u6B63\u5728\u5904\u7406 ${done}/${total}`,
      elapsed: (text) => `\u5DF2\u7528\u65F6 ${text}`,
      phaseInstalling: "\u6B63\u5728\u4E0B\u8F7D\u5E76\u5B89\u88C5",
      phaseApplying: "\u6B63\u5728\u5199\u5165\u914D\u7F6E",
      phaseCancelling: "\u6B63\u5728\u53D6\u6D88",
      phaseWaiting: "\u51C6\u5907\u4E2D",
      phaseVerifying: "\u6B63\u5728\u6821\u9A8C\u4F9D\u8D56\u9501\u6587\u4EF6",
      registryAttempt: (index, total) => `\u6CE8\u518C\u8868 ${index}/${total}\uFF0C\u4E0A\u4E00\u4E2A\u8D85\u65F6\u4F1A\u81EA\u52A8\u6362\u6E90`,
      slowHint: "\u9996\u6B21\u5B89\u88C5\u6216\u9700\u8981\u6821\u9A8C\u4F9D\u8D56\u65F6\u4F1A\u6BD4\u8F83\u6162\uFF0C\u65E5\u5FD7\u91CC\u80FD\u770B\u5230\u771F\u5B9E\u8FDB\u5EA6\u3002",
      cancelRequested: "\u5DF2\u8BF7\u6C42\u53D6\u6D88",
      stalled: "\u8FD9\u4E00\u6B65\u5DF2\u7ECF\u5F88\u4E45\u6CA1\u6709\u8F93\u51FA\u4E86\uFF0C\u53EF\u4EE5\u53D6\u6D88\u540E\u91CD\u8BD5\u3002",
      staleSnapshot: "\u72B6\u6001\u5DF2\u505C\u6B62\u66F4\u65B0\uFF0C\u8BF7\u68C0\u67E5\u66F4\u65B0",
      cancel: "\u53D6\u6D88",
      cancelling: "\u6B63\u5728\u53D6\u6D88\u2026",
      restart: "\u9700\u8981\u91CD\u542F DSH \u624D\u4F1A\u751F\u6548\u3002",
      restartHint: "\u5DF2\u4FDD\u5B58\u7684\u6539\u52A8\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u751F\u6548\u3002",
      reloadForAppearance: "\u4E3B\u9898\u63D2\u4EF6\u5DF2\u66F4\u65B0\uFF0C\u6B63\u5728\u91CD\u65B0\u52A0\u8F7D\u9875\u9762\u4EE5\u6062\u590D\u4E3B\u9898\u5916\u89C2\uFF08\u4E3B\u9898\u914D\u7F6E\u4FDD\u5B58\u5728\u78C1\u76D8\u4E0A\uFF0C\u4E0D\u4F1A\u4E22\u5931\uFF09\u3002",
      reloadBlocked: "\u5916\u89C2\u5DF2\u6062\u590D\uFF0C\u4F46\u8FD9\u4E00\u9875\u7684\u63D2\u4EF6\u6E05\u5355\u5DF2\u7ECF\u8FC7\u671F\uFF0C\u91CD\u65B0\u52A0\u8F7D\u4F1A\u542F\u52A8\u5931\u8D25\u3002\u8BF7\u91CD\u542F DSH \u5B8C\u6210\u8FD9\u6B21\u5347\u7EA7\u3002",
      done: "\u5B8C\u6210",
      failed: "\u5931\u8D25",
      failedSome: (n) => `${n} \u4E2A\u5931\u8D25`,
      jobDone: "\u6279\u91CF\u5347\u7EA7\u5B8C\u6210",
      jobCancelled: "\u5DF2\u53D6\u6D88",
      busyAdopted: "\u5DF2\u6709\u4E00\u6279\u5347\u7EA7\u6B63\u5728\u8FDB\u884C\uFF0C\u5DF2\u63A5\u7740\u663E\u793A\u5B83\u7684\u8FDB\u5EA6\u3002",
      lostJob: "\u5347\u7EA7\u8FDB\u5EA6\u5DF2\u5931\u53BB\u8054\u7CFB\uFF08\u5BBF\u4E3B\u53EF\u80FD\u91CD\u542F\u8FC7\uFF09\u3002\u8BF7\u68C0\u67E5\u66F4\u65B0\uFF0C\u786E\u8BA4\u63D2\u4EF6\u5F53\u524D\u7248\u672C\u3002",
      log: "\u8FD0\u884C\u65E5\u5FD7",
      showLog: "\u67E5\u770B\u65E5\u5FD7",
      hideLog: "\u6536\u8D77\u65E5\u5FD7",
      buildBlocked: "\u8FD9\u4E2A\u5305\u6709\u672A\u6279\u51C6\u7684\u6784\u5EFA\u811A\u672C",
      approve: "\u6279\u51C6\u5E76\u91CD\u542F",
      registry: "\u6CE8\u518C\u8868",
      registryChange: "\u66F4\u6362\u5B89\u88C5\u6E90",
      registryFollowPnpm: "\u8DDF\u968F pnpm \u914D\u7F6E",
      registryFollowPnpmHint: "\u7528 pnpm \u81EA\u5DF1\u914D\u7F6E\u7684\u6E90\uFF0C\u901A\u5E38\u662F .npmrc \u91CC\u90A3\u4E00\u4E2A",
      registryLoading: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026",
      registryLocked: "\u8FD9\u4E2A\u7248\u672C\u6CA1\u6709\u8BBE\u7F6E\u5165\u53E3\uFF0C\u65E0\u6CD5\u5728\u8FD9\u91CC\u4FEE\u6539\u5B89\u88C5\u6E90",
      registryInvalid: "\u8BF7\u586B\u4E00\u4E2A http(s) \u5730\u5740\uFF0C\u4F8B\u5982 https://registry.npmmirror.com/",
      registryPlaceholder: "https://registry.example.com/",
      registrySaveFailed: "\u6CA1\u80FD\u4FDD\u5B58\uFF0C\u8BF7\u518D\u8BD5\u4E00\u6B21",
      registryUse: "\u4F7F\u7528\u8FD9\u4E2A\u6E90",
      sourcesTitle: "\u5B89\u88C5\u6E90",
      sourcesHint: "\u81EA\u5E26\u6E90\u4E0D\u80FD\u6539\u4E5F\u4E0D\u80FD\u5220\uFF1B\u81EA\u5DF1\u52A0\u7684\u6E90\u53EF\u4EE5\u968F\u65F6\u6539\u56DE\u6765\u3002",
      sourcesClose: "\u5173\u95ED",
      sourcesBuiltin: "\u81EA\u5E26\uFF08\u5E38\u7528\uFF09",
      sourcesHost: "\u5BBF\u4E3B\u914D\u7F6E\u7684",
      sourcesHostHint: "pluginManager \u91CC\u914D\u7F6E\u7684\u6E90\uFF0C\u60F3\u7559\u4E0B\u6765\u5F53\u5E38\u7528\u6E90\u5C31\u70B9\u300C\u6536\u8FDB\u5217\u8868\u300D\u3002",
      sourcesCustom: "\u6211\u81EA\u5DF1\u52A0\u7684",
      sourcesNone: "\u8FD8\u6CA1\u6709\u81EA\u5DF1\u52A0\u8FC7\u6E90\u3002",
      sourcesAdd: "\u6DFB\u52A0",
      sourcesCurrent: "\u5F53\u524D\u4F7F\u7528",
      sourceBuiltin: "\u81EA\u5E26",
      sourceHost: "\u5BBF\u4E3B",
      sourceKeep: "\u6536\u8FDB\u5217\u8868",
      sourceInUse: "\u5728\u7528",
      sourceTest: "\u6D4B\u8BD5",
      sourceTestCurrent: "\u6D4B\u8BD5\u5F53\u524D\u6E90",
      sourceEdit: "\u4FEE\u6539",
      sourceDelete: "\u5220\u9664",
      sourceSave: "\u4FDD\u5B58",
      sourceCancel: "\u53D6\u6D88",
      sourceApply: "\u7528\u5B83",
      sourceApplied: "\u5DF2\u7528",
      sourceTesting: "\u6D4B\u8BD5\u4E2D\u2026",
      sourceReachable: "\u53EF\u4EE5\u8FDE\u4E0A",
      sourceUnreachable: "\u8FDE\u4E0D\u4E0A",
      sourceExists: "\u8FD9\u4E2A\u6E90\u5DF2\u7ECF\u5728\u5217\u8868\u91CC\u4E86",
      generated: "\u6570\u636E\u66F4\u65B0\u4E8E",
      sourcePath: "\u672C\u5730\u8DEF\u5F84\u5B89\u88C5\uFF0C\u65E0\u6CD5\u68C0\u67E5\u7248\u672C",
      sourceGit: "Git \u5B89\u88C5\uFF0C\u65E0\u6CD5\u68C0\u67E5\u7248\u672C",
      unknownVersion: "\u7248\u672C\u672A\u77E5",
      dialogHint: "\u4E5F\u53EF\u4EE5\u9010\u4E2A\u6253\u5F00\u5B89\u88C5\u5BF9\u8BDD\u6846\u5B8C\u6210\u540C\u6837\u7684\u5347\u7EA7\u3002",
      danger: "\u964D\u7EA7\u4F1A\u56DE\u5230\u65E7\u7248\u672C\uFF0C\u65E7\u7248\u672C\u53EF\u80FD\u542B\u6709\u5DF2\u4FEE\u590D\u7684\u95EE\u9898\u3002"
    };
    var EN = {
      tab: "Versions",
      title: "Plugin versions",
      subtitle: "Upgrade everything at once, or switch to any published version.",
      refresh: "Check for updates",
      refreshing: "Checking\u2026",
      upgradeAll: "Upgrade all",
      upgradeSelected: "Upgrade selected",
      selectAll: "Select all upgradable",
      clearSelection: "Clear selection",
      selected: (n) => `${n} selected`,
      selectRow: "Select this plugin",
      nothingSelected: "Pick the plugins you want to upgrade first.",
      installed: "installed",
      upgradable: "upgradable",
      upToDate: "Everything is up to date",
      upgrade: "Upgrade",
      upgrading: "Upgrading\u2026",
      selfUpdate: "Upgrade via the page",
      selfUpdateHint: "A plugin cannot uninstall and reinstall itself, so this runs the plugin page own installer",
      selfUpdateUnavailable: "This page offers no install entry; upgrade this plugin from the Installed tab instead.",
      history: "Version history",
      hideHistory: "Hide history",
      github: "GitHub page",
      githubVersion: "Open this version on GitHub",
      githubReleases: "Open the releases list on GitHub",
      noRepo: "This package lists no GitHub repository",
      switchTo: "Switch",
      current: "installed",
      latest: "latest",
      older: "downgrade",
      back: "Back to latest",
      empty: "No manageable plugins yet.",
      emptyHint: "This tab lists plugins installed as profile dependencies; built-in ones are not listed.",
      search: "Search plugins",
      noMatch: "No plugin matches that search.",
      loading: "Reading installed plugins\u2026",
      loadFailed: "Could not read the plugin list",
      retry: "Retry",
      openPage: "Open in Installed",
      noHistory: "No published versions found",
      noHistoryWhy: "This package was not installed from an npm registry, so it has no published history.",
      historyFailed: 'Could not read the version list; "Check for updates" retries it',
      mirrorBehind: "Your mirror has not synced these published versions yet, so they cannot be installed",
      versions: (n) => `${n} versions`,
      showingNewest: (n) => `showing newest ${n}`,
      progress: (done, total) => `Working on ${done}/${total}`,
      elapsed: (text) => `${text} elapsed`,
      phaseInstalling: "Downloading and installing",
      phaseApplying: "Writing the profile",
      phaseCancelling: "Cancelling",
      phaseWaiting: "Preparing",
      phaseVerifying: "Verifying the dependency lockfile",
      registryAttempt: (index, total) => `Registry ${index}/${total}; a timeout falls back to the next`,
      slowHint: "A first install, or one that must verify dependencies, takes a while \u2014 the log shows what is happening.",
      cancelRequested: "Cancellation requested",
      stalled: "This step has produced no output for a long time; cancel it and retry.",
      staleSnapshot: "status stopped updating \u2014 check for updates",
      cancel: "Cancel",
      cancelling: "Cancelling\u2026",
      restart: "Restart DSH to finish.",
      restartHint: "Saved changes take effect on the next start.",
      reloadForAppearance: "The theme plugin was updated; reloading the page to restore its look (its settings are on disk and are not lost).",
      reloadBlocked: "The look is restored, but this page's plugin list is out of date and reloading it would fail to start. Restart DSH to finish this upgrade.",
      done: "done",
      failed: "failed",
      failedSome: (n) => `${n} failed`,
      jobDone: "Batch upgrade finished",
      jobCancelled: "Cancelled",
      busyAdopted: "A batch is already running; showing its progress instead.",
      lostJob: "Lost contact with the upgrade (the host may have restarted). Check for updates to confirm the installed version.",
      log: "Run log",
      showLog: "Show log",
      hideLog: "Hide log",
      buildBlocked: "This package has unapproved build scripts",
      approve: "Approve and retry",
      registry: "Registry",
      registryChange: "Change install source",
      registryFollowPnpm: "Follow pnpm's config",
      registryFollowPnpmHint: "Use the registry pnpm itself is configured with, usually the one in .npmrc",
      registryLoading: "Reading the setting\u2026",
      registryLocked: "This build has no settings entry, so the source cannot be changed here",
      registryInvalid: "Enter an http(s) address, for example https://registry.npmmirror.com/",
      registryPlaceholder: "https://registry.example.com/",
      registrySaveFailed: "Could not save it \u2014 try again",
      registryUse: "Use this source",
      sourcesTitle: "Install sources",
      sourcesHint: "The built-in sources cannot be changed or removed. The ones you add can.",
      sourcesClose: "Close",
      sourcesBuiltin: "Built in",
      sourcesHost: "Configured on the host",
      sourcesHostHint: 'Sources from pluginManager. Keep one for later with "Add to my list".',
      sourcesCustom: "Added by you",
      sourcesNone: "You have not added a source yet.",
      sourcesAdd: "Add",
      sourcesCurrent: "In use",
      sourceBuiltin: "Built in",
      sourceHost: "Host",
      sourceKeep: "Add to my list",
      sourceInUse: "In use",
      sourceTest: "Test",
      sourceTestCurrent: "Test the current source",
      sourceEdit: "Edit",
      sourceDelete: "Delete",
      sourceSave: "Save",
      sourceCancel: "Cancel",
      sourceApply: "Use it",
      sourceApplied: "In use",
      sourceTesting: "Testing\u2026",
      sourceReachable: "Reachable",
      sourceUnreachable: "Unreachable",
      sourceExists: "That source is already in the list",
      generated: "Updated",
      sourcePath: "Installed from a local path, so no versions are published",
      sourceGit: "Installed from git, so no versions are published",
      unknownVersion: "version unknown",
      dialogHint: "You can also upgrade one at a time through the install dialog.",
      danger: "A downgrade returns to an older build that may contain fixed bugs."
    };

    // src/client/format.ts
    function makeT(bound, active) {
      return (key, ...args) => {
        let text;
        if (bound !== void 0) {
          try {
            const value = bound(key, ...args);
            if (typeof value === "string" && value !== key) text = value;
          } catch {
          }
        }
        if (text === void 0) {
          const dict = active().toLowerCase().startsWith("zh") ? ZH : EN;
          const fallback = dict[key] ?? EN[key] ?? key;
          text = typeof fallback === "function" ? fallback(...args) : String(fallback);
        }
        return text;
      };
    }
    function formatDate(iso) {
      if (typeof iso !== "string") return "";
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString(void 0, { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    function openExternal(url) {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
      if (typeof window !== "undefined" && typeof window.open === "function") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
    function formatElapsed(ms) {
      if (!Number.isFinite(ms) || ms < 0) return "0s";
      const total = Math.floor(ms / 1e3);
      if (total < 60) return `${total}s`;
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
    }
    function resolveVersionLink(row, version) {
      const raw = typeof version.href === "string" ? version.href : typeof version.url === "string" && typeof row.repoUrl === "string" && version.url.startsWith("/") ? `${row.repoUrl}${version.url}` : version.url;
      return typeof raw === "string" && /^https?:\/\//i.test(raw) ? raw : void 0;
    }
    async function readJson(response) {
      let body;
      try {
        body = await response.json();
      } catch {
        body = void 0;
      }
      if (!response.ok) {
        const record = body !== null && typeof body === "object" ? body : void 0;
        const message = typeof record?.error === "string" ? record.error : `HTTP ${response.status}`;
        const failure = new Error(message);
        failure.status = response.status;
        failure.body = record;
        throw failure;
      }
      return body;
    }
    function isRequestFailure(value) {
      return value instanceof Error && typeof value.status === "number";
    }

    // src/client/api.ts
    var API = "/api/plugin-upgrader";
    var POLL_MS = 800;
    function useOverview(localeId) {
      const React = getReact();
      const [state, setState] = React.useState(
        { data: void 0, error: void 0, loading: true }
      );
      const [tick, setTick] = React.useState(0);
      const [force, setForce] = React.useState(false);
      React.useEffect(() => {
        let cancelled = false;
        setState((current) => ({ ...current, loading: true, error: void 0 }));
        const query = new URLSearchParams({ refresh: force ? "1" : "0", locale: localeId });
        fetch(`${API}/overview?${query.toString()}`, { credentials: "same-origin" }).then((response) => readJson(response)).then((data) => {
          if (cancelled) return;
          setState({ data, error: void 0, loading: false });
        }).catch((error) => {
          if (cancelled) return;
          setState((current) => ({
            data: current.data,
            error: error instanceof Error ? error.message : String(error),
            loading: false
          }));
        });
        return () => {
          cancelled = true;
        };
      }, [localeId, tick, force]);
      const reload = React.useCallback((shouldForce = false) => {
        setForce(shouldForce);
        setTick((value) => value + 1);
      }, []);
      return { ...state, reload };
    }
    async function startJob(steps) {
      const response = await fetch(`${API}/job`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steps })
      });
      const started = await readJson(response);
      return started.id;
    }
    async function watchJob(id, options) {
      for (; ; ) {
        if (!options.isAlive()) return void 0;
        const response = await fetch(`${API}/job?id=${encodeURIComponent(id)}`, { credentials: "same-origin" });
        const snapshot = await readJson(response).catch(() => void 0);
        if (snapshot === void 0) return void 0;
        if (options.isAlive()) options.onSnapshot(snapshot);
        if (snapshot.status !== "running" && snapshot.status !== "queued") return snapshot;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    }
    async function submitJob(steps, watch) {
      try {
        const id = await startJob(steps);
        return { kind: "started", id, settled: await watch(id) };
      } catch (error) {
        if (isRequestFailure(error) && error.status === 409 && typeof error.body?.id === "string") {
          return { kind: "adopted", settled: await watch(error.body.id) };
        }
        return { kind: "failed", error };
      }
    }
    async function cancelJob() {
      try {
        await fetch(`${API}/cancel`, { method: "POST", credentials: "same-origin" });
      } catch {
      }
    }
    async function probeRegistry(registry) {
      const response = await fetch(`${API}/registry/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registry })
      });
      return readJson(response);
    }

    // src/client/boot.ts
    function bootBatches(wire) {
      if (typeof wire !== "object" || wire === null) return [];
      const batches = wire.batches;
      if (!Array.isArray(batches)) return [];
      const rows = [];
      for (const value of batches) {
        if (typeof value !== "object" || value === null) continue;
        const batch = value;
        if (typeof batch.url !== "string" || batch.url === "") continue;
        if (typeof batch.rev !== "string") continue;
        const phase = batch.phase === "bootstrap" ? "bootstrap" : "application";
        rows.push({ phase, url: batch.url, rev: batch.rev });
      }
      return rows;
    }
    async function checkBootDocument(options) {
      const rows = bootBatches(options.wire);
      if (rows.length === 0) return "fresh";
      const lookup = options.fetch ?? globalThis.fetch;
      if (lookup === void 0) return "unknown";
      const base = options.href ?? "dsh-app://app/";
      let unclear = false;
      for (const row of rows) {
        let url;
        try {
          url = new URL(row.url, base).href;
        } catch {
          return "unknown";
        }
        let status;
        try {
          status = (await lookup(url, { method: "HEAD", cache: "no-store" })).status;
        } catch {
          return "unknown";
        }
        if (status === 404) return "stale";
        if (status < 200 || status > 299) unclear = true;
      }
      return unclear ? "unknown" : "fresh";
    }
    async function reloadWhenBootDocumentFresh(options) {
      const page = options.window ?? globalThis;
      const freshness = await checkBootDocument({
        wire: page.__DSH_BOOT__,
        href: page.location?.href,
        fetch: options.fetch
      });
      if (freshness === "stale") {
        options.onBlocked?.();
        return false;
      }
      const reload = page.location?.reload;
      if (typeof reload !== "function") return false;
      try {
        reload.call(page.location);
      } catch {
        return false;
      }
      return true;
    }

    // src/client/hooks.ts
    function useLocaleRevision(locale) {
      const React = getReact();
      const [revision, setRevision] = React.useState(0);
      React.useEffect(() => {
        const subscribe = locale?.subscribe;
        if (locale === void 0 || locale === null || typeof subscribe !== "function") return void 0;
        return subscribe.call(locale, () => setRevision((value) => value + 1));
      }, [locale]);
      return revision;
    }
    function activeLocaleId(locale) {
      try {
        const read2 = locale?.getLocale;
        if (typeof read2 !== "function") return "en";
        return String(read2.call(locale)?.active ?? "en");
      } catch {
        return "en";
      }
    }
    function useAlive() {
      const React = getReact();
      const alive = React.useRef(true);
      React.useEffect(
        () => () => {
          alive.current = false;
        },
        []
      );
      return alive;
    }
    var APPEARANCE_PATTERN = /(^|[/@-])(skin|theme|dream-skin|wallpaper|appearance)([/@.-]|$)/i;
    function isAppearancePackage(name2) {
      return APPEARANCE_PATTERN.test(name2);
    }
    function replacedAppearance(results) {
      if (!Array.isArray(results)) return false;
      return results.some(
        (result) => result.ok === true && result.changed !== false && typeof result.name === "string" && isAppearancePackage(result.name)
      );
    }

    // src/client/registry.ts
    var REGISTRY_FIELD = "registry";
    var SOURCES_FIELD = "customRegistries";
    var WELL_KNOWN_REGISTRIES = [
      "https://registry.npmjs.org/",
      "https://registry.npmmirror.com/"
    ];
    function isBuiltinRegistry(url) {
      const key = comparisonKey(url);
      return WELL_KNOWN_REGISTRIES.some((known) => comparisonKey(known) === key);
    }
    var LOCKED = (reason) => ({
      saved: "",
      custom: [],
      writable: false,
      unavailable: reason,
      save: () => Promise.resolve(false),
      saveSources: () => Promise.resolve(false)
    });
    function comparisonKey(url) {
      return url.trim().replace(/\/+$/, "").toLowerCase();
    }
    function normalizeSource(url) {
      const trimmed = url.trim();
      return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
    }
    function isRegistryAddress(url) {
      return /^https?:\/\/\S+$/i.test(url.trim());
    }
    function read(snapshot) {
      const saved = snapshot?.value?.[REGISTRY_FIELD];
      const custom = snapshot?.value?.[SOURCES_FIELD];
      return {
        saved: typeof saved === "string" ? saved : "",
        custom: Array.isArray(custom) ? custom.filter((entry) => typeof entry === "string" && entry.trim() !== "") : [],
        writable: snapshot?.writable === true && snapshot.status === "ready"
      };
    }
    function useRegistrySetting(configForms, namespace) {
      const React = getReact();
      const [snapshot, setSnapshot] = React.useState(void 0);
      React.useEffect(() => {
        if (configForms === void 0) return void 0;
        let live = true;
        const form = configForms.get(namespace);
        const sync = () => {
          if (live) setSnapshot(form.getSnapshot());
        };
        sync();
        const off = form.subscribe(sync);
        return () => {
          live = false;
          if (typeof off === "function") off();
        };
      }, [configForms, namespace]);
      if (configForms === void 0) {
        return LOCKED("no-config-forms");
      }
      const { saved, custom, writable } = read(snapshot);
      return {
        saved,
        custom,
        writable,
        unavailable: snapshot === void 0 ? "loading" : writable ? void 0 : "not-writable",
        save: async (value) => {
          if (configForms === void 0) return false;
          return configForms.get(namespace).set(REGISTRY_FIELD, value);
        },
        saveSources: async (value) => {
          if (configForms === void 0) return false;
          return configForms.get(namespace).set(SOURCES_FIELD, [...value]);
        }
      };
    }
    function offeredRegistries(known) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const candidate of [...known]) {
        if (typeof candidate !== "string") continue;
        const url = candidate.trim();
        if (url === "") continue;
        const key = comparisonKey(url);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(normalizeSource(url));
      }
      return out;
    }
    function addSource(custom, url) {
      const trimmed = url.trim();
      if (!isRegistryAddress(trimmed)) return void 0;
      const key = comparisonKey(trimmed);
      if (isBuiltinRegistry(trimmed)) return void 0;
      if (custom.some((entry) => comparisonKey(entry) === key)) return void 0;
      return [...custom, normalizeSource(trimmed)];
    }
    function editSource(custom, index, url) {
      if (!Number.isInteger(index) || index < 0 || index >= custom.length) return void 0;
      const trimmed = url.trim();
      if (!isRegistryAddress(trimmed)) return void 0;
      const key = comparisonKey(trimmed);
      if (isBuiltinRegistry(trimmed)) return void 0;
      if (custom.some((entry, at) => at !== index && comparisonKey(entry) === key)) return void 0;
      const next = [...custom];
      next[index] = normalizeSource(trimmed);
      return next;
    }
    function removeSource(custom, index) {
      if (!Number.isInteger(index) || index < 0 || index >= custom.length) return void 0;
      return custom.filter((_entry, at) => at !== index);
    }

    // src/client/styles.ts
    var STYLE_ID = "dsh-plugin-upgrader-style";
    var CSS = `
    .dsh-pu { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; color: var(--dsw-alias-label-primary); }
    .dsh-pu-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .dsh-pu-head-main { display: flex; flex-direction: column; gap: 4px; min-width: 220px; flex: 1; }
    .dsh-pu-title { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
    .dsh-pu-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
    .dsh-pu-stats { display: flex; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); align-items: center; flex-wrap: wrap; }
    .dsh-pu-stat { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
    .dsh-pu-stat b { color: var(--dsw-alias-label-primary); font-weight: 600; }
    .dsh-pu-stat.is-warn b { color: var(--dsw-alias-brand-primary); }
    .dsh-pu-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .dsh-pu-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); transition: background .15s ease, border-color .15s ease, opacity .15s ease; font-family: inherit; }
    .dsh-pu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l2); }
    .dsh-pu-btn:disabled { opacity: .5; cursor: default; }
    .dsh-pu-btn.is-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-inverted, #fff); }
    .dsh-pu-btn.is-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
    .dsh-pu-btn.is-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); padding: 0 8px; }
    .dsh-pu-btn.is-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
    .dsh-pu-btn.is-tiny { height: 24px; padding: 0 9px; font-size: 11px; border-radius: 6px; }
    .dsh-pu-search { display: flex; align-items: center; gap: 8px; }
    .dsh-pu-search input { height: 30px; width: 220px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 12px; font-family: inherit; outline: none; }
    .dsh-pu-search input:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
    .dsh-pu-list { display: flex; flex-direction: column; gap: 8px; }
    .dsh-pu-row { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; transition: border-color .15s ease; }
    .dsh-pu-row:hover { border-color: var(--dsw-alias-border-l2); }
    .dsh-pu-row.is-open { border-color: var(--dsw-alias-border-l2); }
    .dsh-pu-row.is-picked { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent); }
    .dsh-pu-row-main { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
    .dsh-pu-check { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; cursor: pointer; border-radius: 4px; outline: none; }
    .dsh-pu-check .dsh-pu-tick { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-1); box-sizing: border-box; position: relative; transition: background .12s ease, border-color .12s ease; }
    .dsh-pu-check.is-on .dsh-pu-tick { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
    .dsh-pu-check.is-on .dsh-pu-tick::after { content: ''; position: absolute; left: 4px; top: 1px; width: 4px; height: 7px; border: solid var(--dsw-alias-label-primary-inverted, #fff); border-width: 0 2px 2px 0; transform: rotate(45deg); }
    .dsh-pu-check.is-off { cursor: default; }
    .dsh-pu-check.is-off .dsh-pu-tick { opacity: .45; }
    .dsh-pu-check:not(.is-off):hover .dsh-pu-tick { border-color: var(--dsw-alias-brand-primary); }
    .dsh-pu-check:not(.is-off):focus-visible .dsh-pu-tick { box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
    .dsh-pu-selbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 7px 10px; border-radius: 8px; border: 1px dashed var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
    .dsh-pu-selbar.is-active { border-style: solid; border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
    .dsh-pu-selbar .dsh-pu-grow { flex: 1; min-width: 0; }
    .dsh-pu-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--dsw-alias-label-dimmed); }
    .dsh-pu-dot.is-new { background: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
    .dsh-pu-dot.is-err { background: var(--dsw-alias-state-error-primary); }
    .dsh-pu-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .dsh-pu-name { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dsh-pu-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dsh-pu-desc { font-size: 11px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dsh-pu-note { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dsh-pu-note.is-err { color: var(--dsw-alias-state-error-primary); }
    .dsh-pu-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); }
    .dsh-pu-reg { position: relative; display: inline-flex; align-items: center; gap: 6px; }
    .dsh-pu-reg-btn { max-width: 360px; }
    .dsh-pu-reg-btn.is-open { border-color: var(--dsw-alias-brand-primary); }
    .dsh-pu-reg-label { color: var(--dsw-alias-label-secondary); flex: none; }
    .dsh-pu-reg-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px; }
    .dsh-pu-reg-caret { color: var(--dsw-alias-label-tertiary); font-size: 9px; flex: none; }
    .dsh-pu-reg-panel { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; min-width: 320px; max-width: 420px; display: flex; flex-direction: column; gap: 2px; padding: 6px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); box-shadow: 0 12px 28px rgba(0, 0, 0, .18); }
    .dsh-pu-reg-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 8px; border-radius: 6px; border: 0; background: none; color: var(--dsw-alias-label-primary); cursor: pointer; text-align: left; font-family: inherit; font-size: 11px; }
    .dsh-pu-reg-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
    .dsh-pu-reg-item:disabled { opacity: .55; cursor: default; }
    .dsh-pu-reg-item.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
    .dsh-pu-reg-item small { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
    .dsh-pu-reg-custom { display: flex; gap: 6px; align-items: center; padding: 6px 4px 2px; border-top: 1px dashed var(--dsw-alias-border-l1); margin-top: 4px; }
    .dsh-pu-reg-custom input { flex: 1; min-width: 0; height: 26px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; outline: none; }
    .dsh-pu-reg-custom input:focus { border-color: var(--dsw-alias-brand-primary); }
    .dsh-pu-reg-problem { font-size: 10.5px; color: var(--dsw-alias-state-error-primary); padding: 4px 4px 2px; }
    .dsh-pu-modal { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .dsh-pu-modal-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .38); }
    .dsh-pu-modal-body { position: relative; display: flex; flex-direction: column; gap: 8px; width: min(560px, 100%); max-height: min(640px, 100%); overflow: auto; padding: 16px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); box-shadow: 0 24px 64px rgba(0, 0, 0, .28); }
    .dsh-pu-modal-head { display: flex; align-items: center; gap: 10px; }
    .dsh-pu-modal-title { font-size: 14px; font-weight: 600; flex: 1; min-width: 0; }
    .dsh-pu-modal-sub { margin: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary); line-height: 1.5; }
    .dsh-pu-src-group { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); padding-top: 6px; }
    .dsh-pu-src-list { display: flex; flex-direction: column; gap: 6px; }
    .dsh-pu-src-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
    .dsh-pu-src-row.is-active { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
    .dsh-pu-src-row.is-editing { flex-direction: column; align-items: stretch; }
    .dsh-pu-src-id { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
    .dsh-pu-src-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
    .dsh-pu-src-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .dsh-pu-src-actions { display: flex; align-items: center; gap: 4px; flex: none; flex-wrap: wrap; }
    .dsh-pu-src-verdict { flex-basis: 100%; display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
    .dsh-pu-src-verdict.is-ok { color: var(--dsw-alias-state-success-primary); }
    .dsh-pu-src-verdict.is-err { color: var(--dsw-alias-state-error-primary); }
    .dsh-pu-src-input { flex: 1; min-width: 0; height: 28px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 9px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; outline: none; }
    .dsh-pu-src-input:focus { border-color: var(--dsw-alias-brand-primary); }
    .dsh-pu-src-add { display: flex; align-items: center; gap: 6px; padding-top: 4px; }
    .dsh-pu-src-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 8px; border-top: 1px dashed var(--dsw-alias-border-l1); }
    .dsh-pu-src-foot .dsh-pu-hint { flex: 1; min-width: 160px; }
    .dsh-pu-tag { font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-weight: 500; white-space: nowrap; }
    .dsh-pu-tag.is-new { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
    .dsh-pu-tag.is-err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dsh-pu-vers { display: flex; align-items: center; gap: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }
    .dsh-pu-vers b { color: var(--dsw-alias-label-primary); font-weight: 600; }
    .dsh-pu-vers i { font-style: normal; color: var(--dsw-alias-label-tertiary); }
    .dsh-pu-row-actions { display: flex; align-items: center; gap: 6px; flex: none; }
    .dsh-pu-hist { border-top: 1px dashed var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); padding: 8px 12px 10px; }
    .dsh-pu-hist-head { display: flex; align-items: center; gap: 8px; justify-content: flex-start; font-size: 11px; color: var(--dsw-alias-label-secondary); padding-bottom: 6px; }
    .dsh-pu-hist-head .dsh-pu-mono { margin-left: auto; }
    .dsh-pu-dim { color: var(--dsw-alias-label-tertiary); }
    .dsh-pu-hist-list { display: flex; flex-direction: column; max-height: 260px; overflow: auto; }
    .dsh-pu-hist-row { display: flex; align-items: center; gap: 10px; padding: 5px 6px; border-radius: 6px; font-size: 11px; }
    .dsh-pu-hist-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .dsh-pu-hist-row.is-current { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
    .dsh-pu-hist-row .dsh-pu-mono { flex: none; min-width: 108px; color: var(--dsw-alias-label-primary); }
    .dsh-pu-link { display: inline-flex; align-items: center; gap: 4px; border: 0; padding: 0; margin: 0; background: none; cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-link); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--dsw-alias-link) 40%, transparent); text-underline-offset: 2px; }
    .dsh-pu-link:hover { color: var(--dsw-alias-brand-primary); text-decoration-color: currentColor; }
    .dsh-pu-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
    .dsh-pu-hist-row time { color: var(--dsw-alias-label-tertiary); flex: none; min-width: 84px; }
    .dsh-pu-hist-row .dsh-pu-note { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-state-warn-primary); }
    .dsh-pu-empty { border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; padding: 28px 16px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-secondary); display: flex; flex-direction: column; gap: 6px; }
    .dsh-pu-empty small { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
    .dsh-pu-job { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
    .dsh-pu-job-head { display: flex; align-items: center; gap: 10px; font-size: 12px; }
    .dsh-pu-job-head .dsh-pu-grow { flex: 1; min-width: 0; }
    .dsh-pu-bar { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
    .dsh-pu-bar-inner { height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
    .dsh-pu-bar-inner.is-busy { width: 40%; transition: none; animation: dsh-pu-indeterminate 1.4s ease-in-out infinite; }
    @keyframes dsh-pu-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
    .dsh-pu-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
    .dsh-pu-activity { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dsh-pu-log { max-height: 160px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-word; border-top: 1px dashed var(--dsw-alias-border-l1); padding-top: 8px; margin: 0; }
    .dsh-pu-banner { display: flex; align-items: center; gap: 8px; font-size: 11.5px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
    .dsh-pu-banner.is-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
    .dsh-pu-banner.is-err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dsh-pu-foot { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary); flex-wrap: wrap; }
    .dsh-pu-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-brand-primary); animation: dsh-pu-spin .8s linear infinite; flex: none; }
    @keyframes dsh-pu-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .dsh-pu-spin { animation-duration: 2.4s; } .dsh-pu-bar-inner.is-busy { animation-duration: 3s; } }
    `;

    // src/client/components/JobPanel.ts
    var CLOCK_MS = 1e3;
    var STALE_SNAPSHOT_MS = 20 * 1e3;
    function useNow(running, from) {
      const React = getReact();
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        if (!running || from === void 0) return void 0;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
        return () => clearInterval(timer);
      }, [running, from]);
      return now;
    }
    function JobPanel(props) {
      const h = getH();
      const React = getReact();
      const { job, t, onCancel, cancelling } = props;
      const [showLog, setShowLog] = React.useState(true);
      const total = job.total ?? 0;
      const done = job.done ?? 0;
      const percent = total === 0 ? 0 : Math.round(done / total * 100);
      const running = job.status === "running" || job.status === "queued";
      const failed = job.failed ?? 0;
      const inStep = running && job.current !== void 0;
      const now = useNow(inStep, job.stepStartedAt);
      const stamp = `${job.id}|${job.stepStartedAt ?? ""}|${job.done ?? 0}|${job.status}|${job.activity ?? ""}`;
      const lastChange = React.useRef({ stamp, at: Date.now() });
      if (lastChange.current.stamp !== stamp) lastChange.current = { stamp, at: Date.now() };
      const stale = inStep && Date.now() - lastChange.current.at > STALE_SNAPSHOT_MS;
      const stepMs = job.stepStartedAt === void 0 ? 0 : Math.max(0, now - job.stepStartedAt);
      const phaseKey = job.phase === "installing" ? "phaseInstalling" : job.phase === "applying" ? "phaseApplying" : job.phase === "cancelling" ? "phaseCancelling" : job.phase === "verifying" ? "phaseVerifying" : "phaseWaiting";
      const phaseText = job.attempt !== void 0 && job.attempt.total > 1 ? t("registryAttempt", job.attempt.index, job.attempt.total) : t(phaseKey);
      const headline = running ? t("progress", done, total) : job.status === "cancelled" ? t("jobCancelled") : t("jobDone");
      return h(
        "div",
        { className: "dsh-pu-job" },
        h(
          "div",
          { className: "dsh-pu-job-head" },
          running ? h("span", { className: "dsh-pu-spin" }) : null,
          h(
            "span",
            { className: "dsh-pu-grow" },
            headline,
            job.current === void 0 ? null : h("span", { className: "dsh-pu-mono" }, ` ${job.current}`),
            inStep ? h(
              "span",
              { className: "dsh-pu-dim" },
              ` \xB7 ${phaseText} \xB7 ${t("elapsed", formatElapsed(stepMs))}`
            ) : null,
            // Once the snapshot stops moving the clock is reporting a number nobody
            // is updating, so say so instead of letting it climb.
            stale ? h("span", { className: "dsh-pu-dim" }, ` \xB7 ${t("staleSnapshot")}`) : null,
            job.abandoned === true ? h("span", { className: "dsh-pu-dim" }, ` \xB7 ${t("stalled")}`) : null
          ),
          failed > 0 ? h("span", { className: "dsh-pu-tag is-err" }, t("failedSome", failed)) : null,
          running ? h(
            "button",
            { type: "button", className: "dsh-pu-btn is-tiny", disabled: cancelling, onClick: onCancel },
            cancelling ? t("cancelling") : t("cancel")
          ) : null,
          h(
            "button",
            { type: "button", className: "dsh-pu-btn is-ghost is-tiny", onClick: () => setShowLog((value) => !value) },
            showLog ? t("hideLog") : t("showLog")
          )
        ),
        h(
          "div",
          { className: "dsh-pu-bar" },
          inStep ? h("div", { className: "dsh-pu-bar-inner is-busy" }) : h("div", { className: "dsh-pu-bar-inner", style: { width: `${percent}%` } })
        ),
        /*
         * The live line pnpm last printed. A phase name says which category of wait
         * this is; this says whether anything is actually happening — a registry
         * timeout and a download both read as "installing" otherwise.
         */
        inStep && job.activity !== void 0 ? h("div", { className: "dsh-pu-activity", title: job.activity }, job.activity) : null,
        inStep ? h("div", { className: "dsh-pu-hint" }, t("slowHint")) : null,
        showLog && Array.isArray(job.log) ? h("pre", { className: "dsh-pu-log" }, job.log.join("\n")) : null
      );
    }

    // src/client/components/VersionLine.ts
    function VersionLine(props) {
      const h = getH();
      const { row, version, t, busy, onSwitch } = props;
      const note = version.deprecated !== void 0 ? `\u26A0 ${version.deprecated}` : "";
      const link = resolveVersionLink(row, version);
      const linkLabel = link !== void 0 && /\/releases\/tag\//.test(link) ? t("githubVersion") : t("githubReleases");
      const title = link === void 0 ? void 0 : `${linkLabel} \u2192${link}`;
      return h(
        "div",
        { className: `dsh-pu-hist-row${version.current ? " is-current" : ""}` },
        link !== void 0 ? h(
          "button",
          {
            type: "button",
            className: "dsh-pu-mono dsh-pu-link",
            title,
            onClick: () => openExternal(link)
          },
          version.version
        ) : h("span", { className: "dsh-pu-mono" }, version.version),
        h("time", null, formatDate(version.time)),
        version.latest ? h("span", { className: "dsh-pu-tag is-new" }, t("latest")) : null,
        version.current ? h("span", { className: "dsh-pu-tag" }, t("current")) : null,
        h("span", { className: "dsh-pu-note" }, note),
        link === void 0 ? null : h(
          "button",
          {
            type: "button",
            className: "dsh-pu-btn is-ghost is-tiny",
            title,
            "aria-label": linkLabel === t("githubVersion") ? `${linkLabel}: ${version.version}` : linkLabel,
            onClick: () => openExternal(link)
          },
          "\u2192"
        ),
        h(
          "button",
          {
            type: "button",
            className: "dsh-pu-btn is-tiny",
            disabled: busy || version.current === true,
            onClick: () => onSwitch(row, version.version)
          },
          /*
           * "Back to latest" is only meaningful when the row is not already on it.
           * The label used to key on `version.version === row.latest` alone, so the
           * version the user is running offered to switch to itself whenever the
           * host had not marked it current.
           */
          version.version === row.latest && version.current !== true ? t("back") : t("switchTo")
        )
      );
    }

    // src/client/components/PluginRow.ts
    function PluginRow(props) {
      const h = getH();
      const React = getReact();
      const { row, t, busy, picked, onToggle, onUpgrade, onSwitch, onApprove, onOpenPage } = props;
      const { self, onInstallSelf } = props;
      const { onRetryHistory } = props;
      const [open, setOpen] = React.useState(false);
      const versions = Array.isArray(row.versions) ? row.versions : [];
      const hasHistory = versions.length > 0;
      const selfUpdate = self === true && row.latest !== void 0 && row.latest !== row.version;
      const selectable = row.upgradable === true && self !== true;
      const status = row.error !== void 0 && row.error !== null ? "err" : row.upgradable ? "new" : "idle";
      const failure = row.versionError !== void 0 && row.versionError !== "" ? row.versionError : void 0;
      const retriable = failure !== void 0 && /unreachable|timeout|registry \d|github/i.test(failure);
      const versionNote = failure === void 0 ? void 0 : failure === "not a profile-managed package" ? t("sourcePath") : failure;
      const pendingBuilds = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : [];
      return h(
        "div",
        { className: `dsh-pu-row${open ? " is-open" : ""}${picked ? " is-picked" : ""}` },
        h(
          "div",
          { className: "dsh-pu-row-main" },
          h(
            "span",
            {
              className: `dsh-pu-check${picked ? " is-on" : ""}${busy || !selectable ? " is-off" : ""}`,
              role: "checkbox",
              "aria-checked": picked === true ? "true" : "false",
              "aria-disabled": busy || !selectable ? "true" : void 0,
              "aria-label": `${t("selectRow")}: ${row.name}`,
              tabIndex: busy || !selectable ? void 0 : 0,
              title: selectable ? t("selectRow") : void 0,
              onClick: busy || !selectable ? void 0 : () => onToggle(row.name),
              onKeyDown: (event) => {
                if (busy || !selectable) return;
                if (event.key !== " " && event.key !== "Enter") return;
                event.preventDefault();
                onToggle(row.name);
              }
            },
            h("span", { className: "dsh-pu-tick", "aria-hidden": "true" })
          ),
          h("span", { className: `dsh-pu-dot${status === "idle" ? "" : status === "new" ? " is-new" : " is-err"}` }),
          h(
            "div",
            { className: "dsh-pu-id" },
            h(
              "div",
              { className: "dsh-pu-name" },
              h("span", { title: row.name }, row.title === row.name ? row.name : `${row.title} \xB7 ${row.name}`),
              row.enabled === false ? h("span", { className: "dsh-pu-tag" }, "off") : null,
              row.upgradable ? h("span", { className: "dsh-pu-tag is-new" }, t("upgradable")) : null
            ),
            h(
              "div",
              { className: "dsh-pu-desc" },
              row.description !== void 0 && row.description !== "" ? row.description : versionNote ?? row.name
            ),
            /*
             * A mirror that is behind looks exactly like an up-to-date package: the
             * newer release is simply absent from the document the tab reads. Name
             * it, because choosing that version would fail inside pnpm with
             * ERR_PNPM_NO_MATCHING_VERSION and take the whole batch with it.
             */
            Array.isArray(row.mirrorMissing) && row.mirrorMissing.length > 0 ? h(
              "div",
              {
                className: "dsh-pu-note is-err",
                title: `${t("mirrorBehind")} ${row.mirrorMissing.join(", ")}`
              },
              `${t("mirrorBehind")}: ${row.mirrorMissing.slice(0, 3).join(", ")}${row.mirrorMissing.length > 3 ? " \u2026" : ""}`
            ) : null,
            failure !== void 0 && retriable ? h(
              "div",
              { className: "dsh-pu-note is-err", title: failure },
              `${t("historyFailed")}: ${failure}`,
              typeof onRetryHistory === "function" ? h(
                "button",
                {
                  type: "button",
                  className: "dsh-pu-btn is-ghost is-tiny",
                  disabled: busy,
                  onClick: onRetryHistory
                },
                t("retry")
              ) : null
            ) : null
          ),
          h(
            "div",
            { className: "dsh-pu-vers" },
            h("b", null, row.version ?? t("unknownVersion")),
            row.upgradable ? h("i", null, "\u2192") : null,
            row.upgradable ? h("b", null, row.latest) : null
          ),
          h(
            "div",
            { className: "dsh-pu-row-actions" },
            row.upgradable ? h(
              "button",
              {
                type: "button",
                className: "dsh-pu-btn is-primary is-tiny",
                disabled: busy,
                onClick: () => onUpgrade(row)
              },
              t("upgrade")
            ) : selfUpdate && typeof onInstallSelf === "function" ? h(
              "button",
              {
                type: "button",
                className: "dsh-pu-btn is-primary is-tiny",
                disabled: busy,
                title: `${t("selfUpdateHint")} \u2192${row.latest}`,
                onClick: () => onInstallSelf(row, row.latest)
              },
              t("selfUpdate")
            ) : null,
            typeof row.repoUrl === "string" ? h(
              "button",
              {
                type: "button",
                className: "dsh-pu-btn is-tiny",
                title: `${t("github")} \u2192${row.repoUrl}`,
                onClick: () => openExternal(row.repoUrl)
              },
              "GH"
            ) : null,
            hasHistory ? h(
              "button",
              {
                type: "button",
                className: "dsh-pu-btn is-tiny",
                onClick: () => setOpen((value) => !value),
                "aria-expanded": open
              },
              open ? t("hideHistory") : `${t("history")} (${versions.length})`
            ) : null,
            typeof onOpenPage === "function" ? h(
              "button",
              {
                type: "button",
                className: "dsh-pu-btn is-ghost is-tiny",
                title: t("openPage"),
                onClick: () => onOpenPage(row.name)
              },
              "\u2192"
            ) : null
          )
        ),
        pendingBuilds.length > 0 ? h(
          "div",
          { className: "dsh-pu-hist" },
          h(
            "div",
            { className: "dsh-pu-banner is-warn" },
            h("span", null, t("buildBlocked")),
            h(
              "button",
              { type: "button", className: "dsh-pu-btn is-tiny", onClick: () => onApprove(row) },
              t("approve")
            )
          )
        ) : null,
        open ? h(
          "div",
          { className: "dsh-pu-hist" },
          h(
            "div",
            { className: "dsh-pu-hist-head" },
            h("span", null, t("versions", row.totalVersions ?? versions.length)),
            typeof row.totalVersions === "number" && row.totalVersions > versions.length ? h("span", { className: "dsh-pu-dim" }, t("showingNewest", versions.length)) : null,
            h("span", { className: "dsh-pu-mono" }, row.name)
          ),
          h(
            "div",
            { className: "dsh-pu-hist-list" },
            versions.map((version) => h(VersionLine, { key: version.version, row, version, t, busy, onSwitch }))
          )
        ) : null
      );
    }

    // src/client/components/SourceDialog.ts
    function RegistrySourceButton(props) {
      const h = getH();
      const React = getReact();
      const { t, active, known, setting, onChanged, disabled } = props;
      const [open, setOpen] = React.useState(false);
      const [draft, setDraft] = React.useState("");
      const [editing, setEditing] = React.useState(void 0);
      const [editDraft, setEditDraft] = React.useState("");
      const [busy, setBusy] = React.useState(false);
      const [problem, setProblem] = React.useState(void 0);
      const [probes, setProbes] = React.useState({});
      React.useEffect(() => {
        if (!open) return void 0;
        const onKey = (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open]);
      const saved = setting.saved.trim();
      const current = saved === "" ? t("registryFollowPnpm") : saved;
      const custom = setting.custom;
      const hostSources = offeredRegistries(known).filter(
        (url) => !isBuiltinRegistry(url) && !custom.some((entry) => comparisonKey(entry) === comparisonKey(url)) && comparisonKey(url) !== comparisonKey(saved)
      );
      if (setting.unavailable === "no-config-forms") {
        return h("span", { className: "dsh-pu-mono" }, `${t("registry")}: ${active}`);
      }
      const apply2 = async (value) => {
        if (busy) return false;
        setProblem(void 0);
        const trimmed = value.trim();
        if (trimmed !== "" && !isRegistryAddress(trimmed)) {
          setProblem(t("registryInvalid"));
          return false;
        }
        setBusy(true);
        const ok = await setting.save(trimmed);
        setBusy(false);
        if (!ok) {
          setProblem(t("registrySaveFailed"));
          return false;
        }
        onChanged();
        return true;
      };
      const writeSources = async (next) => {
        setProblem(void 0);
        setBusy(true);
        const ok = await setting.saveSources(next);
        setBusy(false);
        if (!ok) {
          setProblem(t("registrySaveFailed"));
          return false;
        }
        return true;
      };
      const add = async (value) => {
        const candidate = value ?? draft;
        const next = addSource(custom, candidate);
        if (next === void 0) {
          setProblem(isRegistryAddress(candidate) ? t("sourceExists") : t("registryInvalid"));
          return;
        }
        if (!await writeSources(next)) return;
        if (value === void 0) setDraft("");
      };
      const commitEdit = async (index) => {
        const next = editSource(custom, index, editDraft);
        if (next === void 0) {
          setProblem(isRegistryAddress(editDraft) ? t("sourceExists") : t("registryInvalid"));
          return;
        }
        const wasActive = comparisonKey(custom[index] ?? "") === comparisonKey(saved);
        if (!await writeSources(next)) return;
        setEditing(void 0);
        setEditDraft("");
        if (wasActive) await apply2(next[index] ?? "");
      };
      const drop = async (index) => {
        const next = removeSource(custom, index);
        if (next === void 0) return;
        const wasActive = comparisonKey(custom[index] ?? "") === comparisonKey(saved);
        if (!await writeSources(next)) return;
        if (editing === index) setEditing(void 0);
        if (wasActive) await apply2("");
      };
      const test = async (url) => {
        const key = comparisonKey(url);
        setProbes((previous) => ({ ...previous, [key]: { status: "testing" } }));
        let result;
        try {
          result = await probeRegistry(url);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setProbes((previous) => ({
            ...previous,
            [key]: { status: "fail", detail }
          }));
          return;
        }
        setProbes((previous) => ({
          ...previous,
          [key]: {
            status: result.ok ? "ok" : "fail",
            detail: result.ok && result.ms !== void 0 ? `${result.detail} \xB7 ${result.ms} ms` : result.detail
          }
        }));
      };
      const verdict = (url) => {
        const state = probes[comparisonKey(url)];
        if (state === void 0) return null;
        if (state.status === "testing") {
          return h(
            "span",
            { className: "dsh-pu-src-verdict" },
            h("i", { className: "dsh-pu-spin" }),
            t("sourceTesting")
          );
        }
        const ok = state.status === "ok";
        return h(
          "span",
          { className: `dsh-pu-src-verdict ${ok ? "is-ok" : "is-err"}` },
          `${ok ? t("sourceReachable") : t("sourceUnreachable")}${state.detail === void 0 ? "" : ` \xB7 ${state.detail}`}`
        );
      };
      const row = (url, inUse, editable, index) => h(
        "div",
        { className: `dsh-pu-src-row${inUse ? " is-active" : ""}`, key: url },
        h(
          "div",
          { className: "dsh-pu-src-id" },
          h("span", { className: "dsh-pu-mono dsh-pu-src-url" }, url),
          h(
            "div",
            { className: "dsh-pu-src-meta" },
            editable ? null : h("span", { className: "dsh-pu-tag" }, t("sourceBuiltin")),
            inUse ? h("span", { className: "dsh-pu-tag is-new" }, t("sourceInUse")) : null
          )
        ),
        h(
          "div",
          { className: "dsh-pu-src-actions" },
          h(
            "button",
            {
              type: "button",
              className: "dsh-pu-btn is-tiny",
              disabled: busy || probes[comparisonKey(url)]?.status === "testing",
              onClick: () => {
                void test(url);
              }
            },
            t("sourceTest")
          ),
          editable ? h(
            "button",
            {
              type: "button",
              className: "dsh-pu-btn is-tiny",
              disabled: busy,
              onClick: () => {
                setProblem(void 0);
                setEditing(index);
                setEditDraft(url);
              }
            },
            t("sourceEdit")
          ) : null,
          editable ? h(
            "button",
            {
              type: "button",
              className: "dsh-pu-btn is-tiny is-ghost",
              disabled: busy,
              onClick: () => {
                void drop(index);
              }
            },
            t("sourceDelete")
          ) : null,
          h(
            "button",
            {
              type: "button",
              className: `dsh-pu-btn is-tiny${inUse ? "" : " is-primary"}`,
              disabled: busy || inUse,
              onClick: () => {
                void apply2(url);
              }
            },
            inUse ? t("sourceApplied") : t("sourceApply")
          )
        ),
        verdict(url)
      );
      return h(
        "div",
        { className: "dsh-pu-reg" },
        h(
          "button",
          {
            type: "button",
            className: `dsh-pu-btn is-tiny dsh-pu-reg-btn${open ? " is-open" : ""}`,
            disabled: disabled || setting.writable !== true,
            title: setting.writable === true ? t("registryChange") : t("registryLocked"),
            onClick: () => setOpen((value) => !value)
          },
          h("span", { className: "dsh-pu-reg-label" }, `${t("registry")}:`),
          h("span", { className: "dsh-pu-mono dsh-pu-reg-value" }, current),
          h("span", { className: "dsh-pu-reg-caret" }, "\u22EF")
        ),
        setting.writable === true ? null : h(
          "span",
          { className: "dsh-pu-hint" },
          setting.unavailable === "loading" ? t("registryLoading") : t("registryLocked")
        ),
        open ? h(
          "div",
          { className: "dsh-pu-modal" },
          h("div", {
            className: "dsh-pu-modal-backdrop",
            onClick: () => setOpen(false),
            "aria-hidden": "true"
          }),
          h(
            "div",
            {
              className: "dsh-pu-modal-body",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": t("sourcesTitle")
            },
            h(
              "div",
              { className: "dsh-pu-modal-head" },
              h("span", { className: "dsh-pu-modal-title" }, t("sourcesTitle")),
              h(
                "button",
                {
                  type: "button",
                  className: "dsh-pu-btn is-ghost is-tiny",
                  onClick: () => setOpen(false),
                  "aria-label": t("sourcesClose")
                },
                "\u2715"
              )
            ),
            h("p", { className: "dsh-pu-modal-sub" }, t("sourcesHint")),
            h("div", { className: "dsh-pu-src-group" }, t("sourcesBuiltin")),
            h(
              "div",
              { className: "dsh-pu-src-list" },
              WELL_KNOWN_REGISTRIES.map(
                (url) => row(url, comparisonKey(saved) === comparisonKey(url), false, -1)
              )
            ),
            hostSources.length === 0 ? null : h(
              "div",
              null,
              h("div", { className: "dsh-pu-src-group" }, t("sourcesHost")),
              h("p", { className: "dsh-pu-hint" }, t("sourcesHostHint")),
              h(
                "div",
                { className: "dsh-pu-src-list" },
                hostSources.map(
                  (url) => h(
                    "div",
                    { className: "dsh-pu-src-row", key: url },
                    h(
                      "div",
                      { className: "dsh-pu-src-id" },
                      h("span", { className: "dsh-pu-mono dsh-pu-src-url" }, url),
                      h(
                        "div",
                        { className: "dsh-pu-src-meta" },
                        h("span", { className: "dsh-pu-tag" }, t("sourceHost"))
                      )
                    ),
                    h(
                      "div",
                      { className: "dsh-pu-src-actions" },
                      h(
                        "button",
                        {
                          type: "button",
                          className: "dsh-pu-btn is-tiny",
                          disabled: busy || probes[comparisonKey(url)]?.status === "testing",
                          onClick: () => {
                            void test(url);
                          }
                        },
                        t("sourceTest")
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          className: "dsh-pu-btn is-tiny",
                          disabled: busy,
                          onClick: () => {
                            void add(url);
                          }
                        },
                        t("sourceKeep")
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          className: "dsh-pu-btn is-tiny is-primary",
                          disabled: busy,
                          onClick: () => {
                            void apply2(url);
                          }
                        },
                        t("sourceApply")
                      )
                    ),
                    verdict(url)
                  )
                )
              )
            ),
            h("div", { className: "dsh-pu-src-group" }, t("sourcesCustom")),
            custom.length === 0 ? h("p", { className: "dsh-pu-hint" }, t("sourcesNone")) : h(
              "div",
              { className: "dsh-pu-src-list" },
              custom.map(
                (url, index) => editing === index ? h(
                  "div",
                  { className: "dsh-pu-src-row is-editing", key: `${url}#edit` },
                  h("input", {
                    type: "url",
                    inputMode: "url",
                    className: "dsh-pu-src-input",
                    value: editDraft,
                    "aria-label": t("sourceEdit"),
                    onChange: (event) => setEditDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitEdit(index);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditing(void 0);
                      }
                    }
                  }),
                  h(
                    "div",
                    { className: "dsh-pu-src-actions" },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dsh-pu-btn is-tiny is-primary",
                        disabled: busy || editDraft.trim() === "",
                        onClick: () => {
                          void commitEdit(index);
                        }
                      },
                      t("sourceSave")
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dsh-pu-btn is-tiny is-ghost",
                        disabled: busy,
                        onClick: () => setEditing(void 0)
                      },
                      t("sourceCancel")
                    )
                  )
                ) : row(url, comparisonKey(saved) === comparisonKey(url), true, index)
              )
            ),
            h(
              "div",
              { className: "dsh-pu-src-add" },
              h("input", {
                type: "url",
                inputMode: "url",
                className: "dsh-pu-src-input",
                placeholder: t("registryPlaceholder"),
                value: draft,
                "aria-label": t("sourcesAdd"),
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void add();
                }
              }),
              h(
                "button",
                {
                  type: "button",
                  className: "dsh-pu-btn is-tiny",
                  disabled: busy || draft.trim() === "",
                  onClick: () => {
                    void add();
                  }
                },
                t("sourcesAdd")
              )
            ),
            problem === void 0 ? null : h("div", { className: "dsh-pu-reg-problem" }, problem),
            h(
              "div",
              { className: "dsh-pu-src-foot" },
              h(
                "span",
                { className: "dsh-pu-hint" },
                h("span", null, `${t("sourcesCurrent")}: `),
                h("span", { className: "dsh-pu-mono" }, active === "" ? t("registryFollowPnpm") : active)
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dsh-pu-btn is-tiny",
                  disabled: active === "" || probes[comparisonKey(active)]?.status === "testing",
                  onClick: () => {
                    void test(active);
                  }
                },
                t("sourceTestCurrent")
              )
            ),
            active === "" ? null : verdict(active),
            h(
              "div",
              { className: "dsh-pu-src-foot" },
              h("span", { className: "dsh-pu-hint" }, t("registryFollowPnpmHint")),
              h(
                "button",
                {
                  type: "button",
                  className: `dsh-pu-btn is-tiny${saved === "" ? " is-ghost" : ""}`,
                  disabled: busy || saved === "",
                  onClick: () => {
                    void apply2("");
                  }
                },
                saved === "" ? t("sourceApplied") : t("registryFollowPnpm")
              )
            )
          )
        ) : null
      );
    }

    // src/client/components/Tab.ts
    var SELF_NAME = "dsh-plugin-upgrader";
    var APPEARANCE_RELOAD_DELAY_MS = 1200;
    function Tab(props) {
      const h = getH();
      const React = getReact();
      const { t, locale, configForms } = props;
      const revision = useLocaleRevision(locale);
      const localeId = React.useMemo(() => activeLocaleId(locale), [locale, revision]);
      const { data, error, loading, reload } = useOverview(localeId);
      const registry = useRegistrySetting(configForms, "plugin-upgrader");
      const [query, setQuery] = React.useState("");
      const [picked, setPicked] = React.useState(() => /* @__PURE__ */ new Set());
      const [job, setJob] = React.useState(void 0);
      const [busyName, setBusyName] = React.useState(void 0);
      const [cancelling, setCancelling] = React.useState(false);
      const [banner, setBanner] = React.useState(void 0);
      const alive = useAlive();
      const watch = React.useCallback(
        async (id) => {
          const settled = await watchJob(id, { isAlive: () => alive.current, onSnapshot: (snapshot) => setJob(snapshot) });
          if (!alive.current) return settled;
          setBusyName(void 0);
          setCancelling(false);
          reload(false);
          if (settled === void 0) {
            setJob(void 0);
            setBanner({ tone: "warn", text: t("lostJob") });
            return settled;
          }
          const failures = Array.isArray(settled?.results) ? settled.results.filter((result) => result.ok !== true) : [];
          if (failures.length > 0) {
            setBanner({
              tone: "err",
              text: failures.map((failure) => {
                const code = failure.message ?? "error";
                return failure.detail === void 0 ? `${failure.name}: ${code}` : `${failure.name}: ${failure.detail} (${code})`;
              }).join(" \xB7 ")
            });
          } else if (settled?.results?.some((result) => result.application === "restart-required") === true) {
            setBanner({ tone: "warn", text: t("restart") });
          } else if (replacedAppearance(settled?.results)) {
            setBanner({ tone: "info", text: t("reloadForAppearance") });
            window.setTimeout(() => {
              void reloadWhenBootDocumentFresh({
                onBlocked: () => {
                  if (alive.current) setBanner({ tone: "warn", text: t("reloadBlocked") });
                }
              });
            }, APPEARANCE_RELOAD_DELAY_MS);
          }
          return settled;
        },
        [alive, reload, t]
      );
      const adopted = React.useRef(void 0);
      React.useEffect(() => {
        const live = data?.active;
        if (live === void 0 || live === null) return;
        if (adopted.current === live.id) return;
        adopted.current = live.id;
        setJob(live);
        setBusyName(live.current);
        void watch(live.id);
      }, [data, watch]);
      const run = React.useCallback(
        async (steps, label) => {
          if (steps.length === 0) return;
          setBanner(void 0);
          setBusyName(label);
          setJob({ id: "", status: "queued", total: steps.length, done: 0, failed: 0, log: [] });
          const outcome = await submitJob(steps, watch);
          if (!alive.current) return;
          if (outcome.kind === "started" || outcome.kind === "adopted") {
            if (outcome.kind === "adopted") setBanner({ tone: "warn", text: t("busyAdopted") });
            return;
          }
          setBusyName(void 0);
          setJob(void 0);
          const failure = outcome.error;
          setBanner({ tone: "err", text: failure instanceof Error ? failure.message : String(failure) });
        },
        [alive, t, watch]
      );
      const rows = Array.isArray(data?.bundles) ? data.bundles : [];
      const batchable = (row) => row.upgradable === true && row.name !== SELF_NAME;
      const upgradable = rows.filter(batchable);
      const needle = query.trim().toLowerCase();
      const filtered = needle === "" ? rows : rows.filter(
        (row) => row.name.toLowerCase().includes(needle) || String(row.title ?? "").toLowerCase().includes(needle)
      );
      const busy = busyName !== void 0 || job !== void 0 && (job.status === "running" || job.status === "queued");
      const knownRegistries = [
        data?.registry,
        data?.registries?.registry,
        ...data?.registries?.fallbackRegistries ?? [],
        data?.registries?.resolved
      ];
      const pickedCount = upgradable.reduce((count, row) => picked.has(row.name) ? count + 1 : count, 0);
      const stepOf = (row, version, action, approveBuilds) => ({
        name: row.name,
        version,
        action,
        enabled: row.enabled !== false,
        ...approveBuilds === void 0 ? {} : { approveBuilds }
      });
      const upgradeOne = (row) => {
        void run([stepOf(row, row.latest ?? row.version ?? "", "upgrade")], row.name);
      };
      const switchOne = (row, version) => {
        void run([stepOf(row, version, "switch")], row.name);
      };
      const approveAndRetry = (row) => {
        const pendingBuilds = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : [];
        void run([stepOf(row, row.latest ?? row.version ?? "", "upgrade", pendingBuilds)], row.name);
      };
      const installSelf = React.useCallback(
        (row, version) => {
          const install = props.install;
          if (typeof install !== "function") {
            setBanner({ tone: "warn", text: t("selfUpdateUnavailable") });
            return;
          }
          setBanner(void 0);
          install({ spec: `${row.name}@${version}`, title: row.title, version });
        },
        [props.install, t]
      );
      const upgradeAll = () => {
        void run(
          upgradable.map((row) => stepOf(row, row.latest ?? row.version ?? "", "upgrade")),
          t("upgradeAll")
        );
      };
      const togglePick = (name2) => {
        setPicked((current) => {
          const next = new Set(current);
          if (next.has(name2)) next.delete(name2);
          else next.add(name2);
          return next;
        });
      };
      const pickAll = () => setPicked(new Set(upgradable.map((row) => row.name)));
      const clearPicked = () => setPicked(/* @__PURE__ */ new Set());
      const upgradePicked = () => {
        void run(
          upgradable.filter((row) => picked.has(row.name)).map((row) => stepOf(row, row.latest ?? row.version ?? "", "upgrade")),
          t("upgradeSelected")
        );
      };
      const cancel = () => {
        setCancelling(true);
        void cancelJob();
      };
      return h(
        "div",
        { className: "dsh-pu" },
        h("style", { key: STYLE_ID }, CSS),
        h(
          "div",
          { className: "dsh-pu-head" },
          h(
            "div",
            { className: "dsh-pu-head-main" },
            h("div", { className: "dsh-pu-title" }, t("title")),
            h("div", { className: "dsh-pu-sub" }, t("subtitle")),
            h(
              "div",
              { className: "dsh-pu-stats" },
              h("span", { className: "dsh-pu-stat" }, t("installed"), " ", h("b", null, String(rows.length))),
              h(
                "span",
                { className: `dsh-pu-stat${upgradable.length > 0 ? " is-warn" : ""}` },
                t("upgradable"),
                " ",
                h("b", null, String(upgradable.length))
              ),
              data?.registry === void 0 ? null : h(RegistrySourceButton, {
                t,
                active: data.registry,
                known: knownRegistries,
                setting: registry,
                disabled: busy,
                onChanged: () => reload(true)
              })
            )
          ),
          h(
            "div",
            { className: "dsh-pu-actions" },
            h(
              "div",
              { className: "dsh-pu-search" },
              h("input", {
                type: "search",
                placeholder: t("search"),
                value: query,
                onChange: (event) => setQuery(event.target.value),
                "aria-label": t("search")
              })
            ),
            h(
              "button",
              { type: "button", className: "dsh-pu-btn", disabled: loading === true || busy, onClick: () => reload(true) },
              loading === true ? h("span", { className: "dsh-pu-spin" }) : null,
              loading === true ? t("refreshing") : t("refresh")
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-pu-btn is-primary",
                disabled: upgradable.length === 0 || busy,
                onClick: upgradeAll
              },
              t("upgradeAll"),
              upgradable.length > 0 ? ` (${upgradable.length})` : ""
            )
          )
        ),
        banner === void 0 ? null : h(
          "div",
          {
            className: `dsh-pu-banner${banner.tone === "err" ? " is-err" : banner.tone === "warn" ? " is-warn" : ""}`
          },
          h("span", null, banner.text),
          banner.tone === "warn" ? h("span", null, t("restartHint")) : null,
          h(
            "button",
            { type: "button", className: "dsh-pu-btn is-ghost is-tiny", onClick: () => setBanner(void 0) },
            "\u2715"
          )
        ),
        job === void 0 ? null : h(JobPanel, { job, t, onCancel: cancel, cancelling }),
        rows.length === 0 ? null : h(
          "div",
          { className: `dsh-pu-selbar${pickedCount > 0 ? " is-active" : ""}` },
          h("span", { className: "dsh-pu-grow" }, pickedCount > 0 ? t("selected", pickedCount) : t("nothingSelected")),
          h(
            "button",
            {
              type: "button",
              className: "dsh-pu-btn is-tiny",
              disabled: busy || upgradable.length === 0,
              onClick: pickAll
            },
            t("selectAll")
          ),
          pickedCount > 0 ? h(
            "button",
            { type: "button", className: "dsh-pu-btn is-tiny", disabled: busy, onClick: clearPicked },
            t("clearSelection")
          ) : null,
          h(
            "button",
            {
              type: "button",
              className: "dsh-pu-btn is-tiny is-primary",
              disabled: busy || pickedCount === 0,
              onClick: upgradePicked
            },
            t("upgradeSelected"),
            pickedCount > 0 ? ` (${pickedCount})` : ""
          )
        ),
        loading === true && rows.length === 0 ? h("div", { className: "dsh-pu-empty" }, h("span", null, t("loading"))) : null,
        error !== void 0 && rows.length === 0 ? h(
          "div",
          { className: "dsh-pu-empty" },
          h("span", null, `${t("loadFailed")} \u2192${error}`),
          h(
            "div",
            null,
            h("button", { type: "button", className: "dsh-pu-btn is-tiny", onClick: () => reload(true) }, t("retry"))
          )
        ) : null,
        rows.length === 0 && loading !== true && error === void 0 ? h("div", { className: "dsh-pu-empty" }, h("span", null, t("empty")), h("small", null, t("emptyHint"))) : null,
        filtered.length === 0 && rows.length > 0 ? h("div", { className: "dsh-pu-empty" }, h("span", null, t("noMatch"))) : null,
        filtered.length === 0 ? null : h(
          "div",
          { className: "dsh-pu-list" },
          filtered.map(
            (row) => h(PluginRow, {
              key: row.name,
              row,
              t,
              busy,
              picked: picked.has(row.name),
              onToggle: togglePick,
              onUpgrade: upgradeOne,
              onSwitch: switchOne,
              onApprove: approveAndRetry,
              onOpenPage: typeof props.openPackage === "function" ? props.openPackage : void 0,
              self: row.name === SELF_NAME,
              onInstallSelf: installSelf,
              onRetryHistory: () => reload(true)
            })
          )
        ),
        rows.length > 0 && upgradable.length === 0 ? h("div", { className: "dsh-pu-banner" }, h("span", null, t("upToDate"))) : null,
        h(
          "div",
          { className: "dsh-pu-foot" },
          data?.generatedAt === void 0 ? null : h("span", null, `${t("generated")} ${new Date(data.generatedAt).toLocaleTimeString()}`),
          data?.registry === void 0 ? null : h("span", { className: "dsh-pu-mono" }, data.registry)
        )
      );
    }

    // src/client/plugin.ts
    var NS = "plugin-upgrader";
    var name = "plugin-upgrader";
    var inject = ["slots", "locale"];
    function apply(ctx) {
      const locale = ctx.get("locale", false);
      const active = () => activeLocaleId(locale);
      let bound;
      if (locale !== void 0 && locale !== null) {
        try {
          locale.register?.(NS, { zh: ZH, en: EN });
          bound = locale.bind?.(NS);
        } catch (error) {
          console.warn("[plugin-upgrader] locale namespace unavailable, using built-in copy", error);
        }
      }
      const t = makeT(bound, active);
      const configForms = ctx.get("configForms", false);
      ctx.slots.inject(
        "plugins.tab",
        () => ctx.slots.register(
          { name: "plugins.tab", id: name, order: 5, label: () => t("tab") },
          (ownerProps) => getH()(Tab, { ...ownerProps, t, locale, configForms })
        )
      );
    }

    // src/client/index.ts
    function createPlugin(require2) {
      installReact(require2("react"));
      return { name, inject, apply: (ctx) => apply(ctx) };
    }

    return module.exports.createPlugin(require)
  },
})
