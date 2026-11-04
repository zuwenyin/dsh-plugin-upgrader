# 01 GitHub 链接：每行的 `GH` 按钮 + 每个历史版本号上的链接 —— AGENTS.md §1 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 1 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

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

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/registry.ts:35` `ABBREVIATED_ACCEPT` | `src/host/registry.ts:35` | ✅ 一致 |
| `src/host/registry.ts:50` `FULL_ACCEPT` | `src/host/registry.ts:50` | ✅ 一致 |
| `src/host/registry.ts:167` `fetchPackument` | `src/host/registry.ts:253` | ⚠️ 漂移 86 行 |
| `src/host/registry.ts:195` 检测 + 重取合并 | `src/host/registry.ts:281`（`dropsRepositoryFields(data) === true`）、`:285-294`（full-form 重取） | ⚠️ 漂移 86 行 |
| `src/host/registry.ts:233` `dropsRepositoryFields` | `src/host/registry.ts:319` | ⚠️ 漂移 86 行 |
| `src/client/components/PluginRow.ts:179` `GH` 按钮渲染 | `src/client/components/PluginRow.ts:195-206`，`'GH'` 字面量在 `:204` | ⚠️ 漂移 16 行 |
| `src/client/components/VersionLine.ts:36` 版本链接标签与 URL | `src/client/components/VersionLine.ts:36`（`linkLabel` 正是这一行） | ✅ 一致 |

三处 +86 是同一次插入造成的：`ABBREVIATED_ACCEPT`（`:35`）和 `FULL_ACCEPT`（`:50`）没动，
说明第 50 行到第 167 行之间多出了 86 行（`fetchPackument` 上方的缓存 / 超时注释与常量）。

## 符号存在性（2026-11-04 逐条 grep）

| 原文里的符号 | 实际所在 | 结论 |
|---|---|---|
| `normalizeRepoUrl` | `src/host/repo.ts:37` | ✅ 存在 |
| `githubUrlOf` | `src/host/repo.ts:89` | ✅ 存在 |
| `repoUrlOf` | `src/host/repo.ts:112` | ✅ 存在 |
| `releasePathOf` | `src/host/version.ts:406` | ✅ 存在 |
| `tagOf`（`v<version>` 的出处） | `src/host/version.ts:384` | ✅ 存在 |
| `row.repoUrl` | `src/client/types.ts:54`（`repoUrl?: string`） | ✅ 存在 |
| 版本链接解析（原文未点名，实现实体） | `src/client/format.ts:101` `resolveVersionLink` | ✅ 存在 |
| 「历史版本 (n)」入口 | `src/client/components/PluginRow.ts:216`（`${t('history')} (${versions.length})`） | ✅ 存在 |
| 失败原因 + 重试 | `src/client/components/PluginRow.ts:141-159`、文案 `src/client/copy.ts:54` `historyFailed` / `:50` `retry` | ✅ 存在 |

## 守护用例核对（2026-11-04）

| 原文提到的用例 | 实际位置 | 结论 |
|---|---|---|
| `an abbreviated document without repository fields is re-fetched in the full form` | `test/registry.test.ts:44` | ✅ 存在 |
| `a full-document re-fetch that fails keeps the abbreviated document` | `test/registry.test.ts:66` | ✅ 存在 |
| `test/repo.test.ts` | 文件存在 | ✅ |
| `test/version.test.ts` | 文件存在 | ✅ |

## 为什么这条值得单开一页

abbreviated packument 是 registry 的 `install-v1` 格式，它省掉的是**渲染用**的字段，
`repository` / `homepage` / `bugs` 三个键直接不存在。宿主又必须用 abbreviated 格式，
否则 26 MB 的全量文档会在超时里失败（见 `src/host/registry.ts` 里
`PACKUMENT_TIMEOUT_MS` 上方的注释）。于是链接这条路只有两个选择：

1. 只用 abbreviated 文档 → 所有行的 `GH` 按钮和版本链接集体消失，**而版本列表照常显示**，
   界面看起来完全正常，只是少了几个按钮。这就是它退回了很久才被发现的原因。
2. abbreviated + 按需 full-form 重取 → 现在的做法。

`dropsRepositoryFields` 的判定边界是这个方案的支点：只看顶层不够（本来就真的没有仓库的包
会每次请求都付一次重取），只看 latest manifest 也不够（有些包只在老版本里声明过
`repository`）。两种「都不存在」同时成立才算 abbreviated 签名。原文的**不要**改成只看顶层，
说的就是别把这条双条件退化成单条件。
