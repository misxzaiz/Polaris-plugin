/**
 * 通信层 + 账本数据访问（观止面板）
 *
 * 计算逻辑全部复用 shared/guanzhi-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   guanzhi.work.<id>  → Work（一条一键，规避列表并发覆盖）
 *   guanzhi.settings   → Settings
 */
import * as coreRaw from '../shared/guanzhi-core.js'
import { getHostInvoke } from './host'

// ── core 类型面（CJS 模块的严格类型映射）────────────────────────────────────
export type Kind = 'book' | 'movie' | 'tv' | 'anime' | 'music' | 'game' | 'podcast' | 'other'
export type Status = 'wish' | 'active' | 'done' | 'dropped'

export interface Work {
  id: string
  kind: Kind
  title: string
  status: Status
  rating?: number
  startDate?: string
  finishDate?: string
  year?: number
  creator?: string
  genre?: string
  link?: string
  note?: string
  favorite?: boolean
  createdAt: number
  updatedAt: number
}

export interface Settings {
  schemaVersion: number
}

export interface KindAgg {
  kind: Kind
  label: string
  count: number
  avg: number | null
  ratedCount?: number
}

export interface Overview {
  today: string
  total: number
  byStatus: { wish: number; active: number; done: number; dropped: number }
  activeList: Work[]
  recentDone: Work[]
  wishOldest: Work[]
  wishCount: number
  thisYearDone: number
  thisMonthDone: number
  ratedCount: number
  avgRating: number | null
  avgByKind: KindAgg[]
  ratingBands: Record<string, number>
  favoriteCount: number
}

export interface YearReport {
  year: string
  doneCount: number
  ratedCount: number
  avgRating: number | null
  perKind: KindAgg[]
  monthly: { month: number; count: number; avg: number | null }[]
  ratingBands: Record<string, number>
  top: Work[]
  favorites: Work[]
  longestNote: { id: string; title: string; kind: Kind; rating: number | null; note: string } | null
  wishCarryover: number
}

interface CoreApi {
  K: { workPrefix: string; work(id: string): string; settings: string }
  KINDS: Kind[]
  KIND_LABELS: Record<string, string>
  KIND_VERBS: Record<string, string>
  STATUSES: Status[]
  statusLabel(kind: string, status: string): string
  RATING_BANDS: string[]
  DEFAULT_SETTINGS: Settings
  todayStr(nowMs?: number): string
  diffDays(base: string, target: string): number | null
  normalizeWork(raw: Record<string, unknown>, nowMs?: number, opts?: { autoDates?: boolean }): { error?: string; work?: Work }
  applyPatch(existing: Work, patch: Record<string, unknown>, nowMs?: number): { error?: string; work?: Work }
  searchWorks(works: Work[], opts: Record<string, unknown>): Work[]
  findSameWork(works: Work[], kind: string, title: string): Work | null
  computeOverview(works: Work[], today: string): Overview
  computeYearReport(works: Work[], year: string | number): YearReport
  toCsv(works: Work[]): string
  normalizeImport(list: unknown[], existing?: Work[]): { error?: string; accepted?: Work[]; rejected?: { index: number; error: string }[]; duplicates?: number }
}

const core = coreRaw as unknown as CoreApi

export const K = core.K
export const KINDS = core.KINDS
export const KIND_LABELS = core.KIND_LABELS
export const KIND_VERBS = core.KIND_VERBS
export const STATUSES = core.STATUSES
export const RATING_BANDS = core.RATING_BANDS
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS
export const searchWorks = (works: Work[], opts: Record<string, unknown>) => core.searchWorks(works, opts)
export const statusLabel = (kind: string, status: string) => core.statusLabel(kind, status)
export const diffDays = (base: string, target: string) => core.diffDays(base, target)
export const todayStr = (nowMs?: number) => core.todayStr(nowMs)
export const computeOverview = (works: Work[], today: string) => core.computeOverview(works, today)
export const computeYearReport = (works: Work[], year: string | number) => core.computeYearReport(works, year)
export const toCsv = (works: Work[]) => core.toCsv(works)
export const normalizeImport = (list: unknown[], existing?: Work[]) => core.normalizeImport(list, existing)

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

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r.keys ?? []
}

// ── 数据访问 ───────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>(K.settings).catch(() => null)
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

/** 全部记录（扁平，按创建时间升序） */
export async function loadWorks(): Promise<Work[]> {
  const keys = await kvKeys()
  const workKeys = keys.filter((k) => k.startsWith(K.workPrefix)).sort()
  const out: Work[] = []
  for (const wk of workKeys) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet<Work>(wk)
    if (v && typeof v === 'object' && typeof v.id === 'string' && typeof v.kind === 'string') out.push(v)
  }
  out.sort((a, b) => a.createdAt - b.createdAt)
  return out
}

export interface AddWorkInput {
  title: string
  kind: Kind
  status: Status
  rating?: number
  startDate?: string
  finishDate?: string
  year?: number
  creator?: string
  genre?: string
  note?: string
  favorite?: boolean
}

/** 面板记一笔：同体裁同名判重（更新状态）→ 否则新建；归一化 → 一条一键写入 */
export async function addWork(input: AddWorkInput): Promise<{ ok: boolean; error?: string; work?: Work; updated?: boolean }> {
  const existing = core.findSameWork(await loadWorks(), input.kind, input.title)
  const now = Date.now()
  if (existing) {
    const patch: Record<string, unknown> = { status: input.status }
    if (input.rating != null) patch.rating = input.rating
    if (input.note) patch.note = input.note
    if (input.favorite != null) patch.favorite = input.favorite
    if (input.year != null) patch.year = input.year
    if (input.creator) patch.creator = input.creator
    if (input.genre) patch.genre = input.genre
    if (input.startDate) patch.startDate = input.startDate
    if (input.finishDate) patch.finishDate = input.finishDate
    const merged = core.applyPatch(existing, patch, now)
    if (merged.error || !merged.work) return { ok: false, error: merged.error || '更新不合法' }
    await kvSet(K.work(existing.id), merged.work)
    return { ok: true, work: merged.work, updated: true }
  }
  const norm = core.normalizeWork({ ...input, source: 'panel' } as Record<string, unknown>, now)
  if (norm.error || !norm.work) return { ok: false, error: norm.error || '记录不合法' }
  await kvSet(K.work(norm.work.id), norm.work)
  return { ok: true, work: norm.work }
}

/** 部分更新（白名单补丁），返回错误或更新后的记录 */
export async function updateWork(id: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string; work?: Work }> {
  const keys = await kvKeys()
  if (!keys.includes(K.work(id))) return { ok: false, error: `记录 ${id} 不存在` }
  const existing = await kvGet<Work>(K.work(id))
  if (!existing || typeof existing !== 'object') return { ok: false, error: `记录 ${id} 不存在` }
  const merged = core.applyPatch(existing, patch, Date.now())
  if (merged.error || !merged.work) return { ok: false, error: merged.error || '更新不合法' }
  await kvSet(K.work(id), merged.work)
  return { ok: true, work: merged.work }
}

export async function deleteWork(id: string): Promise<void> {
  await kvDel(K.work(id))
}

/** 面板视图数据：全部记录 + 总览 */
export interface PanelData {
  works: Work[]
  today: string
  overview: Overview
}

export async function loadPanelData(): Promise<PanelData> {
  const [works] = await Promise.all([loadWorks()])
  const today = todayStr()
  const overview = computeOverview(works, today)
  return { works, today, overview }
}
