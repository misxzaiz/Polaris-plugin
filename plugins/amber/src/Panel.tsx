/**
 * 琥珀面板外壳：头部（状态/心跳）+ 四 Tab（收藏 / 检索 / 摘录 / 设置）
 *
 * 数据源：cap.kv amber.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网请求；网页抓取与正文抽取由后台服务原生执行（跨域问题的根本解法）。
 * 轮询：可见时每 5s 一轮全量条目读取（量级 ≤ 数百键），后台自动暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAmber, type AmberData, type AmberItem } from './model'
import LibraryTab from './LibraryTab'
import SearchTab from './SearchTab'
import QuotesTab from './QuotesTab'
import SettingsTab from './SettingsTab'

const css = `
.am-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.am-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.am-body{flex:1;overflow-y:auto;padding:0 0 24px}
.am-body::-webkit-scrollbar{width:9px;height:9px}
.am-body::-webkit-scrollbar-track{background:transparent}
.am-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.am-page{max-width:560px;margin:0 auto}

/* 头部 */
.am-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.am-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#C77B3F,#E8B34B);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.am-tt{flex:1;min-width:0}
.am-tt b{font-size:15px;display:block}
.am-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.am-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.am-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.am-dot.stale{background:#D29922}
.am-dot.down{background:#F85149}
.am-tabs{display:flex;gap:4px}
.am-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.am-tab:hover{color:#E6EAF2}
.am-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.am-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.am-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.am-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.am-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#C77B3F,#E8B34B);flex-shrink:0}
.am-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.am-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.am-card-b{padding:11px 13px}
.am-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.am-url{font-size:10.5px;color:#5C6678;word-break:break-all;line-height:1.5}
.am-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#C77B3F;white-space:nowrap}
.am-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.am-btn:hover{filter:brightness(1.1)}
.am-btn:disabled{opacity:.45;cursor:not-allowed}
.am-btn.amber{background:linear-gradient(135deg,#A05A28,#C77B3F)}
.am-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.am-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.am-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.am-btn.star{background:#2b2416;color:#D29922;border:1px solid #4a3d1e}
.am-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.am-inp:focus{outline:none;border-color:#C77B3F}
.am-inp::placeholder{color:#4d5566}
.am-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.am-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.am-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.am-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.am-toast.bad{border-color:#54262c;color:#FF8A9A}
.am-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#E8B34B;border-radius:50%;animation:am-spin .8s linear infinite;vertical-align:-1px}
@keyframes am-spin{to{transform:rotate(360deg)}}

/* 条目流 */
.am-art{display:flex;gap:9px;padding:11px 13px;border-top:1px solid #1d2330;cursor:pointer;align-items:flex-start}
.am-art:first-child{border-top:none}
.am-art:hover{background:#1A2029}
.am-art.read .am-art-t{color:#8B95A7}
.am-unread{width:8px;height:8px;border-radius:50%;background:#E8B34B;flex-shrink:0;margin-top:6px}
.am-unread.off{background:transparent;border:1px solid #2a2f3a}
.am-art-main{flex:1;min-width:0}
.am-art-t{font-size:12.5px;font-weight:600;line-height:1.45;word-break:break-word}
.am-art-x{font-size:10.5px;color:#8B95A7;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.am-art-m{font-size:10px;color:#5C6678;margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.am-star{background:transparent;border:none;font-size:14px;cursor:pointer;color:#3d4657;flex-shrink:0;padding:2px 4px}
.am-star.on{color:#D29922}

/* 阅读视图 */
.am-read-h{display:flex;align-items:center;gap:8px;padding:10px 16px 4px;flex-wrap:wrap}
.am-read-t{font-size:15px;font-weight:700;line-height:1.5;padding:4px 16px 0;word-break:break-word}
.am-read-m{font-size:10.5px;color:#5C6678;padding:6px 16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.am-read-c{font-size:12.5px;line-height:1.8;color:#C9D1D9;padding:12px 16px;white-space:pre-wrap;word-break:break-word}
.am-read-c ::selection,.am-read-c selection{background:rgba(199,123,63,.45)}
.am-read-l{display:block;margin:0 16px 10px;font-size:11px;color:#58A6FF;word-break:break-all;text-decoration:none}
.am-quote-b{margin:0 16px 10px;border:1px solid #2a2f3a;border-left:3px solid #C77B3F;border-radius:8px;background:#12151c;padding:8px 11px;font-size:11.5px;color:#C9D1D9;line-height:1.6;white-space:pre-wrap}

/* 检索 */
.am-hit{padding:10px 13px;border-top:1px solid #1d2330;cursor:pointer}
.am-hit:first-child{border-top:none}
.am-hit:hover{background:#1A2029}
.am-hit-s{font-size:11px;color:#8B95A7;margin-top:4px;line-height:1.6;word-break:break-word}

/* 设置 */
.am-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.am-field:first-child{border-top:none}
.am-field-l{flex:1;min-width:0}
.am-field-l b{font-size:12.5px;display:block}
.am-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.am-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.am-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.am-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.am-kv{color:#5C6678}
.am-kv b{color:#B4B4B8;font-weight:600}
`

type Tab = 'library' | 'search' | 'quotes' | 'settings'

export default function AmberPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('library')
  const [data, setData] = useState<AmberData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const reload = useCallback(async (): Promise<AmberData | null> => {
    try {
      const d = await loadAmber()
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

  /** 跨 Tab 跳转：检索结果/摘录 → 收藏阅读视图 */
  const openItem = useCallback((id: string) => {
    setSelectedId(id)
    setTab('library')
  }, [])

  // 心跳判定：amber.meta 60s 一跳；3 分钟内 = 运行中
  const heartbeat = (() => {
    if (!data) return { cls: '', text: '载入中…' }
    const last = data.meta?.lastTickAt
    if (!last) return { cls: 'down', text: '服务未报告心跳' }
    const age = Date.now() - last
    if (age < 180 * 1000) return { cls: 'ok', text: `服务在线 · ${data.meta?.items ?? data.items.length} 琥珀 · 桥 ${data.meta?.bridge || '?'}` }
    return { cls: 'stale', text: `心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  const unread = data?.items.filter((x) => !x.read).length ?? 0

  return (
    <div className="am-root">
      <style>{css}</style>
      <div className="am-top">
        <div className="am-logo">🟡</div>
        <div className="am-tt">
          <b>琥珀 · 网页封藏馆</b>
          <small>
            <i className={`am-dot ${heartbeat.cls}`} />
            {heartbeat.text}
          </small>
        </div>
        <div className="am-tabs">
          {([
            ['library', '收藏'],
            ['search', '检索'],
            ['quotes', '摘录'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`am-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'library' && unread > 0 && (
                <span className="am-badge">{unread > 99 ? '99+' : unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="am-body">
        <div className="am-page">
          {loadErr && <div className="am-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'library' && (
            <LibraryTab
              data={data}
              reload={reload}
              showToast={showToast}
              onSendToChat={onSendToChat}
              selectedId={selectedId}
              onConsumeSelected={() => setSelectedId('')}
            />
          )}
          {tab === 'search' && (
            <SearchTab data={data} reload={reload} showToast={showToast} openItem={openItem} />
          )}
          {tab === 'quotes' && (
            <QuotesTab data={data} reload={reload} showToast={showToast} openItem={openItem} />
          )}
          {tab === 'settings' && (
            <SettingsTab pluginId={pluginId} data={data} reload={reload} showToast={showToast} />
          )}
        </div>
      </div>
      {toast && <div className={`am-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

export type { AmberItem }
