/** 消费账单 shared/core.js 的类型声明（面板 tsc strict 用；与 core.js 保持同步） */
export declare const SHARD_CAP: number
export declare const MONTH_PREFIX: string
export declare const IMPORT_PREFIX: string
export declare const CAT_PREFIX: string
export declare const RULES_KEY: string
export declare const DIRS: string[]
export declare const DIR_NAMES: Record<string, string>
export declare const DEFAULT_RULES: { kw: string; cat: string }[]
export declare const MAX_FILE_BYTES: number

export interface RawTxn {
  src: 'alipay' | 'wechat'
  date: string
  dir: 'in' | 'out' | 'neutral'
  type: string
  name: string
  item: string
  amountFen: number
  refundFen: number
  status: string
  method: string
  tradeNo: string
  mOrderNo: string
  note: string
}

export interface Txn extends RawTxn {
  id: string
  importId: string
  at: string
}

export interface MonthBucket {
  v: number
  part: number
  txns: Txn[]
}

export interface ImportBatch {
  id: string
  src: 'alipay' | 'wechat'
  file: string
  csvName?: string
  rows: number
  newCount: number
  dupCount: number
  inFen: number
  outFen: number
  refundFen: number
  span: string
  at: string
}

export interface Rule {
  kw: string
  cat: string
}

export type RuleSet = { rules: Rule[] }
export type CatOverrides = Record<string, { cat: string }>

export declare function crc32Of(bytes: Uint8Array): number
export declare function zipCryptoDecrypt(data: Uint8Array, password: string): Uint8Array
export declare function unzip(bytes: Uint8Array, opts?: { password?: string }): Promise<{ name: string; bytes: Uint8Array; encrypted: boolean }[]>
export declare function inflateRawAsync(bytes: Uint8Array): Promise<Uint8Array>
export declare function decodeBillText(bytes: Uint8Array): string
export declare function parseCsv(text: string): string[][]
export declare function detectSource(text: string): 'wechat' | 'alipay' | null
export declare function moneyToFen(raw: unknown): number | null
export declare function fenToYuan(fen: number): string
export declare function normDate(raw: unknown): string | null
export declare function monthKeyOf(date: string): string
export declare function dayOf(date: string): string
export declare function newImportId(seed?: string): string
export declare function parseWechatCsv(text: string): RawTxn[]
export declare function parseAlipayCsv(text: string): RawTxn[]
export declare function parseBillFile(bytes: Uint8Array, opts?: { password?: string }): Promise<{
  source: 'wechat' | 'alipay'
  rows: RawTxn[]
  csvName: string
}>
export declare function isRefundRow(t: { src: string; type: string }): boolean
export declare function buildTxns(rawRows: RawTxn[], source: 'wechat' | 'alipay', importId: string, at: string): Txn[]
export declare function txnIdOf(t: RawTxn): string
export declare function groupByMonth(txns: Txn[]): { ym: string; txns: Txn[] }[]
export declare function mergeTxns(existing: Txn[], incoming: Txn[]): { all: Txn[]; added: Txn[]; dup: number }
export declare function packShards(txns: Txn[]): MonthBucket[]
export declare function monthShardKeys(allKeys: string[], ym: string): string[]
export declare function monthKeyBase(ym: string): string
export declare function monthShardKey(ym: string, part: number): string
export declare function removeByImport(txns: Txn[], importId: string): { keep: Txn[]; removed: number }
export declare function normalizeRules(raw: unknown): RuleSet
export declare function matchRule(t: { name: string; item: string; type: string }, rules: Rule[]): string | null
export declare function categorize(t: Txn, userRules: Rule[], overrides?: CatOverrides): string
export interface MonthAgg {
  ym: string
  inFen: number
  outFen: number
  refundFen: number
  netFen: number
  count: number
}
export interface CategoryAgg {
  cat: string
  outFen: number
  count: number
}
export interface MerchantAgg {
  name: string
  outFen: number
  count: number
}
export interface AggregateResult {
  months: MonthAgg[]
  categories: CategoryAgg[]
  merchants: MerchantAgg[]
  totals: { inFen: number; outFen: number; refundFen: number; netFen: number; count: number }
  neutralCount: number
}
export declare function aggregate(txns: Txn[], opts?: {
  userRules?: Rule[]
  overrides?: CatOverrides
  limitMerchants?: number
}): AggregateResult
export interface QuerySpec {
  keyword?: string
  category?: string
  dir?: string
  month?: string
  from?: string
  to?: string
  minFen?: number
  maxFen?: number
  userRules?: Rule[]
  overrides?: CatOverrides
}
export declare function filterTxns(txns: Txn[], q: QuerySpec): Txn[]
export declare function exportCsv(txns: Txn[], userRules: Rule[], overrides?: CatOverrides): string
export declare function csvEscape(s: unknown): string
