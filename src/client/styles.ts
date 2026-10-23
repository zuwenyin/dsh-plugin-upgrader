/**
 * The tab's stylesheet.
 *
 * The Plugins page has no styling hook for third-party tabs, so the tab ships
 * its own sheet and scopes every rule to the `dsh-pu` prefix. Colours come from
 * the host's design tokens, so the tab follows the active theme instead of
 * hard-coding one.
 *
 * @module dsh-plugin-upgrader/client/styles
 */

/** The style element's key, so React replaces one node instead of stacking them. */
export const STYLE_ID = 'dsh-plugin-upgrader-style'

/** Every rule the tab uses. */
export const CSS = `
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
.dsh-pu-check { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; cursor: pointer; border-radius: 4px; outline: none; }
.dsh-pu-check .dsh-pu-tick { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-1); box-sizing: border-box; position: relative; transition: background .12s ease, border-color .12s ease; }
.dsh-pu-check.is-on .dsh-pu-tick { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-pu-check.is-on .dsh-pu-tick::after { content: ''; position: absolute; left: 4px; top: 1px; width: 4px; height: 7px; border: solid var(--dsw-alias-label-primary-inverted, #fff); border-width: 0 2px 2px 0; transform: rotate(45deg); }
.dsh-pu-check.is-off { cursor: default; }
.dsh-pu-check.is-off .dsh-pu-tick { opacity: .45; }
.dsh-pu-check:not(.is-off):hover .dsh-pu-tick { border-color: var(--dsw-alias-brand-primary); }
.dsh-pu-check:not(.is-off):focus-visible .dsh-pu-tick { box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
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
