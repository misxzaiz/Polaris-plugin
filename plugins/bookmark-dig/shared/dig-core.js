'use strict';
/**
 * dig-core.js —— 书签考古纯函数核心（零依赖，CommonJS）
 *
 * 面板（esbuild bundle）与 MCP / 服务（node require）共用同一份计算，
 * 三端口径一致（shared core 模式）。可测逻辑全部在这里，test/run-tests.mjs 直测。
 *
 * 数据面（cap.kv，键空间契约权威表见 README）：
 *   bmd.settings  全局设置（面板/MCP 写，服务读）
 *   bmd.meta      服务心跳（服务写）
 *   bmd.rec.<n>   书签记录分块数组（服务单写者；≤200 条/块）
 *   bmd.run       当前检查运行（服务写）
 *   bmd.report.<runId> 完成的运行报告（服务写，保留最近 5 份）
 *   bmd.cmd.<op>[.<seq>].<nonce>  命令键（面板/MCP 写，服务先删后做）
 *   bmd.result.<nonce>  命令结果（服务写）
 */

// ── 常量 ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 200;
const STATUS = {
  PENDING: 'pending',   // 从未检查
  OK: 'ok',             // 2xx 直达
  REDIRECT: 'redirect', // 经重定向后 2xx
  DEAD_4XX: 'dead4xx',  // 4xx（大多真死：404/410）
  DEAD_5XX: 'dead5xx',  // 5xx（可能暂时）
  DNS: 'dns',           // 域名解析失败（基本真死）
  TIMEOUT: 'timeout',   // 超时
  SSL: 'ssl',           // 证书错误
  BLOCKED: 'blocked',   // SSRF 守卫拒绝（内网等）
  INVALID: 'invalid',   // 非 http(s) 或 URL 非法
};
const DEAD_STATUSES = new Set([STATUS.DEAD_4XX, STATUS.DEAD_5XX, STATUS.DNS, STATUS.TIMEOUT, STATUS.SSL, STATUS.BLOCKED, STATUS.INVALID]);
const ALIVE_STATUSES = new Set([STATUS.OK, STATUS.REDIRECT]);

const TRACK_PARAM_RE = /^(utm_|fbclid$|gclid$|igshid$|spm$|scm$|share_|sh_|vd_source$|from$|ref$|referrer$|source$|subtaskid$|fr$|share_token$)/i;

// ── 哈希（同步、三端一致的 FNV-1a 32bit 双拼）───────────────────────────────
function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function hashKey(normKey) {
  return (fnv1a(normKey, 0x811c9dc5).toString(16) + fnv1a(normKey, 0xdeadbeef).toString(16)).padStart(16, '0');
}

// ── URL 规范化与分类 ────────────────────────────────────────────────────────
/** 规范化：去跟踪参数/碎片/默认端口/尾斜杠，query 参数排序 → normKey 用于去重 */
function normalizeUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return { error: '空地址' };
  let u;
  try {
    u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch (_) {
    return { error: 'URL 非法' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: `非 http(s)：${u.protocol}` };
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACK_PARAM_RE.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  return { url: u.toString(), normKey: u.toString(), host: u.hostname };
}

/** 域名启发式分类（不联网，纯规则；AI 可用 dig_tag 覆盖 tags） */
function classifyUrl(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return '其他'; }
  const inHost = (...keys) => keys.some((k) => host.includes(k));
  if (inHost('github.com', 'gitee.com', 'gitlab', 'gitcode')) return '代码仓库';
  if (inHost('stackoverflow.com', 'stackexchange', 'segmentfault', 'oschina', 'juejin', 'v2ex', 'zhihu.com', 'cSDN', 'cnblogs')) return '技术社区';
  if (inHost('docs.', 'developer.', 'api.', '/docs', 'mdn', 'reactjs.org', 'vuejs.org', 'rust-lang', 'python.org', 'nodejs.org', 'learn.')) return '文档';
  if (inHost('youtube.com', 'bilibili.com', 'douyin', 'ixigua', 'youku', 'vimeo')) return '视频';
  if (inHost('arxiv.org', 'scholar.google', 'semanticscholar', 'ACM', 'ieee', 'paper')) return '论文';
  if (inHost('taobao', 'jd.com', 'tmall', 'pinduoduo', 'smzdm', 'amazon', 'suning')) return '购物';
  if (inHost('douban', 'weibo', 'x.com', 'twitter', 'facebook', 'instagram', 'xiaohongshu', 'tieba')) return '社交';
  if (inHost('music.163', 'music.', 'spotify', 'y.qq.com')) return '音乐';
  if (inHost('notion', 'yuque', 'feishu', 'docs.qq.com', 'shimo', 'confluence')) return '笔记协作';
  if (inHost('baidu.com', 'google.com/search', 'bing.com')) return '搜索';
  if (inHost('pan.baidu', 'lanzou', 'cloud.aliyun', '1drv', 'drive.google')) return '网盘';
  if (inHost('tool', 'converter', 'regex', 'json', '在线', 'online-')) return '工具';
  return '其他';
}

// ── Netscape 书签 HTML 解析 ─────────────────────────────────────────────────
function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; } })
    .replace(/&amp;/g, '&');
}

/**
 * 解析浏览器导出的书签 HTML（Netscape 格式，Chrome/Edge/Firefox 通用）。
 * 忽略 ICON（data URL 很大）；记录文件夹路径；无法解析的行静默跳过。
 * @returns {{records: Array<{url:string,title:string,folder:string,addedAt:number}>, skipped:number}}
 */
function parseNetscapeHtml(html) {
  const records = [];
  let skipped = 0;
  if (!html || !/<a\s/i.test(html)) return { records, skipped };
  const lines = String(html).split(/\r?\n/);
  const folderStack = [];
  let dlDepth = 0;
  const aRe = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
  const addDateRe = /add_date\s*=\s*["']?(\d{9,13})["']?/i;
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/i;
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (/<dl/i.test(line)) { dlDepth += (line.match(/<dl/gi) || []).length; continue; }
    if (/<\/dl/i.test(line)) {
      dlDepth = Math.max(0, dlDepth - (line.match(/<\/dl/gi) || []).length);
      // 深度映射：folderStack[i] 由深度 i+1 的 DL 持有 → 退到 dlDepth-1 层
      if (folderStack.length > Math.max(0, dlDepth - 1)) folderStack.length = Math.max(0, dlDepth - 1);
      continue;
    }
    const h3 = line.match(h3Re);
    if (h3) {
      if (dlDepth >= 1) folderStack[dlDepth - 1] = decodeEntities(h3[1]).trim();
      continue;
    }
    const m = line.match(aRe);
    if (!m) continue;
    const url = decodeEntities(m[1]).trim();
    if (!/^https?:\/\//i.test(url)) { skipped += 1; continue; }
    const title = decodeEntities(m[2]).replace(/<[^>]+>/g, '').trim();
    const addM = line.match(addDateRe);
    let addedAt = Date.now();
    if (addM) {
      const n = Number(addM[1]);
      addedAt = n < 100000000000 ? n * 1000 : n; // 秒 → 毫秒
    }
    // 书签在深度 D 的 DL 里 → 文件夹链 = 前 D-1 层 H3
    records.push({ url, title: title.slice(0, 300), folder: folderStack.slice(0, Math.max(0, dlDepth - 1)).filter(Boolean).join(' / '), addedAt });
  }
  return { records, skipped };
}

// ── 记录模型与合并 ──────────────────────────────────────────────────────────
function makeRecord(parsed, now) {
  const norm = normalizeUrl(parsed.url);
  if (norm.error) return { error: norm.error };
  return {
    id: hashKey(norm.normKey),
    url: norm.url,
    normKey: norm.normKey,
    host: norm.host,
    title: parsed.title || norm.host,
    folder: parsed.folder || '',
    addedAt: Number(parsed.addedAt) || now,
    importedAt: now,
    source: parsed.source || 'netscape',
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
    status: STATUS.PENDING,
    lastCheckedAt: 0,
    lastOkAt: 0,
    lastVisitAt: 0,
    lastResurfaceAt: 0,
    httpStatus: 0,
    finalUrl: '',
    latencyMs: 0,
    failReason: '',
    tries: 0,
  };
}

function patchRecord(rec, patch) {
  return { ...rec, ...patch };
}

/** 分块：records → [{n, items}] */
function chunkRecords(records) {
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push({ n: Math.floor(i / CHUNK_SIZE), items: records.slice(i, i + CHUNK_SIZE) });
  }
  return chunks;
}

/**
 * 合并导入：按 normKey 幂等去重。
 * @param existing Record[]
 * @param incoming 解析出的原始记录（未建模型）
 * @returns {{toUpsert: Record[], duplicateIds: string[], invalid: number, added: number, updated: number}}
 *   toUpsert = 新增 + 需要更新的记录（调用方写回分块）；duplicateIds 供去重报告
 */
function mergeRecords(existing, incoming, now) {
  const byKey = new Map(existing.map((r) => [r.normKey, r]));
  const toUpsert = [];
  const duplicateIds = [];
  let invalid = 0;
  let added = 0;
  let updated = 0;
  for (const raw of incoming) {
    const rec = makeRecord(raw, now);
    if (rec.error) { invalid += 1; continue; }
    const cur = byKey.get(rec.normKey);
    if (!cur) {
      byKey.set(rec.normKey, rec);
      toUpsert.push(rec);
      added += 1;
      continue;
    }
    duplicateIds.push(cur.id);
    // 幂等合并：保早 addedAt、标题取更完整者、folder 有则补、标签并集
    const patch = {};
    if (rec.addedAt && (!cur.addedAt || rec.addedAt < cur.addedAt)) patch.addedAt = rec.addedAt;
    if ((rec.title || '').length > (cur.title || '').length) patch.title = rec.title;
    if (rec.folder && !cur.folder) patch.folder = rec.folder;
    const tagSet = new Set([...(cur.tags || []), ...(rec.tags || [])]);
    if (tagSet.size !== (cur.tags || []).length) patch.tags = [...tagSet].slice(0, 8);
    if (Object.keys(patch).length) {
      const next = patchRecord(cur, patch);
      byKey.set(rec.normKey, next);
      toUpsert.push(next);
      updated += 1;
    }
  }
  return { toUpsert, duplicateIds: [...new Set(duplicateIds)], invalid, added, updated };
}

// ── 检查计划 ────────────────────────────────────────────────────────────────
/**
 * 出检查队列：从未检查的优先（按 importedAt 升序），其次最久未查的。
 * @param opts {{limit:number, deadOnly?:boolean, recheckDays?:number}}
 */
function planCheckQueue(records, opts) {
  const limit = Math.max(1, Math.min(2000, Number(opts.limit) || 200));
  const recheckDays = Math.max(0, Number(opts.recheckDays) || 0);
  const now = Date.now();
  let pool = records;
  if (opts.deadOnly) {
    pool = pool.filter((r) => DEAD_STATUSES.has(r.status) && (r.tries || 0) < 5);
  } else if (recheckDays > 0) {
    pool = pool.filter((r) => !r.lastCheckedAt || now - r.lastCheckedAt > recheckDays * 86400 * 1000);
  }
  const pending = pool.filter((r) => !r.lastCheckedAt).sort((a, b) => (a.importedAt || 0) - (b.importedAt || 0));
  const stale = pool.filter((r) => r.lastCheckedAt).sort((a, b) => (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0));
  return [...pending, ...stale].slice(0, limit).map((r) => r.id);
}

/**
 * URL 可抓性守卫（SSRF；与 clip-relay isFetchableUrl 同级，改动必须保留）：
 * 服务只抓公网 http(s)。拒环回/内网/链路本地（含云元数据 169.254）/
 * 0.0.0.0/localhost/.local/file/javascript。
 */
function isFetchableUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  let h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (u.username || u.password) return false;
  // IPv6 字面量：hostname 形如 [fc00::1]，剥括号后按 v6 规则判内网
  if (h.startsWith('[') && h.endsWith(']')) {
    const h6 = h.slice(1, -1);
    if (h6 === '::1' || h6 === '::' || h6 === '0:0:0:0:0:0:0:1') return false;
    if (/^f[cd]/.test(h6) || /^fe[89ab]/.test(h6)) return false; // unique-local / link-local
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false; // CGNAT
    return true;
  }
  return true;
}

/** fetch 结果 → 状态桶（服务调用；core 层给纯分类便于单测） */
function classifyHttp(statusCode, opts) {
  if (opts && opts.redirected) return statusCode >= 200 && statusCode < 300 ? STATUS.REDIRECT : classifyHttp(statusCode);
  if (statusCode >= 200 && statusCode < 300) return STATUS.OK;
  if (statusCode >= 300 && statusCode < 400) return STATUS.REDIRECT;
  if (statusCode >= 400 && statusCode < 500) return STATUS.DEAD_4XX;
  return STATUS.DEAD_5XX;
}

// ── 统计与搜索 ──────────────────────────────────────────────────────────────
function rollup(records) {
  const byStatus = {};
  const byCategory = {};
  const deadDomains = new Map();
  let alive = 0;
  let dead = 0;
  let pending = 0;
  let duplicates = 0;
  const seenKeys = new Set();
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const cat = (r.tags && r.tags.length) ? `已标签(${r.tags.length})` : classifyUrl(r.url);
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (ALIVE_STATUSES.has(r.status)) alive += 1;
    else if (DEAD_STATUSES.has(r.status)) {
      dead += 1;
      deadDomains.set(r.host, (deadDomains.get(r.host) || 0) + 1);
    } else pending += 1;
    if (seenKeys.has(r.normKey)) duplicates += 1;
    seenKeys.add(r.normKey);
  }
  const topDeadDomains = [...deadDomains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([host, count]) => ({ host, count }));
  const categories = Object.entries(byCategory).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { total: records.length, alive, dead, pending, duplicates, byStatus, categories, topDeadDomains };
}

function searchRecords(records, query, opts) {
  const q = String(query || '').trim().toLowerCase();
  const statusFilter = opts && opts.status;
  const categoryFilter = opts && opts.category;
  const domainFilter = opts && opts.domain;
  let out = records;
  if (statusFilter === 'dead') out = out.filter((r) => DEAD_STATUSES.has(r.status));
  else if (statusFilter === 'alive') out = out.filter((r) => ALIVE_STATUSES.has(r.status));
  else if (statusFilter === 'pending') out = out.filter((r) => r.status === STATUS.PENDING);
  if (domainFilter) out = out.filter((r) => r.host.includes(String(domainFilter).toLowerCase()));
  if (categoryFilter) out = out.filter((r) => classifyUrl(r.url) === categoryFilter);
  if (q) {
    out = out.filter((r) =>
      (r.title || '').toLowerCase().includes(q)
      || (r.url || '').toLowerCase().includes(q)
      || (r.folder || '').toLowerCase().includes(q)
      || (r.tags || []).some((t) => String(t).toLowerCase().includes(q)));
  }
  return out;
}

// ── 复活选点 ────────────────────────────────────────────────────────────────
/**
 * 从「活着的书签」里挑一条最值得重访的：
 * 权重 = 距上次复活/访问的时长 × (1 + 书龄年数/10)，随机加成。
 * @param rng {{random:()=>number}} 可注入随机源（单测确定性）
 */
function pickResurface(records, opts) {
  const rng = (opts && opts.rng) || Math;
  const now = (opts && opts.now) || Date.now();
  const avoid = new Set((opts && opts.avoidIds) || []);
  const pool = records.filter((r) => ALIVE_STATUSES.has(r.status) && !avoid.has(r.id));
  if (!pool.length) return null;
  let best = null;
  let bestScore = -1;
  for (const r of pool) {
    const lastTouch = Math.max(r.lastResurfaceAt || 0, r.lastVisitAt || 0, r.lastCheckedAt || 0, r.importedAt || 0);
    const idleDays = Math.max(0, (now - lastTouch) / 86400 / 1000);
    const ageYears = Math.max(0, (now - (r.addedAt || now)) / (365 * 86400 * 1000));
    const score = idleDays * (1 + ageYears / 10) * (0.8 + 0.4 * rng.random());
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

// ── 导出 ────────────────────────────────────────────────────────────────────
function toCsv(records) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['title', 'url', 'folder', 'status', 'httpStatus', 'category', 'addedAt', 'lastCheckedAt'];
  const lines = [head.join(',')];
  for (const r of records) {
    lines.push([esc(r.title), esc(r.url), esc(r.folder), esc(r.status), esc(r.httpStatus || ''), esc(classifyUrl(r.url)), esc(r.addedAt || ''), esc(r.lastCheckedAt || '')].join(','));
  }
  return '\ufeff' + lines.join('\n'); // BOM：Excel 中文友好
}

function normalizeSettings(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const num = (v, d, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);
  return {
    batchSize: num(r.batchSize, 200, 20, 2000),
    concurrency: num(r.concurrency, 6, 1, 12),
    timeoutMs: num(r.timeoutMs, 12000, 3000, 30000),
    recheckDays: num(r.recheckDays, 0, 0, 365),
    autoCheckOnImport: r.autoCheckOnImport !== false,
    checkEnabled: r.checkEnabled !== false,
  };
}

module.exports = {
  CHUNK_SIZE,
  STATUS,
  DEAD_STATUSES,
  ALIVE_STATUSES,
  hashKey,
  normalizeUrl,
  classifyUrl,
  parseNetscapeHtml,
  decodeEntities,
  makeRecord,
  patchRecord,
  chunkRecords,
  mergeRecords,
  planCheckQueue,
  isFetchableUrl,
  classifyHttp,
  rollup,
  searchRecords,
  pickResurface,
  toCsv,
  normalizeSettings,
};
