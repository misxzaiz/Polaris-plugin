/**
 * 灵犀面板外壳：头部（池子速览）+ 四 Tab（星图 / 回访 / 池子 / 统计）
 * 数据面：cap.kv lingxi.*（经宿主 invoke → router_dispatch），跨端同一个池子。
 * 计算全部走 shared/pond-core.js（与 MCP 同一权威）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadAllIdeas, dueRevisits, type Idea,
} from './model'
import StarMapTab from './StarMapTab'
import RevisitTab from './RevisitTab'
import PondTab from './PondTab'
import StatsTab from './StatsTab'
import DetailDrawer from './DetailDrawer'

const css = `
.lx-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6E9F2;height:100%;display:flex;flex-direction:column;background:transparent}
.lx-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.lx-body{flex:1;overflow-y:auto;padding:0 0 24px}
.lx-body::-webkit-scrollbar{width:9px;height:9px}
.lx-body::-webkit-scrollbar-track{background:transparent}
.lx-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.lx-page{max-width:560px;margin:0 auto}
.lx-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E1220 75%,rgba(14,18,32,0))}
.lx-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3B3270,#171E38 60%,#0E1220);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid #2E3A5C}
.lx-tt{flex:1;min-width:0}
.lx-tt b{font-size:15px;display:block}
.lx-tt small{color:#8B94A9;font-size:10.5px;display:block;margin-top:1px;cursor:pointer}
.lx-tt small.due{color:#F0B47A}
.lx-tabs{display:flex;gap:4px}
.lx-tab{background:transparent;border:none;color:#8B94A9;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.lx-tab:hover{color:#E6E9F2}
.lx-tab.on{background:#1D2436;color:#E6E9F2;font-weight:600}
.lx-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.lx-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8B7CF6,#5A4FB0);flex-shrink:0}
.lx-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.lx-card{background:#141927;border:1px solid #232B40;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.lx-card-b{padding:11px 13px}
.lx-sub{font-size:10.5px;color:#8B94A9;line-height:1.6}
.lx-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lx-btn{background:#5A4FB0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.lx-btn:hover{filter:brightness(1.12)}
.lx-btn:disabled{opacity:.45;cursor:not-allowed}
.lx-btn.ghost{background:#20263A;color:#E6E9F2;border:1px solid #2a3145}
.lx-btn.danger{background:#3a2030;color:#F08AA8;border:1px solid #542c3e}
.lx-btn.gold{background:#8a6d2f;color:#F7E3B0}
.lx-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.lx-inp{background:#10141f;border:1px solid #2a3145;border-radius:8px;color:#E6E9F2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.lx-inp:focus{outline:none;border-color:#8B7CF6}
.lx-inp::placeholder{color:#4d5566}
.lx-ta{resize:vertical;min-height:56px;font:inherit}
.lx-lbl{font-size:11px;color:#8B94A9;margin:8px 0 4px;display:block}
.lx-sel{background:#10141f;border:1px solid #2a3145;border-radius:8px;color:#E6E9F2;padding:7px 8px;font-size:12px}
.lx-empty{color:#8B94A9;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.lx-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(18,22,34,.96);border:1px solid #232B40;color:#E6E9F2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:220;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.lx-toast.bad{border-color:#542c3e;color:#F08AA8}
.lx-toast.good{border-color:#2b4a35;color:#7EE2A0}
.lx-chip{background:#1D2436;border:1px solid #2a3145;border-radius:999px;color:#B4B8C4;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.lx-chip:hover{border-color:#3a4356}
.lx-chip.on{background:#2b2650;border-color:#8B7CF6;color:#C9C0FA;font-weight:600}
.lx-mapwrap{position:relative;margin:0 16px 8px;border:1px solid #232B40;border-radius:13px;background:radial-gradient(ellipse at 50% 42%,#171E33 0%,#0E1220 70%);overflow:hidden}
.lx-mapwrap canvas{display:block;width:100%;cursor:crosshair}
.lx-legend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:6px 18px 2px;font-size:10px;color:#8B94A9}
.lx-legend i{display:inline-block;vertical-align:-2px;margin-right:3px;border-radius:50%}
.lx-badge{display:inline-block;font-size:10px;padding:1px 7px;border-radius:999px;background:#223047;color:#9FB6DD;white-space:nowrap}
.lx-badge.over{background:#3a2b1c;color:#F0B47A;font-weight:700}
.lx-badge.mat{background:#2b2650;color:#C9C0FA}
.lx-badge.done{background:#1e3a2b;color:#7EE2A0}
.lx-badge.arch{background:#252a36;color:#6E7686}
.lx-due-head{display:flex;align-items:center;gap:8px;padding:9px 13px 2px}
.lx-due-head b{font-size:12.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lx-due-q{margin:4px 13px 0;padding:7px 10px;border-left:2px solid #8B7CF6;background:#191E30;border-radius:0 8px 8px 0;font-size:11.5px;color:#C9C0FA;line-height:1.6}
.lx-due-raw{margin:6px 13px 0;font-size:11.5px;color:#8B94A9;line-height:1.6}
.lx-due-actions{display:flex;gap:6px;padding:9px 13px 12px;flex-wrap:wrap}
.lx-note{margin:8px 13px 0}
.lx-idea{display:flex;align-items:center;gap:9px;padding:9px 2px;border-top:1px solid #1c2333;cursor:pointer}
.lx-idea:first-child{border-top:none}
.lx-idea:hover{background:#171d2e}
.lx-idea-main{flex:1;min-width:0}
.lx-idea-main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lx-idea-main small{color:#5C6678;font-size:10px}
.lx-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.lx-funnel-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11.5px}
.lx-funnel-row .nm{width:52px;color:#8B94A9;flex-shrink:0}
.lx-funnel-row .tr{flex:1;height:12px;background:#10141f;border-radius:6px;overflow:hidden}
.lx-funnel-row .tr i{display:block;height:100%;background:linear-gradient(90deg,#5A4FB0,#8B7CF6);border-radius:6px}
.lx-funnel-row .ct{width:40px;text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0}
.lx-statgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:2px 0}
.lx-statcell{background:#10141f;border:1px solid #1f2740;border-radius:10px;padding:8px 6px;text-align:center}
.lx-statcell b{font-size:16px;display:block;font-variant-numeric:tabular-nums}
.lx-statcell small{font-size:9.5px;color:#8B94A9}
.lx-weeks{display:flex;align-items:flex-end;gap:4px;height:64px;padding:6px 2px 0}
.lx-weekcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.lx-weekcol i{display:block;width:100%;max-width:18px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#8B7CF6,#5A4FB0);min-height:2px}
.lx-weekcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.lx-drawer{position:fixed;inset:0;background:rgba(6,8,14,.66);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:16px}
.lx-drawer-box{background:#141927;border:1px solid #2a3450;border-radius:14px;width:100%;max-width:560px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden}
.lx-drawer-head{display:flex;align-items:flex-start;gap:10px;padding:12px 14px 8px;border-bottom:1px solid #1c2333}
.lx-drawer-head b{flex:1;min-width:0;font-size:13.5px;line-height:1.45;word-break:break-all}
.lx-drawer-body{overflow:auto;padding:10px 14px 16px}
.lx-drawer-body::-webkit-scrollbar{width:8px}
.lx-drawer-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:4px}
.lx-x{background:#20263A;border:1px solid #2a3145;color:#8B94A9;border-radius:8px;width:26px;height:26px;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0}
.lx-timeline{margin-top:6px}
.lx-tl-item{display:flex;gap:8px;padding:5px 0;border-top:1px dashed #202840;font-size:11px;line-height:1.55}
.lx-tl-item:first-child{border-top:none}
.lx-tl-item .k{flex-shrink:0;width:52px;color:#8B7CF6;font-size:10px;padding-top:1px}
.lx-tl-item .t{color:#AEB4C4;word-break:break-all}
.lx-tl-item .d{color:#5C6678;font-size:9.5px;flex-shrink:0;padding-top:1px}
.lx-relrow{padding:6px 0;border-top:1px dashed #202840;font-size:11.5px;cursor:pointer;line-height:1.5}
.lx-relrow:first-child{border-top:none}
.lx-relrow:hover{color:#C9C0FA}
.lx-editrow{display:flex;gap:6px;margin-top:6px}
`

type Tab = 'map' | 'revisit' | 'pond' | 'stats'

export default function LingxiPanel(props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const { onSendToChat } = props
  const [tab, setTab] = useState<Tab>('map')
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind?: 'bad' | 'good') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<Idea[]> => {
    try {
      const list = await loadAllIdeas()
      setIdeas(list)
      setLoadErr('')
      return list
    } catch (e) {
      setLoadErr((e as Error).message)
      return []
    }
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState === 'hidden' || !alive) return
      await reload()
    }
    poll()
    const timer = setInterval(poll, 10000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const now = Date.now()
  const list = ideas || []
  const dueCount = dueRevisits(list, now).length
  const activeCount = list.filter((i) => i.status === 'active').length
  const subtitleCls = dueCount > 0 ? 'due' : ''
  const subtitle = ideas === null
    ? '载入中…'
    : `在池 ${activeCount} · 今日回访 ${dueCount}${dueCount > 0 ? ' · 点此翻牌' : ''}`

  const sendToChat = useCallback((msg: string) => {
    if (onSendToChat) return onSendToChat(msg)
    showToast('该入口不支持唤起对话，请在对话里直接 @灵犀', 'bad')
    return undefined
  }, [onSendToChat, showToast])

  const openIdea = useCallback((id: string) => setOpenId(id), [])

  return (
    <div className="lx-root">
      <style>{css}</style>
      <div className="lx-top">
        <div className="lx-logo">🌌</div>
        <div className="lx-tt">
          <b>灵犀</b>
          <small className={subtitleCls} onClick={() => setTab('revisit')}>{subtitle}</small>
        </div>
        <div className="lx-tabs">
          {([
            ['map', '星图'],
            ['revisit', '回访'],
            ['pond', '池子'],
            ['stats', '统计'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`lx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="lx-body">
        <div className="lx-page">
          {loadErr && <div className="lx-sub" style={{ color: '#F08AA8', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'map' && <StarMapTab ideas={list} onOpenIdea={openIdea} />}
          {tab === 'revisit' && (
            <RevisitTab ideas={list} reload={reload} showToast={showToast} onOpenIdea={openIdea} onGotoCapture={() => setTab('pond')} />
          )}
          {tab === 'pond' && (
            <PondTab ideas={list} reload={reload} showToast={showToast} onOpenIdea={openIdea} onSendToChat={sendToChat} />
          )}
          {tab === 'stats' && <StatsTab ideas={list} />}
        </div>
      </div>
      {openId && (
        <DetailDrawer
          id={openId}
          reload={reload}
          showToast={showToast}
          onClose={() => setOpenId(null)}
          onSendToChat={sendToChat}
        />
      )}
      {toast && <div className={`lx-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
