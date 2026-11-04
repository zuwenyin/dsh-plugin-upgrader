# 05 「latest」不能低于已安装的版本 —— AGENTS.md §5 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 5 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

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

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/registry.ts:417` `shapePackument` | `src/host/registry.ts:629` | ⚠️ 漂移 212 行 |
| `src/host/registry.ts:452` 起的 `broken` 分支 | `src/host/registry.ts:669`（`const broken =`，注释在 `:668`）、判定在 `:669-672`、恢复在 `:674-680` | ⚠️ 漂移 217 行 |

`broken` 分支的实际形状（`src/host/registry.ts:668-680`，逐行照抄，含 `:673` 的
`let newest = tagged`）：

```ts
/** A tag below what is already installed is broken, not a release channel. */
const broken =
  tagged !== undefined &&
  installedVersion !== undefined &&
  compareVersions(tagged, installedVersion) < 0
let newest = tagged
if (broken) {
  // Recover the real head of the line: the highest version above the
  // installed one, preferring a stable release over a prerelease.
  const above = rows.filter((row) => compareVersions(row.version, installedVersion as string) > 0)
  const stable = above.find((row) => !row.version.includes('-'))
  newest = (stable ?? above[0])?.version ?? tagged
}
```

## 符号存在性（2026-11-04 逐条 grep）

| 原文里的符号 | 实际所在 | 结论 |
|---|---|---|
| `shapePackument` | `src/host/registry.ts:629` | ✅ 存在 |
| `dist-tags` / `dist-tags.latest` | `src/host/registry.ts:639`（`packument?.['dist-tags']`）、`:643`（`tags.latest`） | ✅ 存在 |
| `broken` | `src/host/registry.ts:669` | ✅ 存在 |
| `staleTag`（坏 tag 的对外标记） | `src/host/registry.ts:693`（写入）、类型声明 `:228` | ✅ 存在 |
| `compareVersions`（排序判定） | `src/host/version.ts:78` | ✅ 存在 |

## 守护用例核对（2026-11-04）

`test/shape-packument.test.ts` 共 6 条（`^test(` 计数），与原文「6 条」一致。
逐条对应的判据：

| 用例 | 行 | 钉住哪条判据 |
|---|---|---|
| `the latest tag is trusted when it is above the installed version` | `:14` | 正常 tag **原样信任** |
| `a prerelease above the latest tag does not steal it` | `:21` | 高于 latest 的 prerelease **不许抢** `latest` |
| `a latest tag below the installed version is rejected as broken` | `:32` | 低于已安装版本 → **坏 tag**，改用更高版本 |
| `recovering from a broken tag prefers a stable release over a prerelease` | `:47` | 恢复时**稳定版优先** |
| `a broken tag with nothing above the installed version keeps the tag` | `:57` | 没有更高版本 → **保留原 tag** |
| `a packument without any versions reports why instead of an empty list` | `:64` | 边界：没有版本时报告原因 |

前五条正好是原文三条判据的正反两面（信任 / 不抢 / 坏 tag / 稳定优先 / 保留原 tag），
第六条是原文没写、但同一函数必须兜住的边界。

## 为什么判据只认「严格低于」

坏 tag 的判定是 `compareVersions(tagged, installedVersion) < 0`，**严格小于**。
等于已安装版本时不是坏 tag：那就是「已经是最新」的正常状态，`newest` 保持 `tagged`，
行上的 `upgradable` 自然为 false。写成 `<=` 会让「已是最新」的包也走一遍恢复分支，
在没有任何更高版本时返回 `undefined`（`above[0]` 为空），进而把 `latest` 抹掉——
那会让所有已最新的包看起来像「没有版本信息」。

第二处细节：恢复时先找 `stable`（`!row.version.includes('-')`），找不到才用 `above[0]`，
最后 `?? tagged` 兜底。三步缺一不可：

- 少了 `stable` 优先 → 有 `1.2.0` 和 `1.3.0-rc.1` 时会推荐 rc，界面上「可升级」指向预发布。
- 少了 `above[0]` → 只有预发布可选时完全放弃恢复。
- 少了 `?? tagged` → 没有更高版本时 `newest` 变 `undefined`，`latest` 从行上消失，
  等于凭空删掉一个 tag。原文那句「不要凭空造一个」的对称面就是「也不要凭空删一个」。
