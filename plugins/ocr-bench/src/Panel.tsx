/**
 * 文字识别台面板外壳：头部（服务心跳 + 运行态）+ 3 Tab（识别 / 语言包 / 历史）
 *
 * 数据源分层：
 * - cap.kv ocr-bench.*（宿主 invoke → router_dispatch）：meta 引导 / 历史 / 报告（跨端可读）
 * - 127.0.0.1:<meta.port> 直连自家服务（token）：发起/停止/实时进度（desktop-first）
 * 轮询纪律：可见时才拉；meta 心跳 3s；识别进行中的实时数据由 WorkTab 自轮询（800ms）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getMeta, loadHistory, loadSettingsKv, loadReport,
  type OcrReport, type BenchSettings, type HistoryEntry, type ServiceMeta,
} from './model'
import WorkTab from './WorkTab'
import LangsTab from './LangsTab'
import HistoryTab from './HistoryTab'

const css = `
.ob-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ob-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ob-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ob-body::-webkit-scrollbar{width:9px;height:9px}
.ob-body::-webkit-scrollbar-track{background:transparent}
.ob-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ob-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ob-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0E7A6E,#E3B341);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.ob-tt{flex:1;min-width:0}
.ob-tt b{font-size:15px;display:block}
.ob-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ob-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ob-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ob-dot.stale{background:#D29922}
.ob-dot.down{background:#F85149}
.ob-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:42%;overflow:hidden;text-overflow:ellipsis}
.ob-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ob-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ob-tab:hover{color:#E6EAF2}
.ob-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ob-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ob-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#0E7A6E,#E3B341);flex-shrink:0}
.ob-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400;text-align:right}
.ob-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ob-card-b{padding:11px 13px}
.ob-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ob-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ob-btn{background:#0E7A6E;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ob-btn:hover{filter:brightness(1.1)}
.ob-btn:disabled{opacity:.45;cursor:not-allowed}
.ob-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ob-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ob-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ob-link{background:transparent;border:none;color:#58A6FF;font-size:11px;cursor:pointer;padding:6px 0 2px}
.ob-link:hover{text-decoration:underline}
.ob-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ob-inp:focus{outline:none;border-color:#0E7A6E}
.ob-inp::placeholder{color:#4d5566}
.ob-inp:disabled{opacity:.6}
.ob-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.ob-sel:disabled{opacity:.6}
textarea.ob-inp{resize:vertical;font-family:Consolas,Menlo,monospace}
.ob-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ob-err{color:#F85149;font-size:11.5px;padding:8px 0 0;word-break:break-all}
.ob-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.ob-ok{color:#3FB950}
.ob-bad{color:#FF8A9A}
.ob-mono{font-family:Consolas,Menlo,monospace}
.ob-row{padding:9px 13px;border-top:1px solid #1d2330}
.ob-row:hover{background:#12151c}
.ob-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.ob-muted{color:#5C6678}
.ob-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.ob-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.ob-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.ob-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.ob-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.ob-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.ob-sum b{font-size:19px;display:block;line-height:1.2}
.ob-sum small{color:#8B95A7;font-size:9.5px}
.ob-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:0 0 8px}
.ob-prog>i{display:block;height:100%;background:linear-gradient(90deg,#0E7A6E,#E3B341);border-radius:3px;transition:width .5s}
.ob-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.ob-kv dt{color:#5C6678;white-space:nowrap}
.ob-kv dd{margin:0;word-break:break-all}
.ob-fmrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.ob-fmgrid{display:grid;grid-template-columns:auto 1fr;gap:7px 10px;align-items:center;font-size:11.5px;margin:8px 0}
.ob-fmgrid label{color:#8B95A7;white-space:nowrap}
.ob-chiprow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ob-chip{background:#12151c;border:1px solid #2a2f3a;color:#8B95A7;border-radius:14px;padding:3px 10px;font-size:11px;cursor:pointer}
.ob-chip.on{background:#0E2A26;border-color:#1d6b60;color:#5EEAD4}
.ob-chip:disabled{opacity:.5;cursor:not-allowed}
.ob-txt{white-space:pre-wrap;word-break:break-word;background:#12151c;border:1px solid #242C3A;border-radius:9px;padding:9px 11px;font-size:11.5px;max-height:200px;overflow-y:auto;font-family:Consolas,Menlo,monospace}
`

type TabId = 'work' | 'langs' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'work', label: '识别' },
  { id: 'langs', label: '语言包' },
  { id: 'history', label: '历史' },
]

export interface PanelProps {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function Panel(_props: PanelProps) {
  const [tab, setTab] = useState<TabId>('work')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [settings, setSettings] = useState<BenchSettings | null>(null)
  const [lastReport, setLastReport] = useState<OcrReport | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [reloadTick, setReloadTick] = useState(0)
  const visibleRef = useRef(true)

  const refreshAll = useCallback(async () => {
    try {
      const [m, s, h] = await Promise.all([getMeta(), loadSettingsKv(), loadHistory()])
      setMeta(m)
      setSettings(s)
      setHistory(h)
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
          if (prev && prev.running && m && !m.running) setReloadTick((x) => x + 1) // 任务结束瞬间全量刷新
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
    <div className="ob-root">
      <style>{css}</style>
      <div className="ob-top">
        <div className="ob-logo">文</div>
        <div className="ob-tt">
          <b>文字识别台</b>
          <small>
            <span className={`ob-dot ${heartbeatOk ? 'ok' : heartbeatStale ? 'stale' : 'down'}`} />
            {meta
              ? (meta.degraded ? `服务降级：${meta.lastBridgeErr || '桥不可达'}` : `服务 ${meta.version} · 127.0.0.1:${meta.port} · 全本地零上传`)
              : '服务未连接（等待心跳；首次使用先确认插件已启用）'}
          </small>
        </div>
        {running && <span className="ob-run" title={running.current || ''}>⏳ {running.done}/{running.total} {running.current ? running.current.split('\\').pop() : ''}</span>}
        <div className="ob-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`ob-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="ob-body">
        {tab === 'work' && <WorkTab meta={meta} settings={settings} lastReport={lastReport} onRefresh={refreshAll} />}
        {tab === 'langs' && <LangsTab meta={meta} onRefresh={refreshAll} />}
        {tab === 'history' && <HistoryTab history={history} onOpenReport={setLastReport} onRefresh={refreshAll} />}
      </div>
    </div>
  )
}
