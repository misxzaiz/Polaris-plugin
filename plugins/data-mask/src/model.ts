/**
 * 通信层 + 数据访问（数据脱敏台面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 datamask.* 键空间。写者契约（与 service/main.js、mcp/server.js
 * 三方一致，权威描述见 README）：
 *   datamask.settings            设置（面板写，服务/MCP 读）
 *   datamask.meta                服务心跳（服务写）
 *   datamask.ledger.meta         台账元数据 {salt, createdAt, entryCount}（先到先写）
 *   datamask.ledger.<owner>.<n>  台账分块 ≤150 条/块（面板/服务/MCP 各自 owner 追加）
 *   datamask.cmd.mask.<nonce>    文件/目录脱敏命令（面板写，服务删键互斥消费）
 *   datamask.result.<nonce>      命令结果（服务写，消费者读后删）
 *   datamask.job.<id>            任务记录 running→done/failed（服务写）
 *   datamask.latest / .history   最近任务指针与紧凑历史（服务写）
 *
 * 不泄露不变量：面板是唯一允许看到原值的界面（用户自己的屏幕）；
 * kv 里的发现类数据只有掩码预览；台账（含原值）只存本机、面板还原专用。
 */
import * as core from '../shared/mask-core.js'
import { getHostInvoke } from './host'

export const PLUGIN_ID = 'data-mask'
export const SERVICE_ID = 'data-mask-service'

export const K = {
  settings: 'datamask.settings',
  meta: 'datamask.meta',
  ledgerMeta: 'datamask.ledger.meta',
  ledgerPrefix: 'datamask.ledger.',
  cmdPrefix: 'datamask.cmd.mask.',
  resultPrefix: 'datamask.result.',
  jobPrefix: 'datamask.job.',
  latest: 'datamask.latest',
  history: 'datamask.history',
}

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
    return null
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

// ── 类型 ────────────────────────────────────────────────────────────────────
export interface CustomRule { name: string; pattern: string; flags?: string; replacement?: string }

export interface MaskSettings {
  types: Record<string, { on: boolean; mode: core.MaskMode }>
  structural: boolean
  csv: boolean
  cnameAggressive: boolean
  ipv4KeepPrivate: boolean
  customRules: CustomRule[]
  maxFileKB: number
}

export function defaultSettings(): MaskSettings {
  return {
    types: {},
    structural: true,
    csv: true,
    cnameAggressive: false,
    ipv4KeepPrivate: true,
    customRules: [],
    maxFileKB: 2048,
  }
}

export interface LedgerMeta { salt: string; createdAt: number; entryCount?: number }
export interface ServiceMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  degraded?: boolean
  lastBridgeErr?: string | null
  job?: { id: string; kind: string; path: string; nonce: string } | null
  saltReady?: boolean
}
export interface JobRecord {
  id: string
  at: number
  kind: 'file' | 'dir'
  path: string
  status: 'running' | 'done' | 'failed'
  progress?: { done: number; files: number }
  finishedAt?: number
  error?: string
}
export interface FileJobResult {
  ok: boolean
  kind?: string
  jobId?: string
  out?: string
  outDir?: string
  stats?: Record<string, number>
  previews?: { type: string; preview: string; mode: string; confirm: boolean }[]
  hitCount?: number
  manifest?: { files: number; masked: number; skippedBinary: number; skippedSize: number; skippedEmpty: number; errors: number; truncated: boolean }
  outputs?: { rel: string; out: string; stats: Record<string, number> }[]
  truncated?: boolean
  error?: string
}

// ── 设置 ────────────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<MaskSettings> {
  const v = await kvGet<Partial<MaskSettings>>(K.settings)
  const d = defaultSettings()
  if (!v || typeof v !== 'object') return d
  return {
    ...d,
    ...v,
    types: v.types && typeof v.types === 'object' ? v.types : {},
    customRules: Array.isArray(v.customRules) ? v.customRules : [],
  }
}

export async function saveSettings(s: MaskSettings): Promise<void> {
  await kvSet(K.settings, s)
}

// ── 盐（先到先写：读者绝不覆盖）─────────────────────────────────────────────
export async function ensureSalt(): Promise<string> {
  const meta = await kvGet<LedgerMeta>(K.ledgerMeta)
  if (meta && typeof meta.salt === 'string' && meta.salt) return meta.salt
  const salt = core.genSalt()
  const cur = await kvGet<LedgerMeta>(K.ledgerMeta) // 双检
  if (cur && typeof cur.salt === 'string' && cur.salt) return cur.salt
  await kvSet(K.ledgerMeta, { salt, createdAt: Date.now(), entryCount: 0 })
  return salt
}

// ── 台账（面板还原专用；含原值，只存本机 kv）────────────────────────────────
export interface LoadedLedger {
  map: Map<string, core.LedgerEntry>
  entries: (core.LedgerEntry & { fp: string })[]
  owners: number
  truncated: boolean
}

export async function loadLedger(maxEntries = 20000): Promise<LoadedLedger> {
  const keys = await kvKeys()
  const chunkKeys = keys.filter((k) => k.startsWith(K.ledgerPrefix) && k !== K.ledgerMeta).sort()
  const map = new Map<string, core.LedgerEntry>()
  let owners = 0
  let truncated = false
  const ownerSet = new Set<string>()
  for (const k of chunkKeys) {
    const owner = k.slice(K.ledgerPrefix.length).replace(/\.\d+$/, '')
    if (!ownerSet.has(owner)) { ownerSet.add(owner); owners++ }
    const chunk = await kvGet<(core.LedgerEntry & { fp: string })[]>(k)
    if (!Array.isArray(chunk)) continue
    for (const e of chunk) {
      if (!e || !e.fp || typeof e.original !== 'string') continue
      if (map.size >= maxEntries) { truncated = true; break }
      map.set(e.fp, e)
    }
    if (truncated) break
  }
  return { map, entries: [...map.entries()].map(([fp, e]) => ({ fp, ...e })), owners, truncated }
}

/** 台账增量分块落 kv（面板 owner 维度追加；同 fp 以新值覆盖语义由读取端 merge 处理） */
export async function persistLedgerEntries(owner: string, entries: (core.LedgerEntry & { fp: string })[]): Promise<void> {
  const CHUNK = 150
  for (let i = 0; i < entries.length; i += CHUNK) {
    await kvSet(`datamask.ledger.${owner}.${Math.floor(i / CHUNK)}`, entries.slice(i, i + CHUNK))
  }
}

/** 重置台账：删除全部分块与 meta，换新盐（全部假名换血，不可逆） */
export async function resetLedger(): Promise<void> {
  const keys = await kvKeys()
  const targets = keys.filter((k) => k.startsWith(K.ledgerPrefix))
  for (const k of targets) await kvDel(k)
  await kvSet(K.ledgerMeta, { salt: core.genSalt(), createdAt: Date.now(), entryCount: 0 })
}

// ── 本地脱敏（粘贴流；面板是唯一 exposeOriginal=true 的界面）────────────────
export interface LocalMaskResult extends core.MaskResult {}

export function maskLocal(
  text: string,
  settings: MaskSettings,
  salt: string,
  ledger: Map<string, core.LedgerEntry>,
): LocalMaskResult {
  return core.maskText(text, {
    types: settings.types as core.MaskOptions['types'],
    structural: settings.structural,
    csv: settings.csv,
    cnameAggressive: settings.cnameAggressive,
    ipv4KeepPrivate: settings.ipv4KeepPrivate,
    customRules: settings.customRules,
    salt,
    ledger,
    exposeOriginal: true,
  })
}

export function restoreLocal(text: string, ledger: Map<string, core.LedgerEntry>): { output: string; replaced: number } {
  const entries = [...ledger.values()]
  return core.restoreText(text, entries)
}

// ── 服务任务（文件/目录脱敏；服务单权威执行）────────────────────────────────
export async function requestMask(
  kind: 'file' | 'dir',
  path: string,
  onProgress?: (p: { done: number; files: number }) => void,
): Promise<FileJobResult> {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await kvSet(`${K.cmdPrefix}${nonce}`, { kind, path, from: 'panel', at: Date.now() })

  const deadline = Date.now() + 120 * 1000
  let lastJobId = ''
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 900))
    const res = await kvGet<FileJobResult & { at: number }>(`${K.resultPrefix}${nonce}`)
    if (res) {
      void kvDel(`${K.resultPrefix}${nonce}`)
      return res
    }
    // 进度：meta.job → job 记录
    const meta = await kvGet<ServiceMeta>(K.meta)
    const jobId = meta?.job?.id || ''
    if (jobId && jobId !== lastJobId) {
      lastJobId = jobId
    }
    if (lastJobId) {
      const job = await kvGet<JobRecord>(`${K.jobPrefix}${lastJobId}`)
      if (job?.status === 'running' && job.progress && onProgress) onProgress(job.progress)
    }
  }
  return { ok: false, error: '任务 120 秒未完成（大目录属正常，稍后在「文件」页看结果）' }
}

export async function loadHead(): Promise<{ meta: ServiceMeta | null; latest: LatestSummary | null; ledgerMeta: LedgerMeta | null }> {
  const [meta, latest, ledgerMeta] = await Promise.all([
    kvGet<ServiceMeta>(K.meta),
    kvGet<LatestSummary>(K.latest),
    kvGet<LedgerMeta>(K.ledgerMeta),
  ])
  return { meta, latest, ledgerMeta }
}

export interface LatestSummary {
  id: string
  kind: string
  path: string
  at: number
  finishedAt?: number
  stats?: Record<string, number> | null
  out?: string
}
