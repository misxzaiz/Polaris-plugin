/**
 * 数据访问层（上下文打包台面板）
 *
 * 键空间契约（与 service/main.js、mcp/server.js 三方一致，权威描述见 README）：
 *   cpk.settings              全局设置（面板写，服务读）
 *   cpk.meta                  服务心跳（服务写，60s）
 *   cpk.scan.<id>             扫描索引 {state,fileCount,dirCount,totalTokens,treeChunks,...}
 *   cpk.scan.<id>.t.<n>       树行分块（每行紧凑 JSON [relPath,isDir,size,tokens,flags]）
 *   cpk.sel                   最近选中集（面板写，重开恢复）
 *   cpk.pack.<id>             打包索引 {state,stats,file,fileBytes,chunks,...}
 *   cpk.pack.<id>.c.<n>       包内容分块（256KB × ≤16）
 *   cpk.idx                   包历史投影（服务写，最近 10 条）
 *   cpk.cmd.<op>.<nonce> / cpk.result.<nonce>   命令通道（先删后做）
 */
import { capDispatch, kvGet, kvSet, kvDel } from './host'

export const PLUGIN_ID = 'context-pack'
export const SERVICE_ID = 'context-pack-service'
export const SERVICE_PORT = 9872
export const CMD_PREFIX = 'cpk.cmd.'
export const RESULT_PREFIX = 'cpk.result.'
export const SCAN_PREFIX = 'cpk.scan.'
export const PACK_PREFIX = 'cpk.pack.'

// ── 类型（与 service/main.js 写入结构对齐）─────────────────────────────────
export interface Settings {
  version: number
  ignoreExtra: string
  includeLockfiles: boolean
  maxFileKb: number
  format: 'xml' | 'md'
  headerText: string
  updatedAt?: number
}

export interface ScanIndex {
  id: string
  path: string
  state: 'running' | 'done' | 'error'
  startedAt: number
  finishedAt?: number
  error?: string
  fileCount?: number
  dirCount?: number
  totalTokens?: number
  totalBytes?: number
  treeChunks?: number
  truncated?: boolean
  skipCount?: number
  ignoreCount?: number
}

/** 树行：[relPath, isDir, size, tokens, flags] */
export type EntryRow = [string, number, number, number, string]

export interface PackIndex {
  id: string
  path: string
  format: 'xml' | 'md'
  state: 'running' | 'done' | 'error'
  origin: 'panel' | 'mcp'
  startedAt: number
  finishedAt?: number
  error?: string
  stats?: { files: number; bytes: number; tokens: number; treeLines: number }
  file?: string
  fileBytes?: number
  chunks?: number
  chunkTruncated?: boolean
  truncatedFiles?: string[]
}

export interface CpkMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  degraded?: boolean
  dataDir?: string
  packsTotal?: number
}

export interface IdxEntry {
  id: string
  path: string
  format: string
  state: string
  origin: string
  startedAt: number
  finishedAt?: number
  tokens?: number
  files?: number
  file?: string
  fileBytes?: number
}

export interface Selection {
  path: string
  selected: string[]
  updatedAt: number
}

// ── 读取 ──────────────────────────────────────────────────────────────────
export async function getMeta(): Promise<CpkMeta | null> {
  return kvGet<CpkMeta>('cpk.meta')
}
export async function getSettings(): Promise<Settings | null> {
  const v = await kvGet<Settings>('cpk.settings')
  return v && v.version ? v : null
}
export async function saveSettings(s: Settings): Promise<void> {
  await kvSet('cpk.settings', { ...s, updatedAt: Date.now() })
}
export async function getScan(id: string): Promise<ScanIndex | null> {
  return kvGet<ScanIndex>(`${SCAN_PREFIX}${id}`)
}
/** 读树分块 → 行数组（容忍块消失） */
export async function readScanTree(id: string, chunkCount: number): Promise<EntryRow[]> {
  const n = Math.max(0, Math.min(chunkCount || 0, 40))
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet<string>(`${SCAN_PREFIX}${id}.t.${i}`)),
  )
  const rows: EntryRow[] = []
  for (const text of parts) {
    if (typeof text !== 'string' || !text) continue
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const arr = JSON.parse(t)
        if (Array.isArray(arr) && arr.length >= 4) rows.push(arr as EntryRow)
      } catch (_) { /* 坏行跳过 */ }
    }
  }
  return rows
}
export async function getPack(id: string): Promise<PackIndex | null> {
  return kvGet<PackIndex>(`${PACK_PREFIX}${id}`)
}
/** 读包内容分块 → 全文（chunkTruncated 时返回 null 提示走文件） */
export async function readPackChunks(id: string, chunkCount: number): Promise<string | null> {
  const n = Math.max(0, Math.min(chunkCount || 0, 16))
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet<string>(`${PACK_PREFIX}${id}.c.${i}`)),
  )
  if (parts.some((p) => typeof p !== 'string')) return null
  return parts.join('')
}
export async function getIdx(): Promise<{ packs: IdxEntry[] } | null> {
  const v = await kvGet<{ packs: IdxEntry[] }>('cpk.idx')
  return v && Array.isArray(v.packs) ? v : null
}
export async function saveSelection(s: Selection): Promise<void> {
  await kvSet('cpk.sel', s)
}
export async function loadSelection(): Promise<Selection | null> {
  const v = await kvGet<Selection>('cpk.sel')
  return v && Array.isArray(v.selected) ? v : null
}

// ── 命令通道（写命令键 → 轮询结果键 → 删结果；scan/pack 的 ack 即返回，结果走索引键）──
export async function sendCommand<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<T & { ok?: boolean; error?: string }> {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await kvSet(`${CMD_PREFIX}${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() })
  const resultKey = `${RESULT_PREFIX}${nonce}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await kvGet<T & { ok?: boolean; error?: string }>(resultKey)
    if (r) {
      void kvDel(resultKey).catch(() => {})
      return r
    }
    await new Promise((res) => setTimeout(res, 1000))
  }
  return { ok: false, error: '服务未响应命令（可能未运行：去设置页看服务状态）' } as unknown as T & { error?: string }
}

// ── 服务管理（start 必须经发现自举，service-start KB 契约）──────────────────
export interface ServiceStatus {
  pluginId: string
  serviceId: string
  status?: string
  lastError?: string
}
export async function listServiceStatus(): Promise<ServiceStatus | null> {
  try {
    const arr = await capDispatch<ServiceStatus[]>('cap.pluginServiceManager', { action: 'list_status' })
    const mine = (Array.isArray(arr) ? arr : []).find((s) => s && s.serviceId === SERVICE_ID)
    return mine || null
  } catch (_) {
    return null
  }
}
export async function stopService(): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'stop', pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}
export async function restartService(): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'restart', pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}
export async function startServiceBootstrapped(): Promise<string | null> {
  const r = await capDispatch<{ plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Record<string, unknown>[] } }> }>(
    'cap.pluginDiscovery', { action: 'discover' },
  )
  const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID)
  if (!self) return '插件未被发现（重载插件页后重试）'
  const svc = (self.contributes?.services || []).find((s) => s && s.id === SERVICE_ID)
  if (!svc) return '清单中未声明服务'
  await capDispatch('cap.pluginServiceManager', {
    action: 'start',
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType ?? 'http',
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
  return null
}

// ── 工具 ──────────────────────────────────────────────────────────────────
export function currentWorkspace(): string {
  const w = (window as unknown as { __POLARIS_HOST_WORKSPACE__?: string }).__POLARIS_HOST_WORKSPACE__
  return w || ''
}
export function fmtBytes(n: number | undefined): string {
  if (!n || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}
export function fmtTime(ts: number | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (_) {
    try {
      window.prompt('请手动复制（Ctrl+C）：', text)
      return true
    } catch (_2) { return false }
  }
}
/** 客户端预算裁剪（与 core.fitToBudget 同语义：从大到小排除直到 ≤ 预算） */
export function trimToBudget(
  files: Array<{ rel: string; tokens: number }>,
  budget: number,
): { kept: string[]; removed: Array<{ rel: string; tokens: number }>; tokens: number } {
  const sorted = files.slice().sort((a, b) => b.tokens - a.tokens)
  const kept = new Set(files.map((f) => f.rel))
  let total = files.reduce((s, f) => s + (f.tokens || 0), 0)
  const removed: Array<{ rel: string; tokens: number }> = []
  for (const f of sorted) {
    if (total <= budget) break
    if (!f.tokens) continue
    total -= f.tokens
    kept.delete(f.rel)
    removed.push({ rel: f.rel, tokens: f.tokens })
  }
  return { kept: files.filter((f) => kept.has(f.rel)).map((f) => f.rel), removed, tokens: total }
}
