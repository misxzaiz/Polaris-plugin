/**
 * 日常记账面板外壳：头部（本月余额速览）+ 四 Tab（记账 / 明细 / 统计 / 设置）
 * 数据面：cap.kv ledger.*（经宿主 invoke → router_dispatch），跨端同一本账。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadMonth, loadSettings, currentMonth, computeStats, shiftMonth, fmtMoney,
  type PanelData,
} from './model'
import QuickTab from './QuickTab'
import ListTab from './ListTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const css = `
.pl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.pl-body::-webkit-scrollbar{width:9px;height:9px}
.pl-body::-webkit-scrollbar-track{background:transparent}
.pl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.pl-page{max-width:520px;margin:0 auto}
.pl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.pl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E8A33D,#D2691E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.pl-tt{flex:1;min-width:0}
.pl-tt b{font-size:15px;display:block}
.pl-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.pl-balance{font-variant-numeric:tabular-nums}
.pl-balance b{color:#E6EAF2}
.pl-balance .neg{color:#F85149}
.pl-balance .pos{color:#3FB950}
.pl-tabs{display:flex;gap:4px}
.pl-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.pl-tab:hover{color:#E6EAF2}
.pl-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.pl-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.pl-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E8A33D,#D2691E);flex-shrink:0}
.pl-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.pl-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.pl-card-b{padding:11px 13px}
.pl-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.pl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pl-btn{background:#b0731f;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.pl-btn:hover{filter:brightness(1.1)}
.pl-btn:disabled{opacity:.45;cursor:not-allowed}
.pl-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.pl-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.pl-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.pl-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.pl-inp:focus{outline:none;border-color:#b0731f}
.pl-inp::placeholder{color:#4d5566}
.pl-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.pl-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.pl-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.pl-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pl-toast.bad{border-color:#54262c;color:#FF8A9A}
.pl-toast.good{border-color:#2b4a35;color:#7EE2A0}
.pl-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.pl-chip:hover{border-color:#3a4356}
.pl-chip.on{background:#3a2b14;border-color:#b0731f;color:#F2C063;font-weight:600}
.pl-toggle{display:flex;border:1px solid #2a2f3a;border-radius:9px;overflow:hidden;flex-shrink:0}
.pl-toggle button{border:none;background:#12151c;color:#8B95A7;font-size:12px;padding:7px 16px;cursor:pointer}
.pl-toggle button.on-exp{background:#3a1d22;color:#FF8A9A;font-weight:700}
.pl-toggle button.on-inc{background:#16301f;color:#7EE2A0;font-weight:700}
.pl-amount-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:10px;color:#E6EAF2;font-size:26px;font-weight:700;padding:9px 12px;width:100%;text-align:center;font-variant-numeric:tabular-nums}
.pl-amount-inp:focus{outline:none;border-color:#b0731f}
.pl-bill{display:flex;align-items:center;gap:9px;padding:8px 2px;border-top:1px solid #1d2330}
.pl-bill:first-child{border-top:none}
.pl-bill-main{flex:1;min-width:0}
.pl-bill-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-bill-main small{color:#5C6678;font-size:10px}
.pl-bill-amt{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;flex-shrink:0}
.pl-amt-exp{color:#FF8A9A}
.pl-amt-inc{color:#7EE2A0}
.pl-dayhead{display:flex;align-items:center;gap:8px;padding:10px 2px 4px;font-size:10.5px;color:#5C6678}
.pl-dayhead b{color:#8B95A7}
.pl-dayhead .sum{margin-left:auto;font-variant-numeric:tabular-nums}
.pl-budget{height:7px;border-radius:4px;background:#1C2330;overflow:hidden;margin-top:4px}
.pl-budget i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3FB950,#7EE2A0)}
.pl-budget i.warn{background:#D29922}
.pl-budget i.over{background:#F85149}
.pl-bars{display:flex;align-items:flex-end;gap:3px;height:88px;padding:6px 2px 0}
.pl-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.pl-barcol i{display:block;width:100%;max-width:16px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#E8A33D,#b0731f);min-height:2px}
.pl-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.pl-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.pl-field:first-child{border-top:none}
.pl-field-l{flex:1;min-width:0}
.pl-field-l b{font-size:12.5px;display:block}
.pl-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.pl-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.pl-monthnav{display:flex;align-items:center;gap:10px;padding:2px 18px 8px}
.pl-monthnav b{font-size:13px;flex:1;text-align:center}
.pl-navbtn{background:#232834;border:1px solid #2a2f3a;color:#E6EAF2;border-radius:8px;width:30px;height:26px;cursor:pointer;font-size:13px;line-height:1}
.pl-attlink{background:none;border:none;color:#7BA7E0;font-size:10px;cursor:pointer;padding:0;margin-left:2px}
.pl-attlink:hover{text-decoration:underline}
.pl-attmodal{position:fixed;inset:0;background:rgba(8,10,14,.72);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
.pl-attmodal-box{background:#161B22;border:1px solid #242C3A;border-radius:13px;max-width:min(92vw,560px);max-height:86vh;display:flex;flex-direction:column;overflow:hidden}
.pl-attmodal-head{display:flex;align-items:center;gap:10px;padding:10px 13px;border-bottom:1px solid #1d2330}
.pl-attmodal-head b{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-attmodal-body{overflow:auto;padding:12px;display:flex;align-items:center;justify-content:center;min-height:60px}
.pl-attmodal-body img{max-width:100%;max-height:70vh;border-radius:8px;display:block}
`

type Tab = 'quick' | 'list' | 'stats' | 'settings'

export default function LedgerPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('quick')
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind?: 'bad' | 'good') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const reload = useCallback(async (m = month): Promise<PanelData | null> => {
    try {
      const settings = await loadSettings()
      const { bills } = await loadMonth(m)
      const stats = computeStats(bills, settings, m)
      const d = { settings, month: m, bills, stats }
      setData(d)
      setLoadErr('')
      return d
    } catch (e) {
      setLoadErr((e as Error).message)
      return null
    }
  }, [month])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState === 'hidden' || !alive) return
      await reload()
    }
    poll()
    const timer = setInterval(poll, 8000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const switchMonth = (delta: number) => {
    const m = shiftMonth(month, delta)
    setMonth(m)
    reload(m)
  }

  const todayBalance = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const b = data.stats.balance
    return { cls: b < 0 ? 'neg' : 'pos', text: `本月结余 ${fmtMoney(Math.abs(b), data.settings.currencySymbol)}${b < 0 ? ' 超支' : ''}` }
  })()

  return (
    <div className="pl-root">
      <style>{css}</style>
      <div className="pl-top">
        <div className="pl-logo">📒</div>
        <div className="pl-tt">
          <b>日常记账</b>
          <small className={`pl-balance ${todayBalance.cls}`}>{todayBalance.text}</small>
        </div>
        <div className="pl-tabs">
          {([
            ['quick', '记账'],
            ['list', '明细'],
            ['stats', '统计'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`pl-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="pl-body">
        <div className="pl-page">
          {loadErr && <div className="pl-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'quick' && <QuickTab data={data} reload={reload} showToast={showToast} />}
          {tab === 'list' && (
            <ListTab data={data} month={month} switchMonth={switchMonth} reload={reload} showToast={showToast} />
          )}
          {tab === 'stats' && <StatsTab data={data} month={month} switchMonth={switchMonth} />}
          {tab === 'settings' && <SettingsTab data={data} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`pl-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
