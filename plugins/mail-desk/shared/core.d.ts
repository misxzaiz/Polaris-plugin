/** shared/core.js 的类型声明(面板 TS 引用;真相在 core.js,两处字段须同步) */
export declare const VERSION: string
export declare const K: { settings: string; service: string; meta: string; selftest: string }
export declare const LIMITS: {
  maxMailCount: number
  maxTotalBytes: number
  maxSingleMailBytes: number
  maxAttachmentB64: number
  maxRawPreviewBytes: number
}
export declare const DEFAULTS: { httpPort: number; smtpPort: number; httpProbe: number; smtpProbe: number }
export declare function mailMatches(mail: { subject?: string; fromText?: string; toText?: string; textPreview?: string }, query: string): boolean
export declare function pageArgs(query: unknown, offset: unknown, limit: unknown): { query: string; offset: number; limit: number }
export declare function filterRemoteResources(html: string, allowRemote: boolean): { html: string; blocked: number }
export declare function isLocalUrl(url: string): boolean
export declare function extractCodes(text: string): string[]
export declare const CODE_KEYWORDS: string[]
export declare function evictPlan(items: Array<{ id: string; sizeBytes: number }>, maxCount: number, maxBytes: number): string[]
