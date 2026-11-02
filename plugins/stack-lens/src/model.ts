/**
 * model.ts —— 面板数据层：类型 + 服务 API 客户端
 *
 * 数据面：面板 → 127.0.0.1:{meta.port} 直连（Bearer token 头，meta 自 cap.kv 读）。
 * 无扫描进度轮询需求（resolve 是同步短操作，大 map 首次解析放行到秒级）。
 */
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

export interface MetaInfo {
  version: string
  pid: number
  degraded: boolean
  uptime: number
  settings: { recentDirs: string[] }
  mapsCached: number
  limits: Record<string, number>
}

export type FrameState = 'resolved' | 'unresolved' | 'internal' | 'unparsed'

export interface ResolvedFrame {
  raw: string
  fn: string | null
  url: string | null
  line: number | null
  col: number | null
  engine?: string
  isInternal?: boolean
  state: FrameState
  reason?: string
  mapLabel?: string
  source?: string
  sourceLine?: number
  sourceCol?: number
  name?: string | null
  displayName?: string | null
  codeFrame?: string | null
  codeFrameSource?: string | null
  codeFrameNote?: string
}

export interface ResolveSummary {
  frames: number
  resolved: number
  internal: number
  noMap: number
  eligible: number
  rate: number
  format: string
  message: string | null
  truncated: boolean
}

export interface MapReport { label: string; ok: boolean; error?: string; warning?: string; segCount?: number; sources?: number; count?: number; bytes?: number; from?: string }
export interface FetchReport { url: string; ok: boolean; bytes?: number; error?: string }

export interface ResolveResponse {
  stack: { message: string | null; format: string; truncated: boolean; notes: string[] }
  maps: MapReport[]
  frames: ResolvedFrame[]
  summary: ResolveSummary
  warnings: string[]
  sources: { maps: MapReport[]; fetches: FetchReport[] }
}

export interface MapBrief {
  originPath: string | null
  file: string | null
  version?: number
  sections?: number
  sources?: number
  names?: number
  hasContent?: boolean
  bytes?: number
  fromJs?: string | null
  error?: string
}

export interface ScanMapsResponse { dir: string; walked: number; warnings: string[]; maps: MapBrief[] }

export interface ValidateResponse {
  ok: boolean
  error?: string
  stats?: {
    segCount: number
    genLines: number
    sources: number
    names: number
    hasSourcesContent: boolean
    sourcesContentCount: number
    sections: number
    file: string | null
  }
  warnings?: string[]
}

export interface InlineMap { label?: string; mapText: string; originPath?: string; fromJs?: string }

export interface ResolveRequest {
  stack: string
  mapsDir?: string
  mapPaths?: string[]
  inlineMaps?: InlineMap[]
  fetchUrls?: string[]
  wantFrames?: boolean
}

// ── 服务客户端 ──────────────────────────────────────────────────────────────

export const PLUGIN_ID = 'stack-lens'
export const SERVICE_ID = 'stack-lens-server'
export const META_KEY = 'stacklens.meta'

export class SvcError extends Error {
  constructor(message: string, public kind: 'no-meta' | 'http' | 'network' = 'http') {
    super(message)
  }
}

let cachedMeta: SvcMeta | null = null

export function invalidateMeta(): void {
  cachedMeta = null
}

export async function readMeta(force = false): Promise<SvcMeta> {
  if (!force && cachedMeta) return cachedMeta
  const meta = await kvGet<SvcMeta>(META_KEY)
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new SvcError('堆栈还原台服务未注册（stacklens.meta 缺失）：服务可能还在启动，稍后重试或重启服务', 'no-meta')
  }
  cachedMeta = meta
  return meta
}

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<T> {
  const meta = await readMeta()
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${meta.token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    // 一次自救：meta 可能过期（服务重启换端口/token）→ 强制重读一次
    if (!retried) {
      invalidateMeta()
      return api<T>(method, path, body, true)
    }
    throw new SvcError(`服务连接失败：${(e as Error).message}（可在设置里重启「堆栈还原台服务」）`, 'network')
  }
  let parsed: unknown
  try { parsed = await res.json() } catch (_) {
    throw new SvcError(`服务返回非 JSON（HTTP ${res.status}）`, 'http')
  }
  const obj = parsed as Record<string, unknown>
  if (!res.ok) throw new SvcError(String(obj.error || `HTTP ${res.status}`), 'http')
  return parsed as T
}

export const svc = {
  meta: () => api<MetaInfo>('GET', '/api/meta'),
  resolve: (req: ResolveRequest) => api<ResolveResponse>('POST', '/api/resolve', req),
  scanMaps: (dir: string) => api<ScanMapsResponse>('POST', '/api/scan-maps', { dir }),
  validate: (body: { mapPath?: string; mapText?: string; label?: string }) => api<ValidateResponse>('POST', '/api/validate', body),
}
