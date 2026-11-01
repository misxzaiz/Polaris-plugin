/**
 * 面板外壳：头部 + 三 Tab（工作台 / 历史 / 设置）
 * 数据面：cap.kv imgforge.*；字节面：127.0.0.1 直连自家服务（见 model.ts）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { HistoryEntry, ImgforgeMeta } from './model'
import { getMeta, loadHistory, loadSettings } from './model'
import type { core as CoreNS } from './model'
import WorkTab from './WorkTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.if-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.if-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.if-body{flex:1;overflow-y:auto;padding:0 0 24px}
.if-body::-webkit-scrollbar{width:9px;height:9px}
.if-body::-webkit-scrollbar-track{background:transparent}
.if-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.if-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.if-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E8A33D,#B3621B);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.if-tt{flex:1;min-width:0}
.if-tt b{font-size:15px;display:block}
.if-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.if-tabs{display:flex;gap:4px}
.if-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.if-tab:hover{color:#E6EAF2}
.if-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.if-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.if-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E8A33D,#B3621B);flex-shrink:0}
.if-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.if-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.if-card-b{padding:11px 13px}
.if-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.if-btn{background:#D98324;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.if-btn:hover{filter:brightness(1.12)}
.if-btn:disabled{opacity:.45;cursor:not-allowed}
.if-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.if-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.if-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.if-inp:focus{outline:none;border-color:#D98324}
.if-inp::placeholder{color:#4d5566}
.if-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.if-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.if-chip:hover{border-color:#3a4356}
.if-chip.on{background:#3a2a14;border-color:#D98324;color:#F2C186;font-weight:600}
.if-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.if-check{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#B4B4B8;cursor:pointer}
.if-check input{accent-color:#D98324}
.if-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.if-item-head{display:flex;align-items:center;gap:8px}
.if-item-head b{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.if-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.if-badge.bad{color:#FF8A9A;border-color:#54262c}
.if-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.if-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.if-row{display:flex;gap:8px;align-items:center}
.if-row .grow{flex:1;min-width:0}
.if-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.if-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.if-okline{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.if-gps{color:#F2B263}
.if-list{margin:0 16px 8px;border:1px solid #242C3A;border-radius:12px;background:#12151c;max-height:300px;overflow-y:auto}
.if-list::-webkit-scrollbar{width:8px}
.if-list::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:4px}
.if-file{display:flex;align-items:center;gap:8px;padding:6px 11px;border-bottom:1px solid #1a2029;font-size:11.5px;cursor:pointer}
.if-file:last-child{border-bottom:none}
.if-file:hover{background:#161B22}
.if-file input{accent-color:#D98324;flex-shrink:0}
.if-file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#E6EAF2}
.if-file-meta{flex-shrink:0;color:#5C6678;font-size:10.5px}
.if-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.if-prog-track{height:8px;border-radius:5px;background:#12151c;border:1px solid #2a2f3a;overflow:hidden}
.if-prog-fill{height:100%;background:linear-gradient(90deg,#E8A33D,#D98324);transition:width .3s}
.if-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.if-toast.bad{border-color:#54262c;color:#FF8A9A}
.if-toast.good{border-color:#2b4a35;color:#7EE2A0}
.if-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
`

type Tab = 'work' | 'history' | 'settings'

export interface PanelCtx {
  showToast: (msg: string, kind?: 'good' | 'bad') => void
  meta: ImgforgeMeta | null
  reloadMeta: () => Promise<void>
  settings: CoreNS.ImgforgeSettings
  reloadSettings: () => Promise<void>
  history: HistoryEntry[]
  reloadHistory: () => Promise<void>
}

export default function ImgforgePanel(_props: { pluginId?: string, onSendToChat?: (message: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('work')
  const [toast, setToast] = useState<{ msg: string, kind: 'good' | 'bad' } | null>(null)
  const [meta, setMeta] = useState<ImgforgeMeta | null>(null)
  const [settings, setSettings] = useState<CoreNS.ImgforgeSettings>(() => ({ outDir: '', concurrency: 3, maxBatch: 300, maxFileMB: 100, historyCap: 100 }))
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const showToast = useCallback((msg: string, kind: 'good' | 'bad' = 'good') => {
    setToast({ msg, kind })
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const reloadMeta = useCallback(async () => {
    try { setMeta(await getMeta()) } catch (_) { setMeta(null) }
  }, [])

  const reloadSettings = useCallback(async () => {
    try { setSettings(await loadSettings()) } catch (_) { /* 保留现值 */ }
  }, [])

  const reloadHistory = useCallback(async () => {
    try { setHistory(await loadHistory()) } catch (_) { /* 保留现值 */ }
  }, [])

  useEffect(() => {
    reloadMeta()
    reloadSettings()
    reloadHistory()
  }, [reloadMeta, reloadSettings, reloadHistory])

  const ctx: PanelCtx = { showToast, meta, reloadMeta, settings, reloadSettings, history, reloadHistory }

  return (
    <div className="if-root">
      <style>{css}</style>
      <div className="if-top">
        <div className="if-logo">🖼️</div>
        <div className="if-tt">
          <b>图片工坊 · 本地批量图片变换</b>
          <small>
            {meta
              ? `服务在线 :${meta.port} · 压缩/转格式/剥 EXIF，文件全程不出本机`
              : '服务未在线 —— 需在 设置 → 插件服务 启动后使用工作台'}
          </small>
        </div>
        <div className="if-tabs">
          {([['work', '工作台'], ['history', '历史'], ['settings', '设置']] as const).map(([k, label]) => (
            <button key={k} className={'if-tab' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); if (k === 'history') reloadHistory() }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="if-body">
        {tab === 'work' && <WorkTab ctx={ctx} onSendToChat={_props.onSendToChat} />}
        {tab === 'history' && <HistoryTab ctx={ctx} />}
        {tab === 'settings' && <SettingsTab ctx={ctx} />}
      </div>

      {toast && <div className={'if-toast' + (toast.kind === 'bad' ? ' bad' : toast.kind === 'good' ? ' good' : '')}>{toast.msg}</div>}
    </div>
  )
}
