/**
 * 文件管家面板外壳：头部（心跳）+ 四 Tab（总览 / 规则 / 历史 / 设置）
 *
 * 数据源：cap.kv fileflow.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求、零 fs 访问——所有文件操作在后台原生服务执行；
 * 手机/Web 打开同一面板看到的是这台机器的整理状态（cap.kv 单事实库）。
 * 轮询：可见时每 6s 拉一次，后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, type PanelData, type Toast } from './model'
import OverviewTab from './OverviewTab'
import RulesTab from './RulesTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.ff-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ff-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ff-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ff-body::-webkit-scrollbar{width:9px;height:9px}
.ff-body::-webkit-scrollbar-track{background:transparent}
.ff-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

/* 头部 */
.ff-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ff-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2EA97C,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ff-tt{flex:1;min-width:0}
.ff-tt b{font-size:15px;display:block}
.ff-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ff-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ff-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ff-dot.stale{background:#D29922}
.ff-dot.down{background:#F85149}
.ff-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ff-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ff-tab:hover{color:#E6EAF2}
.ff-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* 通用 */
.ff-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ff-card-b{padding:11px 13px}
.ff-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ff-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ff-tag.warn{color:#D29922;border-color:#4a3a15}
.ff-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ff-btn:hover{filter:brightness(1.1)}
.ff-btn:disabled{opacity:.45;cursor:not-allowed}
.ff-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ff-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ff-btn.ok{background:#1e3a2a;color:#3FB950;border:1px solid #2a5c3f}
.ff-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ff-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ff-inp:focus{outline:none;border-color:#2b6cb0}
.ff-inp::placeholder{color:#4d5566}
.ff-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px;cursor:pointer}
.ff-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ff-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ff-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;max-width:92%}
.ff-toast.bad{border-color:#54262c;color:#FF8A9A}
.ff-toast-wrap{white-space:normal;max-height:150px;overflow-y:auto;word-break:break-all}

/* 行 */
.ff-row{display:flex;align-items:center;gap:8px}
.ff-grow{flex:1;min-width:0}
.ff-mono{font-family:Consolas,Menlo,monospace;font-size:11px;color:#C9D1D9;word-break:break-all}
.ff-dim{color:#5C6678}

/* 根目录卡 */
.ff-root-card{border-top:1px solid #1d2330}
.ff-root-h{display:flex;align-items:center;gap:8px;padding:10px 13px 6px}
.ff-root-h b{font-size:13px}
.ff-root-path{font-family:Consolas,Menlo,monospace;font-size:10.5px;color:#5C6678;padding:0 13px;word-break:break-all}
.ff-root-stats{display:flex;gap:6px;padding:6px 13px 10px;flex-wrap:wrap}
.ff-stat{background:#12151c;border:1px solid #1d2330;border-radius:9px;padding:6px 10px;min-width:74px}
.ff-stat b{font-size:14px;display:block}
.ff-stat small{font-size:9.5px;color:#8B95A7}

/* 计划预览弹层 */
.ff-modal{position:absolute;inset:0;background:rgba(8,10,14,.72);z-index:50;display:flex;align-items:flex-end;justify-content:center}
.ff-modal-in{background:#161B22;border:1px solid #242C3A;border-radius:14px 14px 0 0;width:100%;max-height:82%;display:flex;flex-direction:column}
.ff-modal-h{padding:12px 16px;border-bottom:1px solid #1d2330;display:flex;align-items:center;gap:8px}
.ff-modal-b{flex:1;overflow-y:auto;padding:10px 16px}
.ff-modal-f{padding:10px 16px;border-top:1px solid #1d2330;display:flex;gap:8px;align-items:center}
.ff-op{padding:6px 10px;border-radius:8px;background:#12151c;border:1px solid #1d2330;margin-bottom:6px;font-size:11px;line-height:1.6}
.ff-op.outside{border-color:#4a3a15;background:#1c1710}
.ff-op .ff-dim{font-size:10px}
.ff-chip{display:inline-block;background:#1C2330;border-radius:5px;padding:0 6px;font-size:9.5px;color:#8B95A7;margin-right:4px}

/* 规则 */
.ff-rule{padding:10px 13px;border-top:1px solid #1d2330}
.ff-rule-h{display:flex;align-items:center;gap:8px}
.ff-rule-h b{font-size:12.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-rule-sum{font-size:11px;color:#8B95A7;margin-top:3px;line-height:1.6}
.ff-toggle{width:34px;height:20px;border-radius:10px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ff-toggle.on{background:#2b6cb0}
.ff-toggle i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ff-toggle.on i{left:16px}
.ff-field{display:flex;align-items:center;gap:10px;padding:7px 13px;border-top:1px solid #1d2330}
.ff-field-l{flex:1;min-width:0}
.ff-field-l b{font-size:12.5px;display:block}
.ff-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ff-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 13px}
.ff-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 13px 8px}
.ff-lab{font-size:10.5px;color:#8B95A7;display:block;margin-bottom:3px}

/* 历史 */
.ff-batch{padding:10px 13px;border-top:1px solid #1d2330}
.ff-batch-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ff-batch-h b{font-size:11px;font-family:Consolas,Menlo,monospace}
.ff-batch-sum{font-size:11px;color:#C9D1D9;margin-top:3px}
.ff-ops{margin-top:6px;max-height:240px;overflow-y:auto}
`

type TabKey = 'overview' | 'rules' | 'history' | 'settings'

interface Props {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function FileFlowPanel(_props: Props) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [data, setData] = useState<PanelData | null>(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [stale, setStale] = useState(false)
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const d = await loadPanelData()
      setData(d)
      setStale(false)
      setErr('')
    } catch (e) {
      setStale(true)
      setErr(String((e as Error).message || e))
    }
  }, [])

  useEffect(() => {
    refresh()
    let timer: number | null = null
    const loop = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    timer = window.setInterval(loop, 6000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  const meta = data?.meta
  const bridge = meta?.bridge || 'down'
  const heartbeatOk = meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 3 * 60 * 1000
  const dotCls = bridge === 'ok' && heartbeatOk ? 'ok' : bridge === 'ok' ? 'stale' : 'down'

  return (
    <div className="ff-root">
      <style>{css}</style>
      <div className="ff-top">
        <div className="ff-logo">🗂</div>
        <div className="ff-tt">
          <b>文件管家</b>
          <small>
            <span className={`ff-dot ${dotCls}`} />
            {bridge === 'ok' ? (heartbeatOk ? '服务运行中' : '服务心跳滞后') : '服务离线/启动中'}
            <span className="ff-hint">v{data?.snapshot?.version || meta?.version || '0.1.0'}</span>
          </small>
        </div>
        <div className="ff-tabs">
          {([['overview', '总览'], ['rules', '规则'], ['history', '历史'], ['settings', '设置']] as [TabKey, string][]).map(([k, label]) => (
            <button key={k} className={`ff-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="ff-body">
        {err && <div className="ff-err">{err}</div>}
        {!data && !err && <div className="ff-empty">加载中…</div>}
        {data && (
          <>
            {tab === 'overview' && <OverviewTab data={data} refresh={refresh} showToast={showToast} />}
            {tab === 'rules' && <RulesTab data={data} refresh={refresh} showToast={showToast} />}
            {tab === 'history' && <HistoryTab refresh={refresh} showToast={showToast} />}
            {tab === 'settings' && <SettingsTab data={data} refresh={refresh} showToast={showToast} />}
          </>
        )}
        {stale && data && <div className="ff-sub" style={{ padding: '0 16px 8px', color: '#D29922' }}>上次刷新失败，显示的是缓存数据（服务可能在重启）</div>}
      </div>

      {toast && (
        <div className={`ff-toast ${toast.bad ? 'bad' : ''}`}>
          <div className="ff-toast-wrap">{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
