/**
 * model.ts —— Mock 接口台数据模型与 kv 访问（面板侧）
 *
 * 事实库：cap.kv 的 mck.* 键空间（服务=权威内存 + 投影写者；面板/MCP=控制面写者）。
 * 全部 normalize/模板逻辑复用 shared/core（零依赖，esbuild 一并打包）。
 */
import { kvGet, kvSet, kvDel } from './host'
import core from '../shared/core'

// ── 类型（与服务/core 规范形对齐）──────────────────────────────────────────
export interface MockRoute {
  id: string
  name: string
  method: string
  path: string
  status: number
  headers: Record<string, string>
  bodyType: 'json' | 'text' | 'empty'
  body: string
  delayMs: number
  errorRate: number
  errorStatus: number
  enabled: boolean
  builtin: boolean
  createdAt: number
  updatedAt: number
}

export interface MockSettings {
  version: number
  routes: MockRoute[]
  cors: { mode: 'echo' | 'star' | 'off' }
  fallback: { enabled: boolean; status: number; bodyType: 'json' | 'text' | 'empty'; body: string }
  updatedAt: number
}

export interface MockMeta {
  version: string
  pid: number
  startedAt: number
  lastTickAt: number
  bridge: string
  degraded: boolean
  port: number
  routeCount: number
  enabledCount: number
  corsMode: string
  fallbackEnabled: boolean
  histTotal: number
  lastReqAt: number
  uptimeSec: number
}

export interface MockIdx {
  count: number
  total: number
  chunkCount: number
  oldestAt: number
  updatedAt: number
}

export interface HistRec {
  id: string
  at: number
  method: string
  path: string
  query: string
  sourceIp: string
  matchedRouteId: string
  matchedRouteName: string
  status: number
  delayMs: number
  durMs: number
  reqHeaders: Record<string, string>
  reqBodyKind: string
  reqBodySize: number
  reqBodyPreview: string
  reqBodyTruncated: boolean
  respBytes: number
}

export interface SelftestCheck { item: string; pass: boolean; detail: string; ms: number }
export interface SelftestReport {
  version: string
  at: number
  durationMs: number
  passed: number
  total: number
  allGreen: boolean
  checks: SelftestCheck[]
}

// ── 读取 ──────────────────────────────────────────────────────────────────
export async function getMeta(): Promise<MockMeta | null> {
  const v = await kvGet<MockMeta>('mck.meta')
  return v && v.lastTickAt ? v : null
}
export async function getSettings(): Promise<MockSettings | null> {
  const v = await kvGet<MockSettings>('mck.settings')
  if (!v) return null
  return core.normalizeSettings(v) as unknown as MockSettings
}
export async function getIdx(): Promise<MockIdx | null> {
  return kvGet<MockIdx>('mck.idx')
}
/** 按 idx.chunkCount 直读分块（不用 list，避开宿主 kv list 语义） */
export async function readHistChunks(chunkCount: number): Promise<HistRec[]> {
  const map: Record<string, HistRec[]> = {}
  const n = Math.min(Math.max(chunkCount || 0, 0), core.HIST_CHUNKS_KEEP)
  for (let i = 0; i < n; i++) {
    const v = await kvGet<HistRec[]>(`mck.hist.${i}`)
    if (Array.isArray(v)) map[`mck.hist.${i}`] = v
  }
  return core.readRing(map) as unknown as HistRec[]
}
export async function getSelftestReport(): Promise<SelftestReport | null> {
  return kvGet<SelftestReport>('mck.selftest')
}

// ── 控制面写 ───────────────────────────────────────────────────────────────
export interface SaveResult { ok: boolean; error?: string; warnings?: string[]; route?: MockRoute }

/** 读-改-写 settings（写前重读对齐并行会话纪律）；normalize 在 core 完成 */
export async function saveRoute(input: Partial<MockRoute> & { method: string; path: string }): Promise<SaveResult> {
  const fresh = (await getSettings()) || (core.normalizeSettings(null) as unknown as MockSettings)
  const n = core.normalizeRoute(input, input.id ? { partial: true } : {})
  if (!n.ok) return { ok: false, error: n.error }
  const up = core.upsertRoute(fresh.routes as never[], n.route)
  if (!up.ok) return { ok: false, error: up.error }
  const next = { ...fresh, routes: up.routes, updatedAt: Date.now() }
  await kvSet('mck.settings', next)
  return { ok: true, warnings: n.warnings, route: n.route as unknown as MockRoute }
}

export async function deleteRoute(id: string): Promise<SaveResult> {
  const fresh = (await getSettings()) || (core.normalizeSettings(null) as unknown as MockSettings)
  const rm = core.removeRoute(fresh.routes as never[], id)
  if (!rm.ok) return { ok: false, error: `路由不存在: ${id}` }
  await kvSet('mck.settings', { ...fresh, routes: rm.routes, updatedAt: Date.now() })
  return { ok: true }
}

/** 批量导入路由（OpenAPI apply / 手动粘贴 JSON 数组共享）；返回成功数 */
export async function importRoutes(routes: unknown[], { replace = false } = {}): Promise<{ ok: boolean; error?: string; added?: number }> {
  const fresh = (await getSettings()) || (core.normalizeSettings(null) as unknown as MockSettings)
  let list = replace ? [] : (fresh.routes as never[])
  let added = 0
  for (const r of routes) {
    const n = core.normalizeRoute(r)
    if (!n.ok) continue
    const up = core.upsertRoute(list, n.route)
    if (!up.ok) break
    list = up.routes
    added += 1
  }
  await kvSet('mck.settings', { ...fresh, routes: list, updatedAt: Date.now() })
  return { ok: true, added }
}

export async function saveSettings(next: MockSettings): Promise<void> {
  await kvSet('mck.settings', { ...core.normalizeSettings(next), updatedAt: Date.now() })
}

// ── 命令信箱（单槽：mck.cmd 先删后做由服务保证；面板写后轮询 mck.result）────
export type CmdResult<T = unknown> = { ok: boolean; error?: string; nonce?: string; at?: number } & T

export async function sendCommand<T = Record<string, unknown>>(op: string, payload: Record<string, unknown> = {}, timeoutMs = 25000): Promise<CmdResult<T>> {
  const nonce = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await kvSet('mck.cmd', { op, nonce, ...payload, at: Date.now() })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await kvGet<CmdResult<T>>('mck.result')
    if (r && r.nonce === nonce) {
      await kvDel('mck.result').catch(() => {})
      return r
    }
    await sleep(600)
  }
  return { ok: false, error: '服务未在时限内响应（可能未运行：去 设置→插件→Mock 接口台 看服务状态）' } as CmdResult<T>
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 便捷 ──────────────────────────────────────────────────────────────────
export function baseUrl(meta: MockMeta | null): string {
  return `http://127.0.0.1:${meta ? meta.port : 9868}`
}

export function fmtTime(ts: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export { core }
