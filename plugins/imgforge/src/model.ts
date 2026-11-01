/**
 * 数据面：cap.kv imgforge.*（经宿主 invoke → router_dispatch），与服务/MCP 共享同一事实库。
 * 字节面：面板 → POST http://127.0.0.1:<meta.port>/api/*（自家服务，token 鉴权）。
 * 口径：管道/设置归一用 shared/core（与 service/MCP 同源）。
 */
import * as core from '../shared/core'
import { getHostInvoke } from './host'

export { core }
export type CoreNS = typeof import('../shared/core')

export interface ImgforgeMeta {
  token: string
  port: number
  version?: string
  lastTickAt?: string
  startedAt?: string
  bridge?: string
}

export interface ScannedFile {
  path: string
  name: string
  ext: string
  size: number
  format?: string | null
  width?: number | null
  height?: number | null
  hasGps?: boolean | null
  error?: string
}

export interface ScanSummary {
  count: number
  totalSize: number
  byFormat: Record<string, number>
  gpsCount: number
  gpsUnknown: number
}

export interface ScanResult {
  dir: string
  files: ScannedFile[]
  truncated: boolean
  summary: ScanSummary
}

export interface JobResult {
  name: string
  path: string
  ok: boolean
  inSize: number
  outSize?: number
  outPath?: string
  outName?: string
  format?: string
  quality?: number
  scaled?: number | null
  note?: string
  ms?: number
  error?: string
}

export interface JobSnapshot {
  id: string
  state: 'running' | 'done' | 'error'
  done: number
  total: number
  pipelineLabel: string
  outDir: string
  startedAt: string
  finishedAt?: string | null
  error?: string | null
  summary?: {
    total: number
    ok: number
    fail: number
    inBytes: number
    outBytes: number
    savedBytes: number
    ms?: number
  } | null
  results?: JobResult[] | null
}

export interface HistoryEntry {
  id: string
  at: string
  source: 'panel' | 'mcp'
  pipeline: string
  total: number
  ok: number
  fail: number
  inBytes: number
  outBytes: number
  savedBytes: number
  outDir: string
  ms: number
  results?: JobResult[]
  okState: boolean
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

const KEY_META = 'imgforge.meta'
const KEY_SETTINGS = 'imgforge.settings'
const KEY_CMD = 'imgforge.cmd'
const KEY_HISTORY = 'imgforge.history.'

export async function getMeta(): Promise<ImgforgeMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<ImgforgeMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as ImgforgeMeta
  } catch (_) {
    return null
  }
}

export async function loadSettings(): Promise<core.ImgforgeSettings> {
  try {
    return core.normalizeSettings(await kvGet(KEY_SETTINGS))
  } catch (_) {
    return core.normalizeSettings(null)
  }
}

export async function saveSettings(s: core.ImgforgeSettings): Promise<void> {
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

export function svcEndpoint(meta: ImgforgeMeta): string {
  return `http://127.0.0.1:${meta.port}`
}

async function svcPost<T>(meta: ImgforgeMeta, api: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(svcEndpoint(meta) + api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Imgforge-Token': meta.token },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { ok?: boolean, error?: string }
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export function ping(meta: ImgforgeMeta): Promise<{ version: string, outDir: string, desktop: string[], home: string, degraded?: boolean }> {
  return svcPost(meta, '/api/ping', {})
}

export function probeDir(meta: ImgforgeMeta, path: string): Promise<{ desktop: string[], home: string, checked?: { path: string, exists: boolean, isDir: boolean } }> {
  return svcPost(meta, '/api/probe', { path })
}

export function scanDir(meta: ImgforgeMeta, dir: string, recursive: boolean): Promise<ScanResult> {
  return svcPost(meta, '/api/scan', { dir, recursive })
}

export function startProcess(meta: ImgforgeMeta, body: {
  dir?: string
  paths?: string[]
  recursive?: boolean
  pipeline: Record<string, unknown>
  outDir?: string
}): Promise<{ id: string, total: number, pipelineLabel: string, outDir: string }> {
  return svcPost(meta, '/api/process', body)
}

/** GET /api/job?id=（任务进度轮询） */
export async function fetchJob(meta: ImgforgeMeta, id: string): Promise<JobSnapshot | null> {
  const res = await fetch(`${svcEndpoint(meta)}/api/job?id=${encodeURIComponent(id)}`, {
    headers: { 'X-Imgforge-Token': meta.token },
  })
  const data = (await res.json()) as { ok?: boolean, error?: string, job?: JobSnapshot }
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data.job || null
}
