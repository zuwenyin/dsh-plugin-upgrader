# dsh-plugin-upgrader

[![npm](https://img.shields.io/npm/v/dsh-plugin-upgrader.svg)](https://www.npmjs.com/package/dsh-plugin-upgrader)
[![license](https://img.shields.io/npm/l/dsh-plugin-upgrader.svg)](./LICENSE)

> 给 DeepSeek Harness（DSH）的「插件」页补上**一键升级**和**版本历史 / 回滚**。

DSH 自带的插件页能装、能卸、能看已安装列表，但缺两件事：一次把全部插件升到最新，以及退回某个旧版本。
这个插件在插件页里加一个「版本」标签，把这两件事补齐。

[English](./README.en.md) · 中文

![版本标签](./screenshots/history.png)

## 功能

- **一键升级** —— 一次把全部可升级插件升到最新版，带进度、逐项结果和失败原因。
- **升级不卸载** —— 换版本走 in-place 替换，插件不会被卸下来再装回去（详见下文）。
- **看得见的进度** —— 升级时直接显示 pnpm 的原始输出（含换源重试、lockfile 校验），
  每步都有已用时计时和不确定态进度条，卡住时可以一键取消。
- **多选升级** —— 勾选任意几个插件，只升级选中的这些。
- **版本历史 / 回滚** —— 展开任意插件即可看到已发布的全部版本（含发布时间与引擎要求），点一下切到那个版本。
- **一键跳 GitHub** —— 每行的 `GH` 按钮打开插件仓库主页；点版本号直接进该版本的 GitHub 发布页。
- **镜像落后会标出来** —— 配置的镜像还没同步、但上游已经发布的版本会单独标一行，
  而不是假装已经是最新版。
- **自己选安装源** —— 版本页顶部就能切换 npm 源（官方源 / 大陆镜像 / 自己填的私有源），
  选完立刻按新源重读版本列表，升级也走这个源；选择写进 profile，重启和换浏览器都还在。
- **安装源管理** —— 「注册表」按钮打开一个对话框，里面列出自带源、`pluginManager` 配的源
  和用户自己加的源；自带源不能改也不能删，自己加的可以随时改/删。每一行都能单独
  「测试」能不能连上，当前在用的那个也能一键测。

![安装源管理](./screenshots/sources.png)

> **要改这个仓库？先读 [AGENTS.md](./AGENTS.md)。** 那里逐条写了「已经实现并且必须继续成立」
> 的行为、对应代码位置和守护它的测试。上面这些功能里，`GH` 链接和 in-place 升级都曾经
> 被无意改掉过一次。

## 界面位置

插件页顶部标签栏多出一个「版本」标签，与「已安装」「发现」并列：

- 顶部统计：可升级数量 / 已安装数量 / 每个插件的版本数
- 顶部「注册表」按钮打开安装源对话框：
  - 自带源（官方源、大陆镜像）：只能切过去和测试，不能改也不能删
  - `pluginManager` 里配的源：可以「收进列表」变成自己的常用源，或直接用
  - 自己加的源：可以改、可以删，删掉的如果正在用会自动退回「跟随 pnpm 配置」
  - 每行「测试」同时打 `/-/ping` 和根地址，谁先答应用谁，整次探测 5 秒预算
    （串行探测会把大陆镜像报成连不上：`/-/ping` 有时要 15 秒，根地址只要 0.3 秒），
    结果显示在那一行下面
  - 底部「跟随 pnpm 配置」用 pnpm 自己的源（通常是 `~/.npmrc` 里的那个）
- 「一键升级」升全部可升级插件；下面一条选择栏负责「升级选中」
- 「检查更新」强制刷新 registry 缓存（默认缓存 5 分钟）
- 搜索框按包名过滤
- 每个插件一行，展开「历史 (n)」后是该插件的完整版本列表
- `GH` 打开仓库主页（没有仓库的插件不显示该按钮）
- 版本列表里每个版本号本身就是链接，点开直接进 GitHub 的发布页：
  - 该版本打过 tag → `releases/tag/v<version>`（tag 是否真实存在由 GitHub tag 列表确认，
    不是猜的，所以不会点进 404）
  - 该版本没打 tag，或 GitHub 列表读不到（限流 / 离线）→ 退回仓库的发布列表 `releases`，
    不在页面上放一个点进去是 404 的版本号

![展开历史版本](./screenshots/selection.png)

## 安装

在「插件」页的**发现**标签里搜索 `dsh-plugin-upgrader`，点安装即可。
桌面版请用它自带的插件管理界面安装，命令行改动不了正在运行的桌面 profile。

用 `dsh` 命令行（把 `web` 换成你自己的 profile 名）：

```bash
dsh plugin --profile web add dsh-plugin-upgrader
```

从源码安装：

```bash
git clone https://github.com/zuwenyin/dsh-plugin-upgrader.git
cd dsh-plugin-upgrader
dsh plugin --profile web add "$PWD"
```

装好后打开「插件」页，顶部会多出「版本」标签。不需要重新构建，也不用重启。

## 工作原理

浏览器端读不到 profile 的依赖清单，也无法可靠直连 npm（CORS、私有源、token），
因此所有包操作都放在宿主端：

| 路由 | 作用 |
| --- | --- |
| `GET /api/plugin-upgrader/overview` | 已安装插件 + 各插件已发布版本（registry packument，5 分钟缓存，20 秒超时，最多 4 个并发） |
| `POST /api/plugin-upgrader/job` | 提交一批升级 / 切换步骤，立即返回 job id |
| `GET /api/plugin-upgrader/job?id=…` | 轮询进度、当前阶段、已用时、逐项结果与实时日志 |
| `POST /api/plugin-upgrader/cancel` | 中断当前步骤（任何一次安装，包括退回老路径后的重试） |

所有路由仅限本机回环访问：批量操作会安装软件包，配对设备或跨站页面一律拒绝。

### 为什么升级不卸载插件

`pluginManager.installBundle` 对已安装的包名会以 `already-installed` 拒绝，
pnpm 根本不会跑。所以换版本的顺序是：

1. **先直接 `install`**；
2. 被拒绝时，把 profile `package.json` 里那条依赖**临时**摘掉（先写 journal），再 install ——
   pnpm 写回新版本，**插件不被卸载**，加载器里的实例不断，启用状态也不用恢复；
3. 只有第 2 步主动放弃（manifest 读不了 / install 失败 / 被拒绝）时，
   才退回 remove + install 的老路径。

旧版本号会回传给界面，用于提示这是降级。

> 实现在 1.2.0 就有了，但 1.2.0–1.4.0 在桌面端**从未真正生效**：
> `profileDirFrom()` 只认 `DSH_PROFILE_DIR` / `DSH_HOME` + `DSH_PROFILE`，而桌面壳启动宿主时
> 不导出这些变量（它直接把 profile 目录当作子进程的 cwd），于是第 2 步第一行就放弃了，
> 每次升级都悄悄走 remove + install。1.4.1 加了 cwd 回退之后才真正走这条路。
> 细节见 [AGENTS.md](./AGENTS.md) 第 2 条。

### 升级中断后 profile 还能自己长回来

第 2 步要在「依赖条目已经删掉、新版还没装上」的窗口里改 profile 的 `package.json`。
如果进程正好在这段时间被杀掉，插件就从 manifest 里消失了，等于装不回去。
所以删除之前先写 `package.json.upgrader-journal.json`：下次插件加载时会读它，
manifest 里确实缺这条就补回去，已经装上就只清掉记录，记录和 manifest 对不上就忽略。
恢复失败只是打日志，不会拦住标签页加载。

### enabled 状态保留

卸载会丢掉插件原有的启用 / 禁用状态，因此任何**真的卸载过**插件的步骤都会在装完后
按操作前的状态重新 `setBundleEnabled`（`src/host/install.ts:251` `restoreEnabledState`），
禁用中的插件升级后仍然是禁用状态。in-place 那条路不卸载，所以本来就不需要恢复。

### 为什么升级有时候要好几分钟

不是这个插件慢，是 pnpm 慢。pnpm 11 在 `install` 前会拿锁文件里的每个条目去 registry
重新核对一次（`Verifying lockfile against supply-chain policies`），国内镜像
（`registry.npmmirror.com`）对不少包会 `ETIMEDOUT`，于是走 10 秒 → 1 分钟的重试阶梯。
真正卸载再安装的那种降级路径要跑两条 pnpm 命令，两段各等一次。

旧版本在这里什么都不显示，进度条只在「整步完成」时动一格，所以看起来就是死住了。
现在宿主端订阅了 `plugin-manager/install-log` 和 `plugin-manager/install-state`，
把 pnpm 的原始输出、当前阶段、重试次数实时转进 job 日志，界面同时显示已用时和
不确定态进度条：慢的时候你能看见它在重试，而不是盯着一个不动的 0%。

阶段一共四个：`verifying`（在校验锁文件）→ `installing` → `applying` / `cancelling`。
锁文件校验那一行会连续几分钟不动，单看和「卡死」一样，所以单独给它一个阶段名。

顺带修掉的两个坑：

- 心跳改成定时器（2 秒），不再按「完成一步」写。单步超过 15 分钟以前会被误判成
  「job 已放弃」，于是一个健康的任务被作废，还能再并进来一批。
- 退回老路径时那一次重新安装以前用 `requestId: undefined`，导致那一段无法取消；
  现在每次安装都有自己的 id，取消在任何阶段都有效。

### 写入锁超时说人话

profile 的 `package.json` 由 harness 用同目录的 `package.json.lock` 串行化。
manager 自己的预算是 120 秒，而 `atomic-write` 给不写预算的调用方的默认值是 2 秒，
所以偶尔能看到：

```
atomic-write: timed out waiting for the writer lock at …/package.json.lock
```

这句话只报一个文件名和一个 pid，用户无法处理。现在失败信息会先读那把锁，再说清楚是
「另一个操作正在改写，等它结束再试」还是「锁没释放，重启 DSH 会自愈」，
原文放在方括号里保留，方便搜索或贴进 issue。

### 自己那一行不能自己升级

批量升级的第一步是卸载，而卸载的正是此刻在跑的那段代码。所以「一键升级」永远跳过本插件自己，
自己那一行落后时走插件页自己的安装流程；页面没有提供安装入口时明确说一句，
而不是让人点一个必然失败的按钮。

### 同一时刻只跑一批

宿主端一次只允许一个 job。重复提交会拿到 `409 busy`（带正在跑的那个 job id），
界面据此**接管**那一批的进度显示，而不是弹一条看不懂的错误：

- 新开一个插件页标签、或在进度跑着时再点「一键升级」，都会看到正在进行的那一批
- `overview` 里带 `active` 字段，标签页一挂载就能接上正在跑的任务
- job 每 2 秒刷一次心跳时间戳，宿主重启后遗留的「僵尸 job」会按心跳超时自动作废，
  不会永久占着位置让之后所有升级都撞 `busy`

主进程重启会让正在跑的 job 中断，界面会把这种情况显示为失败而不是永远转圈。

## 项目结构

```
dsh-plugin-upgrader/
├── AGENTS.md             **改代码前先读**：不可退化的行为 + 守护测试
├── src/                  源码（TypeScript）
│   ├── index.ts          宿主端入口：路由注册、job 调度、加载时恢复 manifest
│   ├── host/             宿主端逻辑（Node，无 DOM）
│   │   ├── config.ts     Config schema（volatile 的 registry / customRegistries）、读取用户选择
│   │   ├── overview.ts   组装 overview 载荷（含并发上限）
│   │   ├── registry.ts   registry packument 拉取 / 裁剪、GitHub tag 列表、镜像缺口
│   │   ├── install.ts    单步安装：in-place 替换、remove 回退、enabled 状态恢复
│   │   ├── manifest.ts   profile package.json 读写、journal、加载时恢复
│   │   ├── lock.ts       读 profile 写入锁、把锁超时翻成人话
│   │   ├── progress.ts   从 pnpm 原始输出推断 job 阶段
│   │   ├── bundle.ts     插件元数据（来源分类、多语言字段、图标）
│   │   ├── repo.ts       仓库 URL 归一化
│   │   ├── version.ts    semver 比较、发布页链接
│   │   ├── http.ts       回环校验、JSON 读写
│   │   └── manager.ts    宿主 pluginManager 服务的最小类型契约
│   └── client/           浏览器端（拆成模块，由 esbuild 打成一个文件）
│       ├── index.ts      createPlugin(require)：槽位注册入口
│       ├── components/   Tab / PluginRow / VersionLine / JobPanel / SourceDialog
│       ├── registry.ts   读写安装源设置、可选源列表的增删改
│       ├── boot.ts       reload 前确认 boot 文档还有效（见 AGENTS.md 第 4 条）
│       ├── copy.ts       zh / en 文案
│       ├── styles.ts     作用域 CSS
│       ├── hooks.ts      locale 订阅、overview 拉取、外观插件判定
│       ├── api.ts        fetch 封装、job 轮询
│       ├── format.ts     版本号 / 日期 / 外部链接
│       ├── env.ts        window 上的最小类型声明
│       └── types.ts      载荷类型
├── lib/                  构建产物（**已提交**，见 AGENTS.md 第 13 条）
│   ├── index.js          宿主端入口（tsc 输出）
│   ├── host/*.js         宿主端模块 + .d.ts
│   └── client.js         浏览器端单文件 bundle（含 __ModuleLoader__ 包装）
├── scripts/build.mjs     构建脚本：tsc 编译宿主端 + esbuild 打包 client（加 --watch 即 dev）
├── scripts/verify-pack.mjs            发布前核对 tarball 里都有什么
├── scripts/verify-build-committed.mjs 核对 `lib/` 与源码一致且已提交
├── test/                 node:test 单元测试（.ts，Node 24 直接剥离类型）
├── locale/               （保留）语言包
├── assets/icon.svg       图标
├── cordis.patch.yml      bundle 注册
└── package.json
```

浏览器端虽然拆成了多个 `.ts` 模块，但最终由 esbuild 打成一个 `lib/client.js`，
外面套上 `window.__ModuleLoader__.load({ id, factory(require) { … } })`。
运行时它只能 `require('react')` 这类由宿主提供的模块，不能 require 自己的其它文件，
所以「拆模块」只发生在源码层，产物仍然是单文件。

## 开发

本项目用 pnpm 管理依赖（`package.json` 里钉了 `packageManager`，CI 也用 pnpm）：

```bash
pnpm install       # 只装依赖（不会构建，见下）
pnpm run dev       # 监听 src/，宿主端和浏览器端改完即编译（Ctrl+C 停止）
pnpm run build     # tsc 编译宿主端 + esbuild 打包 client → lib/
pnpm run typecheck # tsc 检查 src 和 test
pnpm test          # node:test 单元测试（.ts 直接运行）
pnpm run check     # 以上全部（typecheck + build + test + pack 检查 + 产物是否已提交）
```

`lib/` 是**提交进仓库**的，不是构建垃圾：DSH Store 审核固定 commit，不会为了补齐
运行时文件去执行 `prepare`。所以 `pnpm install` 不再触发构建（安装期脚本会被审核
直接否决），构建挂在 `prepack` 上；改完 `src/` 必须 `pnpm run build` 并把 `lib/`
一起提交，`pnpm run check` 会替你核对。详见 [AGENTS.md](./AGENTS.md) 第 13 条。

**改任何代码前先读 [AGENTS.md](./AGENTS.md)。** 那里列的是「已经实现、不能再退回」的行为，
每条都附了代码位置和守护它的测试名；`pnpm run check` 全绿只说明没写坏，不说明没改坏
（很多行为没有对应测试，比如「自己那一行不出现在批量升级里」之外的边界情形）。

新增或修改测试后，问一句：**这个测试真的会红吗？** 把被测的字符串或分支临时改成哨兵值
再跑一次，确认它失败，然后改回来。不会失败的测试等于没写。

宿主端在 `src/index.ts`（`webServer` 前缀路由 `/api/plugin-upgrader`），
浏览器端在 `src/client/index.ts`（注册 `plugins.tab` 槽位）。

用户设置有两个：`registry`（当前在用的源，空 = 跟随 pnpm）和 `customRegistries`
（用户自己加的源），都在 `src/host/config.ts` 里声明成 `.volatile()`——这是宿主
设置服务愿意为它生成表单、并且写入能进到正在运行的插件里而不重启的唯一形状。
浏览器端通过 `configForms` 服务读写（`src/client/registry.ts`）；没有那个服务的
宿主照样能渲染这一页，只是源只能看不能改。两个自带源是常量，永远不写进
`customRegistries`，所以没有任何点击能改它们或删它们。

`pnpm run dev` 会并行跑两个监听器：`tsc --watch` 负责 `lib/index.js` 和
`lib/host/**`，esbuild 负责 `lib/client.js`，两者输出互不覆盖。注意 esbuild
打包时会直接剥掉类型而不做检查，所以改浏览器端时顺手跑一次 `pnpm run typecheck`。

改完代码后必须重新构建（profile 里的 `link:` 指向本目录，但加载的是 `lib/`，
不是 `src/`），并把重建后的 `lib/` 一起提交。`pnpm run dev` 已经替你重建了产物，
但**插件本身不会热更新**——要让宿主重新加载本插件，无需重启应用：先
`pluginManager.setBundleEnabled(name, false)` 再 `setBundleEnabled(name, true)`。

## 发布

见 [RELEASING.md](./RELEASING.md)。首次手动发一次，之后打 `v*` tag 由 CI 通过 npm trusted publishing 自动发布：

```bash
pnpm publish --access public   # 仅首次
```

## 许可

[MIT](./LICENSE)
