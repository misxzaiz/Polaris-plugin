/**
 * 面板外壳：头部 + 两 Tab（看板 / 设置）
 * 数据面：cap.kv needs.*（经宿主 invoke 拿 meta）→ 127.0.0.1 自家服务 API（乐观锁在服务核）。
 */
import { useEffect, useState } from 'react'
import { getMeta, type NeedsMeta } from './model'
import KanbanTab from './KanbanTab'
import SettingsTab from './SettingsTab'

const css = `
.nd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.nd-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.nd-body{flex:1;overflow-y:auto;padding:4px 0 24px}
.nd-body::-webkit-scrollbar{width:9px}
.nd-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.nd-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.nd-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3B82C4,#1F5E96);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.nd-tt{flex:1;min-width:0}
.nd-tt b{font-size:15px;display:block}
.nd-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.nd-tabs{display:flex;gap:4px}
.nd-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.nd-tab:hover{color:#E6EAF2}
.nd-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.nd-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.nd-bar{width:3px;height:13px;border-radius:2px;flex-shrink:0}
.nd-bar.st-idea{background:#8B95A7}.nd-bar.st-analyzed{background:#5B9BD5}.nd-bar.st-specd{background:#8A5CF6}
.nd-bar.st-approved{background:#F2B263}.nd-bar.st-building{background:#E8912D}.nd-bar.st-delivered{background:#7EE2A0}
.nd-bar.st-published{background:#4ADE80}.nd-bar.st-unknown{background:#8B95A7}
.nd-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.nd-quick{display:flex;gap:8px;padding:4px 18px 8px}
.nd-quick .nd-inp{flex:1}
.nd-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.nd-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.nd-chip:hover{border-color:#3a4356}
.nd-chip.on{background:#1d2c47;border-color:#3B82C4;color:#A8CCEF;font-weight:600}
.nd-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.nd-card-b{padding:11px 13px}
.nd-btn{background:#3B82C4;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.nd-btn:hover{filter:brightness(1.12)}
.nd-btn:disabled{opacity:.45;cursor:not-allowed}
.nd-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.nd-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px;margin-top:6px;margin-right:6px}
.nd-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;resize:vertical}
.nd-inp:focus{outline:none;border-color:#3B82C4}
.nd-inp::placeholder{color:#4d5566}
.nd-sel{width:auto;flex:1;min-width:0;appearance:auto}
.nd-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.nd-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.nd-item-head{display:flex;align-items:center;gap:8px}
.nd-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nd-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.nd-badge.info{color:#A8CCEF;border-color:#22384d}
.nd-badge.warn{color:#F2B263;border-color:#5a3d1a}
.nd-badge.bad{color:#FF8A9A;border-color:#54262c}
.nd-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.nd-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.nd-detail{border-top:1px dashed #2a2f3a;margin-top:9px;padding-top:9px}
.nd-secb{margin:6px 0 2px}
.nd-pre{background:#12151c;border:1px solid #222835;border-radius:8px;padding:7px 9px;font:11px/1.6 Consolas,Menlo,monospace;color:#C6CFDD;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;margin:0}
.nd-row{display:flex;gap:8px;align-items:center}
.nd-sub{font-size:10.5px;color:#8B95A7;line-height:1.6;word-break:break-all}
.nd-alert{border-radius:10px;padding:8px 12px;margin:6px 16px;font-size:11.5px;border:1px solid;line-height:1.7}
.nd-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.nd-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:6px 16px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.nd-center{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
.nd-center .nd-card{max-width:340px}
`

export default function NeedsPanel(_props: { pluginId?: string }) {
  const [meta, setMeta] = useState<NeedsMeta | null>(null)
  const [metaErr, setMetaErr] = useState('')
  const [tab, setTab] = useState<'kanban' | 'settings'>('kanban')

  useEffect(() => {
    getMeta().then((m) => {
      if (m) setMeta(m)
      else setMetaErr('cap.kv 里还没有 needs.meta（服务未启动或未写过 meta）：请稍候重试，或在 Polaris 桌面端重开一次面板让宿主拉起服务。')
    }).catch((e) => setMetaErr(String((e as Error).message)))
  }, [])

  return (
    <div className="nd-root">
      <style>{css}</style>
      <div className="nd-top">
        <div className="nd-logo">📋</div>
        <div className="nd-tt">
          <b>需求库</b>
          <small>一库两端 · 夜班消化 · 拍板在你</small>
        </div>
        <div className="nd-tabs">
          <button className={`nd-tab${tab === 'kanban' ? ' on' : ''}`} onClick={() => setTab('kanban')}>看板</button>
          <button className={`nd-tab${tab === 'settings' ? ' on' : ''}`} onClick={() => setTab('settings')}>设置</button>
        </div>
      </div>
      {!meta && (
        <div className="nd-center">
          <div className="nd-card"><div className="nd-card-b">
            <div className="nd-sub">{metaErr || '连接服务中…'}</div>
          </div></div>
        </div>
      )}
      {meta && (tab === 'kanban'
        ? <KanbanTab meta={meta} />
        : <SettingsTab meta={meta} />)}
    </div>
  )
}
