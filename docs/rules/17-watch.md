# 17 一次没答上来不等于宿主重启了 —— AGENTS.md §17 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 17 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 17. 一次没答上来不等于宿主重启了

**不可退化。** 1.6.3 修的真实回退：用户只是正常升级一个插件，升级**成功了**，页面却报
「升级进度已失去联系（宿主可能重启过）」。

- **根因不是重启，是轮询太脆。** `watchJob` 原来第一行命令就是「一次拿不到 → `return undefined`」，
  而 `Tab.watch` 把 `settled === undefined` 读成「宿主重启 / 请求失败」并打 `lostJob`。
  宿主是单线程的，pnpm 安装期间事件循环被占住，一次轮询超时或拿到 5xx 完全是正常现象。
- **`fetch` 本身的 reject 以前直接逃出循环**（keep-alive socket 在长时间安装里被关掉），
  这比拿到错误响应更常见，后果一样：整批被判失联。现在是 `.catch(() => undefined)`。
- **判据是「连续」不是「累计」**：`WATCH_MISS_LIMIT = 4`（`src/client/api.ts`），
  中间只要成功一次就清零（`missed = 0`）。800ms 一轮 ≈ 3 秒真正的静默才放弃。
  不要改成累计计数——安装中途偶发卡顿会慢慢攒出一张假失联。
- **测试必须能红**：`test/watch.test.ts` 把 limit 改成 `1` 会有 3 条变红（已实测）。
  其中「一次失败不判失联」直接把 `fetch` 抛错当第一次——那是用户那次真实故障的形状。
- `delay` 是 `WatchOptions` 的可选注入项（测试传 `nowait`），不要为了测试把它们
  改成真实的 `setTimeout`，否则这条用例要跑十几秒。

**代码：** `src/client/api.ts` 的 `WATCH_MISS_LIMIT` / `watchJob`、
`src/client/components/Tab.ts:123` 的 `lostJob` 分支。

**守护：** `test/watch.test.ts`（4 条：一次失败仍能跑完、持续静默到上限才放弃、
中间的成功能清零、tab 卸载立刻停）。

---

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/client/api.ts` `WATCH_MISS_LIMIT = 4` | `src/client/api.ts:116` `export const WATCH_MISS_LIMIT = 4` | ✅ 一致（原文未写行号） |
| `src/client/api.ts` `watchJob` | `src/client/api.ts:125` `export async function watchJob(id, options)` | ✅ 符号在 |
| `missed = 0`（成功一次清零） | `src/client/api.ts:151` `missed = 0` | ✅ 一致 |
| `.catch(() => undefined)` | `src/client/api.ts:138` | ✅ 一致 |
| `missed >= WATCH_MISS_LIMIT` 才放弃 | `src/client/api.ts:146` | ✅ 一致 |
| `Tab.ts:123` `lostJob` 分支 | `src/client/components/Tab.ts:123` `if (settled === undefined) {`；`setBanner({ tone: 'warn', text: t('lostJob') })` 在 `:125` | ⚠️ 行号一致，但准确说是 `:123–126` 这段分支；`lostJob` 文案本身在 `:125` |
| `src/client/api.ts` `WatchOptions` | `src/client/api.ts:98`、`delay` 在 `:104` | ✅ 符号在 |
| 「800ms 一轮」 | `src/client/api.ts:18` `export const POLL_MS = 800` | ✅ 一致（原文未点名常量） |

**结论：§17 唯一的行号引用 `Tab.ts:123` 仍然落在正确分支上**，没有漂移。
只是它指向的是分支开头，`lostJob` 这条文案在 `:125`——都在这三行之内。

### 守卫的条数复核

| 文件 | AGENTS.md 写的 | 实际 | 结论 |
|---|---|---|---|
| `test/watch.test.ts` | 4 条 | 4 条 | ✅ |

四条用例名与原文点名的四种情形一一对应：
`one failed poll does not lose a batch that is still running`、
`a host that stays silent ends the watch after the miss limit`、
`a good poll in between resets the miss count`、
`an unmounted tab stops polling immediately`。
四条都注入 `delay: nowait`（`test/watch.test.ts:18`），所以整套跑完只有毫秒级。

### 「测试必须能红」的复核办法

把 `src/client/api.ts:146` 的 `if (missed >= WATCH_MISS_LIMIT)` 临时改成
`if (missed >= 1)`，重跑 `node --test test/watch.test.ts`：应当有 3 条变红。
其中第一条用例把 `fetch` 抛错当作第一次轮询（`test/watch.test.ts:26`），
正是用户那次真实故障的形状。改回来再跑一次，必须全绿。
