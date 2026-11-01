/**
 * 接口压测台面板外壳：头部（服务心跳 + 运行态）+ 3 Tab（压测 / 历史 / 设置）
 *
 * 数据源分层：
 * - cap.kv api-bench.*（宿主 invoke → router_dispatch）：meta 引导 / 历史 / 报告（跨端可读）
 * - 127.0.0.1:<meta.port> 直连自家服务（token）：发起/停止/实时进度（desktop-first）
 * 轮询纪律：可见时才拉；meta 心跳 3s；压测进行中的实时数据由 WorkTab 自轮询（800ms）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getMeta, loadHistory, loadSettingsKv, loadReport,
  type BenchReport, type BenchSettings, type HistoryEntry, type ServiceMeta,
} from './model'
import WorkTab from './WorkTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.ab-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ab-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ab-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ab-body::-webkit-scrollbar{width:9px;height:9px}
.ab-body::-webkit-scrollbar-track{background:transparent}
.ab-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ab-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ab-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2B6CB0,#E3B341);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.ab-tt{flex:1;min-width:0}
.ab-tt b{font-size:15px;display:block}
.ab-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ab-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ab-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ab-dot.stale{background:#D29922}
.ab-dot.down{background:#F85149}
.ab-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.ab-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ab-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ab-tab:hover{color:#E6EAF2}
.ab-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ab-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ab-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2B6CB0,#E3B341);flex-shrink:0}
.ab-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400;text-align:right}
.ab-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ab-card-b{padding:11px 13px}
.ab-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ab-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ab-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ab-btn:hover{filter:brightness(1.1)}
.ab-btn:disabled{opacity:.45;cursor:not-allowed}
.ab-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ab-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ab-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ab-link{background:transparent;border:none;color:#58A6FF;font-size:11px;cursor:pointer;padding:6px 0 2px}
.ab-link:hover{text-decoration:underline}
.ab-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ab-inp:focus{outline:none;border-color:#2b6cb0}
.ab-inp::placeholder{color:#4d5566}
.ab-inp:disabled{opacity:.6}
.ab-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.ab-sel:disabled{opacity:.6}
textarea.ab-inp{resize:vertical;font-family:Consolas,Menlo,monospace}
.ab-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ab-err{color:#F85149;font-size:11.5px;padding:8px 0 0;word-break:break-all}
.ab-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.ab-ok{color:#3FB950}
.ab-bad{color:#FF8A9A}
.ab-mono{font-family:Consolas,Menlo,monospace}
.ab-num{font-family:Consolas,Menlo,monospace}
.ab-row{padding:9px 13px;border-top:1px solid #1d2330}
.ab-row:hover{background:#12151c}
.ab-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.ab-muted{color:#5C6678}
.ab-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.ab-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.ab-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.ab-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.ab-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.ab-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.ab-sum b{font-size:19px;display:block;line-height:1.2}
.ab-sum small{color:#8B95A7;font-size:9.5px}
.ab-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:0 0 8px}
.ab-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2B6CB0,#E3B341);border-radius:3px;transition:width .5s}
.ab-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.ab-kv dt{color:#5C6678;white-space:nowrap}
.ab-kv dd{margin:0;word-break:break-all}
table.ab-tb{width:100%;border-collapse:collapse;font-size:11.5px}
table.ab-tb th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
table.ab-tb td{padding:6px 8px;border-top:1px solid #1d2330;white-space:nowrap}
.ab-fmrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.ab-fmgrid{display:grid;grid-template-columns:auto 1fr;gap:7px 10px;align-items:center;font-size:11.5px;margin:8px 0}
.ab-fmgrid label{color:#8B95A7;white-space:nowrap}
.ab-unitwrap{display:flex;align-items:center;gap:6px}
.ab-unitwrap>span{color:#5C6678;font-size:10.5px;white-space:nowrap}
.ab-adv{display:flex;flex-direction:column;gap:6px;margin:6px 0}
.ab-adv>label{color:#8B95A7;font-size:10.5px}
.ab-btnrow{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.ab-chiprow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ab-warncard{margin:10px 16px 0;padding:8px 12px;border:1px solid #4d4316;background:#2a2410;color:#E3B341;border-radius:10px;font-size:11.5px}
`

type TabId = 'work' | 'history' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'work', label: '压测' },
  { id: 'history', label: '历史' },
  { id: 'settings', label: '设置' },
]

export interface PanelProps {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function Panel(_props: PanelProps) {
  const [tab, setTab] = useState<TabId>('work')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [settings, setSettings] = useState<BenchSettings | null>(null)
  const [lastReport, setLastReport] = useState<BenchReport | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [reloadTick, setReloadTick] = useState(0)
  const visibleRef = useRef(true)

  const refreshAll = useCallback(async () => {
    try {
      const [m, s, h] = await Promise.all([getMeta(), loadSettingsKv(), loadHistory()])
      setMeta(m)
      setSettings(s)
      setHistory(h)
      // 最近报告：优先走 kv（与 MCP/移动端同一事实库）
      const rid = m?.lastReportId
      if (rid) {
        const rep = await loadReport(rid)
        setLastReport(rep)
      }
    } catch { /* 桥未就绪：心跳显示未连接 */ }
  }, [])

  useEffect(() => { refreshAll() }, [refreshAll, reloadTick])

  useEffect(() => {
    const t = setInterval(async () => {
      if (!visibleRef.current) return
      try {
        const m = await getMeta()
        setMeta((prev) => {
          if (prev && prev.running && m && !m.running) setReloadTick((x) => x + 1) // 运行结束瞬间全量刷新
          return m
        })
      } catch { /* 心跳失败不覆盖旧值 */ }
    }, 3000)
    const onVis = () => { visibleRef.current = document.visibilityState === 'visible' }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const heartbeatOk = meta && !meta.degraded && Date.now() - new Date(meta.ts).getTime() < 130000
  const heartbeatStale = meta && !meta.degraded && !heartbeatOk
  const running = meta && meta.running

  return (
    <div className="ab-root">
      <style>{css}</style>
      <div className="ab-top">
        <div className="ab-logo">🎯</div>
        <div className="ab-tt">
          <b>接口压测台</b>
          <small>
            <span className={`ab-dot ${heartbeatOk ? 'ok' : heartbeatStale ? 'stale' : 'down'}`} />
            {meta
              ? (meta.degraded ? `服务降级：${meta.lastBridgeErr || '桥不可达'}` : `服务 ${meta.version} · 127.0.0.1:${meta.port}`)
              : '服务未连接（等待心跳；首次使用先确认插件已启用）'}
          </small>
        </div>
        {running && <span className="ab-run" title={`${running.method} ${running.url}`}>⏳ {running.method} {running.url.slice(0, 32)}</span>}
        <div className="ab-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`ab-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="ab-body">
        {tab === 'work' && <WorkTab meta={meta} settings={settings} lastReport={lastReport} onRefresh={refreshAll} />}
        {tab === 'history' && <HistoryTab history={history} onRefresh={refreshAll} />}
        {tab === 'settings' && <SettingsTab meta={meta} settings={settings} onRefresh={refreshAll} />}
      </div>
    </div>
  )
}
