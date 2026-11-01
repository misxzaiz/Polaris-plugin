/**
 * model.ts —— HAR 分析台数据模型与 kv 访问（面板侧）
 *
 * 事实库：cap.kv 的 har.* 键空间（服务=权威内存 + 投影写者；面板/MCP=控制面写者）。
 * 全部行级时相分解复用 shared/core（零依赖，esbuild 一并打包）。
 * 所有投影字段服务侧已脱敏；面板不做二次掩码（信任同一引擎）。
 */
import { kvGet, kvSet, kvDel } from './host'
import core from '../shared/core'

// ── 类型（与服务/core 投影形对齐）──────────────────────────────────────────
export interface HarMeta {
  version: string
  pid: number
  startedAt: number
  lastTickAt: number
  bridge: string
  degraded: boolean
  port: number
  state: 'idle' | 'parsing' | 'ready' | 'error'
  error: string
  activePath: string
  activeEntryCount: number
  busy: boolean
}

export interface HarRow {
  i: number
  m: string
  u: string
  s: number
  t: number
  sz: number
  mime: string
  rs: number
  ph: number[]
  flags: string
}

export interface HarReport {
  path: string
  fileBytes: number
  openedAt: number
  version: string
  creator: string
  pages: number
  entryCount: number
  truncatedEntries: boolean
  spanMs: number
  timeSumMs: number
  phaseTotalsMs: number[]
  transferBytes: number
  bodyBytes: number
  statusCounts: Record<string, number>
  methodCounts: Record<string, number>
  domains: Array<{ h: string; n: number; bytes: number; time: number }>
  mimes: Array<{ k: string; n: number }>
  times: { avg: number; p50: number; p95: number; max: number }
  errors: HarRow[]
  slowTop: HarRow[]
  largeTop: HarRow[]
  dupUncached: Array<{ key: string; count: number; timeSumMs: number; statuses: number[] }>
  cachedCount: number
  redirectCount: number
  errorCount: number
  auditHigh: { total: number; high: number }
  startedAt: string
  endedAt: string
  t0: number
  truncated?: boolean
}

export interface HarRowsIdx {
  count: number
  total: number
  chunkCount: number
  truncated: boolean
  updatedAt: number
}

export interface AuditSample { i: number; where: string; masked: string }

export interface AuditFinding {
  cat: string
  sev: 'high' | 'medium' | 'low'
  label: string
  count: number
  entryCount: number
  idx: number[]
  samples: AuditSample[]
}

export interface HarAudit {
  scannedEntries: number
  total: number
  highCount: number
  findings: AuditFinding[]
  scannedAt: number
}

export interface DiffRow {
  m: string
  u: string
  s?: number
  s1?: number
  s2?: number
  t?: number
  t1?: number
  t2?: number
  dt?: number
  sz?: number
  sz1?: number
  sz2?: number
}

export interface HarDiff {
  basePath: string
  candPath: string
  summary: {
    baseCount: number
    candCount: number
    matched: number
    added: number
    removed: number
    changed: number
    flips: number
    slowerCount: number
    fasterCount: number
    baseTimeSum: number
    candTimeSum: number
  }
  changed: DiffRow[]
  added: DiffRow[]
  removed: DiffRow[]
  slower: DiffRow[]
  faster: DiffRow[]
  flips: DiffRow[]
  comparedAt: number
}

export interface HarHist {
  path: string
  fileBytes: number
  entryCount: number
  at: number
}

export interface HarSettings {
  sanitize: {
    authHeaders: boolean
    cookies: boolean
    setCookies: boolean
    querySecrets: boolean
    bodies: boolean
    urlCredentials: boolean
  }
  outputDir: string
}

export interface SelftestReport {
  passed: number
  total: number
  allGreen: boolean
  checks: Array<{ item: string; pass: boolean; detail: string; ms: number }>
  durationMs: number
  at: number
  version: string
}

/** 面板一次轮询的全部投影（Panel 与各 Tab 共用） */
export interface PanelData {
  meta: HarMeta | null
  report: HarReport | null
  audit: HarAudit | null
  diff: HarDiff | null
  hist: HarHist[]
  selftest: SelftestReport | null
  loaded: boolean
}

export interface EntryDetail {
  i: number
  startedAt: string
  method: string
  url: string
  httpVersion: string
  status: number
  statusText: string
  redirectUrl: string
  serverIp: string
  time: number
  timings: Record<string, number>
  reqHeaders: Array<[string, string]>
  resHeaders: Array<[string, string]>
  reqCookies: Array<[string, string]>
  resCookies: Array<[string, string]>
  reqBody: { text: string; truncated: boolean; size: number }
  resBody: { text: string; truncated: boolean; size: number }
  resCompression: number | null
  cache: string
  t0Abs: number
  query: Array<[string, string]>
}

// ── 读取（全部容忍键消失）──────────────────────────────────────────────────
export async function getMeta(): Promise<HarMeta | null> {
  const v = await kvGet<HarMeta>('har.meta')
  return v && v.lastTickAt ? v : null
}
export async function getReport(): Promise<HarReport | null> {
  const v = await kvGet<HarReport>('har.report')
  return v && typeof v.entryCount === 'number' ? v : null
}
export async function getRowsIdx(): Promise<HarRowsIdx | null> {
  return await kvGet<HarRowsIdx>('har.rows.idx')
}
export async function readRows(): Promise<HarRow[]> {
  const idx = await getRowsIdx()
  const chunkCount = idx && Number.isInteger(idx.chunkCount) ? idx.chunkCount : 0
  const rows: HarRow[] = []
  for (let i = 0; i < chunkCount; i++) {
    // eslint-disable-next-line no-await-in-loop
    const chunk = await kvGet<HarRow[]>(`har.rows.${i}`)
    if (Array.isArray(chunk)) rows.push(...chunk)
  }
  return rows
}
export async function getAudit(): Promise<HarAudit | null> {
  const v = await kvGet<HarAudit>('har.audit')
  return v && Array.isArray(v.findings) ? v : null
}
export async function getDiff(): Promise<HarDiff | null> {
  const v = await kvGet<HarDiff>('har.diff')
  return v && v.summary ? v : null
}
export async function getHist(): Promise<HarHist[]> {
  const v = await kvGet<HarHist[]>('har.hist')
  return Array.isArray(v) ? v : []
}
export async function getSettings(): Promise<HarSettings> {
  const v = await kvGet<HarSettings>('har.settings')
  return core.normalizeSettings(v)
}
export async function saveSettings(s: HarSettings): Promise<void> {
  await kvSet('har.settings', s)
}
export async function getSelftest(): Promise<SelftestReport | null> {
  const v = await kvGet<SelftestReport>('har.selftest')
  return v && typeof v.total === 'number' ? v : null
}

// ── 命令信箱（先删后做；回执按 nonce 匹配）──────────────────────────────────
let nonceSeq = 0
export async function sendCommand<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 90000,
): Promise<T & { ok: boolean; error?: string }> {
  const nonce = `p${Date.now().toString(36)}${(nonceSeq += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await kvDel('har.result').catch(() => {})
  await kvSet('har.cmd', { op, nonce, ...payload, at: Date.now() })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 900))
    // eslint-disable-next-line no-await-in-loop
    const r = await kvGet<{ nonce: string } & T & { ok: boolean; error?: string }>('har.result')
    if (r && r.nonce === nonce) {
      await kvDel('har.result').catch(() => {})
      return r
    }
  }
  return { ok: false, error: '服务未在时限内响应（到 设置→插件→HAR 分析台 查看服务状态）' } as T & { ok: boolean; error?: string }
}

// ── 展示工具 ───────────────────────────────────────────────────────────────
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)}MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${Math.round(n)}B`
}
export function fmtMs(n: number): string {
  if (!Number.isFinite(n)) return '-'
  if (n >= 60000) return `${(n / 60000).toFixed(1)}min`
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`
  return `${Math.round(n)}ms`
}
export function statusColor(s: number): string {
  if (s >= 500) return '#f85149'
  if (s >= 400) return '#d29922'
  if (s >= 300) return '#58a6ff'
  if (s >= 200) return '#3fb950'
  if (s >= 100) return '#8b949e'
  return '#f85149'
}

/** 瀑布图时相配色（blocked/dns/connect/ssl/send/wait/receive/gap） */
export const PHASE_COLORS: Record<string, string> = {
  blocked: '#8b949e',
  dns: '#bc8cff',
  connect: '#f0883e',
  ssl: '#3fb950',
  send: '#79c0ff',
  wait: '#58a6ff',
  receive: '#39c5cf',
  gap: '#30363d',
}
export const PHASE_LABELS: Record<string, string> = {
  blocked: '排队', dns: 'DNS', connect: '连接', ssl: 'TLS', send: '发送', wait: '等待', receive: '下载', gap: '其他',
}

export { core }
