'use strict';
/**
 * lib.js —— 接力板纯逻辑层（零依赖，可离线单测）
 *
 * 职责：
 *   - 条目规范化（normalizeItem：长度上限/字段裁剪/来源标签）
 *   - URL 识别（detectKind：整条文本是一个 URL 才算链接，才值得抓标题）
 *   - 设置规范化（normalizeSettings：越界回落默认）
 *   - 保留策略（planRetention：条数上限 + 天数上限，置顶永留，纯函数可测）
 *   - SSRF 守卫（isFetchableUrl：拒绝内网/环回地址——URL 会进服务的原生 fetch）
 *   - HTML 元数据抽取（extractMeta：og:title/<title>/og:description，实体解码）
 */

const TEXT_CAP = 8000;
const FROM_CAP = 24;

// ── URL 识别 ───────────────────────────────────────────────────────────────
/** 整条文本（trim 后）是单个 http(s) URL 才算链接——混着说明文字的按文本处理 */
function detectKind(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return 'text';
  return /^https?:\/\/\S+$/i.test(t) ? 'url' : 'text';
}

// ── SSRF 守卫 ──────────────────────────────────────────────────────────────
/**
 * 服务端 fetch 前的地址守卫：只放行公网 http(s)。
 * 拒绝：非 http(s) 协议、环回/内网/链路本地地址（条目内容可被任何端写入，
 * 不该让"推一条链接"变成对 localhost/元数据端口的探测）。
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

// ── 条目规范化 ─────────────────────────────────────────────────────────────
/**
 * 面板/MCP 写入的原始载荷 → 干净条目。返回 {error} 或条目对象。
 * 必填：text 非空（≤8000 字符）；from 标签 ≤24 字符（默认 '未知'）。
 */
function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return { error: '载荷缺失' };
  const text = String(raw.text ?? '').trim();
  if (!text) return { error: '内容为空' };
  if (text.length > TEXT_CAP) return { error: `内容过长（${text.length} > ${TEXT_CAP} 字符），请精简后重发` };
  const kind = raw.kind === 'url' || raw.kind === 'text' ? raw.kind : detectKind(text);
  const item = {
    id: /^[a-z0-9]{6,32}$/i.test(String(raw.id || '')) ? raw.id : 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    text,
    kind,
    from: String(raw.from || '未知').slice(0, FROM_CAP),
    createdAt: Number(raw.createdAt) > 0 ? Math.floor(Number(raw.createdAt)) : Date.now(),
    pinned: raw.pinned === true,
    enriched: false,
  };
  if (item.kind === 'url') item.url = text;
  if (raw.title) item.title = String(raw.title).slice(0, 300);
  if (raw.desc) item.desc = String(raw.desc).slice(0, 500);
  return { item };
}

/** 服务 enrich 结果回写时的字段白名单合并（防脏数据漫进 kv） */
function applyEnrich(item, meta) {
  if (!item || typeof item !== 'object' || !meta || typeof meta !== 'object') return item;
  const out = { ...item, enriched: true };
  if (meta.title) out.title = String(meta.title).slice(0, 300);
  if (meta.desc) out.desc = String(meta.desc).slice(0, 500);
  if (meta.fail) out.enrichFail = String(meta.fail).slice(0, 120);
  return out;
}

// ── 设置规范化 ─────────────────────────────────────────────────────────────
const SETTING_LIMITS = {
  maxItems: [20, 500, 100],
  retentionDays: [1, 365, 14],
  sweepMs: [60000, 3600000, 600000],
};

function normalizeSettings(raw) {
  const base = { maxItems: SETTING_LIMITS.maxItems[2], retentionDays: SETTING_LIMITS.retentionDays[2], sweepMs: SETTING_LIMITS.sweepMs[2], urlEnrich: true };
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw[k]);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  out.urlEnrich = raw.urlEnrich !== false;
  return out;
}

// ── 保留策略 ───────────────────────────────────────────────────────────────
/**
 * 返回应删除的条目 id 列表（纯函数）：
 *   1. 超过 retentionDays 的未置顶条目
 *   2. 未置顶条目超出 maxItems 的最旧部分（置顶不占名额也不被清）
 */
function planRetention(items, settings, now) {
  const s = normalizeSettings(settings);
  const live = (Array.isArray(items) ? items : []).filter((it) => it && typeof it.id === 'string');
  const del = new Set();
  const keep = [];
  for (const it of live) {
    if (it.pinned) continue; // 置顶永留
    if (Number.isFinite(it.createdAt) && now - it.createdAt > s.retentionDays * 86400000) {
      del.add(it.id);
    } else {
      keep.push(it);
    }
  }
  keep.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const overflow = keep.length - s.maxItems;
  if (overflow > 0) {
    for (const it of keep.slice(0, overflow)) del.add(it.id);
  }
  return [...del];
}

// ── HTML 元数据抽取（enrich 用）────────────────────────────────────────────
function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    });
}

function metaTag(html, re) {
  const m = html.match(re);
  return m ? decodeEntities(m[1]).trim().slice(0, 500) : '';
}

/**
 * 从 HTML 抽取 {title, desc}：og:title → <title>；og:description → meta description。
 * 只看前 256KB（head 就够了，防超大页面）。
 */
function extractMeta(html) {
  const head = String(html || '').slice(0, 256 * 1024);
  const title = metaTag(head, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
    || metaTag(head, /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i)
    || metaTag(head, /<title[^>]*>([^<]*)<\/title>/i);
  const desc = metaTag(head, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i)
    || metaTag(head, /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:description["']/i)
    || metaTag(head, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return { title: title.slice(0, 300), desc: desc.slice(0, 500) };
}

module.exports = {
  TEXT_CAP,
  FROM_CAP,
  detectKind,
  isFetchableUrl,
  normalizeItem,
  applyEnrich,
  normalizeSettings,
  planRetention,
  extractMeta,
  decodeEntities,
};
