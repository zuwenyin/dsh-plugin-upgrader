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

推送 tag 后 GitHub Actions 会自动跑 `pnpm run check` → `pnpm test` → `pnpm publish`。
（`pnpm publish` 在 trusted publishing 下会自己附加 provenance，不需要再写 `--provenance`。）

看进度：

```bash
gh run list --repo zuwenyin/dsh-plugin-upgrader --limit 3
gh run watch --repo zuwenyin/dsh-plugin-upgrader
```

发布完验证：

```bash
pnpm view dsh-plugin-upgrader version --registry https://registry.npmjs.org
```

---

## 需要出 GitHub Release 页面

npm 发布和 GitHub Release 是两件事。要生成 Release 页面（用户点 "GH" 链接看到的那页）：

```bash
gh release create v1.0.1 --repo zuwenyin/dsh-plugin-upgrader --title "v1.0.1" --notes-file CHANGELOG.md
```

或者用网页：https://github.com/zuwenyin/dsh-plugin-upgrader/releases/new

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
