/**
 * 通信层 + 数据访问（行情哨兵面板）
 *
 * 统一经宿主 invoke 通道调 router_dispatch；面板与后台服务、MCP server
 * 读写同一个 cap.kv（SqliteStorage domain=kv）的 qsent.* 键空间。
 * 面板零外网请求——外网抓取全部由后台服务原生执行（跨域问题的根本解法）。
 *
 * 键空间契约（与 service/quotes.js、MCP mcp/server.js 三方一致，权威描述见 README）：
 *   qsent.watch.<id>        自选定义（面板/MCP 写；id=sh600519 形式）
 *   qsent.state.<id>        最新行情快照（服务写）
 *   qsent.minute.<id>       当日分时（服务写，按需）
 *   qsent.cmd.quote.<n>     即时查命令（面板/MCP 写，服务消费删除）
 *   qsent.quote.<n>         即时查结果（服务写）
 *   qsent.cmd.search.<n>    搜索命令（面板/MCP 写，服务消费删除）
 *   qsent.search.<n>        搜索结果（服务写）
 *   qsent.cmd.minute.<id>   分时命令（面板/MCP 写，服务消费删除）
 *   qsent.alert.<aid>       提醒规则（面板/MCP 写）
 *   qsent.alert.feed        触发历史（服务写，cap 100）
 *   qsent.position.<id>     持仓（面板/MCP 写）
 *   qsent.settings          全局设置（面板/MCP 写，服务读）
 *   qsent.meta              服务心跳（服务写）
 *   qsent.readAt            提醒已读水位（面板写）
 */
import { getHostInvoke } from './host'

// ── 类型 ───────────────────────────────────────────────────────────────────
export type AlertType = 'price_above' | 'price_below' | 'pct_above' | 'pct_below'

export interface QuoteState {
  id: string
  name: string
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  chg: number
  pct: number
  volume: number   // 手
  amount: number   // 万元
  turnover: number | null
  time: string     // yyyyMMddHHmmss（交易所时间）
  mktcap: number | null
  source: string   // tencent / eastmoney / tencent+eastmoney / cache
}

export interface WatchDef {
  id: string
  code: string
  market: string
  name: string
  note?: string
  createdAt: number
}

export interface MinutePoint { t: string; p: number; vol: number; amt: number }

export interface MinuteData {
  ok?: boolean
  fetchedAt?: number
  date?: string
  prevClose?: number | null
  points?: MinutePoint[]
  error?: string
}

export interface AlertRule {
  id: string
  code: string
  type: AlertType
  value: number
  enabled: boolean
  note?: string
  lastFiredDate?: string
  createdAt: number
}

export interface AlertFire {
  at: number
  alertId: string
  code: string
  name: string
  type: AlertType
  value: number
  price: number | null
  pct: number | null
  time: string
  msg: string
}

export interface Position { code: string; cost: number; shares: number; updatedAt: number }

export interface QsSettings {
  pollSec: number
  offHoursPollSec: number
  redUp: boolean
  indexes: string[]
}

export interface QsMeta {
  version?: string
  pid?: number
  startedAt?: number
  wroteAt?: number
  lastPollAt?: number | null
  lastOkAt?: number | null
  lastSource?: string
  lastError?: string
  watches?: number
  alerts?: number
  enabledAlerts?: number
  pollSec?: number
  inSession?: boolean
  bridge?: string | null
}

export interface ServiceStatus {
  serviceId: string
  pluginId: string
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  port?: number
  pid?: number
  uptime?: number
  lastError?: string
  restartCount: number
}

export interface SearchResult {
  market: string
  code: string
  id: string
  name: string
  type: string
  tradable: boolean
}

export interface WatchRow {
  def: WatchDef
  state?: QuoteState
  position?: Position
  alertCount: number
}

export interface Snapshot {
  rows: WatchRow[]
  indexes: { id: string; state?: QuoteState }[]
  meta: QsMeta | null
  settings: QsSettings
  alerts: AlertRule[]
  feed: AlertFire[]
  /** at > readAt 的提醒数（未读） */
  newCount: number
}

// ── 键构造（与 service/mcp 一致）───────────────────────────────────────────
export const K = {
  watch: (id: string) => `qsent.watch.${id}`,
  state: (id: string) => `qsent.state.${id}`,
  minute: (id: string) => `qsent.minute.${id}`,
  cmdQuote: (n: string) => `qsent.cmd.quote.${n}`,
  quote: (n: string) => `qsent.quote.${n}`,
  cmdSearch: (n: string) => `qsent.cmd.search.${n}`,
  search: (n: string) => `qsent.search.${n}`,
  cmdMinute: (id: string) => `qsent.cmd.minute.${id}`,
  alert: (aid: string) => `qsent.alert.${aid}`,
  alertFeed: 'qsent.alert.feed',
  position: (id: string) => `qsent.position.${id}`,
  settings: 'qsent.settings',
  meta: 'qsent.meta',
  readAt: 'qsent.readAt',
}

export const DEFAULT_SETTINGS: QsSettings = {
  pollSec: 20,
  offHoursPollSec: 300,
  redUp: true,
  indexes: ['sh000001', 'sz399001', 'sz399006'],
}

export const ALERT_TYPE_OPTIONS: { value: AlertType; label: string; ph: string }[] = [
  { value: 'price_above', label: '价格升到', ph: '如 1350' },
  { value: 'price_below', label: '价格跌到', ph: '如 1200' },
  { value: 'pct_above', label: '涨幅达到 %', ph: '如 3' },
  { value: 'pct_below', label: '跌幅达到 %', ph: '如 -3' },
]

// ── 通道 ───────────────────────────────────────────────────────────────────
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

export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return 'a' + c.randomUUID().replace(/-/g, '').slice(0, 10)
  return 'a' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ── 快照加载 ───────────────────────────────────────────────────────────────
export async function loadSnapshot(readAt = 0): Promise<Snapshot> {
  const keys = await kvKeys()
  const watchIds = keys.filter((k) => k.startsWith('qsent.watch.')).map((k) => k.slice('qsent.watch.'.length))
  const alertIds = keys.filter((k) => k.startsWith('qsent.alert.') && k !== K.alertFeed)
    .map((k) => k.slice('qsent.alert.'.length))
  const [defs, states, positions, alerts, feed, meta, settings] = await Promise.all([
    Promise.all(watchIds.map((id) => kvGet<WatchDef>(K.watch(id)))),
    Promise.all(watchIds.map((id) => kvGet<QuoteState>(K.state(id)))),
    Promise.all(watchIds.map((id) => kvGet<Position>(K.position(id)))),
    Promise.all(alertIds.map((aid) => kvGet<AlertRule>(K.alert(aid)))),
    kvGet<AlertFire[]>(K.alertFeed),
    kvGet<QsMeta>(K.meta),
    kvGet<QsSettings>(K.settings),
  ])
  const validAlerts = alerts.filter((a): a is AlertRule => !!a && typeof a === 'object' && typeof a.id === 'string')
  const idxList = settings && Array.isArray(settings.indexes) && settings.indexes.length
    ? settings.indexes
    : DEFAULT_SETTINGS.indexes
  const idxStates = await Promise.all(idxList.map((id) => kvGet<QuoteState>(K.state(id)).catch(() => null)))
  const rows: WatchRow[] = watchIds
    .map((id, i) => ({
      def: defs[i]!,
      state: states[i] ?? undefined,
      position: positions[i] ?? undefined,
      alertCount: validAlerts.filter((a) => a.code === id && a.enabled !== false).length,
    }))
    .filter((r) => r.def && typeof r.def === 'object')
    .sort((a, b) => (a.def.createdAt || 0) - (b.def.createdAt || 0))
  let newCount = 0
  if (readAt > 0) {
    for (const f of feed ?? []) if (f && f.at > readAt) newCount++
  }
  return {
    rows,
    indexes: idxList.map((id, i) => ({ id, state: idxStates[i] ?? undefined })),
    meta,
    settings: { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) },
    alerts: validAlerts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    feed: (feed ?? []).filter((f) => f && typeof f === 'object'),
    newCount,
  }
}

export async function loadReadAt(): Promise<number> {
  const v = await kvGet<number>(K.readAt)
  return typeof v === 'number' ? v : 0
}

// ── 自选 / 持仓 / 提醒 / 设置 写操作 ────────────────────────────────────────
export function normalizeCode(input: string): { id?: string; code?: string; market?: string; error?: string } {
  const raw = String(input || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!raw) return { error: '请输入代码（如 600519 / 510300）或带前缀（如 sh000001）' }
  const m = raw.match(/^(sh|sz|bj)?(\d{6})$/)
  if (!m) return { error: '无法识别：' + raw + '（6 位数字，可带 sh/sz/bj 前缀；按名称请用搜索）' }
  const code = m[2]
  if (m[1]) return { id: m[1] + code, code, market: m[1] }
  const p2 = code.slice(0, 2)
  const p3 = code.slice(0, 3)
  let market: string | null = null
  if (['600', '601', '603', '605', '688', '689'].includes(p3) || ['51', '56', '58', '50'].includes(p2)) market = 'sh'
  else if (['00', '30'].includes(p2) || ['12', '15', '16', '18'].includes(p2)) market = 'sz'
  else if (['43', '83', '87', '92'].includes(p2)) market = 'bj'
  if (!market) return { error: `无法推断 ${code} 所属市场（可带前缀重试）` }
  return { id: market + code, code, market }
}

export async function saveWatch(def: WatchDef): Promise<void> {
  await kvSet(K.watch(def.id), def)
}

export async function removeWatch(id: string): Promise<void> {
  await Promise.all([
    kvDel(K.watch(id)),
    kvDel(K.state(id)).catch(() => {}),
    kvDel(K.minute(id)).catch(() => {}),
    kvDel(K.position(id)).catch(() => {}),
  ])
}

export async function savePosition(id: string, cost: number, shares: number): Promise<void> {
  if (cost > 0 && shares > 0) {
    await kvSet(K.position(id), { code: id, cost, shares, updatedAt: Date.now() })
  } else {
    await kvDel(K.position(id)).catch(() => {})
  }
}

export async function saveAlert(a: AlertRule): Promise<void> {
  await kvSet(K.alert(a.id), a)
}

export async function removeAlert(aid: string): Promise<void> {
  await kvDel(K.alert(aid))
}

export async function saveSettings(s: QsSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function markFeedRead(at: number): Promise<void> {
  await kvSet(K.readAt, at)
}

// ── 服务侧命令（搜索 / 即时查 / 分时）：写命令键 → 轮询结果键 ────────────────
async function runServiceCommand<T>(cmdKey: string, resultKey: string, payload: Record<string, unknown>,
  { timeoutMs = 15000, pollMs = 1000 } = {}): Promise<T> {
  await kvSet(cmdKey, { ...payload, at: Date.now() })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs))
    const r = await kvGet<T>(resultKey).catch(() => null)
    if (r && typeof r === 'object') {
      kvDel(resultKey).catch(() => {})
      kvDel(cmdKey).catch(() => {})
      return r
    }
  }
  throw new Error('后台服务未响应（可能未运行：设置 → 插件 → 行情哨兵 查看服务状态）')
}

export async function searchWithService(q: string): Promise<SearchResult[]> {
  const nonce = uid().slice(1) + 's'
  const r = await runServiceCommand<{ ok: boolean; results?: SearchResult[]; error?: string }>(
    K.cmdSearch(nonce), K.search(nonce), { q })
  if (!r.ok) throw new Error(r.error || '搜索失败')
  return r.results ?? []
}

export interface QuoteQueryResult {
  ok: boolean
  quotes?: QuoteState[]
  source?: string
  missing?: string[]
  error?: string
}

export async function fetchQuotesNow(codes: string[]): Promise<QuoteQueryResult> {
  const nonce = uid().slice(1) + 'q'
  return runServiceCommand<QuoteQueryResult>(K.cmdQuote(nonce), K.quote(nonce), { codes })
}

export async function loadMinuteViaService(id: string): Promise<MinuteData> {
  // 有当日缓存就直接用（服务盘中会随轮询自动刷新？分时仅按需取，命中即用）
  const cached = await kvGet<MinuteData>(K.minute(id)).catch(() => null)
  const today = bjDate()
  if (cached && cached.ok && cached.date === today) return cached
  const nonce = uid().slice(1) + 'm'
  const r = await runServiceCommand<MinuteData>(K.cmdMinute(id), K.minute(id), { op: 'minute' }, { timeoutMs: 12000 })
  return r
}

function bjDate(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0')
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

interface DiscoveredSelf {
  installPath: string
  services: Record<string, unknown>[]
}

async function discoverSelf(pluginId: string): Promise<DiscoveredSelf | null> {
  const r = await capDispatch<{ plugins?: Array<{
    id: string
    installPath: string
    contributes?: { services?: Record<string, unknown>[] }
  }> }>('cap.pluginDiscovery', { action: 'discover' })
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId)
  if (!self || !self.installPath) return null
  const services = self.contributes?.services ?? []
  return { installPath: self.installPath, services }
}

function toBackendContribution(c: Record<string, unknown>): Record<string, unknown> {
  return {
    id: c.id,
    type: c.type ?? c.serviceType,
    command: c.command,
    argsTemplate: Array.isArray(c.argsTemplate) ? c.argsTemplate : [],
    port: c.port ?? null,
    healthCheck: c.healthCheck ?? null,
    healthCheckTimeout: c.healthCheckTimeout ?? null,
    autoStart: c.autoStart ?? true,
    restartOnFailure: c.restartOnFailure ?? true,
    maxRestarts: c.maxRestarts ?? 3,
    description: c.description ?? null,
  }
}

export async function serviceAction(action: 'start' | 'stop' | 'restart', pluginId: string, serviceId: string): Promise<void> {
  if (action === 'start') {
    const self = await discoverSelf(pluginId)
    const svc = self?.services.find((s) => s.id === serviceId)
    if (!self || !svc) throw new Error('插件发现结果中找不到本插件的服务贡献（请刷新插件列表后重试）')
    await capDispatch('cap.pluginServiceManager', {
      action: 'start',
      pluginId,
      installPath: self.installPath,
      contribution: toBackendContribution(svc),
    })
    return
  }
  await capDispatch('cap.pluginServiceManager', { action, pluginId, serviceId })
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—'
  return Number(v).toFixed(digits)
}

export function fmtAmountWan(wan: number | null | undefined): string {
  const v = Number(wan)
  if (!Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + ' 亿'
  return Math.round(v).toLocaleString('en-US') + ' 万'
}

export function fmtVolumeHand(hand: number | null | undefined): string {
  const v = Number(hand)
  if (!Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' 百万手'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + ' 万手'
  return Math.round(v) + ' 手'
}

export function fmtQuoteTime(ts: string | undefined): string {
  const s = String(ts || '')
  if (!/^\d{14}$/.test(s)) return '—'
  return `${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
}

export function timeAgo(ts?: number | null): string {
  if (!ts) return '从未'
  const d = Date.now() - ts
  if (d < 15 * 1000) return '刚刚'
  if (d < 60 * 1000) return `${Math.floor(d / 1000)} 秒前`
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 24 * 3600 * 1000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}

export function describeAlert(a: Pick<AlertRule, 'type' | 'value'>): string {
  const v = a.value
  switch (a.type) {
    case 'price_above': return `价格 ≥ ${v}`
    case 'price_below': return `价格 ≤ ${v}`
    case 'pct_above': return `涨幅 ≥ ${v}%`
    case 'pct_below': return `跌幅 ≥ ${Math.abs(v)}%（${v}%）`
    default: return String(a.type)
  }
}
