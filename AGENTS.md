# AGENTS.md —— 改这个仓库之前先读

下面 26 条**全部不可退化**：要破先说明为什么，不许顺手删掉。判断标准只有：**用户能看见的结果不能变差**；每节末 [详证] 存事故与行号核对，**不会自动加载**，动那条才打开。**新加规则**：判
据写这里（≤ 4 行），详证写 `docs/rules/NN-slug.md`。**硬上限 160 行 / 9,000 字符**（`check` 里的 `verify-agents-md.mjs`）：加判据先
删废话或搬详证，**不许为过闸删判据，不许提高上限**。

## 1. GitHub 链接：`GH` 按钮 + 历史版本链接
没有 `repository` 就**不显示**按钮，而不是一个坏的。版本号即链接：有 tag → `releases/tag/v<version>`，没 tag 或读不到 → `releases`，
**绝不猜 tag**。「历史版本」读失败**必须**给出原因和「重试」。`dropsRepositoryFields` **不要**只看顶层。
[详证](docs/rules/01-github-links.md)

## 2. 换版本时**不先卸载**（in-place replacement）
`installBundle` 对已声明依赖以 `already-installed` 拒绝，pnpm 根本不跑。顺序**不能被重排**：先直接 install；被拒 →
`replaceWithoutRemoval` **临时**摘掉依赖（写 journal）再 install，**插件不被卸载**；**只有**它主动放弃时才退回 `removeForReplacement`。
桌面壳**不导出** `DSH_PROFILE*`，`profileDirFrom` **必须**有 cwd 回退。 [详证](docs/rules/02-in-place-replacement.md)

## 3. Profile manifest 必须随时可恢复（journal）
窗口里被杀的插件会从 manifest 消失——**先 journal，再删，再写 manifest**。加载时 `recoverPendingDrop`：缺→补回；已在→只清 journal；损坏→清掉，
**绝不**凭猜测改 manifest；失败只 warn。 [详证](docs/rules/03-journal.md)

## 4. 升级完不能把页面 reload 进一个已经不存在的 boot 文档
404 会毒掉整批。reload **必须**先 `reloadWhenBootDocumentFresh`；**只有确定的 404** 才阻止并提示重启，说不清的照常 reload；**不要**写回
`window.location.reload()`。 [详证](docs/rules/04-boot-reload.md)

## 5. 「latest」不能低于已安装的版本
正常**原样信任**，更高的 prerelease **不许**抢；**只有**低于已装才是坏 tag → 取更高者、稳定优先，无更高则**留原 tag**，**不许**造。
[详证](docs/rules/05-latest-tag.md)

## 6. 镜像落后要让用户看见
非官方源额外问上游，列出高于已安装的缺口；上游读不到报「没有缺口」，**不要**报「全部缺失」。 [详证](docs/rules/06-mirror-gap.md)

## 7. 慢的时候必须看得见在干什么
`waiting` → `verifying` → `installing` → `applying` / `cancelling`；`installing` 是 manager 在
**pnpm 启动之前**报的、**不代表**已过校验，后到的校验行必须能改回 `verifying`；`applying` / `cancelling` **不许**被日志回退。空白 chunk 不算「有进
展」。「还在动」问**宿主**心跳，不问 pnpm。 [详证](docs/rules/07-progress.md)

## 8. 写入锁超时要翻成人话
先读锁、翻成人话、原文留方括号；不是锁超时的信息**原样返回**。 [详证](docs/rules/08-writer-lock.md)

## 9. 自己不能给自己换版本
批量升级**永不包含**自己：落后走「用页面安装器升级」，没入口就明说。`link:` / `file:` 行（`sourceKind === 'path'`）**永远不可升级**。
[详证](docs/rules/09-self-update.md)

## 10. `bundle-in-use` 要自己解开
加载器仍持 fiber 时 `removeBundle` 空转：先 `setBundleEnabled(true)` 再 `setBundleEnabled(false)`，重试；仍失败才报重启。
[详证](docs/rules/10-bundle-in-use.md)

## 11. 其它不许破的约定
**路由仅限回环**：`POST job` / 安装动作只接受 loopback，否则 403。**一次只跑一批**：第二个 `POST job` 拿 `409 busy`（带 id），前端接管而非报错；僵尸
job 按心跳 15 分钟判废。**registry 并发上限** `PACKUMENT_CONCURRENCY = 4`：11 个并发就打超时镜像，**不要换回 `Promise.all`**。
overview **一次答完**（`bundles` 字段）。**enabled 保留**：真卸载后装回原启用状态，失败报读到的状态。**失败要带原因**：`versionError` / 历史读取失败不能
空白。**语言**：文案走 `src/client/copy.ts` 的 zh + en，不内联中文。 [详证](docs/rules/11-conventions.md)

## 12. 安装源是用户能改的设置，不是让用户改文件
换源是**设置**，不是让用户改 `~/.npmrc`，写进 profile，重启、换浏览器都在。**自带源不能改也不能删**：`WELL_KNOWN_REGISTRIES` 是常量，永不写进
`customRegistries`，**不要**改成「渲染出来但按钮 disabled」——会被恢复成可点。自加的源可改可删；删改正用的那个时 `registry` 必须跟着变，**读写同源**（`registryBase()`
读、`runStep` 写）。「测试」**并发**打 `/-/ping` 与根地址，`PROBE_TIMEOUT_MS` 是整次预算，**不能改回串行**；失败原因取最具体的：状态码 > 超时 > 网络原文。
必须 volatile：`apply` **每次读** `config.registry.get()`，**不要**加载时抄成字符串或 import 已删的具名导出（宿主起不来）。没有
`configForms` 时只显示不给改，**不要**存 localStorage。 [详证](docs/rules/12-registry-setting.md)

## 13. `lib/` 是提交进仓库的，不是构建垃圾
Store 按 `files` 找**固定 commit** 里的 `./lib/index.js`，找不到就判缺少运行时文件、拒绝 `prepare` 补齐。
**改完 `src/` 必须 `pnpm run build` 并把 `lib/` 一起提交**；**不许手改 `lib/`**（tsc / esbuild 的输出）；**`prepare` 不能加回来**（构
建挂在 `prepack` 上）。`lib/` 必须**可复现**，守卫比的是**工作区与索引**。 [详证](docs/rules/13-lib-committed.md)

## 14. 一次发版要同时到两个地方：npm 和 GitHub Release
推 tag 后 npm 和 Release 页面必须同时到。`release` job 用 `needs: publish` 排在发布之后；**不许**改回手工步骤、**不许**加
`continue-on-error`。正文两边都没有时脚本**退出 1、job 变红**；版本整词匹配，`1.6` 不匹 `1.6.0`。 [详证](RELEASING.md)

## 15. 能力声明要如实写，但不能为了讨好扫描器去改代码
审核按源码字符串与语法判信号（**纯类型导入也算**），不看意图，声明必须与代码一致。**不要为了消信号去改功能。** `process.env` **只许点号直取那六个白名单名**（`DSH_HOME`
`HOME` `USERPROFILE` `PATH` `NODE_ENV` `LANG`），`process.env["X"]` 形式和新增名字都算命中 `credentials`；能如实消掉的消掉（`@deepseek-ai/schemastery`
用 `peerDependencies`）；**能力要写进 README**。`dshReleases` **只写真跑过的版本**，`dshOperations` **不要提前填 `passed`**。
[详证](docs/rules/15-capability-declaration.md)

## 16. 「需要重启」要给出一条能完成重启的路，而不是一句话
页面做不到重启宿主，文案里**不许**说它能。按钮由 `application === 'restart-required'` 决定，**不要**改看 `banner.tone === 'warn'`（warn
还兼别的事）。desktop → 退出再打开；cli → 给出那条命令行；桌面版**故意不给命令**（会起第二个宿主）。pid 现算不缓存，变了才算重启；**两分钟是「不再声称在等」不是「停止等待」**。
**关掉对话框必须停掉轮询**。刷新必须走 `reloadWhenBootDocumentFresh`（§4）。**两种「卡住了」不能合并成一句**。
[详证](docs/rules/16-restart.md)

## 17. 一次没答上来不等于宿主重启了
升级**成功了**，页面却报「失去联系」——一次轮询失败≠重启。**判据是「连续」不是「累计」**：`WATCH_MISS_LIMIT = 4`，一次成功就清零，**不要**改成累计；测试必须能红。
`fetch` 的 reject 也要收住，否则整批被判失联。`delay` 是注入项（测试传 `nowait`），**不要**改成真实 `setTimeout`。
[详证](docs/rules/17-watch.md)

## 18. 每个版本先跟「正在跑的 DSH」比一次，再决定要不要给按钮
页面说「可以」宿主却拒绝 = 插件没了。**判定必须和宿主一模一样**：`engines.dsh` 在时**只看它**，否则每个 `@deepseek-ai/dsh*` peer 都要满足。
**运行时版本从宿主入口读**，写死路径会错一半；**读不到就什么都不标**，只有不满足才是 `false`。**两个方向都要管**：降级禁用按钮，升级 `latest` 不兼容则 `blocked`。
**区间匹配不许「简化」**：`satisfiesRange` 逐位对齐 `node-semver`。 [详证](docs/rules/18-compatibility.md)

## 19. 批次状态不能住在 `apply()` 的闭包里
HMR 会重建本插件，新实例必须还认得旧实例的批次。状态挂 `globalThis`（`Symbol.for('dsh-plugin-upgrader/jobs')`），模块级 `const` 重求值后照样空；
**`Symbol.for` 不是 `Symbol()`**。**只清自己那份**：`finally` 里必须是 `if (store.live === job) store.live = null`。
**进程重启后该没有的就是没有**，不要落盘。 [详证](docs/rules/19-job-store.md)

## 20. 宿主会拒的版本，一个字节都不许写下去
宿主闸门在 pnpm 之后才说话，必须提前自己问一次。**预检在 `runStep` 动手之前**：用 `InstallGuard` 读目标版本的 DSH 范围，不满足就返回
`incompatible-version`，pnpm 一次都不跑（**不要**挪到 install 之后）。**读不到 ≠ 不兼容**，一律放行交宿主裁决。**回滚分清两种破坏**：包在盘上只
re-select，包没了必须 `installBundle(名字@旧版本)`。**旧版本必须在动手前读**；**回滚失败要明说**，`rolledBack` 只在真装回来时才填。
[详证](docs/rules/20-precheck.md)

## 21. 失败的升级不许把「关着的插件」打开
用户关掉的插件，一次失败的升级不许把它打开。**按「这一步想要什么」修，不是按「盘上有什么」修**：包还在盘上只说明不用重装。**`undefined` 仍然等于「保持加载」**：只在**明确**
`=== false` 时走 `restoreEnabledState(..., false, ...)`。**两条路都要留着**：`restoreSelection` 的 `re-select …` 日志是
唯一说明。manager 返回错误与 `installBundle` 抛出走同一个 `recover()`。 [详证](docs/rules/21-failed-upgrade-enabled.md)

## 22. 改 `package.json` 要在 harness 自己的写入锁里改
**四个入口全在 `withManifestLock` 里跑**（`dropDependency`、`restoreDependency`、`confirmDependency`、
`recoverPendingDrop`），同一把 `package.json.lock`。**拿不到锁就不写，一个字节都不写**（退回 `removeForReplacement`）。
**`LOCK_WAIT_MS = 1_000` 刻意的短**；**本进程持锁立刻判忙，不能重试**；**绝不抢占别人的锁**，哪怕 pid 已死。**journal 只在锁内、条目真回到盘上之后才清**。
**必须同步**：`Atomics.wait` 退避，改 async 会波及加载恢复与测试。**锁名硬编码 `'package.json.lock'`**。
[详证](docs/rules/22-manifest-lock.md)

## 23. 一条 journal 记录只够一个包
同批另一包的成功结算不许抹掉别人失败的记录。**一个包一条**：磁盘格式 `{ version: 2, records: DropJournal[] }`（`JOURNAL_VERSION = 2`），文件名
不变；`upsertRecord` 只替换同名那条，`clearRecord(dir, name)` 只删同名那条。**结算只结算自己的**：`confirmDependency` /
`restoreDependency` / `undoDrop` 清理时必须带 name，**不要**再出现无参的「整份清空」。**一次恢复修完所有记录**：`recoverPendingDrops` 返回
`RecoveryResult[]`。**读 journal 也要进锁**：锁外那次读只判断「有没有记录」「该报哪些名字」，**决不从它采取行动**（§22）；拿不到锁时记录原样留着，返回
`{ kind: 'failed', reason: LOCK_BUSY }`，**日志不许说已经还原**。**旧格式必须还能读**；
**先写 `${target}.upgrader-tmp` 再 `renameSync`**，空集合删文件。 [详证](docs/rules/23-journal-per-package.md)

## 24. 「文件装回去了」和「插件跑起来了」是两件事
**`application` 一个字段不够**：`applied` / `restart-required` 才等于「跑起来了」，失败还要看 `changed`、`stage`、
`packageResult.exitCode`（`landedOnDisk`）。**停在 `enable` 且 pnpm 干净 = 装了没激活**：结果是 `inactive`（附
`rollbackReason`），**不是** `rolledBack`，更不是「没装」；只有 `kind: 'refused'` 才允许说 "is not installed"。两种失败**两种说法**：
能去「已安装」重新启用的和真丢了要重装的，不能共用一句 `xxx: not installed`（`inactiveAfterRollback` 优先）。**重试激活不走 `installBundle`**（会
被 `already-installed` 拒），走 `setBundleEnabled(false)` → `setBundleEnabled(true)`。
**`listBundles().enabled` 是「用户选择」不是「跑起来了」**。 [详证](docs/rules/24-rollback-inactive.md)

## 25. 「下载总数」不是「使用量」
判断有没有人真的在用，只能看**没发版那天的日下载量**。`last-month` 会随滚动 30 天窗口自己往下掉，看到平稳下坡**不是**回归；最近一两天报 0 是**上报滞后**，不是没人用（拿
`react` 对照过：四千万下载的日子也报 0）。**发版会把曲线搅乱**：发版日是固定开销，本包实测是安静日的 8.3 倍——功能没变不必发版。**基线用中位数不用平均数**。**不要**把
`--fail-below` 写进 CI：会随口径波动变红的检查，只会训练所有人忽略红色。 [详证](RELEASING.md)

## 26. 不兼容不能是一条死路
宿主闸门**在 bundle 卸下之后**才拒绝（§20），所以「装不了」必须当场说清并**给出能装的那个版本**。「新的会被拒」是 `blocked`，「在跑的从来不被允许」是
`installedIncompatible`：插件可能根本没被加载，必须单独一行说。**`latest` 装不了 ≠ 没得装**：有更高的兼容版本就给 `recommended` 并
**重开 `upgradable`**。按钮和批量只认 `recommended ?? latest`，客户端走 `targetOf(row)`；再拿 `row.latest` 当目标就退回成「行是死的」。
`recommended` **永不高于** `latest`。**读不到 DSH 版本就不判**：`runtimeVersion` 为 null 时既不设 `installedIncompatible` 也
不标兼容——「不知道」≠「不兼容」。**`versionError` 是宿主对外数据，不是文案**：本地化只在客户端（`versionNoteOf`），未识别原文**逐字透传**，`retriable` 正则
依赖原文。**「需处理」只算本 profile 出问题的四件事**：`installedIncompatible`、镜像落后、读不到版本、待批准构建，**不算 `blocked`** 与可升级。
**诊断走纯客户端**，不加路由、不加 §15 能力信号。 [详证](docs/rules/26-compatibility-dead-end.md)

## 改完必须做的事
`pnpm run check`：typecheck(src+test) + build + `node --test` + pack 检查 + 构建产物已提交 + 本文件长度。发布走 tag（npm
trusted publishing，不要本地 token）：改 version → CHANGELOG → commit →
`git tag -a v<version> && git push origin v<version>`，CI 发 npm **并**建 GitHub Release（§14）；`dist-tags` 与
tarball 比 workflow 变绿晚几分钟到十几分钟（实测 404 两分半），别急着判失败。**测试要问一句：真的会红吗？** 改成哨兵值跑一次，确认失败再改回来——不能失败的测试等于没写。步骤见
[RELEASING.md](./RELEASING.md)。
