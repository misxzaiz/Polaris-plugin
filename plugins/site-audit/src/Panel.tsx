/**
 * 站点体检台面板外壳：头部（服务心跳 + 运行态）+ 3 Tab（体检 / 报告 / 历史）
 *
 * 数据源分层：
 * - cap.kv site-audit.*（宿主 invoke → router_dispatch）：meta 引导 / 历史 / 报告（跨端可读）
 * - 127.0.0.1:<meta.port> 直连自家服务（token）：发起/停止/实时进度（desktop-first）
 * 轮询纪律：可见时才拉；meta 心跳 3s；体检进行中的实时数据由 WorkTab 自轮询（800ms）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getMeta, loadHistory, loadSettingsKv, loadReport,
  type AuditReport, type AuditSettings, type HistoryEntry, type ServiceMeta,
} from './model'
import WorkTab from './WorkTab'
import { ReportView } from './ReportTab'
import HistoryTab from './HistoryTab'

const css = `
.sa-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sa-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sa-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sa-body::-webkit-scrollbar{width:9px;height:9px}
.sa-body::-webkit-scrollbar-track{background:transparent}
.sa-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sa-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.sa-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2B6CB0,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.sa-tt{flex:1;min-width:0}
.sa-tt b{font-size:15px;display:block}
.sa-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.sa-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.sa-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.sa-dot.stale{background:#D29922}
.sa-dot.down{background:#F85149}
.sa-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.sa-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.sa-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.sa-tab:hover{color:#E6EAF2}
.sa-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sa-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sa-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2B6CB0,#3FB950);flex-shrink:0}
.sa-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400;text-align:right}
.sa-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sa-card-b{padding:11px 13px}
.sa-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.sa-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.sa-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.sa-btn:hover{filter:brightness(1.1)}
.sa-btn:disabled{opacity:.45;cursor:not-allowed}
.sa-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.sa-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.sa-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.sa-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.sa-inp:focus{outline:none;border-color:#2b6cb0}
.sa-inp::placeholder{color:#4d5566}
.sa-inp:disabled{opacity:.6}
.sa-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.sa-sel:disabled{opacity:.6}
.sa-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.sa-err{color:#F85149;font-size:11.5px;padding:8px 0 0;word-break:break-all}
.sa-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.sa-ok{color:#3FB950}
.sa-mono{font-family:Consolas,Menlo,monospace}
.sa-num{font-family:Consolas,Menlo,monospace}
.sa-row{padding:9px 13px;border-top:1px solid #1d2330}
.sa-row:hover{background:#12151c}
.sa-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sa-muted{color:#5C6678}
.sa-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.sa-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.sa-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.sa-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.sa-badge.info{background:#12233b;color:#58A6FF;border:1px solid #1f3a5f}
.sa-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.sa-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.sa-sum b{font-size:19px;display:block;line-height:1.2}
.sa-sum small{color:#8B95A7;font-size:9.5px}
.sa-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:0 0 8px}
.sa-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2B6CB0,#3FB950);border-radius:3px;transition:width .5s}
.sa-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.sa-kv dt{color:#5C6678;white-space:nowrap}
.sa-kv dd{margin:0;word-break:break-all}
table.sa-tb{width:100%;border-collapse:collapse;font-size:11.5px}
table.sa-tb th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
table.sa-tb td{padding:6px 8px;border-top:1px solid #1d2330;white-space:nowrap}
.sa-fmrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.sa-fmgrid{display:grid;grid-template-columns:auto 1fr;gap:7px 10px;align-items:center;font-size:11.5px;margin:8px 0}
.sa-fmgrid label{color:#8B95A7;white-space:nowrap}
.sa-unitwrap{display:flex;align-items:center;gap:6px}
.sa-unitwrap>span{color:#5C6678;font-size:10.5px;white-space:nowrap}
.sa-btnrow{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.sa-chiprow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sa-warncard{margin:10px 16px 0;padding:8px 12px;border:1px solid #4d4316;background:#2a2410;color:#E3B341;border-radius:10px;font-size:11.5px}
.sa-score{display:flex;align-items:center;gap:14px;padding:2px 0 4px}
.sa-ring{position:relative;width:74px;height:74px;flex-shrink:0}
.sa-ring svg{transform:rotate(-90deg)}
.sa-ring b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px}
.sa-issue{border-top:1px solid #1d2330}
.sa-issue:first-child{border-top:none}
.sa-issue-h{display:flex;align-items:center;gap:8px;padding:9px 13px;cursor:pointer;user-select:none}
.sa-issue-h:hover{background:#12151c}
.sa-issue-h b{font-size:12px}
.sa-issue-n{margin-left:auto;color:#5C6678;font-size:11px;white-space:nowrap}
.sa-issue-items{padding:0 13px 10px;display:flex;flex-direction:column;gap:6px}
.sa-issue-item{background:#12151c;border:1px solid #1d2330;border-radius:8px;padding:7px 9px;font-size:11px}
.sa-issue-item .sa-mono{word-break:break-all}
.sa-detail{color:#8B95A7;margin-top:2px;word-break:break-all}
.sa-src{color:#5C6678;margin-top:2px;word-break:break-all}
.sa-evrow{display:flex;gap:8px;font-size:11px;padding:3px 0;align-items:baseline}
`

type TabId = 'work' | 'report' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'work', label: '体检' },
  { id: 'report', label: '报告' },
  { id: 'history', label: '历史' },
]

export interface PanelProps {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function Panel(props: PanelProps) {
  const [tab, setTab] = useState<TabId>('work')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [settings, setSettings] = useState<AuditSettings | null>(null)
  const [report, setReport] = useState<AuditReport | null>(null)
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
        setReport(rep)
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

  /** 历史/完成回调：加载指定报告并切到报告 Tab */
  const openReport = useCallback(async (auditId: string | null | undefined) => {
    if (!auditId) return
    try {
      const rep = await loadReport(auditId)
      if (rep) setReport(rep)
      setTab('report')
    } catch { /* 加载失败保留当前 */ }
  }, [])

  const heartbeatOk = meta && !meta.degraded && Date.now() - new Date(meta.ts).getTime() < 130000
  const heartbeatStale = meta && !meta.degraded && !heartbeatOk
  const running = meta && meta.running

  return (
    <div className="sa-root">
      <style>{css}</style>
      <div className="sa-top">
        <div className="sa-logo">🌐</div>
        <div className="sa-tt">
          <b>站点体检台</b>
          <small>
            <span className={`sa-dot ${heartbeatOk ? 'ok' : heartbeatStale ? 'stale' : 'down'}`} />
            {meta
              ? (meta.degraded ? `服务降级：${meta.lastBridgeErr || '桥不可达'}` : `服务 ${meta.version} · 127.0.0.1:${meta.port}`)
              : '服务未连接（等待心跳；首次使用先确认插件已启用）'}
          </small>
        </div>
        {running && <span className="sa-run" title={running.seed}>⏳ {running.phase} {running.seed.slice(0, 32)}</span>}
        <div className="sa-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`sa-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="sa-body">
        {tab === 'work' && (
          <WorkTab
            meta={meta}
            settings={settings}
            lastReport={report}
            onRefresh={refreshAll}
            onOpenReport={openReport}
            onSendToChat={props.onSendToChat}
          />
        )}
        {tab === 'report' && (
          <>
            <div className="sa-sec"><span className="sa-bar" />体检报告<span className="sa-hint">{report ? `auditId=${report.auditId}` : '尚无报告'}</span></div>
            <ReportView report={report} onSendToChat={props.onSendToChat} />
          </>
        )}
        {tab === 'history' && <HistoryTab meta={meta} history={history} onRefresh={refreshAll} onView={openReport} />}
      </div>
    </div>
  )
}
