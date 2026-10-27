/**
 * 通信层 + 数据方舟数据访问（面板）
 *
 * 策略计算复用 shared/ark-core.js（与 MCP/服务同一权威，esbuild 打包进 bundle）；
 * 本文件只做 cap.kv IO、命令键下发（快照/校验/恢复等服务动作）与视图模型组装。
 *
 * 键空间契约（与 service/ark.js、mcp/server.js 一致，权威描述见 README）：
 *   dataark.settings / dataark.state / dataark.snapshot.<id>
 *   dataark.event.* / dataark.cmd.* / dataark.cmd.result.<nonce>
 */
import { getHostInvoke } from './host'
import * as core from '../shared/ark-core.js'

export const K = core.K
export const PLUGIN_ID = core.PLUGIN_ID
export const SERVICE_ID = core.SERVICE_ID
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as ArkSettings
export const DEFAULT_EXCLUDE_TOP = core.DEFAULT_EXCLUDE_TOP as string[]
export const formatBytes = core.formatBytes
export const fmtDuration = core.fmtDuration
export const timeAgo = core.timeAgo
export const describeSchedule = (sc: Schedule) => {
  if (!sc || sc.mode === 'off') return '手动模式（不自动备份）'
  if (sc.mode === 'interval') return `每 ${sc.intervalHours} 小时`
  return `每天 ${sc.at}`
}

// ── 类型 ───────────────────────────────────────────────────────────────────
export interface Schedule {
  mode: 'off' | 'interval' | 'daily'
  intervalHours: number
  at: string
}

export interface ArkSettings {
  schemaVersion: number
  targetDir: string
  excludeTop: string[]
  extraExcludeGlobs: string[]
  retention: { daily: number; weekly: number; monthly: number }
  schedule: Schedule
  maxStoreBytes: number
}

export interface SnapshotIdx {
  id: string
  startedAt: number
  finishedAt: number
  durationMs: number
  type: 'full' | 'incremental'
  baseId: string | null
  totalFiles: number
  changedFiles: number
  skipped: number
  logicalBytes: number
  newObjects: number
  storedBytes: number
  ok: boolean
  error: string | null
  trigger?: string
}

export interface ArkState {
  lease?: { id: string; host: string; pid: number; expiresAt: number } | null
  nextRunAt?: number | null
  lastRunAt?: number | null
  lastSnapshotId?: string
  lastSnapshotAt?: number
  lastResult?: { ok: boolean; at: number; trigger?: string; error?: string; snapshotId?: string; summary?: { totalFiles: number; changedFiles: number; newObjects: number; storedBytes: number; durationMs: number } }
  lastVerify?: { ok: boolean; snapId: string; mode: string; checked: number; missing: string[]; corrupt: string[]; durationMs: number; at: number }
  degraded?: { reason: string; at: number } | null
  resolvedTarget?: string
  storeBytes?: number
  objectsTotal?: number
  lastTickAt?: number
}

export interface ArkEvent {
  at: number
  type: string
  msg: string
  snapshotId?: string
}

export interface Overview {
  settings: ArkSettings
  state: ArkState
  snapshots: SnapshotIdx[]
  events: ArkEvent[]
}

export interface CmdResult {
  ok: boolean
  error?: string
  stagingDir?: string
  restored?: number
  total?: number
  notFound?: string[]
  snapId?: string
  mode?: string
  checked?: number
  missing?: string[]
  corrupt?: string[]
  durationMs?: number
  files?: { p: string; s: number; m: number; c: number }[]
  matched?: number
  skipped?: { p: string; reason: string }[]
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

// ── 总览加载 ───────────────────────────────────────────────────────────────
export async function loadOverview(): Promise<Overview> {
  const keys = await kvKeys()
  const snapKeys = keys.filter((k) => k.startsWith(core.K.snapshotPrefix))
  const eventKeys = keys.filter((k) => k.startsWith(core.K.eventPrefix))
  const [settingsRaw, state, snapVals, eventVals] = await Promise.all([
    kvGet<Partial<ArkSettings>>(core.K.settings).catch(() => null),
    kvGet<ArkState>(core.K.state).catch(() => null),
    Promise.all(snapKeys.map((k) => kvGet<SnapshotIdx>(k).catch(() => null))),
    Promise.all(eventKeys.map((k) => kvGet<ArkEvent>(k).catch(() => null))),
  ])
  const norm = core.normalizeSettings(settingsRaw && typeof settingsRaw === 'object' ? settingsRaw : {})
  return {
    settings: (norm.error ? { ...DEFAULT_SETTINGS } : norm.settings) as unknown as ArkSettings,
    state: state && typeof state === 'object' ? state : {},
    snapshots: snapVals.filter((s): s is SnapshotIdx => !!s && typeof s === 'object' && !!s.id)
      .sort((a, b) => Number(b.finishedAt) - Number(a.finishedAt)),
    events: eventVals.filter((e): e is ArkEvent => !!e && typeof e === 'object' && Number.isFinite(Number(e.at)))
      .sort((a, b) => Number(b.at) - Number(a.at)),
  }
}

// ── 服务命令（命令键 → 服务消费 → 结果键轮询）─────────────────────────────
function nonce(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 下发命令并轮询结果；onPoll 用于进度展示。超时给明确指引。 */
export async function runCmd(
  write: (key: string) => Promise<void>,
  resultKey: string,
  opts: { timeoutMs?: number; pollMs?: number; onPoll?: () => void } = {},
): Promise<CmdResult> {
  const timeoutMs = opts.timeoutMs ?? 60000
  const pollMs = opts.pollMs ?? 1500
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs))
    opts.onPoll?.()
    const r = await kvGet<CmdResult>(resultKey).catch(() => null)
    if (r && typeof r === 'object') {
      kvDel(resultKey).catch(() => {})
      return r
    }
  }
  return { ok: false, error: `等待服务结果超时（${Math.round(timeoutMs / 1000)}s）——后台服务可能未运行，去「服务」页启动/重启` }
}

const nonceKey = (prefix: string) => `${prefix}.${nonce()}`

/** 异步命令（backup/verify/gc）：下发即返回 */
export async function fireAndForget(write: (key: string) => Promise<void>): Promise<void> {
  await write('')
}

export async function triggerBackup(): Promise<void> {
  await kvSet(core.K.cmdBackup, { op: 'backup', at: Date.now() })
}

export async function triggerVerify(snapId: string, mode: 'quick' | 'deep'): Promise<void> {
  await kvSet(core.K.cmdVerify(snapId || 'latest'), { op: 'verify', mode, at: Date.now() })
}

export async function triggerGc(): Promise<void> {
  await kvSet(core.K.cmdGc, { op: 'gc', at: Date.now() })
}

export async function restoreFiles(snapId: string, paths: string[] | null, onPoll?: () => void): Promise<CmdResult> {
  const key = nonceKey('dataark.cmd.restore')
  const resultKey = core.K.cmdResult(key.slice('dataark.cmd.restore.'.length))
  await kvSet(key, { snapId, paths, at: Date.now() })
  return runCmd(() => Promise.resolve(), resultKey, { timeoutMs: 180000, onPoll })
}

export async function listSnapshotFiles(snapId: string, query: string, onPoll?: () => void): Promise<CmdResult> {
  const key = nonceKey('dataark.cmd.listfiles')
  const resultKey = core.K.cmdResult(key.slice('dataark.cmd.listfiles.'.length))
  await kvSet(key, { snapId, query, limit: 200, at: Date.now() })
  return runCmd(() => Promise.resolve(), resultKey, { timeoutMs: 30000, onPoll })
}

// ── 设置 ───────────────────────────────────────────────────────────────────
export async function saveSettings(s: ArkSettings): Promise<{ ok: boolean; error?: string }> {
  const norm = core.normalizeSettings(s)
  if (norm.error) return { ok: false, error: norm.error }
  await kvSet(core.K.settings, norm.settings)
  return { ok: true }
}

/** 清除运行状态/索引/事件/命令残留（不动 settings、不动备份库磁盘文件） */
export async function resetRuntimeState(): Promise<number> {
  const keys = (await kvKeys()).filter((k) =>
    k.startsWith(core.K.snapshotPrefix)
    || k.startsWith(core.K.eventPrefix)
    || k.startsWith(core.K.cmdPrefix)
    || k === core.K.state)
  await Promise.all(keys.map((k) => kvDel(k)))
  return keys.length
}

// ── 服务管理（cap.pluginServiceManager；start 需经 discovery 自举，同 page-sentinel）──
export interface ServiceStatus {
  pluginId?: string
  serviceId?: string
  id?: string
  status?: string
  running?: boolean
  pid?: number
  [k: string]: unknown
}

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
