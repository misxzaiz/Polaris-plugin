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

export interface Health {
  total: number
  parts: { hotspot: number; duplication: number; hygiene: number; busFactor: number; bigBlobs: number }
  weights: Record<string, number>
}

export interface Hotspot {
  path: string
  commits: number
  addedLines: number
  deletedLines: number
  churnLines: number
  binaryCommits: number
  authors: number
  topAuthor: string
  topAuthorShare: number
  lang: string
  loc: number
  cxRaw: number
  cxScore: number
  complexityKnown: boolean
  lastTouch: number
  score: number
}

export interface Couple { a: string; b: string; co: number; ratio: number }

export interface DupPair { a: string; b: string; lines: number; preview: string[] }

export interface BlobInfo { path: string; maxBlob: number; versions: number; mb: number }

export interface BranchInfo { branch: string; date: number; author: string; subject: string }

export interface Hygiene {
  total: number; merges: number; conventional: number; conventionalRate: number
  sloppy: number; sloppyRate: number; bigCommits: number; bigRate: number; avgSubjectLen: number
}

export interface BusFactor {
  authors: Array<{ name: string; commits: number; share: number }>
  totalAuthors: number
  busFactor: number
  topAuthorShare: number
}

export interface LangAgg { lang: string; files: number; codeLines: number }

export interface ScanReport {
  runId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'ok' | 'error'
  error?: string
  repo?: { top: string; branch: string; commitHead: string }
  window?: { days: number; maxCommits: number; sinceIso: string | null }
  totals?: {
    commits: number; filesTracked: number; totalBytesRead: number
    churnFiles: number; codeLines: number; durationMs: number
  }
  languages: LangAgg[]
  health: Health | null
  hotspots: Hotspot[]
  couples: Couple[]
  duplications: { pairs: DupPair[] }
  dupSummary?: { totalDupLines: number; ratio: number; filesSkipped: number; windowsCapped: boolean }
  blobs: BlobInfo[]
  branches: BranchInfo[]
  hygiene: Hygiene | null
  busFactor: BusFactor | null
  warnings: string[]
}

export interface RunItem {
  runId: string
  path: string
  startedAt: number
  finishedAt?: number
  status: 'ok' | 'error' | 'running'
  error?: string
  health?: number | null
  commits?: number
  topHotspot?: string | null
  durationMs?: number | null
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
  defaults: { days: number; maxCommits: number }
}

export interface FileDetail {
  path: string
  summary: {
    score: number; commits: number; addedLines: number; deletedLines: number
    loc: number; cxScore: number; cxRaw: number; lang: string; authors: number
    topAuthor: string; topAuthorShare: number; lastTouch: number
  } | null
  timeline: Array<{ weekStartIso: string; commits: number; churn: number }>
  authors: Array<{ name: string; commits: number }>
  coPartners: Array<{ path: string; coCommits: number }>
  duplications: DupPair[]
}

export interface SelfTestResult {
  ok: boolean
  total: number
  failed: Array<{ name: string; error: string }>
  checks: Array<{ name: string; ok: boolean }>
  git: string
}

// ── 客户端 ─────────────────────────────────────────────────────────────────

export class SvcError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

const META_KEY = 'repolens.meta'
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
  scan: (path: string, days?: number, maxCommits?: number) =>
    svc<{ runId: string }>('POST', '/api/scan', { path, days, maxCommits }, 15_000),
  scanStatus: (runId: string) => svc<ScanStatus>('GET', `/api/scan/${encodeURIComponent(runId)}`),
  runs: () => svc<{ runs: RunItem[]; degraded: boolean }>('GET', '/api/runs'),
  report: (runId: string) => svc<{ report: ScanReport }>('GET', `/api/report/${encodeURIComponent(runId)}`),
  fileDetail: (runId: string, path: string) =>
    svc<FileDetail>('GET', `/api/file?runId=${encodeURIComponent(runId)}&path=${encodeURIComponent(path)}`),
  settings: () => svc<{ settings: Settings; degraded: boolean; version: string; uptime: number }>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Settings>) => svc<{ settings: Settings }>('POST', '/api/settings', patch),
  selftest: () => svc<SelfTestResult>('POST', '/api/selftest', {}, 60_000),
}
