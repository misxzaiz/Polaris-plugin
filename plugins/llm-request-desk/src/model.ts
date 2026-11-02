/**
 * model.ts —— 面板数据层：类型 + cap.kv 读 + 单槽信箱命令
 *
 * 面板零网络请求：一切经宿主 invoke → router_dispatch(cap.kv)。
 * 命令：写 llmdesk.cmd（{nonce, action, payload}）→ 轮询 llmdesk.res 按
 * nonce 对齐 → 删除回执。持久态（endpoints/latest/history/meta）直接读。
 */
import { getHostInvoke } from './host'

export type Wire = 'anthropic-messages' | 'openai-chat-completions'

export interface MaskedEndpoint {
  id: string
  name: string
  baseUrl: string
  wire: Wire
  pathOverride?: string
  anthropicVersion?: string
  keyMask: string
  source: 'host' | 'manual'
  importedAt: string
}

export interface Finding {
  id: string
  severity: 'error' | 'warn' | 'info'
  title: string
  detail: string
  fix?: string
}

export interface StreamSummary {
  text: string
  reasoning: string
  ttftMs: number | null
  chunkCount: number
  bytes: number
  finishReason: string | null
  usage: { prompt: number | null; completion: number | null; total?: number | null; exact?: boolean } | null
  doneMarker: boolean
  sawError: { message?: string; code?: string } | null
  totalMs?: number
  tps?: number
}

export interface TimelineRow {
  dt: number
  bytes: number
  preview: string
}

export interface ParsedError {
  providerCode: string
  message: string
  retryAfterMs: number | null
  raw: string
}

export interface ReqRecord {
  reqId: string
  at: string
  endpoint: { id: string; name: string; baseUrl: string; wire: Wire; keyMask: string }
  url: string
  body: Record<string, unknown>
  maskedHeaders: Record<string, string>
  status: number
  ms: number
  stream: boolean
  streamInfo: StreamSummary | null
  timeline: TimelineRow[]
  respText: string
  parsedError: ParsedError | null
  content: string | null
  findings: Finding[]
  ok: boolean
  error?: string
}

export interface HistoryEntry {
  reqId: string
  at: string
  endpointId: string
  endpointName: string
  model: string
  status: number
  ms: number
  ttftMs: number | null
  ok: boolean
  firstFinding: string
}

export interface ServiceMeta {
  ts: string
  version: string
  degraded: boolean
  lastBridgeErr?: string | null
  running: { reqId: string; endpointName: string; startedAt: number } | null
  endpointCount: number
}

export interface Draft {
  model: string
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens?: number
  temperature?: number
  topP?: number
  stream: boolean
  stop?: string
  tools?: unknown[]
  extra?: Record<string, unknown>
  rawBody?: Record<string, unknown>
}

export interface MutatorInfo {
  id: string
  label: string
  note: string
}

export const K = {
  meta: 'llmdesk.meta',
  endpoints: 'llmdesk.endpoints',
  latest: 'llmdesk.latest',
  history: 'llmdesk.history',
  settings: 'llmdesk.settings',
  cmd: 'llmdesk.cmd',
  res: 'llmdesk.res',
  req: (id: string) => `llmdesk.req.${id}`,
}

async function kvGet<T>(key: string): Promise<T | null> {
  const invoke = getHostInvoke()
  const r = await invoke<{ ok: boolean; result?: { value?: T } }>('router_dispatch', {
    target: 'cap.kv',
    payload: { action: 'get', key },
  })
  if (r && r.ok && r.result && r.result.value !== undefined && r.result.value !== null) return r.result.value
  return null
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const invoke = getHostInvoke()
  const r = await invoke<{ ok: boolean; error?: string }>('router_dispatch', {
    target: 'cap.kv',
    payload: { action: 'set', key, value },
  })
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'cap.kv set 失败')
}

async function kvDel(key: string): Promise<void> {
  const invoke = getHostInvoke()
  await invoke('router_dispatch', { target: 'cap.kv', payload: { action: 'delete', key } }).catch(() => undefined)
}

export const loadMeta = () => kvGet<ServiceMeta>(K.meta)
export const loadEndpoints = () => kvGet<{ at: string; items: MaskedEndpoint[] }>(K.endpoints)
export const loadLatest = () => kvGet<ReqRecord>(K.latest)
export const loadHistory = () => kvGet<HistoryEntry[] | { items: HistoryEntry[] }>(K.history)
export const loadReq = (id: string) => kvGet<ReqRecord>(K.req(id))

export function normalizeHistory(v: HistoryEntry[] | { items?: HistoryEntry[] } | null): HistoryEntry[] {
  if (Array.isArray(v)) return v
  if (v && Array.isArray((v as { items?: HistoryEntry[] }).items)) return (v as { items: HistoryEntry[] }).items
  return []
}

let nonceSeq = 0

/** 发送命令并等待回执；waitMs=0 只投不等 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendCommand(action: string, payload: Record<string, unknown>, waitMs = 180000): Promise<any> {
  const nonce = `p${Date.now().toString(36)}-${++nonceSeq}`
  await kvSet(K.cmd, { nonce, action, payload, at: new Date().toISOString() })
  if (waitMs === 0) return { ok: true, pending: true }
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await sleep(1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await kvGet<any>(K.res)
    if (res && res.nonce === nonce) {
      await kvDel(K.res)
      return res.result || { ok: false, error: '回执为空' }
    }
  }
  return { ok: false, pending: true, error: `命令已投递，${Math.round(waitMs / 1000)}s 内未见回执（请求可能仍在进行，稍后到「历史」页查看）` }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 展示工具 ────────────────────────────────────────────────────────────────
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

export function fmtTime(iso: string | undefined): string {
  if (!iso) return '—'
  return String(iso).replace('T', ' ').slice(5, 16)
}

export const SEVERITY_COLOR: Record<string, string> = {
  error: '#F85149',
  warn: '#D29922',
  info: '#58A6FF',
}
export const SEVERITY_LABEL: Record<string, string> = { error: '错误', warn: '警告', info: '提示' }
