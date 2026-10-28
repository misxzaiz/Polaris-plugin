/** shared/render.js 的类型声明 */
import type { BookNormalized, LayoutResult } from './core'

export interface BuildMeta {
  sheets: Array<{ name: string, rows: number, cols: number }>
  cellCount: number
}
export declare function buildWorkbook(book: BookNormalized, g: LayoutResult): { workbook: unknown, meta: BuildMeta }
export declare function renderToBuffer(book: BookNormalized, g: LayoutResult): Promise<ArrayBuffer>
