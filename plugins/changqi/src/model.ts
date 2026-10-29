/**
 * 通信层 + 台账数据访问（订阅台账面板）
 *
 * 计算逻辑全部复用 shared/subs-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   changqi.sub.<id>  → Subscription（一条一键，规避列表并发覆盖）
 *   changqi.settings  → Settings
 */
import * as coreRaw from '../shared/subs-core.js'
import { getHostInvoke } from './host'

// ── core 类型面（CJS 模块的严格类型映射）────────────────────────────────────
export interface Subscription {
  id: string
  name: string
  amount: number
  currency: string
  cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  cycleDays?: number
  anchorDate: string
  channel: 'alipay' | 'wechat' | 'apple' | 'card' | 'other'
  category: string
  status: 'active' | 'trial' | 'cancelled'
  trialEndsAt?: string
  note?: string
  lastConfirmedDate?: string
  createdAt: number
  updatedAt: number
}

export interface Settings {
  schemaVersion: number
  currencySymbol: string
  remindDays: number
  trialWarnDays: number
}

export interface RowInfo {
  sub: Subscription
  monthlyEquiv: number
  nextChargeDate: string | null
  daysUntil: number | null
  urgency: 'today' | 'soon' | 'week' | 'trial' | 'calm' | null
}

export interface Overview {
  today: string
  monthKey: string
  currencySymbol: string
  monthlyTotal: number
  yearlyTotal: number
  activeCount: number
  trialCount: number
  cancelledCount: number
  monthCharge: { count: number; sum: number }
  todayCharge: { count: number; sum: number }
  rows: RowInfo[]
  upcoming: {
    id: string; name: string; amount: number; cycle: string
    date: string; daysUntil: number; urgency: string
    isTrial?: boolean; trialEndsAt?: string
  }[]
  trialExpiring: { id: string; name: string; trialEndsAt: string; daysUntil: number }[]
  byChannel: { channel: string; label: string; monthlySum: number; count: number }[]
  byCategory: { category: string; monthlySum: number; count: number }[]
  top: { id: string; name: string; monthlyEquiv: number }[]
}

interface CoreApi {
  K: { subPrefix: string; sub(id: string): string; settings: string }
  CYCLES: string[]
  CYCLE_LABELS: Record<string, string>
  CHANNELS: string[]
  CHANNEL_LABELS: Record<string, string>
  STATUS_LABELS: Record<string, string>
  DEFAULT_CATEGORIES: string[]
  DEFAULT_SETTINGS: Settings
  URGENCY_LABELS: Record<string, string>
  todayStr(nowMs?: number): string
  nextChargeDateOf(sub: Subscription, today: string): string | null
  monthlyEquivalent(sub: Pick<Subscription, 'amount' | 'cycle' | 'cycleDays'>): number
  urgencyOf(sub: Subscription, settings: Settings, today: string): string | null
  fmtMoney(n: number, symbol?: string): string
  normalizeSub(raw: Record<string, unknown>, nowMs?: number): { error?: string; sub?: Subscription }
  applyPatch(existing: Subscription, patch: Record<string, unknown>, nowMs?: number): { error?: string; sub?: Subscription }
  computeOverview(subs: Subscription[], settings: Settings, today: string, monthKey: string): Overview
  cancelGuide(channel: string): string
  toCsv(subs: Subscription[], today: string): string
  diffDays(base: string, target: string): number | null
}

const core = coreRaw as unknown as CoreApi

export const K = core.K
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS
export const CYCLES = core.CYCLES
export const CYCLE_LABELS = core.CYCLE_LABELS
export const CHANNELS = core.CHANNELS
export const CHANNEL_LABELS = core.CHANNEL_LABELS
export const STATUS_LABELS = core.STATUS_LABELS
export const DEFAULT_CATEGORIES = core.DEFAULT_CATEGORIES
export const URGENCY_LABELS = core.URGENCY_LABELS
export const fmtMoney = (n: number, symbol?: string) => core.fmtMoney(n, symbol)
export const cancelGuide = (ch: string) => core.cancelGuide(ch)
export const monthlyEquivalent = (s: Subscription) => core.monthlyEquivalent(s)
export const todayStr = (nowMs?: number) => core.todayStr(nowMs)
export const computeOverview = (subs: Subscription[], settings: Settings, today: string, monthKey: string) =>
  core.computeOverview(subs, settings, today, monthKey)
export const toCsv = (subs: Subscription[], today: string) => core.toCsv(subs, today)

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

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

/** 全部订阅（扁平，按创建时间升序） */
export async function loadSubs(): Promise<Subscription[]> {
  const keys = await kvKeys()
  const subKeys = keys.filter((k) => k.startsWith(K.subPrefix)).sort()
  const out: Subscription[] = []
  for (const sk of subKeys) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet<Subscription>(sk)
    if (v && typeof v === 'object' && typeof v.id === 'string' && typeof v.amount === 'number') out.push(v)
  }
  out.sort((a, b) => a.createdAt - b.createdAt)
  return out
}

export interface AddSubInput {
  name: string
  amount: number
  cycle: string
  cycleDays?: number
  anchorDate: string
  channel: string
  category: string
  trialEndsAt?: string
  note?: string
}

/** 面板入册：归一化 → 一条一键写入 */
export async function addSub(input: AddSubInput): Promise<{ ok: boolean; error?: string; sub?: Subscription }> {
  const norm = core.normalizeSub({ ...input, source: 'panel' } as Record<string, unknown>, Date.now())
  if (norm.error || !norm.sub) return { ok: false, error: norm.error || '订阅不合法' }
  await kvSet(K.sub(norm.sub.id), norm.sub)
  return { ok: true, sub: norm.sub }
}

/** 部分更新（白名单补丁），返回错误或更新后的订阅 */
export async function updateSub(id: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string; sub?: Subscription }> {
  const existing = await kvGet<Subscription>(K.sub(id))
  if (!existing || typeof existing !== 'object') return { ok: false, error: `订阅 ${id} 不存在` }
  const merged = core.applyPatch(existing, patch, Date.now())
  if (merged.error || !merged.sub) return { ok: false, error: merged.error || '更新不合法' }
  await kvSet(K.sub(id), merged.sub)
  return { ok: true, sub: merged.sub }
}

/** 面板视图数据：设置 + 全部订阅 */
export interface PanelData {
  settings: Settings
  subs: Subscription[]
  today: string
  monthKey: string
  overview: Overview
}

export async function loadPanelData(): Promise<PanelData> {
  const [settings, subs] = await Promise.all([loadSettings(), loadSubs()])
  const today = todayStr()
  const overview = computeOverview(subs, settings, today, today.slice(0, 7))
  return { settings, subs, today, monthKey: today.slice(0, 7), overview }
}
