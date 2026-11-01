/**
 * 通信层 + 数据访问（车辖面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与后台服务、MCP server 读写
 * 同一个 cap.kv 的 chexia.* 键空间。
 *
 * 键空间契约（与 service/chexia.js、mcp/server.js 三方一致，权威描述见 README）：
 *   chexia.car.<id>      车辆（面板/MCP 直写）
 *   chexia.energy.<id>   补能流水（面板/MCP 直写；odometer 生命线）
 *   chexia.item.<id>     养护项（面板/MCP 直写）
 *   chexia.svc.<id>      维保记录（面板/MCP 直写）
 *   chexia.doc.<id>      证件/凭证（面板/MCP 直写；carId 空=个人证件）
 *   chexia.settings      设置（面板/MCP 写）
 *   chexia.snapshot      全家快照（仅服务写：里程/能耗/养护投影/证件榜/费用）
 *   chexia.meta          服务心跳（仅服务写）
 *
 * 派生口径：面板用 shared/core 现算（与 MCP 同源）；概览优先读服务端快照，
 * 快照缺失/降级（>5 分钟）时回落本地计算——诚实标注，不假装在线。
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet, capDispatch } from './host'

export type Car = core.Car
export type Energy = core.Energy
export type Item = core.Item
export type Svc = core.Svc
export type Doc = core.Doc
export type Settings = core.Settings
export type CarSnap = core.CarSnap
export type FamilySnap = core.FamilySnap
export type DocBand = core.DocBand
export type ItemProj = core.ItemProj

export const PREFIX = 'chexia.'
export const K = {
  car: (id: string) => `${PREFIX}car.${id}`,
  carPrefix: `${PREFIX}car.`,
  energy: (id: string) => `${PREFIX}energy.${id}`,
  energyPrefix: `${PREFIX}energy.`,
  item: (id: string) => `${PREFIX}item.${id}`,
  itemPrefix: `${PREFIX}item.`,
  svc: (id: string) => `${PREFIX}svc.${id}`,
  svcPrefix: `${PREFIX}svc.`,
  doc: (id: string) => `${PREFIX}doc.${id}`,
  docPrefix: `${PREFIX}doc.`,
  settings: `${PREFIX}settings`,
  snapshot: `${PREFIX}snapshot`,
  meta: `${PREFIX}meta`,
}

export interface ChexiaMeta {
  version?: string; pid?: number; startedAt?: number; lastTickAt?: number
  bridge?: string; degraded?: boolean
  counts?: { cars: number; items: number; docs: number; energies: number; svcs: number }
}
export interface ChexiaData {
  cars: Car[]; energies: Energy[]; items: Item[]; svcs: Svc[]; docs: Doc[]
  settings: Settings
  snap: FamilySnap | null
  meta: ChexiaMeta | null
}

export interface CacheState {
  knownKeys: Set<string> | null
  fullAt: number
  entities: Map<string, unknown>   // 键名 -> 值（五类实体共用 diff）
}
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, entities: new Map() }
}

const FULL_REFRESH_MS = 90 * 1000
const SNAPSHOT_STALE_MS = 5 * 60 * 1000
const ENTITY_PREFIXES = [K.carPrefix, K.energyPrefix, K.itemPrefix, K.svcPrefix, K.docPrefix]

/** 一轮数据装载（键集 diff + 90s 全量兜底；快照/设置/心跳每轮必拉） */
export async function loadChexia(cache: CacheState): Promise<ChexiaData> {
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
  cache.knownKeys = keySet

  const collect = <T>(prefix: string): T[] =>
    [...cache.entities.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T)
  const cars = collect<Car>(K.carPrefix)
  const energies = collect<Energy>(K.energyPrefix)
  const items = collect<Item>(K.itemPrefix)
  const svcs = collect<Svc>(K.svcPrefix)
  const docs = collect<Doc>(K.docPrefix)

  const [snapRaw, settingsRaw, meta] = await Promise.all([
    kvGet<FamilySnap>(K.snapshot).catch(() => null),
    kvGet<Partial<Settings>>(K.settings).catch(() => null),
    kvGet<ChexiaMeta>(K.meta).catch(() => null),
  ])

  return {
    cars, energies, items, svcs, docs,
    settings: core.normalizeSettings(settingsRaw),
    snap: snapRaw && typeof snapRaw === 'object' && Array.isArray(snapRaw.cars) ? snapRaw : null,
    meta: meta && typeof meta === 'object' ? meta : null,
  }
}

// ── 写动作（全部先过 core.normalize* 唯一口径）───────────────────────────────
export async function saveCar(input: Record<string, unknown>, existing?: Car | null): Promise<Car> {
  const r = core.normalizeCar(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const c = (r as { car: Car }).car
  await kvSet(K.car(c.id), c)
  return c
}
export async function saveEnergy(input: Record<string, unknown>, existing: Energy | null, car: Car | null): Promise<Energy> {
  const r = core.normalizeEnergy(input, existing, car)
  if ('error' in r && r.error) throw new Error(r.error)
  const e = (r as { energy: Energy }).energy
  await kvSet(K.energy(e.id), e)
  return e
}
export async function saveItem(input: Record<string, unknown>, existing?: Item | null): Promise<Item> {
  const r = core.normalizeItem(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const it = (r as { item: Item }).item
  await kvSet(K.item(it.id), it)
  return it
}
export async function saveSvc(input: Record<string, unknown>, existing?: Svc | null): Promise<Svc> {
  const r = core.normalizeSvc(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const s = (r as { svc: Svc }).svc
  await kvSet(K.svc(s.id), s)
  return s
}
export async function saveDoc(input: Record<string, unknown>, existing?: Doc | null): Promise<Doc> {
  const r = core.normalizeDoc(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const d = (r as { doc: Doc }).doc
  await kvSet(K.doc(d.id), d)
  return d
}
export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}

/** 删单条补能记录（面板流水行内删除；派生量自动回落） */
export async function deleteEnergy(id: string): Promise<void> {
  await kvDel(K.energy(id))
}
/** 删单条维保记录 */
export async function deleteSvc(id: string): Promise<void> {
  await kvDel(K.svc(id))
}
/** 删养护项（历史维保记录保留——记录按名称弱关联，不因项删除而失真） */
export async function deleteItem(id: string): Promise<void> {
  await kvDel(K.item(id))
}
/** 删证件登记 */
export async function deleteDoc(id: string): Promise<void> {
  await kvDel(K.doc(id))
}

/** 删车（purge=true 连带其名下流水——面板侧先弹确认并列数量） */
export async function deleteCar(id: string, purge: boolean, data: ChexiaData): Promise<number> {
  const own = {
    energies: data.energies.filter((e) => e.carId === id),
    items: data.items.filter((it) => it.carId === id),
    svcs: data.svcs.filter((s) => s.carId === id),
    docs: data.docs.filter((d) => d.carId === id),
  }
  const total = own.energies.length + own.items.length + own.svcs.length + own.docs.length
  if (total > 0 && !purge) throw new Error(`该车名下还有 ${total} 条记录（补能 ${own.energies.length} / 养护项 ${own.items.length} / 维保 ${own.svcs.length} / 证件 ${own.docs.length}），请选择一并删除`)
  for (const e of own.energies) await kvDel(K.energy(e.id))
  for (const it of own.items) await kvDel(K.item(it.id))
  for (const s of own.svcs) await kvDel(K.svc(s.id))
  for (const d of own.docs) await kvDel(K.doc(d.id))
  await kvDel(K.car(id))
  return total
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

/** 快照新鲜度（SNAPSHOT_STALE_MS 内视为可用） */
export function snapUsable(snap: FamilySnap | null): boolean {
  return !!snap && Date.now() - snap.at < SNAPSHOT_STALE_MS
}

/** 本地现算全家快照（服务快照缺失/降级时面板回落，口径与 core.familySnapshot 同源） */
export function computeSnap(data: ChexiaData, nowTs: number): FamilySnap {
  return core.familySnapshot(data.cars, data.energies, data.items, data.svcs, data.docs, nowTs, data.settings)
}

/** 导出（剥离 rev、带免责声明，core.exportAll 单口径） */
export function exportAll(data: ChexiaData): string {
  return core.exportAll(data)
}
export const SNAPSHOT_STALE_MS_CONST = SNAPSHOT_STALE_MS
