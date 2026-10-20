/**
 * 通信层 + 刊物数据访问（面板专用）
 *
 * 统一经宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__，见 host.ts）：
 *  - 桌面 Tauri：直调后端命令（router_dispatch）
 *  - 手机浏览器 / Web：宿主 invoke 自动取正确服务地址并携带 token
 * 面板与 MCP server 读写同一个 cap.kv（SqliteStorage domain=kv）。
 * 面板零外网请求：日报由 AI 用内置浏览器抓取后经 news_publish_daily 写入。
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

/** 迷你 hook：加载数据（带刷新） */
export function useModel<T>(loader: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await loader())
      setError(null)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, deps)
  useEffect(() => {
    reload()
  }, [reload])
  return { data, error, loading, reload, setData }
}

// ── 领域类型 ────────────────────────────────────────────────────────────────
export interface Prefs {
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
export interface DailySection {
  type: 'summary' | 'fund' | 'tech' | 'news' | 'creative' | 'learn'
  title: string
  items: { title?: string; name?: string; brief?: string; url?: string; meta?: any }[]
  meta?: any
}
export interface Daily {
  date: string
  totalMinutes?: number
  summary?: string
  sections: DailySection[]
  quiz?: { q: string; options: string[]; answer: number; explain?: string }[]
  createdAt?: string
}
export interface Progress {
  streak: number
  lastRead: string | null
  learned: { pro: string[]; gen: string[] }
  favorites: string[]
  minutesToday?: number
}

export const DEFAULT_WATCHLIST = ['005844', '017811', '002910', '013835', '011369', '013840']

export function defaultPrefs(): Prefs {
  return {
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
  const p = await kvGet('news.prefs')
  return p && typeof p === 'object' ? (p as Prefs) : defaultPrefs()
}
export async function savePrefs(prefs: Prefs): Promise<void> {
  await kvSet('news.prefs', { ...prefs, updatedAt: new Date().toISOString() })
}
export async function loadPrefsLog(): Promise<PrefsLogEntry[]> {
  const l = await kvGet('news.prefsLog')
  return Array.isArray(l) ? (l as PrefsLogEntry[]) : []
}
export async function loadDaily(date: string): Promise<Daily | null> {
  const d = await kvGet(`news.daily.${date}`)
  return d && typeof d === 'object' ? (d as Daily) : null
}
export async function loadProgress(): Promise<Progress> {
  const p = await kvGet('news.progress')
  return p && typeof p === 'object' ? (p as Progress) : { streak: 0, lastRead: null, learned: { pro: [], gen: [] }, favorites: [] }
}
export async function saveProgress(p: Progress): Promise<void> {
  await kvSet('news.progress', p)
}
export async function loadReviews(month: string): Promise<any[]> {
  const r = await kvGet(`news.reviews.${month}`)
  return Array.isArray(r) ? (r as any[]) : []
}
export async function loadSourcesLast(): Promise<Record<string, unknown> | null> {
  const s = await kvGet('news.sources.last')
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : null
}

/** 已合成语音缓存（AI 经 news_save_voice 写入，面板直接播放） */
export interface VoiceClip {
  section: string
  dataUrl?: string
  url?: string
  durationSec?: number | null
  title?: string
  createdAt?: string
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
