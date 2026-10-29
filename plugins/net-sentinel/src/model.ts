/**
 * 通信层 + 数据访问（网络哨兵面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 netmon.* 键空间。探测/聚合/事件/测速的唯一写者是后台
 * 服务（service/net.js）——面板与 MCP 只读快照/桶/事件，写设置与命令键。
 *
 * 键空间契约（与 service/net.js、mcp/server.js 三方一致，权威描述见 README 与
 * 主仓 plans/net-sentinel-plugin-spec.md）：
 *   netmon.snapshot            网络快照（服务每 tick 写）
 *   netmon.meta                服务心跳（服务每 60s 写）
 *   netmon.settings            数值参数+测速地址（面板写，服务读）
 *   netmon.targets             目标列表（服务独占写；面板/MCP 经 cmd.targets 改）
 *   netmon.h.<YYYYMMDDHH>      小时桶（服务写，[min, avgX10|null, max, loss, cnt]）
 *   netmon.event.<13位ts>      网络事件（服务写，cap 200）
 *   netmon.speed.<13位ts>      测速记录（服务写，cap 50）
 *   netmon.cmd.speed.<nonce>   测速命令（面板/MCP 写，服务消费删除）
 *   netmon.cmd.targets.<nonce> 目标命令（面板/MCP 写，服务消费删除）
 *   netmon.result.<nonce>      命令结果（服务写，消费者删除）
 *   netmon.readAt              动态已读水位（面板写）
 */
import { getHostInvoke } from './host'

// ── 类型（与 service/net.js writeSnapshot 对齐）────────────────────────────
export interface TargetMeta {
  id: string
  label: string
  host: string
  port: number
  kind: 'gateway' | 'anchor' | 'normal'
  enabled: boolean
}

export interface RoundResult {
  ok: boolean
  ms?: number
  dnsMs?: number
  err?: string
  at?: number
}

export interface SpeedRecord {
  at: number
  url: string
  mb: number
  ok: boolean
  mbps?: number | null
  bytes?: number
  durMs?: number
  latencyMs?: number | null
  err?: string
}

export interface NetSnapshot {
  at: number
  version: string
  tickSec: number
  online: boolean
  round: Record<string, RoundResult>
  targets: TargetMeta[]
  recent: Record<string, [number, number | null][]>
  speeds: SpeedRecord[]
  speeding?: { at: number; url: string; mb: number } | null
  counts: { rounds: number; probes: number; losses: number }
}

export interface NetMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  gateway?: string
  degraded?: boolean
  lastBridgeErr?: string
  retentionHours?: number
  tickSec?: number
}

export interface NetSettings {
  tickSec: number
  timeoutMs: number
  latencyMs: number
  sustainRounds: number
  retentionHours: number
  speedMb: number
  speedUrl: string
  paused: boolean
}

export type EventType =
  | 'net_down' | 'net_recovered'
  | 'target_down' | 'target_recovered'
  | 'latency_high' | 'latency_recovered'

export interface NetEvent {
  type: EventType
  at: number
  summary: string
  targetId?: string
  value?: number
  threshold?: number
  durMs?: number
}

/** 分钟记录 [minIdx, avgX10|null, max, loss, cnt] */
export type MinuteRec = [number, number | null, number, number, number]

export interface HourBucket {
  v1: number
  at: number
  byTarget: Record<string, MinuteRec[]>
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

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string }> = {
  net_down: { label: '断网', color: '#F85149' },
  net_recovered: { label: '网络恢复', color: '#3FB950' },
  target_down: { label: '目标失联', color: '#F85149' },
  target_recovered: { label: '目标恢复', color: '#3FB950' },
  latency_high: { label: '延迟劣化', color: '#D29922' },
  latency_recovered: { label: '延迟回落', color: '#3FB950' },
}

export const DEFAULT_SETTINGS: NetSettings = {
  tickSec: 10,
  timeoutMs: 3000,
  latencyMs: 400,
  sustainRounds: 6,
  retentionHours: 720,
  speedMb: 10,
  speedUrl: '',
  paused: false,
}

export interface ServiceState {
  state: 'ok' | 'stale' | 'down'
  text: string
}

// ── 键构造 ─────────────────────────────────────────────────────────────────
export const K = {
  snapshot: 'netmon.snapshot',
  meta: 'netmon.meta',
  settings: 'netmon.settings',
  targets: 'netmon.targets',
  hour: (key: string) => `netmon.h.${key}`,
  eventPrefix: 'netmon.event.',
  speedPrefix: 'netmon.speed.',
  cmdSpeed: (nonce: string) => `netmon.cmd.speed.${nonce}`,
  cmdTargets: (nonce: string) => `netmon.cmd.targets.${nonce}`,
  result: (nonce: string) => `netmon.result.${nonce}`,
  readAt: 'netmon.readAt',
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
  snap: NetSnapshot | null
  meta: NetMeta | null
  settings: NetSettings
  newCount: number
}

export async function loadPanelData(readAt = 0): Promise<PanelData> {
  const [rawSnap, rawMeta, rawSettings, keys] = await Promise.all([
    kvGet<NetSnapshot>(K.snapshot),
    kvGet<NetMeta>(K.meta),
    kvGet<NetSettings>(K.settings),
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

export async function loadEvents(limit = 60): Promise<NetEvent[]> {
  const keys = await kvKeys()
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort().slice(-limit).reverse()
  const events = await Promise.all(evKeys.map((k) => kvGet<NetEvent>(k)))
  return events.filter((e): e is NetEvent => !!e && typeof e === 'object' && typeof e.at === 'number').sort((a, b) => b.at - a.at)
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

/** 本地时 hourKey（与 service/lib.js hourKey 对齐） */
export function hourKeyOf(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`
}

/** 加载最近 N 小时的小时桶（并行分批；返回 key→bucket） */
export async function loadHourBuckets(hours: number): Promise<Map<string, HourBucket>> {
  const keys: string[] = []
  const now = Date.now()
  for (let i = 0; i < hours; i++) keys.push(hourKeyOf(now - i * 3600 * 1000))
  const uniq = [...new Set(keys)]
  const out = new Map<string, HourBucket>()
  const CHUNK = 24
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK)
    const vals = await Promise.all(part.map((k) => kvGet<HourBucket>(K.hour(k)).catch(() => null)))
    part.forEach((k, j) => {
      const v = vals[j]
      if (v && typeof v === 'object' && v.byTarget) out.set(k, v)
    })
  }
  return out
}

export async function loadSpeeds(limit = 8): Promise<SpeedRecord[]> {
  const keys = await kvKeys()
  const spKeys = keys.filter((k) => k.startsWith(K.speedPrefix)).sort().slice(-limit).reverse()
  const recs = await Promise.all(spKeys.map((k) => kvGet<SpeedRecord>(k)))
  return recs.filter((s): s is SpeedRecord => !!s && typeof s === 'object' && typeof s.at === 'number')
}

/** 危险操作：清空全部 netmon.* 键（服务会重建默认目标/设置） */
export async function clearAllData(): Promise<number> {
  const keys = await kvKeys()
  const mine = keys.filter((k) => k.startsWith('netmon.'))
  for (const k of mine) await kvDel(k).catch(() => {})
  return mine.length
}

// ── 命令（投递 + 结果轮询；写者唯一是后台服务）─────────────────────────────
export function nonce(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined
  const id = c && typeof c.randomUUID === 'function'
    ? c.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return prefix + id
}

async function waitResult(n: string, timeoutMs: number, stepMs = 1200): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, stepMs))
    const r = await kvGet<Record<string, unknown>>(K.result(n)).catch(() => null)
    if (r) {
      kvDel(K.result(n)).catch(() => {})
      return r
    }
  }
  return null
}

export async function runSpeedtest(payload: { mb?: number; url?: string; allowPrivate?: boolean }): Promise<SpeedResult> {
  const n = nonce('s')
  await kvSet(K.cmdSpeed(n), { ...payload, confirm: true, at: Date.now() })
  const r = await waitResult(n, 70 * 1000)
  if (!r) return { ok: false, error: '等待测速结果超时：后台服务可能未运行（设置 Tab 可查看/启动服务），或测速超过 70s' }
  if (r.ok) return { ok: true, ...(r.payload as Record<string, unknown> ?? {}) }
  return { ok: false, error: String(r.error || '测速失败') }
}

export interface SpeedResult {
  ok: boolean
  mbps?: number
  bytes?: number
  durMs?: number
  latencyMs?: number
  url?: string
  error?: string
}

export type TargetsAction = 'add' | 'remove' | 'enable' | 'disable'

export async function mutateTargets(payload: { action: TargetsAction; target?: Partial<TargetMeta>; id?: string }): Promise<{ ok: boolean; error?: string }> {
  const n = nonce('t')
  await kvSet(K.cmdTargets(n), { ...payload, at: Date.now() })
  const r = await waitResult(n, 20 * 1000)
  if (!r) return { ok: false, error: '等待结果超时：后台服务可能未运行（设置 Tab 可查看/启动服务）' }
  if (r.ok) return { ok: true }
  return { ok: false, error: String(r.error || '操作失败') }
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

export const SERVICE_ID = 'net-service'

interface DiscoveredSelf {
  installPath: string
  services: Record<string, unknown>[]
}

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
/** 延迟色阶：<150 优 / <400 良 / <800 缓 / ≥800 劣 */
export function msColor(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '#8B95A7'
  if (ms < 150) return '#3FB950'
  if (ms < 400) return '#58A6FF'
  if (ms < 800) return '#D29922'
  return '#F85149'
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`
}

export function fmtMbps(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v >= 100 ? `${Math.round(v)} Mbps` : `${v.toFixed(1)} Mbps`
}

export function snapAge(snap: NetSnapshot | null): number {
  if (!snap || typeof snap.at !== 'number') return Infinity
  return Math.max(0, Math.round((Date.now() - snap.at) / 1000))
}

/** 心跳三态：live（快照 3×tick 内）/ stale（快照停滞）/ down（无快照） */
export function heartbeatOf(snap: NetSnapshot | null, meta: NetMeta | null): ServiceState {
  const age = snapAge(snap)
  if (!snap || age === Infinity) {
    if (meta?.lastTickAt && Date.now() - meta.lastTickAt < 150 * 1000) {
      return { state: 'stale', text: '服务启动中，快照未就绪' }
    }
    return { state: 'down', text: '服务未运行或无快照' }
  }
  const tick = Math.max(5, snap.tickSec || 10)
  if (age <= tick * 3) {
    return { state: 'ok', text: `${snap.online ? '网络在线' : '网络离线'} · 每 ${tick}s 探测` }
  }
  return { state: 'stale', text: `快照停滞 ${age >= 90 ? `${Math.round(age / 60)} 分钟` : `${age} 秒`}` }
}
