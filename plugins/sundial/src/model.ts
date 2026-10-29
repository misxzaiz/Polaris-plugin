/**
 * 通信层 + 数据访问（日程提醒面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 sundial.* 键空间。
 *
 * 键空间契约（与 service/sundial.js、mcp/server.js 三方一致，权威描述见 README）：
 *   sundial.ev.<id>        事件（manual：面板/MCP 直写；ics：服务同步写）
 *   sundial.ics.<id>       ICS 订阅定义（面板/MCP 写定义；服务写运行态）
 *   sundial.settings       设置（面板/MCP 写，服务读）
 *   sundial.reminders      到期提醒投影（仅服务写）
 *   sundial.ui.acked       提醒确认 map（仅面板写，服务读）
 *   sundial.meta           服务心跳（仅服务写）
 *   sundial.cmd.ics.*      命令信箱（面板/MCP 写 → 服务消费即删）
 *
 * 缓存策略：每轮轮询 kvKeys 做键集 diff（新键拉取/消失键剔除），90s 全量兜底
 * （防并发改写内容不一致）；本地写动作后定向刷新对应键。
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet, capDispatch } from './host'

export type SundialEvent = core.SundialEvent
export type SundialIcs = core.SundialIcs
export type ReminderItem = core.ReminderItem
export type SundialSettings = core.SundialSettings

export const PREFIX = 'sundial.'

export interface SundialMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  events?: number
  icsCount?: number
  reminders?: number
}

export interface SundialData {
  events: SundialEvent[]
  ics: SundialIcs[]
  reminders: ReminderItem[]
  acked: Record<string, number>
  settings: SundialSettings
  meta: SundialMeta | null
}

export interface CacheState {
  events: Map<string, SundialEvent>
  knownKeys: Set<string> | null
  fullAt: number
}

export function newCache(): CacheState {
  return { events: new Map(), knownKeys: null, fullAt: 0 }
}

const FULL_REFRESH_MS = 90 * 1000

/** 一轮数据装载（键集 diff + 90s 全量兜底；meta/reminders/设置每轮必拉） */
export async function loadSundial(cache: CacheState): Promise<SundialData> {
  const keys = await kvKeys()
  const evKeys = keys.filter((k) => k.startsWith(PREFIX + 'ev.'))
  const icsKeys = keys.filter((k) => k.startsWith(PREFIX + 'ics.'))
  const now = Date.now()
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS

  if (full) {
    cache.events.clear()
    cache.fullAt = now
  }
  const prevKnown = cache.knownKeys || new Set<string>()
  const knownEv = new Set<string>()
  for (const k of prevKnown) if (k.startsWith(PREFIX + 'ev.')) knownEv.add(k)

  // 新键拉取；全量时全部拉
  const toFetch = evKeys.filter((k) => full || !knownEv.has(k))
  if (toFetch.length) {
    const fetched = await Promise.all(toFetch.map(async (k) => {
      const v = await kvGet<SundialEvent>(k).catch(() => null)
      return { k, v }
    }))
    for (const { k, v } of fetched) {
      if (v && typeof v === 'object' && v.id) cache.events.set(v.id, v)
    }
  }
  // 消失键剔除
  const keySet = new Set(evKeys)
  for (const id of [...cache.events.keys()]) {
    if (!keySet.has(PREFIX + 'ev.' + id)) cache.events.delete(id)
  }
  cache.knownKeys = new Set(keys)

  const icsList = (await Promise.all(icsKeys.map(async (k) => kvGet<SundialIcs>(k).catch(() => null))))
    .filter((x): x is SundialIcs => !!x && typeof x === 'object' && !!x.id)
  const [remindersProj, acked, settingsRaw, meta] = await Promise.all([
    kvGet<{ at?: number; items?: ReminderItem[] }>(PREFIX + 'reminders').catch(() => null),
    kvGet<Record<string, number>>(PREFIX + 'ui.acked').catch(() => null),
    kvGet<Partial<SundialSettings>>(PREFIX + 'settings').catch(() => null),
    kvGet<SundialMeta>(PREFIX + 'meta').catch(() => null),
  ])

  return {
    events: [...cache.events.values()],
    ics: icsList,
    reminders: remindersProj && Array.isArray(remindersProj.items) ? remindersProj.items : [],
    acked: acked && typeof acked === 'object' ? acked : {},
    settings: core.normalizeSettings(settingsRaw),
    meta: meta && typeof meta === 'object' ? meta : null,
  }
}

// ── 写动作 ──────────────────────────────────────────────────────────────────

/** 新增/编辑事件（manual 源直写；成功返回事件） */
export async function saveEvent(input: Record<string, unknown>, existing: SundialEvent | null): Promise<SundialEvent> {
  const r = core.normalizeEvent(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const ev = (r as { event: SundialEvent }).event
  await kvSet(PREFIX + 'ev.' + ev.id, ev)
  return ev
}

export async function deleteEvent(id: string): Promise<void> {
  await kvDel(PREFIX + 'ev.' + id)
}

/** 打卡：done / skip / none（撤销） */
export async function markOccurrence(ev: SundialEvent, occKey: string, state: 'done' | 'skip' | 'none'): Promise<SundialEvent> {
  const done: Record<string, 'done' | 'skip'> = { ...(ev.done || {}) }
  if (state === 'none') delete done[occKey]
  else done[occKey] = state
  const r = core.normalizeEvent({ done }, ev)
  if ('error' in r && r.error) throw new Error(r.error)
  const next = (r as { event: SundialEvent }).event
  await kvSet(PREFIX + 'ev.' + next.id, next)
  return next
}

/** 提醒确认（本键唯一写者是面板；服务读它过滤投影） */
export async function ackReminder(rId: string): Promise<void> {
  const cur = (await kvGet<Record<string, number>>(PREFIX + 'ui.acked').catch(() => null)) || {}
  await kvSet(PREFIX + 'ui.acked', { ...cur, [rId]: Date.now() })
}

export async function saveSettings(s: SundialSettings): Promise<void> {
  await kvSet(PREFIX + 'settings', s)
}

// ── ICS 命令信箱 ────────────────────────────────────────────────────────────

export async function icsAdd(url: string, name: string): Promise<void> {
  const r = core.normalizeIcs({ url, name }, null)
  if ('error' in r && r.error) throw new Error(r.error)
  const def = (r as { ics: SundialIcs }).ics
  await kvSet(PREFIX + 'ics.' + def.id, def)
  await kvSet(PREFIX + 'cmd.ics.add.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), {
    op: 'icsAdd', url: def.url, name: def.name, at: Date.now(),
  })
}

export async function icsRefresh(id?: string): Promise<void> {
  if (id) {
    await kvSet(PREFIX + 'cmd.ics.refresh.' + id, { op: 'icsRefresh', cid: id, at: Date.now() })
  } else {
    await kvSet(PREFIX + 'cmd.ics.refreshAll.' + Date.now().toString(36), { op: 'icsRefreshAll', at: Date.now() })
  }
}

export async function icsRemove(id: string): Promise<void> {
  await kvSet(PREFIX + 'cmd.ics.remove.' + id, { op: 'icsRemove', cid: id, at: Date.now() })
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

/** 数据管理：导出全部业务数据 */
export function exportAll(data: SundialData): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    kind: 'polaris-sundial',
    events: data.events,
    ics: data.ics.map(({ etag, lastFetchAt, lastStatus, lastError, consecutiveErrors, ...rest }) => {
      void etag; void lastFetchAt; void lastStatus; void lastError; void consecutiveErrors
      return rest
    }),
    settings: data.settings,
  }, null, 2)
}
