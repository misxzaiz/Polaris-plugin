/**
 * 面板数据层（与 service/shared 同源口径）：
 * - 数据面：cap.kv site-audit.*（经宿主 invoke → router_dispatch）——meta 引导 / 历史 / 报告（移动端也可读）
 * - 字节面：127.0.0.1:<meta.port> 直连自家服务（token 鉴权）——发起/停止/实时进度（desktop-first）
 * 纯逻辑（渲染报告文本/CSV 导出/格式化）与 service 共用 shared/audit-core。
 */
import * as core from '../shared/audit-core'
import type {
  AuditReport, AuditOptions, IssueGroup, IssueItem, Verdict, PageRecord,
} from '../shared/audit-core'
import { getHostInvoke } from './host'

export { core }
export type { AuditReport, AuditOptions, IssueGroup, IssueItem, Verdict, PageRecord }

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

export interface LiveEvent { type: string; url: string; detail?: string; at?: number }

export interface LiveSnapshot {
  auditId: string
  source: 'panel' | 'mcp'
  seed: string
  phase: string
  pagesDone: number
  queueLen: number
  assetsDone: number
  externalDone: number
  externalTotal: number
  errors: number
  current: string[]
  elapsedS: number
  scopeHosts: string[]
  maxPages: number
  recentEvents: LiveEvent[]
}

export interface HistoryEntry {
  auditId: string
  at: string
  seed: string
  scopeHosts: string[]
  pagesCrawled: number
  assetsChecked: number
  externalChecked: number
  durationMs: number
  score: number
  errors: number
  warns: number
  aborted: boolean
  fatal: string | null
  verdictOne: string
}

export type AuditSettings = AuditOptions

export interface FormState {
  url: string
  maxPages: number
  delayMs: number
  timeoutS: number
  concurrency: number
  slowMs: number
  respectRobots: boolean
  checkExternal: boolean
  checkAssets: boolean
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

async function kvGet(key: string): Promise<unknown> {
  const res = await kvReq<{ result?: { value?: unknown } }>({ action: 'get', key })
  return res.result && res.result.value !== undefined ? res.result.value : null
}

const KEY_META = 'site-audit.meta'
const KEY_HISTORY = 'site-audit.history'
const KEY_REPORT = (id: string) => `site-audit.report.${id}`
const KEY_SETTINGS = 'site-audit.settings'

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

export async function loadReport(auditId: string): Promise<AuditReport | null> {
  try {
    const v = await kvGet(KEY_REPORT(auditId))
    return v && typeof v === 'object' ? (v as AuditReport) : null
  } catch (_) {
    return null
  }
}

export async function loadSettingsKv(): Promise<AuditSettings | null> {
  try {
    const v = await kvGet(KEY_SETTINGS)
    return v && typeof v === 'object' ? (v as AuditSettings) : null
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
    headers: { 'Content-Type': 'application/json', 'X-SiteAudit-Token': meta.token, ...(init?.headers || {}) },
  })
  const data = await res.json() as T & { error?: string }
  return data
}

export interface OpReply {
  ok: boolean
  error?: string
  busy?: boolean
  auditId?: string
  report?: AuditReport
  running?: LiveSnapshot | null
  lastReport?: AuditReport | null
  settings?: AuditSettings
  items?: HistoryEntry[]
}

export async function opStart(meta: ServiceMeta, form: FormState): Promise<OpReply> {
  return svcFetch<OpReply>(meta, '/api/op', {
    method: 'POST',
    body: JSON.stringify({
      action: 'start',
      payload: {
        url: form.url,
        maxPages: form.maxPages,
        delayMs: form.delayMs,
        timeoutS: form.timeoutS,
        concurrency: form.concurrency,
        slowMs: form.slowMs,
        respectRobots: form.respectRobots,
        checkExternal: form.checkExternal,
        checkAssets: form.checkAssets,
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

export async function getLive(meta: ServiceMeta): Promise<LiveReply> {
  return svcFetch<LiveReply>(meta, '/api/live')
}

// ── 表单辅助 ────────────────────────────────────────────────────────────────

export function formFromSettings(settings: AuditSettings | null): FormState {
  const d = core.LIMITS
  return {
    url: '',
    maxPages: settings?.maxPages || d.maxPages.default,
    delayMs: settings?.delayMs ?? d.delayMs.default,
    timeoutS: settings?.timeoutS || d.timeoutS.default,
    concurrency: settings?.concurrency || d.concurrency.default,
    slowMs: settings?.slowMs || d.slowMs.default,
    respectRobots: settings ? settings.respectRobots !== false : true,
    checkExternal: settings ? settings.checkExternal !== false : true,
    checkAssets: settings ? settings.checkAssets !== false : true,
  }
}

export function defaultForm(): FormState {
  return formFromSettings(null)
}

/** 下载文本文件（导出 JSON / CSV） */
export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
