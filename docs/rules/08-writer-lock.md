# 08 写入锁超时要翻成人话 —— AGENTS.md §8 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 8 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 8. 写入锁超时要翻成人话

profile 的 `package.json` 由 harness 用 `package.json.lock` 串行化：manager 自己的预算是
120 秒，`atomic-write` 的默认是 2 秒。超时原文只报一个文件名和一个 pid，用户无法处理。

- 失败信息先读锁（`readWriterLock`），再说「另一个操作正在改写，等它结束再试」或
  「锁没释放，重启 DSH 会自愈」，原文放在方括号里保留（便于搜索 / 报 bug）。
- 不是锁超时的信息**原样返回**。

**代码：** `src/host/lock.ts:73` `readWriterLock`、`:99` `isWriterLockTimeout`、
`:138` `explainLockTimeout`。

**守护：** `test/lock.test.ts`（9 条）。

---

## 为什么这条存在

`atomic-write` 抛出来的原文是 `atomic-write: timed out waiting for the writer lock <path>`
一类的句子：一个文件名、一个 pid，**没有主语也没有下一步**。用户看到它，唯一能做的动作是
「再点一次」，而再点一次会撞上同一把锁。

两个数字的差是这条规则的起因：manager 给一次安装动作的预算是 **120 秒**，
`atomic-write` 的默认等待只有 **2 秒**。所以「超时」在绝大多数情况下**不是死锁**，
只是另一个操作还在写——先读一眼锁、说清是谁占着，比任何重试都更有用。

另一个方向同样重要：**不是锁超时的信息必须原样返回**。`explainLockTimeout` 第一行就是
`if (!isWriterLockTimeout(message)) return message`（`src/host/lock.ts:265`），
不然任何一条安装错误都会被套上「另一个操作正在改写」，把真正的失败原因盖掉。

## 判定与措辞的分工

| 函数 | 位置 | 职责 |
|---|---|---|
| `readWriterLock` | `src/host/lock.ts:199` | 读 `package.json.lock`，返回 `{ pid, alive }` 或 `undefined` |
| `isWriterLockTimeout` | `src/host/lock.ts:225` | 只认 `atomic-write` 前缀 + 那句话 |
| `describeWriterLock` | `src/host/lock.ts:239` | 两种人话（锁仍被活进程占 / 锁没释放），中英各一句 |
| `explainLockTimeout` | `src/host/lock.ts:264` | 拼装：人话 + ` [原文]`；非锁超时原样返回 |

三个细节值得记住，因为都是「看起来可以简化」的地方：

- **`isWriterLockTimeout` 按句子判、不按路径判**（`:226`）——消息由另一个包组装，
  路径是唯一每个 profile 都不同的部分；按路径判会在换 profile 时静默失效。
- **读不出来的锁算「仍被持有」**（`:210`，`return { alive: true }`）——文件存在就说明
  有人创建了它，把读不懂的记录当成「空闲」正好废掉这把锁。
- **两种人话都是中英双句拼在一起**（`:243` / `:247`）——job 日志是一条流，
  面板没法翻译宿主写好的句子，所以两种语言必须同时进日志。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/lock.ts:73` `readWriterLock` | `src/host/lock.ts:199` | ⚠️ 漂移（-126 行） |
| `:99` `isWriterLockTimeout` | `src/host/lock.ts:225` | ⚠️ 漂移（-126 行） |
| `:138` `explainLockTimeout` | `src/host/lock.ts:264` | ⚠️ 漂移（-126 行） |
| `test/lock.test.ts`（9 条） | 文件里现有 **17** 个 `test(...)`：本节 9 条（`:39`–`:140`）+ §22 新增 8 条（`:148`–`:254`） | ⚠️ 条数已变，原文数字仍对得上本节 |

三个符号都**整体平移了 126 行**，不是各自随机漂移——说明 `lock.ts` 顶部被加了一整块
（`withManifestLock` 那一族，§22 引入），下面的导出都跟着往下走。反过来引用时，
「126」这个偏移量可以当作 sanity check。

`describeWriterLock`（`:239`）在原文里没有出现，但它是「两种人话」的实际出处，
改措辞要改这里，不是改 `explainLockTimeout`。

## 9 条守护用例（`test/lock.test.ts:39`–`:140`，属于本节）

| 行 | 用例 |
|---|---|
| 39 | `an absent lock is not a lock` |
| 48 | `a lock names the pid that holds it, and whether it is alive` |
| 61 | `a lock nobody can read still counts as held` |
| 75 | `the liveness probe answers for this process and for nonsense` |
| 83 | `the timeout is recognised by its sentence, not by a path` |
| 94 | `a live holder is described as another operation, a dead one as a leftover` |
| 108 | `the timeout is explained, and every other message is left alone` ← **「原样返回」的守卫** |
| 126 | `a lock left by a dead process is explained as a leftover` |
| 140 | `an unknown profile still explains the timeout` |

`test/lock.test.ts:148` 之后的 8 条属于 §22（`withManifestLock`），不要算进本节，
否则「9 条」这个数字会被误读成「少了 8 条」。

## 上游调用点

`src/host/install.ts:97`（在 `explainLockTimeout(message, profileDirFrom())` 里）
是全仓唯一把原文换成一句人话的地方——`manifest.ts` 那条路径（§22）反过来，
它**不写**、直接返回 `LOCK_BUSY`。
