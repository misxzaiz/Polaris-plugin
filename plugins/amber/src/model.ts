/**
 * 通信层 + 数据访问（网页封存面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 amber.* 键空间。
 *
 * 键空间契约（与 service/amber.js、mcp/server.js 三方一致，权威描述见 README）：
 *   amber.item.<id>    条目元数据（服务写封存结果；面板/MCP 写 read/star/tags + pending 登记）
 *   amber.body.<id>    封存正文快照（服务独写；Markdown-lite 文本）
 *   amber.quote.<qid>  金句摘录（面板/MCP 写；qid = sha256(itemId|text) 前 10 位，跨写者去重）
 *   amber.settings     设置（面板/MCP 写，服务读）
 *   amber.meta         服务心跳（服务写）
 *   amber.cmd.*        命令信箱（面板/MCP 写 → 服务消费即删）
 *   amber.search.<n>   检索结果槽（服务写，调用方读后删）
 *
 * 缓存策略：条目键每轮全读（收藏量级 ≤ 数百、每键 <1KB）；正文按需读。
 */
import { getHostInvoke } from './host'
import { sha256Hex } from '../shared/sha256'

// ── 类型（与 service/lib.js normalizeItem / applySealResult 对齐）────────────
export interface AmberItem {
  id: string
  url: string
  host: string
  title: string
  byline?: string
  publishedAt: number
  excerpt: string
  img?: string
  wordCount: number
  tags: string[]
  star: boolean
  read: boolean
  status: 'pending' | 'ok' | 'error'
  error?: string
  sealedAt: number
  firstSealedAt: number
  sealCount: number
  createdAt: number
  rev?: number
}

export interface AmberBody {
  id: string
  ok: boolean
  title?: string
  text?: string
  charset?: string
  bytes?: number
  sealNo?: number
  error?: string
  fetchedAt: number
}

export interface AmberQuote {
  qid: string
  itemId: string
  itemTitle: string
  itemHost: string
  text: string
  note: string
  createdAt: number
}

export interface AmberSettings {
  sweepEnabled: boolean
  keepDays: number
  maxItems: number
}

export interface AmberMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  items?: number
  pending?: number
  errors?: number
  unread?: number
  starred?: number
  quotes?: number
  settings?: Partial<AmberSettings>
}

export interface AmberSearchHit {
  id: string
  title: string
  host: string
  score: number
  snippet: string
}

export interface AmberSearchResult {
  q: string
  total?: number
  hits?: AmberSearchHit[]
  error?: string
  doneAt: number
}

export const DEFAULT_SETTINGS: AmberSettings = {
  sweepEnabled: false,
  keepDays: 90,
  maxItems: 0,
}

export const SETTING_LIMITS: Record<'keepDays' | 'maxItems', [number, number]> = {
  keepDays: [7, 3650],
  maxItems: [0, 5000],
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
  item: (id: string) => `amber.item.${id}`,
  itemPrefix: 'amber.item.',
  body: (id: string) => `amber.body.${id}`,
  bodyPrefix: 'amber.body.',
  quotePrefix: 'amber.quote.',
  settings: 'amber.settings',
  meta: 'amber.meta',
  cmdAmberize: (n: string) => `amber.cmd.amberize.${n}`,
  cmdRefresh: (id: string) => `amber.cmd.refresh.${id}`,
  cmdPurge: (n: string) => `amber.cmd.purge.${n}`,
  cmdSearch: (n: string) => `amber.cmd.search.${n}`,
  search: (n: string) => `amber.search.${n}`,
}

/** 面板侧稳定 id：与服务/MCP 同一规则（shared/sha256，UTF-8 一致性由其保证） */
export function itemIdFor(url: string): string {
  return 'b' + sha256Hex(String(url).trim()).slice(0, 12)
}

/** 摘录 qid：itemId+内容哈希（与 MCP 同规则 → 跨写者去重） */
export function quoteIdFor(itemId: string, text: string): string {
  return 'q' + sha256Hex(`${itemId}|${text}`).slice(0, 10)
}

// ── 通道 ─────────────────────────────────────────────────────────────────────
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

// ── 数据加载（每轮全读 item/quote 键；body 按需）────────────────────────────
export interface AmberData {
  items: AmberItem[]
  quotes: AmberQuote[]
  meta: AmberMeta | null
  settings: AmberSettings
}

export async function loadAmber(): Promise<AmberData> {
  const [keys, rawMeta, rawSettings] = await Promise.all([
    kvKeys(),
    kvGet<AmberMeta>(K.meta),
    kvGet<AmberSettings>(K.settings),
  ])

  const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix))
  const quoteKeys = keys.filter((k) => k.startsWith(K.quotePrefix))
  const [itemVals, quoteVals] = await Promise.all([
    Promise.all(itemKeys.map(async (k) => kvGet<AmberItem>(k).catch(() => null))),
    Promise.all(quoteKeys.map(async (k) => kvGet<AmberQuote>(k).catch(() => null))),
  ])
  const items = itemVals.filter((v): v is AmberItem => !!v && typeof v === 'object' && !!v.id)
  items.sort((a, b) => (b.sealedAt || b.createdAt || 0) - (a.sealedAt || a.createdAt || 0))
  const quotes = quoteVals.filter((v): v is AmberQuote => !!v && typeof v === 'object' && !!v.qid)
  quotes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  const settings = { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) }
  return { items, quotes, meta: rawMeta && typeof rawMeta === 'object' ? rawMeta : null, settings }
}

// ── 写操作 ─────────────────────────────────────────────────────────────────
/** 封存：登记 pending 条目（幂等）+ 下发命令信箱 */
export async function sealUrl(url: string, tags?: string): Promise<void> {
  const trimmed = String(url || '').trim()
  if (!trimmed) throw new Error('URL 为空')
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed.replace(/^\/+/, '')
  const id = itemIdFor(normalized)
  const prev = await kvGet<AmberItem>(K.item(id)).catch(() => null)
  const item: AmberItem = {
    id,
    url: normalized,
    host: hostOf(normalized),
    title: (prev && prev.title) || '',
    byline: (prev && prev.byline) || '',
    publishedAt: (prev && prev.publishedAt) || 0,
    excerpt: (prev && prev.excerpt) || '',
    img: (prev && prev.img) || '',
    wordCount: (prev && prev.wordCount) || 0,
    tags: tags ? tags.split(/[,，;；\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8) : ((prev && prev.tags) || []),
    star: (prev && prev.star) || false,
    read: (prev && prev.read) || false,
    status: 'pending',
    error: '',
    sealedAt: (prev && prev.sealedAt) || 0,
    firstSealedAt: (prev && prev.firstSealedAt) || 0,
    sealCount: (prev && prev.sealCount) || 0,
    createdAt: (prev && prev.createdAt) || Date.now(),
    rev: ((prev && prev.rev) || 1) + 1,
  }
  await kvSet(K.item(id), item)
  await kvSet(K.cmdAmberize(nonce12()), { op: 'amberize', url: normalized, tags: item.tags, at: Date.now() })
}

/** 重封存（更新快照） */
export async function reSeal(id: string): Promise<void> {
  await kvSet(K.cmdRefresh(id), { op: 'refresh', id, at: Date.now() })
}

/** 面板/MCP 写用户状态（bump rev） */
export async function markItem(item: AmberItem, patch: Partial<Pick<AmberItem, 'read' | 'star' | 'tags'>>): Promise<void> {
  const upd = { ...item, ...patch, rev: (Number(item.rev) || 1) + 1 }
  await kvSet(K.item(item.id), upd)
}

/** 读正文快照 */
export async function readBody(id: string): Promise<AmberBody | null> {
  return await kvGet<AmberBody>(K.body(id))
}

/** 存摘录（内容级去重：同条同文重复存返回 false） */
export async function addQuote(item: AmberItem | null, itemId: string, text: string, note: string): Promise<boolean> {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('摘录内容为空')
  const qid = quoteIdFor(itemId, trimmed)
  const existing = await kvGet(K.quotePrefix + qid).catch(() => null)
  if (existing) return false
  const quote: AmberQuote = {
    qid,
    itemId,
    itemTitle: (item && item.title) || '',
    itemHost: (item && item.host) || '',
    text: trimmed.slice(0, 2000),
    note: String(note || '').trim().slice(0, 500),
    createdAt: Date.now(),
  }
  await kvSet(K.quotePrefix + qid, quote)
  return true
}

export async function delQuote(qid: string): Promise<void> {
  await kvDel(K.quotePrefix + qid)
}

/** 删条目（联动 body + 该条摘录 + forget 兜底命令） */
export async function deleteItem(id: string): Promise<void> {
  const keys = await kvKeys()
  const quoteKeys = keys.filter((k) => k.startsWith(K.quotePrefix))
  const related: string[] = []
  for (const k of quoteKeys) {
    const v = await kvGet<AmberQuote>(k).catch(() => null)
    if (v && v.itemId === id) related.push(k)
  }
  await Promise.all([kvDel(K.item(id)), kvDel(K.body(id)), ...related.map(kvDel)].map((p) => p.catch(() => {})))
  await kvSet(`amber.cmd.forget.${id}`, { op: 'forget', id, at: Date.now() }).catch(() => {})
}

/** 全文检索（命令信箱 + 轮询结果槽；读后删槽） */
export async function fullSearch(q: string, limit: number, waitSec = 25): Promise<AmberSearchResult | null> {
  const n = nonce12()
  await kvSet(K.cmdSearch(n), { op: 'search', q, limit, at: Date.now() })
  const t0 = Date.now()
  while (Date.now() - t0 < waitSec * 1000) {
    await sleep(1600)
    const r = await kvGet<AmberSearchResult>(K.search(n)).catch(() => null)
    if (r && typeof r === 'object' && (r.doneAt || r.error)) {
      await kvDel(K.search(n)).catch(() => {})
      return r
    }
  }
  return null
}

export async function saveSettings(s: AmberSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function purgeAll(): Promise<void> {
  await kvSet(K.cmdPurge(nonce12()), { op: 'purge', at: Date.now() })
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

export const SERVICE_ID = 'amber-service'

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
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function nonce12(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function hostOf(u?: string): string {
  try { return u ? new URL(u).host.toLowerCase() : '' } catch (_) { return '' }
}

export function timeStr(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function timeAgo(ts?: number): string {
  if (!ts) return ''
  const d = Date.now() - ts
  if (d < 0) return '刚刚'
  if (d < 60 * 1000) return `${Math.floor(d / 1000)} 秒前`
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}
