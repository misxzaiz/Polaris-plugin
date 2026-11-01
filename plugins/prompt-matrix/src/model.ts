/**
 * model.ts —— 面板数据层：类型 + cap.kv 读 + 单槽信箱命令
 *
 * 面板零网络请求：一切经宿主 invoke → router_dispatch(cap.kv)。
 * 命令：写 pmtx.cmd（{nonce, action, payload}）→ 轮询 pmtx.res 按 nonce 对齐
 * → 删除回执。持久态（meta/profiles/datasets/history/run 投影）直接读。
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

export interface RunProgress {
  runId: string
  phase: 'cells' | 'judge' | 'done'
  status: 'running' | 'done' | 'aborted' | 'error'
  done: number
  total: number
  judgeDone: number
  judgeTotal: number
  elapsedMs: number
  datasetName: string
}

export interface ServiceMeta {
  ts: string
  version: string
  degraded: boolean
  lastBridgeErr?: string | null
  running: RunProgress | null
  profileCount: number
}

export interface DatasetHead {
  id: string
  name: string
  count: number
  errCount?: number
  updatedAt: string
}

export interface DatasetRec extends DatasetHead {
  jsonl: string
}

export interface CheckResult {
  type: string
  label?: string
  pass: boolean
  detail: string
}

export interface JudgeResult {
  score: number
  reason: string
}

export interface CellProj {
  cellId: string
  sampleIdx: number
  variantIdx: number
  ok: boolean
  status: 'pending' | 'running' | 'ok' | 'error' | 'aborted'
  content: string
  truncated?: boolean
  ms: number
  attempts?: number
  retried?: boolean
  finishReason?: string | null
  usage?: { prompt_tokens?: number, completion_tokens?: number } | null
  checks?: CheckResult[]
  judge?: JudgeResult | null
  judgeError?: string
  judgeRaw?: string
  error?: { code: string, cn: string, hint?: string } | null
  annotated?: 'up' | 'down' | null
  templateWarnings?: string[]
}

export interface VariantDefMasked {
  idx?: number
  name: string
  profileId: string
  profileName?: string
  systemTemplate: string
  userTemplate: string
  maxTokens: number
  temperature: number | null
}

export interface SampleSummary {
  label: string
  checks: { type: string, label?: string, value?: unknown }[]
  varCount: number
}

export interface AggVariant {
  idx: number
  total: number
  ok: number
  failed: number
  checkAllPass: number
  judgeAvg: number | null
  judgeN: number
  avgMs: number
  tokIn: number
  tokOut: number
}

export interface RunProj {
  runId: string
  version: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'done' | 'aborted' | 'error'
  error?: string | null
  sampleSummaries: SampleSummary[]
  def: {
    datasetName: string
    variants: VariantDefMasked[]
    judge: { profileId: string, profileName?: string, userTemplate?: string } | null
  }
  cells: CellProj[]
  aggregates: { variants: AggVariant[], totals: { cells: number, ok: number, failed: number, tokIn: number, tokOut: number } }
  cost: { tokIn: number, tokOut: number, est: number | null }
  fileSaved?: boolean
}

export interface HistoryEntry {
  runId: string
  at: string
  datasetName: string
  cells: number
  okCells: number
  failedCells: number
  variants: string[]
  judged: boolean
  judgeAvg: number | null
  status: string
}

export interface PmSettings {
  concurrency: number
  cellTimeoutMs: number
  retries: number
  judgeProfileId: string
  judgeUserTemplate: string
  priceIn: number
  priceOut: number
}

export interface StatePayload {
  ok: boolean
  profiles: MaskedProfile[]
  meta: ServiceMeta
  datasets: DatasetHead[]
  history: HistoryEntry[]
  settings: PmSettings
}

export interface CellFull {
  ok: boolean
  cell?: CellProj
  vars?: Record<string, unknown>
  variant?: { name: string, userTemplate: string, systemTemplate: string }
  error?: string
}

function invoke(): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  return getHostInvoke()
}

/** kv 读：cap.kv get */
export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await invoke()<{ ok?: boolean, result?: { value?: T } }>('router_dispatch', {
    target: 'cap.kv',
    payload: { action: 'get', key },
  })
  return r && r.result && r.result.value !== undefined ? r.result.value : null
}

/** kv 写：cap.kv set */
export async function kvSet(key: string, value: unknown): Promise<void> {
  const r = await invoke()<{ ok?: boolean, error?: string }>('router_dispatch', {
    target: 'cap.kv',
    payload: { action: 'set', key, value },
  })
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'cap.kv set 失败')
}

async function kvDel(key: string): Promise<void> {
  await invoke()('router_dispatch', { target: 'cap.kv', payload: { action: 'delete', key } }).catch(() => undefined)
}

let nonceCounter = 0

/** 单槽信箱命令：写 pmtx.cmd → 轮询 pmtx.res 按 nonce 对齐 → 删除回执 */
export async function sendCommand<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<T & { ok?: boolean, error?: string, pending?: boolean }> {
  const nonce = `p${Date.now().toString(36)}-${++nonceCounter}`
  await kvSet('pmtx.cmd', { nonce, action, payload, at: new Date().toISOString() })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200))
    const res = await kvGet<{ nonce: string, result: T & { ok?: boolean, error?: string } }>('pmtx.res')
    if (res && res.nonce === nonce) {
      await kvDel('pmtx.res')
      return (res.result || {}) as T & { ok?: boolean, error?: string, pending?: boolean }
    }
  }
  return { ok: false, pending: true, error: `命令已投递，${Math.round(timeoutMs / 1000)}s 内未见回执（任务可能仍在后台运行，稍后刷新查看）` } as T & { ok?: boolean, error?: string, pending?: boolean }
}

/** 心跳（轻量：running 进度 + 服务存活） */
export const loadMeta = () => kvGet<ServiceMeta>('pmtx.meta')

/** 经信箱拉全量状态（服务离线时返回 null） */
export async function fetchState(timeoutMs = 8000): Promise<StatePayload | null> {
  const r = await sendCommand<StatePayload>('get_state', {}, timeoutMs)
  if (r && r.ok) return r
  return null
}

export async function fetchRun(runId: string, timeoutMs = 15000): Promise<RunProj | null> {
  let id = runId
  if (!id || id === 'latest') {
    const runs = await kvGet<string[]>('pmtx.runs')
    id = Array.isArray(runs) && runs.length ? runs[0] : ''
  }
  if (!id) return null
  const r = await sendCommand<{ run?: RunProj }>('get_run', { runId: id }, timeoutMs)
  if (r && r.ok && r.run) return r.run
  // 信箱超时时直接读 kv 投影（服务写 kv 与回执独立）
  return await kvGet<RunProj>(`pmtx.run.${id}`)
}

export async function fetchCell(runId: string, cellId: string, timeoutMs = 15000): Promise<CellFull | null> {
  const r = await sendCommand<CellFull>('get_cell', { runId, cellId }, timeoutMs)
  if (r && r.ok) return r
  return null
}

export async function annotate(runId: string, cellId: string, verdict: 'up' | 'down' | null): Promise<boolean> {
  const r = await sendCommand('annotate', { runId, cellId, verdict }, 12000)
  return !!(r && r.ok)
}
