/**
 * 口袋主机面板外壳：头部（心跳）+ 五 Tab（概览 / 进程 / 端口 / 动态 / 设置）
 *
 * 数据源：cap.kv hostmon.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求；快照由后台服务单权威写入，手机/Web 打开同一面板
 * 看到的都是这台主机的实时状态（跨端一致性由 cap.kv 单事实库保证）。
 * 轮询：可见时每 5s 拉一次（快照 5s 落盘，节奏对齐），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, loadReadAt, markAllRead, heartbeatOf, type PanelData } from './model'
import OverviewTab from './OverviewTab'
import ProcTab from './ProcTab'
import PortTab from './PortTab'
import FeedTab from './FeedTab'
import SettingsTab from './SettingsTab'

const css = `
.ph-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ph-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ph-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ph-body::-webkit-scrollbar{width:9px;height:9px}
.ph-body::-webkit-scrollbar-track{background:transparent}
.ph-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ph-page{max-width:520px;margin:0 auto}

/* 头部 */
.ph-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ph-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2EA98C,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ph-tt{flex:1;min-width:0}
.ph-tt b{font-size:15px;display:block}
.ph-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ph-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ph-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ph-dot.stale{background:#D29922}
.ph-dot.down{background:#F85149}
.ph-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ph-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ph-tab:hover{color:#E6EAF2}
.ph-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ph-badge{position:absolute;top:0;right:1px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.ph-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ph-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2EA98C,#58A6FF);flex-shrink:0}
.ph-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ph-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ph-card-b{padding:11px 13px}
.ph-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ph-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ph-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ph-btn:hover{filter:brightness(1.1)}
.ph-btn:disabled{opacity:.45;cursor:not-allowed}
.ph-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ph-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ph-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ph-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ph-inp:focus{outline:none;border-color:#2b6cb0}
.ph-inp::placeholder{color:#4d5566}
.ph-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ph-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ph-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ph-toast.bad{border-color:#54262c;color:#FF8A9A}
.ph-toast-wrap{white-space:normal;max-height:130px;overflow-y:auto}

/* 概览 */
.ph-gauges{display:flex;gap:10px;margin:0 16px 10px}
.ph-gauge{flex:1;background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:12px 14px;min-width:0}
.ph-gauge.hot{border-color:#54262c}
.ph-gauge-warm{border-color:#4a3a18}
.ph-gv{font-size:26px;font-weight:700;line-height:1.1;display:flex;align-items:baseline;gap:3px}
.ph-gv small{font-size:12px;color:#8B95A7;font-weight:400}
.ph-gl{font-size:10.5px;color:#8B95A7;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.ph-gl b{color:#C9D1D9;font-size:11.5px}
.ph-spark{width:100%;height:34px;display:block;margin-top:6px}
.ph-diskrow{padding:8px 13px;border-top:1px solid #1d2330}
.ph-diskrow:first-child{border-top:none}
.ph-disk-h{display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:5px}
.ph-disk-h b{color:#E6EAF2}
.ph-disk-h span{color:#8B95A7}
.ph-track{height:6px;border-radius:3px;background:#1d2330;overflow:hidden}
.ph-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#2EA98C,#58A6FF)}
.ph-fill.warn{background:linear-gradient(90deg,#D29922,#E3B341)}
.ph-fill.hot{background:linear-gradient(90deg,#c93c37,#F85149)}
.ph-info{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:11.5px}
.ph-info dt{color:#5C6678;font-size:10.5px}
.ph-info dd{margin:0;color:#C9D1D9;word-break:break-all}
.ph-alertstrip{margin:0 16px 10px;padding:9px 13px;border-radius:11px;border:1px solid #54262c;background:rgba(248,81,73,.08);color:#FF8A9A;font-size:11.5px;line-height:1.6}
.ph-alertstrip.warm{border-color:#4a3a18;background:rgba(210,153,34,.08);color:#E3B341}

/* 表格（进程/端口） */
.ph-row{display:flex;align-items:center;gap:8px;padding:7px 13px;border-top:1px solid #1d2330;font-size:12px}
.ph-row:first-child{border-top:none}
.ph-row.hl{background:rgba(88,166,255,.07)}
.ph-row-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.ph-row-n small{color:#5C6678;font-weight:400;margin-left:6px}
.ph-row-v{color:#8B95A7;font-size:11px;white-space:nowrap}
.ph-confirm{display:flex;align-items:center;gap:8px;padding:8px 13px;background:#241318;border-top:1px solid #54262c;font-size:11.5px;color:#FF8A9A}
.ph-confirm b{flex:1;min-width:0}

/* 事件流 */
.ph-ev{border-left:2px solid #242C3A;padding:8px 12px;margin:0 16px 8px;background:#141821;border-radius:0 10px 10px 0}
.ph-ev-h{display:flex;align-items:center;gap:7px;font-size:11px;color:#5C6678}
.ph-ev-h b{font-size:10px;font-weight:700;white-space:nowrap}
.ph-ev-sum{font-size:12px;color:#C9D1D9;margin-top:3px;line-height:1.5}

/* 设置 */
.ph-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.ph-field:first-child{border-top:none}
.ph-field-l{flex:1;min-width:0}
.ph-field-l b{font-size:12.5px;display:block}
.ph-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ph-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ph-toggle.on{background:#2b6cb0}
.ph-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ph-toggle.on i{left:18px}
.ph-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.ph-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
`

type Tab = 'overview' | 'procs' | 'ports' | 'feed' | 'settings'

export type Toast = (msg: string, bad?: boolean) => void

export default function PocketHostPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<PanelData | null>(null)
  const [readAt, setReadAt] = useState(0)
  const [newCount, setNewCount] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean; wrap?: boolean } | null>(null)
  const readAtRef = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback<Toast>((msg, bad) => {
    setToast({ msg, bad, wrap: (msg || '').length > 46 })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async (): Promise<PanelData | null> => {
    try {
      const d = await loadPanelData(readAtRef.current)
      setData(d)
      setLoadErr('')
      setNewCount(d.newCount)
      return d
    } catch (e) {
      setLoadErr((e as Error).message)
      return null
    }
  }, [])

  const refreshReadAt = useCallback(async () => {
    const r = await loadReadAt().catch(() => 0)
    readAtRef.current = r
    setReadAt(r)
  }, [])

  useEffect(() => { refreshReadAt() }, [refreshReadAt])

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

  const markRead = useCallback(async () => {
    await markAllRead().catch(() => {})
    readAtRef.current = Date.now()
    setReadAt(readAtRef.current)
    setNewCount(0)
  }, [])

  const hb = heartbeatOf(data?.snap ?? null, data?.meta ?? null)

  return (
    <div className="ph-root">
      <style>{css}</style>
      <div className="ph-top">
        <div className="ph-logo">📟</div>
        <div className="ph-tt">
          <b>口袋主机</b>
          <small>
            <i className={`ph-dot ${hb.cls}`} />
            {hb.text}
          </small>
        </div>
        <div className="ph-tabs">
          {([
            ['overview', '概览'],
            ['procs', '进程'],
            ['ports', '端口'],
            ['feed', '动态'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`ph-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'feed' && newCount > 0 && <span className="ph-badge">{newCount > 99 ? '99+' : newCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="ph-body">
        <div className="ph-page">
          {loadErr && <div className="ph-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab data={data} reload={reload} showToast={showToast} goFeed={() => setTab('feed')} />}
          {tab === 'procs' && <ProcTab data={data} showToast={showToast} reload={reload} />}
          {tab === 'ports' && <PortTab data={data} showToast={showToast} reload={reload} />}
          {tab === 'feed' && (
            <FeedTab
              onSendToChat={onSendToChat}
              showToast={showToast}
              markRead={markRead}
              unread={newCount}
              reload={reload}
            />
          )}
          {tab === 'settings' && (
            <SettingsTab pluginId={pluginId} data={data} reload={reload} showToast={showToast} />
          )}
        </div>
      </div>
      {toast && (
        <div className={`ph-toast ${toast.bad ? 'bad' : ''} ${toast.wrap ? 'ph-toast-wrap' : ''}`}>{toast.msg}</div>
      )}
    </div>
  )
}
