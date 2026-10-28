/**
 * 通信层 + 插件用量/服务/治理数据访问（守望台面板）
 *
 * 计算逻辑全部复用 shared/usage-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做宿主能力 IO 与动作包装。
 *
 * 通道：window.__POLARIS_HOST_INVOKE__ → router_dispatch → cap.*
 * （cap.kv / cap.pluginDiscovery / cap.pluginServiceManager）
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   watchtower.usage.<pluginId> → UsageRecord（用量/冷热账本）
 *   watchtower.settings         → { schemaVersion: 1 }
 */
import { getHostInvoke } from './host'
import * as core from '../shared/usage-core.js'

export const K = core.K
export const TREND_WINDOWS = core.TREND_WINDOWS
export const COLD_DAYS = core.COLD_DAYS
export const SLEEP_DAYS = core.SLEEP_DAYS
export const fmtDay = core.fmtDay
export const activityOf = core.activityOf
export const activityLabel = core.activityLabel
export const aggregateWindow = core.aggregateWindow
export const costOf = core.costOf

// ── 类型（与 core 输出对齐）────────────────────────────────────────────────
export interface UsageRecord {
  pluginId: string
  count: number
  panelOpens: number
  firstUsed: number | null
  lastUsed: number | null
  trends: Record<string, { mcp: number; panel: number }>
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  builtin: boolean
  enabledByDefault: boolean
  installPath: string
  contributes: Record<string, unknown>
  origin: Record<string, unknown>
  source: Record<string, unknown>
}

export interface ServiceStatus {
  serviceId: string
  pluginId: string
  state: string
  port: number | null
  pid: number | null
  uptime: number | null
  lastError: string | null
  restartCount: number
}

export type ActivityKey = 'active' | 'idle' | 'cold' | 'never'

export interface Row {
  plugin: PluginInfo
  usage: UsageRecord
  activity: ActivityKey
  activityMeta: { label: string; color: string; desc: string }
  windows: { days: number; mcp: number; panel: number; total: number; firstDay: string; lastDay: string | null }[]
  cost30: number
  cost7: number
  services: ServiceStatus[]
  hasServices: boolean
  mcpServerCount: number
}

export interface Summary {
  rows: Row[]
  byActivity: Row[]
  byCold: Row[]
  suggestions: {
    pluginId: string
    name: string
    activity: string
    suggestion: string
    reason: string
    weight: number
  }[]
  windows: number[]
  totals: {
    plugins: number
    active: number
    idle: number
    cold: number
    never: number
    runningServices: number
  }
}

// ── 通道（经宿主 invoke → router_dispatch → cap.*）────────────────────────
interface DispatchResponse {
  msgId: string
  ok: boolean
  result?: Record<string, unknown> | unknown[]
  error?: string | null
}

async function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })
  return (r.value ?? null) as T | null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r.keys ?? []
}

// ── 用量账本 ───────────────────────────────────────────────────────────────
async function loadAllUsage(): Promise<Record<string, UsageRecord>> {
  const keys = await kvKeys()
  const ids = keys.filter((k) => k.startsWith(core.K.usagePrefix)).map((k) => k.slice(core.K.usagePrefix.length))
  const byPlugin: Record<string, UsageRecord> = {}
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet<UsageRecord>(core.K.usage(id))
    const rec = core.normalizeUsage(v)
    if (rec && rec.pluginId) byPlugin[rec.pluginId] = rec
  }
  return byPlugin
}

async function loadPluginList(): Promise<PluginInfo[]> {
  const res = await capDispatch<{ plugins?: unknown[] }>('cap.pluginDiscovery', { action: 'discover' })
  return (Array.isArray(res.plugins) ? res.plugins : [])
    .map((p) => core.normalizePlugin(p) as PluginInfo | null)
    .filter((p): p is PluginInfo => p !== null)
}

async function loadServiceList(): Promise<ServiceStatus[]> {
  const res = await capDispatch<unknown[] | Record<string, unknown>>('cap.pluginServiceManager', { action: 'list_status' })
  const arr = Array.isArray(res) ? res : []
  return arr
    .map((s) => core.normalizeServiceStatus(s) as ServiceStatus | null)
    .filter((s): s is ServiceStatus => s !== null)
}

// ── 汇总视图（复用 core.summarize，类型对齐）────────────────────────────────
export async function loadSummary(): Promise<Summary> {
  const [plugins, usage, services] = await Promise.all([loadPluginList(), loadAllUsage(), loadServiceList()])
  return core.summarize(plugins, usage, services) as unknown as Summary
}

/** 面板打开/操作记为自身用量（双通道计量的一部分） */
export async function notePanelOpen(): Promise<void> {
  const k = core.K.usage('watchtower')
  const prev = core.normalizeUsage(await kvGet<UsageRecord>(k))
  await kvSet(k, core.recordUsage('watchtower', 'panel', prev))
}

// ── 服务操作 ───────────────────────────────────────────────────────────────
export async function serviceAction(
  action: 'start' | 'stop' | 'restart',
  pluginId: string,
  serviceId: string,
): Promise<ServiceStatus | null> {
  const r = await capDispatch<unknown>('cap.pluginServiceManager', { action, pluginId, serviceId })
  return core.normalizeServiceStatus(r) as ServiceStatus | null
}

// ── 治理操作 ───────────────────────────────────────────────────────────────
export async function uninstallPlugin(installPath: string): Promise<{ success?: boolean; message?: string; error?: string }> {
  const r = await capDispatch<{ success?: boolean; message?: string; error?: string }>(
    'cap.pluginDiscovery',
    { action: 'uninstall_local', installPath },
  )
  return r
}

export function timeAgo(ts: number | null): string {
  if (ts == null || !ts) return '—'
  const d = Date.now() - ts
  if (d < 60 * 1000) return '刚刚'
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}