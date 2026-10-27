/**
 * 通信层 + 数据访问（书签考古面板）
 *
 * 键空间契约（权威表见 README；面板/服务/MCP 三方一致）：
 *   bmd.settings / bmd.meta / bmd.rec.<n> / bmd.run / bmd.report.<id>
 *   bmd.cmd.<op>[.<seq>].<nonce>（面板/MCP 写，服务先删后做）
 *   bmd.result.<nonce>
 *
 * 单写者：bmd.rec.* / bmd.run / bmd.report 只由服务写；面板导入也走命令键
 * （分批 ≤400 条/批，服务按 seq 有序合并），避免多方写同一分块的竞态。
 */
import { getHostInvoke } from './host'
import * as core from '../shared/dig-core'

export { core }

export interface Settings {
  batchSize: number
  concurrency: number
  timeoutMs: number
  recheckDays: number
  autoCheckOnImport: boolean
  checkEnabled: boolean
}

export interface Meta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  degraded?: boolean
  bridge?: string
  records?: number
  run?: { id: string; type: string; cursor: number; total: number } | null
}

export interface RunState {
  id: string
  type: string
  startedAt: number
  queue: string[]
  cursor: number
  done: number
  checked: number
  okCount: number
  deadCount: number
  byStatus: Record<string, number>
}

export interface DigRecord {
  id: string
  url: string
  normKey: string
  host: string
  title: string
  folder: string
  addedAt: number
  importedAt: number
  source: string
  tags: string[]
  status: string
  lastCheckedAt: number
  lastOkAt: number
  lastVisitAt: number
  lastResurfaceAt: number
  httpStatus: number
  finalUrl: string
  latencyMs: number
  failReason: string
  tries: number
}

export function normalizeSettings(raw: unknown): Settings {
  return core.normalizeSettings(raw)
}

// ── cap 通道 ────────────────────────────────────────────────────────────────
async function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<{ ok: boolean; result?: T; error?: string }>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key }).catch(() => null)
  return ((r && r.value) ?? null) as T | null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key }).catch(() => {})
}

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' }).catch(() => null)
  return (r && Array.isArray(r.keys)) ? r.keys : []
}

// ── 键空间 ──────────────────────────────────────────────────────────────────
export const K = {
  settings: 'bmd.settings',
  meta: 'bmd.meta',
  run: 'bmd.run',
  recPrefix: 'bmd.rec.',
  cmdPrefix: 'bmd.cmd.',
  resultPrefix: 'bmd.result.',
  reportPrefix: 'bmd.report.',
}

// ── 记录读取（分块拼接；只读，写全部走命令）────────────────────────────────
export async function readAllRecords(): Promise<DigRecord[]> {
  const keys = await kvKeys()
  const nums = keys.filter((k) => k.startsWith(K.recPrefix))
    .map((k) => Number(k.slice(K.recPrefix.length)))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b)
  const chunks = await Promise.all(nums.map(async (n) => kvGet<DigRecord[]>(K.recPrefix + n)))
  const out: DigRecord[] = []
  for (const c of chunks) if (Array.isArray(c)) for (const r of c) if (r && r.id && r.normKey) out.push(r)
  return out
}

export async function loadReports(): Promise<Array<{ id: string; type: string; startedAt: number; finishedAt: number; total: number; checked: number; okCount: number; deadCount: number; byStatus: Record<string, number> }>> {
  const keys = await kvKeys()
  const ids = keys.filter((k) => k.startsWith(K.reportPrefix)).sort()
  const reports = await Promise.all(ids.map(async (k) => kvGet(K.reportPrefix + k)))
  return reports.filter(Boolean) as never
}

// ── 命令通道（写命令键；结果可选轮询）───────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** 发命令（导入用：分批写 bmd.cmd.import.<seq>；其余 bmd.cmd.<op>.<nonce>） */
export async function sendImportBatches(records: Array<{ url: string; title?: string; folder?: string; addedAt?: number; source?: string }>): Promise<number> {
  const batches = Math.ceil(records.length / 400)
  for (let i = 0; i < batches; i++) {
    await kvSet(`${K.cmdPrefix}import.${i}`, { records: records.slice(i * 400, (i + 1) * 400), totalBatches: batches, at: Date.now() })
  }
  return batches
}

export async function sendCmd(op: string, payload: Record<string, unknown> = {}): Promise<string> {
  const nonce = 'c' + uid()
  await kvSet(`${K.cmdPrefix}${op}.${nonce}`, { ...payload, nonce, at: Date.now() })
  return nonce
}

export interface CmdResult { ok?: boolean; error?: string; summary?: Record<string, unknown>; at?: number }

export async function pollResult(nonce: string, timeoutMs = 30000, stepMs = 1200): Promise<CmdResult | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, stepMs))
    const r = await kvGet<CmdResult>(K.resultPrefix + nonce).catch(() => null)
    if (r) { kvDel(K.resultPrefix + nonce).catch(() => {}); return r }
  }
  return null
}

// ── 组合动作 ────────────────────────────────────────────────────────────────
export async function loadMeta(): Promise<Meta | null> { return kvGet<Meta>(K.meta) }
export async function loadRun(): Promise<RunState | null> { return kvGet<RunState>(K.run) }

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await kvGet(K.settings))
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

export function fmtTime(ts?: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '未检查', ok: '存活', redirect: '重定向', dead4xx: '死链(4xx)', dead5xx: '5xx',
    dns: '域名失效', timeout: '超时', ssl: '证书错误', blocked: '内网拒检', invalid: '非法URL',
  }
  return map[s] || s
}

export function statusColor(s: string): string {
  if (s === 'ok' || s === 'redirect') return '#3aa76d'
  if (s === 'pending') return '#9aa0a6'
  if (s === 'dead5xx' || s === 'timeout') return '#d9a13b'
  return '#d9564a'
}

// ── 服务管理（cap.pluginServiceManager；start 需 discovery 自举）────────────
export async function listServiceStatus(): Promise<Array<{ pluginId?: string; serviceId?: string; status?: string; lastError?: string }>> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  return Array.isArray(r) ? (r as never) : []
}

interface DiscoveredSelf {
  installPath: string
  services: Record<string, unknown>[]
}

async function discoverSelf(pluginId: string): Promise<DiscoveredSelf | null> {
  const r = await capDispatch<{ plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Record<string, unknown>[] } }> }>('cap.pluginDiscovery', { action: 'discover' })
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId)
  if (!self || !self.installPath) return null
  return { installPath: self.installPath, services: self.contributes?.services ?? [] }
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

// ── 剪贴板回退（手机非安全上下文）───────────────────────────────────────────
export async function copyText(text: string): Promise<'copied' | 'manual'> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch (_) { /* 回退 */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch (_) { ok = false }
  document.body.removeChild(ta)
  if (ok) return 'copied'
  window.prompt('手机端自动复制不可用，请手动复制：', text)
  return 'manual'
}
