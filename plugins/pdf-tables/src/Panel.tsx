/**
 * 面板外壳：头部 + 三 Tab（工作台 / 历史 / 设置）
 * 数据面：cap.kv pdf-tables.*；字节面：127.0.0.1 直连自家服务（见 model.ts）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { HistoryEntry, PdfTablesMeta, PdfTablesSettings } from './model'
import { getMeta, loadHistory, loadSettings } from './model'
import WorkTab from './WorkTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.pdt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pdt-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pdt-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pdt-body::-webkit-scrollbar{width:9px;height:9px}
.pdt-body::-webkit-scrollbar-track{background:transparent}
.pdt-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pdt-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.pdt-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2E9E6B,#1C6B48);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.pdt-tt{flex:1;min-width:0}
.pdt-tt b{font-size:15px;display:block}
.pdt-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.pdt-tabs{display:flex;gap:4px}
.pdt-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.pdt-tab:hover{color:#E6EAF2}
.pdt-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pdt-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pdt-card-b{padding:11px 13px}
.pdt-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.pdt-btn{background:#2E9E6B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.pdt-btn:hover{filter:brightness(1.12)}
.pdt-btn:disabled{opacity:.45;cursor:not-allowed}
.pdt-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pdt-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.pdt-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pdt-inp:focus{outline:none;border-color:#2E9E6B}
.pdt-inp::placeholder{color:#4d5566}
.pdt-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.pdt-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.pdt-chip:hover{border-color:#3a4356}
.pdt-chip.on{background:#15342a;border-color:#2E9E6B;color:#9FE8C0;font-weight:600}
.pdt-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.pdt-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.pdt-item-head{display:flex;align-items:center;gap:8px}
.pdt-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdt-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.pdt-badge.bad{color:#FF8A9A;border-color:#54262c}
.pdt-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.pdt-row{display:flex;gap:8px;align-items:center}
.pdt-row .grow{flex:1;min-width:0}
.pdt-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.pdt-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.pdt-alert.warn{background:rgba(232,145,45,.07);border-color:#5a3d1a;color:#F2B263}
.pdt-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.pdt-drop{margin:0 16px 10px;border:1.5px dashed #333c4e;border-radius:13px;padding:22px 14px;text-align:center;color:#8B95A7;font-size:12px;cursor:pointer;line-height:1.8;background:#131820}
.pdt-drop:hover,.pdt-drop.over{border-color:#2E9E6B;color:#9FE8C0;background:#12241d}
.pdt-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pdt-toast.bad{border-color:#54262c;color:#FF8A9A}
.pdt-toast.good{border-color:#2b4a35;color:#7EE2A0}
.pdt-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.pdt-pre{background:#12151c;border:1px solid #2a2f3a;border-radius:10px;padding:10px;font:11.5px/1.6 ui-monospace,Consolas,monospace;color:#C8D0E0;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin-top:8px}
.pdt-gridwrap{overflow-x:auto;margin-top:8px;border:1px solid #242C3A;border-radius:8px}
.pdt-grid{border-collapse:collapse;font:10.5px/1.5 ui-monospace,Consolas,monospace;min-width:100%}
.pdt-grid td,.pdt-grid th{border:1px solid #242C3A;padding:3px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.pdt-grid th{background:#1C2330;color:#C9B8FF;font-weight:600;position:sticky;top:0}
.pdt-num{color:#9FE8C0}
`

type Tab = 'work' | 'history' | 'settings'

export interface PanelCtx {
  showToast: (msg: string, kind?: 'good' | 'bad') => void
  meta: PdfTablesMeta | null
  reloadMeta: () => Promise<void>
  settings: PdfTablesSettings
  reloadSettings: () => Promise<void>
  history: HistoryEntry[]
  reloadHistory: () => Promise<void>
}

export default function PdfTablesPanel(_props: { pluginId?: string, onSendToChat?: (message: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('work')
  const [toast, setToast] = useState<{ msg: string, kind: 'good' | 'bad' } | null>(null)
  const [meta, setMeta] = useState<PdfTablesMeta | null>(null)
  const [settings, setSettings] = useState<PdfTablesSettings>(() => coreDefaults())
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
    <div className="pdt-root">
      <style>{css}</style>
      <div className="pdt-top">
        <div className="pdt-logo">▦</div>
        <div className="pdt-tt">
          <b>表格提取台 · PDF 表格 → Excel/CSV</b>
          <small>
            {meta
              ? `服务在线 :${meta.port} · 文件全程不出本机`
              : '服务未在线 —— 需在 设置 → 插件服务 启动后使用工作台'}
          </small>
        </div>
        <div className="pdt-tabs">
          {([['work', '工作台'], ['history', '历史'], ['settings', '设置']] as const).map(([k, label]) => (
            <button key={k} className={'pdt-tab' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); if (k === 'history') reloadHistory() }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'work' && <WorkTab ctx={ctx} />}
      {tab === 'history' && <HistoryTab ctx={ctx} />}
      {tab === 'settings' && <SettingsTab ctx={ctx} />}

      {toast && <div className={'pdt-toast' + (toast.kind === 'bad' ? ' bad' : toast.kind === 'good' ? ' good' : '')}>{toast.msg}</div>}
    </div>
  )
}

function coreDefaults(): PdfTablesSettings {
  // 与 shared/core.normalizeSettings 默认值保持一致（加载失败时的兜底）
  return { outDir: '', maxUploadMB: 128, historyCap: 200, format: 'xlsx', mergePages: true }
}
