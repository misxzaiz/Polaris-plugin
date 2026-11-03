/**
 * CSV 检查台 core 契约声明（shared/csv-core.js 的类型面）
 *
 * 除 allowJs 推断外给面板一份显式契约：失败分支与成功分支同形
 * （ok/error 区分，stats 永不为 null），Panel 无需再防收窄。
 */
export interface CsvIssue {
  severity: 'error' | 'warn' | 'info'
  type: string
  line?: number
  field?: number
  message: string
}

export interface CsvStats {
  dataRows: number
  cols: number
  quotedFields: number | null
  emptyLines: number
  hadBom: boolean
  lineEndings: { crlf: number; lf: number; cr: number }
  totalLines: number
}

export interface ParseResult {
  ok: boolean
  error?: string
  rows: string[][]
  header: string[]
  delimiter: string
  issues: CsvIssue[]
  stats: CsvStats
  hasError?: boolean
}

export interface DelimiterGuess {
  counts: Record<string, number>
  detected: string
}

export interface ColumnInfo {
  name: string
  index: number
  inferred: 'int' | 'float' | 'bool' | 'date' | 'string' | 'mixed' | 'empty'
  distribution: Record<string, number>
  empties: number
  min?: number | null
  max?: number | null
  sum?: number
}

export interface InferResult {
  ok: boolean
  error?: string
  columns: ColumnInfo[]
}

export interface RenameNote { index: number; from: string; to: string }

export interface ConvertResult {
  ok: boolean
  error?: string
  output: string
  renamed?: RenameNote[]
}

export function detectDelimiter(text: string): DelimiterGuess
export function parseCsv(text: string, opts?: { delimiter?: string }): ParseResult
export function classifyValue(v: string): 'int' | 'float' | 'bool' | 'date' | 'string' | 'empty'
export function inferColumns(rows: string[][]): InferResult
export function dedupeHeader(header: string[]): { names: string[]; renamed: RenameNote[] }
export function toJson(rows: string[][], mode: 'records' | 'rows'): ConvertResult
export function toSql(rows: string[][], opts?: { tableName?: string }): ConvertResult
export function toMarkdown(rows: string[][]): ConvertResult
export function serialize(rows: string[][]): ConvertResult
export function renderParseReport(r: ParseResult): string
export function renderInferReport(inf: InferResult): string
