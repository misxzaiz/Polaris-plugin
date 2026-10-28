/**
 * 数据面：cap.kv zhifang.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 字节面：面板文件 → base64 → POST http://127.0.0.1:<meta.port>/api/op（自家服务，token 鉴权）。
 * 口径：页码校验用 shared/core（与 service/MCP 同源）。
 */
import * as core from '../shared/core'
import { getHostInvoke } from './host'

export { core }

export interface ZhifangMeta {
  token: string
  port: number
  version?: string
  lastTickAt?: string
  startedAt?: string
  bridge?: string
}

export interface HistoryOutput {
  name: string
  path: string
  size: number
}

export interface HistoryEntry {
  id: string
  at: string
  op: string
  source: 'panel' | 'mcp'
  inputs: string[]
  outputs: HistoryOutput[]
  pages: number
  ms: number
  ok: boolean
  error?: string
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

const KEY_META = 'zhifang.meta'
const KEY_SETTINGS = 'zhifang.settings'
const KEY_CMD = 'zhifang.cmd'
const KEY_HISTORY = 'zhifang.history.'

export async function getMeta(): Promise<ZhifangMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<ZhifangMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as ZhifangMeta
  } catch (_) {
    return null
  }
}

export async function loadSettings(): Promise<core.ZhifangSettings> {
  try {
    return core.normalizeSettings(await kvGet(KEY_SETTINGS))
  } catch (_) {
    return core.normalizeSettings(null)
  }
}

export async function saveSettings(s: core.ZhifangSettings): Promise<void> {
  await kvSet(KEY_SETTINGS, s)
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const keys = (await kvKeys()).filter((k) => k.startsWith(KEY_HISTORY))
  const entries: HistoryEntry[] = []
  await Promise.all(keys.map(async (k) => {
    try {
      const v = await kvGet(k)
      if (v && typeof v === 'object') entries.push(v as HistoryEntry)
    } catch (_) { /* get 可能撞已删键：容忍 */ }
  }))
  entries.sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.id).localeCompare(String(a.id)))
  return entries
}

/** 清空历史：写命令键由服务消费（先删后做）。服务离线时命令暂存，上线后生效。 */
export async function requestClearHistory(): Promise<void> {
  await kvSet(KEY_CMD, { action: 'clearHistory' })
}

// ── 字节面：127.0.0.1 直连自家服务 ─────────────────────────────────────────

export interface OpFile {
  name: string
  b64: string
}

export interface OpResult {
  ok: boolean
  error?: string
  outputs?: HistoryOutput[]
  pages?: number
  info?: Record<string, unknown>
  text?: string
  textTruncated?: boolean
  textTotalChars?: number
  note?: string
  outDir?: string
  ms?: number
}

export function opEndpoint(meta: ZhifangMeta): string {
  return `http://127.0.0.1:${meta.port}`
}

export async function runOpRequest(meta: ZhifangMeta, body: Record<string, unknown>): Promise<OpResult> {
  const res = await fetch(opEndpoint(meta) + '/api/op', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Zhifang-Token': meta.token },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as OpResult
  return data
}

export async function probeDir(meta: ZhifangMeta, path: string): Promise<{ desktop: string[], home: string, checked?: { path: string, exists: boolean, isDir: boolean } }> {
  const res = await fetch(opEndpoint(meta) + '/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Zhifang-Token': meta.token },
    body: JSON.stringify({ path }),
  })
  return (await res.json()) as { desktop: string[], home: string, checked?: { path: string, exists: boolean, isDir: boolean } }
}

/** File → base64（不含 data: 前缀）。大文件分块读避免 call stack 溢出。 */
export function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败：' + file.name))
    reader.onload = () => {
      const s = String(reader.result || '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.readAsDataURL(file)
  })
}

export const OP_LABELS: Record<string, string> = {
  info: '信息',
  merge: '合并',
  extract: '抽页',
  split: '拆分',
  rotate: '旋转',
  delete: '删页',
  images2pdf: '图片转PDF',
  text: '提取文字',
}
