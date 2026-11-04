# AGENTS.md —— 改这个仓库之前先读

这个文件记录**已经实现并且必须继续成立**的行为，只写判据：哪条不许破、破了会长什么样、
动它之前该核对哪些符号和测试。每一条都曾经是 bug：被修好过一次，然后在一次看起来无关的
重构里悄悄退回去过一次。任何一条被破坏，都必须先说明为什么可以破坏，而不是顺手删掉。

判断标准只有一句：**用户能看见的结果不能变差**。内部实现随便换，下面标了「不可退化」的
对外行为不行。改完跑 `pnpm run check`。

**这个文件是「判据层」，不是「资料层」。** 每条末尾的「改之前先读」指向 `docs/rules/` 里的
详证页：当年的完整事故叙述、逐行核对过的符号位置、曾被误改的写法、以及该条规则的原文存档。
那些页面**不会被自动加载**，只在你要动那一条时才打开——所以正文能省的字都省在那里了。
（§14 是唯一的例外：它的详证直接并进了本来就存在的 [RELEASING.md](RELEASING.md)。）

**新加一条规则时：** 判据写进本文件（一段话 + 几条禁令 + 涉及的符号和测试），完整背景写进
`docs/rules/NN-slug.md`。不要反过来，也不要把详证塞回这里。

---

## 改哪读哪

| 你要动的地方 | 先读 |
|---|---|
| 版本列表、`GH` 按钮、历史版本链接 | §1 · [01-github-links](docs/rules/01-github-links.md) |
| 升级 / 换版本的安装顺序 | §2 · [02-in-place-replacement](docs/rules/02-in-place-replacement.md) |
| profile `package.json` 的任何读写 | §3 · [03-journal](docs/rules/03-journal.md)、§22 · [22-manifest-lock](docs/rules/22-manifest-lock.md) |
| 页面 reload、batch URL | §4 · [04-boot-reload](docs/rules/04-boot-reload.md) |
| `dist-tags.latest` 的取舍 | §5 · [05-latest-tag](docs/rules/05-latest-tag.md) |
| 镜像 / 上游 registry | §6 · [06-mirror-gap](docs/rules/06-mirror-gap.md) |
| 升级进度、阶段判定、心跳 | §7 · [07-progress](docs/rules/07-progress.md) |
| `package.json.lock` 的报错 | §8 · [08-writer-lock](docs/rules/08-writer-lock.md) |
| 批量升级、自身那一行 | §9 · [09-self-update](docs/rules/09-self-update.md) |
| `bundle-in-use` | §10 · [10-bundle-in-use](docs/rules/10-bundle-in-use.md) |
| 安装源设置 | §12 · [12-registry-setting](docs/rules/12-registry-setting.md) |
| `lib/` 与构建产物 | §13 · [13-lib-committed](docs/rules/13-lib-committed.md) |
| 发版流程 | §14 · [RELEASING.md](RELEASING.md) |
| 能力声明、`package.json` 的 `dsh` 字段 | §15 · [15-capability-declaration](docs/rules/15-capability-declaration.md) |
| 「需要重启」、pid 轮询 | §16 · [16-restart](docs/rules/16-restart.md) |
| `watchJob` 失联判定 | §17 · [17-watch](docs/rules/17-watch.md) |
| DSH 版本兼容性 | §18 · [18-compatibility](docs/rules/18-compatibility.md) |
| 批次 `JobStore` | §19 · [19-job-store](docs/rules/19-job-store.md) |
| 安装前的兼容性预检 | §20 · [20-precheck](docs/rules/20-precheck.md) |
| 失败升级后的状态恢复 | §21 · [21-failed-upgrade-enabled](docs/rules/21-failed-upgrade-enabled.md) |
| journal 本身的格式与「一条记录属于谁」 | §23 · [23-journal-per-package](docs/rules/23-journal-per-package.md) |

---

## 1. GitHub 链接：每行的 `GH` 按钮 + 每个历史版本号上的链接

**不可退化。** 每行有 `GH` 按钮，打开插件仓库主页；没有 `repository` 的**不显示**，而不是一个坏的。

- 版本号本身就是链接：有 tag → `releases/tag/v<version>`；没 tag 或读不到 → 退回 `releases`，**绝不猜 tag**。
- 「历史版本 (n)」**读失败必须**显示原因和「重试」，不能安静地少一个按钮。
- `dropsRepositoryFields` **不要**只看顶层。

**代码：** `fetchPackument` @ `src/host/registry.ts`、`releasePathOf` @ `src/host/version.ts`
**守护：** `test/registry.test.ts`、`test/repo.test.ts`、`test/version.test.ts`
**改之前先读** [`docs/rules/01-github-links.md`](docs/rules/01-github-links.md) —— 为什么。

---

## 2. 换版本时**不先卸载**（in-place replacement）

**不可退化。** `installBundle` 对已声明依赖以 `already-installed` 拒绝，pnpm 根本不跑。

1. **先直接 install**，顺序**不能被重排**。
2. 被拒 → `replaceWithoutRemoval`：**临时**摘掉那条依赖（写 journal）再 install，**插件不被卸载**。
3. **只有**它主动放弃时才退回 `removeForReplacement`。

桌面壳**不导出** `DSH_PROFILE*`，`profileDirFrom` **必须**有 cwd 回退。

**代码：** `runStep` / `replaceWithoutRemoval` @ `src/host/install.ts`、`profileDirFrom` @ `src/host/manifest.ts`
**守护：** `test/install.test.ts`、`test/manifest.test.ts`
**改之前先读** [`docs/rules/02-in-place-replacement.md`](docs/rules/02-in-place-replacement.md) —— 两次回退全过程。

---

## 3. Profile manifest 必须随时可恢复（journal）

**不可退化。** 窗口里被杀插件会从 manifest 消失——**先 journal，再删，再写 manifest**。

- 加载时 `recoverPendingDrop`：缺→补回；已在→只清 journal；损坏→清掉，**绝不**凭猜测改 manifest；失败只 warn，不阻断加载。

**代码：** `recoverPendingDrop` @ `src/host/manifest.ts`
**守护：** `test/manifest.test.ts`
**改之前先读** [`docs/rules/03-journal.md`](docs/rules/03-journal.md) —— 三条判定。

---

## 4. 升级完不能把页面 reload 进一个已经不存在的 boot 文档

**不可退化。** 404 毒掉整批。

- reload **必须**先 `reloadWhenBootDocumentFresh`。
- **只有确定的 404** 才阻止并提示重启；说不清的照常 reload。
- **不要**写回 `window.location.reload()`。

**代码：** `reloadWhenBootDocumentFresh` @ `src/client/boot.ts`
**守护：** `test/boot.test.ts`、`test/appearance.test.ts`
**改之前先读** [`docs/rules/04-boot-reload.md`](docs/rules/04-boot-reload.md) —— 三态判定

---

## 5. 「latest」不能低于已安装的版本

**不可退化。** 坏 tag 会把降级说成可升级。

- 正常**原样信任**，更高的 prerelease **不许**抢。
- **只有**低于已装才是坏 tag → 取更高者，稳定优先；无更高则**留原 tag**，**不许**造。

**代码：** `shapePackument` @ `src/host/registry.ts`
**守护：** `test/shape-packument.test.ts`
**改之前先读** [`docs/rules/05-latest-tag.md`](docs/rules/05-latest-tag.md) —— 严格小于

---

## 6. 镜像落后要让用户看见

**不可退化。** 镜像不说落后，缺的版本**装不了**。

- 非官方源额外问上游，列出高于已安装的缺口。
- 上游读不到报「没有缺口」，**不要**报「全部缺失」。

**代码：** `versionsMissingFromMirror` @ `src/host/registry.ts`
**守护：** `test/mirror-gap.test.ts`
**改之前先读** [`docs/rules/06-mirror-gap.md`](docs/rules/06-mirror-gap.md) —— 缺口怎么算

---

## 7. 慢的时候必须看得见在干什么

**不可退化。** 一次升级可能跑几分钟：阶段说错、停滞误报都是假象。

- `waiting` → `verifying` → `installing` → `applying` / `cancelling`。
- `installing` **不代表**已过校验：后到的校验行必须能改回 `verifying`。
- `applying` / `cancelling` **不许**被日志回退。
- `verifying` 到 pnpm 出结论才结束，中途重试**不能**结束它。
- 空白 chunk 不算「有进展」。
- 「还在动」问**宿主**心跳，不问 pnpm。
- 面板要有已用时、阶段、慢速提示、日志尾部、停滞检测。

**代码：** `nextPhase` @ `src/host/progress.ts`、`HEARTBEAT_MS` @ `src/index.ts`
**守护：** `test/progress.test.ts`、`test/job-panel.test.ts`
**改之前先读** [`docs/rules/07-progress.md`](docs/rules/07-progress.md) —— 阶段机与心跳

---

## 8. 写入锁超时要翻成人话

**不可退化。** 原文只有文件名和 pid，用户无从下手。

- 先读锁，翻成人话，原文留方括号。
- 不是锁超时的信息**原样返回**。

**代码：** `explainLockTimeout` @ `src/host/lock.ts`
**守护：** `test/lock.test.ts`
**改之前先读** [`docs/rules/08-writer-lock.md`](docs/rules/08-writer-lock.md) —— 两种人话

---

## 9. 自己不能给自己换版本

**不可退化。** 批量第一步卸载的正是此刻在跑的代码。

- 批量升级**永不包含**自己：落后走「用页面安装器升级」，没入口就明说。
- `link:` / `file:` 行（`sourceKind === 'path'`）**永远不可升级**。

**代码：** `SELF_NAME` / `batchable` / `installSelf` @ `src/client/components/Tab.ts`、`sourceKind` @ `src/host/bundle.ts`
**守护：** `test/self-row.test.ts`
**改之前先读** [`docs/rules/09-self-update.md`](docs/rules/09-self-update.md) —— 判据

---

## 10. `bundle-in-use` 要自己解开

**不可退化。** 加载器仍持 fiber 时 `removeBundle` 空转：先 `setBundleEnabled(true)` 再 `setBundleEnabled(false)`，重试；仍失败才报重启。

**代码：** `removeForReplacement` @ `src/host/install.ts`
**守护：** `test/install.test.ts`
**改之前先读** [`docs/rules/10-bundle-in-use.md`](docs/rules/10-bundle-in-use.md)

---

## 11. 其它不许破的约定

- **路由仅限回环访问。** 任何 `POST job` / 安装动作只接受 loopback，否则 403。
  `isLoopbackRequest` @ `src/host/http.ts`。
- **一次只跑一批。** 第二个 `POST job` 拿 `409 busy`（带正在跑的 id），前端**接管**
  而不是报错。僵尸 job 按心跳（2 秒一次）15 分钟判废，不会永久占位。
  `HEARTBEAT_MS` / `STALE_JOB_MS` @ `src/index.ts`。
- **overview 的 registry 查询有并发上限。** 11 个并发打 `registry.npmmirror.com` 会超时
  （历史上正是「很多插件没有历史版本」的原因），上限是 `PACKUMENT_CONCURRENCY = 4`
  @ `src/host/registry.ts`，由 `mapLimited` @ `src/host/overview.ts` 执行。
  **不要换回 `Promise.all`。**
- **overview 一次答完。** 一个请求返回全部行（`bundles` 字段），不做 per-package 请求。
- **enabled 状态保留。** 任何真的卸载之后，都要把原来的启用 / 禁用状态装回去
  （`restoreEnabledState` @ `src/host/install.ts`），失败时报告它读到的状态。
- **失败要带原因。** 行上的 `versionError` / 历史读取失败不能是空白，界面必须显示原因
  并给重试入口。
- **语言**：所有面向用户的文案都走 `src/client/copy.ts` 的 zh + en 两份，不要内联中文。

---

## 12. 安装源是用户能改的设置，不是让用户改文件

**不可退化。** 换源是用户能改的**设置**，不是让他改 `~/.npmrc`；选择写进 profile，重启、换浏览器都还在。

- **自带源不能改也不能删**：`WELL_KNOWN_REGISTRIES` 是常量，永不写进 `customRegistries`。**不要**改成「渲染出来但按钮 disabled」——那会被恢复成可点。
- 自己加的源可改可删；删改正在用的那个时 `registry` 必须跟着变。**读写必须同源**：`registryBase()` 读、`runStep` 写。
- 「测试」**并发**打 `/-/ping` 与根地址，`PROBE_TIMEOUT_MS` 是整次预算。**这两条路不能改回串行**；失败原因取最具体的：状态码 > 超时 > 网络原文。
- 必须 volatile，`apply` **每次读** `config.registry.get()`，**不要**在加载时抄成字符串，也**不要**从 `@deepseek-ai/dsh-settings` import 已删的具名导出——宿主会起不来。
- 没有 `configForms` 时只显示不给改；**不要**存进 localStorage。

**代码：** `registryBase` @ `src/host/bundle.ts`、`runStep` @ `src/host/install.ts`、`chosenRegistry` @ `src/index.ts`
**守护：** `test/sources.test.ts`、`test/probe.test.ts`、`test/install.test.ts`
**改之前先读** [`docs/rules/12-registry-setting.md`](docs/rules/12-registry-setting.md) —— volatile 的理由与三条结构性禁令。

---

## 13. `lib/` 是提交进仓库的，不是构建垃圾

**不可退化。** Store 按 `files` 找**固定 commit** 里的 `./lib/index.js`，找不到就判缺少运行时文件，且拒绝 `prepare` 补齐。

- **改完 `src/` 必须 `pnpm run build` 并把 `lib/` 一起提交**；只提交 `src/` 等于发布新旧不匹配的包。
- **不许手改 `lib/` 里任何文件**：它是 tsc / esbuild 的输出，下次构建就没了。
- **`prepare` 不能加回来**：构建挂在 `prepack` 上，安装期不跑。
- `lib/` 必须**可复现**；守卫比的是**工作区与索引**，没有 `.git` 时放行。

**代码：** `files` @ `package.json`、`verify-build-committed.mjs` @ `scripts/`
**守护：** `scripts/verify-build-committed.mjs`（`check`、CI、publish 都跑）
**改之前先读** [`docs/rules/13-lib-committed.md`](docs/rules/13-lib-committed.md) —— 为何必须提交与三条硬约束。

---

## 14. 一次发版要同时到两个地方：npm 和 GitHub Release

**不可退化。** 推 tag 后 npm 和 Release 页面必须同时到。

- `release` job 用 `needs: publish` 排在发布之后：失败的发版不留空壳。
- **不许改回手工步骤，不许加 `continue-on-error`**：漏建变回看不见的失败。
- 正文两边都没有时脚本**退出 1、job 变红**；版本整词匹配，`1.6` 不匹 `1.6.0`。

**代码：** `.github/workflows/publish.yml`、`scripts/release-notes.mjs`
**守护：** `test/release-notes.test.ts`
**改之前先读** [`RELEASING.md`](RELEASING.md) —— 发版的完整步骤与 CI 两个 job 的分工。

---

## 15. 能力声明要如实写，但不能为了讨好扫描器去改代码

**不可退化。** 审核按源码里的字符串与语法判信号（**纯类型导入也算**），不看意图；声明必须与代码一致。

- **不要为了消掉信号去改功能**。
- **`process.env` 只许点号直取那六个白名单名**（`DSH_HOME` `HOME` `USERPROFILE` `PATH` `NODE_ENV` `LANG`）；`process.env["X"]` 形式和新增的名字都算命中 `credentials`。
- **能如实消掉的要消掉**：`@deepseek-ai/schemastery` 用 `peerDependencies`。
- **能力要写进 README**。
- `dshReleases` **只写真跑过的版本**；`dshOperations` **不要提前填 `passed`**。

**代码：** `dsh.compatibility` @ `package.json`
**守护：** 两份 README 手工同步
**改之前先读** [`docs/rules/15-capability-declaration.md`](docs/rules/15-capability-declaration.md) —— 四信号实测。

---

## 16. 「需要重启」要给出一条能完成重启的路，而不是一句话

**不可退化。** 页面做不到重启宿主，但「需要重启」不能只换来一句话；文案里**不许**说页面能重启宿主。

- 按钮由 `application === 'restart-required'` 决定。**不要**改看 `banner.tone === 'warn'`：warn 还兼别的事。
- desktop → 退出再打开；cli → 给出那条命令行。桌面版**故意不给命令**（会起第二个宿主）。
- pid 现算不缓存，变了才算重启。**两分钟是「不再声称在等」不是「停止等待」**。
- **关掉对话框必须停掉轮询**，否则走了还会 reload。
- 确认重启后的刷新必须走 `reloadWhenBootDocumentFresh`（§4），**不要**换成 `location.reload()`。
- **两种「卡住了」不能合并成一句**：pid 没变 vs 刷不动（`restartReloadBlocked`）。

**代码：** `Tab` / `RestartDialog` @ `src/client/components/`、`hostKindOf` @ `src/host/hostinfo.ts`
**守护：** `test/hostinfo.test.ts`、`test/restart-dialog.test.ts`、`test/copy.test.ts`
**改之前先读** [`docs/rules/16-restart.md`](docs/rules/16-restart.md) —— `probeVerdict` 判定。

---

## 17. 一次没答上来不等于宿主重启了

**不可退化。** 升级**成功了**，页面却报「失去联系」——一次轮询失败不是重启。

- **判据是「连续」不是「累计」**：`WATCH_MISS_LIMIT = 4`，一次成功就清零，**不要**改成累计；测试必须能红。
- **`fetch` 的 reject 也要收住**，否则整批被判失联；宿主单线程，一次超时或 5xx 很正常。
- `delay` 是注入项（测试传 `nowait`），**不要**改成真实 `setTimeout`。

**代码：** `watchJob` @ `src/client/api.ts`、`lostJob` @ `src/client/components/Tab.ts`
**守护：** `test/watch.test.ts`
**改之前先读** [`docs/rules/17-watch.md`](docs/rules/17-watch.md) —— 行号校对与用例名。

---

## 18. 每个版本先跟「正在跑的 DSH」比一次，再决定要不要给按钮

**不可退化。** 页面说「可以」宿主却拒绝，旧版本已摘掉，插件没了。

- **判定规则必须和宿主一模一样**：`engines.dsh` 在时**只看它**，否则每个 `@deepseek-ai/dsh*` peer 都要满足。
- **运行时版本从宿主入口读**：**写死路径会错一半**，**读不到就什么都不标**，只有不满足才是 `false`。
- **两个方向都要管**：降级禁用按钮，升级 `latest` 不兼容则 `blocked` + `upgradable = false`。
- **区间匹配不许「简化」**：`satisfiesRange` 逐位对齐 `node-semver`，再改就再跑对比。

**代码：** `runtimeVersionOf` @ `src/host/runtime.ts`、`satisfiesRange` @ `src/host/version.ts`
**守护：** `test/compatibility.test.ts`、`test/version.test.ts`
**改之前先读** [`docs/rules/18-compatibility.md`](docs/rules/18-compatibility.md)

---

## 19. 批次状态不能住在 `apply()` 的闭包里

**不可退化。** HMR 会重建本插件，新实例必须还认得旧实例开的批次。

- 状态挂 `globalThis`（`Symbol.for('dsh-plugin-upgrader/jobs')` → `sharedJobStore()`）；模块级 `const` 重求值后照样空。
- **`Symbol.for` 不是 `Symbol()`**：前者按字符串跨实例共享。
- **只清自己那份**：`finally` 里必须是 `if (store.live === job) store.live = null`，不许无条件置空。
- **进程重启后该没有的就是没有**，不要落盘。

**代码：** `JobStore` / `sharedJobStore` / `apply` @ `src/index.ts`
**守护：** `test/job-store.test.ts`
**改之前先读** [`docs/rules/19-job-store.md`](docs/rules/19-job-store.md) —— 事故与行号

---

## 20. 宿主会拒的版本，一个字节都不许写下去

**不可退化。** 宿主闸门在 pnpm 之后才说话，必须提前自己问一次。

- **预检在 `runStep` 动手之前**：用 `InstallGuard` 读目标版本的 DSH 范围，不满足就返回 `incompatible-version`，pnpm 一次都不跑。**不要**挪到 install 之后当事后校验。
- **读不到不等于不兼容**，一律放行交宿主裁决。
- **回滚分清两种破坏**：包在盘上只 re-select，包没了必须 `installBundle(名字@旧版本)`。
- **旧版本必须在动手前读**，是回滚唯一的依据；**回滚失败要明说**，`rolledBack` 只在真装回来时才填。

**代码：** `InstallGuard` / `runStep` / `recover` / `rollBack` @ `src/host/install.ts`
**守护：** `test/install.test.ts`
**改之前先读** [`docs/rules/20-precheck.md`](docs/rules/20-precheck.md) —— `InstalledGuard` 是笔误

---

## 21. 失败的升级不许把「关着的插件」打开

**不可退化。** 用户关掉的插件，一次失败的升级不许把它打开。

- **按「这一步想要什么」修，不是按「盘上有什么」修**：包还在盘上只说明不用重装。
- **`undefined` 仍然等于「保持加载」**：只在**明确** `=== false` 时走 `restoreEnabledState(..., false, ...)`。
- **两条路都要留着**：`restoreSelection` 的 `re-select …` 日志是唯一说明，不许合并掉。
- **两条失败形状都要覆盖**：manager 返回错误与 `installBundle` 抛出走同一个 `recover()`。
- **in-place 路径从来不受影响**：`replaceWithoutRemoval` 本来就按目标状态对齐。

**代码：** `recover` / `restoreEnabledState` / `restoreSelection` / `replaceWithoutRemoval` @ `src/host/install.ts`
**守护：** `test/install.test.ts`
**改之前先读** [`docs/rules/21-failed-upgrade-enabled.md`](docs/rules/21-failed-upgrade-enabled.md) —— PR #2 根因

---

## 22. 改 `package.json` 要在 harness 自己的写入锁里改

**不可退化。** 并发 writer 的 read-modify-write 会让条目消失，journal 挡不住。

- **四个入口全在 `withManifestLock` 里跑**（`dropDependency`、`restoreDependency`、`confirmDependency`、`recoverPendingDrop`），同一把 `package.json.lock`。
- **拿不到锁就不写，一个字节都不写**：退回 `removeForReplacement`。**不要**改成拿不到锁就直接写。
- **`LOCK_WAIT_MS = 1_000` 刻意的短**；**本进程持锁立刻判忙，不能重试**；**绝不抢占别人的锁**，哪怕 pid 已死。
- **journal 只在锁内、条目真回到盘上之后才清**，拿不到锁就保留记录。
- **必须同步**：`Atomics.wait` 做退避，改 async 波及加载时恢复与测试。
- **锁名硬编码成 `'package.json.lock'`**，不拼 `MANIFEST_FILE`。

**代码：** `withManifestLock` / `LOCK_FILE` / `LOCK_WAIT_MS` / `LOCK_BUSY` @ `src/host/lock.ts`；四个壳 @ `src/host/manifest.ts`
**守护：** `test/lock.test.ts`、`test/manifest.test.ts`
**改之前先读** [`docs/rules/22-manifest-lock.md`](docs/rules/22-manifest-lock.md) —— 复现与 7 条红

---

## 23. 一条 journal 记录只够一个包

**不可退化。** 一条记录只描述一个包：某个升级失败留下的记录，不许被同一批次里另一个包的
成功结算抹掉。

- **一个包一条。** 磁盘格式 `{ version: 2, records: DropJournal[] }`（`JOURNAL_VERSION = 2`），
  文件名不变；`upsertRecord` 只替换同名那条，`clearRecord(dir, name)` 只删同名那条。
- **结算只结算自己的。** `confirmDependency` / `restoreDependency` / `undoDrop` 清理时必须带
  name；**不要**再出现无参数的「整份清空」。
- **一次恢复修完所有记录。** `recoverPendingDrops` 返回 `RecoveryResult[]`，加载时逐条报告；
  `recoverPendingDrop` 退化成取第一条，只为兼容旧调用。
- **读 journal 也要进锁。** 锁外那次读只判断「有没有记录」和「拿不到锁时该报哪些名字」，
  **决不从它采取任何行动**（§22）。
- **拿不到锁时记录原样留着**，返回 `{ kind: 'failed', reason: LOCK_BUSY }`；
  **日志不许说已经还原**。
- **旧格式必须还能读**（1.7.2 写的是单个对象）；**写盘先 `${target}.upgrader-tmp` 再
  `renameSync`**，空集合删掉文件、不留空壳。

**代码：** `JournalEnvelope` / `JOURNAL_VERSION` / `readRecords` / `writeRecords` / `upsertRecord` / `clearRecord` / `recoverPendingDrops` / `undoDrops` @ `src/host/manifest.ts`；加载时清理循环 @ `src/index.ts`；`replaceWithoutRemoval` 的两条还原日志 @ `src/host/install.ts`
**守护：** `test/manifest.test.ts`、`test/install.test.ts`
**改之前先读** [`docs/rules/23-journal-per-package.md`](docs/rules/23-journal-per-package.md) —— 评审复现链与行号校对

---

## 改完必须做的事

```bash
pnpm run check     # typecheck(src+test) + build + node --test + pack 检查
```

发布走 tag（`.github/workflows/publish.yml` 用 npm trusted publishing，不需要本地 token）：

```bash
# 1) 改 package.json version  2) CHANGELOG 顶部补一节  3) commit
# 4) 想给人读的话写 release-notes/v<version>.md（可选，优先级高于 CHANGELOG）
git tag -a v<version> -m "<version>" && git push origin v<version>
```

推 tag 之后 CI 会发 npm **并**建 GitHub Release 页面（§14）。

细节见 [RELEASING.md](./RELEASING.md)。

**发布完别急着判断失败：** npm 的 `dist-tags` 和 tarball 会比 workflow 变绿晚几分钟到十几
分钟（1.6.0 和 1.6.1 都实测过，tarball 404 了两分半）。先轮询再下结论。

**写完测试要问一句：这个测试真的会红吗？** 把被测的字符串 / 分支临时改成哨兵值再跑一次，
确认它失败，再改回来。不能失败的测试等于没写。
