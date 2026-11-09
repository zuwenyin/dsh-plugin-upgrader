# §26 详证：不兼容不能是一条死路

判据在 [AGENTS.md §26](../../AGENTS.md#26-不兼容不能是一条死路)。这一页记的是当年的三处
真实观察、宿主闸门的时序、为什么 `blocked` 不计入体检，以及「读不到 ≠ 不兼容」的来由。

---

## 一、起点不是 bug 报告，是一次数据观察

1.7.5 之后做的第一件事不是写功能，是量一下这页到底有没有人在用。量出来的三条：

- **npm 日下载的 8.3 倍溢价在发版日**（`scripts/downloads.mjs`，见 §25），安静日基线
  大部分是镜像与目录站扫描器。
- **GitHub 14 天 25 个独立访客**（`traffic/views`），而 npm 同期报了 2 千多次下载。
  两个数字差 35 倍，说明「下载」不等于「有人打开过这个仓库」。
- **我们的下载摊在 20 个历史版本上**，`latest` 占比 0.0%；真用户只装 latest 的对照组
  （`dsh-plugin-radar` 86.5%、`dsh-plugin-hub` 91.9%）说明我们这份流量是**遍历 packument
  的机器**。

结论是：**继续铺渠道的边际收益接近 0**（当时 12 个 PR / 3 个 issue / 5 条技术评论 / 1 篇
自荐贴全部零回复）。能做的只剩让人**留下来**：装了插件的人，在他升级 DSH 之后不要静默
失效。§26 就是那件事的产品形态。

## 二、宿主的闸门在 bundle 卸下之后才说话

这是整条规则的物理基础，也是最容易写错的地方。

`pluginManager.installBundle` 的兼容性判定发生在 pnpm 已经跑完之后：
`evaluatePluginCompatibility` 拒绝时，旧版本**已经被摘掉**了。§20 就是为这件事加的预检
（`InstallGuard` 在 `runStep` 动手之前问一次）。

但 §20 只管「点了按钮之后」。它管不到另一种情形：

> 用户装了 `foo@1.0.0`，它声明 `engines.dsh: ">=0.2.0"`；用户把 DSH 升到 `0.1.6`。
> 从此**这个插件不会被加载**，而页面上那一行看起来完全正常——它不是「可升级的」，
> 所以不亮；它也不是「有问题的」，因为没有字段能表达「你正在跑的这个本来就不允许」。

用户看到的是「插件莫名其妙不工作了」，我们的页面什么都没说。

## 三、为什么 `blocked` 覆盖不了这件事

`blocked`（1.7.x 就有）是这么算的：

```ts
if (entry.upgradable && entry.latest !== undefined) {
  const head = shaped.versions.find((version) => version.version === entry.latest)
  if (head !== undefined && head.compatible === false) {
    entry.upgradable = false
    entry.blocked = { version: head.version, requires: head.requires ?? '' }
  }
}
```

三个特征决定了它答不了上面的问题：

1. **它看的是 `latest`，不是磁盘上那个版本。** 已装版本不兼容、而最新版兼容时，
   `head.compatible` 是 `true`，`blocked` 根本不出现。
2. **它在 `upgradable` 为真时才算。** 已经是最新的包连这个分支都进不去。
3. **它的语义是「新的那个会被拒」，不是「你现在跑的那个从来不被允许」。** 两者严重性
   差一个量级，混成一句话会让用户以为「不升级就没事」。

所以 `installedIncompatible` 是**独立字段**，独立一行文案，不与 `blocked` 合并：

```ts
const current = shaped.versions.find((version) => version.current === true)
if (current !== undefined && current.compatible === false) {
  entry.installedIncompatible = { requires: current.requires ?? '' }
}
```

**`compatible` 只有在宿主闸门会拒绝时才是 `false`。** `shapePackument` 里它由
`meetsDshRequirement` 算出，缺 requirement 或缺 runtime 都是 `undefined`，只有明确不满足
才是 `false`（`src/host/registry.ts`）。所以 `=== false` 这个判断本身就已经包含了
「读不到就不判」。

## 四、`recommended`：把死行救活

修 `installedIncompatible` 只解决了「说出来」。真正让页面变死的是另一件事：

> `latest` 不兼容 → `upgradable = false` + `blocked` → **整行没有任何可点的动作**。
> 而实际上 1.1.0 明明装得了。

所以紧接着从同一份 `shaped.versions`（已按 SemVer 降序）里找：

```ts
const recommended = shaped.versions.find(
  (version) =>
    version.compatible !== false &&
    compareVersions(version.version, bundle.version ?? '') > 0 &&
    entry.latest !== undefined &&
    compareVersions(version.version, entry.latest) <= 0,
)
if (recommended !== undefined) {
  entry.recommended = recommended.version
  entry.upgradable = true
}
```

四个条件各挡一种错：

| 条件 | 挡住的错误 |
|---|---|
| `compatible !== false` | 推荐一个同样装不了的版本 |
| `> bundle.version` | 推荐降级（那是「切到某个历史版本」，不是升级） |
| `entry.latest !== undefined` | registry 没有 `dist-tags.latest` 时凭空造一个目标 |
| `<= entry.latest` | **提拨 tag 之后发布的 prerelease**（同 §5 的精神） |

最后一条最容易在重构里丢掉。`shaped.versions` 里可能含有 `dist-tags.latest` 之后才发布的
预发布版本；如果没有这个上界，`recommended` 会变成那个 prerelease，等于页面自己把
`latest` 的定义改掉了。`test/overview.test.ts` 的
`the newest release never loses to a prerelease published after it` 专门钉这一条。

`entry.upgradable = true` 那一行同样不能删：`blocked` 的分支刚刚把它关掉了，不重新打开，
`recommended` 就只是一个没人用的字段。

## 五、安装目标只能有一处

修完之后，客户端里「装哪个版本」有三个来源：`row.recommended`、`row.latest`、`row.version`。
只要有一处还在用 `row.latest`，那条路径就会去装一个宿主会拒的版本——而这正是 §20 存在
的理由。所以 `Tab.ts` 里只有一个：

```ts
const targetOf = (row: OverviewRow): string => row.recommended ?? row.latest ?? row.version ?? ''
```

`upgradeOne` / `approveAndRetry` / `upgradeAll` / `upgradePicked` 全部走它，
`PluginRow` 里的按钮也用 `const target = row.recommended ?? row.latest` 同样的顺序。
**新增任何安装入口都要用这两者之一，不要再写 `row.latest`。**

## 六、`versionError` 是数据，不是文案

`overview.ts` 里那几句是**固定的英文句子**，它们出现在 `versionError` 字段里，而这个字段
是宿主对外数据的一部分：

- `'version unknown'`
- `'not a profile-managed package'`
- `'local path install: the registry has no published copy'`
- `'local path install: the version comes from the directory, not the registry'`
- `'registry lookup failed'`
- `` `${kind} source: no registry history` ``

它们**违反** AGENTS.md §11「所有面向用户的文案都走 copy.ts」，但改 host 侧不行：
`test/self-row.test.ts` 直接断言这些原文（`/no published copy/`），而且 `PluginRow` 的
`retriable` 正则 `/unreachable|timeout|registry \d|github/i` 也依赖 `failure` 的**原值**
（那些不是固定句子，是 registry / 网络错误透传上来的）。

所以本地化放在客户端的一次映射里，`versionNoteOf(failure, t)`：

- 认识的那六句 → 对应的 copy 键（`` `${kind} source: …` `` 用 `/^([a-z]+) source: no registry history$/`
  取出 kind，把它当**数据**放进句子里，不是查询某个键）；
- **不认识的原样返回。** 这一条最重要：`registry unreachable: fetch failed (ECONNREFUSED)`
  那种句子翻译了就没法搜了，而且它常常是整行唯一的线索。

`failure` 传给 `versionNoteOf` 之前和之后都还是原值，翻译只发生在**显示**这一步。

## 七、体检为什么不算 `blocked`

「需处理 n」这个数字要能**归零**才有意义。`blocked` 是「有一个更新的版本，但你现在装不了
它」——这不是一个出问题的人可以修好的状态（他本来就不需要装那个版本），把它算进去，
数字就永远大于零。

所以 `needsAttention` 只算**已经在这个 profile 里出问题**的四件事：

```ts
export function needsAttention(row: OverviewRow): boolean {
  return (
    row.installedIncompatible !== undefined ||
    (Array.isArray(row.mirrorMissing) && row.mirrorMissing.length > 0) ||
    (row.versionError !== undefined && row.versionError !== '') ||
    (Array.isArray(row.pendingBuilds) && row.pendingBuilds.length > 0)
  )
}
```

空数组不算（`mirrorMissing: []` 与 `undefined` 同义），空字符串不算（`versionError: ''`
在 host 侧就是「没有错误」的意思）。`test/diagnostics.test.ts` 里 6 条用例逐项钉这四件事，
外加一条 `blocked` **不**计数。

「可升级」同理不计入——那是好事，不是需要处理的事。

## 七之二、待批准构建：manager 不给的，只能自己读

这一条是 2026-11-09 的 bug 报告逼出来的（用户点了「一键升级」10 个，`dsh-xdpool@2.6.4`
每次都失败，页面只回一段 ETIMEDOUT 的 pnpm 日志，没有别的话可说）。

**链路本来是通的，只有一处空着。** `PluginRow` 有 `pendingBuilds` 横幅和「批准并重启」按钮，
`Tab.approveAndRetry` 会把它们当 `approveBuilds` 发下去，`runStep` 会把它塞进
`installBundle` 的 options，manager 在 pnpm 之前调 `approveBuilds(dir, names)`。但
`overview.ts` 从来没填过 `pendingBuilds`——于是那条横幅在真实数据下永远不出现，只有测试里
手写的行才出现过。

**为什么必须自己读：** manager 的 `pendingBuilds` 只在 **失败** 的 `installBundle` 返回值里
出现（`lib/index.js:2057` 附近 `recordPendingBuilds` → `throw new Error(run.output)`），
`change()` 接住这个 throw 并把它变成 `application: 'failed'` 的 ChangeResult。也就是说
**只有「刚失败过一次」才看得见**，而页面是在这之前渲染的；而且 `approveBuilds` /
`recordPendingBuilds` / `readPolicy` 都没有从包 `exports` 出来（没有 `./build-approval`
子路径），import 不到。

所以 `src/host/builds.ts` 自己扫 profile 的 `pnpm-workspace.yaml`：

```ts
export const PENDING_BUILD = 'set this to true or false'
const SECTION = 'allowBuilds'
const PATTERN = /[*?]/
```

三条细节都是有来历的：

- **`PENDING_BUILD` 逐字相等才认。** 这是 manager 自己写的占位符（`UNDECIDED_BUILD`）；
  只有 `true` / `false` 是「已答复」，别的字符串一律不是。手改成 `set this to true of false`
  就该留在「没答复」之外——那是人的错字，不是待批准。
- **`[*?]` 跳过。** `allowBuilds` 的键可以是通配（`'@scope/*'`），那种键删不掉也答不了，
  不该冒出来让人点。
- **只认列 0 的顶层键切节。** 这个文件后面还有 `minimumReleaseAgeExclude:` 这种列表，
  里面全是 `- name@a || b`，一旦「看到缩进就当 allowBuilds」就会把版本范围当成包名。

`readPendingBuilds` 读不到文件返回 `[]` 而不是抛：没有 `pnpm-workspace.yaml` 是**正常状态**
（刚建的 profile 就是这样），不是错误。

**两条路都要留。** `runStep` 既从 `result.pendingBuilds` 拿（manager 读到了的情况），也
从 diagnostic 里那句 `Ignored build scripts:` 反查（manager 读不到文件、只在 pnpm 输出里留下
句子的情况）。两条都被哨兵验证过会红：把 diagnostic 那条断掉 → “the diagnostic alone is
enough…” 失败；把 overview 的赋值断掉 → 两条 overview 用例失败。

**批量必须跳过，而且要说明。** `batchable` 加了 `pendingBuilds` 为空的条件，否则同一个死步骤
会被「一键升级」反复重试，每次都失败得一模一样——用户看到的是「升级失败」，看不到「有一件事
没回答」。跳过之后 `upgradable` 仍然是 `true`（行上确实有更新版本），所以：

- 「可升级 n」用 `upgradableRows`（全部），批量按钮用 `upgradable`（跳过的）——两个数字
  不一样，旁边的横幅解释差在哪；
- `skippedBuilds.length > 0` 时连「全部已是最新」都不能显示（`upToDate` 条件加了
  `skippedBuilds.length === 0`）。

**批准是运行别人的代码，所以只能一次一个。** 这不是可用性问题：`allowBuilds: true` 等于
同意在安装时执行那个包带来的任意脚本。批量里代用户做这个决定，和邮箱里替人点「允许宏」
是同一种错。文案也按这个说（`buildBlockedFailed` 两句都点明「等于同意在安装时运行它带来的
代码」）。

真机验证（2026-11-09，`D:\dsh-data\profiles\desktop`）：

```
readPendingBuilds(dir)  → ['dsh-xdpool@2.6.4']
pendingFor(all,'protobufjs') → []   # protobufjs: true，已答复
buildOverview(...)      → dsh-xdpool 行 upgradable=true, pending=['dsh-xdpool@2.6.4']
```



## 八、诊断信息不新增能力信号

「复制诊断信息」是 §15 里最容易被破坏的一条边界。做法刻意朴素：

- 一个纯函数 `diagnosticsReport(input, t)`，输入是页面上**本来就有**的东西
  （`runtimeVersion` / `registry` / `generatedAt` / `rows`），输出一段 markdown；
- 客户端 `navigator.clipboard?.writeText(text).then(...).catch(() => {})`，照
  `RestartDialog` 的写法；
- **不加路由、不读文件、不发请求。**

诊断内容只写一行一句，够贴进 issue 即可：

```
# dsh-plugin-upgrader diagnostics
- DSH: 0.2.1-rc.5
- registry: https://registry.npmjs.org
- generated: 2026-11-05T06:31:00.000Z
- plugins: 12
- foo@1.0.0 · latest 1.2.0 · recommended 1.1.0
  - blocked: 1.2.0 requires DSH >=0.2.0-rc.2 <0.3.0-0
  - installed requires DSH >=0.2.0-rc.2 <0.3.0-0
```

`recommended` 等于 `latest` 时不重复打印（那只是噪声）。

## 九、页脚为什么必须有 DSH 版本

`Overview.runtimeVersion` 从 1.7.x 就在 payload 里（`ctx.get('dshVersion', false)` 或
`runtimeVersionOf(process.argv)`），但**客户端从来没显示过它**。后果是：用户来报 bug 时，
「你跑的是哪个 DSH」这个问题只能靠猜，而整个 §18/§20/§26 的判断都建立在那个版本上。

页脚那一行同时兼两个作用：告诉用户「页面是按哪个版本判断的」，以及——
`runtimeVersion` 为 null 时——**如实说「DSH 版本未知」**，因为那种情况下所有兼容性判断
都是「没判」，页面不能假装它们通过了。

## 十、这一条的守护用例

| 测试 | 钉住的判据 |
|---|---|
| `an older compatible release is offered when the newest one is refused` | `latest` 被拒 → `recommended` 是低一档的兼容版本，且 `upgradable === true` |
| `the newest release never loses to a prerelease published after it` | `recommended` 不超过 `latest` |
| `the installed version itself can be the incompatible one` | `installedIncompatible` 从 current 行算，与 `blocked` 独立 |
| `nothing is claimed about the installed version when the runtime is unknown` | 读不到 runtime → `installedIncompatible === undefined` |
| `test/diagnostics.test.ts`（12 条） | 「需处理」的四个来源 + `blocked` 不计入 + 报告格式 |
| `test/version-note.test.ts`（7 条） | 六句已知文案的映射 + 未知原文逐字透传 |
| `test/builds.test.ts`（12 条） | 占位符逐字匹配、`true`/`false` 不算待批、顶层键切节、通配键跳过、引号、行尾注释、flow 映射、`pendingFor` 的 `name@` 前缀 |
| `a build-script refusal names what has to be approved` | 失败会带 `message: 'build-blocked'` + 只含本包名的 `pendingBuilds`（整 profile 列表被 `pendingFor` 收窄） |
| `the diagnostic alone is enough when the manager could not read the file` | manager 只留下 pnpm 输出时也能反查出待批键 |
| `an answered script is not offered for approval again` | `allowBuilds: pkg@2.0.0: true` → `pendingBuilds === undefined`（答复过的不再问） |
| `an ordinary failure is not relabelled as a build refusal` | 普通失败不会被说成构建被拒 |
| `a profile with unapproved scripts marks that package and only that one` | overview 只标本包，`blocked`/`upgradable` 不受影响 |
| `a package with unapproved scripts is still offered as an upgrade` | `upgradable === true` 与 `pendingBuilds` 同时成立 |

哨兵验证做过的六处（见提交信息）：`needsAttention` 恒 false → 4 条红；报告里的
`recommended` 条件放宽 → 1 条红；`pathNoPublished` 指向另一个键 → 1 条红；
`versionNoteOf` 给未知原文加后缀 → 2 条红；`buildBlockedOutcome` 的 diagnostic 回退改成恒
`undefined` → 1 条红；overview 的 `entry.pendingBuilds = blockedBuilds` 改成跳过 → 2 条红。

## 十一、符号位置（2026-11-09 核对）

这一页和 §24 一样是手写的（没有「原文快照」整节），所以 AGENTS.md 里出现过的符号必须在这里
逐个点名，否则判据搬走了就没处查。

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `installedIncompatible`（行字段） | `src/client/types.ts:81`（`OverviewRow` @ `:37`） | ✅ |
| `recommended`（行字段） | `src/client/types.ts:90` | ✅ |
| `pendingBuilds`（行字段） | `src/client/types.ts:62`；`StepResult` 也有一个 `:133` | ✅ |
| `targetOf` | `src/client/components/Tab.ts:380` | ✅ |
| `const target` @ `PluginRow` | `src/client/components/PluginRow.ts:77` | ✅ |
| `onlyNeedsAttention` | `src/client/components/Tab.ts:85`（过滤 `:336`、按钮 `:512`） | ✅ |
| `batchable` / `skippedBuilds` / `upgradableRows` | `Tab.ts:307` / `:329` / `:320` | ✅ |
| `readPendingBuilds` / `pendingFor` | `src/host/builds.ts`（`PENDING_BUILD` 也在那里） | ✅ |
| `needsAttention` | `src/client/diagnostics.ts:25` | ✅ |
| `diagnosticsReport` | `src/client/diagnostics.ts:57` | ✅ |
| `versionNoteOf` | `src/client/format.ts:129` | ✅ |
| `recommendedHint` | `src/client/copy.ts:62`（英文 `:223`），用在 `PluginRow.ts:178`、`:219` | ✅ |
| `upgradeTo` | `src/client/copy.ts:63`（英文 `:224`），用在 `PluginRow.ts:222` | ✅ |
| `runtimeVersionUnknown` | `src/client/copy.ts:70`（英文 `:231`），用在 `Tab.ts:761`、`diagnostics.ts:58` | ✅ |
| `buildBlockedFailed` / `batchSkippedBuilds` | `src/client/copy.ts:128` / `:130`（英文 `:295` / `:297`） | ✅ |
| `buildBlocked` / `approve` | `src/client/copy.ts:126` / `:127`（英文 `:293` / `:294`） | ✅ |

`src/client/types.ts` 与 `src/client/format.ts` 这两个路径值得单独记一笔：**`src/host/types.ts`
并不存在**，所有跨 host / client 的类型都在 `src/client/types.ts` 里（早期写错过两次）。
`versionError` 的行字段在 `src/client/types.ts:59`，四处写入点全在 `src/host/overview.ts:229`、
`:232`、`:236`、`:250` —— `retriable` 正则吃的就是这里写下去的原文。
