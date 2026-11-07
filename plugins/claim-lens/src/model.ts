/**
 * 数据面：cap.kv claim-lens.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 字节面：面板 → POST http://127.0.0.1:<meta.port>/api/*（自家服务，token 鉴权）。
 * 提取在面板本地完成（shared/claim-core.js 纯函数打包进 bundle）；核验走服务（需要 fs/exec）。
 */
import { getHostInvoke } from './host'

export interface ClaimLensMeta {
  token: string
  port: number
  version?: string
  startedAt?: string
}

export interface ClaimSettings {
  roots: string[]
  updatedAt?: string
}

export type Verdict = 'verified' | 'refuted' | 'partial' | 'unverifiable'

export interface Claim {
  id: number
  type: string
  target: string
  file?: string | null
  subcmd?: string[]
  flags?: string[]
  constraint?: string | null
  quote?: string
  line?: number
  source?: string
}

export interface VerifiedClaim extends Claim {
  verdict: Verdict
  evidence: string[]
  hint: string | null
}

export interface Report {
  root: string
  scannedAt: string
  gitStatusNote: string
  summary: { total: number, verified: number, refuted: number, partial: number, unverifiable: number }
  claims: VerifiedClaim[]
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
  const r = res.result && res.result.value !== undefined ? res.result : res
  if (r && typeof r === 'object' && 'value' in (r as Record<string, unknown>)) return (r as { value: unknown }).value
  return r
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await kvReq({ action: 'set', key, value })
}

export async function getMeta(): Promise<ClaimLensMeta | null> {
  try {
    const m = await kvGet('claim-lens.meta')
    if (m && typeof m === 'object' && typeof (m as ClaimLensMeta).port === 'number' && (m as ClaimLensMeta).token) {
      return m as ClaimLensMeta
    }
  } catch (_) { /* 桥降级 */ }
  return null
}

export async function loadSettings(): Promise<ClaimSettings> {
  try {
    const s = await kvGet('claim-lens.settings')
    if (s && typeof s === 'object' && Array.isArray((s as ClaimSettings).roots)) return s as ClaimSettings
  } catch (_) { /* 降级 */ }
  return { roots: [] }
}

export async function saveRoot(roots: string[], nextRoot: string): Promise<void> {
  const list = [nextRoot, ...roots.filter((r) => r !== nextRoot)].slice(0, 8)
  await kvSet('claim-lens.settings', { roots: list, updatedAt: new Date().toISOString() })
}

// ── 服务 API ────────────────────────────────────────────────────────────────

async function api<T>(meta: ClaimLensMeta, pathName: string, body: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${meta.port}${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-claim-lens-token': meta.token },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { ok?: boolean, error?: string } & T
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const apiVerify = (meta: ClaimLensMeta, text: string, root: string) =>
  api<{ report: Report }>(meta, '/api/verify', { text, root })

export const apiVerifyBatch = (meta: ClaimLensMeta, claims: Claim[], root: string) =>
  api<{ report: Report }>(meta, '/api/verify_batch', { claims, root })

export const apiSelftest = (meta: ClaimLensMeta) =>
  api<{ pass: number, fail: number, items: Array<{ name: string, ok: boolean, detail: string }> }>(meta, '/api/selftest', {})
