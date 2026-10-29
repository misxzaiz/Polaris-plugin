/**
 * 通信层 + 数据访问（文本接力面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 relay.* 键空间。
 *
 * 键空间契约（与 service/relay.js、mcp/server.js 三方一致，权威描述见 README）：
 *   relay.item.<id>    接力条目（面板/MCP 写；服务只回写 enrich 字段）
 *   relay.settings     设置（面板/MCP 写，服务读）
 *   relay.meta         服务心跳（服务写）
 *   relay.readAt       未读水位（面板写）
 *
 * 写路径约定：条目创建走 normalizeItem 同规则（此处与服务/mcp 各自实现
 * 同一校验，三方行为一致）；服务对条目只有 enrich 字段回写一个动作。
 */
import { getHostInvoke } from './host'

// ── 类型（与 service/lib.js normalizeItem 对齐）────────────────────────────
export type ItemKind = 'url' | 'text'

export interface RelayItem {
  id: string
  text: string
  kind: ItemKind
  url?: string
  title?: string
  desc?: string
  from: string
  createdAt: number
  pinned: boolean
  enriched: boolean
  enrichTries?: number
  enrichFail?: string
}

export interface RelaySettings {
  maxItems: number
  retentionDays: number
  sweepMs: number
  urlEnrich: boolean
}

export interface RelayMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  settings?: { maxItems: number; retentionDays: number; urlEnrich: boolean }
}

export const DEFAULT_SETTINGS: RelaySettings = {
  maxItems: 100,
  retentionDays: 14,
  sweepMs: 600000,
  urlEnrich: true,
}

export const TEXT_CAP = 8000

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
  item: (id: string) => `relay.item.${id}`,
  itemPrefix: 'relay.item.',
  settings: 'relay.settings',
  meta: 'relay.meta',
  readAt: 'relay.readAt',
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
export interface BoardData {
  items: RelayItem[]
  meta: RelayMeta | null
  settings: RelaySettings
  /** createdAt > readAt 的条目数（readAt<=0 时不计） */
  newCount: number
}

export async function loadBoard(readAt = 0): Promise<BoardData> {
  const [keys, rawMeta, rawSettings] = await Promise.all([
    kvKeys(),
    kvGet<RelayMeta>(K.meta),
    kvGet<RelaySettings>(K.settings),
  ])
  const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix))
  const items = await Promise.all(itemKeys.map(async (k) => {
    const v = await kvGet<RelayItem>(k).catch(() => null)
    return v && typeof v === 'object' && typeof v.id === 'string' ? v : null
  }))
  const live = items.filter((v): v is RelayItem => v !== null).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  let newCount = 0
  if (readAt > 0) {
    for (const it of live) {
      if ((it.createdAt || 0) > readAt) newCount++
    }
  }
  return {
    items: live,
    meta: rawMeta && typeof rawMeta === 'object' ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) },
    newCount,
  }
}

// ── 本端设备标签（UA 判定，无需持久化——同设备类型标签恒定）──────────────────
export function deviceLabel(): string {
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return '手机'
  return '桌面'
}

export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return 'i' + c.randomUUID().replace(/-/g, '').slice(0, 12)
  return 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** 与服务端 normalizeItem 同规则的客户端校验；返回错误消息或 null */
export function validateText(text: string): string | null {
  const t = text.trim()
  if (!t) return '内容为空'
  if (t.length > TEXT_CAP) return `内容过长（${t.length} > ${TEXT_CAP} 字符）`
  return null
}

export function detectKind(text: string): ItemKind {
  const t = text.trim()
  if (!t || /\s/.test(t)) return 'text'
  return /^https?:\/\/\S+$/i.test(t) ? 'url' : 'text'
}

// ── 条目操作 ───────────────────────────────────────────────────────────────
export async function pushItem(text: string, from?: string): Promise<RelayItem> {
  const t = text.trim()
  const verr = validateText(t)
  if (verr) throw new Error(verr)
  const item: RelayItem = {
    id: uid(),
    text: t,
    kind: detectKind(t),
    from: (from || deviceLabel()).slice(0, 24),
    createdAt: Date.now(),
    pinned: false,
    enriched: false,
  }
  if (item.kind === 'url') item.url = t
  await kvSet(K.item(item.id), item)
  return item
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  const it = await kvGet<RelayItem>(K.item(id))
  if (!it || typeof it !== 'object') throw new Error('条目不存在或已被清理')
  await kvSet(K.item(id), { ...it, pinned })
}

export async function removeItem(id: string): Promise<void> {
  await kvDel(K.item(id))
}

export async function clearAll(): Promise<number> {
  const keys = await kvKeys()
  const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix))
  await Promise.all(itemKeys.map((k) => kvDel(k)))
  await kvDel(K.readAt).catch(() => {})
  return itemKeys.length
}

export async function loadReadAt(): Promise<number> {
  const v = await kvGet<number>(K.readAt)
  return typeof v === 'number' ? v : 0
}

export async function markAllRead(): Promise<void> {
  await kvSet(K.readAt, Date.now())
}

// ── 复制（含不安全源回退）───────────────────────────────────────────────────
/**
 * 手机经 http://LAN:port 访问时页面不是安全上下文，navigator.clipboard
 * 不存在——writeText 会抛错。此时回退到"手动复制"：调用方弹出可全选的
 * textarea。返回 'ok' | 'manual'（manual = 需要用户手动复制）。
 */
export async function copyText(text: string): Promise<'ok' | 'manual'> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return 'ok'
    }
  } catch (_) { /* 权限拒绝/非安全上下文 → 回退 */ }
  return 'manual'
}

/** 系统打开链接（尽力而为：面板内 window.open，宿主拦截则失败提示复制） */
export function openUrl(url: string): boolean {
  try {
    const w = window.open(url, '_blank', 'noopener')
    return !!w
  } catch (_) {
    return false
  }
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

export const SERVICE_ID = 'relay-service'

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
export function timeStr(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
  if (sameDay) return hm
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function timeAgo(ts?: number): string {
  if (!ts) return '从未'
  const d = Date.now() - ts
  if (d < 60 * 1000) return `${Math.floor(d / 1000)} 秒前`
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}
