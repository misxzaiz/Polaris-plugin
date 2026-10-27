/**
 * 网页哨兵面板外壳：头部（状态/心跳）+ 三 Tab（监控 / 动态 / 设置）
 *
 * 数据源：cap.kv sentinel.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；外网抓取由后台服务原生执行（跨域问题的根本解法）。
 * 轮询：可见时每 5s 拉一次快照（keys + 并行 get），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadSnapshot, loadReadAt, kvSet, K,
  type Snapshot,
} from './model'
import WatchTab from './WatchTab'
import FeedTab from './FeedTab'
import SettingsTab from './SettingsTab'

const css = `
.ps-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ps-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ps-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ps-body::-webkit-scrollbar{width:9px;height:9px}
.ps-body::-webkit-scrollbar-track{background:transparent}
.ps-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ps-page{max-width:520px;margin:0 auto}

/* 头部 */
.ps-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ps-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2EA98C,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ps-tt{flex:1;min-width:0}
.ps-tt b{font-size:15px;display:block}
.ps-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ps-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ps-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ps-dot.stale{background:#D29922}
.ps-dot.down{background:#F85149}
.ps-tabs{display:flex;gap:4px}
.ps-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.ps-tab:hover{color:#E6EAF2}
.ps-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ps-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.ps-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ps-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ps-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2EA98C,#58A6FF);flex-shrink:0}
.ps-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ps-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ps-card-b{padding:11px 13px}
.ps-card-b b{font-size:13px}
.ps-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ps-url{font-size:10.5px;color:#5C6678;word-break:break-all;line-height:1.5}
.ps-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ps-badge-txt{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.ps-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ps-btn:hover{filter:brightness(1.1)}
.ps-btn:disabled{opacity:.45;cursor:not-allowed}
.ps-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ps-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ps-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ps-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ps-inp:focus{outline:none;border-color:#2b6cb0}
.ps-inp::placeholder{color:#4d5566}
.ps-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.ps-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.ps-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ps-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ps-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ps-toast.bad{border-color:#54262c;color:#FF8A9A}
.ps-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:ps-spin .8s linear infinite;vertical-align:-1px}
@keyframes ps-spin{to{transform:rotate(360deg)}}

/* 状态行 */
.ps-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.ps-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.ps-kv{color:#5C6678}
.ps-kv b{color:#B4B4B8;font-weight:600}

/* diff */
.ps-diff{background:#0d1017;border:1px solid #212836;border-radius:8px;padding:7px 0;margin-top:8px;font:11px/1.6 Consolas,Menlo,monospace;overflow-x:auto;max-height:260px;overflow-y:auto}
.ps-dl{padding:0 10px;white-space:pre-wrap;word-break:break-all}
.ps-dl.add{color:#3FB950;background:rgba(63,185,80,.08)}
.ps-dl.del{color:#F85149;background:rgba(248,81,73,.08)}
.ps-dl.fold{color:#4d5566}
.ps-dl.ctx{color:#7d8590}

/* 事件流 */
.ps-ev{border-left:2px solid #242C3A;padding:8px 12px 8px 12px;margin:0 16px 8px;background:#141821;border-radius:0 10px 10px 0}
.ps-ev-h{display:flex;align-items:center;gap:7px;font-size:11px;color:#5C6678}
.ps-ev-h b{color:#E6EAF2;font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-ev-sum{font-size:12px;color:#C9D1D9;margin-top:3px;line-height:1.5}

/* 设置 */
.ps-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.ps-field:first-child{border-top:none}
.ps-field-l{flex:1;min-width:0}
.ps-field-l b{font-size:12.5px;display:block}
.ps-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ps-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ps-toggle.on{background:#2b6cb0}
.ps-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ps-toggle.on i{left:18px}
.ps-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`

type Tab = 'watch' | 'feed' | 'settings'

export default function SentinelPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('watch')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [readAt, setReadAt] = useState(0)
  const [newCount, setNewCount] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const readAtRef = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<Snapshot | null> => {
    try {
      const s = await loadSnapshot(readAtRef.current)
      setSnap(s)
      setLoadErr('')
      setNewCount(s.newCount)
      return s
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

  useEffect(() => {
    refreshReadAt()
  }, [refreshReadAt])

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
    const now = Date.now()
    await kvSet(K.readAt, now).catch(() => {})
    readAtRef.current = now
    setReadAt(now)
    setNewCount(0)
  }, [])

  // 心跳判定：meta.lastTickAt 2 分钟内 = 运行中；有目标无 meta = 服务未报告；超时 = 心跳停滞
  const heartbeat = (() => {
    if (!snap) return { cls: '', text: '载入中…' }
    const last = snap.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳' }
    const age = Date.now() - last
    if (age < 120 * 1000) return { cls: 'ok', text: `哨兵在线 · 桥 ${snap.meta?.bridge || '?'}` }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  return (
    <div className="ps-root">
      <style>{css}</style>
      <div className="ps-top">
        <div className="ps-logo">🛡️</div>
        <div className="ps-tt">
          <b>网页哨兵</b>
          <small>
            <i className={`ps-dot ${heartbeat.cls}`} />
            {heartbeat.text}
          </small>
        </div>
        <div className="ps-tabs">
          {([
            ['watch', '监控'],
            ['feed', '动态'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`ps-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'feed' && newCount > 0 && <span className="ps-badge">{newCount > 99 ? '99+' : newCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="ps-body">
        <div className="ps-page">
          {loadErr && <div className="ps-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'watch' && (
            <WatchTab snap={snap} reload={reload} showToast={showToast} markRead={markRead} goFeed={() => setTab('feed')} />
          )}
          {tab === 'feed' && (
            <FeedTab onSendToChat={onSendToChat} showToast={showToast} markRead={markRead} unread={newCount} />
          )}
          {tab === 'settings' && (
            <SettingsTab pluginId={pluginId} snap={snap} reload={reload} showToast={showToast} />
          )}
        </div>
      </div>
      {toast && <div className={`ps-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
