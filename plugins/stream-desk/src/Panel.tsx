/**
 * Panel.tsx —— 长连接调试台面板
 *
 * Tab 结构：会话（列表+新建） / WS 控制台 / SSE 抓取 / 设置
 * 数据面：127.0.0.1 直连服务（model.ts）；实时帧走 fetch-SSE 自解析通道。
 * 已知限制：Web(https) 部署模式下浏览器会拦 http://127.0.0.1 混合内容——
 * 桌面/手机 WebView 正常（与 api-bench/imgforge 面板直连面同款边界）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, invalidateMeta, readMeta, SvcError, streamSession } from './model'
import type { Frame, SessionDetail, SessionSummary, Settings, SseOpenParams, WsOpenParams } from './model'
import { restartService } from './host'
import {
  FrameList, KvEditor, PanelStyle, StateBadge, StatChips, timeStr, stateMeta,
} from './ui'
import type { KvRow } from './ui'
import { formatBytes, formatMs } from '../shared/core'

const PLUGIN_ID = 'stream-desk'
const SERVICE_ID = 'stream-desk-server'
const DRAFT_KEY = 'streamdesk.draft'

type Tab = 'sessions' | 'console' | 'capture' | 'settings'

export default function Panel({ pluginId }: { pluginId: string; onSendToChat?: (msg: string) => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>('sessions')
  const [svcDown, setSvcDown] = useState<string | null>(null) // null=正常
  const [degraded, setDegraded] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)

  const refreshSessions = useCallback(async () => {
    try {
      const r = await api.sessions()
      setSessions(r.sessions)
      setDegraded(r.degraded)
      setSvcDown(null)
    } catch (e) {
      setSvcDown((e as Error).message)
    }
  }, [])

  // 首次挂载：等 meta 就绪后拉列表；之后 2.5s 轮询
  useEffect(() => {
    let alive = true
    let timer: any = null
    const tick = async () => {
      if (!alive) return
      await readMeta(true).catch(() => null)
      await refreshSessions()
      timer = setTimeout(tick, 2500)
    }
    void tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [refreshSessions])

  const flash = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setBanner({ text, tone })
    setTimeout(() => setBanner(null), 2600)
  }

  const selected = sessions.find((s) => s.id === selectedId) || null

  const openSession = (s: SessionSummary) => {
    setSelectedId(s.id)
    setTab(s.kind === 'ws' ? 'console' : 'capture')
  }

  const removeSession = async (id: string) => {
    try { await api.remove(id); if (selectedId === id) setSelectedId(null); await refreshSessions() } catch (e) { flash((e as Error).message, 'err') }
  }

  return (
    <div className="streamdesk-panel">
      <PanelStyle />
      <Statusbar down={svcDown} degraded={degraded} onFlash={flash} />
      <div className="sd-tabs">
        {([['sessions', '会话'], ['console', 'WS 控制台'], ['capture', 'SSE 抓取'], ['settings', '设置']] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} className={`sd-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {banner && (
        <div style={{ padding: '5px 12px', fontSize: 11.5, background: banner.tone === 'ok' ? '#0F2E22' : '#331414', color: banner.tone === 'ok' ? '#34D399' : '#F87171' }}>
          {banner.text}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'sessions' && (
          <SessionsTab sessions={sessions} onOpen={openSession} onRemove={removeSession} onCreated={(s) => { void refreshSessions(); openSession(s); }} onFlash={flash} />
        )}
        {tab === 'console' && (
          selected
            ? <ConsoleTab key={selected.id} summary={selected} onFlash={flash} onChanged={refreshSessions} />
            : <Empty text="从「会话」选择一个 WS 会话，或新建连接。" />
        )}
        {tab === 'capture' && (
          selected
            ? <CaptureTab key={selected.id} summary={selected} onFlash={flash} onChanged={refreshSessions} />
            : <Empty text="从「会话」选择一个 SSE 抓取会话，或新建抓取。" />
        )}
        {tab === 'settings' && <SettingsTab onFlash={flash} />}
      </div>
    </div>
  )
}

// ── 服务状态条 ──────────────────────────────────────────────────────────────
function Statusbar({ down, degraded, onFlash }: {
  down: string | null
  degraded: boolean
  onFlash: (t: string, tone?: 'ok' | 'err') => void
}): JSX.Element {
  const [meta, setMeta] = useState<{ version?: string; live?: number } | null>(null)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (!alive) return
      try { const m = await api.meta(); setMeta(m) } catch (_) { setMeta(null) }
      setTimeout(tick, 5000)
    }
    void tick()
    return () => { alive = false }
  }, [])
  const ok = !down
  const color = ok ? (degraded ? '#FBBF24' : '#34D399') : '#F87171'
  const restart = async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID)
      invalidateMeta()
      onFlash('已请求重启服务，稍候自动恢复', 'ok')
    } catch (e) { onFlash(`重启失败：${(e as Error).message}`, 'err') }
  }
  return (
    <div className="sd-statusbar">
      <span className="sd-dot" style={{ background: color }} />
      <span>
        {ok ? `服务 v${meta?.version || '?'} ${degraded ? '（kv 降级，历史不落库）' : ''} · 进行中 ${meta?.live ?? 0}` : `服务不可达：${down}`}
      </span>
      <span className="sd-grow" />
      <button className="small" onClick={() => { invalidateMeta(); void readMeta(true) }}>重试</button>
      <button className="small" onClick={restart}>重启服务</button>
    </div>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div className="sd-hint" style={{ padding: 20, textAlign: 'center' }}>{text}</div>
}

// ── 会话 Tab ────────────────────────────────────────────────────────────────
function SessionsTab({ sessions, onOpen, onRemove, onCreated, onFlash }: {
  sessions: SessionSummary[]
  onOpen: (s: SessionSummary) => void
  onRemove: (id: string) => void
  onCreated: (s: SessionSummary) => void
  onFlash: (t: string, tone?: 'ok' | 'err') => void
}): JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <NewSessionForm onCreated={onCreated} onFlash={onFlash} />
      <div className="sd-label" style={{ padding: '8px 12px 2px' }}>会话（新→旧，上限 60 条索引 / 12 个进行中）</div>
      <div className="sd-scroll" style={{ flex: 1, minHeight: 0 }}>
        {sessions.length === 0 && <Empty text="还没有会话。上面新建一个 WS 连接或 SSE 抓取。" />}
        {sessions.map((s) => {
          const m = stateMeta(s.state)
          const c = s.counters || {}
          return (
            <div key={s.id} className="sd-list-row" onClick={() => onOpen(s)}>
              <span className="sd-badge" style={{ background: '#232329', color: '#93C5FD', width: 34, textAlign: 'center' }}>{s.kind.toUpperCase()}</span>
              <div className="sd-grow" style={{ minWidth: 0 }}>
                <div className="sd-row" style={{ gap: 6 }}>
                  <b style={{ color: '#fff', fontSize: 12 }}>{s.title}</b>
                  <StateBadge state={s.state} />
                </div>
                <div className="mono sd-muted" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.url}
                </div>
              </div>
              <span className="sd-muted mono" style={{ fontSize: 10.5, flex: 'none' }}>
                帧{s.frameCount} ←{c.in || 0} →{c.out || 0}
              </span>
              <span className="sd-muted" style={{ fontSize: 10.5, flex: 'none' }}>{timeStr(s.closedAt || s.createdAt)}</span>
              <button className="small" onClick={(e) => { e.stopPropagation(); onRemove(s.id) }}>删</button>
            </div>
          )
        })}
      </div>
      <div className="sd-hint" style={{ padding: '6px 12px', borderTop: '1px solid #2A2A31' }}>
        提示：浏览器 WebSocket 握手不能带 Authorization 头、EventSource 只能 GET——这里都行（服务端原生客户端）。AI 也能用：让它调 ws_connect / sse_capture。
      </div>
    </div>
  )
}

interface Draft { kind: 'ws' | 'sse'; url: string; rows: KvRow[]; method: string; body: string; subprotocols: string; pingSec: string; maxEvents: string; durationMs: string; title: string }
const EMPTY_DRAFT: Draft = { kind: 'ws', url: '', rows: [{ k: '', v: '' }], method: 'GET', body: '', subprotocols: '', pingSec: '0', maxEvents: '200', durationMs: '30000', title: '' }

function NewSessionForm({ onCreated, onFlash }: {
  onCreated: (s: SessionSummary) => void
  onFlash: (t: string, tone?: 'ok' | 'err') => void
}): JSX.Element {
  const [d, setD] = useState<Draft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [showAdv, setShowAdv] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void (async () => {
      try {
        const saved = await (await import('./host')).kvGet<Draft>(DRAFT_KEY)
        if (saved && saved.url !== undefined) setD({ ...EMPTY_DRAFT, ...saved, rows: saved.rows?.length ? saved.rows : [{ k: '', v: '' }] })
      } catch (_) { /* 草稿缺失可容忍 */ }
    })()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void (async () => { try { const { kvSet } = await import('./host'); await kvSet(DRAFT_KEY, d) } catch (_) { /* 忽略 */ } })() }, 800)
    return () => clearTimeout(t)
  }, [d])

  const submit = async () => {
    if (busy) return
    const url = d.url.trim()
    if (!url) { onFlash('请输入地址', 'err'); return }
    setBusy(true)
    try {
      const headers = Object.fromEntries(d.rows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v]))
      if (d.kind === 'ws') {
        const p: WsOpenParams = {
          url, headers,
          subprotocols: d.subprotocols.split(/[\s,]+/).filter(Boolean),
          pingIntervalSec: Number(d.pingSec) || 0,
          title: d.title.trim() || undefined,
        }
        const r = await api.openWs(p)
        onFlash('连接请求已发起', 'ok')
        onCreated(r.session)
      } else {
        const p: SseOpenParams = {
          url, headers, method: d.method, body: d.method !== 'GET' && d.body ? d.body : undefined,
          maxEvents: Number(d.maxEvents) || undefined,
          durationMs: Number(d.durationMs) || undefined,
          title: d.title.trim() || undefined,
        }
        const r = await api.openSse(p)
        onFlash('抓取已开始', 'ok')
        onCreated(r.session)
      }
    } catch (e) {
      onFlash((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sd-card" style={{ margin: '10px 12px 0' }}>
      <div className="sd-row" style={{ marginBottom: 8 }}>
        <div className="sd-row" style={{ gap: 0, border: '1px solid #3F3F46', borderRadius: 6, overflow: 'hidden' }}>
          {(['ws', 'sse'] as const).map((k) => (
            <button key={k} style={{ border: 'none', borderRadius: 0, padding: '5px 14px', background: d.kind === k ? '#2563EB' : '#232329', color: d.kind === k ? '#fff' : '#9CA3AF' }}
              onClick={() => setD({ ...d, kind: k })}>{k === 'ws' ? 'WebSocket' : 'SSE / 流式'}</button>
          ))}
        </div>
        <input className="sd-grow mono" placeholder={d.kind === 'ws' ? 'ws://127.0.0.1:8080/echo' : 'https://api.example.com/v1/chat/stream'}
          value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />
        <button className="primary" disabled={busy} onClick={submit}>{busy ? '处理中…' : d.kind === 'ws' ? '连接' : '开始抓取'}</button>
      </div>
      <div className="sd-row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div className="sd-grow">
          <span className="sd-label">请求头（Authorization 等敏感值只在本机使用，报告中自动掩码）</span>
          <KvEditor rows={d.rows} onChange={(rows) => setD({ ...d, rows })} />
        </div>
        <div style={{ width: 170, flex: 'none' }}>
          {d.kind === 'ws' ? (
            <>
              <span className="sd-label">子协议（逗号分隔，可空）</span>
              <input style={{ width: '100%' }} value={d.subprotocols} onChange={(e) => setD({ ...d, subprotocols: e.target.value })} placeholder="chat.v2, binary" />
              <span className="sd-label" style={{ marginTop: 6 }}>自动 ping 间隔（秒，0=关）</span>
              <input style={{ width: '100%' }} value={d.pingSec} onChange={(e) => setD({ ...d, pingSec: e.target.value })} />
            </>
          ) : (
            <>
              <span className="sd-label">Method</span>
              <select style={{ width: '100%' }} value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })}>
                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="sd-label" style={{ marginTop: 6 }}>事件上限 / 时长上限(ms)</span>
              <div className="sd-row">
                <input style={{ width: '50%' }} value={d.maxEvents} onChange={(e) => setD({ ...d, maxEvents: e.target.value })} />
                <input style={{ width: '50%' }} value={d.durationMs} onChange={(e) => setD({ ...d, durationMs: e.target.value })} />
              </div>
            </>
          )}
          <span className="sd-label" style={{ marginTop: 6 }}>备注名（可空）</span>
          <input style={{ width: '100%' }} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="本地联调 / 竞品流测…" />
        </div>
      </div>
      {d.kind === 'sse' && d.method !== 'GET' && (
        <div style={{ marginTop: 6 }}>
          <span className="sd-label">请求体（POST 的 JSON 等）</span>
          <textarea style={{ width: '100%', minHeight: 54 }} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} placeholder='{"model":"...","stream":true,"messages":[...]}' />
        </div>
      )}
    </div>
  )
}

// ── WS 控制台 Tab ───────────────────────────────────────────────────────────
function useSessionLive(summary: SessionSummary, onFlash: (t: string, tone?: 'ok' | 'err') => void) {
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [live, setLive] = useState<SessionSummary>(summary)
  const [frames, setFrames] = useState<Frame[]>([])
  const seqSet = useRef<Set<number>>(new Set())

  const mergeFrames = useCallback((incoming: Frame[]) => {
    setFrames((prev) => {
      const fresh = incoming.filter((f) => !seqSet.current.has(f.seq))
      if (!fresh.length) return prev
      for (const f of fresh) seqSet.current.add(f.seq)
      const next = [...prev, ...fresh]
      return next.length > 3000 ? next.slice(next.length - 3000) : next
    })
  }, [])

  useEffect(() => {
    let alive = true
    let stop: (() => void) | null = null
    void (async () => {
      try {
        const d = await api.sessionDetail(summary.id, -1)
        if (!alive) return
        setDetail(d)
        setLive(d.summary)
        mergeFrames(d.frames)
      } catch (e) {
        if (alive) onFlash(`加载会话失败：${(e as Error).message}`, 'err')
        return
      }
      if (!alive) return
      stop = streamSession(summary.id, {
        onFrames: mergeFrames,
        onStatus: (s) => setLive(s),
      })
    })()
    return () => { alive = false; stop?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id])

  return { detail, live, frames }
}

function ConsoleTab({ summary, onFlash, onChanged }: {
  summary: SessionSummary
  onFlash: (t: string, tone?: 'ok' | 'err') => void
  onChanged: () => void
}): JSX.Element {
  const { detail, live, frames } = useSessionLive(summary, onFlash)
  const [text, setText] = useState('')
  const [op, setOp] = useState<'text' | 'binary' | 'ping'>('text')
  const [b64, setB64] = useState('')
  const [closeCode, setCloseCode] = useState('1000')
  const [closeReason, setCloseReason] = useState('')
  const [busy, setBusy] = useState(false)

  const isWs = live.kind === 'ws'
  const liveNow = live.state === 'open'

  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.send(live.id, op === 'binary' ? { op, b64 } : { op, text })
      if (op === 'binary') setB64('')
      else setText('')
    } catch (e) { onFlash((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const doClose = async () => {
    try { await api.close(live.id, Number(closeCode) || 1000, closeReason) } catch (e) { onFlash((e as Error).message, 'err') }
  }
  const doReconnect = async () => {
    try { const r = await api.reconnect(live.id); onChanged(); onFlash(`已发起重连 → ${r.session.id}`, 'ok') } catch (e) { onFlash((e as Error).message, 'err') }
  }
  const exportJsonl = () => {
    const lines = frames.map((f) => JSON.stringify(f)).join('\n')
    const blob = new Blob([lines], { type: 'application/x-ndjson' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `streamdesk-${live.id}.jsonl`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const hs = detail?.handshake || null
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 8 }}>
      <div className="sd-row">
        <StateBadge state={live.state} />
        <span className="mono sd-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{live.title}</span>
        <button className="small" onClick={exportJsonl}>导出 JSONL</button>
        {!liveNow && <button className="small" onClick={doReconnect}>按原参数重连</button>}
      </div>
      {hs && (
        <div className="sd-hint">
          握手：{hs.ok ? <span className="sd-ok">HTTP {hs.httpStatus}</span> : <span className="sd-err">HTTP {hs.httpStatus ?? '—'}</span>}
          {' '}延迟 {formatMs(hs.latencyMs || 0)}
          {hs.error ? <span className="sd-err"> · {hs.error}</span> : null}
          {hs.headers && Object.keys(hs.headers).length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary className="sd-muted" style={{ cursor: 'pointer' }}>响应头（敏感头已掩码 {Object.keys(hs.headers).length} 个）</summary>
              <pre className="sd-muted">{Object.entries(hs.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
            </details>
          )}
        </div>
      )}
      <StatChips items={[
        { label: '收', value: String(live.counters?.in || 0) },
        { label: '发', value: String(live.counters?.out || 0) },
        { label: 'PONG', value: String(live.counters?.pongs || 0) },
        { label: '字节↓', value: formatBytes(live.counters?.bytesIn || 0) },
        { label: '字节↑', value: formatBytes(live.counters?.bytesOut || 0) },
        ...(live.closedReason ? [{ label: '结果', value: live.closedReason, tone: live.state === 'error' ? 'err' : 'muted' } as const] : []),
      ]} />
      <FrameList frames={frames} emptyHint={liveNow ? '已连接，还没有帧。下面发一条试试。' : '暂无帧'} />
      {isWs && (
        <div className="sd-card">
          <div className="sd-row" style={{ marginBottom: 6 }}>
            <select value={op} onChange={(e) => setOp(e.target.value as any)} style={{ width: 96 }}>
              <option value="text">文本</option>
              <option value="binary">二进制(b64)</option>
              <option value="ping">PING</option>
            </select>
            {op === 'binary'
              ? <input className="sd-grow mono" placeholder="base64 载荷" value={b64} onChange={(e) => setB64(e.target.value)} />
              : <input className="sd-grow mono" placeholder={op === 'ping' ? 'ping 载荷（可空，数字载荷自动测 RTT）' : '要发送的消息…'} value={text} onChange={(e) => setText(e.target.value)} />}
            <button className="primary" disabled={!liveNow || busy} onClick={send}>发送</button>
          </div>
          <div className="sd-row">
            <span className="sd-muted">关闭：</span>
            <input style={{ width: 70 }} value={closeCode} onChange={(e) => setCloseCode(e.target.value)} title="关闭码" />
            <input className="sd-grow" placeholder="原因（可空）" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
            <button className="danger small" disabled={!liveNow} onClick={doClose}>关闭连接</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SSE 抓取 Tab ────────────────────────────────────────────────────────────
function CaptureTab({ summary, onFlash, onChanged }: {
  summary: SessionSummary
  onFlash: (t: string, tone?: 'ok' | 'err') => void
  onChanged: () => void
}): JSX.Element {
  const { detail, live, frames } = useSessionLive(summary, onFlash)
  const capturing = live.state === 'capturing'
  const stats = live.stats || {}
  const gaps = stats.gaps

  const stop = async () => { try { await api.stop(live.id) } catch (e) { onFlash((e as Error).message, 'err') } }
  const exportJsonl = () => {
    const lines = frames.map((f) => JSON.stringify(f)).join('\n')
    const blob = new Blob([lines], { type: 'application/x-ndjson' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `streamdesk-${live.id}.jsonl`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 8 }}>
      <div className="sd-row">
        <StateBadge state={live.state} />
        <span className="mono sd-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{live.title}</span>
        {capturing && <button className="danger small" onClick={stop}>停止抓取</button>}
        <button className="small" onClick={exportJsonl}>导出 JSONL</button>
        {!capturing && <button className="small" onClick={async () => { try { const r = await api.reconnect(live.id); onChanged(); onFlash(`已按原参数重新抓取 → ${r.session.id}`, 'ok') } catch (e) { onFlash((e as Error).message, 'err') } }}>重新抓取</button>}
      </div>
      {detail?.handshake && (
        <div className="sd-hint">
          响应：{detail.handshake.ok ? <span className="sd-ok">HTTP {detail.handshake.httpStatus}</span> : <span className="sd-err">HTTP {detail.handshake.httpStatus ?? '—'}</span>}
          {' '}{formatMs(detail.handshake.latencyMs || 0)}
          {detail.handshake.error ? <span className="sd-err"> · {detail.handshake.error}</span> : null}
        </div>
      )}
      <StatChips items={[
        { label: 'TTFT', value: stats.ttftMs != null ? formatMs(stats.ttftMs) : '—', tone: (stats.ttftMs || 0) > 3000 ? 'warn' : 'ok' },
        { label: '首事件', value: stats.firstEventMs != null ? formatMs(stats.firstEventMs) : '—' },
        { label: '事件', value: String(stats.eventCount || 0) },
        { label: '字节', value: formatBytes(stats.bytes || 0) },
        { label: '间隔 p95', value: gaps ? formatMs(gaps.p95) : '—', tone: gaps && gaps.p95 > 2000 ? 'warn' : 'ok' },
        { label: '间隔最大', value: gaps ? formatMs(gaps.max) : '—' },
        ...(stats.comments ? [{ label: '心跳行', value: String(stats.comments), tone: 'muted' } as const] : []),
        ...(live.closedReason ? [{ label: '结果', value: live.closedReason, tone: live.state === 'error' ? 'err' : 'muted' } as const] : []),
      ]} />
      <FrameList frames={frames} emptyHint={capturing ? '抓取中，等待事件…' : '暂无事件'} />
      {gaps && gaps.count > 3 && (
        <div className="sd-hint sd-muted">
          间隔分布：min {formatMs(gaps.min)} · 中位 {formatMs(gaps.median)} · 均值 {formatMs(gaps.mean)} · p95 {formatMs(gaps.p95)} · max {formatMs(gaps.max)}
          {gaps.p95 > 2000 ? ' —— p95 偏高，流有卡顿段落' : ' —— 流速平稳'}
        </div>
      )}
    </div>
  )
}

// ── 设置 Tab ────────────────────────────────────────────────────────────────
function SettingsTab({ onFlash }: { onFlash: (t: string, tone?: 'ok' | 'err') => void }): JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  const [meta, setMeta] = useState<{ version: string; uptime: number; degraded: boolean; live: number; kvEndpoint: string | null } | null>(null)

  useEffect(() => {
    void (async () => {
      try { setS((await api.settings()).settings) } catch (e) { onFlash((e as Error).message, 'err') }
      try { setMeta(await api.meta()) } catch (_) { /* 忽略 */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!s) return <Empty text="设置加载中（服务不可达时无法加载）…" />
  const num = (k: keyof Settings, label: string, hint: string) => (
    <div className="sd-row" style={{ marginBottom: 6 }}>
      <span style={{ width: 190, flex: 'none' }} className="sd-hint">{label}</span>
      <input style={{ width: 100 }} value={String(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) || 0 })} />
      <span className="sd-muted sd-hint sd-grow">{hint}</span>
    </div>
  )
  const save = async () => {
    try { setS((await api.saveSettings(s)).settings); onFlash('设置已保存', 'ok') } catch (e) { onFlash((e as Error).message, 'err') }
  }
  const clearHistory = async () => {
    if (!window.confirm('清理全部历史 transcript 与已结束会话？（进行中的会话不受影响）')) return
    try { await api.clearHistory(); onFlash('历史已清理', 'ok') } catch (e) { onFlash((e as Error).message, 'err') }
  }
  return (
    <div className="sd-scroll" style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="sd-card">
        <div className="sd-label" style={{ marginBottom: 8 }}>抓取与缓冲</div>
        {num('maxFrames', '每会话帧缓冲上限', '环形缓冲，超出淘汰最旧（50–5000）')}
        {num('frameBodyCap', '单帧体截断上限(字符)', '超出部分以截断标记呈现（256–262144）')}
        {num('pingIntervalSec', '默认自动 ping 间隔(秒)', '新 WS 会话的默认值，0=关')}
        {num('sseMaxEvents', 'SSE 默认事件上限', '每次抓取默认停在这个事件数（10–10000）')}
        {num('sseDurationMsMax', 'SSE 时长上限(ms)', '单次抓取最长时长（1000–600000）')}
        {num('transcriptTail', 'transcript 尾部帧数', '落 kv 的历史保留最后 N 帧（10–1000）')}
        <div className="sd-row" style={{ marginTop: 4 }}>
          <span style={{ width: 190, flex: 'none' }} className="sd-hint">出站掩码</span>
          <label className="sd-hint sd-row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.maskHeaders} onChange={(e) => setS({ ...s, maskHeaders: e.target.checked })} style={{ padding: 0 }} />
            落 kv / AI 报告中的敏感头掩码（cookie/authorization 恒掩，此项控制其余 secret/token 类头）
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={save}>保存设置</button>
        </div>
      </div>
      <div className="sd-card">
        <div className="sd-label" style={{ marginBottom: 6 }}>服务</div>
        <div className="sd-hint">
          版本 v{meta?.version || '?'} · 运行 {meta ? formatMs(meta.uptime) : '—'} · 进行中 {meta?.live ?? 0} · kv {meta?.kvEndpoint || '不可达（降级模式）'}
          <br />进行中会话的帧只在内存，服务重启不恢复（索引里标「已中断」）；已结束会话的 transcript 掩码后落 cap.kv。
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="danger small" onClick={clearHistory}>清理全部历史 transcript</button>
        </div>
      </div>
      <div className="sd-card sd-hint">
        <div className="sd-label">AI 联动</div>
        对 Polaris 里的 AI 说「用长连接调试台连一下 ws://… 发条消息看回什么」或「抓取这个 SSE 接口 30 秒看事件长什么样」，
        它会经 MCP 工具 ws_connect / ws_send / ws_wait_frame / sse_capture 代劳，结果自动掩码。
      </div>
    </div>
  )
}
