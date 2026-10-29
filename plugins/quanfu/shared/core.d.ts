/** 贷款台账 shared/core.js 的类型声明（面板 tsc strict 用；与 core.js 保持同步） */
export declare const DAY_MS: number
export declare const METHODS: string[]
export declare const METHOD_NAMES: Record<string, string>
export declare const KINDS: string[]
export declare const KIND_NAMES: Record<string, string>
export declare const EVENT_TYPES: string[]
export declare const CYCLES: number[]
export declare const MAX_TERM_MONTHS: number
export declare const PREPAY_MIN: number

export interface Loan {
  id: string
  name: string
  lender: string
  kind: string
  method: 'annuity' | 'linear' | 'bullet'
  principal: number
  annualRate: number
  startDate: string
  termMonths: number
  repricing: { day: string; cycleMonths: number } | null
  groupId: string
  note: string
  active: boolean
  createdAt: number
}

export interface LoanEvent {
  occKey: string
  type: 'rate' | 'prepay' | 'checkpoint'
  loanId: string
  date: string
  rate?: number
  amount?: number
  mode?: 'term' | 'payment'
  note: string
  at: number
}

export interface Settings {
  warnDays: number
  repricingWarnDays: number
  driftWarn: number
}

export interface Period {
  k: number; date: string; opening: number; interest: number
  principal: number; payment: number; closing: number
  rate: number; prepay?: number
}

export interface Checkpoint {
  date: string; bank: number; book: number; drift: number; note: string
}

export interface LoanState {
  today: string
  loanId: string
  active: boolean
  monthsPaid: number
  totalMonths: number
  nextPaymentDate: string | null
  nextPaymentAmount: number | null
  currentRate: number
  remainingPrincipal: number
  remainingInterest: number
  paidInterest: number
  paidPrincipal: number
  paidPrepay: number
  paidThisYearInterest: number
  endDate: string | null
  settled: boolean
  truncated: boolean
  nextRepricingDate: string | null
  checkpoints: Checkpoint[]
}

export interface WhatifSlice {
  remainingInterest: number
  remainingMonths: number
  endDate: string | null
  nextPayment: number
}

export interface WhatifResult {
  effectiveDate: string
  balanceAtEff: number
  method: string
  bulletNote: string | null
  baseline: WhatifSlice
  term: WhatifSlice & { sameAsPayment?: boolean }
  payment: WhatifSlice
  saved: { term: number; payment: number }
}

export interface YearRow {
  year: string; interest: number; principal: number; prepay: number; paid: number
}

export interface FamilyTotals {
  monthlyPayment: number
  remainingPrincipal: number
  remainingInterest: number
  paidThisYearInterest: number
  loanCount: number
  settledCount: number
}

type NormOk<T> = { [K in keyof T]: T[K] } & { error?: undefined }
type NormErr = { error: string }

export declare function clip(s: unknown, cap: number): string
export declare function idFor(seed: string): string
export declare function randTag(): string
export declare function round2(x: number): number
export declare function dayKey(ts: number): string
export declare function parseDayKey(s: string): number | null
export declare function dayDiff(a: string, b: string): number | null
export declare function addMonths(dateStr: string, k: number): string | null
export declare function fmtMoney(x: number | null | undefined): string
export declare function fmtPct(x: number | null | undefined): string
export declare function monthlyRate(annualRatePct: number): number
export declare function annuityPmt(P: number, annualRatePct: number, n: number): number
export declare function solvedN(bal: number, pmt: number, annualRatePct: number): number | null

export declare function normalizeLoan(input: Partial<Loan> & Record<string, unknown>, prev: Loan | null): { loan: Loan; error?: undefined } | { loan?: undefined; error: string }
export declare function normalizeEvent(input: Partial<LoanEvent> & Record<string, unknown>, prev: LoanEvent | null): { ev: LoanEvent; error?: undefined } | { ev?: undefined; error: string }
export declare function normalizeSettings(raw: unknown): Settings

export declare function simulate(loan: Loan, events: LoanEvent[], extra?: LoanEvent): { periods: Period[]; plan: string; truncated: boolean }
export declare function balanceAt(sim: { periods: Period[] }, dateStr: string): number | null
export declare function validatePrepay(loan: Loan, events: LoanEvent[], p: { date: string; amount: number }): { ok: boolean; effectiveDate: string; balanceAtEff: number; error?: undefined } | { ok?: undefined; error: string }
export declare function whatifPrepay(loan: Loan, events: LoanEvent[], p: { date: string; amount: number }): WhatifResult | { error: string }
export declare function nextRepricing(loan: Loan, events: LoanEvent[], today: string): string | null
export declare function loanState(loan: Loan, events: LoanEvent[], now: number): LoanState
export declare function yearlyBreakdown(loan: Loan, events: LoanEvent[]): YearRow[]
export declare function describeLoan(loan: Loan): string
export declare function familyTotals(states: LoanState[]): FamilyTotals
