/**
 * 数据方舟面板外壳：头部（保护状态速览）+ 四 Tab（快照 / 恢复 / 服务 / 设置）
 * 数据面：cap.kv dataark.*（经宿主 invoke → router_dispatch），跨端一致。
 * 磁盘操作（快照/校验/恢复）经命令键下发后台服务，面板不直接碰文件。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadOverview, timeAgo, formatBytes, type Overview } from './model'
import SnapshotsTab from './SnapshotsTab'
import RestoreTab from './RestoreTab'
import ServiceTab from './ServiceTab'
import SettingsTab from './SettingsTab'

const css = `
.da-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.da-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.da-body{flex:1;overflow-y:auto;padding:0 0 24px}
.da-body::-webkit-scrollbar{width:9px;height:9px}
.da-body::-webkit-scrollbar-track{background:transparent}
.da-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.da-page{max-width:560px;margin:0 auto}
.da-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0F1420 75%,rgba(15,20,32,0))}
.da-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4DA3FF,#2B6CB0);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.da-tt{flex:1;min-width:0}
.da-tt b{font-size:15px;display:block}
.da-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.da-tt small b{display:inline;font-size:10.5px;color:#7EB8FF}
.da-tabs{display:flex;gap:4px}
.da-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.da-tab:hover{color:#E6EAF2}
.da-tab.on{background:#1B2637;color:#E6EAF2;font-weight:600}
.da-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.da-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#4DA3FF,#2B6CB0);flex-shrink:0}
.da-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.da-card{background:#131A26;border:1px solid #223047;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.da-card-b{padding:11px 13px}
.da-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.da-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.da-btn{background:#2B6CB0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.da-btn:hover{filter:brightness(1.12)}
.da-btn:disabled{opacity:.45;cursor:not-allowed}
.da-btn.ghost{background:#1B2637;color:#E6EAF2;border:1px solid #223047}
.da-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.da-btn.warn{background:#3a2f14;color:#F2C063;border:1px solid #54451c}
.da-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.da-inp,.da-txa{background:#0E1320;border:1px solid #223047;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;font-family:inherit}
.da-txa{resize:vertical;min-height:52px;line-height:1.5}
.da-inp:focus,.da-txa:focus{outline:none;border-color:#2B6CB0}
.da-inp::placeholder,.da-txa::placeholder{color:#4d5566}
.da-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.da-sel{background:#0E1320;border:1px solid #223047;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;max-width:100%}
.da-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.da-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(19,26,38,.96);border:1px solid #223047;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.da-toast.bad{border-color:#54262c;color:#FF8A9A}
.da-toast.good{border-color:#1d3a52;color:#7EB8FF}
.da-chip{background:#1B2637;border:1px solid #223047;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.da-chip:hover{border-color:#33507a}
.da-chip.on{background:#16304f;border-color:#2B6CB0;color:#7EB8FF;font-weight:600}
.da-num{width:86px;background:#0E1320;border:1px solid #223047;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.da-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1A2334}
.da-field:first-child{border-top:none}
.da-field-l{flex:1;min-width:0}
.da-field-l b{font-size:12.5px;display:block}
.da-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.da-banner{margin:0 16px 10px;padding:9px 13px;border-radius:11px;font-size:11.5px;line-height:1.6}
.da-banner.bad{background:#2a1418;border:1px solid #54262c;color:#FF8A9A}
.da-banner.ok{background:#122032;border:1px solid #1d3a52;color:#9CC7F5}
.da-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 16px 10px}
.da-stat{background:#131A26;border:1px solid #223047;border-radius:11px;padding:9px 6px;text-align:center;min-width:0}
.da-stat b{display:block;font-size:15px;font-variant-numeric:tabular-nums}
.da-stat small{font-size:9.5px;color:#8B95A7;display:block;margin-top:2px}
.da-stat .hot{color:#7EB8FF}
.da-stat .bad{color:#F85149}
.da-srow{border-top:1px solid #1A2334;padding:9px 2px}
.da-srow:first-child{border-top:none}
.da-srow .head{display:flex;gap:8px;align-items:center;cursor:pointer}
.da-srow .main{flex:1;min-width:0}
.da-srow .main b{font-size:12.5px;display:block}
.da-srow .main small{color:#5C6678;font-size:10.5px;display:block;margin-top:1px}
.da-badge{font-size:9.5px;padding:2px 8px;border-radius:999px;background:#1B2637;color:#8B95A7;border:1px solid #223047;white-space:nowrap;flex-shrink:0}
.da-badge.full{color:#7EB8FF;border-color:#1d3a52}
.da-badge.inc{color:#9CC7A0;border-color:#1d3a30}
.da-badge.err{color:#FF8A9A;border-color:#54262c}
.da-detail{margin-top:9px;padding-top:9px;border-top:1px dashed #223047;font-size:11px;color:#8B95A7;line-height:1.7}
.da-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
.da-ev{display:flex;gap:8px;padding:6px 2px;border-top:1px solid #1A2334;font-size:11px;align-items:flex-start}
.da-ev:first-child{border-top:none}
.da-ev .t{color:#5C6678;flex-shrink:0;font-variant-numeric:tabular-nums}
.da-ev .k{flex-shrink:0;font-weight:600;min-width:66px}
.da-ev .k.ok{color:#7EB8FF}
.da-ev .k.bad{color:#FF8A9A}
.da-ev .k.warn{color:#F2C063}
.da-ev .m{flex:1;min-width:0;color:#B4BCC9;word-break:break-all}
.da-file{display:flex;gap:8px;align-items:center;padding:5px 2px;border-top:1px solid #1A2334;font-size:11px}
.da-file:first-child{border-top:none}
.da-file .p{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C9D3E0}
.da-file .s{color:#5C6678;flex-shrink:0;font-variant-numeric:tabular-nums}
@media (max-width:430px){.da-grid{grid-template-columns:repeat(2,1fr)}.da-tabs .da-tab{padding:6px 7px}}
`

type Tab = 'snapshots' | 'restore' | 'service' | 'settings'

export type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function ArkPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('snapshots')
  const [data, setData] = useState<Overview | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind?: 'bad' | 'good') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async (): Promise<Overview | null> => {
    try {
      const d = await loadOverview()
      setData(d)
      setLoadErr('')
      return d
    } catch (e) {
      setLoadErr((e as Error).message)
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    void reload()
    const onVis = () => { if (document.visibilityState === 'visible' && alive) void reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis) }
  }, [reload])

  const head = (() => {
    if (!data) return '载入中…'
    const st = data.state
    if (st.degraded) return { text: `⚠️ ${st.degraded.reason}`, cls: 'bad' }
    if (!st.lastSnapshotAt) return { text: '尚无快照——「快照」页一键开始', cls: '' }
    return {
      text: <>上次 {timeAgo(st.lastSnapshotAt)} · 下次 {st.nextRunAt ? timeAgo(st.nextRunAt).replace('前', '后') : '未排程'} · 库 {formatBytes(st.storeBytes || 0)}</>,
      cls: 'ok',
    }
  })()

  return (
    <div className="da-root">
      <style>{css}</style>
      <div className="da-top">
        <div className="da-logo">🛡️</div>
        <div className="da-tt">
          <b>数据方舟</b>
          <small className={typeof head === 'string' ? '' : head.cls}>{typeof head === 'string' ? head : head.text}</small>
        </div>
        <div className="da-tabs">
          {([
            ['snapshots', '快照'],
            ['restore', '恢复'],
            ['service', '服务'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`da-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="da-body">
        <div className="da-page">
          {loadErr && <div className="da-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'snapshots' && <SnapshotsTab data={data} reload={reload} showToast={showToast} goRestore={() => setTab('restore')} />}
          {tab === 'restore' && <RestoreTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'service' && <ServiceTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`da-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
