/**
 * 通信层 + 数据访问（定时任务台面板）
 *
 * 面板零网络：一切经宿主 invoke → router_dispatch(cap.kv)。
 * 读：jobs/meta/runs/providers（服务单写者，面板只读）。
 * 写：settings/providers 面板直接写；任务增删改/启停/手动执行走命令键
 *     cmd.<op>.<nonce> → 轮询 result.<nonce>（1200ms，≤30s）。
 */
import { getHostInvoke } from './host'

// ── 类型 ────────────────────────────────────────────────────────────────────
export type JobType = 'notify' | 'http' | 'ai' | 'command'

export interface Schedule {
  type: 'interval' | 'daily' | 'weekly' | 'cron'
  /** interval：归一化后由服务端换算成 everyMs（提交时可带 everyMinutes） */
  everyMs?: number
  everyMinutes?: number
  time?: string
  dows?: number[]
  expr?: string
}

export interface Job {
  id: string
  name: string
  type: JobType
  schedule: Schedule
  payload: Record<string, unknown>
  enabled: boolean
  createdAt: number
  updatedAt: number
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: 'ok' | 'fail' | 'timeout' | null
  lastSummary: string
}

export interface RunRecord {
  id: string
  jobId: string
  jobName: string
  type: JobType
  trigger: 'auto' | 'manual'
  missed: boolean
  status: 'ok' | 'fail' | 'timeout'
  summary: string
  excerpt: string
  startedAt: number
  durationMs: number
}

export interface AiProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  wire: 'openai-chat-completions' | 'anthropic-messages'
}

export interface Settings {
  retentionRuns: number
  timeoutCommandSec: number
  timeoutHttpSec: number
  timeoutAiSec: number
}

export interface Meta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  degraded?: boolean
  bridge?: string
  jobCount?: number
  enabledCount?: number
}

export interface Toast { text: string; bad?: boolean }

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

// ── 键空间（与 service/store.js、mcp/tools.js 三方一致，README 为权威）──────
export const K = {
  settings: 'taskrun.settings',
  providers: 'taskrun.providers',
  jobs: 'taskrun.jobs',
  meta: 'taskrun.meta',
  runsIdx: 'taskrun.runsIdx',
  runChunk: (n: number) => `taskrun.run.${n}`,
  cmdPrefix: 'taskrun.cmd.',
  resultPrefix: 'taskrun.result.',
}

// ── 归一化（与 shared 双写约定一致的只读镜像）────────────────────────────────
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clamp = (v: unknown, lo: number, hi: number, dft: number) => {
    const n = parseInt(String(v), 10)
    if (!Number.isFinite(n)) return dft
    return Math.min(hi, Math.max(lo, Math.round(n)))
  }
  return {
    retentionRuns: clamp(r.retentionRuns, 50, 1000, 200),
    timeoutCommandSec: clamp(r.timeoutCommandSec, 5, 600, 120),
    timeoutHttpSec: clamp(r.timeoutHttpSec, 3, 300, 30),
    timeoutAiSec: clamp(r.timeoutAiSec, 5, 600, 120),
  }
}

export function normalizeProviders(raw: unknown): AiProvider[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      id: String(p.id || ''),
      name: String(p.name || '未命名'),
      baseUrl: String(p.baseUrl || ''),
      apiKey: String(p.apiKey || ''),
      model: String(p.model || ''),
      wire: p.wire === 'anthropic-messages' ? 'anthropic-messages' as const : 'openai-chat-completions' as const,
    }))
}

// ── 读 ──────────────────────────────────────────────────────────────────────
export async function loadJobs(): Promise<Job[]> {
  const v = await kvGet<{ jobs?: Job[] }>(K.jobs)
  return v && Array.isArray(v.jobs) ? v.jobs : []
}

export async function loadMeta(): Promise<Meta | null> {
  return kvGet<Meta>(K.meta)
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await kvGet(K.settings))
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function loadProviders(): Promise<AiProvider[]> {
  return normalizeProviders(await kvGet(K.providers))
}

export async function saveProviders(list: AiProvider[]): Promise<void> {
  await kvSet(K.providers, list)
}

export interface RunsData { runs: RunRecord[] }

export async function loadRuns(limit = 60): Promise<RunRecord[]> {
  const idx = await kvGet<{ chunkCount?: number }>(K.runsIdx)
  const chunkCount = idx && typeof idx.chunkCount === 'number' ? idx.chunkCount : 0
  const out: RunRecord[] = []
  for (let n = chunkCount - 1; n >= 0 && out.length < limit; n--) {
    const chunk = await kvGet<RunRecord[]>(K.runChunk(n))
    if (!Array.isArray(chunk)) continue
    for (let i = chunk.length - 1; i >= 0 && out.length < limit; i--) {
      if (chunk[i] && typeof chunk[i] === 'object') out.push(chunk[i])
    }
  }
  return out
}

// ── 命令通道（写命令键 → 轮询回执）──────────────────────────────────────────
export interface CmdResult {
  ok?: boolean
  error?: string
  queued?: boolean
  jobId?: string
  runId?: string
  status?: string
  summary?: string
  enabled?: boolean
}

async function sendCommand(op: string, payload: Record<string, unknown>, waitMs = 30000): Promise<CmdResult> {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const key = `${K.cmdPrefix}${op}.${nonce}`
  await kvSet(key, { op, ...payload, at: Date.now() })
  const deadline = Date.now() + waitMs
  for (;;) {
    const r = await kvGet<CmdResult>(K.resultPrefix + nonce)
    if (r && typeof r === 'object' && ('ok' in r || 'error' in r)) {
      if (r.queued === true && Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 1200))
        continue
      }
      await capDispatch('cap.kv', { action: 'delete', key: K.resultPrefix + nonce }).catch(() => {})
      return r
    }
    if (Date.now() > deadline) {
      return { ok: false, error: '服务未回执（可能未运行）——去设置页看服务状态；结果稍后在运行历史查看' }
    }
    await new Promise((res) => setTimeout(res, 1200))
  }
}

export const commands = {
  addJob: (job: Record<string, unknown>) => sendCommand('add', { job }),
  updateJob: (id: string, patch: Record<string, unknown>) => sendCommand('update', { id, patch }),
  removeJob: (id: string) => sendCommand('remove', { id }),
  setEnabled: (id: string, enabled: boolean) => sendCommand('setEnabled', { id, enabled }),
  runNow: (id: string) => sendCommand('runNow', { id }, 60000),
}

// ── 宿主供应商导入（cap.config get → modelProfiles，multichat 同源）─────────
interface HostProfile {
  id?: unknown
  name?: unknown
  baseUrl?: unknown
  apiKey?: unknown
  model?: unknown
  wire?: unknown
}

/** 从宿主配置里提取供应商形态的对象数组（多壳兼容，取不到返回空数组） */
export async function importHostProfiles(): Promise<AiProvider[]> {
  const res = await getHostInvoke()<{ ok: boolean; result?: unknown; error?: string }>('router_dispatch', {
    req: { target: 'cap.config', payload: { action: 'get' } },
  })
  if (!res.ok) throw new Error(res.error || 'cap.config 读取失败（宿主未放行或版本过旧）')
  const profiles = findModelProfiles(res.result)
  return profiles.map((p, i) => ({
    id: `prov_${Date.now().toString(36)}${i}`,
    name: String(p.name || p.id || `供应商${i + 1}`).slice(0, 40),
    baseUrl: String(p.baseUrl || ''),
    apiKey: String(p.apiKey || ''),
    model: String(p.model || ''),
    wire: p.wire === 'anthropic-messages' ? 'anthropic-messages' as const : 'openai-chat-completions' as const,
  })).filter((p) => p.baseUrl)
}

function findModelProfiles(result: unknown): HostProfile[] {
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): HostProfile[] => {
    if (!node || typeof node !== 'object' || depth > 4 || seen.has(node)) return []
    seen.add(node)
    if (Array.isArray(node)) {
      // 供应商数组形态：元素含 baseUrl 字段
      if (node.length && node.every((x) => x && typeof x === 'object' && ('baseUrl' in (x as object) || 'base_url' in (x as object)))) {
        return node as HostProfile[]
      }
      return node.flatMap((x) => walk(x, depth + 1))
    }
    const obj = node as Record<string, unknown>
    for (const key of ['modelProfiles', 'profiles', 'providers']) {
      if (obj[key]) {
        const found = walk(obj[key], depth + 1)
        if (found.length) return found
      }
    }
    return []
  }
  return walk(result, 0)
}
