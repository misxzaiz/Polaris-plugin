/**
 * Panel.tsx —— 票匣外壳：CSS 注入 + 状态灯 + 四 Tab + 15s 轮询（可见时）+ toast。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as core from '../shared/core'
import type { PiaoData } from './model'
import { loadPiaoxia } from './model'
import InboxTab from './InboxTab'
import LedgerTab from './LedgerTab'
import InsightTab from './InsightTab'
import SettingsTab from './SettingsTab'

export interface PanelCtx {
  data: PiaoData
  view: core.View
  reload: () => Promise<void>
  toast: (msg: string, isErr?: boolean) => void
  sendToChat?: (message: string) => void | Promise<void>
}

const CSS = `
.px-root { font: 13px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: #d7dde6;
  background: #0d1117; min-height: 100%; box-sizing: border-box; padding: 14px 16px 40px; }
.px-root * { box-sizing: border-box; }
.px-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.px-logo { font-size: 17px; font-weight: 700; color: #e6edf3; letter-spacing: .5px; }
.px-logo .px-accent { color: #f2a33c; }
.px-sub { color: #7d8590; font-size: 12px; }
.px-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; vertical-align: 1px; }
.px-dot.ok { background: #3fb950; box-shadow: 0 0 6px #3fb95088; }
.px-dot.warn { background: #d29922; }
.px-dot.off { background: #6e7681; }
.px-tabs { display: flex; gap: 4px; margin: 10px 0 14px; border-bottom: 1px solid #21262d; flex-wrap: wrap; }
.px-tab { padding: 7px 14px; cursor: pointer; color: #7d8590; border-bottom: 2px solid transparent; user-select: none; font-size: 13px; }
.px-tab:hover { color: #d7dde6; }
.px-tab.on { color: #f2a33c; border-bottom-color: #f2a33c; font-weight: 600; }
.px-badge { background: #da3633; color: #fff; border-radius: 8px; font-size: 10px; padding: 1px 6px; margin-left: 5px; vertical-align: 2px; }
.px-card { background: #161b22; border: 1px solid #242c3a; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
.px-card h3 { margin: 0 0 10px; font-size: 13px; color: #e6edf3; }
.px-card h3 .px-hint { font-weight: 400; color: #7d8590; font-size: 11px; margin-left: 8px; }
.px-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.px-stat { background: #0d1117; border: 1px solid #242c3a; border-radius: 8px; padding: 10px 12px; }
.px-stat .n { font-size: 19px; font-weight: 700; color: #e6edf3; }
.px-stat .l { font-size: 11px; color: #7d8590; margin-top: 2px; }
.px-stat.money .n { color: #f2a33c; }
.px-btn { display: inline-block; padding: 6px 14px; border-radius: 6px; border: 1px solid #30363d; background: #21262d;
  color: #d7dde6; cursor: pointer; font-size: 12px; user-select: none; }
.px-btn:hover { border-color: #8b949e; }
.px-btn:disabled { opacity: .45; cursor: not-allowed; }
.px-btn.primary { background: #bb5c14; border-color: #bb5c14; color: #fff; }
.px-btn.primary:hover { background: #d46d1a; }
.px-btn.danger { background: transparent; border-color: #b62324; color: #f85149; }
.px-btn.danger:hover { background: #da36331f; }
.px-btn.sm { padding: 3px 9px; font-size: 11px; }
.px-input, .px-select, .px-textarea { background: #0d1117; border: 1px solid #30363d; color: #d7dde6;
  border-radius: 6px; padding: 6px 9px; font-size: 12px; font-family: inherit; }
.px-input:focus, .px-select:focus, .px-textarea:focus { outline: none; border-color: #f2a33c; }
.px-textarea { width: 100%; resize: vertical; }
.px-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.px-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.px-table th { text-align: left; color: #7d8590; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #242c3a; white-space: nowrap; }
.px-table td { padding: 7px 8px; border-bottom: 1px solid #1a212b; vertical-align: top; }
.px-table tr.click { cursor: pointer; }
.px-table tr.click:hover td { background: #161b2280; }
.px-tag { display: inline-block; padding: 1px 8px; border-radius: 9px; font-size: 11px; border: 1px solid; white-space: nowrap; }
.px-tag.pending { color: #f2a33c; border-color: #f2a33c55; }
.px-tag.submitted { color: #58a6ff; border-color: #58a6ff55; }
.px-tag.settled { color: #3fb950; border-color: #3fb95055; }
.px-tag.rejected { color: #f85149; border-color: #f8514955; }
.px-tag.excluded { color: #7d8590; border-color: #7d859055; }
.px-drop { border: 2px dashed #30363d; border-radius: 12px; padding: 30px 16px; text-align: center; color: #7d8590;
  transition: all .15s; cursor: pointer; }
.px-drop.over { border-color: #f2a33c; background: #f2a33c10; color: #f2a33c; }
.px-drop .big { font-size: 15px; color: #d7dde6; margin-bottom: 4px; }
.px-ok { color: #3fb950; } .px-warn { color: #d29922; } .px-err { color: #f85149; } .px-dim { color: #7d8590; }
.px-bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; }
.px-bar i { display: block; height: 100%; background: linear-gradient(90deg, #bb5c14, #f2a33c); }
.px-toast { position: fixed; right: 18px; bottom: 18px; background: #1f2630; border: 1px solid #30363d;
  color: #d7dde6; padding: 9px 14px; border-radius: 8px; font-size: 12px; max-width: 420px; z-index: 99;
  box-shadow: 0 6px 24px #00000066; }
.px-toast.err { border-color: #b62324; color: #ffb0ab; }
.px-mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.px-detail { background: #0d1117; border: 1px solid #242c3a; border-radius: 8px; padding: 12px; margin-top: 10px; }
.px-kv { display: grid; grid-template-columns: 92px 1fr; gap: 4px 10px; font-size: 12px; }
.px-kv .k { color: #7d8590; }
.px-chip { cursor: pointer; padding: 2px 9px; border-radius: 10px; border: 1px solid #30363d; font-size: 11px; color: #7d8590; user-select: none; }
.px-chip.on { border-color: #f2a33c; color: #f2a33c; }
.px-warnbox { background: #da363314; border: 1px solid #da363355; border-radius: 8px; padding: 9px 12px; font-size: 12px; color: #ffb0ab; margin-bottom: 10px; }
.px-infobox { background: #1f6feb14; border: 1px solid #1f6feb44; border-radius: 8px; padding: 9px 12px; font-size: 12px; color: #a5c8ff; margin-bottom: 10px; }
@media (max-width: 620px) {
  .px-kv { grid-template-columns: 78px 1fr; }
  .px-root { padding: 10px 10px 32px; }
}
`

type Tab = 'inbox' | 'ledger' | 'insight' | 'settings'

export default function PiaoxiaPanel(props: { pluginId?: string, onSendToChat?: (message: string) => void | Promise<void> }) {
  const [data, setData] = useState<PiaoData>({ invoices: new Map(), titles: new Map(), meta: null })
  const [tab, setTab] = useState<Tab>('inbox')
  const [toastMsg, setToastMsg] = useState<{ text: string, err?: boolean, at: number } | null>(null)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async (cache = true) => {
    try {
      const d = await loadPiaoxia(cache)
      setData(d)
      setLoaded(true)
    } catch (e) {
      setToastMsg({ text: String((e as Error).message), err: true, at: Date.now() })
    }
  }, [])

  useEffect(() => {
    void reload(false)
    let timer = 0
    const tick = () => {
      if (document.visibilityState !== 'hidden') void reload(true)
    }
    timer = window.setInterval(tick, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') void reload(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [reload])

  const toast = useCallback((text: string, err = false) => {
    setToastMsg({ text, err, at: Date.now() })
  }, [])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), Math.min(8000, 2500 + toastMsg.text.length * 40))
    return () => clearTimeout(t)
  }, [toastMsg])

  const view = useMemo(
    () => core.buildView(Array.from(data.invoices.values()), Array.from(data.titles.values()), Date.now()),
    [data],
  )

  const ctx: PanelCtx = useMemo(() => ({
    data, view, reload: () => reload(true), toast, sendToChat: props.onSendToChat,
  }), [data, view, reload, toast, props.onSendToChat])

  const metaAgeOk = data.meta && data.meta.lastTickAt && (Date.now() - new Date(data.meta.lastTickAt).getTime() < 30 * 60 * 1000)

  return (
    <div className="px-root">
      <style>{CSS}</style>
      <div className="px-head">
        <span className="px-logo">票<span className="px-accent">匣</span></span>
        <span className="px-sub">个人电子发票保险库</span>
        <span style={{ marginLeft: 'auto' }} className="px-sub">
          <span className={'px-dot ' + (metaAgeOk ? 'ok' : loaded ? 'warn' : 'off')} />
          {metaAgeOk ? `票匣就绪 · ${data.invoices.size} 张票` : loaded ? '等待解析服务（面板收票功能暂不可用，AI 收票不受影响）' : '连接中…'}
        </span>
      </div>
      <div className="px-tabs">
        <div className={'px-tab' + (tab === 'inbox' ? ' on' : '')} onClick={() => setTab('inbox')}>收票台</div>
        <div className={'px-tab' + (tab === 'ledger' ? ' on' : '')} onClick={() => setTab('ledger')}>
          票册{view && view.pending.count ? <span className="px-badge">{view.pending.count}待报</span> : null}
        </div>
        <div className={'px-tab' + (tab === 'insight' ? ' on' : '')} onClick={() => setTab('insight')}>透视</div>
        <div className={'px-tab' + (tab === 'settings' ? ' on' : '')} onClick={() => setTab('settings')}>抬头与设置</div>
      </div>

      {tab === 'inbox' && <InboxTab ctx={ctx} />}
      {tab === 'ledger' && <LedgerTab ctx={ctx} />}
      {tab === 'insight' && <InsightTab ctx={ctx} />}
      {tab === 'settings' && <SettingsTab ctx={ctx} />}

      {toastMsg && <div className={'px-toast' + (toastMsg.err ? ' err' : '')}>{toastMsg.text}</div>}
    </div>
  )
}
