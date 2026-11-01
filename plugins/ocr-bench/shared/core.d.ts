/** shared/core.js 的类型声明（面板侧 import 用；与 JS 实现同源维护） */
export declare const VERSION: string
export declare const PLUGIN_ID: string
export declare const PREFIX: string
export declare const NATIVE_TEXT_THRESHOLD: number
export declare const LIMITS: {
  maxFilesPerJob: { min: number; max: number; default: number }
  maxPdfPages: { min: number; max: number; default: number }
  maxImageBytes: number
  maxImageEdge: number
  maxOutTextBytes: number
  textHeadBytes: number
  reportTextBudget: number
  historyMax: number
  keepReports: number
  workerCount: number
  pageTimeoutMs: number
  jobIdleTimeoutMs: number
}
export declare const LANGS: { code: string; name: string; builtin: boolean }[]
export declare const PSM_OPTIONS: { value: number; label: string }[]
export declare function isPathInside(child: string, parent: string): boolean
export declare function maskPath(p: string): string
export declare function normalizePsm(input: unknown): number
