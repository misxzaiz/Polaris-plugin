/**
 * 通信层 + 问灶数据访问（面板）
 *
 * 策略计算复用 shared/stove-core.js（与 MCP/服务同一权威，esbuild 打包进
 * bundle）；本文件只做 cap.kv IO、命令邮箱下发（菜谱 URL 抓取走后台服务的
 * 原生 fetch——浏览器跨域根治点）与视图模型组装。
 *
 * 键空间契约（与 service/stove.js、mcp/server.js 一致，权威描述见 README）：
 *   stove.settings / stove.pantry / stove.recipes / stove.plan /
 *   stove.shopping / stove.history / stove.meta / stove.cmd.fetch.* / stove.result.*
 */
import { getHostInvoke } from './host'
import * as core from '../shared/stove-core.js'

export const K = core.K
export { core }
export const PLUGIN_ID = core.PLUGIN_ID
export const SERVICE_ID = 'stove-service'
export const LOCATIONS = core.LOCATIONS as unknown as string[]
export const LOCATION_LABELS = core.LOCATION_LABELS as Record<string, string>
export const CATEGORIES = core.CATEGORIES as unknown as string[]
export const CATEGORY_LABELS = core.CATEGORY_LABELS as Record<string, string>

// ── 类型（与 core 归一产物对齐）─────────────────────────────────────────────
export interface Settings { v: number; expiringDays: number; suggestCount: number }
export interface PantryItem {
  id: string; name: string; norm: string
  qty: number | null; unit: string; location: string
  expiresAt: number | null; addedAt: number; updatedAt: number; note?: string
}
export interface RecipeIngredient { name: string; norm: string; qty: number | null; unit: string }
export interface Recipe {
  id: string; name: string; minutes: number; tags: string[]
  ingredients: RecipeIngredient[]; steps: string[]
  url?: string; source: 'manual' | 'import' | 'ai'; createdAt: number
}
export interface RecipeBook { v: number; order: string[]; byId: Record<string, Recipe> }
export interface PlanEntry { recipeId: string | null; note: string | null }
export interface Plan { v: number; days: Record<string, PlanEntry> }
export interface ShoppingItem {
  id: string; name: string; norm: string; qty: number | null; unit: string
  category: string; done: boolean; addedAt: number; fromPlan: boolean
}
export interface HistoryEvent { at: number; type: string; name: string; qty?: number; unit?: string; recipeId?: string }
export interface Meta { version?: string; pid?: number; startedAt?: number; lastTickAt?: number; bridge?: string }

export interface Overview {
  settings: Settings
  pantry: { v: number; items: PantryItem[] }
  recipes: RecipeBook
  plan: Plan
  shopping: { v: number; items: ShoppingItem[] }
  history: { v: number; events: HistoryEvent[] }
  meta: Meta | null
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

/** 设置页服务管理用（pluginServiceManager / pluginDiscovery） */
export function capDispatchSelf<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  return capDispatch<T>(target, payload)
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

// ── 总览加载 ───────────────────────────────────────────────────────────────
export async function loadOverview(): Promise<Overview> {
  const [settingsRaw, pantryRaw, recipesRaw, planRaw, shoppingRaw, historyRaw, meta] = await Promise.all([
    kvGet(core.K.settings).catch(() => null),
    kvGet(core.K.pantry).catch(() => null),
    kvGet(core.K.recipes).catch(() => null),
    kvGet(core.K.plan).catch(() => null),
    kvGet(core.K.shopping).catch(() => null),
    kvGet(core.K.history).catch(() => null),
    kvGet<Meta>(core.K.meta).catch(() => null),
  ])
  const normS = core.normalizeSettings(settingsRaw && typeof settingsRaw === 'object' ? settingsRaw : {})
  return {
    settings: (normS.error ? { ...core.DEFAULT_SETTINGS } : normS.settings) as unknown as Settings,
    pantry: core.normalizePantry(pantryRaw && typeof pantryRaw === 'object' ? pantryRaw : null),
    recipes: core.normalizeRecipeBook(recipesRaw && typeof recipesRaw === 'object' ? recipesRaw : null),
    plan: core.normalizePlan(planRaw && typeof planRaw === 'object' ? planRaw : null),
    shopping: core.normalizeShopping(shoppingRaw && typeof shoppingRaw === 'object' ? shoppingRaw : null),
    history: core.normalizeHistory(historyRaw && typeof historyRaw === 'object' ? historyRaw : null),
    meta: meta && typeof meta === 'object' ? meta : null,
  }
}

// ── 命令邮箱（菜谱 URL 抓取 → 后台服务原生 fetch）─────────────────────────
export interface FetchResult { ok: boolean; error?: string; title?: string; text?: string; url?: string }

function nonce(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 下发抓取命令并轮询结果键 */
export async function importUrl(url: string, onPoll?: () => void, timeoutMs = 25000): Promise<FetchResult> {
  const n = nonce()
  await kvSet(`${core.K.cmdFetchPrefix}${n}`, { action: 'fetch_url', url, at: Date.now() })
  const resultKey = `${core.K.resultPrefix}${n}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    onPoll?.()
    const r = await kvGet<FetchResult>(resultKey).catch(() => null)
    if (r && typeof r === 'object') {
      kvDel(resultKey).catch(() => {})
      return r
    }
  }
  return { ok: false, error: '等待抓取结果超时——后台服务可能未运行（去「设置」页检查/重启服务）' }
}

// ── 变更动作（读-改-写同一键；写前过 core 归一 = 唯一权威）─────────────────
export interface PantryAddRaw {
  name: string; qty?: number | null; unit?: string
  location?: string; expiresAt?: string | null; note?: string
}

export function makeApi(reload: () => void) {
  const wrap = async (fn: () => Promise<void>, toast: (msg: string, bad?: boolean) => void) => {
    try {
      await fn()
      reload()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  return {
    saveSettings: (s: Partial<Settings>, toast: T) => wrap(async () => {
      const cur = await loadSettingsRaw()
      const norm = core.normalizeSettings({ ...cur, ...s })
      if (norm.error) throw new Error(norm.error)
      await kvSet(core.K.settings, norm.settings)
      toast('设置已保存')
    }, toast),

    pantryAdd: (raw: PantryAddRaw, toast: T) => wrap(async () => {
      const r = core.normalizePantryItem(raw)
      if (r.error || !r.item) throw new Error(r.error || '入库失败')
      const p = await loadPantryRaw()
      p.items.push(r.item)
      await kvSet(core.K.pantry, core.normalizePantry(p))
      const h = await loadHistoryRaw()
      await kvSet(core.K.history, core.pushHistory(h, { type: 'add', name: r.item.name, qty: r.item.qty, unit: r.item.unit, location: r.item.location }))
      toast(`已入库：${r.item.name}`)
    }, toast),

    /** 整份消耗（面板不做扣半份；细粒度走 AI/聊天） */
    pantryConsume: (item: PantryItem, action: 'used' | 'discarded', toast: T) => wrap(async () => {
      const p = await loadPantryRaw()
      p.items = p.items.filter((x) => x.id !== item.id)
      await kvSet(core.K.pantry, core.normalizePantry(p))
      const h = await loadHistoryRaw()
      await kvSet(core.K.history, core.pushHistory(h, { type: action === 'used' ? 'consume' : 'discard', name: item.name, qty: item.qty, unit: item.unit, location: item.location }))
      toast(`${item.name}：${action === 'used' ? '吃掉了' : '扔掉了'}`)
    }, toast),

    pantryRemove: (item: PantryItem, toast: T) => wrap(async () => {
      const p = await loadPantryRaw()
      p.items = p.items.filter((x) => x.id !== item.id)
      await kvSet(core.K.pantry, core.normalizePantry(p))
      toast(`已移除：${item.name}`)
    }, toast),

    recipeSave: (raw: Record<string, unknown>, toast: T): Promise<Recipe | null> => new Promise((resolve) => {
      wrap(async () => {
        const r = core.normalizeRecipe({ ...raw, source: raw.source || 'manual' })
        if (r.error || !r.recipe) throw new Error(r.error || '菜谱不合法')
        const book = await loadRecipesRaw()
        // 同名覆盖（归一名一致），避免重复添加堆积
        const norm = core.normName(r.recipe.name)
        const dupId = book.order.find((id) => core.normName(book.byId[id].name) === norm)
        if (dupId) r.recipe.id = dupId
        book.byId[r.recipe.id] = r.recipe
        if (!book.order.includes(r.recipe.id)) book.order.push(r.recipe.id)
        await kvSet(core.K.recipes, core.normalizeRecipeBook(book))
        toast(dupId ? `已更新「${r.recipe.name}」` : `已保存「${r.recipe.name}」`)
        resolve(r.recipe)
      }, toast)
    }),

    recipeRemove: (id: string, toast: T) => wrap(async () => {
      const book = await loadRecipesRaw()
      if (!book.byId[id]) throw new Error('菜谱不存在')
      const name = book.byId[id].name
      delete book.byId[id]
      book.order = book.order.filter((x) => x !== id)
      await kvSet(core.K.recipes, core.normalizeRecipeBook(book))
      const plan = await loadPlanRaw()
      for (const k of Object.keys(plan.days)) {
        if (plan.days[k].recipeId === id) {
          plan.days[k].recipeId = null
          if (!plan.days[k].note) delete plan.days[k]
        }
      }
      await kvSet(core.K.plan, plan)
      toast(`已删除「${name}」`)
    }, toast),

    planSet: (day: string, entry: { recipeId?: string | null; note?: string | null }, toast: T) => wrap(async () => {
      const plan = await loadPlanRaw()
      const recipeId = entry.recipeId ?? null
      const note = entry.note != null && entry.note.trim() ? entry.note.trim().slice(0, 60) : null
      if (!recipeId && !note) {
        delete plan.days[day]
      } else {
        plan.days[day] = { recipeId, note }
      }
      await kvSet(core.K.plan, core.normalizePlan(plan))
      toast('计划已更新')
    }, toast),

    planClear: (day: string, toast: T) => wrap(async () => {
      const plan = await loadPlanRaw()
      delete plan.days[day]
      await kvSet(core.K.plan, plan)
      toast('已清掉该日计划')
    }, toast),

    markCooked: (day: string, recipeId: string, toast: T) => wrap(async () => {
      const recipes = await loadRecipesRaw()
      const r = recipes.byId[recipeId]
      if (!r) throw new Error('菜谱不存在')
      const h = await loadHistoryRaw()
      await kvSet(core.K.history, core.pushHistory(h, { type: 'cook', name: r.name, recipeId }))
      toast(`记好了：做了「${r.name}」`)
    }, toast),

    shoppingAdd: (raw: { name: string; qty?: number | null; unit?: string }, toast: T) => wrap(async () => {
      const list = await loadShoppingRaw()
      const norm = core.normName(raw.name)
      if (norm && list.items.some((x) => !x.done && x.norm === norm)) {
        toast('清单里已有这件', true)
        return
      }
      const r = core.normalizeShoppingItem(raw)
      if (r.error || !r.item) throw new Error(r.error || '添加失败')
      list.items.push(r.item)
      await kvSet(core.K.shopping, core.normalizeShopping(list))
      toast(`已加入：${r.item.name}`)
    }, toast),

    shoppingToggle: (item: ShoppingItem, toast: T) => wrap(async () => {
      const list = await loadShoppingRaw()
      const it = list.items.find((x) => x.id === item.id)
      if (!it) throw new Error('条目不存在')
      it.done = !it.done
      await kvSet(core.K.shopping, core.normalizeShopping(list))
    }, toast),

    shoppingRemove: (item: ShoppingItem, toast: T) => wrap(async () => {
      const list = await loadShoppingRaw()
      list.items = list.items.filter((x) => x.id !== item.id)
      await kvSet(core.K.shopping, core.normalizeShopping(list))
    }, toast),

    shoppingClearDone: (toast: T) => wrap(async () => {
      const list = await loadShoppingRaw()
      const before = list.items.length
      list.items = list.items.filter((x) => !x.done)
      await kvSet(core.K.shopping, core.normalizeShopping(list))
      toast(`清掉已勾 ${before - list.items.length} 项`)
    }, toast),

    shoppingFillFromPlan: (toast: T) => wrap(async () => {
      const [plan, recipes, pantry, list] = await Promise.all([
        loadPlanRaw(), loadRecipesRaw(), loadPantryRaw(), loadShoppingRaw(),
      ])
      const agg = core.fillFromPlan(plan, recipes, pantry, Date.now())
      const added = core.mergeShopping(list, agg.items, Date.now())
      await kvSet(core.K.shopping, core.normalizeShopping({ items: [...list.items, ...added] }))
      toast(added.length ? `按计划补齐：新增 ${added.length} 项` : '计划缺料都在清单里了')
    }, toast),

    clearAll: async (toast: (m: string, bad?: boolean) => void) => {
      try {
        const keys = (await kvKeys()).filter((k) => k.startsWith('stove.'))
        await Promise.all(keys.map((k) => kvDel(k)))
        toast(`已清空 ${keys.length} 个键`)
        reload()
      } catch (e) {
        toast((e as Error).message, true)
      }
    },
  }
}
type T = (msg: string, bad?: boolean) => void
export type Toast = T
export type Api = ReturnType<typeof makeApi>

// ── 原始装载（动作内部用）──────────────────────────────────────────────────
function loadSettingsRaw() {
  return kvGet<Record<string, unknown>>(core.K.settings).then((x) => (x && typeof x === 'object' ? x : {}))
}
function loadPantryRaw() {
  return kvGet<{ items: Record<string, unknown>[] }>(core.K.pantry).then((x) => (x && Array.isArray(x.items) ? x : { items: [] }))
}
function loadRecipesRaw(): Promise<RecipeBook> {
  return kvGet<RecipeBook>(core.K.recipes).then((x) => (x && typeof x === 'object' && Array.isArray(x.order) && x.byId ? x : { v: 1, order: [], byId: {} }))
}
function loadPlanRaw(): Promise<Plan> {
  return kvGet<Plan>(core.K.plan).then((x) => (x && typeof x === 'object' && x.days ? x : { v: 1, days: {} }))
}
function loadShoppingRaw() {
  return kvGet<{ items: Record<string, unknown>[] }>(core.K.shopping).then((x) => (x && Array.isArray(x.items) ? x : { items: [] }))
}
function loadHistoryRaw() {
  return kvGet<{ events: HistoryEvent[] }>(core.K.history).then((x) => (x && Array.isArray(x.events) ? x : { v: 1, events: [] }))
}

// ── 菜谱手工表单解析（「番茄 2 个」→ {name,qty,unit}）──────────────────────
export function parseIngredientLine(line: string): { name: string; qty: number | null; unit: string } | null {
  const s = String(line || '').trim()
  if (!s) return null
  const m = s.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*([^\d\s]{1,6})?$/)
  if (m && m[2] !== undefined) {
    const name = m[1].trim()
    if (!name) return null
    return { name, qty: Number(m[2]), unit: (m[3] || '').trim() }
  }
  return { name: s, qty: null, unit: '' }
}

// ── 展示工具 ───────────────────────────────────────────────────────────────
export function dayLabel(day: string): string {
  const today = core.dayKey(Date.now())
  if (day === today) return '今天'
  if (day === core.dayShift(today, 1)) return '明天'
  const d = new Date(`${day}T00:00:00`)
  return `周${'日一二三四五六'[d.getDay()]}`
}
export function expiresLabel(ms: number | null, now = Date.now()): { text: string; level: 'none' | 'soon' | 'over' } {
  if (!ms) return { text: '', level: 'none' }
  const diff = ms - now
  if (diff < 0) return { text: `过期 ${Math.ceil(-diff / 86400000)} 天`, level: 'over' }
  const days = Math.ceil(diff / 86400000)
  return { text: days <= 1 ? '今天到期' : `剩 ${days} 天`, level: days <= 3 ? 'soon' : 'none' }
}
export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s} 秒前`
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return `${Math.floor(s / 86400)} 天前`
}
