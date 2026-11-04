# 19 批次状态不能住在 `apply()` 的闭包里 —— AGENTS.md §19 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 19 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 19. 批次状态不能住在 `apply()` 的闭包里

**不可退化。** 1.7.0 修的真实事故：用户升级 `dsh-dream-skin`，升级**成功了**
（`package.json` 已经写进 `11.3.0`），页面却报「升级进度已失去联系（宿主可能重启过）」。

- **根因不是重启，是模块被替换了。** `live` profile 下，本插件升级别的插件这个动作本身
  就会让 HMR 重新协调 profile，**本插件的模块也会被重新求值**。`jobs` / `inFlight` / `liveJob`
  原本是 `apply()` 的闭包局部变量，新实例于是拿到一张空 Map，对页面正在轮询的那个 id
  回答 `GET /job` → 404 `unknown-job`，`watchJob` 累计 4 次失败后判失联。
- **模块级常量救不了。** 重新求值会造新的模块作用域，放在模块顶层的 `const jobs = new Map()`
  一样是空的。状态必须挂在 `globalThis` 上，用一个稳定的符号
  `Symbol.for('dsh-plugin-upgrader/jobs')`，由 `sharedJobStore()` 读取。
- **`Symbol.for` 而不是 `Symbol()`**：前者按字符串跨模块实例共享，后者每次调用都是新的。
- **清理只清自己那份**：`runJob` 的 `finally` 里必须是
  `if (store.live === job) store.live = null`，不能无条件置空——旧实例收尾时新实例可能
  已经接管了另一个批次，无条件清空会把它的管理事件流打断。
- **进程重启时该没有的就是没有**：`globalThis` 不跨进程，宿主真重启后 id 查不到是正确
  的语义，不要为了「看起来健壮」把批次落盘。

**代码：** `src/index.ts` 的 `JobStore` / `sharedJobStore()` / `apply()` 开头、
`runJob` 的 `finally`、`install-log` 与 `install-state` 两个订阅里的 `store.live`、
`POST cancel` 的 `store.inFlight`。

**守护：** `test/job-store.test.ts`（走真实路由：`apply` 一次 → `POST job` 拿 id →
再 `apply` 一次模拟替换实例 → `GET job?id=` 必须 200）。把 `apply` 里的
`const store = sharedJobStore()` 换回闭包局部对象，这条必须变红（实测是 `404 !== 200`）。

## 行号校对（2026-11-04）

原 §19 的 `代码：` 行只写了文件名和符号名，没有给过 `path:line`。下表把每个符号的真实位置
补出来，供以后有人「顺手简化」时对照。

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `Symbol.for('dsh-plugin-upgrader/jobs')` | `src/index.ts:136` `const JOB_STORE_KEY = Symbol.for('dsh-plugin-upgrader/jobs')` | ✅一致（原文未给行号） |
| `JobStore` | `src/index.ts:186` `interface JobStore`（字段 `jobs` / `live` / `inFlight`） | ✅一致（原文未给行号） |
| `sharedJobStore()` | `src/index.ts:207` `export function sharedJobStore(): JobStore`，从 `globalThis` 读/建 | ✅一致（原文未给行号） |
| `apply()` 开头 | `src/index.ts:233` `export function apply(...)`；`:236` `const store = sharedJobStore()` | ✅一致（原文未给行号） |
| `runJob` 的 `finally` | `src/index.ts:317` `const runJob = async (...)`；`:370` `if (store.live === job) store.live = null`；`:371` `if (store.inFlight?.requestId === job.requestIds.at(-1)) store.inFlight = null` | ✅一致（原文未给行号） |
| `install-log` 订阅里的 `store.live` | `src/index.ts:659` 订阅 `'plugin-manager/install-log'`；`:661` `const job = store.live` | ✅一致（原文未给行号） |
| `install-state` 订阅里的 `store.live` | `src/index.ts:691` 订阅 `'plugin-manager/install-state'`；`:693` `const job = store.live` | ✅一致（原文未给行号） |
| `POST cancel` 的 `store.inFlight` | `src/index.ts:556` `if (req.method === 'POST' && route === 'cancel')`；`:565` `const target = store.inFlight?.requestId ?? running.requestIds.at(-1)` | ✅一致（原文未给行号） |
| 守护 `test/job-store.test.ts`（走真实路由） | `test/job-store.test.ts:114` `a replaced module still answers for the batch the previous one started` | ✅一致（原文未点名用例） |

### 补记

- 原文说「`jobs` / `inFlight` / `liveJob` 原本是 `apply()` 的闭包局部变量」，实际字段名是
  `jobs` / `live` / `inFlight`（`src/index.ts:186-192`）。`liveJob` 不存在，是当年的口误；
  语义没有差别，故原文一字未改，在此备注。
- 同一文件里还有一条心跳用例（`test/job-store.test.ts:136` `the batch reports the heartbeat
  the panel judges liveness by`），属于 §7 的守护，不是 §19 的，别在这里动它。
