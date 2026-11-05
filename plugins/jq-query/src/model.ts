/**
 * 数据面：cap.kv jq-query.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 字节面：面板 → POST http://127.0.0.1:<meta.port>/api/*（自家服务，token 鉴权；qr-desk 模式）。
 * 文件面：面板读本地文件经 cap.fs get_file_content（hex-lens 模式），base64 → UTF-8 解码。
 */
import { getHostInvoke } from './host'

export interface JqMeta {
  token: string
  port: number
  version?: string
  startedAt?: string
}

export interface ArgRow {
  kind: 'arg' | 'argjson'
  name: string
  value: string
}

export interface QueryResult {
  raw: string
  rawBytes: number
  ms: number
  truncated: boolean
  truncationNotice?: string | null
  inputDocs: number
  inputBytes: number
  flags: string[]
  timeoutMs: number
  outputs?: Array<{ value?: unknown, error?: string, raw?: string }>
  outputCount?: number | null
}

export interface CheckResult {
  syntaxOk: boolean
  error: string | null
  errorKind: 'syntax' | 'runtime' | null
  runtimeNote?: string | null
  note?: string
}

export interface ReferenceEntry {
  cat: string
  sig: string
  desc: string
  ex: string
}

export interface SelftestResult {
  pass: number
  fail: number
  total: number
  results: Array<{ name: string, pass: boolean, detail?: string }>
  engine: { queries: number, timeouts: number, respawns: number, errors: number, busy: boolean }
}

interface DispatchResponse {
  ok?: boolean
  error?: unknown
  result?: { value?: unknown }
}

async function kvReq<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target: 'cap.kv', payload } })
  if (!res || res.ok === false) throw new Error(String(res && res.error) || 'cap.kv 调用失败')
  return res as unknown as T
}

export async function kvGet(key: string): Promise<unknown> {
  const res = await kvReq<{ result?: { value?: unknown } }>({ action: 'get', key })
  return res.result && res.result.value !== undefined ? res.result.value : null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await kvReq({ action: 'set', key, value })
}

const KEY_META = 'jq-query.meta'
export const KEY_HISTORY = 'jq-query.history'
export const KEY_LAST = 'jq-query.last'

export async function getMeta(): Promise<JqMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<JqMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as JqMeta
  } catch (_) {
    return null
  }
}

/** 历史条目：查询 + 当时 flags（一键完整还原） */
export interface HistoryItem {
  q: string
  flags?: string[]
  ts: number
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await kvGet(KEY_HISTORY)
    if (Array.isArray(raw)) {
      return raw
        .filter((x): x is HistoryItem => Boolean(x) && typeof (x as HistoryItem).q === 'string')
        .slice(0, 50)
    }
  } catch (_) { /* 桥降级：无历史 */ }
  return []
}

export async function saveHistory(items: HistoryItem[]): Promise<void> {
  try { await kvSet(KEY_HISTORY, items.slice(0, 50)) } catch (_) { /* 历史写失败不影响查询 */ }
}

export interface LastSession {
  input?: string
  query?: string
  flags?: string[]
  args?: ArgRow[]
}

export async function loadLast(): Promise<LastSession | null> {
  try {
    const raw = await kvGet(KEY_LAST)
    if (raw && typeof raw === 'object') return raw as LastSession
  } catch (_) { /* ignore */ }
  return null
}

export async function saveLast(s: LastSession): Promise<void> {
  try { await kvSet(KEY_LAST, s) } catch (_) { /* ignore */ }
}

// ── 服务 HTTP 客户端（127.0.0.1 直连；token 鉴权）───────────────────────────
async function svcPost<T>(meta: JqMeta, api: string, body: unknown): Promise<T> {
  const r = await fetch(`http://127.0.0.1:${meta.port}${api}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-jq-query-token': meta.token },
    body: JSON.stringify(body ?? {}),
  })
  let json: unknown = null
  try { json = await r.json() } catch (_) { /* 服务异常返回非 JSON */ }
  const obj = (json ?? {}) as { ok?: boolean, error?: string }
  if (!r.ok || obj.ok === false) throw new Error(obj.error || `服务返回 HTTP ${r.status}`)
  return json as T
}

export function apiHealth(meta: JqMeta): Promise<{ ok: boolean, version?: string, engine?: Record<string, unknown> }> {
  return svcPost(meta, '/__health', {})
}

export function apiQuery(meta: JqMeta, body: { input: string, query: string, flags: string[], timeoutMs?: number }): Promise<QueryResult> {
  return svcPost(meta, '/api/query', body)
}

export function apiCheck(meta: JqMeta, query: string): Promise<CheckResult> {
  return svcPost(meta, '/api/check', { query })
}

export function apiOutline(meta: JqMeta, body: { json: string, depth?: number }): Promise<{ node: unknown, text: string }> {
  return svcPost(meta, '/api/outline', body)
}

export function apiReference(meta: JqMeta, keyword: string): Promise<{ entries: ReferenceEntry[], total: number, truncated: boolean }> {
  return svcPost(meta, '/api/reference', { keyword })
}

export function apiSelftest(meta: JqMeta): Promise<SelftestResult> {
  return svcPost(meta, '/api/selftest', {})
}

// ── 文件读取（cap.fs → base64 → UTF-8 文本）────────────────────────────────
export async function readTextFile(path: string): Promise<string> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', {
    req: { target: 'cap.fs', payload: { action: 'get_file_content', path } },
  })
  if (!res || res.ok === false) throw new Error(String(res && res.error) || '读取失败（宿主权限或路径不存在）')
  const content = String(res.result?.value ?? '')
  // cap.fs 文件内容通道返回 base64；兼容纯文本直传（hex-lens 同款启发式）
  const compact = content.replace(/\s+/g, '')
  if (compact.length > 0 && compact.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
    try {
      const bin = atob(compact)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    } catch (_) { /* 落回直传文本 */ }
  }
  return content
}
