# 04 升级完不能把页面 reload 进一个已经不存在的 boot 文档 —— AGENTS.md §4 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 4 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 4. 升级完不能把页面 reload 进一个已经不存在的 boot 文档

**不可退化。** 这是 `web boot: 3 entries did not activate` 那个启动崩溃框的修复（1.3.0）。

桌面壳只在宿主启动时快照一次注入表，里面的 batch URL 带 rev 哈希；宿主只保留
**当前一代 + 上一代**的 batch，更老的 URL 直接 404。一个 404 会毒掉整批，
启动被判失败并弹框。

- 任何因为「主题插件被替换、样式丢了」而触发的 reload，都必须先
  `reloadWhenBootDocumentFresh()`：对每个 batch URL 发 `HEAD`。
- 只有**确定的 404** 才阻止 reload；超时 / 5xx / 拿不到 fetch 都算「说不清」，
  reload 照常进行（否则页面看起来卡死）。
- 被阻止时给用户一句话：重启 DSH 才能完成这次升级。

**代码：** `src/client/boot.ts:126` `reloadWhenBootDocumentFresh`、`:85` `checkBootDocument`；
调用点 `src/client/components/Tab.ts:130`；文案 `src/client/copy.ts:75` `reloadBlocked`。
**不要把 `window.location.reload()` 直接写回来。**

**守护：** `test/boot.test.ts`（13 条）、`test/appearance.test.ts`（4 条）。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/client/boot.ts:126` `reloadWhenBootDocumentFresh` | `src/client/boot.ts:126` | ✅ 一致 |
| `src/client/boot.ts:85` `checkBootDocument` | `src/client/boot.ts:85` | ✅ 一致 |
| `src/client/components/Tab.ts:130` 调用点 | `src/client/components/Tab.ts:171` | ⚠️ 漂移 41 行 |
| `src/client/copy.ts:75` `reloadBlocked` | `src/client/copy.ts:98`（中文）、`:245`（英文） | ⚠️ 漂移 23 行 |

`boot.ts` 两处**完全没漂**，说明这个文件自我写完就没被别的东西挤动过；
漂移全发生在调用方和文案表里，那两处本来就是最容易长出新条目的地方。

## 符号存在性（2026-11-04 逐条 grep）

| 原文里的符号 | 实际所在 | 结论 |
|---|---|---|
| `reloadWhenBootDocumentFresh` | `src/client/boot.ts:126` | ✅ 存在 |
| `checkBootDocument` | `src/client/boot.ts:85` | ✅ 存在 |
| `reloadBlocked` | `src/client/copy.ts:98` / `:245` | ✅ 存在（zh + en 两份都有） |
| `HEAD`（探测方法） | `src/client/boot.ts:105`（`{ method: 'HEAD', cache: 'no-store' }`） | ✅ 存在 |
| `window.location.reload()`（被禁止的写法） | 全仓库 `src/client/**` 无直接调用；唯一入口是 `boot.ts:141-147` 里的 `page.location.reload()` | ✅ 现在没有裸调用 |
| `BootFreshness`（三态判定） | `src/client/boot.ts:29`（`'fresh' \| 'stale' \| 'unknown'`） | ✅ 存在 |

## 守护用例核对（2026-11-04）

| 原文提到的 | 实际条数 | 结论 |
|---|---|---|
| `test/boot.test.ts`（13 条） | 13 条（`^test(` 计数） | ✅ 条数一致 |
| `test/appearance.test.ts`（4 条） | 4 条 | ✅ 条数一致 |

`test/boot.test.ts` 与三态判定逐条对应，值得记下来的几条：
`:66` `a single batch answering 404 means the document is gone`、
`:82` / `:92` `an unclear answer settles nothing, so the reload is allowed`、
`:110` `a refused request proves nothing either`、
`:120` `without a fetch the answer is unknown and the reload still goes ahead`、
`:128` `the reload is skipped and reported when the document is stale`。
「只有 404 阻止 reload」这条判据在测试里被拆成四种「说不清」分别钉了一遍。

## 为什么「说不清就照常 reload」

这是这一条里唯一一处「宁可冒险」的地方，理由被写在 `src/client/boot.ts:74-78`：

> Any other answer — a refused socket, a 500 — proves nothing either way, and a page that
> refuses to reload on an unclear answer would look hung; only a definite 404 blocks the reload.

也就是说两种错误代价不对称：

- **误判成 stale**（该 reload 却拦住了）：页面停在旧样式上，用户看到「重启 DSH」的提示，
  能自己恢复，代价可见。
- **误判成 fresh**（不该 reload 却 reload 了）：页面 reload 进一个 404 的 batch，
  整批条目不激活，弹 `web boot: N entries did not activate`，页面直接起不来。

所以要拦，但只在**证据充分**时拦。「拿不到 fetch」「超时」「5xx」都不构成证据——
它们同样可能只是网络抖动。判据是 `checkBootDocument` 的三态返回值（`fresh` / `stale` /
`unknown`），只有 `stale` 走 `onBlocked`。

## 被阻止时那句话说在哪

`src/client/components/Tab.ts:171-182` 的 `onBlocked` 做两件事：切横幅文案到
`t('reloadBlocked')`，并 `setRestartPending(true)`。后者是 §16 的入口——
「重启 DSH」按钮由 `restartPending` 决定，所以这条提示不是一句死话，它把用户送到
一个能完成重启的地方。改这里时两件事都要保：**文案要出现，重启入口也要出现**，
只切文案不加 `setRestartPending` 会变成用户读完仍然不知道下一步做什么。
