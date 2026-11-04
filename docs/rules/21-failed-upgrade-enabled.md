# 21 失败的升级不许把「关着的插件」打开 —— AGENTS.md §21 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 21 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 21. 失败的升级不许把「关着的插件」打开

**不可退化。** PR #2（HootRock）修的真实问题：一个用户把某个插件关掉、点了升级，
升级失败，插件却**变成启用**了。用户没有要求它跑，一次失败的操作反而改了它的运行状态。

根因不在安装本身，在恢复路径。`recover()` 面对「包还在盘上、但被取消了选中」时
只有一个动作：`restoreSelection()`，而它的名字是准确的、行为是写死的——它**只会**
`setBundleEnabled(name, true)`。取消选中是 `removeBundle` 干的（换版本必须先卸载），
所以失败的步骤必然经过这个窗口；成功路径上那句 `restoreEnabledState(..., step.enabled)`
（`src/host/install.ts:778`）在失败时被 `installed` 判断跳过，于是这个窗口里
**唯一**的修复动作就是「打开它」。

- **恢复要按「这一步想要什么」修，不是按「盘上有什么」修。** 包还在盘上只说明不用重装，
  说明不了它该不该跑。`step.enabled === false`（用户明确要求关着）时走
  `restoreEnabledState(manager, step, false, log)`，它按目标状态对齐：读到已经关着就
  什么都不做，读到还开着就关下去。
- **`undefined` 仍然等于「保持加载」。** 只在**明确** `=== false` 时改走另一条路：
  没带这个字段的调用方（老客户端、脚本）没有表达「请关掉它」，把它们当成「关」会把
  一次失败变成一次停用。这与 `src/host/install.ts:633` 用 `typeof step.enabled === 'boolean'`
  决定要不要把 `enabled` 传给 manager 是同一条约定。
- **两条路都要留着。** `restoreSelection` 的日志
  `re-select <name> (a failed replacement must not leave it unloaded)` 是「为什么又把它选回来」
  的唯一说明；把它合并成一句 `restoreEnabledState(..., step.enabled ?? true, ...)` 会让
  这句话消失，`test/install.test.ts` 的三条老用例（`:371`、`:401`、`:646`）也会一起失效。
  合并不是错，但那样就没人解释「包本来就在，为什么还要动它」了。
- **两条失败形状都要覆盖。** manager 返回错误（`result.error`）和 `installBundle` 直接
  抛出（pnpm 死掉）走的是同一个 `recover()`，所以修复对两者同时生效；只测其中一种，
  另一种回归时看不出来。
- **in-place 路径从来不受影响。** `replaceWithoutRemoval` 成功时在
  `src/host/install.ts:575` 用的是 `restoreEnabledState(..., options.enabled)`，本来就是
  按目标状态对齐的。这个 bug 只住在「卸载之后又失败」这一条路上。

**代码：** `src/host/install.ts:473` `recover`（`:490` 的分支）、`:316` `restoreEnabledState`、
`:363` `restoreSelection`、`:633` `restoreEnabled` 的取值、`:778` 成功路径的恢复。

**守护：** `test/install.test.ts` 的五条 —— `a failed upgrade leaves a plugin that was
switched off switched off`（断言 `calls.enable` 为空且日志里没有 `re-select`）、
`a thrown install after the removal keeps that state too`、`a failed upgrade switches off
a plugin the manager reports as loaded`（断言 `{ name: 'pkg', enabled: false }`，即目标状态
优先于当前状态）、`a failed upgrade still puts back a plugin the step wanted loaded`、
`a failed upgrade does not toggle a plugin that is already on`。把 `recover` 里那行改回
无条件 `restoreSelection` 时前三条必须红；把分支改成
`restoreEnabledState(..., step.enabled, ...)`（丢掉 `undefined` 的旧语义）时上面三条老的
`re-select` 用例必须红（两者都实测过）。

## 行号校对（2026-11-04）

§21 是四条里唯一**原文带行号**的。逐行核对如下 —— 全部还在原位，无漂移。

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/install.ts:778` 成功路径的 `restoreEnabledState(..., step.enabled)` | `src/host/install.ts:778` `const enabled = installed ? await restoreEnabledState(manager, step, restoreEnabled, log) : undefined` | ✅一致 |
| `src/host/install.ts:473` `recover` | `src/host/install.ts:473` `async function recover(` | ✅一致 |
| `:490` 的分支 | `src/host/install.ts:490` `if (step.enabled === false) await restoreEnabledState(manager, step, false, log)`；`:491` `else await restoreSelection(manager, step.name, log)` | ✅一致 |
| `:316` `restoreEnabledState` | `src/host/install.ts:316` `export async function restoreEnabledState(` | ✅一致 |
| `:363` `restoreSelection` | `src/host/install.ts:363` `export async function restoreSelection(`；日志在 `:379` `re-select ${name} (a failed replacement must not leave it unloaded)` | ✅一致 |
| `:633` `restoreEnabled` 的取值 | `src/host/install.ts:633` `const restoreEnabled = typeof step.enabled === 'boolean' ? step.enabled : undefined` | ✅一致 |
| `:575` in-place 路径的 `restoreEnabledState(..., options.enabled)` | `src/host/install.ts:575` `const enabled = await restoreEnabledState(manager, step, options.enabled as boolean \| undefined, log)` | ✅一致 |
| 老用例 `test/install.test.ts:371` | `test/install.test.ts:371` `a re-install that fails puts the selection back` | ✅一致 |
| 老用例 `test/install.test.ts:401` | `test/install.test.ts:401` `a refused re-install also puts the selection back` | ✅一致 |
| 老用例 `test/install.test.ts:646` | `test/install.test.ts:646` `a package still on disk is re-selected instead of reinstalled` | ✅一致 |
| 守护 `a failed upgrade leaves a plugin that was switched off switched off` | `test/install.test.ts:667` | ✅一致（原文未给行号） |
| 守护 `a thrown install after the removal keeps that state too` | `test/install.test.ts:689` | ✅一致（原文未给行号） |
| 守护 `a failed upgrade switches off a plugin the manager reports as loaded` | `test/install.test.ts:733` | ✅一致（原文未给行号） |
| 守护 `a failed upgrade still puts back a plugin the step wanted loaded` | `test/install.test.ts:704` | ✅一致（原文未给行号） |
| 守护 `a failed upgrade does not toggle a plugin that is already on` | `test/install.test.ts:720` | ✅一致（原文未给行号） |

### 补记

- 「把 `recover` 里那行改回无条件 `restoreSelection` 时前三条必须红」——前三条指 `:667`、
  `:689`、`:733` 那三条新用例。`:733` 之所以也会红，是因为它断言的是
  `{ name: 'pkg', enabled: false }`（关下去），而无条件 `restoreSelection` 只会打开。
- 断言细节：`:667` 的 `calls.enable` 为空在 `test/install.test.ts:685`，日志里没有
  `re-select` 在 `:686`（`assert.doesNotMatch(log.join('\n'), /re-select pkg/)`）。
- 「两条失败形状」在代码里是同一个 `recover()` 的两个调用点：manager 返回错误走
  `result.error`，`installBundle` 抛出走 `catch`；两条最终都进 `recover`，所以修复天然
  对两者同时生效。
