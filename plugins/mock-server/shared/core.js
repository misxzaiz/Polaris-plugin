'use strict';
/**
 * core.js —— Mock 接口台纯函数核心（零依赖，service / mcp / panel 共用）
 *
 * 全部业务规则收敛在此（坑先在纯函数层暴露最便宜）：
 *   路由/设置归一化、路径模式编译与匹配评分、{{模板}}引擎（可注入 rng/counter/now
 *   做确定性断言）、CORS 头计算、历史环形缓冲与 kv 分块写计划、OpenAPI(JSON) 导入、
 *   敏感头掩码、试金石路由规格。
 * 本文件不做任何 I/O（crypto 随机数除外）。
 */

/**
 * 随机字节（三端兼容）：浏览器/新 node 走 Web Crypto global；
 * 老 node (<19) 兜底延迟 require('crypto')（该分支在浏览器 bundle 中不可达，
 * esbuild 以 --external:crypto 保留，运行时永不触达）。
 */
function randomHex(nBytes) {
  const g = globalThis.crypto;
  if (g && typeof g.getRandomValues === 'function') {
    const b = new Uint8Array(nBytes);
    g.getRandomValues(b);
    let s = '';
    for (const x of b) s += x.toString(16).padStart(2, '0');
    return s;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('crypto').randomBytes(nBytes).toString('hex');
}

// ── 常量（service / mcp / panel 约定一致，README 同步）───────────────────────
const CHUNK_SIZE = 20;                 // mck.hist.<n> 每块条数
const KV_PREVIEW_CAP = 8 * 1024;       // kv 镜像单条请求体预览上限
const REQ_BODY_CAP = 2 * 1024 * 1024;  // 接收请求体上限（超出 413）
const ROUTE_BODY_CAP = 16 * 1024;      // 单路由响应体上限（归一化截断）
const MAX_ROUTES = 100;                // 路由总数硬上限
const MAX_ROUTE_HEADERS = 10;          // 单路由自定义响应头上限
const DELAY_MAX_MS = 60 * 1000;        // 延迟注入上限
const HISTORY_CAP = 500;               // 历史环形缓冲（内存权威；重启清空）
const PATH_CAP = 512;                  // 路由路径长度上限
const HIST_CHUNKS_KEEP = 12;           // kv 镜像最多保留块数（12*20=240 条）
const RESERVED_PREFIX = '/__';         // 保留路径前缀（/__health 管理面）
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'];

const SENSITIVE_HEADER_RE = /(authorization|cookie|token|secret|signature|sign|key|password|session)/i;

// ── id ────────────────────────────────────────────────────────────────────
/** 路由 id：时间前缀（字典序≈时间序）+ 随机尾 */
function newId() {
  return `${Date.now().toString(36)}-${randomHex(5)}`;
}
function isValidRouteId(s) {
  return typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(s);
}

// ── 路径模式编译与匹配 ─────────────────────────────────────────────────────
/**
 * 编译路径模式：/api/users/:id/comments/*
 *   静态段=3 分，:参数=2 分，*splat=1 分（只能末尾）；段数 ≤20。
 * 返回 { ok, error, segments, score, paramNames }
 */
function parsePathPattern(raw) {
  const t = String(raw == null ? '' : raw).trim();
  if (!t) return { ok: false, error: '路径不能为空' };
  if (!t.startsWith('/')) return { ok: false, error: '路径必须以 / 开头' };
  if (t.length > PATH_CAP) return { ok: false, error: `路径过长（>${PATH_CAP}）` };
  if (t.startsWith(RESERVED_PREFIX)) return { ok: false, error: `${RESERVED_PREFIX} 前缀为系统保留，不能注册` };
  if (/\/{2,}/.test(t)) return { ok: false, error: '路径不能包含连续斜杠' };
  if (/\?|#/.test(t)) return { ok: false, error: '路径不含 query/fragment（query 匹配请留空，历史里看）' };
  const parts = t.split('/').slice(1).filter((p) => p !== '');
  if (parts.length > 20) return { ok: false, error: '路径段数过多（>20）' };
  const segments = [];
  const paramNames = [];
  let score = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '*' || p.startsWith('*')) {
      if (i !== parts.length - 1) return { ok: false, error: '* 通配段只能在末尾' };
      segments.push({ type: 'splat', value: p.slice(1) || 'rest' });
      score += 1;
    } else if (p.startsWith(':')) {
      const name = p.slice(1);
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return { ok: false, error: `非法参数名: :${name}（须为标识符）` };
      segments.push({ type: 'param', value: name });
      paramNames.push(name);
      score += 2;
    } else {
      if (p.length > 200) return { ok: false, error: '路径段过长' };
      segments.push({ type: 'static', value: p.toLowerCase() });
      score += 3;
    }
  }
  return { ok: true, segments, score, paramNames };
}

/** 用编译好的模式匹配一个 pathname（大小写不敏感按静态段）；返回 params 或 null */
function matchPattern(segments, pathname) {
  const parts = pathname.split('/').slice(1).filter((p) => p !== '');
  const params = {};
  let si = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === 'splat') {
      params[seg.value] = parts.slice(i).map((p) => safeDecode(p)).join('/');
      return { ok: true, params };
    }
    if (i >= parts.length) return null;
    if (seg.type === 'static') {
      if (parts[i].toLowerCase() !== seg.value) return null;
    } else {
      const dec = safeDecode(parts[i]);
      if (!dec) return null;
      if (!Object.prototype.hasOwnProperty.call(params, seg.value)) params[seg.value] = dec;
    }
    si = i + 1;
  }
  if (si !== parts.length) return null; // 还有剩余段未消费 → 不匹配（splat 已提前 return）
  return { ok: true, params };
}

function safeDecode(s) {
  try {
    const d = decodeURIComponent(s);
    return d;
  } catch (_) { return ''; } // 非法编码按不匹配处理
}

/**
 * 在路由表中找一个匹配（enabled 优先级由调用方过滤）：
 * 模式得分高者优先（静态>参数>通配），同分按 createdAt 升序、id 字典序——确定可解释。
 */
function findMatch(routes, method, pathname) {
  let best = null;
  for (const r of routes) {
    if (!r || !r.enabled) continue;
    if (r.method !== 'ANY' && r.method !== method) continue;
    const m = matchPattern(r._segments || [], pathname);
    if (!m) continue;
    const score = (r._score || 0) * 2 + (r.method === method ? 1 : 0);
    if (!best || score > best.score
      || (score === best.score && (r.createdAt < best.route.createdAt
        || (r.createdAt === best.route.createdAt && r.id < best.route.id)))) {
      best = { route: r, params: m.params, score };
    }
  }
  return best;
}

// ── 路由 / 设置归一化 ──────────────────────────────────────────────────────
function sanitizeName(s, fallback) {
  const t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 30);
  return t || fallback;
}
function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.round(n), lo), hi);
}

/**
 * 归一化单条路由；返回 { ok, route?, error?, warnings? }。
 * 严格写规范形：非法枚举回默认、数值夹取、路径编译失败给出中文错误。
 */
function normalizeRoute(input, { partial } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: '路由必须是对象' };
  const route = partial && input.id && isValidRouteId(input.id) ? { id: input.id } : {};
  route.method = normalizeMethod(input.method);
  const pp = parsePathPattern(input.path);
  if (!pp.ok) return { ok: false, error: pp.error };
  route.path = String(input.path).trim();
  route._segments = pp.segments;
  route._score = pp.score;
  route.status = clampInt(input.status, 100, 599, 200);
  route.bodyType = ['json', 'text', 'empty'].includes(input.bodyType) ? input.bodyType : 'json';
  route.body = typeof input.body === 'string' ? input.body.slice(0, ROUTE_BODY_CAP) : '';
  route.delayMs = clampInt(input.delayMs, 0, DELAY_MAX_MS, 0);
  route.errorRate = clampInt(input.errorRate, 0, 100, 0);
  route.errorStatus = clampInt(input.errorStatus, 400, 599, 500);
  route.enabled = input.enabled === false ? false : true;
  route.builtin = input.builtin === true;
  // 自定义响应头：≤10 个，键名合法 token，值无换行（防响应头注入）
  const headers = {};
  let hwarn = '';
  if (input.headers && typeof input.headers === 'object') {
    const entries = Object.entries(input.headers).filter(([k]) => /^[a-zA-Z0-9-_]{1,64}$/.test(k) && !/^content-type$/i.test(k));
    for (const [k, v] of entries.slice(0, MAX_ROUTE_HEADERS)) {
      const val = String(v == null ? '' : v);
      if (/[\r\n]/.test(val)) { hwarn = `响应头 ${k} 含换行已丢弃`; continue; }
      headers[k] = val.slice(0, 1024);
    }
    if (entries.length > MAX_ROUTE_HEADERS) hwarn = hwarn || `自定义头超过 ${MAX_ROUTE_HEADERS} 个已截断`;
  }
  route.headers = headers;
  const warnings = hwarn ? [hwarn] : [];
  // name 默认取路径
  route.name = sanitizeName(input.name, route.path.slice(0, 30) || route.id || '未命名路由');
  // id：partial 更新保留原 id；新建校验或生成
  if (!partial) {
    if (input.id !== undefined && input.id !== null && input.id !== '') {
      if (!isValidRouteId(input.id)) return { ok: false, error: `非法路由 id: ${input.id}` };
      route.id = String(input.id);
    } else {
      route.id = newId();
    }
  }
  route.createdAt = Number(input.createdAt) || 0;
  route.updatedAt = Number(input.updatedAt) || Date.now();
  return { ok: true, route, warnings };
}

function normalizeMethod(m) {
  const t = String(m == null ? 'GET' : m).toUpperCase().trim();
  return METHODS.includes(t) ? t : 'GET';
}

function DEFAULT_SETTINGS() {
  return {
    version: 1,
    routes: [],
    cors: { mode: 'echo' },                                   // echo | star | off
    fallback: { enabled: false, status: 200, bodyType: 'json', body: '{}' },
    updatedAt: 0,
  };
}

/**
 * settings 归一化（宽容读：绝不因个别路由非法丢整表——非法项剔除并记 warnings）。
 */
function normalizeSettings(raw) {
  const s = DEFAULT_SETTINGS();
  if (!raw || typeof raw !== 'object') return { ...s, routes: [] };
  const out = { ...s };
  if (raw.cors && ['echo', 'star', 'off'].includes(raw.cors.mode)) out.cors = { mode: raw.cors.mode };
  if (raw.fallback && typeof raw.fallback === 'object') {
    const f = raw.fallback;
    out.fallback = {
      enabled: f.enabled === true,
      status: clampInt(f.status, 100, 599, 200),
      bodyType: ['json', 'text', 'empty'].includes(f.bodyType) ? f.bodyType : 'json',
      body: typeof f.body === 'string' ? f.body.slice(0, ROUTE_BODY_CAP) : '{}',
    };
  }
  if (Array.isArray(raw.routes)) {
    const seen = new Set();
    const routes = [];
    const warnings = [];
    for (const r of raw.routes.slice(0, MAX_ROUTES)) {
      const n = normalizeRoute(r);
      if (!n.ok) { warnings.push(`路由被剔除: ${n.error}`); continue; }
      if (seen.has(n.route.id)) { warnings.push(`重复 id 剔除: ${n.route.id}`); continue; }
      seen.add(n.route.id);
      routes.push(n.route);
    }
    if (raw.routes.length > MAX_ROUTES) warnings.push(`路由超过 ${MAX_ROUTES} 条已截断`);
    out.routes = routes;
    if (warnings.length) out.warnings = warnings;
  }
  out.updatedAt = Number(raw.updatedAt) || 0;
  return out;
}

/** 首次引导：写入两条开箱即用的示例路由（builtin，可删） */
function bootstrapSettings(raw) {
  const now = Date.now();
  const demo = [
    {
      id: 'demo-users', name: '示例·用户列表', method: 'GET', path: '/mockdemo/users', status: 200,
      bodyType: 'json', enabled: true, builtin: true, createdAt: now, updatedAt: now, headers: {},
      delayMs: 0, errorRate: 0, errorStatus: 500,
      body: '{"code":0,"data":[{"id":{{int 1,99}},"name":"{{cname}}","email":"{{email}}","vip":{{bool}}}],"total":42}',
    },
    {
      id: 'demo-user', name: '示例·用户详情', method: 'GET', path: '/mockdemo/users/:id', status: 200,
      bodyType: 'json', enabled: true, builtin: true, createdAt: now + 1, updatedAt: now + 1, headers: {},
      delayMs: 0, errorRate: 0, errorStatus: 500,
      body: '{"code":0,"data":{"id":"{{req.path.id}}","name":"{{cname}}","city":"{{city}}","bio":"{{csentence 10,20}}"}}',
    },
  ];
  if (raw && typeof raw === 'object' && Array.isArray(raw.routes)) return normalizeSettings(raw);
  return { ...normalizeSettings(null), routes: demo.map((r) => normalizeRoute(r).route), updatedAt: now };
}

/** 路由表去重合并（按 id upsert）；超出上限返回错误 */
function upsertRoute(routes, route) {
  const i = routes.findIndex((r) => r.id === route.id);
  if (i >= 0) {
    const next = routes.slice();
    next[i] = { ...route, createdAt: routes[i].createdAt || route.createdAt };
    return { ok: true, routes: next, updated: true };
  }
  if (routes.length >= MAX_ROUTES) return { ok: false, error: `路由已达上限 ${MAX_ROUTES} 条（先删一些）` };
  return { ok: true, routes: [...routes, route], updated: false };
}

function removeRoute(routes, id) {
  const next = routes.filter((r) => r.id !== id);
  return { ok: next.length !== routes.length, routes: next };
}

// ── 模板引擎 ───────────────────────────────────────────────────────────────
// CN 数据池（小而够用；模板意义是"真实感"不是完备 faker）
const CN_SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗郑梁谢宋唐许韩冯邓曹彭'.split('');
const CN_GIVENS = ['伟', '芳', '娜', '敏', '静', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '文轩', '雨欣', '子涵', '浩然', '欣怡', '梓萱', '博文', '思远', '晓彤', '嘉懿', '煜城'];
const CN_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '重庆', '苏州', '天津', '长沙', '郑州', '青岛', '合肥', '福州', '厦门', '昆明', '大连'];
const CN_TITLE_WORDS = ['产品设计', '用户体验', '数据中台', '智能推荐', '增长策略', '微服务', '分布式', '敏捷开发', '质量保障', '知识图谱', '协同办公', '开放平台', '云原生', '低代码', '实时计算'];
const EN_WORDS = ['lorem', 'ipsum', 'delta', 'signal', 'vector', 'matrix', 'photon', 'quantum', 'nexus', 'pixel', 'stream', 'spark', 'cloud', 'vector', 'orbit', 'prime', 'shift', 'trace', 'echo', 'flux'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickOf(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

/**
 * 生成器注册表：expr 参数部分（不含 {{}}）→ 文本。
 * 返回 null 表示未识别（调用方按字面保留，用户能看见拼错的表达式）。
 */
function renderGenerator(expr, ctx) {
  const { rng, counter, now } = ctx;
  const t = expr.trim();
  if (!t) return null;
  // 请求上下文（req.path.id / req.query.tag / req.header.X-Token / req.body.a.b）
  if (t.startsWith('req.')) {
    const sub = t.slice(4);
    const m = /^(path|query|header|body)\.(.+)$/.exec(sub);
    if (!m) return null;
    const [, scope, keyRaw] = m;
    const key = keyRaw.trim();
    if (!key) return null;
    const src = ctx.req ? (scope === 'header' ? ctx.req.headers : ctx.req[scope]) : null;
    if (!src) return ''; // 无上下文 → 空串（不字面保留，渲染期缺上下文是常态）
    if (scope === 'header') {
      const hit = Object.keys(src).find((k) => k.toLowerCase() === key.toLowerCase());
      return hit ? String(src[hit]) : '';
    }
    if (scope === 'body') {
      let cur = src;
      for (const k of key.split('.')) {
        if (cur == null || typeof cur !== 'object') { cur = undefined; break; }
        cur = cur[k];
      }
      if (cur === undefined || cur === null) return '';
      return typeof cur === 'object' ? JSON.stringify(cur) : String(cur);
    }
    const v = src[key];
    return v === undefined ? '' : String(v);
  }
  const sp = t.indexOf(' ');
  const name = (sp === -1 ? t : t.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : t.slice(sp + 1).trim();
  const nums = () => rest.split(',').map((x) => parseFloat(x.trim()));
  switch (name) {
    case 'uuid': case 'guid': {
      const h = () => Math.floor(rng() * 16).toString(16);
      return `${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}-${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}${h()}`;
    }
    case 'int': { const [a, b] = rest ? nums() : [0, 100]; const lo = Math.ceil(Math.min(a, b)); const hi = Math.floor(Math.max(a, b)); return String(lo + Math.floor(rng() * (hi - lo + 1))); }
    case 'float': { const p = rest ? nums() : [0, 1, 2]; const d = Math.min(Math.max(Math.round(p[2] || 2), 0), 8); const lo = Math.min(p[0], p[1]); const hi = Math.max(p[0], p[1]); return (lo + rng() * (hi - lo)).toFixed(d); }
    case 'bool': return rng() < 0.5 ? 'true' : 'false';
    case 'counter': return String((counter.n = (counter.n || 0) + 1));
    case 'cname': return pickOf(rng, CN_SURNAMES) + pickOf(rng, CN_GIVENS);
    case 'name': return `${pickOf(rng, EN_WORDS).replace(/^./, (c) => c.toUpperCase())} ${pickOf(rng, EN_WORDS).replace(/^./, (c) => c.toUpperCase())}`;
    case 'email': return `${pickOf(rng, EN_WORDS)}${Math.floor(rng() * 900 + 100)}@example.com`;
    case 'phone': return `1${pickOf(rng, ['3', '5', '7', '8', '9'])}${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`;
    case 'city': return pickOf(rng, CN_CITIES);
    case 'ctitle': { const n = rest ? Math.min(Math.max(parseInt(rest, 10) || 12, 4), 40) : 12; let out = pickOf(rng, CN_TITLE_WORDS); while (out.length < n) out += pickOf(rng, CN_TITLE_WORDS); return out.slice(0, n); }
    case 'csentence': { const [a, b] = rest ? nums() : [10, 20]; const n = Math.floor(a + rng() * (Math.max(a, b) - Math.min(a, b) + 1)); let out = ''; while (out.length < n) out += pickOf(rng, CN_TITLE_WORDS); return `${out.slice(0, n)}。`; }
    case 'cparagraph': { const n = rest ? Math.min(Math.max(parseInt(rest, 10) || 3, 1), 10) : 3; const out = []; for (let i = 0; i < n; i++) out.push(renderGenerator('csentence 12,24', ctx)); return out.join(''); }
    case 'word': return pickOf(rng, EN_WORDS);
    case 'sentence': { const [a, b] = rest ? nums() : [6, 14]; const n = Math.floor(a + rng() * (Math.max(a, b) - Math.min(a, b) + 1)); const out = []; for (let i = 0; i < n; i++) out.push(pickOf(rng, EN_WORDS)); return `${out.join(' ')}.`; }
    case 'paragraph': { const n = rest ? Math.min(Math.max(parseInt(rest, 10) || 3, 1), 10) : 3; const out = []; for (let i = 0; i < n; i++) out.push(renderGenerator('sentence 8,16', ctx)); return out.join(' '); }
    case 'url': return `https://example.com/${pickOf(rng, EN_WORDS)}/${Math.floor(rng() * 9000 + 1000)}`;
    case 'ip': return `${Math.floor(rng() * 223 + 1)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 254 + 1)}`;
    case 'color': return `#${Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0')}`;
    case 'date': return new Date(now).toISOString().slice(0, 10);
    case 'datetime': return new Date(now).toISOString();
    case 'timestamp': return String(now);
    case 'daterange': { const [a, b] = rest ? nums() : [-30, 0]; const lo = Math.min(a, b); const hi = Math.max(a, b); const off = Math.floor(lo + rng() * (hi - lo + 1)); return new Date(now + off * 86400000).toISOString().slice(0, 10); }
    case 'pick': { const opts = rest.split('|').map((x) => x.trim()).filter((x) => x !== ''); return opts.length ? pickOf(rng, opts) : ''; }
    default: return null;
  }
}

const TEMPLATE_RE = /\{\{([^{}]*)\}\}/g;

/**
 * 渲染响应体模板。ctx = { rng, counter:{n}, now, req:{path,query,headers,body} }
 * 未识别的表达式按字面保留（用户能看见拼错）；\{{ 转义为字面 {{。
 * 返回 { text, warnings[] }
 */
function renderTemplate(tpl, ctx) {
  const warnings = [];
  const text = String(tpl == null ? '' : tpl).replace(/\\\{\{/g, '\u0000ESC\u0000').replace(TEMPLATE_RE, (_, expr) => {
    const v = renderGenerator(expr, ctx);
    if (v === null) { warnings.push(`未识别的模板表达式: {{${expr.trim()}}}（按字面保留）`); return `{{${expr}}}`; }
    return v;
  }).replace(/\u0000ESC\u0000/g, '{{');
  return { text, warnings: [...new Set(warnings)] };
}

// ── CORS ──────────────────────────────────────────────────────────────────
/**
 * 计算响应 CORS 头。mode: echo（回显 Origin + 允许凭据）| star（* 无凭据）| off。
 * origin 取请求 Origin 头；预检时回显请求的方法与头（≤1KB）。
 */
function corsHeaders(mode, reqHeaders, { preflight } = {}) {
  if (mode === 'off') return {};
  const origin = String(reqHeaders.origin || '');
  const out = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    'Access-Control-Max-Age': '600',
  };
  if (mode === 'star') {
    out['Access-Control-Allow-Origin'] = '*';
    if (preflight) out['Access-Control-Allow-Headers'] = String(reqHeaders['access-control-request-headers'] || '').slice(0, 1024) || 'Content-Type, Authorization';
    return out;
  }
  // echo：白名单语义 = 只对带 Origin 的请求回显；无 Origin（同源/工具直调）不给头
  if (!origin) return preflight ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } : {};
  out['Access-Control-Allow-Origin'] = origin.slice(0, 200);
  out['Access-Control-Allow-Credentials'] = 'true';
  out.Vary = 'Origin';
  if (preflight) {
    out['Access-Control-Allow-Headers'] = String(reqHeaders['access-control-request-headers'] || '').slice(0, 1024) || 'Content-Type, Authorization';
  }
  return out;
}

// ── 404 诊断 ───────────────────────────────────────────────────────────────
/** 未匹配时的诊断体：给同方法/路径相近的路由提示 */
function notFoundBody(routes, method, pathname) {
  const enabled = (routes || []).filter((r) => r && r.enabled);
  const sameMethod = enabled.filter((r) => r.method === method || r.method === 'ANY').slice(0, 5);
  const nearPath = enabled.filter((r) => {
    const seg = r.path.split('/').slice(1, 2)[0];
    return seg && pathname.toLowerCase().includes(seg.toLowerCase());
  }).slice(0, 5);
  const hint = [...new Set([...sameMethod, ...nearPath].map((r) => `${r.method} ${r.path}`))];
  return {
    ok: false,
    error: '未匹配到任何 mock 路由',
    method,
    path: pathname,
    hint: hint.length ? hint : '（当前没有启用的路由；去 Mock 接口台面板新建，或检查路径拼写）',
  };
}

// ── 历史记录 ───────────────────────────────────────────────────────────────
function maskHeaderValue(value) {
  const t = String(value == null ? '' : value);
  return t.length > 8 ? `${t.slice(0, 4)}****${t.slice(-4)}（已脱敏）` : '****（已脱敏）';
}
/** 请求头掩码 + 截断（入历史/kv/AI 可见面） */
function maskHeaders(headers) {
  const out = {};
  const entries = Object.entries(headers || {}).slice(0, 30);
  for (const [k, v] of entries) {
    const val = Array.isArray(v) ? v.join(', ') : String(v);
    out[k] = SENSITIVE_HEADER_RE.test(k) ? maskHeaderValue(val) : val.slice(0, 512);
  }
  return out;
}
function classifyBodyPreview(contentType, buf, cap) {
  const size = buf ? buf.length : 0;
  if (!size) return { kind: 'empty', size: 0, bodyPreview: '', truncated: false };
  const ct = String(contentType || '');
  const isText = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|yaml|toml|csv|graphql))/i.test(ct)
    || /^[[{\s"]/.test(buf.slice(0, 64).toString('utf8'));
  if (!isText) return { kind: 'binary', size, bodyPreview: `（二进制 ${size}B）`, truncated: false };
  const text = buf.slice(0, cap).toString('utf8');
  return { kind: 'text', size, bodyPreview: text, truncated: size > cap };
}
/** 归一化一条历史记录 */
function makeHistRec(input) {
  return {
    id: newId(),
    at: input.at || Date.now(),
    method: String(input.method || 'GET').toUpperCase(),
    path: String(input.path || '/').slice(0, PATH_CAP),
    query: String(input.query || '').slice(0, 1024),
    sourceIp: String(input.sourceIp || '').slice(0, 64),
    matchedRouteId: input.matchedRouteId || '',
    matchedRouteName: input.matchedRouteName || '',
    status: clampInt(input.status, 100, 599, 0),
    delayMs: clampInt(input.delayMs, 0, DELAY_MAX_MS, 0),
    durMs: clampInt(input.durMs, 0, 10 * 60 * 1000, 0),
    reqHeaders: maskHeaders(input.reqHeaders),
    reqBodyKind: input.reqBodyKind || 'empty',
    reqBodySize: clampInt(input.reqBodySize, 0, REQ_BODY_CAP, 0),
    reqBodyPreview: String(input.reqBodyPreview || '').slice(0, KV_PREVIEW_CAP),
    reqBodyTruncated: input.reqBodyTruncated === true,
    respBytes: clampInt(input.respBytes, 0, REQ_BODY_CAP, 0),
  };
}
/** 环形追加（新在前），超上限裁尾 */
function applyHist(ring, rec, cap = HISTORY_CAP) {
  const next = [rec, ...ring];
  if (next.length > cap) next.length = cap;
  return next;
}

/**
 * 历史分块写计划（新在前；块 0 最新）。与 webhook-station 同款语义：
 * 返回 [{key, value|null}]，value=null 表示删块。
 */
function planChunkWrites(ring, prevChunkCount) {
  const plan = [];
  const chunkCount = Math.min(Math.ceil(ring.length / CHUNK_SIZE), HIST_CHUNKS_KEEP);
  for (let i = 0; i < chunkCount; i++) {
    plan.push({ key: `mck.hist.${i}`, value: ring.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
  }
  const prevCount = Math.min(prevChunkCount || 0, HIST_CHUNKS_KEEP);
  for (let i = chunkCount; i < prevCount; i++) plan.push({ key: `mck.hist.${i}`, value: null });
  return plan;
}
/** 从分块 map 还原 ring（MCP/面板用）：{ 'mck.hist.0': [...], ... } → 新在前数组 */
function readRing(map) {
  const chunks = [];
  for (const [k, v] of Object.entries(map || {})) {
    const m = /^mck\.hist\.(\d+)$/.exec(k);
    if (m && Array.isArray(v)) chunks[parseInt(m[1], 10)] = v;
  }
  const out = [];
  for (const c of chunks) { if (Array.isArray(c)) out.push(...c); }
  return out;
}

function summarizeHist(r) {
  const t = new Date(r.at).toISOString().replace('T', ' ').slice(11, 19);
  const flag = r.status >= 400 ? ' ⚠' : '';
  return `${t} ${r.method} ${r.path}${r.query ? `?${r.query}` : ''} → ${r.status}${flag} 延迟${r.delayMs}ms 总耗时${r.durMs}ms ${r.matchedRouteName ? `路由[${r.matchedRouteName}]` : '未匹配→404诊断'}`;
}

/** JSON 预览美化（可解析才美化，否则原样返回；超长截断） */
function prettyJson(text, cap = 4096) {
  const t = String(text == null ? '' : text);
  try {
    return JSON.stringify(JSON.parse(t), null, 2).slice(0, cap);
  } catch (_) {
    return t.slice(0, cap);
  }
}

// ── OpenAPI(JSON) 导入 ─────────────────────────────────────────────────────
/** 从 JSON Schema 造一个带模板的示例对象（深度 ≤3，数组 2 项） */
function schemaToExample(schema, depth) {
  if (!schema || typeof schema !== 'object' || depth > 3) return '{{word}}';
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined && typeof schema.default !== 'object') return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const type = schema.type || (schema.properties ? 'object' : Array.isArray(schema.items) ? 'array' : schema.items ? 'array' : 'string');
  if (type === 'integer' || type === 'number') return '{{int 1,999}}';
  if (type === 'boolean') return '{{bool}}';
  if (type === 'array') return [schemaToExample(schema.items, depth + 1), schemaToExample(schema.items, depth + 1)];
  if (type === 'object') {
    const out = {};
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(props).slice(0, 12)) out[k] = schemaToExample(v, depth + 1);
    return out;
  }
  if (/date|time/i.test(schema.format || '')) return '{{datetime}}';
  if (/email/i.test(schema.format || '')) return '{{email}}';
  return '{{word}}';
}

/**
 * 导入 OpenAPI 3.x JSON：paths → 路由存根。
 * 返回 { ok, error?, routes?, warnings? }；不做网络请求，不写 kv（调用方决定 apply）。
 */
function importOpenApi(spec, { prefix = '' } = {}) {
  if (!spec || typeof spec !== 'object') return { ok: false, error: 'spec 必须是 OpenAPI JSON 对象' };
  if (!spec.paths || typeof spec.paths !== 'object') return { ok: false, error: '缺少 paths 字段（确认是 OpenAPI 3.x JSON，YAML 请先转 JSON）' };
  const warnings = [];
  const routes = [];
  const now = Date.now();
  let seq = 0;
  for (const [p, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const m of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const op = pathItem[m];
      if (!op || typeof op !== 'object') continue;
      seq += 1;
      const n = normalizeRoute({
        id: `api-${seq.toString(36).padStart(3, '0')}-${randomHex(3)}`,
        name: String(op.summary || op.operationId || `${m} ${p}`).slice(0, 30),
        method: m.toUpperCase(),
        path: `${prefix}${p}`,
        status: 200,
        bodyType: 'json',
        body: (() => {
          const resp = (op.responses || {})['200'] || (op.responses || {}).default;
          const schema = resp && resp.content && resp.content['application/json'] && resp.content['application/json'].schema;
          if (!schema) return '{"ok":true,"data":{}}';
          const ex = schemaToExample(schema, 0);
          try { return JSON.stringify(ex, null, 2); } catch (_) { return '{"ok":true}'; }
        })(),
        delayMs: 0, errorRate: 0, errorStatus: 500, enabled: true, createdAt: now + seq, updatedAt: now + seq,
        headers: {},
      });
      if (n.ok) routes.push(n.route);
      else warnings.push(`${m.toUpperCase()} ${p}: ${n.error}`);
    }
  }
  if (!routes.length) return { ok: false, error: '没有可导入的操作（paths 为空或均不合法）', warnings };
  return { ok: true, routes, warnings };
}

// ── 试金石（自检路由规格）──────────────────────────────────────────────────
/** 自检用临时路由（用后即删；路径避开 /__ 保留前缀，用 /mst/ 独占空间） */
function selftestRoutes() {
  const now = Date.now();
  const mk = (id, name, method, path, extra) => {
    const n = normalizeRoute({
      id, name, method, path, status: 200, bodyType: 'json', enabled: true,
      builtin: false, createdAt: now, updatedAt: now, headers: {}, delayMs: 0, errorRate: 0, errorStatus: 500,
      ...extra,
    });
    if (!n.ok) throw new Error(`自检路由构造失败 ${id}: ${n.error}`); // 规格错误必须在构造期炸出来，不能静默变 undefined
    return n.route;
  };
  return [
    mk('st-tpl', '自检·模板', 'GET', '/mst/tpl', { body: '{"n":{{int 1,9}},"name":"{{cname}}","mail":"{{email}}","flag":{{bool}}}' }),
    mk('st-param', '自检·参数回显', 'GET', '/mst/echo/:id', { body: '{"id":"{{req.path.id}}","tag":"{{req.query.tag}}"}' }),
    mk('st-slow', '自检·延迟', 'GET', '/mst/slow', { delayMs: 600, body: '{"ok":true}' }),
    mk('st-fail', '自检·错误注入', 'GET', '/mst/fail', { errorRate: 100, errorStatus: 500, body: '{"ok":true}' }),
    mk('st-post', '自检·POST体回显', 'POST', '/mst/post', { body: '{"got":"{{req.body.message}}"}' }),
  ];
}

module.exports = {
  // 常量
  CHUNK_SIZE, KV_PREVIEW_CAP, REQ_BODY_CAP, ROUTE_BODY_CAP, MAX_ROUTES, MAX_ROUTE_HEADERS,
  DELAY_MAX_MS, HISTORY_CAP, PATH_CAP, HIST_CHUNKS_KEEP, RESERVED_PREFIX, METHODS,
  // id
  newId, isValidRouteId,
  // 路径
  parsePathPattern, matchPattern, findMatch,
  // 归一化
  normalizeRoute, normalizeMethod, normalizeSettings, bootstrapSettings, upsertRoute, removeRoute, DEFAULT_SETTINGS,
  // 模板
  renderTemplate, renderGenerator, mulberry32,
  // CORS / 404
  corsHeaders, notFoundBody,
  // 历史
  maskHeaders, maskHeaderValue, classifyBodyPreview, makeHistRec, applyHist, planChunkWrites, readRing, summarizeHist, prettyJson,
  // OpenAPI
  importOpenApi, schemaToExample,
  // 自检
  selftestRoutes,
};
