/**
 * shared/core.js 的类型声明（CJS 实现，面板/MCP 同源一致）
 */

export type Cycle = 'month' | 'year' | 'quarter' | 'week' | 'custom'
export type SubStatus = 'active' | 'trial' | 'paused' | 'cancelled'

export interface PricePoint {
  date: string
  amount: number
  note?: string
}

export interface SubEvent {
  ts: number
  kind: 'create' | 'renew' | 'skip' | 'pause' | 'resume' | 'cancel' | 'restore' | 'price'
  note?: string
}

export interface Subscription {
  id: string
  name: string
  category: string
  vendor?: string
  plan?: string
  amount: number
  cycle: Cycle
  customDays?: number
  nextRenewalDate: string
  autoRenew: boolean
  status: SubStatus
  trialEndsAt?: string
  paymentMethod?: string
  manageUrl?: string
  note?: string
  remindDaysBefore: number | null
  priceHistory: PricePoint[]
  events: SubEvent[]
  cancelledAt?: string
  cancelReason?: string
  createdAt: number
  updatedAt: number
}

export interface Settings {
  schemaVersion: number
  currencySymbol: string
  defaultRemindDays: number
}

export type RenewState = 'overdue' | 'dueSoon' | 'trialUrgent' | 'trial' | 'ok'

export interface Board {
  overdue: Subscription[]
  upcoming: Subscription[]
  trials: Subscription[]
}

export interface CashflowCell {
  month: string
  amount: number
  items: { name: string; amount: number; date: string }[]
}

export interface Stats {
  today: string
  counts: { active: number; trial: number; paused: number; cancelled: number }
  monthlyActive: number
  annualActive: number
  monthlyTrial: number
  monthlyAll: number
  annualAll: number
  byCategory: { category: string; monthly: number; count: number }[]
  topAnnual: {
    id: string; name: string; vendor?: string; category: string; status: SubStatus
    monthly: number; annual: number; cycleLabel: string; amount: number
    nextRenewalDate: string
  }[]
  cashflow: CashflowCell[]
  savedMonthly: number
  savedAnnual: number
  priceChanges: { id: string; name: string; from: number; to: number; date: string; vendor?: string }[]
}

export interface CsvItem {
  ok: boolean
  error?: string
  sub?: Subscription
}

export declare const K: {
  sub: (id: string) => string
  subPrefix: string
  settings: string
}
export declare const DEFAULT_SETTINGS: Settings
export declare const CATEGORIES: string[]
export declare const STATUSES: SubStatus[]
export declare const STATUS_LABELS: Record<SubStatus, string>
export declare const LIMITS: Record<string, number>
export declare const MAX_AMOUNT: number
export declare const CSV_HEADERS: string[]

export declare function dayKeyOf(ts: number): string
export declare function todayStr(now?: number): string
export declare function dateToTs(dateStr: string): number | null
export declare function addDays(dateStr: string, n: number): string | null
export declare function daysBetween(fromStr: string, toStr: string): number | null
export declare function advanceDate(dateStr: string, cycle: Cycle, customDays?: number): string | null
export declare function perYearOf(cycle: Cycle, customDays?: number): number | null
export declare function monthlyCost(sub: Subscription): number | null
export declare function annualCost(sub: Subscription): number | null
export declare function cycleLabel(sub: Subscription): string
export declare function fmtMoney(n: number, symbol?: string): string
export declare function makeId(now?: number): string

export declare function normalizeSub(raw: Record<string, unknown>, now?: number): { error: string; sub?: never } | { error?: never; sub: Subscription }
export declare function applyUpdate(sub: Subscription, patch: Record<string, unknown>, now?: number): { error: string; sub?: never } | { error?: never; sub: Subscription }

export declare function renewState(sub: Subscription, today?: string | number): RenewState
export declare function dueBoard(subs: Subscription[], today?: string | number): Board

export declare function renewSub(sub: Subscription, opts?: { amount?: number; date?: string; note?: string }, now?: number): { error: string; sub?: never } | { error?: never; sub: Subscription }
export declare function skipSub(sub: Subscription, opts?: { reason?: string; note?: string }, now?: number): { sub: Subscription }
export declare function cancelSub(sub: Subscription, opts?: { reason?: string; note?: string }, now?: number): { sub: Subscription }
export declare function pauseSub(sub: Subscription, opts?: { note?: string }, now?: number): { sub: Subscription }
export declare function resumeSub(sub: Subscription, nextRenewalDate: string, now?: number): { error: string; sub?: never } | { error?: never; sub: Subscription }

export declare function filterSubs(subs: Subscription[], filter?: { keyword?: string; category?: string; status?: SubStatus; autoRenew?: boolean }): Subscription[]
export declare function stats(subs: Subscription[], today?: string | number, opts?: { cashflowMonths?: number }): Stats

export declare function toCsv(subs: Subscription[], symbol?: string): string
export declare function fromCsv(text: string): { items: CsvItem[]; error?: string }
export declare function parseCsvLine(line: string): string[]
