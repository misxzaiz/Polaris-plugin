/**
 * 通信层 + 数据访问（进程透视台面板）
 *
 * 键空间契约（与 service/main.js、mcp/server.js 三方一致，权威描述见 README）：
 *   pdesk.meta     服务心跳（服务写，30s；面板/MCP 据此发现端口与平台）
 *   pdesk.audit    审计环（服务单写者；arm/fire/拒绝记录，上限 120 条）
 */
import { getHostInvoke } from './host'
import { formatBytes as coreFmtBytes } from '../shared/core.js'

export const fmtBytes = (n: number | null | undefined): string => coreFmtBytes(n ?? undefined)

export const PLUGIN_ID = 'process-desk'
export const SERVICE_ID = 'process-service'

// ── 类型（与 service/main.js 返回结构对齐）─────────────────────────────────
export interface ProcInfo {
  pid: number
  ppid?: number
  name: string
  cmd?: string | null
  path?: string | null
  started?: string | null
  cpu?: number | null
  ws?: number | null
  instances?: number
  polaris?: boolean
}

export interface AddrPort { addr: string; port: number }

export interface NetRow {
  proto: 'TCP' | 'UDP'
  local: AddrPort
  foreign: AddrPort
  state: string
  pid: number
}

export interface PortEntry { row: NetRow; proc: ProcInfo | null }

export interface Locker {
  pid: number
  app?: string | null
  type?: string | null
  proc?: ProcInfo | null
}

export interface FileLockResult {
  ok: boolean
  path: string
  locked: boolean
  lockers: Locker[]
  error?: string | null
  hint?: string | null
}

export interface PdeskMeta {
  version?: string
  pid?: number
  port?: number
  platform?: string
  psOk?: boolean
  startedAt?: number
  lastTickAt?: number
  totalKills?: number
}

export interface AuditEntry { at: number; op: string; detail: unknown; outcome: string }

export interface ArmResult {
  ok: boolean
  error?: string
  code?: string
  token?: string
  proc?: ProcInfo
  needAllowProtected?: boolean
  warnings?: string[]
}

// ── cap 通道 ───────────────────────────────────────────────────────────────
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>(
    'router_dispatch', { req: { target, payload } },
  )
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key }).catch(() => null)
  return r && r.value !== undefined ? r.value : null
}

export async function getMeta(): Promise<PdeskMeta | null> {
  const v = await kvGet<PdeskMeta>('pdesk.meta')
  return v && typeof v === 'object' ? v : null
}

// ── 服务管理（cap.pluginServiceManager；start 需 discover 自举）────────────
interface DiscoverResponse {
  plugins?: Array<{
    id: string
    installPath: string
    contributes?: { services?: Record<string, unknown>[] }
  }>
}

export async function serviceStart(): Promise<void> {
  const disc = await capDispatch<DiscoverResponse>('cap.pluginDiscovery', { action: 'discover' })
  const self = (disc.plugins ?? []).find((p) => p.id === PLUGIN_ID)
  if (!self) throw new Error('插件发现里找不到 process-desk（插件未正确安装？）')
  const svc = self.contributes?.services?.find((s) => s.id === SERVICE_ID)
  if (!svc) throw new Error('manifest 里没有 process-service 服务贡献')
  await capDispatch('cap.pluginServiceManager', {
    action: 'start',
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: SERVICE_ID,
      type: (svc.type as string) ?? 'http',
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 10,
      description: svc.description ?? null,
    },
  })
}

export async function serviceAction(action: 'stop' | 'restart'): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}

// ── 服务 HTTP 直连（127.0.0.1；CORS 由自家服务放行；强制客户端标识头）──────
export function serviceBase(meta: PdeskMeta | null): string {
  const port = meta && Number(meta.port) > 0 ? Number(meta.port) : 0
  if (!port) throw new Error('服务端口未知（服务未上线）：点右上「启动服务」或稍后重试')
  return `http://127.0.0.1:${port}`
}

async function apiPost<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pdesk-client': 'polaris' },
    body: JSON.stringify(body ?? {}),
  })
  let j: { ok?: boolean; error?: string } & Record<string, unknown> = {}
  try { j = await res.json() } catch (_) { /* 非 JSON */ }
  if (!res.ok || j.ok !== true) throw new Error(j.error || `HTTP ${res.status}`)
  return j as unknown as T
}

export interface ProcListResult {
  total: number
  matched: number
  rows: ProcInfo[]
}

export const apiPort = (base: string, port: number) =>
  apiPost<{ port: number; entries: PortEntry[]; found: boolean }>(base, '/api/port', { port })
export const apiListening = (base: string) =>
  apiPost<{ entries: PortEntry[] }>(base, '/api/listening', {})
export const apiProcList = (base: string, opts: { filter?: string; sort?: string; top?: number }) =>
  apiPost<ProcListResult>(base, '/api/proc/list', opts)
export const apiFileLock = (base: string, path: string) =>
  apiPost<FileLockResult>(base, '/api/filelock', { path })
export const apiKillArm = (base: string, pid: number) =>
  apiPost<ArmResult>(base, '/api/kill/arm', { pid })
export const apiKillFire = (base: string, pid: number, token: string, treeKill: boolean, allowProtected: boolean) =>
  apiPost<{ killed: { pid: number; name: string }; treeKill: boolean }>(base, '/api/kill/fire', { pid, token, treeKill, allowProtected })
export const apiAudit = (base: string) =>
  apiPost<{ items: AuditEntry[] }>(base, '/api/audit', {})
export const apiAuditClear = (base: string) =>
  apiPost<Record<string, never>>(base, '/api/audit/clear', {})

// ── 工具 ───────────────────────────────────────────────────────────────────
export function fmtStarted(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return String(iso)
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
