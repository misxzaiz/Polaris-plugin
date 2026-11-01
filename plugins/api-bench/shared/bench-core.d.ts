/** bench-core.js 的类型声明（纯逻辑与面板同源；实现见同目录 .js） */
export declare const VERSION: string

export declare const LIMITS: {
  connections: { min: number; max: number; default: number }
  durationS: { min: number; max: number; default: number }
  pipelining: { min: number; max: number; default: number }
  rate: { min: number; max: number }
  timeoutS: { min: number; max: number; default: number }
  urlMaxLen: number
  headersMaxEntries: number
  headerNameMaxLen: number
  headerValueMaxBytes: number
  bodyMaxBytes: number
  samplesMax: number
  latRingMax: number
  reportSamplesKeep: number
}

export declare const SENSITIVE_HEADERS: string[]
export declare const FORBIDDEN_HEADERS: string[]

export declare function fmtMs(ms: number): string
export declare function fmtRate(rps: number): string
export declare function fmtBytes(bps: number): string
export declare function fmtRound1(v: number): number
export declare function maskValue(v: unknown): string
export declare function maskHeaders(headers: Record<string, string> | undefined | null): Record<string, string>

export declare function scopeOf(urlStr: string): 'loopback' | 'private' | 'public' | 'invalid'

export interface SanitizedTarget {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  connections: number
  durationS: number
  pipelining: number
  rate: number | null
  timeoutS: number
  scope: 'loopback' | 'private' | 'public' | 'invalid'
  bodyBytes: number
}

export declare function sanitizeTarget(
  input: unknown,
  defaults?: { connections?: number; durationS?: number; timeoutS?: number },
): { ok: true; value: SanitizedTarget } | { ok: false; error: string }

export interface WinPercentiles {
  mean: number
  p50: number
  p90: number
  p97_5: number
  p99: number
  count: number
}

export declare function percentileOf(sortedArr: number[], p: number): number | null
export declare function windowPercentiles(
  ring: Array<{ t: number; v: number }>,
  windowMs: number,
  now?: number,
): WinPercentiles | null

export declare function summarize(
  result: Record<string, any>,
  liveSamples: Array<Record<string, unknown>>,
  target: SanitizedTarget,
  aborted: boolean,
): Record<string, any>

export declare function verdictOf(
  summary: Record<string, any>,
  target: SanitizedTarget,
): { oneLine: string; notes: string[] }

export interface CompareRow {
  key: string
  label: string
  unit: string
  dir: 'up' | 'down'
  a: number
  b: number
  deltaPct: number | null
  better: 'a' | 'b' | 'tie' | 'na'
}

export declare const COMPARE_METRICS: Array<{ key: string; label: string; unit: string; dir: 'up' | 'down' }>

export declare function compareReports(
  a: Record<string, any>,
  b: Record<string, any>,
): { rows: CompareRow[]; bWins: number; aWins: number; ties: number }
