#!/usr/bin/env node
'use strict';
/**
 * ask-stove MCP Server —— 问灶的 AI 工具层（零依赖，node >= 18）
 *
 * 职责：把 AI 的灶房意图翻译为 cap.kv 的 stove.* 读写（复用 service/kvclient
 * 自发现）；菜谱 URL 抓取经命令邮箱下发后台服务（服务是唯一外联点，SSRF
 * 守卫在服务侧）。策略计算走 shared/stove-core.js（与面板/服务同一权威）。
 *
 * 工具一览（12）：
 *   stove_overview        今日灶签+临期红榜+今日计划+采购待办（对话入口）
 *   stove_pantry_list     查库存（可只看临期/某分区/关键词）
 *   stove_pantry_add      批量入库（AI 先从口语解析再调用）
 *   stove_pantry_consume  消耗（used=吃掉 / discarded=扔掉），写历史
 *   stove_recipe_list     菜谱检索
 *   stove_recipe_import   URL → 服务端抓取正文（供 AI 抽取）
 *   stove_recipe_save     抽取后的结构化菜谱落库
 *   stove_recipe_remove   删菜谱
 *   stove_plan            本周计划读写 / 标记「做了这道菜」
 *   stove_suggest         灶签推荐（带理由）
 *   stove_shopping        采购清单全操作 + 按计划一键补齐
 *   stove_stats           消耗/浪费透视
 *
 * 连接方式与数据方舟相同：env POLARIS_HOST/PORT/TOKEN → anchor.json →
 * config.json → 端口扫描。stdout 仅协议数据，日志走 stderr。
 */
const core = require('../shared/stove-core.js');
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'ask-stove';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const APP_CONFIG_DIR = process.argv[2] || '';
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

// ── 数据访问（读侧全部过 core 归一 = 唯一权威）─────────────────────────────
async function loadSettings() {
  const s = await kv.kvGet(core.K.settings).catch(() => null);
  const r = core.normalizeSettings(s);
  return r.error ? { ...core.DEFAULT_SETTINGS } : r.settings;
}
async function loadPantry() {
  const p = await kv.kvGet(core.K.pantry).catch(() => null);
  return core.normalizePantry(p && typeof p === 'object' ? p : null);
}
async function loadRecipes() {
  const r = await kv.kvGet(core.K.recipes).catch(() => null);
  return core.normalizeRecipeBook(r && typeof r === 'object' ? r : null);
}
async function loadPlan() {
  const p = await kv.kvGet(core.K.plan).catch(() => null);
  return core.normalizePlan(p && typeof p === 'object' ? p : null);
}
async function loadShopping() {
  const s = await kv.kvGet(core.K.shopping).catch(() => null);
  return core.normalizeShopping(s && typeof s === 'object' ? s : null);
}
async function loadHistory() {
  const h = await kv.kvGet(core.K.history).catch(() => null);
  return core.normalizeHistory(h && typeof h === 'object' ? h : null);
}

/** 写命令键并轮询结果键（菜谱 URL 抓取经后台服务执行） */
async function runFetchCmd(url, { timeoutMs = 20000, pollMs = 1200 } = {}) {
  const nonce = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await kv.kvSet(`${core.K.cmdFetchPrefix}${nonce}`, { action: 'fetch_url', url, at: Date.now() });
  const resultKey = `${core.K.resultPrefix}${nonce}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    // eslint-disable-next-line no-await-in-loop
    const r = await kv.kvGet(resultKey).catch(() => null);
    if (r && typeof r === 'object') {
      kv.kvDel(resultKey).catch(() => {});
      return r;
    }
  }
  return { ok: false, error: `等待抓取结果超时（${Math.round(timeoutMs / 1000)}s）——后台服务可能未运行` };
}

function fmtWhen(ms, now) {
  const d = Math.ceil((ms - now) / 86400000);
  if (d < 0) return `已过期 ${-d} 天`;
  if (d === 0) return '今天到期';
  return `还剩 ${d} 天`;
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'stove_overview',
    description: [
      '问灶总览：今日灶签（带理由的吃啥推荐）、临期红榜、今日计划、采购待办数、库存概数。',
      '用户问「今天吃什么/家里还有啥」时的对话入口；之后按需用 stove_suggest / stove_pantry_list / stove_shopping 深入。',
    ].join('\n'),
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const now = Date.now();
      const [settings, pantry, recipes, plan, shopping, history] = await Promise.all([
        loadSettings(), loadPantry(), loadRecipes(), loadPlan(), loadShopping(), loadHistory(),
      ]);
      const lines = [];
      const serves = core.suggestServing(recipes, pantry, history, settings, now);
      lines.push(`【今日灶签】${core.dayKey(now)}${serves.length === 0 ? '（还没有菜谱，先让用户加几个菜谱，或从 URL 导入）' : ''}`);
      serves.forEach((s, i) => {
        lines.push(`${i + 1}. ${s.recipe.name}（${s.recipe.minutes} 分钟）—— ${s.reasons.join('；')}`);
      });
      const todayPlan = plan.days[core.dayKey(now)];
      lines.push(`【今日计划】${todayPlan ? (recipes.byId[todayPlan.recipeId || '']?.name || todayPlan.note || '（空）') : '未安排'}`);
      const exp = core.expiringItems(pantry, settings.expiringDays, now);
      lines.push(`【临期红榜】（${settings.expiringDays} 天窗口）`);
      if (exp.length === 0) lines.push('  暂无临期食材');
      for (const it of exp.slice(0, 8)) {
        lines.push(`  ${core.isExpired(it, now) ? '🔴' : '🟡'} ${it.name}${it.qty != null ? ` ${it.qty}${it.unit || ''}` : ''}（${core.LOCATION_LABELS[it.location]}，${fmtWhen(it.expiresAt, now)}）`);
      }
      const undone = (shopping.items || []).filter((x) => !x.done);
      lines.push(`【采购待办】${undone.length} 项${undone.length ? `：${undone.slice(0, 6).map((x) => x.name).join('、')}${undone.length > 6 ? ' 等' : ''}` : ''}`);
      const locCount = {};
      for (const it of pantry.items) locCount[it.location] = (locCount[it.location] || 0) + 1;
      lines.push(`【库存】共 ${pantry.items.length} 种（${core.LOCATIONS.map((l) => `${core.LOCATION_LABELS[l]} ${locCount[l] || 0}`).join(' / ')}）`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'stove_pantry_list',
    description: '查食材库存。query 关键词（归一+同义匹配）、location 分区（fridge/freezer/dry/condiment/other）、expiringDays 只看 N 天内临期。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '名称关键词（可选）' },
        location: { type: 'string', enum: core.LOCATIONS, description: '只看某分区（可选）' },
        expiringDays: { type: 'number', description: '只看 N 天内临期/过期（可选）' },
      },
    },
    async call(args) {
      const pantry = await loadPantry();
      const now = Date.now();
      let items = pantry.items;
      if (args.location && core.LOCATIONS.includes(args.location)) {
        items = items.filter((x) => x.location === args.location);
      }
      if (args.query) {
        items = items.filter((x) => core.ingredientHit(args.query, x.name));
      }
      if (Number.isFinite(Number(args.expiringDays)) && args.expiringDays !== undefined && args.expiringDays !== null && args.expiringDays !== '') {
        items = items.filter((x) => core.isExpiring(x, Number(args.expiringDays), now));
      }
      if (items.length === 0) return ok('没有匹配的库存条目。');
      items = items.slice().sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity));
      const lines = items.slice(0, 60).map((it) => {
        const exp = it.expiresAt ? `，${fmtWhen(it.expiresAt, now)}` : '';
        const note = it.note ? `（${it.note}）` : '';
        return `${it.name}${it.qty != null ? ` ${it.qty}${it.unit || ''}` : ''} · ${core.LOCATION_LABELS[it.location]}${exp}${note} [${it.id}]`;
      });
      return ok(`共 ${items.length} 项：\n${lines.join('\n')}${items.length > 60 ? `\n…（仅列前 60）` : ''}`);
    },
  },
  {
    name: 'stove_pantry_add',
    description: [
      '批量入库食材。先把用户的口语（如「买了两斤排骨一把小葱」）解析为 items 再调用；',
      'expiresAt 传 YYYY-MM-DD；不确定到期日的生鲜可省略，让用户后面补。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '入库条目',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              qty: { type: 'number', description: '数量（可选）' },
              unit: { type: 'string', description: '单位：斤/个/盒/袋/g/ml…（可选）' },
              location: { type: 'string', enum: core.LOCATIONS, description: '缺省 fridge' },
              expiresAt: { type: 'string', description: 'YYYY-MM-DD（可选）' },
              note: { type: 'string', description: '备注（可选）' },
            },
            required: ['name'],
          },
        },
      },
      required: ['items'],
    },
    async call(args) {
      const list = Array.isArray(args.items) ? args.items : [];
      if (list.length === 0) return err('items 为空');
      const pantry = await loadPantry();
      const added = [];
      const errors = [];
      for (const raw of list.slice(0, 30)) {
        const r = core.normalizePantryItem(raw);
        if (r.item) {
          added.push(r.item);
          pantry.items.push(r.item);
        } else errors.push(`${(raw && raw.name) || '?'}：${r.error}`);
      }
      if (added.length === 0) return err(`全部入库失败：${errors.join('；')}`);
      await kv.kvSet(core.K.pantry, core.normalizePantry({ items: pantry.items }));
      const h = await loadHistory();
      for (const it of added) {
        h.events = core.pushHistory(h, { type: 'add', name: it.name, qty: it.qty, unit: it.unit, location: it.location }).events;
      }
      await kv.kvSet(core.K.history, h);
      return ok(`已入库 ${added.length} 项：${added.map((x) => `${x.name}${x.qty != null ? ` ${x.qty}${x.unit || ''}` : ''}（${core.LOCATION_LABELS[x.location]}）`).join('、')}${errors.length ? `；失败 ${errors.length}：${errors.join('；')}` : ''}`);
    },
  },
  {
    name: 'stove_pantry_consume',
    description: [
      '消耗食材。action: used=吃掉了 / discarded=扔掉了（过期坏掉）；names 按归一+同义匹配（可匹配多条）。',
      'qty 缺省=整份清掉；给 qty 则从第一条命中扣减。扔东西前提醒用户确认去向。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: '食材名（可口语，如「西红柿」）' },
        action: { type: 'string', enum: ['used', 'discarded'], description: '去向' },
        qty: { type: 'number', description: '扣减量（可选，缺省清整份）' },
      },
      required: ['names', 'action'],
    },
    async call(args) {
      const names = Array.isArray(args.names) ? args.names : [];
      if (names.length === 0) return err('names 为空');
      const action = args.action === 'discarded' ? 'discarded' : 'used';
      const pantry = await loadPantry();
      const h = await loadHistory();
      const done = [];
      const miss = [];
      for (const q of names) {
        const hits = (pantry.items || []).filter((it) => core.ingredientHit(q, it.name));
        if (hits.length === 0) { miss.push(q); continue; }
        const it = hits[0];
        const qty = Number.isFinite(Number(args.qty)) && args.qty !== undefined && args.qty !== null && args.qty !== '' ? Number(args.qty) : null;
        if (qty != null && it.qty != null && it.qty > qty) {
          it.qty = Math.round((it.qty - qty) * 100) / 100;
          it.updatedAt = Date.now();
          h.events = core.pushHistory(h, { type: action === 'used' ? 'consume' : 'discard', name: it.name, qty, unit: it.unit }).events;
          done.push(`${it.name}（扣 ${qty}${it.unit || ''}，剩 ${it.qty}${it.unit || ''}）`);
        } else {
          pantry.items = pantry.items.filter((x) => x.id !== it.id);
          h.events = core.pushHistory(h, { type: action === 'used' ? 'consume' : 'discard', name: it.name, qty: it.qty, unit: it.unit }).events;
          done.push(`${it.name}（清整份）`);
        }
      }
      await kv.kvSet(core.K.pantry, core.normalizePantry({ items: pantry.items }));
      await kv.kvSet(core.K.history, h);
      return ok(`${action === 'used' ? '吃掉' : '扔掉'}：${done.join('、') || '（无）'}${miss.length ? `；未找到：${miss.join('、')}` : ''}`);
    },
  },
  {
    name: 'stove_recipe_list',
    description: '菜谱检索：query 名称关键词、tag 标签（如 快手/下饭/素食）、maxMinutes 只看 N 分钟内。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        tag: { type: 'string' },
        maxMinutes: { type: 'number' },
      },
    },
    async call(args) {
      const recipes = await loadRecipes();
      let ids = recipes.order.slice().reverse(); // 新在前
      if (args.query) {
        const q = core.normName(args.query);
        ids = ids.filter((id) => {
          const r = recipes.byId[id];
          return r && (core.normName(r.name).includes(q) || (r.ingredients || []).some((x) => x.norm.includes(q)));
        });
      }
      if (args.tag) ids = ids.filter((id) => recipes.byId[id].tags.some((t) => t.includes(String(args.tag))));
      if (Number.isFinite(Number(args.maxMinutes)) && args.maxMinutes != null && args.maxMinutes !== '') {
        ids = ids.filter((id) => recipes.byId[id].minutes <= Number(args.maxMinutes));
      }
      if (ids.length === 0) return ok('没有匹配的菜谱。');
      const lines = ids.slice(0, 40).map((id) => {
        const r = recipes.byId[id];
        return `${r.name}（${r.minutes} 分钟${r.tags.length ? `，${r.tags.join('/')}` : ''}，${r.ingredients.length} 种用料）[${id}]`;
      });
      return ok(`共 ${ids.length} 道菜谱：\n${lines.join('\n')}${ids.length > 40 ? '\n…（仅列前 40）' : ''}`);
    },
  },
  {
    name: 'stove_recipe_import',
    description: [
      '从 URL 导入菜谱第一步：服务端抓取页面正文（后台服务执行，绕开浏览器跨域；仅公网 http/https）。',
      '拿到 {title,text} 后由你抽取结构化菜谱，再调 stove_recipe_save 落库；不要把原文整段贴给用户。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: '菜谱页 URL' } },
      required: ['url'],
    },
    async call(args) {
      const url = String(args.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return err('需要 http(s) URL');
      const r = await runFetchCmd(url);
      if (!r.ok) return err(`抓取失败：${r.error}`);
      const p = r.payload || {};
      return ok(`标题：${p.title || '（无）'}\nURL：${p.url}\n正文（已去脚本/样式，截断至 8KB）：\n${p.text}`);
    },
  },
  {
    name: 'stove_recipe_save',
    description: [
      '保存结构化菜谱（导入抽取后或用户口述）。ingredients 每项 {name, qty?, unit?}，',
      '名称会用内置同义词表归一（番茄=西红柿）；同 id 再存即更新（先 stove_recipe_remove 再 save 等效）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        minutes: { type: 'number', description: '制作分钟数，缺省 30' },
        tags: { type: 'array', items: { type: 'string' }, description: '如 ["快手","下饭"]' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              qty: { type: 'number' },
              unit: { type: 'string' },
            },
            required: ['name'],
          },
        },
        steps: { type: 'array', items: { type: 'string' } },
        url: { type: 'string', description: '来源 URL（可选）' },
        source: { type: 'string', enum: ['manual', 'import', 'ai'], description: '缺省 ai' },
      },
      required: ['name', 'ingredients', 'steps'],
    },
    async call(args) {
      const r = core.normalizeRecipe({ ...args, source: args.source || 'ai' });
      if (r.error) return err(`菜谱不合法：${r.error}`);
      const book = await loadRecipes();
      // 同名同源覆盖：归一名一致即视为同一道菜（避免重复导入堆积）
      const norm = core.normName(r.recipe.name);
      const dupId = book.order.find((id) => core.normName(book.byId[id].name) === norm);
      if (dupId) r.recipe.id = dupId;
      book.byId[r.recipe.id] = r.recipe;
      if (!book.order.includes(r.recipe.id)) book.order.push(r.recipe.id);
      const clean = core.normalizeRecipeBook(book);
      await kv.kvSet(core.K.recipes, clean);
      return ok(`已保存「${r.recipe.name}」：${r.recipe.ingredients.length} 种用料、${r.recipe.steps.length} 步、约 ${r.recipe.minutes} 分钟${dupId ? '（覆盖同名旧谱）' : ''} [${r.recipe.id}]`);
    },
  },
  {
    name: 'stove_recipe_remove',
    description: '删除菜谱（连计划里的引用一起清掉）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    async call(args) {
      const book = await loadRecipes();
      if (!book.byId[args.id]) return err(`菜谱不存在：${args.id}`);
      const name = book.byId[args.id].name;
      delete book.byId[args.id];
      book.order = book.order.filter((x) => x !== args.id);
      await kv.kvSet(core.K.recipes, core.normalizeRecipeBook(book));
      const plan = await loadPlan();
      let cleared = 0;
      for (const k of Object.keys(plan.days)) {
        if (plan.days[k].recipeId === args.id) {
          plan.days[k].recipeId = null;
          if (!plan.days[k].note) delete plan.days[k];
          cleared++;
        }
      }
      if (cleared > 0) await kv.kvSet(core.K.plan, plan);
      return ok(`已删除「${name}」，并清理计划引用 ${cleared} 处。`);
    },
  },
  {
    name: 'stove_plan',
    description: [
      '本周计划。action: get（缺省，看今天起 7 天）/ set（day+recipeId 或 note）/ clear（day）/ cooked（day+recipeId，',
      '标记「做了这道菜」——写历史，推荐引擎近 7 天降权同菜）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'clear', 'cooked'] },
        day: { type: 'string', description: 'YYYY-MM-DD（缺省今天）' },
        recipeId: { type: 'string', description: 'set 时：菜谱 id（与 note 二选一）' },
        note: { type: 'string', description: 'set 时：自由备注（如「外卖」）' },
      },
    },
    async call(args) {
      const action = args.action || 'get';
      const day = core.isValidDayKey(args.day) ? args.day : core.dayKey(Date.now());
      if (action === 'get') {
        const plan = await loadPlan();
        const recipes = await loadRecipes();
        const today = core.dayKey(Date.now());
        const lines = [];
        for (let i = 0; i < 7; i++) {
          const d = core.dayShift(today, i);
          const e = plan.days[d];
          const label = e ? (recipes.byId[e.recipeId || '']?.name || e.note || '（空）') : '—';
          lines.push(`${d}（${'日一二三四五六'[new Date(`${d}T00:00:00`).getDay()]}）：${label}`);
        }
        return ok(`本周计划：\n${lines.join('\n')}`);
      }
      const plan = await loadPlan();
      if (action === 'clear') {
        if (!plan.days[day]) return ok(`${day} 本来就没有计划。`);
        delete plan.days[day];
        await kv.kvSet(core.K.plan, plan);
        return ok(`已清掉 ${day} 的计划。`);
      }
      if (action === 'cooked') {
        const recipeId = args.recipeId || (plan.days[day] && plan.days[day].recipeId);
        if (!recipeId) return err('需要 recipeId（或该日计划里已选菜谱）');
        const recipes = await loadRecipes();
        const r = recipes.byId[recipeId];
        if (!r) return err(`菜谱不存在：${recipeId}`);
        const h = await loadHistory();
        await kv.kvSet(core.K.history, core.pushHistory(h, { type: 'cook', name: r.name, recipeId }));
        return ok(`记好了：${day} 做了「${r.name}」。近 7 天灶签会少推它。`);
      }
      // set
      const recipes = await loadRecipes();
      if (args.recipeId) {
        if (!recipes.byId[args.recipeId]) return err(`菜谱不存在：${args.recipeId}`);
        plan.days[day] = { recipeId: args.recipeId, note: null };
      } else if (args.note) {
        plan.days[day] = { recipeId: null, note: String(args.note).slice(0, 60) };
      } else {
        return err('set 需要 recipeId 或 note');
      }
      await kv.kvSet(core.K.plan, core.normalizePlan(plan));
      const label = recipes.byId[(plan.days[day].recipeId) || '']?.name || plan.days[day].note;
      return ok(`已安排 ${day}：${label}。`);
    },
  },
  {
    name: 'stove_suggest',
    description: '灶签推荐：基于库存（临期加分）、菜谱缺料（扣分）、近 7 天做过（降权）打分，输出带理由的 top N。maxMinutes/preferTag 可加约束。',
    inputSchema: {
      type: 'object',
      properties: {
        maxMinutes: { type: 'number', description: '只要 N 分钟内的（可选）' },
        preferTag: { type: 'string', description: '优先标签（可选）' },
      },
    },
    async call(args) {
      const [settings, pantry, recipes, history] = await Promise.all([
        loadSettings(), loadPantry(), loadRecipes(), loadHistory(),
      ]);
      let pool = recipes;
      if ((args.maxMinutes != null && args.maxMinutes !== '') || args.preferTag) {
        const byId = {};
        const order = [];
        for (const id of recipes.order) {
          const r = recipes.byId[id];
          if (args.maxMinutes != null && args.maxMinutes !== '' && r.minutes > Number(args.maxMinutes)) continue;
          if (args.preferTag && !r.tags.some((t) => t.includes(String(args.preferTag)))) continue;
          byId[id] = r;
          order.push(id);
        }
        pool = { order, byId };
      }
      const serves = core.suggestServing(pool, pantry, history, settings, Date.now());
      if (serves.length === 0) return ok('推不出来——菜谱库可能太空或缺料太狠。先让用户加几个菜谱（或 URL 导入）。');
      const lines = serves.map((s, i) => `${i + 1}. ${s.recipe.name}（${s.recipe.minutes} 分钟）[${s.recipe.id}]\n   理由：${s.reasons.join('；')}\n   缺料：${s.missing.length ? s.missing.join('、') : '无'}`);
      return ok(`今日灶签（top ${serves.length}）：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'stove_shopping',
    description: [
      '采购清单。action: list / add（items[]）/ toggle（name，勾/反勾）/ remove（name）/ clear_done /',
      'fill_from_plan（按未来 7 天计划缺料一键补齐，与在库比对去重）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'toggle', 'remove', 'clear_done', 'fill_from_plan'] },
        items: {
          type: 'array',
          description: 'add 时：{name, qty?, unit?}',
          items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' } }, required: ['name'] },
        },
        name: { type: 'string', description: 'toggle/remove 时：条目名' },
      },
      required: ['action'],
    },
    async call(args) {
      const action = args.action || 'list';
      const list = await loadShopping();
      if (action === 'list') {
        const undone = list.items.filter((x) => !x.done);
        const doneN = list.items.length - undone.length;
        if (list.items.length === 0) return ok('采购清单是空的。可以说「按本周计划补齐」。');
        const byCat = {};
        for (const x of undone) (byCat[x.category] = byCat[x.category] || []).push(x);
        const lines = core.CATEGORIES.filter((c) => byCat[c]).map((c) => `【${core.CATEGORY_LABELS[c]}】${byCat[c].map((x) => `${x.name}${x.qty != null ? `×${x.qty}${x.unit || ''}` : ''}`).join('、')}`);
        return ok(`待买 ${undone.length} 项${doneN ? `，已勾 ${doneN}` : ''}：\n${lines.join('\n')}`);
      }
      if (action === 'add') {
        const arr = Array.isArray(args.items) ? args.items : [];
        if (arr.length === 0) return err('items 为空');
        const added = [];
        for (const raw of arr.slice(0, 30)) {
          // 与未完成项归一去重（mergeShopping 同规则）
          const norm = core.normName(raw && raw.name);
          if (norm && list.items.some((x) => !x.done && x.norm === norm)) continue;
          const r = core.normalizeShoppingItem(raw);
          if (r.item) { list.items.push(r.item); added.push(r.item); }
        }
        await kv.kvSet(core.K.shopping, core.normalizeShopping({ items: list.items }));
        return ok(added.length ? `已加入：${added.map((x) => x.name).join('、')}` : '清单里已有这些（未重复添加）。');
      }
      if (action === 'toggle' || action === 'remove') {
        const norm = core.normName(args.name);
        const it = list.items.find((x) => x.norm === norm || x.name === args.name);
        if (!it) return err(`清单里没有：${args.name}`);
        if (action === 'toggle') {
          it.done = !it.done;
          await kv.kvSet(core.K.shopping, core.normalizeShopping({ items: list.items }));
          return ok(`${it.name} → ${it.done ? '已勾（买到了）' : '待买'}`);
        }
        list.items = list.items.filter((x) => x.id !== it.id);
        await kv.kvSet(core.K.shopping, core.normalizeShopping({ items: list.items }));
        return ok(`已从清单移除：${it.name}`);
      }
      if (action === 'clear_done') {
        const before = list.items.length;
        list.items = list.items.filter((x) => !x.done);
        await kv.kvSet(core.K.shopping, core.normalizeShopping({ items: list.items }));
        return ok(`清掉已勾 ${before - list.items.length} 项，剩 ${list.items.length} 项待买。`);
      }
      // fill_from_plan
      const [plan, recipes, pantry] = await Promise.all([loadPlan(), loadRecipes(), loadPantry()]);
      const agg = core.fillFromPlan(plan, recipes, pantry, Date.now());
      const added = core.mergeShopping(list, agg.items, Date.now());
      await kv.kvSet(core.K.shopping, core.normalizeShopping({ items: [...list.items, ...added] }));
      return ok(`按未来 7 天计划补齐：新增 ${added.length} 项${added.length ? `：${added.map((x) => x.name).join('、')}` : ''}${agg.skipped.length ? `；跳过 ${agg.skipped.length} 处（菜谱不存在）` : ''}`);
    },
  },
  {
    name: 'stove_stats',
    description: '消耗/浪费透视：近 N 天（缺省 30）吃掉 vs 扔掉的笔数与浪费率、最常扔的食材、近 12 周趋势。',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: '1..365，缺省 30' } },
    },
    async call(args) {
      const h = await loadHistory();
      const days = Math.min(365, Math.max(1, Number(args.days) || 30));
      const s = core.wasteStats(h, days, Date.now());
      const trend = s.weeks.map((w) => `${w.key.slice(5)} ${'█'.repeat(Math.min(10, w.used))}${w.used ? '' : '·'}${w.discarded ? `（扔${w.discarded}）` : ''}`).join('\n');
      return ok([
        `近 ${days} 天：吃掉 ${s.used} 笔，扔掉 ${s.discarded} 笔，浪费率 ${s.wasteRate}%。`,
        s.topDiscarded.length ? `最常扔：${s.topDiscarded.map((x) => `${x.name}×${x.count}`).join('、')}` : '暂无丢弃记录。',
        '近 12 周（█=吃掉笔数）：',
        trend,
      ].join('\n'));
    },
  },
];

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── JSON-RPC 2.0 over stdio（stdout 仅协议数据，日志走 stderr）─────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) }); return; }
    try {
      send({ jsonrpc: '2.0', id: msg.id, result: await tool.call(args) });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
