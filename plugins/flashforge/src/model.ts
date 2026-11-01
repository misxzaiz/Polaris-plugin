/**
 * 闪造数据访问层：cap.kv ff.* 键空间（与 MCP server 同一权威 core）。
 * 全部经宿主 router_dispatch（双重解包，同 xintu / pocket-ledger 模式）。
 * ⚠️ 面板侧同样禁用 cap.kv list，清单一律走 ff.apps 索引键。
 */
import { getHostInvoke } from './host'
import core from '../shared/forge-core.js'

export const fcore = core as unknown as {
  LIMITS: Record<string, number>
  KINDS: string[]
  KIND_LABELS: Record<string, string>
  K: {
    PREFIX: string
    INDEX: string
    SETTINGS: string
    verPart: (id: string, v: number, i: number) => string
    verPartPrefix: (id: string, v: number) => string
    score: (id: string) => string
  }
  scanSource: (html: unknown) => ScanReport
  scanReportText: (r: ScanReport) => string
  byteLength: (s: string) => number
  validId: (id: unknown) => boolean
  chunkSource: (html: string) => string[]
  assembleParts: (parts: unknown[]) => string | null
  sanitizeIndex: (raw: unknown) => AppEntry[]
  upsertIndex: (index: AppEntry[], entry: AppEntry) => AppEntry[]
  removeIndex: (index: AppEntry[], id: string) => AppEntry[]
  sanitizeScores: (raw: unknown) => ScoreEntry[]
  topScores: (list: ScoreEntry[], limit?: number) => ScoreEntry[]
  sanitizeSettings: (raw: unknown) => Settings
  rollbackVersion: (app: AppEntry, vOld: number, now: number) =>
    { app: AppEntry; version: VersionMeta; reuseFrom?: number } | { error: string }
}

export interface VersionMeta {
  v: number
  changelog: string
  createdAt: number
  size: number
  sha256: string
  warns: number
}

export interface AppEntry {
  id: string
  title: string
  kind: 'game' | 'tool' | 'teach'
  tags: string[]
  createdAt: number
  updatedAt: number
  head: number
  size: number
  pushedAt: number | null
  versions: VersionMeta[]
}

export interface ScoreEntry {
  score: number
  player: string
  device: string
  ts: number
}

export interface Settings {
  nickname: string
  deviceName: string
}

export interface ScanReport {
  ok: boolean
  blocked: Array<{ rule: string; hint: string }>
  warnings: Array<{ rule: string; hint: string }>
  sizeBytes: number
}

interface DispatchResponse {
  ok?: boolean
  result?: unknown
  error?: string
}

async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  if (!res || res.ok !== true) throw new Error(res?.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

async function kvGet<T>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })
  return (r.value ?? null) as T | null
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value: value === undefined ? null : value })
}

async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

/** sha256(UTF-8) via crypto.subtle（面板侧；MCP 侧用 node crypto，口径一致） */
export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 应用索引（读时经 core 修整） */
export async function loadApps(): Promise<AppEntry[]> {
  const raw = await kvGet<unknown>(fcore.K.INDEX)
  return fcore.sanitizeIndex(raw)
}

/** 读-合并-写：条目 upsert 回索引（抗双端并发，同 MCP commitIndex 口径） */
async function commitApp(entry: AppEntry | null, id: string): Promise<void> {
  const remote = await loadApps()
  const merged = entry ? fcore.upsertIndex(remote, entry) : fcore.removeIndex(remote, id)
  await kvSet(fcore.K.INDEX, merged)
}

export async function loadSettings(): Promise<Settings> {
  const raw = await kvGet<unknown>(fcore.K.SETTINGS)
  return fcore.sanitizeSettings(raw)
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(fcore.K.SETTINGS, fcore.sanitizeSettings(s))
}

export async function markPushed(app: AppEntry): Promise<void> {
  await commitApp({ ...app, pushedAt: Date.now() }, app.id)
}

/** 装配指定版本源码并校验 sha256；失败返回 null（详情页提示损坏） */
export async function loadVersionSource(app: AppEntry, v: number): Promise<{ html: string; ver: VersionMeta } | { error: string }> {
  const ver = app.versions.find((x) => x.v === v)
  if (!ver) return { error: `版本 v${v} 不存在。` }
  const parts: unknown[] = []
  const maxParts = Math.ceil(fcore.LIMITS.MAX_SOURCE_BYTES / fcore.LIMITS.CHUNK_CHARS) + 2
  for (let i = 0; i < maxParts; i++) {
    // eslint-disable-next-line no-await-in-loop
    const p = await kvGet<unknown>(fcore.K.verPart(app.id, v, i))
    if (p === null || p === undefined) break
    parts.push(p)
  }
  const html = fcore.assembleParts(parts)
  if (html === null) return { error: `版本 v${v} 源码块损坏。` }
  const actual = await sha256Hex(html)
  if (actual !== ver.sha256) return { error: `版本 v${v} 完整性校验失败（sha256 不符），数据可能被外部改动。` }
  return { html, ver }
}

export async function loadScores(appId: string): Promise<ScoreEntry[]> {
  const raw = await kvGet<unknown>(fcore.K.score(appId))
  return fcore.sanitizeScores(raw)
}

/** 沙箱成绩入榜（新者胜截尾，上限 200） */
export async function addScore(appId: string, entry: { score: number; player: string; device: string; ts?: number }): Promise<void> {
  const list = await loadScores(appId)
  const next = fcore.sanitizeScores([...list, { score: entry.score, player: entry.player, device: entry.device, ts: entry.ts || Date.now() }])
  await kvSet(fcore.K.score(appId), next)
}

export async function clearScores(appId: string): Promise<void> {
  await kvDel(fcore.K.score(appId))
}

/** 回退 = 复制旧版源码块为新版本号下的新版本（版本只增不改，历史原样保留） */
export async function rollbackApp(app: AppEntry, vOld: number): Promise<{ app: AppEntry; version: VersionMeta }> {
  const built = fcore.rollbackVersion(app, vOld, Date.now())
  if ('error' in built) throw new Error(built.error)
  const vNew = built.version.v
  const maxParts = Math.ceil(fcore.LIMITS.MAX_SOURCE_BYTES / fcore.LIMITS.CHUNK_CHARS) + 2
  for (let i = 0; i < maxParts; i++) {
    // eslint-disable-next-line no-await-in-loop
    const p = await kvGet<unknown>(fcore.K.verPart(app.id, vOld, i))
    if (p === null || p === undefined) break
    // eslint-disable-next-line no-await-in-loop
    await kvSet(fcore.K.verPart(app.id, vNew, i), p)
  }
  await commitApp(built.app, app.id)
  return { app: built.app, version: built.version }
}

/** 删除应用：全部版本源码块 + 成绩 + 索引条目（不可恢复；调用方负责确认） */
export async function deleteApp(app: AppEntry): Promise<void> {
  const maxParts = Math.ceil(fcore.LIMITS.MAX_SOURCE_BYTES / fcore.LIMITS.CHUNK_CHARS) + 2
  for (const ver of app.versions) {
    for (let i = 0; i < maxParts; i++) {
      // 逐块探测删除；块缺失即止（与 MCP server 同口径）
      // eslint-disable-next-line no-await-in-loop
      const p = await kvGet<unknown>(fcore.K.verPart(app.id, ver.v, i))
      if (p === null || p === undefined) break
      // eslint-disable-next-line no-await-in-loop
      await kvDel(fcore.K.verPart(app.id, ver.v, i))
    }
  }
  await kvDel(fcore.K.score(app.id))
  await commitApp(null, app.id)
}
