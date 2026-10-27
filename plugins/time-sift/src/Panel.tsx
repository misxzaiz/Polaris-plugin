/**
 * 拾光机面板外壳：头部（状态点/心跳）+ 四 Tab（搜索 / 足迹 / 时光机 / 设置）
 *
 * 数据面：cap.kv sift.* 键空间（经宿主 invoke → router_dispatch），跨端一致。
 * 检索/阅读走命令信箱（索引在服务进程），目录/统计直读 kv（服务离线可浏览）。
 * 面板零外网请求、零 fs——索引与源读取全部在后台服务进程（跨域/权限的根解法）。
 */
import { useCallback, useEffect, useState } from 'react'
import { readMeta, type SiftMeta } from './model'
import SearchTab from './SearchTab'
import FootprintTab from './FootprintTab'
import TimelineTab from './TimelineTab'
import SettingsTab from './SettingsTab'

const css = `
.ts-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ts-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ts-body{flex:1;overflow-y:auto;padding:0 0 28px}
.ts-body::-webkit-scrollbar{width:9px;height:9px}
.ts-body::-webkit-scrollbar-track{background:transparent}
.ts-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ts-page{max-width:620px;margin:0 auto}

/* 头部 */
.ts-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ts-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7A5CFF,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ts-tt{flex:1;min-width:0}
.ts-tt b{font-size:15px;display:block}
.ts-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ts-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ts-dot.busy{background:#D29922;box-shadow:0 0 6px rgba(210,153,34,.6)}
.ts-dot.down{background:#F85149}
.ts-tabs{display:flex;gap:4px}
.ts-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;min-height:28px}
.ts-tab:hover{color:#E6EAF2}
.ts-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* 通用 */
.ts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ts-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 6px;font-size:13px;font-weight:700}
.ts-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#7A5CFF,#58A6FF);flex-shrink:0}
.ts-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ts-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ts-card-b{padding:11px 13px}
.ts-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ts-dim{color:#5C6678}
.ts-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ts-tag.v2{color:#79C0FF;border-color:#1f3a5f}
.ts-tag.claude{color:#D2A8FF;border-color:#3a2a55}
.ts-tag.zcode{color:#7EE787;border-color:#254a2b}
.ts-tag.polaris{color:#FFA657;border-color:#4a3320}
.ts-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600;min-height:32px}
.ts-btn:hover{filter:brightness(1.12)}
.ts-btn:disabled{opacity:.45;cursor:not-allowed}
.ts-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ts-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ts-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px;min-height:26px}
.ts-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:8px 11px;font-size:12.5px;width:100%;min-width:0}
.ts-inp:focus{outline:none;border-color:#5865F2}
.ts-inp::placeholder{color:#4d5566}
.ts-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.ts-chip{background:#12151c;border:1px solid #2a2f3a;border-radius:14px;color:#8B95A7;font-size:11px;padding:4px 11px;cursor:pointer;min-height:26px}
.ts-chip.on{background:#1C2330;border-color:#5865F2;color:#E6EAF2;font-weight:600}
.ts-err{background:#2d1518;border:1px solid #54262c;color:#FF8182;border-radius:9px;padding:8px 12px;font-size:11.5px;margin:0 16px 10px;word-break:break-all}
.ts-empty{padding:36px 20px;text-align:center;color:#5C6678;font-size:12px;line-height:1.9}
.ts-empty b{color:#8B95A7;display:block;font-size:13px;margin-bottom:6px}
.ts-mark{background:rgba(88,101,242,.35);color:#B3B9FF;border-radius:3px;padding:0 1px}
.ts-hit{cursor:pointer}
.ts-hit:hover{border-color:#3a4358}
.ts-spin{display:inline-block;width:12px;height:12px;border:2px solid #3a4358;border-top-color:#58A6FF;border-radius:50%;animation:ts-rot 0.9s linear infinite;vertical-align:-2px}
@keyframes ts-rot{to{transform:rotate(360deg)}}
`

export type TabKey = 'search' | 'footprint' | 'timeline' | 'settings'

export default function TimeSiftPanel({ pluginId }: { pluginId: string }) {
  const [tab, setTab] = useState<TabKey>('search')
  const [meta, setMeta] = useState<SiftMeta | null>(null)
  const [metaErr, setMetaErr] = useState('')

  const refreshMeta = useCallback(async () => {
    try {
      const m = await readMeta()
      setMeta(m)
      setMetaErr('')
    } catch (e) {
      setMetaErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    refreshMeta()
    const t = setInterval(refreshMeta, 8000)
    return () => clearInterval(t)
  }, [refreshMeta])

  const status = (() => {
    if (metaErr) return 'down'
    if (!meta) return 'down'
    if (meta.indexing && meta.indexing.phase !== 'idle' && meta.indexing.phase !== 'error') return 'busy'
    if (meta.degraded) return 'down'
    return 'ok'
  })()

  const statusText = (() => {
    if (metaErr) return '宿主通道不可用'
    if (!meta) return '服务心跳缺失（服务可能未运行）'
    const idx = meta.indexing
    if (idx && idx.phase !== 'idle' && idx.phase !== 'error') return `建索引中 ${idx.done}/${idx.total}（${idx.phase}）…`
    if (idx && idx.phase === 'error') return '索引出错（看设置页）'
    if (meta.degraded) return '桥不可达（降级运行）'
    const n = meta.catalog ? meta.catalog.sessions : 0
    return `${n} 个会话已入库`
  })()

  return (
    <div className="ts-root" data-plugin-scope={pluginId}>
      <style>{css}</style>
      <div className="ts-top">
        <div className="ts-logo">⏳</div>
        <div className="ts-tt">
          <b>拾光机</b>
          <small>
            <span className={`ts-dot ${status}`} />
            {statusText}
          </small>
        </div>
        <div className="ts-tabs">
          {(
            [
              ['search', '搜索'],
              ['footprint', '足迹'],
              ['timeline', '时光机'],
              ['settings', '设置'],
            ] as Array<[TabKey, string]>
          ).map(([k, label]) => (
            <button key={k} className={`ts-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="ts-body">
        <div className="ts-page">
          {tab === 'search' && <SearchTab meta={meta} />}
          {tab === 'footprint' && <FootprintTab />}
          {tab === 'timeline' && <TimelineTab />}
          {tab === 'settings' && <SettingsTab meta={meta} onMetaRefresh={refreshMeta} />}
        </div>
      </div>
    </div>
  )
}
