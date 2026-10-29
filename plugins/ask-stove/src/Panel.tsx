/**
 * 食材管家面板外壳：头部（服务状态 + 五 Tab + 设置）+ 路由
 * 数据面：cap.kv stove.*（经宿主 invoke → router_dispatch），跨端一致。
 * 网络面：菜谱抓取经命令邮箱下发给后台服务，面板零直连外网。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadOverview, makeApi, timeAgo, type Api, type Overview, type Toast } from './model'
import TodayTab from './TodayTab'
import PantryTab from './PantryTab'
import RecipeTab from './RecipeTab'
import PlanTab from './PlanTab'
import ShoppingTab from './ShoppingTab'
import SettingsTab from './SettingsTab'

const css = `
.as-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.as-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.as-body{flex:1;overflow-y:auto;padding:0 0 24px}
.as-body::-webkit-scrollbar{width:9px;height:9px}
.as-body::-webkit-scrollbar-track{background:transparent}
.as-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.as-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#101820 75%,rgba(16,24,32,0))}
.as-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#FF9F43,#C0632B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.as-tt{flex:1;min-width:0}
.as-tt b{font-size:15px;display:block}
.as-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.as-dot{width:7px;height:7px;border-radius:50%;background:#3ddc84;box-shadow:0 0 6px #3ddc8488;flex-shrink:0}
.as-dot.bad{background:#F85149;box-shadow:0 0 6px #f8514988}
.as-tabs{display:flex;gap:4px;flex-wrap:wrap}
.as-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.as-tab:hover{color:#E6EAF2}
.as-tab.on{background:#26313f;color:#E6EAF2;font-weight:600}
.as-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.as-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#FF9F43,#C0632B);flex-shrink:0}
.as-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.as-card{background:#151d28;border:1px solid #263447;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.as-card-b{padding:11px 13px}
.as-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.as-btn{background:#C0632B;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.as-btn:hover{filter:brightness(1.12)}
.as-btn:disabled{opacity:.45;cursor:not-allowed}
.as-btn.ghost{background:#1c2836;color:#E6EAF2;border:1px solid #263447}
.as-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.as-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.as-btn.tiny{padding:2px 8px;font-size:10.5px;border-radius:6px}
.as-inp,.as-txa{background:#0d141e;border:1px solid #263447;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;font-family:inherit}
.as-txa{resize:vertical;min-height:52px;line-height:1.5}
.as-inp:focus,.as-txa:focus{outline:none;border-color:#C0632B}
.as-inp::placeholder,.as-txa::placeholder{color:#4d5566}
.as-inp.d{width:auto}
.as-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.as-sel{background:#0d141e;border:1px solid #263447;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;max-width:100%}
.as-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.as-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(21,29,40,.96);border:1px solid #263447;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.as-toast.bad{border-color:#54262c;color:#FF8A9A}
.as-badge{font-size:9.5px;padding:2px 8px;border-radius:999px;background:#1c2836;color:#8B95A7;border:1px solid #263447;white-space:nowrap;flex-shrink:0}
.as-badge.hot{color:#FFB4A6;border-color:#54262c;background:#2a1418}
.as-badge.soon{color:#F2C063;border-color:#54451c;background:#2a2414}
.as-badge.ok{color:#7ED9A2;border-color:#1d4433;background:#122418}
.as-item{display:flex;gap:8px;align-items:center;padding:8px 2px;border-top:1px solid #1b2735}
.as-item:first-child{border-top:none}
.as-item .main{flex:1;min-width:0}
.as-item .main b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-item .main small{color:#5C6678;font-size:10.5px;display:block;margin-top:1px}
.as-suggest{display:flex;gap:10px;align-items:flex-start;padding:10px 2px;border-top:1px solid #1b2735}
.as-suggest:first-child{border-top:none}
.as-rank{width:22px;height:22px;border-radius:7px;background:#26313f;color:#FFC98A;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.as-rank.first{background:linear-gradient(135deg,#C0632B,#8a4419);color:#fff}
.as-suggest .main{flex:1;min-width:0}
.as-suggest .main b{font-size:13px;display:block}
.as-suggest .main .why{color:#8B95A7;font-size:11px;margin-top:3px;line-height:1.5}
.as-suggest .main .miss{color:#F2C063;font-size:10.5px;margin-top:2px}
.as-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.as-chip{background:#1c2836;border:1px solid #263447;border-radius:999px;color:#B4B4B8;font-size:11px;padding:4px 11px;cursor:pointer;white-space:nowrap}
.as-chip:hover{border-color:#33507a}
.as-chip.on{background:#3a2417;border-color:#C0632B;color:#FFC98A;font-weight:600}
.as-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 16px 10px}
.as-stat{background:#151d28;border:1px solid #263447;border-radius:11px;padding:9px 6px;text-align:center;min-width:0;cursor:pointer}
.as-stat b{display:block;font-size:15px;font-variant-numeric:tabular-nums}
.as-stat small{font-size:9.5px;color:#8B95A7;display:block;margin-top:2px}
.as-stat .hot{color:#FFB4A6}
`

type TabId = 'today' | 'pantry' | 'recipes' | 'plan' | 'shopping' | 'settings'

export default function AskStovePanel(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [ov, setOv] = useState<Overview | null>(null)
  const [tab, setTab] = useState<TabId>('today')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  const showToast: Toast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(() => {
    loadOverview().then((o) => { if (alive.current) setOv(o) }).catch((e) => showToast(e.message, true))
  }, [showToast])

  useEffect(() => {
    alive.current = true
    reload()
    const t = setInterval(reload, 60_000) // 心跳/临期随时间变化，1 分钟轻刷
    return () => { alive.current = false; clearInterval(t) }
  }, [reload])

  if (!ov) {
    return (
      <div className="as-root">
        <div className="as-empty">灶房点灯中……</div>
      </div>
    )
  }

  const api: Api = makeApi(reload)
  const metaFresh = ov.meta && ov.meta.lastTickAt && (Date.now() - ov.meta.lastTickAt) < 5 * 60_000
  const expiringN = core_countExpiring(ov)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'today', label: '今日' },
    { id: 'pantry', label: `库存${expiringN > 0 ? ` ${expiringN}` : ''}` },
    { id: 'recipes', label: `菜谱${ov.recipes.order.length ? ` ${ov.recipes.order.length}` : ''}` },
    { id: 'plan', label: '本周' },
    { id: 'shopping', label: `采购${ov.shopping.items.filter((x) => !x.done).length ? ` ${ov.shopping.items.filter((x) => !x.done).length}` : ''}` },
    { id: 'settings', label: '设置' },
  ]

  return (
    <div className="as-root">
      <style>{css}</style>
      <div className="as-top">
        <div className="as-logo">🍲</div>
        <div className="as-tt">
          <b>食材管家</b>
          <small>
            <span className="as-dot" style={{ display: 'inline-block', marginRight: 5, ...(metaFresh ? {} : { background: '#F85149', boxShadow: 'none' }) }} />
            {metaFresh ? `服务在线 · ${timeAgo(ov.meta!.lastTickAt!)}` : '服务未连上（可在设置里重启）'}
          </small>
        </div>
        <div className="as-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`as-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="as-body">
        {tab === 'today' && <TodayTab ov={ov} api={api} toast={showToast} goTab={setTab} />}
        {tab === 'pantry' && <PantryTab ov={ov} api={api} toast={showToast} />}
        {tab === 'recipes' && <RecipeTab ov={ov} api={api} toast={showToast} onSendToChat={props.onSendToChat} goTab={setTab} />}
        {tab === 'plan' && <PlanTab ov={ov} api={api} toast={showToast} />}
        {tab === 'shopping' && <ShoppingTab ov={ov} api={api} toast={showToast} />}
        {tab === 'settings' && <SettingsTab ov={ov} api={api} toast={showToast} />}
      </div>
      {toast && <div className={`as-toast${toast.bad ? ' bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function core_countExpiring(ov: Overview): number {
  // 避免引入整个 core 到外壳：这里直接按 settings 窗口数一遍
  const days = ov.settings.expiringDays
  const now = Date.now()
  return ov.pantry.items.filter((it) => it.expiresAt && it.expiresAt <= now + days * 86400_000).length
}
