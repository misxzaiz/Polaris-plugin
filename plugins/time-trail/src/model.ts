/**
 * 通信层 + 数据访问（时间统计面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 timetrail.* 键空间。归集/落盘的唯一写者是后台服务
 * （service/trail.js）——面板与 MCP 只读快照/天记录，写设置/分类规则/命令键。
 *
 * 键空间契约（与 service/trail.js、mcp/server.js、shared/trail-core.js 四方一致，
 * 权威描述见 README 与主仓 plans/time-trail-plugin-spec.md）：
 *   timetrail.settings   设置（面板/MCP 写，服务 60s 轮询）
 *   timetrail.snapshot   快照（服务 30s 写）
 *   timetrail.meta       心跳（服务 60s 写）
 *   timetrail.day.<date> 天账本（服务唯一写者，20s flush）
 *   timetrail.cats       分类规则（面板/MCP 写，读取方套用）
 *   timetrail.cmd.<n>    命令（面板/MCP 写，服务消费删除）
 *   timetrail.result.<n> 命令结果（服务写，请求方删除）
 */
import { getHostInvoke } from './host'

// ── 类型（与 service/trail.js writeSnapshot / shared/trail-core.js 对齐）────
export interface TrailCurrent {
  app: string
  title?: string
  since: number
  idle: boolean
  idleMs: number
}

export interface TrailSnapshot {
  at: number
  version: string
  tickSec: number
  idleSec: number
  paused: boolean
  collector: 'alive' | 'dead' | 'unsupported' | 'starting'
  current: TrailCurrent | null
  today: { date: string; activeSec: number; idleSec: number; switches: number; apps: number }
  degraded?: string
  collectorErr?: string
}

export interface TrailMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  lastLineAt?: number | null
  bridge?: string
  collectorPid?: number | null
  collectorRestarts?: number
  retentionDays?: number
  captureTitles?: boolean
  tickSec?: number
  idleSec?: number
  paused?: boolean
  lastBridgeErr?: string
}

export interface TrailSettings {
  tickSec: number
  idleSec: number
  retentionDays: number
  captureTitles: boolean
  paused: boolean
}

export interface TrailDay {
  v1: number
  date: string
  apps: Record<string, number>
  idleSec: number
  hours: Record<string, Record<string, number>>
  titles?: Record<string, Record<string, number>>
  switches: number
  firstAt: number
  lastAt: number
}

export interface CatRule {
  match: string
  kind: 'exact' | 'prefix'
  cat: string
}

export interface TrailCats {
  v1: number
  rules: CatRule[]
}

export const DEFAULT_SETTINGS: TrailSettings = {
  tickSec: 3,
  idleSec: 180,
  retentionDays: 90,
  captureTitles: false,
  paused: false,
}

// ── 七类 + 分类引擎（权威实现在 shared/trail-core.js，此处为面板镜像）────────
export const CATEGORIES: Record<string, { label: string; color: string; emoji: string }> = {
  dev: { label: '开发', color: '#58A6FF', emoji: '⌨️' },
  create: { label: '创作', color: '#BC8CFF', emoji: '🎨' },
  meet: { label: '沟通', color: '#3FB950', emoji: '💬' },
  browse: { label: '浏览', color: '#D29922', emoji: '🌐' },
  media: { label: '影音', color: '#F778BA', emoji: '🎬' },
  play: { label: '娱乐', color: '#F85149', emoji: '🎮' },
  other: { label: '其他', color: '#8B95A7', emoji: '📦' },
}
export const CAT_IDS = Object.keys(CATEGORIES)

const BUILTIN_EXACT: Record<string, string> = {
  code: 'dev', devenv: 'dev', idea64: 'dev', windowsterminal: 'dev', wt: 'dev',
  cmd: 'dev', conhost: 'dev', powershell: 'dev', pwsh: 'dev', hyper: 'dev',
  alacritty: 'dev', cursor: 'dev', windsurf: 'dev', fleet: 'dev', postman: 'dev',
  chrome: 'browse', msedge: 'browse', firefox: 'browse', brave: 'browse',
  opera: 'browse', vivaldi: 'browse', arc: 'browse', qqbrowser: 'browse',
  wechat: 'meet', weixin: 'meet', qq: 'meet', tim: 'meet', dingtalk: 'meet',
  feishu: 'meet', lark: 'meet', telegram: 'meet', teams: 'meet', slack: 'meet',
  discord: 'meet', zoom: 'meet', wemeetapp: 'meet', outlook: 'meet', foxmail: 'meet',
  photoshop: 'create', illustrator: 'create', premierepro: 'create', afterfx: 'create',
  blender: 'create', figma: 'create', winword: 'create', excel: 'create',
  powerpnt: 'create', onenote: 'create', notepad: 'create', 'notepad++': 'create',
  obs64: 'create', typora: 'create', obsidian: 'create', wps: 'create',
  cloudmusic: 'media', qqmusic: 'media', spotify: 'media', potplayer: 'media',
  vlc: 'media', mpv: 'media', bilibili: 'media', wmplayer: 'media',
  steam: 'play', steamwebhelper: 'play', epicgameslauncher: 'play', javaw: 'play',
  wegame: 'play', minecraft: 'play', leagueclient: 'play', yuanshen: 'play',
  explorer: 'other', taskmgr: 'other', searchhost: 'other', systemsettings: 'other',
  applicationframehost: 'other', startmenuexperiencehost: 'other',
}

export function classifyApp(appKey: string, rules: CatRule[]): string {
  const key = String(appKey || '').toLowerCase()
  if (!key) return 'other'
  for (const r of rules) if (r.kind === 'exact' && r.match === key) return r.cat
  const hit = BUILTIN_EXACT[key]
  if (hit) return hit
  let best: CatRule | null = null
  for (const r of rules) {
    if (r.kind !== 'prefix' || !key.startsWith(r.match)) continue
    if (!best || r.match.length > best.match.length) best = r
  }
  return best ? best.cat : 'other'
}

export function isKnownApp(appKey: string, rules: CatRule[]): boolean {
  const key = String(appKey || '').toLowerCase()
  for (const r of rules) {
    if (r.kind === 'exact' && r.match === key) return true
    if (r.kind === 'prefix' && key.startsWith(r.match)) return true
  }
  return BUILTIN_EXACT[key] !== undefined
}

const DISPLAY_NAMES: Record<string, string> = {
  code: 'VS Code', devenv: 'Visual Studio', windowsterminal: '终端', wt: '终端',
  cmd: '命令行', powershell: 'PowerShell', pwsh: 'PowerShell', conhost: '控制台',
  msedge: 'Edge', chrome: 'Chrome', firefox: 'Firefox', brave: 'Brave',
  wechat: '微信', weixin: '微信', qq: 'QQ', tim: 'TIM', dingtalk: '钉钉',
  feishu: '飞书', lark: '飞书', telegram: 'Telegram', teams: 'Teams',
  slack: 'Slack', discord: 'Discord', zoom: '腾讯会议', wemeetapp: '腾讯会议',
  outlook: 'Outlook', foxmail: 'Foxmail', cloudmusic: '网易云音乐',
  qqmusic: 'QQ音乐', spotify: 'Spotify', potplayer: 'PotPlayer', vlc: 'VLC',
  mpv: 'mpv', bilibili: '哔哩哔哩', winword: 'Word', excel: 'Excel',
  powerpnt: 'PowerPoint', onenote: 'OneNote', wps: 'WPS 文字', et: 'WPS 表格',
  wpp: 'WPS 演示', notepad: '记事本', 'notepad++': 'Notepad++', typora: 'Typora',
  obsidian: 'Obsidian', photoshop: 'Photoshop', illustrator: 'Illustrator',
  premierepro: 'Premiere', afterfx: 'After Effects', blender: 'Blender',
  figma: 'Figma', steam: 'Steam', epicgameslauncher: 'Epic', wegame: 'WeGame',
  javaw: 'Minecraft', explorer: '文件资源管理器', taskmgr: '任务管理器',
  systemsettings: '系统设置', searchhost: '搜索', snipaste: 'Snipaste',
  sharex: 'ShareX', obs64: 'OBS', idea64: 'IntelliJ IDEA', pycharm64: 'PyCharm',
  applicationframehost: 'UWP 应用',
}

export function displayName(appKey: string): string {
  const k = String(appKey || '')
  if (DISPLAY_NAMES[k]) return DISPLAY_NAMES[k]
  if (!k) return k
  return k.charAt(0).toUpperCase() + k.slice(1)
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  if (s < 60) return `${s}秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分${s % 60 ? `${s % 60}秒` : ''}`
  const h = Math.floor(m / 60)
  return `${h}小时${m % 60 ? `${m % 60}分` : ''}`
}

export function dateKeyOf(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ── 键构造 ─────────────────────────────────────────────────────────────────
export const K = {
  snapshot: 'timetrail.snapshot',
  meta: 'timetrail.meta',
  settings: 'timetrail.settings',
  cats: 'timetrail.cats',
  day: (dateKey: string) => `timetrail.day.${dateKey}`,
  dayPrefix: 'timetrail.day.',
  cmd: (nonce: string) => `timetrail.cmd.${nonce}`,
  cmdPrefix: 'timetrail.cmd.',
  result: (nonce: string) => `timetrail.result.${nonce}`,
  resultPrefix: 'timetrail.result.',
}

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

// ── 数据加载 ───────────────────────────────────────────────────────────────
export function hydrateDay(raw: unknown, dateKey: string): TrailDay {
  const r = raw && typeof raw === 'object' ? (raw as Partial<TrailDay>) : null
  return {
    v1: 1,
    date: r && typeof r.date === 'string' ? r.date : dateKey,
    apps: (r && r.apps && typeof r.apps === 'object' ? r.apps : {}) as Record<string, number>,
    idleSec: Number(r && r.idleSec) || 0,
    hours: (r && r.hours && typeof r.hours === 'object' ? r.hours : {}) as Record<string, Record<string, number>>,
    titles: (r && r.titles && typeof r.titles === 'object' ? r.titles : {}) as Record<string, Record<string, number>>,
    switches: Number(r && r.switches) || 0,
    firstAt: Number(r && r.firstAt) || 0,
    lastAt: Number(r && r.lastAt) || 0,
  }
}

export interface PanelData {
  snap: TrailSnapshot | null
  meta: TrailMeta | null
  settings: TrailSettings
  cats: TrailCats
  today: TrailDay | null
}

export async function loadPanelData(): Promise<PanelData> {
  const todayKey = dateKeyOf(Date.now())
  const [rawSnap, rawMeta, rawSettings, rawCats, rawToday] = await Promise.all([
    kvGet<TrailSnapshot>(K.snapshot),
    kvGet<TrailMeta>(K.meta),
    kvGet<TrailSettings>(K.settings),
    kvGet<TrailCats>(K.cats),
    kvGet<TrailDay>(K.day(todayKey)),
  ])
  return {
    snap: rawSnap && typeof rawSnap === 'object' ? rawSnap : null,
    meta: rawMeta && typeof rawMeta === 'object' ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) },
    cats: rawCats && Array.isArray((rawCats as TrailCats).rules) ? (rawCats as TrailCats) : { v1: 1, rules: [] },
    today: rawToday && typeof rawToday === 'object' ? hydrateDay(rawToday, todayKey) : null,
  }
}

export async function loadCats(): Promise<CatRule[]> {
  const raw = await kvGet<TrailCats>(K.cats).catch(() => null)
  return raw && Array.isArray(raw.rules) ? raw.rules : []
}

export async function saveCats(rules: CatRule[]): Promise<void> {
  await kvSet(K.cats, { v1: 1, rules })
}

/** 最近 N 天（含今天）的天记录，旧→新排序 */
export async function loadDays(n: number): Promise<TrailDay[]> {
  const dates: string[] = []
  const now = Date.now()
  for (let i = 0; i < n; i++) dates.push(dateKeyOf(now - i * 86400000))
  const uniq = [...new Set(dates)]
  const CHUNK = 24
  const out: TrailDay[] = []
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK)
    const vals = await Promise.all(part.map((k) => kvGet<TrailDay>(K.day(k)).catch(() => null)))
    part.forEach((k, j) => {
      const v = vals[j]
      if (v && typeof v === 'object' && v.apps && typeof v.apps === 'object') out.push(hydrateDay(v, k))
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ── 聚合（镜像 trail-core.aggregateDays 的面板侧子集）───────────────────────
export interface Agg {
  totalSec: number
  idleSec: number
  switches: number
  byCat: Record<string, number>
  byApp: Record<string, number>
  byDay: Record<string, { totalSec: number; byCat: Record<string, number> }>
}

export function aggregateDays(days: TrailDay[], rules: CatRule[], filter?: { app?: string; cat?: string }): Agg {
  const byCat: Record<string, number> = {}
  const byApp: Record<string, number> = {}
  const byDay: Agg['byDay'] = {}
  let totalSec = 0
  let idleSec = 0
  let switches = 0
  for (const day of days) {
    idleSec += Number(day.idleSec) || 0
    switches += Number(day.switches) || 0
    let dayTotal = 0
    const dayByCat: Record<string, number> = {}
    for (const [app, sec0] of Object.entries(day.apps || {})) {
      const sec = Number(sec0) || 0
      if (sec <= 0) continue
      const cat = classifyApp(app, rules)
      if (filter?.cat && cat !== filter.cat) continue
      if (filter?.app && app !== filter.app.toLowerCase()) continue
      totalSec += sec
      dayTotal += sec
      byApp[app] = (byApp[app] || 0) + sec
      byCat[cat] = (byCat[cat] || 0) + sec
      dayByCat[cat] = (dayByCat[cat] || 0) + sec
    }
    if (day.date) byDay[day.date] = { totalSec: dayTotal, byCat: dayByCat }
  }
  return { totalSec, idleSec, switches, byCat, byApp, byDay }
}

/** 单小时主分类（24h 时间带用） */
export function hourDominant(day: TrailDay, hour: number, rules: CatRule[]): { sec: number; cat: string } | null {
  const bucket = day.hours?.[String(hour)]
  if (!bucket) return null
  let bestSec = 0
  let bestCat = 'other'
  for (const [app, sec0] of Object.entries(bucket)) {
    if (app === '_idle') continue
    const sec = Number(sec0) || 0
    if (sec <= 0) continue
    const cat = classifyApp(app, rules)
    if (sec > bestSec) { bestSec = sec; bestCat = cat }
  }
  return bestSec > 0 ? { sec: bestSec, cat: bestCat } : null
}

// ── 命令（投递 + 结果轮询；执行者唯一是后台服务）───────────────────────────
export function nonce(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined
  const id = c && typeof c.randomUUID === 'function'
    ? c.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return prefix + id
}

async function waitResult(n: string, timeoutMs: number, stepMs = 1200): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, stepMs))
    const r = await kvGet<Record<string, unknown>>(K.result(n)).catch(() => null)
    if (r) {
      kvDel(K.result(n)).catch(() => {})
      return r
    }
  }
  return null
}

export type CmdAction = 'flush' | 'collector_restart' | 'purge_app' | 'purge_all'

export async function runCmd(payload: { action: CmdAction; app?: string; confirm?: boolean }, timeoutMs = 45 * 1000): Promise<{ ok: boolean; error?: string; payload?: Record<string, unknown> }> {
  const n = nonce('c')
  await kvSet(K.cmd(n), { ...payload, at: Date.now() })
  const r = await waitResult(n, timeoutMs)
  if (!r) return { ok: false, error: '等待结果超时：后台服务可能未运行（设置 Tab 可查看/启动服务）' }
  if (r.ok) return { ok: true, payload: (r.payload as Record<string, unknown>) ?? {} }
  return { ok: false, error: String(r.error || '操作失败') }
}

export async function saveSettings(patch: Partial<TrailSettings>, current: TrailSettings): Promise<TrailSettings> {
  const next = { ...current, ...patch }
  await kvSet(K.settings, next)
  return next
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举安装信息）──
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

export async function listServiceStatus(): Promise<ServiceStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as ServiceStatus[]) : []
}

export const SERVICE_ID = 'trail-service'

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

/** 后端期望的 contribution 形态（与主仓 toBackendContribution 对齐） */
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

// ── 心跳三态 ───────────────────────────────────────────────────────────────
export interface ServiceState {
  state: 'ok' | 'stale' | 'down'
  text: string
}

export function heartbeatOf(snap: TrailSnapshot | null, meta: TrailMeta | null): ServiceState {
  if (snap && snap.paused) return { state: 'stale', text: '已暂停（隐私模式）' }
  const age = snap && typeof snap.at === 'number' ? Math.round((Date.now() - snap.at) / 1000) : Infinity
  if (!snap || age === Infinity) {
    if (meta?.lastTickAt && Date.now() - meta.lastTickAt < 150 * 1000) {
      return { state: 'stale', text: '服务启动中，快照未就绪' }
    }
    return { state: 'down', text: '服务未运行' }
  }
  if (age <= 90) {
    const c = snap.current && snap.current.app ? `· 正在用 ${displayName(snap.current.app)}` : ''
    return { state: 'ok', text: `采集中（${snap.tickSec}s）${c}` }
  }
  return { state: 'stale', text: `快照停滞 ${age >= 90 ? `${Math.round(age / 60)} 分钟` : `${age} 秒`}` }
}
