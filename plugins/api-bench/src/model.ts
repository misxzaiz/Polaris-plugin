/**
 * 面板数据层（与 service/shared 同源口径）：
 * - 数据面：cap.kv api-bench.*（经宿主 invoke → router_dispatch）——meta 引导 / 历史 / 报告（移动端也可读）
 * - 字节面：127.0.0.1:<meta.port> 直连自家服务（token 鉴权）——发起/停止/实时进度（desktop-first）
 * 纯逻辑（校验/掩码/对比）与 service 共用 shared/bench-core（JS 模块，这里单方声明类型）。
 */
import * as core from '../shared/bench-core'
import { getHostInvoke } from './host'

export { core }

// ── 类型（与 service/main.js 输出 schema 对齐）───────────────────────────────

export interface ServiceMeta {
  ts: string
  version: string
  port: number
  token: string
  degraded: boolean
  lastBridgeErr?: string
  running?: LiveSnapshot | null
  lastReportId?: string | null
}

export interface LiveSnapshot {
  runId: string
  source: 'panel' | 'mcp'
  elapsedS: number
  durationS: number
  connections: number
  method: string
  url: string
  rate: number | null
  rps: number
  bytesPerSec: number
  latMean: number | null
  latP90: number | null
  latP97_5: number | null
  latCount: number
  errs: number
  non2xx: number
  statusCounts: Record<string, number>
  sent: number
  done: number
}

export interface BenchSample {
  t: number
  rps: number
  bytes: number
  latMean: number | null
  latP97_5: number | null
  errs: number
}

export interface BenchTarget {
  url: string
  method: string
  headers: Record<string, string>
  bodyBytes: number
  connections: number
  pipelining: number
  durationS: number
  rate: number | null
  timeoutS: number
  scope: 'loopback' | 'private' | 'public' | 'invalid'
}

export interface BenchSummary {
  durationS: number
  totalRequests: number
  sentRequests: number
  rpsMean: number
  rpsPeak: number
  bytesMean: number
  bytesTotal: number
  errors: number
  timeouts: number
  mismatches: number
  resets: number
  non2xx: number
  non2xxPct: number
  ok2xx: number
  statusDist: Record<string, number>
  latencies: {
    mean: number; stddev: number; min: number; max: number
    p50: number; p75: number; p90: number; p97_5: number; p99: number; p99_9: number
  }
  aborted: boolean
  samples: BenchSample[]
}

export interface BenchReport {
  runId: string
  at: string
  version: string
  target: BenchTarget
  summary: BenchSummary
  verdict: { oneLine: string; notes: string[] }
}

export interface HistoryEntry {
  runId: string
  at: string
  url: string
  method: string
  connections: number
  durationS: number
  rpsMean: number
  p50: number
  p97_5: number
  p99: number
  errors: number
  non2xx: number
  aborted: boolean
  verdictOne: string
}

export interface BenchSettings {
  connections: number
  durationS: number
  timeoutS: number
}

export interface SavedTarget {
  id: string
  name: string
  url: string
  method: string
  headers: Record<string, string>
  hasBody: boolean
  connections: number
  durationS: number
  timeoutS: number
  rate: number | null
  scope: string | null
  savedAt: string | null
}

export interface FormState {
  url: string
  method: string
  headersText: string
  body: string
  connections: number
  durationS: number
  timeoutS: number
  rate: string
  pipelining: number
}

// ── 数据面：cap.kv（宿主通道）────────────────────────────────────────────────

interface DispatchResponse {
  ok?: boolean
  error?: unknown
  result?: { value?: unknown; keys?: string[] }
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

const KEY_META = 'api-bench.meta'
const KEY_HISTORY = 'api-bench.history'
const KEY_REPORT = (id: string) => `api-bench.report.${id}`
const KEY_SETTINGS = 'api-bench.settings'

export async function getMeta(): Promise<ServiceMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<ServiceMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as ServiceMeta
  } catch (_) {
    return null
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const v = await kvGet(KEY_HISTORY)
    const items = Array.isArray(v) ? v : (v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items) ? (v as { items: HistoryEntry[] }).items : [])
    return items
  } catch (_) {
    return []
  }
}

export async function loadReport(runId: string): Promise<BenchReport | null> {
  try {
    const v = await kvGet(KEY_REPORT(runId))
    return v && typeof v === 'object' ? (v as BenchReport) : null
  } catch (_) {
    return null
  }
}

export async function loadSettingsKv(): Promise<BenchSettings | null> {
  try {
    const v = await kvGet(KEY_SETTINGS)
    return v && typeof v === 'object' ? (v as BenchSettings) : null
  } catch (_) {
    return null
  }
}

// ── 字节面：127.0.0.1 直连自家服务 ──────────────────────────────────────────

function svcBase(meta: ServiceMeta): string {
  return `http://127.0.0.1:${meta.port}`
}

async function svcFetch<T>(meta: ServiceMeta, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(svcBase(meta) + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-ApiBench-Token': meta.token, ...(init?.headers || {}) },
  })
  const data = await res.json() as T & { error?: string }
  return data
}

export interface OpReply {
  ok: boolean
  error?: string
  busy?: boolean
  runId?: string
  report?: BenchReport
  running?: LiveSnapshot | null
  lastReport?: BenchReport | null
  settings?: BenchSettings
  items?: SavedTarget[]
  target?: SavedTarget
  id?: string
  savedToFile?: boolean
}

export async function opStart(meta: ServiceMeta, form: FormState): Promise<OpReply> {
  return svcFetch<OpReply>(meta, '/api/op', {
    method: 'POST',
    body: JSON.stringify({
      action: 'start',
      payload: {
        url: form.url,
        method: form.method,
        headers: parseHeadersText(form.headersText),
        body: form.body,
        connections: form.connections,
        durationS: form.durationS,
        timeoutS: form.timeoutS,
        rate: form.rate === '' ? null : Number(form.rate),
        pipelining: form.pipelining,
      },
    }),
  })
}

export async function opAction(meta: ServiceMeta, action: string, payload: object = {}): Promise<OpReply> {
  return svcFetch<OpReply>(meta, '/api/op', { method: 'POST', body: JSON.stringify({ action, payload }) })
}

export interface LiveReply {
  ok: boolean
  running: boolean
  live: LiveSnapshot | null
  samples: BenchSample[]
  lastReportId: string | null
  error?: string
}

export async function getLive(meta: ServiceMeta): Promise<LiveReply> {
  return svcFetch<LiveReply>(meta, '/api/live')
}

export async function health(meta: ServiceMeta): Promise<boolean> {
  try {
    const r = await fetch(`${svcBase(meta)}/__health`)
    return r.ok
  } catch (_) {
    return false
  }
}

// ── 表单辅助 ────────────────────────────────────────────────────────────────

/** "Name: value" 每行一条 → 对象；非法行忽略（服务端仍会做权威校验） */
export function parseHeadersText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const idx = t.indexOf(':')
    if (idx <= 0) continue
    const name = t.slice(0, idx).trim()
    const value = t.slice(idx + 1).trim()
    if (name && value) out[name] = value
  }
  return out
}

export function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers) return ''
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')
}

export function formFromSaved(t: SavedTarget): FormState {
  return {
    url: t.url,
    method: t.method || 'GET',
    headersText: headersToText(t.headers),
    body: '',
    connections: t.connections || 10,
    durationS: t.durationS || 10,
    timeoutS: t.timeoutS || 10,
    rate: t.rate ? String(t.rate) : '',
    pipelining: 1,
  }
}
