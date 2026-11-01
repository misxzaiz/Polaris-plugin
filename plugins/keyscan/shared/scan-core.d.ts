/** scan-core.js 的类型声明（实现在同目录 scan-core.js，CJS） */
export interface Rule {
  id: string
  sev: 'critical' | 'high' | 'medium'
  label: string
  desc: string
  res: RegExp[]
  valueGroup: number
  contextRe?: RegExp
  entropyMin?: number
  onlyBasename?: RegExp
  valueRe?: RegExp
  noMask?: boolean
}

export interface RawFinding {
  fp: string
  rule: string
  sev: 'critical' | 'high' | 'medium'
  preview: string
  ctx: string
  file: string
  line: number
}

export interface AggFinding {
  fp: string
  rule: string
  sev: 'critical' | 'high' | 'medium'
  preview: string
  ctx: string
  count: number
  occurrences: { file: string; line: number }[]
  firstFile: string
}

export interface SevCounts { critical: number; high: number; medium: number }
export interface DiffCounts { newCount: number; newCritical: number; newHigh: number }

export interface ScanSettings {
  root: string
  maxFileKB: number
  maxFiles: number
  maxTotalMB: number
  skipDirs: string[]
  disabledRules: string[]
  ctxLines: number
}

export const RULES: Rule[]
export const DEFAULT_SETTINGS: ScanSettings
export const SKIP_DIRS: string[]
export const SKIP_FILES: string[]
export const SKIP_EXT: string[]

export function shannon(s: string): number
export function maskValue(v: string): string
export function fingerprint(s: string): string
export function isSkipDir(name: string): boolean
export function isSkipFile(name: string): boolean
export function isSkipExt(name: string): boolean
export function extOf(name: string): string
export function looksBinary(buf: Buffer): boolean
export function isPlaceholderValue(v: string): boolean
export function scanText(text: string, opts: { relFile: string; enabledRules?: Set<string> }): RawFinding[]
export function maskLine(line: string, re: RegExp, valueGroup: number): string
export function aggregateFindings(raw: RawFinding[]): AggFinding[]
export function diffFindings(currList: { fp: string; sev: string }[], prevFps: Set<string> | string[]): DiffCounts
export function countSeverities(list: { sev: string }[]): SevCounts
export function applyIgnores<T extends { fp: string }>(findings: T[], ignoreList: { fp: string }[]): T[]
export function filterFindings<T extends { sev: string; rule: string; file?: string; ctx?: string; preview?: string }>(
  findings: T[],
  q: { severity?: string; ruleId?: string; search?: string },
): T[]
