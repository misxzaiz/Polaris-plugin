/**
 * 模型体检台面板外壳：头部（服务心跳 + 运行态）+ 5 Tab
 * （档案 / 体检 / 对比 / 历史 / 设置）
 *
 * 数据源：cap.kv llmprobe.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求；探针由后台服务单权威执行；报告/档案全掩码（****<last4>）。
 * 轮询：可见时每 2.5s 拉心跳与运行态；隐藏时暂停（省电省 kv）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadMeta, loadProfiles, loadLatest, loadHistory, normalizeHistory,
  sendCommand, type MaskedProfile, type ServiceMeta, type SuiteReport, type HistoryEntry,
} from './model'
import ProfilesTab from './ProfilesTab'
import ProbeTab from './ProbeTab'
import CompareTab from './CompareTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.lp-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.lp-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.lp-body{flex:1;overflow-y:auto;padding:0 0 24px}
.lp-body::-webkit-scrollbar{width:9px;height:9px}
.lp-body::-webkit-scrollbar-track{background:transparent}
.lp-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.lp-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.lp-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2B6CB0,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.lp-tt{flex:1;min-width:0}
.lp-tt b{font-size:15px;display:block}
.lp-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.lp-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.lp-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.lp-dot.stale{background:#D29922}
.lp-dot.down{background:#F85149}
.lp-run{font-size:10.5px;color:#D29922;background:#2a2410;border:1px solid #4d4316;border-radius:6px;padding:2px 8px;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.lp-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.lp-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.lp-tab:hover{color:#E6EAF2}
.lp-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.lp-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.lp-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2B6CB0,#3FB950);flex-shrink:0}
.lp-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.lp-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.lp-card-b{padding:11px 13px}
.lp-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.lp-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.lp-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.lp-btn:hover{filter:brightness(1.1)}
.lp-btn:disabled{opacity:.45;cursor:not-allowed}
.lp-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.lp-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.lp-btn.green{background:#1d4730;border:1px solid #2c5c3f;color:#3FB950}
.lp-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.lp-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.lp-inp:focus{outline:none;border-color:#2b6cb0}
.lp-inp::placeholder{color:#4d5566}
.lp-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px}
.lp-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.lp-err{color:#F85149;font-size:11.5px;padding:8px 16px;word-break:break-all}
.lp-warn{color:#E3B341;font-size:11.5px;word-break:break-all}
.lp-mono{font-family:Consolas,Menlo,monospace}
.lp-row{padding:9px 13px;border-top:1px solid #1d2330}
.lp-row:hover{background:#12151c}
.lp-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.lp-muted{color:#5C6678}
.lp-ok{color:#3FB950}
.lp-badge{border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.lp-badge.host{background:#12283d;color:#58A6FF;border:1px solid #1f4066}
.lp-badge.manual{background:#241a2e;color:#C297FF;border:1px solid #3d2c52}
.lp-badge.good{background:#122b1a;color:#3FB950;border:1px solid #1f4729}
.lp-badge.warn{background:#2a2410;color:#E3B341;border:1px solid #4d4316}
.lp-badge.bad{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.lp-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.lp-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.lp-sum b{font-size:19px;display:block;line-height:1.2}
.lp-sum small{color:#8B95A7;font-size:9.5px}
.lp-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:8px 16px}
.lp-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2B6CB0,#3FB950);border-radius:3px;transition:width .5s}
.lp-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11.5px}
.lp-kv dt{color:#5C6678;white-space:nowrap}
.lp-kv dd{margin:0;word-break:break-all}
.lp-step{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-top:1px solid #1d2330;font-size:11.5px}
.lp-step:first-child{border-top:none}
.lp-step-ic{width:16px;text-align:center;flex-shrink:0}
.lp-step-tt{font-weight:600;white-space:nowrap}
.lp-step-metric{color:#8B95A7;font-family:Consolas,Menlo,monospace;font-size:10.5px;word-break:break-all}
table.lp-tb{width:100%;border-collapse:collapse;font-size:11.5px}
table.lp-tb th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
table.lp-tb td{padding:6px 8px;border-top:1px solid #1d2330;white-space:nowrap}
table.lp-tb td.wrap{white-space:normal;word-break:break-all}
.lp-num{font-family:Consolas,Menlo,monospace}
.lp-modal-bg{position:absolute;inset:0;background:rgba(6,8,12,.72);z-index:40;display:flex;align-items:center;justify-content:center;padding:18px}
.lp-modal{background:#161B22;border:1px solid #2a3346;border-radius:14px;max-width:520px;width:100%;max-height:88%;overflow-y:auto;padding:14px 16px}
.lp-modal h4{margin:0 0 10px;font-size:13.5px}
.lp-fm{display:grid;grid-template-columns:88px 1fr;gap:8px;align-items:center;font-size:11.5px}
.lp-fm label{color:#8B95A7;text-align:right}
.lp-fm-full{grid-column:1/-1}
.lp-close{position:sticky;top:0;float:right;background:transparent;border:none;color:#8B95A7;font-size:16px;cursor:pointer}
.lp-hb{display:flex;height:34px;align-items:flex-end;gap:2px}
.lp-hb>i{flex:1;min-width:2px;border-radius:2px 2px 0 0;background:#2B6CB0}
`

type TabId = 'probe' | 'profiles' | 'compare' | 'history' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'probe', label: '体检' },
  { id: 'profiles', label: '档案' },
  { id: 'compare', label: '对比' },
  { id: 'history', label: '历史' },
  { id: 'settings', label: '设置' },
]

export interface PanelProps {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function Panel(_props: PanelProps) {
  const [tab, setTab] = useState<TabId>('probe')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [profiles, setProfiles] = useState<MaskedProfile[]>([])
  const [latest, setLatest] = useState<SuiteReport | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [bridgeErr, setBridgeErr] = useState<string>('')
  const [reloadTick, setReloadTick] = useState(0)
  const visibleRef = useRef(true)

  const refreshAll = useCallback(async () => {
    try {
      const [m, p, l, h] = await Promise.all([loadMeta(), loadProfiles(), loadLatest(), loadHistory()])
      setMeta(m)
      setProfiles(p && Array.isArray(p.items) ? p.items : [])
      setLatest(l)
      setHistory(normalizeHistory(h))
      setBridgeErr('')
    } catch (e) {
      setBridgeErr(String((e as Error).message || e))
    }
  }, [])

  useEffect(() => { refreshAll() }, [refreshAll, reloadTick])

  useEffect(() => {
    const t = setInterval(async () => {
      if (!visibleRef.current) return
      try {
        const m = await loadMeta()
        setMeta(m)
        // 运行结束瞬间自动刷新全量
        setMeta((prev) => {
          if (prev && prev.running && m && !m.running) setReloadTick((x) => x + 1)
          return m
        })
      } catch { /* 心跳失败不覆盖旧值 */ }
    }, 2500)
    const onVis = () => { visibleRef.current = document.visibilityState === 'visible' }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const heartbeatOk = meta && !meta.degraded && Date.now() - new Date(meta.ts).getTime() < 130000
  const heartbeatStale = meta && !meta.degraded && !heartbeatOk

  const doImport = useCallback(async () => {
    try { await sendCommand('import_host', {}, 20000) } catch { /* 回执失败由刷新兜底 */ }
    setReloadTick((x) => x + 1)
  }, [])

  const running = meta && meta.running
  const runProgress = running ? Math.min(100, Math.max(8, ((Date.now() - running.startedAt) / 45000) * 100)) : 0

  return (
    <div className="lp-root">
      <style>{css}</style>
      <div className="lp-top">
        <div className="lp-logo">🩺</div>
        <div className="lp-tt">
          <b>模型体检台</b>
          <small>
            <span className={`lp-dot ${heartbeatOk ? 'ok' : heartbeatStale ? 'stale' : 'down'}`} />
            {meta
              ? (meta.degraded ? `服务降级：${meta.lastBridgeErr || '桥不可达'}` : `服务 ${meta.version} · ${meta.profileCount} 档案`)
              : '服务未连接（等待心跳）'}
          </small>
        </div>
        {running && <span className="lp-run" title={`${running.profileName} · ${running.step}`}>⏳ {running.profileName} · {running.step}</span>}
        <div className="lp-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`lp-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      {running && <div className="lp-prog"><i style={{ width: `${runProgress}%` }} /></div>}
      {bridgeErr && <div className="lp-err">桥读取失败：{bridgeErr}</div>}
      <div className="lp-body">
        {tab === 'probe' && <ProbeTab profiles={profiles} latest={latest} meta={meta} onRefresh={refreshAll} />}
        {tab === 'profiles' && <ProfilesTab profiles={profiles} onRefresh={refreshAll} onImport={doImport} importing={!!running} />}
        {tab === 'compare' && <CompareTab profiles={profiles} latest={latest} history={history} onRefresh={refreshAll} />}
        {tab === 'history' && <HistoryTab profiles={profiles} history={history} onRefresh={refreshAll} />}
        {tab === 'settings' && <SettingsTab meta={meta} onRefresh={refreshAll} />}
      </div>
    </div>
  )
}
