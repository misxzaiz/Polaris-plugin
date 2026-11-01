/** shared/core.js 的类型声明（实现见 core.js；三方同源口径） */

export const BATCH_CHAR_BUDGET: number
export const MAX_TOTAL_CHARS: number
export const CHUNK_SEGS: number

export function articleId(url: string): string
export function nowIso(): string
export function clampInt(v: unknown, lo: number, hi: number, dflt: number): number
export function sanitizeDst(dst: unknown): string | null

export function detectSrcLang(text: string): 'zh' | 'en' | 'ja' | 'ko' | 'und'
export function langLabel(code: string): string

export interface Seg {
  i: number
  src: string
  dst: string
  at?: string
}
export interface Batch {
  start: number
  end: number
  chars: number
}

export function normalizeSegments(blocks: unknown[]): Seg[]
export function planBatches(segs: Seg[], budget?: number): Batch[]
export function batchOf(batches: Batch[], n: number): Batch | null
export function mergeTranslations(
  segs: Seg[],
  items: Array<{ i: number; dst: unknown }>,
): { segs: Seg[]; applied: number; invalid: number; skipped: number }
export function translatedCount(segs: Seg[]): number
export function progressPct(segs: Seg[]): number
export function isCodeSeg(src: string): boolean
export function translatableSegs(segs: Seg[]): Seg[]
export function autoFillCodeSegs(segs: Seg[]): number

export interface IdxEntry {
  id: string
  url: string
  site: string
  title: string
  byline: string
  srcLang: string
  tgtLang: string
  segCount: number
  totalChars: number
  batches: number
  translated: number
  truncated: boolean
  addedAt: string
  updatedAt: string
}
export function idxEntry(a: Partial<IdxEntry>): IdxEntry
export function upsertIndex(idx: IdxEntry[], entry: IdxEntry): IdxEntry[]
export function removeFromIndex(idx: IdxEntry[], id: string): IdxEntry[]
export function findInIndex(idx: IdxEntry[], id: string): IdxEntry | null

export interface BlockInfo {
  kind: 'h' | 'li' | 'quote' | 'code' | 'para'
  level?: number
  body: string
}
export function classifyBlock(src: string): BlockInfo

export function chunkCount(segCount: number): number
export function chunkKey(id: string, c: number): string
export function segChunkIndex(i: number): number
export function assembleSegs(chunkArrays: unknown[]): Seg[]
export function splitChunks(segs: Seg[]): Map<number, Seg[]>

export function bilingualMarkdown(
  entry: Pick<IdxEntry, 'title' | 'url'>,
  segs: Seg[],
  mode: 'bilingual' | 'src' | 'dst',
): string
