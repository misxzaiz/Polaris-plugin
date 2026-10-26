// src/Panel.tsx — ZCode 会话桥接面板（列表 + 对话 + 工作区/模型）
//
// 功能：
//   - 会话列表（读 db.sqlite，展示标题/时间/目录）+ 搜索过滤
//   - 工作区下拉（顶层常驻：全部 / 已落库目录 / 手动输入）→ 新建落选中工作区
//   - 新对话（zcode create）/ 续接历史会话（resume + 历史消息）
//   - 聊天视图：流式事件轮询渲染 + 模型 chip（当前 ZCode 实际用的 provider/model）
//   - 断连状态红条 + 重试
//
// 数据通道：经宿主桥 __POLARIS_HOST_INVOKE__('router_dispatch') → cap.http 转发
//               由桌面后端 127.0.0.1:9862 访问（跨端一致，移动/桌面同构）
//   为什么不用 fetch：手机浏览器里的 127.0.0.1 是手机自身；宿主桥已处理地址
//   + token + 传输。cap.http 不支持 SSE，对话事件用「send 返回游标 + 轮询」。
import { useEffect, useState, useCallback, useRef } from 'react'

const LOCAL_BASE = 'http://127.0.0.1:9862'

interface ZSession {
  sessionId: string
  title: string
  taskType: string
  workspaceId: string
  directory: string
  timeUpdated: string
}

interface ZPart {
  id: string
  type: string
  text: string
  reasoning: string
}

interface ZMsg {
  id: string
  role: string
  timeCreated: string
  parts: ZPart[]
}

interface ChatEvent {
  seq: number
  kind: string
  payload: any
  ts: number
}

type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

function getHostInvoke(): HostInvoke {
  const win = window as unknown as { __POLARIS_HOST_INVOKE__?: HostInvoke }
  if (!win.__POLARIS_HOST_INVOKE__) {
    throw new Error('宿主 invoke 不可用：需要 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return win.__POLARIS_HOST_INVOKE__
}

/** 经 cap.http 转发：桌面后端取数据，跨端通用。返回解析后的响应体 JSON。 */
async function fetchViaHost(url: string): Promise<any> {
  const res = await getHostInvoke()<{ ok: boolean; result?: Record<string, unknown>; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.http',
        payload: { action: 'request', method: 'GET', url },
      },
    },
  )
  if (!res.ok) throw new Error(res.error || 'cap.http 转发失败')
  const body = String((res.result as { body?: unknown })?.body ?? '')
  return JSON.parse(body || '{}')
}

/** 经 cap.http 转发 POST（cap.http 需 method+body 参数） */
async function postViaHost(url: string, bodyObj: Record<string, unknown>): Promise<any> {
  const res = await getHostInvoke()<{ ok: boolean; result?: Record<string, unknown>; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.http',
        payload: {
          action: 'request',
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
          bodyType: 'json',
        },
      },
    },
  )
  if (!res.ok) throw new Error(res.error || 'cap.http POST 转发失败')
  const body = String((res.result as { body?: unknown })?.body ?? '')
  return JSON.parse(body || '{}')
}

function timeAgo(ts: string): string {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return ts || ''
  const diff = Date.now() - n
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function titleOf(s: { title: string }, idx?: number): string {
  const t = (s.title || '').trim()
  if (t) return t.length > 28 ? t.slice(0, 28) + '…' : t
  return idx != null ? `(新对话 ${idx + 1})` : '(无标题会话)'
}

// 累积校验流式事件:组装一条 assistant 消息(顺序: text-delta → text-final → turn-complete)
function assembleAssistantFromText(text: string): ZMsg {
  return {
    id: 'streaming-' + Date.now(),
    role: 'assistant',
    timeCreated: String(Date.now()),
    parts: [{ id: 'streaming-part', type: 'text', text, reasoning: '' }],
  }
}

function shortWs(p: string): string {
  if (!p) return '未指定'
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}

export default function Panel({ pluginId, onSendToChat }: {
  pluginId?: string
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const [sessions, setSessions] = useState<ZSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(20)
  const [query, setQuery] = useState('')

  // 对话态
  const [activeSid, setActiveSid] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<ZMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)         // 是否在等待模型回复
  const [streamingText, setStreamingText] = useState('') // 流式增量累积
  const cursorRef = useRef(-1)
  const cmdSeqRef = useRef(0)
  const streamRef = useRef('') // 流式文本累计（避免 setState updater 里嵌套 setState）

  // 工作区
  const [workspaces, setWorkspaces] = useState<string[]>([])
  const [workspace, setWorkspace] = useState<string>('')    // '' = 全部
  const [modelInfo, setModelInfo] = useState<{ providerId?: string; modelId?: string } | null>(null)
  const [hostUp, setHostUp] = useState<boolean | null>(null) // 连接状态

  const load = useCallback(async (lim = limit) => {
    setLoading(true)
    setError('')
    try {
      // 工作区列表一起拉（轻量）
      const wsData = (await fetchViaHost(`${LOCAL_BASE}/api/workspaces`)) as { ok?: boolean; workspaces?: string[]; error?: string }
      if (wsData.ok) setWorkspaces(Array.isArray(wsData.workspaces) ? wsData.workspaces : [])
      const data = (await fetchViaHost(`${LOCAL_BASE}/api/sessions?limit=${lim}`)) as {
        ok?: boolean
        error?: string
        sessions?: ZSession[]
      }
      if (!data.ok) throw new Error(data.error || '服务返回异常')
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
      setHostUp(true)
    } catch (e: any) {
      setError(`无法读取 ZCode 会话：${String(e?.message || e)}`)
      setHostUp(false)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => { load(limit) }, [load])

  // 连接状态心跳
  useEffect(() => {
    const t = setInterval(() => {
      fetchViaHost(`${LOCAL_BASE}/__health`)
        .then(() => setHostUp(true))
        .catch(() => setHostUp(false))
    }, 15000)
    return () => clearInterval(t)
  }, [])

  // ── 打开会话（展示历史 messages）─────────────────────────────────────
  const openSession = useCallback(async (sid: string) => {
    setActiveSid(sid)
    setError('')
    setMsgs([])
    setStreamingText('')
    streamRef.current = ''
    cursorRef.current = -1
    setModelInfo(null)
    try {
      const data = (await fetchViaHost(`${LOCAL_BASE}/api/session/${sid}/msgs`)) as { ok?: boolean; messages?: any[]; error?: string }
      if (!data.ok) throw new Error(data.error || '读取历史失败')
      setMsgs(Array.isArray(data.messages) ? data.messages : [])
    } catch (e: any) {
      setError(`读取会话历史失败：${String(e?.message || e)}`)
    }
  }, [])

  // 从 db 重读会话历史（回合完成后权威对账，替代依赖流式固化的可见性）
  const reloadMessages = useCallback(async (sid: string) => {
    try {
      const data = (await fetchViaHost(`${LOCAL_BASE}/api/session/${sid}/msgs`)) as { ok?: boolean; messages?: any[]; error?: string }
      if (!data.ok) return
      const arr = Array.isArray(data.messages) ? data.messages : []
      if (arr.length) setMsgs(arr)
    } catch { /* 重读失败不影响已有显示 */ }
  }, [])

  // ── 新对话 ────────────────────────────────────────────────────────────
  const newSession = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      const data = (await postViaHost(`${LOCAL_BASE}/api/chat/create`, { workspacePath: workspace })) as { ok?: boolean; sessionId?: string; error?: string }
      if (!data.ok) throw new Error(data.error || '创建失败')
      setActiveSid(data.sessionId!)
      setMsgs([])
      setStreamingText('')
      setModelInfo(null)
      cursorRef.current = -1
      await load()
    } catch (e: any) {
      setError(`新对话失败：${String(e?.message || e)}`)
    } finally {
      setBusy(false)
    }
  }, [load, workspace])

  // 拉模型信息（打开会话 / 每次回合后）
  const loadModelInfo = useCallback(async (sid: string) => {
    try {
      const data = (await fetchViaHost(`${LOCAL_BASE}/api/chat/model?sessionId=${encodeURIComponent(sid)}`)) as { ok?: boolean; model?: { providerId?: string; modelId?: string } | null; error?: string }
      if (data.ok && data.model) setModelInfo(data.model)
    } catch { /* 模型信息拿不到就放过 */ }
  }, [])

  // ── 发送消息 → 从 cursor 后轮询事件增量 ─────────────────────────────−
  const send = useCallback(async () => {
    const sid = activeSid
    const text = input.trim()
    if (!sid || !text || busy) return
    setInput('')
    setError('')
    setBusy(true)
    setStreamingText('')
    streamRef.current = ''
    // 乐观追加用户消息
    setMsgs((prev) => [...prev, {
      id: 'user-' + Date.now(),
      role: 'user',
      timeCreated: String(Date.now()),
      parts: [{ id: 'user-part', type: 'text', text, reasoning: '' }],
    }])

    const cmd = ++cmdSeqRef.current
    try {
      const data = (await postViaHost(`${LOCAL_BASE}/api/chat/send`, { sessionId: sid, content: text, workspacePath: workspace })) as { ok?: boolean; cursor?: number; error?: string }
      if (!data.ok) throw new Error(data.error || '发送失败')
      if (data.cursor != null) cursorRef.current = data.cursor

      // 轮询事件增量，累积文本流，直到 turn-complete
      let done = false
      let waited = 0
      while (!done) {
        if (cmd !== cmdSeqRef.current) return // 已被新操作取代
        if (waited > 90000) {
          setError('等待模型回复超时。可点「发送」重试继续。')
          return
        }
        const evData = (await fetchViaHost(`${LOCAL_BASE}/api/chat/events?sessionId=${encodeURIComponent(sid)}&cursor=${cursorRef.current}`)) as {
          ok?: boolean
          cursor?: number
          events?: ChatEvent[]
          error?: string
        }
        if (!evData.ok) throw new Error(evData.error || '拉取事件失败')
        if (evData.cursor != null) cursorRef.current = evData.cursor
        const events = evData.events || []
        let hitComplete = false
        for (const e of events) {
          const pal = e.payload || {}
          if (e.kind === 'text-delta' || e.kind === 'text-final') {
            const d = pal.delta || ''
            streamRef.current += d
            setStreamingText(streamRef.current)
          } else if (e.kind === 'turn-complete') {
            hitComplete = true
          }
        }
        done = hitComplete
        if (!done) {
          waited += 500
          await new Promise((r) => setTimeout(r, 500))
        }
      }
      // 回合完成：固化流式文本为一条 assistant 消息
      const final = streamRef.current
      setStreamingText('')
      streamRef.current = ''
      if (final.trim()) {
        setMsgs((prev) => [...prev, assembleAssistantFromText(final)])
      }
      loadModelInfo(sid)
      // 权威对账：ZCode 已把本回合落盘，重读 db 保证多轮连续可见
      reloadMessages(sid)
      await load()
    } catch (e: any) {
      setStreamingText('')
      streamRef.current = ''
      setError(`发送失败：${String(e?.message || e)}`)
    } finally {
      setBusy(false)
    }
  }, [activeSid, input, busy, load, workspace, loadModelInfo, reloadMessages])

  const back = useCallback(() => {
    setActiveSid(null)
    setMsgs([])
    setInput('')
    setStreamingText('')
    setError('')
    setModelInfo(null)
    cursorRef.current = -1
    load()
  }, [load])

  // ── 渲染 ───────────────────────────────────────────────────────────────
  if (activeSid) {
    // 聊天视图
    const chatMsgs = [...msgs]
    if (streamingText.trim()) {
      chatMsgs.push(assembleAssistantFromText(streamingText))
    }
    const activeSession = sessions.find((s) => s.sessionId === activeSid)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* 顶栏一：返回 + 标题 + 刷新 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2E2E33', flexShrink: 0 }}>
          <button onClick={back} style={btnStyle()}>← 列表</button>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeSession?.title || 'ZCode 对话'}
          </span>
          <button onClick={() => load()} style={btnStyle()} disabled={loading}>{loading ? '…' : '刷新'}</button>
        </div>
        {/* 顶栏二：工作区 + 模型 chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid #2E2E33', flexShrink: 0, fontSize: 11, color: '#D4D4D8', flexWrap: 'wrap' }}>
          <span style={chipStyle()}>📁 {shortWs(activeSession?.directory || workspace)}</span>
          <span style={chipStyle()}>
            {modelInfo?.modelId ? `⚙ ${modelInfo.modelId}${modelInfo.providerId ? ` · ${modelInfo.providerId}` : ''}` : '⚙ 模型由 ZCode 决定'}
          </span>
        </div>
        {/* 状态错误条 */}
        {error && <div style={{ padding: '6px 12px', background: 'rgba(248,113,113,0.15)', color: '#F87171', fontSize: 11, borderBottom: '1px solid #2E2E33' }}>{error}</div>}

        {/* 消息区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.length === 0 && !streamingText && (
            <div style={{ color: '#8E8E93', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
              开始对话吧。发送第一条消息。
            </div>
          )}
          {chatMsgs.map((m, i) => (
            <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '88%',
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #3F3F46',
                background: m.role === 'user' ? '#1E3A5F' : '#25252B',
                color: '#F8F8F8',
                fontSize: 13,
                lineHeight: 1.5,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}>
                {m.parts?.map((p) => p.type === 'reasoning'
                  ? <div key={p.id} style={{ color: '#8E8E93', fontSize: 11, marginBottom: 4 }}>{p.reasoning}</div>
                  : <div key={p.id}>{p.text}</div>
                )}
                {(!m.parts || m.parts.length === 0) && <div style={{ color: '#8E8E93' }}>（无文本）</div>}
              </div>
            </div>
          ))}
          {busy && !streamingText && (
            <div style={{ color: '#8E8E93', fontSize: 11, alignSelf: 'flex-start' }}>
              <span>正在思考…</span>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid #2E2E33', flexShrink: 0 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={busy ? '等待回复…' : '输入消息…'}
            disabled={busy}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #3F3F46', background: '#1C1C20',
              color: '#F8F8F8', fontSize: 13, outline: 'none', minWidth: 0,
            }}
          />
          <button onClick={send} disabled={busy || !input.trim()} style={btnStyle({ fontSize: 13, background: '#2D5FAB', borderColor: '#2D5FAB', color: '#fff' })}>
            {busy ? '…' : '发送'}
          </button>
        </div>
      </div>
    )
  }

  // 列表视图
  const filtered = query.trim()
    ? sessions.filter((s) => (s.title + ' ' + s.directory).toLowerCase().includes(query.trim().toLowerCase()))
    : sessions
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, overflow: 'hidden' }}>
      {/* 顶栏：标题 + 新建 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>ZCode 会话</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => load()} style={btnStyle()} disabled={loading}>
            {loading ? '…' : '刷新'}
          </button>
          <button onClick={newSession} disabled={busy} style={btnStyle({ background: '#2D5FAB', borderColor: '#2D5FAB', color: '#fff' })}>
            + 新对话
          </button>
        </div>
      </div>

      {/* 工作区选择 + 连接状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          style={{
            flex: 1, minWidth: 140, padding: '5px 6px', borderRadius: 6, border: '1px solid #3F3F46',
            background: '#25252B', color: '#F8F8F8', fontSize: 12, outline: 'none',
          }}
        >
          <option value="">全部工作区</option>
          {workspaces.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <span style={{ fontSize: 10, color: hostUp === false ? '#F87171' : '#6BAF8D', whiteSpace: 'nowrap' }}>
          {hostUp === false ? '● 未连接' : '● 已连接'}
        </span>
      </div>

      {/* 搜索 + 条数 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8E8E93' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 搜索会话…"
          style={{
            flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B',
            color: '#F8F8F8', fontSize: 11, outline: 'none', minWidth: 0,
          }}
        />
        <input
          type="number" min={5} max={50} value={limit}
          onChange={(e) => setLimit(Math.max(5, Math.min(50, Number(e.target.value) || 20)))}
          style={{ width: 48, padding: '2px 4px', borderRadius: 4, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 11 }}
        />
        条
      </div>

      {hostUp === false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(248,113,113,0.15)', padding: '6px 10px', borderRadius: 6, fontSize: 11, color: '#F87171' }}>
          <span style={{ flex: 1 }}>ZCode 服务未连接</span>
          <button onClick={() => load()} style={btnStyle()}>重试</button>
        </div>
      )}
      {error && <div style={{ color: '#F87171', fontSize: 11 }}>{error}</div>}

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!loading && filtered.length === 0 && !error && (
          <div style={{ color: '#8E8E93', fontSize: 12 }}>{query ? '无匹配会话。' : '暂无会话。点「+ 新对话」开始。'}</div>
        )}
        {filtered.map((s, i) => (
          <div key={s.sessionId} onClick={() => openSession(s.sessionId)}
            style={{ ...cardStyle(), cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#F8F8F8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {titleOf(s, i)}
              </span>
              <span style={{ fontSize: 10, color: '#8E8E93', whiteSpace: 'nowrap' }}>{timeAgo(s.timeUpdated)}</span>
            </div>
            <div style={{ fontSize: 10, color: '#8E8E93', fontFamily: 'monospace', marginTop: 2 }}>
              {s.sessionId.slice(0, 24)}
            </div>
            <div style={{ fontSize: 10, color: '#6BAF8D', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📁 {s.directory ? shortWs(s.directory) : '(无 directory)'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function chipStyle(): React.CSSProperties {
  return {
    padding: '2px 8px', borderRadius: 10, background: '#2E2E33', border: '1px solid #3F3F46',
    color: '#B4B4B8', fontSize: 10, whiteSpace: 'nowrap',
  }
}

function cardStyle(): React.CSSProperties {
  return {
    padding: 10, borderRadius: 8, border: '1px solid #3F3F46', background: '#25252B',
    display: 'flex', flexDirection: 'column', gap: 2,
  }
}
function btnStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33',
    color: '#B4B4B8', fontSize: 11, cursor: 'pointer',
    ...extra,
  }
}