/**
 * 通信层 + 数据访问（启幕面板）
 *
 * 计算逻辑全部复用 shared/core.js 与 mcp/render.js（与 MCP 同一权威，esbuild
 * 打包进 bundle——render.js 无 node 依赖，可在浏览器跑，outputType: 'blob'）。
 * 本文件只做 cap.kv IO、作品登记读取与本地构建下载。
 *
 * 键空间契约（与 mcp/server.js 一致）：qimu.deck.<id> / qimu.settings
 */
import { getHostInvoke } from './host'
import * as core from '../shared/core.js'
import { renderDeck } from '../mcp/render.js'
import type { Deck, DeckSlide, Geometry, GeoPage, GeoBox, ThemeToken } from '../shared/core.js'

export const K = core.K
export const THEMES = core.THEMES as unknown as Record<string, ThemeToken>
export const THEME_KEYS = core.THEME_KEYS as string[]
export const CAPS = core.CAPS as Record<string, number>
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as QimuSettings
export const normalizeDeck = core.normalizeDeck as unknown as
  (raw: unknown) => { error?: string; deck?: Deck; warnings?: string[] }
export const layout = core.layout as unknown as (deck: Deck) => Geometry
export const parseOutline = core.parseOutline as unknown as
  (text: string) => { errors: string[] | null; spec: Record<string, unknown> | null }
export const safeFileName = core.safeFileName as unknown as
  (title: string, now?: number) => { stamp: string; name: string; file: string }
export type { Deck, DeckSlide, Geometry, GeoPage, GeoBox, ThemeToken }

export interface QimuSettings {
  schemaVersion: number
  exportDir: string
  theme: string
}

export interface DeckRecord {
  id: string
  file: string
  title: string
  theme: string
  slideCount: number
  path: string
  ts: number
  source?: string
}

// ── 通道 ──────────────────────────────────────────────────────────────────
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

export async function loadSettings(): Promise<QimuSettings> {
  const s = await kvGet<Partial<QimuSettings>>(K.settings).catch(() => null)
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

export async function saveSettings(s: QimuSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function loadWorks(): Promise<DeckRecord[]> {
  const keys = (await kvKeys()).filter((k) => k.startsWith(K.deckPrefix))
  const vals = await Promise.all(keys.map((k) => kvGet<DeckRecord>(k).catch(() => null)))
  return vals
    .filter((v): v is DeckRecord => !!(v && typeof v === 'object' && typeof v.id === 'string'))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

// ── 本地构建（浏览器路径，无需 AI/宿主能力）───────────────────────────────
/** deck → blob 下载。与 MCP 走同一渲染器，产物同源。 */
export async function buildAndDownload(deck: Deck): Promise<{ ok: boolean; error?: string; file?: string }> {
  const named = safeFileName(deck.title)
  try {
    const blob = (await renderDeck(deck, { outputType: 'blob' })) as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = named.file
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 8000)
    return { ok: true, file: named.file }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 把面板侧构建登记进作品列表（跨端可见；文件在浏览器下载目录，路径标注为下载） */
export async function registerLocalBuild(deck: Deck, file: string): Promise<void> {
  const rec: DeckRecord = {
    id: core.makeId(),
    file,
    title: deck.title,
    theme: deck.theme,
    slideCount: deck.slides.length,
    path: `（面板下载）${file}`,
    ts: Date.now(),
    source: 'panel',
  }
  await kvSet(K.deck(rec.id), rec)
}

// ── 预览辅助 ──────────────────────────────────────────────────────────────
/** token 色 → CSS（面板消费与渲染器同一主题 token） */
export function cssColor(t: ThemeToken, token?: string): string {
  if (!token) return 'transparent'
  return `#${(t as unknown as Record<string, string>)[token] || token}`
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
