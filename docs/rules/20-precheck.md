# 20 宿主会拒的版本，一个字节都不许写下去 —— AGENTS.md §20 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 20 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 20. 宿主会拒的版本，一个字节都不许写下去

**不可退化。** 1.7.0 修的真实事故：用户把 `@smalltailqwq/dsh-client-ui-skin-maid-atelier`
从 `0.1.9` 切到 `0.1.5`。宿主拒绝(`incompatible-version`)，但拒绝发生在 pnpm 改完锁文件
**之后**，而回退路径早已把 `0.1.9` 真删掉了。结果：插件从 profile 里消失，
`cordis.patch.yml` 只剩一行悬空的 `- id:`。

- **闸门在最后，所以必须提前问一次。** `runStep` 现在用 `InstallGuard` 在**动手之前**
  读目标版本声明的 DSH 范围，不满足就返回 `incompatible-version`（`detail` 带原文范围），
  pnpm 一次都不跑。**不要**把这一步挪到 install 之后当「事后校验」——那时包已经没了。
- **读不到不等于不兼容。** 拿不到运行时版本、拿不到 packument、manifest 没有 DSH 范围，
  一律放行，由宿主闸门做最终裁决。在「读不懂」上拒绝会拦掉所有早于这个字段的插件。
- **回滚要分清两种破坏。** 装机失败后发现包还在盘上，只 re-select 就够；包已经没了，
  re-select 什么也选不回来——必须 `installBundle(名字@旧版本)` 把文件装回来。把两种情况
  混为一谈，就是「升级失败」等于「插件消失」的直接原因。
- **旧版本必须在动手前读。** `removeForReplacement` 跑完，`listBundles` 就没有版本可报了；
  `runStep` 开头那句 `const previous = await installedVersion(...)` 是回滚唯一的依据。
- **回滚失败要明说。** 步骤本身已经失败，回滚再失败不能把原因吞掉：
  日志必须写「`pkg@1.0.0` is not installed」并指路去「已安装」页重装。`rolledBack` 只在
  真的装回来时才出现在结果里——**不要**为了让日志好看而无条件填它。

**代码：** `src/host/install.ts` 的 `InstalledGuard` / `runStep` 预检、
`bundleOf` / `installedVersion` / `recover` / `rollBack` / `StepOutcome.rolledBack`；
`src/index.ts` 的 `buildGuard()`；`src/host/registry.ts` 的 `dshRequirementOf`；
`src/host/runtime.ts` 的 `runtimeVersionOf`。

**守护：** `test/install.test.ts` 的五条 —— `a version the host would refuse is never
installed at all`（断言 `calls.install` 与 `calls.remove` 都为空）、`a version that fits
the running host still installs`、`an unknown requirement is not treated as a refusal`、
`a package the manager destroyed is put back at its old version`（断言第三次 install 是
`pkg@1.0.0` 且 `outcome.rolledBack === '1.0.0'`）、`a package still on disk is re-selected
instead of reinstalled`（断言没有第三次 install）、`a rollback that is refused says so
instead of pretending`。把预检条件改成 `&& false` 时第一条必须红；把 `recover` 里的
回滚分支删掉时后两条必须红（两者都实测过）。

## 行号校对（2026-11-04）

⚠️ **原文有一处事实错误，已在本页确认并修正：`InstalledGuard` 这个符号不存在。**

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/install.ts` 的 `InstalledGuard` | `src/host/install.ts:189` `export interface InstallGuard` | ⚠️**错误**：全仓库 grep `InstalledGuard` 零命中；真实声明是 `InstallGuard`。已在新 AGENTS.md 的 §20 片段里改为 `InstallGuard` |
| `runStep` 预检 | `src/host/install.ts:616` `export async function runStep(...)`；`:622` 形参 `guard?: InstallGuard`；`:645` `guard.requirementOf(...)`；`:647` `satisfiesRange(guard.runtimeVersion, requirement.range)`；`:651-656` 返回 `application: 'failed'` 的预检分支 | ✅一致（原文未给行号） |
| `bundleOf` | `src/host/install.ts:155` `async function bundleOf(manager, name)` | ✅一致（原文未给行号） |
| `installedVersion` | `src/host/install.ts:177` `async function installedVersion(manager, name)`；调用点 `:681` `const previous = await installedVersion(manager, step.name)` | ✅一致（原文未给行号） |
| `recover` | `src/host/install.ts:473` `async function recover(...)`；回滚分支在 `:498` `return rollBack(...)` | ✅一致（原文未给行号） |
| `rollBack` | `src/host/install.ts:414` `async function rollBack(...)` | ✅一致（原文未给行号） |
| `StepOutcome.rolledBack` | `src/host/install.ts:29` `export interface StepOutcome`；`:45` `rolledBack?: string`；赋值只在 `:764` 与 `:783` 两处（`back` / `restored` 为真时） | ✅一致（原文未给行号） |
| `src/index.ts` 的 `buildGuard()` | `src/index.ts:291` `const buildGuard = (): InstallGuard \| undefined => {`；使用点 `:349` | ✅一致（原文未给行号） |
| `src/host/registry.ts` 的 `dshRequirementOf` | `src/host/registry.ts:110` `export function dshRequirementOf(...)` | ✅一致（原文未给行号） |
| `src/host/runtime.ts` 的 `runtimeVersionOf` | `src/host/runtime.ts:104` `export function runtimeVersionOf(argv)` | ✅一致（原文未给行号） |
| 守护 `a version the host would refuse is never installed at all` | `test/install.test.ts:549` | ✅一致 |
| 守护 `a version that fits the running host still installs` | `test/install.test.ts:571` | ✅一致 |
| 守护 `an unknown requirement is not treated as a refusal` | `test/install.test.ts:583` | ✅一致 |
| 守护 `a package the manager destroyed is put back at its old version` | `test/install.test.ts:599` | ✅一致 |
| 守护 `a package still on disk is re-selected instead of reinstalled` | `test/install.test.ts:646` | ✅一致 |
| 守护 `a rollback that is refused says so instead of pretending` | `test/install.test.ts:753` | ✅一致 |

### 补记

- 原文说「五条」，实际列了六条用例。六条都在，没有缺；数字是笔误，原文一字未改，在此备注。
- 预检的「读不到就放行」在代码里是两条独立的短路：`guard === undefined`（`:645`）与
  `guard?.runtimeVersion === undefined`（`:646`）。任何人想把它改成「读不到就拒绝」，
  要同时动这两处才不会漏。
- 「`pkg@1.0.0` is not installed」这句日志在 `src/host/install.ts:432-433`（`rollback refused`
  分支，后半句是 `install it again from the Installed tab`）与 `:442`（`rollback failed`
  分支）。两条都写了「装不回来」并指路去「已安装」页，与原文一致。
