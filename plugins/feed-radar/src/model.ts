/**
 * 通信层 + 数据访问（订阅雷达面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 radar.* 键空间。
 *
 * 键空间契约（与 service/radar.js、mcp/server.js 三方一致，权威描述见 README）：
 *   radar.feed.<fid>                     订阅源定义（面板/MCP 写；服务写运行态字段）
 *   radar.article.<fid>.<aid>            文章元数据（服务写新条目；面板/MCP 写 read/star + bump rev）
 *   radar.content.<aid>                  已拉取的正文（服务写）
 *   radar.settings                       全局设置（面板/MCP 写，服务读）
 *   radar.meta                           服务心跳（服务写）
 *   radar.cmd.*                          命令信箱（面板/MCP 写 → 服务消费即删）
 *
 * 缓存失效信号：feed.def 的 rev（任何写方递增）。面板靠「rev 变化→重读
 * 该源文章」替代全量逐键 GET；另有 90s 一次全量刷兜底（防 rev 丢失的极端并发）。
 */
import { getHostInvoke } from './host'

// ── 类型（与 service/lib.js normalizeFeed / planMerge 对齐）──────────────────
export interface RadarFeed {
  id: string
  url: string
  title: string
  siteUrl?: string
  category: string
  enabled: boolean
  intervalMin: number // 0 = 跟随全局 pollMin
  createdAt: number
  etag?: string
  lastModified?: string
  lastFetchAt: number
  lastStatus: 'ok' | 'error' | 'never'
  lastError?: string
  consecutiveErrors?: number
  itemCount: number
  unreadCount: number
  rev?: number
}

export interface RadarArticle {
  id: string
  feedId: string
  guid?: string
  link?: string
  title: string
  author?: string
  publishedAt: number
  excerpt?: string
  createdAt: number
  read: boolean
  star: boolean
}

export interface RadarContent {
  id: string
  ok: boolean
  title?: string
  text?: string
  error?: string
  fetchedAt: number
}

export interface RadarSettings {
  pollMin: number
  retentionDays: number
  maxPerFeed: number
  readKeepDays: number
  contentKeepHours: number
}

export interface RadarMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  feeds?: number
  enabledFeeds?: number
  unreadSum?: number
  settings?: Partial<RadarSettings>
}

export const DEFAULT_SETTINGS: RadarSettings = {
  pollMin: 15,
  retentionDays: 30,
  maxPerFeed: 120,
  readKeepDays: 14,
  contentKeepHours: 48,
}

export const SETTING_LIMITS: Record<keyof RadarSettings, [number, number]> = {
  pollMin: [10, 240],
  retentionDays: [7, 365],
  maxPerFeed: [30, 500],
  readKeepDays: [3, 180],
  contentKeepHours: [8, 240],
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
  feed: (id: string) => `radar.feed.${id}`,
  feedPrefix: 'radar.feed.',
  article: (fid: string, aid: string) => `radar.article.${fid}.${aid}`,
  articlePrefix: 'radar.article.',
  content: (aid: string) => `radar.content.${aid}`,
  contentPrefix: 'radar.content.',
  settings: 'radar.settings',
  meta: 'radar.meta',
  cmdRefreshAll: (n: string) => `radar.cmd.refreshAll.${n}`,
  cmdRefreshFeed: (fid: string) => `radar.cmd.refreshFeed.${fid}`,
  cmdPull: (aid: string) => `radar.cmd.pull.${aid}`,
  cmdForget: (fid: string) => `radar.cmd.forget.${fid}`,
  cmdPurge: (n: string) => `radar.cmd.purge.${n}`,
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

// ── 数据加载（增量：rev 变化的源才重读文章键）──────────────────────────────
export interface RadarData {
  feeds: RadarFeed[]
  articles: RadarArticle[] // 当前缓存的全部文章（增量合并）
  meta: RadarMeta | null
  settings: RadarSettings
  unreadTotal: number
}

export interface CacheState {
  /** fid → 已读到的 {rev, unread}（rev 不变 + unread 不变 → 不重读该源文章键） */
  seen: Map<string, { rev: number; unread: number }>
  /** aid → article 当前缓存 */
  articles: Map<string, RadarArticle>
  lastFullAt: number
}

export function newCache(): CacheState {
  return { seen: new Map(), articles: new Map(), lastFullAt: 0 }
}

const FULL_REFRESH_MS = 90 * 1000

/** 一轮增量加载：feed 定义全读（≤ 数百键、轻量）；文章键按 rev 失效读 */
export async function loadRadar(cache: CacheState): Promise<RadarData> {
  const [keys, rawMeta, rawSettings] = await Promise.all([
    kvKeys(),
    kvGet<RadarMeta>(K.meta),
    kvGet<RadarSettings>(K.settings),
  ])

  const feedKeys = keys.filter((k) => k.startsWith(K.feedPrefix))
  const feeds: RadarFeed[] = []
  const forceFull = cache.lastFullAt === 0 || Date.now() - cache.lastFullAt > FULL_REFRESH_MS
  const refetchFeeds = new Set<string>()

  const defs = await Promise.all(feedKeys.map(async (k) => {
    const v = await kvGet<RadarFeed>(k).catch(() => null)
    return v && typeof v === 'object' && v.id ? v : null
  }))
  for (const f of defs) {
    if (!f) continue
    feeds.push(f)
    const prev = cache.seen.get(f.id)
    const cur = { rev: Number(f.rev) || 1, unread: Number(f.unreadCount) || 0 }
    if (!prev || prev.rev !== cur.rev || prev.unread !== cur.unread) refetchFeeds.add(f.id)
    cache.seen.set(f.id, cur)
  }
  // 已消失的 feed：其文章从缓存移除
  const aliveFeed = new Set(feeds.map((f) => f.id))
  for (const aid of [...cache.articles.keys()]) {
    const a = cache.articles.get(aid)
    if (a && !aliveFeed.has(a.feedId)) cache.articles.delete(aid)
  }

  // 文章键（rev 失效 或 全量兜底）
  const articleKeysAll = keys.filter((k) => k.startsWith(K.articlePrefix))
  const wanted = forceFull
    ? articleKeysAll
    : articleKeysAll.filter((k) => {
      const fid = k.slice(K.articlePrefix.length).split('.')[0]
      return refetchFeeds.has(fid)
    })
  if (forceFull) cache.lastFullAt = Date.now()
  const raws = await Promise.all(wanted.map(async (k) => {
    const v = await kvGet<RadarArticle & { _key?: string }>(k).catch(() => null)
    return v && typeof v === 'object' && v.id ? { a: v, k } : null
  }))
  for (const r of raws) {
    if (!r) continue
    const a = r.a
    cache.articles.set(a.id, { ...a, read: !!a.read, star: !!a.star })
  }

  const articles = [...cache.articles.values()].sort((x, y) => (y.publishedAt || y.createdAt || 0) - (x.publishedAt || x.createdAt || 0))
  const unreadTotal = articles.reduce((s, a) => s + (a.read ? 0 : 1), 0)
  return {
    feeds,
    articles,
    meta: rawMeta && typeof rawMeta === 'object' ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) },
    unreadTotal,
  }
}

// ── 数据访问层（订阅雷达面板）─────────────────────────────────────────────
// 纯逻辑与 id 计算三方共享同一实现（shared/sha256），保证「面板加的源」
// 与「AI 加的源」「服务抓的条目」键名完全一致（panel / mcp / service 三方一致）。
import { sha256Hex } from '../shared/sha256'

// 与 service/lib.js 相同的 id 规则（panel 侧使用；服务端同规则）
export function feedIdFor(url: string): string {
  return 'f' + sha256Hex(url.trim().toLowerCase()).slice(0, 10)
}

export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 12)
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export async function addFeed(url: string, opts?: { title?: string; category?: string; intervalMin?: number }): Promise<string> {
  const fid = feedIdFor(url)
  const existing = await kvGet<RadarFeed>(K.feed(fid))
  // 已存在的源：保留运行态字段，仅按传入覆盖展示字段（同一 URL 幂等，不产生双份）
  const base: Partial<RadarFeed> & Record<string, unknown> = existing ? {
    id: fid,
    url,
    title: opts?.title || existing.title,
    category: opts?.category || '',
    intervalMin: opts?.intervalMin || 0,
    siteUrl: existing.siteUrl || '',
    enabled: existing.enabled,
    createdAt: existing.createdAt,
    lastFetchAt: existing.lastFetchAt || 0,
    lastStatus: existing.lastStatus || 'never',
    itemCount: existing.itemCount || 0,
    unreadCount: existing.unreadCount || 0,
    rev: existing.rev || 1,
  } : {
    id: fid,
    url,
    title: opts?.title || '',
    category: opts?.category || '',
    intervalMin: opts?.intervalMin || 0,
    enabled: true,
    createdAt: Date.now(),
    lastFetchAt: 0,
    lastStatus: 'never',
    itemCount: 0,
    unreadCount: 0,
    rev: 1,
  }
  await kvSet(K.feed(fid), base)
  return fid
}

export async function saveFeedFields(fid: string, patch: Partial<RadarFeed>): Promise<void> {
  const f = await kvGet<RadarFeed>(K.feed(fid))
  if (!f) throw new Error('订阅源不存在或已被删除')
  await kvSet(K.feed(fid), { ...f, ...patch })
}

export async function removeFeed(fid: string): Promise<number> {
  const keys = await kvKeys()
  const artKeys = keys.filter((k) => k.startsWith(`${K.articlePrefix}${fid}.`))
  const aids = new Set(artKeys.map((k) => k.split('.').pop() || ''))
  await kvDel(K.feed(fid))
  for (const k of artKeys) await kvDel(k)
  for (const aid of aids) if (aid) await kvDel(K.content(aid)).catch(() => {})
  await kvSet(K.cmdForget(fid), { op: 'forget', fid, at: Date.now() })
  return artKeys.length
}

// ── 文章操作 ───────────────────────────────────────────────────────────────
export async function markArticle(article: RadarArticle, patch: { read?: boolean; star?: boolean }): Promise<void> {
  const key = K.article(article.feedId, article.id)
  const now = await kvGet<RadarArticle>(key)
  if (!now || typeof now !== 'object') throw new Error('文章已被清理')
  const upd: RadarArticle = { ...now, ...patch, read: patch.read === undefined ? !!now.read : !!patch.read, star: patch.star === undefined ? !!now.star : !!patch.star }
  await kvSet(key, upd)
  // 写者协议：动了一下文章 → bump feed.rev（跨设备文章缓存刷新的信号）
  const f = await kvGet<RadarFeed>(K.feed(article.feedId)).catch(() => null)
  if (f) await kvSet(K.feed(article.feedId), { ...f, rev: (Number(f.rev) || 1) + 1 }).catch(() => {})
}

/** 正文拉取（阅读视图）：missing → 命令信箱 + 轮询（§ 与 MCP 服务同流程） */
export async function pullContent(aid: string): Promise<RadarContent | null> {
  const existing = await kvGet<RadarContent>(K.content(aid))
  if (existing && (existing.ok || existing.error)) return existing
  await kvSet(K.cmdPull(aid), { op: 'pull', id: aid, at: Date.now() })
  const t0 = Date.now()
  while (Date.now() - t0 < 25000) {
    await sleep(1200)
    const c = await kvGet<RadarContent>(K.content(aid))
    if (c && (c.ok || c.error)) return c
  }
  return null
}

export async function loadSettings(): Promise<RadarSettings | null> {
  const s = await kvGet<RadarSettings>(K.settings)
  return s && typeof s === 'object' ? { ...DEFAULT_SETTINGS, ...s } : null
}

export async function saveSettings(s: RadarSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function refreshAll(): Promise<void> {
  await kvSet(K.cmdRefreshAll(uid()), { op: 'refreshAll', at: Date.now() })
}

export async function refreshFeed(fid: string): Promise<void> {
  await kvSet(K.cmdRefreshFeed(fid), { op: 'refreshFeed', fid, at: Date.now() })
}

export async function purgeArticles(): Promise<void> {
  await kvSet(K.cmdPurge(uid()), { op: 'purge', at: Date.now() })
}

// ── OPML（浏览器原生 DOMParser 解析；导出串拼装）────────────────────────────
export interface OpmlResult { ok: number; skip: number; categories: number }

export function parseOpml(text: string): { found: number; error: string } {
  try {
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    if (!doc.querySelector('opml')) return { found: 0, error: '不是 OPML 文件（缺 <opml> 根）' }
    const outlines = doc.querySelectorAll('outline[xmlUrl]')
    return { found: outlines.length, error: '' }
  } catch (e) {
    return { found: 0, error: `OPML 解析失败：${(e as Error).message}` }
  }
}

/** 导入：逐 outline（含分组 text 属性作为 category）幂等添加源；返回 {导入数, 跳过数, 分组数} */
export async function importOpml(text: string): Promise<OpmlResult> {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (!doc.querySelector('opml')) throw new Error('不是 OPML 文件（缺 <opml> 根）')
  let ok = 0
  let skip = 0
  const cats = new Set<string>()
  const seen = new Set<string>()
  // outline 嵌套分组：子级 xmlUrl 归到最近带 title 的祖先分组；同一文件内重复 URL 只导一次
  const walk = async (el: Element, parentCat: string): Promise<void> => {
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== 'outline') continue
      const xmlUrl = child.getAttribute('xmlUrl') || child.getAttribute('xmlurl') || ''
      const title = child.getAttribute('title') || child.getAttribute('text') || ''
      if (xmlUrl) {
        const url = xmlUrl.trim()
        if (!/^https?:\/\//i.test(url)) { skip++; continue }
        const fid = feedIdFor(url)
        if (seen.has(fid)) { skip++; continue }
        seen.add(fid)
        if (parentCat) cats.add(parentCat)
        await addFeed(url, { title: title.slice(0, 60), category: parentCat })
        ok++
      } else if (title) {
        await walk(child, title.slice(0, 24))
      }
    }
  }
  await walk(doc.querySelector('body') || doc.documentElement, '')
  return { ok, skip, categories: cats.size }
}

export function buildOpml(feeds: { title: string; url: string; category: string }[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const byCat = new Map<string, { title: string; url: string }[]>()
  for (const f of feeds) {
    const c = (f.category || '未分类').slice(0, 24)
    const arr = byCat.get(c) || []
    arr.push(f)
    byCat.set(c, arr)
  }
  let body = ''
  for (const [cat, arrs] of byCat) {
    if (byCat.size > 1) body += `    <outline text="${esc(cat)}" title="${esc(cat)}">\n`
    for (const f of arrs) {
      body += `      <outline type="rss" text="${esc(f.title || f.url)}" title="${esc(f.title || f.url)}" xmlUrl="${esc(f.url)}"/>\n`
    }
    if (byCat.size > 1) body += '    </outline>\n'
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>feed-radar 导出</title></head>\n  <body>\n${body}  </body>\n</opml>`
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

export function hostOf(u?: string): string {
  try { return u ? new URL(u).host : '' } catch (_) { return '' }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

export const SERVICE_ID = 'radar-service'

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
