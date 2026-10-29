/**
 * PPT 工坊面板外壳：头部（当前主题/大纲状态速览）+ 三 Tab（创作 / 作品 / 设置）
 * 创作流：大纲 DSL → core 归一化 + layout 几何 → HTML 预览（同一几何，≈成品）
 *         → 本地构建（同一渲染器，浏览器 blob 下载）或对话里让 AI 走 ppt_build 落盘。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSettings, loadWorks, type QimuSettings, type DeckRecord } from './model'
import CreateTab from './CreateTab'
import WorksTab from './WorksTab'
import SettingsTab from './SettingsTab'

const css = `
.qm-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qm-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qm-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qm-body::-webkit-scrollbar{width:9px;height:9px}
.qm-body::-webkit-scrollbar-track{background:transparent}
.qm-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qm-page{max-width:760px;margin:0 auto}
.qm-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qm-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8A5A2B,#D4A24E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qm-tt{flex:1;min-width:0}
.qm-tt b{font-size:15px;display:block}
.qm-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qm-tabs{display:flex;gap:4px}
.qm-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.qm-tab:hover{color:#E6EAF2}
.qm-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qm-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qm-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#D4A24E,#8A5A2B);flex-shrink:0}
.qm-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qm-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.qm-card-b{padding:11px 13px}
.qm-sub{font-size:10.5px;color:#8B95A7;line-height:1.7}
.qm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.qm-btn{background:#b0731f;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.qm-btn:hover{filter:brightness(1.12)}
.qm-btn:disabled{opacity:.45;cursor:not-allowed}
.qm-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qm-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qm-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qm-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.qm-inp:focus{outline:none;border-color:#b0731f}
.qm-inp::placeholder{color:#4d5566}
.qm-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.qm-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.qm-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qm-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qm-toast.bad{border-color:#54262c;color:#FF8A9A}
.qm-toast.good{border-color:#2b4a35;color:#7EE2A0}
.qm-err{background:#2A1418;border:1px solid #54262C;color:#FFB3BC;border-radius:9px;padding:8px 11px;font-size:11px;line-height:1.7;margin:8px 0 0;white-space:pre-wrap}
.qm-textarea{background:#12151c;border:1px solid #2a2f3a;border-radius:9px;color:#E6EAF2;padding:9px 11px;font-size:12px;font-family:Consolas,'Courier New',monospace;line-height:1.7;width:100%;min-height:220px;resize:vertical}
.qm-textarea:focus{outline:none;border-color:#b0731f}
.qm-theme-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:9px;padding:6px 10px;cursor:pointer;font-size:11px;color:#B4B4B8;display:flex;align-items:center;gap:6px}
.qm-theme-chip.on{border-color:#b0731f;background:#2a2114;color:#F2C063;font-weight:600}
.qm-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
/* 幻灯片预览画布 */
.qm-slide{position:relative;border-radius:10px;overflow:hidden;border:1px solid #242C3A;flex-shrink:0}
.qm-slide *{position:absolute;overflow:hidden;white-space:pre-wrap;word-break:break-word}
.qm-slide .fitline{white-space:nowrap}
.qm-work{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1d2330}
.qm-work:first-child{border-top:none}
.qm-work-main{flex:1;min-width:0}
.qm-work-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qm-work-main small{color:#5C6678;font-size:10px;display:block;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qm-path{font-family:Consolas,monospace;font-size:10px;color:#7BA7E0;cursor:pointer}
.qm-path:hover{text-decoration:underline}
.qm-pages{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 8px}
.qm-pages::-webkit-scrollbar{height:8px}
.qm-pages::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:4px}
`

export type Tab = 'create' | 'works' | 'settings'

export type Toast = (msg: string, kind?: 'bad' | 'good') => void

export interface TabProps {
  settings: QimuSettings | null
  reload: () => Promise<void>
  showToast: Toast
}

export default function QimuPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('create')
  const [settings, setSettings] = useState<QimuSettings | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback<Toast>((msg, kind) => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async () => {
    try {
      setSettings(await loadSettings())
      setLoadErr('')
    } catch (e) {
      setLoadErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="qm-root">
      <style>{css}</style>
      <div className="qm-top">
        <div className="qm-logo">🎬</div>
        <div className="qm-tt">
          <b>PPT 工坊</b>
          <small>AI PPT 工厂 · 大纲进，可编辑 PPTX 出</small>
        </div>
        <div className="qm-tabs">
          {([
            ['create', '创作'],
            ['works', '作品'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`qm-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="qm-body">
        <div className="qm-page">
          {loadErr && <div className="qm-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'create' && <CreateTab settings={settings} reload={reload} showToast={showToast} goTab={setTab} />}
          {tab === 'works' && <WorksTab settings={settings} reload={reload} showToast={showToast} />}
          {tab === 'settings' && <SettingsTab settings={settings} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`qm-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}

export type { DeckRecord }
