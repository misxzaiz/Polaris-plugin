/**
 * 通信层 + 账房数据访问（算盘面板）
 *
 * 聚合面（summary/daily/models/projects/quality/sessions/meta）由后台服务唯一
 * 写入，面板只读；prices / settings 由面板（或 MCP 显式工具）写入、服务 30s
 * 热加载。计算逻辑复用 shared/abacus-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   abacus.meta / summary / daily / models / projects / quality / sessions
 *   abacus.prices / settings        ← 面板写
 *   abacus.cmd.<nonce> / result.<nonce>  ← 命令信箱（先删后做，服务消费）
 */
import { getHostInvoke } from './host'
import * as core from '../shared/abacus-core.js'

// ── 类型（与服务聚合输出对齐）──────────────────────────────────────────────

export interface Bucket {
  req: number
  fin: number
  cr: number
  cw: number
  out: number
  costUsd: number
  priced: number
  unpricedTokens: number
  cacheSavings: number
}

export interface Summary {
  all: Bucket
  today: Bucket
  d7: Bucket
  d30: Bucket
  bySrc: Record<string, Bucket>
  generatedAt: number
}

export interface DailyRow {
  day: string
  req: number
  fin: number
  cr: number
  cw: number
  out: number
  costUsd: number
  cacheSavings: number
}

export interface ModelRow {
  model: string
  provider: string
  req: number
  fin: number
  cr: number
  cw: number
  out: number
  costUsd: number
  priced: number
  savings: number
  cacheHit: number | null
  ttftP50: number | null
  ttftP90: number | null
  err: number
  d30Req: number
  d30Cost: number
}

export interface ProjectRow {
  proj: string
  src: string
  sessions: number
  req: number
  tokens: number
  costUsd: number
  d30Cost: number
  lastDay: string
}

export interface ToolRow { name: string; n: number; destructive: number; avgDurMs: number }

export interface Insight { code: string; level: 'warn' | 'info' | 'good' | 'debug'; text: string }

export interface Quality {
  errorsByType: Record<string, number>
  zcodeRows: number
  retriedRows: number
  ttftP50: number | null
  ttftP90: number | null
  durP50: number | null
  durP90: number | null
  tools: { total: number; byName: ToolRow[]; destructive: number }
  insights: Insight[]
}

export interface SessionRow {
  src: string
  sid: string
  title: string
  proj: string
  req: number
  tokens: number
  costUsd: number
  firstDay: string
  lastDay: string
}

export interface AbacusMeta {
  v?: number
  version?: string
  startedAt?: number
  lastScanAt?: number
  lastFullScanAt?: number
  lastError?: string
  scanning?: boolean
  entries?: number
  smoke?: boolean
  sources?: Record<string, { ok?: boolean | null; files?: number; scanned?: number; withTU?: number; sqlite?: boolean }>
  caliber?: Record<string, string>
}

export type Prices = Record<string, { in: number; cacheRead: number; cacheWrite: number; out: number; preset?: boolean; source?: string }>

export interface AbacusSettings {
  sources: { zcode: boolean; claude: boolean; polaris: boolean }
  fxRate: number
  autoRescanMin: number
  priceSyncUrl: string
}

export interface PanelData {
  meta: AbacusMeta | null
  summary: Summary | null
  daily: DailyRow[]
  models: ModelRow[]
  projects: ProjectRow[]
  quality: Quality | null
  sessions: SessionRow[]
  prices: Prices
  settings: AbacusSettings
}

export const K = core.K as {
  meta: string; summary: string; daily: string; models: string; projects: string
  quality: string; sessions: string; prices: string; settings: string
  cmdPrefix: string; resultPrefix: string
}
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as AbacusSettings
export const DEFAULT_PRICES = core.DEFAULT_PRICES as Prices

// ── 通道 ───────────────────────────────────────────────────────────────────

interface DispatchResponse {
  msgId: string
  ok: boolean
  result?: { value?: unknown; keys?: string[] }
  error?: string | null
}

async function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })
  return (r.value ?? null) as T | null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

// ── 面板数据装配 ───────────────────────────────────────────────────────────

const emptyBucket = (): Bucket => ({ req: 0, fin: 0, cr: 0, cw: 0, out: 0, costUsd: 0, priced: 0, unpricedTokens: 0, cacheSavings: 0 })

export async function loadPanelData(): Promise<PanelData> {
  const [meta, summary, daily, models, projects, quality, sessions, prices, settings] = await Promise.all([
    kvGet<AbacusMeta>(K.meta).catch(() => null),
    kvGet<Summary>(K.summary).catch(() => null),
    kvGet<DailyRow[]>(K.daily).catch(() => []),
    kvGet<ModelRow[]>(K.models).catch(() => []),
    kvGet<ProjectRow[]>(K.projects).catch(() => []),
    kvGet<Quality>(K.quality).catch(() => null),
    kvGet<SessionRow[]>(K.sessions).catch(() => []),
    kvGet<Prices>(K.prices).catch(() => null),
    kvGet<Partial<AbacusSettings>>(K.settings).catch(() => null),
  ])
  return {
    meta,
    summary,
    daily: Array.isArray(daily) ? daily : [],
    models: Array.isArray(models) ? models : [],
    projects: Array.isArray(projects) ? projects : [],
    quality,
    sessions: Array.isArray(sessions) ? sessions : [],
    prices: prices && Object.keys(prices).length ? prices : DEFAULT_PRICES,
    settings: { ...DEFAULT_SETTINGS, ...(settings || {}), sources: { ...DEFAULT_SETTINGS.sources, ...(settings && settings.sources ? settings.sources : {}) } },
  }
}

export async function savePrices(p: Prices): Promise<void> {
  await kvSet(K.prices, p)
}

export async function saveSettings(s: AbacusSettings): Promise<void> {
  await kvSet(K.settings, s)
}

/** 命令信箱：写 cmd.<nonce> → 轮询 result.<nonce>（先删后做由服务负责） */
export async function sendCmd(op: string, waitMs = 120000): Promise<Record<string, unknown>> {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  await kvSet(`${K.cmdPrefix}${nonce}`, { op })
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const r = await kvGet<Record<string, unknown>>(`${K.resultPrefix}${nonce}`).catch(() => null)
    if (r) {
      kvDel(`${K.resultPrefix}${nonce}`).catch(() => {})
      return r
    }
  }
  throw new Error('命令超时（服务可能离线）')
}

// ── 显示格式化 ─────────────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}

export function fmtCny(usd: number | null | undefined, fx: number): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—'
  return `¥${(usd * fx).toFixed(2)}`
}
