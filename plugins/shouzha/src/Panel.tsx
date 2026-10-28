/**
 * 守闸面板外壳：头部（月均成本速览）+ 四 Tab（总览 / 订阅 / 透视 / 设置）
 * 数据面：cap.kv shouzha.*（经宿主 invoke → router_dispatch），跨端同一本账。
 * 提醒触达：应用内横幅 + WebAudio 短音（宿主暂无系统通知通道，与日晷同一方案）；
 * 首载不响，仅当逾期/试用转正「新增」且面板可见时提示。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, fmtMoney, type PanelData } from './model'
import OverviewTab from './OverviewTab'
import SubsTab from './SubsTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const css = `
.sz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sz-body::-webkit-scrollbar{width:9px;height:9px}
.sz-body::-webkit-scrollbar-track{background:transparent}
.sz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sz-page{max-width:560px;margin:0 auto}
.sz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.sz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3E7BFA,#1E5AD6);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.sz-tt{flex:1;min-width:0}
.sz-tt b{font-size:15px;display:block}
.sz-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.sz-cost{font-variant-numeric:tabular-nums}
.sz-cost b{color:#E6EAF2}
.sz-tabs{display:flex;gap:4px}
.sz-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.sz-tab:hover{color:#E6EAF2}
.sz-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sz-alert{margin:0 16px 10px;border-radius:12px;padding:10px 13px;font-size:12px;line-height:1.7;border:1px solid}
.sz-alert.red{background:#2A1418;border-color:#54262C;color:#FFB3BC}
.sz-alert.amber{background:#2A2114;border-color:#54401E;color:#F2C063}
.sz-alert b{display:block;margin-bottom:2px;font-size:12.5px}
.sz-alert .ops{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
.sz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3E7BFA,#1E5AD6);flex-shrink:0}
.sz-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sz-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sz-card-b{padding:11px 13px}
.sz-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.sz-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sz-btn{background:#1E5AD6;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.sz-btn:hover{filter:brightness(1.12)}
.sz-btn:disabled{opacity:.45;cursor:not-allowed}
.sz-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.sz-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.sz-btn.warn{background:#33270f;color:#F2C063;border:1px solid #54401e}
.sz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.sz-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.sz-inp:focus{outline:none;border-color:#1E5AD6}
.sz-inp::placeholder{color:#4d5566}
.sz-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.sz-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.sz-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.sz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.sz-toast.bad{border-color:#54262c;color:#FF8A9A}
.sz-toast.good{border-color:#2b4a35;color:#7EE2A0}
.sz-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.sz-chip:hover{border-color:#3a4356}
.sz-chip.on{background:#14243a;border-color:#1E5AD6;color:#79B8FF;font-weight:600}
.sz-badge{font-size:9.5px;padding:1px 6px;border-radius:6px;margin-left:6px;flex-shrink:0;font-weight:600}
.sz-badge.bad{background:#3a1d22;color:#FF8A9A}
.sz-badge.warn{background:#33270f;color:#F2C063}
.sz-badge.info{background:#16283a;color:#79B8FF}
.sz-badge.off{background:#1C2330;color:#5C6678}
.sz-item{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1d2330}
.sz-item:first-child{border-top:none}
.sz-item-main{flex:1;min-width:0}
.sz-item-main b{font-size:12.5px;display:flex;align-items:center;overflow:hidden;white-space:nowrap}
.sz-item-main small{color:#5C6678;font-size:10px;display:block;margin-top:1px}
.sz-item-amt{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;flex-shrink:0;text-align:right}
.sz-item-amt small{display:block;font-weight:400;color:#5C6678;font-size:10px}
.sz-ops{display:flex;gap:5px;flex-shrink:0;margin-top:5px;flex-wrap:wrap}
.sz-kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12px}
.sz-kv small{color:#8B95A7}
.sz-kv b{font-variant-numeric:tabular-nums}
.sz-bars{display:flex;align-items:flex-end;gap:3px;height:92px;padding:6px 2px 0}
.sz-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;cursor:default}
.sz-barcol i{display:block;width:100%;max-width:18px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#3E7BFA,#1E5AD6);min-height:2px}
.sz-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.sz-barcol.hot i{background:linear-gradient(180deg,#F2C063,#b0731f)}
.sz-pct{height:7px;border-radius:4px;background:#1C2330;overflow:hidden;margin-top:4px}
.sz-pct i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3E7BFA,#79B8FF)}
.sz-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.sz-field:first-child{border-top:none}
.sz-field-l{flex:1;min-width:0}
.sz-field-l b{font-size:12.5px;display:block}
.sz-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.sz-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.sz-modal{position:fixed;inset:0;background:rgba(8,10,14,.72);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
.sz-modal-box{background:#161B22;border:1px solid #242C3A;border-radius:13px;width:min(94vw,560px);max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
.sz-modal-head{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid #1d2330}
.sz-modal-head b{flex:1;font-size:13px}
.sz-modal-body{overflow-y:auto;padding:12px 13px}
.sz-modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 13px;border-top:1px solid #1d2330}
.sz-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
`

export type Tab = 'overview' | 'subs' | 'stats' | 'settings'

export type Toast = (msg: string, kind?: 'bad' | 'good') => void

export interface TabProps {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}

/** 只读展示型 Tab（透视）所需的最小 props */
export interface ReadOnlyTabProps {
  data: PanelData | null
}

/** 短促双音（新增告警时；自动播放策略限制时静默） */
function beep() {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime
    for (const [f, t] of [[880, 0], [1174, 0.13]] as [number, number][]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = f
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.001, t0 + t)
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + t + 0.12)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + t)
      osc.stop(t0 + t + 0.14)
    }
    setTimeout(() => { void ctx.close() }, 500)
  } catch (_) { /* 静默 */ }
}

export default function ShouzhaPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenAlertKeys = useRef<Set<string> | null>(null)

  const showToast = useCallback<Toast>((msg, kind) => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const reload = useCallback(async (): Promise<PanelData | null> => {
    try {
      const d = await loadPanelData()
      setData(d)
      setLoadErr('')
      // 告警去重：首次载入只记录基线不响铃；之后新增逾期/试用将转正才响
      const keys = new Set<string>()
      for (const s of [...d.board.overdue, ...d.board.trials]) keys.add(s.id)
      if (seenAlertKeys.current === null) {
        seenAlertKeys.current = keys
      } else {
        let hasNew = false
        for (const k of keys) if (!seenAlertKeys.current.has(k)) { hasNew = true; break }
        if (hasNew && document.visibilityState === 'visible') beep()
        seenAlertKeys.current = keys
      }
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
    void poll()
    const timer = setInterval(poll, 8000)
    const onVis = () => { if (document.visibilityState === 'visible') void poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const headCost = (() => {
    if (!data) return '载入中…'
    const sym = data.settings.currencySymbol
    const st = data.stats
    const nOver = data.board.overdue.length
    const nTrial = data.board.trials.length
    const alertBits: string[] = []
    if (nOver) alertBits.push(`${nOver} 笔逾期待对账`)
    if (nTrial) alertBits.push(`${nTrial} 笔试用将转正`)
    return `月均 ${fmtMoney(st.monthlyAll, sym)}${alertBits.length ? ` · ⚠️ ${alertBits.join('、')}` : ''}`
  })()

  return (
    <div className="sz-root">
      <style>{css}</style>
      <div className="sz-top">
        <div className="sz-logo">🚪</div>
        <div className="sz-tt">
          <b>守闸</b>
          <small className="sz-cost">{headCost}</small>
        </div>
        <div className="sz-tabs">
          {([
            ['overview', '总览'],
            ['subs', '订阅'],
            ['stats', '透视'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`sz-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="sz-body">
        <div className="sz-page">
          {loadErr && <div className="sz-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'overview' && <OverviewTab data={data} reload={reload} showToast={showToast} goTab={setTab} />}
          {tab === 'subs' && <SubsTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'stats' && <StatsTab data={data} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`sz-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
