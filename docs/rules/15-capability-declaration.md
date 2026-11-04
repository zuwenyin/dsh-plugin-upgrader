# 15 能力声明要如实写，但不能为了讨好扫描器去改代码 —— AGENTS.md §15 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 15 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

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

## 为什么这条存在

这一条同时挡住了两个方向的错，而它们看起来是相反的：

- **往左错：改代码去讨好扫描器。** 把 `process.env` 换成层层参数传递、把 `fetch` 藏进
  一个间接层——信号确实从扫描器眼里消失了，**能力一点没少**，于是「声明」和「实际」之间
  的差从这个角度被拉大了：代码更难读、更难审，而它做的事完全一样。DSH Store 自己的整改
  文案也写着「do not rewrite plugin functionality to satisfy the scanner」。
- **往右错：如实承认然后什么都不做。** 这个插件是插件生命周期管理器——读写 profile、
  访问 registry 就是它的功能本体。把 `files`/`network` 消掉等于不做产品。所以原文的
  态度是「**能如实消掉的那一条要消掉**」，而不是「尽量消」。

这两条之间的缝只有一条：**声明要跟代码一致**。所以真正的交付物是三份东西同时正确——
源码里的信号、`package.json` 的依赖声明、README 的披露章节。

## 四个信号在本仓库的实际命中（2026-11-04 grep）

| 信号 | 原文的说法 | 实测 |
|---|---|---|
| `files` | `node:fs` 的导入 | 命中，见 `src/host/lock.ts`、`src/host/manifest.ts`、`src/host/runtime.ts` 的 `node:fs` 导入 | 
| `network` | `node:http`/`node:https` 导入（**纯类型导入也算**）、`fetch(`、`WebSocket(` | 命中。`node:http` 三处全是**纯类型**：`src/host/http.ts` 的 `import type`、`src/index.ts` 的 `import type`、`src/host/manager.ts` 的 `import('node:http').IncomingMessage` 内联类型；`fetch(` 在 `src/host/registry.ts` 与 `src/client/api.ts`；`WebSocket(` **零命中** | 
| `credentials` | 不在白名单里的 `process.env` 形式 | 全仓库只有一处 `process.env`：`src/host/manifest.ts` 的 `profileDirFrom(env: NodeJS.ProcessEnv = process.env, …)` —— 点号直取，在白名单讨论之外（它读的是整个 env 对象，不是某个具体键） | 
| `commands` | `child_process` 或 `spawn(`/`exec(` | **零命中** —— 原文「本仓库**没有**这一项」✅ 成立。`src/` 里所有 `.exec(` 都是 `RegExp.exec`（`lock.ts`、`registry.ts`、`repo.ts`、`version.ts`），不是 `child_process` 的 | 

`node:http` 那三处正是原文「**纯类型导入也算**」警告的对象：它们运行时一行代码都不执行，
但扫描器看的是字符串与语法，不看意图——所以这条警告是有实用价值的，不是唠叨。

## 行号校对（2026-11-04）

原文没有写任何行号（只点到文件、字段名和章节名），所以这一栏核对的是**指向的东西还在不在**：

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `package.json` 的 `engines` | `engines.node` = `>=20`，`engines.dsh` = `>=0.2.1-rc.3 <0.3.0-0` | ✅ 一致 |
| `package.json` 的 `peerDependencies` | `{"@deepseek-ai/schemastery": "~3.18.5"}`；`devDependencies` 里保留同一份 `~3.18.5` | ✅ 一致 |
| `package.json` 的 `dsh.compatibility` | `dsh.compatibility.dshReleases` = `{"0.2.1-rc.5": "compatible"}`；没有 `dshOperations` 键 | ✅ 一致 |
| 「目前只有 `0.2.1-rc.5`；`0.2.1-rc.4` 和 `0.2.2-alpha.2` 留空」 | 声明里确实只有 `0.2.1-rc.5` | ✅ 一致 |
| 「`allowRuntimeDependencies` 为 false」 | `package.json` 里没有这个字段，也没有任何 `dependencies` 的实际内容——**这是 Store 侧的审核规则，不是本仓库的配置项** | ✅ 一致（不是漂移，别去 package.json 里找它） |
| `README.md` 的「权限、依赖与外部服务」 | `README.md:217` `## 权限、依赖与外部服务` | ✅ 一致 |
| `README.en.md` 的「Permissions, dependencies and external services」 | `README.en.md:259` `## Permissions, dependencies and external services` | ✅ 一致 |
| `app.asar` 里 `dsh.compatibility` 零命中 | **未复核**：`app.asar` 是 182 MB 的二进制归档，本页没有 grep 它。这句话按原文继承 | ⚠️ 未验证（不是漂移） |

## 关于两个声明的完整规则

### `dshReleases`

- 键是**完整 SemVer**：`0.2.1-rc.5` 这种，不是 `0.2.1` 也不是 `0.2`。
- 值只能是 `compatible` / `incompatible` / `unknown` 三者之一。
- 必须与 `engines.dsh` 的范围一致：声明 `compatible` 而 `engines` 覆盖不到时，
  校验会把它**降回 `unknown`**——也就是说这条声明不能用来「放宽」兼容性。
- **只写真的跑过的版本。** 补一条 `compatible` 的前置条件是**在那一版上真的装起来用过**，
  不是「范围覆盖了所以应该也行」。这条规则的价值在于：`dshReleases` 是给别人看的证据，
  掺一条猜测就整体不可信了。

### `dshOperations`

`install` / `start` / `uninstall` / `rollback` 四项需要**逐版本的真实运行证据**。
没有证据就**整体省略**这个字段（会被补成 `unknown`），而不是编一个 `passed`。
这和 `dshReleases` 是同一条原则：`unknown` 是诚实的，`passed` 是断言。

### `@deepseek-ai/schemastery` 为什么是 peer

1.6.0 曾把它声明成 `dependencies`，理由是「`Config` schema 必须由 loader 校验用的同一个库
构建」。这条理由**恰恰指向 peer**：

- peer 保证 loader 与插件指向**同一份实例**；自带一份反而会造出**两个 schemastery**，
  于是 `Config` 的 schema 是插件自己那份库构建的，而 loader 用另一份去校验——正是当初
  想避免的局面。
- 桌面端把 schemastery 作为自身依赖发布，`dsh-plugin-manager` 等第一方包也依赖它，
  profile 是 hoisted 布局，所以它**一定在顶层**，peer 不会缺。
- 代价是：**缺 peer 不会让安装失败**，只会在运行时 import 失败。所以 `devDependencies`
  里必须保留一份，测试和构建才跑得起来。

## 补记：README 披露章节要跟着改的两类变更

原文写「新增一个外部端点、新增一次文件写入，都要同步改那里」。具体到本仓库，这两类
变更的落点是：

- **新增外部端点**（比如又一个 registry 探测地址）→ `network` 信号不变（`fetch(` 早就在
  代码里了），但 README 那一节要列出**新的目标主机**，因为读者关心的是「这个插件会连去
  哪里」，不是「有没有 `fetch(`」。
- **新增一次文件写入** → `files` 信号已经命中，但 README 里「文件」那一行写的是写入
  **范围**（profile 目录）。写到 profile 之外，那一行就变成假话了。

换句话说，扫描器的判据（字符串与语法）和 README 的读者关心的事（能力边界）不是一回事，
两边都要维护，这正是这一条同时要求「如实声明」和「写进 README」的原因。
