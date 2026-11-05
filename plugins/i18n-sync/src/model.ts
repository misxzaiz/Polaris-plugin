/**
 * 数据面：cap.kv i18n.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 扫描/应用：127.0.0.1 直连自家服务（token 从 cap.kv i18n.meta 读）。
 * 口径：键奇偶/占位符全部以 shared/i18n-core 为准（三方同源）。
 */
import { getHostInvoke } from './host'

// ── 类型（与 service 扫描响应对齐） ──

export interface MissingItem { key: string; baseValue: string; truncated?: boolean }
export interface ExtraItem { key: string; value: unknown }
export interface PlaceholderIssue { key: string; detail: { missingInTarget: string[]; extraInTarget: string[]; positionalIssues: string[] } }
export interface LocaleCell {
  missing?: MissingItem[]
  extra?: ExtraItem[]
  emptyValues?: MissingItem[]
  sameAsBase?: MissingItem[]
  placeholderIssues?: PlaceholderIssue[]
  structuralConflicts?: string[]
  _parseError?: boolean
}
export interface ScanFile {
  relPath: string; locale: string; ns: string; ext: string; size: number
  keys: number; hasComments: boolean; format: string
}
export interface ScanResult {
  root: string; layout: string; baseLocale: string
  locales: string[]; nsList: string[]; files: ScanFile[]
  matrix: Record<string, Record<string, LocaleCell | { _error: string }> | { _error: string }>
  totals: { missing: number; extra: number; empty: number; sameAsBase: number; placeholder: number; parseErrors: number; files: number }
  parseErrors: { relPath: string; error: string }[]
  ambiguous: string[]
  warnings: string[]
  truncated: boolean
  scannedAt: string
}
export interface ServiceMeta {
  token: string; port: number; version?: string; pid?: number
  startedAt?: string; lastTickAt?: string; appConfigDir?: string
}
export interface UndoEntry { batchId: string; at: string; root: string; locale: string; mode: string; files: string[] }
export interface Settings { baseLocale?: string; recentDirs?: string[] }
export interface ApplyOk { ok: true; batchId?: string; noop?: boolean; message?: string; applied?: { ns: string; file: string; insert: number; update: number; noop: number }[] }
export interface ApplyErr { ok: false; errors: { key: string; reason: string }[]; hint?: string }

// ── cap.kv ──

interface DispatchResponse { ok?: boolean; error?: unknown; result?: { value?: unknown; keys?: string[] } }

async function kvReq<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target: 'cap.kv', payload } })
  if (!res || res.ok === false) throw new Error(String(res && res.error) || 'cap.kv 调用失败')
  return res as unknown as T
}

export async function kvGet(key: string): Promise<unknown> {
  try {
    const res = await kvReq<{ result?: { value?: unknown } }>({ action: 'get', key })
    return res.result && res.result.value !== undefined ? res.result.value : null
  } catch (_) {
    return null // get 可能撞已删键：容忍
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await kvReq({ action: 'set', key, value })
}

export async function kvKeys(): Promise<string[]> {
  const res = await kvReq<{ result?: { keys?: string[] } }>({ action: 'list' })
  return res.result && Array.isArray(res.result.keys) ? res.result.keys : []
}

// ── 键空间（权威表见 README） ──

export const KEY_META = 'i18n.meta'
export const KEY_SETTINGS = 'i18n.settings'
export const KEY_GLOSSARY = 'i18n.glossary'
export const KEY_UNDO_INDEX = 'i18n.undo.index'

export async function getMeta(): Promise<ServiceMeta | null> {
  const raw = await kvGet(KEY_META)
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<ServiceMeta>
  if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
  return m as ServiceMeta
}

export async function loadSettings(): Promise<Settings> {
  const s = await kvGet(KEY_SETTINGS)
  return s && typeof s === 'object' ? (s as Settings) : {}
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(KEY_SETTINGS, s)
}

export async function loadUndoIndex(): Promise<UndoEntry[]> {
  const v = await kvGet(KEY_UNDO_INDEX)
  return Array.isArray(v) ? (v as UndoEntry[]) : []
}

export interface Glossary { terms: Record<string, string>; updatedAt?: string }

export async function loadGlossary(): Promise<Glossary> {
  const g = await kvGet(KEY_GLOSSARY)
  if (g && typeof g === 'object' && (g as Glossary).terms && typeof (g as Glossary).terms === 'object') return g as Glossary
  return { terms: {} }
}

export async function saveGlossary(g: Glossary): Promise<void> {
  await kvSet(KEY_GLOSSARY, { ...g, updatedAt: new Date().toISOString() })
}

// ── 127.0.0.1 直连自家服务 ──

async function serviceCall<T>(meta: ServiceMeta, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-i18n-sync-token': meta.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({ ok: false, error: `响应不是 JSON（HTTP ${res.status}）` }))
  if (!res.ok && (data as { ok?: boolean }).ok !== true) {
    throw new Error(String((data as { error?: string }).error || `HTTP ${res.status}`))
  }
  return data as T
}

export async function apiScan(meta: ServiceMeta, dir: string, baseLocale?: string): Promise<ScanResult> {
  const r = await serviceCall<{ ok: true; scan: ScanResult }>(meta, '/api/scan', { dir, baseLocale })
  return r.scan
}

export async function apiApply(meta: ServiceMeta, args: {
  dir: string; locale: string; ns?: string; translations: Record<string, string>
  mode?: 'preserve' | 'mirror'; stripComments?: boolean; force?: boolean; baseLocale?: string
}): Promise<ApplyOk | ApplyErr> {
  return serviceCall<ApplyOk | ApplyErr>(meta, '/api/apply', args)
}

export async function apiUndo(meta: ServiceMeta, batchId: string): Promise<{ ok: true; results: { file: string; ok: boolean; error?: string }[] }> {
  return serviceCall(meta, '/api/undo', { batchId })
}

export async function apiUndoList(meta: ServiceMeta): Promise<UndoEntry[]> {
  const r = await serviceCall<{ ok: true; index: UndoEntry[] }>(meta, '/api/undo-list', {})
  return r.index
}

/** 服务是否在线（meta 心跳 90s 内算活） */
export function metaAlive(meta: ServiceMeta | null): boolean {
  if (!meta || !meta.lastTickAt) return false
  return Date.now() - new Date(meta.lastTickAt).getTime() < 90 * 1000
}

/** 修剪最近目录（去重、最多 5 个） */
export function pushRecentDir(dirs: string[], dir: string): string[] {
  const next = [dir, ...dirs.filter((d) => d !== dir)]
  return next.slice(0, 5)
}

/** 单元格问题总数 */
export function cellIssueCount(c: LocaleCell | undefined): number {
  if (!c || c._parseError) return 0
  return (c.missing?.length || 0) + (c.emptyValues?.length || 0) + (c.sameAsBase?.length || 0) + (c.placeholderIssues?.length || 0)
}
