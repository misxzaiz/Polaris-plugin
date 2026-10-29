/**
 * 数据层（文档检索面板）
 *   kv 面：cap.kv weibian.settings / weibian.meta / weibian.stats / weibian.recent
 *   服务面：127.0.0.1（桌面）或当前 origin 主机（手机经局域网访问 PC 时）
 */
import { getHostInvoke } from './host'
import * as core from '../shared/core'

export { core }

// ── 类型 ─────────────────────────────────────────────────────────────────────
export interface WeibianSettings {
  roots: string[]
  extraExcludes: string[]
  maxDocs: number
  maxFileMB: number
  maxTextKB: number
  includeHidden: boolean
  enabled: boolean
}

export interface WeibianMeta {
  token: string
  port: number
  version?: string
  pid?: number
}

export interface WeibianStats {
  docs: number
  tokens: number
  bytes: number
  roots: number
  maxDocs: number
  scanning: boolean
  pending: number
  lastScanAt: number
  lastScanMs: number
  capped: boolean
  degraded?: boolean
  errors: { path: string, reason: string, at: number }[]
  byExt: Record<string, number>
  bootAt: number
}

export interface SnippetHits { s: number, e: number }
export interface SnippetOut { text: string, hits: SnippetHits[] }

export interface SearchResult {
  id: string
  path: string
  name: string
  ext: string
  cat: string
  score: number
  size: number
  mtime: number
  snippet: SnippetOut
}

export interface SearchResp {
  ok: boolean
  error?: string
  query?: string
  total?: number
  took?: number
  results?: SearchResult[]
}

export interface ReadResp {
  ok: boolean
  error?: string
  path?: string
  total?: number
  offset?: number
  text?: string
  truncated?: boolean
  totalBytes?: number
}

export interface ProgressResp extends WeibianStats { ok: boolean }

export interface ProbeResp {
  ok: boolean
  suggestions: { label: string, path: string }[]
  home: string
  checked?: { path: string, exists: boolean, isDir: boolean }
}

// ── kv 面 ────────────────────────────────────────────────────────────────────
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

const KEY_META = 'weibian.meta'
const KEY_SETTINGS = 'weibian.settings'
const KEY_STATS = 'weibian.stats'
const KEY_RECENT = 'weibian.recent'

export function normalizeSettings(raw: unknown): WeibianSettings {
  return core.normalizeSettings(raw) as unknown as WeibianSettings
}

export async function loadSettings(): Promise<WeibianSettings> {
  return normalizeSettings(await kvGet(KEY_SETTINGS))
}

export async function saveSettings(s: WeibianSettings): Promise<void> {
  await kvSet(KEY_SETTINGS, s)
}

export async function getMeta(): Promise<WeibianMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<WeibianMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as WeibianMeta
  } catch (_) {
    return null
  }
}

export async function loadStats(): Promise<WeibianStats | null> {
  const raw = await kvGet(KEY_STATS)
  return raw && typeof raw === 'object' ? (raw as WeibianStats) : null
}

export async function loadRecent(): Promise<string[]> {
  const raw = await kvGet(KEY_RECENT)
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
}

export async function pushRecent(q: string): Promise<string[]> {
  const list = await loadRecent()
  const next = [q, ...list.filter((x) => x !== q)].slice(0, 20)
  await kvSet(KEY_RECENT, next)
  return next
}

export async function clearRecent(): Promise<void> {
  await kvSet(KEY_RECENT, [])
}

// ── 服务面 ───────────────────────────────────────────────────────────────────
export function serviceBase(meta: WeibianMeta): string {
  const loc = window.location
  const host = loc.hostname || '127.0.0.1'
  const isLocal = host === '127.0.0.1' || host === 'localhost'
  // 手机经局域网地址打开 Polaris Web 时，同主机直连 PC 的文档检索服务端口
  return `${isLocal ? 'http' : loc.protocol.startsWith('https') ? 'https' : 'http'}://${isLocal ? '127.0.0.1' : host}:${meta.port}`
}

async function svcFetch<T>(meta: WeibianMeta, api: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(serviceBase(meta) + api, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-weibian-token': meta.token },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export class ServiceUnavailableError extends Error {}

async function svc<T>(api: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const meta = await getMeta()
  if (!meta) throw new ServiceUnavailableError('文档检索服务未就绪：首次使用请稍候几秒（宿主自动拉起后台服务），或重新打开面板。')
  try {
    return await svcFetch<T>(meta, api, body, timeoutMs)
  } catch (e) {
    throw new ServiceUnavailableError('文档检索服务不可达：' + String((e as Error).message) + '（手机端请确认与电脑同一局域网）')
  }
}

export function apiSearch(query: string, limit = 20): Promise<SearchResp> {
  return svc<SearchResp>('/api/search', { query, limit }, 30000)
}

export function apiRead(path: string, offset = 0, maxChars = 6000): Promise<ReadResp> {
  return svc<ReadResp>('/api/read', { path, offset, maxChars })
}

export function apiProgress(): Promise<ProgressResp> {
  return svc<ProgressResp>('/api/progress', undefined, 8000)
}

export function apiReindex(all: boolean): Promise<{ ok: boolean }> {
  return svc<{ ok: boolean }>('/api/reindex', { all }, 8000)
}

export function apiProbe(path?: string): Promise<ProbeResp> {
  return svc<ProbeResp>('/api/probe', { path }, 8000)
}
