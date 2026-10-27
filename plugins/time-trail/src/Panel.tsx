/**
 * 刻漏面板外壳：头部（心跳）+ 四 Tab（今日 / 历史 / 分类 / 设置）
 *
 * 数据源：cap.kv timetrail.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求（采集在后台服务+PowerShell 子进程执行）；天账本由后台
 * 服务单权威写入，手机/Web 打开同一面板看到都是这台机器的时间账本
 * （跨端一致性由 cap.kv 单事实库保证）。
 * 轮询：可见时每 5s 拉一次快照/今日账本，后台自动暂停。
 */
import { useCallback, useEffect, useState } from 'react'
import { loadPanelData, type PanelData } from './model'
import TodayTab from './TodayTab'
import HistoryTab from './HistoryTab'
import CatsTab from './CatsTab'
import SettingsTab from './SettingsTab'

const css = `
.tt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tt-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tt-body{flex:1;overflow-y:auto;padding:0 0 24px}
.tt-body::-webkit-scrollbar{width:9px;height:9px}
.tt-body::-webkit-scrollbar-track{background:transparent}
.tt-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.tt-page{max-width:560px;margin:0 auto}

/* 头部 */
.tt-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.tt-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0E7490,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.tt-tt{flex:1;min-width:0}
.tt-tt b{font-size:15px;display:block}
.tt-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.tt-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.tt-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.tt-dot.stale{background:#D29922}
.tt-dot.down{background:#F85149}
.tt-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.tt-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.tt-tab:hover{color:#E6EAF2}
.tt-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* 通用 */
.tt-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.tt-card-h{padding:10px 13px 6px;font-size:12px;font-weight:700;color:#C9D1D9;display:flex;align-items:center;gap:8px}
.tt-card-h small{font-weight:400;color:#5C6678;font-size:10.5px;margin-left:auto}
.tt-card-b{padding:4px 13px 12px}
.tt-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.tt-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.tt-btn:hover{filter:brightness(1.1)}
.tt-btn:disabled{opacity:.45;cursor:not-allowed}
.tt-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.tt-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.tt-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.tt-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.tt-inp:focus{outline:none;border-color:#2b6cb0}
.tt-inp::placeholder{color:#4d5566}
.tt-empty{color:#8B95A7;font-size:12px;padding:22px 16px;text-align:center;line-height:1.9}
.tt-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.tt-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.tt-toast.bad{border-color:#54262c;color:#FF8A9A}

/* 今日 */
.tt-now{display:flex;align-items:center;gap:12px;padding:14px 13px}
.tt-now-ico{font-size:26px;flex-shrink:0}
.tt-now-main{flex:1;min-width:0}
.tt-now-main b{font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-now-main small{color:#8B95A7;font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.tt-chips{display:flex;gap:8px;padding:0 13px 12px;flex-wrap:wrap}
.tt-chip{background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:7px 11px;min-width:88px}
.tt-chip small{display:block;color:#5C6678;font-size:10px}
.tt-chip b{font-size:13.5px;color:#E6EAF2}
.tt-bar-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px}
.tt-bar-row .nm{width:64px;flex-shrink:0;display:flex;align-items:center;gap:5px}
.tt-bar-row .nm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-bar-track{flex:1;height:14px;background:#12151c;border-radius:7px;overflow:hidden;min-width:0}
.tt-bar-fill{height:100%;border-radius:7px;min-width:2px}
.tt-bar-val{width:70px;flex-shrink:0;text-align:right;color:#8B95A7;font-size:11px;font-variant-numeric:tabular-nums}
.tt-app-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-top:1px solid #1d2330}
.tt-app-row:first-child{border-top:none}
.tt-app-row .idx{color:#5C6678;font-size:10.5px;width:16px;flex-shrink:0}
.tt-app-row .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-app-row .cat{font-size:10px;padding:1px 6px;border-radius:5px;flex-shrink:0}
.tt-app-row .dur{color:#8B95A7;font-size:11px;flex-shrink:0;font-variant-numeric:tabular-nums}
.tt-strip{display:flex;gap:2px;padding:2px 0 4px}
.tt-cell{flex:1;height:26px;border-radius:3px;background:#12151c;min-width:0;position:relative}
.tt-cell-l{display:flex;justify-content:space-between;color:#5C6678;font-size:9.5px;padding-top:3px}
.tt-banner{display:flex;align-items:center;gap:8px;margin:0 16px 10px;padding:9px 13px;border-radius:11px;font-size:11.5px;border:1px solid}
.tt-banner.warn{background:#241d10;border-color:#4a3b15;color:#D29922}
.tt-banner.bad{background:#241318;border-color:#54262c;color:#FF8A9A}

/* 历史 */
.tt-seg{display:flex;gap:4px;margin-left:auto}
.tt-seg button{background:transparent;border:1px solid #2a2f3a;color:#8B95A7;font-size:10.5px;padding:2px 8px;border-radius:7px;cursor:pointer}
.tt-seg button.on{background:#1C2330;color:#E6EAF2;border-color:#3a4254}
.tt-daybar{display:flex;flex-direction:column;gap:6px;padding:2px 0}
.tt-dayrow{display:flex;align-items:center;gap:8px;font-size:10.5px}
.tt-dayrow .d{width:74px;flex-shrink:0;color:#8B95A7;font-variant-numeric:tabular-nums}
.tt-dayrow .stack{flex:1;display:flex;height:16px;border-radius:4px;overflow:hidden;background:#12151c;min-width:0}
.tt-dayrow .sum{width:58px;flex-shrink:0;text-align:right;color:#8B95A7;font-variant-numeric:tabular-nums}
.tt-daylist{border-top:1px solid #1d2330;margin-top:8px}
.tt-dayitem{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:11.5px;border-bottom:1px solid #1d2330;cursor:pointer}
.tt-dayitem:last-child{border-bottom:none}
.tt-dayitem .d{width:74px;flex-shrink:0;color:#C9D1D9}
.tt-dayitem .info{flex:1;min-width:0;color:#8B95A7;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-dayitem .dur{color:#E6EAF2;flex-shrink:0;font-variant-numeric:tabular-nums}

/* 分类 */
.tt-catrow{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:12px;border-top:1px solid #1d2330}
.tt-catrow:first-child{border-top:none}
.tt-catrow .sw{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.tt-catrow .nm{flex:1;min-width:0}
.tt-rule{display:flex;align-items:center;gap:7px;padding:6px 0;font-size:11.5px;border-top:1px solid #1d2330}
.tt-rule:first-child{border-top:none}
.tt-rule .m{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-rule .k{font-size:9.5px;color:#5C6678;flex-shrink:0}
.tt-addrow{display:flex;gap:6px;padding-top:8px;flex-wrap:wrap}
.tt-addrow .tt-inp{flex:1;min-width:90px}
.tt-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:11.5px;flex-shrink:0}

/* 设置 */
.tt-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.tt-field:first-child{border-top:none}
.tt-field-l{flex:1;min-width:0}
.tt-field-l b{font-size:12.5px;display:block}
.tt-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.tt-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.tt-toggle.on{background:#2b6cb0}
.tt-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.tt-toggle.on i{left:18px}
.tt-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.tt-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
.tt-confirm{display:flex;align-items:center;gap:8px;padding:8px 13px;background:#241318;border-top:1px solid #54262c;font-size:11.5px;color:#FF8A9A}
.tt-confirm b{flex:1;min-width:0}
`

type Tab = 'today' | 'history' | 'cats' | 'settings'

export type Toast = (msg: string, bad?: boolean) => void

export default function TimeTrailPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)

  const showToast = useCallback<Toast>((msg, bad) => {
    setToast({ msg, bad })
    setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async (): Promise<PanelData | null> => {
    try {
      const d = await loadPanelData()
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

  const hbState = !data?.snap
    ? 'down'
    : data.snap.paused ? 'stale' : (Date.now() - data.snap.at <= 90 * 1000 ? 'ok' : 'stale')
  const hbText = !data?.snap
    ? '服务未运行（设置 Tab 可启动）'
    : data.snap.paused
      ? '已暂停（隐私模式）'
      : hbState === 'ok'
        ? `采集中 · ${data.snap.today.activeSec > 0 ? `今日 ${fmtToday(data.snap.today.activeSec)}` : '刚开始记录'}`
        : '快照停滞'

  return (
    <div className="tt-root">
      <style>{css}</style>
      <div className="tt-top">
        <div className="tt-logo">🕰️</div>
        <div className="tt-tt">
          <b>刻漏</b>
          <small>
            <i className={`tt-dot ${hbState}`} />
            {hbText}
          </small>
        </div>
        <div className="tt-tabs">
          {([
            ['today', '今日'],
            ['history', '历史'],
            ['cats', '分类'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`tt-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tt-body">
        <div className="tt-page">
          {loadErr && <div className="tt-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'today' && <TodayTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'history' && <HistoryTab data={data} />}
          {tab === 'cats' && <CatsTab pluginId={pluginId} data={data} reload={reload} showToast={showToast} onSendToChat={onSendToChat} />}
          {tab === 'settings' && (
            <SettingsTab pluginId={pluginId} data={data} reload={reload} showToast={showToast} />
          )}
        </div>
      </div>
      {toast && <div className={`tt-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function fmtToday(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分`
  return `${Math.floor(m / 60)}小时${m % 60}分`
}
