/**
 * model.ts —— 面板数据层：类型 + 服务 API 客户端
 *
 * 数据面：面板 → 127.0.0.1:{meta.port} 直连（Bearer token 头，meta 自 cap.kv 读）。
 * 扫描进行中轮询 /api/scan/:runId（1s）；无长连接需求（无流式帧），轮询足够。
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

export type Sev = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export interface Finding {
  pkg: string
  version: string
  ecosystem: string
  file: string
  repoDir: string
  vulnId: string
  severity: Sev
  summary: string
  aliases: string[]
  fixed: string[]
  url: string
  detailOk: boolean
}

export interface FixItem {
  ecosystem: string
  pkg: string
  from: string
  to: string | null
  fixedAll: string[]
  vulnIds: string[]
  severity: Sev
}

export interface RepoInfo {
  dir: string
  packageCount: number
  files: Array<{ file: string; ecosystem: string; count: number }>
}

export interface ScanReport {
  runId: string
  startedAt: number
  finishedAt?: number
  paths: string[]
  repos: RepoInfo[]
  packageCount: number
  lockfileCount: number
  counts: Record<Sev, number>
  findingCount: number
  ignoredCount: number
  truncated: boolean
  findings: Finding[]
  fixPlan: FixItem[]
  warnings: string[]
  error?: string
  version?: string
}

export interface ScanProgress {
  phase: 'discover' | 'parse' | 'query' | 'details' | 'done' | 'error'
  filesFound: number
  packages: number
  queriedBatches: number
  totalBatches: number
  detailsFetched: number
  totalDetails: number
  error?: string
}

export interface ScanStatus {
  runId: string
  status: 'running' | 'done' | 'error'
  startedAt: number
  elapsedMs: number
  progress: ScanProgress
  report?: ScanReport | null
  error?: string
}

export interface RunItem {
  runId: string
  startedAt: number
  finishedAt?: number
  repos: number
  packageCount: number
  findingCount: number
  counts: Record<Sev, number>
  truncated?: boolean
}

export interface IgnoreRule {
  pkg: string
  vulnId: string
  reason: string
  at: number
}

export interface Settings {
  ignores: IgnoreRule[]
  recentPaths: string[]
}

export interface MetaInfo {
  version: string
  port: number
  uptime: number
  degraded: boolean
  busy: boolean
  runId: string | null
  kvEndpoint: string | null
  osvBase: string
}

export interface SelfTestResult {
  ok: boolean
  checks: string[]
}

// ── 服务客户端 ──────────────────────────────────────────────────────────────

let metaCache: SvcMeta | null = null

/** 读服务 meta（kv → 缓存）；服务未注册返回 null */
export async function readMeta(force = false): Promise<SvcMeta | null> {
  if (!force && metaCache) return metaCache
  const m = await kvGet<SvcMeta>('depprobe.meta')
  if (m && typeof m.port === 'number' && m.token) {
    metaCache = m
    return m
  }
  metaCache = null
  return null
}

export function invalidateMeta(): void {
  metaCache = null
}

export class SvcError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

async function svc<T>(method: string, path: string, body?: unknown, timeoutMs = 35_000): Promise<T> {
  const meta = await readMeta()
  if (!meta) throw new SvcError('服务未注册：后台服务尚未拉起或 kv 不可达（稍候自动重试）')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
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
  scan: (paths: string[]) => svc<{ runId: string }>('POST', '/api/scan', { paths }, 15_000),
  scanStatus: (runId: string) => svc<ScanStatus>('GET', `/api/scan/${encodeURIComponent(runId)}`),
  runs: () => svc<{ runs: RunItem[]; degraded: boolean }>('GET', '/api/runs'),
  report: (runId: string) => svc<{ report: ScanReport }>('GET', `/api/report/${encodeURIComponent(runId)}`),
  settings: () => svc<{ settings: Settings; degraded: boolean; version: string; uptime: number }>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Settings>) => svc<{ settings: Settings }>('POST', '/api/settings', patch),
  selftest: () => svc<SelfTestResult>('POST', '/api/selftest', {}, 20_000),
  checkPkg: (ecosystem: string, pkg: string, version: string) =>
    svc<{ findings: Finding[]; counts: Record<Sev, number> }>('POST', '/api/check', { ecosystem, pkg, version }, 60_000),
}
