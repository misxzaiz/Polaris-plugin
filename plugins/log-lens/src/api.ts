/**
 * 服务 API 客户端（日志透视台面板）
 *
 * 全部请求经宿主 cap.http → http://127.0.0.1:<port>/api/*。
 * 端口发现：cap.kv lls.meta.port（服务心跳）→ 回退 manifest 9870。
 */
import { kvGet, httpGetViaHost, httpPostViaHost } from './host'

export const MANIFEST_PORT = 9870

export interface LogEntry {
  offset: number
  endOffset: number
  ts: number | null
  level: string | null
  target: string
  message: string
  continuation?: boolean
}

export interface FileInfo {
  path: string
  size: number
  mtimeMs: number
  source: string
}

export interface Settings {
  sources: Array<{ path: string; kind: string; addedAt: number }>
  liveIntervalMs: number
}

export interface SourcesResp {
  ok: boolean
  dataRoot: string
  files: FileInfo[]
  settings?: Settings
  added?: string
  removed?: string
  error?: string
}

export interface WindowResp {
  ok: boolean
  entries: LogEntry[]
  nextOffset?: number
  oldestOffset?: number
  eof?: boolean
  truncated?: boolean
  truncatedByBytes?: boolean
  hasMore?: boolean
  bofReached?: boolean
  scannedBytes?: number
  fileSize?: number
  encoding?: string
  format?: string
  error?: string
}

export interface WatchResp {
  ok: boolean
  rotated: boolean
  grown: boolean
  entries: LogEntry[]
  newOffset: number
  size: number
  error?: string
}

export interface StatsResp {
  ok: boolean
  totalEntries: number
  levels: Record<string, number>
  hourly: Array<{ hour: number; total: number; problems: number }>
  clusters: Array<{ count: number; level: string; sample: string; firstTs: number | null; lastTs: number | null; firstOffset: number }>
  distinctClusters: number
  approximate: boolean
  fileSize: number
  encoding: string
  format: string
  firstTs: number | null
  lastTs: number | null
  error?: string
}

// ── 端口解析（meta 失败回退 manifest；失败后下次强制重读）──────────────────
let portCache: number | null = null
let portForceRefresh = false

export async function resolvePort(): Promise<number> {
  if (portCache && !portForceRefresh) return portCache
  portForceRefresh = false
  const meta = await kvGet<{ port?: number }>('lls.meta')
  const p = meta && Number(meta.port) > 0 ? Number(meta.port) : MANIFEST_PORT
  portCache = p
  return p
}

export function invalidatePort(): void {
  portForceRefresh = true
  portCache = null
}

// ── 请求 ────────────────────────────────────────────────────────────────────
async function svcGet<T>(pathname: string, params: Record<string, string | number | undefined>, timeoutMs = 30000): Promise<T> {
  const port = await resolvePort()
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== '') qs.set(k, `${v}`)
  }
  const url = `http://127.0.0.1:${port}${pathname}${qs.toString() ? `?${qs}` : ''}`
  const r = await httpGetViaHost(url, timeoutMs)
  if (r.status !== 200) {
    throw new Error(`日志服务 HTTP ${r.status}（端口 ${port}）: ${r.body.slice(0, 200)}`)
  }
  let parsed: T & { ok?: boolean; error?: string }
  try {
    parsed = JSON.parse(r.body) as T & { ok?: boolean; error?: string }
  } catch (_) {
    throw new Error(`日志服务返回非 JSON: ${r.body.slice(0, 120)}`)
  }
  if (parsed.ok === false) throw new Error(parsed.error || '服务返回 ok:false')
  return parsed
}

/** 服务不可达时自动刷新端口重试一次（服务重启换端口场景） */
async function svcGetWithRetry<T>(pathname: string, params: Record<string, string | number | undefined>, timeoutMs = 30000): Promise<T> {
  try {
    return await svcGet<T>(pathname, params, timeoutMs)
  } catch (e) {
    const msg = String((e as Error).message || '')
    if (/HTTP (5|4)/.test(msg) || /ECONNREFUSED|超时|失败/.test(msg)) {
      invalidatePort()
      return svcGet<T>(pathname, params, timeoutMs)
    }
    throw e
  }
}

async function svcPost<T>(pathname: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const port = await resolvePort()
  const url = `http://127.0.0.1:${port}${pathname}`
  const r = await httpPostViaHost(url, body, timeoutMs)
  if (r.status !== 200) throw new Error(`日志服务 HTTP ${r.status}: ${r.body.slice(0, 200)}`)
  const parsed = JSON.parse(r.body) as T & { ok?: boolean; error?: string }
  if (parsed.ok === false) throw new Error(parsed.error || '服务返回 ok:false')
  return parsed
}

export interface Filters { levels: string[]; q: string; regexOn: boolean }
export function filterParams(f: Filters): Record<string, string | number | undefined> {
  return {
    levels: f.levels.length ? f.levels.join(',') : undefined,
    q: f.regexOn ? undefined : (f.q || undefined),
    regex: f.regexOn && f.q ? f.q : undefined,
  }
}

export const api = {
  sources: () => svcGetWithRetry<SourcesResp>('/api/sources', {}, 15000),
  addSource: (path: string) => svcPost<SourcesResp>('/api/sources/add', { path }),
  removeSource: (path: string) => svcPost<SourcesResp>('/api/sources/remove', { path }),
  read: (file: string, offset: number | undefined, limit: number, f: Filters) =>
    svcGetWithRetry<WindowResp>('/api/read', { file, offset, limit, ...filterParams(f) }),
  tail: (file: string, maxLines: number, f: Filters) =>
    svcGetWithRetry<WindowResp>('/api/tail', { file, maxLines, ...filterParams(f) }, 60000),
  readBack: (file: string, beforeOffset: number, maxLines: number, f: Filters) =>
    svcGetWithRetry<WindowResp>('/api/tail', { file, beforeOffset, maxLines, ...filterParams(f) }, 60000),
  watch: (file: string, offset: number) =>
    svcGetWithRetry<WatchResp>('/api/watch', { file, offset }, 10000),
  stats: (file: string) => svcGetWithRetry<StatsResp>('/api/stats', { file }, 120000),
  context: (file: string, offset: number, before: number, after: number) =>
    svcGetWithRetry<WindowResp>('/api/context', { file, offset, before, after }, 30000),
}
