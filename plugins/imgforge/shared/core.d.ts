/**
 * shared/core.js 的 TypeScript 声明（面板 bundle 类型口径；实现以 core.js 为唯一真相）
 */
export declare const SUPPORTED_SCAN_EXTS: string[]
export declare const TRANSFORM_TARGETS: string[]
export declare const DEFAULT_QUALITY: Record<string, number>
export declare const BISECTABLE: Record<string, boolean>
export declare function extToFormat(ext: string): string | null
export declare function formatToExt(fmt: string): string | null
export declare function imageKind(bytes: Uint8Array): string | null
export interface ExifInfo { make?: string, model?: string, dateTime?: string, software?: string }
export declare function exifOf(bytes: Uint8Array): { hasGps: boolean | null, exif: ExifInfo }
export declare function tiffHasGps(buf: Uint8Array): boolean | null
export declare function tiffIfd0Ascii(buf: Uint8Array): ExifInfo
export declare function jpegExifTiff(buf: Uint8Array): Uint8Array | null
export declare function pngExifTiff(buf: Uint8Array): Uint8Array | null
export declare function webpExifTiff(buf: Uint8Array): Uint8Array | null
export interface ImgforgeSettings {
  outDir: string
  concurrency: number
  maxBatch: number
  maxFileMB: number
  historyCap: number
}
export declare function normalizeSettings(raw: unknown): ImgforgeSettings
export interface ImgforgePipeline {
  format: 'keep' | 'webp' | 'jpeg' | 'png' | 'avif' | 'tiff'
  quality: number | null
  maxWidth: number | null
  maxHeight: number | null
  targetKB: number | null
  stripMetadata: boolean
}
export declare function normalizePipeline(raw: unknown): ImgforgePipeline
export declare function pipelineLabel(p: ImgforgePipeline): string
export declare function sanitizeStem(name: string): string
export declare function pickOutputName(dir: string, stem: string, ext: string, existsFn: (p: string) => boolean): string
export declare function guardAbsolute(p: string, label: string): string
export declare function formatBytes(n: number): string
