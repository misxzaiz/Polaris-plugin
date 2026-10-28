/** shared/core.js 的类型声明（零依赖 CJS 单一权威，与实现同步维护） */
export interface ColumnSpec {
  h: string
  type?: 'text' | 'number' | 'int' | 'money' | 'percent' | 'date'
  fmt?: string
  formula?: string
}
export interface SheetSpec {
  name: string
  caption?: string
  columns: ColumnSpec[]
  rows: unknown[][]
  stats?: Array<{ label?: string, type?: 'sum' | 'avg' | 'count' | 'max' | 'min', cols?: number[] }>
  conditional?: Array<{ col: number, op?: string, value?: unknown, style?: 'warn' | 'good' | 'bad' }>
  zebra?: boolean
  freeze?: boolean
  autofilter?: boolean
}
export interface BookSpec {
  title: string
  theme?: string
  sheets: SheetSpec[]
}
export interface LayoutColumn {
  h: string
  type: NonNullable<ColumnSpec['type']>
  fmt: string
  align: 'left' | 'right' | 'center'
  width: number
  formula?: string
}
export interface LayoutSheet {
  name: string
  caption: string | null
  headerRow: number
  dataStart: number
  dataEnd: number
  lastRow: number
  columns: LayoutColumn[]
  rows: unknown[][]
  statsRows: Array<{ label: string, cells: unknown[] }>
  ranges: { header: string, data: string, full: string }
  conditional: Array<{ ref: string, formula: string, style: { fill: string, color: string } }>
  zebra: boolean
  freeze: boolean
  autofilter: boolean
  colCount: number
  rowCount: number
}
export interface ThemeShape {
  label: string
  headerFill: string
  headerColor: string
  zebraFill: string
  border: string
  textColor: string
  subText: string
  statsFill: string
}
export interface LayoutResult {
  theme: string
  /** 单个主题对象（= THEMES[theme]，非记录）——与 core.js 实现一致 */
  themes: ThemeShape
  sheets: LayoutSheet[]
  title: string
}
export interface BookNormalized {
  title: string
  theme: string
  sheets: SheetSpec[]
  createdAt: number
}
export interface Settings {
  schemaVersion: number
  exportDir: string
  theme: string
}
export interface FileNameResult { stamp: string, name: string, file: string }

export declare const THEMES: Record<string, { label: string }>
export declare const THEME_KEYS: string[]
export declare const TYPES: string[]
export declare const TYPE_FMT: Record<string, string>
export declare const COND_OPS: string[]
export declare const STATS_FNS: Record<string, string>
export declare const CAPS: Record<string, number>
export declare const DEFAULT_SETTINGS: Settings
export declare const K: { bookPrefix: string, book(id: string): string, settings: string }
export declare function makeId(now?: number): string
export declare function dispWidth(text: unknown): number
export declare function clampText(text: unknown, max: number): string
export declare function safeFileName(title: string, now?: number): FileNameResult
export declare function colLetter(idx: number): string
export declare function computeWidth(header: string, values: unknown[]): number
export declare function decodeTableBytes(bytes: Uint8Array): { text: string, encoding: string }
export declare function detectDelimiter(text: string): string
export declare function parseDSV(text: string, delimiter: string): { rows: string[][], errors: string[] }
export declare function inferColumnType(values: unknown[]): { type: string }
export declare function coerceCell(raw: unknown, type: string): unknown
export declare function ingestTable(text: string, opts?: { delimiter?: string }): {
  error?: string
  sheet?: SheetSpec
  warnings?: string[]
  delimiter?: string
}
export declare function normalizeBook(raw: BookSpec): { error?: string, book?: BookNormalized, warnings?: string[] }
export declare function layout(book: BookNormalized): LayoutResult
