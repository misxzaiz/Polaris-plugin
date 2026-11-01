/**
 * 通信层 + 数据访问（密钥扫描台面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 keyscan.* 键空间。扫描记录/发现分块/历史/心跳的唯一写者
 * 是后台服务（service/main.js）——面板只读这些、写设置与扫描命令键。
 *
 * 掩码不变量：本面板从 kv 读到的发现条目全部是掩码形态（前4后2），
 * 完整密钥值在任何通道都不可见（见 shared/scan-core.js）。
 *
 * 键空间契约（与 service/main.js、mcp/server.js 三方一致，权威描述见 README）：
 *   keyscan.settings           设置（面板写，服务读）
 *   keyscan.meta               服务心跳（服务写）
 *   keyscan.latest             最近完成扫描指针（服务写）
 *   keyscan.history            近 20 次扫描紧凑历史（服务写）
 *   keyscan.scan.<id>          扫描记录：running→done/failed（服务写）
 *   keyscan.find.<id>.<n>      发现分块 ≤150 条/块（服务写，全掩码）
 *   keyscan.ignore             误报忽略表（面板/MCP 写，服务读）
 *   keyscan.cmd.scan.<nonce>   扫描命令（面板写，服务读载荷后删键互斥消费）
 *   keyscan.result.<nonce>     命令结果（服务写，消费者读后删）
 */
import { getHostInvoke } from './host'

export const PLUGIN_ID = 'keyscan'
export const SERVICE_ID = 'keyscan-service'

// ── kv 基础 ─────────────────────────────────────────────────────────────────
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>('router_dispatch', {
    req: { target, payload },
  })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r.value !== undefined ? (r.value as T) : null
  } catch (_) {
    return null // 读到的键可能刚被并发删掉——容忍 null（keyspace 纪律）
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
  return r.keys ?? []
}

// ── 类型（与 service/main.js 落 kv 形态对齐）─────────────────────────────────
export type Sev = 'critical' | 'high' | 'medium'

export interface Occurrence { file: string; line: number }

/** 发现条目（全掩码：preview/ctx 永不含完整密钥值） */
export interface Finding {
  fp: string
  rule: string
  sev: Sev
  preview: string
  ctx: string
  count: number
  occurrences: Occurrence[]
  firstFile?: string
}

export interface SevCounts { critical: number; high: number; medium: number }
export interface DiffCounts { newCount: number; newCritical: number; newHigh: number }

export interface ScanRecord {
  id: string
  at: number
  root: string
  status: 'running' | 'done' | 'failed'
  version?: string
  progress?: { files: number; findings: number }
  finishedAt?: number
  durationMs?: number
  files?: number
  filesScanned?: number
  skippedBinary?: number
  skippedSize?: number
  skippedDirs?: number
  readErrors?: number
  truncated?: boolean
  truncatedReason?: string
  findingCount?: number
  rawCount?: number
  chunks?: number
  ignoredCount?: number
  counts?: SevCounts
  new?: DiffCounts
  error?: string
}

export interface LatestSummary {
  id: string
  at: number
  root: string
  counts?: SevCounts
  new?: DiffCounts
  findingCount?: number
  files?: number
  durationMs?: number
}

export interface HistoryEntry extends LatestSummary { truncated?: boolean }

export interface ServiceMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  degraded?: boolean
  lastBridgeErr?: string | null
  scanning?: { id: string; root: string; nonce?: string } | null
  rules?: number
  prevScanId?: string | null
}

export interface ScanSettings {
  root?: string
  maxFileKB?: number
  maxFiles?: number
  maxTotalMB?: number
  skipDirs?: string[]
  disabledRules?: string[]
}

export interface IgnoreEntry { fp: string; note?: string; at?: number }

// ── 键名（与 service 一致）─────────────────────────────────────────────────
const K = {
  settings: 'keyscan.settings',
  meta: 'keyscan.meta',
  latest: 'keyscan.latest',
  history: 'keyscan.history',
  ignore: 'keyscan.ignore',
  scan: (id: string) => `keyscan.scan.${id}`,
  find: (id: string, n: number) => `keyscan.find.${id}.${n}`,
  cmdScan: (nonce: string) => `keyscan.cmd.scan.${nonce}`,
  result: (nonce: string) => `keyscan.result.${nonce}`,
}

// ── 业务读取 ────────────────────────────────────────────────────────────────
export async function loadPanelData() {
  const [meta, latest, history, ignore, settings] = await Promise.all([
    kvGet<ServiceMeta>(K.meta),
    kvGet<LatestSummary>(K.latest),
    kvGet<HistoryEntry[]>(K.history),
    kvGet<IgnoreEntry[]>(K.ignore),
    kvGet<ScanSettings>(K.settings),
  ])
  return { meta, latest, history: history ?? [], ignore: ignore ?? [], settings: settings ?? {} }
}

export async function loadScanRecord(id: string): Promise<ScanRecord | null> {
  return kvGet<ScanRecord>(K.scan(id))
}

/** 拉一次扫描的全部分块发现（面板本地过滤/搜索） */
export async function loadFindings(id: string, maxChunks = 400): Promise<Finding[]> {
  const out: Finding[] = []
  for (let n = 0; n < maxChunks; n++) {
    const chunk = await kvGet<Finding[]>(K.find(id, n))
    if (!chunk || !Array.isArray(chunk) || !chunk.length) break
    out.push(...chunk)
    if (out.length > 20000) break // 读取保护
  }
  return out
}

export async function loadIgnore(): Promise<IgnoreEntry[]> {
  const v = await kvGet<IgnoreEntry[]>(K.ignore)
  return Array.isArray(v) ? v : []
}

// ── 命令：发起扫描（写命令键 → 轮询结果键）──────────────────────────────────
function nonce() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export interface ScanOutcome {
  ok: boolean
  error?: string
  scanId?: string
  counts?: SevCounts
  new?: DiffCounts
  findingCount?: number
  files?: number
  durationMs?: number
  truncated?: boolean
}

export async function requestScan(root: string, onTick?: (info: string) => void): Promise<ScanOutcome> {
  const target = root.trim()
  if (!target) return { ok: false, error: '请先填一个要扫描的目录路径。' }
  const n = nonce()
  await kvSet(K.cmdScan(n), { root: target, at: Date.now(), from: 'panel' })
  // 双路径轮询（快扫描 <1.2s 时 meta.scanning 窗口可能整段错过）：
  //  ① 快路径：result 键（服务完成即写）——拿 scanId/终态直接返回
  //  ② 慢路径：meta.scanning（nonce 对号）→ 扫描记录 → 活进度
  const deadline = Date.now() + 15 * 60 * 1000
  let scanId = ''
  let saidWaiting = false
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200))
    if (!scanId) {
      const done = await kvGet<ScanOutcome & { at: number }>(K.result(n))
      if (done && (done.ok || done.error)) {
        await kvDel(K.result(n)).catch(() => {})
        if (done.ok) {
          return {
            ok: true, scanId: done.scanId, counts: done.counts, new: done.new,
            findingCount: done.findingCount, files: done.files,
            durationMs: done.durationMs, truncated: done.truncated,
          }
        }
        return { ok: false, error: done.error || '扫描失败' }
      }
      const meta = await kvGet<ServiceMeta>(K.meta)
      if (meta?.scanning && meta.scanning.nonce === n) {
        scanId = meta.scanning.id
        continue
      }
      if (!saidWaiting) {
        onTick?.('命令已投递，等待后台服务接受（若服务未运行，请到「设置」启动）…')
        saidWaiting = true
      }
      continue
    }
    const rec = await loadScanRecord(scanId)
    if (!rec) continue
    if (rec.status === 'done') {
      await kvDel(K.result(n)).catch(() => {}) // 面板路径清理（MCP 未等待时服务 TTL 兜底）
      return {
        ok: true, scanId: rec.id, counts: rec.counts, new: rec.new,
        findingCount: rec.findingCount, files: rec.files,
        durationMs: rec.durationMs, truncated: rec.truncated,
      }
    }
    if (rec.status === 'failed') {
      await kvDel(K.result(n)).catch(() => {})
      return { ok: false, error: rec.error || '扫描失败' }
    }
    onTick?.(`扫描进行中：已遍历 ${rec.progress?.files ?? 0} 个文件，候选 ${rec.progress?.findings ?? 0}…`)
  }
  return { ok: false, error: '等待超时：扫描可能仍在进行，稍后到「发现」或「历史」Tab 查看结果。' }
}

// ── 设置与忽略表 ────────────────────────────────────────────────────────────
export async function saveSettings(s: ScanSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function saveIgnore(list: IgnoreEntry[]): Promise<void> {
  await kvSet(K.ignore, list)
}

/** 清空本插件全部键（只动 keyscan.* 前缀——keyspace 清扫纪律） */
export async function purgeOwnKeys(): Promise<number> {
  const keys = await kvKeys()
  const mine = keys.filter((k) => k.startsWith('keyscan.'))
  for (const k of mine) await kvDel(k).catch(() => {})
  return mine.length
}

// ── 服务管理（自举 start：discover 拿 installPath+contribution）─────────────
interface SvcStatus { pluginId?: string; serviceId?: string; status?: string; lastError?: string }

export async function serviceStatus(): Promise<SvcStatus | null> {
  try {
    const list = await capDispatch<SvcStatus[]>('cap.pluginServiceManager', { action: 'list_status' })
    const arr = Array.isArray(list) ? list : []
    return arr.find((s) => s.pluginId === PLUGIN_ID && s.serviceId === SERVICE_ID) ?? null
  } catch (_) {
    return null
  }
}

export async function serviceStart(): Promise<void> {
  const disc = await capDispatch<{ plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Record<string, unknown>[] } }> }>(
    'cap.pluginDiscovery', { action: 'discover' },
  )
  const self = (disc.plugins ?? []).find((p) => p.id === PLUGIN_ID)
  const svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID)
  if (!self || !svc) throw new Error('插件发现结果里找不到本插件的服务贡献——尝试重启 Polaris 后再试。')
  await capDispatch('cap.pluginServiceManager', {
    action: 'start',
    pluginId: PLUGIN_ID,
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

export async function serviceAction(action: 'stop' | 'restart'): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}
