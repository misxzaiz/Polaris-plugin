/**
 * model.ts —— 面板数据层：类型 + cap.kv 读 + 单槽信箱命令
 *
 * 面板零网络请求：一切经宿主 invoke → router_dispatch(cap.kv)。
 * 命令：写 oadesk.cmd（{nonce, action, payload}）→ 轮询 oadesk.res 按
 * nonce 对齐 → 删除回执。持久态（specs/latest/history/meta/envs）直接读。
 */
import { getHostInvoke } from './host'

export interface SpecSummary {
  id: string
  name: string
  title: string
  version: string
  specVersion: string
  openapiVersion: string
  source: string
  sourceDetail: string
  importedAt: string
  endpointCount: number
  pathCount: number
  serverUrls: string[]
  externalRefs: number
  hints: string[]
  infoDescription: string
}

export interface ParamBrief {
  name: string
  in: string
  required: boolean
  type: string | null
  description: string
  example?: unknown
}

export interface EndpointBrief {
  id: string
  method: string
  path: string
  summary: string
  tags: string[]
  deprecated: boolean
  parameters: ParamBrief[]
  hasRequestBody: boolean
  requestBodyRequired: boolean
  requestBodyContentTypes: string[]
  responseCodes: string[]
  needsAuth: boolean
}

export interface EndpointDetail extends EndpointBrief {
  description: string
  exampleBody: { mediaType: string; text: string } | null
  responses: Record<string, { description: string; hasSchema: boolean; contentTypes: string[] }>
  securityReqs: Record<string, string[]>[] | null
}

export interface EnvView {
  baseUrl: string | null
  auth: {
    type: string
    name?: string
    in?: string
    username?: string
    tokenMask?: string
    valueMask?: string
  } | null
  savedAt?: string
}

export interface Drift {
  jsonPath: string
  kind: string
  severity: 'breaking' | 'warn' | 'info'
  expected: string
  actual: string
  hint?: string
}

export interface Validation {
  statusInContract: boolean
  matchedSchema: unknown
  drifts: Drift[]
  summary: { breaking: number; warn: number; info: number; total: number }
}

export interface CallRecord {
  reqId: string
  at: string
  spec: { id: string; name: string }
  endpoint: { id: string; method: string; path: string }
  url: string
  maskedHeaders: Record<string, string>
  authUsed: { type: string; name?: string; masked?: string } | null
  status: number
  ms: number
  location: string | null
  respHeaders: Record<string, string>
  respText: string
  respBytes: number
  validation: Validation | null
  ok: boolean
  error?: string
  viaAi: boolean
}

export interface HistoryEntry {
  reqId: string
  at: string
  specId: string
  specName: string
  endpointId: string
  method: string
  path: string
  status: number
  ms: number
  ok: boolean
  viaAi: boolean
  drifts: string | null
}

export interface ServiceMeta {
  ts: string
  version: string
  degraded: boolean
  lastBridgeErr?: string | null
  running: { reqId: string; label: string; startedAt: number } | null
  specCount: number
}

export interface DiffChange {
  kind: string
  breaking: boolean
  severity?: string
  path: string
  method?: string
  detail: string
  expected?: string
  actual?: string
}

export interface DiffReport {
  id: string
  at: string
  a: { id: string; name: string; version: string; importedAt: string }
  b: { id: string; name: string; version: string; importedAt: string }
  changes: DiffChange[]
  summary: { breaking: number; warn: number; info: number; total: number }
}

export interface AuthDraft {
  type: '' | 'bearer' | 'basic' | 'apiKey'
  token: string
  username: string
  password: string
  name: string
  in: 'header' | 'query'
  value: string
}

export const K = {
  meta: 'oadesk.meta',
  specs: 'oadesk.specs',
  envs: 'oadesk.envs',
  latest: 'oadesk.latest',
  history: 'oadesk.history',
  cmd: 'oadesk.cmd',
  res: 'oadesk.res',
  req: (id: string) => `oadesk.req.${id}`,
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
export const loadSpecs = () => kvGet<{ at: string; items: SpecSummary[] }>(K.specs)
export const loadEnvs = () => kvGet<{ at: string; items: (EnvView & { specId: string })[] }>(K.envs)
export const loadLatest = () => kvGet<CallRecord>(K.latest)
export const loadHistory = () => kvGet<HistoryEntry[] | { items: HistoryEntry[] }>(K.history)
export const loadReq = (id: string) => kvGet<CallRecord>(K.req(id))

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
    await sleep(600)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await kvGet<any>(K.res)
    if (res && res.nonce === nonce) {
      await kvDel(K.res)
      return res.result || { ok: false, error: '回执为空' }
    }
  }
  return { ok: false, pending: true, error: `命令已投递，${Math.round(waitMs / 1000)}s 内未见回执（请求可能仍在进行，稍后到调试页历史区查看）` }
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
  breaking: '#F85149',
  warn: '#D29922',
  info: '#58A6FF',
}
export const SEVERITY_LABEL: Record<string, string> = { breaking: '破坏性', warn: '告警', info: '信息' }

export const METHOD_COLOR: Record<string, string> = {
  GET: '#3FB950',
  POST: '#A371F7',
  PUT: '#D29922',
  PATCH: '#DB6D28',
  DELETE: '#F85149',
  HEAD: '#8B949E',
  OPTIONS: '#8B949E',
}
