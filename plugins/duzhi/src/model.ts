/**
 * 通信层 + 数据访问（消费账单面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与 MCP server 读写
 * 同一个 cap.kv 的 duzhi.* 键空间（无后台服务，解析与透视全部 shared/core 现算）。
 *
 * 键空间契约（与 mcp/server.js 两方一致，权威描述见 README）：
 *   duzhi.month.<YYYY-MM>(#n 分片)  月桶分片，每片 ≤ core.SHARD_CAP 笔（面板/MCP 直写）
 *   duzhi.import.<id>               导入批次（面板/MCP 直写）
 *   duzhi.rules                     分类关键词规则（面板/MCP 直写）
 *   duzhi.cat.<txnId>               单笔分类覆盖（面板/MCP 直写）
 *
 * 账单导入/撤销与 mcp/server.js 同一算法（core.union 归并 + 整月分片重排），
 * 两边实现只差 kv 通道；并发双写存在 lost-update 窗口，以重导幂等补齐为恢复口径。
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet } from './host'

export type Txn = core.Txn
export type ImportBatch = core.ImportBatch
export type Rule = core.Rule
export type AggregateResult = core.AggregateResult
export type MonthBucket = core.MonthBucket

export const PREFIX = 'duzhi.'
export const K = {
  rules: core.RULES_KEY,
  monthBase: (ym: string) => core.monthKeyBase(ym),
  monthShard: (ym: string, part: number) => core.monthShardKey(ym, part),
  import: (id: string) => `${core.IMPORT_PREFIX}${id}`,
  importPrefix: core.IMPORT_PREFIX,
  cat: (txnId: string) => `${core.CAT_PREFIX}${txnId}`,
  catPrefix: core.CAT_PREFIX,
}

export interface DuizhiData {
  txns: Txn[]
  imports: ImportBatch[]
  rules: Rule[]
  overrides: Record<string, { cat: string }>
}

export interface CacheState {
  knownKeys: Set<string> | null
  fullAt: number
  vals: Map<string, unknown>
}
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, vals: new Map() }
}

const FULL_REFRESH_MS = 90 * 1000
const ENTITY_PREFIXES = [core.MONTH_PREFIX, core.IMPORT_PREFIX, core.CAT_PREFIX]

/** 一轮数据装载（键集 diff + 90s 全量兜底；规则每轮必拉） */
export async function loadDuizhi(cache: CacheState): Promise<DuizhiData> {
  const keys = await kvKeys()
  const now = Date.now()
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS
  if (full) {
    cache.vals.clear()
    cache.fullAt = now
  }
  const keySet = new Set(keys)
  for (const k of [...cache.vals.keys()]) {
    if (!keySet.has(k)) cache.vals.delete(k)
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)))
  const todo = entityKeys.filter((k) => full || !cache.vals.has(k))
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet<Record<string, unknown>>(k).catch(() => null)
      return { k, v }
    }))
    for (const { k, v } of fetched) {
      if (v && typeof v === 'object') cache.vals.set(k, v)
      else if (!v) cache.vals.delete(k)
    }
  }
  cache.knownKeys = keySet

  // 月桶：按 ym 聚合分片（缓存里可能是旧分片布局——整月重排后旧 part 键已删，
  // 键集 diff 会把它们清掉；合并时按当前键集取值防串月）
  const byYm = new Map<string, Txn[]>()
  for (const k of entityKeys) {
    if (!k.startsWith(core.MONTH_PREFIX)) continue
    const v = cache.vals.get(k) as MonthBucket | undefined
    if (!v || !Array.isArray(v.txns)) continue
    const rest = k.slice(core.MONTH_PREFIX.length)
    const ym = rest.includes('#') ? rest.slice(0, rest.indexOf('#')) : rest
    if (!byYm.has(ym)) byYm.set(ym, [])
    for (const t of v.txns) {
      if (t && typeof t.id === 'string' && typeof t.amountFen === 'number' && core.monthKeyOf(t.date) === ym) {
        byYm.get(ym)!.push(t as Txn)
      }
    }
  }
  const txns: Txn[] = []
  for (const [, list] of byYm) {
    // 分片间 union 去重（防并发写产生的瞬时双份）
    const seen = new Set<string>()
    for (const t of list) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      txns.push(t)
    }
  }
  txns.sort((a, b) => (a.date < b.date ? -1 : 1))

  const imports = ([...cache.vals.entries()] as [string, unknown][])
    .filter(([k]) => k.startsWith(K.importPrefix))
    .map(([, v]) => v as ImportBatch)
    .filter((v) => v && typeof v.id === 'string')
    .sort((a, b) => (a.at < b.at ? 1 : -1))
  const overrides: Record<string, { cat: string }> = {}
  for (const [k, v] of cache.vals.entries()) {
    if (k.startsWith(K.catPrefix) && v && typeof (v as { cat?: unknown }).cat === 'string') {
      overrides[k.slice(K.catPrefix.length)] = v as { cat: string }
    }
  }
  const rulesRaw = await kvGet<unknown>(K.rules).catch(() => null)
  const rules = core.normalizeRules(rulesRaw).rules
  return { txns, imports, rules, overrides }
}

// ── 导入（浏览器本地解析，与 MCP 同一 core 口径）─────────────────────────────
export interface ImportPreview {
  source: 'wechat' | 'alipay'
  rows: number
  span: string
  inFen: number
  outFen: number
  refundFen: number
  csvName: string
  fileName: string
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  if (typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer))
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsArrayBuffer(file)
  })
}

/** 解析（不写库）：给导入 Tab 预览用 */
export async function previewImport(file: File, password?: string): Promise<ImportPreview> {
  const bytes = await fileToBytes(file)
  const parsed = await core.parseBillFile(bytes, { password })
  const txns = core.buildTxns(parsed.rows, parsed.source, 'preview', new Date().toISOString())
  const sums = txns.reduce((acc, t) => {
    if (core.isRefundRow(t)) acc.refundFen += t.amountFen
    else if (t.dir === 'in') acc.inFen += t.amountFen
    else if (t.dir === 'out') acc.outFen += t.amountFen
    return acc
  }, { inFen: 0, outFen: 0, refundFen: 0 })
  const dates = txns.map((t) => core.dayOf(t.date)).sort()
  return {
    source: parsed.source, rows: txns.length,
    span: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '',
    inFen: sums.inFen, outFen: sums.outFen, refundFen: sums.refundFen,
    csvName: parsed.csvName || '', fileName: file.name,
  }
}

/** 真正导入：解析 → 归并月桶 → 写批次。返回 {added, dup}；全部重复时不落批次。 */
export async function confirmImport(cache: CacheState, file: File, password?: string): Promise<ImportBatch> {
  const bytes = await fileToBytes(file)
  const parsed = await core.parseBillFile(bytes, { password })
  const at = new Date().toISOString()
  const importId = core.newImportId(`${file.name}|${file.size}`)
  const txns = core.buildTxns(parsed.rows, parsed.source, importId, at)

  const allKeys = await kvKeys()
  const byMonth = core.groupByMonth(txns)
  let added = 0
  let dup = 0
  const fresh: Txn[] = []
  for (const { ym, txns: incoming } of byMonth) {
    const existing = await readMonthTxns(allKeys, ym)
    const merged = core.mergeTxns(existing, incoming)
    await writeMonthShards(allKeys, ym, merged.all)
    added += merged.added.length
    dup += merged.dup
    fresh.push(...merged.added)
  }
  if (added === 0) {
    throw new Error(`全部 ${txns.length} 笔都与已有记录重复，没有写入任何新数据`)
  }
  const sums = fresh.reduce((acc, t) => {
    if (core.isRefundRow(t)) acc.refundFen += t.amountFen
    else if (t.dir === 'in') acc.inFen += t.amountFen
    else if (t.dir === 'out') acc.outFen += t.amountFen
    return acc
  }, { inFen: 0, outFen: 0, refundFen: 0 })
  const dates = fresh.map((t) => core.dayOf(t.date)).sort()
  const batch: ImportBatch = {
    id: importId, src: parsed.source, file: file.name, csvName: parsed.csvName || '',
    rows: txns.length, newCount: added, dupCount: dup,
    inFen: sums.inFen, outFen: sums.outFen, refundFen: sums.refundFen,
    span: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '', at,
  }
  await kvSet(K.import(importId), batch)
  cache.knownKeys = null // 下轮强制全量
  return batch
}

async function readMonthTxns(allKeys: string[], ym: string): Promise<Txn[]> {
  const shardKeys = core.monthShardKeys(allKeys, ym)
  const txns: Txn[] = []
  for (const k of shardKeys) {
    const v = await kvGet<MonthBucket>(k).catch(() => null)
    if (v && Array.isArray(v.txns)) {
      for (const t of v.txns) {
        if (t && typeof t.id === 'string' && typeof t.amountFen === 'number') txns.push(t as Txn)
      }
    }
  }
  return txns
}

async function writeMonthShards(allKeys: string[], ym: string, txns: Txn[]): Promise<void> {
  const shards = core.packShards(txns)
  const oldKeys = core.monthShardKeys(allKeys, ym)
  for (let i = shards.length; i < oldKeys.length; i++) await kvDel(oldKeys[i])
  for (const s of shards) {
    await kvSet(K.monthShard(ym, s.part), { v: 1, part: s.part, txns: s.txns })
  }
}

/** 撤销导入批次：移除该批次交易 + 批次键 + 其分类覆盖 */
export async function forgetImport(cache: CacheState, importId: string): Promise<number> {
  const allKeys = await kvKeys()
  const batchKeys = allKeys.filter((k) => k.startsWith(core.MONTH_PREFIX))
  const yms = [...new Set(batchKeys.map((k) => {
    const rest = k.slice(core.MONTH_PREFIX.length)
    return rest.includes('#') ? rest.slice(0, rest.indexOf('#')) : rest
  }))]
  let removed = 0
  const removedIds: string[] = []
  for (const ym of yms) {
    const txns = await readMonthTxns(allKeys, ym)
    const gone = txns.filter((t) => t.importId === importId)
    if (gone.length) {
      const r = core.removeByImport(txns, importId)
      await writeMonthShards(allKeys, ym, r.keep)
      removed += r.removed
      for (const t of gone) removedIds.push(t.id)
    }
  }
  await kvDel(K.import(importId))
  // 该批次的单笔分类覆盖一并清理
  for (const id of removedIds) await kvDel(K.cat(id)).catch(() => {})
  cache.knownKeys = null
  return removed
}

// ── 分类 / 规则 ──────────────────────────────────────────────────────────────
export async function saveOverride(cache: CacheState, txnId: string, cat: string): Promise<void> {
  const c = cat.trim()
  if (!c) throw new Error('分类名不能为空')
  await kvSet(K.cat(txnId), { cat: c })
  cache.knownKeys = null
}
export async function saveRules(rules: Rule[]): Promise<Rule[]> {
  const norm = core.normalizeRules({ rules })
  await kvSet(K.rules, norm)
  return norm.rules
}

// ── 派生（core 现算，与 MCP 同源）────────────────────────────────────────────
export function aggregateOf(data: DuizhiData, month: string): AggregateResult {
  const scoped = month
    ? data.txns.filter((t) => core.monthKeyOf(t.date) === month)
    : data.txns
  return core.aggregate(scoped, { userRules: data.rules, overrides: data.overrides })
}
export function filterTxnsOf(data: DuizhiData, q: core.QuerySpec): Txn[] {
  return core.filterTxns(data.txns, { ...q, userRules: data.rules, overrides: data.overrides })
}
export function categoriesOf(data: DuizhiData): string[] {
  const agg = core.aggregate(data.txns, { userRules: data.rules, overrides: data.overrides })
  return agg.categories.map((c) => c.cat)
}

// ── 导出 ────────────────────────────────────────────────────────────────────
export function exportCsvOf(data: DuizhiData): string {
  return core.exportCsv(data.txns, data.rules, data.overrides)
}
export function exportJsonOf(data: DuizhiData): string {
  return JSON.stringify({
    kind: 'duzhi-export', version: 1, exportedAt: new Date().toISOString(),
    txns: data.txns, imports: data.imports, rules: data.rules, overrides: data.overrides,
  }, null, 2)
}
export function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 清空全部消费账单数据（设置里的危险操作，二次确认后调用） */
export async function wipeAll(cache: CacheState): Promise<number> {
  const keys = await kvKeys()
  const mine = keys.filter((k) => k.startsWith(PREFIX))
  for (const k of mine) await kvDel(k).catch(() => {})
  cache.knownKeys = null
  return mine.length
}
