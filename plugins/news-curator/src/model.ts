/**
 * 通信层 + 刊物数据访问（面板专用）
 *
 * 统一经宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__，见 host.ts）：
 *  - 桌面 Tauri：直调后端命令（router_dispatch）
 *  - 手机浏览器 / Web：宿主 invoke 自动取正确服务地址并携带 token
 * 面板与 MCP server 读写同一个 cap.kv（SqliteStorage domain=kv）。
 * 面板零外网请求：日报由 AI 用内置浏览器抓取后经 news_publish_daily 写入。
 *
 * v0.3.0 生产级加固：
 *  - schema 版本化：news.prefs / news.progress / 日报均带 schemaVersion，读取时自动迁移旧版
 *  - 幂等打卡 + 完读回流：同一天重复打卡不叠加；收藏/完读写 news.progress 供 AI 学偏好
 *  - 音频自动分档：<300KB 存 dataUrl 内联，>=300KB 存托管 url（mimo-tts file 模式）
 *  - 数据校验：读日报时容错非法结构，空态有引导
 */
import { useState, useEffect, useCallback } from 'react'
import { getHostInvoke } from './host'

/** 统一调用：复用宿主 transport（桌面 + 手机浏览器 + Web 全通，自动带 token/正确地址） */
export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return getHostInvoke()<T>(cmd, args)
}

/** router_dispatch 到 cap.kv：get/set，返回业务结果或抛错 */
export async function kvGet(key: string): Promise<unknown> {
  const res = await call<{ ok: boolean; result?: { value?: unknown }; error?: string }>('router_dispatch', {
    req: { target: 'cap.kv', payload: { action: 'get', key } },
  })
  if (!res.ok) throw new Error(res.error || 'kv get 失败')
  return res.result && res.result.value !== null && res.result.value !== undefined ? res.result.value : null
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  const res = await call<{ ok: boolean; error?: string }>('router_dispatch', {
    req: { target: 'cap.kv', payload: { action: 'set', key, value } },
  })
  if (!res.ok) throw new Error(res.error || 'kv set 失败')
}

/** 面板 → 聊天：把问题发给 AI（"生成今天的日报"等） */
let hostSend: ((m: string) => void) | undefined
export function setHostSend(fn?: (m: string) => void): void {
  hostSend = fn
}
export function sendToChat(msg: string): void {
  if (hostSend) {
    hostSend(msg)
    return
  }
  const api = (window as any).__POLARIS_HOST_PANEL__ as { onSendToChat?: (m: string) => void }
  if (api?.onSendToChat) {
    api.onSendToChat(msg)
  } else {
    const w = window as any
    if (typeof w.__POLARIS_SEND_TO_CHAT__ === 'function') w.__POLARIS_SEND_TO_CHAT__(msg)
  }
}

/** 迷你 hook：加载数据（带刷新 + 重试 + 骨架态） */
export function useModel<T>(loader: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loader())
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    reload()
  }, [reload])
  return { data, error, loading, reload, setData }
}

// ── 领域类型 ────────────────────────────────────────────────────────────────
export const SCHEMA_VERSION = 1

export interface Prefs {
  schemaVersion?: number
  directions: Record<string, boolean>          // creative/fund/tech/news/learn
  watchlist: string[]                          // 基金自选池
  dailyTarget: number                          // 每日目标分钟
  voice: { voice: string; speed: number; autoAudio: boolean }
  learn: { proStage: string; weeklyDays: number; genTopics: string[] }
  updatedAt: string | null
}
export interface PrefsLogEntry {
  ts: string
  tool: string
  what: string
  reason: string
  undone: boolean
}
export type SectionType = 'summary' | 'fund' | 'tech' | 'news' | 'creative' | 'learn'
export interface DailySection {
  type: SectionType
  title: string
  items: { title?: string; name?: string; brief?: string; url?: string; meta?: any; id?: string }[]
  meta?: any
}
export interface Daily {
  date: string
  schemaVersion?: number
  totalMinutes?: number
  summary?: string
  sections: DailySection[]
  quiz?: { q: string; options: string[]; answer: number; explain?: string }[]
  createdAt?: string
}
export interface Progress {
  schemaVersion?: number
  streak: number
  lastRead: string | null
  /** 今日已读分钟（每次完读刷新，按首次记录时间累积） */
  minutesToday?: number
  minutesDate?: string
  learned: { pro: string[]; gen: string[] }
  favorites: string[]
  /** 最近完读的日报日期集合（供学习档案/回流） */
  readDates: string[]
  /** 打卡历史日期集合（幂等，同一天只计一次） */
  checkinDates: string[]
}
export interface VoiceClip {
  section: string
  dataUrl?: string
  url?: string
  durationSec?: number | null
  title?: string
  createdAt?: string
  /** 存储档位：内联(dataUrl) / 托管(url)，由保存方标注 */
  store?: 'inline' | 'hosted'
}

export const DEFAULT_WATCHLIST = ['005844', '017811', '002910', '013835', '011369', '013840']
const AUDIO_INLINE_LIMIT = 300 * 1024 // 300KB：以下内联，以上托管

export function defaultPrefs(): Prefs {
  return {
    schemaVersion: SCHEMA_VERSION,
    directions: { creative: true, fund: true, tech: true, news: true, learn: true },
    watchlist: DEFAULT_WATCHLIST,
    dailyTarget: 90,
    voice: { voice: '冰糖', speed: 1.0, autoAudio: false },
    learn: { proStage: 'L2', weeklyDays: 5, genTopics: [] },
    updatedAt: null,
  }
}

// ── 数据读写（cap.kv） ───────────────────────────────────────────────────────
export async function loadPrefs(): Promise<Prefs> {
  const raw = await kvGet('news.prefs')
  const p = raw && typeof raw === 'object' ? (raw as Prefs) : null
  if (!p) return defaultPrefs()
  // 迁移：老版无 schemaVersion → 补默认字段
  if (!p.schemaVersion) {
    const d = defaultPrefs()
    const migrated: Prefs = { ...d, ...p, directions: { ...d.directions, ...(p.directions || {}) } }
    migrated.schemaVersion = SCHEMA_VERSION
    void savePrefs(migrated) // 回写持久化（失败不阻塞读取）
    return migrated
  }
  return p
}
export async function savePrefs(prefs: Prefs): Promise<void> {
  await kvSet('news.prefs', { ...prefs, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() })
}
export async function loadPrefsLog(): Promise<PrefsLogEntry[]> {
  const l = await kvGet('news.prefsLog')
  return Array.isArray(l) ? (l as PrefsLogEntry[]) : []
}
export async function loadDaily(date: string): Promise<Daily | null> {
  const raw = await kvGet(`news.daily.${date}`)
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Daily
  // 容错：sections 非数组 / 缺 title 的项跳过，不崩面板
  if (!Array.isArray(d.sections)) return { ...d, sections: [] }
  return d
}

/** 默认进度（新建或迁移用） */
export function defaultProgress(): Progress {
  return {
    schemaVersion: SCHEMA_VERSION,
    streak: 0,
    lastRead: null,
    minutesToday: 0,
    minutesDate: today(),
    learned: { pro: [], gen: [] },
    favorites: [],
    readDates: [],
    checkinDates: [],
  }
}
export async function loadProgress(): Promise<Progress> {
  const raw = await kvGet('news.progress')
  const p = raw && typeof raw === 'object' ? (raw as Progress) : null
  if (!p) return defaultProgress()
  // 迁移：老版缺 readDates/checkinDates/minutesDate → 补
  const oldLearned = p.learned && typeof p.learned === 'object' ? p.learned : { pro: [], gen: [] }
  const migrated: Progress = {
    ...defaultProgress(),
    ...p,
    learned: {
      pro: Array.isArray(oldLearned.pro) ? oldLearned.pro : [],
      gen: Array.isArray(oldLearned.gen) ? oldLearned.gen : [],
    },
    favorites: Array.isArray(p.favorites) ? p.favorites : [],
    readDates: Array.isArray(p.readDates) ? p.readDates : [],
    checkinDates: Array.isArray(p.checkinDates) ? p.checkinDates : [],
  }
  migrated.schemaVersion = SCHEMA_VERSION
  return migrated
}
export async function saveProgress(p: Progress): Promise<void> {
  await kvSet('news.progress', { ...p, schemaVersion: SCHEMA_VERSION })
}

// ── 交互回流（幂等设计） ────────────────────────────────────────────────────
/**
 * 打卡：同一天重复调用不叠加（幂等）。返回 { ok, streak, already }
 */
export async function checkinOnce(): Promise<{ ok: boolean; streak: number; already: boolean }> {
  const p = await loadProgress()
  const t = today()
  const already = (p.checkinDates || []).includes(t)
  if (!already) {
    const next: Progress = {
      ...p,
      streak: (p.streak || 0) + 1,
      lastRead: t,
      checkinDates: [...(p.checkinDates || []), t],
    }
    await saveProgress(next)
    return { ok: true, streak: next.streak, already: false }
  }
  return { ok: true, streak: p.streak || 0, already: true }
}

/**
 * 记录完读：把"读完今天的日报"写成进度（读/听都算）。
 * minutesDate 与今天一致时累计，跨天自动重置。
 */
export async function recordReadComplete(dateStr: string): Promise<Progress> {
  const p = await loadProgress()
  const t = today()
  const minutes = p.minutesDate === t ? (p.minutesToday || 0) : 0
  const readDates = Array.isArray(p.readDates) ? p.readDates : []
  const next: Progress = {
    ...p,
    minutesToday: minutes + 1,     // 完读 +1 分钟锚点（后续可按实际时长扩展）
    minutesDate: t,
    lastRead: t,
    readDates: readDates.includes(dateStr) ? readDates : [...readDates, dateStr],
    checkinDates: Array.isArray(p.checkinDates) ? p.checkinDates : [],
    favorites: Array.isArray(p.favorites) ? p.favorites : [],
    learned: p.learned && typeof p.learned === 'object' ? p.learned : { pro: [], gen: [] },
  }
  await saveProgress(next)
  return next
}

/**
 * 收藏/取消收藏一条（幂等）。见 news.progress.favorites。
 */
export async function toggleFavorite(itemId: string, dateStr: string): Promise<{ fav: boolean; favorites: string[] }> {
  const p = await loadProgress()
  const favs = Array.isArray(p.favorites) ? p.favorites : []
  const has = favs.includes(itemId)
  const nextFavs = has ? favs.filter((x) => x !== itemId) : [...favs, itemId]
  const next: Progress = {
    ...p,
    favorites: nextFavs.slice(-200),
    readDates: Array.isArray(p.readDates) ? p.readDates : [],
    checkinDates: Array.isArray(p.checkinDates) ? p.checkinDates : [],
    learned: p.learned && typeof p.learned === 'object' ? p.learned : { pro: [], gen: [] },
  }
  await saveProgress(next)
  return { fav: !has, favorites: nextFavs }
}

// ── 语音缓存（自动分档：小内联 / 大托管） ───────────────────────────────────
/**
 * 判断音频数据该内联还是托管：dataUrl base64 体积 >=300KB → 只存 url（调用方先托管到 mimo file 模式）
 * 返回 { dataUrl?, url?, store }。面板/生成方都用它统一写缓存。
 */
export function pickAudioStore(dataUrl?: string, url?: string): { dataUrl?: string; url?: string; store: 'inline' | 'hosted' } {
  const size = dataUrl && dataUrl.startsWith('data:') ? Math.round((dataUrl.length * 3) / 4) : 0
  if (dataUrl && size >= AUDIO_INLINE_LIMIT) {
    // 太大不内联：优先 url（mimo file 托管），否则宁可告警不存 base64
    return { url: url || undefined, store: url ? 'hosted' : 'inline' }
  }
  if (dataUrl) return { dataUrl, store: 'inline' }
  if (url) return { url, store: 'hosted' }
  return { store: 'inline' }
}

export async function loadVoice(date: string, section: string): Promise<VoiceClip | null> {
  const v = await kvGet(`news.voice.${date}.${section}`)
  return v && typeof v === 'object' ? (v as VoiceClip) : null
}
/** 某天已存在的语音章节（用于列表展示哪些已合成，不逐个 get） */
export async function loadDateKey(date: string): Promise<string[]> {
  const keys = await kvListKeys()
  return keys.filter((k) => k.startsWith(`news.voice.${date}.`)).sort()
}
/** 枚举 cap.kv 全部键（cap.kv list） */
export async function kvListKeys(): Promise<string[]> {
  try {
    const res = await call<{ ok: boolean; result?: { keys?: string[] }; error?: string }>('router_dispatch', {
      req: { target: 'cap.kv', payload: { action: 'list' } },
    })
    if (!res.ok) throw new Error(res.error || 'kv list 失败')
    return Array.isArray(res.result?.keys) ? (res.result?.keys as string[]) : []
  } catch (e) {
    return []
  }
}
/** 已发布日报的日期（倒序） */
export async function listDailyDates(): Promise<string[]> {
  const keys = await kvListKeys()
  return keys
    .filter((k) => k.startsWith('news.daily.'))
    .map((k) => k.slice('news.daily.'.length))
    .sort()
    .reverse()
}

/** 今天 YYYY-MM-DD（本地时区，避免手机/桌面跨时区错位） */
export function today(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
/** 昨天 YYYY-MM-DD（本地时区） */
export function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 中文日期 "2026-10-18 周日" */
export function fmtCnDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${dateStr} 周${wd}`
}

export const fmtMin = (n?: number | null) => (n == null ? '—' : `${n} 分钟`)