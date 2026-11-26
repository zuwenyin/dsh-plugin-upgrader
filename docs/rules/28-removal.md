# 28 卸载是独立入口 —— AGENTS.md §28 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 28 条；这里是它的详证：为什么不能复用
> `runStep`、两种拒绝怎么区分、以及哪些判据是宿主的。

## 为什么不能复用 `runStep`

`src/host/install.ts` 的 `runStep` 只有一个承诺：**结束时那个版本在盘上**。它为此写满
了「把装坏的东西装回去」的路径：

- `:1021-1022` `const repair = result?.error === undefined ? undefined : await recover(...)`
  —— **只要结果带 error 就恢复**。
- `recover`（`src/host/install.ts:626-652`）两条分支都是恢复：包还在盘上 →
  `restoreSelection` 重新选中；包没了且 `previous` 已知 → `rollBack`
  （`:531-579`，`:543` 的日志是 `roll back: install ${spec} again`）**按旧版本重装**。
- `:723` `const installed = result?.application === 'applied' || ...` + `ok: installed`
  后面还跟着 `restoreEnabledState` —— 卸载成功后它会去改一个已经不存在的包的启用状态。

把 `remove` 塞进 `runStep` 的实际后果：**一个被拒绝的卸载会悄悄把用户刚要求删掉的包
装回来**，而这正是「卸载」最不能出的错。所以 `removeStep` 是第二个、更小的入口，只有
一条规则：要么删掉，要么说清为什么没删。它永远不安装任何东西。

## 复用到的部分

只复用 `removeForReplacement`（`src/host/install.ts:358-420`）—— 它已经实现了
§10 的 `bundle-in-use` 自解：读起来 disabled 就先 `setBundleEnabled(true)` 再
`setBundleEnabled(false)`，否则直接 `setBundleEnabled(false)`，然后重试一次。
第 4 个参数 `verb: 'upgrade' | 'remove' = 'upgrade'` 只影响 `restartHint` 的措辞：
卸载失败之后再说「重启 DSH 后再升级」是把话说反了。

**不碰** `recover` / `repairOutcome` / `restoreEnabledState` / `restoreSelection`，
也不碰 §22/§23 的 manifest 锁与 journal：`removeBundle` 本身就是管理器真实的卸载入口，
in-place 替换的 manifest 补丁机制与纯卸载无关。

## 两种拒绝，两种说法

宿主 `removeBundle`（`@deepseek-ai/dsh-plugin-manager` 的 `lib/index.js:2137-2164`）
按顺序给出这些码，**在动 pnpm 之前**：

| 码 | 什么情况 | 说什么 |
|---|---|---|
| `not-removable` | `bundle.removable !== true`：内置插件，或带 `readOnlyReason` 的行 | 逐字给出 `readOnlyReason` |
| `stop-profile` | 宿主没有 hmr，且这个包由 profile 启动（或有活 fiber） | `STOP_PROFILE_HINT`：去 DSH 自带的「已安装」页卸载 |
| `bundle-in-use` | deselect + reload 之后加载器仍持有 fiber | `restartHint(enabled, 'remove')`：重启 DSH 后再卸载 |

三者不能合并成一句：`bundle-in-use` 重启能解，`stop-profile` **重启也解不开**
（同一份 profile 会把它再拉起来），把它归成「重启后再试」是把人送进死循环。

## `removable` 是宿主的答案，不是我们的

`src/host/overview.ts:232` 已经把它透传到每一行（`removable: bundle.removable === true`）。
`removeStep` 在动 pnpm 之前再读一次宿主的 `removable`：**它是唯一权威**，自己再推一遍
（内置？被其它层拥有？）只会推漂。客户端的勾选也只看这个字段。

同一个字段还顺手兜住了一个原本靠巧合成立的行为：`removable: false` 的行过去是因为
`managed === false` → `versionError` 早退 → `upgradable` 停在 false → 复选框不出现，
**才**没被批量动作碰到。勾选条件一旦换成「可升级或可卸载」，那层巧合就没了，所以
客户端勾选、`pickAll`、`removeStep` 三处都要显式认 `removable`。

## 自己永不出现在卸载批次里

与 §9 同源、理由更硬：批量升级排除自己是因为会卸掉正在跑的代码；批量**卸载**排除自己
是因为那会把跑这批任务的代码删掉——任务永远收不了尾。`SELF_NAME` 在
`src/client/components/Tab.ts:43`，三处过滤（`upgradable` / `removable` / `actionable`）
都必须带上它。

## 守护

`test/remove-step.test.ts`（13 条）：

| 用例 | 钉什么 |
|---|---|
| `a removal takes the package away and installs nothing` | `calls.install` 必须是空数组 |
| `a removal step carries no version` | `version: ''`、`spec === name` |
| `a bundle the manager will not give up is reported, not removed` | `not-removable` 在 pnpm 之前拦住 |
| `a bundle the loader still holds is unloaded and retried` | §10 自解仍然生效 |
| `a bundle that already reads as disabled is reselected before unloading` | 读起来 disabled 仍要先 `true` 再 `false` |
| `a refusal that survives the retry says to restart, in the right verb` | 诊断里是「卸载」不是「升级」 |
| `a bundle the profile starts is refused with its own advice` | `stop-profile` ≠ `bundle-in-use` |
| `a failed removal is never reported as a successful install` | `ok: false`、`application: 'failed'` |
| `a thrown failure is caught and reported` | 抛出路径也收成 `operation-error` |
| `the log names the package rather than an install spec` | 日志是 `remove <name>`，不是 install spec |
| `validateStep lets a removal through without a version` | `'remove'` 不要求 version |
| `validateStep still refuses an install step with no version` | 豁免不许漏给 install 动词 |

「真的会红吗」核对（2026-11-26 实跑两次，都已改回）：

- 把 `removeStep` 内部改成 `await runStep(manager, { name, version: '1.0.0' }, log)`：
  13 条里 **9 条变红**（`pass 4`），其中包括 `a removal takes the package away and
  installs nothing` —— `runStep` 确实把包又装了回去。
- 把 `bundleOf` 之后的 `entry.removable !== true` 反转成 `entry.removable === true`：
  **10 条变红**，`not-removable` 那条首当其冲。
- 两次改回后 `pass 13 / fail 0`。所以这些用例守的是真行为，不是摆设。

## 行号校对（2026-11-26）

| 引用 | 实际位置 |
|---|---|
| `src/host/install.ts` `ACTIONS` | `:80`（`['upgrade','switch','remove']`） |
| `restartHint(enabled, verb)` | `:214-226` |
| `STOP_PROFILE_HINT` | `:235-238` |
| `removeForReplacement(..., verb)` | `:358-420` |
| `removeStep` | `:1125-1210` |
| `detailOf` | `:1217-1224` |
| `validateStep` | `:1235-1245` |
| `src/index.ts` 分派 | `:382`、`:401` |
| `src/client/components/Tab.ts` 过滤与选择条 | `:381`、`:389`、`:496`、`:693` |

宿主的 `removeBundle` 在 `node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js:2137-2164`，
行号随依赖版本漂移，读的时候按符号 `removeBundle(` 找。
