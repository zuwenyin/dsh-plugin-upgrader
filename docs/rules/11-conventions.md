# 11 其它不许破的约定 —— AGENTS.md §11 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 11 条；这里是它的详证页：每条约定为什么存在、
> 当年漏掉它会怎么坏、以及符号的准确位置。下面的「原文」是 2026-11-06 压缩分层时的原样存档，
> 一字未删。

## 原文（2026-11-06 快照）

## 11. 其它不许破的约定

- **路由仅限回环访问。** 任何 `POST job` / 安装动作只接受 loopback，否则 403。
  `isLoopbackRequest` @ `src/host/http.ts`。
- **一次只跑一批。** 第二个 `POST job` 拿 `409 busy`（带正在跑的 id），前端**接管**
  而不是报错。僵尸 job 按心跳（2 秒一次）15 分钟判废，不会永久占位。
  `HEARTBEAT_MS` / `STALE_JOB_MS` @ `src/index.ts`。
- **overview 的 registry 查询有并发上限。** 11 个并发打 `registry.npmmirror.com` 会超时
  （历史上正是「很多插件没有历史版本」的原因），上限是 `PACKUMENT_CONCURRENCY = 4`
  @ `src/host/registry.ts`，由 `mapLimited` @ `src/host/overview.ts` 执行。
  **不要换回 `Promise.all`。**
- **overview 一次答完。** 一个请求返回全部行（`bundles` 字段），不做 per-package 请求。
- **enabled 状态保留。** 任何真的卸载之后，都要把原来的启用 / 禁用状态装回去
  （`restoreEnabledState` @ `src/host/install.ts`），失败时报告它读到的状态。
- **失败要带原因。** 行上的 `versionError` / 历史读取失败不能是空白，界面必须显示原因
  并给重试入口。
- **语言**：所有面向用户的文案都走 `src/client/copy.ts` 的 zh + en 两份，不要内联中文。

---

## 这七条为什么在同一条里

它们不是同一件事，共同点只有一个：**每一条单独写都不够占一节**，而每一条被破掉都是一种
用户能看见的坏结果（远程能装包、两个批次互相踩、界面卡死、状态被抹、报错是空白、中文硬编码）。
合成一条是为了让新规则有地方放，不是暗示它们可以互相将就——**七条各自独立**，删掉任何一条
都不会让另外六条变得多余。

七条分三类：

| 类 | 条 | 破了会怎样 |
|---|---|---|
| 信任边界 | 回环、一次一批 | 别的页面能把包装进你的 profile；两个批次同时写同一个 manifest |
| 资源边界 | 并发上限、一次答完 | 界面「很多插件没有历史版本」，其实是自己把 registry 打超时了 |
| 如实呈现 | enabled 保留、失败带原因、语言 | 用户看到的状态是错的，或者看不懂 |

## 1. 路由仅限回环

`isLoopbackRequest` @ `src/host/http.ts:37` 是**请求级**的信任栅栏，三道口子一起把：

```ts
if (!isLoopbackAddress(req.socket?.remoteAddress)) return false   // :38  不在回环
if (typeof host !== 'string') return false                        // :40  没有 Host
if (req.headers['sec-fetch-site'] === 'cross-site') return false  // :41  跨站 fetch
// :42-45  说了 Origin 就必须和服务端自己的 host 一致
```

**为什么三道都要**：这个路由能装包、能删包，所以它不能被别的 origin 上的页面调用。只查
`remoteAddress` 挡不住「本机另一个端口的页面」；只查 `Origin` 挡不住不写 `Origin` 的
请求（`curl` 就不写）；只查 `sec-fetch-site` 挡不住老浏览器和手写请求。**少一道就少一层**，
而少的那一层恰好是最容易被人当成「冗余」删掉的那层。

注释 `:28-33` 是这条的判据原文；删注释不改行为，但下一个读代码的人就会以为可以少写一道。

## 2. 一次只跑一批

`activeJob()` 返回非空时，`POST job` 立刻返回 `409`，**并且把正在跑的那批的状态一起带回去**：

```ts
writeJson(res, 409, {
  error: 'busy',
  id: running.id,
  current: running.current,   // index.ts:491-497
  done: running.done,
  total: running.total,
})
```

**为什么带 id / current / done / total**：前端拿到 `busy` 不是要报错，是要**接管**
——把面板切到那批正在跑的 job 上继续显示。只回一句 `{ error: 'busy' }` 的话，用户点第二
次升级看到的是「正忙」，而屏幕上没有任何东西在动，唯一的解释就是「坏了」。

**僵尸 job 靠心跳判废**：`STALE_JOB_MS = 15 * 60 * 1000` @ `src/index.ts:89`、
`HEARTBEAT_MS = 2 * 1000` @ `src/index.ts:92`。判据是「心跳停了 15 分钟」而不是「跑了 15
分钟」——一次真的升级可以跑十几分钟，用总时长判废会把正在正常工作的批次掐掉。没有这条，
一次崩溃留下的 job 会永久占位，之后每次升级都拿 `409`，用户只能重启宿主。

## 3. overview 的 registry 查询有并发上限

`PACKUMENT_CONCURRENCY = 4` @ `src/host/registry.ts:182`，由 `mapLimited`
@ `src/host/overview.ts:44` 执行，调用点在 `:203`。

**"11 个并发会超时"** 不是估算：历史上「很多插件没有历史版本」这个现象，根因就是 overview
一次把每个包的 packument 请求同时打向 `registry.npmmirror.com`，镜像侧连接数一超就整批超时，
于是每一行都显示「读不到历史版本」。用户看到的是「这些插件没发布过版本」，实际是自己把镜像
打挂了。

**所以 `Promise.all` 在这里是错的**：它对结果顺序没意见，但对**同时在飞的请求数**也没意见。
换回去代码更短、测试照样绿——因为测试用的是本地假 registry，不设连接上限。这是这条最危险的
地方：**它只在真实镜像上坏，而测试里永远看不见**。

## 4. overview 一次答完

一个请求返回全部行（`bundles` 字段 @ `src/client/types.ts:106`），不做 per-package 请求。

**为什么**：per-package 请求把「一次并发上限」变成「N 次并发上限」，第 3 条就没法守了；
而且每一行都要有自己的加载态、错误态、重试态，二十行插件就是二十份互相独立的状态机。
一次答完，行与行之间的比较（谁落后、谁不兼容）也是同一个快照，不会出现「上半页还是旧的、
下半页已经新的」。

## 5. enabled 状态保留

任何**真的**卸载之后，都要把原来的启用 / 禁用状态装回去：`restoreEnabledState`
@ `src/host/install.ts:336`（定义），调用点 `:546`、`:642`、`:846`。

**「失败时报告它读到的状态」** 是这条的另一半：装回启用状态本身可能失败（比如那个版本的
DSH 已经不允许它了）。这时**不能默默吞掉**——用户下次打开面板看到的是一个关着的插件，
而他并没有关过它。要报的是「我想把它设成启用，读回来的是禁用」，而不是一句「恢复了」。

## 6. 失败要带原因

行上的 `versionError` / 历史读取失败不能是空白：`versionError`
@ `src/client/types.ts:59`（行字段）与 `src/host/overview.ts:229`、`:232`、`:236`、`:250`（四处
写入点）。

**空白的失败是最坏的一种**：按钮灰着、没有文案、没有重试入口，用户唯一能做的判断是「这个
插件坏了」。而真实原因往往只是一次 registry 超时（§26 说的 `retriable` 正则就是靠这里写入
的原文来判的）。所以要求是两条：**显示原因，并给重试入口**。

## 7. 语言

所有面向用户的文案都走 `src/client/copy.ts` 的 zh + en 两份，不要内联中文
（`src/client/format.ts:6`、`src/client/plugin.ts:7` 这些是消费方）。

**为什么不是「顺手写句中文」**：中文硬编码之后这一句永远不会有英文版，而 `copy.ts` 的测试
（`test/copy.test.ts`）比的是**两份 key 集合相等**——内联一句中文不会让它红，只是让那个
文案在英文界面里凭空消失。所以这条没有自动守卫，靠读代码。

## 符号位置（2026-11-06 核对）

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `isLoopbackRequest` @ `src/host/http.ts` | `src/host/http.ts:37` | ✅ |
| `HEARTBEAT_MS` @ `src/index.ts` | `src/index.ts:92` | ✅ |
| `STALE_JOB_MS` @ `src/index.ts` | `src/index.ts:89` | ✅ |
| `409 busy` | `src/index.ts:491` | ✅ |
| `PACKUMENT_CONCURRENCY = 4` @ `registry.ts` | `src/host/registry.ts:182` | ✅ |
| `mapLimited` @ `overview.ts` | `src/host/overview.ts:44`（调用 `:203`） | ✅ |
| `bundles` 字段 | `src/client/types.ts:106` | ✅ |
| `versionError` 行字段 | `src/client/types.ts:59` | ✅ |
| `restoreEnabledState` @ `install.ts` | `src/host/install.ts:336` | ✅ |

## 已知缺口：这一条没有专属守护测试

七条里**没有一条**有同名测试文件。分散到的守卫是：

- 回环：`test/boot.test.ts:83` 只覆盖 `403` 这一个状态码的**前端**处理，不测栅栏本身。
- `409 busy`：无。`test/lock.test.ts:175`、`:254` 测的是 **manifest 写入锁**的 busy，
  和这里的批次 busy 是两件事，名字像但不是同一个东西。
- 并发上限：`test/overview.test.ts:5`、`:90` 与 `test/registry.test.ts:6`、`:192` 涉及
  `PACKUMENT_CONCURRENCY` / `mapLimited` 的**用法**，但都不模拟连接数上限。
- `restoreEnabledState`：`grep -l` 在 `test/` 下**零命中**。

所以这一条全部靠人读。真要补，优先级是：**`Promise.all` 换回去要能红**（最容易复发、后果
最隐蔽）、**`409` 要带 id / current / done / total**、**非回环请求要 403**。

## 与相邻条目的关系

- 第 3 条（并发上限）是 §26 的前置：registry 超时会让 `latest` 读不到，而 §26 的
  「读不到就不判」正是为这种情况写的。
- 第 5 条（enabled 保留）与 §21 是一对：§21 管**失败的升级**不许打开关着的插件，这条管
  **成功卸载再装回**之后要把状态还原。两条都从同一个 `restoreEnabledState` 出去。
- 第 6 条（失败带原因）的 `versionError` 原文格式，是 §26 `retriable` 正则的输入。
