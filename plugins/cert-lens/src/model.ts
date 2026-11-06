/**
 * 数据面：cap.kv cert-lens.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 字节面：面板 → POST http://127.0.0.1:<meta.port>/api/*（自家服务，token 鉴权；qr-desk 模式）。
 * 文件面：面板读本地证书文件经 cap.fs get_file_content（jq-query 同款 base64 启发式）。
 */
import { getHostInvoke } from './host'

export interface ClMeta {
  token: string
  port: number
  version?: string
  startedAt?: string
}

export interface Finding {
  id: string
  severity: 'crit' | 'warn' | 'info' | 'ok'
  title: string
  detail?: string
  fix?: string
}

export interface SanList { dns: string[], ips: string[], emails: string[], uris: string[], others: string[] }

export interface CertModel {
  index: number
  cn: string | null
  subjectText: string
  issuerText: string
  notBefore: string
  notAfter: string
  daysLeft: number
  validityDays: number
  serial: string
  version: number | null
  san: SanList
  hasSan: boolean
  keyInfo: { algo: string, bits: number | null, curve?: string }
  sigAlg: string | null
  sha256Fp: string
  isCA: boolean
  keyUsage: string[]
  extKeyUsage: string[]
  selfIssued: boolean
  selfSigned: boolean
  aia: { ocsp: string[], caIssuers: string[] }
  pem: string
  findings?: Finding[]
  findingsSeverity?: 'crit' | 'warn' | 'info' | 'ok'
}

export interface ChainAudit {
  leafIndex: number | null
  ordered: number[]
  issues: Array<{ kind: string, index: number | null, detail: string }>
  rootFound: boolean
}

export interface KeyMatch { matched: boolean, keyInfo?: { algo: string, bits: number | null } | null, error?: string | null }

export interface ParseResult {
  kind: { certs: number, pubkeys: number, privkeys: number, encryptedKeys: number, csrBlocks: number, crlBlocks: number }
  csrNote: string | null
  crlNote: string | null
  encryptedKeyNote: string | null
  privkeyNote: string | null
  certs: CertModel[]
  chain: ChainAudit | null
  chainFindings: Finding[]
  chainSeverity: string | null
  keyMatch: KeyMatch | null
  errors: Array<{ index: number, label: string | null, error: string }>
}

export interface Diagnosis {
  from: string
  id: string
  severity: 'crit' | 'warn' | 'info'
  title: string
  cause?: string
  fixes: string[]
  matched?: string
}

export interface ProbeResult {
  verified: boolean
  target: { host: string, port: number, serverName: string | null }
  ms: number
  strict: { ok: boolean, authorized?: boolean, error?: { code: string, message: string } }
  connected: boolean
  relaxed: { protocol: string, cipher: { name: string, version: string } | null, alpn: string | null, authorized?: boolean } | null
  chain: CertModel[]
  chainAudit: ChainAudit
  hostMatch: { host: string, matched: boolean | null, reason: string }
  error: { code: string, message: string } | null
  diagnosis: Diagnosis[]
  expiries: Array<{ cn: string | null, notAfter: string, daysLeft: number, severity: string }>
  severity: 'crit' | 'warn' | 'info' | 'ok'
}

export interface DiagnoseResult {
  rule: string
  matched: string
  severity: string
  title: string
  cause: string | null
  fixes: string[]
  rendered: string
}

export interface WatchEndpoint {
  host: string
  port: number
  serverName: string
  label: string
  addedAt: string
}

export interface WatchRow {
  host: string
  port: number
  label: string
  ok?: boolean
  connected?: boolean
  daysLeft: number | null
  notAfter: string | null
  cn: string | null
  severity: 'ok' | 'info' | 'warn' | 'crit' | 'expired'
  errorCode: string | null
  errorDetail?: string
  checkedAt: string
}

export interface WatchData {
  endpoints: WatchEndpoint[]
  state: { checkedAt: string, results: WatchRow[] } | null
  added?: boolean
  removed?: number
  note?: string
}

export interface SelftestResult {
  pass: number
  fail: number
  total: number
  results: Array<{ name: string, pass: boolean, detail?: string }>
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

const KEY_META = 'cert-lens.meta'
const KEY_LAST_PARSE = 'cert-lens.lastParse'

export async function getMeta(): Promise<ClMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<ClMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as ClMeta
  } catch (_) {
    return null
  }
}

export async function loadLastParse(): Promise<string | null> {
  try {
    const v = await kvGet(KEY_LAST_PARSE)
    return typeof v === 'string' ? v : null
  } catch (_) { return null }
}

export async function saveLastParse(pem: string): Promise<void> {
  try { await kvSet(KEY_LAST_PARSE, pem.slice(0, 256 * 1024)) } catch (_) { /* 降级可接受 */ }
}

// ── 服务 HTTP 客户端（127.0.0.1 直连；token 鉴权）───────────────────────────
async function svcPost<T>(meta: ClMeta, api: string, body: unknown): Promise<T> {
  const r = await fetch(`http://127.0.0.1:${meta.port}${api}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cert-lens-token': meta.token },
    body: JSON.stringify(body ?? {}),
  })
  let json: unknown = null
  try { json = await r.json() } catch (_) { /* 服务异常返回非 JSON */ }
  const obj = (json ?? {}) as { ok?: boolean, error?: string }
  if (!r.ok || obj.ok === false) throw new Error(obj.error || `服务返回 HTTP ${r.status}`)
  return json as T
}

export function apiHealth(meta: ClMeta): Promise<{ ok: boolean, version?: string }> {
  return svcPost(meta, '/__health', {})
}

export function apiParse(meta: ClMeta, body: { pem?: string, pemFile?: string, key?: string, host?: string }): Promise<ParseResult> {
  return svcPost(meta, '/api/parse', body)
}

export function apiProbe(meta: ClMeta, body: { target?: string, host?: string, port?: number, serverName?: string, timeoutMs?: number }): Promise<ProbeResult> {
  return svcPost(meta, '/api/probe', body)
}

export function apiDiagnose(meta: ClMeta, body: { code?: string, message?: string, text?: string }): Promise<DiagnoseResult> {
  return svcPost(meta, '/api/diagnose', body)
}

export function apiWatchList(meta: ClMeta): Promise<WatchData> {
  return svcPost(meta, '/api/watch/list', {})
}

export function apiWatchAdd(meta: ClMeta, body: { target: string, serverName?: string, label?: string }): Promise<WatchData> {
  return svcPost(meta, '/api/watch/add', body)
}

export function apiWatchRemove(meta: ClMeta, target: string): Promise<WatchData> {
  return svcPost(meta, '/api/watch/remove', { target })
}

export function apiWatchCheck(meta: ClMeta): Promise<WatchData> {
  return svcPost(meta, '/api/watch/check', {})
}

export function apiSelftest(meta: ClMeta): Promise<SelftestResult> {
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
