/**
 * 通信层 + 数据访问（人情账本面板）
 *
 * 计算逻辑全部复用 shared/tether-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   tether.settings / tether.people / tether.promises / tether.journal
 */
import { getHostInvoke } from './host'
import * as core from '../shared/tether-core.js'

export const K = core.K
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as TetherSettings
export const RELATIONS = core.RELATIONS as string[]
export const CHANNELS = core.CHANNELS as string[]
export const EVENT_TYPES = core.EVENT_TYPES as string[]
export const FAVOR_DIRECTIONS = core.FAVOR_DIRECTIONS as string[]
export const PROMISE_DIRECTIONS = core.PROMISE_DIRECTIONS as string[]
export const MAX_PEOPLE = core.MAX_PEOPLE as number
export const dayKeyOf = core.dayKeyOf as (ts: number) => string
export const resolveDateInput = core.resolveDateInput as (input: unknown, now: number) => number | null
export const normalizePerson = core.normalizePerson as (raw: Record<string, unknown>) => { person?: Person; error?: string }
export const normalizeEvent = core.normalizeEvent as (raw: Record<string, unknown>) => { event?: JournalEvent; error?: string }
export const normalizePromise = core.normalizePromise as (raw: Record<string, unknown>) => { promise?: PromiseItem; error?: string }
export const appendEvents = core.appendEvents as (existing: JournalEvent[], events: JournalEvent[]) => JournalEvent[]
export const trimClosedPromises = core.trimClosedPromises as (byId: Record<string, PromiseItem>) => Record<string, PromiseItem>
export const driftList = core.driftList as (people: Record<string, Person>, events: JournalEvent[], settings: TetherSettings, now: number) => DriftRow[]
export const birthdayUpcoming = core.birthdayUpcoming as (people: Record<string, Person>, days: number, now: number) => BirthdayRow[]
export const promiseBoard = core.promiseBoard as (
  promises: Record<string, PromiseItem>, people: Record<string, Person>, now: number, settings: TetherSettings,
) => PromiseBoard
export const contactTrend = core.contactTrend as (events: JournalEvent[], months: number, now: number) => { month: string; count: number }[]
export const favorBalance = core.favorBalance as (events: JournalEvent[]) => Record<string, { gave: number; got: number }>
export const personPack = core.personPack as (
  person: Person, events: JournalEvent[], promises: Record<string, PromiseItem>, now: number, settings: TetherSettings,
) => string
export const dueState = core.dueState as (due: string | undefined, now: number, warnDays: number) => DueState
export const makeId = core.makeId as (now?: number) => string
export const exportAll = core.exportAll as (
  settings: TetherSettings, people: PeopleBook, promises: PromisesBook, journal: JournalBook,
) => Record<string, unknown>

// ── 类型（与 core 输出对齐）────────────────────────────────────────────────
export interface Person {
  id: string
  name: string
  alias?: string
  relation: string
  tags?: string[]
  howMet?: string
  birthday?: string
  contacts?: Record<string, string>
  cadenceDays?: number | null
  note?: string
  pinned?: boolean
  archivedAt?: number
  createdAt: number
  updatedAt: number
}

export interface JournalEvent {
  id: string
  at: number
  personId: string
  type: 'contact' | 'note' | 'favor'
  channel?: string
  direction?: 'gave' | 'got'
  text: string
}

export interface PromiseItem {
  id: string
  personId: string
  direction: 'iowe' | 'owedme'
  text: string
  createdAt: number
  due?: string
  status: 'open' | 'done' | 'cancelled'
  closedAt?: number
  closeNote?: string
}

export interface TetherSettings {
  v: number
  defaultCadenceDays: number
  driftGraceDays: number
  birthdayDays: number
  dueWarnDays: number
}

export interface PeopleBook { order: string[]; byId: Record<string, Person> }
export interface PromisesBook { byId: Record<string, PromiseItem> }
export interface JournalBook { events: JournalEvent[] }

export interface DueState { kind: 'overdue' | 'dueSoon' | 'scheduled' | 'none'; days?: number; label: string }
export type BoardItem = PromiseItem & { personName: string; dueState?: DueState }
export interface PromiseBoard {
  overdue: BoardItem[]
  dueSoon: BoardItem[]
  scheduled: BoardItem[]
  openNoDue: BoardItem[]
  closed: BoardItem[]
}
export interface DriftRow {
  personId: string; name: string; alias?: string; relation: string
  daysSince: number; cadence: number; overdue: number
  level: 'ok' | 'warn' | 'lost'; lastAt: number | null
  neverContacted: boolean; text: string
}
export interface BirthdayRow {
  personId: string; name: string; birthday: string
  date: string; daysUntil: number; turningAge?: number
}

/** 面板一次轮询拉到的全量视图数据 */
export interface PanelData {
  settings: TetherSettings
  peopleBook: PeopleBook
  promisesBook: PromisesBook
  journalBook: JournalBook
}

// ── 通道 ───────────────────────────────────────────────────────────────────
interface DispatchResponse {
  msgId: string
  ok: boolean
  result?: { value?: unknown; keys?: string[] }
  error?: string | null
}

async function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })
  return (r.value ?? null) as T | null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

/** 设置钳制（面板直接用，越界回默认） */
export function normalizeSettingsLocal(raw: Record<string, unknown>): TetherSettings {
  const n = core.normalizeSettings(raw)
  return (n.settings || { ...DEFAULT_SETTINGS }) as TetherSettings
}

// ── 数据访问 ───────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<TetherSettings> {
  const s = await kvGet<Partial<TetherSettings>>(K.settings).catch(() => null)
  const n = core.normalizeSettings(s && typeof s === 'object' ? s : null)
  return (n.settings || { ...DEFAULT_SETTINGS }) as TetherSettings
}

export async function loadPanelData(): Promise<PanelData> {
  const [people, promises, journal, settings] = await Promise.all([
    kvGet<PeopleBook>(K.people).catch(() => null),
    kvGet<PromisesBook>(K.promises).catch(() => null),
    kvGet<JournalBook>(K.journal).catch(() => null),
    loadSettings(),
  ])
  return {
    settings,
    peopleBook: people && people.byId && typeof people.byId === 'object'
      ? { order: Array.isArray(people.order) ? people.order : [], byId: people.byId }
      : { order: [], byId: {} },
    promisesBook: promises && promises.byId && typeof promises.byId === 'object' ? promises : { byId: {} },
    journalBook: journal && Array.isArray(journal.events) ? journal : { events: [] },
  }
}

export async function saveSettings(s: TetherSettings): Promise<void> {
  await kvSet(K.settings, s)
}

export async function savePeople(book: PeopleBook): Promise<void> {
  await kvSet(K.people, { v: 1, order: book.order, byId: book.byId })
}

export async function savePromises(book: PromisesBook): Promise<void> {
  await kvSet(K.promises, { v: 1, byId: trimClosedPromises(book.byId) })
}

export async function saveJournal(book: JournalBook): Promise<void> {
  await kvSet(K.journal, { v: 1, events: appendEvents(book.events, []) })
}

/** 建档/更新（upsert）：id 命中或精确同名=更新，否则新建；返回错误或生效档案 */
export async function upsertPerson(input: Record<string, unknown>, existing: PeopleBook): Promise<{ ok: boolean; error?: string; person?: Person }> {
  const now = Date.now()
  let target: Person | null = null
  if (typeof input.id === 'string' && input.id) {
    target = existing.byId[input.id] || null
    if (!target) return { ok: false, error: `personId ${input.id} 不存在` }
  } else {
    const name = String(input.name || '').trim()
    const hit = Object.values(existing.byId).find((p) => p.name === name)
    if (hit) target = hit
  }
  const norm = normalizePerson({ ...(target || {}), ...input, createdAt: target ? target.createdAt : now, updatedAt: now })
  if (norm.error || !norm.person) return { ok: false, error: norm.error || '档案不合法' }
  const person = norm.person
  if (!target && Object.values(existing.byId).filter((p) => !p.archivedAt).length >= MAX_PEOPLE) {
    return { ok: false, error: `档案已达上限 ${MAX_PEOPLE} 人` }
  }
  const book: PeopleBook = { order: [...existing.order], byId: { ...existing.byId } }
  if (!book.order.includes(person.id)) book.order.push(person.id)
  book.byId[person.id] = person
  await savePeople(book)
  return { ok: true, person }
}

/** 删档级联：该人的承诺与往来一并清除 */
export async function removePersonCascade(personId: string, data: PanelData): Promise<number> {
  const book: PeopleBook = { order: data.peopleBook.order.filter((id) => id !== personId), byId: { ...data.peopleBook.byId } }
  delete book.byId[personId]
  const promById = { ...data.promisesBook.byId }
  for (const [id, p] of Object.entries(promById)) if (p.personId === personId) delete promById[id]
  const events = data.journalBook.events.filter((e) => e.personId !== personId)
  await savePeople(book)
  await savePromises({ byId: promById })
  await saveJournal({ events })
  return events.length
}

/** 追加一笔往来（幂等去重） */
export async function appendJournalEvent(ev: JournalEvent, existing: JournalEvent[]): Promise<void> {
  await kvSet(K.journal, { v: 1, events: appendEvents(existing, [ev]) })
}

/** 设置承诺状态（闭环/取消/重开） */
export async function setPromiseStatus(
  id: string, status: PromiseItem['status'], closeNote?: string,
): Promise<boolean> {
  const cur = await kvGet<PromisesBook>(K.promises).catch(() => null)
  const byId = { ...((cur && cur.byId) || {}) }
  const p = byId[id]
  if (!p) return false
  if (status === 'open') {
    delete p.closedAt
    delete p.closeNote
  } else {
    p.closedAt = Date.now()
    const note = String(closeNote || '').trim().slice(0, 200)
    if (note) p.closeNote = note
  }
  p.status = status
  await savePromises({ byId })
  return true
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function fmtAgo(ts: number, now: number): string {
  const days = Math.floor((now - ts) / core.DAY_MS)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

/** 关系 → 头像底色（面板专用视觉映射，不入 core） */
export const RELATION_COLORS: Record<string, string> = {
  家人: '#C2504D',
  伴侣: '#D2598A',
  朋友: '#2A9D8F',
  同事: '#4C7DD0',
  客户: '#B8860B',
  导师: '#8A6D3B',
  同学: '#5B8C5A',
  其他: '#6B7280',
}

export function contactLabel(e: JournalEvent): string {
  if (e.type === 'contact') return e.channel || '联系'
  if (e.type === 'favor') return e.direction === 'gave' ? '帮了他' : '他帮我'
  return '便签'
}
