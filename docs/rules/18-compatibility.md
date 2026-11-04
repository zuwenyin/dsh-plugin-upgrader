# 18 每个版本先跟「正在跑的 DSH」比一次 —— AGENTS.md §18 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 18 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 18. 每个版本先跟「正在跑的 DSH」比一次，再决定要不要给按钮

**不可退化。** 1.7.0 修的真实事故：用户在 DSH `0.2.1-rc.5` 上把
`@smalltailqwq/dsh-client-ui-skin-maid-atelier` 从 `0.1.9` 切到 `0.1.5`。`0.1.5` 声明的是
`peerDependencies["@deepseek-ai/dsh"] = ">=0.1.7-rc.1 <0.1.8-0"`，宿主的兼容性闸门拒绝了它
——但拒绝发生在 pnpm 已经把 `0.1.9` 摘掉之后，结果 profile 里**这个插件整个没了**，
`cordis.patch.yml` 里还留着一个悬空的 `- id:`。

- **判定规则必须和宿主一模一样**：`engines.dsh` 存在时**只看它**，`peerDependencies`
  被忽略；否则 `peerDependencies` 里每个 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 都要满足，
  `workspace:^` / `~` / `*` 视为「就是当前运行时」，预发布参与比较。
  改这里之前先对照宿主侧的 `plugin-compatibility`——页面说「可以」而宿主随后拒绝，
  比页面什么都不说更糟。
- **运行时版本从宿主的入口读，不从固定路径读。** 桌面壳把入口放在 `app.asar` 里，那里读到的
  是打包进去的 `0.2.1-rc.5`；命令行启动跑的是 profile 里的 `dsh/lib/bin.js`，那里读到的
  是 profile 那份——而 profile 里的 `@deepseek-ai/dsh-app-boot` 是指向 npx 缓存的 junction，
  实测 `0.1.2-rc.1`。两者在真实机器上确实不一样，**从入口走两边都对，写死路径会错一半**，
  而「把本来能装的版本标成装不了」比不标更糟。代码在 `src/host/runtime.ts`，
  起点是 `process.argv` 里的宿主入口。
- **读不到就什么都不标。** `compatible` 只有「读到范围且确实不满足」时才是 `false`，
  否则是 `undefined`（缺席）。不要改成读到就写 `true`/读不到就写 `false`：
  前者在版本读不到时骗人，后者会藏掉所有版本。
- **两个方向都要管**：降级（历史里不兼容当前 DSH 的版本禁用切换按钮）与升级
  （`latest` 不兼容当前 DSH 时 `upgradable` 必须是 `false`，并把 `blocked` 带到行上）。
  只做其中一边，另一边照样能把包弄没。
- **区间匹配不许随便「简化」。** `src/host/version.ts` 的 `satisfiesRange` 与
  `node-semver` 在 `includePrerelease` 下逐位对齐，已经在 49 个 range × 41 个版本
  共 2035 组上验证过。写这段时最初有三处错：`~0.1.7-rc.1` 漏了 patch 下界（会放过
  `0.1.6`）、部分版本（`1.x` / `1.2`）下界缺 `-0`（`0.2.0-rc.1` 会漏掉）、连字符区间上界
  用 `<=`（`1.2.3 - 2.0.0` 会放过 `2.0.0-rc.1`）。再改这段就再跑一次那个对比。

**代码：** `src/host/runtime.ts`（`runtimeVersionOf`）、`src/host/version.ts`（`satisfiesRange`）、
`src/host/registry.ts`（`dshRequirementOf` / `meetsDshRequirement` / `shapePackument` 的第 4 个参数）、
`src/host/overview.ts`（`blocked` 与 `upgradable` 的降级）、`src/client/components/VersionLine.ts`
（禁用切换按钮）、`src/client/components/PluginRow.ts`（`blocked` 提示）。

**守护：** `test/compatibility.test.ts`（8 条，两条主用例就是上面那两个方向）、
`test/runtime.test.ts`（4 条：从入口旁边的副本读、第二个入口也要试、读不到就返回空、
空白版本号不算版本）、`test/version.test.ts`（14 条区间匹配）、`test/overview.test.ts`
（`an upgrade the host would refuse is not offered as an upgrade` 等 3 条）。

---

## 行号校对（2026-11-04）

§18 的原文只点名了符号和文件，**没有任何一条 `path:line`**。下面逐个确认符号存在。

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `runtimeVersionOf` @ `src/host/runtime.ts` | `src/host/runtime.ts:104` `export function runtimeVersionOf(argv: readonly string[]): string \| undefined` | ✅ 一致 |
| 「起点是 `process.argv` 里的宿主入口」 | `src/host/runtime.ts:105` `for (const candidate of argv.slice(1, 1 + ENTRY_DEPTH))` | ✅ 一致 |
| `satisfiesRange` @ `src/host/version.ts` | `src/host/version.ts:347` | ✅ 一致 |
| `dshRequirementOf` @ `src/host/registry.ts` | `src/host/registry.ts:110` | ✅ 一致 |
| `meetsDshRequirement` @ `src/host/registry.ts` | `src/host/registry.ts:139` | ✅ 一致 |
| `shapePackument` 的第 4 个参数 | `src/host/registry.ts:629` 定义；第 4 个参数 `runtimeVersion` 在 `:633` | ✅ 一致（确实是第 4 个，且可选） |
| `blocked` / `upgradable` 的降级 @ `src/host/overview.ts` | `blocked?: { version; requires }` 声明在 `:104`；降级分支在 `:274–278` | ✅ 一致 |
| 禁用切换按钮 @ `VersionLine.ts` | `src/client/components/VersionLine.ts:45` `const foreign = version.compatible === false`；`:86` `disabled: busy \|\| version.current === true \|\| foreign` | ✅ 一致 |
| `blocked` 提示 @ `PluginRow.ts` | `src/client/components/PluginRow.ts:131–138`，用 `t('incompatibleLatest', ...)` | ✅ 一致 |
| 宿主侧的 `plugin-compatibility` | **本仓库里不存在**，只在 AGENTS.md 自己这句里出现 | ⚠️ 外部包（宿主侧代码），本仓库无法 grep 校对 |
| `engines.dsh` 只看它 | `src/host/registry.ts:111–114`：`const engine = manifest?.engines?.dsh ?? manifest?.dsh?.engines?.dsh`，有值即 `return { source: 'engines' }` | ✅ 一致 |
| peers 的匹配名单 | `src/host/registry.ts:93` `DSH_PEER = '@deepseek-ai/dsh'`、`:94` `DSH_PEER_PREFIX = '@deepseek-ai/dsh-'` | ✅ 一致 |
| `workspace:^` / `~` / `*` 视为当前运行时 | `src/host/registry.ts:97` `WORKSPACE_PEERS = new Set(['workspace:^', 'workspace:~', 'workspace:*'])`，`:124` 跳过 | ✅ 一致（注意原文写的是 `workspace:^`，代码里是 `workspace:^` 的三种 `workspace:` 前缀形式） |
| 2035 组对比 | 不在代码里，记录在 `README.md:307-309`、`README.en.md:368`、`CHANGELOG.md:74`、`release-notes/v1.7.0.md:23` | ✅ 有据可查，但**代码里没有这个数字** |

**结论：§18 没有行号漂移（它本来就没有行号）。** 唯一的「找不到」是
宿主侧的 `plugin-compatibility`——那是宿主包里的模块，不在本仓库，无法在此校对。

### 守卫的条数复核

| 文件 | AGENTS.md 写的 | 实际 | 结论 |
|---|---|---|---|
| `test/compatibility.test.ts` | 8 条 | 8 条 | ✅ |
| `test/runtime.test.ts` | 4 条 | 4 条 | ✅ |
| `test/version.test.ts` | 14 条「区间匹配」 | 文件共 14 条 test，但**只有 7 条**是区间匹配（`:61` `:67` `:73` `:89` `:96` `:103` `:108`）；其余 7 条是 `parseVersion` / `compareVersions` / `releasePathOf` | ⚠️ 条数对，归类不准——14 是**整个文件**的条数，不是区间匹配的条数 |
| `test/overview.test.ts` | 3 条（点名 `an upgrade the host would refuse is not offered as an upgrade`） | 该用例在 `:191`；与 DSH 兼容相关的另两条是 `:219` `a compatible upgrade stays an ordinary upgrade`、`:237` `the runtime version reaches the page, and an unreadable one blocks nothing` | ✅ 3 条属实（原文说的是「等 3 条」，不是该文件全部条数） |

`test/version.test.ts` 的归类偏差值得记一笔：AGENTS.md 写「14 条区间匹配」，
实际是「14 条总用例，其中 7 条覆盖区间匹配」。**数字没错，标签错了**——
拆分时如果照抄会继续误导人，所以 fragment 里只写文件名、不写条数。
