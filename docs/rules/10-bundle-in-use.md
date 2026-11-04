# 10 `bundle-in-use` 要自己解开 —— AGENTS.md §10 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 10 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 10. `bundle-in-use` 要自己解开

插件读起来是「已禁用」、加载器却仍持有它的 fiber 时，单纯 `removeBundle` 什么都不会做。
此时必须先 `setBundleEnabled(true)` 再 `setBundleEnabled(false)`，让加载器真的放手，
然后重试一次；再失败才报「需要重启」。

**代码：** `src/host/install.ts:177` `removeForReplacement`（`:55` `IN_USE`）、
`:140` `toggle`、`:121` `readsAsEnabled`。

**守护：** `test/install.test.ts`（`a bundle-in-use removal unloads the plugin and retries
once`、`a bundle the manager already reads as disabled is re-selected, then dropped`、
`a removal still refused after the unload says a restart is needed`）。

---

## 为什么这条存在

加载器保留 fiber 的依据不是「插件是否 enabled」，而是**它自己有没有真的 dispose**。
于是存在一个自相矛盾的状态：`listBundles` 报 `enabled: false`，但加载器仍持有这个插件的
fiber，`removeBundle` 于是返回 `bundle-in-use` 并**什么都不做**——不报错、不卸载、不改状态。

对用户的表现是「点了升级，进度条走到一半没动静」，日志里只有一句读不懂的
`bundle-in-use`。而 manager 读到的 `enabled: false` 会让人误判成「已经关掉了，
那应该能卸」，于是**不会**去动它——这正是这个 bug 能长期存在的原因：
两个信息来源（manager 的 enabled 标记 / 加载器的 fiber 持有）互相矛盾时，
只信前一个就永远解不开。

解扣的办法是**制造一次真实的状态变化**：先 `true` 再 `false`。只改 `enabled` 标记不会
触发加载器；只有一次「启用 → 禁用」的翻转会让加载器真的走 dispose，把 fiber 放掉。
之后再 `removeBundle` 一次就能成功。

## 实现：`removeForReplacement` 的四条分支

`src/host/install.ts:242` `removeForReplacement(manager, name, log)`：

1. `:250` 第一次 `manager.removeBundle(name)`。返回值和抛出的错误都接住
   （`:254` `codeOf(first) ?? codeOf(thrown)`）——某些 manager 抛错，某些返回错误对象，
   两种都要认。
2. `:255` 不是 `IN_USE` → 原样返回 / 原样抛出，**不做任何额外动作**。
3. 是 `IN_USE` → `:259` 读一次 `readsAsEnabled`：
   - `enabled === false`（`:261`）：manager 认为它已经关着，再 `toggle(false)` 是空操作。
     所以先 `toggle(true)`（`:263`），再 `toggle(false)`（`:267`）——**这一对才是解扣**。
     重选失败时 `:265` 记 `could not re-select`，且**不再**要求关下去（`:268` 的
     `return` 在 `if (reselect !== undefined)` 里）——因为重新选中都没成功，
     再说「关掉它」没有意义。
   - 否则（`:272`）：直接 `toggle(false)`（`:273`）让加载器放手。
4. `:282` 重试一次 `manager.removeBundle(name)`。仍不是 `IN_USE` 就返回/抛出；
   还是 `IN_USE` → `:291` 记 `is still loaded after unloading; it needs a restart`，
   `:292` 的 `restartHint(enabled)` 给出「需要重启」的诊断，两种失败形状
   （返回 / 抛出）都保留 manager 自己的 code 并附上 `detail`（`:297`）。

「再失败才报『需要重启』」这句在代码里就是第 4 步——**只有第二次尝试仍然
`bundle-in-use`** 才走到这句；第一次 `bundle-in-use` 一律先试着解扣。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/install.ts:177` `removeForReplacement` | `src/host/install.ts:242` | ⚠️ 漂移（+65 行） |
| `:55` `IN_USE` | `src/host/install.ts:58`（`const IN_USE = 'bundle-in-use'`） | ⚠️ 漂移（+3 行） |
| `:140` `toggle` | `src/host/install.ts:205` | ⚠️ 漂移（+65 行） |
| `:121` `readsAsEnabled` | `src/host/install.ts:134` | ⚠️ 漂移（+13 行） |
| `test/install.test.ts` 三条用例 | `:190`、`:206`、`:272` | ✅ 一致（原文未给行号） |

`removeForReplacement` 与 `toggle` 都漂了 +65 行，但 `IN_USE` 只漂了 +3、`readsAsEnabled`
只漂了 +13——**同一个文件里三种偏移量**。原文把四个引用写成一组，看起来像能用同一个
「加多少」去修，实际不行。这是「原文行号一律换成符号」最直接的证据。

`src/host/install.ts:177` 现在指向的是 `installedVersion`（给 `removeForReplacement`
做回滚依据的那个函数），`:205` 才是 `toggle`——两处都在同一段代码附近，
`grep` 一眼看不出错。

## 三条守护用例（`test/install.test.ts`）

| 行 | 用例 | 钉什么 |
|---|---|---|
| 190 | `a bundle-in-use removal unloads the plugin and retries once` | 解扣 + 重试（断言日志里有 `still loaded`） |
| 206 | `a bundle the manager already reads as disabled is re-selected, then dropped` | 读起来已禁用时**仍要**先 `true` 再 `false` |
| 272 | `a removal still refused after the unload says a restart is needed` | 第二次仍失败 → 日志说 `needs a restart` |

同文件里另外两条是同一机制的变体，不在原文列举里，但改 `removeForReplacement` 时一起跑：

- `test/install.test.ts:227` `a re-select the manager refuses still gets the removal retry`
  ——重选失败后**仍然**重试一次卸载（断言 `could not re-select`）。
- `test/install.test.ts:244` `a bundle-in-use thrown rather than returned is retried too`
  ——`bundle-in-use` 是**抛出**而不是返回时，走同一条路。

第 244 条尤其重要：`codeOf(thrown)` 那条分支如果被删掉，
「抛错」这种形状会直接漏出去，而真实 manager 两种都会出现。

## 与 §2 / §21 的关系

- `removeForReplacement` 是 §2 的**回退路径**（in-place 失败之后才走到这里），
  也是 §20 回滚路径的起点。
- §21 的 `recover()` 处理的是「卸载之后又失败」，本节处理的是「卸载本身卸不掉」。
  两者的分界在 `removeForReplacement` 的返回值上：它成功返回，才轮得到 §21。

改这一条时，`test/install.test.ts` 里这三条与 `test/install.test.ts:227`、`:244`
五条要一起看——它们覆盖了「返回 / 抛出」×「已禁用 / 仍启用」这几个组合。
