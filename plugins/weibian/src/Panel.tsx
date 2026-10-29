/**
 * 面板外壳：头部 + 三 Tab（搜索 / 索引 / 指南）
 * 数据面：cap.kv weibian.*（设置/统计/最近搜索）；服务面：127.0.0.1 或局域网主机直连自家服务。
 */
import { useCallback, useEffect, useState } from 'react'
import SearchTab from './SearchTab'
import IndexTab from './IndexTab'
import GuideTab from './GuideTab'
import { loadStats, type WeibianStats } from './model'

const css = `
.wb-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.wb-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wb-body{flex:1;overflow-y:auto;padding:0 0 24px}
.wb-body::-webkit-scrollbar{width:9px;height:9px}
.wb-body::-webkit-scrollbar-track{background:transparent}
.wb-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.wb-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.wb-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3E9BD6,#2A5FA8);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.wb-tt{flex:1;min-width:0}
.wb-tt b{font-size:15px;display:block}
.wb-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.wb-tabs{display:flex;gap:4px}
.wb-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.wb-tab:hover{color:#E6EAF2}
.wb-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.wb-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.wb-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3E9BD6,#2A5FA8);flex-shrink:0}
.wb-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.wb-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.wb-card-b{padding:11px 13px}
.wb-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.wb-btn{background:#3E9BD6;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.wb-btn:hover{filter:brightness(1.12)}
.wb-btn:disabled{opacity:.45;cursor:not-allowed}
.wb-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.wb-btn.danger{background:#7a2f38}
.wb-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.wb-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.wb-inp:focus{outline:none;border-color:#3E9BD6}
.wb-inp::placeholder{color:#4d5566}
.wb-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.wb-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.wb-chip:hover{border-color:#3a4356}
.wb-chip.on{background:#1f3550;border-color:#3E9BD6;color:#BBD9F2;font-weight:600}
.wb-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.wb-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px;cursor:pointer}
.wb-item:hover{border-color:#3E9BD6}
.wb-item-head{display:flex;align-items:center;gap:8px}
.wb-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.wb-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.wb-snip{margin-top:6px;font-size:12px;color:#C6CEDD;line-height:1.7;word-break:break-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wb-snip mark{background:#2a4a1f;color:#C4EE9A;border-radius:3px;padding:0 1px}
.wb-row{display:flex;gap:8px;align-items:center}
.wb-row .grow{flex:1;min-width:0}
.wb-alert{border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;border:1px solid;line-height:1.7}
.wb-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.wb-alert.warn{background:rgba(232,145,45,.07);border-color:#5a3d1a;color:#F2B263}
.wb-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:0 16px 6px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.wb-progress{height:5px;border-radius:3px;background:#1C2330;overflow:hidden;margin:0 18px 8px}
.wb-progress>i{display:block;height:100%;background:linear-gradient(90deg,#3E9BD6,#7CC4F0);border-radius:3px;transition:width .4s}
.wb-empty{margin:40px 24px;text-align:center;color:#5C6678;font-size:12px;line-height:1.9}
.wb-empty b{color:#8B95A7;display:block;font-size:13px;margin-bottom:6px}
.wb-drawer{position:fixed;inset:0;z-index:50;background:rgba(8,10,14,.72);display:flex;align-items:stretch;justify-content:flex-end}
.wb-drawer-p{width:min(680px,92vw);background:#12151C;border-left:1px solid #242C3A;display:flex;flex-direction:column}
.wb-drawer-h{padding:12px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #1C2330}
.wb-drawer-h b{flex:1;min-width:0;font-size:13px;word-break:break-all}
.wb-drawer-b{flex:1;overflow:auto;padding:14px 16px;white-space:pre-wrap;font:12px/1.75 Consolas,Menlo,monospace;color:#C6CEDD;word-break:break-all}
.wb-kv{display:flex;gap:14px;flex-wrap:wrap;padding:2px 0}
.wb-kv b{font-size:16px;color:#E6EAF2}
.wb-kv small{display:block;color:#5C6678;font-size:10px}
.wb-code{background:#0F1218;border:1px solid #242C3A;border-radius:8px;padding:8px 10px;font:11.5px/1.7 Consolas,Menlo,monospace;color:#9FB6CC;word-break:break-all;white-space:pre-wrap;margin:6px 0}
`

type Tab = 'search' | 'index' | 'guide'

export default function WeibianPanel(_props: { pluginId?: string }) {
  const [tab, setTab] = useState<Tab>('search')
  const [stats, setStats] = useState<WeibianStats | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refreshStats = useCallback(async () => {
    try {
      const s = await loadStats()
      setStats(s)
    } catch (_) { /* 桥未就绪时静默，索引 Tab 内有更细状态 */ }
  }, [])

  useEffect(() => { refreshStats() }, [refreshStats, refreshTick])

  // 扫描中 1.5s 轮询统计（供头部小字与搜索页空态提示）
  useEffect(() => {
    if (!stats || !stats.scanning) return
    const t = setInterval(refreshStats, 1500)
    return () => clearInterval(t)
  }, [stats, refreshStats])

  const statusLine = stats
    ? stats.scanning
      ? `扫描中：待处理 ${stats.pending}`
      : `已索引 ${stats.docs} 文档 / ${stats.tokens} 词项`
    : '服务连接中…'

  return (
    <div className="wb-root">
      <style>{css}</style>
      <div className="wb-top">
        <div className="wb-logo">📖</div>
        <div className="wb-tt">
          <b>文档检索</b>
          <small>本地文档全文检索 · {statusLine}</small>
        </div>
        <div className="wb-tabs">
          {([['search', '搜索'], ['index', '索引'], ['guide', '指南']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`wb-tab${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setRefreshTick((x) => x + 1) }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="wb-body">
        {tab === 'search' && <SearchTab stats={stats} />}
        {tab === 'index' && <IndexTab stats={stats} onStats={setStats} />}
        {tab === 'guide' && <GuideTab />}
      </div>
    </div>
  )
}
