/**
 * 人情账本面板外壳：头部（人情速览）+ 五 Tab（今日 / 人情账本 / 承诺 / 往来 / 设置）
 * 数据面：cap.kv tether.*（经宿主 invoke → router_dispatch），跨端同一本账。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadPanelData, driftList, birthdayUpcoming, promiseBoard,
  type PanelData,
} from './model'
import TodayTab from './TodayTab'
import PeopleTab from './PeopleTab'
import PromisesTab from './PromisesTab'
import JournalTab from './JournalTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const css = `
.tr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.tr-body::-webkit-scrollbar{width:9px;height:9px}
.tr-body::-webkit-scrollbar-track{background:transparent}
.tr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.tr-page{max-width:520px;margin:0 auto}
.tr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.tr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2DD4BF,#0F766E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.tr-tt{flex:1;min-width:0}
.tr-tt b{font-size:15px;display:block}
.tr-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.tr-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.tr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.tr-tab:hover{color:#E6EAF2}
.tr-tab.on{background:#13272B;color:#7EE8D8;font-weight:600}
.tr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.tr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2DD4BF,#0F766E);flex-shrink:0}
.tr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.tr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.tr-card-b{padding:11px 13px}
.tr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.tr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tr-btn{background:#0F766E;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.tr-btn:hover{filter:brightness(1.15)}
.tr-btn:disabled{opacity:.45;cursor:not-allowed}
.tr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.tr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.tr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.tr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.tr-inp:focus{outline:none;border-color:#0F766E}
.tr-inp::placeholder{color:#4d5566}
.tr-inp.date{color-scheme:dark}
.tr-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.tr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.tr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.tr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.tr-toast.bad{border-color:#54262c;color:#FF8A9A}
.tr-toast.good{border-color:#2b4a35;color:#7EE2A0}
.tr-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.tr-chip:hover{border-color:#3a4356}
.tr-chip.on{background:#13272B;border-color:#0F766E;color:#7EE8D8;font-weight:600}
.tr-avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}
.tr-person{display:flex;align-items:center;gap:10px;padding:9px 13px;border-top:1px solid #1d2330;cursor:pointer}
.tr-person:first-child{border-top:none}
.tr-person:hover{background:#1a2029}
.tr-person-main{flex:1;min-width:0}
.tr-person-main b{font-size:12.5px;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap}
.tr-person-main small{color:#5C6678;font-size:10.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;display:inline-block}
.tr-dot.warn{background:#D29922}
.tr-dot.lost{background:#F85149}
.tr-tag{background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;color:#8B95A7;font-size:10px;padding:1px 6px;flex-shrink:0}
.tr-event{display:flex;gap:9px;padding:7px 2px;border-top:1px solid #1d2330;align-items:flex-start}
.tr-event:first-child{border-top:none}
.tr-event-body{flex:1;min-width:0}
.tr-event-body b{font-size:12px;display:block}
.tr-event-body small{color:#5C6678;font-size:10px}
.tr-kind{background:#1C2330;border-radius:6px;color:#8B95A7;font-size:10px;padding:2px 7px;flex-shrink:0;margin-top:2px}
.tr-kind.favor-gave{color:#F2C063}
.tr-kind.favor-got{color:#7EE2A0}
.tr-promise{display:flex;align-items:center;gap:9px;padding:8px 2px;border-top:1px solid #1d2330}
.tr-promise:first-child{border-top:none}
.tr-promise-main{flex:1;min-width:0}
.tr-promise-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-promise-main small{color:#5C6678;font-size:10.5px}
.tr-due{font-size:10.5px;padding:2px 8px;border-radius:999px;flex-shrink:0;white-space:nowrap}
.tr-due.overdue{background:#3a1d22;color:#FF8A9A}
.tr-due.dueSoon{background:#3a2b14;color:#F2C063}
.tr-due.scheduled{background:#13272B;color:#7EE8D8}
.tr-due.none{background:#1C2330;color:#5C6678}
.tr-dir{font-size:10px;border-radius:6px;padding:1px 6px;flex-shrink:0}
.tr-dir.iowe{background:#3a1d22;color:#FF8A9A}
.tr-dir.owedme{background:#16301f;color:#7EE2A0}
.tr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.tr-field:first-child{border-top:none}
.tr-field-l{flex:1;min-width:0}
.tr-field-l b{font-size:12.5px;display:block}
.tr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.tr-num{width:86px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.tr-detail-head{display:flex;align-items:center;gap:11px;padding:12px 13px}
.tr-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;padding:4px 13px 10px}
.tr-detail-grid div{min-width:0}
.tr-detail-grid span{font-size:10px;color:#5C6678;display:block}
.tr-detail-grid b{font-size:12px;font-weight:600;word-break:break-all}
.tr-back{background:#232834;border:1px solid #2a2f3a;color:#E6EAF2;border-radius:8px;width:30px;height:26px;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0}
.tr-actions{display:flex;gap:6px;flex-wrap:wrap;padding:2px 13px 12px}
.tr-form{border-top:1px solid #1d2330;padding:10px 13px;background:#131820}
.tr-form .tr-row{margin-bottom:6px}
.tr-bars{display:flex;align-items:flex-end;gap:3px;height:88px;padding:6px 2px 0}
.tr-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.tr-barcol i{display:block;width:100%;max-width:16px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#2DD4BF,#0F766E);min-height:2px}
.tr-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.tr-dayhead{display:flex;align-items:center;gap:8px;padding:10px 2px 4px;font-size:10.5px;color:#5C6678}
.tr-dayhead b{color:#8B95A7}
`

type Tab = 'today' | 'people' | 'promises' | 'journal' | 'stats' | 'settings'

export interface TabProps {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: (msg: string, kind?: 'bad' | 'good') => void
  selectedPersonId: string | null
  setSelectedPersonId: (id: string | null) => void
  setTab: (t: Tab) => void
}

export default function TetherPanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind?: 'bad' | 'good') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
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
    const timer = setInterval(poll, 8000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  // 头部速览：待闭环 + 预警数
  const summary = (() => {
    if (!data) return '载入中…'
    const now = Date.now()
    const board = promiseBoard(data.promisesBook.byId, data.peopleBook.byId, now, data.settings)
    const drift = driftList(data.peopleBook.byId, data.journalBook.events, data.settings, now)
    const lost = drift.filter((d) => d.level === 'lost').length
    const warn = drift.filter((d) => d.level === 'warn').length
    const openN = board.overdue.length + board.dueSoon.length + board.scheduled.length + board.openNoDue.length
    const active = Object.values(data.peopleBook.byId).filter((p) => !p.archivedAt).length
    return `${active} 位人情账本 · ${openN} 条待闭环 · 预警 ${lost ? `${lost} 红` : ''}${lost && warn ? '+' : ''}${warn ? `${warn} 黄` : ''}${!lost && !warn ? '无' : ''}`
  })()

  const tabProps: TabProps = {
    data, reload, showToast, selectedPersonId, setSelectedPersonId, setTab,
  }

  return (
    <div className="tr-root">
      <style>{css}</style>
      <div className="tr-top">
        <div className="tr-logo">🏮</div>
        <div className="tr-tt">
          <b>人情账本</b>
          <small>{summary}</small>
        </div>
        <div className="tr-tabs">
                    {([
            ['today', '今日'],
            ['people', '人情账本'],
            ['promises', '承诺'],
            ['journal', '往来'],
            ['stats', '透视'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`tr-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="tr-body">
        <div className="tr-page">
          {loadErr && <div className="tr-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'today' && <TodayTab {...tabProps} />}
          {tab === 'people' && <PeopleTab {...tabProps} />}
          {tab === 'promises' && <PromisesTab {...tabProps} />}
          {tab === 'journal' && <JournalTab {...tabProps} />}
          {tab === 'stats' && <StatsTab {...tabProps} />}
          {tab === 'settings' && <SettingsTab {...tabProps} />}
        </div>
      </div>
      {toast && <div className={`tr-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
