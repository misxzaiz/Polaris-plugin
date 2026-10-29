/**
 * 面板外壳：头部 + 三 Tab（创作 / 作品 / 设置）
 * 数据面：cap.kv gezhi.*（经宿主 invoke → router_dispatch）；构建走 shared 引擎本地完成。
 */
import { useCallback, useEffect, useState } from 'react'
import type { WorkEntry } from './model'
import { loadSettings, loadWorks, type core as CoreNS } from './model'
import CreateTab from './CreateTab'
import WorksTab from './WorksTab'
import SettingsTab from './SettingsTab'

const css = `
.gz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.gz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.gz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.gz-body::-webkit-scrollbar{width:9px;height:9px}
.gz-body::-webkit-scrollbar-track{background:transparent}
.gz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.gz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.gz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0E9F6E,#0B7A55);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.gz-tt{flex:1;min-width:0}
.gz-tt b{font-size:15px;display:block}
.gz-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.gz-tabs{display:flex;gap:4px}
.gz-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.gz-tab:hover{color:#E6EAF2}
.gz-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.gz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.gz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#0E9F6E,#0B7A55);flex-shrink:0}
.gz-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.gz-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.gz-card-b{padding:11px 13px}
.gz-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.gz-btn{background:#0E9F6E;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.gz-btn:hover{filter:brightness(1.1)}
.gz-btn:disabled{opacity:.45;cursor:not-allowed}
.gz-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.gz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.gz-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.gz-inp:focus{outline:none;border-color:#0E9F6E}
.gz-inp::placeholder{color:#4d5566}
.gz-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.gz-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.gz-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.gz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.gz-toast.bad{border-color:#54262c;color:#FF8A9A}
.gz-toast.good{border-color:#2b4a35;color:#7EE2A0}
.gz-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.gz-chip:hover{border-color:#3a4356}
.gz-chip.on{background:#12332a;border-color:#0E9F6E;color:#7EE2A0;font-weight:600}
.gz-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.gz-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.gz-item-head{display:flex;align-items:center;gap:8px}
.gz-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.gz-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.gz-row{display:flex;gap:8px;align-items:center}
.gz-row .grow{flex:1;min-width:0}
.gz-ta{background:#12151c;border:1px solid #2a2f3a;border-radius:10px;color:#E6EAF2;padding:10px;font:12px/1.6 ui-monospace,Consolas,monospace;width:100%;min-height:150px;resize:vertical}
.gz-ta:focus{outline:none;border-color:#0E9F6E}
.gz-ta::placeholder{color:#4d5566}
.gz-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.gz-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.gz-alert.warn{background:rgba(232,145,45,.07);border-color:#5a3d1a;color:#F2B263}
.gz-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7}
`

type Tab = 'create' | 'works' | 'settings'

export interface PanelCtx {
  showToast: (msg: string, kind?: 'good' | 'bad') => void
  settings: CoreNS.Settings
  reloadSettings: () => Promise<void>
  works: WorkEntry[]
  reloadWorks: () => Promise<void>
}

export default function GezhiPanel(_props: { pluginId?: string, onSendToChat?: (message: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('create')
  const [toast, setToast] = useState<{ msg: string, kind: 'good' | 'bad' } | null>(null)
  const [settings, setSettings] = useState<CoreNS.Settings>({ ...{ schemaVersion: 1, exportDir: '', theme: 'slate' } as CoreNS.Settings })
  const [works, setWorks] = useState<WorkEntry[]>([])

  const showToast = useCallback((msg: string, kind: 'good' | 'bad' = 'good') => {
    setToast({ msg, kind })
    window.setTimeout(() => setToast((cur) => (cur && cur.msg === msg ? null : cur)), 3200)
  }, [])

  const reloadSettings = useCallback(async () => {
    try { setSettings(await loadSettings()) } catch { /* 宿主不可达时保持缺省 */ }
  }, [])

  const reloadWorks = useCallback(async () => {
    try { setWorks(await loadWorks()) } catch (e) { showToast(`作品列表加载失败：${(e as Error).message}`, 'bad') }
  }, [])

  useEffect(() => {
    reloadSettings()
    reloadWorks()
  }, [reloadSettings, reloadWorks])

  const ctx: PanelCtx = { showToast, settings, reloadSettings, works, reloadWorks }

  return (
    <div className="gz-root">
      <style>{css}</style>
      <div className="gz-top">
        <div className="gz-logo">▦</div>
        <div className="gz-tt">
          <b>Excel 工坊 · Excel 工厂</b>
          <small>粘贴数据或让 AI 做，交付真实可编辑 .xlsx</small>
        </div>
        <div className="gz-tabs">
          {([['create', '创作'], ['works', `作品${works.length ? ` ${works.length}` : ''}`], ['settings', '设置']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`gz-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="gz-body">
        {tab === 'create' && <CreateTab ctx={ctx} />}
        {tab === 'works' && <WorksTab ctx={ctx} />}
        {tab === 'settings' && <SettingsTab ctx={ctx} />}
      </div>
      {toast && <div className={`gz-toast ${toast.kind === 'bad' ? 'bad' : 'good'}`}>{toast.msg}</div>}
    </div>
  )
}
