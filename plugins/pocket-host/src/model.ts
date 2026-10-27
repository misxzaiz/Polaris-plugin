/**
 * 通信层 + 数据访问（口袋主机面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 hostmon.* 键空间。快照/告警/kill 结果的唯一写者是后台
 * 服务（service/host.js）——面板与 MCP 只读快照、写设置与命令键。
 *
 * 键空间契约（与 service/host.js、mcp/server.js 三方一致，权威描述见 README）：
 *   hostmon.snapshot        主机快照（服务每 snapshotMs 写）
 *   hostmon.meta            服务心跳（服务每 60s 写）
 *   hostmon.settings        告警阈值/节奏设置（面板/MCP 写，服务读）
 *   hostmon.event.<13位ts>  阈值告警事件（服务写，保留 100 条）
 *   hostmon.cmd.kill.<nonce> kill 命令（面板/MCP 写，服务消费删除）
 *   hostmon.result.<nonce>  kill 结果（服务写，消费者删除）
 *   hostmon.readAt          动态已读水位（面板写）
 */
import { getHostInvoke } from './host'

// ── 类型（与 service/host.js baseSnapshot 对齐）────────────────────────────
export interface HostInfo {
  name: string
  platform: string
  release: string
  arch: string
  cpuModel: string
  cores: number
  totalMemBytes: number
}

export interface DiskInfo {
  mount: string
  totalGb: number
  freeGb: number
  pct: number
}

export interface ProcRow { name: string; pid: number; memMb: number }
export interface PortRow { port: number; pid: number; name: string }

export interface HostSnapshot {
  at: number
  version: string
  host: HostInfo
  cpuPct: number | null
  memPct: number | null
  memUsedBytes: number
  uptimeSec: number
  loadavg?: number[]
  disks: DiskInfo[]
  disksVia: string
  procs: { at: number; count: number; list: ProcRow[] }
  ports: { at: number; count: number; list: PortRow[] }
  alerts: { cpu_high?: boolean; mem_high?: boolean; disk_low?: boolean; lowMounts?: string[] }
  history: [number, number, number][]
}

export interface HostMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  host?: string
  disksVia?: string
  degraded?: boolean
  lastBridgeErr?: string
  historyMin?: number
}

export interface HostSettings {
  cpuThreshold: number
  memThreshold: number
  diskFreeGb: number
  sustainTicks: number
  snapshotMs: number
  slowMs: number
  paused: boolean
}

export type EventType = 'cpu_high' | 'mem_high' | 'disk_low' | 'cpu_recovered' | 'mem_recovered' | 'disk_recovered'

export interface HostEvent {
  type: EventType
  at: number
  summary: string
  value?: number
  threshold?: number
  mount?: string
}

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string }> = {
  cpu_high: { label: 'CPU 告警', color: '#F85149' },
  mem_high: { label: '内存告警', color: '#F85149' },
  disk_low: { label: '磁盘告警', color: '#D29922' },
  cpu_recovered: { label: 'CPU 恢复', color: '#3FB950' },
  mem_recovered: { label: '内存恢复', color: '#3FB950' },
  disk_recovered: { label: '磁盘恢复', color: '#3FB950' },
}

export const DEFAULT_SETTINGS: HostSettings = {
  cpuThreshold: 90,
  memThreshold: 90,
  diskFreeGb: 5,
  sustainTicks: 4,
  snapshotMs: 5000,
  slowMs: 15000,
  paused: false,
}

export interface ServiceStatus {
  serviceId: string
  pluginId: string
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  port?: number
  pid?: number
  uptime?: number
  lastError?: string
  restartCount: number
}

// ── 键构造 ─────────────────────────────────────────────────────────────────
export const K = {
  snapshot: 'hostmon.snapshot',
  meta: 'hostmon.meta',
  settings: 'hostmon.settings',
  eventPrefix: 'hostmon.event.',
  cmdKill: (nonce: string) => `hostmon.cmd.kill.${nonce}`,
  result: (nonce: string) => `hostmon.result.${nonce}`,
  readAt: 'hostmon.readAt',
}

// ── 通道 ───────────────────────────────────────────────────────────────────
interface DispatchResponse {
  msgId: string
  ok: boolean
  result?: { value?: unknown; keys?: string[] }
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

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r.keys ?? []
}

// ── 数据加载 ───────────────────────────────────────────────────────────────
export interface PanelData {
  snap: HostSnapshot | null
  meta: HostMeta | null
  settings: HostSettings
  /** at > readAt 的告警事件数（readAt<=0 时不计） */
  newCount: number
}

export async function loadPanelData(readAt = 0): Promise<PanelData> {
  const [rawSnap, rawMeta, rawSettings, keys] = await Promise.all([
    kvGet<HostSnapshot>(K.snapshot),
    kvGet<HostMeta>(K.meta),
    kvGet<HostSettings>(K.settings),
    kvKeys(),
  ])
  let newCount = 0
  if (readAt > 0) {
    for (const k of keys) {
      if (!k.startsWith(K.eventPrefix)) continue
      const at = Number(k.slice(K.eventPrefix.length))
      if (Number.isFinite(at) && at > readAt) newCount++
    }
  }
  return {
    snap: rawSnap && typeof rawSnap === 'object' ? rawSnap : null,
    meta: rawMeta && typeof rawMeta === 'object' ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) },
    newCount,
  }
}

export async function loadEvents(limit = 40): Promise<HostEvent[]> {
  const keys = await kvKeys()
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort().slice(-limit).reverse()
  const events = await Promise.all(evKeys.map((k) => kvGet<HostEvent>(k)))
  return events.filter((e): e is HostEvent => !!e && typeof e === 'object' && typeof e.at === 'number').sort((a, b) => b.at - a.at)
}

export async function loadReadAt(): Promise<number> {
  const v = await kvGet<number>(K.readAt)
  return typeof v === 'number' ? v : 0
}

export async function markAllRead(): Promise<void> {
  await kvSet(K.readAt, Date.now())
}

export async function clearEvents(): Promise<number> {
  const keys = await kvKeys()
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix))
  await Promise.all(evKeys.map((k) => kvDel(k)))
  return evKeys.length
}

// ── kill（命令键投递 + 结果轮询；写者唯一是后台服务）─────────────────────────
export interface KillResultItem { pid: number; name?: string; ok?: boolean; error?: string; output?: string }
export interface KillResult { ok: boolean; byPort?: number; error?: string; results?: KillResultItem[] }

export function nonce(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return 'p' + c.randomUUID().replace(/-/g, '').slice(0, 12)
  return 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** 结束进程：按 pid 或按 port（推荐 port——服务执行时重新解析归属防误杀） */
export async function killBy(payload: { pid?: number; port?: number; reason?: string }): Promise<KillResult> {
  const n = nonce()
  await kvSet(K.cmdKill(n), { ...payload, confirm: true, at: Date.now() })
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200))
    const r = await kvGet<KillResult>(K.result(n)).catch(() => null)
    if (r) {
      kvDel(K.result(n)).catch(() => {})
      return r
    }
  }
  return { ok: false, error: '等待执行结果超时：后台服务可能未运行（设置 → 服务管理 可查看/启动）' }
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

export const SERVICE_ID = 'host-service'

interface DiscoveredSelf {
  installPath: string
  services: Record<string, unknown>[]
}

/** 从插件发现结果中找自己（拿 installPath 与服务 contribution，start 必填） */
async function discoverSelf(pluginId: string): Promise<DiscoveredSelf | null> {
  const r = await capDispatch<{ plugins?: Array<{
    id: string
    installPath: string
    contributes?: { services?: Record<string, unknown>[] }
  }> }>('cap.pluginDiscovery', { action: 'discover' })
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId)
  if (!self || !self.installPath) return null
  const services = self.contributes?.services ?? []
  return { installPath: self.installPath, services }
}

/** 后端期望的 contribution 形态（与主仓 toBackendContribution 对齐） */
function toBackendContribution(c: Record<string, unknown>): Record<string, unknown> {
  return {
    id: c.id,
    type: c.type ?? c.serviceType,
    command: c.command,
    argsTemplate: Array.isArray(c.argsTemplate) ? c.argsTemplate : [],
    port: c.port ?? null,
    healthCheck: c.healthCheck ?? null,
    healthCheckTimeout: c.healthCheckTimeout ?? null,
    autoStart: c.autoStart ?? true,
    restartOnFailure: c.restartOnFailure ?? true,
    maxRestarts: c.maxRestarts ?? 3,
    description: c.description ?? null,
  }
}

export async function serviceAction(action: 'start' | 'stop' | 'restart', pluginId: string, serviceId: string): Promise<void> {
  if (action === 'start') {
    const self = await discoverSelf(pluginId)
    const svc = self?.services.find((s) => s.id === serviceId)
    if (!self || !svc) throw new Error('插件发现结果中找不到本插件的服务贡献（请刷新插件列表后重试）')
    await capDispatch('cap.pluginServiceManager', {
      action: 'start',
      pluginId,
      installPath: self.installPath,
      contribution: toBackendContribution(svc),
    })
    return
  }
  await capDispatch('cap.pluginServiceManager', { action, pluginId, serviceId })
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function fmtUptime(sec?: number): string {
  if (!sec || sec <= 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分钟`
  return `${m} 分钟`
}

export function gb(n: number | undefined | null, digits = 1): string {
  return Number.isFinite(n as number) ? `${(n as number).toFixed(digits)} GB` : '—'
}

/** 快照龄期（秒） */
export function snapAge(snap: HostSnapshot | null): number {
  if (!snap || typeof snap.at !== 'number') return Infinity
  return Math.max(0, Math.round((Date.now() - snap.at) / 1000))
}

/** 心跳三态：live（快照 20s 内）/ stale（快照停滞）/ down（无快照） */
export function heartbeatOf(snap: HostSnapshot | null, meta: HostMeta | null): { cls: 'ok' | 'stale' | 'down'; text: string } {
  const age = snapAge(snap)
  if (age === Infinity) {
    if (meta?.lastTickAt && Date.now() - meta.lastTickAt < 150 * 1000) {
      return { cls: 'stale', text: '服务启动中，快照未就绪' }
    }
    return { cls: 'down', text: '服务未运行或无快照' }
  }
  if (age <= 20) return { cls: 'ok', text: `${snap?.host?.name || '主机'} 在线 · 实时采样中` }
  return { cls: 'stale', text: `快照停滞 ${age >= 90 ? `${Math.round(age / 60)} 分钟` : `${age} 秒`}` }
}

/** 从 meta.bridge（"127.0.0.1:9829"）提取宿主 web 端口，用于端口表高亮 */
export function bridgePort(meta: HostMeta | null): number | null {
  const m = (meta?.bridge || '').match(/:(\d+)\s*$/)
  return m ? Number(m[1]) : null
}
