/**
 * SQLite 检查台面板外壳：头部（服务状态/meta）+ 待确认写横幅 + 五 Tab
 * （库雷达 / 数据浏览 / SQL 查询 / 维护 / 设置）
 *
 * 双平面数据源：cap.kv（跨端清单/审计/待确认单）+ 127.0.0.1:<port> 直连服务
 * （雷达/浏览/查询，桌面优先）。可见时每 5s 轮询 meta（轻量，含待确认单列表）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadMeta, svcFetch, serviceAction, withSvc, timeAgo,
  type MetaReply, type PendingWrite, type ServiceMeta, type LibEntry,
} from './model'
import RadarTab from './RadarTab'
import BrowseTab from './BrowseTab'
import QueryTab from './QueryTab'
import MaintainTab from './MaintainTab'
import SettingsTab from './SettingsTab'

const css = `
.sl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sl-body::-webkit-scrollbar{width:9px;height:9px}
.sl-body::-webkit-scrollbar-track{background:transparent}
.sl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.sl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.sl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4493F8,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.sl-tt{flex:1;min-width:0}
.sl-tt b{font-size:15px;display:block}
.sl-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.sl-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.sl-dot.stale{background:#D29922}
.sl-dot.down{background:#F85149}
.sl-tabs{display:flex;gap:4px;overflow-x:auto;max-width:60%}
.sl-tabs::-webkit-scrollbar{display:none}
.sl-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative;white-space:nowrap;flex-shrink:0}
.sl-tab:hover{color:#E6EAF2}
.sl-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sl-tab .sl-pend{position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:#F85149}

.sl-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sl-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#4493F8,#3FB950);flex-shrink:0}
.sl-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sl-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sl-card-b{padding:11px 13px}
.sl-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.sl-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.sl-badge{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.sl-badge.warn{background:rgba(210,153,34,.12);color:#D29922;border-color:#5a4316}
.sl-badge.bad{background:rgba(248,81,73,.1);color:#F85149;border-color:#54262c}
.sl-badge.good{background:rgba(63,185,80,.1);color:#3FB950;border-color:#2a5a38}
.sl-badge.info{background:rgba(68,147,248,.12);color:#4493F8;border-color:#274a77}

.sl-btn{background:#1C2330;border:1px solid #2A3244;color:#E6EAF2;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;transition:background .15s}
.sl-btn:hover{background:#232B3B}
.sl-btn:disabled{opacity:.45;cursor:not-allowed}
.sl-btn.primary{background:linear-gradient(135deg,#275A9E,#1F6F45);border-color:#2F5F8F}
.sl-btn.primary:hover{filter:brightness(1.12)}
.sl-btn.danger{background:rgba(248,81,73,.12);border-color:#54262c;color:#F85149}
.sl-btn.sm{padding:3px 9px;font-size:11px;border-radius:6px}

.sl-inp{background:#0F131A;border:1px solid #242C3A;border-radius:8px;color:#E6EAF2;padding:6px 10px;font-size:12px;outline:none;width:100%}
.sl-inp:focus{border-color:#31608F}
.sl-inp.mono{font-family:ui-monospace,Consolas,monospace}
textarea.sl-inp{resize:vertical;min-height:110px;line-height:1.5}

.sl-empty{padding:26px 16px;text-align:center;color:#5C6678;font-size:12px}
.sl-err{background:rgba(248,81,73,.08);border:1px solid #54262c;color:#F85149;border-radius:9px;padding:8px 12px;font-size:12px;margin:0 16px 10px;word-break:break-all}

.sl-row{display:flex;align-items:center;gap:8px;min-width:0}
.sl-grow{flex:1;min-width:0}
.sl-lib-pick{display:flex;gap:6px;align-items:center;padding:0 16px 8px;flex-wrap:wrap}
.sl-pill{background:#1C2330;border:1px solid #242C3A;border-radius:20px;padding:3px 11px;font-size:11px;cursor:pointer;color:#8B95A7;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.sl-pill.on{border-color:#31608F;color:#E6EAF2;background:#16283C}
.sl-grid{width:100%;border-collapse:collapse;font-size:11.5px;font-family:ui-monospace,Consolas,monospace}
.sl-grid th{position:sticky;top:0;background:#141922;color:#8B95A7;text-align:left;padding:6px 9px;border-bottom:1px solid #242C3A;cursor:pointer;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.sl-grid td{padding:5px 9px;border-bottom:1px solid #1B2029;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C9D1D9}
.sl-grid tr:hover td{background:#171E2A}
.sl-null{color:#4A5262;font-style:italic}
.sl-blob{color:#BC8CFF;font-size:10px}
.sl-trunc{color:#D29922;font-size:9.5px;margin-left:4px}
.sl-pend-banner{margin:0 16px 10px;background:rgba(210,153,34,.07);border:1px solid #5a4316;border-radius:11px;padding:10px 12px}
.sl-pend-banner b{color:#D29922}
.sl-kv{display:flex;gap:8px;font-size:11.5px;padding:3px 0;align-items:baseline}
.sl-kv .k{color:#8B95A7;flex-shrink:0;min-width:88px}
.sl-kv .v{color:#C9D1D9;word-break:break-all;font-family:ui-monospace,Consolas,monospace}
.sl-mono{font-family:ui-monospace,Consolas,monospace}
`

export type TabKey = 'radar' | 'browse' | 'query' | 'maintain' | 'settings'

interface PanelProps { pluginId: string; onSendToChat?: (message: string) => void | Promise<void> }

export default function SqliteLensPanel(_props: PanelProps) {
  const [tab, setTab] = useState<TabKey>('radar')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [reply, setReply] = useState<MetaReply | null>(null)
  const [bootErr, setBootErr] = useState('')
  const [starting, setStarting] = useState(false)
  const visibleRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const m = await loadMeta()
      setMeta(m)
      if (m) {
        const r = await svcFetch<MetaReply>(m, '/api/meta')
        if (r && r.ok) { setReply(r); setBootErr('') }
        else setBootErr(r && r.error ? r.error : 'meta 返回异常')
      }
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    const onVis = () => { visibleRef.current = document.visibilityState === 'visible' }
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(() => { if (visibleRef.current) refresh() }, 5000)
    refresh()
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  const startService = useCallback(async () => {
    setStarting(true)
    try {
      await serviceAction('start')
      await new Promise((r) => setTimeout(r, 1500))
      await refresh()
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }, [refresh])

  const confirmPending = useCallback(async (p: PendingWrite, decision: 'commit' | 'cancel') => {
    try {
      await withSvc((m) => svcFetch(m, '/api/confirm', { pendingId: p.id, decision }))
      await refresh()
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : String(e))
    }
  }, [refresh])

  const libs: LibEntry[] = reply?.libs || []
  const pendings: PendingWrite[] = reply?.pendingList || []
  const svcUp = !!meta
  const degraded = meta?.degraded || reply?.degraded || null

  return (
    <div className="sl-root">
      <style>{css}</style>
      <div className="sl-top">
        <div className="sl-logo">{'🧪'}</div>
        <div className="sl-tt">
          <b>SQLite 检查台</b>
          <small>
            <span className={`sl-dot ${svcUp ? (degraded ? 'stale' : 'ok') : 'down'}`} />
            {svcUp ? (degraded ? `引擎降级：${degraded.slice(0, 60)}` : `服务 ${meta?.version} · 127.0.0.1:${meta?.port}`) : '服务未运行'}
            {libs.length ? ` · ${libs.length} 个库` : ''}
          </small>
        </div>
        {!svcUp && (
          <button className="sl-btn primary" disabled={starting} onClick={startService}>
            {starting ? '启动中…' : '启动服务'}
          </button>
        )}
        <div className="sl-tabs">
          {([['radar', '库雷达'], ['browse', '数据浏览'], ['query', 'SQL 查询'], ['maintain', '维护'], ['settings', '设置']] as [TabKey, string][]).map(([k, label]) => (
            <button key={k} className={`sl-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'maintain' && pendings.length ? <span className="sl-pend" /> : null}
            </button>
          ))}
        </div>
      </div>

      {bootErr ? <div className="sl-err">{bootErr}</div> : null}

      {pendings.map((p) => (
        <div key={p.id} className="sl-pend-banner">
          <div className="sl-row">
            <b>⚠ 待确认写</b>
            <span className="sl-badge warn">{p.preview.head}</span>
            <span className="sl-grow sl-sub sl-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.sql}>{p.sql}</span>
          </div>
          <div className="sl-row" style={{ marginTop: 6 }}>
            <span className="sl-sub sl-grow">
              {p.file ? p.file.split(/[\\/]/).pop() : p.dbId} · 影响 {p.preview.changes === null ? '—' : `${p.preview.changes} 行`} · {timeAgo(p.createdAt)}
            </span>
            <button className="sl-btn danger sm" onClick={() => confirmPending(p, 'cancel')}>取消</button>
            <button className="sl-btn primary sm" onClick={() => confirmPending(p, 'commit')}>确认提交</button>
          </div>
        </div>
      ))}

      <div className="sl-body">
        {tab === 'radar' && <RadarTab onOpened={() => { setTab('browse'); refresh() }} />}
        {tab === 'browse' && <BrowseTab libs={libs} reply={reply} onChanged={refresh} />}
        {tab === 'query' && <QueryTab libs={libs} reply={reply} onChanged={refresh} />}
        {tab === 'maintain' && <MaintainTab libs={libs} reply={reply} onChanged={refresh} onGoto={(t) => setTab(t)} />}
        {tab === 'settings' && <SettingsTab reply={reply} meta={meta} onChanged={refresh} onError={setBootErr} />}
      </div>
    </div>
  )
}
