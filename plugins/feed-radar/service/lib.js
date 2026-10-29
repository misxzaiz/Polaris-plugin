'use strict';
/**
 * lib.js —— RSS 订阅纯逻辑层（零依赖，可离线单测）
 *
 * 职责：
 *   - 订阅源规范化（normalizeFeed：URL 校验/长度裁剪/字段兜底，与面板/MCP 同规则）
 *   - 文章规范化 + 稳定 id（articleId：feed 的 guid/link 哈希——重复抓取去重的基石）
 *   - 合并计划（planMerge：新条目提取 + 旧条目回填，不产生重复键）
 *   - 保留策略（planRetention：天数上限 + 单源条数上限，星标永留，纯函数可测）
 *   - 内容保留策略（planContentRetention：正文按小时保留，星标放长）
 *   - 设置规范化（normalizeSettings：越界回落默认）
 *   - SSRF 守卫（isFetchableUrl：拒绝内网/环回——feed 的文章链接是第三方可写数据，
 *     不得让"拉一篇正文"变成对 localhost/云元数据端口的探测）
 *   - pubDate 解析（容错 RFC822/ISO，未来时间钳制）
 */

const { sha256Hex } = require('../shared/sha256');

const TITLE_CAP = 300;
const LINK_CAP = 800;
const EXCERPT_CAP = 1600;
const AUTHOR_CAP = 60;
const TEXT_CAP = 60000;      // 提取正文存储上限（radar.content.<aid>.text）
const CATEGORY_CAP = 24;

// ── SSRF 守卫 ──────────────────────────────────────────────────────────────
/**
 * 服务端 fetch 前的地址守卫：只放行公网 http(s)。
 * 拒绝：非 http(s)、环回/内网/链路本地地址。feed 与文章链接属于"任意端都可写"
 * 的第三方数据，必须先过这道门再进原生 fetch。
 */
function isFetchableUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h === '::1' || h === '[::1]' || h === '0.0.0.0') return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const oct = v4.slice(1).map((x) => parseInt(x, 10));
    if (oct.some((x) => x > 255)) return false;
    const [a, b] = oct;
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false; // 链路本地/云元数据
  }
  return true;
}

// ── 实体解码 ───────────────────────────────────────────────────────────────
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    // &amp; 必须最后解：避免 &amp;lt; 被二次解码成 <
    .replace(/&amp;/gi, '&');
}

/** 字符串裁剪（trim + decode + cap） */
function clip(s, cap) {
  return decodeEntities(String(s || '')).trim().slice(0, cap);
}

// ── pubDate 解析 ───────────────────────────────────────────────────────────
/**
 * RFC822（RSS）/ ISO8601（Atom）都交给 Date 解析；解析不了的返回 0。
 * 未来时间 > 7 天视为脏数据，钳制到 fetch 时的 now（由调用方传入）。
 */
function parseFeedDate(s, now) {
  if (!s) return 0;
  const t = new Date(String(s).trim());
  if (!Number.isFinite(t.getTime()) || t.getTime() <= 0) return 0;
  const ts = t.getTime();
  if (now && ts > now + 7 * 86400000) return now;
  return Math.floor(ts);
}

// ── 订阅源规格化 ───────────────────────────────────────────────────────────
/** 稳定的订阅源 id：同一 URL 永远映射同一 id（重复添加天然幂等） */
function feedIdFor(url) {
  return 'f' + sha256Hex(String(url).trim().toLowerCase()).slice(0, 10);
}

/**
 * 面板/MCP 写入的原始载荷 → 干净的订阅源定义。
 * 已有定义（existing）时保留运行时字段（状态/条件头/计数），只覆盖用户可编辑字段。
 */
function normalizeFeed(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  // feed://host 与 feed:http://host 前缀静默规整为标准 http(s) 地址
  let url = String(raw.url || '').trim();
  url = url.replace(/^feed:\/*/i, '').replace(/^\/\//, '');
  if (!url) return { error: 'URL 为空' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  if (!isFetchableUrl(url)) return { error: '仅支持公网 http(s) 地址（内网/环回不允许）' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const feed = {
    id: prev && prev.id ? String(prev.id) : feedIdFor(url),
    url,
    title: clip(raw.title, TITLE_CAP) || (prev ? prev.title : '') || '',
    siteUrl: prev ? prev.siteUrl || '' : '',
    category: clip(raw.category, CATEGORY_CAP) || (prev ? prev.category || '' : ''),
    enabled: raw.enabled === undefined ? (prev ? prev.enabled !== false : true) : raw.enabled === true,
    intervalMin: (() => {
      const v = Number(raw.intervalMin !== undefined ? raw.intervalMin : (prev ? prev.intervalMin : 0));
      if (!Number.isFinite(v) || v <= 0) return 0; // 0 = 跟随全局 pollMin
      return Math.min(240, Math.max(5, Math.floor(v)));
    })(),
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    // ── 运行时字段（仅服务写；normalize 时保留）──
    etag: prev ? prev.etag || '' : '',
    lastModified: prev ? prev.lastModified || '' : '',
    lastFetchAt: prev ? prev.lastFetchAt || 0 : 0,
    lastStatus: prev ? prev.lastStatus || 'never' : 'never',
    lastError: prev ? prev.lastError || '' : '',
    consecutiveErrors: prev ? prev.consecutiveErrors || 0 : 0,
    itemCount: prev ? prev.itemCount || 0 : 0,
    unreadCount: prev ? prev.unreadCount || 0 : 0,
    rev: prev ? prev.rev || 1 : 1,
  };
  return { feed };
}

// ── 文章 id ────────────────────────────────────────────────────────────────
/** 稳定文章 id：同一 feed 内 guid/link 唯一 → 同一 id（跨重复抓取去重） */
function articleId(feedId, item) {
  const seed = feedId + '|' + String(item.guid || item.link || item.title || Math.random()).toLowerCase();
  return 'a' + sha256Hex(seed).slice(0, 12);
}

// ── 合并计划（纯函数）──────────────────────────────────────────────────────
/**
 * 把 parseFeed 的产物合并进现有文章集合。
 * existingById：该 feed 下现有文章 map（id → article 对象）。
 * 返回 { adds, updates, total }：
 *   adds    — 新文章对象数组（待写入）
 *   updates — 旧文章回填对象数组（excerpt 为空、publishedAt 为 0 时的补齐）
 *   total   — 现有 + 新增（供 feed.itemCount）
 */
function planMerge(existingById, items, feed, now, maxPerFeed) {
  const adds = [];
  const updates = [];
  const seen = new Set();
  const clean = (Array.isArray(items) ? items : []).filter((it) => it && typeof it === 'object');
  // 新条目按 publishedAt 降序（0 的排最旧），取前 maxPerFeed 条候选入新.
  const sorted = [...clean].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  for (const it of sorted.slice(0, clampMaxPerFeed(maxPerFeed))) {
    const id = articleId(feed.id, it);
    if (seen.has(id)) continue;
    seen.add(id);
    const prev = existingById.get(id);
    if (prev) {
      // 已存在：只做字段回填（不重置 read/star 等用户状态——那由面板/MCP 写）
      const patch = {};
      if (!prev.excerpt && it.excerpt) patch.excerpt = String(it.excerpt).slice(0, EXCERPT_CAP);
      if (!prev.publishedAt && it.publishedAt) patch.publishedAt = it.publishedAt;
      if (!prev.title && it.title) patch.title = String(it.title).slice(0, TITLE_CAP);
      if (Object.keys(patch).length) updates.push({ id, patch });
      continue;
    }
    adds.push({
      id,
      feedId: feed.id,
      guid: it.guid ? String(it.guid).slice(0, LINK_CAP) : '',
      link: it.link ? String(it.link).slice(0, LINK_CAP) : '',
      title: String(it.title || '').slice(0, TITLE_CAP) || it.link || '（无标题）',
      author: String(it.author || '').slice(0, AUTHOR_CAP),
      publishedAt: it.publishedAt || 0,
      excerpt: String(it.excerpt || '').slice(0, EXCERPT_CAP),
      createdAt: now,
      read: false,
      star: false,
    });
  }
  return { adds, updates, total: (existingById.size || 0) + adds.length };
}

/** 私有小工具：防御性钳制（避免外部误传爆内存） */
function clampMaxPerFeed(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 120;
  return Math.min(500, v);
}

// ── 保留策略（纯函数）──────────────────────────────────────────────────────
/**
 * 返回应删除的文章 id 列表：
 *   1. 超过 retentionDays 的非星标文章
 *   2. 已读文章超过 readKeepDays 的非星标文章（比 1 更激进）
 *   3. 每个 feed 非星标文章超出 maxPerFeed 的最旧部分
 * 星标永留（不占名额也不被清）。
 */
function planRetention(articles, settings, now) {
  const s = normalizeSettings(settings);
  const live = (Array.isArray(articles) ? articles : []).filter((a) => a && typeof a.id === 'string' && typeof a.feedId === 'string');
  const del = new Set();
  const survivorsByFeed = new Map();
  for (const a of live) {
    if (a.star) continue;
    const age = now - (a.publishedAt || a.createdAt || 0);
    if (a.read && age > s.readKeepDays * 86400000) { del.add(a.id); continue; }
    if (age > s.retentionDays * 86400000) { del.add(a.id); continue; }
    const arr = survivorsByFeed.get(a.feedId) || [];
    arr.push(a);
    survivorsByFeed.set(a.feedId, arr);
  }
  for (const [, arr] of survivorsByFeed) {
    if (arr.length <= s.maxPerFeed) continue;
    arr.sort((x, y) => (x.publishedAt || x.createdAt || 0) - (y.publishedAt || y.createdAt || 0));
    for (const a of arr.slice(0, arr.length - s.maxPerFeed)) del.add(a.id);
  }
  return [...del];
}

/**
 * 正文（radar.content.<aid>）保留计划：非星标按 contentKeepHours 清；
 * 星标按 30 天放长。返回满足删除条件的 aid 列表。
 */
function planContentRetention(contents, settings, now) {
  const s = normalizeSettings(settings);
  const live = (Array.isArray(contents) ? contents : []).filter((c) => c && typeof c.id === 'string');
  const del = [];
  for (const c of live) {
    if (c.error) { del.push(c.id); continue; } // 抓取失败的错误占位不留
    const limit = (c.star ? Math.max(720, s.contentKeepHours) : s.contentKeepHours) * 3600000;
    if (now - (c.fetchedAt || 0) > limit) del.push(c.id);
  }
  return del;
}

// ── 设置规范化 ─────────────────────────────────────────────────────────────
const SETTING_LIMITS = {
  pollMin: [10, 240, 15],
  retentionDays: [7, 365, 30],
  maxPerFeed: [30, 500, 120],
  readKeepDays: [3, 180, 14],
  contentKeepHours: [8, 240, 48],
};

function normalizeSettings(raw) {
  const base = { pollMin: SETTING_LIMITS.pollMin[2], retentionDays: SETTING_LIMITS.retentionDays[2], maxPerFeed: SETTING_LIMITS.maxPerFeed[2], readKeepDays: SETTING_LIMITS.readKeepDays[2], contentKeepHours: SETTING_LIMITS.contentKeepHours[2] };
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw[k]);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  return out;
}

// ── 展示辅助（MCP 文案用）──────────────────────────────────────────────────
function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

module.exports = {
  TITLE_CAP, LINK_CAP, EXCERPT_CAP, AUTHOR_CAP, TEXT_CAP, CATEGORY_CAP,
  isFetchableUrl, decodeEntities, clip, parseFeedDate, feedIdFor,
  articleId, planMerge, planRetention, planContentRetention,
  normalizeFeed, normalizeSettings, oneLine, clampMaxPerFeed,
};
