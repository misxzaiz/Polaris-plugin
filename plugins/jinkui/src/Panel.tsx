/**
 * 保单台账面板外壳：头部 + 四 Tab（总览 / 保单 / 透视 / 设置）
 *
 * 数据源：cap.kv jinkui.* 键空间（经宿主 invoke → router_dispatch）。
 * 无后台服务——缴费进度/状态机/缺口矩阵/现金流全部经 shared/core 本地现算
 * （与 MCP 同源同口径）。轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），
 * 后台自动暂停。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadJinkui, newCache, stateOf, type CacheState, type JinkuiData } from './model'
import type { PolicyState } from '../shared/core'
import OverviewTab from './OverviewTab'
import PoliciesTab from './PoliciesTab'
import InsightsTab from './InsightsTab'
import SettingsTab from './SettingsTab'

const css = `
.jk-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.jk-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.jk-body{flex:1;overflow-y:auto;padding:0 0 24px}
.jk-body::-webkit-scrollbar{width:9px;height:9px}
.jk-body::-webkit-scrollbar-track{background:transparent}
.jk-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.jk-page{max-width:580px;margin:0 auto}

/* 头部 */
.jk-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.jk-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#1F7A5C,#2E9E77);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.jk-tt{flex:1;min-width:0}
.jk-tt b{font-size:15px;display:block}
.jk-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.jk-tabs{display:flex;gap:4px}
.jk-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.jk-tab:hover{color:#E6EAF2}
.jk-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.jk-badge{position:absolute;top:0;right:2px;background:#D64545;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.jk-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.jk-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#1F7A5C,#2E9E77);flex-shrink:0}
.jk-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.jk-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.jk-card-b{padding:11px 13px}
.jk-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.jk-btn:hover{filter:brightness(1.1)}
.jk-btn:disabled{opacity:.45;cursor:not-allowed}
.jk-btn.green{background:#1F5C46;color:#7EE2B8}
.jk-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.jk-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.jk-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.jk-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.jk-inp:focus{outline:none;border-color:#2b6cb0}
.jk-inp::placeholder{color:#4d5566}
.jk-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.jk-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.jk-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.jk-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.jk-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.jk-toast.bad{border-color:#54262c;color:#FF8A9A}
.jk-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.jk-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.jk-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.jk-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.jk-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.jk-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.jk-row{display:flex;align-items:center;gap:8px;min-width:0}
.jk-grow{flex:1;min-width:0}
.jk-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.jk-alert{margin:0 16px 10px;background:#332a12;border:1px solid #5a4a1e;border-radius:10px;padding:8px 12px;font-size:11.5px;color:#E3B341;line-height:1.7}
.jk-num{font-variant-numeric:tabular-nums}
.jk-kv{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;font-size:12px}
.jk-kv>span:first-child{color:#8B95A7;flex-shrink:0}
.jk-kv>span:last-child{text-align:right;min-width:0}
.jk-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jk-stat{background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 11px}
.jk-stat b{display:block;font-size:15px;font-weight:700}
.jk-stat small{color:#8B95A7;font-size:10px}
`

export type Tab = 'overview' | 'policies' | 'insights' | 'settings'

export interface TabProps {
  data: JinkuiData | null
  reload: () => Promise<JinkuiData | null>
  showToast: (msg: string, bad?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function JinkuiPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<JinkuiData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const reload = useCallback(async (): Promise<JinkuiData | null> => {
    try {
      const d = await loadJinkui(cacheRef.current)
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
    const timer = setInterval(poll, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  // 派生状态（每轮统一现算，Tab 间共享）
  const states = useMemo<PolicyState[]>(() => {
    if (!data) return []
    const now = Date.now()
    return data.policies.map((p) => stateOf(data, p, now))
  }, [data])

  const alertCount = useMemo(() => {
    if (!data) return 0
    return states.filter((st) => st.state === 'grace' || st.state === 'lapse').length
  }, [states])

  const tabProps: TabProps = { data, reload, showToast, pluginId, onSendToChat }

  return (
    <div className="jk-root">
      <style>{css}</style>
      <div className="jk-top">
        <div className="jk-logo">🛡️</div>
        <div className="jk-tt">
          <b>保单台账</b>
          <small>家庭保单台账 · {data ? `${data.policies.length} 张入柜 · 数据仅存本机` : '加载中…'}</small>
        </div>
        <div className="jk-tabs">
          {([
            ['overview', '总览'],
            ['policies', '保单'],
            ['insights', '透视'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`jk-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'overview' && alertCount > 0 && <span className="jk-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="jk-body">
        <div className="jk-page">
          {loadErr && <div className="jk-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab {...tabProps} states={states} />}
          {tab === 'policies' && <PoliciesTab {...tabProps} states={states} />}
          {tab === 'insights' && <InsightsTab {...tabProps} states={states} />}
          {tab === 'settings' && <SettingsTab {...tabProps} />}
          <div className="jk-foot">保单台账只做保单记录与现状透视：状态/宽限期/缺口为台账口径投影，与保司实际条款可能有出入；<br />不构成投保建议，退保/复效/理赔以保司合同与客服为准。数据仅存本机（cap.kv）。</div>
        </div>
      </div>
      {toast && <div className={`jk-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
