# 27 pnpm 的重试参数由插件代管 —— AGENTS.md §27 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 27 条；这里是它的详证页：为什么、测出来的数字、
> 落在哪个文件、以及为什么其它三条路都不通。

## 现象

2026-11-17 晚上一次批量升级 8 个插件，从 09:42 跑到 10:06，**24 分钟**。单个插件平均接近两分钟，
而真正下载的包只有 1 个（`resolved 95, reused 2, downloaded 1, added 3, done` 在日志第 40 行就
出现了）。用户的镜像 `registry.npmmirror.com` 在国内，带宽没问题——串行单连接测 20 个包全部
200、中位 222 ms。

慢的部分全在这一行：

```
? Verifying lockfile against supply-chain policies (95 entries)...
✓ Lockfile passes supply-chain policies (95 entries in 2m 13.6s)
Done in 2m 14.3s using pnpm v11.28.5
```

`2m 13.6s` 里绝大部分是**等待**，不是工作：日志里 40 条
`[WARN] GET https://registry.npmmirror.com/<pkg> error (ETIMEDOUT). Will retry in 10 seconds. 2 retries left.`
加上 `[WARN] Request took 110615ms`。

## 根因

pnpm 11 的 lockfile 供应链校验会对 lockfile 里每一条记录发一次 registry 请求，并发
`DEFAULT_CONCURRENCY = 64`（`pnpm.mjs` 的 `iterateLockfileViolations` 里
`const limit = pLimit(concurrency ?? DEFAULT_CONCURRENCY)`，而 `options2?.concurrency` 没有任何
调用方传入，所以恒为 64）。本 profile 的 lockfile 有 91–95 条候选，于是 64 路并发同时打镜像。

镜像对**并发建连**极不耐受（串行时完全正常）：

| 并发 | mirror 成功 | wall | npmjs 成功 | wall |
|---|---|---|---|---|
| 8（每请求新连接） | 31/39 | 45.2s | 39/39 | 6.4s |
| 32 | 21/39 | — | 39/39 | — |
| 64 | 28/39 | — | 39/39 | 5.9s |

丢掉的请求触发的正是 pnpm 的默认退避：`fetch-retries: 2`、`fetch-retry-mintimeout: 10000`、
`fetch-retry-maxtimeout: 60000`、`fetch-retry-factor: 10`。也就是说**一次失败的连接要等 10 秒**才重试，
第二次失败要等一分钟。校验的发现在 `inactivityTimeout(opts3)`，它同时是 undici 的
`connectTimeout` / `headersTimeout` / `bodyTimeout`，默认 60 秒——于是一个卡住的连接可以吃掉整整一分钟。

## 试过但没用的四条路（都实测过）

1. **合并成一次 `pnpm add a@x b@y ...`**：做不到。宿主的 `installBundle(spec)` 只收单个 spec，
   而且装完会 `if (installed.length !== 1) throw new ManagementFailure("ambiguous-install")`
   （`@deepseek-ai/dsh-plugin-manager/lib/index.js:2064`）。要合并必须先改 DSH 本体。
2. **`networkConcurrency: 8` + 更宽松的重试**：实测**更慢**（2m56.6s vs 基线 1m50.7s）。
   降并发减少了同时在建的连接，但每次失败仍然要等 10 秒；把 `fetchRetries` 调到 5 只是让等待发生五次。
   `--config.max-sockets=2` 更糟：undici 把 CLI 传进来的字符串当数字用，直接
   `UND_ERR_INVALID_ARG` + `ERR_PNPM_META_FETCH_FAIL`，校验**失败**。
3. **`.npmrc`**：写 `fetch-retries=5`、`network-concurrency=8` 全部读不到（`pnpm config get` 返回
   `undefined`）。这几个键只从 `pnpm-workspace.yaml` / CLI 读。
4. **`minimumReleaseAge: 0`（关掉年龄检查）**：有效（校验 12 ms、0 请求），但它关掉的是 pnpm 11
   防投毒的那道闸——「依赖必须发布满 24 小时才允许安装」。**不能用**：用户看不见的防护被拿去换速度，
   正是 §11 的「用户能看见的结果不能变差」。

## 修法

只改四个**退避参数**，不动任何策略：

```yaml
fetchRetries: 4
fetchRetryMintimeout: 500
fetchRetryMaxtimeout: 2500
fetchTimeout: 30000
```

同时收紧超时和退避才有效——单做任何一半都不行：

| 配置 | 校验耗时 | ETIMEDOUT 条数 |
|---|---|---|
| 默认（对照，与实验同时刻） | 2m15.5s | 22 |
| 只收紧退避（不动 `fetchTimeout`） | 43.4s | 21 |
| 只调大 `fetchTimeout` 到 90s | 2m14.6s | 36 |
| **四个键一起** | **21.6–26.1s** | **0** |

端到端实测（真实动作 `pnpm add exif-parser@0.1.12 --save-exact`，全新 store）：

- 默认：`Done in 4m 8s`（校验 2m11.9s）
- 四个键：`Done in 48.8s`（校验 23.9s）

而且 pnpm **不会**在后续安装里改掉这四行（before/after diff 逐字节相同），所以写一次就长期有效。
供应链校验照常执行，只是不再空等。

## 落在哪里

`profile` 目录下的 `pnpm-workspace.yaml`——**唯一**生效的位置（`.npmrc` 无效、环境变量被
`scrubbedParentEnv()` 白名单拦掉、`InstallBundleOptions` 没有传 CLI 参数的口子）。

写入规则（`src/host/pnpm-tuning.ts`）：

- **只追加缺失的顶层键**，已有行一个字节都不动（pnpm 自己也会往这个文件里追加
  `minimumReleaseAgeExclude`，重新序列化会打架）。
- 键名认 camelCase 也认 kebab-case：用户手写过 `fetch-retries: 0` 就不再追加 `fetchRetries: 4`，
  否则同一个设置有两个值。
- 顶层键只认**缩进 0** 的行：`protobufjs: true` 这种子项不能被当成顶层键，否则一个无关的小节名
  就能压掉我们的一项设置。
- **整批只写一次**，不是每步一次。
- **拿不到 `package.json.lock` 就一个字节都不写**（§22），返回 `skipped/lock-busy`。
- 第一次改写前把原文备份成 `pnpm-workspace.yaml.upgrader-bak`；**备份失败就放弃写入**。
- 写盘走 `${target}.upgrader-tmp` + `renameSync`（与 §23 同一套写法）。
- 任何失败都只记一行日志、不中断批次：这是优化，不是前置条件。

## 用户能关掉它

`pnpmTuning` 是第三个用户设置（前两个是 `registry`、`customRegistries`），与它们一样是
`.volatile()`——浏览器改得动，改完不用重启宿主机。关掉之后：

- 后续批次不再写入；
- **已经写进去的那四行不会被删除**（日志与文案都这么说，不要偷偷清理用户的文件）；
- 手工删掉那四行，效果与关掉开关相同。

按钮在「版本管理」页顶部的状态条里，与 registry 选择器并排（`TuningSwitch`）。没有
`configForms` 服务的宿主只显示状态、不给改（§12）。

## 守护

`test/pnpm-tuning.test.ts`（13 条）钉住：四个数值、顶层键识别、kebab-case 别名、追加不碰原文、
幂等、备份、锁忙不写、`unreadable` 不抛、`no-profile` 不猜路径。

变异验证（`.tmp/mutate-tuning.mjs`，把 `src`/`test` 复制到 `.tmp` 再改，因为沙箱只允许在 `.tmp` 写）：
六个变异体（改数值 / 去掉顶层键锚点 / 无视 kebab 别名 / 不备份 / 去掉幂等 / 无视锁）**全部让套件变红**，
还原后逐字节相同且重新变绿。
