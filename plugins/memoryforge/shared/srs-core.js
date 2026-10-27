'use strict';
/**
 * srs-core.js —— 记忆熔炉共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、卡片归一化、SM-2 间隔重复调度、每日队列（限额）、统计/留存/连击、
 * 7 天预报、检索、导入导出。所有"计算"必须放这里，两侧只做 IO
 * （cap.kv 读写），防止口径漂移（同 pocket-ledger 的 ledger-core 模式）。
 *
 * 数据契约（cap.kv `memoryforge.*` 键空间，权威描述见 README）：
 *   memoryforge.settings     → Settings（每日新卡/复习上限）
 *   memoryforge.deck.<id>    → Deck { id, name, createdAt }
 *   memoryforge.card.<id>    → Card（含 SM-2 调度状态与 history 窗口）
 *   memoryforge.meta         → { streak: { count, lastDay, best } }
 *
 * 设计要点：
 *   - intervalMin 统一用"分钟"作单位（学习步 10 分钟 → 毕业后按天放大），
 *     避免分钟/天双单位换算出错。
 *   - "今日已复习/已学新卡/留存率"全部从 card.history 派生（窗口 200 条），
 *     不设独立计数器，双端并发评分天然幂等；仅 streak（连击）落 meta。
 *   - gradeCard 是纯函数：输入卡片 + 评分 + 时间，输出新卡片对象，不碰 IO。
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  PREFIX: 'memoryforge.',
  settings: 'memoryforge.settings',
  deck: (id) => `memoryforge.deck.${id}`,
  deckPrefix: 'memoryforge.deck.',
  card: (id) => `memoryforge.card.${id}`,
  cardPrefix: 'memoryforge.card.',
  meta: 'memoryforge.meta',
};

const DEFAULT_DECK_ID = 'default';
const DEFAULT_DECK_NAME = '默认';

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  /** 每日新卡上限（0 = 不学新卡） */
  dailyNewLimit: 20,
  /** 每日复习上限（0 = 不设上限，按到期全出） */
  dailyReviewLimit: 200,
};

/** 学习步（分钟）：新卡/重学卡经过这些步后毕业进入复习态 */
const LEARNING_STEPS = [10, 1440];
/** 复习间隔上限（分钟）≈ 365 天 */
const MAX_INTERVAL_MIN = 365 * 24 * 60;
/** 单卡 history 窗口上限（派生今日计数/留存率的数据源） */
const HISTORY_CAP = 200;
/** 最低 ease（Anki 惯例 1.3） */
const MIN_EASE = 1.3;

const GRADE_LABELS = ['重来', '困难', '良好', '轻松'];

// ── 时间（本地时区）────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

/** epoch ms → 本地日期 YYYY-MM-DD */
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 分钟数 → 人话（"10 分钟""1 天""3.5 天"） */
function fmtIvl(min) {
  if (!Number.isFinite(min) || min <= 0) return '现在';
  if (min < 60) return `${Math.round(min)} 分钟`;
  if (min < 1440) return `${Math.round(min / 60 * 10) / 10} 小时`;
  const days = min / 1440;
  return days < 10 ? `${Math.round(days * 10) / 10} 天` : `${Math.round(days)} 天`;
}

/** epoch ms → 'MM-DD'（图表轴标签） */
function shortDay(ts) {
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── 卡片归一化 ─────────────────────────────────────────────────────────────
function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return 'c' + t.toString(36) + rand;
}

function clipTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  return [...new Set(rawTags.map((t) => String(t || '').trim().slice(0, 20)).filter(Boolean))].slice(0, 8);
}

/**
 * 归一化一张卡；非法返回 { error }，合法返回 { card }。
 * raw: { id?, deckId, front, back, tags?, source?, now? }
 * 新卡 status='new'，due=now（进队列时按每日新卡限额放行，与到期时间无关）。
 */
function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少卡片数据' };
  const front = String(raw.front || '').trim();
  const back = String(raw.back || '').trim();
  if (!front) return { error: 'front（问题面）不能为空' };
  if (!back) return { error: 'back（答案面）不能为空' };
  if (front.length > 500) return { error: `front 过长（${front.length}/500），一卡一原子知识点` };
  if (back.length > 2000) return { error: `back 过长（${back.length}/2000），答案要精炼` };
  const deckId = String(raw.deckId || DEFAULT_DECK_ID).slice(0, 60);
  const now = Number.isFinite(Number(raw.now)) && Number(raw.now) > 0 ? Number(raw.now) : Date.now();
  const card = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : makeId(now),
    deckId,
    front,
    back,
    tags: clipTags(raw.tags),
    source: String(raw.source || '').slice(0, 100),
    status: 'new',
    learningStep: 0,
    /** 调度间隔，单位分钟 */
    intervalMin: 0,
    due: now,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    createdAt: now,
    updatedAt: now,
    history: [],
  };
  return { card };
}

/** 更新 front/back/tags（保留调度状态）；非法返回 { error } */
function editCard(card, patch) {
  if (!card || typeof card !== 'object') return { error: '卡片不存在' };
  const next = { ...card };
  if (patch.front !== undefined) {
    const front = String(patch.front || '').trim();
    if (!front) return { error: 'front 不能为空' };
    if (front.length > 500) return { error: `front 过长（${front.length}/500）` };
    next.front = front;
  }
  if (patch.back !== undefined) {
    const back = String(patch.back || '').trim();
    if (!back) return { error: 'back 不能为空' };
    if (back.length > 2000) return { error: `back 过长（${back.length}/2000）` };
    next.back = back;
  }
  if (patch.tags !== undefined) next.tags = clipTags(patch.tags);
  next.updatedAt = Date.now();
  return { card: next };
}

function pruneHistory(hist) {
  const arr = Array.isArray(hist) ? hist.filter((h) => h && Number.isFinite(h.t)) : [];
  return arr.length > HISTORY_CAP ? arr.slice(arr.length - HISTORY_CAP) : arr;
}

// ── SM-2 调度（纯函数）─────────────────────────────────────────────────────
const clampIvl = (min) => Math.min(MAX_INTERVAL_MIN, Math.max(1, Math.round(min)));
const clampEase = (e) => Math.max(MIN_EASE, Math.round(e * 1000) / 1000);

/**
 * 对一张卡评分（0=重来 1=困难 2=良好 3=轻松），返回调度后的新卡片对象。
 * 规则（简化 SM-2 + Anki 学习步）：
 *   重来：进/回学习步 0（10 分钟后再见）；复习卡重来记 lapse、ease-0.20
 *   困难：学习卡重复当前步；复习卡间隔 ×1.2、ease-0.15
 *   良好：学习卡前进一步（走完毕业，间隔 1 天）；复习卡间隔 ×ease
 *   轻松：学习卡直接毕业（4 天）；复习卡间隔 ×ease×1.3、ease+0.15
 */
function gradeCard(card, grade, now) {
  if (!card || typeof card !== 'object') return { error: '卡片不存在' };
  const g = Math.round(Number(grade));
  if (!(g >= 0 && g <= 3)) return { error: '评分必须是 0-3（0=重来 1=困难 2=良好 3=轻松）' };
  const t = Number.isFinite(Number(now)) && Number(now) > 0 ? Number(now) : Date.now();
  const c = {
    ...card,
    tags: clipTags(card.tags),
    history: pruneHistory(card.history),
    learningStep: Number(card.learningStep) || 0,
    intervalMin: Number(card.intervalMin) || 0,
    ease: Number.isFinite(Number(card.ease)) ? Number(card.ease) : 2.5,
  };
  let ease = c.ease;
  let step = c.learningStep;
  let ivl = c.intervalMin;
  let status = c.status === 'new' || c.status === 'learning' ? (c.reps > 0 ? 'learning' : 'new') : 'review';

  if (g === 0) {
    if (status === 'review') c.lapses = (Number(c.lapses) || 0) + 1;
    ease = clampEase(ease - 0.2);
    status = 'learning';
    step = 0;
    ivl = LEARNING_STEPS[0];
  } else if (g === 1) {
    if (status === 'review') {
      ease = clampEase(ease - 0.15);
      ivl = clampIvl(ivl * 1.2);
    } else {
      status = 'learning';
      ivl = LEARNING_STEPS[Math.min(step, LEARNING_STEPS.length - 1)];
    }
  } else if (g === 2) {
    if (status === 'review') {
      ivl = clampIvl(ivl * ease);
    } else {
      step += 1;
      if (step >= LEARNING_STEPS.length) {
        status = 'review';
        step = 0;
        ivl = LEARNING_STEPS[LEARNING_STEPS.length - 1];
      } else {
        status = 'learning';
        ivl = LEARNING_STEPS[step];
      }
    }
  } else {
    // easy：复习卡先用当前 ease 放大间隔再提升 ease（本次间隔不吃本次提升）；
    // 学习卡直接毕业（4 天）
    if (status === 'review') {
      ivl = clampIvl(ivl * ease * 1.3);
      ease = clampEase(ease + 0.15);
    } else {
      ease = clampEase(ease + 0.15);
      status = 'review';
      step = 0;
      ivl = 4 * 1440;
    }
  }

  c.ease = ease;
  c.learningStep = step;
  c.intervalMin = ivl;
  c.status = status;
  c.reps = (Number(c.reps) || 0) + 1;
  c.due = t + ivl * 60000;
  c.updatedAt = t;
  c.history = [...c.history, { t, g, iv: ivl }].slice(-HISTORY_CAP);
  return { card: c };
}

/** 是否到期应出现在复习队列（新卡不按 due，按每日限额进队列） */
function isDue(card, now) {
  if (!card || card.status === 'suspended') return false;
  if (card.status === 'new') return false;
  return (Number(card.due) || 0) <= now;
}

// ── 今日计数（从 history 派生，双端幂等）──────────────────────────────────
/** 今日已复习/答对/新学 + 今日日期键 */
function countToday(cards, now) {
  const today = dayKeyOf(now);
  let reviews = 0;
  let correct = 0;
  let newCards = 0;
  for (const c of cards || []) {
    if (!c || typeof c !== 'object') continue;
    if (dayKeyOf(c.createdAt) === today) newCards += 1;
    for (const h of pruneHistory(c.history)) {
      if (dayKeyOf(h.t) === today) {
        reviews += 1;
        if (h.g >= 1) correct += 1;
      }
    }
  }
  return { today, reviews, correct, newCards };
}

// ── 每日队列 ───────────────────────────────────────────────────────────────
/**
 * 计算当前应学的队列：到期卡（due 升序）在前，新卡（创建升序）在后。
 * 受 settings 每日限额约束（今日已复习/已学新卡从 history 派生）。
 * 返回 { queue, today, reviewRemaining, newRemaining }。
 */
function computeQueue(cards, settings, now) {
  const s = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) };
  const today = countToday(cards, now);
  const reviewLimit = Number.isFinite(Number(s.dailyReviewLimit)) ? Number(s.dailyReviewLimit) : DEFAULT_SETTINGS.dailyReviewLimit;
  const newLimit = Number.isFinite(Number(s.dailyNewLimit)) ? Number(s.dailyNewLimit) : DEFAULT_SETTINGS.dailyNewLimit;

  const due = [];
  const fresh = [];
  for (const c of cards || []) {
    if (!c || typeof c !== 'object') continue;
    if (c.status === 'suspended') continue;
    if (isDue(c, now)) due.push(c);
    else if (c.status === 'new') fresh.push(c);
  }
  due.sort((a, b) => (Number(a.due) || 0) - (Number(b.due) || 0));
  fresh.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

  const reviewRemaining = reviewLimit > 0 ? Math.max(0, reviewLimit - today.reviews) : due.length;
  const newRemaining = newLimit > 0 ? Math.max(0, newLimit - today.newCards) : 0;
  const queue = [...due.slice(0, reviewRemaining), ...fresh.slice(0, newRemaining)];
  return { queue, today, reviewRemaining, newRemaining, dueTotal: due.length, newTotal: fresh.length };
}

// ── 连击（唯一落 meta 的状态）──────────────────────────────────────────────
/** 评分后更新连击；同日多次评分幂等 */
function updateStreak(meta, now) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const st = m.streak && typeof m.streak === 'object' ? m.streak : { count: 0, lastDay: '', best: 0 };
  const today = dayKeyOf(now);
  if (st.lastDay === today) return { streak: st, changed: false };
  const yesterday = dayKeyOf(now - 86400000);
  const count = st.lastDay === yesterday ? (Number(st.count) || 0) + 1 : 1;
  const next = { count, lastDay: today, best: Math.max(Number(st.best) || 0, count) };
  return { streak: next, changed: true };
}

/** 展示用连击：meta 里是今天则用之，否则判断昨天（今天还没学时不断签） */
function displayStreak(meta, now) {
  const st = meta && meta.streak ? meta.streak : { count: 0, lastDay: '' };
  const today = dayKeyOf(now);
  if (st.lastDay === today) return Number(st.count) || 0;
  const yesterday = dayKeyOf(now - 86400000);
  if (st.lastDay === yesterday) return Number(st.count) || 0;
  return 0;
}

// ── 统计 ───────────────────────────────────────────────────────────────────
/**
 * 全局统计。
 * @param cards 全部卡片
 * @param decks 全部牌组（含名称）
 * @param meta  memoryforge.meta
 * @param now   epoch ms
 */
function computeStats(cards, decks, meta, now) {
  const list = (cards || []).filter((c) => c && typeof c === 'object');
  const byStatus = { new: 0, learning: 0, review: 0, suspended: 0 };
  for (const c of list) byStatus[c.status] = (byStatus[c.status] || 0) + 1;

  const today = countToday(list, now);
  const dueNow = list.filter((c) => isDue(c, now)).length;

  // 30 天留存率（history 窗口内，g>=1 记为答对）
  const since = now - 30 * 86400000;
  let rTotal = 0;
  let rCorrect = 0;
  for (const c of list) {
    for (const h of pruneHistory(c.history)) {
      if (h.t >= since) {
        rTotal += 1;
        if (h.g >= 1) rCorrect += 1;
      }
    }
  }
  const retention30 = rTotal > 0 ? Math.round((rCorrect / rTotal) * 100) : null;

  // 7 天到期预报（含今天）
  const forecast = [];
  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const from = dayStart.getTime() + d * 86400000;
    const to = from + 86400000;
    let count = 0;
    for (const c of list) {
      if (c.status === 'suspended' || c.status === 'new') continue;
      const due = Number(c.due) || 0;
      if (d === 0 ? due <= to : due >= from && due < to) count += 1;
    }
    forecast.push({ date: shortDay(from), count });
  }

  // 30 天复习活动（按天聚合，供柱状图）
  const activityMap = new Map();
  for (let d = 29; d >= 0; d--) activityMap.set(dayKeyOf(now - d * 86400000), 0);
  for (const c of list) {
    for (const h of pruneHistory(c.history)) {
      const k = dayKeyOf(h.t);
      if (activityMap.has(k)) activityMap.set(k, activityMap.get(k) + 1);
    }
  }
  const activity30 = [...activityMap.entries()].map(([date, count]) => ({ date, count }));

  // 分牌组
  const deckList = (decks || []).filter((d) => d && typeof d === 'object');
  const byDeck = deckList.map((d) => {
    const dc = list.filter((c) => c.deckId === d.id);
    return {
      id: d.id,
      name: d.name,
      total: dc.length,
      due: dc.filter((c) => isDue(c, now)).length,
      fresh: dc.filter((c) => c.status === 'new').length,
      mature: dc.filter((c) => c.status === 'review' && (Number(c.intervalMin) || 0) >= 21 * 1440).length,
    };
  });
  // 孤儿卡（deck 记录丢失）单独归入「未归属」，避免凭空消失（面板删牌组只允许删空牌组，
  // 正常不会出现；出现时如实展示而不是把账算到默认牌组头上）
  const knownDeckIds = new Set(deckList.map((d) => d.id));
  const orphanCards = list.filter((c) => !knownDeckIds.has(c.deckId));
  if (orphanCards.length) {
    byDeck.push({
      id: '__orphan', name: '未归属',
      total: orphanCards.length,
      due: orphanCards.filter((c) => isDue(c, now)).length,
      fresh: orphanCards.filter((c) => c.status === 'new').length,
      mature: 0,
    });
  }

  return {
    total: list.length,
    byStatus,
    dueNow,
    today,
    retention30,
    streak: displayStreak(meta, now),
    bestStreak: (meta && meta.streak && Number(meta.streak.best)) || 0,
    forecast,
    activity30,
    byDeck,
  };
}

// ── 检索 ───────────────────────────────────────────────────────────────────
/** 关键词（front/back/tags/来源）+ 牌组/标签/状态过滤 */
function searchCards(cards, { query, deckId, tag, status } = {}) {
  const kw = query ? String(query).toLowerCase() : '';
  return (cards || []).filter((c) => {
    if (!c || typeof c !== 'object') return false;
    if (deckId && c.deckId !== deckId) return false;
    if (status && c.status !== status) return false;
    if (tag && !(c.tags || []).includes(tag)) return false;
    if (kw) {
      const hay = `${c.front}\n${c.back}\n${(c.tags || []).join(' ')}\n${c.source || ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ── 导入导出 ───────────────────────────────────────────────────────────────
function toCsv(cards, decks) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const deckName = (id) => {
    const d = (decks || []).find((x) => x && x.id === id);
    return d ? d.name : id;
  };
  const head = '牌组,问题,答案,标签,状态,间隔,到期,创建时间,来源,ID';
  const statusLabel = { new: '新卡', learning: '学习中', review: '复习中', suspended: '已暂停' };
  const rows = (cards || [])
    .slice()
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))
    .map((c) => [
      deckName(c.deckId), c.front, c.back, (c.tags || []).join(' '),
      statusLabel[c.status] || c.status,
      fmtIvl(c.intervalMin),
      c.status === 'new' ? '-' : new Date(Number(c.due) || 0).toLocaleString('zh-CN', { hour12: false }),
      new Date(Number(c.createdAt) || 0).toLocaleString('zh-CN', { hour12: false }),
      c.source || '', c.id,
    ].map(esc).join(','));
  return [head, ...rows].join('\n');
}

/** 全量导出结构（JSON） */
function toJsonExport(cards, decks, settings, meta) {
  return {
    app: 'memoryforge',
    schemaVersion: 1,
    exportedAt: Date.now(),
    settings: settings || DEFAULT_SETTINGS,
    meta: meta || {},
    decks: decks || [],
    cards: cards || [],
  };
}

/**
 * 解析导入 JSON（toJsonExport 的产物或 {cards:[{front,back,tags?,deckName?}]}）。
 * 返回 { cards: raw[], settings? }，不落库（IO 归调用方）。
 */
function parseImportJson(text) {
  let data;
  try {
    data = JSON.parse(String(text || ''));
  } catch (_) {
    return { error: '不是合法 JSON' };
  }
  const rawCards = Array.isArray(data) ? data : Array.isArray(data.cards) ? data.cards : null;
  if (!rawCards) return { error: 'JSON 里找不到 cards 数组' };
  const deckNames = new Map();
  if (Array.isArray(data.decks)) {
    for (const d of data.decks) if (d && d.id && d.name) deckNames.set(d.id, d.name);
  }
  const cards = [];
  for (const rc of rawCards) {
    if (!rc || typeof rc !== 'object') continue;
    const deckName = rc.deckName || deckNames.get(rc.deckId) || '';
    cards.push({
      id: rc.id, front: rc.front, back: rc.back, tags: rc.tags,
      deckName, source: rc.source || 'import',
    });
  }
  if (!cards.length) return { error: 'cards 数组为空' };
  return { cards, settings: data.settings && typeof data.settings === 'object' ? data.settings : undefined };
}

module.exports = {
  K, DEFAULT_DECK_ID, DEFAULT_DECK_NAME, DEFAULT_SETTINGS,
  LEARNING_STEPS, MAX_INTERVAL_MIN, HISTORY_CAP, MIN_EASE, GRADE_LABELS,
  dayKeyOf, fmtIvl, shortDay, makeId,
  normalizeCard, editCard, gradeCard, isDue,
  countToday, computeQueue, updateStreak, displayStreak,
  computeStats, searchCards, toCsv, toJsonExport, parseImportJson,
};
