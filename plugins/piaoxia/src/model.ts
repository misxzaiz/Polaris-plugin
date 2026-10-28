/**
 * model.ts —— 数据面：cap.kv piaoxia.*（经宿主 invoke → router_dispatch）。
 * 字节面：拖拽文件 → base64 → POST http://127.0.0.1:<meta.port>/api/collect（自家服务，token 鉴权）。
 * 口径：全部业务规则走 shared/core（与 service/MCP 同源），面板零私有口径。
 */
import * as core from '../shared/core'
import { getHostInvoke } from './host'

export { core }

export interface PiaoMeta {
  port: number
  token: string
  version?: string
  archiveDir?: string
  lastTickAt?: string
  startedAt?: string
}

interface KvResponse {
  ok?: boolean
  error?: unknown
  result?: { value?: unknown, keys?: string[] }
}

async function kvReq<T>(payload: Record<string, unknown>): Promise<T> {
  // 注意：直接拿完整响应再取 result——capDispatch 已解包一层，这里不能二次解包
  const res = await getHostInvoke()<KvResponse & T>('router_dispatch', { req: { target: 'cap.kv', payload } })
  if (!res || res.ok === false) throw new Error(String((res && res.error) || 'cap.kv 调用失败'))
  return res as unknown as T
}

export async function kvGet(key: string): Promise<unknown> {
  const res = await kvReq<{ result?: { value?: unknown } }>({ action: 'get', key })
  return res.result && res.result.value !== undefined ? res.result.value : null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await kvReq({ action: 'set', key, value })
}

export async function kvDelete(key: string): Promise<void> {
  await kvReq({ action: 'delete', key })
}

export async function kvKeys(): Promise<string[]> {
  const res = await kvReq<{ result?: { keys?: string[] } }>({ action: 'list' })
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : []
}

// ── 键空间 ──────────────────────────────────────────────────────────────────

const KEY_META = 'piaoxia.meta'
const KEY_INVOICE = 'piaoxia.invoice.'
const KEY_TITLE = 'piaoxia.title.'

// ── 增量加载（键集 diff + 全量兜底，wenjin 同款）────────────────────────────

export interface PiaoData {
  invoices: Map<string, core.Invoice>
  titles: Map<string, core.Title>
  meta: PiaoMeta | null
}

const FULL_REFRESH_MS = 90 * 1000
let lastFull = 0
const invoiceCache = new Map<string, core.Invoice>()
const titleCache = new Map<string, core.Title>()
let knownKeys = new Set<string>()

function asInvoice(v: unknown): core.Invoice | null {
  if (v && typeof v === 'object' && typeof (v as core.Invoice).id === 'string') return v as core.Invoice
  return null
}

export async function loadPiaoxia(cache = true): Promise<PiaoData> {
  const now = Date.now()
  const full = !cache || now - lastFull > FULL_REFRESH_MS
  const keys = (await kvKeys()).filter((k) => k.startsWith(KEY_INVOICE) || k.startsWith(KEY_TITLE))
  const nextKeys = new Set(keys)
  const gone = Array.from(knownKeys).filter((k) => !nextKeys.has(k))
  for (const k of gone) {
    invoiceCache.delete(k.slice(KEY_INVOICE.length))
    titleCache.delete(k.slice(KEY_TITLE.length))
  }
  const fresh = keys.filter((k) => !knownKeys.has(k))
  const all = full || fresh.length ? keys : fresh
  await Promise.all(all.map(async (k) => {
    try {
      const v = await kvGet(k)
      if (k.startsWith(KEY_INVOICE)) {
        const inv = asInvoice(v)
        if (inv) invoiceCache.set(inv.id, inv)
        else invoiceCache.delete(k.slice(KEY_INVOICE.length))
      } else {
        const t = v && typeof v === 'object' && typeof (v as core.Title).id === 'string' ? (v as unknown as core.Title) : null
        if (t) titleCache.set(t.id, t)
        else titleCache.delete(k.slice(KEY_TITLE.length))
      }
    } catch (_) { /* get 可能撞已删键：容忍 */ }
  }))
  knownKeys = nextKeys
  if (full) lastFull = now

  let meta: PiaoMeta | null = null
  try {
    const raw = await kvGet(KEY_META)
    if (raw && typeof raw === 'object') {
      const m = raw as Partial<PiaoMeta>
      if (typeof m.port === 'number' && m.port > 0 && typeof m.token === 'string' && m.token) meta = m as PiaoMeta
    }
  } catch (_) { /* 桥降级：面板只显示服务未就绪 */ }

  return { invoices: new Map(invoiceCache), titles: new Map(titleCache), meta }
}

// ── 写路径（全部先过 shared/core normalize）────────────────────────────────

/** 写后本地缓存即时生效 + 置脏（键集 diff 不看值变化，不置脏会显示旧状态） */
function touchLocalInvoice(inv: core.Invoice): void {
  invoiceCache.set(inv.id, inv)
  lastFull = 0
}

export async function saveInvoiceRaw(inv: core.Invoice): Promise<void> {
  await kvSet(KEY_INVOICE + inv.id, inv)
  touchLocalInvoice(inv)
}

export async function deleteInvoice(id: string): Promise<void> {
  await kvDelete(KEY_INVOICE + id)
  invoiceCache.delete(id)
  lastFull = 0
}

export async function saveTitle(t: core.Title): Promise<void> {
  await kvSet(KEY_TITLE + t.id, t)
  titleCache.set(t.id, t)
  lastFull = 0
}

export async function deleteTitle(id: string): Promise<void> {
  await kvDelete(KEY_TITLE + id)
  titleCache.delete(id)
  lastFull = 0
}

/** 面板手录（纸质票） */
export async function addManualInvoice(raw: Partial<core.Invoice>): Promise<core.Invoice> {
  const inv = core.normalizeInvoice({ ...raw, source: 'manual' }, null)
  await saveInvoiceRaw(inv)
  return inv
}

/** 补丁更新（prev 继承语义） */
export async function patchInvoice(prev: core.Invoice, patch: Partial<core.Invoice>): Promise<core.Invoice> {
  const next = core.normalizeInvoice(patch, prev)
  if (next.id !== prev.id) {
    await kvDelete(KEY_INVOICE + prev.id) // 号码变更迁移
    invoiceCache.delete(prev.id)
  }
  await saveInvoiceRaw(next)
  return next
}

/** 状态流转（面板按钮） */
export async function transitionInvoice(prev: core.Invoice, to: string, opts?: { reimburseId?: string, rejectNote?: string }): Promise<core.Invoice> {
  const next = core.applyTransition(prev, to, { nowMs: Date.now(), nowIso: new Date().toISOString(), reimburseId: opts?.reimburseId, rejectNote: opts?.rejectNote })
  await saveInvoiceRaw(next)
  return next
}

// ── 字节面：127.0.0.1 直连自家服务（meta 经 cap.kv 分发）───────────────────

export interface CollectResult {
  name: string
  ok: boolean
  invoice: core.Invoice | null
  warnings: string[]
  error: string
  sha256: string
  archivedPath: string
}

export interface CollectOutcome {
  kind: 'added' | 'dup' | 'fail'
  result: CollectResult
  existing?: core.Invoice
}

async function servicePost(meta: PiaoMeta, path: string, body: unknown): Promise<{ ok: boolean, results?: CollectResult[], error?: string }> {
  const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!json) throw new Error('服务返回非 JSON（HTTP ' + res.status + '）')
  return json as { ok: boolean, results?: CollectResult[], error?: string }
}

export async function probeService(meta: PiaoMeta): Promise<{ version?: string, archiveDir?: string }> {
  const res = await fetch(`http://127.0.0.1:${meta.port}/api/probe`, {
    headers: { Authorization: `Bearer ${meta.token}` },
  })
  if (!res.ok) throw new Error('服务探测失败（HTTP ' + res.status + '）')
  return await res.json() as { version?: string, archiveDir?: string }
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer
      const bytes = new Uint8Array(buf)
      let bin = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
      }
      resolve(btoa(bin))
    }
    reader.onerror = () => reject(new Error('读取文件失败：' + file.name))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 收票统一入口：拖拽的 File 列表或目录路径。
 * 服务只负责解析+归档；「入账 or 判重」由面板对照本地 kv 判定（单一写路径）。
 */
export async function collectFiles(
  meta: PiaoMeta,
  files: File[],
  dir: string,
  existing: Map<string, core.Invoice>,
  onProgress?: (done: number, total: number) => void,
): Promise<CollectOutcome[]> {
  const outcomes: CollectOutcome[] = []
  if (files.length) {
    const payload: { name: string, b64: string }[] = []
    for (const f of files) {
      payload.push({ name: f.name, b64: await fileToB64(f) })
      onProgress?.(payload.length, files.length)
    }
    const r = await servicePost(meta, '/api/collect', { files: payload })
    if (!r.ok) throw new Error(r.error || '服务收票失败')
    outcomes.push(...judge(r.results || [], existing))
  }
  if (dir.trim()) {
    const r = await servicePost(meta, '/api/collect', { dir: dir.trim(), recursive: true })
    if (!r.ok) throw new Error(r.error || '目录扫描失败')
    outcomes.push(...judge(r.results || [], existing))
  }
  return outcomes
}

function judge(results: CollectResult[], existing: Map<string, core.Invoice>): CollectOutcome[] {
  return results.map((r) => {
    if (!r.ok || !r.invoice) return { kind: 'fail' as const, result: r }
    const hit = existing.get(r.invoice.id)
    if (hit) return { kind: 'dup' as const, result: r, existing: hit }
    return { kind: 'added' as const, result: r }
  })
}

/** 入账一批收票结果（仅 added；dup 补挂本地缺失的原件信息） */
export async function commitCollect(outcomes: CollectOutcome[]): Promise<number> {
  let saved = 0
  for (const o of outcomes) {
    if (o.kind === 'added' && o.result.invoice) {
      const inv = core.normalizeInvoice({ ...o.result.invoice, createdAt: new Date().toISOString(), updatedAt: '' }, null)
      await saveInvoiceRaw(inv)
      saved++
    } else if (o.kind === 'dup' && o.existing && o.result.invoice) {
      // 同票重收：只补原件归档路径/指纹，账面字段不动
      const patch: Partial<core.Invoice> = {}
      if (!o.existing.archivedPath && o.result.archivedPath) patch.archivedPath = o.result.archivedPath
      if (!o.existing.fileSha256 && o.result.sha256) patch.fileSha256 = o.result.sha256
      if (Object.keys(patch).length) await patchInvoice(o.existing, patch)
    }
  }
  return saved
}

// ── 导出导入 ────────────────────────────────────────────────────────────────

export function downloadText(name: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportAllJSON(data: PiaoData): Promise<void> {
  const payload = {
    kind: 'piaoxia-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    invoices: Array.from(data.invoices.values()),
    titles: Array.from(data.titles.values()),
  }
  downloadText('piaoxia-backup-' + core.todayKey() + '.json', JSON.stringify(payload, null, 2), 'application/json')
}

export async function importAllJSON(text: string): Promise<{ invoices: number, titles: number, warns: string[] }> {
  let payload: { kind?: string, invoices?: unknown[], titles?: unknown[] }
  try {
    payload = JSON.parse(text)
  } catch (_) {
    throw new Error('不是合法 JSON')
  }
  if (!payload || payload.kind !== 'piaoxia-export') throw new Error('不是票匣导出的备份文件（缺 kind 标识）')
  let nInv = 0
  let nTitle = 0
  const warns: string[] = []
  for (const raw of payload.invoices || []) {
    try {
      const inv = core.normalizeInvoice(raw as Partial<core.Invoice>, null)
      await saveInvoiceRaw(inv)
      nInv++
    } catch (e) { warns.push('票跳过：' + String((e as Error).message)) }
  }
  for (const raw of payload.titles || []) {
    try {
      const t = core.normalizeTitle(raw as Partial<core.Title>, null)
      await saveTitle(t)
      nTitle++
    } catch (e) { warns.push('抬头跳过：' + String((e as Error).message)) }
  }
  return { invoices: nInv, titles: nTitle, warns }
}

/** CSV 导入（从他处迁移）：按发票号码判重跳过 */
export async function importInvoicesCSV(text: string, existing: Map<string, core.Invoice>): Promise<{ added: number, skipped: number, warns: string[] }> {
  const { drafts, warns } = core.importCSV(text)
  let added = 0
  let skipped = 0
  for (const d of drafts) {
    if (existing.has(d.id)) { skipped++; continue }
    await saveInvoiceRaw({ ...d, createdAt: new Date().toISOString(), updatedAt: '' })
    added++
  }
  return { added, skipped, warns }
}
