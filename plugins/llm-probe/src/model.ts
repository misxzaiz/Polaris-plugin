/**
 * model.ts —— 面板数据层：类型 + cap.kv 读 + 单槽信箱命令
 *
 * 面板零网络请求：一切经宿主 invoke → router_dispatch(cap.kv)。
 * 命令：写 llmprobe.cmd（{nonce, action, payload}）→ 轮询 llmprobe.res 按
 * nonce 对齐 → 删除回执。持久态（profiles/latest/history/meta）直接读。
 */
import { getHostInvoke } from './host'

export type Wire = 'anthropic-messages' | 'openai-chat-completions'

export interface MaskedProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  wire: Wire
  keyMask: string
  source: 'host' | 'manual'
  importedAt: string
}

export interface StepReport {
  name: string
  label: string
  ok?: boolean
  skipped?: boolean
  ms?: number
  detail?: string
  error?: ProbeError
  // stream
  ttftMs?: number
  totalMs?: number
  tps?: number
  tokens?: number
  tokensExact?: boolean
  stopReason?: string
  // models
  count?: number
  hasTarget?: boolean
  sample?: string[]
  // chat
  finishReason?: string
  status?: number
  content?: string
  // tools
  toolCalled?: boolean
  compat?: string[]
}

export interface ProbeError {
  code: string
  cn: string
  hint?: string
}

export interface SuiteReport {
  runId: string
  profile: MaskedProfile
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  steps: Record<string, StepReport>
  urls?: { chat: string; models: string; note?: string }
  score?: { total: number; components: Record<string, number> }
  verdict?: { level: string; cn: string }
  fatal?: { code?: string; cn: string; hint?: string }
  error?: string
}

export interface BenchSizeRow {
  tokens: number
  rounds: number
  errs?: number
  ttftP50?: number
  ttftMin?: number
  ttftMax?: number
  tpsP50?: number
  tpsMin?: number
  tpsMax?: number
  totalP50?: number
  error?: ProbeError
}

export interface BenchReport {
  runId: string
  profile: MaskedProfile
  kind: 'bench'
  finishedAt?: string
  sizes: number[]
  rounds: number
  bench: { ok: boolean; sizes: BenchSizeRow[]; compat: string[] }
}

export interface HistoryEntry {
  runId: string
  at: string
  profileId: string
  profileName: string
  kind: 'suite' | 'bench'
  score: number | null
  verdict: string
  ttftMs: number | null
  tps: number | null
  ok: boolean
}

export interface ServiceMeta {
  ts: string
  version: string
  degraded: boolean
  lastBridgeErr?: string | null
  running: { runId: string; action: string; profileName: string; step: string; startedAt: number } | null
  profileCount: number
}

export interface ProfilesPayload {
  at: string
  items: MaskedProfile[]
}

export interface LlmProbeSettings {
  chatMs: number
  streamMs: number
  modelsMs: number
}

export const K = {
  meta: 'llmprobe.meta',
  profiles: 'llmprobe.profiles',
  latest: 'llmprobe.latest',
  history: 'llmprobe.history',
  settings: 'llmprobe.settings',
  cmd: 'llmprobe.cmd',
  res: 'llmprobe.res',
  report: (id: string) => `llmprobe.report.${id}`,
  bench: (id: string) => `llmprobe.bench.${id}`,
}

async function kvGet<T>(key: string): Promise<T | null> {
  const invoke = getHostInvoke()
  const r = await invoke<{ ok: boolean; result?: { value?: T } }>('router_dispatch', {
    target: 'cap.kv',
    payload: { action: 'get', key },
  })
  if (r && r.ok && r.result && r.result.value !== undefined && r.result.value !== null) return r.result.value
  return null
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const invoke = getHostInvoke()
  const r = await invoke<{ ok: boolean; error?: string }>('router_dispatch', {
    target: 'cap.kv',
    payload: { action: 'set', key, value },
  })
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'cap.kv set 失败')
}

async function kvDel(key: string): Promise<void> {
  const invoke = getHostInvoke()
  await invoke('router_dispatch', { target: 'cap.kv', payload: { action: 'delete', key } }).catch(() => undefined)
}

export const loadMeta = () => kvGet<ServiceMeta>(K.meta)
export const loadProfiles = () => kvGet<ProfilesPayload>(K.profiles)
export const loadLatest = () => kvGet<SuiteReport>(K.latest)
export const loadHistory = () => kvGet<HistoryEntry[] | { items: HistoryEntry[] }>(K.history)
export const loadSettings = () => kvGet<LlmProbeSettings>(K.settings)
export const loadSuiteReport = (id: string) => kvGet<SuiteReport>(K.report(id))
export const loadBenchReport = (id: string) => kvGet<BenchReport>(K.bench(id))

/** 历史键兼容两种形态（裸数组 / {items}） */
export function normalizeHistory(v: HistoryEntry[] | { items?: HistoryEntry[] } | null): HistoryEntry[] {
  if (Array.isArray(v)) return v
  if (v && Array.isArray((v as { items?: HistoryEntry[] }).items)) return (v as { items: HistoryEntry[] }).items
  return []
}

let nonceSeq = 0

/**
 * 发送命令并等待回执。run_suite/run_bench 可传 waitMs=0 表示「只投不等」。
 * 返回 { ok, ...result } 或 { ok:false, error } 或 pending 形态。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendCommand(action: string, payload: Record<string, unknown>, waitMs = 90000): Promise<any> {
  const nonce = `p${Date.now().toString(36)}-${++nonceSeq}`
  await kvSet(K.cmd, { nonce, action, payload, at: new Date().toISOString() })
  if (waitMs === 0) return { ok: true, pending: true }
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await sleep(1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await kvGet<any>(K.res)
    if (res && res.nonce === nonce) {
      await kvDel(K.res)
      return res.result || { ok: false, error: '回执为空' }
    }
  }
  return { ok: false, pending: true, error: `命令已投递，${Math.round(waitMs / 1000)}s 内未见回执（任务可能仍在后台运行，稍后查看「体检」页最新报告）` }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 健康分颜色档 */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return '#8B95A7'
  if (score >= 85) return '#3FB950'
  if (score >= 60) return '#D29922'
  return '#F85149'
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

export function fmtTps(tps: number | null | undefined): string {
  if (tps == null) return '—'
  return `${tps} tok/s`
}

export function fmtTime(iso: string | undefined): string {
  if (!iso) return '—'
  return String(iso).replace('T', ' ').slice(5, 16)
}
