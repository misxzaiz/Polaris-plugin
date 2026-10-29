/**
 * 通信层 + 数据访问（用药管家面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 qingnang.* 键空间。
 *
 * 键空间契约（与 service/qingnang.js、mcp/server.js 三方一致，权威描述见 README）：
 *   qingnang.profile.<id>  成员档案（面板/MCP 直写）
 *   qingnang.med.<id>      药品（面板/MCP 直写）
 *   qingnang.batch.<id>    批次=库存+效期（面板/MCP 直写）
 *   qingnang.reg.<id>      用药方案（面板/MCP 直写）
 *   qingnang.log.<regId|date|time>  服药记录（面板/MCP 直写，occKey 幂等覆盖）
 *   qingnang.settings      设置（面板/MCP 写）
 *   qingnang.doses         今日应服投影（仅服务写）
 *   qingnang.stocks        药箱快照：FEFO 库存/补货/效期（仅服务写）
 *   qingnang.meta          服务心跳（仅服务写）
 *
 * 面板日志只拉近 8 天窗口（今日药单 + 依从率足够）；全历史库存派生在服务端
 * qingnang.stocks 快照完成，面板/AI 读一个键即得。
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet, capDispatch } from './host'

export type Profile = core.Profile
export type Med = core.Med
export type Batch = core.Batch
export type Regimen = core.Regimen
export type DoseLog = core.DoseLog
export type Settings = core.Settings
export type DoseProjItem = core.DoseProjItem
export type RefillRow = core.RefillRow
export type ExpiryRow = core.ExpiryRow
export type TodayGroup = core.TodayGroup

export const PREFIX = 'qingnang.'
export const K = {
  profile: (id: string) => `${PREFIX}profile.${id}`,
  profilePrefix: `${PREFIX}profile.`,
  med: (id: string) => `${PREFIX}med.${id}`,
  medPrefix: `${PREFIX}med.`,
  batch: (id: string) => `${PREFIX}batch.${id}`,
  batchPrefix: `${PREFIX}batch.`,
  reg: (id: string) => `${PREFIX}reg.${id}`,
  regPrefix: `${PREFIX}reg.`,
  log: (occKey: string) => `${PREFIX}log.${occKey}`,
  logPrefix: `${PREFIX}log.`,
  settings: `${PREFIX}settings`,
  doses: `${PREFIX}doses`,
  stocks: `${PREFIX}stocks`,
  meta: `${PREFIX}meta`,
}

export interface MedStock {
  totalUsable: number; totalExpired: number; over: boolean; lastTakenAt: number
  daysLeft: number | null; ratePerDay: number; estimated: boolean; urgency: string
  batches: { id: string; qty: number; remaining: number; expiry: string; expired: boolean; note: string }[]
}
export interface StocksSnap {
  at: number; today: string
  meds: Record<string, MedStock>
  refill: RefillRow[]
  expiry: ExpiryRow[]
  alerts: { dueNow: number; overdue: number; lowStock: number; expiredBatches: number; soonExpiry: number }
}
export interface QingMeta {
  version?: string; pid?: number; startedAt?: number; lastTickAt?: number
  bridge?: string; degraded?: boolean
  counts?: { profiles: number; meds: number; batches: number; regimens: number; logs: number }
  doses?: number
}
export interface QingData {
  profiles: Profile[]; meds: Med[]; batches: Batch[]; regimens: Regimen[]
  logs: DoseLog[]; settings: Settings
  doses: { at: number; date: string; items: DoseProjItem[] } | null
  stocks: StocksSnap | null
  meta: QingMeta | null
}

export interface CacheState {
  knownKeys: Set<string> | null
  fullAt: number
  entities: Map<string, unknown>   // 键名 -> 值（实体四类共用 diff）
  logVals: Map<string, DoseLog>    // occKey -> log（近窗）
  logsFullAt: number
}
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, entities: new Map(), logVals: new Map(), logsFullAt: 0 }
}

const FULL_REFRESH_MS = 90 * 1000
const LOG_WINDOW_DAYS = 8
const SNAPSHOT_STALE_MS = 5 * 60 * 1000

const ENTITY_PREFIXES = [K.profilePrefix, K.medPrefix, K.batchPrefix, K.regPrefix]
function occKeyDate(occKey: string): string {
  const i = occKey.indexOf('|')
  const rest = i >= 0 ? occKey.slice(i + 1) : ''
  const j = rest.indexOf('|')
  return j >= 0 ? rest.slice(0, j) : ''
}

/** 一轮数据装载（键集 diff + 90s 全量兜底；快照/设置/心跳每轮必拉） */
export async function loadQingnan(cache: CacheState): Promise<QingData> {
  const keys = await kvKeys()
  const now = Date.now()
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS
  if (full) {
    cache.entities.clear()
    cache.fullAt = now
  }
  const keySet = new Set(keys)
  for (const k of [...cache.entities.keys()]) {
    if (!keySet.has(k)) cache.entities.delete(k)
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)))
  const todo = entityKeys.filter((k) => full || !cache.entities.has(k))
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet<Record<string, unknown>>(k).catch(() => null)
      return { k, v }
    }))
    for (const { k, v } of fetched) {
      if (v && typeof v === 'object' && typeof v.id === 'string') cache.entities.set(k, v)
      else if (!v) cache.entities.delete(k)
    }
  }
  // 日志：近窗键（键名含日期段，免取值即可过滤）；改写同键靠全量兜底收敛
  const windowStart = core.dayKey(now - (LOG_WINDOW_DAYS - 1) * core.DAY_MS)
  const logKeys = keys.filter((k) => k.startsWith(K.logPrefix) && occKeyDate(k.slice(K.logPrefix.length)) >= windowStart)
  const logKeySet = new Set(logKeys)
  for (const occ of [...cache.logVals.keys()]) {
    if (!logKeySet.has(K.log + occ)) cache.logVals.delete(occ)
  }
  const logsFull = now - cache.logsFullAt > FULL_REFRESH_MS
  const logTodo = logKeys.filter((k) => logsFull || !cache.logVals.has(k.slice(K.logPrefix.length)))
  if (logTodo.length) {
    const fetched = await Promise.all(logTodo.map(async (k) => {
      const v = await kvGet<DoseLog>(k).catch(() => null)
      return { k, v }
    }))
    for (const { k, v } of fetched) {
      const occ = k.slice(K.logPrefix.length)
      if (v && typeof v === 'object' && v.occKey === occ) cache.logVals.set(occ, v)
      else if (!v) cache.logVals.delete(occ)
    }
  }
  if (logsFull) cache.logsFullAt = now
  cache.knownKeys = keySet

  const collect = <T>(prefix: string): T[] =>
    [...cache.entities.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T)
  const profiles = collect<Profile>(K.profilePrefix)
  const meds = collect<Med>(K.medPrefix)
  const batches = collect<Batch>(K.batchPrefix)
  const regimens = collect<Regimen>(K.regPrefix)

  const [dosesRaw, stocksRaw, settingsRaw, meta] = await Promise.all([
    kvGet<{ at?: number; date?: string; items?: DoseProjItem[] }>(K.doses).catch(() => null),
    kvGet<StocksSnap>(K.stocks).catch(() => null),
    kvGet<Partial<Settings>>(K.settings).catch(() => null),
    kvGet<QingMeta>(K.meta).catch(() => null),
  ])

  return {
    profiles, meds, batches, regimens,
    logs: [...cache.logVals.values()],
    settings: core.normalizeSettings(settingsRaw),
    doses: dosesRaw && Array.isArray(dosesRaw.items) ? { at: dosesRaw.at || 0, date: dosesRaw.date || '', items: dosesRaw.items } : null,
    stocks: stocksRaw && typeof stocksRaw === 'object' && Array.isArray(stocksRaw.refill) ? stocksRaw : null,
    meta: meta && typeof meta === 'object' ? meta : null,
  }
}

// ── 写动作（全部先过 core.normalize* 唯一口径）───────────────────────────────
export async function saveProfile(input: Record<string, unknown>, existing: Profile | null): Promise<Profile> {
  const r = core.normalizeProfile(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const p = (r as { profile: Profile }).profile
  await kvSet(K.profile(p.id), p)
  return p
}
export async function saveMed(input: Record<string, unknown>, existing: Med | null): Promise<Med> {
  const r = core.normalizeMed(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const m = (r as { med: Med }).med
  await kvSet(K.med(m.id), m)
  return m
}
export async function saveBatch(input: Record<string, unknown>, existing: Batch | null): Promise<Batch> {
  const r = core.normalizeBatch(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const b = (r as { batch: Batch }).batch
  await kvSet(K.batch(b.id), b)
  return b
}
export async function saveRegimen(input: Record<string, unknown>, existing: Regimen | null): Promise<Regimen> {
  const r = core.normalizeRegimen(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const g = (r as { regimen: Regimen }).regimen
  await kvSet(K.reg(g.id), g)
  return g
}

export async function markLog(
  reg: Regimen, date: string, time: string, status: 'taken' | 'skip' | 'none', amount?: number,
): Promise<void> {
  const r = core.normalizeLog({ regId: reg.id, date, time, status, amount }, reg, Date.now())
  if ('error' in r && r.error) throw new Error(r.error)
  if ('del' in r && r.del) {
    await kvDel(K.log(r.del))
    return
  }
  const log = (r as { log: DoseLog }).log
  await kvSet(K.log(log.occKey), log)
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

/** 删除成员（可选连带删方案与打卡记录）；药品删除前校验引用 */
export async function deleteEntity(kind: 'profile' | 'med' | 'batch' | 'regimen', id: string, purge: boolean, data: QingData): Promise<void> {
  if (kind === 'profile') {
    const regs = data.regimens.filter((r) => r.profileId === id)
    if (regs.length && !purge) throw new Error(`该成员仍有 ${regs.length} 个用药方案，请先删除方案或选择一并删除`)
    for (const r of regs) {
      await kvDel(K.reg(r.id))
      const keys = await kvKeys()
      for (const k of keys.filter((k) => k.startsWith(K.logPrefix + r.id + '|'))) await kvDel(k)
    }
    await kvDel(K.profile(id))
    return
  }
  if (kind === 'med') {
    if (data.regimens.some((r) => r.medId === id) || data.batches.some((b) => b.medId === id)) {
      throw new Error('该药品仍有方案或批次引用，请先删除它们')
    }
    await kvDel(K.med(id))
    return
  }
  if (kind === 'batch') {
    await kvDel(K.batch(id))
    return
  }
  // regimen：连带清其打卡记录（medId 映射断，保留会破坏库存派生口径）
  const keys = await kvKeys()
  const logKeys = keys.filter((k) => k.startsWith(K.logPrefix + id + '|'))
  for (const k of logKeys) await kvDel(k)
  await kvDel(K.reg(id))
}

// ── 服务管理（自举 start，page-sentinel 验证过的三步）────────────────────────
export async function serviceStatus(pluginId: string, serviceId: string): Promise<{ running: boolean; lastError?: string } | null> {
  const st = await capDispatch<unknown[]>('cap.pluginServiceManager', { action: 'list_status' })
  const arr = Array.isArray(st) ? st : []
  const mine = arr.find((s) => (s as Record<string, unknown>).pluginId === pluginId && (s as Record<string, unknown>).serviceId === serviceId) as Record<string, unknown> | undefined
  if (!mine) return null
  return { running: mine.status === 'running' || mine.status === 'starting', lastError: typeof mine.lastError === 'string' ? mine.lastError : undefined }
}

export async function serviceStart(pluginId: string, serviceId: string): Promise<void> {
  const r = await capDispatch<{ plugins?: Array<Record<string, unknown>> }>('cap.pluginDiscovery', { action: 'discover' })
  const plugins = r.plugins || []
  const self = plugins.find((p) => p.id === pluginId)
  if (!self) throw new Error('插件发现结果里找不到自己（重试一次；仍失败请重启应用）')
  const contributes = (self.contributes || {}) as { services?: Record<string, unknown>[] }
  const svc = (contributes.services || []).find((s) => s.id === serviceId)
  if (!svc) throw new Error('清单里找不到服务贡献（请重装插件）')
  await capDispatch('cap.pluginServiceManager', {
    action: 'start', pluginId,
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

export async function serviceStop(pluginId: string, serviceId: string): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'stop', pluginId, serviceId })
}

export async function serviceRestart(pluginId: string, serviceId: string): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'restart', pluginId, serviceId })
}

/** 导出。如实边界：面板仅持近 8 天打卡记录，导出含近窗；全历史在 cap.kv `qingnang.log.*` 键，服务不删不改 */
export function exportAll(data: QingData): string {
  return core.exportAll(data)
}
export const LOG_WINDOW_DAYS_CONST = LOG_WINDOW_DAYS
export const SNAPSHOT_STALE_MS_CONST = SNAPSHOT_STALE_MS
