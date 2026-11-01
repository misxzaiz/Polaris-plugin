/**
 * 装修台账面板外壳：头部（项目/预算概览）+ 四 Tab（总览 / 科目 / 流水 / 档案）
 *
 * 数据源：cap.kv zhuangxiu.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求、零服务进程——预算对比/增项口径/漏项检查/小结全部走
 * shared/core 纯函数现算，与 MCP 同一权威。
 * 轮询：可见时每 5s 一轮（键集 diff + 90s 全量兜底），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as core from '../shared/core'
import { loadZx, newCache, type ZxData } from './model'
import OverviewTab from './OverviewTab'
import CatsTab from './CatsTab'
import ExpTab from './ExpTab'
import FilesTab from './FilesTab'
import type { TabProps } from './PanelTypes'

const css = `
.zx-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.zx-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.zx-body{flex:1;overflow-y:auto;padding:0 0 24px}
.zx-body::-webkit-scrollbar{width:9px;height:9px}
.zx-body::-webkit-scrollbar-track{background:transparent}
.zx-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.zx-page{max-width:560px;margin:0 auto}

/* 头部 */
.zx-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.zx-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E3B341,#F87171);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.zx-tt{flex:1;min-width:0}
.zx-tt b{font-size:15px;display:block}
.zx-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.zx-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.zx-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.zx-dot.warn{background:#E3B341;box-shadow:0 0 6px rgba(227,179,65,.7)}
.zx-dot.bad{background:#F85149;box-shadow:0 0 6px rgba(248,81,73,.7)}
.zx-dot.off{background:#5C6678}
.zx-tabs{display:flex;gap:4px}
.zx-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.zx-tab:hover{color:#E6EAF2}
.zx-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.zx-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.zx-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.zx-bar-ic{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E3B341,#F87171);flex-shrink:0}
.zx-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.zx-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.zx-card-b{padding:11px 13px}
.zx-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.zx-btn:hover{filter:brightness(1.1)}
.zx-btn:disabled{opacity:.45;cursor:not-allowed}
.zx-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.zx-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.zx-btn.ok{background:#1d3327;color:#3FB950;border:1px solid #2b4a37}
.zx-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.zx-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.zx-inp:focus{outline:none;border-color:#2b6cb0}
.zx-inp::placeholder{color:#4d5566}
.zx-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.zx-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.zx-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.zx-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.zx-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.zx-toast.bad{border-color:#54262c;color:#FF8A9A}
.zx-toast-wrap{white-space:normal;max-height:40vh;overflow-y:auto}
.zx-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.zx-tag.red{background:#3a1d22;border-color:#54262c;color:#FF8A9A}
.zx-tag.yellow{background:#332a12;border-color:#5a4a1e;color:#E3B341}
.zx-tag.green{background:#1d3327;border-color:#2b4a37;color:#3FB950}
.zx-tag.gray{background:#1C2330;border-color:#2a2f3a;color:#8B95A7}
.zx-tag.blue{background:#16283e;border-color:#1f4a74;color:#79B8FF}
.zx-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.zx-row{display:flex;align-items:center;gap:8px;min-width:0}
.zx-grow{flex:1;min-width:0}
.zx-foot{color:#5C6678;font-size:10px;text-align:center;padding:14px 16px 4px;line-height:1.7}
.zx-modal-bg{position:absolute;inset:0;background:rgba(8,10,14,.72);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.zx-modal{background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:14px;width:100%;max-width:440px;max-height:88%;overflow-y:auto}
.zx-modal h4{margin:0 0 8px;font-size:13.5px}
.zx-progress{height:7px;border-radius:4px;background:#12151c;overflow:hidden;flex:1;min-width:40px}
.zx-progress>i{display:block;height:100%;border-radius:4px}
.zx-progress>i.red{background:#F85149}
.zx-progress>i.yellow{background:#E3B341}
.zx-progress>i.green{background:#3FB950}
.zx-progress>i.gray{background:#5C6678}
.zx-money{font-variant-numeric:tabular-nums}
.zx-hero{padding:13px}
.zx-hero .big{font-size:22px;font-weight:800;letter-spacing:.3px}
.zx-kv{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:#8B95A7;margin-top:3px}
.zx-item{padding:9px 13px;border-top:1px solid #1d2330}
.zx-item:first-child{border-top:none}
.zx-item-t{display:flex;align-items:center;gap:7px}
.zx-item-t b{font-size:12.5px}
.zx-item-s{font-size:10.5px;color:#8B95A7;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap}
.zx-right{text-align:right;font-variant-numeric:tabular-nums}
.zx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.zx-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.zx-link{background:none;border:none;color:#79B8FF;cursor:pointer;font-size:11px;padding:2px 4px}
.zx-link:hover{text-decoration:underline}
.zx-textarea{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#C9D1D9;padding:9px 10px;font-size:11px;width:100%;min-height:160px;font-family:Consolas,monospace;resize:vertical}
`

export type Tab = 'overview' | 'cats' | 'exp' | 'files'

export default function ZxPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<ZxData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean; wrap?: boolean } | null>(null)
  const cacheRef = useRef(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean, wrap?: boolean) => {
    setToast({ msg, bad, wrap })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), wrap ? 6000 : 2600)
  }, [])

  const reload = useCallback(async (): Promise<ZxData | null> => {
    try {
      const d = await loadZx(cacheRef.current)
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

  const props: TabProps = { data, reload, showToast, pluginId, onSendToChat }

  // 头部概览口径 = core.budgetCompare（单一权威）
  const cmp = data ? core.budgetCompare(data.cats, data.exps, data.project?.totalBudget) : null
  const redCount = data
    ? cmp!.rows.filter((r) => r.level === 'red').length
      + data.miles.filter((m) => core.milestoneLevel(m).level === 'red').length
    : 0
  const dotCls = !data ? 'off' : cmp && cmp.totals.level === 'red' ? 'bad' : cmp && (cmp.totals.level === 'yellow' || redCount > 0) ? 'warn' : 'ok'

  return (
    <div className="zx-root">
      <style>{css}</style>
      <div className="zx-top">
        <div className="zx-logo">🏠</div>
        <div className="zx-tt">
          <b>装修台账</b>
          <small>
            <i className={`zx-dot ${dotCls}`} />
            {data && cmp
              ? `${data.project ? data.project.name : '未建项目'} · 已花 ¥${core.fmtMoney(cmp.totals.spentTotal)}${cmp.totals.budgetTotal > 0 ? ` / ¥${core.fmtMoney(cmp.totals.budgetTotal)}` : ' · 预算未设'}${cmp.extraSpent > 0 ? ` · 增项 ¥${core.fmtMoney(cmp.extraSpent)}` : ''}`
              : '载入中…'}
          </small>
        </div>
        <div className="zx-tabs">
          {([
            ['overview', '总览'],
            ['cats', '科目'],
            ['exp', '流水'],
            ['files', '档案'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`zx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'overview' && redCount > 0 && <span className="zx-badge">{redCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="zx-body">
        <div className="zx-page">
          {loadErr && <div className="zx-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'overview' && <OverviewTab {...props} />}
          {tab === 'cats' && <CatsTab {...props} />}
          {tab === 'exp' && <ExpTab {...props} />}
          {tab === 'files' && <FilesTab {...props} />}
          <div className="zx-foot">装修台账是家庭对账工具：对比结果用于家庭自查，不构成造价咨询或法律建议。数据仅存本机（cap.kv）。</div>
        </div>
      </div>
      {toast && <div className={`zx-toast ${toast.bad ? 'bad' : ''} ${toast.wrap ? 'zx-toast-wrap' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
