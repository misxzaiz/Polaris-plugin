/**
 * 通信层 + 数据访问（磁盘雷达面板）
 *
 * 统一经宿主 invoke 通道调 router_dispatch；面板与后台服务、MCP server
 * 读写同一个 cap.kv（SqliteStorage domain=kv）的 diskrad.* 键空间。
 *
 * 键空间契约（与 service/radar.js、mcp/server.js、shared/disk-core.js 四方一致，
 * 权威描述见 README）：
 *   diskrad.settings        全局设置（面板/MCP 写，服务读）
 *   diskrad.roots           扫描根（服务写，经 cmd.roots_add/roots_remove 原子改）
 *   diskrad.scan            扫描进度（服务写，~1.5s 节流；空闲时键不存在）
 *   diskrad.state           各根汇总（服务写）
 *   diskrad.snap.<rid>.<seq> 快照（服务写）
 *   diskrad.junk.<rid>      垃圾清单（服务写）
 *   diskrad.qman.<rid>      隔离区清单（服务写）
 *   diskrad.cmd.<op>.<nonce> 命令键（面板/MCP 写，服务消费=先删后做）
 *   diskrad.result.<nonce>  命令结果（服务写，请求方读后删）
 *   diskrad.meta            服务心跳（服务写）
 */
import { getHostInvoke } from './host'

// ── 常量 ───────────────────────────────────────────────────────────────────
export const PLUGIN_ID = 'disk-radar'
export const SERVICE_ID = 'disk-radar-service'

// ── 类型 ───────────────────────────────────────────────────────────────────
export interface TreeNode {
  n: string
  b: number
  f: number
  c?: TreeNode[]
  j?: string   // 垃圾类型（deps/build/cache/custom）
  d?: number   // 无权限标记
}

export interface DiskRoot { id: string; path: string; label: string; addedAt: number }

export interface RadarSettings {
  autoSnapshot: boolean
  snapshotHours: number
  keepSnapshots: number
  autoBudgetSec: number
  deepBudgetMin: number
  quarantineDays: number
  extraJunkDirs: string[]
  excludeNames: string[]
}

export interface RootState {
  rid: string
  path: string
  label?: string
  total: number
  files: number
  lastScanAt?: number
  kind?: string
  deep?: boolean
  partial?: boolean
  prevTotal?: number | null
  prevAt?: number | null
  deltaBytes?: number | null
  junkBytes?: number
  junkCount?: number
  free?: number | null
  volumeTotal?: number | null
  lastError?: string | null
}

export interface DiskState { roots: Record<string, RootState>; updatedAt: number }

export interface Snapshot {
  seq: number
  at: number
  kind: string
  deep?: boolean
  partial?: boolean
  total: number
  files: number
  dirs: TreeNode[]
  junkCount?: number
  junkBytes?: number
  deniedFiles?: number
  deniedDirs?: number
  volume?: { free: number; total: number } | null
  elapsedMs?: number
}

export interface JunkItem {
  id: string
  relPath: string
  name: string
  kind: string
  note?: string
  bytes: number
  files: number
  lastWrite: number
}
export interface JunkDoc { at: number; partial?: boolean; rootPath?: string; items: JunkItem[] }
export interface QmanItem { id: string; relPath: string; name: string; kind: string; bytes: number; movedAt: number }
export interface QmanDoc { items: QmanItem[] }

export interface ScanLive {
  id: string
  path: string
  kind?: string
  deep?: boolean
  bytes: number
  files: number
  currentPath: string
  startedAt: number
  updatedAt: number
}

export interface RadarMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  roots?: number
  scanning?: boolean
  queued?: number
}

export interface PanelData {
  state: DiskState
  meta: RadarMeta | null
  settings: RadarSettings
  roots: DiskRoot[]
  scan: ScanLive | null
}

export interface ServiceStatus {
  pluginId: string
  serviceId: string
  state?: string
  status?: string
  lastError?: string
  restartCount?: number
}

// ── cap 通道 ───────────────────────────────────────────────────────────────
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>(
    'router_dispatch', { req: { target, payload } },
  )
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? ({} as T)) as T
}

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r && r.value !== undefined ? r.value : null
  } catch (_) {
    return null // 读到的键可能刚被并发删掉（单写者契约的读侧纪律）
  }
}
/** 导出给设置 Tab 的导出/清空功能用（仍只走 cap.kv，无跨域面） */
export { kvGet, kvSet, kvDel }
async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}
async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}
async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r && Array.isArray(r.keys) ? r.keys : []
}

// ── 面板数据装载 ───────────────────────────────────────────────────────────
const FALLBACK_SETTINGS: RadarSettings = {
  autoSnapshot: true, snapshotHours: 24, keepSnapshots: 12,
  autoBudgetSec: 90, deepBudgetMin: 10, quarantineDays: 14,
  extraJunkDirs: [], excludeNames: [],
}

export const K = {
  settings: 'diskrad.settings',
  roots: 'diskrad.roots',
  state: 'diskrad.state',
  scan: 'diskrad.scan',
  meta: 'diskrad.meta',
  snapPrefix: (rid: string) => `diskrad.snap.${rid}.`,
  junk: (rid: string) => `diskrad.junk.${rid}`,
  qman: (rid: string) => `diskrad.qman.${rid}`,
}

export async function loadPanelData(): Promise<PanelData> {
  const [state, meta, settings, roots, scan] = await Promise.all([
    kvGet<DiskState>(K.state),
    kvGet<RadarMeta>(K.meta),
    kvGet<Partial<RadarSettings>>(K.settings),
    kvGet<{ roots?: DiskRoot[] }>(K.roots),
    kvGet<ScanLive>(K.scan),
  ])
  return {
    state: state && state.roots ? state : { roots: {}, updatedAt: 0 },
    meta: meta || null,
    settings: { ...FALLBACK_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) },
    roots: roots && Array.isArray(roots.roots) ? roots.roots : [],
    scan: scan && scan.updatedAt && Date.now() - scan.updatedAt < 15000 ? scan : null,
  }
}

export async function saveSettings(s: RadarSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function loadSnaps(rid: string): Promise<Snapshot[]> {
  const keys = await kvKeys()
  const list = keys
    .filter((k) => k.startsWith(K.snapPrefix(rid)))
    .map((k) => ({ k, seq: Number(k.slice(K.snapPrefix(rid).length)) || 0 }))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, 30)
  const out: Snapshot[] = []
  for (const s of list) {
    const v = await kvGet<Snapshot>(s.k)
    if (v) out.push(v)
  }
  return out
}

export async function loadJunk(rid: string): Promise<JunkDoc> {
  const v = await kvGet<JunkDoc>(K.junk(rid))
  return v && Array.isArray(v.items) ? v : { at: 0, items: [] }
}

export async function loadQman(rid: string): Promise<QmanDoc> {
  const v = await kvGet<QmanDoc>(K.qman(rid))
  return v && Array.isArray(v.items) ? v : { items: [] }
}

// ── 命令发送（cmd 键 → 轮询 result）─────────────────────────────────────────
function nonce(): string {
  return 'p' + Math.random().toString(16).slice(2, 10) + Date.now().toString(36)
}

export interface CmdResult<P = unknown> { ok: boolean; payload?: P; error?: string }

async function runCmd<P>(op: string, body: Record<string, unknown>, waitMs: number, stepMs = 1000): Promise<CmdResult<P>> {
  const n = nonce()
  await kvSet(`diskrad.cmd.${op}.${n}`, { ...body, at: Date.now() })
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, stepMs))
    const r = await kvGet<CmdResult<P>>(`diskrad.result.${n}`)
    if (r) {
      kvDel(`diskrad.result.${n}`).catch(() => {})
      return r
    }
  }
  return { ok: false, error: '等待服务响应超时——去 设置 Tab 确认磁盘雷达服务是否在运行' }
}

export function cmdScan(path?: string, deep = false, label?: string) {
  return runCmd<{ rid?: string; queued?: number }>('scan', { ...(path ? { path } : {}), deep, ...(label ? { label } : {}) }, 8000)
}
export function cmdCancel() {
  return runCmd('cancel', {}, 8000)
}
export function cmdProbe(path: string, maxDepth = 2, budgetMs = 15000) {
  return runCmd<{ total: number; files: number; dirs: TreeNode[]; junkItems: JunkItem[]; deniedDirs?: number; deniedFiles?: number; partial?: boolean; elapsedMs?: number }>(
    'report', { path, maxDepth, budgetMs }, 40000, 1200,
  )
}
export function cmdQuarantine(rootId: string, itemIds: string[]) {
  return runCmd<{ moved: number; movedBytes: number; errors: { id: string; error: string }[] }>('quarantine', { rootId, itemIds }, 30000)
}
export function cmdRestore(rootId: string, itemIds: string[]) {
  return runCmd<{ restored: number; errors: { id: string; error: string }[] }>('restore', { rootId, itemIds }, 30000)
}
export function cmdPurge(rootId: string, itemIds: string[]) {
  return runCmd<{ purged: number; freed: number; errors: { id: string; error: string }[] }>('purge', { rootId, itemIds, confirm: true }, 60000, 1500)
}
export function cmdPurgeAll(rootId: string) {
  return runCmd<{ purged: number; freed: number; errors: { id: string; error: string }[] }>('purge', { rootId, all: true, confirm: true }, 60000, 1500)
}
export function cmdRootsAdd(path: string, label?: string) {
  return runCmd<{ rid: string; existed: boolean }>('roots_add', { path, label }, 8000)
}
export function cmdRootsRemove(rootId: string) {
  return runCmd<{ removed: boolean }>('roots_remove', { rootId }, 8000)
}

// ── 服务管理（kb/service-start 三步自举）───────────────────────────────────
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
    const r = await capDispatch<{ plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Record<string, unknown>[] } }> }>(
      'cap.pluginDiscovery', { action: 'discover' },
    )
    const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID)
    const svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID)
    if (!self || !svc) throw new Error('插件发现结果里找不到磁盘雷达服务——请确认插件已正确安装')
    await capDispatch('cap.pluginServiceManager', {
      action: 'start', pluginId: PLUGIN_ID,
      installPath: self.installPath,
      contribution: {
        id: svc.id,
        type: svc.type ?? svc.serviceType,
        command: svc.command,
        argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
        port: svc.port ?? null,
        healthCheck: svc.healthCheck ?? null,
        healthCheckTimeout: svc.healthCheckTimeout ?? null,
        autoStart: svc.autoStart ?? true,
        restartOnFailure: svc.restartOnFailure ?? true,
        maxRestarts: svc.maxRestarts ?? 3,
        description: svc.description ?? null,
      },
    })
    return
  }
  await capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}

// ── 本地工具 ───────────────────────────────────────────────────────────────
export function timeAgo(ts?: number | null): string {
  if (!ts) return '从未'
  const s = Math.max(0, Math.round((Date.now() - Number(ts)) / 1000))
  if (s < 60) return `${s} 秒前`
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`
  return `${Math.round(s / 86400)} 天前`
}

export function fmtTime(ts?: number | null): string {
  if (!ts) return '—'
  return new Date(Number(ts)).toLocaleString('zh-CN', { hour12: false })
}
