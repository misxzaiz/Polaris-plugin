/**
 * 通信层 + 想法池数据访问（灵犀面板）
 *
 * 计算逻辑全部复用 shared/pond-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与动作包装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   lingxi.idea.<id> → Idea（一想法一键，读改写幂等）
 *   lingxi.settings  → PondSettings
 */
import { getHostInvoke } from './host'
import * as core from '../shared/pond-core.js'

export const K = core.K
export const KINDS = core.KINDS as { key: string; label: string; desc: string }[]
export const MATURITIES = core.MATURITIES as { key: string; label: string; desc: string }[]
export const TECHNIQUES = core.TECHNIQUES as { key: string; name: string; hint: string }[]
export const REVISIT_BASE_DAYS = core.REVISIT_BASE_DAYS as number
export const fmtDay = core.fmtDay as (ts: number) => string
export const fmtDateTime = core.fmtDateTime as (ts: number) => string
export const fmtDueRelative = core.fmtDueRelative as (dueAt: number, now?: number) => string

// ── 类型（与 core 输出对齐）────────────────────────────────────────────────
export interface IdeaEvent {
  at: number
  kind: string
  text: string
}

export interface Idea {
  id: string
  title: string
  raw: string
  kind: string
  tags: string[]
  maturity: number
  status: 'active' | 'archived' | 'done'
  origin: 'ai' | 'panel' | 'import'
  url?: string
  links: string[]
  createdAt: number
  updatedAt: number
  revisit: {
    dueAt: number
    interval: number
    history: { at: number; outcome: string }[]
  }
  timeline: IdeaEvent[]
}

export interface PondSettings {
  schemaVersion: number
}

export interface PondStats {
  total: number
  active: number
  archived: number
  done: number
  byMaturity: number[]
  byKind: Record<string, number>
  topTags: { tag: string; count: number }[]
  captures8w: { weekStart: number; count: number }[]
  dueNow: number
  matureShare: number
  oldestActiveDays: number | null
}

export interface StarLayout {
  stars: {
    id: string; x: number; y: number; r: number; hue: number
    alpha: number; due: boolean; title: string; maturity: number; status: string
  }[]
  clusters: { tag: string; cx: number; cy: number; r: number; count: number }[]
  width: number
  height: number
}

// ── 通道（经宿主 invoke → router_dispatch → cap.kv，跨端同一池子）──────────
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

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r.keys ?? []
}

// ── 数据访问 ───────────────────────────────────────────────────────────────
export async function loadAllIdeas(): Promise<Idea[]> {
  const keys = await kvKeys()
  const ids = keys.filter((k) => k.startsWith(core.K.ideaPrefix)).map((k) => k.slice(core.K.ideaPrefix.length))
  const arrs = await Promise.all(ids.map((id) => kvGet<Idea>(core.K.idea(id))))
  const ideas: Idea[] = []
  for (const v of arrs) {
    if (v && typeof v === 'object' && typeof v.id === 'string') ideas.push(v)
  }
  return ideas
}

export async function getIdea(id: string): Promise<Idea | null> {
  const v = await kvGet<Idea>(core.K.idea(id))
  return v && typeof v === 'object' && typeof v.id === 'string' ? v : null
}

async function saveIdea(idea: Idea): Promise<void> {
  await kvSet(core.K.idea(idea.id), idea)
}

/** 面板快捕：归一化 → 相关匹配（帮助面板用户也看到「池中已有」）→ 写入 */
export async function captureIdea(input: {
  title: string
  raw?: string
  kind?: string
  tags?: string[]
  url?: string
}): Promise<{ ok: boolean; error?: string; idea?: Idea; related?: { idea: Idea; score: number }[] }> {
  const norm = core.normalizeIdea({ ...input, origin: 'panel' })
  if (norm.error || !norm.idea) return { ok: false, error: norm.error || '想法不合法' }
  const idea = norm.idea as Idea
  const all = await loadAllIdeas()
  const related = core.findRelated(idea, all.filter((i) => i.status !== 'archived'), 3) as { idea: Idea; score: number }[]
  await saveIdea(idea)
  return { ok: true, idea, related }
}

/** 通用「读改写」动作包装：get → core 变换 → save */
async function mutate(
  id: string,
  fn: (idea: Idea, now: number) => { error?: string; idea?: Idea },
): Promise<{ ok: boolean; error?: string; idea?: Idea }> {
  const idea = await getIdea(id)
  if (!idea) return { ok: false, error: '想法不存在（可能在别的端被删除）' }
  const res = fn(idea, Date.now())
  if (res.error || !res.idea) return { ok: false, error: res.error || '操作失败' }
  await saveIdea(res.idea)
  return { ok: true, idea: res.idea }
}

export const deepenIdea = (id: string, text: string) =>
  mutate(id, (idea, now) => core.deepenIdea(idea, text, now) as { error?: string; idea?: Idea })

export const promoteIdea = (id: string, note?: string) =>
  mutate(id, (idea, now) => core.promoteIdea(idea, now, note) as { error?: string; idea?: Idea })

export const applyRevisitOutcome = (id: string, outcome: string, note?: string) =>
  mutate(id, (idea, now) => core.applyRevisitOutcome(idea, outcome, now, note) as { error?: string; idea?: Idea })

export const archiveIdea = (id: string) =>
  mutate(id, (idea, now) => core.archiveIdea(idea, now) as { error?: string; idea?: Idea })

export const restoreIdea = (id: string) =>
  mutate(id, (idea, now) => core.restoreIdea(idea, now) as { error?: string; idea?: Idea })

export const retitleIdea = (id: string, title: string) =>
  mutate(id, (idea, now) => core.retitleIdea(idea, title, now) as { error?: string; idea?: Idea })

// ── 视图辅助（core 纯函数透传）────────────────────────────────────────────
export const dueRevisits = (ideas: Idea[], now: number) => core.dueRevisits(ideas, now) as Idea[]
export const nextRevisitAt = (ideas: Idea[]) => core.nextRevisitAt(ideas) as number | null
export const searchIdeas = (
  ideas: Idea[],
  f: { keyword?: string; tag?: string; kind?: string; status?: string; minMaturity?: number },
) => core.searchIdeas(ideas, f) as Idea[]
export const computeStarLayout = (ideas: Idea[], w: number, h: number) =>
  core.computeStarLayout(ideas, w, h) as unknown as StarLayout
export const computePondStats = (ideas: Idea[], now: number) => core.computePondStats(ideas, now) as unknown as PondStats
export const clusterConstellations = (ideas: Idea[], now: number) =>
  core.clusterConstellations(ideas, now) as unknown as {
    clusters: { tag: string; count: number; byMaturity: number[]; matureCount: number; oldestDays: number; ideaIds: string[] }[]
    mergeCandidates: { tag: string; count: number; ideaIds: string[] }[]
  }
export const fmtIdeaLine = (idea: Idea, now: number) => core.fmtIdeaLine(idea, now) as string
export const primaryTagOf = (idea: Idea) => core.primaryTagOf(idea) as string

export function timeAgo(ts: number): string {
  const d = Date.now() - ts
  if (d < 60 * 1000) return '刚刚'
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}

export const kindLabel = (k: string) => (KINDS.find((x) => x.key === k) || KINDS[0]).label
export const matLabel = (m: number) => (MATURITIES[m] || MATURITIES[0]).label
