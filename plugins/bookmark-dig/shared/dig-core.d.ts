/** dig-core.js（面板/MCP/服务共用核心）的类型声明 */

export declare const CHUNK_SIZE: number
export declare const STATUS: {
  PENDING: 'pending'
  OK: 'ok'
  REDIRECT: 'redirect'
  DEAD_4XX: 'dead4xx'
  DEAD_5XX: 'dead5xx'
  DNS: 'dns'
  TIMEOUT: 'timeout'
  SSL: 'ssl'
  BLOCKED: 'blocked'
  INVALID: 'invalid'
}
export declare const DEAD_STATUSES: Set<string>
export declare const ALIVE_STATUSES: Set<string>

export declare function hashKey(normKey: string): string

export declare function normalizeUrl(rawUrl: string): { url?: string; normKey?: string; host?: string; error?: string }

export declare function classifyUrl(url: string): string

export interface ParsedBookmark {
  url: string
  title: string
  folder: string
  addedAt: number
}
export declare function parseNetscapeHtml(html: string): { records: ParsedBookmark[]; skipped: number }
export declare function decodeEntities(s: string): string

export interface DigRecord {
  id: string
  url: string
  normKey: string
  host: string
  title: string
  folder: string
  addedAt: number
  importedAt: number
  source: string
  tags: string[]
  status: string
  lastCheckedAt: number
  lastOkAt: number
  lastVisitAt: number
  lastResurfaceAt: number
  httpStatus: number
  finalUrl: string
  latencyMs: number
  failReason: string
  tries: number
}
export declare function makeRecord(parsed: Partial<ParsedBookmark> & { url: string; source?: string; tags?: string[] }, now: number): DigRecord | { error: string }
export declare function patchRecord(rec: DigRecord, patch: Partial<DigRecord>): DigRecord

export declare function chunkRecords(records: DigRecord[]): Array<{ n: number; items: DigRecord[] }>

export interface MergeResult {
  toUpsert: DigRecord[]
  duplicateIds: string[]
  invalid: number
  added: number
  updated: number
}
export declare function mergeRecords(existing: DigRecord[], incoming: Array<Partial<ParsedBookmark> & { url: string }>, now: number): MergeResult

export declare function planCheckQueue(
  records: DigRecord[],
  opts: { limit: number; deadOnly?: boolean; recheckDays?: number },
): string[]

export declare function isFetchableUrl(rawUrl: string): boolean
export declare function classifyHttp(statusCode: number, opts?: { redirected?: boolean }): string

export interface Rollup {
  total: number
  alive: number
  dead: number
  pending: number
  duplicates: number
  byStatus: Record<string, number>
  categories: Array<{ name: string; count: number }>
  topDeadDomains: Array<{ host: string; count: number }>
}
export declare function rollup(records: DigRecord[]): Rollup

export declare function searchRecords(
  records: DigRecord[],
  query: string,
  opts?: { status?: string; category?: string; domain?: string },
): DigRecord[]

export declare function pickResurface(
  records: DigRecord[],
  opts?: { rng?: { random: () => number }; now?: number; avoidIds?: string[] },
): DigRecord | null

export declare function toCsv(records: DigRecord[]): string

export interface DigSettings {
  batchSize: number
  concurrency: number
  timeoutMs: number
  recheckDays: number
  autoCheckOnImport: boolean
  checkEnabled: boolean
}
export declare function normalizeSettings(raw: unknown): DigSettings
