/**
 * 行情哨兵面板外壳：头部（服务状态/数据源）+ 三 Tab（行情 / 提醒 / 设置）
 *
 * 数据源：cap.kv qsent.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；外网抓取由后台服务原生执行（跨域问题的根本解法）。
 * 轮询：可见时每 5s 拉一次快照（keys + 并行 get），后台自动暂停。
 */
import { useCallback, useEffect, useState } from 'react'
import { loadSnapshot, loadReadAt, type Snapshot } from './model'
import MarketTab from './MarketTab'
import AlertsTab from './AlertsTab'
import SettingsTab from './SettingsTab'

const css = `
.qs-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qs-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qs-body{flex:1;overflow-y:auto;padding:0 0 20px}
.qs-body::-webkit-scrollbar{width:9px;height:9px}
.qs-body::-webkit-scrollbar-track{background:transparent}
.qs-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

/* 头部 */
.qs-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.qs-ttrow{display:flex;align-items:center;gap:10px}
.qs-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C2410C,#F85149);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qs-tt{flex:1;min-width:0}
.qs-tt b{font-size:15px;display:block}
.qs-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;flex-wrap:wrap}
.qs-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.qs-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.qs-dot.stale{background:#D29922}
.qs-dot.down{background:#F85149}
.qs-tabs{display:flex;gap:4px;margin-top:9px}
.qs-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer;position:relative}
.qs-tab:hover{color:#E6EAF2}
.qs-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qs-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 指数条 */
.qs-idx{display:flex;gap:8px;overflow-x:auto;padding:2px 16px 8px}
.qs-idx-chip{background:#161B22;border:1px solid #242C3A;border-radius:10px;padding:6px 10px;flex-shrink:0;min-width:104px}
.qs-idx-chip .n{font-size:10px;color:#8B95A7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px}
.qs-idx-chip .v{font-size:13px;font-weight:700;white-space:nowrap}
.qs-idx-chip .p{font-size:10px;font-weight:600;white-space:nowrap}

/* 自选卡片 */
.qs-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 9px;overflow:hidden}
.qs-row{display:flex;align-items:center;gap:10px;padding:10px 13px;cursor:pointer;min-width:0}
.qs-row:hover{background:#1A2029}
.qs-name{min-width:0;flex:1}
.qs-name b{font-size:13px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qs-name small{color:#5C6678;font-size:10px}
.qs-price{text-align:right;flex-shrink:0}
.qs-price b{font-size:14.5px;display:block;font-variant-numeric:tabular-nums}
.qs-chg{font-size:10px;font-variant-numeric:tabular-nums}
.qs-bell{font-size:11px;color:#D29922;flex-shrink:0}
.qs-detail{border-top:1px solid #242C3A;padding:10px 13px;background:#12161E}
.qs-grid{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
.qs-formrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.qs-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;width:100%;min-width:0}
.qs-inp:focus{outline:none;border-color:#2b6cb0}
.qs-inp::placeholder{color:#4d5566}
.qs-inp.sm{width:90px;flex:none}
.qs-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px}
.qs-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.qs-btn:hover{filter:brightness(1.1)}
.qs-btn:disabled{opacity:.45;cursor:not-allowed}
.qs-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qs-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qs-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qs-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.qs-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qs-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F97316,#F85149);flex-shrink:0}
.qs-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qs-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.qs-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.qs-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qs-err{color:#F85149;font-size:11.5px;padding:2px 16px 8px}
.qs-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qs-toast.bad{border-color:#54262c;color:#FF8A9A}
.qs-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#F97316;border-radius:50%;animation:qs-spin .8s linear infinite;vertical-align:-1px}
@keyframes qs-spin{to{transform:rotate(360deg)}}
.qs-foot{text-align:center;color:#454E5E;font-size:9.5px;padding:6px 16px 10px}
`

type Tab = 'market' | 'alerts' | 'settings'

export default function Panel({ pluginId }: { pluginId: string }) {
  const [tab, setTab] = useState<Tab>('market')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const showToast = useCallback((text: string, bad?: boolean) => {
    setToast({ text, bad })
    setTimeout(() => setToast((cur) => (cur && cur.text === text ? null : cur)), 2600)
  }, [])

  const reload = useCallback(async () => {
    try {
      const readAt = await loadReadAt()
      const s = await loadSnapshot(readAt)
      setSnap(s)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }, [showToast])

  useEffect(() => {
    let timer: number | undefined
    let stopped = false
    const loop = async () => {
      if (!stopped && document.visibilityState === 'visible') await reload()
      if (!stopped) timer = window.setTimeout(loop, 5000)
    }
    loop()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [reload])

  const meta = snap?.meta
  const dotCls = !meta ? 'down'
    : meta.lastError ? 'stale'
      : meta.lastPollAt && Date.now() - meta.lastPollAt < Math.max((meta.pollSec || 30) * 2.5, 90) * 1000 ? 'ok' : 'stale'
  const newCount = snap?.newCount ?? 0

  return (
    <div className="qs-root">
      <style>{css}</style>
      <div className="qs-top">
        <div className="qs-ttrow">
          <div className="qs-logo">盤</div>
          <div className="qs-tt">
            <b>行情哨兵</b>
            <small>
              <span className={`qs-dot ${dotCls}`} />
              {meta
                ? `${meta.inSession ? '盘中' : '盘外'} · ${meta.lastSource || '无数据'} · ${meta.lastPollAt ? agoStr(meta.lastPollAt) : '未轮询'}${meta.lastError ? ` · ${meta.lastError}` : ''}`
                : '后台服务未连接'}
            </small>
          </div>
        </div>
        <div className="qs-tabs">
          {([['market', '行情'], ['alerts', '提醒'], ['settings', '设置']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} className={`qs-tab ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); if (t === 'alerts') void refreshRead(snap, setSnap) }}>
              {label}
              {t === 'alerts' && newCount > 0 && <span className="qs-badge">{newCount > 99 ? '99+' : newCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="qs-body">
        {tab === 'market' && <MarketTab snap={snap} busy={busy} setBusy={setBusy} reload={reload} showToast={showToast} />}
        {tab === 'alerts' && <AlertsTab snap={snap} reload={reload} showToast={showToast} />}
        {tab === 'settings' && <SettingsTab snap={snap} reload={reload} showToast={showToast} pluginId={pluginId} />}
        <div className="qs-foot">行情数据来自公开接口，可能有延迟或错误 · 仅供个人参考，非投资建议</div>
      </div>
      {toast && <div className={`qs-toast ${toast.bad ? 'bad' : ''}`}>{toast.text}</div>}
    </div>
  )
}

function agoStr(ts: number): string {
  const d = Date.now() - ts
  if (d < 15 * 1000) return '刚刚更新'
  if (d < 60 * 1000) return `${Math.floor(d / 1000)} 秒前更新`
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前更新`
  return `${Math.floor(d / 3600000)} 小时前更新`
}

/** 进入提醒页即把当前最新触发标为已读 */
async function refreshRead(snap: Snapshot | null, setSnap: (s: Snapshot) => void) {
  if (!snap) return
  const latest = snap.feed.reduce((m, f) => Math.max(m, f.at || 0), 0)
  if (latest <= 0) return
  const readAt = await import('./model').then((m) => m.loadReadAt())
  if (latest > readAt) {
    const { markFeedRead } = await import('./model')
    await markFeedRead(latest)
    setSnap({ ...snap, newCount: 0 })
  }
}
