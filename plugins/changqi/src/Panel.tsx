/**
 * 订阅台账面板外壳：头部（月均速览）+ 三 Tab（总览 / 统计 / 设置）
 * 数据面：cap.kv changqi.*（经宿主 invoke → router_dispatch），跨端同一份台账。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, fmtMoney, type PanelData } from './model'
import OverviewTab from './OverviewTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const css = `
.cq-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cq-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cq-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cq-body::-webkit-scrollbar{width:9px;height:9px}
.cq-body::-webkit-scrollbar-track{background:transparent}
.cq-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cq-page{max-width:560px;margin:0 auto}
.cq-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cq-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3D7EE8,#2B5FC7);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.cq-tt{flex:1;min-width:0}
.cq-tt b{font-size:15px;display:block}
.cq-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px;font-variant-numeric:tabular-nums}
.cq-tabs{display:flex;gap:4px}
.cq-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.cq-tab:hover{color:#E6EAF2}
.cq-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cq-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.cq-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3D7EE8,#2B5FC7);flex-shrink:0}
.cq-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.cq-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.cq-card-b{padding:11px 13px}
.cq-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.cq-btn{background:#2B5FC7;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.cq-btn:hover{filter:brightness(1.1)}
.cq-btn:disabled{opacity:.45;cursor:not-allowed}
.cq-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.cq-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.cq-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.cq-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.cq-inp:focus{outline:none;border-color:#2B5FC7}
.cq-inp::placeholder{color:#4d5566}
.cq-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.cq-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.cq-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.cq-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.cq-toast.bad{border-color:#54262c;color:#FF8A9A}
.cq-toast.good{border-color:#2b4a35;color:#7EE2A0}
.cq-kpis{display:flex;gap:8px;margin:0 16px 10px}
.cq-kpi{flex:1;background:#161B22;border:1px solid #242C3A;border-radius:11px;padding:9px 11px;min-width:0}
.cq-kpi small{display:block;color:#8B95A7;font-size:10px;margin-bottom:2px}
.cq-kpi b{font-size:15px;font-variant-numeric:tabular-nums;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-kpi em{font-style:normal;font-size:9.5px;color:#5C6678;display:block;margin-top:1px}
.cq-alert{display:flex;align-items:center;gap:8px;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:12px;border:1px solid}
.cq-alert b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-alert small{color:#8B95A7;flex-shrink:0}
.cq-alert.today{background:rgba(248,81,73,.08);border-color:#54262c}
.cq-alert.today b{color:#FF8A9A}
.cq-alert.trial{background:rgba(163,113,247,.08);border-color:#4c3a6e}
.cq-alert.trial b{color:#C9A8FF}
.cq-alert.soon{background:rgba(232,145,45,.08);border-color:#5a3d1a}
.cq-alert.soon b{color:#F2B263}
.cq-alert.week{background:rgba(210,153,34,.06);border-color:#4a3d1e}
.cq-alert.week b{color:#D9B96A}
.cq-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.cq-chip:hover{border-color:#3a4356}
.cq-chip.on{background:#16283e;border-color:#2B5FC7;color:#8FB8F2;font-weight:600}
.cq-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.cq-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.cq-item.urgent{border-color:#54262c}
.cq-item-head{display:flex;align-items:center;gap:8px}
.cq-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.cq-badge.trialb{color:#C9A8FF;border-color:#4c3a6e;background:rgba(163,113,247,.08)}
.cq-badge.doneb{color:#F85149;border-color:#54262c;background:#3a1d22}
.cq-item-mid{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.cq-next{font-size:11.5px;color:#8B95A7;flex:1;min-width:0}
.cq-next.hot{color:#FF8A9A;font-weight:600}
.cq-amt{text-align:right;flex-shrink:0}
.cq-amt b{font-size:13.5px;font-variant-numeric:tabular-nums}
.cq-amt small{display:block;color:#5C6678;font-size:9.5px;font-variant-numeric:tabular-nums}
.cq-item-foot{display:flex;gap:6px;margin-top:8px;align-items:center}
.cq-item-foot .note{flex:1;min-width:0;color:#5C6678;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-form-actions{display:flex;gap:8px;margin-top:12px}
.cq-guide{margin-top:8px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;padding:8px 10px;font-size:10.5px;color:#A8B3C7;line-height:1.7}
.cq-bars{display:flex;flex-direction:column;gap:7px;padding:4px 2px}
.cq-bar-row{display:flex;align-items:center;gap:8px}
.cq-bar-row .nm{width:74px;font-size:11px;color:#A8B3C7;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-bar-row .tr{flex:1;height:14px;background:#12151c;border-radius:4px;overflow:hidden}
.cq-bar-row .tr i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3D7EE8,#2B5FC7)}
.cq-bar-row .tr i.mut{background:linear-gradient(90deg,#5A6478,#414A5C)}
.cq-bar-row .vl{width:86px;font-size:10.5px;color:#8B95A7;font-variant-numeric:tabular-nums;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.cq-field:first-child{border-top:none}
.cq-field-l{flex:1;min-width:0}
.cq-field-l b{font-size:12.5px;display:block}
.cq-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.cq-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.cq-guideblock{padding:9px 13px;border-top:1px solid #1d2330;font-size:10.5px;color:#A8B3C7;line-height:1.7}
.cq-guideblock b{color:#E6EAF2;font-size:11.5px;display:block;margin-bottom:2px}
.cq-confirm-inline{display:flex;gap:6px;align-items:center}
`

type Tab = 'overview' | 'stats' | 'settings'

export type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function ChangqiPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
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
    if (!data) return { cls: '', text: '载入中…' }
    const ov = data.overview
    return {
      cls: ov.todayCharge.count > 0 ? 'cq-hot' : '',
      text: `月均 ${fmtMoney(ov.monthlyTotal, data.settings.currencySymbol)} · 进行中 ${ov.activeCount} 笔`,
    }
  })()

  return (
    <div className="cq-root">
      <style>{css}</style>
      <div className="cq-top">
        <div className="cq-logo">🗓️</div>
        <div className="cq-tt">
          <b>订阅台账</b>
          <small>{headInfo.text}</small>
        </div>
        <div className="cq-tabs">
          {([
            ['overview', '总览'],
            ['stats', '统计'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`cq-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="cq-body">
        <div className="cq-page">
          {loadErr && <div className="cq-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'overview' && <OverviewTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'stats' && <StatsTab data={data} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`cq-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
