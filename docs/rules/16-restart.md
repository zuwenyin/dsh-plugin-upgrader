# 16 「需要重启」要给出一条能完成重启的路 —— AGENTS.md §16 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 16 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 16. 「需要重启」要给出一条能完成重启的路，而不是一句话

**不可退化。** 1.6.3 之前，`restart-required` 只换来一句「需要重启 DSH 才会生效」，
用户读完仍然不知道下一步做什么。页面**做不到**重启（桌面壳把 relaunch 放在主进程里，
终端启动的宿主也没人替它拉起），但「做不到」不等于「只能沉默」。

- 横幅上的「重启 DSH」按钮由**结果**决定：`application === 'restart-required'`
  置 `restartPending`，开新批次时清掉。**不要改成看 `banner.tone === 'warn'`**——
  同一个 `warn` 还兼着「这一页没有提供安装入口」和「刷新被拦住了」，只有其中一种
  是重启能解决的（`Tab.ts:98` / `:443`）。
- 对话框按 `kind` 分两种说法：`desktop` → 退出应用再打开；`cli` → 给出**当初那条命令行**，
  含空白的参数已加引号，可原样粘贴。桌面版**故意不给命令**：把子进程的 argv 重放一遍
  等于在同一个 profile 上再起第二个宿主（`hostinfo.ts:87`）。
- `kind` 从 `process.argv[1]` 判断，不读环境变量：外壳拉起的入口是
  `dsh-desktop-host/lib/index.js`，别的启动方式落不到那个路径
  （`hostinfo.ts:44` `DESKTOP_ENTRY`、`:57` `hostKindOf`）。
- **pid 是这条链路唯一有意义的信号**，而且**每次现算**（`src/index.ts:477` 用
  `Date.now() - process.uptime()*1000`，不缓存）：缓存会让一次真的重启看起来像卡住。
  页面每秒问一次，直到 pid 变了才往下走（`RestartDialog.ts` `PROBE_MS = 1000`）。
- **确认重启之后的刷新**必须走 `reloadWhenBootDocumentFresh`（§4），不要换成
  `location.reload()`：新的宿主可能已经轮换到这一页加载不了的那一代 batch。
- **等待是自动开始的，按钮只是「再查一次」。** 对话框拿到 pid 就立刻开等，不等用户点；
  按钮写成「重新检查」而不是「重启好了，刷新页面」——后者读起来像「按它就是重启」，
  而这个页面从来没有那个能力（`RestartDialog.ts` 的 `beginWaitRef` / `checkAgain`）。
- **两分钟是「不再声称在等」，不是「停止等待」**（`RestartDialog.ts` `WAIT_LIMIT_MS = 120_000`）。
  退出再打开 DSH 要花多久由人决定，超时把人赶进死胡同、还得回来按按钮，是最没道理的
  那种失败。超时后转 `idle` 说一句「还没换新进程——重新打开 DSH 后这一页会自己刷新」，
  **timer 继续跑**；pid 一变照样自动 reload。判断规则抽在 `probeVerdict`：
  pid 变了就是重启（多晚都算）、pid 读不到不算重启、deadline 只报告不终止。
- **关掉对话框必须停掉轮询。** timer 放在 `timerRef` 里，unmount 时清掉：否则关掉之后
  它仍会继续问，并在你离开很久之后 reload 页面。同理 `beginWaitRef` 在 effect 里赋值，
  不在渲染期间写 ref。
- **「卡住了」有两种，不能合并成一句。** pid 没变（旧进程还在）和 pid 变了但页面刷不动
  （`restartReloadBlocked`）都会落到 `stalled`，但前者叫人「再确认旧进程退出」，后者叫人
  「再重启一次 DSH」。所以 `stalled` 渲染的是 `problem`（`stalledMessage`），
  只有 `problem` 为空才用 `restartStillOld`——把「宿主已重启」说成「还没换新进程」
  会把人引到错误的方向。
- 文案里不许说页面能重启宿主（`copy.ts` 的 `restartBody` 中英都写明了做不到）。

**代码：** `src/host/hostinfo.ts`、`src/index.ts:477`、`src/client/api.ts` `readHostInfo`、
`src/client/components/RestartDialog.ts`、`src/client/components/Tab.ts:98`、`src/client/copy.ts`
的 `restart*` 一组、`src/client/styles.ts` 的 `.dsh-pu-cmdbox` / `.dsh-pu-cmd`。

**守护：** `test/hostinfo.test.ts`（10 条）、`test/copy.test.ts`（3 条）、
`test/restart-dialog.test.ts`（8 条：无理由时说「还没换新进程」、有理由时原样保留、
只有空白也算没有理由；pid 变了多晚都算重启、pid 没到点继续等、读不到不算重启、
deadline 只报告不终止）。

---

## 行号校对（2026-11-04）

逐条 `grep` 复核，**行号以 `src/` 下的实际文件为准**。

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/index.ts:477` `Date.now() - process.uptime()*1000` | `src/index.ts:591` `const startedAt = Date.now() - Math.round(process.uptime() * 1000)` | ⚠️ 漂移 +40 行；且原文省略了 `Math.round(...)` 这一层 |
| —— 同一个 `GET host` 路由块 | `src/index.ts:584` `if (req.method === 'GET' && route === 'host')` | 供参考：路由块起点 |
| `src/client/api.ts` `readHostInfo` | `src/client/api.ts:240` | ✅ 一致（原文没写行号，**从来没有**在 `src/index.ts` 里，这条要在拆分时保持原样） |
| `Tab.ts:98` `restartPending` | `src/client/components/Tab.ts:98` `const [restartPending, setRestartPending] = React.useState(false)` | ✅ 一致 |
| `Tab.ts:443` 按钮渲染 | `src/client/components/Tab.ts:443` `restartPending` | ✅ 一致 |
| `hostinfo.ts:87` `relaunchCommand` | `src/host/hostinfo.ts:87` `export function relaunchCommand(execPath, argv, kind)` | ✅ 一致 |
| `hostinfo.ts:44` `DESKTOP_ENTRY` | `src/host/hostinfo.ts:44` `const DESKTOP_ENTRY = /[\\/]dsh-desktop-host[\\/]lib[\\/]index\.js$/i` | ✅ 一致 |
| `hostinfo.ts:57` `hostKindOf` | `src/host/hostinfo.ts:57` `export function hostKindOf(entry: string): HostKind` | ✅ 一致 |
| `RestartDialog.ts` `PROBE_MS = 1000` | `src/client/components/RestartDialog.ts:24` `const PROBE_MS = 1000` | ✅ 符号在，无行号可对 |
| `RestartDialog.ts` `WAIT_LIMIT_MS = 120_000` | `src/client/components/RestartDialog.ts:32` `const WAIT_LIMIT_MS = 120_000` | ✅ 符号在 |
| `RestartDialog.ts` `beginWaitRef` | `src/client/components/RestartDialog.ts:128` 声明、`:143` 调用、`:249` 在 effect 里赋值 | ✅ 符号在 |
| `RestartDialog.ts` `checkAgain` | `src/client/components/RestartDialog.ts:259` | ✅ 符号在 |
| `RestartDialog.ts` `timerRef` | `src/client/components/RestartDialog.ts:118` 声明、`:157` unmount 清理、`:236` 赋值 | ✅ 符号在 |
| `RestartDialog.ts` `probeVerdict` / `stalledMessage` | `src/client/components/RestartDialog.ts:82` / `:52` | ✅ 符号在 |
| `RestartDialog.ts` 调 `reloadWhenBootDocumentFresh` | `src/client/components/RestartDialog.ts:212` | ✅ 符号在（定义在 `src/client/boot.ts:126`，见 §4） |
| `copy.ts` `restartBody` | `src/client/copy.ts:82`（zh）、`:226`（en） | ✅ 一致（未写行号） |
| `copy.ts` `restartStillOld` / `restartReloadBlocked` | `src/client/copy.ts:92`/`:237`、`:93`/`:238` | ✅ 符号在 |
| `styles.ts` `.dsh-pu-cmdbox` / `.dsh-pu-cmd` | `src/client/styles.ts:143` / `:144` | ✅ 符号在 |

**结论：§16 只有一个行号漂移**——`src/index.ts:477` → `src/index.ts:591`。
其余 `path:line` 全部仍然指对地方。拆分后 fragment 里一律不写行号。

### 守卫的条数复核

| 文件 | AGENTS.md 写的 | 实际 | 结论 |
|---|---|---|---|
| `test/hostinfo.test.ts` | 10 条 | 10 条 | ✅ |
| `test/copy.test.ts` | 3 条 | 3 条 | ✅ |
| `test/restart-dialog.test.ts` | 8 条 | 8 条 | ✅ |

`test/restart-dialog.test.ts` 的 8 条正是原文点名的那 8 种情形：无理由时归咎旧进程、
有理由时保留理由、空白理由不算理由、pid 变了多晚都算重启、pid 没变且过点转 idle、
pid 没变未到点继续等、读不到不算重启、不允许报 deadline 的等待永不放弃。
