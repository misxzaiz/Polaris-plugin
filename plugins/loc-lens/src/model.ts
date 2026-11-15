/**
 * model.ts —— 行数透视台数据层
 *
 * 读 cap.kv 的 loclens.meta 拿服务 {port, token} → 127.0.0.1 直连 /api/stats。
 * 设置（手动根/最近路径）经宿主 cap.kv 读写 loclens.settings。
 * repo-lens model.ts 同款 svc 封装，勿改协议。
 */
import { kvGet, kvSet, restartService } from './host'

export const PLUGIN_ID = 'loc-lens'
export const SERVICE_ID = 'loc-lens-server'
const META_KEY = 'loclens.meta'
const SETTINGS_KEY = 'loclens.settings'

export interface SvcMeta { port: number; token: string; version?: string }

export interface ModuleRow {
  name: string
  files: number
  lines: number
  nonEmptyLines: number
  bytes: number
}

export interface LanguageRow { name: string; files: number; lines: number }

export interface StatsTotals { files: number; lines: number; nonEmptyLines: number; bytes: number }

export interface StatsPayload {
  root: string
  stats: {
    scannedAt: number
    durationMs: number
    totals: StatsTotals
    modules: ModuleRow[]
    languages: LanguageRow[]
    skippedBinary: number
    skippedOther: number
    skippedLarge: number
    truncated: boolean
    errors: string[]
  }
  live: boolean
  pendingDirty: number
}

export interface Settings {
  manualRoot?: string
  recentPaths?: string[]
  autoFollowWorkspace?: boolean
}

export class SvcError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

let metaCache: SvcMeta | null = null

export function invalidateMeta(): void { metaCache = null }

export async function readMeta(): Promise<SvcMeta | null> {
  if (metaCache) return metaCache
  const m = await kvGet<SvcMeta>(META_KEY)
  if (m && typeof m.port === 'number' && m.token) {
    metaCache = m
    return m
  }
  return null
}

async function svc<T>(method: string, path: string, body?: unknown, timeoutMs = 120_000): Promise<T> {
  const meta = await readMeta()
  if (!meta) throw new SvcError('服务未注册：后台服务尚未拉起或 kv 不可达（稍候自动重试）')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${meta.token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch (_) { parsed = null }
    if (!res.ok) throw new SvcError((parsed && parsed.error) || `HTTP ${res.status}`, res.status)
    return parsed as T
  } catch (e) {
    if (e instanceof SvcError) throw e
    if ((e as Error).name === 'AbortError') throw new SvcError('请求超时')
    throw new SvcError(`服务不可达：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  stats: (root: string) =>
    svc<StatsPayload & { ok: boolean; scanning?: boolean }>(`GET`, `/api/stats?root=${encodeURIComponent(root)}`),
  rescan: (root: string) => svc<StatsPayload>(`POST`, `/api/rescan`, { root }, 180_000),
  settings: () => svc<{ settings: Settings }>(`GET`, `/api/settings`),
}

// ── 插件设置（经宿主 cap.kv，插件私有键 loclens.settings，面板单写者） ──────

export async function loadSettings(): Promise<Settings> {
  const s = await kvGet<Settings>(SETTINGS_KEY)
  return s && typeof s === 'object' ? s : {}
}

export async function saveSettings(patch: Settings): Promise<void> {
  const cur = await loadSettings()
  await kvSet(SETTINGS_KEY, { ...cur, ...patch })
}

export { restartService }
