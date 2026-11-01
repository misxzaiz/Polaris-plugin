'use strict';
/**
 * audit-core.js —— 站点体检台纯逻辑核（零依赖，service / 面板 / MCP 三端同口径）
 *
 * 职责：URL 规范化、robots.txt 解析与最长匹配、宽容 HTML 标签扫描、
 * 字符集解码、重定向链判定、检查项触发与评分、报告构建、选项护栏。
 * 不发请求、不碰 fs——所有输入输出都是纯数据，可独立单测。
 */
const VERSION = '0.1.0';
const PLUGIN_ID = 'site-audit';
const UA_TOKEN = 'site-audit';

/** 护栏（service 侧执行；面板/AI 展示同口径） */
const LIMITS = {
  maxPages: { min: 5, max: 5000, default: 500 },
  delayMs: { min: 0, max: 3000, default: 300 },
  timeoutS: { min: 2, max: 30, default: 15 },
  concurrency: { min: 1, max: 12, default: 6 },
  slowMs: { min: 200, max: 20000, default: 2000 },
  auditTimeoutS: { min: 60, max: 1800, default: 600 },
  externalCap: { min: 0, max: 2000, default: 500 },
  maxBodyBytes: 2 * 1024 * 1024,
  maxHops: 5,
  scopeHostMax: 3,
  assetCapPerPage: 100,
};

// ── URL 规范化 ───────────────────────────────────────────────────────────────
/** 去重键 = 规范化 URL：小写 scheme/host、去默认端口、去 hash、去尾 ? */
function normalizeUrl(input, base) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'URL 为空' };
  if (/[\s<>]/.test(raw)) return { ok: false, error: 'URL 含非法字符' };
  let u;
  try { u = new URL(raw, base || undefined); } catch (_) { return { ok: false, error: `URL 无法解析：${raw.slice(0, 120)}` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: `仅支持 http/https（收到 ${u.protocol}）` };
  if (u.username || u.password) return { ok: false, error: '不支持带账号密码的 URL（本工具不支持登录后页面）' };
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
  const out = u.toString();
  const trimmed = out.endsWith('?') ? out.slice(0, -1) : out;
  return { ok: true, url: trimmed, key: trimmed, host: u.host.toLowerCase(), scheme: u.protocol.replace(':', '') };
}

/** 链接是否值得作为 URL 处理（mailto:/javascript:/data: 等在这里挡掉） */
function isCrawlableHref(href) {
  const s = String(href || '').trim();
  if (!s) return false;
  if (/^(mailto:|tel:|javascript:|data:|blob:|about:|sms:|#)/i.test(s)) return false;
  return true;
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch (_) { return ''; }
}

/** 云元数据端点（URL 字面量层；DNS 解析层围栏在 crawler） */
const METADATA_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal', 'metadata.goog', '100.100.100.200', 'fd00:ec2::254']);
function isMetadataTarget(url) {
  const host = hostOf(url).replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(host)) return true;
  const m = host.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (m) {
    const p = m[1].split('.').map(Number);
    if (p[0] === 169 && p[1] === 254) return true;
  }
  return false;
}

// ── robots.txt ──────────────────────────────────────────────────────────────
/** 通配模式 → 正则（* 任意串；行尾 $ 锚点；其余按字面） */
function robotsPatternToRe(pattern) {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '$' && i === pattern.length - 1) re += '$';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re, 'i');
}

/**
 * 解析 robots.txt。group 选择语义与主流爬虫一致：
 * 匹配 UA_TOKEN 的组优先，否则 * 组；都没有 = 全放行。
 * 返回 { groups, sitemaps, ok }
 */
function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], allow: [], disallow: [], crawlDelayMs: null }; groups.push(cur); }
      if (value) cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'disallow') {
      if (!cur) continue;
      if (value) cur.disallow.push(value);
      lastWasAgent = false;
    } else if (field === 'allow') {
      if (!cur) continue;
      if (value) cur.allow.push(value);
      lastWasAgent = false;
    } else if (field === 'crawl-delay') {
      if (!cur) continue;
      const s = parseFloat(value);
      if (Number.isFinite(s) && s >= 0) cur.crawlDelayMs = Math.min(s * 1000, 10000);
      lastWasAgent = false;
    } else if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps, ok: true };
}

/** 从解析结果里选适用于本工具的组 */
function pickRobotGroup(robots) {
  const groups = (robots && robots.groups) || [];
  const mine = groups.filter((g) => g.agents.some((a) => a === UA_TOKEN || a.includes(UA_TOKEN)));
  if (mine.length) return { group: mine[0], explicit: true };
  const star = groups.filter((g) => g.agents.includes('*'));
  if (star.length) return { group: star[0], explicit: true };
  return { group: null, explicit: false };
}

/**
 * 判定一个 path 是否允许抓取（Google 最长匹配语义：路径更长者胜，等长 Allow 胜）。
 * robots 为 null / 无组 / 无规则 → 放行。
 */
function robotsAllows(robots, pathUrl) {
  const { group, explicit } = pickRobotGroup(robots);
  if (!explicit || !group) return { allowed: true, rule: null, crawlDelayMs: null };
  let p;
  try { p = new URL(pathUrl).pathname + (new URL(pathUrl).search || ''); } catch (_) { return { allowed: true, rule: null, crawlDelayMs: null }; }
  let best = null; // {type:'allow'|'disallow', len}
  const consider = (rules, type) => {
    for (const pat of rules) {
      if (!robotsPatternToRe(pat).test(p)) continue;
      const len = pat.length;
      if (!best || len > best.len || (len === best.len && type === 'allow')) best = { type, len, pat };
    }
  };
  consider(group.allow, 'allow');
  consider(group.disallow, 'disallow');
  return {
    allowed: !best || best.type === 'allow',
    rule: best ? best.pat : null,
    crawlDelayMs: group.crawlDelayMs,
  };
}

// ── 字符集解码 ───────────────────────────────────────────────────────────────
function charsetFromContentType(ct) {
  const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(String(ct || ''));
  return m ? m[1].toLowerCase() : null;
}

function sniffMetaCharset(buf) {
  const head = buf.slice(0, 4096).toString('latin1');
  const m1 = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);
  if (m1) return m1[1].toLowerCase();
  const m2 = /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head);
  if (m2) return m2[1].toLowerCase();
  return null;
}

/** Buffer → 文本：Content-Type > meta 嗅探 > utf-8 兜底（GBK 老页面不乱码） */
function decodeHtml(buf, contentType) {
  let charset = charsetFromContentType(contentType) || sniffMetaCharset(buf);
  let text = null;
  if (charset && !/^(utf-?8|ascii|us-ascii)$/.test(charset)) {
    try { text = new TextDecoder(charset, { fatal: false }).decode(buf); } catch (_) { charset = null; }
  } else if (charset) {
    charset = 'utf-8';
  }
  if (text === null) {
    charset = charset || 'utf-8';
    text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  }
  return { text, charset };
}

// ── HTML 宽容扫描 ────────────────────────────────────────────────────────────
/** 属性串 → {name(lower): value}（无值属性 value=''）；容忍单/双/无引号 */
function parseAttrs(attrStr) {
  const attrs = {};
  const re = /([a-zA-Z_:@][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrStr || ''))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
  }
  return attrs;
}

/** 先抹掉 script/style 体内文与注释，防 JS 代码里的 `<a href=` 假阳性 */
function scrubHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // 单正则内保留开/闭标签、丢掉体内文（\2 反向引用同正则的标签名分组，不能用嵌套 replace 的 \1——那会引用内层分组）
    .replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi, '$1$3')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<!doctype[^>]*>/gi, '');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; } })
    .replace(/&amp;/g, '&');
}

/**
 * 扫描一页 HTML，抽出体检所需全部信号。
 * 返回 { title, description, metaRobots, noindex, nofollowAll, metaRefreshUrl,
 *        canonical, canonicalCount, lang, h1Count, baseHref, charsetMeta,
 *        links:[{href,nofollow}], images:[{src,hasAltAttr}], resources:[{url,kind}] }
 */
function scanHtml(html) {
  const clean = scrubHtml(html);
  const out = {
    title: '', description: null, metaRobots: null, noindex: false, nofollowAll: false,
    metaRefreshUrl: null, canonical: null, canonicalCount: 0, lang: null, h1Count: 0,
    baseHref: null, charsetMeta: null,
    links: [], images: [], resources: [],
  };
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
  if (titleM) out.title = decodeEntities(titleM[1]).replace(/\s+/g, ' ').trim();

  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = tagRe.exec(clean))) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);
    switch (tag) {
      case 'html':
        if (out.lang === null && attrs.lang) out.lang = attrs.lang.trim();
        break;
      case 'base':
        if (out.baseHref === null && attrs.href) out.baseHref = attrs.href.trim();
        break;
      case 'meta': {
        const name = (attrs.name || '').toLowerCase();
        const equiv = (attrs['http-equiv'] || '').toLowerCase();
        const content = attrs.content;
        if (name === 'description' && content && out.description === null) out.description = decodeEntities(content).replace(/\s+/g, ' ').trim();
        if (name === 'robots' && content && out.metaRobots === null) {
          out.metaRobots = content.toLowerCase();
          out.noindex = /(^|[\s,])noindex([\s,]|$)/.test(out.metaRobots);
          out.nofollowAll = /(^|[\s,])nofollow([\s,]|$)/.test(out.metaRobots);
        }
        if (equiv === 'refresh' && content && out.metaRefreshUrl === null) {
          const um = /url\s*=\s*(.+)$/i.exec(content);
          if (um) out.metaRefreshUrl = um[1].trim().replace(/^['"]|['"]$/g, '');
        }
        if (!attrs.charset && equiv === 'content-type' && content) {
          const c = charsetFromContentType(content);
          if (c) out.charsetMeta = c;
        } else if (attrs.charset) {
          out.charsetMeta = attrs.charset.toLowerCase();
        }
        break;
      }
      case 'link': {
        const rel = (attrs.rel || '').toLowerCase();
        if (rel.includes('canonical') && attrs.href) {
          out.canonicalCount += 1;
          if (out.canonical === null) out.canonical = attrs.href.trim();
        }
        if ((rel.includes('stylesheet') || rel.includes('icon')) && attrs.href) {
          out.resources.push({ url: attrs.href.trim(), kind: rel.includes('stylesheet') ? 'style' : 'icon' });
        }
        break;
      }
      case 'script':
        if (attrs.src) out.resources.push({ url: attrs.src.trim(), kind: 'script' });
        break;
      case 'img':
        if (attrs.src) out.images.push({ src: attrs.src.trim(), hasAltAttr: Object.prototype.hasOwnProperty.call(attrs, 'alt') });
        break;
      case 'a':
        if (attrs.href) {
          const rel = (attrs.rel || '').toLowerCase();
          out.links.push({ href: attrs.href.trim(), nofollow: rel.includes('nofollow') });
        }
        break;
      case 'h1':
        out.h1Count += 1;
        break;
      default:
        break;
    }
    if (out.links.length > 2000 || out.images.length > 2000) break; // 极端页面护栏
  }
  return out;
}

// ── 重定向链判定 ─────────────────────────────────────────────────────────────
/** hops=[{url,status,location}...]（最后一跳是终态）；返回 {count, loop, escaped, finalUrl} */
function evalRedirectChain(hops, scopeHosts) {
  const chain = Array.isArray(hops) ? hops : [];
  const seen = new Set();
  let loop = false;
  for (const h of chain) {
    const k = String(h.url || '');
    if (seen.has(k)) loop = true;
    seen.add(k);
  }
  const last = chain[chain.length - 1] || null;
  const finalUrl = last ? String(last.url || '') : '';
  const escaped = !!(finalUrl && scopeHosts && scopeHosts.length && !scopeHosts.includes(hostOf(finalUrl)));
  return { count: Math.max(chain.length - 1, 0), loop, escaped, finalUrl };
}

// ── 检查项元数据与评分 ───────────────────────────────────────────────────────
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };
const ISSUE_TYPES = {
  broken_page: { severity: 'error', weight: 5, cap: 10, label: '站内页面打不开', hint: '4xx/5xx/DNS/超时——用户与搜索引擎都会碰壁' },
  broken_asset: { severity: 'warn', weight: 2, cap: 10, label: '站内资源失效', hint: '图片/样式/脚本 404——页面破相、控制台报错' },
  broken_external: { severity: 'warn', weight: 1.5, cap: 8, label: '外链失效', hint: '指向外部站点的链接打不开（报告按域聚合）' },
  redirect_chain: { severity: 'warn', weight: 1.5, cap: 8, label: '重定向链', hint: '多跳重定向浪费抓取配额并稀释权重' },
  redirect_loop: { severity: 'error', weight: 5, cap: 5, label: '重定向死循环', hint: '重定向回到链中出现过的 URL' },
  missing_title: { severity: 'error', weight: 3, cap: 8, label: '页面缺标题', hint: '<title> 是搜索结果的第一行' },
  title_length: { severity: 'warn', weight: 1, cap: 8, label: '标题长度异常', hint: '建议 10~65 字符' },
  missing_description: { severity: 'warn', weight: 1.5, cap: 8, label: '页面缺描述', hint: 'meta description 常被搜索结果摘录' },
  description_length: { severity: 'warn', weight: 0.5, cap: 6, label: '描述长度异常', hint: '建议 50~160 字符' },
  duplicate_title: { severity: 'warn', weight: 2, cap: 5, label: '标题重复', hint: '多页同标题影响区分度与收录' },
  duplicate_description: { severity: 'info', weight: 0.5, cap: 4, label: '描述重复', hint: '多页同描述常见于模板页' },
  missing_alt: { severity: 'warn', weight: 1, cap: 10, label: '图片缺 alt', hint: '可访问性与图片 SEO 双输（alt="" 是合法的装饰性写法）' },
  mixed_content: { severity: 'error', weight: 4, cap: 8, label: '混合内容', hint: 'https 页面引用 http 资源——现代浏览器直接拦截' },
  meta_refresh: { severity: 'warn', weight: 2, cap: 5, label: 'meta 跳转', hint: '用 HTTP 重定向替代 meta refresh' },
  noindex: { severity: 'info', weight: 0.5, cap: 4, label: 'noindex 页面', hint: '有意不收录则忽略；整站误设会灾难' },
  canonical_multiple: { severity: 'warn', weight: 2, cap: 5, label: '多个 canonical', hint: '搜索引擎会全部忽略' },
  canonical_offsite: { severity: 'info', weight: 0.5, cap: 4, label: 'canonical 指向站外', hint: '通常是有意的（同步源），确认即可' },
  missing_lang: { severity: 'info', weight: 0.3, cap: 3, label: '缺 html lang', hint: '屏幕阅读器与搜索引擎的语言信号' },
  h1_issues: { severity: 'info', weight: 0.3, cap: 3, label: 'h1 数量异常', hint: '缺 h1 或多 h1' },
  slow_page: { severity: 'warn', weight: 1.5, cap: 8, label: '慢页面', hint: '响应时间超过阈值' },
  robots_blocked: { severity: 'info', weight: 0, cap: 0, label: 'robots 排除', hint: '被链接但 robots.txt 不允许爬——只登记不扣分' },
  sitemap_gap: { severity: 'info', weight: 0, cap: 0, label: 'sitemap 孤岛', hint: 'sitemap 声明了但站内链接到不了（或robots排除）' },
};
const ISSUE_ITEMS_MAX = 100;

/** 标题/描述归一化（重复判定口径） */
function normDupText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 由爬取记录构建检查项列表 + 评分。
 * @param p {pages:Array, assets:Array, externals:Array, robots:{fetched,blockedCount,sitemaps,crawlDelayMs}, sitemap:{fetched,urls}, options:{slowMs,scopeHosts}}
 */
function buildIssues(p) {
  const pages = p.pages || [];
  const assets = p.assets || [];
  const externals = p.externals || [];
  const options = p.options || {};
  const slowMs = Number(options.slowMs) || LIMITS.slowMs.default;
  const scopeHosts = options.scopeHosts || [];
  const buckets = {};
  const add = (type, item) => {
    (buckets[type] = buckets[type] || []).push(item);
  };

  const okPages = [];
  for (const pg of pages) {
    if (pg.robotsBlocked) { add('robots_blocked', { url: pg.url, detail: '被 robots.txt 排除，未抓取' }); continue; }
    const bad = pg.error || (pg.status && pg.status >= 400);
    if (bad) {
      add('broken_page', {
        url: pg.url, source: pg.source || null,
        detail: pg.error ? `请求失败：${pg.error}` : `HTTP ${pg.status}${pg.statusText ? ' ' + pg.statusText : ''}${pg.redirectHops > 0 ? `（经 ${pg.redirectHops} 跳重定向）` : ''}`,
      });
      continue;
    }
    okPages.push(pg);
  }

  // 资源检查
  for (const a of assets) {
    if (a.error || (a.status && a.status >= 400)) {
      add('broken_asset', { url: a.url, source: a.source || null, detail: a.error ? `请求失败：${a.error}` : `HTTP ${a.status}` });
    }
  }

  // 外链
  for (const e of externals) {
    if (e.error || (e.status && e.status >= 400)) {
      add('broken_external', { url: e.url, source: (e.sources && e.sources[0]) || null, detail: e.error ? `请求失败：${e.error}` : `HTTP ${e.status}` });
    }
  }

  // 页面级检查（只对 2xx HTML 页）
  for (const pg of okPages) {
    const isHtml = /html|xml/i.test(pg.contentType || '') || !pg.contentType;
    if (!isHtml) continue;
    const chain = evalRedirectChain(pg.hops || [], scopeHosts);
    if (chain.loop) add('redirect_loop', { url: pg.url, detail: `重定向 ${chain.count} 跳且成环` });
    else if (chain.count >= 2) add('redirect_chain', { url: pg.url, detail: `${chain.count} 跳：${(pg.hops || []).map((h) => h.url).join(' → ')}` });
    else if (chain.escaped) add('redirect_chain', { url: pg.url, detail: `重定向离开本站：${(pg.hops || []).map((h) => h.url).join(' → ')}` });

    if (!pg.title) add('missing_title', { url: pg.url, detail: '页面没有 <title> 或标题为空' });
    else if (pg.titleLen < 10 || pg.titleLen > 65) add('title_length', { url: pg.url, detail: `标题 ${pg.titleLen} 字符：${pg.title.slice(0, 50)}` });

    if (pg.description === null) add('missing_description', { url: pg.url, detail: '缺 meta description' });
    else if (pg.descLen !== undefined && (pg.descLen < 50 || pg.descLen > 160)) add('description_length', { url: pg.url, detail: `描述 ${pg.descLen} 字符：${String(pg.description).slice(0, 50)}` });

    if (pg.noindex) add('noindex', { url: pg.url, detail: `meta robots：${pg.metaRobots || 'noindex'}` });
    if (pg.metaRefresh) add('meta_refresh', { url: pg.url, detail: `meta refresh → ${pg.metaRefresh}` });

    if (pg.canonicalCount > 1) add('canonical_multiple', { url: pg.url, detail: `${pg.canonicalCount} 个 rel=canonical` });
    else if (pg.canonical && scopeHosts.length && !scopeHosts.includes(hostOf(pg.canonical))) add('canonical_offsite', { url: pg.url, detail: `canonical → ${pg.canonical}` });

    if (!pg.lang) add('missing_lang', { url: pg.url, detail: '<html> 缺 lang 属性' });
    if (pg.h1Count === 0) add('h1_issues', { url: pg.url, detail: '没有 <h1>' });
    else if (pg.h1Count > 1) add('h1_issues', { url: pg.url, detail: `${pg.h1Count} 个 <h1>` });

    if (pg.imgNoAlt > 0) add('missing_alt', { url: pg.url, detail: `${pg.imgNoAlt} 张图片缺 alt 属性` });
    if (pg.ms > slowMs) add('slow_page', { url: pg.url, detail: `响应 ${pg.ms}ms（阈值 ${slowMs}ms）` });

    for (const ref of pg.mixedRefs || []) add('mixed_content', { url: pg.url, detail: `http 资源：${ref}` });
  }

  // 重复标题/描述
  const dup = (field, type) => {
    const map = new Map();
    for (const pg of okPages) {
      const v = normDupText(field === 'title' ? pg.title : pg.description);
      if (!v) continue;
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(pg.url);
    }
    for (const [v, urls] of map) {
      if (urls.length > 1) add(type, { url: urls[0], detail: `${field === 'title' ? '标题' : '描述'}「${v.slice(0, 60)}」出现在 ${urls.length} 页`, dupUrls: urls.slice(0, 20) });
    }
  };
  dup('title', 'duplicate_title');
  dup('description', 'duplicate_description');

  // sitemap 孤岛
  if (p.sitemap && p.sitemap.fetched && Array.isArray(p.sitemap.urls)) {
    const seen = new Set(pages.map((x) => x.url));
    for (const u of p.sitemap.urls) {
      if (!seen.has(u)) add('sitemap_gap', { url: u, detail: 'sitemap 声明但本次未爬到（孤岛页或 robots 排除）' });
    }
  }

  // → 有序问题列表 + 评分
  const types = Object.keys(buckets).sort((a, b) => {
    const sa = SEVERITY_ORDER[(ISSUE_TYPES[a] || {}).severity] ?? 3;
    const sb = SEVERITY_ORDER[(ISSUE_TYPES[b] || {}).severity] ?? 3;
    return sa - sb || (buckets[b].length - buckets[a].length);
  });
  let deduction = 0;
  const issues = types.map((type) => {
    const meta = ISSUE_TYPES[type] || { severity: 'info', weight: 0, cap: 0, label: type, hint: '' };
    const items = buckets[type].slice(0, ISSUE_ITEMS_MAX);
    deduction += Math.min(buckets[type].length, meta.cap) * meta.weight;
    return { type, severity: meta.severity, label: meta.label, hint: meta.hint, count: buckets[type].length, truncated: buckets[type].length > ISSUE_ITEMS_MAX, items };
  });
  const score = Math.max(0, Math.round(100 - deduction));
  return { issues, score };
}

/** 评语一句话 + 归因 notes */
function verdictOf(report) {
  const s = report.stats || {};
  const notes = [];
  const bySeverity = { error: 0, warn: 0, info: 0 };
  for (const i of report.issues || []) bySeverity[i.severity] += i.count;
  const oneLine = bySeverity.error + bySeverity.warn + bySeverity.info === 0
    ? `体检满分 ${report.score.value}/100：${s.pagesCrawled} 页全部健康`
    : `${report.score.value}/100 · ${s.pagesCrawled} 页 · 错误 ${bySeverity.error} / 警告 ${bySeverity.warn} / 提示 ${bySeverity.info}`;
  for (const i of (report.issues || []).slice(0, 4)) {
    notes.push(`${i.label} ${i.count} 处（${i.severity === 'error' ? '错误' : i.severity === 'warn' ? '警告' : '提示'}）——${i.hint}`);
  }
  if (s.spaSuspect) notes.push('页面里几乎抽不到链接——该站可能靠 JS 渲染，本工具不执行 JS，结果可能只覆盖 shell 页；可用 sitemap 对比确认规模');
  if (report.robots && report.robots.fetched && report.robots.blockedCount > 0) notes.push(`robots.txt 排除了 ${report.robots.blockedCount} 个被链接的地址（本工具默认遵守 robots）`);
  if (report.sitemap && report.sitemap.fetched) notes.push(`sitemap 共声明 ${report.sitemap.urlCount} 个地址，站内链接发现 ${s.pagesCrawled} 页`);
  else notes.push('未读到 sitemap.xml（robots 也未声明）——无法做覆盖对比');
  return { oneLine, notes };
}

// ── 报告构建 ─────────────────────────────────────────────────────────────────
/** pages/assets/externals 记录 → 完整报告对象（kv 限幅在各项内完成） */
function buildReport(input) {
  const { auditId, at, seed, scopeHosts, options, pages, assets, externals, robots, sitemap, aborted, durationMs } = input;
  const { issues, score } = buildIssues({ pages, assets, externals, options, robots, sitemap });
  const statusDist = {};
  for (const pg of pages) {
    const k = pg.error ? 'error' : String(pg.status || 'error');
    statusDist[k] = (statusDist[k] || 0) + 1;
  }
  const slowest = pages.filter((x) => !x.error && x.status >= 200 && x.status < 300)
    .sort((a, b) => b.ms - a.ms).slice(0, 10)
    .map((x) => ({ url: x.url, ms: x.ms, bytes: x.bytes || 0 }));
  const brokenExt = (issues.find((i) => i.type === 'broken_external') || { items: [] }).items;
  const byDomain = {};
  for (const it of brokenExt) {
    let host = hostOf(it.url) || '未知域';
    if (!byDomain[host]) byDomain[host] = [];
    if (byDomain[host].length < 20) byDomain[host].push(it.url);
  }
  // SPA 疑似：≥3 个 2xx HTML 页且平均每页抽到的 <a> 少于 0.5
  const htmlPages = pages.filter((x) => !x.error && x.status >= 200 && x.status < 300 && /html/i.test(x.contentType || ''));
  const linkCount = htmlPages.reduce((acc, x) => acc + (x.linkCount || 0), 0);
  const spaSuspect = htmlPages.length >= 3 && linkCount / htmlPages.length < 0.5;
  const stats = {
    pagesCrawled: pages.length,
    assetsChecked: assets.length,
    externalChecked: externals.length,
    externalSkipped: input.externalSkipped || 0,
    robotsBlocked: (issues.find((i) => i.type === 'robots_blocked') || { count: 0 }).count,
    durationMs: Math.round(durationMs || 0),
    statusDist,
    avgPageMs: htmlPages.length ? Math.round(htmlPages.reduce((a, x) => a + x.ms, 0) / htmlPages.length) : null,
    spaSuspect,
  };
  const report = {
    auditId, at: at || new Date().toISOString(), version: VERSION, aborted: !!aborted,
    seed: { url: seed, scopeHosts },
    options,
    robots: robots ? { fetched: !!robots.fetched, crawlDelayMs: robots.crawlDelayMs || null, disallowCount: robots.disallowCount || 0, sitemaps: (robots.sitemaps || []).slice(0, 5) } : { fetched: false, crawlDelayMs: null, disallowCount: 0, sitemaps: [] },
    sitemap: sitemap ? { fetched: !!sitemap.fetched, url: sitemap.url || null, urlCount: (sitemap.urls || []).length } : { fetched: false, url: null, urlCount: 0 },
    stats,
    issues,
    slowest,
    externalByDomain: byDomain,
    score: { value: score },
  };
  report.score.verdict = verdictOf(report);
  return report;
}

/** 报告 → AI/人可读文本（MCP 与面板共用口径） */
function renderReportText(rep) {
  const lines = [];
  lines.push(`【站点体检报告】${rep.seed.url}${rep.aborted ? '（已中止，部分结果）' : ''}`);
  lines.push(`范围：${(rep.seed.scopeHosts || []).join(' + ')} · ${rep.stats.pagesCrawled} 页 / ${rep.stats.assetsChecked} 资源 / ${rep.stats.externalChecked} 外链 · 耗时 ${(rep.stats.durationMs / 1000).toFixed(1)}s`);
  lines.push(`健康分：${rep.score.value}/100 —— ${rep.score.verdict.oneLine}`);
  if (!rep.issues.length) {
    lines.push('未发现任何检查项问题。');
  } else {
    for (const i of rep.issues) {
      lines.push(`· [${i.severity === 'error' ? '错误' : i.severity === 'warn' ? '警告' : '提示'}] ${i.label} ×${i.count}${i.truncated ? `（明细仅列前 ${i.items.length}）` : ''} —— ${i.hint}`);
      for (const it of i.items.slice(0, 8)) lines.push(`    ${it.url}${it.detail ? ` · ${it.detail}` : ''}`);
      if (i.items.length > 8) lines.push(`    …等 ${i.items.length} 条（用 site_audit_issues 看完整明细）`);
    }
  }
  if (rep.slowest.length) {
    lines.push(`最慢页面 TOP${Math.min(rep.slowest.length, 5)}：${rep.slowest.slice(0, 5).map((s) => `${s.ms}ms ${s.url}`).join(' · ')}`);
  }
  const extDomains = Object.keys(rep.externalByDomain || {});
  if (extDomains.length) lines.push(`外链失效域名：${extDomains.slice(0, 8).join('、')}`);
  for (const n of (rep.score.verdict.notes || [])) lines.push(`注：${n}`);
  lines.push(`（auditId=${rep.auditId}，完整明细用 site_audit_issues 检索，报告重看用 site_audit_report {auditId}）`);
  return lines.join('\n');
}

/** 报告问题 → CSV（UTF-8 BOM，Excel 直开不乱码） */
function issuesToCsv(rep) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['类型', '级别', 'URL', '说明', '来源页面']];
  for (const i of rep.issues || []) {
    for (const it of i.items) rows.push([i.label, i.severity === 'error' ? '错误' : i.severity === 'warn' ? '警告' : '提示', it.url, it.detail || '', it.source || '']);
  }
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

// ── 选项护栏 ─────────────────────────────────────────────────────────────────
function clamp(v, lim, dft) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dft;
  return Math.min(lim.max, Math.max(lim.min, n));
}

/** seed+选项归一化。返回 {ok, value:{seedUrl, options}} 或 {ok:false, error} */
function sanitizeOptions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const seed = normalizeUrl(src.url || src.seed || '');
  if (!seed.ok) return { ok: false, error: `目标地址无效：${seed.error}` };
  if (isMetadataTarget(seed.url)) return { ok: false, error: '目标地址是云元数据端点，禁止抓取' };
  return {
    ok: true,
    value: {
      seedUrl: seed.url,
      options: {
        maxPages: clamp(src.maxPages, LIMITS.maxPages, LIMITS.maxPages.default),
        delayMs: clamp(src.delayMs, LIMITS.delayMs, LIMITS.delayMs.default),
        timeoutS: clamp(src.timeoutS, LIMITS.timeoutS, LIMITS.timeoutS.default),
        concurrency: clamp(src.concurrency, LIMITS.concurrency, LIMITS.concurrency.default),
        slowMs: clamp(src.slowMs, LIMITS.slowMs, LIMITS.slowMs.default),
        auditTimeoutS: clamp(src.auditTimeoutS, LIMITS.auditTimeoutS, LIMITS.auditTimeoutS.default),
        externalCap: clamp(src.externalCap, LIMITS.externalCap, LIMITS.externalCap.default),
        respectRobots: src.respectRobots !== false,
        checkExternal: src.checkExternal !== false,
        checkAssets: src.checkAssets !== false,
      },
    },
  };
}

// ── sitemap 解析 ─────────────────────────────────────────────────────────────
/** 提取 <loc>；识别 <sitemapindex>；返回 {kind:'index'|'urlset'|'unknown', locs:[...]} */
function parseSitemap(xml) {
  const text = String(xml || '');
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const locs = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(text)) && locs.length < 6000) {
    const u = decodeEntities(m[1]).trim();
    if (u && /^https?:\/\//i.test(u)) locs.push(u);
  }
  return { kind: isIndex ? 'index' : (locs.length ? 'urlset' : 'unknown'), locs };
}

function fmtMs(v) { return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}ms` : 'n/a'; }
function fmtBytes(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

module.exports = {
  VERSION, PLUGIN_ID, UA_TOKEN, LIMITS, ISSUE_TYPES, ISSUE_ITEMS_MAX, SEVERITY_ORDER, METADATA_HOSTS,
  normalizeUrl, isCrawlableHref, hostOf, isMetadataTarget,
  parseRobots, pickRobotGroup, robotsAllows, robotsPatternToRe,
  charsetFromContentType, sniffMetaCharset, decodeHtml,
  parseAttrs, scrubHtml, decodeEntities, scanHtml,
  evalRedirectChain, normDupText,
  buildIssues, verdictOf, buildReport, renderReportText, issuesToCsv,
  sanitizeOptions, clamp, parseSitemap, fmtMs, fmtBytes,
};
