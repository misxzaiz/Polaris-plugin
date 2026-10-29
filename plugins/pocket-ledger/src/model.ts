/**
 * 通信层 + 账本数据访问（日常记账面板）
 *
 * 计算逻辑全部复用 shared/ledger-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与面板视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   ledger.day.<YYYY-MM-DD>  → Bill[]（按设备本地日期归属；追加幂等去重）
 *   ledger.settings          → LedgerSettings
 */
import { getHostInvoke } from './host'
import * as core from '../shared/ledger-core.js'

export const K = core.K
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as LedgerSettings
export const fmtMoney = (n: number, symbol?: string) => core.fmtMoney(n, symbol)
export const monthOf = core.monthOf
export const currentMonth = core.currentMonth
export const shiftMonth = core.shiftMonth
export const computeStats = core.computeStats as (
  bills: Bill[], settings: LedgerSettings, month: string,
) => MonthStats
export const toCsv = core.toCsv as (bills: Bill[], symbol?: string) => string
export const dayKeyOf = core.dayKeyOf
export const normalizeAttachment = core.normalizeAttachment as (raw: {
  id?: string; name?: string; mime?: string; size?: number; ts?: number
}) => { error?: string; att?: AttachmentMeta }
export const isImageMime = core.isImageMime as (mime: string) => boolean
export const MAX_ATTACHMENT_BYTES = core.MAX_ATTACHMENT_BYTES as number

// ── 类型（与 core 输出对齐）────────────────────────────────────────────────
export interface Bill {
  id: string
  ts: number
  type: 'expense' | 'income'
  amount: number
  category: string
  note: string
  source: 'panel' | 'ai' | 'import'
  /** 附件引用（ledger.att.<id>）；未附图为 undefined */
  attachmentId?: string
}

export interface AttachmentMeta {
  id: string
  name: string
  mime: string
  size: number
  ts: number
}

/** 完整附件（含 base64 主体，仅点开时才取） */
export interface Attachment extends AttachmentMeta {
  data: string
}

export interface LedgerSettings {
  schemaVersion: number
  currency: string
  currencySymbol: string
  categories: string[]
  incomeCategories: string[]
  budgets: Record<string, number>
  monthlyTotalBudget: number | null
  /** 不参与汇总的分类（如工资）：账单照记、明细照见，统计/结余/排行/逐日排除 */
  excludeFromStats: string[]
}

export interface CategoryStat {
  category: string
  type: 'expense' | 'income'
  sum: number
  count: number
  budget: number | null
  /** 该分类被排除出汇总 */
  excluded?: boolean
}

export interface MonthStats {
  month: string
  income: number
  expense: number
  balance: number
  count: number
  byCategory: CategoryStat[]
  byDay: { date: string; expense: number }[]
  totalBudget: number | null
  totalBudgetUsed: number | null
  categoryBudgetUsed: Record<string, number>
  currencySymbol: string
  /** 被排除分类的合计（如工资），面板可展示"另有 X 不计入" */
  excludedSum?: number
}

/** 面板当前视图数据（设置 + 当前月账单 + 统计） */
export interface PanelData {
  settings: LedgerSettings
  month: string
  bills: Bill[]
  stats: MonthStats
}

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
export async function loadSettings(): Promise<LedgerSettings> {
  const s = await kvGet<Partial<LedgerSettings>>(K.settings).catch(() => null)
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

export async function saveSettings(s: LedgerSettings): Promise<void> {
  await kvSet(K.settings, s)
}

/** 某月全部账单（扁平，按 ts 升序）+ 日键数组 */
export async function loadMonth(month: string): Promise<{ bills: Bill[]; dayKeys: string[] }> {
  const keys = await kvKeys()
  const prefix = K.dayPrefixOf(month)
  const dayKeys = keys.filter((k) => k.startsWith(prefix)).sort()
  const arrs = await Promise.all(dayKeys.map((dk) => kvGet<Bill[]>(dk)))
  const bills: Bill[] = []
  for (const arr of arrs) {
    if (Array.isArray(arr)) for (const b of arr) if (b && typeof b === 'object' && typeof b.amount === 'number') bills.push(b)
  }
  bills.sort((a, b) => a.ts - b.ts)
  return { bills, dayKeys }
}

export async function loadDay(dayKey: string): Promise<Bill[]> {
  const arr = await kvGet<Bill[]>(K.day(dayKey))
  return Array.isArray(arr) ? arr : []
}

export interface AddBillInput {
  amount: number
  type: 'expense' | 'income'
  category?: string
  note?: string
  ts?: number
  attachmentId?: string
}

export interface AddBillResult {
  ok: boolean
  error?: string
  bill?: Bill
  todayExpense?: number
  todayIncome?: number
}

/** 面板记一笔：归一化 → 日键追加（幂等去重）→ 返回当日小计 */
export async function addBill(input: AddBillInput): Promise<AddBillResult> {
  const settings = await loadSettings()
  const valid = [...new Set([...(settings.categories || []), ...(settings.incomeCategories || [])])]
  const norm = core.normalizeBill({ ...input, source: 'panel' }, valid)
  if (norm.error || !norm.bill) return { ok: false, error: norm.error || '账单不合法' }
  const bill = norm.bill as Bill
  const dk = K.day(core.dayKeyOf(bill.ts))
  const existing = await kvGet<Bill[]>(dk)
  const merged = core.appendBills(Array.isArray(existing) ? existing : [], [bill])
  await kvSet(dk, merged)
  return {
    ok: true,
    bill,
    todayExpense: merged.filter((b) => b.type === 'expense').reduce((s, b) => s + b.amount, 0),
    todayIncome: merged.filter((b) => b.type === 'income').reduce((s, b) => s + b.amount, 0),
  }
}

/** 删除一笔（在指定月份的日键里找）；若账单带附件则级联删除附件键 */
export async function deleteBill(id: string, month: string): Promise<boolean> {
  const { dayKeys } = await loadMonth(month)
  for (const dk of dayKeys) {
    const arr = await kvGet<Bill[]>(dk)
    if (!Array.isArray(arr)) continue
    const target = arr.find((b) => b && b.id === id)
    const { arr: next, removed } = core.removeBill(arr, id)
    if (removed) {
      await kvSet(dk, next)
      if (target && target.attachmentId) await kvDel(K.att(target.attachmentId))
      return true
    }
  }
  return false
}

// ── 附件 ───────────────────────────────────────────────────────────────────
/** 保存一份附件：归一化元数据 → 存 ledger.att.<id>（含 base64）→ 返回元数据 */
export async function saveAttachment(raw: {
  name?: string; mime?: string; data: string; size?: number
}): Promise<{ ok: boolean; error?: string; att?: AttachmentMeta }> {
  const norm = core.normalizeAttachment({ name: raw.name, mime: raw.mime, size: raw.size })
  if (norm.error || !norm.att) return { ok: false, error: norm.error || '附件不合法' }
  const att = norm.att as AttachmentMeta
  await kvSet(K.att(att.id), { ...att, data: raw.data })
  return { ok: true, att }
}

/** 取完整附件（含 base64），不存在返回 null */
export async function getAttachment(id: string): Promise<Attachment | null> {
  const v = await kvGet<Attachment | null>(K.att(id))
  return v && typeof v === 'object' && typeof v.data === 'string' ? v : null
}

/** 删附件键（账单删除时级联，或附件本身失效时清理） */
export async function deleteAttachment(id: string): Promise<void> {
  await kvDel(K.att(id))
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function timeAgo(ts: number): string {
  const d = Date.now() - ts
  if (d < 60 * 1000) return '刚刚'
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}

export function billTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function fmtMonthTitle(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${Number(m)} 月`
}
