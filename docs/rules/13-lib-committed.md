# 13 `lib/` 是提交进仓库的，不是构建垃圾 —— AGENTS.md §13 的详证

> 判据在 [`AGENTS.md`](../../AGENTS.md) 第 13 条；这里是它的详证页：为什么、当年怎么坏的、
> 完整行号清单。下面的「原文」是 2026-11-04 拆分层时的原样存档，一字未删。

## 原文（2026-11-04 快照）

## 13. `lib/` 是提交进仓库的，不是构建垃圾

`.gitignore` 里**没有** `lib/`。构建产物和 `src/` 一起进 git，原因不是洁癖：

DSH Store 的自动审核看的是一个**固定 commit 的文件树**，它按 manifest 的
`files` 去找运行时文件（`./lib/index.js`、`./lib/client.js`…），找不到就判
`runtime artifact is missing from the distributable surface`，而且明确拒绝为了补齐
而执行 `prepare`（「automation cannot execute `prepare` to fill missing runtime
files」）。把构建产物提交进去是唯一能通过这条路的方式，顺带让「从 git 装」也不再
依赖安装期的构建。

由此产生三条硬约束：

- **改完 `src/` 必须 `pnpm run build`，并把 `lib/` 一起提交。** 只提交 `src/`
  等于发布了一个新旧不匹配的包。CI 里有守卫（见下），漏了会红。
- **不许手改 `lib/` 里任何文件。** 它们是 tsc / esbuild 的输出，下次构建就没了。
- **`prepare` 不能加回来。** 安装期执行脚本是审核里的一条硬性否决项
  （`install lifecycle scripts are present: prepare`）。构建改挂在 `prepack`
  上，只在 `pnpm pack` / `pnpm publish` 前跑，安装期不跑。

`lib/` 必须是**可复现**的：同一个 `src/` 构建两次，字节完全相同（已用两次构建的
SHA-256 对比验证过），否则「提交的产物是否最新」无法用 `git diff` 判断。

守卫是 `scripts/verify-build-committed.mjs`，`pnpm run check`、CI 和 publish 都会跑它。
它比较的是**工作区与索引**（`git diff -- lib/` 加上未跟踪文件），不是与 HEAD 比：
CI 里两者等价，所以漏提交照样红；本地则允许「构建 → `git add` → 跑 check」这个
正常顺序，而不是要求先提交再检查那个本该拦住提交的东西。跳过时（没有 `.git`，
比如从 tarball 里跑）会打印 `not a git work tree` 并放行——「提交和构建是否一致」
在那种地方没有答案，不算失败。

## 为什么把构建产物提交进 git

这个仓库里有**两份东西**必须同时在树上：源码和它的编译结果。一般的做法是只提交源码，
让安装期或 CI 去构建，但这条路上有两道门都关着：

1. **DSH Store 的自动审核看的是一个固定 commit 的文件树。** 它不做 checkout + install +
   build，它按 manifest 的 `files` 直接去看那个 commit 里有没有运行时文件
   （`./lib/index.js`、`./lib/client.js`…）。找不到就判
   `runtime artifact is missing from the distributable surface`。
2. **它明确拒绝为了补齐而执行 `prepare`。** 原话是
   「automation cannot execute `prepare` to fill missing runtime files」。也就是说
   「我提交源码，让审核那边自己构建」这个想法不是不被推荐，是**在这条路上根本走不通**。

所以把 `lib/` 提交进去不是洁癖，是唯一能通过审核的方式；顺带的好处是「从 git 装」
（`git+https://…#tag`）也不再依赖安装期的构建。

## 三条硬约束各自的失败形状

- **改完 `src/` 必须 `pnpm run build`，并把 `lib/` 一起提交。** 只提交 `src/` 的后果不是
  「CI 报错」那么轻，而是**发布了一个新旧不匹配的包**：`package.json` 的 `files` 打包的是
  `lib/`，所以 tarball 里装的还是上一版的编译结果，而这棵树看起来是干净的（`src/` 的
  改动确实提交了）。守卫存在的理由就是让这个静默的不一致变成一次红。
- **不许手改 `lib/` 里任何文件。** 它们是 `tsc`（宿主半边）与 `esbuild`（`lib/client.js`，
  浏览器半边，打成单文件）的输出，下次 `pnpm run build` 就没了。手改的典型事故是：
  在 `lib/` 里调一行再跑测试，测过了，然后提交——下一次构建把这行覆盖掉，于是修复
  悄悄消失，而且因为 `lib/` 是「产物」，没有人会去 review 那里的 diff。
- **`prepare` 不能加回来。** 安装期执行脚本是 Store 审核里的一条硬性否决项，报错文本是
  `install lifecycle scripts are present: prepare`。构建改挂在 `prepack` 上：只在
  `pnpm pack` / `pnpm publish` 前跑，别人 `pnpm add` 这个包的时候不跑。

## 为什么 `lib/` 必须可复现

原文那句「同一个 `src/` 构建两次，字节完全相同」不是工程洁癖，它是守卫能工作的前提：
`scripts/verify-build-committed.mjs` 用的判据是 `git diff -- lib/` 有没有输出。
只要构建本身是不确定的（时间戳、随机 id、map 里的绝对路径、依赖遍历顺序），
那么「构建完什么都不改」也会让 `git diff` 有输出，守卫就变成**永远红**，然后所有人学会
忽略它——比没有守卫更糟。之前是用两次构建的 SHA-256 对比验证过的。

## 行号校对（2026-11-04）

原文通篇没有写行号（只有文件名、脚本名和命令），所以这一栏没有「漂移」可查，
逐项核对的是**这些事实是否仍然成立**：

| AGENTS.md 里写的 | 实际位置 | 结论 |
|---|---|---|
| `.gitignore` 里**没有** `lib/` | `.gitignore` 共 16 行，唯一提到 `lib` 的两处都在注释里（`:13`–`:16` 说明「Build output is COMMITTED on purpose」），没有任何 `lib/` 的忽略规则 | ✅ 一致 |
| manifest 的 `files` 去找 `./lib/index.js`、`./lib/client.js` | `package.json` 的 `files` 含 `lib/**/*.js`、`lib/**/*.d.ts`、`lib/**/*.map`；`git ls-files -- lib/` 有 61 个文件，含这两个 | ✅ 一致 |
| `lib/` 是 tsc / esbuild 的输出 | `scripts/build.mjs`：`tsc -p tsconfig.build.json`（宿主半边）＋ esbuild 打成单个 `lib/client.js`（浏览器半边） | ✅ 一致 |
| 守卫是 `scripts/verify-build-committed.mjs` | 文件存在，86 行 | ✅ 一致 |
| `pnpm run check`、CI 和 publish 都会跑它 | `package.json` 的 `check` 脚本末段就是它；`.github/workflows/ci.yml` 与 `publish.yml` 各有一条 `node scripts/verify-build-committed.mjs`（`ci.yml` 里另跑一次 `pnpm run check`） | ✅ 一致 |
| 比较的是**工作区与索引**，不是与 HEAD 比 | 脚本里是 `git diff --name-status -- lib/`（默认对索引）＋ `git ls-files --others`；注释原文写着 Compare the work tree against the INDEX, not against HEAD | ✅ 一致 |
| 跳过时（没有 `.git`）打印 `not a git work tree` 并放行 | `scripts/verify-build-committed.mjs:51` `not a git work tree — skipping the committed-build check`，随后 exit 0 | ✅ 一致 |
| `prepare` 不能加回来 | `package.json` 的 `scripts` 里没有 `prepare` 键；`build` 与 `prepack` 都是 `node scripts/build.mjs` | ✅ 一致 |

**这一条的守护不是某个 `node --test` 用例，而是那个脚本本身。** 它没有单测：
`test/` 里没有任何文件引用 `verify-build-committed`。要验证它还活着，办法是故意改一行
`lib/` 下的文件再跑 `node scripts/verify-build-committed.mjs`，它必须报出未提交的差异。

## 补记：判据页里看不到的细节

- **`.gitignore` 的注释里有一处过期的交叉引用。** 那四行注释写的是「see AGENTS.md section
  12」，但 `lib/` 这条规则现在在**第 13 条**（拆分前它是第 12 条）。注释内容本身（不要
  手改、跑 `pnpm run build` 连源码一起提交）是对的，只是编号过期了。改注释不属于本页
  范围（这里只做存档与校对），但下一个动 `.gitignore` 的人应该顺手改掉。
- **`scripts/verify-pack.mjs` 是另一道门。** 它检查 `pnpm pack` 出来的 tarball 里有没有
  `lib/client.js`、`lib/index.js`、`lib/host/install.js`、`lib/host/registry.js`、
  `cordis.patch.yml`、`assets/icon.svg`、`assets/icon-180.png`、`package.json`、
  `README.md`、`LICENSE`。它管的是「打包时 `files` 写对没有」，`verify-build-committed`
  管的是「打包用的那棵树是不是最新构建」——两个问题，两道门，都要留着。
- **跳过分支不是漏洞。** 从 tarball 里跑（没有 `.git`）时守卫放行，因为
  「提交和构建是否一致」在那种目录里没有答案；把它当失败只会让「解压后用一下」这件事
  无法进行。
