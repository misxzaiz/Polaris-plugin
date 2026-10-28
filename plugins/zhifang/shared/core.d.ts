/** shared/core.js 的类型声明（零依赖 CJS 单一权威，与实现同步维护） */
export interface ZhifangSettings {
  outDir: string
  maxUploadMB: number
  historyCap: number
}
export interface CheckedInput {
  name: string
  stem: string
  ext: string
  size: number
  index: number
}
export declare function parsePageSpec(
  spec: string | number | number[],
  pageCount: number,
  opts?: { mode?: 'ordered' | 'set' },
): number[]
export declare function compactRanges(pages: number[]): string
export declare function sanitizeStem(name: unknown): string
export declare function pickOutputName(
  dir: string,
  stem: string,
  ext: string,
  existsSync: (p: string) => boolean,
): string
export declare function joinPath(dir: string, name: string): string
export declare function isPdfBytes(buf: Uint8Array): boolean
export declare function imageKind(buf: Uint8Array): 'jpg' | 'png' | null
export declare function validateInputs(
  files: Array<{ name: string, size: number }>,
  limits: { maxBytes: number, kind: 'pdf' | 'image' },
): CheckedInput[]
export declare function normalizeSettings(raw: unknown): ZhifangSettings
export declare function normalizeAngle(angle: unknown): number
export declare function formatBytes(n: number): string
