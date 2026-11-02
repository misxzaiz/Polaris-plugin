/**
 * model.ts —— 服务数据面（死代码透视台面板）
 *
 * 读 cap.kv 的 deadlens.meta 拿 {port, token} → 127.0.0.1 直连 REST。
 * 服务离线时各调用抛 SvcError（面板顶部显示降级条与重启自救按钮）。
 */

export interface SvcMeta { port: number; token: string; version: string; startedAt: number }

export class SvcError extends Error {
  constructor(message: string, public offline = false) { super(message); this.name = 'SvcError' }
}

let metaCache: SvcMeta | null = null

export function invalidateMeta(): void { metaCache = null }

async function readMeta(): Promise<SvcMeta> {
  if (metaCache) return metaCache
  const { kvGet } = await import('./host')
  const m = await kvGet<SvcMeta>('deadlens.meta')
  if (!m || typeof m.port !== 'number' || !m.token) {
    throw new SvcError('服务未就绪：meta 不在 kv（服务可能还没启动过）', true)
  }
  metaCache = m
  return m
}

async function req<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const meta = await readMeta()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${meta.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null
    if (!json) throw new SvcError(`服务返回非 JSON（HTTP ${res.status}）`)
    if (json.ok === false) throw new SvcError(json.error || `HTTP ${res.status}`)
    return json as T
  } catch (e) {
    if (e instanceof SvcError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new SvcError(msg.includes('abort') ? '请求超时' : `连不上 127.0.0.1:${meta.port}（${msg}）`, true)
  } finally {
    clearTimeout(timer)
  }
}

// ── 类型 ────────────────────────────────────────────────────────────────────
export interface Counts {
  files: number; orphanFiles: number; unusedExports: number
  unusedDeps: number; unlistedDeps: number; unresolvedImports: number; cycles: number
}
export interface OrphanFile { path: string; reason: 'no-importer' | 'only-dead-importers'; importers: string[]; importerCount: number; bytes: number; loc: number; glob: boolean }
export interface UnusedExport { path: string; name: string; typeOnly: boolean; suggestion: 'delete' | 'unexport' | 'review' }
export interface UnusedDep { name: string; kind: 'dep' | 'devDep'; tooling?: boolean; suggestion: string; note: string }
export interface UnlistedDep { name: string; usedBy: string[] }
export interface UnresolvedImport { importer: string; specifier: string; note: string }
export interface Cycle { size: number; files: string[]; truncated: string }
export interface Report {
  meta: {
    durationMs: number; version: string; files: number; edgesTotal: number
    entries: { path: string; via: string }[]; entriesTotal: number; globCovered: number; noEntryMode: boolean; pkgFrom?: string
  }
  counts: Counts
  orphanFiles: OrphanFile[]
  unusedExports: UnusedExport[]
  deps: { unused: UnusedDep[]; unlisted: UnlistedDep[]; checked: string }
  unresolvedImports: UnresolvedImport[]
  cycles: Cycle[]
  warnings: string[]
}
export interface RunItem {
  id: string; root: string; status: string; startedAt: number; finishedAt: number | null
  error: string | null; counts: Counts | null; durationMs?: number | null
}
export interface Settings { recentRoots: string[]; ignorePrefixes: string[] }

// ── API ─────────────────────────────────────────────────────────────────────
export const api = {
  async scan(root: string, entries: string[], ignorePrefixes: string[]): Promise<{ runId: string }> {
    const r = await req<{ runId: string }>('POST', '/api/scan', { root, entries, ignorePrefixes }, 15_000)
    return r
  },
  async run(runId: string): Promise<{ run: RunItem & { progress: { phase: string; done: number; total: number } } }> {
    return req('GET', `/api/run/${runId}`)
  },
  async report(runId: string): Promise<{ report: Report }> {
    return req('GET', `/api/report/${runId}`, undefined, 20_000)
  },
  async latest(): Promise<{ runId: string | null }> {
    return req('GET', '/api/latest')
  },
  async history(): Promise<{ runs: RunItem[] }> {
    return req('GET', '/api/history')
  },
  async why(path: string): Promise<{ why: Record<string, unknown> }> {
    return req('POST', '/api/why', { path })
  },
  async selftest(): Promise<{ selftest: { ok: boolean; total: number; failed: number; checks: { name: string; ok: boolean; expect: string; got: string }[]; version: string } }> {
    return req('POST', '/api/selftest', {})
  },
  async settings(): Promise<{ settings: Settings }> {
    return req('GET', '/api/settings')
  },
  async saveSettings(patch: { root?: string; ignorePrefixes?: string[] }): Promise<{ settings: Settings }> {
    return req('POST', '/api/settings', patch)
  },
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

export function fmtTime(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
