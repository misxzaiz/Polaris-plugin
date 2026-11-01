/**
 * model.ts —— 面板数据层：类型 + 服务 API 客户端 + 实时帧流客户端
 *
 * 数据面：面板 → 127.0.0.1:{meta.port} 直连（Bearer token 头）。
 * 实时帧流：fetch 流式读服务的 text/event-stream（不使用 EventSource——
 * 它不能带 Authorization 头；用 fetch + shared/core 的 SSE 解析器自解析，
 * 正好与本插件「解决 EventSource 局限」的产品定位同源）。
 * 断线自动重连（指数退避 ≤3s），重连用 since 游标补帧。
 */
import { createSseParser, maskHeaders } from '../shared/core'
import { kvGet } from './host'

// ── 类型（与 service/shared 口径对齐）──────────────────────────────────────

export interface SvcMeta {
  port: number
  token: string
  pid?: number
  version?: string
  startedAt?: number
  live?: number
}

export interface Frame {
  seq: number
  ts: number
  gapMs: number
  dir: 'in' | 'out' | 'note'
  kind: string
  size?: number
  text?: string
  b64?: string
  truncated?: boolean
  code?: number
  reason?: string
  latencyMs?: number
  rttMs?: number
  level?: 'info' | 'warn' | 'error'
  message?: string
  event?: string | null
  id?: string | null
  httpStatus?: number
}

export interface GapStats {
  count: number; min: number; median: number; mean: number; p95: number; max: number
}

export interface SessionStats {
  ttftMs?: number
  firstEventMs?: number
  totalMs?: number
  bytes?: number
  eventCount?: number
  chunkCount?: number
  gaps?: GapStats
  comments?: number
}

export interface SessionCounters { in?: number; out?: number; pings?: number; pongs?: number; errors?: number; bytesIn?: number; bytesOut?: number }

export interface SessionSummary {
  id: string
  kind: 'ws' | 'sse'
  url: string
  title: string
  state: string
  createdAt: number
  openAt: number | null
  closedAt: number | null
  closedReason: string
  frameCount: number
  counters: SessionCounters
  stats: SessionStats | null
}

export interface HandshakeInfo {
  ok: boolean
  httpStatus?: number
  statusText?: string
  latencyMs?: number
  headers?: Record<string, string>
  error?: string
}

export interface SessionRequest {
  method?: string
  url: string
  headers?: Record<string, string>
  subprotocols?: string[]
  pingIntervalSec?: number
  body?: string
  maxEvents?: number
  durationMs?: number
}

export interface SessionDetail {
  summary: SessionSummary
  request: SessionRequest
  handshake: HandshakeInfo | null
  frames: Frame[]
  cursor: number
  degraded?: boolean
}

export interface Settings {
  maxFrames: number
  frameBodyCap: number
  pingIntervalSec: number
  maskHeaders: boolean
  sseMaxEvents: number
  sseDurationMsMax: number
  transcriptTail: number
}

export interface WsOpenParams {
  url: string
  headers?: Record<string, string>
  subprotocols?: string[]
  pingIntervalSec?: number
  title?: string
}

export interface SseOpenParams {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  maxEvents?: number
  durationMs?: number
  title?: string
}

export interface MetaInfo {
  version: string
  port: number
  uptime: number
  degraded: boolean
  live: number
  kvEndpoint: string | null
}

// ── 服务客户端 ──────────────────────────────────────────────────────────────

let metaCache: SvcMeta | null = null

/** 读服务 meta（kv → 缓存）；服务未注册返回 null */
export async function readMeta(force = false): Promise<SvcMeta | null> {
  if (!force && metaCache) return metaCache
  const m = await kvGet<SvcMeta>('streamdesk.meta')
  if (m && typeof m.port === 'number' && m.token) {
    metaCache = m
    return m
  }
  metaCache = null
  return null
}

export function invalidateMeta(): void {
  metaCache = null
}

export class SvcError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

async function svc<T>(method: string, path: string, body?: unknown, timeoutMs = 35_000): Promise<T> {
  const meta = await readMeta()
  if (!meta) throw new SvcError('服务未注册：后台服务尚未拉起或 kv 不可达（稍候自动重试）')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${meta.token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch (_) { parsed = null }
    if (!res.ok) throw new SvcError((parsed && parsed.error) || `HTTP ${res.status}`, res.status)
    return parsed as T
  } catch (e) {
    if (e instanceof SvcError) throw e
    if ((e as Error).name === 'AbortError') throw new SvcError('请求超时')
    throw new SvcError(`服务不可达：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  sessions: () => svc<{ sessions: SessionSummary[]; degraded: boolean; version: string }>('GET', '/api/sessions'),
  sessionDetail: (id: string, since: number) =>
    svc<SessionDetail>('GET', `/api/session/${encodeURIComponent(id)}?since=${since}`),
  openWs: (p: WsOpenParams) => svc<{ session: SessionSummary }>('POST', '/api/session/ws', p),
  openSse: (p: SseOpenParams) => svc<{ session: SessionSummary }>('POST', '/api/session/sse', p),
  send: (id: string, body: { op: 'text' | 'binary' | 'ping'; text?: string; b64?: string }) =>
    svc<{ ok: boolean }>('POST', `/api/session/${encodeURIComponent(id)}/send`, body),
  close: (id: string, code?: number, reason?: string) =>
    svc<{ ok: boolean }>('POST', `/api/session/${encodeURIComponent(id)}/close`, { code, reason }),
  stop: (id: string) => svc<{ ok: boolean }>('POST', `/api/session/${encodeURIComponent(id)}/stop`),
  reconnect: (id: string) => svc<{ session: SessionSummary }>('POST', `/api/session/${encodeURIComponent(id)}/reconnect`),
  remove: (id: string) => svc<{ ok: boolean }>('DELETE', `/api/session/${encodeURIComponent(id)}`),
  settings: () => svc<{ settings: Settings; degraded: boolean; version: string; uptime: number }>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Settings>) => svc<{ settings: Settings }>('POST', '/api/settings', patch),
  clearHistory: () => svc<{ ok: boolean }>('POST', '/api/history/clear'),
  meta: () => svc<MetaInfo>('GET', '/api/meta'),
}

// ── 实时帧流（fetch-SSE 自解析 + 游标重连）──────────────────────────────────

export interface StreamHandlers {
  onFrames: (frames: Frame[]) => void
  onStatus: (summary: SessionSummary) => void
  onDown?: () => void
}

/**
 * 订阅会话实时帧流。返回取消函数。
 * 实现：fetch 流式读 + createSseParser（isomorphic，与 service 同口径）；
 * 断线自动重连（退避 500ms→1s→2s→3s 封顶），重连带 since 补帧。
 */
export function streamSession(sessionId: string, handlers: StreamHandlers): () => void {
  let stopped = false
  let cursor = -1
  let backoff = 500
  let controller: AbortController | null = null

  const loop = async () => {
    while (!stopped) {
      const meta = await readMeta()
      if (!meta) { await sleep(Math.min(backoff *= 1.5, 3_000)); continue }
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 90_000) // 流空闲兜底
      try {
        const res = await fetch(
          `http://127.0.0.1:${meta.port}/api/session/${encodeURIComponent(sessionId)}/stream?since=${cursor}`,
          { headers: { Authorization: `Bearer ${meta.token}` }, signal: controller.signal },
        )
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        backoff = 500
        const parser = createSseParser()
        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          for (const ev of parser.push(text)) handleStreamEvent(ev, handlers, (c) => { cursor = c })
          for (const ev of parser.flush()) handleStreamEvent(ev, handlers, (c) => { cursor = c })
        }
      } catch (_) {
        if (stopped) return
        handlers.onDown?.()
        await sleep(backoff)
        backoff = Math.min(backoff * 2, 3_000)
      } finally {
        clearTimeout(timeout)
        controller = null
      }
      if (stopped) return
      await sleep(200) // 重连小间隔
    }
  }
  void loop()
  return () => {
    stopped = true
    try { controller?.abort() } catch (_) { /* 忽略 */ }
  }
}

function handleStreamEvent(
  ev: { data: string },
  handlers: StreamHandlers,
  setCursor: (c: number) => void,
): void {
  if (!ev.data) return
  try {
    const msg = JSON.parse(ev.data)
    if (msg.type === 'frames' && Array.isArray(msg.frames)) {
      for (const f of msg.frames) if (typeof f.seq === 'number' && f.seq > 0) setCursor(f.seq)
      handlers.onFrames(msg.frames)
    } else if (msg.type === 'status' && msg.summary) {
      if (typeof msg.summary.frameCount === 'number') setCursor(Math.max(0, msg.summary.frameCount - 1))
      handlers.onStatus(msg.summary)
    }
  } catch (_) { /* 坏行忽略 */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 本地工具 ────────────────────────────────────────────────────────────────

/** 请求头掩码的展示包装（本地已有完整值时不必掩；此函数用于把手势统一交给 core） */
export function maskForDisplay(headers: Record<string, string> | undefined | null): Record<string, string> {
  return maskHeaders(headers || {}, true)
}

export function prettyJson(s: string): string | null {
  try {
    const v = JSON.parse(s)
    return JSON.stringify(v, null, 2)
  } catch (_) {
    return null
  }
}

export function b64ToHex(b64: string, maxBytes = 512): string {
  try {
    const bin = atob(b64)
    const arr: string[] = []
    for (let i = 0; i < Math.min(bin.length, maxBytes); i++) {
      arr.push(bin.charCodeAt(i).toString(16).padStart(2, '0'))
    }
    return arr.join(' ')
  } catch (_) {
    return '(base64 解析失败)'
  }
}
