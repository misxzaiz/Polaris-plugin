/** 金匮 shared/core.js 的类型声明（面板 tsc strict 用；与 core.js 保持同步） */
export declare const DAY_MS: number
export declare const RELATIONS: string[]
export declare const RELATION_NAMES: Record<string, string>
export declare const KINDS: string[]
export declare const KIND_NAMES: Record<string, string>
export declare const GAP_KINDS: string[]
export declare const FREQS: string[]
export declare const FREQ_NAMES: Record<string, string>
export declare const FREQ_MONTHS: Record<string, number>
export declare const FREQ_PER_YEAR: Record<string, number>
export declare const EVENT_TYPES: string[]
export declare const EVENT_NAMES: Record<string, string>
export declare const END_REASONS: string[]
export declare const END_REASON_NAMES: Record<string, string>
export declare const REINSTATE_WINDOW_DAYS: number
export declare const STATES: string[]
export declare const STATE_NAMES: Record<string, string>

export interface Member {
  id: string
  name: string
  relation: string
  birthYear: number | null
  note: string
  createdAt: number
}

export interface Policy {
  id: string
  name: string
  kind: string
  insuredId: string
  holderId: string
  company: string
  policyNo: string
  coverage: number | null
  coverageNote: string
  premium: number | null
  freq: string
  payYears: number | null
  startDate: string
  endDate: string | null
  waitingDays: number | null
  fileNote: string
  note: string
  endedAt: string | null
  endReason: string | null
  createdAt: number
}

export interface PolicyEvent {
  occKey: string
  type: 'pay' | 'claim' | 'endorse' | 'reinstate' | 'surrender' | 'other'
  policyId: string
  date: string
  amount: number | null
  note: string
  at: number
}

export interface Settings {
  graceDays: number
  warnDays: number
}

export interface PolicyState {
  today: string
  policyId: string
  state: string
  stateName: string
  paidUntil: string
  nextPayDate: string | null
  daysToPay: number | null
  graceEnd: string | null
  waitingEnd: string | null
  surrenderDate: string | null
}

export interface CalendarRow {
  policyId: string
  name: string
  kind: string
  company: string
  state: string
  date: string
  daysToPay: number
  premium: number | null
}

export interface GapCell { count: number; sum: number }
export interface GapRow {
  memberId: string
  name: string
  cells: Record<string, GapCell>
  missing: string[]
}
export interface GapResult {
  rows: GapRow[]
  otherKinds: { annuity: number; property: number; other: number }
}

export interface FlowItem { policyId: string; name: string; date: string; premium: number }
export interface FlowMonth { amount: number; items: FlowItem[] }
export interface FlowResult {
  months: Record<string, FlowMonth>
  total: number
  from: string
  to: string
}

export interface FamilyTotals {
  policyCount: number
  activeCount: number
  byState: Record<string, number>
  annualizedPremium: number
  totalPaid: number
  totalClaim: number
}

type NormOk<T> = { [K in keyof T]: T[K] } & { error?: undefined }
type NormErr = { error: string }

export declare function clip(s: unknown, cap: number): string
export declare function idFor(seed: string): string
export declare function round2(x: number): number
export declare function fmtMoney(x: number | null | undefined): string
export declare function dayKey(ts: number): string
export declare function parseDayKey(s: string): number | null
export declare function dayDiff(a: string, b: string): number | null
export declare function addMonths(dateStr: string, k: number): string | null
export declare function addDays(dateStr: string, n: number): string | null

export declare function normalizeMember(input: Partial<Member> & Record<string, unknown>, prev: Member | null): { member: Member; error?: undefined } | { member?: undefined; error: string }
export declare function normalizePolicy(input: Partial<Policy> & Record<string, unknown>, prev: Policy | null): { policy: Policy; error?: undefined } | { policy?: undefined; error: string }
export declare function normalizeEvent(input: Partial<PolicyEvent> & Record<string, unknown>, prev: PolicyEvent | null): { ev: PolicyEvent; error?: undefined } | { ev?: undefined; error: string }
export declare function normalizeSettings(raw: unknown): Settings

export declare function paidUntilOf(policy: Policy, events: PolicyEvent[]): string
export declare function periodsPaid(policy: Policy, paidUntil: string): number
export declare function totalPeriods(policy: Policy): number | null
export declare function nextPayDate(policy: Policy, events: PolicyEvent[]): string | null
export declare function graceApplies(policy: Policy): boolean
export declare function policyStatus(policy: Policy, events: PolicyEvent[], settings: Settings, now?: number | null): PolicyState
export declare function coversGap(state: string): boolean
export declare function eventsFor(events: PolicyEvent[], policyId: string): PolicyEvent[]
export declare function paymentCalendar(policies: Policy[], events: PolicyEvent[], settings: Settings, now?: number | null, days?: number): CalendarRow[]
export declare function gapMatrix(members: Member[], policies: Policy[], events: PolicyEvent[], settings: Settings, now?: number | null): GapResult
export declare function premiumFlow(policies: Policy[], events: PolicyEvent[], settings: Settings, now?: number | null): FlowResult
export declare function familyTotals(policies: Policy[], events: PolicyEvent[], settings: Settings, now?: number | null): FamilyTotals
export declare function describePolicy(policy: Policy, insuredName?: string): string
