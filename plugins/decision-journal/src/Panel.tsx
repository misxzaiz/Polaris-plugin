/**
 * 决策日志面板外壳：头部（台账速览）+ 四 Tab（总览 / 决策 / 校准 / 设置）
 * 数据面：cap.kv decision.*（经宿主 invoke → router_dispatch），跨端同一份台账。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadAllDecisions, loadSettings, buildOverview, computeCalibration,
  type Decision, type Settings, type Overview, type Calibration, type PanelCtx,
} from './model'
import HomeTab from './HomeTab'
import ListTab from './ListTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const css = `
.dj-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dj-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dj-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dj-body::-webkit-scrollbar{width:9px;height:9px}
.dj-body::-webkit-scrollbar-track{background:transparent}
.dj-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dj-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dj-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5EA8FF,#3B6FE0);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dj-tt{flex:1;min-width:0}
.dj-tt b{font-size:15px;display:block}
.dj-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.dj-tabs{display:flex;gap:4px}
.dj-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.dj-tab:hover{color:#E6EAF2}
.dj-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.dj-tab .dj-badge{display:inline-block;min-width:15px;padding:0 4px;margin-left:3px;border-radius:8px;background:#54262c;color:#FF8A9A;font-size:9.5px;font-weight:700;line-height:15px;text-align:center;vertical-align:1px}
.dj-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dj-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#5EA8FF,#3B6FE0);flex-shrink:0}
.dj-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dj-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dj-card-b{padding:11px 13px}
.dj-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dj-btn{background:#2E5FC0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.dj-btn:hover{filter:brightness(1.12)}
.dj-btn:disabled{opacity:.45;cursor:not-allowed}
.dj-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dj-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dj-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dj-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dj-inp:focus{outline:none;border-color:#2E5FC0}
.dj-inp::placeholder{color:#4d5566}
.dj-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.dj-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.dj-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dj-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.dj-toast.bad{border-color:#54262c;color:#FF8A9A}
.dj-toast.good{border-color:#2b4a35;color:#7EE2A0}
.dj-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.dj-chip:hover{border-color:#3a4356}
.dj-chip.on{background:#1a2c48;border-color:#2E5FC0;color:#9EC4FF;font-weight:600}
.dj-statrow{display:flex;gap:8px}
.dj-stat{flex:1;background:#12151c;border:1px solid #222936;border-radius:10px;padding:9px 6px;text-align:center;min-width:0}
.dj-stat b{display:block;font-size:17px;font-variant-numeric:tabular-nums}
.dj-stat small{color:#5C6678;font-size:9.5px;display:block;margin-top:1px}
.dj-stat .red{color:#FF8A9A}
.dj-stat .amber{color:#F2C063}
.dj-stat .green{color:#7EE2A0}
.dj-stat .blue{color:#9EC4FF}
.dj-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dj-item{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1d2330;cursor:pointer}
.dj-item:first-child{border-top:none}
.dj-item:hover{background:rgba(94,168,255,.04)}
.dj-item-main{flex:1;min-width:0}
.dj-item-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dj-item-main small{color:#5C6678;font-size:10px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dj-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dj-dot.open{background:#D29922}
.dj-dot.live{background:#4C8DFF}
.dj-dot.done{background:#3FB950}
.dj-dot.muted{background:#4d5566}
.dj-dot.bad{background:#F85149}
.dj-tag{display:inline-block;background:#1C2330;border-radius:5px;color:#8B95A7;font-size:9.5px;padding:1px 6px;margin-right:4px}
.dj-back{background:none;border:none;color:#8B95A7;font-size:12px;cursor:pointer;padding:2px 0}
.dj-back:hover{color:#E6EAF2}
.dj-field{display:flex;align-items:flex-start;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.dj-field:first-child{border-top:none}
.dj-field-l{flex:1;min-width:0}
.dj-field-l b{font-size:12.5px;display:block}
.dj-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5;white-space:pre-wrap}
.dj-opt{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #2a2f3a;border-radius:9px;margin-bottom:6px;background:#12151c}
.dj-opt.chosen{border-color:#2E5FC0;background:#1a2c48}
.dj-opt input{flex:1;background:transparent;border:none;color:#E6EAF2;font-size:12px;min-width:0;outline:none}
.dj-range{width:100%;accent-color:#4C8DFF}
.dj-conf-num{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:#9EC4FF}
.dj-conf-word{font-size:10.5px;color:#8B95A7;margin-left:6px}
.dj-outcomes{display:flex;gap:6px}
.dj-outcomes button{flex:1;border:1px solid #2a2f3a;background:#12151c;color:#8B95A7;border-radius:9px;padding:8px 2px;font-size:11.5px;cursor:pointer}
.dj-outcomes button.on-hit{background:#16301f;border-color:#2b4a35;color:#7EE2A0;font-weight:700}
.dj-outcomes button.on-partial{background:#33270f;border-color:#5c4a1c;color:#F2C063;font-weight:700}
.dj-outcomes button.on-miss{background:#3a1d22;border-color:#54262c;color:#FF8A9A;font-weight:700}
.dj-outcomes button.on-void{background:#232834;border-color:#3a4356;color:#B4B4B8;font-weight:700}
.dj-quote{border-left:3px solid #2E5FC0;background:#12151c;border-radius:0 9px 9px 0;padding:8px 11px;margin:6px 0;font-size:11.5px;color:#C9D4E8;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.dj-quote.res{border-left-color:#3FB950}
.dj-prompt{display:block;width:100%;text-align:left;background:#12151c;border:1px dashed #2a2f3a;border-radius:9px;color:#9EC4FF;font-size:11.5px;padding:8px 11px;cursor:pointer;line-height:1.5}
.dj-prompt:hover{border-color:#2E5FC0;background:#1a2c48}
.dj-cal-wrap{padding:6px 2px 0}
.dj-big{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.dj-table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.dj-table th{color:#5C6678;font-weight:600;text-align:right;padding:4px 6px;border-bottom:1px solid #1d2330}
.dj-table th:first-child,.dj-table td:first-child{text-align:left}
.dj-table td{padding:5px 6px;text-align:right;border-bottom:1px solid #171c26;color:#C9D4E8}
.dj-lesson{border-left:3px solid #D29922;background:#12151c;border-radius:0 9px 9px 0;padding:7px 10px;margin-bottom:7px}
.dj-lesson b{font-size:11.5px;display:block;color:#E6EAF2}
.dj-lesson small{font-size:10.5px;color:#B4B4B8;line-height:1.6;display:block;margin-top:2px;white-space:pre-wrap}
.dj-monthbar{display:flex;align-items:flex-end;gap:3px;height:64px;padding:6px 2px 0}
.dj-monthcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.dj-monthcol i{display:block;width:100%;max-width:18px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#5EA8FF,#2E5FC0);min-height:2px}
.dj-monthcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
`

type Tab = 'home' | 'list' | 'stats' | 'settings'

export default function DecisionPanel(props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('home')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [decisions, setDecisions] = useState<Decision[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const [focusId, setFocusId] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind?: 'bad' | 'good') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [s, ds] = await Promise.all([loadSettings(), loadAllDecisions()])
      setSettings(s)
      setDecisions(ds)
      setLoadErr('')
    } catch (e) {
      setLoadErr((e as Error).message || String(e))
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const openDetail = useCallback((id: string) => {
    setFocusId(id)
    setTab('list')
  }, [])

  const overview = buildOverview(decisions || [])
  const cal = computeCalibration(decisions || [])
  const ctx: PanelCtx | null = settings && decisions ? {
    settings, decisions, overview, cal, refresh, showToast,
    onSendToChat: props.onSendToChat, openDetail,
  } : null

  return (
    <div className="dj-root">
      <style>{css}</style>
      <div className="dj-top">
        <div className="dj-logo">🎯</div>
        <div className="dj-tt">
          <b>决策日志</b>
          <small>{decisions
            ? `到期复盘 ${overview.due.length} · 纠结中 ${overview.counts.open} · 已复盘 ${overview.counts.resolved}`
            : '决策日志而后动，知止而有得'}</small>
        </div>
        <div className="dj-tabs">
          {([['home', '总览'], ['list', '决策'], ['stats', '校准'], ['settings', '设置']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`dj-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'home' && overview.due.length > 0 ? <span className="dj-badge">{overview.due.length}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="dj-body">
        {loadErr ? (
          <div className="dj-empty">加载失败：{loadErr}</div>
        ) : !ctx ? (
          <div className="dj-empty">正在读取台账…</div>
        ) : tab === 'home' ? (
          <HomeTab ctx={ctx} />
        ) : tab === 'list' ? (
          <ListTab ctx={ctx} focusId={focusId} onFocusConsumed={() => setFocusId('')} />
        ) : tab === 'stats' ? (
          <StatsTab ctx={ctx} openDetail={openDetail} />
        ) : (
          <SettingsTab ctx={ctx} />
        )}
      </div>
      {toast ? <div className={`dj-toast ${toast.kind || ''}`}>{toast.msg}</div> : null}
    </div>
  )
}
