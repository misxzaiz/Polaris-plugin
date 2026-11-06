/** shared/core.js 的类型声明（零依赖 CJS 单一权威，与实现同步维护） */
export interface OfficeStats {
  paragraphs?: number
  tables?: number
  images?: number
  footnotes?: number
  slides?: number
  rows?: number
  cols?: number
  formulas?: number
  words?: number
  cjk?: number
  chars?: number
  ms?: number
}
export interface ExtractResult {
  format: 'docx' | 'xlsx' | 'pptx'
  markdown: string
  warnings: string[]
  stats: OfficeStats
  sheets?: string[]
  sheetName?: string
}
export interface OutlineResult {
  format: 'docx' | 'xlsx' | 'pptx'
  text: string
  stats?: OfficeStats
}
export declare const LIMITS: {
  MAX_FILE_BYTES: number
  MAX_OUTPUT_CHARS: number
  [k: string]: number
}
export declare function sniffFormat(bytes: Uint8Array): 'zip' | 'ole' | 'pdf' | 'unknown'
export declare function countWords(text: string): { cjk: number; latin: number; total: number }
export declare function extractAuto(
  bytes: Uint8Array,
  opts?: { sheet?: string; csv?: boolean },
): Promise<ExtractResult>
export declare function outlineAuto(bytes: Uint8Array): Promise<OutlineResult>
export declare function matrixToCsv(matrix: string[][]): string
export declare function openZip(
  bytes: Uint8Array,
  log?: (msg: string) => void,
): Promise<{ names: string[]; read: (name: string) => Promise<Uint8Array | null> }>
