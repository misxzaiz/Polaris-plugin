/**
 * 通信层 + 订阅账数据访问（守闸面板）
 *
 * 计算逻辑全部复用 shared/core.js（与 MCP 同一权威，esbuild 打包进 bundle）；
 * 本文件只做 cap.kv IO 与面板视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   shouzha.sub.<id>  → Subscription
 *   shouzha.settings  → Settings
 */
import { getHostInvoke } from './host'
import * as core from '../shared/core.js'
import type { Settings, Subscription } from '../shared/core.js'

export const K = core.K
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as Settings
export const CATEGORIES = core.CATEGORIES as string[]
export const fmtMoney = (n: number, symbol?: string) => core.fmtMoney(n, symbol)
export const cycleLabel = (s: Pick<Subscription, 'cycle' | 'customDays'>) => core.cycleLabel(s as Subscription)
export const todayStr = core.todayStr as (now?: number) => string
export const dayKeyOf = core.dayKeyOf as (ts: number) => string
export const advanceDate = core.advanceDate as (d: string, c: Subscription['cycle'], days?: number) => string | null
export const monthlyCost = core.monthlyCost as (s: Subscription) => number | null
export const annualCost = core.annualCost as (s: Subscription) => number | null
export const normalizeSub = core.normalizeSub as unknown as
  (raw: Record<string, unknown>, now?: number) => { error?: string; sub?: Subscription }
export const applyUpdate = core.applyUpdate as unknown as
  (sub: Subscription, patch: Record<string, unknown>, now?: number) => { error?: string; sub?: Subscription }
export const renewState = core.renewState as (s: Subscription, today?: string | number) => string
export const dueBoard = core.dueBoard as (subs: Subscription[], today?: string | number) => {
  overdue: Subscription[]; upcoming: Subscription[]; trials: Subscription[]
}
export const renewSub = core.renewSub as unknown as
  (s: Subscription, o?: { amount?: number; date?: string; note?: string }, now?: number) => { error?: string; sub?: Subscription }
export const skipSub = core.skipSub as unknown as
  (s: Subscription, o?: { reason?: string; note?: string }, now?: number) => { sub: Subscription }
export const cancelSub = core.cancelSub as unknown as
  (s: Subscription, o?: { reason?: string; note?: string }, now?: number) => { sub: Subscription }
export const pauseSub = core.pauseSub as unknown as
  (s: Subscription, o?: { note?: string }, now?: number) => { sub: Subscription }
export const resumeSub = core.resumeSub as unknown as
  (s: Subscription, next: string, now?: number) => { error?: string; sub?: Subscription }
export const filterSubs = core.filterSubs as unknown as
  (subs: Subscription[], f?: { keyword?: string; category?: string; status?: Subscription['status']; autoRenew?: boolean }) => Subscription[]
export const stats = core.stats as unknown as
  (subs: Subscription[], today?: string | number, o?: { cashflowMonths?: number }) => ReturnType<typeof core.stats>
export const toCsv = core.toCsv as (subs: Subscription[], symbol?: string) => string
export const fromCsv = core.fromCsv as (text: string) => { items: { ok: boolean; error?: string; sub?: Subscription }[]; error?: string }
export const daysBetween = core.daysBetween as (a: string, b: string) => number | null
export const STATUS_LABELS = core.STATUS_LABELS as Record<string, string>
export const LIMITS = core.LIMITS as Record<string, number>

// ── 类型 ──────────────────────────────────────────────────────────────────
export type { Settings, Subscription }

/** 面板当前视图数据（设置 + 全量订阅 + 透视 + 三榜） */
export interface PanelData {
  settings: Settings
  subs: Subscription[]
  board: ReturnType<typeof dueBoard>
  stats: ReturnType<typeof stats>
}

// ── 通道 ──────────────────────────────────────────────────────────────────
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

// ── 数据访问 ──────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>(K.settings).catch(() => null)
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

/** 全量订阅（扁平，按下次扣费日升序；损坏条目跳过不炸） */
export async function loadSubs(): Promise<Subscription[]> {
  const keys = (await kvKeys()).filter((k) => k.startsWith(K.subPrefix))
  const vals = await Promise.all(keys.map((k) => kvGet<Subscription>(k).catch(() => null)))
  const subs: Subscription[] = []
  for (const v of vals) {
    if (v && typeof v === 'object' && typeof v.id === 'string' && typeof v.amount === 'number') subs.push(v)
  }
  subs.sort((a, b) => (a.nextRenewalDate < b.nextRenewalDate ? -1 : 1))
  return subs
}

export async function loadPanelData(): Promise<PanelData> {
  const settings = await loadSettings()
  const subs = await loadSubs()
  const today = todayStr()
  return { settings, subs, board: dueBoard(subs, today), stats: stats(subs, today) }
}

/** 新增/导入一条订阅（面板侧统一入口，来源标记 panel/import） */
export async function saveSub(sub: Subscription): Promise<void> {
  await kvSet(K.sub(sub.id), sub)
}

export async function deleteSub(id: string): Promise<void> {
  await kvDel(K.sub(id))
}

// ── 展示辅助 ──────────────────────────────────────────────────────────────
export function fmtDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${Number(m)}月${Number(day)}日`
}

export function stateBadge(s: Subscription): { cls: string; text: string } | null {
  const st = renewState(s, todayStr())
  if (st === 'overdue') return { cls: 'bad', text: '逾期待对账' }
  if (st === 'dueSoon') return { cls: 'warn', text: '即将扣费' }
  if (st === 'trialUrgent') return { cls: 'bad', text: '试用将转正' }
  if (st === 'trial') return { cls: 'info', text: '试用中' }
  if (s.status === 'paused') return { cls: 'info', text: '已暂停' }
  if (s.status === 'cancelled') return { cls: 'off', text: '已取消' }
  return null
}

export function timeAgo(ts: number): string {
  const d = Date.now() - ts
  if (d < 60 * 1000) return '刚刚'
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}
