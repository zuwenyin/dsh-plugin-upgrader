/**
 * Browser half of the plugin-upgrader bundle.
 *
 * Registers one tab on the Plugins page, beside the page's own Installed tab.
 * The tab lists every profile-managed plugin with its installed version, the
 * newest published version, and the full published version history, so a
 * person can upgrade one plugin, upgrade everything at once, or switch a
 * plugin back to an older version.
 *
 * All data and every package change go through this bundle's own host routes
 * (`/api/plugin-upgrader/…`): the browser cannot read the profile's dependency
 * list, and a private registry would be unreachable from a page anyway.
 *
 * @module dsh-plugin-upgrader/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-upgrader',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this bundle. */
    const NS = 'plugin-upgrader'
    /** Host route prefix registered by `index.js`. */
    const API = '/api/plugin-upgrader'
    /** How often a running batch job is polled. */
    const POLL_MS = 800

    // -----------------------------------------------------------------------
    // Copy
    // -----------------------------------------------------------------------

    const ZH = {
      tab: '版本',
      title: '插件版本管理',
      subtitle: '一键升级，或切换到任意历史版本。',
      refresh: '检查更新',
      refreshing: '检查中…',
      upgradeAll: '一键升级',
      upgradeSelected: '升级选中',
      selectAll: '全选可升级',
      clearSelection: '清除选择',
      selected: (n) => `已选 ${n} 项`,
      selectRow: '选中这个插件',
      nothingSelected: '先勾选要升级的插件',
      installed: '已安装',
      upgradable: '可升级',
      upToDate: '全部已是最新',
      upgrade: '升级',
      upgrading: '升级中…',
      history: '历史版本',
      hideHistory: '收起历史',
      github: 'GitHub 主页',
      githubVersion: '在 GitHub 上打开这个版本的发布页',
      githubReleases: '在 GitHub 上打开发布列表',
      noRepo: '这个包没有登记 GitHub 仓库',
      switchTo: '切换',
      current: '当前',
      latest: '最新',
      older: '降级',
      back: '返回最新',
      empty: '还没有可管理的插件',
      emptyHint: '这个标签页列出随配置安装（profile 依赖）的插件；内置插件不在此列。',
      search: '搜索插件',
      noMatch: '没有匹配的插件',
      loading: '正在读取已安装插件…',
      loadFailed: '读取失败',
      retry: '重试',
      openPage: '在已安装中查看',
      noHistory: '没有可用的版本记录',
      noHistoryWhy: '这个包不是从 npm 注册表安装的，没有发布历史。',
      versions: (n) => `${n} 个版本`,
      showingNewest: (n) => `列出最新 ${n} 个`,
      progress: (done, total) => `正在处理 ${done}/${total}`,
      cancel: '取消',
      cancelling: '正在取消…',
      restart: '需要重启 DSH 才会生效。',
      restartHint: '已保存的改动在下次启动时生效。',
      done: '完成',
      failed: '失败',
      failedSome: (n) => `${n} 个失败`,
      jobDone: '批量升级完成',
      jobCancelled: '已取消',
      busyAdopted: '已有一批升级正在进行，已接着显示它的进度。',
      log: '运行日志',
      showLog: '查看日志',
      hideLog: '收起日志',
      buildBlocked: '这个包有未批准的构建脚本',
      approve: '批准并重启',
      registry: '注册表',
      generated: '数据更新于',
      sourcePath: '本地路径安装，无法检查版本',
      sourceGit: 'Git 安装，无法检查版本',
      unknownVersion: '版本未知',
      dialogHint: '也可以逐个打开安装对话框完成同样的升级。',
      danger: '降级会回到旧版本，旧版本可能含有已修复的问题。',
    }

    const EN = {
      tab: 'Versions',
      title: 'Plugin versions',
      subtitle: 'Upgrade everything at once, or switch to any published version.',
      refresh: 'Check for updates',
      refreshing: 'Checking…',
      upgradeAll: 'Upgrade all',
      upgradeSelected: 'Upgrade selected',
      selectAll: 'Select all upgradable',
      clearSelection: 'Clear selection',
      selected: (n) => `${n} selected`,
      selectRow: 'Select this plugin',
      nothingSelected: 'Pick the plugins you want to upgrade first.',
      installed: 'installed',
      upgradable: 'upgradable',
      upToDate: 'Everything is up to date',
      upgrade: 'Upgrade',
      upgrading: 'Upgrading…',
      history: 'Version history',
      hideHistory: 'Hide history',
      github: 'GitHub page',
      githubVersion: 'Open this version on GitHub',
      githubReleases: 'Open the releases list on GitHub',
      noRepo: 'This package lists no GitHub repository',
      switchTo: 'Switch',
      current: 'installed',
      latest: 'latest',
      older: 'downgrade',
      back: 'Back to latest',
      empty: 'No manageable plugins yet.',
      emptyHint: 'This tab lists plugins installed as profile dependencies; built-in ones are not listed.',
      search: 'Search plugins',
      noMatch: 'No plugin matches that search.',
      loading: 'Reading installed plugins…',
      loadFailed: 'Could not read the plugin list',
      retry: 'Retry',
      openPage: 'Open in Installed',
      noHistory: 'No published versions found',
      noHistoryWhy: 'This package was not installed from an npm registry, so it has no published history.',
      versions: (n) => `${n} versions`,
      showingNewest: (n) => `showing newest ${n}`,
      progress: (done, total) => `Working on ${done}/${total}`,
      cancel: 'Cancel',
      cancelling: 'Cancelling…',
      restart: 'Restart DSH to finish.',
      restartHint: 'Saved changes take effect on the next start.',
      done: 'done',
      failed: 'failed',
      failedSome: (n) => `${n} failed`,
      jobDone: 'Batch upgrade finished',
      jobCancelled: 'Cancelled',
      busyAdopted: 'A batch is already running; showing its progress instead.',
      log: 'Run log',
      showLog: 'Show log',
      hideLog: 'Hide log',
      buildBlocked: 'This package has unapproved build scripts',
      approve: 'Approve and retry',
      registry: 'Registry',
      generated: 'Updated',
      sourcePath: 'Installed from a local path, so no versions are published',
      sourceGit: 'Installed from git, so no versions are published',
      unknownVersion: 'version unknown',
      dialogHint: 'You can also upgrade one at a time through the install dialog.',
      danger: 'A downgrade returns to an older build that may contain fixed bugs.',
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Best-effort copy lookup that survives an unregistered locale namespace.
     * @param {((key: string, ...args: any[]) => string) | undefined} bound - the locale service translator.
     * @param {() => string} active - current locale id.
     * @returns {(key: string, ...args: any[]) => string} a translator.
     */
    function makeT(bound, active) {
      return (key, ...args) => {
        let text
        if (bound !== undefined) {
          try {
            const value = bound(key, ...args)
            if (typeof value === 'string' && value !== key) text = value
          } catch {
            /* fall through to the local dictionaries */
          }
        }
        if (text === undefined) {
          const dict = String(active()).toLowerCase().startsWith('zh') ? ZH : EN
          const fallback = dict[key] ?? EN[key] ?? key
          text = typeof fallback === 'function' ? fallback(...args) : String(fallback)
        }
        return text
      }
    }

    /**
     * Format a registry timestamp.
     * @param {string | undefined} iso - ISO timestamp.
     * @returns {string} a short local date, or an empty string.
     */
    function formatDate(iso) {
      if (typeof iso !== 'string') return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
    }

    /**
     * Open a URL in a new browser tab. Only http(s) links are ever passed in,
     * and `noopener,noreferrer` keeps the opened page away from this window.
     * @param {string | undefined} url - the address to open.
     */
    function openExternal(url) {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }

    /**
     * Read a JSON response, turning a failure into a thrown Error.
     * @param {Response} response - the fetch response.
     * @returns {Promise<any>} the parsed body.
     */
    async function readJson(response) {
      let body
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      if (!response.ok) {
        const message = typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`
        const failure = new Error(message)
        failure.status = response.status
        failure.body = body
        throw failure
      }
      return body
    }

    // -----------------------------------------------------------------------
    // Hooks
    // -----------------------------------------------------------------------

    /**
     * Re-render on locale changes so copy follows the active language live.
     * @param {any} locale - the locale service.
     * @returns {number} a revision counter.
     */
    function useLocaleRevision(locale) {
      const [revision, setRevision] = React.useState(0)
      React.useEffect(() => {
        if (locale === undefined || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setRevision((value) => value + 1))
      }, [locale])
      return revision
    }

    /**
     * Load the overview once and on demand.
     * @param {string} localeId - active locale id for localized metadata.
     * @returns {{ data: any, error: string | undefined, loading: boolean, reload: (force?: boolean) => void }} state.
     */
    function useOverview(localeId) {
      const [state, setState] = React.useState({ data: undefined, error: undefined, loading: true })
      const [tick, setTick] = React.useState(0)
      const [force, setForce] = React.useState(false)
      const alive = React.useRef(true)

      React.useEffect(() => () => {
        alive.current = false
      }, [])

      React.useEffect(() => {
        let cancelled = false
        setState((current) => ({ ...current, loading: true, error: undefined }))
        const query = new URLSearchParams({ refresh: force ? '1' : '0', locale: localeId })
        fetch(`${API}/overview?${query.toString()}`, { credentials: 'same-origin' })
          .then(readJson)
          .then((data) => {
            if (cancelled) return
            setState({ data, error: undefined, loading: false })
          })
          .catch((error) => {
            if (cancelled) return
            setState((current) => ({
              data: current.data,
              error: error instanceof Error ? error.message : String(error),
              loading: false,
            }))
          })
        return () => {
          cancelled = true
        }
      }, [localeId, tick, force])

      const reload = React.useCallback((shouldForce = false) => {
        setForce(shouldForce)
        setTick((value) => value + 1)
      }, [])

      return { ...state, reload }
    }

    // -----------------------------------------------------------------------
    // Components
    // -----------------------------------------------------------------------

    const STYLE_ID = 'dsh-plugin-upgrader-style'

    /** The tab's stylesheet, scoped to this bundle's class prefix. */
    const CSS = `
.dsh-pu { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; color: var(--dsw-alias-label-primary); }
.dsh-pu-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.dsh-pu-head-main { display: flex; flex-direction: column; gap: 4px; min-width: 220px; flex: 1; }
.dsh-pu-title { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.dsh-pu-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-pu-stats { display: flex; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); align-items: center; flex-wrap: wrap; }
.dsh-pu-stat { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
.dsh-pu-stat b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.dsh-pu-stat.is-warn b { color: var(--dsw-alias-brand-primary); }
.dsh-pu-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsh-pu-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); transition: background .15s ease, border-color .15s ease, opacity .15s ease; font-family: inherit; }
.dsh-pu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l2); }
.dsh-pu-btn:disabled { opacity: .5; cursor: default; }
.dsh-pu-btn.is-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: #fff; }
.dsh-pu-btn.is-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-pu-btn.is-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); padding: 0 8px; }
.dsh-pu-btn.is-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-pu-btn.is-tiny { height: 24px; padding: 0 9px; font-size: 11px; border-radius: 6px; }
.dsh-pu-search { display: flex; align-items: center; gap: 8px; }
.dsh-pu-search input { height: 30px; width: 220px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 12px; font-family: inherit; outline: none; }
.dsh-pu-search input:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.dsh-pu-list { display: flex; flex-direction: column; gap: 8px; }
.dsh-pu-row { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; transition: border-color .15s ease; }
.dsh-pu-row:hover { border-color: var(--dsw-alias-border-l2); }
.dsh-pu-row.is-open { border-color: var(--dsw-alias-border-l2); }
.dsh-pu-row.is-picked { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent); }
.dsh-pu-row-main { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
.dsh-pu-check { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; }
.dsh-pu-check input { width: 14px; height: 14px; margin: 0; cursor: pointer; accent-color: var(--dsw-alias-brand-primary); }
.dsh-pu-check input:disabled { cursor: default; opacity: .45; }
.dsh-pu-selbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 7px 10px; border-radius: 8px; border: 1px dashed var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.dsh-pu-selbar.is-active { border-style: solid; border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
.dsh-pu-selbar .dsh-pu-grow { flex: 1; min-width: 0; }
.dsh-pu-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--dsw-alias-label-dimmed); }
.dsh-pu-dot.is-new { background: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.dsh-pu-dot.is-err { background: var(--dsw-alias-state-error-primary); }
.dsh-pu-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.dsh-pu-name { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-pu-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-pu-desc { font-size: 11px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-pu-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-pu-tag { font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-weight: 500; white-space: nowrap; }
.dsh-pu-tag.is-new { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.dsh-pu-tag.is-err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dsh-pu-vers { display: flex; align-items: center; gap: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }
.dsh-pu-vers b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.dsh-pu-vers i { font-style: normal; color: var(--dsw-alias-label-tertiary); }
.dsh-pu-row-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.dsh-pu-hist { border-top: 1px dashed var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); padding: 8px 12px 10px; }
.dsh-pu-hist-head { display: flex; align-items: center; gap: 8px; justify-content: flex-start; font-size: 11px; color: var(--dsw-alias-label-secondary); padding-bottom: 6px; }
.dsh-pu-hist-head .dsh-pu-mono { margin-left: auto; }
.dsh-pu-dim { color: var(--dsw-alias-label-tertiary); }
.dsh-pu-hist-list { display: flex; flex-direction: column; max-height: 260px; overflow: auto; }
.dsh-pu-hist-row { display: flex; align-items: center; gap: 10px; padding: 5px 6px; border-radius: 6px; font-size: 11px; }
.dsh-pu-hist-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pu-hist-row.is-current { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
.dsh-pu-hist-row .dsh-pu-mono { flex: none; min-width: 108px; color: var(--dsw-alias-label-primary); }
.dsh-pu-link { display: inline-flex; align-items: center; gap: 4px; border: 0; padding: 0; margin: 0; background: none; cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-link); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--dsw-alias-link) 40%, transparent); text-underline-offset: 2px; }
.dsh-pu-link:hover { color: var(--dsw-alias-brand-primary); text-decoration-color: currentColor; }
.dsh-pu-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
.dsh-pu-hist-row time { color: var(--dsw-alias-label-tertiary); flex: none; min-width: 84px; }
.dsh-pu-hist-row .dsh-pu-note { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-state-warn-primary); }
.dsh-pu-empty { border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; padding: 28px 16px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-secondary); display: flex; flex-direction: column; gap: 6px; }
.dsh-pu-empty small { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-pu-job { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.dsh-pu-job-head { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.dsh-pu-job-head .dsh-pu-grow { flex: 1; min-width: 0; }
.dsh-pu-bar { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.dsh-pu-bar div { height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
.dsh-pu-log { max-height: 160px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-word; border-top: 1px dashed var(--dsw-alias-border-l1); padding-top: 8px; margin: 0; }
.dsh-pu-banner { display: flex; align-items: center; gap: 8px; font-size: 11.5px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.dsh-pu-banner.is-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.dsh-pu-banner.is-err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dsh-pu-foot { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary); flex-wrap: wrap; }
.dsh-pu-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-brand-primary); animation: dsh-pu-spin .8s linear infinite; flex: none; }
@keyframes dsh-pu-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-pu-spin { animation-duration: 2.4s; } }
`

    /**
     * One version line inside a row's history.
     * @param {{ row: any, version: any, t: Function, busy: boolean, onSwitch: Function }} props - render props.
     * @returns {any} the element.
     */
    function VersionLine({ row, version, t, busy, onSwitch }) {
      const note = version.deprecated !== undefined ? `⚠ ${version.deprecated}` : ''
      const raw = typeof version.href === 'string'
        ? version.href
        : typeof version.url === 'string' && typeof row.repoUrl === 'string' && version.url.startsWith('/')
          ? `${row.repoUrl}${version.url}`
          : version.url
      const link = typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : undefined
      /** A row without a tag of its own points at the repository's release feed. */
      const linkLabel = link !== undefined && /\/releases\/tag\//.test(link)
        ? t('githubVersion')
        : t('githubReleases')
      return h(
        'div',
        { className: `dsh-pu-hist-row${version.current ? ' is-current' : ''}` },
        link !== undefined
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-mono dsh-pu-link',
                title: `${linkLabel} →${link}`,
                onClick: () => openExternal(link),
              },
              version.version,
            )
          : h('span', { className: 'dsh-pu-mono' }, version.version),
        h('time', null, formatDate(version.time)),
        version.latest ? h('span', { className: 'dsh-pu-tag is-new' }, t('latest')) : null,
        version.current ? h('span', { className: 'dsh-pu-tag' }, t('current')) : null,
        h('span', { className: 'dsh-pu-note' }, note),
        link !== undefined
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-ghost is-tiny',
                title: `${linkLabel} →${link}`,
                'aria-label': linkLabel === t('githubVersion')
                  ? `${linkLabel}: ${version.version}`
                  : linkLabel,
                onClick: () => openExternal(link),
              },
                '→',
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pu-btn is-tiny',
            disabled: busy || version.current === true,
            onClick: () => onSwitch(row, version.version),
          },
          version.version === row.latest ? t('back') : t('switchTo'),
        ),
      )
    }

    /**
     * One installed plugin.
     * @param {{ row: any, t: Function, busy: boolean, onUpgrade: Function, onSwitch: Function, onApprove: Function, onOpenPage: Function }} props - render props.
     * @returns {any} the element.
     */
    function PluginRow({ row, t, busy, picked, onToggle, onUpgrade, onSwitch, onApprove, onOpenPage }) {
      const [open, setOpen] = React.useState(false)
      const hasHistory = Array.isArray(row.versions) && row.versions.length > 0
      const selectable = row.upgradable === true
      const status = row.error !== undefined && row.error !== null
        ? 'err'
        : row.upgradable
          ? 'new'
          : 'idle'
      const versionNote = row.versionError !== undefined
        ? row.versionError === 'not a profile-managed package'
          ? t('sourcePath')
          : row.versionError
        : undefined

      return h(
        'div',
        { className: `dsh-pu-row${open ? ' is-open' : ''}${picked ? ' is-picked' : ''}` },
        h(
          'div',
          { className: 'dsh-pu-row-main' },
          h(
            'span',
            { className: 'dsh-pu-check' },
            h('input', {
              type: 'checkbox',
              checked: picked === true,
              disabled: busy || !selectable,
              title: selectable ? t('selectRow') : undefined,
              'aria-label': `${t('selectRow')}: ${row.name}`,
              onChange: () => onToggle(row.name),
            }),
          ),
          h('span', { className: `dsh-pu-dot${status === 'idle' ? '' : status === 'new' ? ' is-new' : ' is-err'}` }),
          h(
            'div',
            { className: 'dsh-pu-id' },
            h(
              'div',
              { className: 'dsh-pu-name' },
              h('span', { title: row.name }, row.title === row.name ? row.name : `${row.title} · ${row.name}`),
              row.enabled === false ? h('span', { className: 'dsh-pu-tag' }, 'off') : null,
              row.upgradable ? h('span', { className: 'dsh-pu-tag is-new' }, t('upgradable')) : null,
            ),
            h(
              'div',
              { className: 'dsh-pu-desc' },
              row.description !== undefined && row.description !== ''
                ? row.description
                : versionNote ?? row.name,
            ),
          ),
          h(
            'div',
            { className: 'dsh-pu-vers' },
            h('b', null, row.version ?? t('unknownVersion')),
            row.upgradable ? h('i', null, '→') : null,
            row.upgradable ? h('b', null, row.latest) : null,
          ),
          h(
            'div',
            { className: 'dsh-pu-row-actions' },
            row.upgradable
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-pu-btn is-primary is-tiny',
                    disabled: busy,
                    onClick: () => onUpgrade(row),
                  },
                  t('upgrade'),
                )
              : null,
            typeof row.repoUrl === 'string'
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-pu-btn is-tiny',
                    title: `${t('github')} →${row.repoUrl}`,
                    onClick: () => openExternal(row.repoUrl),
                  },
                  'GH',
                )
              : null,
            hasHistory
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-pu-btn is-tiny',
                    onClick: () => setOpen((value) => !value),
                    'aria-expanded': open,
                  },
                  open ? t('hideHistory') : `${t('history')} (${row.versions.length})`,
                )
              : null,
            typeof onOpenPage === 'function'
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-pu-btn is-ghost is-tiny',
                    title: t('openPage'),
                    onClick: () => onOpenPage(row.name),
                  },
                  '→',
                )
              : null,
          ),
        ),
        row.pendingBuilds !== undefined && Array.isArray(row.pendingBuilds) && row.pendingBuilds.length > 0
          ? h(
              'div',
              { className: 'dsh-pu-hist' },
              h(
                'div',
                { className: 'dsh-pu-banner is-warn' },
                h('span', null, t('buildBlocked')),
                h(
                  'button',
                  { type: 'button', className: 'dsh-pu-btn is-tiny', onClick: () => onApprove(row) },
                  t('approve'),
                ),
              ),
            )
          : null,
        open
          ? h(
              'div',
              { className: 'dsh-pu-hist' },
              h(
                'div',
                { className: 'dsh-pu-hist-head' },
                h('span', null, t('versions', row.totalVersions ?? row.versions.length)),
                typeof row.totalVersions === 'number' && row.totalVersions > row.versions.length
                  ? h('span', { className: 'dsh-pu-dim' }, t('showingNewest', row.versions.length))
                  : null,
                h('span', { className: 'dsh-pu-mono' }, row.name),
              ),
              h(
                'div',
                { className: 'dsh-pu-hist-list' },
                row.versions.map((version) =>
                  h(VersionLine, {
                    key: version.version,
                    row,
                    version,
                    t,
                    busy,
                    onSwitch,
                  }),
                ),
              ),
            )
          : null,
      )
    }

    /**
     * Batch progress panel.
     * @param {{ job: any, t: Function, onCancel: Function, cancelling: boolean }} props - render props.
     * @returns {any} the element.
     */
    function JobPanel({ job, t, onCancel, cancelling }) {
      const [showLog, setShowLog] = React.useState(true)
      const total = job.total ?? 0
      const done = job.done ?? 0
      const percent = total === 0 ? 0 : Math.round((done / total) * 100)
      const running = job.status === 'running' || job.status === 'queued'
      const failed = job.failed ?? 0
      return h(
        'div',
        { className: 'dsh-pu-job' },
        h(
          'div',
          { className: 'dsh-pu-job-head' },
          running ? h('span', { className: 'dsh-pu-spin' }) : null,
          h(
            'span',
            { className: 'dsh-pu-grow' },
            running
              ? t('progress', done, total)
              : job.status === 'cancelled'
                ? t('jobCancelled')
                : t('jobDone'),
            job.current !== undefined ? h('span', { className: 'dsh-pu-mono' }, ` ${job.current}`) : null,
          ),
          failed > 0 ? h('span', { className: 'dsh-pu-tag is-err' }, t('failedSome', failed)) : null,
          running
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny',
                  disabled: cancelling,
                  onClick: onCancel,
                },
                cancelling ? t('cancelling') : t('cancel'),
              )
            : null,
          h(
            'button',
            { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: () => setShowLog((value) => !value) },
            showLog ? t('hideLog') : t('showLog'),
          ),
        ),
        h('div', { className: 'dsh-pu-bar' }, h('div', { style: { width: `${percent}%` } })),
        showLog && Array.isArray(job.log)
          ? h('pre', { className: 'dsh-pu-log' }, job.log.join('\n'))
          : null,
      )
    }

    /**
     * The Plugins-page tab.
     * @param {any} props - owner props (`install`, `openPackage`) plus standard props.
     * @returns {any} the element.
     */
    function Tab(props) {
      const { t, locale } = props
      const revision = useLocaleRevision(locale)
      const localeId = React.useMemo(() => {
        try {
          return String(locale?.getLocale?.().active ?? 'en')
        } catch {
          return 'en'
        }
      }, [locale, revision])
      const { data, error, loading, reload } = useOverview(localeId)

      const [query, setQuery] = React.useState('')
      const [picked, setPicked] = React.useState(() => new Set())
      const [job, setJob] = React.useState(undefined)
      const [busyName, setBusyName] = React.useState(undefined)
      const [cancelling, setCancelling] = React.useState(false)
      const [banner, setBanner] = React.useState(undefined)

      const alive = React.useRef(true)
      React.useEffect(() => () => {
        alive.current = false
      }, [])

      /** Poll a job until it settles, then reload the overview. */
      const watch = React.useCallback(
        async (id) => {
          let settled
          for (;;) {
            if (!alive.current) return
            // eslint-disable-next-line no-await-in-loop
            const response = await fetch(`${API}/job?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
            // eslint-disable-next-line no-await-in-loop
            const snapshot = await readJson(response).catch(() => undefined)
            if (snapshot === undefined) break
            if (alive.current) setJob(snapshot)
            if (snapshot.status !== 'running' && snapshot.status !== 'queued') {
              settled = snapshot
              break
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, POLL_MS))
          }
          if (!alive.current) return
          setBusyName(undefined)
          setCancelling(false)
          reload(false)
          const failures = settled?.results?.filter((result) => result.ok !== true) ?? []
          if (failures.length > 0) {
            setBanner({
              tone: 'err',
              text: failures.map((failure) => `${failure.name}: ${failure.message ?? failure.detail ?? 'error'}`).join(' · '),
            })
          } else if (settled?.results?.some((result) => result.application === 'restart-required')) {
            setBanner({ tone: 'warn', text: t('restart') })
          }
        },
        [reload, t],
      )

      /**
       * Adopt a job that is still running on the host. The tab is remounted
       * whenever the Plugins page is reopened, and the host keeps the job, so
       * a fresh tab would otherwise look idle while a batch is in flight.
       */
      const adopted = React.useRef(undefined)
      React.useEffect(() => {
        const live = data?.active
        if (live === undefined || live === null) return
        if (adopted.current === live.id) return
        adopted.current = live.id
        setJob(live)
        setBusyName(live.current)
        void watch(live.id)
      }, [data, watch])

      /** Start a batch of steps. */
      const run = React.useCallback(
        async (steps, label) => {
          if (steps.length === 0) return
          setBanner(undefined)
          setBusyName(label)
          try {
            const response = await fetch(`${API}/job`, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ steps }),
            })
            const started = await readJson(response)
            setJob({ id: started.id, status: 'queued', total: steps.length, done: 0, failed: 0, log: [] })
            await watch(started.id)
          } catch (failure) {
            setBusyName(undefined)
            // A batch already running is not an error the user caused: adopt it
            // and keep reporting its progress rather than showing a dead "busy".
            if (failure instanceof Error && failure.status === 409 && typeof failure.body?.id === 'string') {
              setJob({
                id: failure.body.id,
                status: 'running',
                total: failure.body.total ?? 0,
                done: failure.body.done ?? 0,
                failed: 0,
                current: failure.body.current,
                log: [],
              })
              setBanner({ tone: 'warn', text: t('busyAdopted') })
              await watch(failure.body.id)
              return
            }
            setBanner({ tone: 'err', text: failure instanceof Error ? failure.message : String(failure) })
          }
        },
        [watch, t],
      )

      const rows = Array.isArray(data?.bundles) ? data.bundles : []
      const upgradable = rows.filter((row) => row.upgradable === true)
      const filtered = query.trim() === ''
        ? rows
        : rows.filter((row) => {
            const needle = query.trim().toLowerCase()
            return (
              row.name.toLowerCase().includes(needle) ||
              String(row.title ?? '').toLowerCase().includes(needle)
            )
          })

      const busy = busyName !== undefined || (job !== undefined && (job.status === 'running' || job.status === 'queued'))

      // Only upgradable rows can be picked, so a stale pick (a plugin that just
      // got upgraded, or dropped out of the registry) never blocks the button.
      const pickedCount = upgradable.reduce((count, row) => (picked.has(row.name) ? count + 1 : count), 0)

      const upgradeOne = (row) =>
        run([{ name: row.name, version: row.latest, action: 'upgrade', enabled: row.enabled !== false }], row.name)

      const switchOne = (row, version) =>
        run([{ name: row.name, version, action: 'switch', enabled: row.enabled !== false }], row.name)

      const approveAndRetry = (row) => {
        const pending = Array.isArray(row.pendingBuilds) ? row.pendingBuilds : []
        run(
          [
            {
              name: row.name,
              version: row.latest ?? row.version,
              action: 'upgrade',
              enabled: row.enabled !== false,
              approveBuilds: pending,
            },
          ],
          row.name,
        )
      }

      const upgradeAll = () =>
        run(
          upgradable.map((row) => ({
            name: row.name,
            version: row.latest,
            action: 'upgrade',
            enabled: row.enabled !== false,
          })),
          t('upgradeAll'),
        )

      /** Toggle one plugin in the selection. */
      const togglePick = (name) =>
        setPicked((current) => {
          const next = new Set(current)
          if (next.has(name)) next.delete(name)
          else next.add(name)
          return next
        })

      /** Select every upgradable row that is currently visible. */
      const pickAll = () => setPicked(new Set(upgradable.map((row) => row.name)))

      /** Drop the whole selection. */
      const clearPicked = () => setPicked(new Set())

      /** Upgrade only the checked plugins, in list order. */
      const upgradePicked = () =>
        run(
          upgradable
            .filter((row) => picked.has(row.name))
            .map((row) => ({
              name: row.name,
              version: row.latest,
              action: 'upgrade',
              enabled: row.enabled !== false,
            })),
          t('upgradeSelected'),
        )

      const cancel = async () => {
        setCancelling(true)
        try {
          await fetch(`${API}/cancel`, { method: 'POST', credentials: 'same-origin' })
        } catch {
          /* the poll loop reports the final state anyway */
        }
      }

      return h(
        'div',
        { className: 'dsh-pu' },
        h('style', { key: STYLE_ID }, CSS),
        h(
          'div',
          { className: 'dsh-pu-head' },
          h(
            'div',
            { className: 'dsh-pu-head-main' },
            h('div', { className: 'dsh-pu-title' }, t('title')),
            h('div', { className: 'dsh-pu-sub' }, t('subtitle')),
            h(
              'div',
              { className: 'dsh-pu-stats' },
              h(
                'span',
                { className: 'dsh-pu-stat' },
                t('installed'),
                ' ',
                h('b', null, String(rows.length)),
              ),
              h(
                'span',
                { className: `dsh-pu-stat${upgradable.length > 0 ? ' is-warn' : ''}` },
                t('upgradable'),
                ' ',
                h('b', null, String(upgradable.length)),
              ),
              data?.registry !== undefined
                ? h('span', { className: 'dsh-pu-mono' }, `${t('registry')}: ${data.registry}`)
                : null,
            ),
          ),
          h(
            'div',
            { className: 'dsh-pu-actions' },
            h(
              'div',
              { className: 'dsh-pu-search' },
              h('input', {
                type: 'search',
                placeholder: t('search'),
                value: query,
                onChange: (event) => setQuery(event.target.value),
                'aria-label': t('search'),
              }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn',
                disabled: loading === true || busy,
                onClick: () => reload(true),
              },
              loading === true ? h('span', { className: 'dsh-pu-spin' }) : null,
              loading === true ? t('refreshing') : t('refresh'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-pu-btn is-primary',
                disabled: upgradable.length === 0 || busy,
                onClick: upgradeAll,
              },
              t('upgradeAll'),
              upgradable.length > 0 ? ` (${upgradable.length})` : '',
            ),
          ),
        ),

        banner !== undefined
          ? h(
              'div',
              { className: `dsh-pu-banner${banner.tone === 'err' ? ' is-err' : banner.tone === 'warn' ? ' is-warn' : ''}` },
              h('span', null, banner.text),
              banner.tone === 'warn' ? h('span', null, t('restartHint')) : null,
              h(
                'button',
                { type: 'button', className: 'dsh-pu-btn is-ghost is-tiny', onClick: () => setBanner(undefined) },
                '✕',
              ),
            )
          : null,

        job !== undefined ? h(JobPanel, { job, t, onCancel: cancel, cancelling }) : null,

        rows.length > 0
          ? h(
              'div',
              { className: `dsh-pu-selbar${pickedCount > 0 ? ' is-active' : ''}` },
              h(
                'span',
                { className: 'dsh-pu-grow' },
                pickedCount > 0 ? t('selected', pickedCount) : t('nothingSelected'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny',
                  disabled: busy || upgradable.length === 0,
                  onClick: pickAll,
                },
                t('selectAll'),
              ),
              pickedCount > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-pu-btn is-tiny',
                      disabled: busy,
                      onClick: clearPicked,
                    },
                    t('clearSelection'),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pu-btn is-tiny is-primary',
                  disabled: busy || pickedCount === 0,
                  onClick: upgradePicked,
                },
                t('upgradeSelected'),
                pickedCount > 0 ? ` (${pickedCount})` : '',
              ),
            )
          : null,

        loading === true && rows.length === 0
          ? h('div', { className: 'dsh-pu-empty' }, h('span', null, t('loading')))
          : null,

        error !== undefined && rows.length === 0
          ? h(
              'div',
              { className: 'dsh-pu-empty' },
              h('span', null, `${t('loadFailed')} →${error}`),
              h(
                'div',
                null,
                h('button', { type: 'button', className: 'dsh-pu-btn is-tiny', onClick: () => reload(true) }, t('retry')),
              ),
            )
          : null,

        rows.length === 0 && loading !== true && error === undefined
          ? h(
              'div',
              { className: 'dsh-pu-empty' },
              h('span', null, t('empty')),
              h('small', null, t('emptyHint')),
            )
          : null,

        filtered.length === 0 && rows.length > 0
          ? h('div', { className: 'dsh-pu-empty' }, h('span', null, t('noMatch')))
          : null,

        filtered.length > 0
          ? h(
              'div',
              { className: 'dsh-pu-list' },
              filtered.map((row) =>
                h(PluginRow, {
                  key: row.name,
                  row,
                  t,
                  busy,
                  picked: picked.has(row.name),
                  onToggle: togglePick,
                  onUpgrade: upgradeOne,
                  onSwitch: switchOne,
                  onApprove: approveAndRetry,
                  onOpenPage: typeof props.openPackage === 'function' ? props.openPackage : undefined,
                }),
              ),
            )
          : null,

        rows.length > 0 && upgradable.length === 0
          ? h('div', { className: 'dsh-pu-banner' }, h('span', null, t('upToDate')))
          : null,

        h(
          'div',
          { className: 'dsh-pu-foot' },
          data?.generatedAt !== undefined
            ? h('span', null, `${t('generated')} ${new Date(data.generatedAt).toLocaleTimeString()}`)
            : null,
          data?.registry !== undefined ? h('span', { className: 'dsh-pu-mono' }, data.registry) : null,
        ),
      )
    }

    // -----------------------------------------------------------------------
    // Plugin
    // -----------------------------------------------------------------------

    /** Stable plugin name; matches the package and the patch insert id. */
    const name = 'plugin-upgrader'

    /** Hard client dependencies: the slot registry and the locale registry. */
    const inject = ['slots', 'locale']

    /**
     * Mount the browser half.
     * @param {any} ctx - the client plugin context.
     */
    function apply(ctx) {
      const locale = ctx.get('locale', false)
      const active = () => {
        try {
          return String(locale?.getLocale?.().active ?? 'en')
        } catch {
          return 'en'
        }
      }
      let bound
      if (locale !== undefined && locale !== null) {
        try {
          locale.register(NS, { zh: ZH, en: EN })
          bound = locale.bind(NS)
        } catch (error) {
          console.warn('[plugin-upgrader] locale namespace unavailable, using built-in copy', error)
        }
      }
      const t = makeT(bound, active)

      ctx.slots.inject('plugins.tab', () =>
        ctx.slots.register(
          {
            name: 'plugins.tab',
            id: name,
            order: 5,
            label: () => t('tab'),
          },
          (ownerProps) => h(Tab, { ...ownerProps, t, locale }),
        ),
      )
    }

    return { name, inject, apply }
  },
})
