/**
 * 观止面板外壳：头部（今年速览）+ 四 Tab（总览 / 藏卷 / 年报 / 设置）
 * 数据面：cap.kv guanzhi.*（经宿主 invoke → router_dispatch），跨端同一份账本。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, type PanelData } from './model'
import OverviewTab from './OverviewTab'
import LibraryTab from './LibraryTab'
import YearReportTab from './YearReportTab'
import SettingsTab from './SettingsTab'

const css = `
.gz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.gz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.gz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.gz-body::-webkit-scrollbar{width:9px;height:9px}
.gz-body::-webkit-scrollbar-track{background:transparent}
.gz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.gz-page{max-width:560px;margin:0 auto}
.gz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#14100C 75%,rgba(20,16,12,0))}
.gz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E8944A,#C7572B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.gz-tt{flex:1;min-width:0}
.gz-tt b{font-size:15px;display:block}
.gz-tt small{color:#A8988A;font-size:10.5px;display:block;margin-top:1px;font-variant-numeric:tabular-nums}
.gz-tabs{display:flex;gap:4px}
.gz-tab{background:transparent;border:none;color:#A08F80;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.gz-tab:hover{color:#F2E8DC}
.gz-tab.on{background:#2A2119;color:#F2E8DC;font-weight:600}
.gz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.gz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E8944A,#C7572B);flex-shrink:0}
.gz-hint{margin-left:auto;font-size:10.5px;color:#6E6156;font-weight:400}
.gz-card{background:#1A1511;border:1px solid #33291F;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.gz-card-b{padding:11px 13px}
.gz-sub{font-size:10.5px;color:#A8988A;line-height:1.6}
.gz-btn{background:#C7572B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.gz-btn:hover{filter:brightness(1.12)}
.gz-btn:disabled{opacity:.45;cursor:not-allowed}
.gz-btn.ghost{background:#26201A;color:#F2E8DC;border:1px solid #33291F}
.gz-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.gz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.gz-inp{background:#14100C;border:1px solid #33291F;border-radius:8px;color:#F2E8DC;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.gz-inp:focus{outline:none;border-color:#C7572B}
.gz-inp::placeholder{color:#5C5248}
.gz-ta{resize:vertical;min-height:84px;font-family:inherit}
.gz-lbl{font-size:11px;color:#A8988A;margin:8px 0 4px;display:block}
.gz-sel{background:#14100C;border:1px solid #33291F;border-radius:8px;color:#F2E8DC;padding:7px 8px;font-size:12px}
.gz-empty{color:#A8988A;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9;white-space:pre-line}
.gz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(26,21,17,.97);border:1px solid #33291F;color:#F2E8DC;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.gz-toast.bad{border-color:#54262c;color:#FF8A9A}
.gz-toast.good{border-color:#2b4a35;color:#7EE2A0}
.gz-kpis{display:flex;gap:8px;margin:0 16px 10px}
.gz-kpi{flex:1;background:#1A1511;border:1px solid #33291F;border-radius:11px;padding:9px 11px;min-width:0}
.gz-kpi small{display:block;color:#A8988A;font-size:10px;margin-bottom:2px}
.gz-kpi b{font-size:15px;font-variant-numeric:tabular-nums;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-kpi em{font-style:normal;font-size:9.5px;color:#6E6156;display:block;margin-top:1px}
.gz-chip{background:#2A2119;border:1px solid #33291F;border-radius:999px;color:#C4B4A4;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.gz-chip:hover{border-color:#4A3A2C}
.gz-chip.on{background:#33230f;border-color:#C7572B;color:#F2B583;font-weight:600}
.gz-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.gz-item{background:#1A1511;border:1px solid #33291F;border-radius:12px;margin:0 16px 8px;padding:10px 12px;display:flex;gap:10px}
.gz-cover{width:40px;height:54px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
.gz-item-main{flex:1;min-width:0}
.gz-item-head{display:flex;align-items:center;gap:7px}
.gz-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-badge{flex-shrink:0;font-size:9.5px;color:#A8988A;background:#26201A;border:1px solid #33291F;border-radius:6px;padding:1px 6px;white-space:nowrap}
.gz-badge.wish{color:#9FB6D9;border-color:#2e3d54;background:rgba(90,130,190,.08)}
.gz-badge.active{color:#F2B263;border-color:#5a3d1a;background:rgba(232,145,45,.08)}
.gz-badge.done{color:#7EE2A0;border-color:#2b4a35;background:rgba(80,200,120,.07)}
.gz-badge.drop{color:#8B8178;border-color:#3a332c;background:rgba(120,110,100,.08)}
.gz-badge.fav{color:#F2D063;border-color:#5a4a1a;background:rgba(232,200,60,.07)}
.gz-rate{flex-shrink:0;font-size:11.5px;color:#F2B263;font-weight:700;font-variant-numeric:tabular-nums}
.gz-item-mid{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.gz-meta{font-size:10.5px;color:#8A7A6A;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-item-foot{display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap}
.gz-item-foot .note{flex:1 1 100%;min-width:0;color:#8A7A6A;font-size:10.5px;line-height:1.5;white-space:normal}
.gz-form-actions{display:flex;gap:8px;margin-top:12px}
.gz-bars{display:flex;flex-direction:column;gap:7px;padding:4px 2px}
.gz-bar-row{display:flex;align-items:center;gap:8px}
.gz-bar-row .nm{width:64px;font-size:11px;color:#C4B4A4;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-bar-row .tr{flex:1;height:14px;background:#14100C;border-radius:4px;overflow:hidden}
.gz-bar-row .tr i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#E8944A,#C7572B)}
.gz-bar-row .vl{width:96px;font-size:10.5px;color:#A8988A;font-variant-numeric:tabular-nums;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gz-months{display:flex;align-items:flex-end;gap:5px;height:92px;padding:6px 4px 0}
.gz-month{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end}
.gz-month i{display:block;width:100%;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#E8944A,#C7572B);min-height:2px}
.gz-month small{font-size:9px;color:#6E6156}
.gz-month .mc{font-size:9.5px;color:#F2B263;font-variant-numeric:tabular-nums}
.gz-quote{margin-top:8px;background:#14100C;border:1px solid #33291F;border-radius:8px;padding:9px 11px;font-size:11.5px;color:#D8C8B4;line-height:1.7}
.gz-quote b{color:#F2E8DC;font-size:11.5px;display:block;margin-bottom:3px}
.gz-rank{width:20px;flex-shrink:0;text-align:center;font-size:11px;color:#F2B263;font-weight:700;font-variant-numeric:tabular-nums;padding-top:1px}
.gz-confirm-inline{display:flex;gap:6px;align-items:center}
`

type Tab = 'overview' | 'library' | 'report' | 'settings'

export type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function GuanzhiPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback<Toast>((msg, kind) => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<PanelData | null> => {
    try {
      const d = await loadPanelData()
      setData(d)
      setLoadErr('')
      return d
    } catch (e) {
      setLoadErr((e as Error).message)
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState === 'hidden' || !alive) return
      await reload()
    }
    poll()
    const timer = setInterval(poll, 10000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const headInfo = (() => {
    if (!data) return { text: '载入中…' }
    const ov = data.overview
    return {
      text: `今年完成 ${ov.thisYearDone} · 账本 ${ov.total} 条 · 想看 ${ov.wishCount}`,
    }
  })()

  return (
    <div className="gz-root">
      <style>{css}</style>
      <div className="gz-top">
        <div className="gz-logo">🎞️</div>
        <div className="gz-tt">
          <b>观止</b>
          <small>{headInfo.text}</small>
        </div>
        <div className="gz-tabs">
          {([
            ['overview', '总览'],
            ['library', '藏卷'],
            ['report', '年报'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`gz-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="gz-body">
        <div className="gz-page">
          {loadErr && <div className="gz-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'overview' && <OverviewTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'library' && <LibraryTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'report' && <YearReportTab data={data} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`gz-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
