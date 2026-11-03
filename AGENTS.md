# AGENTS.md —— 改这个仓库之前先读

这个文件记录**已经实现并且必须继续成立**的行为。每一条都曾经是 bug：被修好过一次，
然后在一次看起来无关的重构里悄悄退回去过一次。改代码前对照这里的「守护」一栏，
改完后跑 `pnpm run check`；任何一条被破坏，都必须先说明为什么可以破坏，而不是顺手删掉。

判断标准只有一句：**用户能看见的结果不能变差**。内部实现随便换，下面标了
「不可退化」的对外行为不行。

---

## 1. GitHub 链接：每行的 `GH` 按钮 + 每个历史版本号上的链接

**不可退化。** 这是 1.4.2 修回来的一次真实回退（`9afb30f fix: re-fetch packuments that drop repository fields`）。

- 每行右侧有 `GH` 按钮，打开插件仓库主页；没有 `repository` 的插件**不显示**按钮，
  而不是显示一个坏的。
- 历史版本列表里，**版本号本身就是链接**：
  - 该版本在仓库里**确认存在 tag** → `releases/tag/v<version>`
  - 没打 tag，或 GitHub tag 列表读不到（限流 / 离线）→ 退回 `releases` 列表页
  - 绝不猜 tag：宁可退到 `releases`，也不给一个点进去是 404 的版本号。
- 每行另有「历史版本 (n)」入口；**读失败时**必须显示失败原因和「重试」，不能安静地
  少一个按钮（历史上正是这样，看起来像插件本身没有历史）。

**为什么容易破：** registry 对 `Accept: application/vnd.npm.install-v1+json`
（abbreviated packument）返回的文档**根本没有** `repository` / `homepage` / `bugs`
字段。只要有人「优化」掉那次 full-form 重取，或者把 accept 头删掉，链接就全没了，
而版本列表照常显示——所以这个回退很难被注意到。

**代码：**
- `src/host/registry.ts:35` `ABBREVIATED_ACCEPT`、`:50` `FULL_ACCEPT`
- `src/host/registry.ts:167` `fetchPackument`（`:195` 检测 + 重取合并）
- `src/host/registry.ts:233` `dropsRepositoryFields` —— 判断「abbreviated 签名」：
  顶层三个字段都没有，且 latest manifest 三个字段也都没有。**不要**改成只看顶层，
  否则本来就没有仓库的包会每次请求都付一次重取的代价。
- `src/host/repo.ts` `normalizeRepoUrl` / `githubUrlOf` / `repoUrlOf`
- `src/host/version.ts` `releasePathOf`（tag 命名 `v<version>`）
- `src/client/components/PluginRow.ts:179` `GH` 按钮渲染（依赖 `row.repoUrl`）
- `src/client/components/VersionLine.ts:36` 版本链接标签与 URL

**守护：** `test/registry.test.ts`（`an abbreviated document without repository fields
is re-fetched in the full form`、`a full-document re-fetch that fails keeps the
abbreviated document`）、`test/repo.test.ts`、`test/version.test.ts`。

---

## 2. 换版本时**不先卸载**（in-place replacement）

**不可退化。** 这是 1.2.0 引入、1.4.1 才真正在桌面端生效的核心价值，也是最容易
被「简化」掉的一条。

`pluginManager.installBundle` 对已经声明过的依赖直接以 `already-installed` 拒绝，
pnpm 根本不会跑。所以换版本的正确顺序是：

1. **先直接 install**（`runStep` 的第一次尝试）。
2. 被 `already-installed` 拒绝时，走 `replaceWithoutRemoval`：把 profile
   `package.json` 里那条依赖**临时**摘掉（写 journal），再 install。pnpm 写回新版本，
   **插件不被卸载**，加载器里的实例不断，启用状态不用恢复。
3. 只有在 `replaceWithoutRemoval` 主动放弃（manifest 读不了 / install 失败 / 拒绝）时，
   才退回 `removeForReplacement` + 重新 install，也就是老路径。

**为什么容易破（真实回退过两次）：**

- 第一次是实现期：`profileDirFrom()` 只认 `DSH_PROFILE_DIR` / `DSH_HOME`+`DSH_PROFILE`，
  而桌面壳启动宿主时**不导出**这些变量（桌面壳直接把 profile 目录当作子进程的 cwd），
  于是 `replaceWithoutRemoval` 第一行就 `return undefined`，1.2.0 到 1.4.0 全部悄悄
  走 remove + install——代码看着是对的，日志也没报错，只是每次都卸载。1.4.1 加了 cwd 回退。
- 第二次是观感：日志里先出现一条 `install`、再出现一条 `install`，中间什么都没有，
  读起来像「先删再装」。现在三条日志都写明意图（见下）。

**代码：**
- `src/host/install.ts:436` `runStep` —— 顺序不能被重排
- `src/host/install.ts:348` `replaceWithoutRemoval`
- `src/host/install.ts:371` 日志 `(in place: no removal, the bundle stays loaded)`
- `src/host/install.ts:478` 日志 `is already declared, so a plain install was refused; the bundle stays loaded`
- `src/host/install.ts:487` 日志 `(in-place replacement declined; replacing an installed dependency)`
- `src/host/install.ts:177` `removeForReplacement`（回退路径）
- `src/host/manifest.ts:69` `profileDirFrom` + `:86` `profileDirFromCwd`

**守护：** `test/install.test.ts`（`a replacement installs in place instead of removing
first`、`an in-place attempt that fails restores the entry and falls back`、`the log says
why the first install did nothing`）、`test/manifest.test.ts`（
`a desktop host with no DSH variables falls back to a cwd that is a profile`、
`a cwd that is not a profile is never mistaken for one`）。

---

## 3. Profile manifest 必须随时可恢复（journal）

**不可退化。** 第 2 条把依赖条目录进 journal 再删除，中间这段时间进程被杀掉，
插件就从 manifest 里消失（等于「装不回去」）。1.4.0 为此加了 journal。

- 删除前先写 `package.json.upgrader-journal.json`（**先 journal，再删，再写 manifest**）。
- 每次插件加载（`src/index.ts:555`）调 `recoverPendingDrop(dir)`：
  - journal 有记录 + manifest 里确实缺这条 → 补回去（`restored`）
  - journal 有记录 + manifest 里已经有了 → 说明那次 install 落地了，只清 journal
  - journal 损坏 / 描述不了当前 manifest → 忽略并清掉，**绝不**凭猜测改 manifest
- 恢复只是修复，不是前置条件：失败只 `console.warn`，标签页照样加载。

**代码：** `src/host/manifest.ts:40` `JOURNAL_FILE`、`:235` `recoverPendingDrop`、
`:302` `dropDependency`、`:345` `restoreDependency`、`:285` `confirmDependency`；
`src/index.ts:555` 加载时恢复（`:552` 解析 profile 目录）。

**守护：** `test/manifest.test.ts`（`an interrupted upgrade is repaired on the next load`、
`an install that landed is not undone by its own record`、
`a record that no longer describes the manifest is discarded, not applied`、
`a corrupt record is ignored rather than trusted`）。

---

## 4. 升级完不能把页面 reload 进一个已经不存在的 boot 文档

**不可退化。** 这是 `web boot: 3 entries did not activate` 那个启动崩溃框的修复（1.3.0）。

桌面壳只在宿主启动时快照一次注入表，里面的 batch URL 带 rev 哈希；宿主只保留
**当前一代 + 上一代**的 batch，更老的 URL 直接 404。一个 404 会毒掉整批，
启动被判失败并弹框。

- 任何因为「主题插件被替换、样式丢了」而触发的 reload，都必须先
  `reloadWhenBootDocumentFresh()`：对每个 batch URL 发 `HEAD`。
- 只有**确定的 404** 才阻止 reload；超时 / 5xx / 拿不到 fetch 都算「说不清」，
  reload 照常进行（否则页面看起来卡死）。
- 被阻止时给用户一句话：重启 DSH 才能完成这次升级。

**代码：** `src/client/boot.ts:126` `reloadWhenBootDocumentFresh`、`:85` `checkBootDocument`；
调用点 `src/client/components/Tab.ts:130`；文案 `src/client/copy.ts:75` `reloadBlocked`。
**不要把 `window.location.reload()` 直接写回来。**

**守护：** `test/boot.test.ts`（13 条）、`test/appearance.test.ts`（4 条）。

---

## 5. 「latest」不能低于已安装的版本

**不可退化。** 镜像会给坏 tag：`@deepseek-ai/dsh-subagent-codex` 的
`dist-tags.latest` 是 `0.0.1-rc.1`，而 profile 跑的是 `0.2.1-rc.3`，
界面于是把一次**降级**显示成「可升级」。

- `dist-tags.latest` 正常时**原样信任**（高于 latest 的 prerelease 不许抢 `latest`）。
- 只有一种例外：tag 排序**低于已安装版本** → 判定为坏 tag，改用「高于已安装版本的
  最高版本，稳定版优先于 prerelease」。
- 坏 tag 且没有更高版本 → 保留原 tag，不要凭空造一个。

**代码：** `src/host/registry.ts:417` `shapePackument`（`:452` 起的 `broken` 分支）。

**守护：** `test/shape-packument.test.ts`（6 条，全部钉这条规则）。

---

## 6. 镜像落后要让用户看见

**不可退化。** 配置的 registry 上没有的版本**装不了**（`ERR_PNPM_NO_MATCHING_VERSION`
会把同批无关的包一起拖死）。镜像自己的文档不会说「我落后了」，它只是不列那个版本。

- 当配置源不是 `https://registry.npmjs.org` 时，额外问一次上游，列出
  「已发布但本镜像没有、且高于已安装版本」的版本，新版本在前。
- 读不到上游 → 报告「没有缺口」，不要报告「全部缺失」。

**代码：** `src/host/registry.ts:376` `versionsMissingFromMirror`、`:352` `UPSTREAM_REGISTRY`；
`src/host/overview.ts:236` 调用并写入 `row.mirrorMissing`；
渲染 `src/client/components/PluginRow.ts:113`，文案 `src/client/copy.ts:55` `mirrorBehind`。

**守护：** `test/mirror-gap.test.ts`（5 条）。

---

## 7. 慢的时候必须看得见在干什么

**不可退化。** 一次升级可能真的跑几分钟（pnpm 会拿锁文件里每个条目回源核对）。
真实事故：降级 `@linxin666/dsh-pet` 时，面板整整两分钟写着「正在下载并安装」，
而日志里 pnpm 正在逐条核对锁文件（`? Verifying lockfile against supply-chain policies
(91 entries)...`），同一时间还刷着 `[WARN] GET … ETIMEDOUT. Will retry in 1 minute.`。
两个都是假象：**阶段说错了**，**「状态已停止更新」误报了**。

- 阶段：`waiting` → `verifying` → `installing` → `applying` / `cancelling`。
  - `installing` **不代表**「已经过了校验」：manager 是在 pnpm 启动**之前**就上报
    `installing` 的（`dsh-plugin-manager` 先 `announce('installing')` 再 `runPnpm`），
    所以 pnpm 的校验行是在 `installing` 之后才到的，它必须能把阶段改写成 `verifying`。
    1.7.2 之前 `installing` 一旦出现就被钉住，于是整个校验过程都显示成「正在下载并安装」。
  - `applying` / `cancelling` 是 manager 的最后一句话，**不许**被后续日志回退。
  - `verifying` 一直保持到 pnpm 给出结论：`✓ Lockfile passes supply-chain policies` /
    `✗ Lockfile failed supply-chain policy check`。校验期间 pnpm 还会打印重试和进度计数，
    所以中途的普通行**不能**结束它。
  - 开始行和结论行都含 "supply-chain policies"，**只**匹配这个词分不出开始和结论——
    开始行匹配 `/verifying lockfile/i`，结论行匹配 `/lockfile.*passes supply-chain policies/i`
    与 `/lockfile.*failed supply-chain policy check/i`。
  - 纯空白的 chunk 是 keep-alive，不算「有进展」。
- 「还在动」要问**宿主**，不是问 pnpm。pnpm 在重试时一分钟不打印一行是正常的，
  按「日志没变」判定停滞，会在健康升级上误报「状态已停止更新」。
  宿主每 2 秒重新盖一次心跳（`job.heartbeatAt`），面板用心跳判定活性。
- 面板要有：已用时计时、不确定态进度条、阶段文字、慢速提示、日志尾部、状态停滞检测。

**代码：** `src/host/progress.ts:63` `nextPhase`（`:27` `CHECK_STARTED`、`:36` `CHECK_PASSED`、
`:43` `CHECK_FAILED`）、`src/host/progress.ts:16` `Phase`（含 `verifying`）；
宿主心跳 `src/index.ts:92` `HEARTBEAT_MS`、`:326-330` 盖戳、`:437-461` overview 的
`active.heartbeatAt`、`:532-553` `GET job` 的 `heartbeatAt`；
`src/client/types.ts` `JobSnapshot.heartbeatAt`；
`src/client/components/JobPanel.ts` `fingerprint` / `staleness`；
文案 `src/client/copy.ts:60-69`。

**守护：** `test/progress.test.ts`（8 条）、`test/job-panel.test.ts`（5 条）、
`test/job-store.test.ts`（「the batch reports the heartbeat the panel judges liveness by」）。

---

## 8. 写入锁超时要翻成人话

profile 的 `package.json` 由 harness 用 `package.json.lock` 串行化：manager 自己的预算是
120 秒，`atomic-write` 的默认是 2 秒。超时原文只报一个文件名和一个 pid，用户无法处理。

- 失败信息先读锁（`readWriterLock`），再说「另一个操作正在改写，等它结束再试」或
  「锁没释放，重启 DSH 会自愈」，原文放在方括号里保留（便于搜索 / 报 bug）。
- 不是锁超时的信息**原样返回**。

**代码：** `src/host/lock.ts:73` `readWriterLock`、`:99` `isWriterLockTimeout`、
`:138` `explainLockTimeout`。

**守护：** `test/lock.test.ts`（9 条）。

---

## 9. 自己不能给自己换版本

`plugin-manager` 的批量路径第一步就是卸载，卸载的正是此刻在跑的那段代码。所以：

- 批量升级 **永不包含** 本插件自己：`src/client/components/Tab.ts:28` `SELF_NAME`、
  `:196` `batchable`。
- 自己那一行如果落后，显示「用页面安装器升级」按钮，走插件页自己的安装流程：
  `src/client/components/PluginRow.ts:43` `selfUpdate`、`Tab.ts:243` `installSelf`；
  页面没提供安装入口时明确说「这一页没有提供安装入口」（`copy.ts:32`）。
- `link:` / `file:` 来源的行（`sourceKind === 'path'`）**永远不可升级**：
  把本地目录换成一个 registry tarball 不是升级。

**代码：** `src/host/bundle.ts:23` `sourceKind`、`src/host/overview.ts:175` path 分支。

**守护：** `test/self-row.test.ts`（5 条）。

---

## 10. `bundle-in-use` 要自己解开

插件读起来是「已禁用」、加载器却仍持有它的 fiber 时，单纯 `removeBundle` 什么都不会做。
此时必须先 `setBundleEnabled(true)` 再 `setBundleEnabled(false)`，让加载器真的放手，
然后重试一次；再失败才报「需要重启」。

**代码：** `src/host/install.ts:177` `removeForReplacement`（`:55` `IN_USE`）、
`:140` `toggle`、`:121` `readsAsEnabled`。

**守护：** `test/install.test.ts`（`a bundle-in-use removal unloads the plugin and retries
once`、`a bundle the manager already reads as disabled is re-selected, then dropped`、
`a removal still refused after the unload says a restart is needed`）。

---

## 11. 其它不许破的约定

- **路由仅限回环访问。** 任何 `POST job` / 安装动作只接受 loopback，否则 403。
  `src/host/http.ts:37` `isLoopbackRequest`。
- **一次只跑一批。** 第二个 `POST job` 拿 `409 busy`（带正在跑的 id），前端**接管**
  而不是报错。僵尸 job 按心跳（2 秒一次）15 分钟判废，不会永久占位。`src/index.ts:57-79`。
- **overview 的 registry 查询有并发上限。** 11 个并发打 `registry.npmmirror.com`
  会超时（历史上正是「很多插件没有历史版本」的原因），上限是
  `src/host/registry.ts:108` `PACKUMENT_CONCURRENCY = 4`，由
  `src/host/overview.ts:43` `mapLimited` 执行。**不要换回 `Promise.all`。**
- **overview 一次答完。** 一个请求返回全部行（`bundles` 字段），不做 per-package 请求。
- **enabled 状态保留。** 任何真的卸载之后，都要把原来的启用 / 禁用状态装回去
  （`src/host/install.ts:251` `restoreEnabledState`），失败时报告它读到的状态。
- **失败要带原因。** 行上的 `versionError` / 历史读取失败不能是空白，界面必须显示原因
  并给重试入口。
- **语言**：所有面向用户的文案都走 `src/client/copy.ts` 的 zh + en 两份，不要内联中文。

---

## 12. 安装源是用户能改的设置，不是让用户改文件

**不可退化。** issue #1 的原话是「除了让AI改，就不能自己改吗」：默认源是
`registry.npmjs.org`，想换 `registry.npmmirror.com` 只能改 `~/.npmrc` 或
`cordis.patch.yml`。插件页自己的安装对话框有换源，但那是**装失败后的补救**，
不保存，下次还是默认源。

- 版本页顶部有「注册表」按钮，打开**安装源对话框**：自带源（官方源 / 大陆镜像）、
  `pluginManager` 配的源、用户自己加的源，外加「跟随 pnpm 配置」（默认，等同于此前的行为）。
- **自带源不能改也不能删，而且是结构上做不到**：它们是 `WELL_KNOWN_REGISTRIES` 常量，
  永远不写进 `customRegistries`，所以列表里根本没有那一行可以删。**不要**改成「渲染出来
  但把按钮 disabled」——那种写法会在一次看起来很无辜的重构里被恢复成可点。
- 自己加的源可以改、可以删；删除或改写正在用的那个时，`registry` 必须一起跟着变，
  否则安装会被指向一个列表里已经不存在的地址。
- **读和写必须是同一个源**：`registryBase()` 决定版本列表从哪读，`runStep` 把同一个值
  交给 `installBundle`。只有一边跟随的话，列表会列出目标源根本没有的版本。
- 选择写进 profile（`cordis.patch.yml` 的 `plugin-upgrader` 行），重启和换浏览器都还在。
- 每一行都能「测试」：`POST /api/plugin-upgrader/registry/test` **并发**打 `/-/ping` 和根地址，
  谁先 2xx 用谁（`PROBE_TIMEOUT_MS = 5000` 是整次探测的预算，不是每个请求的）。
  探测的是**调用方给的地址**，所以还没保存的草稿也能测。
- **这两条路不能改回串行。** `registry.npmmirror.com` 的 `/-/ping` 在某些网络要 3～15 秒，
  根地址只要 0.3 秒；串行会把整个预算花在慢的那条上，然后把大陆镜像报成「连不上」——
  那正是这个功能存在的理由。失败时的原因也要挑最具体的：有状态码报状态码，其次是超时
  （`timed out after N ms`），最后才是网络错误原文。

**为什么必须用 volatile Config 而不是别的办法：**

- `SettingsForms.describe()` 只投影带 `.volatile()` 的字段，没有 volatile 字段的插件
  **完全没有设置页**；而且 `autoGenerate` 不生成页面，客户端必须自己画。
- 非 volatile 的写入会重启插件（`Entry.update` → 重新挂载）。volatile-only 的写入走
  `_commitVolatile()`，直接改运行中的引用并发 `loader/volatile-update`，不重启。
- 所以 `apply` 必须**每次读** `config.registry.get()`，不能在加载时把值抄成字符串——
  抄一次就等于把设置钉死在启动时的那个源上，正是这个功能要避免的 bug。
- 旧的 `settings.register(ns, schema)` API 在 0.1.7 之后不存在了；从
  `@deepseek-ai/dsh-settings` 里 import 那些被删掉的具名导出会让宿主直接起不来。

**代码：** `src/host/config.ts`（`Config`、`savedRegistry`）、`src/host/registry.ts`
`probeRegistry` / `PROBE_TIMEOUT_MS`、`src/host/bundle.ts:66`
`registryBase(registries, preferred)`、`src/host/install.ts:436` `runStep(..., registry)`、
`src/index.ts` 的 `chosenRegistry()` 与 `POST registry/test` 路由；浏览器端
`src/client/registry.ts`（`useRegistrySetting`、`offeredRegistries`、`addSource` /
`editSource` / `removeSource`）、`src/client/components/SourceDialog.ts`。
文案 `src/client/copy.ts` 的 `registry*` 与 `source*` 两组。

**守护：** `test/config.test.ts`（默认值、两处 volatile 标记、地址校验、旧配置兼容、
数组整体校验）、`test/sources.test.ts`（13 条：自带源识别、增删改的越界 / 重复 /
非法地址拒绝）、`test/probe.test.ts`（8 条：两条路并发、慢 ping 不掩盖快根地址、
`/-/ping` 被拒时根地址兜底、状态码优先于超时、超时说清预算是多少、空地址不发请求）、
`test/install.test.ts`
（「a chosen registry is passed to the manager」「no choice leaves the manager own
registry in charge」——`undefined` 和 `null` 对 manager 是两件事，前者保留
`pluginManager.registry`，后者会覆盖成 pnpm 的源）、`test/overview.test.ts`
（「the saved registry is what versions are read from」）。

**宿主没有 `configForms` 时**（没挂 ui-settings）：标签页照常渲染，只显示源、不给改，
并说明原因。**不要**为了「看起来能用」而把选择存进 localStorage——那只在一个浏览器里
生效，用户会以为改成功了。

---

## 13. `lib/` 是提交进仓库的，不是构建垃圾

`.gitignore` 里**没有** `lib/`。构建产物和 `src/` 一起进 git，原因不是洁癖：

DSH Store 的自动审核看的是一个**固定 commit 的文件树**，它按 manifest 的
`files` 去找运行时文件（`./lib/index.js`、`./lib/client.js`…），找不到就判
`runtime artifact is missing from the distributable surface`，而且明确拒绝为了补齐
而执行 `prepare`（「automation cannot execute `prepare` to fill missing runtime
files」）。把构建产物提交进去是唯一能通过这条路的方式，顺带让「从 git 装」也不再
依赖安装期的构建。

由此产生三条硬约束：

- **改完 `src/` 必须 `pnpm run build`，并把 `lib/` 一起提交。** 只提交 `src/`
  等于发布了一个新旧不匹配的包。CI 里有守卫（见下），漏了会红。
- **不许手改 `lib/` 里任何文件。** 它们是 tsc / esbuild 的输出，下次构建就没了。
- **`prepare` 不能加回来。** 安装期执行脚本是审核里的一条硬性否决项
  （`install lifecycle scripts are present: prepare`）。构建改挂在 `prepack`
  上，只在 `pnpm pack` / `pnpm publish` 前跑，安装期不跑。

`lib/` 必须是**可复现**的：同一个 `src/` 构建两次，字节完全相同（已用两次构建的
SHA-256 对比验证过），否则「提交的产物是否最新」无法用 `git diff` 判断。

守卫是 `scripts/verify-build-committed.mjs`，`pnpm run check`、CI 和 publish 都会跑它。
它比较的是**工作区与索引**（`git diff -- lib/` 加上未跟踪文件），不是与 HEAD 比：
CI 里两者等价，所以漏提交照样红；本地则允许「构建 → `git add` → 跑 check」这个
正常顺序，而不是要求先提交再检查那个本该拦住提交的东西。跳过时（没有 `.git`，
比如从 tarball 里跑）会打印 `not a git work tree` 并放行——「提交和构建是否一致」
在那种地方没有答案，不算失败。

---

## 14. 一次发版要同时到两个地方：npm 和 GitHub Release

**不可退化。** 2026-10-30 发现过一次真实的、连着九次的遗漏：git tag 有 15 个，GitHub
Release 只有 6 个，页面停在 `v1.2.0`，而 npm 已经发到 `v1.6.1`。

原因不是谁忘了，而是**手工步骤没人检查**：`publish.yml` 只做 `pnpm publish`，从来没有任何
地方建 Release；`RELEASING.md`「需要出 GitHub Release 页面」那一节确实写了
`gh release create`，但它是可选的、没有校验的，于是连着九次没人跑。

后果不只是"少一页"：

- GitHub 的 **"Latest" 认的是最新的 Release，不是最新的 tag**，所以仓库首页把 `v1.2.0`
  标成最新，看起来项目已经死在 1.2.0。
- 本插件行上的 `GH` 按钮、以及每个历史版本号上的链接（`src/host/version.ts` 的
  `releasePathOf`）都会打开 `releases/tag/v<版本>`——tag 在，所以链接不坏，但点进去是一页
  空白外壳，比 404 更像 bug。

现在的分工：

- `publish.yml` 有 **两个 job**：`publish`（发 npm）和 `release`（`needs: publish`，用
  `gh release create --verify-tag` 建页面）。`release` 在 `publish` 之后跑，所以一次失败的
  发布不会留下一页宣告了 registry 上并不存在的版本。
- 正文来自 `scripts/release-notes.mjs`：优先 `release-notes/<版本>.md`（或 `v<版本>.md`，
  给人读的说明），否则退到 `CHANGELOG.md` 的 `## <版本>` 一节（和代码同一个 commit 审过）。
  两边都没有时**退出 1**，job 变红。
- **不要把这个 job 改回手工步骤。** 也不要给它加 `continue-on-error`——那等于把"忘了建
  Release"重新变成一个看不见的失败。
- `release` job 是幂等的：重跑失败的 workflow 会更新已有页面，不报 `already exists`。
- `scripts/release-notes.mjs` 的版本匹配是**整词**的，`1.6` 不会匹到 `1.6.0`/`1.6.10`。

**代码：** `.github/workflows/publish.yml` 的 `release` job、`scripts/release-notes.mjs`、
`release-notes/*.md`、`scripts/release-notes.d.mts`（测试用的类型声明）。
**守护：** `test/release-notes.test.ts`（8 条：章节到下一个 `##` 为止、版本号整词匹配、
`v` 前缀等价、没有章节时返回 `undefined` 而不是空串、自写说明优先于 changelog、
`v<版本>.md` 也能找到、空的自写说明不遮蔽 changelog、两边都没有时不产出正文）。

---

## 15. 能力声明要如实写，但不能为了讨好扫描器去改代码

**不可退化。** DSH Store 的自动审核（`bounded-source-v3`）把四个能力信号当成阻断项：
`runtime source contains the (files|network|commands|credentials) permission signal`。
它们由源码里的**字符串与语法**判定，不看意图：

- `files`：`node:fs` 的导入，或 `readFile`/`writeFile`/`rename`/`rm` 之类的调用
- `network`：`node:http`/`node:https` 的导入（**纯类型导入也算**）、`fetch(`、`WebSocket(`
- `credentials`：任何不在白名单里的 `process.env` 形式。白名单只有 `DSH_HOME` `HOME`
  `USERPROFILE` `PATH` `NODE_ENV` `LANG` 六个，而且必须是点号直取——
  `process.env["DSH_HOME"]` 和 `process.env.DSH_PROFILE_DIR` 都会命中
- `commands`：`child_process`，或 `spawn(`/`exec(` 之类的调用。本仓库**没有**这一项

这个插件是插件生命周期管理器，读写 profile、访问 registry 是它的功能本体。所以：

- **不要为了消掉信号去改功能。** 把 `process.env` 换成参数传递、把 `fetch` 藏进间接层，
  信号只是挪走、能力一点没少，等于用可读性换一个假绿——DSH Store 自己的整改文案也写着
  「do not rewrite plugin functionality to satisfy the scanner」。
- **能如实消掉的那一条要消掉。** 唯一的例外是运行时依赖：`allowRuntimeDependencies`
  为 false，任何 `dependencies` 都会触发 supply-chain 审阅。既然宿主已经提供
  `@deepseek-ai/schemastery`，就该声明成 `peerDependencies` 而不是自带一份。
- **能力要写进 README。** 中文 `README.md` 和英文 `README.en.md` 的
  「权限、依赖与外部服务」/「Permissions, dependencies and external services」两节必须
  与实际代码一致；新增一个外部端点、新增一次文件写入，都要同步改那里。

**关于 `@deepseek-ai/schemastery` 为什么是 peer 而不是 dependency：**
1.6.0 曾把它声明成 `dependencies`，理由是「`Config` schema 必须由 loader 校验用的同一个库
构建」。这条理由**恰恰指向 peer**：peer 保证 loader 与插件指向同一份实例，而自带一份
反而会造出两个 schemastery。桌面端把它作为自身依赖发布，`dsh-plugin-manager` 等第一方包也
依赖它，profile 是 hoisted 布局，所以它一定在顶层。代价是：**缺 peer 不会让安装失败**，
只会在运行时 import 失败——所以 `devDependencies` 里必须保留一份，测试和构建才跑得起来。

**关于 `dsh.compatibility`：** 它是给 Catalog 读的元数据，宿主侧**完全不读**
（`app.asar` 里 `dsh.compatibility` 零命中），所以加它零运行时风险，不需要升 SemVer。
`dshReleases` 的键是**完整 SemVer**（`0.2.1-rc.5` 这种），值只能是
`compatible`/`incompatible`/`unknown`，且必须与 `engines.dsh` 的范围一致——声明
`compatible` 而 `engines` 覆盖不到时，校验会把它降回 `unknown`。
**只写真的跑过的版本。** 目前只有 `0.2.1-rc.5`；`0.2.1-rc.4` 和 `0.2.2-alpha.2` 落在
`engines` 范围内但没有逐一实测，所以留空（未声明 = `unknown`）。补一条 `compatible`
的前置条件是**在那一版上真的装起来用过**，不是「范围覆盖了所以应该也行」。
**`dshOperations` 不要提前填 `passed`**：`install`/`start`/`uninstall`/`rollback` 四项需要
逐版本的真实运行证据，没有证据就整体省略（会被补成 `unknown`），而不是编一个。

**代码：** `package.json` 的 `engines`、`peerDependencies`、`dsh.compatibility`；
`README.md` 与 `README.en.md` 的披露章节。

---

## 16. 「需要重启」要给出一条能完成重启的路，而不是一句话

**不可退化。** 1.6.3 之前，`restart-required` 只换来一句「需要重启 DSH 才会生效」，
用户读完仍然不知道下一步做什么。页面**做不到**重启（桌面壳把 relaunch 放在主进程里，
终端启动的宿主也没人替它拉起），但「做不到」不等于「只能沉默」。

- 横幅上的「重启 DSH」按钮由**结果**决定：`application === 'restart-required'`
  置 `restartPending`，开新批次时清掉。**不要改成看 `banner.tone === 'warn'`**——
  同一个 `warn` 还兼着「这一页没有提供安装入口」和「刷新被拦住了」，只有其中一种
  是重启能解决的（`Tab.ts:98` / `:443`）。
- 对话框按 `kind` 分两种说法：`desktop` → 退出应用再打开；`cli` → 给出**当初那条命令行**，
  含空白的参数已加引号，可原样粘贴。桌面版**故意不给命令**：把子进程的 argv 重放一遍
  等于在同一个 profile 上再起第二个宿主（`hostinfo.ts:87`）。
- `kind` 从 `process.argv[1]` 判断，不读环境变量：外壳拉起的入口是
  `dsh-desktop-host/lib/index.js`，别的启动方式落不到那个路径
  （`hostinfo.ts:44` `DESKTOP_ENTRY`、`:57` `hostKindOf`）。
- **pid 是这条链路唯一有意义的信号**，而且**每次现算**（`src/index.ts:477` 用
  `Date.now() - process.uptime()*1000`，不缓存）：缓存会让一次真的重启看起来像卡住。
  页面每秒问一次，直到 pid 变了才往下走（`RestartDialog.ts` `PROBE_MS = 1000`）。
- **确认重启之后的刷新**必须走 `reloadWhenBootDocumentFresh`（§4），不要换成
  `location.reload()`：新的宿主可能已经轮换到这一页加载不了的那一代 batch。
- **等待是自动开始的，按钮只是「再查一次」。** 对话框拿到 pid 就立刻开等，不等用户点；
  按钮写成「重新检查」而不是「重启好了，刷新页面」——后者读起来像「按它就是重启」，
  而这个页面从来没有那个能力（`RestartDialog.ts` 的 `beginWaitRef` / `checkAgain`）。
- **两分钟是「不再声称在等」，不是「停止等待」**（`RestartDialog.ts` `WAIT_LIMIT_MS = 120_000`）。
  退出再打开 DSH 要花多久由人决定，超时把人赶进死胡同、还得回来按按钮，是最没道理的
  那种失败。超时后转 `idle` 说一句「还没换新进程——重新打开 DSH 后这一页会自己刷新」，
  **timer 继续跑**；pid 一变照样自动 reload。判断规则抽在 `probeVerdict`：
  pid 变了就是重启（多晚都算）、pid 读不到不算重启、deadline 只报告不终止。
- **关掉对话框必须停掉轮询。** timer 放在 `timerRef` 里，unmount 时清掉：否则关掉之后
  它仍会继续问，并在你离开很久之后 reload 页面。同理 `beginWaitRef` 在 effect 里赋值，
  不在渲染期间写 ref。
- **「卡住了」有两种，不能合并成一句。** pid 没变（旧进程还在）和 pid 变了但页面刷不动
  （`restartReloadBlocked`）都会落到 `stalled`，但前者叫人「再确认旧进程退出」，后者叫人
  「再重启一次 DSH」。所以 `stalled` 渲染的是 `problem`（`stalledMessage`），
  只有 `problem` 为空才用 `restartStillOld`——把「宿主已重启」说成「还没换新进程」
  会把人引到错误的方向。
- 文案里不许说页面能重启宿主（`copy.ts` 的 `restartBody` 中英都写明了做不到）。

**代码：** `src/host/hostinfo.ts`、`src/index.ts:477`、`src/client/api.ts` `readHostInfo`、
`src/client/components/RestartDialog.ts`、`src/client/components/Tab.ts:98`、`src/client/copy.ts`
的 `restart*` 一组、`src/client/styles.ts` 的 `.dsh-pu-cmdbox` / `.dsh-pu-cmd`。

**守护：** `test/hostinfo.test.ts`（10 条）、`test/copy.test.ts`（3 条）、
`test/restart-dialog.test.ts`（8 条：无理由时说「还没换新进程」、有理由时原样保留、
只有空白也算没有理由；pid 变了多晚都算重启、pid 没到点继续等、读不到不算重启、
deadline 只报告不终止）。

---

## 17. 一次没答上来不等于宿主重启了

**不可退化。** 1.6.3 修的真实回退：用户只是正常升级一个插件，升级**成功了**，页面却报
「升级进度已失去联系（宿主可能重启过）」。

- **根因不是重启，是轮询太脆。** `watchJob` 原来第一行命令就是「一次拿不到 → `return undefined`」，
  而 `Tab.watch` 把 `settled === undefined` 读成「宿主重启 / 请求失败」并打 `lostJob`。
  宿主是单线程的，pnpm 安装期间事件循环被占住，一次轮询超时或拿到 5xx 完全是正常现象。
- **`fetch` 本身的 reject 以前直接逃出循环**（keep-alive socket 在长时间安装里被关掉），
  这比拿到错误响应更常见，后果一样：整批被判失联。现在是 `.catch(() => undefined)`。
- **判据是「连续」不是「累计」**：`WATCH_MISS_LIMIT = 4`（`src/client/api.ts`），
  中间只要成功一次就清零（`missed = 0`）。800ms 一轮 ≈ 3 秒真正的静默才放弃。
  不要改成累计计数——安装中途偶发卡顿会慢慢攒出一张假失联。
- **测试必须能红**：`test/watch.test.ts` 把 limit 改成 `1` 会有 3 条变红（已实测）。
  其中「一次失败不判失联」直接把 `fetch` 抛错当第一次——那是用户那次真实故障的形状。
- `delay` 是 `WatchOptions` 的可选注入项（测试传 `nowait`），不要为了测试把它们
  改成真实的 `setTimeout`，否则这条用例要跑十几秒。

**代码：** `src/client/api.ts` 的 `WATCH_MISS_LIMIT` / `watchJob`、
`src/client/components/Tab.ts:123` 的 `lostJob` 分支。

**守护：** `test/watch.test.ts`（4 条：一次失败仍能跑完、持续静默到上限才放弃、
中间的成功能清零、tab 卸载立刻停）。

---

## 18. 每个版本先跟「正在跑的 DSH」比一次，再决定要不要给按钮

**不可退化。** 1.7.0 修的真实事故：用户在 DSH `0.2.1-rc.5` 上把
`@smalltailqwq/dsh-client-ui-skin-maid-atelier` 从 `0.1.9` 切到 `0.1.5`。`0.1.5` 声明的是
`peerDependencies["@deepseek-ai/dsh"] = ">=0.1.7-rc.1 <0.1.8-0"`，宿主的兼容性闸门拒绝了它
——但拒绝发生在 pnpm 已经把 `0.1.9` 摘掉之后，结果 profile 里**这个插件整个没了**，
`cordis.patch.yml` 里还留着一个悬空的 `- id:`。

- **判定规则必须和宿主一模一样**：`engines.dsh` 存在时**只看它**，`peerDependencies`
  被忽略；否则 `peerDependencies` 里每个 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 都要满足，
  `workspace:^` / `~` / `*` 视为「就是当前运行时」，预发布参与比较。
  改这里之前先对照宿主侧的 `plugin-compatibility`——页面说「可以」而宿主随后拒绝，
  比页面什么都不说更糟。
- **运行时版本从宿主的入口读，不从固定路径读。** 桌面壳把入口放在 `app.asar` 里，那里读到的
  是打包进去的 `0.2.1-rc.5`；命令行启动跑的是 profile 里的 `dsh/lib/bin.js`，那里读到的
  是 profile 那份——而 profile 里的 `@deepseek-ai/dsh-app-boot` 是指向 npx 缓存的 junction，
  实测 `0.1.2-rc.1`。两者在真实机器上确实不一样，**从入口走两边都对，写死路径会错一半**，
  而「把本来能装的版本标成装不了」比不标更糟。代码在 `src/host/runtime.ts`，
  起点是 `process.argv` 里的宿主入口。
- **读不到就什么都不标。** `compatible` 只有「读到范围且确实不满足」时才是 `false`，
  否则是 `undefined`（缺席）。不要改成读到就写 `true`/读不到就写 `false`：
  前者在版本读不到时骗人，后者会藏掉所有版本。
- **两个方向都要管**：降级（历史里不兼容当前 DSH 的版本禁用切换按钮）与升级
  （`latest` 不兼容当前 DSH 时 `upgradable` 必须是 `false`，并把 `blocked` 带到行上）。
  只做其中一边，另一边照样能把包弄没。
- **区间匹配不许随便「简化」。** `src/host/version.ts` 的 `satisfiesRange` 与
  `node-semver` 在 `includePrerelease` 下逐位对齐，已经在 49 个 range × 41 个版本
  共 2035 组上验证过。写这段时最初有三处错：`~0.1.7-rc.1` 漏了 patch 下界（会放过
  `0.1.6`）、部分版本（`1.x` / `1.2`）下界缺 `-0`（`0.2.0-rc.1` 会漏掉）、连字符区间上界
  用 `<=`（`1.2.3 - 2.0.0` 会放过 `2.0.0-rc.1`）。再改这段就再跑一次那个对比。

**代码：** `src/host/runtime.ts`（`runtimeVersionOf`）、`src/host/version.ts`（`satisfiesRange`）、
`src/host/registry.ts`（`dshRequirementOf` / `meetsDshRequirement` / `shapePackument` 的第 4 个参数）、
`src/host/overview.ts`（`blocked` 与 `upgradable` 的降级）、`src/client/components/VersionLine.ts`
（禁用切换按钮）、`src/client/components/PluginRow.ts`（`blocked` 提示）。

**守护：** `test/compatibility.test.ts`（8 条，两条主用例就是上面那两个方向）、
`test/runtime.test.ts`（4 条：从入口旁边的副本读、第二个入口也要试、读不到就返回空、
空白版本号不算版本）、`test/version.test.ts`（14 条区间匹配）、`test/overview.test.ts`
（`an upgrade the host would refuse is not offered as an upgrade` 等 3 条）。

---

## 19. 批次状态不能住在 `apply()` 的闭包里

**不可退化。** 1.7.0 修的真实事故：用户升级 `dsh-dream-skin`，升级**成功了**
（`package.json` 已经写进 `11.3.0`），页面却报「升级进度已失去联系（宿主可能重启过）」。

- **根因不是重启，是模块被替换了。** `live` profile 下，本插件升级别的插件这个动作本身
  就会让 HMR 重新协调 profile，**本插件的模块也会被重新求值**。`jobs` / `inFlight` / `liveJob`
  原本是 `apply()` 的闭包局部变量，新实例于是拿到一张空 Map，对页面正在轮询的那个 id
  回答 `GET /job` → 404 `unknown-job`，`watchJob` 累计 4 次失败后判失联。
- **模块级常量救不了。** 重新求值会造新的模块作用域，放在模块顶层的 `const jobs = new Map()`
  一样是空的。状态必须挂在 `globalThis` 上，用一个稳定的符号
  `Symbol.for('dsh-plugin-upgrader/jobs')`，由 `sharedJobStore()` 读取。
- **`Symbol.for` 而不是 `Symbol()`**：前者按字符串跨模块实例共享，后者每次调用都是新的。
- **清理只清自己那份**：`runJob` 的 `finally` 里必须是
  `if (store.live === job) store.live = null`，不能无条件置空——旧实例收尾时新实例可能
  已经接管了另一个批次，无条件清空会把它的管理事件流打断。
- **进程重启时该没有的就是没有**：`globalThis` 不跨进程，宿主真重启后 id 查不到是正确
  的语义，不要为了「看起来健壮」把批次落盘。

**代码：** `src/index.ts` 的 `JobStore` / `sharedJobStore()` / `apply()` 开头、
`runJob` 的 `finally`、`install-log` 与 `install-state` 两个订阅里的 `store.live`、
`POST cancel` 的 `store.inFlight`。

**守护：** `test/job-store.test.ts`（走真实路由：`apply` 一次 → `POST job` 拿 id →
再 `apply` 一次模拟替换实例 → `GET job?id=` 必须 200）。把 `apply` 里的
`const store = sharedJobStore()` 换回闭包局部对象，这条必须变红（实测是 `404 !== 200`）。

---

## 20. 宿主会拒的版本，一个字节都不许写下去

**不可退化。** 1.7.0 修的真实事故：用户把 `@smalltailqwq/dsh-client-ui-skin-maid-atelier`
从 `0.1.9` 切到 `0.1.5`。宿主拒绝(`incompatible-version`)，但拒绝发生在 pnpm 改完锁文件
**之后**，而回退路径早已把 `0.1.9` 真删掉了。结果：插件从 profile 里消失，
`cordis.patch.yml` 只剩一行悬空的 `- id:`。

- **闸门在最后，所以必须提前问一次。** `runStep` 现在用 `InstallGuard` 在**动手之前**
  读目标版本声明的 DSH 范围，不满足就返回 `incompatible-version`（`detail` 带原文范围），
  pnpm 一次都不跑。**不要**把这一步挪到 install 之后当「事后校验」——那时包已经没了。
- **读不到不等于不兼容。** 拿不到运行时版本、拿不到 packument、manifest 没有 DSH 范围，
  一律放行，由宿主闸门做最终裁决。在「读不懂」上拒绝会拦掉所有早于这个字段的插件。
- **回滚要分清两种破坏。** 装机失败后发现包还在盘上，只 re-select 就够；包已经没了，
  re-select 什么也选不回来——必须 `installBundle(名字@旧版本)` 把文件装回来。把两种情况
  混为一谈，就是「升级失败」等于「插件消失」的直接原因。
- **旧版本必须在动手前读。** `removeForReplacement` 跑完，`listBundles` 就没有版本可报了；
  `runStep` 开头那句 `const previous = await installedVersion(...)` 是回滚唯一的依据。
- **回滚失败要明说。** 步骤本身已经失败，回滚再失败不能把原因吞掉：
  日志必须写「`pkg@1.0.0` is not installed」并指路去「已安装」页重装。`rolledBack` 只在
  真的装回来时才出现在结果里——**不要**为了让日志好看而无条件填它。

**代码：** `src/host/install.ts` 的 `InstalledGuard` / `runStep` 预检、
`bundleOf` / `installedVersion` / `recover` / `rollBack` / `StepOutcome.rolledBack`；
`src/index.ts` 的 `buildGuard()`；`src/host/registry.ts` 的 `dshRequirementOf`；
`src/host/runtime.ts` 的 `runtimeVersionOf`。

**守护：** `test/install.test.ts` 的五条 —— `a version the host would refuse is never
installed at all`（断言 `calls.install` 与 `calls.remove` 都为空）、`a version that fits
the running host still installs`、`an unknown requirement is not treated as a refusal`、
`a package the manager destroyed is put back at its old version`（断言第三次 install 是
`pkg@1.0.0` 且 `outcome.rolledBack === '1.0.0'`）、`a package still on disk is re-selected
instead of reinstalled`（断言没有第三次 install）、`a rollback that is refused says so
instead of pretending`。把预检条件改成 `&& false` 时第一条必须红；把 `recover` 里的
回滚分支删掉时后两条必须红（两者都实测过）。

---

## 21. 失败的升级不许把「关着的插件」打开

**不可退化。** PR #2（HootRock）修的真实问题：一个用户把某个插件关掉、点了升级，
升级失败，插件却**变成启用**了。用户没有要求它跑，一次失败的操作反而改了它的运行状态。

根因不在安装本身，在恢复路径。`recover()` 面对「包还在盘上、但被取消了选中」时
只有一个动作：`restoreSelection()`，而它的名字是准确的、行为是写死的——它**只会**
`setBundleEnabled(name, true)`。取消选中是 `removeBundle` 干的（换版本必须先卸载），
所以失败的步骤必然经过这个窗口；成功路径上那句 `restoreEnabledState(..., step.enabled)`
（`src/host/install.ts:778`）在失败时被 `installed` 判断跳过，于是这个窗口里
**唯一**的修复动作就是「打开它」。

- **恢复要按「这一步想要什么」修，不是按「盘上有什么」修。** 包还在盘上只说明不用重装，
  说明不了它该不该跑。`step.enabled === false`（用户明确要求关着）时走
  `restoreEnabledState(manager, step, false, log)`，它按目标状态对齐：读到已经关着就
  什么都不做，读到还开着就关下去。
- **`undefined` 仍然等于「保持加载」。** 只在**明确** `=== false` 时改走另一条路：
  没带这个字段的调用方（老客户端、脚本）没有表达「请关掉它」，把它们当成「关」会把
  一次失败变成一次停用。这与 `src/host/install.ts:633` 用 `typeof step.enabled === 'boolean'`
  决定要不要把 `enabled` 传给 manager 是同一条约定。
- **两条路都要留着。** `restoreSelection` 的日志
  `re-select <name> (a failed replacement must not leave it unloaded)` 是「为什么又把它选回来」
  的唯一说明；把它合并成一句 `restoreEnabledState(..., step.enabled ?? true, ...)` 会让
  这句话消失，`test/install.test.ts` 的三条老用例（`:371`、`:401`、`:646`）也会一起失效。
  合并不是错，但那样就没人解释「包本来就在，为什么还要动它」了。
- **两条失败形状都要覆盖。** manager 返回错误（`result.error`）和 `installBundle` 直接
  抛出（pnpm 死掉）走的是同一个 `recover()`，所以修复对两者同时生效；只测其中一种，
  另一种回归时看不出来。
- **in-place 路径从来不受影响。** `replaceWithoutRemoval` 成功时在
  `src/host/install.ts:575` 用的是 `restoreEnabledState(..., options.enabled)`，本来就是
  按目标状态对齐的。这个 bug 只住在「卸载之后又失败」这一条路上。

**代码：** `src/host/install.ts:473` `recover`（`:490` 的分支）、`:316` `restoreEnabledState`、
`:363` `restoreSelection`、`:633` `restoreEnabled` 的取值、`:778` 成功路径的恢复。

**守护：** `test/install.test.ts` 的五条 —— `a failed upgrade leaves a plugin that was
switched off switched off`（断言 `calls.enable` 为空且日志里没有 `re-select`）、
`a thrown install after the removal keeps that state too`、`a failed upgrade switches off
a plugin the manager reports as loaded`（断言 `{ name: 'pkg', enabled: false }`，即目标状态
优先于当前状态）、`a failed upgrade still puts back a plugin the step wanted loaded`、
`a failed upgrade does not toggle a plugin that is already on`。把 `recover` 里那行改回
无条件 `restoreSelection` 时前三条必须红；把分支改成
`restoreEnabledState(..., step.enabled, ...)`（丢掉 `undefined` 的旧语义）时上面三条老的
`re-select` 用例必须红（两者都实测过）。

---

## 22. 改 `package.json` 要在 harness 自己的写入锁里改

**不可退化。** 这一条是外部报告的（[@Herdeny](https://github.com/Herdeny) 在
`awesome-dsh-plugins-2026#11`），用 1.7.0 已发布的 `lib/host/manifest.js` 就能复现：
并发 writer 先读到「条目已被摘掉」的 manifest、在我方还原之后提交自己的快照，
条目就此消失；而还原那一步已经把 journal 清掉，`recoverPendingDrop` 于是
`{ kind: 'none' }`——**没有任何东西能修**。§3 的 journal 只挡「进程被杀」，
挡不住「并发 writer 的 read-modify-write」。

- **`dropDependency` / `restoreDependency` / `confirmDependency` / `recoverPendingDrop`
  全部在 `withManifestLock` 里跑**，拿的是 `atomic-write` 用的同一把
  `package.json.lock`，写的内容也是同一个 `${process.pid}\n`。
- **拿不到锁就不写，一个字节都不写。** `dropDependency` 返回
  `{ kind: 'unavailable', reason: LOCK_BUSY }`，`replaceWithoutRemoval` 已有的分支
  会打日志并 `return undefined`，于是走 `removeForReplacement` —— 慢一点但永远正确。
  **不要**改成「拿不到锁就直接写」，那正是这条 bug。
- **`LOCK_WAIT_MS = 1_000` 是刻意的短。** 这里的失败模式不是「等一下就好了」，
  而是「另一个操作正在跑」；等满 manager 的 120 秒只会让升级看起来卡死。
- **本进程持锁要立刻判定为忙，不能重试。** `atomic-write` 的 `holderExited()` 对
  `pid === process.pid` 返回 false（它不会接管自己的持有者），所以嵌套获取重试
  只会等满超时。`withManifestLock` 打开失败后先 `readWriterLock`，
  `holder?.pid === process.pid` 直接返回 `undefined`。
- **绝不抢占别人的锁**，即使记录的 pid 已经死了：那可能是马上要醒来的 writer，
  而 `atomic-write` 自己已经有 takeover 逻辑。我们能做的正确选择是放弃。
- **journal 只在锁内、且确认条目真的回到盘上之后才清。** `restoreDependency`
  拿不到锁时返回 false 并**保留记录**，`recoverPendingDrop` 拿不到锁时返回
  `{ kind: 'failed', reason: LOCK_BUSY }` 并保留记录——下次加载再修。
  原来那句「entry is on disk either way」在没有锁的世界里是错的。
- **必须同步**。`Atomics.wait` 用来做退避 `sleep`：这四个函数是同步 API，
  改成 async 会波及 `src/index.ts:723` 的加载时恢复和一整批测试。
- **锁名硬编码成 `'package.json.lock'`**，不再拼 `MANIFEST_FILE`：`manifest.ts`
  现在 import `lock.ts`，顶层引用 `MANIFEST_FILE` 会在初始化前求值。
  `test/lock.test.ts` 用 `assert.equal(LOCK_FILE, \`${MANIFEST_FILE}.lock\`)` 钉住。
- **测试要能红**：把 `withManifestLock` 里 EEXIST 分支改成直接 `return body()`
  （即修复前的行为），会有 7 条变红（4 条 manifest + 3 条 lock），已实测。

**代码：** `src/host/lock.ts` 的 `LOCK_FILE` / `LOCK_WAIT_MS` / `LOCK_BUSY` /
`ManifestLockOptions` / `sleepSync` / `withManifestLock`；`src/host/manifest.ts` 的
`dropDependency` / `restoreDependency` / `confirmDependency` / `recoverPendingDrop`
（公开壳）+ `removeEntry` / `putEntryBack` / `settleRecord` / `undoDrop`（锁内实现）。

**守护：** `test/lock.test.ts`（8 条新增：锁名、无锁时跑完不留文件、锁内写的是自己的
pid、本进程持锁立即忙、别人的锁到点放弃、别人释放后接管且 body 只跑一次
（断言退避是 `[10, 20]`）、body 抛错也释放锁、忙的句子说的是锁）与
`test/manifest.test.ts`（5 条新增：持锁时 drop 返回 unavailable 且 manifest 字节未变、
还原拿不到锁保留记录供下次修复、恢复拿不到锁也保留记录、并发 writer 抹不掉已还原的
条目、已还原的条目确认时遇锁不等待）。这些用例都传 `{ waitMs: 0 }`，
整套文件仍只要 ~460ms。

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
