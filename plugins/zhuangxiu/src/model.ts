/**
 * 通信层 + 数据访问（装修台账面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与 MCP server 读写同一个 cap.kv 的
 * zhuangxiu.* 键空间。零外网、零服务进程（预算对比/增项/漏项/小结全部走
 * shared/core 纯函数现算）。
 *
 * 键空间契约（与 mcp/server.js 双方一致，权威描述见 README）：
 *   zhuangxiu.project   单项目对象
 *   zhuangxiu.cat.<id>  科目（isExtra=true 即增项科目）
 *   zhuangxiu.exp.<id>  支出
 *   zhuangxiu.ven.<id>  供应商
 *   zhuangxiu.mile.<id> 工期节点
 */
import * as core from '../shared/core'
import type { Category, Expense, Milestone, Project, Vendor } from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet } from './host'

export type { Category, Expense, Milestone, Project, Vendor }
export const GROUPS = core.GROUPS
export const TEMPLATE = core.TEMPLATE

export const PREFIX = 'zhuangxiu.'
export const K = {
  project: `${PREFIX}project`,
  cat: (id: string) => `${PREFIX}cat.${id}`,
  catPrefix: `${PREFIX}cat.`,
  exp: (id: string) => `${PREFIX}exp.${id}`,
  expPrefix: `${PREFIX}exp.`,
  ven: (id: string) => `${PREFIX}ven.${id}`,
  venPrefix: `${PREFIX}ven.`,
  mile: (id: string) => `${PREFIX}mile.${id}`,
  milePrefix: `${PREFIX}mile.`,
}

export interface ZxData {
  project: Project | null
  cats: Category[]        // group→order 排序
  exps: Expense[]         // ts 升序
  vens: Vendor[]          // createdAt 升序
  miles: Milestone[]      // date 升序
  at: number
}

interface CacheVal { project: Project | null; map: Map<string, unknown> }
export interface CacheState { knownKeys: Set<string> | null; fullAt: number; val: CacheVal }
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, val: { project: null, map: new Map() } }
}

const FULL_REFRESH_MS = 90 * 1000

/** 一轮数据装载（键集 diff + 90s 全量兜底；每记录一键，增量拉取） */
export async function loadZx(cache: CacheState): Promise<ZxData> {
  const keys = await kvKeys()
  const now = Date.now()
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS
  if (full) {
    cache.val.map.clear()
    cache.val.project = null
    cache.fullAt = now
  }
  const keySet = new Set(keys)
  for (const k of [...cache.val.map.keys()]) if (!keySet.has(k)) cache.val.map.delete(k)
  if (cache.val.project && !keySet.has(K.project)) cache.val.project = null

  const prefixes = [K.catPrefix, K.expPrefix, K.venPrefix, K.milePrefix]
  const todo = keys.filter((k) => prefixes.some((p) => k.startsWith(p)) && (full || !cache.val.map.has(k)))
  if (todo.length) {
    const vals = await Promise.all(todo.map(async (k) => ({ k, v: await kvGet<unknown>(k).catch(() => null) })))
    for (const { k, v } of vals) {
      if (v && typeof v === 'object' && (v as { id?: string }).id) cache.val.map.set(k, v)
      else cache.val.map.delete(k)
    }
  }
  if (full || cache.val.project === null) {
    if (keySet.has(K.project)) {
      const p = await kvGet<Project>(K.project).catch(() => null)
      if (p && typeof p === 'object' && p.id) cache.val.project = p
    }
  }
  cache.knownKeys = keySet

  const cats: Category[] = []
  const exps: Expense[] = []
  const vens: Vendor[] = []
  const miles: Milestone[] = []
  for (const [k, v] of cache.val.map) {
    if (k.startsWith(K.catPrefix)) cats.push(v as Category)
    else if (k.startsWith(K.expPrefix)) exps.push(v as Expense)
    else if (k.startsWith(K.venPrefix)) vens.push(v as Vendor)
    else if (k.startsWith(K.milePrefix)) miles.push(v as Milestone)
  }
  cats.sort((a, b) => core.GROUPS.indexOf(a.group) - core.GROUPS.indexOf(b.group) || a.order - b.order || a.createdAt - b.createdAt)
  exps.sort((a, b) => a.ts - b.ts)
  vens.sort((a, b) => a.createdAt - b.createdAt)
  miles.sort((a, b) => (core.parseDayKey(a.date) || 0) - (core.parseDayKey(b.date) || 0))
  return { project: cache.val.project, cats, exps, vens, miles, at: now }
}

// ── 写动作（全部过 core.normalize* 唯一口径）──────────────────────────────────
export async function saveProject(input: Record<string, unknown>, existing: Project | null): Promise<Project> {
  const r = core.normalizeProject(input, existing)
  if (r.error || !r.project) throw new Error(r.error || '项目档案非法')
  await kvSet(K.project, r.project)
  return r.project
}

export async function saveCategory(input: Record<string, unknown>, existing: Category | null): Promise<Category> {
  const r = core.normalizeCategory(input, existing)
  if (r.error || !r.cat) throw new Error(r.error || '科目非法')
  await kvSet(K.cat(r.cat.id), r.cat)
  return r.cat
}

export async function saveVendor(input: Record<string, unknown>, existing: Vendor | null): Promise<Vendor> {
  const r = core.normalizeVendor(input, existing)
  if (r.error || !r.vendor) throw new Error(r.error || '供应商非法')
  await kvSet(K.ven(r.vendor.id), r.vendor)
  return r.vendor
}

export async function saveMilestone(input: Record<string, unknown>, existing: Milestone | null): Promise<Milestone> {
  const r = core.normalizeMilestone(input, existing)
  if (r.error || !r.mile) throw new Error(r.error || '节点非法')
  await kvSet(K.mile(r.mile.id), r.mile)
  return r.mile
}

export interface ExpenseInput {
  catId: string
  amount: number
  date?: string
  time?: string
  vendorId?: string
  payMethod?: string
  note?: string
  id?: string
}

export async function saveExpense(input: ExpenseInput, existing: Expense | null): Promise<Expense> {
  const r = core.normalizeExpense({ ...input, src: 'panel' }, existing)
  if (r.error || !r.expense) throw new Error(r.error || '支出非法')
  await kvSet(K.exp(r.expense.id), r.expense)
  return r.expense
}

export async function deleteKey(key: string): Promise<void> {
  await kvDel(key)
}

/** 一键采用标准科目模板（跳过同名，返回新建数） */
export async function applyTemplate(existing: Category[]): Promise<number> {
  const have = new Set(existing.map((c) => c.name))
  let created = 0
  let order = existing.length
  for (const item of core.TEMPLATE) {
    if (have.has(item.name)) continue
    const r = core.normalizeCategory({ name: item.name, group: item.group, order: order++ }, null)
    if (r.error || !r.cat) continue
    // eslint-disable-next-line no-await-in-loop
    await kvSet(K.cat(r.cat.id), r.cat)
    created += 1
  }
  return created
}

/** 导出全量 JSON（数据所有权） */
export function exportAll(data: ZxData): string {
  return JSON.stringify({
    app: 'zhuangxiu',
    exportedAt: new Date().toISOString(),
    project: data.project,
    cats: data.cats,
    exps: data.exps,
    vens: data.vens,
    miles: data.miles,
  }, null, 2)
}
