/**
 * 定时任务台面板外壳：头部（心跳）+ 三 Tab（任务 / 历史 / 设置）
 *
 * 数据源：cap.kv taskrun.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络、零 fs——执行全部在后台服务；手机/Web 打开同一面板看到
 * 的是这台机器的调度状态（cap.kv 单事实库三端一致）。
 * 轮询：可见时每 6s 拉一次，后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadJobs, loadMeta, loadRuns, loadSettings, loadProviders,
  type Toast, type Meta,
} from './model'
import { type PanelData } from './ui'
import JobsTab from './JobsTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.tr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.tr-body::-webkit-scrollbar{width:9px;height:9px}
.tr-body::-webkit-scrollbar-track{background:transparent}
.tr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.tr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.tr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5865F2,#2EA97C);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.tr-tt{flex:1;min-width:0}
.tr-tt b{font-size:15px;display:block}
.tr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.tr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.tr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.tr-dot.stale{background:#D29922}
.tr-dot.down{background:#F85149}
.tr-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.tr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.tr-tab:hover{color:#E6EAF2}
.tr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.tr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.tr-card-b{padding:11px 13px}
.tr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.tr-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.tr-tag.ok{color:#3FB950;border-color:#245c37}
.tr-tag.fail{color:#F85149;border-color:#54262c}
.tr-tag.timeout{color:#D29922;border-color:#4a3a15}
.tr-tag.missed{color:#D29922;border-color:#4a3a15}
.tr-tag.manual{color:#58A6FF;border-color:#1f4a6e}
.tr-tag.warn{color:#D29922;border-color:#4a3a15}
.tr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.tr-btn:hover{filter:brightness(1.1)}
.tr-btn:disabled{opacity:.45;cursor:not-allowed}
.tr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.tr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.tr-btn.ok{background:#1e3a2a;color:#3FB950;border:1px solid #2a5c3f}
.tr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.tr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.tr-inp:focus{outline:none;border-color:#2b6cb0}
.tr-inp::placeholder{color:#4d5566}
.tr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px;cursor:pointer}
.tr-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.tr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.tr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.tr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;max-width:92%}
.tr-toast.bad{border-color:#54262c;color:#FF8A9A}
.tr-toast-wrap{white-space:normal;max-height:150px;overflow-y:auto;word-break:break-all}
.tr-check{accent-color:#2b6cb0;cursor:pointer}
.tr-kbd{background:#12151c;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;font-family:Consolas,monospace;font-size:10.5px}
`

export type TabKey = 'jobs' | 'history' | 'settings'

function metaAlive(meta: Meta | null): 'ok' | 'stale' | 'down' {
  if (!meta || !meta.lastTickAt) return 'down'
  return Date.now() - meta.lastTickAt < 90 * 1000 ? 'ok' : 'stale'
}

export default function TaskRunnerPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState<TabKey>('jobs')
  const [data, setData] = useState<PanelData>({ meta: null, jobs: [], runs: [], settings: null, providers: [] })
  const [toast, setToast] = useState<Toast | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const toastTimer = useRef<number | null>(null)

  const notify = useCallback((text: string, bad?: boolean) => {
    setToast({ text, bad })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), bad ? 6000 : 3200)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [meta, jobs, runs, settings, providers] = await Promise.all([
        loadMeta(), loadJobs(), loadRuns(60), loadSettings(), loadProviders(),
      ])
      setData({ meta, jobs, runs, settings, providers })
      setLoadErr('')
    } catch (e) {
      setLoadErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    let stop = false
    let timer = 0
    const loop = async () => {
      if (stop) return
      if (document.visibilityState === 'visible') await refresh()
      if (!stop) timer = window.setTimeout(loop, 6000)
    }
    loop()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [refresh])

  const alive = metaAlive(data.meta)

  return (
    <div className="tr-root">
      <style>{css}</style>
      <div className="tr-top">
        <div className="tr-logo">⏰</div>
        <div className="tr-tt">
          <b>定时任务台</b>
          <small>
            <span className={`tr-dot ${alive}`} />
            {alive === 'ok' ? `服务运行中 · ${data.meta?.enabledCount ?? 0}/${data.meta?.jobCount ?? 0} 启用` : '服务未运行（设置页可查）'}
            {data.meta?.degraded ? ' · 桥降级' : ''}
          </small>
        </div>
        <div className="tr-tabs">
          {([['jobs', '任务'], ['history', '历史'], ['settings', '设置']] as [TabKey, string][]).map(([k, label]) => (
            <button key={k} className={`tr-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="tr-body">
        {loadErr ? <div className="tr-err">加载失败：{loadErr}</div> : null}
        {tab === 'jobs' && <JobsTab data={data} notify={notify} refresh={refresh} />}
        {tab === 'history' && <HistoryTab runs={data.runs} jobs={data.jobs} />}
        {tab === 'settings' && <SettingsTab data={data} notify={notify} refresh={refresh} />}
      </div>
      {toast ? (
        <div className={`tr-toast ${toast.bad ? 'bad' : ''}`}>
          <div className="tr-toast-wrap">{toast.text}</div>
        </div>
      ) : null}
    </div>
  )
}
