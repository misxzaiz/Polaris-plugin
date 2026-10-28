/** 问津 shared/core.js 的类型面（CJS 实现的严格映射，字段以实现为准） */
export interface Company {
  id: string
  name: string
  industry: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface App {
  id: string
  companyId: string
  companyName: string
  title: string
  channel: string
  status: string
  jd: string
  salaryPosted: string
  location: string
  resumeId: string
  appliedAt: string
  archived: boolean
  note: string
  createdAt: string
  updatedAt: string
}

export interface Resume {
  id: string
  label: string
  content: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface WEvent {
  id: string
  appId: string
  type: string
  at: string
  title: string
  detail: string
  questions: string[]
  outcome: string
  remindAt: string
  createdAt: string
  updatedAt: string
}

export interface Offer {
  id: string
  appId: string
  baseMonthly: number
  months: number
  bonusMonths: number
  commuteMin: number
  remoteDays: number
  stockNote: string
  deadline: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface Settings {
  schemaVersion: number
  followUpDays: number
  remindLeadHours: number
}

export interface PipelineResult {
  counts: Record<string, number>
  archived: number
  active: App[]
}

export interface FollowUpRow {
  app: App
  lastAt: number
  daysSince: number
}

export interface UpcomingResult {
  schedule: WEvent[]
  reminders: WEvent[]
}

export interface FunnelRow {
  key: string
  submitted: number
  responded: number
  interviewed: number
  offered: number
  respondedRate: string | null
  interviewedRate: string | null
  offeredRate: string | null
}

export interface OfferRow {
  offer: Offer
  app: App | null
  companyName: string
  title: string
  totalMonths: number
  annual: number
  commuteHoursPerYear: number | null
  deltaVsBest: number
}

export interface QuestionRow {
  q: string
  count: number
  companies: string[]
}

export interface ImportCSVResult {
  companies: Company[]
  apps: App[]
  noteEvents: WEvent[]
  created: number
  skipped: number
  warns: string[]
}

export type RawInput = Record<string, unknown> | null

export declare const K: {
  companyPrefix: string
  appPrefix: string
  resumePrefix: string
  eventPrefix: string
  offerPrefix: string
  settings: string
  meta: string
  company: (id: string) => string
  app: (id: string) => string
  resume: (id: string) => string
  event: (id: string) => string
  offer: (id: string) => string
}

export declare const DAY_MS: number
export declare const CHANNELS: string[]
export declare const CHANNEL_LABELS: Record<string, string>
export declare const STATUSES: string[]
export declare const STATUS_LABELS: Record<string, string>
export declare const PIPE_STATUSES: string[]
export declare const ACTIVE_STATUSES: string[]
export declare const EVENT_TYPES: string[]
export declare const EVENT_LABELS: Record<string, string>
export declare const OUTCOMES: string[]
export declare const OUTCOME_LABELS: Record<string, string>
export declare const EVENT_STATUS_MAP: Record<string, string>

export declare function idFor(seed: string): string
export declare function clip(s: unknown, n: number): string
export declare function normName(s: unknown): string
export declare function displayName(s: unknown): string
export declare function nowIso(): string
export declare function parseTs(v: unknown): number | null
export declare function minuteKey(ms: number | null): string
export declare function fmtDate(ms: number): string
export declare function fmtDateTime(ms: number): string
export declare function tsOrNow(v: unknown, nowMs?: number): number

export declare function normalizeCompany(raw: RawInput, prev: Company | null): Company
export declare function normalizeApp(raw: RawInput, prev: App | null, companyName: string): App
export declare function normalizeResume(raw: RawInput, prev: Resume | null): Resume
export declare function normalizeEvent(raw: RawInput, prev: WEvent | null, appId: string): WEvent
export declare function normalizeOffer(raw: RawInput, prev: Offer | null, appId: string): Offer
export declare function normalizeSettings(raw: RawInput, prev?: Settings | null): Settings

export declare function pipeline(apps: App[]): PipelineResult
export declare function lastEventAt(appId: string, events: WEvent[]): number
export declare function followUps(apps: App[], events: WEvent[], settings: Settings, nowMs?: number): FollowUpRow[]
export declare function upcoming(events: WEvent[], settings: Settings, nowMs?: number): UpcomingResult

export declare function stageOf(app: App, events: WEvent[]): 'submitted' | 'responded' | 'interviewed' | 'offered' | null
export declare function funnelBy(apps: App[], events: WEvent[], field: 'channel' | 'resumeId'): FunnelRow[]
export declare function offerCompare(offers: Offer[], apps: App[]): OfferRow[]
export declare function questionBank(events: WEvent[], apps: App[]): QuestionRow[]

export declare function csvEscape(v: unknown): string
export declare function exportCSV(apps: App[], events: WEvent[], resumes: Resume[], offers: Offer[]): string
export declare function parseCSV(text: unknown): string[][]
export declare function importCSV(text: string, existingApps: App[], nowMs?: number): ImportCSVResult

export declare function exportAll(data: {
  companies?: Company[]; apps?: App[]; resumes?: Resume[]; events?: WEvent[]; offers?: Offer[]; settings?: Settings
}): Record<string, unknown>

export declare function describeStatus(s: string): string
export declare function describeChannel(c: string): string
export declare function describeEventType(t: string): string
