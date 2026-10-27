/**
 * 通信层 + 熔炉数据访问（记忆熔炉面板）
 *
 * 计算/调度逻辑全部复用 shared/srs-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO 与面板视图模型组装。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   memoryforge.settings / memoryforge.deck.<id> / memoryforge.card.<id> / memoryforge.meta
 */
import { getHostInvoke } from './host'
import * as core from '../shared/srs-core.js'

export const K = core.K
export const DEFAULT_SETTINGS = core.DEFAULT_SETTINGS as unknown as MfSettings
export const DEFAULT_DECK_ID = core.DEFAULT_DECK_ID
export const DEFAULT_DECK_NAME = core.DEFAULT_DECK_NAME
export const GRADE_LABELS = core.GRADE_LABELS as unknown as string[]
export const fmtIvl = core.fmtIvl
export const dayKeyOf = core.dayKeyOf
export const searchCards = core.searchCards as (cards: Card[], f?: SearchFilter) => Card[]
export const toJsonExport = core.toJsonExport as (
  cards: Card[], decks: Deck[], settings: MfSettings, meta: Meta,
) => ExportDump
export const toCsv = core.toCsv as (cards: Card[], decks: Deck[]) => string
export const parseImportJson = core.parseImportJson as (text: string) => { cards?: ImportRawCard[]; settings?: Partial<MfSettings>; error?: string }

// ── 类型（与 core 输出对齐）────────────────────────────────────────────────
export interface Card {
  id: string
  deckId: string
  front: string
  back: string
  tags: string[]
  source: string
  status: 'new' | 'learning' | 'review' | 'suspended'
  learningStep: number
  intervalMin: number
  due: number
  ease: number
  reps: number
  lapses: number
  createdAt: number
  updatedAt: number
  history: { t: number; g: number; iv: number }[]
}

export interface Deck {
  id: string
  name: string
  createdAt: number
}

export interface MfSettings {
  schemaVersion: number
  dailyNewLimit: number
  dailyReviewLimit: number
}

export interface Meta {
  streak?: { count: number; lastDay: string; best: number }
}

export interface SearchFilter {
  query?: string
  deckId?: string
  tag?: string
  status?: Card['status']
}

export interface ExportDump {
  app: string
  schemaVersion: number
  exportedAt: number
  settings: MfSettings
  meta: Meta
  decks: Deck[]
  cards: Card[]
}

export interface ImportRawCard {
  id?: string
  front?: string
  back?: string
  tags?: string[]
  deckName?: string
  source?: string
}

export interface TodayCount { today: string; reviews: number; correct: number; newCards: number }

export interface StatsSummary {
  total: number
  byStatus: { new: number; learning: number; review: number; suspended: number }
  dueNow: number
  today: TodayCount
  retention30: number | null
  streak: number
  bestStreak: number
  forecast: { date: string; count: number }[]
  activity30: { date: string; count: number }[]
  byDeck: { id: string; name: string; total: number; due: number; fresh: number; mature: number }[]
}

export interface QueueInfo {
  queue: Card[]
  today: TodayCount
  reviewRemaining: number
  newRemaining: number
  dueTotal: number
  newTotal: number
}

/** 面板一次加载的完整视图数据 */
export interface Snapshot {
  settings: MfSettings
  decks: Deck[]
  cards: Card[]
  meta: Meta
  stats: StatsSummary
  queue: QueueInfo
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

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return r.keys ?? []
}

// ── 快照加载 ───────────────────────────────────────────────────────────────
export async function loadSnapshot(): Promise<Snapshot> {
  const keys = await kvKeys()
  const mine = keys.filter((k) => k.startsWith(core.K.PREFIX))
  const [cardKeys, deckKeys] = [mine.filter((k) => k.startsWith(core.K.cardPrefix)), mine.filter((k) => k.startsWith(core.K.deckPrefix))]
  const [cardVals, deckVals, settingsRaw, metaRaw] = await Promise.all([
    Promise.all(cardKeys.map((k) => kvGet<Card>(k).catch(() => null))),
    Promise.all(deckKeys.map((k) => kvGet<Deck>(k).catch(() => null))),
    kvGet<Partial<MfSettings>>(core.K.settings).catch(() => null),
    kvGet<Meta>(core.K.meta).catch(() => null),
  ])
  const cards = cardVals.filter((c): c is Card => !!c && typeof c === 'object' && typeof c.front === 'string')
  const decks = deckVals.filter((d): d is Deck => !!d && typeof d === 'object' && typeof d.name === 'string')
  const settings: MfSettings = { ...DEFAULT_SETTINGS, ...(settingsRaw && typeof settingsRaw === 'object' ? settingsRaw : {}) }
  const meta: Meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : {}
  const now = Date.now()
  return {
    settings, decks, cards, meta,
    stats: core.computeStats(cards, decks, meta, now) as unknown as StatsSummary,
    queue: core.computeQueue(cards, settings, now) as unknown as QueueInfo,
  }
}

// ── 写路径 ─────────────────────────────────────────────────────────────────
async function loadSettingsRaw(): Promise<MfSettings> {
  const s = await kvGet<Partial<MfSettings>>(core.K.settings).catch(() => null)
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

export async function saveSettings(s: MfSettings): Promise<void> {
  await kvSet(core.K.settings, s)
}

/** 按名称找牌组，没有就创建（默认牌组 id 固定 default；与 MCP ensureDeck 同规则） */
export async function ensureDeck(name: string): Promise<Deck> {
  const wanted = String(name || '').trim() || DEFAULT_DECK_NAME
  const keys = await kvKeys()
  const deckKeys = keys.filter((k) => k.startsWith(core.K.deckPrefix))
  const vals = await Promise.all(deckKeys.map((k) => kvGet<Deck>(k).catch(() => null)))
  const found = vals.find((d): d is Deck => !!d && d.name === wanted)
  if (found) return found
  const id = wanted === DEFAULT_DECK_NAME ? DEFAULT_DECK_ID : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const deck: Deck = { id, name: wanted.slice(0, 30), createdAt: Date.now() }
  await kvSet(core.K.deck(id), deck)
  return deck
}

/** 删除空牌组（默认牌组不可删；非空先移卡） */
export async function deleteDeck(id: string): Promise<{ ok: boolean; error?: string }> {
  if (id === DEFAULT_DECK_ID) return { ok: false, error: '默认牌组不可删除' }
  const cards = await loadAllCards()
  if (cards.some((c) => c.deckId === id)) return { ok: false, error: '牌组还有卡片，先把卡移走或删除' }
  await kvDel(core.K.deck(id))
  return { ok: true }
}

/** 面板建卡：归一化 → 写入；返回错误文案或新卡 */
export async function addCard(input: { front: string; back: string; deckId?: string; tags?: string[]; source?: string }): Promise<{ ok: boolean; error?: string }> {
  const norm = core.normalizeCard({ ...input, deckId: input.deckId || DEFAULT_DECK_ID, source: input.source || 'panel' })
  if (norm.error || !norm.card) return { ok: false, error: norm.error || '卡片不合法' }
  await kvSet(core.K.card(norm.card.id), norm.card)
  return { ok: true }
}

/** 面板/AI 评分：调度 → 写卡 → 连击写 meta；返回调度后的卡 */
export async function gradeCard(cardId: string, grade: 0 | 1 | 2 | 3): Promise<Card> {
  const key = core.K.card(cardId)
  const card = await kvGet<Card>(key)
  if (!card) throw new Error('卡片不存在（可能已在别端删除）')
  const now = Date.now()
  const g = core.gradeCard(card, grade, now)
  if (g.error || !g.card) throw new Error(g.error || '评分失败')
  await kvSet(key, g.card)
  const metaRaw = await kvGet<Meta>(core.K.meta).catch(() => null)
  const meta: Meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : {}
  const st = core.updateStreak(meta, now)
  if (st.changed) await kvSet(core.K.meta, { ...meta, streak: st.streak })
  return g.card
}

export async function updateCardContent(cardId: string, patch: { front?: string; back?: string; tags?: string[] }): Promise<{ ok: boolean; error?: string }> {
  const card = await kvGet<Card>(core.K.card(cardId))
  if (!card) return { ok: false, error: '卡片不存在' }
  const e = core.editCard(card, patch)
  if (e.error || !e.card) return { ok: false, error: e.error || '修改不合法' }
  await kvSet(core.K.card(cardId), e.card)
  return { ok: true }
}

export async function setSuspended(cardId: string, suspended: boolean): Promise<void> {
  const card = await kvGet<Card>(core.K.card(cardId))
  if (!card) throw new Error('卡片不存在')
  await kvSet(core.K.card(cardId), { ...card, status: suspended ? 'suspended' : 'new', updatedAt: Date.now() })
}

export async function deleteCards(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => kvDel(core.K.card(id))))
}

/** JSON 导入（设置页）：deckName → ensureDeck，id 冲突自动重生成；返回计数与问题 */
export async function importFromJson(text: string): Promise<{ imported: number; failed: number; problems: string[] }> {
  const parsed = parseImportJson(text)
  if (parsed.error || !parsed.cards) throw new Error(parsed.error || '导入内容不合法')
  const existing = await loadAllCards()
  const takenIds = new Set(existing.map((c) => c.id))
  const deckCache = new Map<string, Deck>()
  const problems: string[] = []
  let imported = 0
  const now = Date.now()
  const validSettings = parsed.settings
  for (const raw of parsed.cards) {
    let deckId = DEFAULT_DECK_ID
    const dn = (raw.deckName || '').trim()
    if (dn) {
      let deck = deckCache.get(dn)
      if (!deck) {
        // eslint-disable-next-line no-await-in-loop
        deck = await ensureDeck(dn)
        deckCache.set(dn, deck)
      }
      deckId = deck.id
    }
    const id = raw.id && !takenIds.has(raw.id) ? raw.id : undefined
    if (raw.id) takenIds.add(raw.id || '')
    const norm = core.normalizeCard({ id, deckId, front: raw.front, back: raw.back, tags: raw.tags, source: raw.source || 'import', now })
    if (norm.error || !norm.card) {
      problems.push(`「${String(raw.front || '').slice(0, 24) || '(无 front)'}」：${norm.error}`)
      continue
    }
    takenIds.add(norm.card.id)
    // eslint-disable-next-line no-await-in-loop
    await kvSet(core.K.card(norm.card.id), norm.card)
    imported += 1
  }
  if (validSettings && Number.isFinite(Number(validSettings.dailyNewLimit))) {
    const cur = await loadSettingsRaw()
    await saveSettings({ ...cur, dailyNewLimit: Number(validSettings.dailyNewLimit), dailyReviewLimit: Number.isFinite(Number(validSettings.dailyReviewLimit)) ? Number(validSettings.dailyReviewLimit) : cur.dailyReviewLimit })
  }
  return { imported, failed: problems.length, problems }
}

async function loadAllCards(): Promise<Card[]> {
  const keys = await kvKeys()
  const cardKeys = keys.filter((k) => k.startsWith(core.K.cardPrefix))
  const vals = await Promise.all(cardKeys.map((k) => kvGet<Card>(k).catch(() => null)))
  return vals.filter((c): c is Card => !!c && typeof c === 'object' && typeof c.front === 'string')
}

/** 清空本插件全部数据（memoryforge.* 键） */
export async function wipeAll(): Promise<number> {
  const keys = await kvKeys()
  const mine = keys.filter((k) => k.startsWith(core.K.PREFIX))
  await Promise.all(mine.map((k) => kvDel(k)))
  return mine.length
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
export function deckNameOf(decks: Deck[], id: string): string {
  const d = decks.find((x) => x.id === id)
  return d ? d.name : '未归属'
}

export const STATUS_LABEL: Record<Card['status'], string> = {
  new: '新卡', learning: '学习中', review: '复习中', suspended: '已暂停',
}

/** 到期时间的人话："3 小时后 / 已到期 2 天 / -" */
export function fmtDue(card: Card, now = Date.now()): string {
  if (card.status === 'new') return '未开始'
  const diff = card.due - now
  if (diff <= 0) return `到期 ${core.fmtIvl(-diff / 60000)}前`
  return `${core.fmtIvl(diff / 60000)}后`
}

/** 卡库列表排序：学习中/复习按到期升序 → 新卡按创建升序 → 暂停殿后 */
export function librarySort(a: Card, b: Card): number {
  const rank = (c: Card) => (c.status === 'suspended' ? 3 : c.status === 'new' ? 2 : 1)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  if (rank(a) === 2) return (a.createdAt || 0) - (b.createdAt || 0)
  return (a.due || 0) - (b.due || 0)
}

/** 复制文本到剪贴板（导出用，同 pocket-ledger 通道） */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
