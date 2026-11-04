# §24 详证：「文件装回去了」和「插件跑起来了」是两件事

判据在 [AGENTS.md §24](../../AGENTS.md#24-文件装回去了和插件跑起来了是两件事)。这一页是背景、
原始报告、三个信号的由来，以及这条规则为什么不能用一句话代替。

---

## 事故不是我们发明的，是官方报告的

`deepseek-ai/deepseek-harness` Discussion
[#11886](https://github.com/deepseek-ai/deepseek-harness/discussions/11886)
（2026-11-02，`Q&A`）：

> `[Bug][0.2.2-alpha.2] Failed rollback activation is reported as "plugin is not installed";
> the suggested Add action then returns already-installed`

报告人的复现链条，逐句拆开看：

1. 升级 `extra` 失败，宿主尝试回滚；
2. 回滚的 **install 阶段成功了** —— `package.json.dependencies.extra` 已经是 `1.0.0`，
   `listBundles()` 报 `{ installed: true, enabled: true }`；
3. 回滚的 **enable 阶段失败** —— `restore.stage = "enable"`、`application: "failed"`、
   `error.code = "operation-error"`，诊断里有 `dsh: warning: 1 entry did not activate`；
4. 对话框说的是 **"the plugin is not installed"**，并建议用户点 "Add plugin"；
5. 用户照做，得到 `already-installed`。

**没有一步是谎话，只是把「文件在不在」和「跑没跑」当成了一件事。** 而这两件事在回滚里
恰好会分开：装文件走 pnpm，激活走加载器，两次都可能独立失败。

## 我们自己的同一个洞

官方对话框的毛病，我们一模一样，只是藏在一个布尔里。修之前的 `rollBack`：

```ts
const result = await manager.installBundle(spec, { ...options, requestId })
const back = result?.application === 'applied' || result?.application === 'restart-required'
if (result?.error !== undefined || !back) {
  log(`  ! rollback refused (${result?.error?.code ?? 'no change'}); ${step.name}@${previous} is not installed — ` +
      'install it again from the Installed tab')
  return false
}
```

`application` 只描述「这次变更最后有没有让插件跑起来」。它回答 **否** 的时候，可能是

- pnpm 就没成 → 文件不在 → 「没装」是对的；
- pnpm 成了但宿主没激活 → **文件在盘上，只是没跑** → 「没装」是错的，而且是有害的。

第二支被当成第一支处理，于是日志把用户指向一个必然返回 `already-installed` 的动作。

## 三个信号：为什么一个字段不够

`ChangeResult` 里能回答这个问题的字段有三个，每个单独看都会骗人：

| 字段 | 单独看时的谎话 |
|---|---|
| `changed` | 只说 profile 被改写过。条目被写回、但 pnpm 没落地也是 `changed: true`。 |
| `packageResult.exitCode` | 只说 pnpm 跑通。pnpm 跑通不等于激活成功。 |
| `stage` | 只说宿主停在哪一步。停在 `enable` 也可能前面 pnpm 就炸了。 |

**三个同时成立**才等于「文件装回去了、只是没激活」：

```ts
function landedOnDisk(result: ChangeResult | undefined): boolean {
  if (result === undefined || result.changed !== true) return false
  if (result.stage !== 'enable') return false
  const exit = result.packageResult?.exitCode
  return exit === undefined || exit === 0
}
```

`exit === undefined` 也算通过，因为某些 manager 路径不返回 `packageResult`（没有 pnpm 参与
的 enable-only 变更）；那种情况 `changed && stage === 'enable'` 已经足够说明文件在。

## 三种结果，三种说法

`rollBack` 现在返回 `Rollback` 而不是 `boolean`：

```ts
type Rollback =
  | { kind: 'back' }                        // 装回去了，也跑起来了
  | { kind: 'inactive'; reason: string }    // 文件在盘上，宿主没激活
  | { kind: 'refused'; reason: string }     // 真的没装回去
```

对应到 `StepOutcome`：

- `kind: 'back'` → `rolledBack: previous`（沿用，含义未变）；
- `kind: 'inactive'` → **`inactive: previous` + `rollbackReason: reason`**，**不填 `rolledBack`**；
- `kind: 'refused'` → 只填 `rollbackReason`。

**不要**为了「字段少一点」把 `inactive` 合并回 `rolledBack`：`rolledBack` 在上层被当作
「旧版本可用」，而一个没被激活的插件对用户来说就是不见了。

## 面板必须分开渲染

`Tab.ts` 的失败横幅有一条额外分支，优先级**高于**通用的 `name: detail (code)` 拼接：

```ts
const inactive = failures.filter((failure) => failure.inactive !== undefined)
if (inactive.length > 0) {
  setBanner({
    tone: 'err',
    text: inactive
      .map((failure) =>
        t('inactiveAfterRollback', failure.name, failure.inactive ?? '',
          failure.rollbackReason ?? (failure.message ?? 'error')),
      )
      .join(' · '),
  })
} else if (failures.length > 0) { /* 通用拼接 */ }
```

`inactiveAfterRollback` 的两种语言都做了两件事：说出**真实发生了什么**，以及**明确阻止重装**
（「去『已安装』里重新启用它，别再装一遍——那会得到『已安装』」）。这不是客套话：报告人正是
照着旧文案去装了一遍。

## 重试激活不要走 `installBundle`

把「没激活」修好，直觉是再 `installBundle` 一次。**必然失败**：宿主的 `installBundle` 对
`package.json` 里已声明的依赖一律 `already-installed`，这正是 [§2](02-in-place-replacement.md)
存在的原因。正确路径是让加载器放手再抓一次：

```
setBundleEnabled(name, false) → setBundleEnabled(name, true)
```

这也解释了为什么 `listBundles().enabled` **不能**用来判断「跑起来了」：它返回的是**用户选择**
（`manifest.dsh.profile.bundles` 里有没有这个名字），不是 root fiber 的 phase。想知道
「到底跑起来没有」，官方答案是 `pluginInventory/list` 的 `phase` 字段
（`pending` / `loading` / `active` / `failed` / `unloading` / `null`）。

## 回归用例

`test/install.test.ts`：

- `a rollback that installs but cannot activate is not called "not installed"` —— 第四次
  install 返回 `{ changed: true, application: 'failed', stage: 'enable',
  packageResult: { exitCode: 0, ... }, error: { code: 'operation-error', diagnostic: 'dsh:
  warning: 1 entry did not activate' } }`；断言 `inactive === '1.0.0'`、`rolledBack ===
  undefined`、`rollbackReason` 保原文、日志**不含** `is not installed`、日志**含**
  `is installed but did not activate`。
- `a rollback that is refused says so instead of pretending` —— 真失败时仍然必须说
  "is not installed"，并断言 `inactive === undefined`（两种说法不能互相顶替）。

## 哨兵

把 `landedOnDisk` 的第一行换成 `return false`（等价于修复前的行为），新用例必须变红。
实测：`tests 43 / pass 42 / fail 1`，红的正是
`a rollback that installs but cannot activate is not called "not installed"`。改回来 43/43。
