/**
 * 用药管家面板外壳：头部（状态/心跳）+ 四 Tab（今日 / 药箱 / 方案 / 设置）
 *
 * 数据源：cap.kv qingnang.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求、零本地库存派生——库存/效期/补货全部读服务端 qingnang.stocks 快照。
 * 轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 * 提醒触达：应服未打卡由服务写投影，面板横幅 + 提示音（WebAudio；平台无系统通知
 * 通道前的应用内方案，与日晷一致）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadQingnan, newCache, type CacheState, type QingData } from './model'
import TodayTab from './TodayTab'
import CabinetTab from './CabinetTab'
import PlansTab from './PlansTab'
import SettingsTab from './SettingsTab'

const css = `
.qn-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qn-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qn-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qn-body::-webkit-scrollbar{width:9px;height:9px}
.qn-body::-webkit-scrollbar-track{background:transparent}
.qn-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qn-page{max-width:560px;margin:0 auto}

/* 头部 */
.qn-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qn-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3FB950,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.qn-tt{flex:1;min-width:0}
.qn-tt b{font-size:15px;display:block}
.qn-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.qn-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.qn-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.qn-dot.stale{background:#D29922}
.qn-dot.down{background:#F85149}
.qn-tabs{display:flex;gap:4px}
.qn-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.qn-tab:hover{color:#E6EAF2}
.qn-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qn-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.qn-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.qn-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3FB950,#58A6FF);flex-shrink:0}
.qn-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.qn-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.qn-card-b{padding:11px 13px}
.qn-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.qn-btn:hover{filter:brightness(1.1)}
.qn-btn:disabled{opacity:.45;cursor:not-allowed}
.qn-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.qn-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.qn-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.qn-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.qn-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.qn-inp:focus{outline:none;border-color:#2b6cb0}
.qn-inp::placeholder{color:#4d5566}
.qn-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.qn-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.qn-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.qn-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.qn-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.qn-toast.bad{border-color:#54262c;color:#FF8A9A}
.qn-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.qn-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.qn-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.qn-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.qn-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.qn-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.qn-row{display:flex;align-items:center;gap:8px;min-width:0}
.qn-grow{flex:1;min-width:0}
.qn-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
`

export type Tab = 'today' | 'cabinet' | 'plans' | 'settings'

export default function QingnanPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<QingData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const seenDoseRef = useRef<Set<string>>(new Set())
  const firstDoseLoadRef = useRef(true)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<QingData | null> => {
    try {
      const d = await loadQingnan(cacheRef.current)
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

  // 应服提示音：新 occKey 出现（首载不算）且面板可见时，三连音（药事场景比日程更醒耳）
  useEffect(() => {
    if (!data || !data.doses) return
    const ids = new Set(data.doses.items.map((i) => i.occKey))
    if (firstDoseLoadRef.current) {
      firstDoseLoadRef.current = false
      seenDoseRef.current = ids
      return
    }
    const fresh = [...ids].filter((id) => !seenDoseRef.current.has(id))
    seenDoseRef.current = ids
    if (!fresh.length || document.visibilityState !== 'visible') return
    if (data.settings.soundOn === false) return
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
        gain.gain.exponentialRampToValueAtTime(0.14, at + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3)
        osc.connect(gain).connect(ctx.destination)
        osc.start(at)
        osc.stop(at + 0.32)
      }
      const t = ctx.currentTime
      play(784, t)
      play(988, t + 0.2)
      play(1175, t + 0.4)
    } catch (_) { /* 自动播放策略限制时静默（横幅仍在） */ }
  }, [data])

  // 心跳判定：qingnang.meta 60s 一跳；3 分钟内 = 运行中
  const heartbeat = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const last = data.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳（可在设置里启动服务）' }
    const age = Date.now() - last
    if (age < 180 * 1000) {
      const c = data.meta?.counts
      return { cls: 'ok', text: `用药管家在线 · ${c ? `${c.profiles}成员 ${c.meds}药 ${c.regimens}方案` : ''} · 桥 ${data.meta?.bridge || '?'}` }
    }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  const alertCount = data && data.doses && data.doses.date === (data.stocks ? data.stocks.today : '')
    ? data.doses.items.length
    : (data && data.doses ? data.doses.items.length : 0)

  return (
    <div className="qn-root">
      <style>{css}</style>
      <div className="qn-top">
        <div className="qn-logo">💊</div>
        <div className="qn-tt">
          <b>用药管家</b>
          <small>
            <i className={`qn-dot ${heartbeat.cls}`} />
            {heartbeat.text}
          </small>
        </div>
        <div className="qn-tabs">
          {([
            ['today', '今日'],
            ['cabinet', '药箱'],
            ['plans', '方案'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`qn-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'today' && alertCount > 0 && <span className="qn-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="qn-body">
        <div className="qn-page">
          {loadErr && <div className="qn-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'today' && <TodayTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} onSendToChat={onSendToChat} />}
          {tab === 'cabinet' && <CabinetTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} />}
          {tab === 'plans' && <PlansTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} pluginId={pluginId} onSendToChat={onSendToChat} />}
          <div className="qn-foot">用药管家是家庭药事记录工具，不提供医疗建议——相互作用与剂量调整请咨询医生药师。数据仅存本机（cap.kv）。</div>
        </div>
      </div>
      {toast && <div className={`qn-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
