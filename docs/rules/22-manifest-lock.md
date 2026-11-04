# 22 改 `package.json` 要在 harness 自己的写入锁里改 —— AGENTS.md §22 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 22 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 22. 改 `package.json` 要在 harness 自己的写入锁里改

**不可退化。** 这一条是外部报告的（[@Herdeny](https://github.com/Herdeny) 在
`awesome-dsh-plugins-2026#11`），用 1.7.0 已发布的 `lib/host/manifest.js` 就能复现：
并发 writer 先读到「条目已被摘掉」的 manifest、在我方还原之后提交自己的快照，
条目就此消失；而还原那一步已经把 journal 清掉，`recoverPendingDrop` 于是
`{ kind: 'none' }`——**没有任何东西能修**。§3 的 journal 只挡「进程被杀」，
挡不住「并发 writer 的 read-modify-write」。

- **`dropDependency` / `restoreDependency` / `confirmDependency` / `recoverPendingDrop`
  全部在 `withManifestLock` 里跑**，拿的是 `atomic-write` 用的同一把
  `package.json.lock`，写的内容也是同一个 `${process.pid}\n`。
- **拿不到锁就不写，一个字节都不写。** `dropDependency` 返回
  `{ kind: 'unavailable', reason: LOCK_BUSY }`，`replaceWithoutRemoval` 已有的分支
  会打日志并 `return undefined`，于是走 `removeForReplacement` —— 慢一点但永远正确。
  **不要**改成「拿不到锁就直接写」，那正是这条 bug。
- **`LOCK_WAIT_MS = 1_000` 是刻意的短。** 这里的失败模式不是「等一下就好了」，
  而是「另一个操作正在跑」；等满 manager 的 120 秒只会让升级看起来卡死。
- **本进程持锁要立刻判定为忙，不能重试。** `atomic-write` 的 `holderExited()` 对
  `pid === process.pid` 返回 false（它不会接管自己的持有者），所以嵌套获取重试
  只会等满超时。`withManifestLock` 打开失败后先 `readWriterLock`，
  `holder?.pid === process.pid` 直接返回 `undefined`。
- **绝不抢占别人的锁**，即使记录的 pid 已经死了：那可能是马上要醒来的 writer，
  而 `atomic-write` 自己已经有 takeover 逻辑。我们能做的正确选择是放弃。
- **journal 只在锁内、且确认条目真的回到盘上之后才清。** `restoreDependency`
  拿不到锁时返回 false 并**保留记录**，`recoverPendingDrop` 拿不到锁时返回
  `{ kind: 'failed', reason: LOCK_BUSY }` 并保留记录——下次加载再修。
  原来那句「entry is on disk either way」在没有锁的世界里是错的。
- **必须同步**。`Atomics.wait` 用来做退避 `sleep`：这四个函数是同步 API，
  改成 async 会波及 `src/index.ts:723` 的加载时恢复和一整批测试。
- **锁名硬编码成 `'package.json.lock'`**，不再拼 `MANIFEST_FILE`：`manifest.ts`
  现在 import `lock.ts`，顶层引用 `MANIFEST_FILE` 会在初始化前求值。
  `test/lock.test.ts` 用 `assert.equal(LOCK_FILE, \`${MANIFEST_FILE}.lock\`)` 钉住。
- **测试要能红**：把 `withManifestLock` 里 EEXIST 分支改成直接 `return body()`
  （即修复前的行为），会有 7 条变红（4 条 manifest + 3 条 lock），已实测。

**代码：** `src/host/lock.ts` 的 `LOCK_FILE` / `LOCK_WAIT_MS` / `LOCK_BUSY` /
`ManifestLockOptions` / `sleepSync` / `withManifestLock`；`src/host/manifest.ts` 的
`dropDependency` / `restoreDependency` / `confirmDependency` / `recoverPendingDrop`
（公开壳）+ `removeEntry` / `putEntryBack` / `settleRecord` / `undoDrop`（锁内实现）。

**守护：** `test/lock.test.ts`（8 条新增：锁名、无锁时跑完不留文件、锁内写的是自己的
pid、本进程持锁立即忙、别人的锁到点放弃、别人释放后接管且 body 只跑一次
（断言退避是 `[10, 20]`）、body 抛错也释放锁、忙的句子说的是锁）与
`test/manifest.test.ts`（5 条新增：持锁时 drop 返回 unavailable 且 manifest 字节未变、
还原拿不到锁保留记录供下次修复、恢复拿不到锁也保留记录、并发 writer 抹不掉已还原的
条目、已还原的条目确认时遇锁不等待）。这些用例都传 `{ waitMs: 0 }`，
整套文件只要 ~460ms。

## 行号校对（2026-11-04）

原 §22 只在正文里给过一个行号（`src/index.ts:723`），其余是符号名。逐个核对：

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `LOCK_FILE` | `src/host/lock.ts:37` `export const LOCK_FILE = 'package.json.lock'` | ✅一致（原文未给行号） |
| `LOCK_WAIT_MS` | `src/host/lock.ts:49` `export const LOCK_WAIT_MS = 1_000` | ✅一致（原文未给行号） |
| `LOCK_BUSY` | `src/host/lock.ts:58` `export const LOCK_BUSY = 'the profile writer lock is held by another operation'` | ✅一致（原文未给行号） |
| `ManifestLockOptions` | `src/host/lock.ts:75` `export interface ManifestLockOptions` | ✅一致（原文未给行号） |
| `sleepSync` | `src/host/lock.ts:70` `function sleepSync(ms: number): void`（注意**未 export**，是模块内函数） | ✅一致（原文未给行号） |
| `withManifestLock` | `src/host/lock.ts:114` `export function withManifestLock<T>(dir, body, options)` | ✅一致（原文未给行号） |
| `readWriterLock`（正文提到） | `src/host/lock.ts:199` `export function readWriterLock(` | ✅一致 |
| `holder?.pid === process.pid` 直接 `return undefined` | `src/host/lock.ts:133` `if (code !== 'EEXIST') return undefined`；`:134` `const holder = readWriterLock(dir, alive)`；`:135` `if (holder?.pid === process.pid) return undefined` | ✅一致 |
| `Atomics.wait` 做退避 | `src/host/lock.ts:63` 注释；`:71` `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` | ✅一致 |
| `src/index.ts:723` 的加载时恢复 | `src/index.ts:723` 是那段注释块的开始，`recoverPendingDrop(dir)` 的实际调用在 `src/index.ts:735` | ⚠️**漂移 12 行**：`:723` 是注释，`dir = profileDirFrom()` 在 `:732`，`recoverPendingDrop(dir)` 在 `:735`。语义没变，行号要按 `:735` 用 |
| `dropDependency` | `src/host/manifest.ts:335` `export function dropDependency(...)`；锁内实现 `:347` `function removeEntry(...)` | ✅一致（原文未给行号） |
| `restoreDependency` | `src/host/manifest.ts:390` `export function restoreDependency(`；锁内实现 `:416` `function putEntryBack(...)` | ✅一致（原文未给行号） |
| `confirmDependency` | `src/host/manifest.ts:306` `export function confirmDependency(...)`；锁内实现 `:318` `function settleRecord(...)` | ✅一致（原文未给行号） |
| `recoverPendingDrop` | `src/host/manifest.ts:238` `export function recoverPendingDrop(...)`；锁内实现 `:261` `function undoDrop(...)` | ✅一致（原文未给行号） |
| `manifest.ts` 现在 import `lock.ts` | `src/host/manifest.ts` 顶部 import 了 `withManifestLock` 等；`src/host/lock.ts:32-33` 的注释写明「Spelled out rather than built from `manifest.ts`'s `MANIFEST_FILE` on purpose: `manifest.ts` imports this module, and a top-level `${MANIFEST_FILE}.lock` here...」 | ✅一致 |
| `test/lock.test.ts` 用 `assert.equal(LOCK_FILE, ...)` 钉住 | `test/lock.test.ts:151` `assert.equal(LOCK_FILE, \`${MANIFEST_FILE}.lock\`)`；用例名 `:148` `the lock name is the one atomic-write derives from the manifest` | ✅一致 |

### 守护用例的真实行号

`test/lock.test.ts` 的 8 条新增（原 §22 只说「8 条新增」）：

| 原文描述 | 用例名 | 位置 |
|---|---|---|
| 锁名 | `the lock name is the one atomic-write derives from the manifest` | `test/lock.test.ts:148` |
| 无锁时跑完不留文件 | `an unlocked profile runs the body and leaves no lock behind` | `:154` |
| 锁内写的是自己的 pid | `the lock names this process while the body runs` | `:165` |
| 本进程持锁立即忙 | `a lock this very process holds is reported busy without waiting` | `:175` |
| 别人的锁到点放弃 | `a foreign lock is retried and given up on at the deadline` | `:189` |
| 别人释放后接管且 body 只跑一次（退避 `[10, 20]`） | `a foreign lock that clears up is taken, and the body is not run twice` | `:203` |
| body 抛错也释放锁 | `a body that throws still releases the lock` | `:240` |
| 忙的句子说的是锁 | `the busy sentence names the lock rather than the caller` | `:254` |

`test/manifest.test.ts` 的 5 条新增：

| 原文描述 | 用例名 | 位置 |
|---|---|---|
| 持锁时 drop 返回 unavailable 且 manifest 字节未变 | `an entry is not dropped while somebody else holds the writer lock` | `test/manifest.test.ts:334` |
| 还原拿不到锁保留记录供下次修复 | `a restore that cannot take the lock keeps the record so the next load repairs it` | `:350` |
| 恢复拿不到锁也保留记录 | `a recovery that cannot take the lock leaves the record for the next load` | `:380` |
| 并发 writer 抹不掉已还原的条目 | `an overlapping writer cannot erase an entry the restore already put back` | `:400` |
| 已还原的条目确认时遇锁不等待 | `a confirmation of an entry that is already back does not wait on a locked profile` | `:430` |

### 补记

- `sleepSync` 没有 `export`。原 §22 把它列进「`src/host/lock.ts` 的 …」清单里，读起来
  像公开 API，实际是模块私有的退避实现。要测退避只能通过 `ManifestLockOptions.sleep`
  注入（`test/lock.test.ts:203` 那条断言 `[10, 20]` 就是这么做的）。
- `holderExited()` 是 `atomic-write` 那边的函数，本仓库里 grep 不到；`src/host/lock.ts:20`
  的注释复述了它的行为（`holderExited` returns false for `process.pid`）。不要试图在本仓库
  里找它的定义。
- 「7 条变红（4 条 manifest + 3 条 lock）」是 2026-11-04 的实测记录。上面两张表列出的
  新增用例共 13 条（8+5），不是全部都会红——会红的是其中直接依赖锁的那 7 条。这个数字
  是当时的观测结果，不是可推导的恒等式，改动锁的行为后要重新实测。
