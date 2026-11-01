/** 装修台账 shared core 类型声明（与 core.js 同步维护） */
export declare const DAY_MS: number
export declare const MAX_AMOUNT: number
export declare const GROUPS: string[]
export declare const TEMPLATE: { name: string; group: string }[]
export declare const COMMON_MISS: string[]

export declare function dayKey(ts: number): string
export declare function parseDayKey(s: unknown): number | null
export declare function dayMinTs(date: string, minutes: number): number | null
export declare function parseTimeHM(s: unknown): number | null
export declare function fmtTime(ts: number): string
export declare function fmtDT(ts: number): string
export declare function fmtMoney(n: number): string
export declare function round2(n: number): number
export declare function clip(s: unknown, n: number): string
export declare function clipId(s: unknown): string
export declare function id4(prefix: string): string

export interface Project {
  id: string
  name: string
  house?: string
  totalBudget?: number
  status: 'planning' | 'active' | 'done'
  startDate?: string
  createdAt: number
  updatedAt: number
}
export interface Category {
  id: string
  name: string
  group: string
  budget?: number
  isExtra: boolean
  order: number
  note?: string
  createdAt: number
  updatedAt: number
}
export interface Vendor {
  id: string
  name: string
  role?: string
  phone?: string
  contractAmount?: number
  note?: string
  createdAt: number
  updatedAt: number
}
export interface Milestone {
  id: string
  title: string
  date: string
  done: boolean
  note?: string
  createdAt: number
  updatedAt: number
}
export interface Expense {
  id: string
  catId: string
  amount: number
  ts: number
  vendorId?: string
  payMethod?: string
  note?: string
  src: 'panel' | 'ai'
  createdAt: number
  updatedAt: number
}

export declare function normalizeProject(input: Record<string, unknown>, existing: Project | null): { project?: Project; error?: string }
export declare function normalizeCategory(input: Record<string, unknown>, existing: Category | null): { cat?: Category; error?: string }
export declare function resolveCatName(name: string, cats: Category[]): { cat?: Category; error?: string }
export declare function normalizeVendor(input: Record<string, unknown>, existing: Vendor | null): { vendor?: Vendor; error?: string }
export declare function normalizeMilestone(input: Record<string, unknown>, existing: Milestone | null): { mile?: Milestone; error?: string }
export declare function milestoneLevel(m: Milestone, now?: number): { level: 'red' | 'yellow' | 'green' | 'gray'; daysLeft: number | null }
export declare function normalizeExpense(input: Record<string, unknown>, existing: Expense | null): { expense?: Expense; error?: string }
export declare function dayKeyOfTs(ts: number): string

export interface BudgetRow { cat: Category; spent: number; budget: number | null; level: 'red' | 'yellow' | 'gray' | 'green'; pct: number | null }
export interface BudgetCompareResult {
  rows: BudgetRow[]
  totals: { budgetTotal: number; catBudgetTotal: number; spentTotal: number; remainTotal: number; pct: number | null; level: 'red' | 'yellow' | 'green' }
  extraSpent: number
  extraCount: number
}
export declare function budgetCompare(cats: Category[], expenses: Expense[], totalBudget?: number | null): BudgetCompareResult
export declare function missingCheck(cats: Category[]): string[]
export declare function buildSummary(
  data: { project: Project | null; cats: Category[]; expenses: Expense[]; vendors: Vendor[]; milestones: Milestone[] },
  now?: number,
): string
