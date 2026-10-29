'use strict';
/**
 * stove-core.js —— 食材管家唯一权威（与面板/MCP/服务三方共享，esbuild 打包进 bundle）
 *
 * 职责：键常量、全部规范化（设置/库存/菜谱/计划/采购/历史）、名称归一与同义词、
 * 用料-库存匹配、临期计算、灶签推荐评分（带可解释理由）、采购聚合（计划缺料
 * 扣在库 → 超市动线分类）、浪费统计、事件裁剪。
 *
 * 原则：本文件零依赖、纯函数（除 id 生成与日期工具）；不碰网络、不碰 cap.kv——
 * IO 一律由调用方完成后把原始对象交给这里归一，写回键也由调用方执行。
 */

const PLUGIN_ID = 'ask-stove';
const VERSION = '0.1.0';

// ── 键空间（权威；与 plugin.json 服务/MCP、面板 model.ts 一致）────────────────
const K = {
  settings: 'stove.settings',
  pantry: 'stove.pantry',
  recipes: 'stove.recipes',
  plan: 'stove.plan',
  shopping: 'stove.shopping',
  history: 'stove.history',
  meta: 'stove.meta',
  cmdFetchPrefix: 'stove.cmd.fetch.',
  resultPrefix: 'stove.result.',
};

// ── 枚举 ───────────────────────────────────────────────────────────────────
const LOCATIONS = ['fridge', 'freezer', 'dry', 'condiment', 'other'];
const LOCATION_LABELS = {
  fridge: '冷藏', freezer: '冷冻', dry: '干燥', condiment: '调味', other: '其他',
};
const CATEGORIES = ['veg', 'meat', 'seafood', 'staple', 'condiment', 'other'];
const CATEGORY_LABELS = {
  veg: '蔬果', meat: '肉蛋', seafood: '水产', staple: '主食', condiment: '调味', other: '其他',
};
const HISTORY_TYPES = ['add', 'cook', 'consume', 'discard'];
const HISTORY_CAP = 800;
const RECIPE_CAP = 200;
const RECIPE_STEP_CAP = 500;
const PLAN_WINDOW_DAYS = 56; // 计划键裁剪窗口：今天 ±56 天

// ── 日期工具（全部本地时区）────────────────────────────────────────────────
/** 本地日期键 YYYY-MM-DD */
function dayKey(ms) {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** 某本地日期键加 n 天 */
function dayShift(key, n) {
  const [y, m, d] = String(key).split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, m - 1, d + n);
  return dayKey(t.getTime());
}
function isValidDayKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

// ── id ─────────────────────────────────────────────────────────────────────
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── 名称归一与同义词 ───────────────────────────────────────────────────────
/**
 * 内置同义词组：任一成员归一为组首词。仅收「不同叫法指同一物」的高频组，
 * 不收品类近似（排骨/里脊不算同物——库存扣减会出错）。
 */
const SYNONYM_GROUPS = [
  ['番茄', '西红柿'], ['土豆', '马铃薯', '洋芋'], ['鸡蛋', '蛋', '鸡卵'],
  ['青椒', '柿子椒', '菜椒'], ['圆白菜', '包菜', '卷心菜', '结球甘蓝'],
  ['大白菜', '白菜'], ['洋葱', '葱头'], ['蒜薹', '蒜苔'],
  ['菜花', '花菜', '花椰菜'], ['西葫芦', '角瓜'], ['菠萝', '凤梨'],
  ['猕猴桃', '奇异果'], ['车厘子', '樱桃'], ['黄油', '牛油'],
  ['五花肉', '五花'], ['里脊', '里脊肉'], ['排骨', '肋排'],
  ['鸡腿', '鸡小腿'], ['鸡翅', '鸡翅膀'], ['虾', '鲜虾'],
  ['三文鱼', '鲑鱼'], ['金枪鱼', '吞拿鱼'], ['鳕鱼', '鳕鱼肉'],
  ['香菜', '芫荽'], ['玉米淀粉', '生粉', '淀粉'], ['酱油', '生抽'],
  ['香油', '芝麻油', '麻油'], ['料酒', '黄酒'], ['味精', '味素'],
  ['番茄酱', '番茄沙司'], ['小葱', '香葱'],
];

const SYN_MAP = (() => {
  const m = {};
  for (const group of SYNONYM_GROUPS) {
    for (const w of group) m[w] = group[0];
  }
  return m;
})();

/** 全角→半角、小写、去全部空白与分隔点；括注内容整体剥掉（「肥牛卷（火锅用）」→「肥牛卷」） */
function stripNoise(s) {
  return String(s || '')
    .replace(/（[^（）]*）|\([^()]*\)|【[^【】]*】/g, '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .toLowerCase()
    .replace(/[\s·・.。,，、;；::'’"“”()（）\[\]【】\-_/\\]+/g, '');
}

/**
 * 名称归一：去噪 → 同义词映射 → 保留原文（用于展示）。
 * 括注在 stripNoise 里已去掉，因此「肥牛卷(火锅用)」与「肥牛卷」同键。
 */
function normName(name) {
  const n = stripNoise(name);
  if (!n) return '';
  return SYN_MAP[n] || n;
}

/**
 * 用料名 ↔ 库存条目匹配：归一相等，或双向包含（短侧长度 ≥2）。
 * 「小葱」↔「香葱」这类不同字面的同物走同义词组；双向包含是为「库存写
 * 『小番茄』、菜谱写『番茄』」这类前缀变体兜底——归一后小番茄仍包含番茄。
 * 单字（长度 <2）不做包含，防「葱」误伤一切带葱字条目。
 */
function ingredientHit(ingredientName, pantryItemName) {
  const a = normName(ingredientName);
  const b = normName(pantryItemName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  return a.includes(b) || b.includes(a);
}

/** 库存内找命中条目（返回全部命中，调用方决定消耗哪条） */
function findPantryHits(pantry, ingredientName, now) {
  const out = [];
  for (const it of pantry.items || []) {
    if (it.status && it.status !== 'in') continue;
    if (isExpired(it, now)) continue; // 已过期库存不参与「有料」判定
    if (ingredientHit(ingredientName, it.name)) out.push(it);
  }
  return out;
}

// ── 设置 ───────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = Object.freeze({ v: 1, expiringDays: 5, suggestCount: 3 });

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/** @returns {{settings?:object, error?:string}} */
function normalizeSettings(raw) {
  if (raw === null || raw === undefined) return { settings: { ...DEFAULT_SETTINGS } };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'settings 必须为对象' };
  const s = {
    v: 1,
    expiringDays: clampInt(raw.expiringDays, 1, 30, DEFAULT_SETTINGS.expiringDays),
    suggestCount: clampInt(raw.suggestCount, 1, 10, DEFAULT_SETTINGS.suggestCount),
  };
  return { settings: s };
}

// ── 库存 ───────────────────────────────────────────────────────────────────
const QTY_MAX = 100000;

/** 单条入库载荷 → 干净条目；返回 {item} 或 {error} */
function normalizePantryItem(raw, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  if (!raw || typeof raw !== 'object') return { error: '条目必须为对象' };
  const name = String(raw.name || '').trim();
  if (!name) return { error: 'name 必填' };
  if (name.length > 40) return { error: 'name 过长（≤40 字）' };
  let qty = null;
  if (raw.qty !== undefined && raw.qty !== null && raw.qty !== '') {
    const q = Number(raw.qty);
    if (!Number.isFinite(q) || q < 0 || q > QTY_MAX) return { error: `qty 非法：${raw.qty}` };
    qty = Math.round(q * 100) / 100;
  }
  const unit = String(raw.unit || '').trim().slice(0, 10);
  const location = LOCATIONS.includes(raw.location) ? raw.location : 'fridge';
  let expiresAt = null;
  if (raw.expiresAt !== undefined && raw.expiresAt !== null && raw.expiresAt !== '') {
    // 接受 YYYY-MM-DD 或毫秒
    if (typeof raw.expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.expiresAt)) {
      const ms = new Date(`${raw.expiresAt}T23:59:59`).getTime(); // 当天整天算未过期
      if (Number.isNaN(ms)) return { error: `expiresAt 非法：${raw.expiresAt}` };
      expiresAt = ms;
    } else {
      const ms = Number(raw.expiresAt);
      if (!Number.isFinite(ms)) return { error: `expiresAt 非法：${raw.expiresAt}` };
      expiresAt = ms;
    }
  }
  const note = String(raw.note || '').trim().slice(0, 100) || undefined;
  return {
    item: {
      id: genId('pi'),
      name,
      norm: normName(name),
      qty,
      unit,
      location,
      expiresAt,
      addedAt: t,
      updatedAt: t,
      note,
    },
  };
}

/** 整库归一（读侧防御）：丢非法条目、补 norm 字段 */
function normalizePantry(raw, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  const clean = [];
  for (const it of items) {
    if (!it || typeof it !== 'object' || !String(it.name || '').trim()) continue;
    const r = normalizePantryItem(it, t);
    if (r.item) {
      // 保留原 id（归一读侧不换 id，防止并发端引用失效）
      if (typeof it.id === 'string' && it.id) r.item.id = it.id;
      clean.push(r.item);
    }
  }
  return { v: 1, items: clean };
}

function isExpired(item, now) {
  return !!(item && item.expiresAt && item.expiresAt < (Number.isFinite(now) ? now : Date.now()));
}
/** 临期：expiresAt 非空且落在 now..now+days*86400e3（含已过期由调用方单独染红） */
function isExpiring(item, days, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  return !!(item && item.expiresAt && item.expiresAt <= t + days * 86400 * 1000);
}
/** 临期红榜：已过期在前（最久过期最先），其余按到期时间升序 */
function expiringItems(pantry, days, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const list = (pantry.items || []).filter((it) => isExpiring(it, days, t));
  list.sort((a, b) => (a.expiresAt - b.expiresAt));
  return list;
}

// ── 菜谱 ───────────────────────────────────────────────────────────────────
/** 单菜谱归一；返回 {recipe} 或 {error} */
function normalizeRecipe(raw, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  if (!raw || typeof raw !== 'object') return { error: '菜谱必须为对象' };
  const name = String(raw.name || '').trim();
  if (!name) return { error: '菜谱名必填' };
  if (name.length > 60) return { error: '菜谱名过长（≤60 字）' };
  const minutes = clampInt(raw.minutes, 1, 1440, 30);
  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .map((x) => String(x || '').trim().slice(0, 12)).filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 8);
  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((x) => {
      if (!x) return null;
      const n = typeof x === 'string' ? x : String(x.name || '').trim();
      if (!n) return null;
      const qty = typeof x === 'object' && Number.isFinite(Number(x.qty)) && x.qty !== '' && x.qty !== null
        ? Math.round(Number(x.qty) * 100) / 100 : null;
      const unit = typeof x === 'object' ? String(x.unit || '').trim().slice(0, 10) : '';
      return { name: n.slice(0, 40), norm: normName(n), qty, unit };
    })
    .filter(Boolean).slice(0, 40);
  if (ingredients.length === 0) return { error: '用料至少 1 项' };
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s) => String(s || '').trim().slice(0, RECIPE_STEP_CAP)).filter(Boolean).slice(0, 30);
  if (steps.length === 0) return { error: '步骤至少 1 条' };
  const url = String(raw.url || '').trim().slice(0, 500) || undefined;
  const source = ['manual', 'import', 'ai'].includes(raw.source) ? raw.source : 'manual';
  return {
    recipe: {
      id: genId('rc'),
      name,
      minutes,
      tags,
      ingredients,
      steps,
      url,
      source,
      createdAt: t,
    },
  };
}

/** 整书归一（读侧防御）：丢非法、去重 id、order 与 byId 对齐、cap 裁剪（保新） */
function normalizeRecipeBook(raw, now) {
  const byId = (raw && typeof raw.byId === 'object' && raw.byId) || {};
  let order = Array.isArray(raw && raw.order) ? raw.order.filter((x) => typeof x === 'string') : [];
  order = order.filter((id, i) => order.indexOf(id) === i && byId[id]);
  // byId 里存在但 order 缺失的（防御）：追加
  for (const id of Object.keys(byId)) if (!order.includes(id)) order.push(id);
  const clean = { v: 1, order: order.slice(-RECIPE_CAP), byId: {} };
  for (const id of clean.order) {
    const r = normalizeRecipe(byId[id], now);
    if (r.recipe) {
      r.recipe.id = id;
      clean.byId[id] = r.recipe;
    }
  }
  return clean;
}

// ── 计划 ───────────────────────────────────────────────────────────────────
/** 计划归一 + 窗口裁剪：只留 today-56..today+56 */
function normalizePlan(raw, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const days = (raw && typeof raw.days === 'object' && raw.days) || {};
  const today = dayKey(t);
  const lo = dayShift(today, -PLAN_WINDOW_DAYS);
  const hi = dayShift(today, PLAN_WINDOW_DAYS);
  const out = { v: 1, days: {} };
  for (const key of Object.keys(days)) {
    if (!isValidDayKey(key) || key < lo || key > hi) continue;
    const e = days[key];
    if (!e || typeof e !== 'object') continue;
    const recipeId = typeof e.recipeId === 'string' && e.recipeId ? e.recipeId : null;
    const note = typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 60) : null;
    if (recipeId || note) out.days[key] = { recipeId, note };
  }
  return out;
}

// ── 采购 ───────────────────────────────────────────────────────────────────
const CATEGORY_RULES = [
  ['seafood', ['鱼', '虾', '蟹', '贝', '蛤', '鱿', '海参', '海带', '紫菜', '三文鱼', '金枪鱼', '鳕鱼']],
  ['meat', ['肉', '排', '腿', '翅', '蛋', '鸡', '鸭', '鹅', '牛', '羊', '猪', '培根', '火腿', '香肠', '腊', '丸']],
  ['staple', ['米', '面', '粉', '馒', '包', '饺', '面饼', '意面', '挂面', '米线', '面包', '吐司', '燕麦', '豆', '豆腐']],
  ['condiment', ['油', '盐', '酱', '醋', '糖', '料酒', '胡椒', '辣椒面', '孜然', '花椒', '大料', '香料', '酱料', '蚝油', '味精', '鸡精', '淀粉', '酵母', '芝麻']],
  ['veg', ['菜', '瓜', '茄', '椒', '葱', '蒜', '姜', '萝', '笋', '豆芽', '菇', '菌', '果', '桃', '李', '杏', '枣', '橘', '橙', '柚', '柠', '莓', '蕉', '梨', '瓜', '薯', '芋', '叶', '苔', '花']],
];

/** 购物分类（关键词优先级：水产→肉蛋→主食→调味→蔬果→其他） */
function categorize(name) {
  const n = normName(name);
  if (!n) return 'other';
  for (const [cat, words] of CATEGORY_RULES) {
    if (words.some((w) => n.includes(normName(w)))) return cat;
  }
  return 'other';
}

/** 采购条目归一 */
function normalizeShoppingItem(raw, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  if (!raw || typeof raw !== 'object') return { error: '条目必须为对象' };
  const name = String(raw.name || '').trim();
  if (!name) return { error: 'name 必填' };
  if (name.length > 40) return { error: 'name 过长' };
  let qty = null;
  if (raw.qty !== undefined && raw.qty !== null && raw.qty !== '') {
    const q = Number(raw.qty);
    if (!Number.isFinite(q) || q < 0 || q > QTY_MAX) return { error: `qty 非法` };
    qty = Math.round(q * 100) / 100;
  }
  return {
    item: {
      id: genId('sh'),
      name: name.slice(0, 40),
      norm: normName(name),
      qty,
      unit: String(raw.unit || '').trim().slice(0, 10),
      category: CATEGORIES.includes(raw.category) ? raw.category : categorize(name),
      done: !!raw.done,
      addedAt: t,
      fromPlan: !!raw.fromPlan,
    },
  };
}

function normalizeShopping(raw, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  const clean = [];
  const seen = new Set();
  for (const it of items) {
    if (!it || typeof it !== 'object' || !String(it.name || '').trim()) continue;
    const r = normalizeShoppingItem(it, t);
    if (!r.item) continue;
    if (typeof it.id === 'string' && it.id) r.item.id = it.id;
    // 归一去重：同名未完成项只留一条（保留更早的）
    const dupKey = r.item.done ? `${r.item.norm}#done` : r.item.norm;
    if (!r.item.done && seen.has(dupKey)) continue;
    seen.add(dupKey);
    clean.push(r.item);
  }
  return { v: 1, items: clean.slice(-300) };
}

// ── 历史 ───────────────────────────────────────────────────────────────────
/** 追加事件并裁剪（返回新数组；调用方负责写回） */
function pushHistory(rawHistory, event, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const events = Array.isArray(rawHistory && rawHistory.events) ? rawHistory.events.slice() : [];
  const e = {
    at: Number.isFinite(event && event.at) ? event.at : t,
    type: HISTORY_TYPES.includes(event && event.type) ? event.type : 'consume',
    name: String((event && event.name) || '').trim().slice(0, 40),
  };
  if (!e.name) return { v: 1, events };
  if (Number.isFinite(event && event.qty)) e.qty = event.qty;
  if (event && event.unit) e.unit = String(event.unit).slice(0, 10);
  if (event && typeof event.recipeId === 'string') e.recipeId = event.recipeId;
  if (event && event.location) e.location = String(event.location).slice(0, 12);
  events.push(e);
  return { v: 1, events: events.slice(-HISTORY_CAP) };
}

function normalizeHistory(raw) {
  const events = Array.isArray(raw && raw.events) ? raw.events : [];
  return { v: 1, events: events
    .filter((e) => e && typeof e === 'object' && Number.isFinite(Number(e.at)) && HISTORY_TYPES.includes(e.type))
    .map((e) => ({ at: Number(e.at), type: e.type, name: String(e.name || '').slice(0, 40) }))
    .slice(-HISTORY_CAP) };
}

// ── 灶签推荐引擎 ───────────────────────────────────────────────────────────
/** 日期+id 播种的 0..1 伪随机（同日同菜稳定，跨日轮换） */
function jitter01(dateStr, id) {
  let h = 2166136261;
  const s = `${dateStr}|${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * 灶签：为菜谱评分并出理由。
 * score = +3×min(临期命中种数,3) − 2×缺料种数 − 8×(近 recentDays 天做过) − 1×(minutes>30)
 *         + jitter×2
 * @returns {{recipe, score, hitExpiring:string[], missing:string[], recent:boolean, reasons:string[]}}
 */
function scoreRecipe(recipe, pantry, history, opts, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const days = (opts && opts.expiringDays) || 5;
  const dateStr = dayKey(t);
  const hitExpiring = [];
  const hitAny = new Set();
  const missing = [];
  for (const ing of recipe.ingredients || []) {
    if (hitAny.has(ing.norm)) continue;
    const hits = findPantryHits(pantry, ing.norm, t);
    if (hits.length > 0) {
      hitAny.add(ing.norm);
      for (const h of hits) {
        if (isExpiring(h, days, t)) {
          hitExpiring.push(h.name);
          break;
        }
      }
    } else {
      missing.push(ing.name);
    }
  }
  const recentCut = t - 7 * 86400 * 1000;
  const recent = (history.events || []).some(
    (e) => e.type === 'cook' && e.recipeId === recipe.id && e.at >= recentCut,
  );
  let score = 3 * Math.min(hitExpiring.length, 3)
    - 2 * missing.length
    - (recent ? 8 : 0)
    - (recipe.minutes > 30 ? 1 : 0)
    + jitter01(dateStr, recipe.id) * 2;
  score = Math.round(score * 100) / 100;
  const reasons = [];
  if (hitExpiring.length > 0) reasons.push(`清掉临期的${hitExpiring.slice(0, 2).join('、')}`);
  if (missing.length === 0) reasons.push('料全齐，直接开做');
  else if (missing.length <= 2) reasons.push(`只缺${missing.slice(0, 2).join('、')}`);
  else reasons.push(`缺 ${missing.length} 样料`);
  if (recipe.minutes <= 15) reasons.push(`${recipe.minutes} 分钟内搞定`);
  if (recent) reasons.push('最近做过，换个口');
  return { recipe, score, hitExpiring, missing, recent, reasons };
}

/** 灶签 topN（缺料过半的菜谱直接落榜——做不成的推荐是噪音） */
function suggestServing(recipes, pantry, history, settings, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const n = (settings && settings.suggestCount) || 3;
  const days = (settings && settings.expiringDays) || 5;
  const out = [];
  for (const id of recipes.order || []) {
    const r = recipes.byId[id];
    if (!r) continue;
    const s = scoreRecipe(r, pantry, history, { expiringDays: days }, t);
    if (s.missing.length > Math.ceil(r.ingredients.length / 2)) continue;
    out.push(s);
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, n);
}

// ── 采购聚合 ───────────────────────────────────────────────────────────────
/**
 * 本周计划缺料 → 扣在库 → 采购清单新条目。
 * @returns {{items:[{name,qty,unit,category,fromPlan:true}], skipped:[{day,reason}]}}
 */
function fillFromPlan(plan, recipes, pantry, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const today = dayKey(t);
  const need = new Map(); // norm -> {name, qty, unit}
  const skipped = [];
  for (let i = 0; i < 7; i++) {
    const day = dayShift(today, i);
    const e = plan.days[day];
    if (!e || !e.recipeId) continue;
    const r = recipes.byId[e.recipeId];
    if (!r) { skipped.push({ day, reason: '菜谱不存在' }); continue; }
    for (const ing of r.ingredients || []) {
      const have = findPantryHits(pantry, ing.norm, t);
      if (have.length > 0) continue; // 在库即认为够（不做用量精算——厨房不是实验室）
      const key = ing.norm;
      if (!need.has(key)) need.set(key, { name: ing.name, qty: ing.qty, unit: ing.unit, category: categorize(ing.name) });
      else if (!need.get(key).qty && ing.qty) need.get(key).qty = ing.qty;
    }
  }
  return { items: [...need.values()].map((x) => ({ ...x, fromPlan: true })), skipped };
}

/** 把聚合结果合并进现有清单（与未完成项归一去重），返回新增条目数组 */
function mergeShopping(list, aggItems, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const existing = new Set((list.items || []).filter((x) => !x.done).map((x) => x.norm));
  const added = [];
  for (const a of aggItems) {
    const norm = normName(a.name);
    if (!norm || existing.has(norm)) continue;
    existing.add(norm);
    const r = normalizeShoppingItem({ ...a, fromPlan: true }, t);
    if (r.item) added.push(r.item);
  }
  return added;
}

// ── 浪费统计 ───────────────────────────────────────────────────────────────
/**
 * @returns {{used:number, discarded:number, wasteRate:number,
 *            topDiscarded:[{name,count}], weeks:[{key,used,discarded}]}}
 */
function wasteStats(history, days, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const win = (Number.isFinite(days) ? days : 30) * 86400 * 1000;
  const lo = t - win;
  let used = 0;
  let discarded = 0;
  const dMap = new Map();
  for (const e of (history && history.events) || []) {
    if (e.at < lo) continue;
    if (e.type === 'consume') used++;
    else if (e.type === 'discard') {
      discarded++;
      dMap.set(e.name, (dMap.get(e.name) || 0) + 1);
    }
  }
  const total = used + discarded;
  // 近 12 周桶（含本周），旧→新
  const weeks = [];
  const thisMonday = (() => {
    const d = new Date(t);
    const dow = (d.getDay() + 6) % 7; // 周一=0
    return dayShift(dayKey(t), -dow);
  })();
  for (let w = 11; w >= 0; w--) {
    const monday = dayShift(thisMonday, -7 * w);
    weeks.push({ key: monday, used: 0, discarded: 0 });
  }
  const weekIndex = (ms) => {
    const k = dayKey(ms);
    for (let i = 0; i < weeks.length; i++) {
      const start = weeks[i].key;
      const end = i < weeks.length - 1 ? weeks[i + 1].key : dayShift(thisMonday, 7);
      if (k >= start && k < end) return i;
    }
    return -1;
  };
  for (const e of (history && history.events) || []) {
    const i = weekIndex(e.at);
    if (i < 0) continue;
    if (e.type === 'consume') weeks[i].used++;
    else if (e.type === 'discard') weeks[i].discarded++;
  }
  return {
    used,
    discarded,
    wasteRate: total > 0 ? Math.round((discarded / total) * 100) : 0,
    topDiscarded: [...dMap.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 5),
    weeks,
  };
}

module.exports = {
  PLUGIN_ID, VERSION, K,
  LOCATIONS, LOCATION_LABELS, CATEGORIES, CATEGORY_LABELS, HISTORY_TYPES,
  HISTORY_CAP, RECIPE_CAP, RECIPE_STEP_CAP, PLAN_WINDOW_DAYS,
  DEFAULT_SETTINGS, SYNONYM_GROUPS,
  dayKey, dayShift, isValidDayKey, genId,
  stripNoise, normName, ingredientHit, findPantryHits,
  normalizeSettings,
  normalizePantryItem, normalizePantry, isExpired, isExpiring, expiringItems,
  normalizeRecipe, normalizeRecipeBook,
  normalizePlan,
  categorize, normalizeShoppingItem, normalizeShopping,
  pushHistory, normalizeHistory,
  scoreRecipe, suggestServing,
  fillFromPlan, mergeShopping,
  wasteStats,
};
