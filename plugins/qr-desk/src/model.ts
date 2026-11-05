/**
 * 数据面：cap.kv qr-desk.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 字节面：面板 → POST http://127.0.0.1:<meta.port>/api/*（自家服务，token 鉴权）。
 */
import { getHostInvoke } from './host'

export interface QrMeta {
  token: string
  port: number
  version?: string
  startedAt?: string
}

export interface QrSettings {
  outDir: string
}

export interface GenerateResult {
  payload: string
  svg: string
  pngBase64: string
  textArt: string
  meta: { modules: number, bytes: number, ecl: string, pixelSize: number }
  savedTo?: string[]
}

export interface InspectResult {
  type: string
  byteLength: number
  fields?: unknown
  preview?: { kind: string, code: string, period?: number, remainingMs?: number, counter?: number }
  entries?: Array<Record<string, unknown>>
  version?: number
  batchSize?: number
  batchIndex?: number
  batchId?: number
}

export interface DecodeResult {
  found: boolean
  payload?: string
  inspected?: InspectResult | null
  width: number
  height: number
  format: string
  corners?: Record<string, number[]> | null
  message?: string
}

export interface BatchJob {
  id: string
  status: 'running' | 'done' | 'error'
  total: number
  done: number
  outDir: string
  files: Array<{ file: string, bytes: number }>
  error: string | null
  startedAt: string
  finishedAt: string | null
}

interface DispatchResponse {
  ok?: boolean
  error?: unknown
  result?: { value?: unknown, keys?: string[] }
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

const KEY_META = 'qr-desk.meta'
const KEY_SETTINGS = 'qr-desk.settings'

export async function getMeta(): Promise<QrMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<QrMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as QrMeta
  } catch (_) {
    return null
  }
}

export async function loadSettings(): Promise<QrSettings> {
  try {
    const raw = await kvGet(KEY_SETTINGS)
    const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<QrSettings>
    return { outDir: typeof s.outDir === 'string' ? s.outDir : '' }
  } catch (_) {
    return { outDir: '' }
  }
}

export async function saveSettings(s: QrSettings): Promise<void> {
  await kvSet(KEY_SETTINGS, s)
}

// ── 字节面：127.0.0.1 直连自家服务 ─────────────────────────────────────────

async function svcPost<T>(meta: QrMeta, api: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${meta.port}${api}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Qr-Desk-Token': meta.token },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { ok?: boolean, error?: string }
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export function apiGenerate(meta: QrMeta, body: Record<string, unknown>): Promise<GenerateResult> {
  return svcPost<GenerateResult>(meta, '/api/generate', body)
}

export function apiDecode(meta: QrMeta, body: Record<string, unknown>): Promise<DecodeResult> {
  return svcPost<DecodeResult>(meta, '/api/decode', body)
}

export function apiInspect(meta: QrMeta, text: string): Promise<InspectResult> {
  return svcPost<InspectResult>(meta, '/api/inspect', { text })
}

export function apiBatchStart(meta: QrMeta, body: Record<string, unknown>): Promise<{ jobId: string, total: number, outDir: string }> {
  return svcPost<{ jobId: string, total: number, outDir: string }>(meta, '/api/batch', body)
}

export async function apiJob(meta: QrMeta, id: string): Promise<BatchJob> {
  const res = await fetch(`http://127.0.0.1:${meta.port}/api/job?id=${encodeURIComponent(id)}`, {
    headers: { 'X-Qr-Desk-Token': meta.token },
  })
  const data = (await res.json()) as { ok?: boolean, error?: string, job?: BatchJob }
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data.job as BatchJob
}

export interface SelftestResult {
  pass: number
  fail: number
  items: Array<{ name: string, ok: boolean, detail: string }>
}

export function apiSelftest(meta: QrMeta): Promise<SelftestResult> {
  return svcPost<SelftestResult>(meta, '/api/selftest', {})
}
