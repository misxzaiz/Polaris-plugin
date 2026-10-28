/**
 * 通信层 + 台账数据访问（问津面板）
 *
 * 计算逻辑全部复用 shared/core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   wenjin.company.<id> / wenjin.app.<id> / wenjin.resume.<id>
 *   wenjin.event.<id>   / wenjin.offer.<id> / wenjin.settings / wenjin.meta
 */
import * as core from '../shared/core.js'
import type {
  App, Company, Offer, Resume, Settings, WEvent,
  FunnelRow, FollowUpRow, OfferRow, PipelineResult, QuestionRow, UpcomingResult, ImportCSVResult,
} from '../shared/core'
import { kvGet, kvSet, kvDel, kvKeys } from './host'

export {
  core,
  type App, type Company, type Offer, type Resume, type Settings, type WEvent,
  type FunnelRow, type FollowUpRow, type OfferRow, type PipelineResult, type QuestionRow, type UpcomingResult,
}

const K = core.K

// ── 视图模型 ─────────────────────────────────────────────────────────────

export interface WenData {
  companies: Company[]
  apps: App[]
  resumes: Resume[]
  events: WEvent[]
  offers: Offer[]
  settings: Settings
  meta: { at?: string; by?: string } | null
}

export interface CacheState {
  knownKeys: Set<string> | null
  fullAt: number
  entities: Map<string, unknown>
}
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, entities: new Map() }
}

const FULL_REFRESH_MS = 90 * 1000
const ENTITY_PREFIXES = [K.companyPrefix, K.appPrefix, K.resumePrefix, K.eventPrefix, K.offerPrefix]

/** 一轮数据装载（键集 diff + 90s 全量兜底；settings/meta 每轮必拉） */
export async function loadWenjin(cache: CacheState): Promise<WenData> {
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

  const [settingsRaw, meta] = await Promise.all([
    kvGet<Partial<Settings>>(K.settings).catch(() => null),
    kvGet<{ at?: string; by?: string }>(K.meta).catch(() => null),
  ])

  return {
    companies: collect<Company>(K.companyPrefix),
    apps: collect<App>(K.appPrefix),
    resumes: collect<Resume>(K.resumePrefix),
    events: collect<WEvent>(K.eventPrefix),
    offers: collect<Offer>(K.offerPrefix),
    settings: core.normalizeSettings(settingsRaw, null),
    meta: meta && typeof meta === 'object' ? meta : null,
  }
}

// ── 写动作（全部先过 core.normalize* 唯一口径；写后顺手刷新心跳） ─────────

async function beat(by: string) {
  await kvSet(K.meta, { at: core.nowIso(), by }).catch(() => undefined)
}

export async function saveApp(input: Record<string, unknown>, existing: App | null): Promise<App> {
  const companyName = String(input.companyName ?? existing?.companyName ?? '')
  const a = core.normalizeApp(input, existing, companyName)
  await kvSet(K.app(a.id), a)
  await beat('panel')
  return a
}

export async function saveCompany(input: Record<string, unknown>, existing: Company | null): Promise<Company> {
  const c = core.normalizeCompany(input, existing)
  await kvSet(K.company(c.id), c)
  await beat('panel')
  return c
}

export async function saveResume(input: Record<string, unknown>, existing: Resume | null): Promise<Resume> {
  const r = core.normalizeResume(input, existing)
  await kvSet(K.resume(r.id), r)
  await beat('panel')
  return r
}

export async function saveEvent(input: Record<string, unknown>, existing: WEvent | null, appId: string): Promise<WEvent> {
  const e = core.normalizeEvent(input, existing, appId)
  await kvSet(K.event(e.id), e)
  await beat('panel')
  return e
}

export async function saveOffer(input: Record<string, unknown>, existing: Offer | null, appId: string): Promise<Offer> {
  const o = core.normalizeOffer(input, existing, appId)
  await kvSet(K.offer(o.id), o)
  await beat('panel')
  return o
}

export async function saveSettings(patch: Partial<Settings>, existing: Settings): Promise<Settings> {
  const s = core.normalizeSettings(patch, existing)
  await kvSet(K.settings, s)
  return s
}

/** 删除投递并级联删事件与 offer；返回级联数量 */
export async function deleteAppCascade(app: App, events: WEvent[], offers: Offer[]): Promise<{ events: number; offers: number }> {
  const evs = events.filter((e) => e.appId === app.id)
  const offs = offers.filter((o) => o.appId === app.id)
  await kvDel(K.app(app.id))
  for (const e of evs) await kvDel(K.event(e.id))
  for (const o of offs) await kvDel(K.offer(o.id))
  await beat('panel')
  return { events: evs.length, offers: offs.length }
}

export async function deleteResumeWithRefs(r: Resume, apps: App[]): Promise<number> {
  const refs = apps.filter((a) => a.resumeId === r.id)
  for (const a of refs) {
    await kvSet(K.app(a.id), { ...a, resumeId: '', updatedAt: core.nowIso() })
  }
  await kvDel(K.resume(r.id))
  await beat('panel')
  return refs.length
}

export async function deleteEntity(kind: 'company' | 'event' | 'offer', id: string): Promise<void> {
  const map: Record<string, string> = { company: K.company(id), event: K.event(id), offer: K.offer(id) }
  await kvDel(map[kind])
  await beat('panel')
}

/** CSV 导入落库（判重已在 core.importCSV 内做，这里只写） */
export async function applyImport(result: ImportCSVResult): Promise<void> {
  for (const c of result.companies) await kvSet(K.company(c.id), c)
  for (const a of result.apps) await kvSet(K.app(a.id), a)
  for (const e of result.noteEvents) await kvSet(K.event(e.id), e)
  await beat('panel')
}

/** JSON 全量导入（幂等按 id 覆盖写，同 id = 同实体不产生双份） */
export async function applyBackup(data: {
  companies?: Company[]; apps?: App[]; resumes?: Resume[]; events?: WEvent[]; offers?: Offer[]; settings?: Settings
}): Promise<number> {
  let n = 0
  for (const c of data.companies || []) { if (c && c.id) { await kvSet(K.company(String(c.id)), c); n += 1 } }
  for (const a of data.apps || []) { if (a && a.id) { await kvSet(K.app(String(a.id)), a); n += 1 } }
  for (const r of data.resumes || []) { if (r && r.id) { await kvSet(K.resume(String(r.id)), r); n += 1 } }
  for (const e of data.events || []) { if (e && e.id) { await kvSet(K.event(String(e.id)), e); n += 1 } }
  for (const o of data.offers || []) { if (o && o.id) { await kvSet(K.offer(String(o.id)), o); n += 1 } }
  if (data.settings) await kvSet(K.settings, core.normalizeSettings(data.settings as unknown as Record<string, unknown>, null))
  await beat('panel')
  return n
}

// ── 组装好的派生（面板各 Tab 直接用，口径 = core） ────────────────────────

export interface WenView {
  pipeline: PipelineResult
  due: FollowUpRow[]
  upcoming: UpcomingResult
  funnelChannel: FunnelRow[]
  funnelResume: FunnelRow[]
  offers: OfferRow[]
  questions: QuestionRow[]
}

export function buildView(d: WenData): WenView {
  const now = Date.now()
  return {
    pipeline: core.pipeline(d.apps),
    due: core.followUps(d.apps, d.events, d.settings, now),
    upcoming: core.upcoming(d.events, d.settings, now),
    funnelChannel: core.funnelBy(d.apps, d.events, 'channel'),
    funnelResume: core.funnelBy(d.apps, d.events, 'resumeId'),
    offers: core.offerCompare(d.offers, d.apps),
    questions: core.questionBank(d.events, d.apps),
  }
}

/** 时间线用：一个投递的事件，按时间倒序 */
export function eventsOf(appId: string, events: WEvent[]): WEvent[] {
  return events.filter((e) => e.appId === appId)
    .slice()
    .sort((x, y) => (core.parseTs(y.at) || 0) - (core.parseTs(x.at) || 0))
}

/** 下载文本文件（CSV/JSON 导出；面板 blob 通道） */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
