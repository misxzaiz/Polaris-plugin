/**
 * 贷款台账面板外壳：头部 + 四 Tab（总览 / 测算 / 贷款 / 设置）
 *
 * 数据源：cap.kv quanfu.* 键空间（经宿主 invoke → router_dispatch）。
 * 无后台服务——还款表/状态/三方案全部经 shared/core 本地现算（与 MCP 同源同口径）。
 * 轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadQuan, newCache, stateOf, type CacheState, type QuanData } from './model'
import type { LoanState } from '../shared/core'
import OverviewTab from './OverviewTab'
import WhatifTab from './WhatifTab'
import LoansTab from './LoansTab'
import SettingsTab from './SettingsTab'

const css = `
.qf-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qf-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qf-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qf-body::-webkit-scrollbar{width:9px;height:9px}
.qf-body::-webkit-scrollbar-track{background:transparent}
.qf-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qf-page{max-width:580px;margin:0 auto}

/* 头部 */
.qf-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qf-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#D29922,#E3B341);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qf-tt{flex:1;min-width:0}
.qf-tt b{font-size:15px;display:block}
.qf-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qf-tabs{display:flex;gap:4px}
.qf-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.qf-tab:hover{color:#E6EAF2}
.qf-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qf-badge{position:absolute;top:0;right:2px;background:#D29922;color:#10141C;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.qf-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qf-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#D29922,#E3B341);flex-shrink:0}
.qf-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qf-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.qf-card-b{padding:11px 13px}
.qf-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.qf-btn:hover{filter:brightness(1.1)}
.qf-btn:disabled{opacity:.45;cursor:not-allowed}
.qf-btn.gold{background:#8a6414;color:#F5D97A}
.qf-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qf-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qf-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qf-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.qf-inp:focus{outline:none;border-color:#2b6cb0}
.qf-inp::placeholder{color:#4d5566}
.qf-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.qf-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.qf-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qf-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.qf-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qf-toast.bad{border-color:#54262c;color:#FF8A9A}
.qf-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.qf-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.qf-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.qf-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.qf-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.qf-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.qf-row{display:flex;align-items:center;gap:8px;min-width:0}
.qf-grow{flex:1;min-width:0}
.qf-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.qf-alert{margin:0 16px 10px;background:#332a12;border:1px solid #5a4a1e;border-radius:10px;padding:8px 12px;font-size:11.5px;color:#E3B341;line-height:1.7}
.qf-num{font-variant-numeric:tabular-nums}
.qf-prog{height:5px;border-radius:3px;background:#232834;overflow:hidden}
.qf-prog>i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#D29922,#E3B341)}
.qf-kv{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;font-size:12px}
.qf-kv>span:first-child{color:#8B95A7;flex-shrink:0}
.qf-kv>span:last-child{text-align:right;min-width:0}
`

export type Tab = 'overview' | 'whatif' | 'loans' | 'settings'

export interface TabProps {
  data: QuanData | null
  reload: () => Promise<QuanData | null>
  showToast: (msg: string, bad?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function QuanfuPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<QuanData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const reload = useCallback(async (): Promise<QuanData | null> => {
    try {
      const d = await loadQuan(cacheRef.current)
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
  const states = useMemo<LoanState[]>(() => {
    if (!data) return []
    const now = Date.now()
    return data.loans.map((l) => stateOf(data, l, now))
  }, [data])

  const alertCount = useMemo(() => {
    if (!data || !states.length) return 0
    const today = data ? states[0]?.today || '' : ''
    let n = 0
    states.forEach((st, i) => {
      const loan = data!.loans[i]
      if (!loan.active || st.settled) return
      if (st.nextPaymentDate) {
        const d = coreDayDiff(today, st.nextPaymentDate)
        if (d != null && d >= 0 && d <= data.settings.warnDays) n++
      }
      if (st.nextRepricingDate) {
        const d = coreDayDiff(today, st.nextRepricingDate)
        if (d != null && d >= 0 && d <= data.settings.repricingWarnDays) n++
      }
      const cp = st.checkpoints[st.checkpoints.length - 1]
      if (cp && Math.abs(cp.drift) > data.settings.driftWarn) n++
    })
    return n
  }, [data, states])

  const tabProps: TabProps = { data, reload, showToast, pluginId, onSendToChat }

  return (
    <div className="qf-root">
      <style>{css}</style>
      <div className="qf-top">
        <div className="qf-logo">🏛️</div>
        <div className="qf-tt">
          <b>贷款台账</b>
          <small>贷款台账 · {states.filter((s) => s.active && !s.settled).length} 笔在还 · 数据仅存本机</small>
        </div>
        <div className="qf-tabs">
          {([
            ['overview', '总览'],
            ['whatif', '测算'],
            ['loans', '贷款'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`qf-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'overview' && alertCount > 0 && <span className="qf-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="qf-body">
        <div className="qf-page">
          {loadErr && <div className="qf-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab {...tabProps} states={states} />}
          {tab === 'whatif' && <WhatifTab {...tabProps} states={states} />}
          {tab === 'loans' && <LoansTab {...tabProps} states={states} />}
          {tab === 'settings' && <SettingsTab {...tabProps} />}
          <div className="qf-foot">贷款台账只做贷款记录与测算：标准等额本息/等额本金/先息后本公式、逐期分级舍入，<br />与银行实际计息可能有分级出入；不构成金融建议。数据仅存本机（cap.kv）。</div>
        </div>
      </div>
      {toast && <div className={`qf-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function coreDayDiff(a: string, b: string): number | null {
  const ta = new Date(a + 'T00:00:00').getTime()
  const tb = new Date(b + 'T00:00:00').getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round((tb - ta) / 86400000)
}
