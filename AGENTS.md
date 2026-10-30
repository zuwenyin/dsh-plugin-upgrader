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

- 阶段：`waiting` → `verifying`（看到 `Verifying lockfile … supply-chain policies`）→
  `installing` → `applying` / `cancelling`。`applying` / `cancelling` / `installing`
  一旦由 manager 上报，**不许**被后续日志回退。
- 纯空白的 chunk 是 keep-alive，不算「有进展」。
- 面板要有：已用时计时、不确定态进度条、阶段文字、慢速提示、日志尾部、状态停滞检测。

**代码：** `src/host/progress.ts:38` `nextPhase`（`:25` `VERIFYING`）、
`src/host/progress.ts:16` `Phase`（含 `verifying`）；
`src/client/components/JobPanel.ts`；文案 `src/client/copy.ts:60-69`。

**守护：** `test/progress.test.ts`（5 条）。

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
