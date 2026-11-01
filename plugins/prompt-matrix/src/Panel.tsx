/**
 * 提示词矩阵台面板外壳：头部（服务心跳 + 运行进度条）+ 6 Tab
 * （运行 / 数据集 / 结果 / 档案 / 历史 / 设置）
 *
 * 数据源：cap.kv pmtx.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求；矩阵执行由后台服务单权威完成；档案/结果全掩码。
 * 轮询：可见时每 2.5s 拉心跳与进度；隐藏时暂停（省电省 kv）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadMeta, fetchState, type MaskedProfile, type ServiceMeta, type DatasetHead,
  type HistoryEntry, type PmSettings,
} from './model'
import RunTab from './RunTab'
import DatasetsTab from './DatasetsTab'
import ResultsTab from './ResultsTab'
import ProfilesTab from './ProfilesTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.pm-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pm-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pm-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pm-body::-webkit-scrollbar{width:9px;height:9px}
.pm-body::-webkit-scrollbar-track{background:transparent}
.pm-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pm-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.pm-head{display:flex;align-items:center;gap:10px}
.pm-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8B5CF6,#2B6CB0);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.pm-tt{flex:1;min-width:0}
.pm-tt b{font-size:15px;display:block}
.pm-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.pm-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.pm-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.pm-dot.stale{background:#D29922}
.pm-dot.down{background:#F85149}
.pm-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-top:9px}
.pm-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.pm-tab:hover{color:#E6EAF2}
.pm-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pm-prog{margin-top:8px;background:#161B22;border:1px solid #242C3A;border-radius:9px;padding:8px 11px;font-size:11px;color:#D29922;display:flex;align-items:center;gap:9px;cursor:pointer}
.pm-prog-bar{flex:1;height:5px;border-radius:3px;background:#232834;overflow:hidden}
.pm-prog-in{height:100%;background:linear-gradient(90deg,#8B5CF6,#2B6CB0);border-radius:3px;transition:width .5s}
.pm-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pm-card-b{padding:11px 13px}
.pm-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 6px;font-size:13px;font-weight:700}
.pm-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8B5CF6,#2B6CB0);flex-shrink:0}
.pm-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.pm-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.pm-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.pm-btn{background:#6d4fd0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.pm-btn:hover{filter:brightness(1.12)}
.pm-btn:disabled{opacity:.45;cursor:not-allowed}
.pm-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pm-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.pm-btn.green{background:#1d4730;border:1px solid #2c5c3f;color:#3FB950}
.pm-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.pm-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pm-inp:focus{outline:none;border-color:#6d4fd0}
.pm-inp::placeholder{color:#4d5566}
.pm-ta{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:8px 10px;font-size:11.5px;width:100%;min-width:0;font-family:ui-monospace,Consolas,monospace;line-height:1.5;resize:vertical}
.pm-ta:focus{outline:none;border-color:#6d4fd0}
.pm-ta::placeholder{color:#4d5566}
.pm-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;max-width:100%}
.pm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pm-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.pm-err{color:#F85149;font-size:11.5px;padding:6px 16px;word-break:break-all}
.pm-ok{color:#3FB950;font-size:11.5px;padding:6px 16px;word-break:break-all}
.pm-warn{color:#D29922;font-size:11.5px;padding:6px 16px;word-break:break-all}
.pm-kv{display:flex;gap:6px;align-items:baseline;font-size:11.5px}
.pm-kv b{font-size:13px}
table.pm-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.pm-tbl th{color:#8B95A7;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
.pm-tbl td{padding:6px 8px;border-bottom:1px solid #1d232e;vertical-align:top;min-width:0}
.pm-tbl tr:hover td{background:#1a2029}
.pm-cellbtn{background:transparent;border:1px solid #2a2f3a;border-radius:6px;color:#E6EAF2;font-size:11px;padding:3px 8px;cursor:pointer;text-align:left;max-width:100%;overflow:hidden;display:block}
.pm-cellbtn:hover{border-color:#6d4fd0}
.pm-modal-bg{position:fixed;inset:0;background:rgba(6,8,12,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:18px}
.pm-modal{background:#141922;border:1px solid #2c3644;border-radius:14px;max-width:920px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.5)}
.pm-modal-h{display:flex;align-items:center;gap:8px;padding:12px 15px;border-bottom:1px solid #242C3A;font-weight:700;font-size:13px}
.pm-modal-b{padding:13px 15px;overflow-y:auto;flex:1;min-height:0}
.pm-modal-b::-webkit-scrollbar{width:9px}
.pm-modal-b::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px}
.pm-x{margin-left:auto;background:transparent;border:none;color:#8B95A7;font-size:16px;cursor:pointer;padding:2px 6px}
.pm-x:hover{color:#E6EAF2}
.pm-pre{background:#0f1218;border:1px solid #232a36;border-radius:8px;padding:9px 11px;font-size:11.5px;font-family:ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;line-height:1.55;max-height:340px;overflow-y:auto}
.pm-pill{border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;display:inline-block}
.pm-pill.ok{background:#12301f;color:#3FB950}
.pm-pill.bad{background:#3a1d22;color:#F85149}
.pm-pill.warn{background:#2a2410;color:#D29922}
.pm-pill.info{background:#1c2740;color:#6CA9F0}
.pm-del{color:#F85149;cursor:pointer;background:transparent;border:none;font-size:13px;padding:0 3px}
.pm-diff-same{color:#C9D1D9}
.pm-diff-del{background:#3a1d22;color:#F85149;border-radius:2px}
.pm-diff-add{background:#12301f;color:#3FB950;border-radius:2px}
`

export type TabKey = 'run' | 'datasets' | 'results' | 'profiles' | 'history' | 'settings'

export interface PanelProps {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function Panel({ pluginId, onSendToChat }: PanelProps) {
  const [tab, setTab] = useState<TabKey>('run')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [profiles, setProfiles] = useState<MaskedProfile[]>([])
  const [datasets, setDatasets] = useState<DatasetHead[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<PmSettings | null>(null)
  const [bootErr, setBootErr] = useState('')
  const [openRunId, setOpenRunId] = useState('')
  const visibleRef = useRef(true)

  const refreshState = useCallback(async () => {
    try {
      const st = await fetchState(8000)
      if (st && st.ok) {
        setProfiles(st.profiles || [])
        setDatasets(st.datasets || [])
        setHistory(st.history || [])
        setSettings(st.settings || null)
        setMeta(st.meta || null)
        setBootErr('')
      } else {
        const m = await loadMeta().catch(() => null)
        if (m) setMeta(m)
        else setMeta((prev) => prev)
      }
    } catch (e) {
      setBootErr(String((e as Error).message || e))
    }
  }, [])

  useEffect(() => {
    refreshState()
    const onVis = () => { visibleRef.current = document.visibilityState === 'visible' }
    document.addEventListener('visibilitychange', onVis)
    const timer = setInterval(() => {
      if (!visibleRef.current) return
      loadMeta().then((m) => { if (m) setMeta(m) }).catch(() => { /* 心跳失败保旧值 */ })
    }, 2500)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [refreshState])

  const running = meta && meta.running ? meta.running : null
  const online = !!(meta && !meta.degraded)
  const pct = running && running.total ? Math.round(((running.done + running.judgeDone) / (running.total + running.judgeTotal)) * 100) : 0

  const tabs: { key: TabKey, label: string }[] = [
    { key: 'run', label: '运行' },
    { key: 'datasets', label: '数据集' },
    { key: 'results', label: '结果' },
    { key: 'profiles', label: `档案${profiles.length ? ` (${profiles.length})` : ''}` },
    { key: 'history', label: '历史' },
    { key: 'settings', label: '设置' },
  ]

  return (
    <div className="pm-root">
      <style>{css}</style>
      <div className="pm-top">
        <div className="pm-head">
          <div className="pm-logo">▦</div>
          <div className="pm-tt">
            <b>提示词矩阵台</b>
            <small>
              <span className={`pm-dot ${online ? 'ok' : meta ? 'stale' : 'down'}`} />
              {online ? `服务在线 v${meta?.version || '?'}` : meta ? '服务降级（桥不可达，重试中）' : '等待服务…'}
              {` · 档案 ${profiles.length}`}
            </small>
          </div>
        </div>
        <div className="pm-tabs">
          {tabs.map((t) => (
            <button key={t.key} className={`pm-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {running ? (
          <div className="pm-prog" onClick={() => setTab('results')} title="点击查看结果">
            <span>{running.phase === 'judge' ? '评判' : '执行'}</span>
            <div className="pm-prog-bar"><div className="pm-prog-in" style={{ width: `${pct}%` }} /></div>
            <span style={{ flexShrink: 0 }}>
              {running.phase === 'judge'
                ? `${running.judgeDone}/${running.judgeTotal}`
                : `${running.done}/${running.total}`}
              {' '}格 · {Math.round(running.elapsedMs / 1000)}s
            </span>
          </div>
        ) : null}
      </div>
      <div className="pm-body">
        {bootErr ? <div className="pm-err">面板初始化失败：{bootErr}</div> : null}
        {meta && meta.degraded && meta.lastBridgeErr ? <div className="pm-warn">桥不可达：{meta.lastBridgeErr}</div> : null}
        {!online && !bootErr ? (
          <div className="pm-empty">
            后台服务未就绪（等 60s 自发现）。<br />
            若持续离线：宿主「插件」页检查 prompt-matrix 服务日志。
          </div>
        ) : null}
        {tab === 'run' ? (
          <RunTab pluginId={pluginId} profiles={profiles} datasets={datasets} settings={settings} running={running}
            onDone={refreshState} goTab={setTab} onSendToChat={onSendToChat} />
        ) : null}
        {tab === 'datasets' ? <DatasetsTab datasets={datasets} onChanged={refreshState} /> : null}
        {tab === 'results' ? (
          <ResultsTab pluginId={pluginId} profiles={profiles} history={history} running={running} openRunId={openRunId}
            onChanged={refreshState} goTab={setTab} onSendToChat={onSendToChat} />
        ) : null}
        {tab === 'profiles' ? <ProfilesTab profiles={profiles} onChanged={refreshState} /> : null}
        {tab === 'history' ? <HistoryTab history={history} onOpen={(id) => { setOpenRunId(id); setTab('results') }} /> : null}
        {tab === 'settings' ? <SettingsTab profiles={profiles} settings={settings} onChanged={refreshState} /> : null}
      </div>
    </div>
  )
}
