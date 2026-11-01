/**
 * 面板数据层（与 service/shared 同源口径）：
 * - 数据面：cap.kv ocr-bench.*（经宿主 invoke → router_dispatch）——meta 引导 / 历史 / 报告（跨端可读）
 * - 字节面：127.0.0.1:<meta.port> 直连自家服务（token 鉴权）——发起/停止/实时进度（desktop-first）
 * 纯逻辑与 service 共用 shared/core（JS 模块，这里单方声明类型）。
 */
import * as core from '../shared/core'
import { getHostInvoke } from './host'

export { core }

// ── 类型（与 service/main.js 输出 schema 对齐）───────────────────────────────

export interface ServiceMeta {
  ts: string
  version: string
  port: number
  token: string
  degraded: boolean
  lastBridgeErr?: string
  running?: LiveSnapshot | null
  lastReportId?: string | null
}

export interface LiveSnapshot {
  runId: string
  source: 'panel' | 'mcp'
  elapsedS: number
  total: number
  done: number
  current: string | null
  state: string
  langs: string[]
  filesOk: number
  filesFail: number
  charsSoFar: number
}

export interface PageResult {
  page: number
  chars: number
  confidence: number | null
  mode: 'ocr' | 'native'
  error: string | null
}

export interface FileResult {
  path: string
  type: 'image' | 'pdf'
  ok: boolean
  error: string | null
  pages: PageResult[]
  chars: number
  durationMs: number
  outFile: string | null
  truncatedFile: boolean
  textHead: string
}

export interface JobSummary {
  files: number
  okFiles: number
  failFiles: number
  totalChars: number
  ocrPages: number
  nativePages: number
  meanConfidence: number | null
  lowConfPages: number
  durationMs: number
  aborted: boolean
  oneLine: string
  notes: string[]
}

export interface OcrReport {
  runId: string
  at: string
  version: string
  langs: string[]
  psm: number
  outDir: string | null
  source: 'panel' | 'mcp'
  aborted: boolean
  summary: JobSummary
  files: FileResult[]
}

export interface HistoryEntry {
  runId: string
  at: string
  files: number
  okFiles: number
  failFiles: number
  totalChars: number
  ocrPages: number
  nativePages: number
  meanConfidence: number | null
  durationMs: number
  langs: string[]
  aborted: boolean
  sample: string
  oneLine: string
}

export interface BenchSettings {
  langs: string[]
  psm: number
  outDir: string
}

export interface LangInfo {
  code: string
  name: string
  installed: boolean
}

export interface LangsReply {
  ok: boolean
  builtin: LangInfo[]
  optional: LangInfo[]
  cacheDir: string | null
  error?: string
}

// ── 数据面：cap.kv（宿主通道）────────────────────────────────────────────────

interface DispatchResponse {
  ok?: boolean
  error?: unknown
  result?: { value?: unknown; keys?: string[] }
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

const KEY_META = 'ocr-bench.meta'
const KEY_HISTORY = 'ocr-bench.history'
const KEY_REPORT = (id: string) => `ocr-bench.report.${id}`
const KEY_SETTINGS = 'ocr-bench.settings'

export async function getMeta(): Promise<ServiceMeta | null> {
  try {
    const raw = await kvGet(KEY_META)
    if (!raw || typeof raw !== 'object') return null
    const m = raw as Partial<ServiceMeta>
    if (typeof m.token !== 'string' || !m.token || typeof m.port !== 'number' || !m.port) return null
    return m as ServiceMeta
  } catch (_) {
    return null
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const v = await kvGet(KEY_HISTORY)
    const items = Array.isArray(v) ? v : (v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items) ? (v as { items: HistoryEntry[] }).items : [])
    return items
  } catch (_) {
    return []
  }
}

export async function loadReport(runId: string): Promise<OcrReport | null> {
  try {
    const v = await kvGet(KEY_REPORT(runId))
    return v && typeof v === 'object' ? (v as OcrReport) : null
  } catch (_) {
    return null
  }
}

export async function loadSettingsKv(): Promise<BenchSettings | null> {
  try {
    const v = await kvGet(KEY_SETTINGS)
    return v && typeof v === 'object' ? (v as BenchSettings) : null
  } catch (_) {
    return null
  }
}

// ── 字节面：127.0.0.1 直连自家服务 ──────────────────────────────────────────

function svcBase(meta: ServiceMeta): string {
  return `http://127.0.0.1:${meta.port}`
}

async function svcFetch<T>(meta: ServiceMeta, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(svcBase(meta) + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-OcrBench-Token': meta.token, ...(init?.headers || {}) },
  })
  const data = await res.json() as T & { error?: string }
  return data
}

export interface OpReply {
  ok: boolean
  error?: string
  busy?: boolean
  runId?: string
  report?: OcrReport
  running?: LiveSnapshot | null
  lastReport?: OcrReport | null
  settings?: BenchSettings
}

export async function opStart(meta: ServiceMeta, form: ScanForm): Promise<OpReply> {
  return svcFetch<OpReply>(meta, '/api/op', {
    method: 'POST',
    body: JSON.stringify({
      action: 'start',
      payload: {
        paths: form.paths,
        langs: form.langs,
        psm: form.psm,
        outDir: form.outDir,
      },
    }),
  })
}

export async function opAction(meta: ServiceMeta, action: string, payload: object = {}): Promise<OpReply> {
  return svcFetch<OpReply>(meta, '/api/op', { method: 'POST', body: JSON.stringify({ action, payload }) })
}

export interface LiveReply {
  ok: boolean
  running: boolean
  live: LiveSnapshot | null
  lastReportId: string | null
  error?: string
}

export interface ScanForm {
  pathsText: string
  paths: string[]
  langs: string[]
  psm: number
  outDir: string
}

export async function getLive(meta: ServiceMeta): Promise<LiveReply> {
  return svcFetch<LiveReply>(meta, '/api/live')
}

export async function health(meta: ServiceMeta): Promise<boolean> {
  try {
    const r = await fetch(`${svcBase(meta)}/__health`)
    return r.ok
  } catch (_) {
    return false
  }
}

// ── 表单辅助 ────────────────────────────────────────────────────────────────

/** 多行文本框 → 路径数组（去空行去重，保序） */
export function parsePathsText(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0B'
  if (n < 1024) return `${Math.round(n)}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

export function fmtDuration(ms: number): string {
  const s = Math.round((ms || 0) / 100) / 10
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}

/** 文件名提取（路径展示用尾段） */
export function baseName(p: string): string {
  const s = String(p || '').replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}
