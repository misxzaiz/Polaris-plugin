/**
 * 消费账单面板外壳：头部 + 四 Tab（导入 / 总览 / 明细 / 规则）
 *
 * 数据源：cap.kv duzhi.* 键空间（经宿主 invoke → router_dispatch）。
 * 无后台服务——账单解析（zip/GBK/双平台 CSV）与消费透视全部经 shared/core
 * 本地现算（与 MCP 同源同口径）。轮询：可见时每 15s 一轮（键集 diff + 90s
 * 全量兜底），账单数据低频变化，不必高频拉大分片。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDuizhi, newCache, type CacheState, type DuizhiData } from './model'
import ImportTab from './ImportTab'
import OverviewTab from './OverviewTab'
import DetailTab from './DetailTab'
import RulesTab from './RulesTab'

const css = `
.dz-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dz-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dz-body::-webkit-scrollbar{width:9px;height:9px}
.dz-body::-webkit-scrollbar-track{background:transparent}
.dz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dz-page{max-width:640px;margin:0 auto}

/* 头部 */
.dz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7A5C1F,#9E8A2E);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dz-tt{flex:1;min-width:0}
.dz-tt b{font-size:15px;display:block}
.dz-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.dz-tabs{display:flex;gap:4px}
.dz-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.dz-tab:hover{color:#E6EAF2}
.dz-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* 通用 */
.dz-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dz-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#B08A2E,#D4B45A);flex-shrink:0}
.dz-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dz-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dz-card-b{padding:11px 13px}
.dz-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dz-btn:hover{filter:brightness(1.1)}
.dz-btn:disabled{opacity:.45;cursor:not-allowed}
.dz-btn.gold{background:#5C4A1F;color:#EAD48A}
.dz-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dz-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dz-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dz-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dz-inp:focus{outline:none;border-color:#2b6cb0}
.dz-inp::placeholder{color:#4d5566}
.dz-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.dz-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.dz-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dz-err{color:#F85149;font-size:11.5px;padding:8px 16px;line-height:1.7}
.dz-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.dz-toast.bad{border-color:#54262c;color:#FF8A9A}
.dz-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.dz-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.dz-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.dz-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.dz-tag.gold{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.dz-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dz-row{display:flex;align-items:center;gap:8px;min-width:0}
.dz-grow{flex:1;min-width:0}
.dz-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.dz-num{font-variant-numeric:tabular-nums}
.dz-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dz-stat{background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 11px}
.dz-stat b{display:block;font-size:15px;font-weight:700}
.dz-stat small{color:#8B95A7;font-size:10px}
.dz-hbar{height:8px;border-radius:4px;background:#12151c;overflow:hidden;margin-top:4px}
.dz-hbar>i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#B08A2E,#D4B45A)}
.dz-drop{margin:0 16px 10px;border:1.5px dashed #3a4356;border-radius:13px;padding:22px 16px;text-align:center;color:#8B95A7;font-size:12px;line-height:1.8;cursor:pointer;transition:border-color .15s,background .15s}
.dz-drop:hover,.dz-drop.over{border-color:#B08A2E;background:rgba(176,138,46,.06);color:#E6EAF2}
.dz-drop.dragging{border-color:#D4B45A}
`

export type Tab = 'import' | 'overview' | 'detail' | 'rules'

export interface TabProps {
  data: DuizhiData | null
  reload: () => Promise<DuizhiData | null>
  cache: CacheState
  showToast: (msg: string, bad?: boolean) => void
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function DuizhiPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('import')
  const [data, setData] = useState<DuizhiData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const reload = useCallback(async (): Promise<DuizhiData | null> => {
    try {
      const d = await loadDuizhi(cacheRef.current)
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

  const months = useMemo(() => {
    if (!data) return [] as string[]
    const set = new Set<string>()
    for (const t of data.txns) {
      const ym = t.date.slice(0, 7)
      if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym)
    }
    return [...set].sort().reverse()
  }, [data])

  const tabProps: TabProps = { data, reload, cache: cacheRef.current, showToast, pluginId, onSendToChat }

  return (
    <div className="dz-root">
      <style>{css}</style>
      <div className="dz-top">
        <div className="dz-logo">🧾</div>
        <div className="dz-tt">
          <b>消费账单</b>
          <small>家庭账单透视 · {data ? `${data.txns.length} 笔入账 · 数据仅存本机` : '加载中…'}</small>
        </div>
        <div className="dz-tabs">
          {([
            ['import', '导入'],
            ['overview', '总览'],
            ['detail', '明细'],
            ['rules', '规则'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`dz-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="dz-body">
        <div className="dz-page">
          {loadErr && <div className="dz-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'import' && <ImportTab {...tabProps} months={months} />}
          {tab === 'overview' && <OverviewTab {...tabProps} months={months} />}
          {tab === 'detail' && <DetailTab {...tabProps} months={months} />}
          {tab === 'rules' && <RulesTab {...tabProps} />}
          <div className="dz-foot">消费账单只做账单导入与统计透视：分类为关键词规则口径，与实际消费性质可能有出入；<br />不构成理财建议，金额以平台账单为准。零外网零账号，解压密码只在内存用一次，数据仅存本机（cap.kv）。</div>
        </div>
      </div>
      {toast && <div className={`dz-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
