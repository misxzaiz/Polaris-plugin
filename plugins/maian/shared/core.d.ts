/** shared/core.js 的类型投影（面板 TS 侧使用；与 JS 实现保持同步） */
export declare const DAY_MS: number
export declare const KINDS: string[]
export declare const KIND_META: Record<string, { label: string; unit: string }>
export declare const BG_SLOTS: string[]
export declare const BG_SLOT_META: Record<string, { label: string }>
export declare const LEVELS: string[]
export declare const BAND_NOTE: string

export declare function dayKey(ts: number): string
export declare function parseDayKey(s: string): number | null
export declare function dayMinTs(date: string, minutes: number): number | null
export declare function fmtTime(ts: number): string
export declare function fmtDT(ts: number): string
export declare function dayDiff(a: string, b: string): number | null
export declare function rangeDays(from: string, to: string): string[] | null
export declare function rid(): string
export declare function clip(s: unknown, n: number): string
export declare function round1(x: number): number

export interface Member {
  id: string; name: string; heightCm?: number; note: string
  createdAt: number; updatedAt: number
}
export type NormalizedMember = { member: Member } | { error: string }
export declare function normalizeMember(input: Record<string, unknown>, existing: Member | null): NormalizedMember

export type Kind = 'bp' | 'bg' | 'weight' | 'temp'
export interface VitalRecord {
  id: string; profileId: string; kind: Kind; ts: number
  sys?: number; dia?: number; pulse?: number
  mmol?: number; slot?: string
  kg?: number; c?: number
  note: string; src: 'panel' | 'ai'; at: number
}
export type NormalizedRecord = { record: VitalRecord } | { error: string }
export declare function normalizeRecord(input: Record<string, unknown>, now: number): NormalizedRecord

export interface Band { level: 'green' | 'yellow' | 'red' | 'urgent' | 'none'; label: string; text: string; bmi?: number }
export declare function bandOf(kind: string, v: Record<string, unknown>, heightCm?: number): Band
export declare function fmtValue(r: VitalRecord): string

export declare function upsertRecord(dayArr: VitalRecord[] | null, record: VitalRecord): VitalRecord[]
export declare function removeRecord(dayArr: VitalRecord[] | null, id: string): { arr: Record[]; found: boolean }
export declare function dayKeyOfTs(ts: number): string
export declare function dayKeyFor(dateStr: string): string

export interface FieldStat { min: number; max: number; avg: number; n: number }
export interface Stats {
  count: number
  bands: { green: number; yellow: number; red: number; urgent: number; none: number }
  fields: Record<string, FieldStat>
  latest: VitalRecord | null; prev: VitalRecord | null
}
export declare function statsFor(records: VitalRecord[], heightCmOf?: (profileId: string) => number | undefined): Stats

export type TrendPoint = { ts: number; sys?: number; dia?: number; value?: number; level: string }
export declare function trendPoints(records: VitalRecord[], heightCmOf?: (profileId: string) => number | undefined): TrendPoint[]

export declare function buildSummary(o: { member: Member; from: string; to: string; records: VitalRecord[] }): string
export declare function exportAllText(o: { members: Member[]; dayMap: Record<string, VitalRecord[]> }): string
