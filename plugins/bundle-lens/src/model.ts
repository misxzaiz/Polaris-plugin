/**
 * model.ts —— 面板数据层：类型 + 服务 API 客户端
 *
 * 数据面：面板 → 127.0.0.1:{meta.port} 直连（Bearer token 头，meta 自 cap.kv 读）。
 * 扫描进行中轮询 /api/scan/:runId（1s）；无流式需求，轮询足够。
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
  currentRun: ScanStatus | null
  lastRunId: string | null
  settings: Settings
  reportsInMemory: number
}

export interface TopPkg { name: string; bytes: number }

export interface ChunkInfo {
  relPath: string
  bytes: number
  hasMap: boolean
  mappedBytes: number
  unmappedBytes: number
  pkgCount: number
  topPkgs: TopPkg[]
}

export interface PkgInfo {
  name: string
  bytes: number
  fileCount: number
  roots: string[]
  versions: string[]
  topFiles: Array<{ source: string; bytes: number; chunkCount: number }>
}

export interface ModuleInfo {
  source: string
  pkg: string | null
  bytes: number
  chunks: number[]
}

export interface VersionConflict { name: string; bytes: number; roots: number; versions: string[]; files: number }
export interface ChunkDupe { source: string; pkg: string | null; chunkCount: number; totalBytes: number; wasteBytes: number; chunks: Array<{ file: string; bytes: number }> }
export interface ContentDupe { hash: string; bytes: number; paths: string[]; wasteBytes: number }

export interface Suggestion { id: string; level: 'info' | 'warn'; title: string; detail: string }

export interface ReportDiff {
  prevRunId: string
  totalPrev: number
  totalNow: number
  totalDelta: number
  packages: Array<{ name: string; prev: number; now: number; delta: number; pct: number }>
  added: Array<{ name: string; bytes: number }>
  removed: Array<{ name: string; bytes: number }>
}

export interface ScanReport {
  runId: string
  startedAt?: number
  finishedAt?: number
  dir: string
  totals: {
    chunks: number
    chunksNoMap: number
    totalBytes: number
    mappedBytes: number
    unmappedBytes: number
    mapCoverage: number
    vendorBytes: number
    appBytes: number
    pkgCount: number
    moduleCount: number
    filesWalked: number
    durationMs: number
  }
  chunks: ChunkInfo[]
  packages: PkgInfo[]
  modules: ModuleInfo[]
  duplicates: {
    versionConflicts: VersionConflict[]
    chunkDupes: ChunkDupe[]
    contentDupes: ContentDupe[]
  }
  suggestions: Suggestion[]
  warnings: string[]
  diff?: ReportDiff
}

export interface RunItem {
  runId: string
  path: string
  startedAt: number
  finishedAt?: number
  status: 'ok' | 'error' | 'running'
  error?: string
  totalBytes?: number
  pkgCount?: number
  chunks?: number
  mapCoverage?: number
  durationMs?: number | null
  suggestions?: number
  warnings?: number
}

export interface ScanStatus {
  runId: string
  status: string
  phase?: string
  progress?: number
  message?: string
  startedAt?: number
  error?: string
}

export interface Settings {
  recentPaths: string[]
}

export interface SelfTestResult {
  ok: boolean
  total: number
  failed: Array<{ name: string; error: string }>
  checks: Array<{ name: string; ok: boolean; error?: string }>
}

// ── 客户端 ─────────────────────────────────────────────────────────────────

export class SvcError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

const META_KEY = 'bundlelens.meta'
let metaCache: SvcMeta | null = null

export function invalidateMeta(): void { metaCache = null }

export async function readMeta(): Promise<SvcMeta | null> {
  if (metaCache) return metaCache
  const m = await kvGet<SvcMeta>(META_KEY)
  if (m && typeof m.port === 'number' && m.token) {
    metaCache = m
    return m
  }
  return null
}

async function svc<T>(method: string, apiPath: string, body?: unknown, timeoutMs = 35_000): Promise<T> {
  const meta = await readMeta()
  if (!meta) throw new SvcError('服务未注册：后台服务尚未拉起或 kv 不可达（稍候自动重试）')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${apiPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${meta.token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch (_) { parsed = null }
    if (!res.ok) throw new SvcError((parsed && parsed.error) || `HTTP ${res.status}`, res.status)
    return parsed as T
  } catch (e) {
    if (e instanceof SvcError) throw e
    if ((e as Error).name === 'AbortError') throw new SvcError('请求超时')
    throw new SvcError(`服务不可达：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  meta: () => svc<MetaInfo>('GET', '/api/meta'),
  scan: (path: string) => svc<{ runId: string }>('POST', '/api/scan', { path }, 15_000),
  scanStatus: (runId: string) => svc<ScanStatus>('GET', `/api/scan/${encodeURIComponent(runId)}`),
  runs: () => svc<{ runs: RunItem[]; degraded: boolean; currentRun: ScanStatus | null; lastRunId: string | null }>('GET', '/api/runs'),
  report: (runId: string) => svc<{ report: ScanReport }>('GET', `/api/report/${encodeURIComponent(runId)}`),
  settings: () => svc<{ settings: Settings; degraded: boolean; version: string; uptime: number }>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Settings>) => svc<{ settings: Settings }>('POST', '/api/settings', patch),
  selftest: () => svc<SelfTestResult>('POST', '/api/selftest', {}, 120_000),
}
