'use strict';
/**
 * lib.js —— 琥珀纯逻辑层（零依赖，可离线单测）
 *
 * 职责：
 *   - URL 规范化（normalizeUrl：补协议/裁剪，与面板/MCP 同规则）
 *   - 稳定条目 id（itemIdFor：URL 哈希——同一网页永远同一 id，重复封存天然幂等）
 *   - 条目规范化（normalizeItem：面板/MCP 写入的 pending 条目 + 服务回填封存结果；
 *     保留用户状态 read/star/tags，服务重封存不重置）
 *   - 标签规范化（normalizeTags：去重/裁剪/上限）
 *   - 设置规范化（normalizeSettings：越界回落默认；清扫默认关——收藏库语义是永久）
 *   - 清扫计划（planSweep：默认永不清理；开启后按 keepDays/maxItems，星标永豁免）
 *   - 摘要提取（excerptOf：跳过标题行取首个有效段落）
 *   - SSRF 守卫（isFetchableUrl：拒绝内网/环回/云元数据——URL 是任意端可写的
 *     第三方数据，不得让「封存一篇文章」变成对 localhost 的探测。与 feed-radar 同源）
 */

const { sha256Hex } = require('../shared/sha256');

const TITLE_CAP = 300;
const URL_CAP = 800;
const EXCERPT_CAP = 400;
const BYLINE_CAP = 80;
const TAG_CAP = 24;
const MAX_TAGS = 8;
const TEXT_CAP = 60000;      // 封存正文存储上限（amber.body.<id>.text）
const QUOTE_CAP = 2000;      // 单条摘录上限
const NOTE_CAP = 500;        // 摘录备注上限
const IMG_CAP = 800;

// ── SSRF 守卫 ──────────────────────────────────────────────────────────────
/**
 * 服务端 fetch 前的地址守卫：只放行公网 http(s)。
 * 拒绝：非 http(s)、环回/内网/链路本地地址。与 feed-radar/clip-relay 同一套
 * （改动必须保留测试覆盖）。
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
/** &amp; 必须最后解：避免 &amp;lt; 被二次解码成 <（feed-radar 实证结论） */
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
    .replace(/&amp;/gi, '&');
}

/** 字符串裁剪（trim + decode + cap） */
function clip(s, cap) {
  return decodeEntities(String(s || '')).trim().slice(0, cap);
}

// ── URL / id ───────────────────────────────────────────────────────────────
/**
 * URL 规范化：trim → 无协议自动补 https:// → 去尾部空白。不做大小写归一
 * （路径大小写对网页是有语义的），同一写法永远同一 id。
 */
function normalizeUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return { error: 'URL 为空' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  if (url.length > URL_CAP) return { error: `URL 超长（>${URL_CAP}）` };
  let u;
  try { u = new URL(url); } catch (_) { return { error: 'URL 无法解析' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: '仅支持 http(s) 地址' };
  return { url };
}

/** 稳定条目 id：同一 URL 永远映射同一 id（重复封存 = 更新同一琥珀） */
function itemIdFor(url) {
  return 'b' + sha256Hex(String(url).trim()).slice(0, 12);
}

// ── 标签 ───────────────────────────────────────────────────────────────────
/** 标签规范化：字符串/数组都收，去重、裁剪、上限 MAX_TAGS */
function normalizeTags(raw) {
  const out = [];
  const seen = new Set();
  const push = (t) => {
    const tag = clip(t, TAG_CAP);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  };
  if (typeof raw === 'string') {
    for (const t of raw.split(/[,，;；\s]+/)) push(t);
  } else if (Array.isArray(raw)) {
    for (const t of raw) push(t);
  }
  return out.slice(0, MAX_TAGS);
}

// ── 条目规范化 ─────────────────────────────────────────────────────────────
/**
 * 面板/MCP 写入的原始载荷 → 干净的琥珀条目。
 * existing 存在时保留用户状态（read/star/tags/firstSealedAt/sealCount）与
 * 服务写的封存字段——重复封存只更新正文相关字段，不重置用户状态。
 */
function normalizeItem(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const n = normalizeUrl(raw.url);
  if (n.error) return { error: n.error };
  if (!isFetchableUrl(n.url)) return { error: '仅支持公网 http(s) 地址（内网/环回不允许）' };
  const prev = existing && typeof existing === 'object' ? existing : null;
  const item = {
    id: prev && prev.id ? String(prev.id) : itemIdFor(n.url),
    url: n.url,
    host: safeHost(n.url),
    title: clip(raw.title, TITLE_CAP) || (prev ? prev.title : '') || '',
    byline: clip(raw.byline, BYLINE_CAP) || (prev ? prev.byline || '' : ''),
    publishedAt: prev ? prev.publishedAt || 0 : 0,
    excerpt: prev ? prev.excerpt || '' : '',
    img: prev ? prev.img || '' : '',
    wordCount: prev ? Number(prev.wordCount) || 0 : 0,
    tags: raw.tags !== undefined ? normalizeTags(raw.tags) : (prev ? prev.tags || [] : []),
    star: raw.star !== undefined ? raw.star === true : (prev ? prev.star === true : false),
    read: raw.read !== undefined ? raw.read === true : (prev ? prev.read === true : false),
    // status: pending=已登记未封存；ok=封存成功；error=封存失败（保留旧正文）
    status: prev ? prev.status || 'pending' : 'pending',
    error: prev ? prev.error || '' : '',
    sealedAt: prev ? prev.sealedAt || 0 : 0,
    firstSealedAt: prev ? prev.firstSealedAt || 0 : 0,
    sealCount: prev ? Number(prev.sealCount) || 0 : 0,
    createdAt: prev ? prev.createdAt || Date.now() : Date.now(),
    rev: prev ? Number(prev.rev) || 1 : 1,
  };
  return { item };
}

function safeHost(url) {
  try { return new URL(url).host.toLowerCase(); } catch (_) { return ''; }
}

/** 服务封存成功后回填条目（不重置用户状态；sealCount/时间线层积） */
function applySealResult(item, r, now) {
  const next = { ...item };
  if (r.ok) {
    next.status = 'ok';
    next.error = '';
    next.title = r.title || next.title || next.url;
    next.byline = r.byline || next.byline || '';
    next.publishedAt = r.publishedAt || next.publishedAt || 0;
    next.excerpt = r.excerpt || next.excerpt || '';
    next.img = r.img || next.img || '';
    next.wordCount = r.wordCount || 0;
    next.sealedAt = now;
    next.firstSealedAt = next.firstSealedAt || now;
    next.sealCount = (Number(next.sealCount) || 0) + 1;
  } else {
    // 失败不动旧正文（旧快照仍是遗产）；只标记状态供面板重试
    next.status = 'error';
    next.error = String(r.error || '封存失败').slice(0, 200);
    if (!next.sealCount) next.sealedAt = 0;
  }
  next.rev = (Number(next.rev) || 1) + 1;
  return next;
}

// ── 摘要 ───────────────────────────────────────────────────────────────────
/** 从 Markdown-lite 正文取摘要：跳过 # 标题行与列表标记，取首个 ≥20 字的段落 */
function excerptOf(text, cap) {
  const t = String(text || '');
  for (const raw of t.split(/\n+/)) {
    const line = raw.replace(/^#+\s*/, '').replace(/^[-*>]\s*/, '').trim();
    if (line.length >= 20) return line.slice(0, cap || EXCERPT_CAP);
  }
  // 全是短行：拼接后取首段（剥标题/列表/引用标记）
  const joined = t.replace(/^[#>\-*\s]+/gm, '').replace(/\s+/g, ' ').trim();
  return joined.slice(0, cap || EXCERPT_CAP);
}

// ── 设置 ───────────────────────────────────────────────────────────────────
const SETTING_LIMITS = {
  keepDays: [7, 3650, 90],   // 清扫开启后的保留天数
  maxItems: [0, 5000, 0],    // 0 = 不限条数
};

function normalizeSettings(raw) {
  const base = { sweepEnabled: false, keepDays: SETTING_LIMITS.keepDays[2], maxItems: SETTING_LIMITS.maxItems[2] };
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  out.sweepEnabled = raw.sweepEnabled === true;
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw[k]);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  return out;
}

// ── 清扫计划（纯函数）──────────────────────────────────────────────────────
/**
 * 收藏库语义：默认**永不清理**（sweepEnabled=false 返回空）。
 * 开启后：非星标且封存时间超 keepDays 删除；非星标超额（maxItems）按封存时间
 * 从旧到新删。星标永豁免（不占名额也不被清）。
 * @returns {string[]} 应删除的条目 id 列表
 */
function planSweep(items, settings, now) {
  const s = normalizeSettings(settings);
  if (!s.sweepEnabled) return [];
  const live = (Array.isArray(items) ? items : []).filter((a) => a && typeof a.id === 'string');
  const del = new Set();
  const keepers = [];
  for (const a of live) {
    if (a.star) continue;
    const at = a.sealedAt || a.createdAt || 0;
    if (at && now - at > s.keepDays * 86400000) { del.add(a.id); continue; }
    keepers.push(a);
  }
  if (s.maxItems > 0 && keepers.length > s.maxItems) {
    keepers.sort((x, y) => (x.sealedAt || x.createdAt || 0) - (y.sealedAt || y.createdAt || 0));
    for (const a of keepers.slice(0, keepers.length - s.maxItems)) del.add(a.id);
  }
  return [...del];
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

module.exports = {
  TITLE_CAP, URL_CAP, EXCERPT_CAP, BYLINE_CAP, TAG_CAP, MAX_TAGS, TEXT_CAP, QUOTE_CAP, NOTE_CAP, IMG_CAP,
  isFetchableUrl, decodeEntities, clip, normalizeUrl, itemIdFor, normalizeTags,
  normalizeItem, applySealResult, excerptOf, normalizeSettings, planSweep, oneLine, safeHost,
};
