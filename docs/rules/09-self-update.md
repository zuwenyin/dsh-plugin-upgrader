# 09 自己不能给自己换版本 —— AGENTS.md §9 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 9 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

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

## 为什么这条存在

`plugin-manager` 的批量路径（`changeBundles` / 升级按钮）第一步是**卸载**，然后才装新版。
对本插件自己来说，这个「卸载」要拆掉的是**此刻正在执行这段代码的那个插件**：
它的 `apply()` 会被撤销、模块被重新求值、正在进行的 HTTP 路由随之消失。
不是「装完了重启一下」那种麻烦，而是**执行到一半的工具把自己删了**——
剩下的步骤没有人跑，用户看到的是升级卡住或界面直接换了张脸。

所以出路只有一条：**自己那一行不进批次**，改走插件页自己的安装流程
（插件页的安装器是从页面本身发起的，不经过「先卸载」这条批量路径）。

第二条禁令（`link:` / `file:` 永远不可升级）是另一回事，但放在同一条里：
把本地目录换成一个 registry tarball **不是升级**，是把「谁在提供这份代码」换掉了。
版本号可能变大，行为、构建方式、更新流程全都变了，而界面上的措辞是「升级」。

## 三处判据

### 1. 批量路径排除自己

```ts
const SELF_NAME = 'dsh-plugin-upgrader'                                  // Tab.ts:40
const batchable = (row) => row.upgradable === true && row.name !== SELF_NAME  // Tab.ts:245
```

`upgradable === true` **且** 不是自己，两个条件都在 `batchable` 里（`Tab.ts:245`），
在同一个地方、用 `&&` 连起来。拆成两个过滤器、或者把 `!== SELF_NAME` 挪到调用点，
都会让它有第二次被漏掉的机会。

### 2. 自己那一行走「用页面安装器升级」

- `src/client/components/PluginRow.ts:43`：`selfUpdate = self === true && row.latest !== undefined && row.latest !== row.version`
  ——只有「是自己」且「确实落后」才出按钮。
- `src/client/components/Tab.ts:306` `installSelf`：真正的回调，由 `:542`
  以 `onInstallSelf: installSelf` 传下去，`:541` 用 `self: row.name === SELF_NAME` 标记那一行。
- 页面没提供安装入口时，`installSelf` 直接
  `setBanner({ tone: 'warn', text: t('selfUpdateUnavailable') })`（`Tab.ts:310`），
  文案是 `src/client/copy.ts:32`：「这一页没有提供安装入口，请在「已安装」里用官方安装
  对话框升级本插件。」——**说清楚下一步去哪**，不是一句「不支持」。

### 3. path 来源永不升级

- `src/host/bundle.ts:23` `sourceKind()` 把 source 分类成 `registry` / `path` / `unknown`
  等（`SourceKind`）。
- `src/host/overview.ts:213` 是 `kind === 'path'` 的分支：它**照样去查 registry**
  （`:222`），把发布历史、`latest`、`repoUrl` 都填上，然后在 `:239` 写明
  `versionError = 'local path install: the version comes from the directory, not the registry'`，
  最后 `:242` **无条件** `entry.upgradable = false`。
  注释在 `:240-241`：「replacing a `link:` with a registry tarball would change how the
  plugin is installed, which is not an upgrade.」

注意这里**不是**「path 行什么都不显示」——那是另一个 bug（行上只有一个箭头、没有版本数字，
读起来像插件坏了）。正确做法是**显示历史、但标成不可升级**，两个都要。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/client/components/Tab.ts:28` `SELF_NAME` | `src/client/components/Tab.ts:40` | ⚠️ 漂移（+12 行） |
| `:196` `batchable` | `src/client/components/Tab.ts:245` | ⚠️ 漂移（+49 行） |
| `src/client/components/PluginRow.ts:43` `selfUpdate` | `src/client/components/PluginRow.ts:43` | ✅ 一致 |
| `Tab.ts:243` `installSelf` | `src/client/components/Tab.ts:306` | ⚠️ 漂移（+63 行） |
| `copy.ts:32` 文案 | `src/client/copy.ts:32` `selfUpdateUnavailable` | ✅ 一致 |
| `src/host/bundle.ts:23` `sourceKind` | `src/host/bundle.ts:23`（函数；类型别名 `SourceKind` 在 `:12`） | ✅ 一致 |
| `src/host/overview.ts:175` path 分支 | `src/host/overview.ts:213`（`if (kind === 'path')`） | ⚠️ 漂移（+38 行） |
| `test/self-row.test.ts`（5 条） | 5 个 `test(...)` | ✅ 一致 |

`Tab.ts` 的三个行号分别漂了 12 / 49 / 63 行，互不相同——这个文件被改过好几次，
**不能用一个偏移量去推另外两个**。这也是本条最该优先丢掉行号的原因。

`Tab.ts:243` 附近现在是一段注释（`* action that goes through the page's installer instead.`），
被指向的 `installSelf` 定义在 `:306`——行号漂移 63 行之后恰好还落在「关于 self-update
的注释」上，是最容易骗过 `git diff` 审阅的那种漂移。

`src/host/bundle.ts:23` 这一条要当心：文件里 `:12` 还有一行
`export type SourceKind = 'registry' | 'path' | ...`，它是**类型别名**，不是函数。
用 `grep sourceKind` 这类默认不区分大小写的工具去找时，`:12` 会先命中，
于是很容易把「函数在哪」错记成 `:12`。判据指向的是**函数** `sourceKind()` @ `:23`，
它返回 `path` 的那条分支在 `:26-28`（`file:` / `link:` / `.` / `/` 前缀）。

## 5 条守护用例（`test/self-row.test.ts`）

| 行 | 用例 |
|---|---|
| 62 | `every spelling of a local path is classified as a path source` |
| 74 | `a path install still shows the published versions, but is not upgradable` |
| 99 | `a path install marks the version it is running as current` |
| 123 | `a path install on a version the registry does not publish marks nothing current` |
| 143 | `a path install whose package is not published says so plainly` |

五条全在 `path` 这一侧。`SELF_NAME` / `batchable` 这一侧**没有专门的用例文件**——
它只是 `Tab.ts` 里的一个 `&&`，改动时靠人读。详见下面「已知缺口」一节。

## 已知缺口：批量排除那一侧没有守卫

`test/self-row.test.ts` 的 5 条全部覆盖 **PluginRow / path 那一侧**（`selfUpdate` 按钮、
`sourceKind === 'path'` 的分类与呈现）。而本条最核心的那一半——**批量升级永不包含本插件
自己**，即 `batchable` 里的 `row.name !== SELF_NAME`——**没有专门的测试文件**。

它现在是 `src/client/components/Tab.ts` 里的一个 `&&`，正确性靠人读。这是本次拆分
如实记录下来的**既有空白**，不是新引入的：把 `!== SELF_NAME` 删掉，5 条用例一条都不会红。

如果哪天要补，「批量升级的列表里不含 `dsh-plugin-upgrader`」是最先该写的一条；
另外「`link:` / `file:` 行不进批次」也同属 `batchable`，值得一并钉住。

## 相关：为什么「自己升级自己」不是 §2 的特例

§2 的 in-place replacement 解决的是「不先卸载就换版本」，前提是**被换的那个插件自己
没有在跑**。本插件自己是例外里的例外：整条 in-place 路径也在这段代码里，
卸载/替换它的动作会把执行者一起带走。所以本节不是 §2 的补充规则，
而是 §2 覆盖不到的那一格。
