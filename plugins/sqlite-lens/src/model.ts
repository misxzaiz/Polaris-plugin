/**
 * SQLite 检查台数据层（双平面，api-bench 同款）：
 *  - 数据面：cap.kv sqltl.* 键空间（经宿主 invoke → router_dispatch）
 *    —— libs 清单 / qhist / audit / pending 待确认单，跨端可见
 *  - 字节面：127.0.0.1:<meta.port> 直连自家服务（X-SqliteLens-Token 鉴权）
 *    —— 雷达/打开/查询/两步写等交互操作，低延迟（桌面优先；库文件本就在桌面）
 */

import { getHostInvoke } from './host'

export const PLUGIN_ID = 'sqlite-lens'
export const SERVICE_ID = 'sqlite-lens-service'

// ── 类型 ──
export interface ServiceMeta {
  version: string
  port: number
  token: string
  startedAt?: number
  degraded?: string | null
  updatedAt?: number
}
export interface LibEntry {
  dbId: string
  path: string
  label: string
  sizeBytes: number
  tables: string[]
  knownAs: string | null
  addedAt: number
  lastOpenedAt: number
}
export interface PendingWrite {
  id: string
  dbId: string
  file: string
  sql: string
  preview: { head: string; changes: number | null; note?: string }
  createdAt: number
  expiresAt: number
}
export interface AuditEntry {
  at: number
  dbPath: string
  sql: string
  status: string
  changes?: number | null
  backupPath?: string | null
  error?: string
}
export interface QhistEntry { sql: string; dbPath: string; at: number; ok: boolean; ms: number; rows: number }
export interface LensSettings {
  radarRoots: string[]
  autoBackup: boolean
  queryLimit: number
  cellBudget: number
}
export interface MetaReply {
  ok: boolean
  error?: string
  version: string
  degraded: string | null
  bridgeOk: boolean
  libs: LibEntry[]
  settings: LensSettings
  pendingCount: number
  pendingList: PendingWrite[]
  audit: AuditEntry[]
  qhist: QhistEntry[]
}
export interface ShapedCell { t: 'null' | 'num' | 'text' | 'blob'; v: string | null; trunc?: number; bytes?: number }
export interface RadarItem { path: string; sizeBytes: number; mtimeMs: number; depth: number; sqlite: boolean | null }

// ── 数据面：cap.kv ──
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>(
    'router_dispatch', { req: { target, payload } },
  )
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? ({} as T)) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r && r.value !== undefined ? r.value : null
  } catch (_) {
    return null // 读到的键可能刚被并发删掉（单写者契约的读侧纪律）
  }
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export const KEY_META = 'sqltl.meta'
export const KEY_SETTINGS = 'sqltl.settings'
export const KEY_AUDIT = 'sqltl.audit'
export const KEY_QHIST = 'sqltl.qhist'
export const KEY_LIBS = 'sqltl.libs'
export const KEY_PENDING = (id: string) => `sqltl.pending.${id}`

// ── 服务管理（list_status → discover → start 三步自举，disk-radar 同款）──
interface ServiceStatus { pluginId: string; serviceId: string; state?: string; status?: string; port?: number }
export interface DiscoverReply { plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Record<string, unknown>[] } }> }

export async function listServiceStatus(): Promise<ServiceStatus | null> {
  try {
    const st = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
    const arr = Array.isArray(st) ? st : []
    const mine = arr.find((s) => (s as ServiceStatus).pluginId === PLUGIN_ID && (s as ServiceStatus).serviceId === SERVICE_ID)
    return (mine as ServiceStatus) || null
  } catch (_) {
    return null
  }
}

export async function serviceAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
  if (action === 'start') {
    const st = await listServiceStatus()
    if (st && (st.state === 'running' || st.status === 'running')) return
    const r = await capDispatch<DiscoverReply>('cap.pluginDiscovery', { action: 'discover' })
    const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID)
    const svc = self?.contributes?.services?.find((s) => (s as { id?: string }).id === SERVICE_ID) as Record<string, unknown> | undefined
    if (!self || !svc) throw new Error('插件发现结果里找不到 SQLite 检查台服务——请确认插件已正确安装')
    await capDispatch('cap.pluginServiceManager', {
      action: 'start', pluginId: PLUGIN_ID, installPath: self.installPath,
      contribution: {
        id: svc.id, type: svc.type ?? svc.serviceType, command: svc.command,
        argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
        port: svc.port ?? null, healthCheck: svc.healthCheck ?? null,
        healthCheckTimeout: svc.healthCheckTimeout ?? null, autoStart: svc.autoStart ?? true,
        restartOnFailure: svc.restartOnFailure ?? true, maxRestarts: svc.maxRestarts ?? 3,
        description: svc.description ?? null,
      },
    })
    return
  }
  await capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}

// ── 字节面：直连自家服务 ──
export async function loadMeta(): Promise<ServiceMeta | null> {
  try {
    const m = await kvGet<ServiceMeta>(KEY_META)
    if (m && typeof m.port === 'number' && m.port && typeof m.token === 'string' && m.token) return m
    return null
  } catch (_) {
    return null
  }
}

export async function svcFetch<T>(meta: ServiceMeta, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SqliteLens-Token': meta.token },
    body: JSON.stringify(body || {}),
  })
  return await res.json() as T
}

// ── 组合：meta + 请求（面板常用）──
export async function withSvc<T>(fn: (meta: ServiceMeta) => Promise<T>): Promise<T> {
  const meta = await loadMeta()
  if (!meta) throw new Error('服务未就绪（meta 未上报）——稍候或在设置页手动启动服务')
  return fn(meta)
}

// ── 本地工具 ──
export function timeAgo(ts?: number | null): string {
  if (!ts) return '从未'
  const d = Date.now() - ts
  if (d < 60_000) return '刚刚'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`
  return `${Math.floor(d / 86_400_000)} 天前`
}
export function fmtBytes(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`
}
export function fmtDbPath(p: string): string {
  const parts = p.replace(/\//g, '\\').split('\\').filter(Boolean)
  return parts.length > 2 ? `…\\${parts.slice(-2).join('\\')}` : p
}
