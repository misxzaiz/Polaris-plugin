/**
 * 通信层 + 数据访问（贷款台账面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与 MCP server 读写
 * 同一个 cap.kv 的 quanfu.* 键空间（无后台服务，派生一律 shared/core 现算）。
 *
 * 键空间契约（与 mcp/server.js 两方一致，权威描述见 README）：
 *   quanfu.loan.<id>   贷款（面板/MCP 直写）
 *   quanfu.ev.<occKey> 事件 type|loanId|date（面板/MCP 直写，幂等覆盖）
 *   quanfu.settings    设置（面板写）
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet } from './host'

export type Loan = core.Loan
export type LoanEvent = core.LoanEvent
export type Settings = core.Settings
export type LoanState = core.LoanState
export type WhatifResult = core.WhatifResult
export type YearRow = core.YearRow

export const PREFIX = 'quanfu.'
export const K = {
  loan: (id: string) => `${PREFIX}loan.${id}`,
  loanPrefix: `${PREFIX}loan.`,
  ev: (occKey: string) => `${PREFIX}ev.${occKey}`,
  evPrefix: `${PREFIX}ev.`,
  settings: `${PREFIX}settings`,
}

export interface QuanData {
  loans: Loan[]
  events: LoanEvent[]
  settings: Settings
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
const ENTITY_PREFIXES = [K.loanPrefix, K.evPrefix]

/** 一轮数据装载（键集 diff + 90s 全量兜底；设置每轮必拉） */
export async function loadQuan(cache: CacheState): Promise<QuanData> {
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

  const collect = <T>(prefix: string): T[] =>
    ([...cache.vals.entries()] as [string, unknown][])
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v as T)
  const loans = collect<Loan>(K.loanPrefix)
    .filter((v) => v && typeof v.id === 'string')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const events = collect<LoanEvent>(K.evPrefix)
    .filter((v) => v && typeof v.occKey === 'string')

  const settingsRaw = await kvGet<Partial<Settings>>(K.settings).catch(() => null)
  return { loans, events, settings: core.normalizeSettings(settingsRaw) }
}

// ── 派生（core 现算，与 MCP 同源）────────────────────────────────────────────
export function stateOf(data: QuanData, loan: Loan, now: number): LoanState {
  return core.loanState(loan, eventsOf(data, loan.id), now)
}
export function eventsOf(data: QuanData, loanId: string): LoanEvent[] {
  return data.events
    .filter((e) => e.loanId === loanId)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ── 写动作（全部先过 core.normalize* 唯一口径）───────────────────────────────
export async function saveLoan(input: Record<string, unknown>, existing: Loan | null): Promise<Loan> {
  const r = core.normalizeLoan(input, existing)
  if (r.error || !r.loan) throw new Error(r.error || '参数不合法')
  await kvSet(K.loan(r.loan.id), r.loan)
  return r.loan
}
export async function saveEvent(input: Record<string, unknown>): Promise<LoanEvent> {
  const r = core.normalizeEvent(input, null)
  if (r.error || !r.ev) throw new Error(r.error || '参数不合法')
  await kvSet(K.ev(r.ev.occKey), r.ev)
  return r.ev
}
export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}
export async function deleteLoan(id: string, data: QuanData): Promise<number> {
  const evKeys = data.events.filter((e) => e.loanId === id).map((e) => K.ev(e.occKey))
  for (const k of evKeys) await kvDel(k)
  await kvDel(K.loan(id))
  return evKeys.length
}
export async function deleteEvent(occKey: string): Promise<void> {
  await kvDel(K.ev(occKey))
}

/** 导出：贷款 + 全部事件 + 设置（JSON，导入走 settings Tab） */
export function exportAll(data: QuanData): string {
  return JSON.stringify({
    kind: 'quanfu-export', version: 1, exportedAt: new Date().toISOString(),
    loans: data.loans, events: data.events, settings: data.settings,
  }, null, 2)
}
/** 导入：合并判重（同 id / 同 occKey 跳过），返回写入数量 */
export async function importAll(json: string): Promise<{ loans: number; events: number }> {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('不是合法 JSON') }
  const p = parsed as { kind?: string; loans?: Loan[]; events?: LoanEvent[]; settings?: Settings }
  if (!p || p.kind !== 'quanfu-export' || !Array.isArray(p.loans) || !Array.isArray(p.events)) {
    throw new Error('不是贷款台账导出文件（缺 kind: quanfu-export）')
  }
  let nLoan = 0
  let nEv = 0
  for (const raw of p.loans) {
    const r = core.normalizeLoan(raw as unknown as Record<string, unknown>, null)
    if (r.error || !r.loan) continue
    await kvSet(K.loan(r.loan.id), r.loan)
    nLoan++
  }
  for (const raw of p.events) {
    const r = core.normalizeEvent(raw as unknown as Record<string, unknown>, null)
    if (r.error || !r.ev) continue
    await kvSet(K.ev(r.ev.occKey), r.ev)
    nEv++
  }
  if (p.settings && typeof p.settings === 'object') await kvSet(K.settings, core.normalizeSettings(p.settings))
  return { loans: nLoan, events: nEv }
}
