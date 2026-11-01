/**
 * 通信层 + 数据访问（文件管家面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 fileflow.* 键空间。扫描/规划/执行/撤销的唯一写者是后台
 * 服务（service/flow.js）——面板读快照/规则/批次，写命令键并轮询结果。
 *
 * 键空间契约（与 service/flow.js、mcp/server.js 三方一致，权威描述见 README）：
 *   fileflow.meta            服务心跳（服务每 60s 写）
 *   fileflow.roots           根目录列表（服务独占写，经 cmd 修改）
 *   fileflow.rules           规则列表（服务独占写，经 cmd 修改）
 *   fileflow.settings        数值参数（服务独占写，经 cmd 修改）
 *   fileflow.snapshot        总览快照（服务写）
 *   fileflow.stats           累计统计（服务写）
 *   fileflow.plan.<id>       整理计划（服务写，24h 过期）
 *   fileflow.batch.<id>      批次日志=撤销凭据（服务写，保留 60 批）
 *   fileflow.cmd.<nonce>     命令（面板/MCP 写，服务消费删除）
 *   fileflow.result.<nonce>  命令结果（服务写，消费者删除）
 */
import { getHostInvoke } from './host'

export const VERSION = '0.1.0'

interface DispatchResponse {
  ok?: boolean
  value?: unknown
  keys?: string[]
}

async function capDispatch<T = DispatchResponse>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  return res as T
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })
  return (r.value ?? null) as T | null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r.keys ?? []
}

// ── 类型（与 service/flow.js 写入对齐）────────────────────────────────────
export interface RootInfo {
  id: string
  path: string
  label: string
  auto: 'off' | 'new' | 'all'
  watched?: boolean
  addedAt?: number
  lastRunAt?: number | null
  lastBatchId?: string | null
  lastPlanAt?: number | null
  lastPlanOps?: number | null
  issues?: string[]
}

export interface RuleMatch {
  exts: string[]
  nameRegex: string
  subDir: string
  minAgeDays: number | null
  maxAgeDays: number | null
  minSizeMB: number | null
  maxSizeMB: number | null
}

export interface RuleAction {
  type: 'move' | 'recycle' | 'dedupe' | 'rename'
  dest: string
  pattern: string
  allowOutsideRoot: boolean
}

export interface Rule {
  id: string
  name: string
  enabled: boolean
  rootId: string
  priority: number
  stopOnMatch: boolean
  match: RuleMatch
  action: RuleAction
}

export interface Snapshot {
  at: number
  version: string
  roots: RootInfo[]
  ruleCount: number
  enabledRuleCount: number
  settings?: { guardMinutes: number; maxOpsPerRun: number; watchEnabled: boolean }
  stats?: Stats
}

export interface Stats {
  filesOrganized: number
  batches: number
  lastBatchAt: number | null
}

export interface Meta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  roots?: number
  rules?: number
  watched?: string[]
}

export interface PlanOp {
  fromRel: string
  toRel: string | null
  toAbs?: string
  ruleId: string
  action: 'move' | 'recycle' | 'dedupe' | 'rename'
  safe: boolean
  why?: string
}

export interface PlanPreview {
  planId: string
  rootId: string
  counts: { entries: number; matched: number; guard: number; partial: number; hidden: number; inDest: number; noRule: number; maxOps: number; truncated?: boolean }
  ops: PlanOp[]
  opTotal: number
  safeOps: number
  outsideOps: number
  skipped: { rel: string; reason: string }[]
}

export interface BatchOp {
  fromRel: string
  toRel: string | null
  toAbs?: string
  ruleId: string
  action: string
  status: 'done' | 'gone' | 'changed' | 'locked' | 'error' | 'held' | 'conflict'
  why?: string
  how?: string
}

export interface Batch {
  v1: number
  batchId: string
  planId?: string
  undoOf?: string
  rootId: string
  rootPath: string
  at: number
  mode: 'manual' | 'auto' | 'undo'
  undoable: boolean
  ops: BatchOp[]
  summary: { total: number; done: number; failed: number; held: number; bytesMoved: number }
}

export interface FlowSettings {
  guardMinutes: number
  maxOpsPerRun: number
  dedupeMaxFiles: number
  dedupeMaxSizeMB: number
  sweepMinutes: number
  watchEnabled: boolean
}

// ── 命令信箱：写 cmd 键 → 轮询 result ─────────────────────────────────────
export async function callService<T = Record<string, unknown>>(
  type: string,
  payload?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const nonce = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
  await kvSet(`fileflow.cmd.${nonce}`, { type, payload: payload || {}, at: Date.now() })
  const deadline = Date.now() + (opts?.timeoutMs ?? 90_000)
  while (Date.now() < deadline) {
    await sleep(400)
    const r = await kvGet<{ ok: boolean; payload?: T; error?: string }>(`fileflow.result.${nonce}`).catch(() => null)
    if (r) {
      await kvDel(`fileflow.result.${nonce}`).catch(() => {})
      if (r.ok) return (r.payload || {}) as T
      throw new Error(r.error || '服务执行失败')
    }
  }
  throw new Error('服务响应超时——后台服务可能在重启或宿主桥不可达')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 数据加载 ───────────────────────────────────────────────────────────────
export interface PanelData {
  snapshot: Snapshot | null
  meta: Meta | null
  stats: Stats | null
  rules: Rule[]
}

export async function loadPanelData(): Promise<PanelData> {
  const [snapshot, meta, stats, rulesRaw] = await Promise.all([
    kvGet<Snapshot>('fileflow.snapshot'),
    kvGet<Meta>('fileflow.meta'),
    kvGet<Stats>('fileflow.stats'),
    kvGet<{ rules?: Rule[] }>('fileflow.rules'),
  ])
  return { snapshot, meta, stats, rules: (rulesRaw && rulesRaw.rules) || [] }
}

export async function loadBatches(limit = 30): Promise<Batch[]> {
  const keys = await kvKeys()
  const batchKeys = keys.filter((k) => k.startsWith('fileflow.batch.'))
  const out: Batch[] = []
  for (const k of batchKeys) {
    const b = await kvGet<Batch>(k).catch(() => null)
    if (b) out.push(b)
  }
  out.sort((a, b) => b.at - a.at)
  return out.slice(0, limit)
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export interface Toast {
  msg: string
  bad?: boolean
}

export function fmtBytes(n: number | undefined | null): string {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function fmtTime(ts: number | undefined | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ruleSummary(r: Rule): string {
  const m: string[] = []
  if (r.match.exts && r.match.exts.length) m.push(r.match.exts.map((e) => `.${e}`).join(' '))
  if (r.match.nameRegex) m.push(`名称~${r.match.nameRegex}`)
  if (r.match.minAgeDays != null) m.push(`≥${r.match.minAgeDays}天`)
  if (r.match.maxAgeDays != null) m.push(`≤${r.match.maxAgeDays}天`)
  if (r.match.minSizeMB != null) m.push(`≥${r.match.minSizeMB}MB`)
  if (r.match.maxSizeMB != null) m.push(`≤${r.match.maxSizeMB}MB`)
  if (r.match.subDir) m.push(`子目录 ${r.match.subDir}`)
  const a =
    r.action.type === 'move' ? `移到 ${r.action.dest}${r.action.allowOutsideRoot ? '（根外）' : ''}`
    : r.action.type === 'recycle' ? '移入回收站'
    : r.action.type === 'dedupe' ? '去重（保留最新）'
    : `改名 ${r.action.pattern}`
  return `${m.join('・') || '全部'} → ${a}`
}
