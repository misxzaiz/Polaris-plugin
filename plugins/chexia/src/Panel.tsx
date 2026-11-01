/**
 * 车辖面板外壳：头部（状态/心跳）+ 四 Tab（概览 / 补能 / 车务 / 设置）
 *
 * 数据源：cap.kv chexia.* 键空间（经宿主 invoke → router_dispatch）。
 * 概览优先读服务端 chexia.snapshot（15s 重算），快照缺失/降级回落本地 core 现算。
 * 轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadChexia, newCache, snapUsable, computeSnap, type CacheState, type ChexiaData, type FamilySnap } from './model'
import OverviewTab from './OverviewTab'
import EnergyTab from './EnergyTab'
import ServiceTab from './ServiceTab'
import SettingsTab from './SettingsTab'

const css = `
.cx-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cx-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cx-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cx-body::-webkit-scrollbar{width:9px;height:9px}
.cx-body::-webkit-scrollbar-track{background:transparent}
.cx-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cx-page{max-width:560px;margin:0 auto}

/* 头部 */
.cx-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cx-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#F0883E,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.cx-tt{flex:1;min-width:0}
.cx-tt b{font-size:15px;display:block}
.cx-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.cx-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.cx-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.cx-dot.stale{background:#D29922}
.cx-dot.down{background:#F85149}
.cx-tabs{display:flex;gap:4px}
.cx-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.cx-tab:hover{color:#E6EAF2}
.cx-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cx-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.cx-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.cx-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F0883E,#58A6FF);flex-shrink:0}
.cx-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.cx-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.cx-card-b{padding:11px 13px}
.cx-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cx-btn:hover{filter:brightness(1.1)}
.cx-btn:disabled{opacity:.45;cursor:not-allowed}
.cx-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.cx-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.cx-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.cx-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.cx-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.cx-inp:focus{outline:none;border-color:#2b6cb0}
.cx-inp::placeholder{color:#4d5566}
.cx-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.cx-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.cx-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.cx-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.cx-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.cx-toast.bad{border-color:#54262c;color:#FF8A9A}
.cx-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.cx-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.cx-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.cx-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.cx-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.cx-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.cx-row{display:flex;align-items:center;gap:8px;min-width:0}
.cx-grow{flex:1;min-width:0}
.cx-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.cx-prog{height:6px;border-radius:3px;background:#0d1117;overflow:hidden;position:relative}
.cx-prog>i{display:block;height:100%;border-radius:3px}
.cx-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cx-num{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.cx-num small{font-size:10px;color:#8B95A7;font-weight:400;margin-left:2px}
`

export type Tab = 'overview' | 'energy' | 'service' | 'settings'

export type TabProps = {
  data: ChexiaData | null
  reload: () => Promise<ChexiaData | null>
  showToast: (msg: string, bad?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function ChexiaPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<ChexiaData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<ChexiaData | null> => {
    try {
      const d = await loadChexia(cacheRef.current)
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

  // 心跳判定：chexia.meta 60s 一跳；3 分钟内 = 运行中
  const heartbeat = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const last = data.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳（可在设置里启动服务）' }
    const age = Date.now() - last
    if (age < 180 * 1000) {
      const c = data.meta?.counts
      return { cls: 'ok', text: `车辖在线 · ${c ? `${c.cars}车 ${c.items}养护项 ${c.energies}补能` : ''} · 桥 ${data.meta?.bridge || '?'}` }
    }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  // 快照优先服务端；缺失/降级本地现算（口径同源，诚实不假装）
  const snap: FamilySnap | null = data
    ? (snapUsable(data.snap) ? data.snap : (data.cars.length ? computeSnap(data, Date.now()) : null))
    : null
  const alertCount = snap
    ? snap.cars.reduce((n, c) => n + c.items.filter((i) => i.projection.state === 'overdue' || i.projection.state === 'due').length + c.docsDue.filter((d) => d.band === 'expired').length, 0) + snap.personalDocs.filter((d) => d.band === 'expired').length
    : 0

  return (
    <div className="cx-root">
      <style>{css}</style>
      <div className="cx-top">
        <div className="cx-logo">🚗</div>
        <div className="cx-tt">
          <b>车辖 · 家庭车辆台账</b>
          <small>
            <i className={`cx-dot ${heartbeat.cls}`} />
            {heartbeat.text}
          </small>
        </div>
        <div className="cx-tabs">
          {([
            ['overview', '概览'],
            ['energy', '补能'],
            ['service', '车务'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`cx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'overview' && alertCount > 0 && <span className="cx-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="cx-body">
        <div className="cx-page">
          {loadErr && <div className="cx-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab data={data} snap={snap} reload={reload} showToast={showToast} pluginId={pluginId} onSendToChat={onSendToChat} />}
          {tab === 'energy' && <EnergyTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} />}
          {tab === 'service' && <ServiceTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} />}
          <div className="cx-foot">车辖是家庭车务记录工具，只做记录与提醒，不构成维修/保险建议，不推荐任何商家。数据仅存本机（cap.kv）。</div>
        </div>
      </div>
      {toast && <div className={`cx-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
