/**
 * 通信层 + 数据访问（网页哨兵面板）
 *
 * 统一经宿主 invoke 通道调 router_dispatch；面板与后台服务、MCP server
 * 读写同一个 cap.kv（SqliteStorage domain=kv）的 sentinel.* 键空间。
 *
 * 键空间契约（与服务 service/sentinel.js、MCP mcp/server.js 三方一致，
 * 权威描述见 README）：
 *   sentinel.target.<id>          监控目标定义（面板/MCP 写）
 *   sentinel.state.<id>           运行状态（服务写）
 *   sentinel.snap.<id>            最近一次抽取快照（服务写）
 *   sentinel.event.<id>.<ts>      事件（服务写）
 *   sentinel.cmd.check.<id>       立即检查命令（面板/MCP 写，服务消费删除）
 *   sentinel.cmd.test.<nonce>     试抓命令（面板/MCP 写，服务消费删除）
 *   sentinel.test.<nonce>         试抓结果（服务写）
 *   sentinel.settings             全局设置（面板/MCP 写，服务读）
 *   sentinel.meta                 服务心跳（服务写）
 *   sentinel.readAt               已读水位（面板写）
 */
import { getHostInvoke } from './host'

// ── 类型 ───────────────────────────────────────────────────────────────────
export type ExtractMode = 'text' | 'selector' | 'regex' | 'json' | 'headers'
export type WatchCondition = 'any' | 'contains' | 'notContains' | 'lt' | 'gt'
export type EventType = 'change' | 'match' | 'unmatch' | 'error' | 'recovered'

export interface TargetDef {
  id: string
  name: string
  url: string
  mode: ExtractMode
  selector?: string
  regex?: string
  jsonPath?: string
  headers?: Record<string, string>
  intervalSec: number
  condition: WatchCondition
  keyword?: string
  threshold?: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface TargetState {
  id: string
  status: 'ok' | 'error'
  lastCheckedAt?: number
  lastOkAt?: number
  lastChangeAt?: number
  nextCheckAt?: number
  checkCount: number
  errorCount: number
  contentHash?: string
  httpStatus?: number
  lastError?: string
  lastEventSummary?: string
  etag?: string
  lastModified?: string
}

export interface DiffOp { kind: string; text: string }

export interface SentinelEvent {
  id: string
  targetId: string
  targetName?: string
  type: EventType
  at: number
  httpStatus?: number
  summary: string
  diff?: DiffOp[]
  extract?: string
}

export interface SentinelSettings {
  pausedAll: boolean
  maxConcurrency: number
  retentionDays: number
  maxEventsPerTarget: number
  userAgent: string
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

export interface SentinelMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  targets?: number
  enabled?: number
  pausedAll?: boolean
  queued?: number
  inFlight?: number
}

export interface WatchRow {
  target: TargetDef
  state?: TargetState
}

export interface Snapshot {
  rows: WatchRow[]
  meta: SentinelMeta | null
  settings: SentinelSettings
  /** at > readAt 的事件数（未读；readAt<=0 时不计） */
  newCount: number
}

// ── 键构造（与 service/mcp 一致）───────────────────────────────────────────
export const K = {
  target: (id: string) => `sentinel.target.${id}`,
  state: (id: string) => `sentinel.state.${id}`,
  snap: (id: string) => `sentinel.snap.${id}`,
  eventPrefix: (id: string) => `sentinel.event.${id}.`,
  cmdCheck: (id: string) => `sentinel.cmd.check.${id}`,
  cmdTest: (nonce: string) => `sentinel.cmd.test.${nonce}`,
  test: (nonce: string) => `sentinel.test.${nonce}`,
  settings: 'sentinel.settings',
  meta: 'sentinel.meta',
  readAt: 'sentinel.readAt',
}

export const DEFAULT_SETTINGS: SentinelSettings = {
  pausedAll: false,
  maxConcurrency: 3,
  retentionDays: 30,
  maxEventsPerTarget: 50,
  userAgent: '',
}

export const MODE_OPTIONS: { value: ExtractMode; label: string; hint: string }[] = [
  { value: 'text', label: '整页文本', hint: '盯整页任意变化，最省心' },
  { value: 'selector', label: 'CSS 选择器', hint: '只盯局部元素（如 .price），最准' },
  { value: 'regex', label: '正则提取', hint: '用正则捕获组1抽取文本' },
  { value: 'json', label: 'JSON 接口', hint: '盯 JSON 接口的某个字段' },
  { value: 'headers', label: '响应头', hint: '盯 etag / last-modified 变化' },
]

export const CONDITION_OPTIONS: { value: WatchCondition; label: string }[] = [
  { value: 'any', label: '内容变化就报' },
  { value: 'contains', label: '出现关键词时报' },
  { value: 'notContains', label: '关键词消失时报' },
  { value: 'lt', label: '数值低于阈值时报' },
  { value: 'gt', label: '数值高于阈值时报' },
]

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string }> = {
  change: { label: '变化', color: '#58A6FF' },
  match: { label: '命中', color: '#3FB950' },
  unmatch: { label: '解除', color: '#D29922' },
  error: { label: '错误', color: '#F85149' },
  recovered: { label: '恢复', color: '#3FB950' },
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
export async function loadSnapshot(readAt = 0): Promise<Snapshot> {
  const keys = await kvKeys()
  const targetIds = keys.filter((k) => k.startsWith('sentinel.target.')).map((k) => k.slice('sentinel.target.'.length))
  const [targets, states, meta, settings] = await Promise.all([
    Promise.all(targetIds.map((id) => kvGet<TargetDef>(K.target(id)))),
    Promise.all(targetIds.map((id) => kvGet<TargetState>(K.state(id)))),
    kvGet<SentinelMeta>(K.meta),
    kvGet<SentinelSettings>(K.settings),
  ])
  const rows: WatchRow[] = targetIds
    .map((id, i) => ({ target: targets[i]!, state: states[i] ?? undefined }))
    .filter((r) => r.target && typeof r.target === 'object')
    .sort((a, b) => (a.target.createdAt || 0) - (b.target.createdAt || 0))
  // 事件键形如 sentinel.event.<id>.<13位时间戳>，未读数直接从键名算，避免拉全量事件
  let newCount = 0
  if (readAt > 0) {
    for (const k of keys) {
      if (!k.startsWith('sentinel.event.')) continue
      const at = Number(k.slice(k.lastIndexOf('.') + 1))
      if (Number.isFinite(at) && at > readAt) newCount++
    }
  }
  return {
    rows,
    meta,
    settings: { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) },
    newCount,
  }
}

/** 未读事件数（独立轻量查询） */
export async function countNewEvents(readAt: number): Promise<number> {
  if (readAt <= 0) return 0
  const keys = await kvKeys()
  let n = 0
  for (const k of keys) {
    if (!k.startsWith('sentinel.event.')) continue
    const at = Number(k.slice(k.lastIndexOf('.') + 1))
    if (Number.isFinite(at) && at > readAt) n++
  }
  return n
}

export async function loadEvents(limit = 60, targetId?: string): Promise<SentinelEvent[]> {
  const keys = await kvKeys()
  let evKeys = keys.filter((k) => k.startsWith('sentinel.event.'))
  if (targetId) evKeys = evKeys.filter((k) => k.startsWith(K.eventPrefix(targetId)))
  evKeys.sort()
  evKeys = evKeys.slice(-limit).reverse()
  const events = await Promise.all(evKeys.map((k) => kvGet<SentinelEvent>(k)))
  return events.filter((e): e is SentinelEvent => !!e && typeof e === 'object').sort((a, b) => b.at - a.at)
}

export async function loadReadAt(): Promise<number> {
  const v = await kvGet<number>(K.readAt)
  return typeof v === 'number' ? v : 0
}

// ── 目标操作 ───────────────────────────────────────────────────────────────
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return 'w' + c.randomUUID().replace(/-/g, '').slice(0, 12)
  return 'w' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** 与服务端 normalizeTarget 同规则的客户端校验；返回错误消息或 null */
export function validateTarget(t: Partial<TargetDef>): string | null {
  if (!t.url || !/^https?:\/\//i.test(t.url.trim())) return 'URL 必须以 http(s):// 开头'
  const mode = t.mode || 'text'
  if (mode === 'selector' && !(t.selector || '').trim()) return 'CSS 选择器模式需要填写选择器'
  if (mode === 'regex' && !(t.regex || '').trim()) return '正则模式需要填写正则表达式'
  if (mode === 'json' && !(t.jsonPath || '').trim()) return 'JSON 模式需要填写取值路径'
  const cond = t.condition || 'any'
  if ((cond === 'contains' || cond === 'notContains') && !(t.keyword || '').trim()) return '该条件需要填写关键词'
  if ((cond === 'lt' || cond === 'gt') && !Number.isFinite(Number(t.threshold))) return '该条件需要填写数值阈值'
  return null
}

export async function saveTarget(t: TargetDef): Promise<void> {
  await kvSet(K.target(t.id), { ...t, updatedAt: Date.now() })
}

export async function triggerCheck(id: string): Promise<void> {
  await kvSet(K.cmdCheck(id), { op: 'check', at: Date.now() })
}

export async function removeTarget(id: string): Promise<void> {
  const keys = await kvKeys()
  const related = keys.filter((k) =>
    k === K.target(id) || k === K.state(id) || k === K.snap(id)
    || k.startsWith(K.eventPrefix(id)) || k === K.cmdCheck(id))
  await Promise.all(related.map((k) => kvDel(k)))
}

// ── 试抓（走服务命令通道，返回抽取预览）────────────────────────────────────
export interface TestFetchResult {
  ok: boolean
  text?: string
  status?: number
  error?: string
  elapsedMs?: number
}

export async function testFetch(spec: { url: string; mode: ExtractMode; selector?: string; regex?: string; jsonPath?: string }, onProgress?: (ms: number) => void): Promise<TestFetchResult> {
  const nonce = 'p' + uid().slice(1)
  await kvSet(K.cmdTest(nonce), { ...spec, at: Date.now() })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200))
    onProgress?.(Date.now())
    const r = await kvGet<TestFetchResult>(K.test(nonce)).catch(() => null)
    if (r) {
      kvDel(K.test(nonce)).catch(() => {})
      return r
    }
  }
  return { ok: false, error: '试抓超时：后台服务可能未运行（设置 → 插件 → 网页哨兵 查看服务状态）' }
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

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
export function timeAgo(ts?: number): string {
  if (!ts) return '从未'
  const d = Date.now() - ts
  if (d < 15 * 1000) return '刚刚'
  if (d < 60 * 1000) return `${Math.floor(d / 1000)} 秒前`
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}

export function inDelta(ts?: number): string {
  if (!ts) return '—'
  const d = ts - Date.now()
  if (d <= 0) return '即将'
  if (d < 60 * 1000) return `${Math.ceil(d / 1000)} 秒后`
  if (d < 3600 * 1000) return `${Math.ceil(d / 60000)} 分钟后`
  return `${Math.ceil(d / 3600000)} 小时后`
}

export function fmtInterval(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} 小时`
  if (sec % 60 === 0) return `${sec / 60} 分钟`
  return `${sec} 秒`
}

export function modeLabel(mode: ExtractMode, target?: TargetDef): string {
  if (mode === 'selector' && target?.selector) return `选择器 ${target.selector}`
  if (mode === 'regex' && target?.regex) return `正则 ${target.regex}`
  if (mode === 'json' && target?.jsonPath) return `JSON ${target.jsonPath}`
  return MODE_OPTIONS.find((m) => m.value === mode)?.label || mode
}

export function conditionLabel(t: TargetDef): string {
  switch (t.condition) {
    case 'contains': return `出现「${t.keyword}」`
    case 'notContains': return `消失「${t.keyword}」`
    case 'lt': return `低于 ${t.threshold}`
    case 'gt': return `高于 ${t.threshold}`
    default: return '内容变化'
  }
}
