/**
 * 接力板面板外壳：头部（心跳）+ 主视图（接力板）+ 设置
 *
 * 数据源：cap.kv relay.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求；URL 标题抓取由后台服务原生执行（跨域根治点），
 * 桌面/Web/手机打开同一面板看到同一块板子（cap.kv 单事实库）。
 * 轮询：可见时每 3s 拉一次（接力讲究即时性，比常规面板略快）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadBoard, loadReadAt, markAllRead, deviceLabel, pushItem, TEXT_CAP,
  type BoardData, type RelayItem,
} from './model'
import SettingsSection from './Settings'
import ItemCard from './ItemCard'

const css = `
.cr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cr-body::-webkit-scrollbar{width:9px;height:9px}
.cr-body::-webkit-scrollbar-track{background:transparent}
.cr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cr-page{max-width:520px;margin:0 auto}

/* 头部 */
.cr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8957E5,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.cr-tt{flex:1;min-width:0}
.cr-tt b{font-size:15px;display:block}
.cr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.cr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.cr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.cr-dot.stale{background:#D29922}
.cr-dot.down{background:#F85149}
.cr-tabs{display:flex;gap:4px}
.cr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.cr-tab:hover{color:#E6EAF2}
.cr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cr-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* 通用 */
.cr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.cr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8957E5,#58A6FF);flex-shrink:0}
.cr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.cr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cr-btn:hover{filter:brightness(1.1)}
.cr-btn:disabled{opacity:.45;cursor:not-allowed}
.cr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.cr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.cr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.cr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.cr-inp:focus{outline:none;border-color:#2b6cb0}
.cr-inp::placeholder{color:#4d5566}
.cr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.cr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.cr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.cr-toast.bad{border-color:#54262c;color:#FF8A9A}

/* 输入区 */
.cr-composer{margin:0 16px 12px;background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:10px}
.cr-ta{width:100%;min-height:56px;max-height:180px;resize:vertical;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:8px 10px;font:12.5px/1.5 Consolas,Menlo,-apple-system,sans-serif}
.cr-ta:focus{outline:none;border-color:#2b6cb0}
.cr-ta::placeholder{color:#4d5566}
.cr-composer-b{display:flex;align-items:center;gap:8px;margin-top:8px}
.cr-count{font-size:10.5px;color:#5C6678}
.cr-count.hot{color:#E3B341}
.cr-chip{background:#1C2330;border:1px solid #242C3A;color:#8B95A7;border-radius:14px;padding:3px 11px;font-size:11px;cursor:pointer}
.cr-chip.on{background:#2b6cb0;border-color:#2b6cb0;color:#fff;font-weight:600}
.cr-filters{display:flex;gap:6px;padding:0 16px 10px;flex-wrap:wrap}

/* 条目卡 */
.cr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.cr-card-h{display:flex;align-items:center;gap:7px;padding:8px 12px 0;font-size:10.5px;color:#5C6678}
.cr-kind{font-size:11px}
.cr-from{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:0 6px;color:#8B95A7}
.cr-time{color:#5C6678}
.cr-new{background:rgba(88,166,255,.15);color:#79C0FF;border-radius:5px;padding:0 6px;font-weight:700}
.cr-icon{background:transparent;border:none;cursor:pointer;font-size:13px;padding:2px 4px;opacity:.75}
.cr-icon:hover{opacity:1}
.cr-linkbody{display:block;width:100%;text-align:left;background:transparent;border:none;color:#E6EAF2;padding:8px 12px 2px;cursor:pointer;font:inherit}
.cr-linkbody b{display:block;font-size:13px;line-height:1.45;word-break:break-all}
.cr-desc{display:block;font-size:11px;color:#8B95A7;line-height:1.6;margin-top:3px;word-break:break-word}
.cr-url{display:block;font-size:10px;color:#5C6678;margin-top:4px;word-break:break-all}
.cr-textbody{padding:8px 12px 2px;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:hidden;cursor:pointer}
.cr-textbody.open{max-height:none}
.cr-card-a{display:flex;align-items:center;gap:6px;padding:6px 12px 10px}
.cr-fail{font-size:10px;color:#D29922}

/* 设置 */
.cr-card-b{padding:11px 13px}
.cr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.cr-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
.cr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.cr-field:first-child{border-top:none}
.cr-field-l{flex:1;min-width:0}
.cr-field-l b{font-size:12.5px;display:block}
.cr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.cr-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.cr-toggle.on{background:#2b6cb0}
.cr-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.cr-toggle.on i{left:18px}
.cr-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`

type Tab = 'board' | 'settings'
type Filter = 'all' | 'url' | 'text' | 'pinned'

export type Toast = (msg: string, bad?: boolean) => void

export interface CopyRequest { text: string }

export default function ClipRelayPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  void onSendToChat
  const [tab, setTab] = useState<Tab>('board')
  const [filter, setFilter] = useState<Filter>('all')
  const [data, setData] = useState<BoardData | null>(null)
  const [readAt, setReadAt] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const [copyReq, setCopyReq] = useState<CopyRequest | null>(null)
  const readAtRef = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback<Toast>((msg, bad) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  const reload = useCallback(async (): Promise<BoardData | null> => {
    try {
      const d = await loadBoard(readAtRef.current)
      setData(d)
      setLoadErr('')
      return d
    } catch (e) {
      setLoadErr((e as Error).message)
      return null
    }
  }, [])

  const refreshReadAt = useCallback(async () => {
    const r = await loadReadAt().catch(() => 0)
    readAtRef.current = r
    setReadAt(r)
  }, [])

  useEffect(() => { refreshReadAt() }, [refreshReadAt])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState === 'hidden' || !alive) return
      await reload()
    }
    poll()
    const timer = setInterval(poll, 3000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  // 打开面板即视为已读（3s 后落水位，给"新"角标留一点展示时间）
  const newCount = data?.newCount ?? 0
  useEffect(() => {
    if (tab !== 'board' || newCount <= 0) return
    const t = setTimeout(async () => {
      await markAllRead().catch(() => {})
      readAtRef.current = Date.now()
      setReadAt(readAtRef.current)
    }, 3000)
    return () => clearTimeout(t)
  }, [tab, newCount])

  const hb = (() => {
    const meta = data?.meta ?? null
    const last = meta?.lastTickAt
    if (!last) return { cls: 'down', text: '标题抓取服务未运行（收发不受影响）' }
    const age = Date.now() - last
    if (age < 150 * 1000) return { cls: 'ok', text: `在线 · 本端：${deviceLabel()}` }
    return { cls: 'stale', text: `服务心跳停滞 ${Math.round(age / 60000)} 分钟` }
  })()

  const items = data?.items ?? []
  const pinned = items.filter((it) => it.pinned)
  const shown = (() => {
    if (filter === 'pinned') return pinned
    if (filter === 'all') return items
    return items.filter((it) => it.kind === filter)
  })()
  const counts = {
    all: items.length,
    url: items.filter((it) => it.kind === 'url').length,
    text: items.filter((it) => it.kind === 'text').length,
    pinned: pinned.length,
  }

  return (
    <div className="cr-root">
      <style>{css}</style>
      <div className="cr-top">
        <div className="cr-logo">📋</div>
        <div className="cr-tt">
          <b>接力板</b>
          <small>
            <i className={`cr-dot ${hb.cls}`} />
            {hb.text}
          </small>
        </div>
        <div className="cr-tabs">
          {([
            ['board', '板子'],
            ['settings', '设置'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`cr-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'board' && newCount > 0 && <span className="cr-badge">{newCount > 99 ? '99+' : newCount}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="cr-body">
        <div className="cr-page">
          {loadErr && <div className="cr-err">数据加载失败：{loadErr}（检查 Polaris 是否在运行）</div>}
          {tab === 'board' && (
            <BoardView
              data={data}
              shown={shown}
              counts={counts}
              filter={filter}
              setFilter={setFilter}
              reload={reload}
              showToast={showToast}
              requestCopy={setCopyReq}
              readAt={readAt}
            />
          )}
          {tab === 'settings' && (
            <SettingsSection
              pluginId={pluginId}
              data={data}
              reload={reload}
              showToast={showToast}
            />
          )}
        </div>
      </div>
      {toast && <div className={`cr-toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
      {copyReq && (
        <CopyFallback
          text={copyReq.text}
          onClose={() => setCopyReq(null)}
        />
      )}
    </div>
  )
}

function BoardView({ data, shown, counts, filter, setFilter, reload, showToast, requestCopy, readAt }: {
  data: BoardData | null
  shown: RelayItem[]
  counts: Record<Filter, number>
  filter: Filter
  setFilter: (f: Filter) => void
  reload: () => Promise<BoardData | null>
  showToast: Toast
  requestCopy: (req: CopyRequest) => void
  readAt: number
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onPush = useCallback(async () => {
    setErr('')
    const t = text.trim()
    if (!t) return
    if (t.length > TEXT_CAP) {
      setErr(`内容过长（${t.length} > ${TEXT_CAP} 字符）`)
      return
    }
    setBusy(true)
    try {
      await pushItem(t)
      setText('')
      await reload()
      showToast('已推送到所有设备')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [text, reload, showToast])

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onPush()
    }
  }

  return (
    <div>
      <div className="cr-composer">
        <textarea
          className="cr-ta"
          placeholder={`粘贴或输入要接力的内容（链接自动抓标题）；Ctrl+Enter 推送；本端标记：${deviceLabel()}`}
          value={text}
          onChange={(e) => { setText(e.target.value); setErr('') }}
          onKeyDown={onKey}
        />
        <div className="cr-composer-b">
          <span className={`cr-count ${text.length > TEXT_CAP ? 'hot' : ''}`}>
            {text.length > 800 ? `${text.length}/${TEXT_CAP}` : ''}
          </span>
          {err && <span className="cr-err" style={{ padding: 0 }}>{err}</span>}
          <button className="cr-btn" style={{ marginLeft: 'auto' }} disabled={busy || !text.trim()} onClick={onPush}>
            {busy ? '推送中…' : '推送到所有设备'}
          </button>
        </div>
      </div>

      <div className="cr-filters">
        {([
          ['all', `全部 ${counts.all}`],
          ['url', `链接 ${counts.url}`],
          ['text', `文本 ${counts.text}`],
          ['pinned', `置顶 ${counts.pinned}`],
        ] as [Filter, string][]).map(([k, label]) => (
          <button key={k} className={`cr-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="cr-empty">
          {filter === 'all' ? (
            <>
              板子还是空的。<br />
              在上面粘贴一条链接或一段文本推送到所有设备；<br />
              也可以在聊天里对 AI 说「把这个链接发到我手机上」。
            </>
          ) : '该筛选下没有条目。'}
        </div>
      ) : (
        shown.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            isNew={readAt > 0 && (it.createdAt || 0) > readAt}
            reload={reload}
            showToast={showToast}
            requestCopy={requestCopy}
          />
        ))
      )}
      {data && data.items.length >= (data.settings.maxItems - 3) && (
        <div className="cr-hint" style={{ padding: '0 18px 8px', textAlign: 'center' }}>
          接近保留上限（{data.settings.maxItems} 条）——最旧的未置顶条目会被服务自动清理。
        </div>
      )}
    </div>
  )
}

/** 不安全源（手机 http://LAN）复制回退：全选文本手动复制 */
function CopyFallback({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const t = ref.current
    if (t) { t.focus(); t.select() }
  }, [])
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 98, background: 'rgba(8,10,14,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161B22', border: '1px solid #242C3A', borderRadius: 13, padding: 14,
          width: '100%', maxWidth: 460,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>手动复制</div>
        <div style={{ fontSize: 10.5, color: '#8B95A7', lineHeight: 1.6, marginBottom: 8 }}>
          当前页面不是安全上下文（手机经 http://局域网地址 访问），浏览器不允许程序直接写剪贴板——
          文本已全选，长按 / Ctrl+C 复制。
        </div>
        <textarea
          ref={ref}
          readOnly
          value={text}
          style={{
            width: '100%', height: 130, background: '#0d1017', border: '1px solid #2a2f3a',
            borderRadius: 8, color: '#E6EAF2', padding: 8, fontSize: 12, resize: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
          <button className="cr-btn sm" onClick={() => { ref.current?.focus(); ref.current?.select() }}>重新全选</button>
          <button className="cr-btn ghost sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
