# 12 安装源是用户能改的设置，不是让用户改文件 —— AGENTS.md §12 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 12 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 12. 安装源是用户能改的设置，不是让用户改文件

**不可退化。** issue #1 的原话是「除了让AI改，就不能自己改吗」：默认源是
`registry.npmjs.org`，想换 `registry.npmmirror.com` 只能改 `~/.npmrc` 或
`cordis.patch.yml`。插件页自己的安装对话框有换源，但那是**装失败后的补救**，
不保存，下次还是默认源。

- 版本页顶部有「注册表」按钮，打开**安装源对话框**：自带源（官方源 / 大陆镜像）、
  `pluginManager` 配的源、用户自己加的源，外加「跟随 pnpm 配置」（默认，等同于此前的行为）。
- **自带源不能改也不能删，而且是结构上做不到**：它们是 `WELL_KNOWN_REGISTRIES` 常量，
  永远不写进 `customRegistries`，所以列表里根本没有那一行可以删。**不要**改成「渲染出来
  但把按钮 disabled」——那种写法会在一次看起来很无辜的重构里被恢复成可点。
- 自己加的源可以改、可以删；删除或改写正在用的那个时，`registry` 必须一起跟着变，
  否则安装会被指向一个列表里已经不存在的地址。
- **读和写必须是同一个源**：`registryBase()` 决定版本列表从哪读，`runStep` 把同一个值
  交给 `installBundle`。只有一边跟随的话，列表会列出目标源根本没有的版本。
- 选择写进 profile（`cordis.patch.yml` 的 `plugin-upgrader` 行），重启和换浏览器都还在。
- 每一行都能「测试」：`POST /api/plugin-upgrader/registry/test` **并发**打 `/-/ping` 和根地址，
  谁先 2xx 用谁（`PROBE_TIMEOUT_MS = 5000` 是整次探测的预算，不是每个请求的）。
  探测的是**调用方给的地址**，所以还没保存的草稿也能测。
- **这两条路不能改回串行。** `registry.npmmirror.com` 的 `/-/ping` 在某些网络要 3～15 秒，
  根地址只要 0.3 秒；串行会把整个预算花在慢的那条上，然后把大陆镜像报成「连不上」——
  那正是这个功能存在的理由。失败时的原因也要挑最具体的：有状态码报状态码，其次是超时
  （`timed out after N ms`），最后才是网络错误原文。

**为什么必须用 volatile Config 而不是别的办法：**

- `SettingsForms.describe()` 只投影带 `.volatile()` 的字段，没有 volatile 字段的插件
  **完全没有设置页**；而且 `autoGenerate` 不生成页面，客户端必须自己画。
- 非 volatile 的写入会重启插件（`Entry.update` → 重新挂载）。volatile-only 的写入走
  `_commitVolatile()`，直接改运行中的引用并发 `loader/volatile-update`，不重启。
- 所以 `apply` 必须**每次读** `config.registry.get()`，不能在加载时把值抄成字符串——
  抄一次就等于把设置钉死在启动时的那个源上，正是这个功能要避免的 bug。
- 旧的 `settings.register(ns, schema)` API 在 0.1.7 之后不存在了；从
  `@deepseek-ai/dsh-settings` 里 import 那些被删掉的具名导出会让宿主直接起不来。

**代码：** `src/host/config.ts`（`Config`、`savedRegistry`）、`src/host/registry.ts`
`probeRegistry` / `PROBE_TIMEOUT_MS`、`src/host/bundle.ts:66`
`registryBase(registries, preferred)`、`src/host/install.ts:436` `runStep(..., registry)`、
`src/index.ts` 的 `chosenRegistry()` 与 `POST registry/test` 路由；浏览器端
`src/client/registry.ts`（`useRegistrySetting`、`offeredRegistries`、`addSource` /
`editSource` / `removeSource`）、`src/client/components/SourceDialog.ts`。
文案 `src/client/copy.ts` 的 `registry*` 与 `source*` 两组。

**守护：** `test/config.test.ts`（默认值、两处 volatile 标记、地址校验、旧配置兼容、
数组整体校验）、`test/sources.test.ts`（13 条：自带源识别、增删改的越界 / 重复 /
非法地址拒绝）、`test/probe.test.ts`（8 条：两条路并发、慢 ping 不掩盖快根地址、
`/-/ping` 被拒时根地址兜底、状态码优先于超时、超时说清预算是多少、空地址不发请求）、
`test/install.test.ts`
（「a chosen registry is passed to the manager」「no choice leaves the manager own
registry in charge」——`undefined` 和 `null` 对 manager 是两件事，前者保留
`pluginManager.registry`，后者会覆盖成 pnpm 的源）、`test/overview.test.ts`
（「the saved registry is what versions are read from」）。

**宿主没有 `configForms` 时**（没挂 ui-settings）：标签页照常渲染，只显示源、不给改，
并说明原因。**不要**为了「看起来能用」而把选择存进 localStorage——那只在一个浏览器里
生效，用户会以为改成功了。

## 为什么这条存在

issue #1 的形状是：**功能明明有，但入口在用户改不了的地方**。换源这件事在插件页的安装
对话框里已经存在过一次，但那是「这一次装失败了」的补救手段——不保存、不跨会话，用户下次
还是被打回 `registry.npmjs.org`。让用户去编辑 `~/.npmrc` 或 `cordis.patch.yml` 不算解决：
那两份文件是用户全局的 npm 配置与宿主自己的 profile 层，为了装一个插件去改它们，改错一个
字就是整台机器上的所有 pnpm 操作一起坏。

所以这条规则真正要求的是三件事叠在一起，缺一条就退化成「看起来能改」：

1. **入口是设置，不是文档。** 版本页顶部那个「注册表」按钮打开的是对话框，不是一段让他
   去改文件的说明。
2. **选择要活过重启和换浏览器。** 所以写进 profile 的 `cordis.patch.yml` 里本插件那一行，
   而不是存在内存或 localStorage 里。
3. **读和写必须是同一个值。** 只做一半是最阴的失败形状：列表按 A 源列版本，安装按 B 源
   去装，界面上一行行都正常，点下去才 `ERR_PNPM_NO_MATCHING_VERSION`。

## 为什么两个字段都必须是 volatile

`src/host/config.ts` 里 `registry` 与 `customRegistries` 两个字段都带 `.volatile()`，
这不是抄漏了也不是习惯：

- **没有 volatile 字段，插件根本没有设置页。** `SettingsForms.describe()` 只投影带
  `.volatile()` 的字段；而且 `autoGenerate` 不会替我们生成页面，界面必须由客户端
  （`src/client/components/SourceDialog.ts` + `src/client/registry.ts`）自己画。也就是说
  volatile 在这里是「让这份 schema 出现在设置服务视野里」的必要条件，不是可选优化。
- **非 volatile 的写入会重启插件。** 走 `Entry.update` → 整个插件重新挂载，正在跑的
  批次、`globalThis` 上那份 job store（§19）都会被牵连。volatile-only 的写入走
  `_commitVolatile()`：直接换掉运行中的引用，再并发一条 `loader/volatile-update`，
  不重启。
- **所以 `apply` 里必须每次现读。** 写成

  ```ts
  const chosenRegistry = (): string => savedRegistry(config)
  ```

  就是「每次读」的形状：`config.registry` 是个 `Volatile<T>`（`src/host/config.ts:26`
  的 `interface Volatile<T> { get(): T }`），每次调用 `.get()` 才拿到当前值。如果在加载时
  把它抄成一个字符串常量，那么设置页上改了、也保存成功了，install 那边用的仍是启动时的
  那个源——这正是这条规则要避免的 bug，而且它在测试里很难被发现。

## 行号校对（2026-11-04）

原文里只有两个 `path:line`，其余都是「文件 + 符号」。行号是在 2026-11-04 09:45:50
重新 grep 出来的快照——**这份仓库的 src/ 一直在动，行号随时会再漂**，所以判据页里只保留
`符号 @ 文件`，不写行号。

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `src/host/bundle.ts:66` `registryBase(registries, preferred)` | `src/host/bundle.ts:88` | ⚠️ 漂移（-22 行） |
| `src/host/install.ts:436` `runStep(..., registry)` | `src/host/install.ts:627` | ⚠️ 漂移（-191 行） |
| `src/host/config.ts`（`Config`、`savedRegistry`） | `Config` @ `src/host/config.ts:67`、`savedRegistry` @ `:89` | ✅ 一致（原文没写行号） |
| `src/host/registry.ts` `probeRegistry` / `PROBE_TIMEOUT_MS` | `PROBE_TIMEOUT_MS` @ `:496`、`probeRegistry` @ `:524` | ✅ 一致（原文没写行号） |
| `src/index.ts` 的 `chosenRegistry()` 与 `POST registry/test` 路由 | `chosenRegistry` @ `:246`、路由 @ `:605`（响应 @ `:617`） | ✅ 一致（原文没写行号） |
| `src/client/registry.ts`（`useRegistrySetting`、`offeredRegistries`、`addSource` / `editSource` / `removeSource`） | `:150` / `:213` / `:235` / `:256` / `:275` | ✅ 一致（原文没写行号） |
| `src/client/components/SourceDialog.ts` | 632 行；`WELL_KNOWN_REGISTRIES` 由 `:27` 导入、`:411` 渲染 | ✅ 一致（原文没写行号） |
| `src/client/copy.ts` 的 `registry*` 与 `source*` 两组 | zh `:112`–`:146`、en `:259`–`:293`，原文点到的键名全部存在 | ✅ 一致（原文没写行号） |
| `test/config.test.ts`（默认值、两处 volatile 标记、地址校验、旧配置兼容、数组整体校验） | 11 个 `test(...)`，五组各有用例 | ✅ 一致 |
| `test/sources.test.ts`（13 条） | 13 个 `test(...)` | ✅ 一致 |
| `test/probe.test.ts`（8 条） | 8 个 `test(...)` | ✅ 一致 |
| `test/install.test.ts` 那两条 | `:89` `a chosen registry is passed to the manager`、`:97` `no choice leaves the manager own registry in charge` | ✅ 一致 |
| `test/overview.test.ts` 那一条 | `:121` `the saved registry is what versions are read from` | ✅ 一致 |

两条漂移的成因都一样：这些符号所在的文件在 1.7.x 里长了几百行，行号没有回头同步。
**判据页里一律不写行号**（`符号 @ 文件`），就是为了不让下一个人再去校对一遍。

### 宿主 API，本仓库无符号可校验

下面这些名字出现在原文的「为什么必须用 volatile」一段里，但它们**是宿主的 API，不是本仓库
的符号**——在 `src/` 和 `test/` 里 grep 全是零命中，这不是漂移，也不该去找：

| 名字 | 归属 |
|---|---|
| `SettingsForms.describe()` | `@deepseek-ai/dsh-settings`（宿主设置服务） |
| `autoGenerate` | 同上，设置页的自动生成开关 |
| `Entry.update` | 宿主 loader 的条目更新路径 |
| `_commitVolatile()` / `loader/volatile-update` | 宿主 loader 的 volatile 写入路径与事件名 |
| `settings.register(ns, schema)` | 0.1.7 之后被删除的旧 API |

这条对改代码的人有实际影响：**只要从 `@deepseek-ai/dsh-settings` 里 import 一个已经不存在
的具名导出，宿主会直接起不来**（不是类型错误，是加载期崩）。所以那一段的用法只能照抄，
不能「顺手整理 import」。

## 五个对话框行为里，哪三个是结构性的

原文三条最容易被「简化」的禁令，背后各自的失败形状不一样，值得分开记：

- **自带源不能改也不能删 → 而且不能靠 disabled 按钮实现。**
  `src/client/registry.ts` 的模块注释写着：两个自带地址在这里和 `./host/config.ts` 里都是
  常量，**永远不写进 `customRegistries`**，所以任何点击序列都删不掉、改不了它们——
  因为「要操作的那一行」根本不存在。`src/client/components/SourceDialog.ts` 的注释说得更
  直白：「That is not a disabled button: those addresses are compiled in
  (`WELL_KNOWN_REGISTRIES`) and are never written into the saved list, so there is
  nothing to edit and nothing to remove.」判据写「**不要**改成渲染出来但按钮 disabled」，
  理由就是这个：disabled 按钮是**可以被恢复成可点**的（删一个 `disabled` 属性），而
  「列表里没有这一行」恢复不了——它需要先改数据模型。
- **删改正在用的源，`registry` 必须跟着变。** 否则选择存的是一个已经不存在的地址，
  下次 install 直接打到 404，而设置页看起来一切正常。
- **探测两条路必须并发。** 这不是性能优化：`registry.npmmirror.com` 的 `/-/ping` 在某些
  网络上要 3～15 秒，而根地址只要 0.3 秒，`PROBE_TIMEOUT_MS = 5000` 是**整次探测**的预算
  （不是每个请求 5 秒）。串行的话预算全花在慢的那条上，随后超时 → 报「连不上」——
  而大陆镜像恰恰是这条功能存在的理由，把它报成连不上等于功能不可用。`test/probe.test.ts`
  里 `a slow ping does not hide a fast root` 与 `the probe deadline fits a slow mirror`
  两条就是钉这个的。

## 两个容易漏的细节

- **`undefined` 与 `null` 对 manager 是两件事。** `runStep` 只在 registry 是非空字符串时
  才把 `registry` 塞进 install options（`src/host/install.ts:683`：
  `...(typeof registry === 'string' && registry.trim() !== '' ? { registry: registry.trim() } : {})`），
  于是「用户没选源」= 键根本不出现 = 保留 `pluginManager.registry`；而显式给 `null`
  会把 manager 的源**覆盖**成 pnpm 的源。`test/install.test.ts` 的
  `no choice leaves the manager own registry in charge` 钉的就是这个差别。
- **`localStorage` 在这个仓库里零出现**——原文那句「**不要**把选择存进 localStorage」是给
  未来的人立的栏杆，不是对现状的描述。它要防的形状很具体：宿主没挂 ui-settings 时
  `configForms` 拿不到（`src/client/plugin.ts` 里 `ctx.get<ConfigFormsLike>('configForms', false)`
  传的就是可选），此时正确的降级是「显示源、不给改、说明原因」
  （`src/client/registry.ts` 的模块注释：Everything here degrades to「not available」
  instead of throwing），而不是退到浏览器本地存储——那只在一个浏览器里生效，
  用户会以为改成功了。
