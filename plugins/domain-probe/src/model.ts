/**
 * model.ts —— 面板数据层：全部数据走宿主 invoke → router_dispatch → cap.kv。
 * 面板零网络请求；诊断由后台服务单权威执行；本文件只做键空间读写与信箱命令。
 *
 * 键空间契约（权威，见 README）：
 *   dom.meta / dom.latest / dom.report.<id> / dom.runs / dom.history（服务单写者）
 *   dom.settings（面板写→服务读，服务也回写归一值）
 *   dom.cmd / dom.res（单槽命令信箱，先删后做）
 */
import { getHostInvoke } from './host'

export const PLUGIN_ID = 'domain-probe'
export const SERVICE_ID = 'domain-probe-service'

// ── 类型 ────────────────────────────────────────────────────────────────────
export type Sev = 'red' | 'yellow' | 'info' | 'green'
export interface Finding { sev: Sev; code: string; title: string; detail: string; fix: string }
export interface Score { total: number; verdict: { cn: string; tone: string }; counts: { red: number; yellow: number; info: number; green: number } }
export interface Report {
  runId: string; kind: 'full' | 'email' | 'cert' | 'lookup'; domain: string
  startedAt: string; finishedAt: string | null; durationMs: number
  ok: boolean; fatal: { cn: string; detail?: string } | null
  score: Score | null; findings: Finding[] | null
  sections: Record<string, any> | null
  resolversUsed: string[] | null
  resolverFailures: { id: string; error: string }[] | null
}
export interface ServiceMeta {
  ts: string; version: string; degraded: boolean; lastBridgeErr: string | null
  running: { runId: string; action: string; domain: string; step: string; startedAt: number } | null
}
export interface Settings { primary: string; timeoutMs: number; enabledResolvers: string[]; dkimSelectorsExtra: string[] }
export interface HistoryEntry { runId: string; at: string; kind: string; domain: string; score: number | null; counts: Record<string, number> | null; ok: boolean }
export interface ResolverInfo { id: string; label: string; region: string; overridden?: boolean }
export interface StateResp { ok: boolean; meta: ServiceMeta; settings: Settings; latest: Report | null; history: HistoryEntry[]; resolvers: ResolverInfo[] }

// ── 通道 ────────────────────────────────────────────────────────────────────
async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke()
  const res = await invoke<{ ok: boolean; result?: T; error?: string }>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return (r && r.value !== undefined ? r.value : null) as T | null
  } catch (_) { return null }
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export const loadMeta = () => kvGet<ServiceMeta>('dom.meta')
export const loadLatest = () => kvGet<Report>('dom.latest')
export const loadHistory = () => kvGet<HistoryEntry[]>('dom.history')
export const loadReport = (runId: string) => kvGet<Report>(`dom.report.${runId}`)

// ── 命令信箱（写 dom.cmd → 轮询 dom.res 按 nonce 对齐）───────────────────────
let nonceCounter = 0
function newNonce() { return `p${Date.now().toString(36)}-${++nonceCounter}` }

export async function sendCommand<T = any>(action: string, payload: Record<string, unknown>, waitMs = 150000): Promise<T> {
  const nonce = newNonce()
  await kvSet('dom.cmd', { nonce, action, payload, at: new Date().toISOString() })
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200))
    const res = await kvGet<{ nonce: string; result: T } | null>('dom.res')
    if (res && res.nonce === nonce) {
      await capDispatch('cap.kv', { action: 'delete', key: 'dom.res' }).catch(() => {})
      return res.result
    }
  }
  throw new Error(`命令 ${action} 等待超时（服务可能未运行：设置→插件→域名诊断台 查看服务状态）`)
}

export const requestState = () => sendCommand<StateResp>('get_state', {}, 20000)

// ── 服务管理（自举 start：discover 拿 installPath + contribution）───────────
export interface SvcStatus { pluginId: string; serviceId: string; status: string; lastError?: string }

export async function listServiceStatus(): Promise<SvcStatus[]> {
  const r = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  const arr = Array.isArray(r) ? r : ((r as any)?.services ?? [])
  return (arr as SvcStatus[]).filter((s) => s && s.pluginId === PLUGIN_ID)
}

export async function startSelfService(): Promise<void> {
  const r = await capDispatch<{ plugins?: any[] }>('cap.pluginDiscovery', { action: 'discover' })
  const self = (r.plugins ?? []).find((p) => p.id === PLUGIN_ID)
  if (!self) throw new Error('插件发现结果里找不到本插件（请确认已安装/启用）')
  const svc = self.contributes?.services?.find((s: any) => s.id === SERVICE_ID)
  if (!svc) throw new Error('清单里没有服务贡献（安装可能不完整，请重装插件）')
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

export const stopSelfService = () => capDispatch('cap.pluginServiceManager', { action: 'stop', pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
export const restartSelfService = () => capDispatch('cap.pluginServiceManager', { action: 'restart', pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
