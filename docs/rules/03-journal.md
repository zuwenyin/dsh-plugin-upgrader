# 03 Profile manifest 必须随时可恢复（journal） —— AGENTS.md §3 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 3 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 3. Profile manifest 必须随时可恢复（journal）

**不可退化。** 第 2 条把依赖条目录进 journal 再删除，中间这段时间进程被杀掉，
插件就从 manifest 里消失（等于「装不回去」）。1.4.0 为此加了 journal。

- 删除前先写 `package.json.upgrader-journal.json`（**先 journal，再删，再写 manifest**）。
- 每次插件加载（`src/index.ts:555`）调 `recoverPendingDrop(dir)`：
  - journal 有记录 + manifest 里确实缺这条 → 补回去（`restored`）
  - journal 有记录 + manifest 里已经有了 → 说明那次 install 落地了，只清 journal
  - journal 损坏 / 描述不了当前 manifest → 忽略并清掉，**绝不**凭猜测改 manifest
- 恢复只是修复，不是前置条件：失败只 `console.warn`，标签页照样加载。

**代码：** `src/host/manifest.ts:40` `JOURNAL_FILE`、`:235` `recoverPendingDrop`、
`:302` `dropDependency`、`:345` `restoreDependency`、`:285` `confirmDependency`；
`src/index.ts:555` 加载时恢复（`:552` 解析 profile 目录）。

**守护：** `test/manifest.test.ts`（`an interrupted upgrade is repaired on the next load`、
`an install that landed is not undone by its own record`、
`a record that no longer describes the manifest is discarded, not applied`、
`a corrupt record is ignored rather than trusted`）。

## 行号校对（2026-11-04）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/manifest.ts:40` `JOURNAL_FILE` | `src/host/manifest.ts:49` | ⚠️ 漂移 9 行 |
| `src/host/manifest.ts:235` `recoverPendingDrop` | `src/host/manifest.ts:363` | ⚠️ 漂移 128 行 |
| `src/host/manifest.ts:302` `dropDependency` | `src/host/manifest.ts:476` | ⚠️ 漂移 174 行 |
| `src/host/manifest.ts:345` `restoreDependency` | `src/host/manifest.ts:537` | ⚠️ 漂移 192 行 |
| `src/host/manifest.ts:285` `confirmDependency` | `src/host/manifest.ts:442` | ⚠️ 漂移 157 行 |
| `src/index.ts:555` 加载时恢复 | `src/index.ts:738`（`recoverPendingDrops(dir)`，单数壳在 `:363`） | ⚠️ 漂移 183 行 |
| `src/index.ts:552` 解析 profile 目录 | `src/index.ts:735`（`const dir = profileDirFrom()`） | ⚠️ 漂移 183 行 |

`recoverPendingDrop` 的漂移比其余几条都大，因为 §22 之后它被拆成了两层：
`recoverPendingDrops`（`:327`，批量，真正干活）和无参兼容壳 `recoverPendingDrop`（`:363`，
`return recoverPendingDrops(dir, options)[0] ?? { kind: 'none' }`）。加载点调用的是**复数**那个。
另外 `undoDrop`（`:397`）现在包在 `withManifestLock` 里，拿不到锁返回
`{ kind: 'failed', reason: LOCK_BUSY }` 并**保留记录**。这条是 §22 后来补的，§3 的三条判定不变。

## 拆分层之后新增的 §23：一条记录只够一个包

本页存档的 §3 原文写于 journal 还是「一个 profile 一条记录」的年代。2026-11-04 同日
补进来的 `AGENTS.md` §23 把磁盘格式改成了 `{ version: 2, records: DropJournal[] }`
（`JOURNAL_VERSION = 2` 在 `src/host/manifest.ts:70`，文件名没变，仍是
`package.json.upgrader-journal.json`）。**§3 的三条判定一字未改**，变的是「一次恢复
处理几条记录」：

| §3 原文的说法 | §23 之后的实际形态 |
|---|---|
| 每次加载调 `recoverPendingDrop(dir)` | 调 `recoverPendingDrops(dir)`（`:327`），返回 `RecoveryResult[]`，**逐条**修完；单数版（`:363`）退化成取第一条，只为兼容旧调用 |
| journal 有记录就处理 | 记录按 `name` 归属；`upsertRecord`（`:242`）只替换同名那条，`clearRecord(dir, name)`（`:256`）只删同名那条 |
| journal 损坏 → 忽略并清掉 | 旧格式（单个裸对象）**必须还能读**：`readRecords`（`:172`）见到 `records` 不是数组时，把整个顶层对象当成一条记录 |
| 恢复失败只 warn | 拿不到锁时返回 `{ kind: 'failed', reason: LOCK_BUSY }` 并**保留记录**，返回的是**每一条**的失败，不是一个总失败 |

`undoDrops`（`:373`）是锁内批量版，`undoDrop`（`:397`）处理单条；`recoverPendingDrops`
在锁外那次 `readRecords` **只用来判断「有没有记录」和「拿不到锁时报哪些名字」**，
注释写明 `Neither acts on a record`（`src/host/manifest.ts:329-333`）。

## 符号存在性（2026-11-04 逐条 grep）

| 原文里的符号 | 实际所在 | 结论 |
|---|---|---|
| `package.json.upgrader-journal.json` | `src/host/manifest.ts:49`（`JOURNAL_FILE` 的值） | ✅ 逐字一致 |
| `JOURNAL_FILE` | `src/host/manifest.ts:49` | ✅ 存在 |
| `recoverPendingDrop` | `src/host/manifest.ts:363`（批量版 `recoverPendingDrops` 在 `:327`） | ✅ 存在 |
| `dropDependency` | `src/host/manifest.ts:476` | ✅ 存在 |
| `restoreDependency` | `src/host/manifest.ts:537` | ✅ 存在 |
| `confirmDependency` | `src/host/manifest.ts:442` | ✅ 存在 |
| `restored`（返回的 kind） | `src/host/manifest.ts:427`（`{ kind: 'restored', ... }`） | ✅ 存在 |
| `console.warn`（恢复失败只警告） | `src/index.ts:740`、`:748` | ✅ 存在 |

## 守护用例核对（2026-11-04）

| 原文提到的用例 | 实际位置 | 结论 |
|---|---|---|
| `an interrupted upgrade is repaired on the next load` | `test/manifest.test.ts:230` | ✅ 存在 |
| `an install that landed is not undone by its own record` | `test/manifest.test.ts:248` | ✅ 存在 |
| `a record that no longer describes the manifest is discarded, not applied` | `test/manifest.test.ts:276` | ✅ 存在 |
| `a corrupt record is ignored rather than trusted` | `test/manifest.test.ts:295` | ✅ 存在 |

## 三条判定的代码依据

原文的三条判定不是三个分支的任意划分，各自对着一处**明确的 return**（都在 `undoDrop`，
`src/host/manifest.ts:397`）：

| 判定 | 代码依据 | 返回 |
|---|---|---|
| journal 有记录 + manifest 里确实缺这条 → 补回去 | `src/host/manifest.ts:412`（`Object.hasOwn` 为 false）→ `:416` 写回 `journal.spec` → `:426` 清记录 | `{ kind: 'restored' }`（`:427`） |
| journal 有记录 + manifest 里已经有了 → 只清 journal | `src/host/manifest.ts:412` 为 true → `:413` `clearRecord` | `{ kind: 'settled' }`（`:414`） |
| journal 损坏 / 描述不了当前 manifest → 忽略并清掉 | `src/host/manifest.ts:405-411`（`dependencies` 不是对象）→ `:409` `clearRecord` | `{ kind: 'none' }`（`:410`） |

第三条的注释原文写得很直白（`src/host/manifest.ts:406-408`）：`the record no longer
describes it. Dropping the record is the only safe move — inventing a 'dependencies'
object could undo a deliberate edit.` 这就是原文那句**绝不**凭猜测改 manifest。
写成「没有 dependencies 就造一个出来再补条目」看起来更「健壮」，实际是在回滚用户
手动删掉 `dependencies` 这件事。

## 「恢复只是修复，不是前置条件」

`src/index.ts:735-755` 整段包在 `try/catch` 里，`catch` 只做 `console.warn`（`:748`）。
注释也写明了理由（`src/index.ts:746-747`）：`Recovery is a repair, never a precondition:
a profile that cannot be repaired must still load the tab, which is the only way to fix it.`

反过来说：如果恢复失败就抛出去，标签页不加载，用户就失去了唯一一个能修 profile 的界面——
而那个界面正是这个插件本身。所以**恢复失败必须降级成日志**，不能升级成启动失败。
