/**
 * Panel.tsx —— 数据库工作台面板骨架（Tab 框架 + service 连接管理 + 全局状态）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { SvcClient, type Profile } from './model'
import ConnectionsTab from './ConnectionsTab'
import QueryTab from './QueryTab'
import SchemaTab from './SchemaTab'
import RedisTab from './RedisTab'

const css = `
.dbw-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dbw-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dbw-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dbw-body::-webkit-scrollbar{width:9px;height:9px}
.dbw-body::-webkit-scrollbar-track{background:transparent}
.dbw-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.dbw-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dbw-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8957E5,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dbw-tt{flex:1;min-width:0}
.dbw-tt b{font-size:15px;display:block}
.dbw-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.dbw-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dbw-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.dbw-dot.down{background:#F85149}
.dbw-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dbw-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.dbw-tab:hover{color:#E6EAF2}
.dbw-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.dbw-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dbw-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8957E5,#58A6FF);flex-shrink:0}
.dbw-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dbw-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dbw-card-b{padding:11px 13px}
.dbw-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dbw-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.dbw-tag.g{color:#3FB950;border-color:#1d4428}
.dbw-tag.y{color:#D29922;border-color:#4a3a12}
.dbw-tag.p{color:#A371F7;border-color:#3a2a5c}
.dbw-tag.r{color:#F85149;border-color:#54262c}
.dbw-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dbw-btn:hover{filter:brightness(1.1)}
.dbw-btn:disabled{opacity:.45;cursor:not-allowed}
.dbw-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dbw-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dbw-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dbw-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dbw-inp:focus{outline:none;border-color:#2b6cb0}
.dbw-inp::placeholder{color:#4d5566}
.dbw-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px}
.dbw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dbw-lbl{font-size:11px;color:#8B95A7;min-width:64px}
.dbw-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dbw-err{color:#F85149;font-size:11.5px;padding:8px 16px;white-space:pre-wrap}
.dbw-ok{color:#3FB950;font-size:11.5px;padding:8px 16px}
.dbw-warn{color:#D29922;font-size:11.5px;padding:8px 16px}
.dbw-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1C2330;border:1px solid #2a2f3a;color:#E6EAF2;padding:8px 16px;border-radius:10px;font-size:12px;z-index:99;max-width:80%;box-shadow:0 6px 20px rgba(0,0,0,.5)}
.dbw-toast.err{border-color:#54262c;color:#F85149}

.dbw-pcard{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;border-bottom:1px solid #1d2330}
.dbw-pcard:last-child{border-bottom:none}
.dbw-pcard:hover{background:#1a2029}
.dbw-pcard.on{background:#1C2330}
.dbw-picon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;color:#fff}
.dbw-pinfo{flex:1;min-width:0}
.dbw-pinfo b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbw-pinfo small{color:#8B95A7;font-size:10.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.dbw-editor{width:100%;min-height:110px;background:#0D1117;border:1px solid #2a2f3a;border-radius:10px;color:#E6EAF2;font:12px/1.6 Consolas,Menlo,monospace;padding:10px;resize:vertical;tab-size:2}
.dbw-editor:focus{outline:none;border-color:#2b6cb0}
.dbw-tblwrap{overflow:auto;border:1px solid #242C3A;border-radius:10px;max-height:420px}
.dbw-table{border-collapse:collapse;font-size:11.5px;min-width:100%}
.dbw-table th{position:sticky;top:0;background:#1C2330;color:#8B95A7;font-weight:600;text-align:left;padding:6px 10px;border-bottom:1px solid #242C3A;white-space:nowrap;z-index:2}
.dbw-table td{padding:5px 10px;border-bottom:1px solid #1a2029;white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis;color:#c9d1d9;font-family:Consolas,Menlo,monospace;font-size:11px}
.dbw-table tr:hover td{background:#1a2029}
.dbw-null{color:#5C6678;font-style:italic}
.dbw-kbd{background:#0D1117;border:1px solid #2a2f3a;border-radius:5px;padding:1px 6px;font:10.5px Consolas,monospace;color:#A371F7}
.dbw-chk{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#8B95A7;cursor:pointer;user-select:none}
.dbw-chk input{accent-color:#8957E5}
.dbw-modal{position:fixed;inset:0;background:rgba(6,8,12,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:20px}
.dbw-modal-c{background:#161B22;border:1px solid #2a2f3a;border-radius:14px;max-width:460px;width:100%;max-height:82vh;overflow-y:auto;padding:16px}
.dbw-h3{font-size:13.5px;font-weight:700;margin:0 0 10px}
.dbw-tree{font-size:12px;user-select:none}
.dbw-tree-i{display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;white-space:nowrap}
.dbw-tree-i:hover{background:#1a2029}
.dbw-tree-i.on{background:#1C2330}
.dbw-tree-g{color:#8B95A7}
`

export type Toast = (msg: string, isErr?: boolean) => void

export type TabId = 'conn' | 'query' | 'schema' | 'redis'

const TABS: { id: TabId; label: string }[] = [
  { id: 'conn', label: '连接' },
  { id: 'query', label: '查询' },
  { id: 'schema', label: '结构' },
  { id: 'redis', label: 'Redis' },
]

export default function DbWorkbenchPanel() {
  const [tab, setTab] = useState<TabId>('conn')
  const [svcOk, setSvcOk] = useState<boolean | null>(null)
  const [svcReason, setSvcReason] = useState('')
  const [svcVersion, setSvcVersion] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [toast, setToast] = useState<{ msg: string; err: boolean; at: number } | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const svcRef = useRef(new SvcClient())

  const showToast: Toast = useCallback((msg: string, isErr?: boolean) => {
    setToast({ msg, err: isErr === true, at: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.at >= 2600 ? null : t)), 2800)
  }, [])

  const reloadProfiles = useCallback(async () => {
    const svc = svcRef.current
    try {
      const list = await svc.profiles()
      setProfiles(list)
      return list
    } catch (_) {
      return []
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const d = await svcRef.current.discover()
      if (!alive) return
      setSvcOk(d.ok)
      setSvcReason(d.reason)
      if (d.ok) {
        const info = await svcRef.current.infoSvc().catch(() => null)
        if (info && info.ok) setSvcVersion(info.version || '')
        await reloadProfiles()
      }
    })()
    return () => { alive = false }
  }, [reloadProfiles, reloadTick])

  const retry = useCallback(() => setReloadTick((t) => t + 1), [])

  const selected = profiles.find((p) => p.id === selectedId) || null

  const pickProfile = useCallback(async () => {
    const list = profiles.length ? profiles : await reloadProfiles()
    return list.find((p) => p.id === selectedId) || null
  }, [profiles, selectedId, reloadProfiles])

  return (
    <div className="dbw-root">
      <style>{css}</style>
      <div className="dbw-top">
        <div className="dbw-logo">🗃</div>
        <div className="dbw-tt">
          <b>数据库工作台</b>
          <small>
            <span className={`dbw-dot ${svcOk ? 'ok' : 'down'}`} />
            {svcOk === null ? '连接中…' : svcOk ? `服务 v${svcVersion} · ${profiles.length} 个连接` : '服务未连接'}
          </small>
        </div>
        <div className="dbw-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`dbw-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {svcOk === false && (
        <div className="dbw-card">
          <div className="dbw-card-b">
            <div className="dbw-err" style={{ padding: 0 }}>{svcReason}</div>
            <div style={{ marginTop: 8 }}>
              <button className="dbw-btn ghost sm" onClick={retry}>重试</button>
            </div>
          </div>
        </div>
      )}

      {svcOk && (
        <div className="dbw-body">
          {tab === 'conn' && (
            <ConnectionsTab
              svc={svcRef.current}
              profiles={profiles}
              reloadProfiles={reloadProfiles}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              showToast={showToast}
            />
          )}
          {tab === 'query' && (
            <QueryTab
              svc={svcRef.current}
              profiles={profiles}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              showToast={showToast}
            />
          )}
          {tab === 'schema' && (
            <SchemaTab
              svc={svcRef.current}
              profiles={profiles}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              showToast={showToast}
            />
          )}
          {tab === 'redis' && (
            <RedisTab
              svc={svcRef.current}
              profiles={profiles}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              showToast={showToast}
              pickProfile={pickProfile}
            />
          )}
        </div>
      )}

      {toast && <div className={`dbw-toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
