# dsh-plugin-upgrader

[![npm](https://img.shields.io/npm/v/dsh-plugin-upgrader.svg)](https://www.npmjs.com/package/dsh-plugin-upgrader)
[![license](https://img.shields.io/npm/l/dsh-plugin-upgrader.svg)](./LICENSE)

> 给 DeepSeek Harness（DSH）的「插件」页补上**一键升级**和**版本历史 / 回滚**。

DSH 自带的插件页能装、能卸、能看已安装列表，但缺两件事：一次把全部插件升到最新，以及退回某个旧版本。
这个插件在插件页里加一个「版本」标签，把这两件事补齐。

[English](./README.en.md) · 中文

![版本标签](./screenshots/history.png)

## 功能

- **一键升级** —— 一次把全部可升级插件升到最新版，带进度、逐项结果和失败原因。
- **多选升级** —— 勾选任意几个插件，只升级选中的这些。
- **版本历史 / 回滚** —— 展开任意插件即可看到已发布的全部版本（含发布时间与引擎要求），点一下切到那个版本。
- **一键跳 GitHub** —— 每行的 `GH` 按钮打开插件仓库主页；点版本号直接进该版本的 GitHub 发布页。

## 界面位置

插件页顶部标签栏多出一个「版本」标签，与「已安装」「发现」并列：

- 顶部统计：可升级数量 / 已安装数量 / 每个插件的版本数
- 「一键升级」升全部可升级插件；下面一条选择栏负责「升级选中」
- 「检查更新」强制刷新 registry 缓存（默认缓存 5 分钟）
- 搜索框按包名过滤
- 每个插件一行，展开「历史 (n)」后是该插件的完整版本列表
- `GH` 打开仓库主页（没有仓库的插件不显示该按钮）
- 版本列表里每个版本号本身就是链接，点开直接进 GitHub 的发布页：
  - 该版本打过 tag → `releases/tag/v<version>`（tag 是否真实存在由 GitHub tag 列表确认，
    不是猜的，所以不会点进 404）
  - 该版本没打 tag，或 GitHub 列表读不到（限流 / 离线）→ 退回仓库的发布列表 `releases`，
    不在页面上放一个点进去是 404 的版本号

![展开历史版本](./screenshots/selection.png)

## 安装

在「插件」页的**发现**标签里搜索 `dsh-plugin-upgrader`，点安装即可。
桌面版请用它自带的插件管理界面安装，命令行改动不了正在运行的桌面 profile。

用 `dsh` 命令行（把 `web` 换成你自己的 profile 名）：

```bash
dsh plugin --profile web add dsh-plugin-upgrader
```

从源码安装：

```bash
git clone https://github.com/zuwenyin/dsh-plugin-upgrader.git
cd dsh-plugin-upgrader
dsh plugin --profile web add "$PWD"
```

装好后打开「插件」页，顶部会多出「版本」标签。不需要重新构建，也不用重启。

## 工作原理

浏览器端读不到 profile 的依赖清单，也无法可靠直连 npm（CORS、私有源、token），
因此所有包操作都放在宿主端：

| 路由 | 作用 |
| --- | --- |
| `GET /api/plugin-upgrader/overview` | 已安装插件 + 各插件已发布版本（registry packument，5 分钟缓存，10 秒超时） |
| `POST /api/plugin-upgrader/job` | 提交一批升级 / 切换步骤，立即返回 job id |
| `GET /api/plugin-upgrader/job?id=…` | 轮询进度与逐项结果 |
| `POST /api/plugin-upgrader/cancel` | 中断当前步骤 |

所有路由仅限本机回环访问：批量操作会安装软件包，配对设备或跨站页面一律拒绝。

### 为什么「切换版本」是「先卸载再安装」

`pluginManager.installBundle` 对已安装的包名会以 `already-installed` 拒绝，
所以换版本必须是 remove + install（官方「更新」走的也是同一条路）。
旧版本号会回传给界面，用于提示这是降级。

### enabled 状态保留

卸载会丢掉插件原有的启用 / 禁用状态，因此每一步在安装完成后会按操作前的状态
重新 `setBundleEnabled`，禁用中的插件升级后仍然是禁用状态。

### 同一时刻只跑一批

宿主端一次只允许一个 job。重复提交会拿到 `409 busy`（带正在跑的那个 job id），
界面据此**接管**那一批的进度显示，而不是弹一条看不懂的错误：

- 新开一个插件页标签、或在进度跑着时再点「一键升级」，都会看到正在进行的那一批
- `overview` 里带 `active` 字段，标签页一挂载就能接上正在跑的任务
- job 每隔几秒写一次心跳时间戳，宿主重启后遗留的「僵尸 job」会按心跳超时自动作废，
  不会永久占着位置让之后所有升级都撞 `busy`

主进程重启会让正在跑的 job 中断，界面会把这种情况显示为失败而不是永远转圈。

## 项目结构

```
dsh-plugin-upgrader/
├── src/
│   ├── index.js          宿主端：路由注册、job 调度
│   ├── client.js         浏览器端：plugins.tab 槽位的「版本」标签
│   └── lib/
│       ├── overview.js   组装 overview 载荷
│       ├── registry.js   registry packument 拉取 / 裁剪、GitHub tag 列表
│       ├── install.js    单步安装 + enabled 状态恢复
│       ├── bundle.js     插件元数据（来源分类、多语言字段、图标）
│       ├── repo.js       仓库 URL 归一化
│       ├── version.js    semver 比较、发布页链接
│       └── http.js       回环校验、JSON 读写
├── locale/               （保留）语言包
├── assets/icon.svg       图标
├── test/                 node:test 单元测试
├── cordis.patch.yml      bundle 注册
└── package.json
```

`src/client.js` 是浏览器模块，通过 `window.__ModuleLoader__` 加载，只能 `require('react')`
这类由宿主提供的模块，不能 import 本地文件，所以它保持单文件。

## 开发

```bash
npm test        # node:test 单元测试（纯函数：版本比较、仓库 URL、元数据分类）
npm run check   # node --check 语法检查
```

宿主端在 `src/index.js`（`webServer` 前缀路由 `/api/plugin-upgrader`），
浏览器端在 `src/client.js`（注册 `plugins.tab` 槽位）。

改完代码后让宿主重新加载本插件即可，无需重启应用：
先 `pluginManager.setBundleEnabled(name, false)` 再 `setBundleEnabled(name, true)`。

## 发布

见 [RELEASING.md](./RELEASING.md)。首次手动发一次，之后打 `v*` tag 由 CI 通过 npm trusted publishing 自动发布：

```bash
npm publish --access public   # 仅首次
```

## 许可

[MIT](./LICENSE)
