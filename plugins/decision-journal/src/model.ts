/**
 * 通信层 + 决策数据访问（谋定面板）
 *
 * 计算逻辑全部复用 shared/decision-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与面板视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   decision.settings  → Settings
 *   decision.d.<id>    → Decision（按 id 幂等写入）
 *   decision.readAt    → 复盘清单已读水位
 */
import { getHostInvoke } from './host'
import * as core from '../shared/decision-core.js'

// ── 类型（与 core 输出对齐）────────────────────────────────────────────────
export interface DecisionOption {
  id: string
  name: string
  note: string
}

export interface Expected {
  text: string
  confidence: number
}

export interface Resolution {
  outcome: 'hit' | 'partial' | 'miss' | 'void'
  score: 1 | 0.5 | 0 | null
  note: string
  surprise: string
  lesson: string
  resolvedAt: number
}

export type DecisionStatus = 'open' | 'decided' | 'resolved' | 'shelved'

export interface Decision {
  id: string
  schemaVersion: number
  createdAt: number
  updatedAt: number
  title: string
  question: string
  context: string
  options: DecisionOption[]
  chosenId: string | null
  rationale: string
  expected: Expected | null
  tags: string[]
  links: string[]
  source: 'ai' | 'panel' | 'import'
  status: DecisionStatus
  decidedAt: number | null
  reviewAt: number | null
  shelvedReason: string
  resolution: Resolution | null
}

export interface Settings {
  schemaVersion: number
  reviewDefaultDays: number
}

export interface BucketStat {
  key: string
  label: string
  n: number
  avgConf: number
  hitRate: number
  brier: number
}

export interface Calibration {
  nScored: number
  nVoid: number
  avgConf: number
  hitRate: number
  brier: number
  bias: number
  verdict: string
  buckets: BucketStat[]
  byMonth: { month: string; n: number; avgScore: number; avgConf: number }[]
}

export interface Overview {
  counts: Record<DecisionStatus, number>
  due: Decision[]
  upcoming: Decision[]
  byStatus: (s: DecisionStatus) => Decision[]
  all: Decision[]
}

export const OUTCOME_META = core.OUTCOME_META as unknown as Record<
  string, { score: number | null; label: string; cls: string }
>
export const STATUS_META = core.STATUS_META as unknown as Record<
  DecisionStatus, { label: string; cls: string }
>
export const DAY_MS = core.DAY_MS as number
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as Settings

export const dayKeyOf = core.dayKeyOf as (ts: number) => string
export const isDue = core.isDue as (d: Decision, now?: number) => boolean
export const overdueDays = core.overdueDays as (d: Decision, now?: number) => number
export const summarize = core.summarize as (d: Decision, now?: number) => string
export const computeCalibration = core.computeCalibration as (ds: Decision[]) => Calibration
export const buildOverview = core.buildOverview as (ds: Decision[], now?: number) => Overview
export const recentLessons = core.recentLessons as (
  ds: Decision[], limit?: number,
) => { id: string; title: string; lesson: string; outcome: string; confidence: number | null; resolvedAt: number }[]
export const exportJson = core.exportJson as (ds: Decision[], s: Settings) => string

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
  const s = await kvGet<Partial<Settings>>(core.K.settings).catch(() => null)
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(core.K.settings, s)
}

export async function loadAllDecisions(): Promise<Decision[]> {
  const keys = await kvKeys()
  const dKeys = keys.filter((k) => typeof k === 'string' && k.startsWith(core.K.dPrefix)).sort()
  const arrs = await Promise.all(dKeys.map((dk) => kvGet<Decision>(dk)))
  const list: Decision[] = []
  for (const v of arrs) {
    if (v && typeof v === 'object' && typeof v.id === 'string' && typeof v.status === 'string') list.push(v)
  }
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function getDecisionById(id: string): Promise<Decision | null> {
  const v = await kvGet<Decision>(core.K.d(id))
  return v && typeof v === 'object' && v.id ? v : null
}

export async function saveDecision(d: Decision): Promise<void> {
  await kvSet(core.K.d(d.id), d)
}

export async function deleteDecision(id: string): Promise<void> {
  await kvDel(core.K.d(id))
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function timeAgo(ts: number): string {
  const d = Date.now() - ts
  if (d < 60 * 1000) return '刚刚'
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}

/** 复盘期限语义标签 */
export function reviewLabel(d: Decision, now = Date.now()): string {
  if (d.status !== 'decided') return ''
  if (d.reviewAt == null) return '不定期'
  const days = Math.ceil((d.reviewAt - now) / DAY_MS)
  if (days < 0) return `逾期 ${-days} 天`
  if (days === 0) return '今天到期'
  return `${days} 天后`
}

export function confidenceWord(c: number): string {
  if (c >= 95) return '基本确定'
  if (c >= 85) return '很有把握'
  if (c >= 70) return '大概率'
  if (c >= 50) return '过半数'
  return '纯赌'
}

// ── 面板共享上下文（Panel 组装，各 Tab 消费）─────────────────────────────
export interface PanelCtx {
  settings: Settings
  decisions: Decision[]
  overview: Overview
  cal: Calibration
  refresh: () => Promise<void>
  showToast: (msg: string, kind?: 'bad' | 'good') => void
  onSendToChat?: (message: string) => void | Promise<void>
  openDetail: (id: string) => void
}
