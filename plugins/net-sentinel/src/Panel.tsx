/**
 * 网络哨兵面板外壳：头部（心跳）+ 四 Tab（概览 / 历史 / 动态 / 设置）
 *
 * 数据源：cap.kv netmon.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求（探测在后台原生服务执行）；快照由后台服务单权威写入，
 * 手机/Web 打开同一面板看到的都是这台机器所在网络的实时状态
 * （跨端一致性由 cap.kv 单事实库保证）。
 * 轮询：可见时每 5s 拉一次快照，后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, loadReadAt, markAllRead, heartbeatOf, type PanelData } from './model'
import OverviewTab from './OverviewTab'
import HistoryTab from './HistoryTab'
import FeedTab from './FeedTab'
import SettingsTab from './SettingsTab'

const css = `
.ns-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ns-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ns-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ns-body::-webkit-scrollbar{width:9px;height:9px}
.ns-body::-webkit-scrollbar-track{background:transparent}
.ns-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ns-page{max-width:560px;margin:0 auto}

/* 头部 */
.ns-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ns-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7C5CFF,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ns-tt{flex:1;min-width:0}
.ns-tt b{font-size:15px;display:block}
.ns-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ns-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ns-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ns-dot.stale{background:#D29922}
.ns-dot.down{background:#F85149}
.ns-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ns-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ns-tab:hover{color:#E6EAF2}
.ns-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ns-badge{position:absolute;top:0;right:1px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.ns-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ns-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ns-card-b{padding:11px 13px}
.ns-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ns-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ns-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ns-btn:hover{filter:brightness(1.1)}
.ns-btn:disabled{opacity:.45;cursor:not-allowed}
.ns-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ns-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ns-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ns-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ns-inp:focus{outline:none;border-color:#2b6cb0}
.ns-inp::placeholder{color:#4d5566}
.ns-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ns-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ns-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ns-toast.bad{border-color:#54262c;color:#FF8A9A}
.ns-toast-wrap{white-space:normal;max-height:130px;overflow-y:auto}
.ns-confirm{display:flex;align-items:center;gap:8px;padding:8px 13px;background:#241318;border-top:1px solid #54262c;font-size:11.5px;color:#FF8A9A}
.ns-confirm b{flex:1;min-width:0}

/* 事件流 */
.ns-ev{border-left:2px solid #242C3A;padding:8px 12px;margin:0 16px 8px;background:#141821;border-radius:0 10px 10px 0}
.ns-ev-h{display:flex;align-items:center;gap:7px;font-size:11px;color:#5C6678}
.ns-ev-h b{font-size:10px;font-weight:700;white-space:nowrap}
.ns-ev-sum{font-size:12px;color:#C9D1D9;margin-top:3px;line-height:1.5}

/* 设置 */
.ns-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.ns-field:first-child{border-top:none}
.ns-field-l{flex:1;min-width:0}
.ns-field-l b{font-size:12.5px;display:block}
.ns-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ns-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ns-toggle.on{background:#2b6cb0}
.ns-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ns-toggle.on i{left:18px}
.ns-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.ns-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
.ns-select{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`

type Tab = 'overview' | 'history' | 'feed' | 'settings'

export type Toast = (msg: string, bad?: boolean) => void

export default function NetSentinelPanel({ pluginId, onSendToChat }: {
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
    <div className="ns-root">
      <style>{css}</style>
      <div className="ns-top">
        <div className="ns-logo">📡</div>
        <div className="ns-tt">
          <b>网络哨兵</b>
          <small>
            <i className={`ns-dot ${hb.state}`} />
            {hb.text}
          </small>
        </div>
        <div className="ns-tabs">
          {([
            ['overview', '概览'],
            ['history', '历史'],
            ['feed', '动态'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`ns-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'feed' && newCount > 0 && <span className="ns-badge">{newCount > 99 ? '99+' : newCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="ns-body">
        <div className="ns-page">
          {loadErr && <div className="ns-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab data={data} goHistory={() => setTab('history')} goFeed={() => setTab('feed')} />}
          {tab === 'history' && <HistoryTab data={data} />}
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
        <div className={`ns-toast ${toast.bad ? 'bad' : ''} ${toast.wrap ? 'ns-toast-wrap' : ''}`}>{toast.msg}</div>
      )}
    </div>
  )
}
