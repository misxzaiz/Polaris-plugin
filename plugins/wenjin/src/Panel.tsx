/**
 * 求职台账面板外壳：头部（状态/心跳）+ 四 Tab（今日 / 投递 / 洞察 / 设置）
 *
 * 数据源：cap.kv wenjin.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；派生（管道/跟进/漏斗/offer 对比）全部在 shared/core.js
 * 纯函数内完成（与 MCP 同一权威）。零后台服务——跟进与日程是打开面板时的
 * 投影，没有推送通道就不需要常驻进程。
 * 轮询：可见时每 15s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as core from '../shared/core.js'
import { buildView, loadWenjin, newCache, type CacheState, type WenData } from './model'
import TodayTab from './TodayTab'
import AppsTab from './AppsTab'
import InsightTab from './InsightTab'
import SettingsTab from './SettingsTab'

const css = `
.wj-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.wj-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wj-body{flex:1;overflow-y:auto;padding:0 0 24px}
.wj-body::-webkit-scrollbar{width:9px;height:9px}
.wj-body::-webkit-scrollbar-track{background:transparent}
.wj-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.wj-page{max-width:640px;margin:0 auto}

/* 头部 */
.wj-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.wj-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#58A6FF,#A371F7);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.wj-tt{flex:1;min-width:0}
.wj-tt b{font-size:15px;display:block}
.wj-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.wj-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.wj-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.wj-dot.stale{background:#D29922}
.wj-dot.down{background:#F85149}
.wj-tabs{display:flex;gap:4px}
.wj-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.wj-tab:hover{color:#E6EAF2}
.wj-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.wj-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.wj-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.wj-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#58A6FF,#A371F7);flex-shrink:0}
.wj-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.wj-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.wj-card-b{padding:11px 13px}
.wj-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.wj-btn:hover{filter:brightness(1.1)}
.wj-btn:disabled{opacity:.45;cursor:not-allowed}
.wj-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.wj-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.wj-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.wj-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.wj-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.wj-inp:focus{outline:none;border-color:#2b6cb0}
.wj-inp::placeholder{color:#4d5566}
textarea.wj-inp{resize:vertical;min-height:60px;line-height:1.6}
.wj-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.wj-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.wj-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.wj-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.wj-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.wj-toast.bad{border-color:#54262c;color:#FF8A9A}
.wj-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.wj-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.wj-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.wj-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.wj-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.wj-tag.purple{background:#241b33;border-color:#3c2a58;color:#C9A7F5}
.wj-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.wj-row{display:flex;align-items:center;gap:8px;min-width:0}
.wj-grow{flex:1;min-width:0}
.wj-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.wj-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media (max-width:520px){.wj-grid2{grid-template-columns:1fr}}
.wj-chip{display:flex;flex-direction:column;align-items:center;gap:2px;background:#161B22;border:1px solid #242C3A;border-radius:10px;padding:8px 4px;min-width:0}
.wj-chip b{font-size:16px}
.wj-chip small{color:#8B95A7;font-size:9.5px;white-space:nowrap}
.wj-tl{position:relative;padding-left:16px}
.wj-tl::before{content:'';position:absolute;left:4px;top:4px;bottom:4px;width:2px;background:#242C3A;border-radius:1px}
.wj-tl-item{position:relative;padding:0 0 10px}
.wj-tl-item::before{content:'';position:absolute;left:-15px;top:5px;width:8px;height:8px;border-radius:50%;background:#58A6FF;border:2px solid #10141C}
.wj-tl-item.dim::before{background:#4d5566}
.wj-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.wj-tbl th{color:#8B95A7;font-weight:600;text-align:right;padding:5px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
.wj-tbl th:first-child{text-align:left}
.wj-tbl td{text-align:right;padding:5px 8px;border-bottom:1px solid #1c2230;white-space:nowrap}
.wj-tbl td:first-child{text-align:left}
.wj-tbl tr:last-child td{border-bottom:none}
.wj-num{font-variant-numeric:tabular-nums}
`

export type Tab = 'today' | 'apps' | 'insight' | 'settings'

export default function WenjinPanel() {
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<WenData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<WenData | null> => {
    try {
      const d = await loadWenjin(cacheRef.current)
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
    const timer = setInterval(poll, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const view = data ? buildView(data) : null
  const dueCount = view ? view.due.length : 0
  const metaTs = data && data.meta && data.meta.at ? core.parseTs(data.meta.at) : null
  const metaOk = metaTs != null && Date.now() - metaTs < 30 * 60 * 1000
  const dotCls = loadErr ? 'down' : metaOk ? 'ok' : 'stale'

  return (
    <div className="wj-root">
      <style>{css}</style>
      <div className="wj-top">
        <div className="wj-logo">💧</div>
        <div className="wj-tt">
          <b>求职台账</b>
          <small>
            <span className={`wj-dot ${dotCls}`} />
            {loadErr ? '连接失败' : metaOk ? '台账就绪' : '等待首次记录'}
            {' · '}求职记录全部保存在本机
          </small>
        </div>
        <div className="wj-tabs">
          {([
            ['today', '今日', dueCount],
            ['apps', '投递', 0],
            ['insight', '洞察', 0],
            ['settings', '设置', 0],
          ] as [Tab, string, number][]).map(([key, label, badge]) => (
            <button key={key} className={`wj-tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
              {label}
              {badge > 0 && key === 'today' ? <span className="wj-badge">{badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="wj-body">
        {loadErr ? <div className="wj-err">加载失败：{loadErr}</div> : null}
        {!data && !loadErr ? <div className="wj-empty">正在读取台账……</div> : null}
        {data && view ? (
          tab === 'today' ? <TodayTab data={data} view={view} reload={reload} toast={showToast} goTab={setTab} />
            : tab === 'apps' ? <AppsTab data={data} view={view} reload={reload} toast={showToast} />
              : tab === 'insight' ? <InsightTab data={data} view={view} />
                : <SettingsTab data={data} reload={reload} toast={showToast} />
        ) : null}
        <div className="wj-foot">
          求职台账 · 求职投递与面试作战台账 —— 只做记录、派生与提醒<br />
          不抓取招聘平台、不自动投递；洞察与 offer 对比不构成职业建议
        </div>
      </div>

      {toast ? <div className={`wj-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div> : null}
    </div>
  )
}
