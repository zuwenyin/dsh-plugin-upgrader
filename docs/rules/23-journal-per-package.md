# 23 一条 journal 记录只够一个包 —— AGENTS.md §23 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 23 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 23. 一条 journal 记录只够一个包

**不可退化。** §22 修好了「并发 writer 抹掉条目」，却把 journal 留成**一个 profile
一条记录**。评审第二轮（[@Herdeny](https://github.com/Herdeny)，
`awesome-dsh-plugins-2026#11`）用已发布的 `dsh-plugin-upgrader@1.7.2` 的 `runStep`
就复现了：A 的 in-place 安装失败、还原又被锁挡住，记录还指着 A；锁一放开 B 正常升级，
B 的 drop 把 A 的记录**覆盖**掉，B 的 confirmation 再把文件**整份清掉**——批次跑完
A 从 `package.json` 里没了，`recoverPendingDrop` 返回 `{ kind: 'none' }`。

- **记录按名字归属，一个包一条。** journal 的磁盘格式是
  `{ version: 2, records: DropJournal[] }`（`JOURNAL_VERSION = 2`），文件名不变。
  `upsertRecord` 只替换同名那条，`clearRecord(dir, name)` 只删同名那条。
- **结算只结算自己的。** `confirmDependency` / `restoreDependency` / `undoDrop`
  清理时必须带 name；**不要**再出现无参数的「整份清空」。1.7.2 的
  `settleRecord` 只要该 name 在 `dependencies` 里就清掉整个文件，那是 B 的确认
  抹掉 A 记录的第二条路径。
- **一次恢复要把所有记录都修完。** `recoverPendingDrops(dir)` 返回
  `RecoveryResult[]`，加载时（`src/index.ts`）逐条报告 `restored`；
  `recoverPendingDrop(dir)` 退化成取第一条，只为兼容旧调用。
- **读 journal 也要进锁。** `recoverPendingDrops` 在锁外只做一件事：判断「有没有记录」
  和「拿不到锁时该报哪些名字」；**决不从锁外那次读里采取任何行动**。真正读、改、删
  全在 `withManifestLock` 里（§22）。评审原文最后一句就是这条。
- **拿不到锁时记录原样留着**，返回 `{ kind: 'failed', reason: LOCK_BUSY }`；
  `restoreDependency` 返回 `false`。`replaceWithoutRemoval` 的两条失败分支现在都
  会写明「could NOT restore the dependency entry, the next start repairs it」，
  **日志不许说已经还原**。
- **旧格式必须还能读。** 1.7.2 及更早写的是单个对象（`{name, spec, at}`）；
  `readRecords` 见到 `records` 不是数组时，把整个顶层对象当成一条记录。
  **不要**为了「格式干净」拒绝旧文件——那等于让升级中断过的 profile 永远修不回来。
- **写盘失败不留半个文件。** `writeRecords` 先写 `${target}.upgrader-tmp` 再
  `renameSync`；`records` 为空时直接 `rmSync` 删掉文件，不留空壳。
- **测试要能红**：把 `upsertRecord` 改回覆盖式（`writeRecords(dir, [journal])`）、
  把 `clearRecord` 改回整份清空，会有 **5 条变红**（4 条 manifest + 1 条 install），
  已实测。

**代码：** `src/host/manifest.ts` 的 `JournalEnvelope` / `JOURNAL_VERSION` /
`readRecords` / `writeRecords` / `upsertRecord` / `clearRecord` /
`recoverPendingDrops` / `undoDrops`（锁内）；`src/index.ts` 的加载时清理循环；
`src/host/install.ts:526` `replaceWithoutRemoval` 的两条还原日志。

**守护：** `test/manifest.test.ts` —— `a second drop does not overwrite a record that is
still pending`、`a confirmation settles its own record and leaves the others pending`、
`a restore settles its own record and leaves the others pending`、
`a recovery pass repairs every record, not just the first`、
`a journal written by an earlier version is still read`（5 条）；
`test/install.test.ts` —— `a failed first step does not lose its entry when the next step
succeeds`（评审描述的那条链：第一步失败 → 第二步成功 → 重新加载时把第一个依赖补回来）。

## 行号校对（2026-11-04）

原 §23 只给过一个行号（`src/host/install.ts:526`），其余全是符号名。逐个核对：

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `JournalEnvelope` | `src/host/manifest.ts:62` `interface JournalEnvelope {`（**未 export**） | ✅一致（原文未给行号） |
| `JOURNAL_VERSION = 2` | `src/host/manifest.ts:70` `const JOURNAL_VERSION = 2`（**未 export**） | ✅一致 |
| `readRecords` | `src/host/manifest.ts:172` `function readRecords(dir: string): DropJournal[]`（**未 export**） | ✅一致（原文未给行号） |
| `writeRecords` | `src/host/manifest.ts:209` `function writeRecords(dir: string, records: DropJournal[]): boolean`（**未 export**） | ✅一致（原文未给行号） |
| `upsertRecord` 只替换同名那条 | `src/host/manifest.ts:242` `function upsertRecord(...)`；`:243` `readRecords(dir).filter((record) => record.name !== journal.name)`；`:244` `writeRecords(dir, [...kept, journal])` | ✅一致 |
| `clearRecord(dir, name)` 只删同名那条 | `src/host/manifest.ts:256` `function clearRecord(dir: string, name: string): void`；`:258` `records.filter((record) => record.name !== name)` | ✅一致 |
| `recoverPendingDrops` 返回 `RecoveryResult[]` | `src/host/manifest.ts:327` `export function recoverPendingDrops(dir, options?): RecoveryResult[]` | ✅一致 |
| 加载时逐条报告 `restored` | `src/index.ts:738` `for (const recovery of recoverPendingDrops(dir))`；`:739` `if (recovery.kind !== 'restored') continue`；`:740-743` `console.warn(...)` | ✅一致 |
| `recoverPendingDrop` 退化成取第一条 | `src/host/manifest.ts:363` `export function recoverPendingDrop(...)`；`:364` `return recoverPendingDrops(dir, options)[0] ?? { kind: 'none' }` | ✅一致 |
| 读 journal 也要进锁 | `src/host/manifest.ts:334` `const pending = readRecords(dir)` 是锁外唯一一次读，`:328-334` 的注释写明它只用来「跳过锁」和「报名字」；真正的改在 `:344` `withManifestLock(dir, () => undoDrops(dir), options)` | ✅一致 |
| 拿不到锁返回 `{ kind: 'failed', reason: LOCK_BUSY }` | `src/host/manifest.ts:351` `return pending.map((record) => ({ kind: 'failed', name: record.name, reason: LOCK_BUSY }) as const)` | ✅一致 |
| `restoreDependency` 拿不到锁返回 `false` | `src/host/manifest.ts:537` `export function restoreDependency(` | ✅一致（原文未给行号） |
| `settleRecord` 遇锁不等待 | `src/host/manifest.ts:454` `function settleRecord(dir, name)`；`:465` `clearRecord(dir, name)` | ✅一致 |
| `undoDrop` 只清自己那条 | `src/host/manifest.ts:397` `function undoDrop(dir, journal)`；`:409` / `:413` / `:426` 三处 `clearRecord(dir, journal.name)` | ✅一致 |
| `readRecords` 接受旧格式 | `src/host/manifest.ts:187` `const candidates = Array.isArray(envelope.records) ? envelope.records : [parsed]` | ✅一致 |
| `writeRecords` 先写 `.upgrader-tmp` 再 `renameSync` | `src/host/manifest.ts:219` `const temporary = \`${target}.upgrader-tmp\``；`:222` `writeFileSync(...)`；`:223` `renameSync(temporary, target)` | ✅一致 |
| `records` 为空时 `rmSync` 删文件 | `src/host/manifest.ts:211-214` `if (records.length === 0) { rmSync(target, { force: true }); return true }` | ✅一致 |
| `replaceWithoutRemoval` 两条还原日志 | `src/host/install.ts:526` `async function replaceWithoutRemoval(`；`:565` 与 `:581` 各有一条 `'; could NOT restore the dependency entry, the next start repairs it'` | ✅一致 |

### 守护用例的真实行号

| 守护画里的一句话 | 用例名 | 位置 |
|---|---|---|
| A 的记录不被 B 的 drop 覆盖 | `a second drop does not overwrite a record that is still pending` | `test/manifest.test.ts:444` |
| 确认只结算自己 | `a confirmation settles its own record and leaves the others pending` | `test/manifest.test.ts:471` |
| 还原只结算自己 | `a restore settles its own record and leaves the others pending` | `test/manifest.test.ts:493` |
| 一次恢复修完所有记录 | `a recovery pass repairs every record, not just the first` | `test/manifest.test.ts:512` |
| 旧格式仍能读 | `a journal written by an earlier version is still read` | `test/manifest.test.ts:530` |
| 评审那条链 | `a failed first step does not lose its entry when the next step succeeds` | `test/install.test.ts:755` |

### 补记

- **`clearJournal` 是唯一保留的「整份清空」入口，而且升级路径不用它。**
  `src/host/manifest.ts:272` 的注释写明它「kept because the journal is a whole file and a
  caller may legitimately want it gone (tests, and a profile being reset). Nothing in the
  upgrade path uses it」。全仓库只有 `test/manifest.test.ts:315` 调它（断言不抛）。
  看到它时不要顺手改成按名字清——它是刻意的逃生口，不是遗漏。
- **`readJournal` 是只读诊断口，不是决策入口。** `src/host/manifest.ts:289`，无 name 时
  返回第一条；`install.test.ts:802` 用 `readJournal(dir, 'first')?.spec` 断言失败的步骤
  仍在记录里，`manifest.test.ts` 有十余处用它断言「这条还在 / 这条已经清掉」。
  它**不进锁**，所以只能用来断言状态，不能用来决定要不要修。
- **`JOURNAL_VERSION` / `JournalEnvelope` / `readRecords` / `writeRecords` /
  `upsertRecord` / `clearRecord` 都没 export。** 原文把它们列进「代码：」清单，读起来像
  公开 API；实际是模块私有实现，外部只能通过 `dropDependency` / `restoreDependency` /
  `confirmDependency` / `recoverPendingDrops` / `readJournal` 这五个壳碰它。
- **「5 条变红（4 条 manifest + 1 条 install）」是 2026-11-04 的实测记录**，做法是把
  `upsertRecord` 改回覆盖式、把 `clearRecord` 改回整份清空。它是当时的观测结果，不是可
  推导的恒等式：以后改 journal 的归属方式，要重新实测这个数字。
