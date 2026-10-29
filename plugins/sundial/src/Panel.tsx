/**
 * 日程提醒面板外壳：头部（状态/心跳）+ 四 Tab（今日 / 日历 / 事件 / 设置）
 *
 * 数据源：cap.kv sundial.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；ICS 订阅抓取由后台服务原生执行（跨域问题的根本解法）。
 * 轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 * 提醒触达：到期提醒由服务写投影，面板横幅展示 + 提示音（WebAudio，无系统通知通道前的应用内方案）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSundial, newCache, type CacheState, type SundialData } from './model'
import TodayTab from './TodayTab'
import MonthTab from './MonthTab'
import EventsTab from './EventsTab'
import SettingsTab from './SettingsTab'

const css = `
.sd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sd-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sd-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sd-body::-webkit-scrollbar{width:9px;height:9px}
.sd-body::-webkit-scrollbar-track{background:transparent}
.sd-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sd-page{max-width:560px;margin:0 auto}

/* 头部 */
.sd-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.sd-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C77B3F,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.sd-tt{flex:1;min-width:0}
.sd-tt b{font-size:15px;display:block}
.sd-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.sd-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.sd-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.sd-dot.stale{background:#D29922}
.sd-dot.down{background:#F85149}
.sd-tabs{display:flex;gap:4px}
.sd-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.sd-tab:hover{color:#E6EAF2}
.sd-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.sd-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.sd-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sd-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#C77B3F,#58A6FF);flex-shrink:0}
.sd-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sd-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sd-card-b{padding:11px 13px}
.sd-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.sd-btn:hover{filter:brightness(1.1)}
.sd-btn:disabled{opacity:.45;cursor:not-allowed}
.sd-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.sd-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.sd-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.sd-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.sd-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.sd-inp:focus{outline:none;border-color:#2b6cb0}
.sd-inp::placeholder{color:#4d5566}
.sd-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.sd-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.sd-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.sd-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.sd-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.sd-toast.bad{border-color:#54262c;color:#FF8A9A}
.sd-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.sd-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
`

type Tab = 'today' | 'month' | 'events' | 'settings'

export default function SundialPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  void onSendToChat
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<SundialData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const seenRemindRef = useRef<Set<string>>(new Set())
  const firstRemindLoadRef = useRef(true)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<SundialData | null> => {
    try {
      const d = await loadSundial(cacheRef.current)
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

  // 提醒提示音：新 reminder id 出现（首载不算）且面板可见时，短促双音
  useEffect(() => {
    if (!data) return
    const ids = new Set(data.reminders.map((r) => r.id))
    if (firstRemindLoadRef.current) {
      firstRemindLoadRef.current = false
      seenRemindRef.current = ids
      return
    }
    const fresh = [...ids].filter((id) => !seenRemindRef.current.has(id))
    seenRemindRef.current = ids
    if (!fresh.length || document.visibilityState !== 'visible') return
    try {
      type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }
      const w = window as AudioWindow
      const Ctx = window.AudioContext || w.webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      const play = (freq: number, at: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.001, at)
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.28)
        osc.connect(gain).connect(ctx.destination)
        osc.start(at)
        osc.stop(at + 0.3)
      }
      const t = ctx.currentTime
      play(880, t)
      play(1175, t + 0.18)
    } catch (_) { /* 自动播放策略限制时静默（横幅仍在） */ }
  }, [data])

  // 心跳判定：sundial.meta 60s 一跳；3 分钟内 = 运行中
  const heartbeat = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const last = data.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳' }
    const age = Date.now() - last
    if (age < 180 * 1000) return { cls: 'ok', text: `日程提醒在线 · ${data.events.length} 事件 · 桥 ${data.meta?.bridge || '?'}` }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  const remindCount = data
    ? data.reminders.filter((r) => !data.acked[r.id] || data.acked[r.id] <= r.remindAt).length
    : 0

  return (
    <div className="sd-root">
      <style>{css}</style>
      <div className="sd-top">
        <div className="sd-logo">🌞</div>
        <div className="sd-tt">
          <b>日程提醒</b>
          <small>
            <i className={`sd-dot ${heartbeat.cls}`} />
            {heartbeat.text}
          </small>
        </div>
        <div className="sd-tabs">
          {([
            ['today', '今日'],
            ['month', '日历'],
            ['events', '事件'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`sd-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'today' && remindCount > 0 && <span className="sd-badge">{remindCount > 9 ? '9+' : remindCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="sd-body">
        <div className="sd-page">
          {loadErr && <div className="sd-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'today' && <TodayTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'month' && <MonthTab data={data} />}
          {tab === 'events' && <EventsTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'settings' && <SettingsTab pluginId={pluginId} data={data} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`sd-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
