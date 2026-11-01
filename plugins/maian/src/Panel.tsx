/**
 * 脉案面板外壳：头部（成员/记录概览）+ 四 Tab（记录 / 趋势 / 台账 / 设置）
 *
 * 数据源：cap.kv maian.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求、零服务进程——分带/统计/小结全部走 shared/core 纯函数现算，
 * 提醒类需求交给日晷（「每天早上 8 点提醒我妈量血压」），本面板专注记录与分析。
 * 轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as core from '../shared/core'
import { loadMaian, newCache, type CacheState, type MaianData, type VitalRecord } from './model'
import RecordTab from './RecordTab'
import TrendTab from './TrendTab'
import LedgerTab from './LedgerTab'
import SettingsTab from './SettingsTab'
import type { TabProps } from './PanelTypes'

const css = `
.mn-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.mn-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mn-body{flex:1;overflow-y:auto;padding:0 0 24px}
.mn-body::-webkit-scrollbar{width:9px;height:9px}
.mn-body::-webkit-scrollbar-track{background:transparent}
.mn-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.mn-page{max-width:560px;margin:0 auto}

/* 头部 */
.mn-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.mn-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#F87171,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.mn-tt{flex:1;min-width:0}
.mn-tt b{font-size:15px;display:block}
.mn-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.mn-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.mn-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.mn-dot.off{background:#5C6678}
.mn-tabs{display:flex;gap:4px}
.mn-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.mn-tab:hover{color:#E6EAF2}
.mn-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.mn-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.mn-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.mn-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F87171,#58A6FF);flex-shrink:0}
.mn-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.mn-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.mn-card-b{padding:11px 13px}
.mn-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.mn-btn:hover{filter:brightness(1.1)}
.mn-btn:disabled{opacity:.45;cursor:not-allowed}
.mn-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.mn-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.mn-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.mn-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.mn-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.mn-inp:focus{outline:none;border-color:#2b6cb0}
.mn-inp::placeholder{color:#4d5566}
.mn-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.mn-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.mn-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.mn-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.mn-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.mn-toast.bad{border-color:#54262c;color:#FF8A9A}
.mn-toast-wrap{white-space:normal;max-height:40vh;overflow-y:auto}
.mn-chips{display:flex;flex-wrap:wrap;gap:5px}
.mn-chip{background:#1C2330;border:1px solid #242C3A;border-radius:8px;color:#8B95A7;font-size:11px;padding:4px 10px;cursor:pointer}
.mn-chip.on{background:#16283e;border-color:#2b6cb0;color:#E6EAF2;font-weight:600}
.mn-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.mn-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.mn-tag.urgent{background:#4a0f18;border-color:#8a1c2c;color:#FF5A6E}
.mn-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.mn-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.mn-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.mn-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.mn-row{display:flex;align-items:center;gap:8px;min-width:0}
.mn-grow{flex:1;min-width:0}
.mn-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.mn-modal-bg{position:absolute;inset:0;background:rgba(8,10,14,.72);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.mn-modal{background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:14px;width:100%;max-width:440px;max-height:88%;overflow-y:auto}
.mn-modal h4{margin:0 0 8px;font-size:13.5px}
`

export type Tab = 'record' | 'trend' | 'ledger' | 'settings'

export default function MaianPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('record')
  const [data, setData] = useState<MaianData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean; wrap?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean, wrap?: boolean) => {
    setToast({ msg, bad, wrap })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), wrap ? 6000 : 2600)
  }, [])

  const reload = useCallback(async (): Promise<MaianData | null> => {
    try {
      const d = await loadMaian(cacheRef.current)
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

  const props: TabProps = { data, reload, showToast, pluginId, onSendToChat }
  const todayCount = data ? data.records.filter((r) => core.dayKeyOfTs(r.ts) === core.dayKey(Date.now())).length : 0
  const flagCount = data ? countRecentFlags(data) : 0

  return (
    <div className="mn-root">
      <style>{css}</style>
      <div className="mn-top">
        <div className="mn-logo">💓</div>
        <div className="mn-tt">
          <b>脉案 · 家庭体征台账</b>
          <small>
            <i className={`mn-dot ${data ? 'ok' : 'off'}`} />
            {data ? `${data.members.length} 成员 · 近7天黄红 ${flagCount} 条` : '载入中…'}
          </small>
        </div>
        <div className="mn-tabs">
          {([
            ['record', '记录'],
            ['trend', '趋势'],
            ['ledger', '台账'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`mn-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'record' && todayCount === 0 && data && data.members.length > 0 && <span className="mn-badge">记</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="mn-body">
        <div className="mn-page">
          {loadErr && <div className="mn-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'record' && <RecordTab {...props} />}
          {tab === 'trend' && <TrendTab {...props} />}
          {tab === 'ledger' && <LedgerTab {...props} />}
          {tab === 'settings' && <SettingsTab {...props} />}
          <div className="mn-foot">脉案是家庭体征记录工具：分带为通用参考区间，不构成医疗建议，解读请遵医嘱。数据仅存本机（cap.kv）。测量提醒可交给「日晷」日程插件。</div>
        </div>
      </div>
      {toast && <div className={`mn-toast ${toast.bad ? 'bad' : ''} ${toast.wrap ? 'mn-toast-wrap' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

/** 近 7 天黄/红/急 条数（头部概览；分带口径同 core 单一权威） */
function countRecentFlags(data: MaianData): number {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const heightOf = (pid: string) => data.members.find((m) => m.id === pid)?.heightCm
  return data.records.filter((r) => r.ts >= weekAgo).filter((r: VitalRecord) => {
    const lv = core.bandOf(r.kind, r as unknown as Record<string, unknown>, heightOf(r.profileId)).level
    return lv === 'yellow' || lv === 'red' || lv === 'urgent'
  }).length
}
