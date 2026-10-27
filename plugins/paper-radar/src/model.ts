/**
 * 通信层 + 数据访问（论文雷达面板）
 *
 * 统一经宿主 invoke 通道调 router_dispatch；面板与后台服务、MCP server
 * 读写同一个 cap.kv（SqliteStorage domain=kv）的 paper.* 键空间。
 *
 * 键空间契约（与服务 service/paper-radar.js、MCP mcp/server.js、共享
 * shared/contract.js 四方一致，权威描述见 README）：
 *   paper.settings                全局设置（面板/MCP 写，服务读）
 *   paper.topics                  关注主题数组（面板/MCP 写，服务读）
 *   paper.feed.<YYYY-MM-DD>       某天抓取清单（服务写，面板/MCP 读）
 *   paper.fav.<arxivId>           收藏论文（面板/MCP 写）
 *   paper.meta                    服务心跳（服务写）
 */
import { getHostInvoke } from './host'

// ── 类型 ───────────────────────────────────────────────────────────────────
export interface Paper {
  id: string
  title: string
  url: string
  pdfUrl: string
  abstract: string
  authors: string[]
  categories: string[]
  published: number
  updated?: number
  score: number
  topMatches?: { topic: string; word: string; weight: number; hit: string }[]
  verdict?: string
}

export interface Topic {
  id: string
  name: string
  keywords: string[]
  enabled: boolean
  createdAt: number
}

export interface FeedDay {
  date: string
  generatedAt: number
  topicNames: string[]
  count: number
  items: Paper[]
}

export interface FavItem {
  id: string
  note: string
  read: boolean
  favoritedAt: number
  updatedAt: number
}

export interface PaperMeta {
  version?: string
  status?: string
  lastTickAt?: number
  lastScanAt?: number
  count?: number
  date?: string
  bridge?: string
}

export interface Settings {
  perTopic: number
  dailyTop: number
  scanHour: number
  scanIntervalHours: number
  maxFav: number
}

export const DEFAULT_SETTINGS: Settings = {
  perTopic: 15,
  dailyTop: 12,
  scanHour: 8,
  scanIntervalHours: 8,
  maxFav: 200,
}

// ── 键构造 ─────────────────────────────────────────────────────────────────
const PREFIX = 'paper.'
export const K = {
  settings: 'paper.settings',
  topics: 'paper.topics',
  feed: (d: string) => `paper.feed.${d}`,
  fav: (id: string) => `paper.fav.${id}`,
  meta: 'paper.meta',
}

// ── 通道 ───────────────────────────────────────────────────────────────────
interface DispatchResponse {
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
export async function loadTopics(): Promise<Topic[]> {
  const v = await kvGet<Topic[]>(K.topics)
  return Array.isArray(v) ? v : []
}

export async function loadSettings(): Promise<Settings> {
  const v = await kvGet<Partial<Settings>>(K.settings)
  return { ...DEFAULT_SETTINGS, ...(v && typeof v === 'object' ? v : {}) }
}

export async function loadMeta(): Promise<PaperMeta | null> {
  return kvGet<PaperMeta>(K.meta)
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function loadFeed(date: string = todayStr()): Promise<FeedDay | null> {
  const v = await kvGet<FeedDay>(K.feed(date))
  return v && Array.isArray(v.items) ? v : null
}

/** 最近 N 天（含今天）的榜单 */
export async function loadRecentFeeds(days = 7): Promise<FeedDay[]> {
  const out: FeedDay[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const f = await loadFeed(ds).catch(() => null)
    if (f && f.items.length) out.push(f)
  }
  return out
}

export interface FavRow { fav: FavItem; paper?: Paper }

/** 全部收藏（含已入库的论文元数据，若有 paper.detail.<id> 则带回） */
export async function loadFavs(): Promise<FavRow[]> {
  const keys = await kvKeys()
  const favKeys = keys.filter((k) => k.startsWith(PREFIX + 'fav.'))
  const rows: FavRow[] = []
  for (const k of favKeys) {
    const id = k.slice(PREFIX.length + 4)
    const fav = await kvGet<FavItem>(k).catch(() => null)
    if (!fav) continue
    rows.push({ fav, paper: undefined })
  }
  rows.sort((a, b) => b.fav.favoritedAt - a.fav.favoritedAt)
  return rows
}

export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return 't' + c.randomUUID().replace(/-/g, '').slice(0, 8)
  return 't' + Math.random().toString(36).slice(2, 10)
}

// ── 主题/收藏操作 ───────────────────────────────────────────────────────────
export async function saveTopics(topics: Topic[]): Promise<void> {
  await kvSet(K.topics, topics)
}

export async function addTopic(name: string, keywords: string[]): Promise<Topic> {
  const topics = await loadTopics()
  const topic: Topic = { id: uid(), name: name.trim() || '未命名', keywords, enabled: true, createdAt: Date.now() }
  topics.push(topic)
  await saveTopics(topics)
  return topic
}

export async function removeTopic(id: string): Promise<void> {
  const topics = await loadTopics()
  await saveTopics(topics.filter((t) => t.id !== id))
}

export async function toggleTopic(id: string, enabled: boolean): Promise<void> {
  const topics = await loadTopics()
  await saveTopics(topics.map((t) => (t.id === id ? { ...t, enabled } : t)))
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function favPaper(id: string, note: string, existing?: FavItem | null): Promise<void> {
  const now = Date.now()
  await kvSet(K.fav(id), {
    id,
    note: note.trim().slice(0, 2000),
    read: existing ? existing.read : false,
    favoritedAt: existing ? existing.favoritedAt : now,
    updatedAt: now,
  })
}

export async function toggleFavRead(id: string, read: boolean): Promise<void> {
  const f = await kvGet<FavItem>(K.fav(id))
  if (!f) return
  await kvSet(K.fav(id), { ...f, read, updatedAt: Date.now() })
}

export async function removeFav(id: string): Promise<void> {
  await kvDel(K.fav(id))
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

export function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}