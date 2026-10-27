/**
 * 订阅雷达面板外壳：头部（状态/心跳）+ 三 Tab（文章 / 订阅源 / 设置）
 *
 * 数据源：cap.kv radar.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；订阅抓取与正文抽取由后台服务原生执行（跨域问题的根本解法）。
 * 轮询：可见时每 5s 一轮增量加载（feed.rev 失效才重读文章键，90s 全量兜底），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadRadar, newCache, type CacheState, type RadarData } from './model'
import ArticleTab from './ArticleTab'
import FeedsTab from './FeedsTab'
import SettingsTab from './SettingsTab'

const css = `
.fr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.fr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.fr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.fr-body::-webkit-scrollbar{width:9px;height:9px}
.fr-body::-webkit-scrollbar-track{background:transparent}
.fr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.fr-page{max-width:560px;margin:0 auto}

/* 头部 */
.fr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.fr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C77B3F,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.fr-tt{flex:1;min-width:0}
.fr-tt b{font-size:15px;display:block}
.fr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.fr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.fr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.fr-dot.stale{background:#D29922}
.fr-dot.down{background:#F85149}
.fr-tabs{display:flex;gap:4px}
.fr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.fr-tab:hover{color:#E6EAF2}
.fr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.fr-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.fr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.fr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.fr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#C77B3F,#58A6FF);flex-shrink:0}
.fr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.fr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.fr-card-b{padding:11px 13px}
.fr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.fr-url{font-size:10.5px;color:#5C6678;word-break:break-all;line-height:1.5}
.fr-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.fr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.fr-btn:hover{filter:brightness(1.1)}
.fr-btn:disabled{opacity:.45;cursor:not-allowed}
.fr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.fr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.fr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.fr-btn.star{background:#2b2416;color:#D29922;border:1px solid #4a3d1e}
.fr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.fr-inp:focus{outline:none;border-color:#2b6cb0}
.fr-inp::placeholder{color:#4d5566}
.fr-lbl{font-size:11px;color:#8B95A7;margin:8px 0 3px;display:block}
.fr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.fr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.fr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.fr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.fr-toast.bad{border-color:#54262c;color:#FF8A9A}
.fr-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:fr-spin .8s linear infinite;vertical-align:-1px}
@keyframes fr-spin{to{transform:rotate(360deg)}}

/* 文章流 */
.fr-art{display:flex;gap:9px;padding:11px 13px;border-top:1px solid #1d2330;cursor:pointer;align-items:flex-start}
.fr-art:first-child{border-top:none}
.fr-art:hover{background:#1A2029}
.fr-art.read .fr-art-t{color:#8B95A7}
.fr-unread{width:8px;height:8px;border-radius:50%;background:#58A6FF;flex-shrink:0;margin-top:6px}
.fr-unread.off{background:transparent;border:1px solid #2a2f3a}
.fr-art-main{flex:1;min-width:0}
.fr-art-t{font-size:12.5px;font-weight:600;line-height:1.45;word-break:break-word}
.fr-art-x{font-size:10.5px;color:#8B95A7;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fr-art-m{font-size:10px;color:#5C6678;margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.fr-star{background:transparent;border:none;font-size:14px;cursor:pointer;color:#3d4657;flex-shrink:0;padding:2px 4px}
.fr-star.on{color:#D29922}

/* 阅读视图 */
.fr-read-h{display:flex;align-items:center;gap:8px;padding:10px 16px 4px}
.fr-read-t{font-size:15px;font-weight:700;line-height:1.5;padding:4px 16px 0;word-break:break-word}
.fr-read-m{font-size:10.5px;color:#5C6678;padding:6px 16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fr-read-c{font-size:12.5px;line-height:1.8;color:#C9D1D9;padding:12px 16px;white-space:pre-wrap;word-break:break-word}
.fr-read-l{display:block;margin:0 16px 10px;font-size:11px;color:#58A6FF;word-break:break-all;text-decoration:none}

/* 订阅源 */
.fr-feed{padding:11px 13px;border-top:1px solid #1d2330}
.fr-feed:first-child{border-top:none}
.fr-feed-h{display:flex;align-items:center;gap:8px}
.fr-feed-t{flex:1;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fr-feed.off .fr-feed-t{color:#8B95A7;text-decoration:line-through}
.fr-feed-m{font-size:10px;color:#5C6678;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap}

/* 设置 */
.fr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.fr-field:first-child{border-top:none}
.fr-field-l{flex:1;min-width:0}
.fr-field-l b{font-size:12.5px;display:block}
.fr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.fr-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.fr-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.fr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.fr-kv{color:#5C6678}
.fr-kv b{color:#B4B4B8;font-weight:600}
.fr-ta{width:100%;height:160px;background:#0d1017;border:1px solid #2a2f3a;border-radius:8px;color:#C9D1D9;padding:8px;font:11px/1.5 Consolas,Menlo,monospace;resize:vertical}
`

type Tab = 'articles' | 'feeds' | 'settings'

export default function RadarPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('articles')
  const [data, setData] = useState<RadarData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const cacheRef = useRef<CacheState>(newCache())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<RadarData | null> => {
    try {
      const d = await loadRadar(cacheRef.current)
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

  // 心跳判定：radar.meta 60s 一跳；3 分钟内 = 运行中
  const heartbeat = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const last = data.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳' }
    const age = Date.now() - last
    if (age < 180 * 1000) return { cls: 'ok', text: `雷达在线 · ${data.meta?.feeds ?? 0} 源 · 桥 ${data.meta?.bridge || '?'}` }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  return (
    <div className="fr-root">
      <style>{css}</style>
      <div className="fr-top">
        <div className="fr-logo">📡</div>
        <div className="fr-tt">
          <b>订阅雷达</b>
          <small>
            <i className={`fr-dot ${heartbeat.cls}`} />
            {heartbeat.text}
          </small>
        </div>
        <div className="fr-tabs">
          {([
            ['articles', '文章'],
            ['feeds', '订阅源'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`fr-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'articles' && (data?.unreadTotal ?? 0) > 0 && (
                <span className="fr-badge">{data!.unreadTotal > 99 ? '99+' : data!.unreadTotal}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="fr-body">
        <div className="fr-page">
          {loadErr && <div className="fr-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'articles' && (
            <ArticleTab data={data} reload={reload} showToast={showToast} onSendToChat={onSendToChat} />
          )}
          {tab === 'feeds' && (
            <FeedsTab data={data} reload={reload} showToast={showToast} goArticles={() => setTab('articles')} />
          )}
          {tab === 'settings' && (
            <SettingsTab pluginId={pluginId} data={data} reload={reload} showToast={showToast} />
          )}
        </div>
      </div>
      {toast && <div className={`fr-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
