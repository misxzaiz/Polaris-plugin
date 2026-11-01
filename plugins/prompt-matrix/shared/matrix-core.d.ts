/** shared/matrix-core.js 的类型声明（CJS，esbuild 打包进面板；运行时与服务共用同一实现） */
export declare const VERSION: string
export declare const CHECK_TYPES: string[]
export declare function maskKey(key: string | null | undefined): string
export declare function renderTemplate(tpl: string, vars: Record<string, unknown>): { text: string, warnings: string[] }
export declare function extractVars(tpl: string): string[]
export declare function parseDataset(
  jsonlText: string,
  opts?: { maxSamples?: number },
): { samples: { vars: Record<string, unknown>, checks: CheckDef[] }[], errors: { line: number, msg: string }[] }
export declare function serializeDataset(samples: { vars: Record<string, unknown>, checks?: CheckDef[] }[]): string
export declare function normalizeChecks(raw: unknown, onErr?: (msg: string) => void): CheckDef[] | null
export declare function runChecks(content: string, checks: CheckDef[]): { type: string, label?: string, pass: boolean, detail: string }[]
export declare function textDiff(a: string, b: string): { t: 'same' | 'del' | 'add', s: string }[]
export declare function aggregateRuns(
  cells: unknown[],
  variantCount: number,
): { variants: AggVariant[], totals: { cells: number, ok: number, failed: number, tokIn: number, tokOut: number } }

export interface CheckDef {
  type: string
  label?: string
  value?: unknown
}
export interface AggVariant {
  idx: number
  total: number
  ok: number
  failed: number
  checkAllPass: number
  judgeAvg: number | null
  judgeN: number
  avgMs: number
  tokIn: number
  tokOut: number
}
