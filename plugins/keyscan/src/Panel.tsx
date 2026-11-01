/**
 * 密钥扫描台面板外壳：头部（服务心跳）+ 4 Tab（扫描 / 发现 / 历史 / 设置）
 *
 * 数据源：cap.kv keyscan.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求、零文件访问；扫描由后台服务单权威执行，发现条目全掩码。
 * 轮询：可见时每 5s 拉一次心跳与最新摘要；后台/隐藏时暂停（省电省 kv）。
 */
import { useCallback, useEffect, useState } from 'react'
import { loadPanelData, type LatestSummary, type ServiceMeta } from './model'
import ScanTab from './ScanTab'
import FindingsTab from './FindingsTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const css = `
.ks-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ks-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ks-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ks-body::-webkit-scrollbar{width:9px;height:9px}
.ks-body::-webkit-scrollbar-track{background:transparent}
.ks-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.ks-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ks-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E3B341,#F85149);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.ks-tt{flex:1;min-width:0}
.ks-tt b{font-size:15px;display:block}
.ks-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ks-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ks-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ks-dot.stale{background:#D29922}
.ks-dot.down{background:#F85149}
.ks-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ks-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ks-tab:hover{color:#E6EAF2}
.ks-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ks-badge{position:absolute;top:0;right:1px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

.ks-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ks-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E3B341,#F85149);flex-shrink:0}
.ks-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ks-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ks-card-b{padding:11px 13px}
.ks-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ks-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ks-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ks-btn:hover{filter:brightness(1.1)}
.ks-btn:disabled{opacity:.45;cursor:not-allowed}
.ks-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ks-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ks-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ks-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ks-inp:focus{outline:none;border-color:#2b6cb0}
.ks-inp::placeholder{color:#4d5566}
.ks-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ks-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ks-mono{font-family:Consolas,Menlo,monospace}

/* 严重度色 */
.ks-sev{display:inline-block;border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.ks-sev.critical{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.ks-sev.high{background:#3a2a10;color:#E3B341;border:1px solid #5c4517}
.ks-sev.medium{background:#33300f;color:#d8c94a;border:1px solid #4d4916}

/* 摘要大数字 */
.ks-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.ks-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.ks-sum b{font-size:19px;display:block;line-height:1.2}
.ks-sum small{color:#8B95A7;font-size:9.5px}
.ks-crit{color:#FF8A9A}.ks-high{color:#E3B341}.ks-med{color:#d8c94a}.ks-new{color:#F85149}

/* 发现行 */
.ks-row{padding:9px 13px;border-top:1px solid #1d2330}
.ks-row:hover{background:#12151c}
.ks-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.ks-row-file{color:#C9D1D9;font-size:11px;word-break:break-all}
.ks-ctx{margin-top:4px;background:#0d1017;border:1px solid #1d2330;border-radius:7px;padding:5px 8px;font-size:10.5px;color:#8B95A7;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace}
.ks-muted{color:#5C6678}

/* 进度条 */
.ks-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:8px 16px}
.ks-prog>div{height:100%;background:linear-gradient(90deg,#E3B341,#F85149);border-radius:3px;transition:width .6s}
@keyframes ksPulse{0%,100%{opacity:1}50%{opacity:.45}}
.ks-pulse{animation:ksPulse 1.4s infinite}
`

type Tab = 'scan' | 'findings' | 'history' | 'settings'

interface HeadData {
  meta: ServiceMeta | null
  latest: LatestSummary | null
}

function heartbeatState(meta: ServiceMeta | null): { cls: string; label: string } {
  if (!meta || !meta.lastTickAt) return { cls: 'down', label: '服务未运行' }
  const age = Date.now() - meta.lastTickAt
  if (meta.degraded) return { cls: 'stale', label: `桥降级(${meta.lastBridgeErr ? '见日志' : '?'})` }
  if (age > 130 * 1000) return { cls: 'stale', label: `心跳停滞 ${Math.round(age / 1000)}s` }
  return { cls: 'ok', label: meta.scanning ? '扫描中' : '服务正常' }
}

export default function Panel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('scan')
  const [head, setHead] = useState<HeadData>({ meta: null, latest: null })
  const [visible, setVisible] = useState(true)

  const refreshHead = useCallback(async () => {
    try {
      const d = await loadPanelData()
      setHead({ meta: d.meta, latest: d.latest })
    } catch (_) { /* 静默：头部刷新失败不打断 */ }
  }, [])

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    setVisible(document.visibilityState === 'visible')
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!visible) return
    refreshHead()
    const t = setInterval(refreshHead, 5000)
    return () => clearInterval(t)
  }, [visible, refreshHead])

  const hb = heartbeatState(head.meta)
  const latest = head.latest
  const badgeCount = latest && latest.new ? latest.new.newCount : 0

  return (
    <div className="ks-root">
      <style>{css}</style>
      <div className="ks-top">
        <div className="ks-logo">🔑</div>
        <div className="ks-tt">
          <b>密钥扫描台</b>
          <small>
            <span className={`ks-dot ${hb.cls}`} />
            {hb.label}
            {head.meta?.scanning ? ` · ${head.meta.scanning.root}` : latest ? ` · 上次 ${latest.findingCount ?? 0} 处` : ' · 尚未扫描'}
          </small>
        </div>
        <div className="ks-tabs">
          {(
            [
              ['scan', '扫描'],
              ['findings', '发现'],
              ['history', '历史'],
              ['settings', '设置'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`ks-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
              {id === 'findings' && badgeCount > 0 && <span className="ks-badge">{badgeCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="ks-body">
        {tab === 'scan' && <ScanTab head={head} onChanged={refreshHead} onGoFindings={() => setTab('findings')} />}
        {tab === 'findings' && <FindingsTab head={head} />}
        {tab === 'history' && <HistoryTab onGoFindings={() => setTab('findings')} />}
        {tab === 'settings' && <SettingsTab head={head} onChanged={refreshHead} />}
      </div>
    </div>
  )
}
