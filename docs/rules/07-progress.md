# 07 慢的时候必须看得见在干什么 —— AGENTS.md §7 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 7 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 7. 慢的时候必须看得见在干什么

**不可退化。** 一次升级可能真的跑几分钟（pnpm 会拿锁文件里每个条目回源核对）。
真实事故：降级 `@linxin666/dsh-pet` 时，面板整整两分钟写着「正在下载并安装」，
而日志里 pnpm 正在逐条核对锁文件（`? Verifying lockfile against supply-chain policies
(91 entries)...`），同一时间还刷着 `[WARN] GET … ETIMEDOUT. Will retry in 1 minute.`。
两个都是假象：**阶段说错了**，**「状态已停止更新」误报了**。

- 阶段：`waiting` → `verifying` → `installing` → `applying` / `cancelling`。
  - `installing` **不代表**「已经过了校验」：manager 是在 pnpm 启动**之前**就上报
    `installing` 的（`dsh-plugin-manager` 先 `announce('installing')` 再 `runPnpm`），
    所以 pnpm 的校验行是在 `installing` 之后才到的，它必须能把阶段改写成 `verifying`。
    1.7.2 之前 `installing` 一旦出现就被钉住，于是整个校验过程都显示成「正在下载并安装」。
  - `applying` / `cancelling` 是 manager 的最后一句话，**不许**被后续日志回退。
  - `verifying` 一直保持到 pnpm 给出结论：`✓ Lockfile passes supply-chain policies` /
    `✗ Lockfile failed supply-chain policy check`。校验期间 pnpm 还会打印重试和进度计数，
    所以中途的普通行**不能**结束它。
  - 开始行和结论行都含 "supply-chain policies"，**只**匹配这个词分不出开始和结论——
    开始行匹配 `/verifying lockfile/i`，结论行匹配 `/lockfile.*passes supply-chain policies/i`
    与 `/lockfile.*failed supply-chain policy check/i`。
  - 纯空白的 chunk 是 keep-alive，不算「有进展」。
- 「还在动」要问**宿主**，不是问 pnpm。pnpm 在重试时一分钟不打印一行是正常的，
  按「日志没变」判定停滞，会在健康升级上误报「状态已停止更新」。
  宿主每 2 秒重新盖一次心跳（`job.heartbeatAt`），面板用心跳判定活性。
- 面板要有：已用时计时、不确定态进度条、阶段文字、慢速提示、日志尾部、状态停滞检测。

**代码：** `src/host/progress.ts:63` `nextPhase`（`:27` `CHECK_STARTED`、`:36` `CHECK_PASSED`、
`:43` `CHECK_FAILED`）、`src/host/progress.ts:16` `Phase`（含 `verifying`）；
宿主心跳 `src/index.ts:92` `HEARTBEAT_MS`、`:326-330` 盖戳、`:437-461` overview 的
`active.heartbeatAt`、`:532-553` `GET job` 的 `heartbeatAt`；
`src/client/types.ts` `JobSnapshot.heartbeatAt`；
`src/client/components/JobPanel.ts` `fingerprint` / `staleness`；
文案 `src/client/copy.ts:60-69`。

**守护：** `test/progress.test.ts`（8 条）、`test/job-panel.test.ts`（5 条）、
`test/job-store.test.ts`（「the batch reports the heartbeat the panel judges liveness by」）。

---

## 事故：两个假象同时发生

降级 `@linxin666/dsh-pet` 那一次，面板两分钟写着「正在下载并安装」，同时报
「状态已停止更新」。两句话都是假的，而且**成因相反**：

1. **阶段说错了。** `plugin-manager` 先 `announce('installing')`、再起 pnpm。
   所以 `installing` 的真实含义是「pnpm 已经开始了」，**不是**「已经过了校验」。
   pnpm 的校验行是在那之后才到的。旧实现在 `nextPhase` 里把 `installing` 当成
   「已经走完前置检查」，一旦出现就钉住，于是 91 个条目的锁文件校验全程被显示成
   「正在下载并安装」——面板在说一个 pnpm 早就离开的阶段。
2. **停滞误报了。** 面板原来的判据是「日志/fingerprint 没变 = 停滞」。
   pnpm 打 `[WARN] GET … ETIMEDOUT. Will retry in 1 minute.` 之后，接下来一分钟
   一个字都不打印是**正常的**；按日志判定，健康升级会被判死。

两个修法的分界线很清楚：**阶段归 pnpm 的日志，活性归宿主的心跳**。
心跳是 `setInterval` 盖的（不是每步结束时补写），因为单次 pnpm 可能跑几分钟而不结束
任何一步——用「步」驱动的心跳会把健康 job 判成 abandoned，还会放进第二个批次。

## 阶段机：`nextPhase` 的判定顺序

`src/host/progress.ts:63` `nextPhase(current, chunk)`，顺序本身就是语义：

1. `applying` / `cancelling` **先短路返回自己**（`:64`）——manager 的最后一句话，
   后面 print 什么都比它更不具体，所以永不回退。
2. **空白 chunk 直接返回 `current ?? 'waiting'`**（`:66`）——keep-alive 不是工作证据。
3. `CHECK_PASSED` → `'installing'`（`:73`）——校验过了，pnpm 在写盘。
4. `CHECK_FAILED` → `'verifying'`（`:78`）——这次校验就是 pnpm 最后真做的事，
   叫它 install 是撒谎。
5. `CHECK_STARTED` → `'verifying'`（`:79`）。
6. `current === 'verifying'` → 仍是 `'verifying'`（`:85`）——校验期间的重试行、进度计数
   都打印在校验**内部**，只有结论能结束它。
7. 其余 → `'installing'`（`:86`）。

注意 `installing` **不在**第 1 步的短路名单里，这是修复的核心：因为它不在，
第 5 步的 `CHECK_STARTED` 才有机会把阶段改写回 `verifying`。把 `installing` 加回
那个名单，1.7.2 的 bug 就原样回来了。

三条正则（`src/host/progress.ts:27` / `:36` / `:43`）：

```ts
const CHECK_STARTED = /verifying lockfile/i
const CHECK_PASSED  = /lockfile.*passes supply-chain policies/i
const CHECK_FAILED  = /lockfile.*failed supply-chain policy check/i
```

为什么不能用 "supply-chain policies" 一个词判定：**开始行也有这五个词**
（`? Verifying lockfile against supply-chain policies (91 entries)...`）。
所以结论必须从它自己的措辞读（`passes` / `failed ... check`），不能从那个短语读。

## 心跳：三段链路

| 位置 | 做什么 |
|---|---|
| `src/index.ts:92` `HEARTBEAT_MS = 2 * 1000` | 心跳节拍，2 秒 |
| `src/index.ts:326` | `runJob` 开头先盖一次 |
| `src/index.ts:328-330` | `setInterval(() => { job.heartbeatAt = Date.now() }, HEARTBEAT_MS)` |
| `src/index.ts:352` | 每步结束后再盖一次（`store.inFlight = null` 之后） |
| `src/index.ts:437-461` | `GET overview` 的 `active.heartbeatAt`（`:458`），新开的标签页据此接管 |
| `src/index.ts:532-553` | `GET job` 的 `heartbeatAt`（`:550`） |
| `src/client/types.ts:128` | `JobSnapshot.heartbeatAt`，注释写明「pnpm 安静时它仍在动」 |
| `src/client/components/JobPanel.ts:66` `fingerprint` | 心跳**是 fingerprint 的一部分** |
| `src/client/components/JobPanel.ts:79` `staleness` | `now - liveness.at > thresholdMs` 才判停滞 |

`fingerprint` 把 `heartbeatAt` 拼进字符串（`:67`），所以只要宿主还在跑，
指纹就在变，`staleness` 就不会触发；宿主真的死了，指纹冻住，`STALE_SNAPSHOT_MS`
（`:43`，20 秒）之后才报「状态已停止更新」。**这就是「问宿主，不问 pnpm」的实现方式**。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/progress.ts:63` `nextPhase` | `src/host/progress.ts:63` | ✅ 一致 |
| `:27` `CHECK_STARTED` | `src/host/progress.ts:27` | ✅ 一致 |
| `:36` `CHECK_PASSED` | `src/host/progress.ts:36` | ✅ 一致 |
| `:43` `CHECK_FAILED` | `src/host/progress.ts:43` | ✅ 一致 |
| `src/host/progress.ts:16` `Phase` | `src/host/progress.ts:16` | ✅ 一致 |
| `src/index.ts:92` `HEARTBEAT_MS` | `src/index.ts:92` | ✅ 一致 |
| `:326-330` 盖戳 | `:326`（首盖）、`:328-330`（`setInterval`） | ✅ 一致 |
| `:437-461` overview 的 `active.heartbeatAt` | `active:` 起于 `:437`，`heartbeatAt: live.heartbeatAt` 在 `:458` | ✅ 一致 |
| `:532-553` `GET job` 的 `heartbeatAt` | `writeJson` 起于 `:532`，`heartbeatAt: job.heartbeatAt` 在 `:550` | ✅ 一致 |
| `src/client/types.ts` `JobSnapshot.heartbeatAt` | `JobSnapshot` 在 `:103`，`heartbeatAt` 在 `:128` | ✅ 一致（原文未给行号） |
| `src/client/components/JobPanel.ts` `fingerprint` / `staleness` | `:66` / `:79` | ✅ 一致（原文未给行号） |
| `src/client/copy.ts:60-69` | 60-69 只到 `phaseWaiting`；`phaseVerifying` 在 `:70`，进度这一组实际是 `:64-75` | ⚠️ 漂移（少一行，`phaseVerifying` 落在范围外） |
| `test/progress.test.ts`（8 条） | 8 个 `test(...)` | ✅ 一致 |
| `test/job-panel.test.ts`（5 条） | 5 个 `test(...)` | ✅ 一致 |
| `test/job-store.test.ts`（心跳用例） | `test/job-store.test.ts:136` | ✅ 一致 |

`copy.ts` 的漂移值得单独记一句：校验阶段的文案恰恰是 `phaseVerifying`（`:70`，
「正在校验依赖锁文件」），也就是这条规则里最要紧的那句，却正好被 `:60-69` 切在外面。
引用时请写 `:65-75`。

## 三个守护文件分别钉什么

`test/progress.test.ts`（8 条，`src/host/progress.ts` 纯函数层）：

| 行 | 用例 |
|---|---|
| 20 | `the first line of output ends the preparing phase` |
| 25 | `a lockfile check is named instead of looking like an idle prepare` |
| 30 | `a check that starts after the manager said installing is still named` ← **1.7.2 的回退守卫** |
| 38 | `the check keeps its name until pnpm gives the verdict` |
| 47 | `a failed check is not dressed up as an install` |
| 53 | `real install work moves the phase on from verifying` |
| 60 | `a blank chunk is a keep-alive, not evidence of work` |
| 66 | `the manager keeps the specific phases it reported`（`applying` / `cancelling` 不回退） |

`test/job-panel.test.ts`（5 条，`fingerprint` / `staleness`）：

| 行 | 用例 |
|---|---|
| 35 | `a host that keeps heartbeating is not stale, even while pnpm is quiet` |
| 50 | `a host that stopped reporting is stale` |
| 60 | `the heartbeat is part of the fingerprint` |
| 66 | `any real progress resets the clock` |
| 75 | `a snapshot without a heartbeat still counts as unchanged` |

`test/job-store.test.ts:136` 那条是端到端的：
`the batch reports the heartbeat the panel judges liveness by` ——走真实路由起一个批次，
断言 `GET job` / `GET overview` 报出来的 `heartbeatAt` 与面板判定用的是同一个值。
它跨了 §19（`globalThis` 上的 JobStore）与本节，改任一侧都要跑它。

## 面板必须有的六件东西

原文最后一句列的六项，落到 `src/client/components/JobPanel.ts`：

- 已用时计时 —— `copy.ts:65` `elapsed`
- 不确定态进度条 —— `copy.ts:64` `progress`
- 阶段文字 —— `copy.ts:66-70` `phaseInstalling` / `phaseApplying` / `phaseCancelling` /
  `phaseWaiting` / `phaseVerifying`
- 慢速提示 —— `copy.ts:72` `slowHint`
- 日志尾部 —— `copy.ts:74` `stalled`、`:75` `staleSnapshot`（两句话是**两种**停滞）
- 状态停滞检测 —— `JobPanel.ts:79` `staleness`

`copy.ts:74`（`stalled`：「这一步已经很久没有输出了」）与 `:75`（`staleSnapshot`：
「状态已停止更新」）容易被合并成一句，但它们是不同判据，合并就等于把本节的事故
重新做成一个说不清的提示。
