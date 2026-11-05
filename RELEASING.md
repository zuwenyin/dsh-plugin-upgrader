# 发布流程

本仓库的 npm 包是 `dsh-plugin-upgrader`，发布走 **npm trusted publishing (OIDC)**：
打 `v*` tag 推上去，GitHub Actions 用短期 OIDC 令牌直接发布，仓库里不存任何 npm token。

这套机制有个硬性前提：**包必须已经存在于 npm 上，才能配置 trusted publisher**。
所以第一次发布只能手动做一次，之后全自动。

依赖管理用 **pnpm**（`package.json` 里钉了 `packageManager: pnpm@11.9.0`），
下文所有命令都用 pnpm；照抄 `npm xxx` 会因为缺 `package-lock.json` 而失败。

---

## 第 0 步：准备

```bash
cd D:\DeepseekHarnessWorkspace\dsh-plugin-upgrader
pnpm install
pnpm run check
```

两条都通过再往下。

> 注意本机 `.npmrc` 里 `registry` 指向的是 `registry.npmmirror.com`（国内镜像，只读镜像不发包）。
> 仓库根目录的 `.npmrc` 已经把 `registry` 固定成 `https://registry.npmjs.org/`，
> `package.json` 里也有 `publishConfig.registry`，所以 `pnpm publish` 会自动打到官方源。

---

## 第 1 步：登录 npm（只需第一次）

```bash
pnpm login --registry https://registry.npmjs.org
```

浏览器会弹出授权页，登录后回到终端。
密码/OTP 需要手动输入（这是唯一必须手动的一步）。

确认登录成功：

```bash
pnpm whoami --registry https://registry.npmjs.org
```

> 用 granular token 的话 `whoami` 会报 401，这是正常的，不影响发布。
> 不确定是否登录，直接跳到第 2 步试发即可。

---

## 第 2 步：首次手动发布 1.0.0

```bash
cd D:\DeepseekHarnessWorkspace\dsh-plugin-upgrader

# 先看一眼会打包哪些文件，确认没有漏东西
# 正常应该看到 46 个文件 / 约 50 KB：lib/（含 .map）+ locale + 图标 + 补丁 + 文档
pnpm pack --dry-run

# 正式发布
pnpm publish --access public
```

如果终端提示 `Enter OTP:`，打开验证器 App 输入 6 位码即可。
（之前的 EOTP 失败是因为在非交互环境里跑，没有地方输入 OTP。）

发布成功后立刻验证：

```bash
pnpm view dsh-plugin-upgrader version dist.tarball --registry https://registry.npmjs.org
```

期望看到 `1.0.0`。

> ⚠️ 发布顺序很重要：**先发 npm，再做第 3 步**。
> 因为 trusted publisher 只能挂在已存在的包上。

---

## 第 3 步：绑定 trusted publisher（只需第一次）

打开 https://www.npmjs.com/package/dsh-plugin-upgrader/access

在 **Trusted Publisher** 区域点 **GitHub Actions**，填：

| 字段 | 值 |
| --- | --- |
| Organization or user | `zuwenyin` |
| Repository | `dsh-plugin-upgrader` |
| Workflow filename | `publish.yml` |
| Allowed actions | 勾选 `Allow npm publish` |

点 **Set up connection** 保存。

trusted publisher 认的是 **workflow 文件名**（`publish.yml`），不是里面某个 job，所以这个文件
后续再加 job 都不用动上面那一栏——但把文件改名、或者把发布挪到别的 workflow 里，就必须回来改
这一栏，否则会拿到 `404 — the token exchange failed`。

建议顺手打开 **Require two-factor authentication and disallow tokens**，
这样以后只能从 CI 发布，token 泄了也发不了包。

完成后可以顺手把旧的 granular token 撤销：
https://www.npmjs.com/settings/~tokens

---

## 第 4 步：以后每次发版（全自动）

改版本号 → 写 changelog → 打 tag → 推：

```bash
cd D:\DeepseekHarnessWorkspace\dsh-plugin-upgrader

# 1) 升版本号（自动改 package.json，不加 git tag）
pnpm version patch --no-git-tag-version    # 或用 minor / major

# 2) 在 CHANGELOG.md 顶部补一段，然后提交
git add -A
git commit -m "chore: release v1.0.1"
git push origin main

# 3) 打 tag 并推送 —— 这一步触发 CI 发布
git tag v1.0.1
git push origin v1.0.1
```

推送 tag 后 GitHub Actions 会自动跑 `pnpm run check` → `pnpm test` → `pnpm publish`，
**然后再建 GitHub Release 页面**（见下一节）。

（`pnpm publish` 在 trusted publishing 下会自己附加 provenance，不需要再写 `--provenance`。）

看进度：

```bash
gh run list --repo zuwenyin/dsh-plugin-upgrader --limit 3
gh run watch --repo zuwenyin/dsh-plugin-upgrader
```

发布完验证（注意 `dist-tags` 和 tarball 会比 workflow 变绿晚几分钟到十几分钟，别急着判断失败）：

```bash
pnpm view dsh-plugin-upgrader version --registry https://registry.npmjs.org
gh release list --repo zuwenyin/dsh-plugin-upgrader --limit 3
```

---

## GitHub Release 页面是 CI 建的，不是手工建的

**这一节曾经写的是「想建的话手动跑 `gh release create`」，然后连着九次没人跑。**

结果是：git tag 有 15 个，GitHub Release 只有 6 个，页面停在 v1.2.0，而 npm 已经发到
v1.6.1。GitHub 的 "Latest" 认的是**最新的 Release**，不是最新的 tag，于是项目看起来在 1.2.0
就死了。本插件行上的 `GH` 按钮、以及每个历史版本号上的链接（`releasePathOf`），都会打开
`releases/tag/v<版本>`——tag 在，所以链接不坏，但点进去是一页空白外壳，比 404 更像 bug。

所以这件事现在是自动的，而且不是一个「记得去跑」的步骤：`publish.yml` 里有**两个 job**，
`publish` 发 npm，`release` 建页面。手工步骤只要没人检查，就等于没有。

- **顺序是功能的一部分。** `release` 声明了 `needs: publish`，所以在 `publish` 成功之后才跑：
  一次失败的发布不会留下一页宣告 registry 上并不存在的版本。把这个依赖去掉，就等于允许页面
  先于包存在。
- **`gh release create --verify-tag` 也是功能的一部分。** tag 不在时直接失败，而不是建一个
  悬空的 Release——页面描述的必须是那个真的被打上 tag 的 commit。
- **不要把这个 job 改回手工步骤。** 也不要给它加 `continue-on-error`——那等于把「忘了建
  Release」重新变成一个看不见的失败。
- **在分支上手动跑不建页面。** `release` job 带
  `if: startsWith(github.ref, 'refs/tags/')`：在分支上跑没有 tag 可描述，跳过是对的。

正文来自 `scripts/release-notes.mjs`，顺序是：

1. `release-notes/<版本>.md`（或 `v<版本>.md`）—— 给**人**读的说明，中文散文，和现有那几个
   Release 页一个风格；
2. `CHANGELOG.md` 里 `## <版本>` 那一节 —— 和代码同一个 commit 审过，所以永远可以安全发布，
   只是读起来像 changelog。

两边都没有这个版本时脚本**退出 1**，job 变红。这是故意的：一页没有内容的 Release 比没有
Release 更难排查。别把它和另一种失败混起来——**没给版本号**（或给了空白）时脚本退出的是 2 并
打印 `usage:`，那是参数写错了，不是「哪里都找不到正文」。

版本号按**整词**匹配：`1.6` 不会匹到 `1.6.0`/`1.6.10`，`1.0.1` 也不会匹到 `1.0.10`。这条不是
洁癖——发 `1.0.1` 时若按前缀匹配，页面会贴出 `1.0.10` 的正文，而那是最难发现的一类错
（页面有内容、看起来正常、说的是另一个版本）。

选正文的规则由 `test/release-notes.test.ts` 的 8 条用例钉住（章节到下一个 `##` 为止、版本号
整词匹配、`v` 前缀等价、没有章节时返回 `undefined` 而不是空串、自写说明优先于 CHANGELOG、
`v<版本>.md` 也能找到、空的自写说明不遮蔽 CHANGELOG、两边都没有时不产出正文）。
改 `scripts/release-notes.mjs` 之前先跑它；它旁边那份 `scripts/release-notes.d.mts` 是给测试用的
类型声明，改导出时要一起对。

本机想预览正文：

```bash
node scripts/release-notes.mjs 1.6.1
```

给下一个版本写说明：

```bash
# 先看 changelog 自动生成的效果，再决定要不要单独写一版给人读的
node scripts/release-notes.mjs 1.6.2
# 要单独写就放到 release-notes/v1.6.2.md，优先级高于 changelog
```

`release` job 是**幂等**的：重跑一个失败过的 workflow 会更新已有页面的正文，而不是报
`already exists`。

---

## 发版之后看什么：安静日的基线，不是 last-month

发完版去看「下载量涨了没有」，多半会得出错误结论，而且是两个方向同时出错。

**第一，`last-month` 会自己往下掉。** 它是滚动 30 天窗口。一个上个月才发布的包，窗口还没
填满，每天都有旧日期滑出去、没有同样老的日期补进来，所以数字**必然**下降，与宣传无关。
本包 2026-10-22 创建，11-05 时 `last-month` 是 4232，其中 10-22 的 275 会在 11-21 滚出、
10-23 的 483 在 11-22 滚出。看到的就是一条平滑的下坡。

**第二，最近两天报 0 不是没人用，是 npm 还没统计完。** `api.npmjs.org` 对当天、常常还有
前一天返回 0——拿 `react` 验证过，四千万下载的日子也会显示 0。

所以判断标准只有一个：**没发版那天的日下载量（安静日基线）**。它才是「有多少人真的在用」。

```bash
node scripts/downloads.mjs              # 最近 30 天
node scripts/downloads.mjs --days 60    # 换个窗口
node scripts/downloads.mjs --baseline 63   # 和上次记住的基线比
node scripts/downloads.mjs --json       # 给别的脚本吃
```

它会做四件事，每一件都对应上面一种误读：

- 把尾部连续的 0 判成**上报滞后**并剔除，报告里直接写出「还有 N 天没上报」；
- 把已上报的日子分成**发版日**和**安静日**，只拿安静日的**中位数**当基线（中位数不受一两个
  大日子影响，平均值会）；
- 算出「发版日是安静日的几倍」。**这个倍数高说明下载主要是发版带来的**——CI 安装、镜像同步、
  各个目录站的扫描器每次发版都拉一次 tarball，那是固定开销，不是用户。本包实测 8.3 倍。
- 列出**未来几天哪些旧日期会离开 30 天窗口**，附上它们当天的下载量，让「算术造成的下降」在
  发生之前就有名字。

**别为了让它变绿就把 `--fail-below` 写进 CI。** 下载曲线是证据不是测试；一个会随口径波动变红
的检查，只会训练所有人忽略红色。默认退出码是 0，只有显式传 `--fail-below` 才失败。

还有一条：**发版频率本身就是噪声源。** 一周发五六个版本，等于一周制造五六个发版日，把曲线
搅成锯齿，任何趋势都看不出来。功能没变时不必发版。

---

## 常见问题

**`npm error code EOTP` / `pnpm` 提示输入 OTP 但没反应**
在非交互终端里跑发布无法输入 OTP。请在自己本机的终端里跑，或者在 npm
账号设置里给这个包绑定 trusted publisher 后走 CI。

**`E403 — You do not have permission to publish`**
包名已被别人占用，或当前登录账号不是 `dsh-plugin-upgrader` 的所有者。

**`404 Not Found - PUT https://registry.npmjs.org/...`（在 CI 里）**
trusted publisher 的三项配置（owner / repo / workflow 文件名）和实际仓库不一致，
或者 workflow 里没给 `id-token: write` 权限。

**CI 报 `ERR_PNPM_NO_LOCKFILE` / `--frozen-lockfile` 失败**
`pnpm-lock.yaml` 没提交。改完依赖记得 `pnpm install` 后把 lockfile 一起提交。

**发布到了镜像站**
说明 `.npmrc` 和 `package.json` 的 `publishConfig.registry` 被删了，检查一下。

**装到 DSH 后「发现」里搜不到**
插件「发现」标签的数据来自 npm registry 索引，发布后通常要等几分钟到几小时刷新。
