/**
 * Panel.tsx —— 容器工作台面板外壳：引擎状态栏 + 六 Tab（容器/日志/资源/镜像/事件/诊断）
 * 样式：挂载时注入 <style>（dk- 前缀防泄漏；色值与 house 暗色面板族一致）。
 */
import { useCallback, useEffect, useState } from 'react'
import { api, EngineInfo, ServiceError, invalidateService } from './model'
import ContainersTab from './tabs/ContainersTab'
import LogsTab from './tabs/LogsTab'
import StatsTab from './tabs/StatsTab'
import ImagesTab from './tabs/ImagesTab'
import EventsTab from './tabs/EventsTab'
import DiagTab from './tabs/DiagTab'

const css = `
.dk-root{display:flex;flex-direction:column;height:100%;min-height:0;background:#10141c;color:#e6eaf2;font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:13px}
.dk-mono{font-family:Consolas,Menlo,'Courier New',monospace}
.dk-dim{color:#8b95a7}
.dk-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #242c3a;background:#12161f;flex:none}
.dk-dot{width:8px;height:8px;border-radius:50%;flex:none}
.dk-dot-ok{background:#3fb950}.dk-dot-bad{background:#f85149}.dk-dot-wait{background:#d29922}
.dk-tabs{display:flex;gap:2px;padding:6px 10px 0;border-bottom:1px solid #242c3a;background:#12161f;flex:none}
.dk-tab{padding:6px 14px;border:0;background:transparent;color:#8b95a7;cursor:pointer;font-size:13px;border-radius:6px 6px 0 0}
.dk-tab:hover{color:#cdd6e4;background:#161b22}
.dk-tab-on{color:#fff;background:#1c2940}
.dk-body{flex:1;min-height:0;overflow:auto}
.dk-pad{padding:12px 14px}
.dk-table{width:100%;border-collapse:collapse}
.dk-table th{text-align:left;padding:6px 8px;color:#8b95a7;font-weight:500;font-size:12px;border-bottom:1px solid #242c3a;white-space:nowrap}
.dk-table td{padding:7px 8px;border-bottom:1px solid #1b2230;vertical-align:top}
.dk-table tr:hover td{background:#141a26}
.dk-btn{padding:4px 10px;border:1px solid #2b3648;border-radius:6px;background:#161b22;color:#cdd6e4;cursor:pointer;font-size:12px}
.dk-btn:hover{background:#1c2940;color:#fff}
.dk-btn:disabled{opacity:.45;cursor:not-allowed}
.dk-btn-danger{border-color:#5c2329;color:#f28b93}
.dk-btn-danger:hover{background:#3a1418;color:#ffb3b8}
.dk-btn-sm{padding:2px 8px;font-size:11px}
.dk-chip{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;white-space:nowrap}
.dk-chip-run{background:#12261e;color:#3fb950}
.dk-chip-exit{background:#2a1e12;color:#d29922}
.dk-chip-dead{background:#2d1416;color:#f85149}
.dk-chip-other{background:#1a2130;color:#8b95a7}
.dk-input{padding:5px 10px;border:1px solid #242c3a;border-radius:6px;background:#161b22;color:#e6eaf2;outline:none;font-size:12px}
.dk-input:focus{border-color:#2b6cb0}
.dk-select{padding:4px 8px;border:1px solid #242c3a;border-radius:6px;background:#161b22;color:#e6eaf2;font-size:12px}
.dk-banner{display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding:14px;border:1px solid #2d3a4f;border-radius:8px;background:#131a26}
.dk-group{margin:10px 0 4px;padding:5px 10px;background:#161f2e;border-radius:6px;color:#9ecbff;font-size:12px;display:flex;gap:8px;align-items:center}
.dk-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:60}
.dk-modal{width:min(520px,92%);background:#151b26;border:1px solid #2b3648;border-radius:10px;padding:16px;max-height:80%;display:flex;flex-direction:column;gap:10px}
.dk-pre{background:#0d1117;border:1px solid #242c3a;border-radius:6px;padding:10px;overflow:auto;max-height:420px;white-space:pre-wrap;word-break:break-all;font-size:12px;margin:0}
.dk-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1c2940;border:1px solid #2b6cb0;color:#e6eaf2;padding:8px 16px;border-radius:8px;font-size:12px;z-index:80;max-width:80%}
.dk-toast-bad{border-color:#f85149;background:#2d1416}
.dk-err{color:#f28b93;white-space:pre-wrap}
.dk-kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:12px}
.dk-kv .k{color:#8b95a7}
.dk-logline{white-space:pre-wrap;word-break:break-all}
.dk-logerr{color:#f28b93}
.dk-logwrap{background:#0d1117;border:1px solid #242c3a;border-radius:6px;padding:8px 10px;overflow:auto;font-size:12px;flex:1;min-height:0}
.dk-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dk-grow{flex:1;min-width:0}
.dk-mt8{margin-top:8px}
.dk-ok{color:#3fb950}
.dk-small{font-size:11px}
`

export type TabKey = 'containers' | 'logs' | 'stats' | 'images' | 'events' | 'diag'

export interface PanelProps {
  pluginId?: string
  onSendToChat?: (msg: string) => void | Promise<void>
}

export interface Toast {
  text: string
  bad?: boolean
}

export interface ConfirmRequest {
  title: string
  /** 需要用户精确输入的名称（输入不一致则确认按钮禁用） */
  expect: string
  hint: string
  onConfirm: () => Promise<void>
}

export function stateChip(state: string): { cls: string; text: string } {
  if (state === 'running') return { cls: 'dk-chip-run', text: '运行中' }
  if (state === 'exited' || state === 'created') return { cls: 'dk-chip-exit', text: state === 'exited' ? '已退出' : '已创建' }
  if (state === 'dead') return { cls: 'dk-chip-dead', text: '僵死' }
  return { cls: 'dk-chip-other', text: state }
}

export default function Panel({ onSendToChat }: PanelProps) {
  const [tab, setTab] = useState<TabKey>('containers')
  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const [engineErr, setEngineErr] = useState<string>('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  const [logsTarget, setLogsTarget] = useState<string>('')

  const showToast = useCallback((text: string, bad = false) => {
    setToast({ text, bad })
    setTimeout(() => setToast(null), 2600)
  }, [])

  const refreshEngine = useCallback(async () => {
    try {
      const r = await api.engine()
      setEngine(r.engine)
      setEngineErr('')
    } catch (e) {
      const se = e as ServiceError
      setEngine(null)
      setEngineErr(se.message || String(e))
      if (se.kind === 'no-service' || se.kind === 'http') invalidateService()
    }
  }, [])

  useEffect(() => {
    refreshEngine()
    const t = setInterval(refreshEngine, 10000)
    return () => clearInterval(t)
  }, [refreshEngine])

  const jumpToLogs = useCallback((name: string) => {
    setLogsTarget(name)
    setTab('logs')
  }, [])

  const engineOk = engine?.status === 'ok'

  return (
    <div className="dk-root">
      <style>{css}</style>
      <div className="dk-bar">
        <span className={`dk-dot ${engine == null ? 'dk-dot-wait' : engineOk ? 'dk-dot-ok' : 'dk-dot-bad'}`} />
        <strong>容器工作台</strong>
        {engine == null
          ? <span className="dk-dim dk-err">{engineErr || '正在连接后台服务…'}</span>
          : engineOk
            ? (
              <span className="dk-dim">
                引擎 {engine.daemonVersion || '?'}（API {engine.apiVersion || '?'}）· {engine.endpoint?.target}
              </span>
            )
            : <span className="dk-err">{engine.error || 'Docker 未连接'}</span>}
        <span className="dk-grow" />
        {engineOk && engine?.runningContainers != null && (
          <span className="dk-dim dk-small">运行中 {engine.runningContainers}/{engine.totalContainers ?? '?'}</span>
        )}
      </div>
      <div className="dk-tabs">
        {([['containers', '容器'], ['logs', '日志'], ['stats', '资源'], ['images', '镜像'], ['events', '事件'], ['diag', '诊断']] as [TabKey, string][]).map(([k, label]) => (
          <button key={k} type="button" className={`dk-tab ${tab === k ? 'dk-tab-on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div className="dk-body">
        {!engineOk && tab !== 'diag' ? (
          <div className="dk-pad">
            <div className="dk-banner">
              <strong>Docker 引擎未连接</strong>
              <span className="dk-dim">{engine?.error || engineErr || '正在探测本机 Docker 引擎…'}</span>
              <span className="dk-dim dk-small">
                端点：{engine?.endpoint?.target || '—'} · 确认 Docker Desktop / Engine 已启动；未安装时可先看「诊断」页的指引。
              </span>
              <button type="button" className="dk-btn" onClick={() => setTab('diag')}>打开诊断页</button>
            </div>
          </div>
        ) : tab === 'containers' ? (
          <ContainersTab engineOk={engineOk} showToast={showToast} jumpToLogs={jumpToLogs} askConfirm={setConfirmReq} onMutated={refreshEngine} />
        ) : tab === 'logs' ? (
          <LogsTab engineOk={engineOk} initialTarget={logsTarget} showToast={showToast} onSendToChat={onSendToChat} />
        ) : tab === 'stats' ? (
          <StatsTab engineOk={engineOk} />
        ) : tab === 'images' ? (
          <ImagesTab engineOk={engineOk} showToast={showToast} askConfirm={setConfirmReq} onMutated={refreshEngine} />
        ) : tab === 'events' ? (
          <EventsTab engineOk={engineOk} />
        ) : (
          <DiagTab engine={engine} engineErr={engineErr} showToast={showToast} onRefresh={refreshEngine} />
        )}
      </div>
      {confirmReq && (
        <ConfirmModal req={confirmReq} close={() => setConfirmReq(null)} showToast={showToast} />
      )}
      {toast && <div className={`dk-toast ${toast.bad ? 'dk-toast-bad' : ''}`}>{toast.text}</div>}
    </div>
  )
}

function ConfirmModal({ req, close, showToast }: { req: ConfirmRequest; close: () => void; showToast: (t: string, bad?: boolean) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const match = text === req.expect
  return (
    <div className="dk-modal-mask" onClick={close}>
      <div className="dk-modal" onClick={(e) => e.stopPropagation()}>
        <strong>{req.title}</strong>
        <div className="dk-dim dk-small">{req.hint}</div>
        <input
          className="dk-input dk-mono"
          value={text}
          autoFocus
          placeholder={`输入 ${req.expect} 以确认`}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="dk-row">
          <span className="dk-grow" />
          <button type="button" className="dk-btn" onClick={close}>取消</button>
          <button
            type="button"
            className="dk-btn dk-btn-danger"
            disabled={!match || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await req.onConfirm()
                close()
              } catch (e) {
                showToast((e as Error).message || '操作失败', true)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? '执行中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
