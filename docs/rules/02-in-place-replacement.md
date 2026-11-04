# 02 换版本时不先卸载（in-place replacement） —— AGENTS.md §2 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 2 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

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

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/install.ts:436` `runStep` | `src/host/install.ts:627` | ⚠️ 漂移 191 行 |
| `src/host/install.ts:348` `replaceWithoutRemoval` | `src/host/install.ts:526` | ⚠️ 漂移 178 行 |
| `src/host/install.ts:371` 日志 `(in place: no removal, the bundle stays loaded)` | `src/host/install.ts:549` | ⚠️ 漂移 178 行 |
| `src/host/install.ts:478` 日志 `is already declared, so a plain install was refused; the bundle stays loaded` | `src/host/install.ts:710` | ⚠️ 漂移 232 行 |
| `src/host/install.ts:487` 日志 `(in-place replacement declined; replacing an installed dependency)` | `src/host/install.ts:719` | ⚠️ 漂移 232 行 |
| `src/host/install.ts:177` `removeForReplacement` | `src/host/install.ts:242` | ⚠️ 漂移 65 行 |
| `src/host/manifest.ts:69` `profileDirFrom` | `src/host/manifest.ts:89` | ⚠️ 漂移 20 行 |
| `src/host/manifest.ts:86` `profileDirFromCwd` | `src/host/manifest.ts:106` | ⚠️ 漂移 20 行 |

`install.ts:436 → :627` 是这批里漂移最大的一条。另外注意：`install.ts:177` 在原文里指的是
`removeForReplacement`，但今天 `:177` 上确实是另一个函数（`installedVersion`）——**行号还活着，
指向的内容换了**，这是比漂移更危险的一种失效，校对时不能只看行号存不存在。

下面的「两次回退的细节」与「为什么顺序不能重排」两节里的行号已按上表同步。

三处日志的实际文本落在 `install.ts` 的 549 / 710 / 719 行，逐字与原文一致（含括号与逗号），
这说明漂移是纯行号漂移，文本没有被人改过——「三条日志都写明意图」这条仍然成立。

## 符号存在性（2026-11-04 逐条 grep）

| 原文里的符号 | 实际所在 | 结论 |
|---|---|---|
| `already-installed`（manager 的拒绝码） | `src/host/install.ts:703`（`result?.error?.code === 'already-installed'`） | ✅ 存在 |
| `runStep` | `src/host/install.ts:627` | ✅ 存在 |
| `replaceWithoutRemoval` | `src/host/install.ts:526` | ✅ 存在 |
| `removeForReplacement` | `src/host/install.ts:242` | ✅ 存在 |
| `profileDirFrom` | `src/host/manifest.ts:89` | ✅ 存在 |
| `profileDirFromCwd` | `src/host/manifest.ts:106` | ✅ 存在 |
| `DSH_PROFILE_DIR` / `DSH_HOME` / `DSH_PROFILE` | `src/host/manifest.ts:90` / `:92` / `:93`（都在 `profileDirFrom` 体内） | ✅ 存在 |

## 守护用例核对（2026-11-04）

| 原文提到的用例 | 实际位置 | 结论 |
|---|---|---|
| `a replacement installs in place instead of removing first` | `test/install.test.ts:480` | ✅ 存在 |
| `an in-place attempt that fails restores the entry and falls back` | `test/install.test.ts:508` | ✅ 存在 |
| `the log says why the first install did nothing` | `test/install.test.ts:166` | ✅ 存在 |
| `a desktop host with no DSH variables falls back to a cwd that is a profile` | `test/manifest.test.ts:57` | ✅ 存在 |
| `a cwd that is not a profile is never mistaken for one` | `test/manifest.test.ts:68` | ✅ 存在 |

## 两次回退的细节（原文压缩掉的部分）

**第一次（1.2.0 → 1.4.0，实现期）。** 桌面壳用 `cwd: this.projectDir` 起宿主子进程，
并且**不导出** `DSH_PROFILE*` 变量（见 `src/host/manifest.ts:78-83` 的注释原文：
`it spawns the plugin host with cwd: this.projectDir … and no DSH_PROFILE* variables in
the child environment`）。
`profileDirFrom()` 的两个环境变量分支都落空，返回 `undefined`，
`replaceWithoutRemoval` 的第一行就放弃，整条 in-place 路径从 1.2.0 到 1.4.0 从未执行过。
表现为：功能「实现了」，测试「通过了」（测试直接传 cwd），代码「看着是对的」，
日志「没有报错」，只是每一次换版本都老老实实卸载了一遍。

**第二次（观感）。** 即使顺序正确，日志也是 `install` … `install`，中间一片空白。
用户读日志的结论是「先删再装」。修复不是加更多日志，而是让每条日志自己说明意图：
- 第 549 行说 `in place: no removal, the bundle stays loaded`（摘掉条目、原地装新版本）
- 第 710 行说 `is already declared, so a plain install was refused; the bundle stays loaded`（第一次 install 为什么什么都没做）
- 第 719 行说 `in-place replacement declined; replacing an installed dependency`（为什么退回老路径）

三条日志合起来才解释得清「为什么日志里出现了两次 install 而没有一条 remove」。
删掉任何一条，这个解释就断了。

## 为什么顺序不能重排

`installBundle` 对已声明的依赖返回 `already-installed`，**pnpm 根本不会跑**。所以：

- 先 remove 再 install（老路径）→ 插件真的被卸载，加载器里的实例断开，启用状态要恢复，
  而且中途失败就是「插件消失」。
- 先 install（必被拒）→ 从拒绝里学到「需要用 in-place」→ 临时摘条目再 install →
  pnpm 写回新版本，**插件全程没被卸载**。

把第 2 步挪到第 1 步前面（也就是无脑走 in-place），会在本来不该动的 profile 上写 journal；
把第 1 步删掉（直接走 in-place），会失去「本来就能装」这条快路径，且每条都不是
`already-installed` 的失败都被当成 in-place 场景处理。第一步的存在本身就是探针。
