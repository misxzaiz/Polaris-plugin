/**
 * mask-core.js 的 TypeScript 契约（面板 tsc 用；与 JS 实现同步维护）
 */

export type MaskMode = 'partial' | 'fake' | 'label'

export interface MaskTypeMeta {
  label: string
  priority: number
  defaultMode: MaskMode
  confirm: boolean
  structuralOnly?: boolean
}

export interface ScanHit {
  type: string
  key?: string
  start: number
  end: number
  original: string
  priority: number
  confirm: boolean
  spaced?: boolean
}

export interface MaskOutHit {
  type: string
  key: string
  start: number
  end: number
  mode: MaskMode
  confirm: boolean
  preview: string
  /** 仅 exposeOriginal=true（面板本地）时存在；service/MCP 恒 undefined */
  original?: string
}

export interface LedgerEntry {
  type: string
  original: string
  out: string
  mode: MaskMode
  seq: number
  count: number
  firstAt: number
}

export type LedgerEntryWithFp = LedgerEntry & { fp: string }

export interface CustomRule {
  name: string
  pattern: string
  flags?: string
  replacement?: string
}

export interface MaskOptions {
  types?: Record<string, { on?: boolean; mode?: MaskMode }>
  salt?: string
  structural?: boolean
  csv?: boolean
  cnameAggressive?: boolean
  ipv4KeepPrivate?: boolean
  customRules?: CustomRule[]
  /** ⚠ 仅面板本地 diff 用；service/MCP 一律 false */
  exposeOriginal?: boolean
  maxLen?: number
  /** 调用方持有的映射台账（原地合并） */
  ledger?: Map<string, LedgerEntry>
}

export interface MaskResult {
  output: string
  stats: Record<string, number>
  hits: MaskOutHit[]
  newEntries: LedgerEntryWithFp[]
  truncated: boolean
}

export declare const TYPES: Record<string, MaskTypeMeta>
export declare const TYPE_ORDER: string[]
export declare const MODES: MaskMode[]
export declare const DEFAULT_SETTINGS: {
  types: Record<string, { on?: boolean; mode?: MaskMode }>
  structural: boolean
  csv: boolean
  cnameAggressive: boolean
  ipv4KeepPrivate: boolean
  customRules: CustomRule[]
  maxFileKB: number
}

export declare function scanText(text: string, opts?: MaskOptions): ScanHit[]
export declare function maskText(text: string, opts?: MaskOptions): MaskResult
export declare function restoreText(text: string, entries: LedgerEntry[]): { output: string; replaced: number }
export declare function displayPreview(original: string, type?: string): string
export declare function genSalt(): string
export declare function luhnValid(digits: string): boolean
export declare function idcardValid(s: string): boolean
export declare function phoneValid(s: string): boolean
export declare function usccValid(s: string): boolean
export declare function ipv4Valid(s: string): boolean
export declare function ipv4Private(s: string): boolean
export declare function plateValid(s: string): boolean
export declare function splitCsvLine(line: string): { text: string; quoted: boolean; start: number }[]
export declare function detectCsvHeader(lines: string[]): Map<number, string> | null
export declare function keyTypeOf(key: string): { keys: string[]; type: string } | null
