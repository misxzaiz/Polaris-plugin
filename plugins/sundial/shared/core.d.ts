/**
 * shared/core.js 的类型声明（CJS 实现，浏览器/node 同源一致；面板/服务/MCP 三方共用）
 */

export interface SundialEvent {
  id: string
  title: string
  notes: string
  kind: 'event' | 'habit' | 'countdown'
  start: number
  allDay: boolean
  durationMin: number
  rrule: string
  remind: number[]
  tags: string[]
  source: 'manual' | 'ics'
  icsId?: string
  uid?: string
  rid?: string
  enabled: boolean
  done: Record<string, 'done' | 'skip'>
  createdAt: number
  updatedAt: number
  rev: number
}

export interface SundialIcs {
  id: string
  url: string
  name: string
  enabled: boolean
  createdAt: number
  etag: string
  lastFetchAt: number
  lastStatus: 'never' | 'ok' | 'error' | string
  lastError: string
  consecutiveErrors: number
  eventCount: number
  rev: number
}

export interface SundialSettings {
  icsIntervalHours: number
  retentionDays: number
  reminderGraceMin: number
}

export interface Occurrence {
  start: number
  key: string
}

export interface ReminderItem {
  id: string
  eventId: string
  title: string
  kind: string
  start: number
  occKey: string
  allDay: boolean
  offsetMin: number
  remindAt: number
}

export declare const DAY_MS: number
export declare const WD_BY_NAME: Record<string, number>
export declare const WD_NAME_BY_NUM: string[]
export declare const WD_CN: string[]
export declare const FIXED_OFFSETS: Record<string, number>
export declare function isFetchableUrl(rawUrl: unknown): boolean
export declare function decodeEntities(s: unknown): string
export declare function clip(s: unknown, cap: number): string
export declare function oneLine(s: unknown, n: number): string
export declare function eventIdFor(seed: string): string
export declare function icsIdFor(url: string): string
export declare function icsEventId(icsId: string, uid: string): string
export declare function parseWhen(raw: unknown): { ts: number; allDay: boolean } | null
export declare function parseRrule(str: string): { error: string } | { r: RRuleParsed }
export declare function friendlyRrule(input: unknown): { rrule: string } | { error: string }
export declare function describeRrule(rruleStr: string, startTs?: number): string
export declare function expandOccurrences(
  event: Pick<SundialEvent, 'start' | 'allDay' | 'durationMin' | 'rrule' | 'done'>,
  t0: number,
  t1: number,
  opts?: { max?: number },
): Occurrence[]
export declare function occKey(startTs: number, allDay: boolean): string
export declare function dayStartUtc(ts: number): number
export declare function allDayAnchor(startTs: number): number
export declare function computeReminders(
  events: SundialEvent[],
  now: number,
  opts?: { acked?: Record<string, number>; graceMin?: number; cap?: number },
): ReminderItem[]
export declare function computeStreak(event: SundialEvent, now: number): number
export declare function countdownInfo(event: SundialEvent, now: number): { targetTs: number; days: number; key: string } | null
export declare function normalizeEvent(raw: Record<string, unknown>, existing?: SundialEvent | null): { event: SundialEvent } | { error: string }
export declare function normalizeSettings(raw: unknown): SundialSettings
export declare function normalizeIcs(raw: Record<string, unknown>, existing?: SundialIcs | null): { ics: SundialIcs } | { error: string }
export declare function planRetention(events: SundialEvent[], settings: Partial<SundialSettings>, now: number): string[]
export declare function pruneDoneMap(done: Record<string, 'done' | 'skip'>, cap?: number): Record<string, 'done' | 'skip'>
export declare function unfoldIcsLines(text: string): string[]
export declare function parseIcs(text: string): { vtimezones: Map<string, unknown>; vevents: Record<string, unknown>[] }
export declare function parseIcsDateTime(
  value: string,
  params: Record<string, string> | undefined,
  vtimezones: Map<string, unknown>,
): { ts: number; allDay: boolean; tzid: string } | null
export declare function parseIcsDuration(s: string): number
export declare function zoneOffsetAt(tzid: string, ts: number, vtimezones: Map<string, unknown>): number | null
export declare function icsToRawEvents(
  icsText: string,
  icsName: string,
  now: number,
): { ok: boolean; raws: Record<string, unknown>[]; skipsByUid: Record<string, string[]>; count: number; name: string }
export declare function planIcsSync(
  existingEvents: SundialEvent[],
  raws: Record<string, unknown>[],
  icsId: string,
  skipsByUid: Record<string, string[]>,
  now: number,
): { upserts: SundialEvent[]; deletes: string[] }
export declare function fmtDay(ts: number): string
export declare function fmtClock(ts: number): string
export declare function fmtOccWhen(startTs: number, allDay: boolean, durationMin: number): string
export declare function localParts(ts: number): { y: number; m: number; d: number; hh: number; mm: number; wd: number }
export declare function utcParts(ts: number): { y: number; m: number; d: number }

interface RRuleParsed {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byday: { wd: number; nth: number }[]
  bymonthday: number[]
  bymonth: number[]
  until: string | null
  count: number
  untilTs: number
}
