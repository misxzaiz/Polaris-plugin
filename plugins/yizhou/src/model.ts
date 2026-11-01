/**
 * 数据访问层（译舟面板）
 *
 * 与 MCP server 读写同一个 cap.kv 的 yz.* 键空间（契约见 README，写者纪律）：
 *   yz.idx        仅 MCP 写（索引数组）——面板只读
 *   yz.art.<id>.p.<c>  仅 MCP 写（段落分块，含译文）——面板只读
 *   yz.pos.<id>   仅面板写（阅读进度 {segIdx,pct,at}）
 *   yz.settings   仅面板写（{mode,fontScale}）
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvSet } from './host'

export type IdxEntry = core.IdxEntry
export type Seg = core.Seg

export const PREFIX = 'yz.'
export const K = {
  idx: `${PREFIX}idx`,
  artPrefix: `${PREFIX}art.`,
  pos: (id: string) => `${PREFIX}pos.${id}`,
  settings: `${PREFIX}settings`,
}

export interface ReaderPos {
  segIdx: number
  pct: number
  at: string
}

export interface Settings {
  mode: 'bilingual' | 'src' | 'dst'
  fontScale: number
}

export const DEFAULT_SETTINGS: Settings = { mode: 'bilingual', fontScale: 1 }

/** 归一设置（读到的可能是任意历史形状，字段缺失回落默认） */
export function normalizeSettings(v: unknown): Settings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const mode = o.mode === 'src' || o.mode === 'dst' || o.mode === 'bilingual' ? o.mode : DEFAULT_SETTINGS.mode
  const fs = typeof o.fontScale === 'number' && Number.isFinite(o.fontScale)
    ? Math.min(1.6, Math.max(0.8, o.fontScale)) : DEFAULT_SETTINGS.fontScale
  return { mode, fontScale: fs }
}

/** 书架：读索引（MCP 单写者；读失败容忍为空库） */
export async function loadLibrary(): Promise<IdxEntry[]> {
  const v = await kvGet<IdxEntry[]>(K.idx).catch(() => null)
  return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string') : []
}

/** 组装一篇文章的全部段落（按块并发读；块缺失容忍为空） */
export async function loadArticle(id: string, segCount: number): Promise<Seg[]> {
  const n = core.chunkCount(Math.max(0, segCount || 0))
  const gets: Promise<unknown>[] = []
  for (let c = 0; c < n; c++) gets.push(kvGet(K.artPrefix + `${id}.p.${c}`).catch(() => null))
  const parts = await Promise.all(gets)
  return core.assembleSegs(parts)
}

export function loadPos(id: string): Promise<ReaderPos | null> {
  return kvGet<ReaderPos>(K.pos(id)).catch(() => null)
}

export function savePos(id: string, pos: ReaderPos): Promise<void> {
  return kvSet(K.pos(id), pos)
}

export function loadSettings(): Promise<Settings> {
  return kvGet<unknown>(K.settings)
    .then((v) => normalizeSettings(v))
    .catch(() => DEFAULT_SETTINGS)
}

export function saveSettings(s: Settings): Promise<void> {
  return kvSet(K.settings, s)
}

/** 删除阅读进度键（MCP 删文时也会清；这里是面板内删除时的兜底） */
export function delPos(id: string): Promise<void> {
  return kvDel(K.pos(id)).catch(() => {})
}

/** 书架卡片副标题（站点 · 语言对 · 段数） */
export function metaLine(e: IdxEntry): string {
  const lang = `${core.langLabel(e.srcLang)}→${core.langLabel(e.tgtLang)}`
  return `${e.site || '未知来源'} · ${lang} · ${e.segCount} 段`
}

export function fmtDate(iso: string): string {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
