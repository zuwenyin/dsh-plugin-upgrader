# 06 镜像落后要让用户看见 —— AGENTS.md §6 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 6 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

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

## 为什么这条存在

镜像（`registry.npmmirror.com` 这类）落后于 npm 时，**它自己的文档里没有任何痕迹**：
不报错、不标记「未同步」，只是那个版本号不在 `versions` 里。于是三种症状叠在一起，
用户看到的是「已经是最新版」，而实际上 `pnpm add pkg@x.y.z` 会直接
`ERR_PNPM_NO_MATCHING_VERSION`——而且这个错会让**同一批里无关的包一起失败**
（一次 job 是一个 pnpm 事务），所以它不只是「少一个按钮」。

反过来的坑是修法本身：上游读不到时如果按「查不到的版本都算缺口」处理，就会把
所有版本都标成「可装但镜像没有」，等于把一个网络抖动变成一屏红字。原文那句
「读不到上游 → 报告『没有缺口』」就是钉这个方向的：**沉默 ≠ 缺失**，
两边的失败都要按「少说」而不是「多说」处理。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/registry.ts:376` `versionsMissingFromMirror` | `src/host/registry.ts:462` | ⚠️ 漂移（-86 行） |
| `src/host/registry.ts:352` `UPSTREAM_REGISTRY` | `src/host/registry.ts:438` | ⚠️ 漂移（-86 行） |
| `src/host/overview.ts:236` 调用并写入 `row.mirrorMissing` | 调用 `src/host/overview.ts:288`；写入在 `:295`（写作 `entry.mirrorMissing = missing`） | ⚠️ 漂移 |
| `src/client/components/PluginRow.ts:113` 渲染 | `src/client/components/PluginRow.ts:113` | ✅ 一致 |
| `src/client/copy.ts:55` `mirrorBehind` | `src/client/copy.ts:55` | ✅ 一致 |
| `test/mirror-gap.test.ts`（5 条） | 5 个 `test(...)` | ✅ 一致 |

`row.mirrorMissing` 这个名字在实现里其实是 `entry.mirrorMissing`（循环里的局部变量叫
`entry`，`row` 是它的对外类型名 `OverviewRow`）。字段本身在
`src/host/overview.ts:95`（`OverviewRow`）与 `src/client/types.ts:61`（客户端类型）各声明一次。

## 五个守护用例（`test/mirror-gap.test.ts`）

| 行 | 用例 |
|---|---|
| 30 | `versions the mirror lacks are reported, newest first` |
| 49 | `nothing is reported when the profile already uses the upstream registry` |
| 73 | `versions at or below what is installed are never reported` |
| 94 | `an unreadable upstream is reported as no gap, not as every version missing` |
| 113 | `a mirror that is current reports nothing` |

第 94 条就是「读不到上游 → 没有缺口」那句禁令的守卫，改成「全部缺失」它必须红。

## 补记：原文没写但同属一条链的东西

- `versionsMissingFromMirror` 的第一道闸就是源判定：
  `if (base.replace(/\/+$/, '') === UPSTREAM_REGISTRY) return []`
  （`src/host/registry.ts:470`）——尾斜杠要先剥掉再比，否则 `https://registry.npmjs.org/`
  会被当成「镜像」，白问一次上游。
- 上游 packument 走的是同一个 `fetchPackument`（`src/host/registry.ts:473`，
  带 `force`），所以缓存和 full-form 重取的语义与 §1 是同一套，不需要另写一条读法。
- 渲染端 `src/client/components/PluginRow.ts:113` 处只显示前 3 个版本，
  超出部分以 `…` 结尾（`:120-121`）；`title` 属性里给全量。
