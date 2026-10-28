/**
 * 数据面：cap.kv gezhi.*（经宿主 invoke → router_dispatch），与 MCP 共享同一事实库。
 * 计算面：shared/core.js（归一化/布局）+ shared/render.js（exceljs 渲染）——
 * 面板本地构建与 MCP 落盘走同一引擎，口径不漂移。
 */
import * as core from '../shared/core'
import * as render from '../shared/render'
import { getHostInvoke } from './host'

export { core, render }

export interface WorkEntry {
  id: string
  file: string
  title: string
  theme: string
  sheetCount: number
  rowCount: number
  path: string
  ts: number
}

interface DispatchResponse {
  ok?: boolean
  error?: unknown
  result?: { value?: unknown, keys?: string[] }
}

async function kvReq<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target: 'cap.kv', payload } })
  if (!res || res.ok === false) throw new Error(String(res && res.error) || 'cap.kv 调用失败')
  return res as unknown as T
}

export async function kvGet(key: string): Promise<unknown> {
  const res = await kvReq<{ result?: { value?: unknown } }>({ action: 'get', key })
  return res.result && res.result.value !== undefined ? res.result.value : null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await kvReq({ action: 'set', key, value })
}

export async function kvDelete(key: string): Promise<void> {
  await kvReq({ action: 'delete', key })
}

export async function kvKeys(): Promise<string[]> {
  const res = await kvReq<{ result?: { keys?: string[] } }>({ action: 'list' })
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : []
}

export async function loadSettings(): Promise<core.Settings> {
  const s = await kvGet(core.K.settings).catch(() => null)
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) } as core.Settings
}

export async function saveSettings(patch: Partial<core.Settings>): Promise<core.Settings> {
  const cur = await loadSettings()
  const next = { ...cur, ...patch, schemaVersion: 1 }
  await kvSet(core.K.settings, next)
  return next
}

export async function loadWorks(): Promise<WorkEntry[]> {
  const keys = await kvKeys()
  const out: WorkEntry[] = []
  for (const k of keys.filter((x) => x.startsWith(core.K.bookPrefix)).sort()) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(k)
    if (v && typeof v === 'object' && (v as WorkEntry).id) out.push(v as WorkEntry)
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

export async function deleteWork(id: string): Promise<void> {
  await kvDelete(core.K.book(id))
}

/** 本地构建：BookSpec → 归一化/布局 → exceljs → ArrayBuffer（不落盘，由调用方决定下载） */
export async function buildBookBuffer(spec: core.BookSpec): Promise<{ buf: ArrayBuffer, book: core.BookNormalized, g: core.LayoutResult }> {
  const norm = core.normalizeBook(spec)
  if (norm.error || !norm.book) throw new Error(`Spec 未通过校验：${norm.error}`)
  const g = core.layout(norm.book)
  const buf = await render.renderToBuffer(norm.book, g)
  return { buf, book: norm.book, g }
}

/** 触发浏览器下载（blob + a[download]） */
export function downloadBuffer(buf: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}
