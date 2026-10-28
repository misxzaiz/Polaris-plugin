/** shared/core 的类型声明（面板 TypeScript 侧；与 core.js 实现保持同步） */
export declare const DAY_MS: number
export declare const FREQ_TYPES: string[]
export declare const FORMS: string[]
export declare const RATE_WINDOW_DAYS: number

export interface Profile { id: string; name: string; kind: 'human' | 'pet'; note: string; createdAt: number; updatedAt: number; rev: number }
export interface Med { id: string; name: string; spec: string; form: string; unit: string; note: string; createdAt: number; updatedAt: number; rev: number }
export interface Batch { id: string; medId: string; qty: number; expiry: string; note: string; createdAt: number; updatedAt: number; rev: number }
export interface Freq { type: 'daily' | 'weekly' | 'interval' | 'cycle' | 'prn'; weekdays?: number[]; intervalDays?: number; onDays?: number; offDays?: number }
export interface Regimen {
  id: string; profileId: string; medId: string; dose: number; times: string[]
  freq: Freq; startDate: string; endDate: string; active: boolean; note: string
  createdAt: number; updatedAt: number; rev: number
}
export interface DoseLog { occKey: string; regId: string; date: string; time: string; status: 'taken' | 'skip'; amount?: number; at: number }
export interface Settings { graceMin: number; lowDays: number; expiryWarnDays: number; soundOn: boolean }

export type Norm<T> = { error: string } | { [K in keyof T]: T[K] }
export declare function normalizeProfile(raw: Partial<Profile> & Record<string, unknown>, existing?: Profile | null): { error: string } | { profile: Profile }
export declare function normalizeMed(raw: Partial<Med> & Record<string, unknown>, existing?: Med | null): { error: string } | { med: Med }
export declare function normalizeBatch(raw: Partial<Batch> & Record<string, unknown>, existing?: Batch | null): { error: string } | { batch: Batch }
export declare function normalizeRegimen(raw: Partial<Regimen> & Record<string, unknown>, existing?: Regimen | null): { error: string } | { regimen: Regimen }
export declare function normalizeLog(raw: Record<string, unknown>, regimen?: Regimen | null, now?: number): { error: string } | { del: string } | { log: DoseLog }
export declare function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings

export declare function doseOccKey(regId: string, date: string, time: string): string
export declare function parseOccKey(key: string): { regId: string; date: string; time: string } | null
export declare function dayKey(ts: number): string
export declare function parseDayKey(s: string): number | null
export declare function dayDiff(a: string, b: string): number

export interface Occurrence { occKey: string; time: string; min: number; amount: number; dueTs: number | null; reg: Regimen }
export declare function regimenDueOnDate(reg: Regimen, date: string): boolean
export declare function regimenOccurrencesOnDate(reg: Regimen, date: string): Occurrence[]
export declare function occurrencesForDate(regimens: Regimen[], date: string): Occurrence[]

export interface TodayItem {
  occKey: string; time: string; dueTs: number
  medId: string; medName: string; unit: string; amount: number
  status: 'taken' | 'skip' | null; loggedAt: number | null
  state: 'done' | 'skip' | 'now' | 'overdue' | 'upcoming'
  note: string
}
export interface TodayGroup { profile: Profile; items: TodayItem[]; counts: { done: number; skip: number; now: number; overdue: number; upcoming: number } }
export interface TodayCtx { profiles: Profile[]; meds: Med[]; regimens: Regimen[]; logs: DoseLog[]; settings?: Partial<Settings> | null }
export declare function todayPlan(ctx: TodayCtx, date: string, now?: number): TodayGroup[]
export interface DoseProjItem { occKey: string; profileId: string; profileName: string; medId: string; medName: string; unit: string; amount: number; time: string; dueTs: number; state: 'now' | 'overdue' }
export declare function dosesProjection(ctx: TodayCtx, date: string, now?: number): { at: number; date: string; items: DoseProjItem[] }

export interface StockRow { id: string; qty: number; remaining: number; expiry: string; expired: boolean; note: string }
export interface Stock { totalUsable: number; totalExpired: number; batches: StockRow[]; over: boolean; lastTakenAt: number }
export declare function stockForMed(medId: string, batches: Batch[], logs: DoseLog[], regimens: Regimen[], today?: string): Stock

export interface RefillRow {
  medId: string; name: string; spec: string; unit: string
  remaining: number; expired: number
  ratePerDay: number; estimated: boolean; daysLeft: number | null
  urgency: 'low' | 'watch' | 'ok' | 'none'
}
export declare function refillForecast(ctx: TodayCtx, now?: number): RefillRow[]
export declare function regimenDailyRate(reg: Regimen): number

export interface ExpiryRow { batchId: string; medId: string; medName: string; unit: string; expiry: string; daysLeft: number | null; qty: number; band: 'expired' | 'soon' | 'ok' | 'unknown'; note: string }
export declare function expiryBands(batches: Batch[], meds: Med[], now?: number, warnDays?: number): ExpiryRow[]

export interface Adherence { days: number; scheduled: number; decided: number; taken: number; skipped: number; missed: number; rate: number | null }
export declare function adherence(ctx: TodayCtx, profileId: string | null, now?: number, days?: number): Adherence

export declare const FREQ_CN: Record<string, string>
export declare const WD_CN: string[]
export declare function describeFreq(freq: Freq): string
export declare function describeRegimen(reg: Regimen, med?: Med | null): string
export declare function exportAll(data: { profiles: Profile[]; meds: Med[]; batches: Batch[]; regimens: Regimen[]; logs: DoseLog[]; settings?: Partial<Settings> | null }): string
