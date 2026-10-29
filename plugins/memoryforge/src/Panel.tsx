/**
 * 记忆卡片面板外壳：头部（连击/今日进度速览）+ 四 Tab（复习 / 卡库 / 统计 / 设置）
 * 数据面：cap.kv memoryforge.*（经宿主 invoke → router_dispatch），跨端同一副牌。
 * 计算权威：shared/srs-core.js（与 MCP 同源）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSnapshot, type Snapshot } from './model'
import ReviewTab from './ReviewTab'
import LibraryTab from './LibraryTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const css = `
.mf-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.mf-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mf-body{flex:1;overflow-y:auto;padding:0 0 24px}
.mf-body::-webkit-scrollbar{width:9px;height:9px}
.mf-body::-webkit-scrollbar-track{background:transparent}
.mf-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.mf-page{max-width:520px;margin:0 auto}
.mf-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#141017 75%,rgba(20,16,23,0))}
.mf-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E45858,#C0392B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.mf-tt{flex:1;min-width:0}
.mf-tt b{font-size:15px;display:block}
.mf-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.mf-tt small b{display:inline;font-size:10.5px;color:#F2A063}
.mf-tabs{display:flex;gap:4px}
.mf-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.mf-tab:hover{color:#E6EAF2}
.mf-tab.on{background:#2A1E22;color:#E6EAF2;font-weight:600}
.mf-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.mf-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E45858,#C0392B);flex-shrink:0}
.mf-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.mf-card{background:#1A1520;border:1px solid #2C2433;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.mf-card-b{padding:11px 13px}
.mf-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.mf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mf-btn{background:#C0392B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.mf-btn:hover{filter:brightness(1.12)}
.mf-btn:disabled{opacity:.45;cursor:not-allowed}
.mf-btn.ghost{background:#241C2E;color:#E6EAF2;border:1px solid #322841}
.mf-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.mf-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.mf-inp,.mf-txa{background:#120E1A;border:1px solid #322841;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;font-family:inherit}
.mf-txa{resize:vertical;min-height:52px;line-height:1.5}
.mf-inp:focus,.mf-txa:focus{outline:none;border-color:#C0392B}
.mf-inp::placeholder,.mf-txa::placeholder{color:#4d4556}
.mf-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.mf-sel{background:#120E1A;border:1px solid #322841;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;max-width:100%}
.mf-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.mf-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(26,21,32,.96);border:1px solid #2C2433;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.mf-toast.bad{border-color:#54262c;color:#FF8A9A}
.mf-toast.good{border-color:#4a3520;color:#F2C063}
.mf-chip{background:#241C2E;border:1px solid #322841;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.mf-chip:hover{border-color:#453757}
.mf-chip.on{background:#3d1f22;border-color:#C0392B;color:#F2A063;font-weight:600}
.mf-num{width:86px;background:#120E1A;border:1px solid #322841;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.mf-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #241C2E}
.mf-field:first-child{border-top:none}
.mf-field-l{flex:1;min-width:0}
.mf-field-l b{font-size:12.5px;display:block}
.mf-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.mf-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 16px 10px}
.mf-stat{background:#1A1520;border:1px solid #2C2433;border-radius:11px;padding:9px 6px;text-align:center;min-width:0}
.mf-stat b{display:block;font-size:17px;font-variant-numeric:tabular-nums}
.mf-stat small{font-size:9.5px;color:#8B95A7;display:block;margin-top:2px}
.mf-stat .hot{color:#F2A063}
.mf-bars{display:flex;align-items:flex-end;gap:3px;height:88px;padding:6px 2px 0}
.mf-bars.tall{height:110px}
.mf-barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.mf-barcol i{display:block;width:100%;max-width:16px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#E45858,#C0392B);min-height:2px}
.mf-barcol.ghost i{background:#332841}
.mf-barcol small{font-size:8.5px;color:#5C6678;transform:scale(.85)}
.mf-barcol em{font-size:9px;color:#8B95A7;font-style:normal;font-variant-numeric:tabular-nums}
.mf-deckline{display:flex;align-items:center;gap:9px;padding:8px 2px;border-top:1px solid #241C2E}
.mf-deckline:first-child{border-top:none}
.mf-deckline .nm{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-deckline .ct{font-variant-numeric:tabular-nums;color:#8B95A7;font-size:11px;flex-shrink:0}
.mf-prog{height:6px;border-radius:4px;background:#241C2E;overflow:hidden;width:64px;flex-shrink:0}
.mf-prog i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#E45858,#F2A063)}
/* 复习卡片 */
.mf-stage{margin:0 16px 10px}
.mf-flash{background:linear-gradient(160deg,#221A2B,#1A1520);border:1px solid #322841;border-radius:16px;padding:22px 18px;min-height:190px;display:flex;flex-direction:column;cursor:pointer;position:relative;overflow:hidden}
.mf-flash::before{content:'';position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,#E45858,#F2A063)}
.mf-flash .meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.mf-badge{font-size:9.5px;padding:2px 8px;border-radius:999px;background:#241C2E;color:#8B95A7;border:1px solid #322841;white-space:nowrap}
.mf-badge.warn{color:#F2A063;border-color:#4a3520}
.mf-badge.over{color:#FF8A9A;border-color:#54262c}
.mf-flash .front{font-size:16px;font-weight:700;line-height:1.65;word-break:break-word;white-space:pre-wrap}
.mf-flash .back{margin-top:14px;padding-top:14px;border-top:1px dashed #322841;font-size:13.5px;line-height:1.75;color:#C9CFDC;word-break:break-word;white-space:pre-wrap}
.mf-flash .tap{margin-top:auto;padding-top:14px;font-size:10.5px;color:#5C6678;text-align:center}
.mf-grades{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}
.mf-grade{border:1px solid #322841;background:#1E1728;color:#C9CFDC;border-radius:10px;padding:9px 2px 7px;font-size:12px;cursor:pointer;text-align:center;min-width:0}
.mf-grade:hover{border-color:#C0392B;color:#fff}
.mf-grade b{display:block;font-size:12.5px}
.mf-grade small{display:block;font-size:9px;color:#8B95A7;margin-top:2px}
.mf-grade.again:hover{border-color:#F85149;color:#FF8A9A}
.mf-grade.easy:hover{border-color:#3FB950;color:#7EE2A0}
.mf-progress{display:flex;align-items:center;gap:8px;padding:2px 2px 8px;font-size:10.5px;color:#8B95A7}
.mf-progress .track{flex:1;height:5px;border-radius:3px;background:#241C2E;overflow:hidden}
.mf-progress .track i{display:block;height:100%;background:linear-gradient(90deg,#E45858,#F2A063);border-radius:3px}
/* 卡库行 */
.mf-crow{border-top:1px solid #241C2E;padding:9px 2px}
.mf-crow:first-child{border-top:none}
.mf-crow .head{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.mf-crow .main{flex:1;min-width:0}
.mf-crow .main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-crow .main small{color:#5C6678;font-size:10.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.mf-crow .due{font-size:10px;color:#8B95A7;flex-shrink:0;font-variant-numeric:tabular-nums}
.mf-crow .due.over{color:#FF8A9A}
.mf-crow .detail{margin-top:9px;padding-top:9px;border-top:1px dashed #2C2433}
.mf-crow .full{font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.mf-crow .full.ans{color:#C9CFDC;margin-top:6px}
.mf-crow .stats-line{font-size:10px;color:#5C6678;margin-top:7px;line-height:1.6}
.mf-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
@media (max-width:430px){.mf-grid{grid-template-columns:repeat(3,1fr)}.mf-tabs .mf-tab{padding:6px 7px}}
`

type Tab = 'review' | 'library' | 'stats' | 'settings'

export default function ForgePanel(_props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('review')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [loadedAt, setLoadedAt] = useState(0)
  const [toast, setToast] = useState<{ msg: string; kind?: 'bad' | 'good' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind?: 'bad' | 'good') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<Snapshot | null> => {
    try {
      const s = await loadSnapshot()
      setSnap(s)
      setLoadErr('')
      setLoadedAt(Date.now())
      return s
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
    if (!snap) return '载入中…'
    const st = snap.stats.streak
    const t = snap.stats.today
    return (
      <>
        🔥 连击 <b>{st}</b> 天 · 今日复习 {t.reviews}/新学 {t.newCards} · 到期 <b>{snap.stats.dueNow}</b>
      </>
    )
  })()

  return (
    <div className="mf-root">
      <style>{css}</style>
      <div className="mf-top">
        <div className="mf-logo">🔥</div>
        <div className="mf-tt">
          <b>记忆卡片</b>
          <small>{head}</small>
        </div>
        <div className="mf-tabs">
          {([
            ['review', '复习'],
            ['library', '卡库'],
            ['stats', '统计'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`mf-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mf-body">
        <div className="mf-page">
          {loadErr && <div className="mf-sub" style={{ color: '#F85149', padding: '8px 16px' }}>数据加载失败：{loadErr}</div>}
          {tab === 'review' && <ReviewTab snap={snap} reload={reload} showToast={showToast} loadedAt={loadedAt} />}
          {tab === 'library' && <LibraryTab snap={snap} reload={reload} showToast={showToast} />}
          {tab === 'stats' && <StatsTab snap={snap} />}
          {tab === 'settings' && <SettingsTab snap={snap} reload={reload} showToast={showToast} />}
        </div>
      </div>
      {toast && <div className={`mf-toast ${toast.kind || ''}`}>{toast.msg}</div>}
    </div>
  )
}
