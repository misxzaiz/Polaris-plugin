/**
 * model.ts —— 通信层 + 数据访问（会话记忆面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 sift.* 键空间。键空间契约（与 service/sift.js、mcp/server.js
 * 三方一致，权威描述见 README）：
 *   sift.settings        设置（面板写，服务 30s 热读）
 *   sift.meta            服务心跳（服务写）
 *   sift.cat.head / sift.cat.<n>   目录分块（服务单写，面板直读）
 *   sift.stats.total / sift.stats.daily  足迹统计（服务单写，面板直读）
 *   sift.cmd.<op>.<nonce>  命令信箱（面板写 → 服务先删后做）
 *   sift.result.<nonce>    结果（服务写，面板读后删）
 *
 * 检索/阅读走命令信箱（索引在服务进程内存里，跨端一致）；目录/统计直读 kv
 * （服务离线也能浏览）。
 */
import { getHostInvoke } from './host'

// ── 类型 ───────────────────────────────────────────────────────────────────

export type SiftSource = 'polaris' | 'v2' | 'claude' | 'zcode'

export const SOURCE_LABEL: Record<SiftSource, string> = {
  polaris: 'Polaris',
  v2: '会话v2',
  claude: 'Claude',
  zcode: 'ZCode',
}

export interface SiftEntry {
  sid: string
  source: SiftSource
  title: string
  engineId: string
  workspace: string
  createdAt: number
  updatedAt: number
  msgCount: number
  proseChars: number
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  costUsd?: number
}

export interface SiftMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  degraded?: boolean
  dataRoot?: string
  smoke?: boolean
  sqlite?: boolean
  indexing?: { phase: string; done: number; total: number; startedAt: number; error: string }
  catalog?: { sessions: number }
  sources?: Record<string, { files: number; ok: number; err: number; lastScanAt: number }>
  settings?: { sources: Record<SiftSource, boolean>; excludeKeywords: number }
}

export interface SiftSettings {
  sources: Record<SiftSource, boolean>
  excludeKeywords: string[]
  maxMsgChars: number
  sqliteRefreshMin: number
}

export interface Totals {
  sessions: number
  messages: number
  proseChars: number
  activeDays: number
  firstDay: string
  lastDay: string
  bySource: Record<string, { sessions: number; messages: number }>
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number; sessionsCovered: number }
}

export interface SearchHit {
  sid: string
  source: SiftSource
  title: string
  engineId: string
  workspace: string
  updatedAt: number
  msgCount: number
  hitCount: number
  snippet: { msgIndex: number; role: string; ts: string | number; text: string; hit: boolean; offset: number }
}

export interface OpenMessage {
  i: number
  role: string
  ts: string | number
  text: string
}

export interface OpenResult {
  entry?: SiftEntry
  messages?: OpenMessage[]
  total?: number
  truncated?: boolean
  error?: string
}

export interface TimelineGroup {
  day: string
  sessions: SiftEntry[]
}

// ── 通道 ───────────────────────────────────────────────────────────────────

interface RouterResponse<T> {
  ok: boolean
  result?: T
  error?: string
}

export async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<RouterResponse<T>>('router_dispatch', { req: { target, payload } })
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? ({} as T)) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r && r.value !== undefined ? r.value : null
  } catch (_) {
    return null // 读到的键可能刚被并发删掉，容忍 null
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return (r && r.keys) || []
}

// ── 命令信箱（先写 cmd → 轮询 result → 读后删）─────────────────────────────

function newNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function mailboxCall<T>(
  op: 'search' | 'open',
  payload: Record<string, unknown>,
  opts: { deadlineMs?: number } = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const nonce = newNonce()
  await kvSet(`sift.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() })
  const resultKey = `sift.result.${nonce}`
  const deadline = opts.deadlineMs ?? 30000
  const t0 = Date.now()
  while (Date.now() - t0 < deadline) {
    await sleep(1200)
    const res = await kvGet<{ ok: boolean; data?: T; error?: string }>(resultKey)
    if (res && typeof res === 'object' && res.ok !== undefined) {
      kvDel(resultKey).catch(() => {})
      return res
    }
  }
  return {
    ok: false,
    error: '等待服务响应超时（30s）。后台服务可能未运行——去「设置」页看服务状态，或稍后重试。',
  }
}

// ── 直读（服务离线可浏览）─────────────────────────────────────────────────

export async function readMeta(): Promise<SiftMeta | null> {
  return kvGet<SiftMeta>('sift.meta')
}

export async function readTotals(): Promise<Totals | null> {
  return kvGet<Totals>('sift.stats.total')
}

export async function readDaily(): Promise<Record<string, { s: number; m: number }> | null> {
  return kvGet<Record<string, { s: number; m: number }>>('sift.stats.daily')
}

export async function readCatalog(): Promise<SiftEntry[]> {
  const head = await kvGet<{ count: number; chunks: number; rev: number }>('sift.cat.head')
  if (!head || !head.chunks) return []
  const n = Math.min(Number(head.chunks) || 0, 40)
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet<SiftEntry[]>(`sift.cat.${i}`)),
  )
  const out: SiftEntry[] = []
  for (const r of results) if (Array.isArray(r)) out.push(...r)
  return out
}

export async function readSettings(): Promise<SiftSettings> {
  const raw = await kvGet<Partial<SiftSettings>>('sift.settings')
  const src: Partial<Record<SiftSource, boolean>> = (raw && raw.sources) || {}
  return {
    sources: {
      polaris: src.polaris !== false,
      v2: src.v2 !== false,
      claude: src.claude !== false,
      zcode: src.zcode !== false,
    },
    excludeKeywords: Array.isArray(raw && raw.excludeKeywords) ? (raw!.excludeKeywords as string[]) : [],
    maxMsgChars: (raw && raw.maxMsgChars) || 4000,
    sqliteRefreshMin: (raw && raw.sqliteRefreshMin) || 10,
  }
}

export async function saveSettings(s: SiftSettings): Promise<void> {
  await kvSet('sift.settings', s)
}

// ── 服务状态与自举 start（cap.pluginServiceManager 三步）──────────────────

export interface ServiceStatus {
  status: string
  lastError?: string
}

export async function readServiceStatus(serviceId: string): Promise<ServiceStatus | null> {
  try {
    const st = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
    if (!Array.isArray(st)) return null
    const mine = st.find((s) => (s as { serviceId?: string }).serviceId === serviceId)
    return mine ? { status: String((mine as { status?: string }).status || '?'), lastError: (mine as { lastError?: string }).lastError } : null
  } catch (_) {
    return null
  }
}

/** start 必须带 installPath + contribution（面板不知道自己装在哪 → 插件发现自举） */
export async function selfStartService(pluginId: string, serviceId: string): Promise<void> {
  const disc = await capDispatch<{
    plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Array<Record<string, unknown>> } }>
  }>('cap.pluginDiscovery', { action: 'discover' })
  const self = (disc.plugins || []).find((p) => p.id === pluginId)
  if (!self) throw new Error('插件发现结果里找不到自己（插件可能刚安装，重启应用后再试）')
  const svc = ((self.contributes && self.contributes.services) || []).find((s) => s.id === serviceId)
  if (!svc) throw new Error('清单里没有声明该服务')
  await capDispatch('cap.pluginServiceManager', {
    action: 'start',
    pluginId,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType,
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 3,
      description: svc.description ?? null,
    },
  })
}

export async function stopService(serviceId: string): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'stop', pluginId: 'time-sift', serviceId })
}
