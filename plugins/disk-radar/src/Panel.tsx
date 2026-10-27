/**
 * 磁盘雷达面板外壳：头部（状态/心跳）+ 五 Tab（总览/空间地图/垃圾清理/历史/设置）
 *
 * 数据源：cap.kv diskrad.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零直连请求（无 CORS 面）；跨端一致由 cap.kv 单事实库保证。
 * 轮询：可见时每 4s 拉一次轻量快照（state/scan/meta/settings/roots 五键并行 get）。
 */
import { useCallback, useEffect, useState } from 'react'
import { loadPanelData, timeAgo, type PanelData } from './model'
import OverviewTab from './OverviewTab'
import SpaceMapTab from './SpaceMapTab'
import JunkTab from './JunkTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.dr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dr-body::-webkit-scrollbar{width:9px;height:9px}
.dr-body::-webkit-scrollbar-track{background:transparent}
.dr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dr-page{max-width:560px;margin:0 auto}

.dr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#58A6FF,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dr-tt{flex:1;min-width:0}
.dr-tt b{font-size:15px;display:block}
.dr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.dr-dot.stale{background:#D29922}
.dr-dot.down{background:#F85149}
.dr-tabs{display:flex;gap:4px;overflow-x:auto;max-width:60%}
.dr-tabs::-webkit-scrollbar{display:none}
.dr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative;white-space:nowrap;flex-shrink:0}
.dr-tab:hover{color:#E6EAF2}
.dr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.dr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#58A6FF,#BC8CFF);flex-shrink:0}
.dr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dr-card-b{padding:11px 13px}
.dr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dr-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.dr-badge-txt{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.dr-badge-txt.warn{background:rgba(210,153,34,.12);color:#D29922;border-color:#5a4316}
.dr-badge-txt.bad{background:rgba(248,81,73,.1);color:#F85149;border-color:#54262c}
.dr-badge-txt.good{background:rgba(63,185,80,.1);color:#3FB950;border-color:#2a5a38}
.dr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dr-btn:hover{filter:brightness(1.1)}
.dr-btn:disabled{opacity:.45;cursor:not-allowed}
.dr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dr-btn.amber{background:#3a2d12;color:#D29922;border:1px solid #5a4316}
.dr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dr-inp:focus{outline:none;border-color:#2b6cb0}
.dr-inp::placeholder{color:#4d5566}
.dr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.dr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.dr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.dr-toast.bad{border-color:#54262c;color:#FF8A9A}
.dr-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:dr-spin .8s linear infinite;vertical-align:-1px}
@keyframes dr-spin{to{transform:rotate(360deg)}}

/* 根卡片 */
.dr-rootcard{position:relative}
.dr-total{font-size:22px;font-weight:800;letter-spacing:.3px}
.dr-volbar{height:6px;border-radius:3px;background:#0d1017;overflow:hidden;margin-top:7px;display:flex}
.dr-volbar i{display:block;height:100%}
.dr-kv{color:#5C6678;font-size:10.5px}
.dr-kv b{color:#B4B4B8;font-weight:600}
.dr-delta{font-weight:700}
.dr-delta.up{color:#F85149}
.dr-delta.down{color:#3FB950}
.dr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.dr-mono{font:11px/1.5 Consolas,Menlo,monospace;word-break:break-all}

/* 进度条 */
.dr-prog{background:#0d1017;border-radius:8px;padding:9px 11px;margin:0 16px 10px;border:1px solid #242C3A}
.dr-prog-track{height:7px;border-radius:4px;background:#161B22;overflow:hidden;margin:6px 0 4px}
.dr-prog-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#58A6FF,#BC8CFF);animation:dr-pulse 1.6s ease-in-out infinite}
@keyframes dr-pulse{0%,100%{opacity:.65}50%{opacity:1}}

/* 表格 */
.dr-tbl{width:100%;border-collapse:collapse;font-size:11px}
.dr-tbl th{color:#5C6678;font-weight:600;text-align:left;padding:4px 8px;border-bottom:1px solid #212836;white-space:nowrap}
.dr-tbl td{padding:5px 8px;border-bottom:1px solid #1a202c;vertical-align:top}
.dr-tbl tr:last-child td{border-bottom:none}
.dr-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}

/* 树图 */
.dr-mapwrap{margin:0 16px 10px;background:#0d1017;border:1px solid #212836;border-radius:10px;overflow:hidden}
.dr-mapcell{cursor:pointer;stroke:#10141C;stroke-width:1}
.dr-mapcell:hover{filter:brightness(1.25)}
.dr-crumbs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:8px 16px 0;font-size:11px;color:#8B95A7}
.dr-crumb{background:#1C2330;border:1px solid #242C3A;border-radius:6px;padding:2px 8px;cursor:pointer;color:#8B95A7}
.dr-crumb:hover{color:#E6EAF2}
.dr-crumb.cur{color:#E6EAF2;font-weight:700;border-color:#2b6cb0}

/* 垃圾分组 */
.dr-junk-h{display:flex;align-items:center;gap:8px;padding:8px 13px;border-top:1px solid #1d2330;font-weight:700;font-size:12.5px}
.dr-junk-h:first-child{border-top:none}
.dr-item{display:flex;align-items:center;gap:8px;padding:7px 13px;border-top:1px solid #1a202c}
.dr-item-m{flex:1;min-width:0}

/* 设置字段 */
.dr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.dr-field:first-child{border-top:none}
.dr-field-l{flex:1;min-width:0}
.dr-field-l b{font-size:12.5px;display:block}
.dr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.dr-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.dr-toggle.on{background:#2b6cb0}
.dr-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.dr-toggle.on i{left:18px}
.dr-numin{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`

export type TabKey = 'overview' | 'map' | 'junk' | 'history' | 'settings'

export interface TabProps {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: (msg: string, bad?: boolean) => void
  goTab: (tab: TabKey) => void
  pluginId: string
}

export default function DiskRadarPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    setTimeout(() => setToast(null), 3200)
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
    const timer = setInterval(poll, 4000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const heartbeat = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const last = data.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳' }
    const age = Date.now() - last
    if (age < 120 * 1000) return { cls: 'ok', text: `雷达在线 · 扫描根 ${data.roots.length}` }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  const tabProps: TabProps = { data, reload, showToast, goTab: setTab, pluginId }

  return (
    <div className="dr-root">
      <style>{css}</style>
      <div className="dr-top">
        <div className="dr-logo">📡</div>
        <div className="dr-tt">
          <b>磁盘雷达</b>
          <small>
            <i className={`dr-dot ${heartbeat.cls}`} />
            {heartbeat.text}
            {data?.meta?.version ? ` · v${data.meta.version}` : ''}
          </small>
        </div>
        <div className="dr-tabs">
          {([
            ['overview', '总览'],
            ['map', '空间地图'],
            ['junk', '垃圾清理'],
            ['history', '历史'],
            ['settings', '设置'],
          ] as [TabKey, string][]).map(([k, label]) => (
            <button key={k} className={`dr-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="dr-body">
        <div className="dr-page">
          {loadErr && <div className="dr-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab {...tabProps} onSendToChat={onSendToChat} />}
          {tab === 'map' && <SpaceMapTab {...tabProps} />}
          {tab === 'junk' && <JunkTab {...tabProps} />}
          {tab === 'history' && <HistoryTab {...tabProps} />}
          {tab === 'settings' && <SettingsTab {...tabProps} />}
        </div>
      </div>
      {toast && <div className={`dr-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

// 共享小部件（各 Tab 复用）
export function RootSelect({ data, value, onChange }: {
  data: PanelData | null
  value: string
  onChange: (rid: string) => void
}) {
  const roots = data?.roots || []
  return (
    <div className="dr-card-b" style={{ paddingBottom: 4 }}>
      <select className="dr-sel" value={value} onChange={(e) => onChange(e.target.value)}>
        {!roots.length && <option value="">（尚无扫描根）</option>}
        {roots.map((r) => (
          <option key={r.id} value={r.id}>{r.label || r.path}</option>
        ))}
      </select>
    </div>
  )
}

export function agoOf(ts?: number | null) { return timeAgo(ts) }
