'use strict';
/**
 * core.js —— HAR 分析台核心引擎（零依赖纯函数；服务/面板/MCP 三端共用）
 *
 * 职责：HAR 校验解析 → 概览分析 → 请求行投影（脱敏）→ 敏感审计 → 脱敏导出 →
 *       双 HAR 对比 → 请求详情（脱敏）→ 试金石 fixture。
 *
 * 安全红线：所有对外投影（kv/面板/AI）一律过 redactText / maskValue，
 *           明文密钥绝不落 kv；导出文件是唯一可能有明文的出口（由用户亲手触发）。
 */

// ── 常量与护栏 ───────────────────────────────────────────────────────────────
const MAX_FILE_BYTES = 150 * 1024 * 1024;   // 150MB 输入上限（JSON.parse 内存放大 ~3-5x）
const MAX_ENTRIES = 20000;                  // 条目上限，超出截断投影（分析仍全量统计）
const ROW_CAP = 1000;                       // kv 行投影上限
const ROWS_PER_CHUNK = 100;                 // 每分块行数
const URL_TRIM = 240;                       // 投影 URL 截断
const BODY_PREVIEW_CHARS = 1600;            // 详情体预览字符数
const AUDIT_IDX_CAP = 50;                   // 审计命中条目索引上限
const AUDIT_SAMPLES = 3;                    // 审计样例数
const HIST_KEEP = 15;                       // 打开历史保留
const REPORT_ROW_CAP = 50;                  // report/diff 内嵌行数上限

const MASK = '‹已脱敏›';

// ── 敏感规则 ────────────────────────────────────────────────────────────────
// 头名级敏感（值整段掩码）：鉴权/凭据语义 + 宽匹配兜底
const SENSITIVE_HEADER_RE = /^(authorization|proxy-authorization|x-api-key|x-apikey|api-key|apikey|x-auth-token|x-access-token|x-session-token|x-csrf-token|csrf-token|x-amz-security-token|www-authenticate|set-cookie|cookie)$/i;
const SENSITIVE_HEADER_FUZZY_RE = /(?:auth|token|key|secret|credential|session|signature|password)/i;
// query/表单键级敏感
const SENSITIVE_PARAM_KEY_RE = /(?:^|_)(?:token|secret|password|passwd|pwd|signature|sign|apikey|api_key|key|access_token|refresh_token|id_token|auth|session|sid|jwt|credential|nonce|code)$/i;
// 体/文本特征规则（按类别聚合）
const BODY_PATTERNS = [
  { cat: 'api-key-pattern', sev: 'high', re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS 访问密钥 (AKIA…)' },
  { cat: 'api-key-pattern', sev: 'high', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, label: 'sk- 形态 API 密钥（OpenAI/DeepSeek 等）' },
  { cat: 'api-key-pattern', sev: 'high', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, label: 'GitHub 令牌 (ghp_/gho_…)' },
  { cat: 'api-key-pattern', sev: 'high', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: 'Slack 令牌 (xox…)' },
  { cat: 'api-key-pattern', sev: 'high', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: 'Google API 密钥 (AIza…)' },
  { cat: 'private-key', sev: 'high', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, label: '私钥块 (BEGIN PRIVATE KEY)' },
  { cat: 'bearer-body', sev: 'medium', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, label: 'Bearer 令牌（体/文本内嵌）' },
  { cat: 'db-credential', sev: 'high', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s:@/]+:[^\s@/]+@/gi, label: '数据库连接串（带口令）' },
];
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;
const URL_CRED_RE = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i;

const AUDIT_CATS = {
  'auth-header': { sev: 'high', label: '鉴权头（Authorization / X-Api-Key 等）' },
  'cookie': { sev: 'medium', label: '请求 Cookie' },
  'set-cookie': { sev: 'medium', label: '响应 Set-Cookie' },
  'query-secret': { sev: 'medium', label: 'URL 敏感参数（token/key/…）' },
  'url-credential': { sev: 'high', label: 'URL 内嵌凭据（scheme://user:pass@）' },
  'api-key-pattern': { sev: 'high', label: '体/文本中的云厂商密钥特征' },
  'private-key': { sev: 'high', label: '私钥块' },
  'bearer-body': { sev: 'medium', label: '体/文本中的 Bearer 令牌' },
  'db-credential': { sev: 'high', label: '数据库连接串' },
  'jwt': { sev: 'medium', label: 'JWT（eyJ… 三段式）' },
};

function isSensitiveHeaderName(name) {
  const n = String(name || '');
  return SENSITIVE_HEADER_RE.test(n) || SENSITIVE_HEADER_FUZZY_RE.test(n);
}

function isSensitiveParamKey(key) {
  return SENSITIVE_PARAM_KEY_RE.test(String(key || ''));
}

/** 值级掩码：敏感键的值整段替换（保留长度线索） */
function maskValue(v) {
  const s = String(v == null ? '' : v);
  return `${MASK}(len=${s.length})`;
}

/** 已脱敏标记识别（含 URL 编码形态；审计跳过已处理值，避免「复核永不归零」假阳性） */
function isMaskedValue(v) {
  const s = String(v == null ? '' : v);
  return s.includes(MASK) || s.includes('%E2%80%B9') || s.includes('%E5%B7%B2%E8%84%B1%E6%95%8F');
}

/**
 * 通用文本脱敏：URL query 敏感值 + 体特征模式 + JWT + URL 内嵌凭据。
 * 用于投影 URL、体预览、审计样例——宁可错杀不漏密钥。
 */
function redactText(s) {
  let out = String(s == null ? '' : s);
  if (!out) return out;
  // URL 内嵌凭据
  out = out.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i, (_m, sch) => `${sch}${MASK}@`);
  // query/表单对（?k=v / &k=v / 行首或分隔符后的 k=v）：键敏感则值掩码
  out = out.replace(/(^|[?&;\s])([A-Za-z0-9_.[\]-]{1,64})=([^&\s;#]{1,2048})/g, (m, pre, k, v) => {
    if (!isSensitiveParamKey(k)) return m;
    return `${pre}${k}=${maskValue(v)}`;
  });
  // JSON 字符串值（"password":"x" / "api_key":"x" 等）
  out = out.replace(/"([^"\n]{1,64})"\s*:\s*"([^"\n]*)"/g, (m, k, v) => {
    if (!isSensitiveParamKey(k)) return m;
    return `"${k}": ${JSON.stringify(maskValue(v))}`;
  });
  // 特征模式
  for (const p of BODY_PATTERNS) {
    out = out.replace(p.re, (m) => `${MASK}[${p.cat}]`);
  }
  out = out.replace(JWT_RE, (m) => `${MASK}[jwt]`);
  return out;
}

// ── 基础工具 ────────────────────────────────────────────────────────────────
function hostOf(url) {
  try {
    const u = new URL(String(url));
    return u.host || u.hostname || '(未知)';
  } catch (_) {
    const m = String(url || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
    return m ? m[1] : '(无法解析)';
  }
}

function statusClass(s) {
  const n = Number(s) || 0;
  if (n >= 500) return '5xx';
  if (n >= 400) return '4xx';
  if (n >= 300) return '3xx';
  if (n >= 200) return '2xx';
  if (n >= 100) return '1xx';
  return '0/abort';
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function compactHeaders(pairs) {
  // HAR headers 是 [{name,value}]；同名合并逗号，键小写
  const out = {};
  for (const h of Array.isArray(pairs) ? pairs : []) {
    if (!h || typeof h.name !== 'string') continue;
    const k = h.name.toLowerCase();
    out[k] = out[k] ? `${out[k]}, ${h.value}` : String(h.value == null ? '' : h.value);
  }
  return out;
}

function mimeOf(entry) {
  const c = compactHeaders(entry.response && entry.response.headers)['content-type'] || '';
  const m = c.split(';')[0].trim().toLowerCase();
  return m || '(无类型)';
}

function toMs(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : NaN;
}

// ── HAR 校验 ────────────────────────────────────────────────────────────────
/** 结构校验（宽容：HAR 1.1/1.2 + 常见导出器方言）；返回 {ok, error, warnings[]} */
function validateHar(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: '不是对象' };
  const log = obj.log;
  if (!log || typeof log !== 'object') return { ok: false, error: '缺少 log 根节点（不是 HAR 格式）' };
  const warnings = [];
  if (!log.version) warnings.push('缺少 log.version');
  if (!log.creator || typeof log.creator !== 'object') warnings.push('缺少 log.creator（导出器信息）');
  if (!Array.isArray(log.entries)) return { ok: false, error: 'log.entries 不是数组（不是 HAR 格式）' };
  if (!log.entries.length) warnings.push('entries 为空（0 条请求）');
  let badEntries = 0;
  for (const e of log.entries) {
    if (!e || typeof e !== 'object' || !e.request || !e.response) badEntries += 1;
  }
  if (badEntries) warnings.push(`${badEntries} 条 entry 缺 request/response（跳过统计）`);
  return { ok: true, warnings };
}

// ── 概览分析 ────────────────────────────────────────────────────────────────
const PHASE_KEYS = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];

/** 单条 entry 时相分解（相对 t0 毫秒）；ssl 属 connect 子集做覆盖段；缺口记 gap */
function phaseSegments(entry, t0) {
  const startAbs = toMs(entry.startedDateTime);
  const tm = (entry.timings && typeof entry.timings === 'object') ? entry.timings : {};
  const total = Number(entry.time) || 0;
  const segs = [];
  let cursor = Number.isFinite(startAbs) ? Math.max(0, startAbs - t0) : 0;
  const relStart = cursor;
  const push = (k, v) => {
    const d = Number(v);
    if (!Number.isFinite(d) || d < 0) return;
    if (d === 0 && k !== 'ssl') return;
    segs.push({ k, s: Math.round(cursor), d: Math.round(d) });
    cursor += d;
  };
  push('blocked', tm.blocked);
  push('dns', tm.dns);
  const connect = Number(tm.connect);
  if (Number.isFinite(connect) && connect > 0) {
    const ssl = Number(tm.ssl);
    const sslDur = Number.isFinite(ssl) && ssl > 0 ? ssl : 0;
    // connect 含 ssl：ssl 段画在 connect 尾部覆盖
    segs.push({ k: 'connect', s: Math.round(cursor), d: Math.round(connect) });
    if (sslDur > 0) segs.push({ k: 'ssl', s: Math.round(cursor + connect - sslDur), d: Math.round(sslDur) });
    cursor += connect;
  }
  push('send', tm.send);
  push('wait', tm.wait);
  push('receive', tm.receive);
  const spent = cursor - relStart;
  if (total > spent + 1) segs.push({ k: 'gap', s: Math.round(cursor), d: Math.round(total - spent) });
  return { relStart: Math.round(relStart), total: Math.round(total), segs };
}

function entryFlag(entry) {
  const st = Number((entry.response && entry.response.status) || 0);
  const flags = [];
  if (entry.response && entry.response._error) flags.push('abort');
  if (st >= 400) flags.push('error');
  else if (st >= 300 && st < 400) flags.push('redirect');
  if (st === 304) flags.push('cache');
  const cache = entry.cache;
  if (cache && (cache.beforeRequest || cache.afterRequest)) flags.push('cache');
  const ph = phaseSegments(entry, toMs(entry.startedDateTime) || 0);
  if (ph.total >= 1000) flags.push('slow');
  return flags.join(',');
}

function rowOf(entry, i, t0) {
  const resp = entry.response || {};
  const bodySize = Number(resp.bodySize);
  const transfer = resp._transferSize != null ? Number(resp._transferSize) : NaN;
  const size = Number.isFinite(bodySize) && bodySize > 0 ? bodySize
    : (Number.isFinite(transfer) && transfer > 0 ? transfer : 0);
  const tm = (entry.timings && typeof entry.timings === 'object') ? entry.timings : {};
  const ph = PHASE_KEYS.map((k) => {
    const v = Number(tm[k]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : -1;
  });
  const ps = phaseSegments(entry, t0);
  const url = redactText(String((entry.request && entry.request.url) || ''));
  return {
    i,
    m: String((entry.request && entry.request.method) || 'GET').toUpperCase(),
    u: url.length > URL_TRIM ? `${url.slice(0, URL_TRIM)}…` : url,
    s: Number(resp.status) || 0,
    t: ps.total,
    sz: Math.max(0, Math.round(size)),
    mime: mimeOf(entry),
    rs: ps.relStart,
    ph,
    flags: entryFlag(entry),
  };
}

function dupKeyOf(row) { return `${row.m} ${row.u}`; }

/** 全量分析（纯函数；har 为已 parse 的对象） */
function analyzeHar(har) {
  const log = (har && har.log) || {};
  const entries = (Array.isArray(log.entries) ? log.entries : [])
    .filter((e) => e && typeof e === 'object' && e.request && e.response);
  const starts = entries.map((e) => toMs(e.startedDateTime)).filter(Number.isFinite);
  const t0 = starts.length ? Math.min(...starts) : 0;
  const endMax = entries.reduce((acc, e) => {
    const s = toMs(e.startedDateTime);
    return Number.isFinite(s) ? Math.max(acc, s + (Number(e.time) || 0)) : acc;
  }, 0);

  const rows = entries.map((e, i) => rowOf(e, i, t0));
  const times = rows.map((r) => r.t).filter((t) => t > 0);
  const byDomain = new Map();
  const byMime = new Map();
  const byMethod = new Map();
  let transferBytes = 0;
  let bodyBytes = 0;
  let errs = 0;
  let redirects = 0;
  let cached = 0;
  for (const r of rows) {
    const host = hostOf(r.u);
    const d = byDomain.get(host) || { h: host, n: 0, bytes: 0, time: 0 };
    d.n += 1; d.bytes += r.sz; d.time += r.t;
    byDomain.set(host, d);
    byMime.set(r.mime, (byMime.get(r.mime) || 0) + 1);
    byMethod.set(r.m, (byMethod.get(r.m) || 0) + 1);
    transferBytes += r.sz;
    const cls = statusClass(r.s);
    if (cls === '4xx' || cls === '5xx' || r.flags.includes('abort')) errs += 1;
    if (cls === '3xx') redirects += 1;
    if (r.flags.includes('cache')) cached += 1;
    const e = entries[r.i];
    const bSize = Number(e.response && e.response.bodySize);
    if (Number.isFinite(bSize) && bSize > 0) bodyBytes += bSize;
  }
  // 时相合计
  const phaseTotals = PHASE_KEYS.map((_, idx) => rows.reduce((a, r) => a + Math.max(0, r.ph[idx]), 0));
  const timeSum = rows.reduce((a, r) => a + r.t, 0);

  // 诊断清单
  const errors = rows.filter((r) => statusClass(r.s) === '4xx' || statusClass(r.s) === '5xx' || r.flags.includes('abort')).slice(0, REPORT_ROW_CAP);
  const slowTop = [...rows].sort((a, b) => b.t - a.t).slice(0, 12);
  const largeTop = [...rows].sort((a, b) => b.sz - a.sz).slice(0, 12);
  const dupMap = new Map();
  for (const r of rows) {
    if (r.flags.includes('cache')) continue;
    const k = dupKeyOf(r);
    const g = dupMap.get(k) || { key: k, count: 0, timeSum: 0, statuses: new Set() };
    g.count += 1; g.timeSum += r.t; g.statuses.add(r.s);
    dupMap.set(k, g);
  }
  const dupUncached = [...dupMap.values()]
    .filter((g) => g.count > 1)
    .sort((a, b) => (b.count * b.timeSum) - (a.count * a.timeSum))
    .slice(0, 10)
    .map((g) => ({ key: g.key, count: g.count, timeSumMs: Math.round(g.timeSum), statuses: [...g.statuses].sort() }));

  const topBy = (map, n, val) => [...map.values()].sort((a, b) => val(b) - val(a)).slice(0, n);
  const statusCounts = { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, '0/abort': 0 };
  for (const r of rows) statusCounts[statusClass(r.s)] += 1;
  const topMimes = [...byMime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ k, n: v }));

  const report = {
    version: String(log.version || ''),
    creator: log.creator ? `${log.creator.name || ''} ${log.creator.version || ''}`.trim() : '',
    pages: Array.isArray(log.pages) ? log.pages.length : 0,
    entryCount: entries.length,
    truncated: (log.entries || []).length > entries.length,
    t0,
    startedAt: starts.length ? new Date(t0).toISOString() : '',
    endedAt: endMax > t0 ? new Date(endMax).toISOString() : '',
    spanMs: Math.max(0, Math.round(endMax - t0)),
    timeSumMs: Math.round(timeSum),
    phaseTotalsMs: phaseTotals.map(Math.round),
    transferBytes,
    bodyBytes,
    statusCounts,
    methodCounts: Object.fromEntries(byMethod),
    domains: topBy(byDomain, 12, (d) => d.bytes).map((d) => ({ h: d.h, n: d.n, bytes: d.bytes, time: Math.round(d.time) })),
    mimes: topMimes,
    times: { avg: times.length ? Math.round(timeSum / times.length) : 0, p50: pct(times, 50), p95: pct(times, 95), max: times.length ? Math.max(...times) : 0 },
    errors,
    slowTop,
    largeTop,
    dupUncached,
    cachedCount: cached,
    redirectCount: redirects,
    errorCount: errs,
  };
  return { report, rows, t0 };
}

// ── 敏感审计 ────────────────────────────────────────────────────────────────
function pushFinding(map, cat, i, where, rawValue) {
  const f = map.get(cat) || { cat, count: 0, entries: new Set(), samples: [] };
  f.count += 1;
  f.entries.add(i);
  if (f.samples.length < AUDIT_SAMPLES) {
    f.samples.push({ i, where, masked: rawValue.length > 160 ? `${rawValue.slice(0, 160)}…` : rawValue });
  }
  map.set(cat, f);
}

function scanTextForPatterns(map, cat, i, where, text) {
  if (!text || typeof text !== 'string') return;
  for (const p of BODY_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.replace('g', '') + 'g');
    let m;
    let guard = 0;
    while ((m = re.exec(text)) && guard < 200) {
      guard += 1;
      pushFinding(map, p.cat, i, where, `${MASK}[${p.label}] 上下文: ${redactText(text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30))}`);
    }
  }
  const jre = new RegExp(JWT_RE.source, 'g');
  let jm;
  let jguard = 0;
  while ((jm = jre.exec(text)) && jguard < 200) {
    jguard += 1;
    pushFinding(map, 'jwt', i, where, `${MASK}[JWT] 上下文: ${redactText(text.slice(Math.max(0, jm.index - 30), jm.index + jm[0].length + 30))}`);
  }
}

/** 敏感审计（headers/cookies/query/url 凭据/体特征）；全部样例已掩码 */
function auditHar(har) {
  const log = (har && har.log) || {};
  const entries = (Array.isArray(log.entries) ? log.entries : [])
    .filter((e) => e && typeof e === 'object' && e.request && e.response);
  const map = new Map();
  entries.forEach((e, i) => {
    const req = e.request;
    const resp = e.response;
    // 1) 鉴权头（已是脱敏占位的跳过——审计只报「未处理的明文」）
    for (const h of Array.isArray(req.headers) ? req.headers : []) {
      if (!h || typeof h.name !== 'string') continue;
      if (isSensitiveHeaderName(h.name) && h.name.toLowerCase() !== 'cookie' && h.name.toLowerCase() !== 'set-cookie') {
        if (isMaskedValue(h.value)) continue;
        pushFinding(map, 'auth-header', i, `请求头 ${h.name}`, maskValue(h.value));
      }
    }
    // 2) 请求 cookie（头 + cookies 数组）
    const reqHeaders = compactHeaders(req.headers);
    if (reqHeaders.cookie && !isMaskedValue(reqHeaders.cookie)) pushFinding(map, 'cookie', i, '请求头 cookie', maskValue(reqHeaders.cookie));
    for (const c of Array.isArray(req.cookies) ? req.cookies : []) {
      if (c && c.name && c.value !== undefined && !isMaskedValue(c.value)) pushFinding(map, 'cookie', i, `请求 cookie ${c.name}`, maskValue(c.value));
    }
    // 3) 响应 set-cookie
    for (const h of Array.isArray(resp.headers) ? resp.headers : []) {
      if (!h || typeof h.name !== 'string') continue;
      if (h.name.toLowerCase() === 'set-cookie' && !isMaskedValue(h.value)) pushFinding(map, 'set-cookie', i, `响应头 set-cookie（${String(h.value || '').split('=')[0] || '?'}=…）`, maskValue(h.value));
    }
    for (const c of Array.isArray(resp.cookies) ? resp.cookies : []) {
      if (c && c.name && c.value !== undefined && !isMaskedValue(c.value)) pushFinding(map, 'set-cookie', i, `响应 cookie ${c.name}`, maskValue(c.value));
    }
    // 4) query 敏感参数
    try {
      const u = new URL(String(req.url || ''));
      for (const [k, v] of u.searchParams) {
        if (isSensitiveParamKey(k) && !isMaskedValue(v)) pushFinding(map, 'query-secret', i, `URL 参数 ${k}`, maskValue(v));
      }
      if (URL_CRED_RE.test(String(req.url || ''))) {
        pushFinding(map, 'url-credential', i, 'URL 内嵌凭据', `${String(req.url).split('//')[0]}//${MASK}@…`);
      }
    } catch (_) { /* 非 URL 形态跳过 */ }
    // 5) 体特征（请求/响应，文本形态才扫；二进制/图片跳过）
    const pd = req.postData;
    if (pd && typeof pd.text === 'string') scanTextForPatterns(map, 'req-body', i, '请求体', pd.text);
    if (pd && Array.isArray(pd.params)) {
      for (const p of pd.params) {
        if (p && p.name && isSensitiveParamKey(p.name)) pushFinding(map, 'query-secret', i, `表单参数 ${p.name}`, maskValue(p.value));
      }
    }
    const content = resp.content;
    const mime = String((content && content.mimeType) || '');
    if (content && typeof content.text === 'string' && content.text && !/^(image|audio|video|font)\//i.test(mime)) {
      // 上限 2MB/条，防止巨体拖垮审计
      scanTextForPatterns(map, 'res-body', i, '响应体', content.text.slice(0, 2 * 1024 * 1024));
    }
  });

  const findings = [...map.values()].map((f) => ({
    cat: f.cat,
    sev: (AUDIT_CATS[f.cat] || {}).sev || 'medium',
    label: (AUDIT_CATS[f.cat] || {}).label || f.cat,
    count: f.count,
    entryCount: f.entries.size,
    idx: [...f.entries].slice(0, AUDIT_IDX_CAP),
    samples: f.samples,
  })).sort((a, b) => {
    const sevRank = { high: 0, medium: 1, low: 2 };
    return (sevRank[a.sev] - sevRank[b.sev]) || (b.count - a.count);
  });
  const total = findings.reduce((a, f) => a + f.count, 0);
  const highCount = findings.filter((f) => f.sev === 'high').reduce((a, f) => a + f.count, 0);
  return { scannedEntries: entries.length, total, highCount, findings, scannedAt: Date.now() };
}

// ── 脱敏导出 ────────────────────────────────────────────────────────────────
const DEFAULT_SANITIZE = {
  authHeaders: true,     // 鉴权头值置掩码（保留头名）
  cookies: true,         // 请求 cookie 头 + cookies[] 清空
  setCookies: true,      // 响应 set-cookie 头 + cookies[] 清空
  querySecrets: true,    // URL 敏感参数值置掩码
  bodies: true,          // 请求/响应体整体替换为占位（保结构）
  urlCredentials: true,  // URL 内嵌凭据置掩码
};

function sanitizeUrl(url, opts) {
  let out = String(url || '');
  if (opts.urlCredentials) {
    out = out.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i, (_m, sch) => `${sch}${encodeURIComponent(MASK)}@`);
  }
  if (opts.querySecrets && out.includes('?')) {
    const [base, q] = out.split('?');
    if (q !== undefined) {
      const kept = q.split('#');
      const queryPart = kept[0];
      const parts = queryPart.split('&').map((pair) => {
        const eq = pair.indexOf('=');
        if (eq < 0) return pair;
        const k = pair.slice(0, eq);
        const v = pair.slice(eq + 1);
        if (!isSensitiveParamKey(k)) return pair;
        return `${k}=${encodeURIComponent(MASK)}`;
      });
      out = `${base}?${parts.join('&')}${kept[1] !== undefined ? `#${kept[1]}` : ''}`;
    }
  }
  return out;
}

/**
 * 深拷贝脱敏。返回 {har, stats:{cat:count}}；结构保持 HAR 合法（可再次 JSON.parse+validateHar）。
 * 体处理：整体替换为占位文本（保长不算，保守安全），postData.params 值同样置掩码。
 */
function sanitizeHar(har, optsIn) {
  const opts = { ...DEFAULT_SANITIZE, ...(optsIn || {}) };
  const stats = {};
  const bump = (k, n) => { stats[k] = (stats[k] || 0) + n; };
  const har2 = JSON.parse(JSON.stringify(har));
  const log = har2.log;
  log.creator = log.creator && typeof log.creator === 'object' ? log.creator : { name: 'har-lens', version: '' };
  log.creator.comment = `sanitized by har-lens @ ${new Date().toISOString()}（authHeaders:${opts.authHeaders ? 1 : 0} cookies:${opts.cookies ? 1 : 0} setCookies:${opts.setCookies ? 1 : 0} querySecrets:${opts.querySecrets ? 1 : 0} bodies:${opts.bodies ? 1 : 0} urlCredentials:${opts.urlCredentials ? 1 : 0}）`;

  const cleanHeaderList = (headers, kind) => {
    for (const h of Array.isArray(headers) ? headers : []) {
      if (!h || typeof h.name !== 'string') continue;
      const lower = h.name.toLowerCase();
      if (opts.authHeaders && lower !== 'cookie' && lower !== 'set-cookie' && isSensitiveHeaderName(h.name)) {
        h.value = String(MASK);
        bump(kind, 1);
      }
      if (opts.cookies && lower === 'cookie') { h.value = String(MASK); bump('cookies', 1); }
      if (opts.setCookies && lower === 'set-cookie') { h.value = String(MASK); bump('setCookies', 1); }
    }
  };
  const cleanCookieArr = (cookies, kind) => {
    for (const c of Array.isArray(cookies) ? cookies : []) {
      if (c && (c.value !== undefined)) { c.value = String(MASK); bump(kind, 1); }
    }
  };

  for (const e of Array.isArray(log.entries) ? log.entries : []) {
    if (!e || typeof e !== 'object') continue;
    const req = e.request = e.request || {};
    const resp = e.response = e.response || {};
    if (opts.urlCredentials || opts.querySecrets) req.url = sanitizeUrl(req.url, opts);
    cleanHeaderList(req.headers, 'authHeaders');
    cleanHeaderList(resp.headers, 'authHeaders');
    if (opts.cookies) {
      cleanCookieArr(req.cookies, 'cookies');
      if (req.headers) {
        for (const h of req.headers) if (h && String(h.name).toLowerCase() === 'cookie') h.value = String(MASK);
      }
    }
    if (opts.setCookies) {
      cleanCookieArr(resp.cookies, 'setCookies');
      if (resp.headers) {
        for (const h of resp.headers) if (h && String(h.name).toLowerCase() === 'set-cookie') h.value = String(MASK);
      }
    }
    if (opts.bodies) {
      const pd = req.postData;
      if (pd) {
        if (typeof pd.text === 'string' && pd.text) { bump('bodies', 1); pd.text = `[${MASK} len=${pd.text.length}]`; }
        if (Array.isArray(pd.params)) {
          for (const p of pd.params) {
            if (p && p.value !== undefined && (opts.querySecrets ? true : isSensitiveParamKey(p.name))) { p.value = String(MASK); bump('bodies', 1); }
          }
        }
      }
      const content = resp.content;
      if (content && typeof content.text === 'string' && content.text) {
        bump('bodies', 1);
        content.text = `[${MASK} len=${content.text.length} mime=${String(content.mimeType || '').slice(0, 60)}]`;
        content.size = content.text.length;
        content.encoding = undefined;
      }
    }
  }
  return { har: har2, stats };
}

// ── 请求详情（脱敏）─────────────────────────────────────────────────────────
function bodyPreview(contentOrPost, capChars) {
  const c = contentOrPost;
  if (!c || typeof c.text !== 'string' || !c.text) return { text: '', truncated: false, size: Number(c && c.size) || 0 };
  const raw = c.text;
  const masked = redactText(raw.slice(0, capChars + 200));
  return { text: masked.length > capChars ? `${masked.slice(0, capChars)}…` : masked, truncated: raw.length > capChars, size: Number(c.size) || raw.length };
}

function entryDetail(entry, i) {
  const req = entry.request || {};
  const resp = entry.response || {};
  const t0 = toMs(entry.startedDateTime);
  const reqHeaders = [];
  for (const h of Array.isArray(req.headers) ? req.headers : []) {
    if (!h || typeof h.name !== 'string') continue;
    reqHeaders.push([h.name, isSensitiveHeaderName(h.name) ? maskValue(h.value) : redactText(String(h.value == null ? '' : h.value))]);
  }
  const resHeaders = [];
  for (const h of Array.isArray(resp.headers) ? resp.headers : []) {
    if (!h || typeof h.name !== 'string') continue;
    const sensitive = isSensitiveHeaderName(h.name) || h.name.toLowerCase() === 'set-cookie';
    resHeaders.push([h.name, sensitive ? maskValue(h.value) : redactText(String(h.value == null ? '' : h.value))]);
  }
  const tm = (entry.timings && typeof entry.timings === 'object') ? entry.timings : {};
  return {
    i,
    startedAt: entry.startedDateTime || '',
    method: String(req.method || 'GET').toUpperCase(),
    url: redactText(String(req.url || '')),
    httpVersion: String((resp.httpVersion) || (req.httpVersion) || ''),
    status: Number(resp.status) || 0,
    statusText: String(resp.statusText || ''),
    redirectUrl: redactText(String(resp.redirectURL || '')),
    serverIp: String(entry._serverIPAddress || resp._remoteIPAddress || ''),
    time: Math.round(Number(entry.time) || 0),
    timings: PHASE_KEYS.reduce((acc, k) => { acc[k] = Number.isFinite(Number(tm[k])) ? Math.round(Number(tm[k])) : -1; return acc; }, {}),
    reqHeaders,
    resHeaders,
    reqCookies: (Array.isArray(req.cookies) ? req.cookies : []).slice(0, 20).map((c) => [c && c.name, c && c.value !== undefined ? MASK : '']),
    resCookies: (Array.isArray(resp.cookies) ? resp.cookies : []).slice(0, 20).map((c) => [c && c.name, c && c.value !== undefined ? MASK : '']),
    reqBody: bodyPreview(req.postData, BODY_PREVIEW_CHARS),
    resBody: bodyPreview(resp.content, BODY_PREVIEW_CHARS),
    resCompression: Number.isFinite(Number(resp.content && resp.content.compression)) ? Math.round(Number(resp.content.compression)) : null,
    cache: entry.cache && (entry.cache.beforeRequest || entry.cache.afterRequest) ? '有缓存记录' : '',
    t0Abs: Number.isFinite(t0) ? t0 : 0,
    query: (() => {
      try {
        const u = new URL(String(req.url || ''));
        const out = [];
        for (const [k, v] of u.searchParams) out.push([k, isSensitiveParamKey(k) ? maskValue(v) : redactText(v)]);
        return out.slice(0, 40);
      } catch (_) { return []; }
    })(),
  };
}

// ── 双 HAR 对比 ─────────────────────────────────────────────────────────────
function stripHash(url) { return String(url || '').split('#')[0]; }

function compareHars(base, cand) {
  const mk = (har) => {
    const log = (har && har.log) || {};
    return (Array.isArray(log.entries) ? log.entries : [])
      .filter((e) => e && e.request && e.response)
      .map((e) => ({
        m: String((e.request && e.request.method) || 'GET').toUpperCase(),
        u: stripHash(e.request && e.request.url),
        s: Number((e.response && e.response.status) || 0),
        t: Math.round(Number(e.time) || 0),
        sz: Math.max(0, Number(e.response && e.response.bodySize) > 0 ? Number(e.response.bodySize) : (Number(e.response && e.response._transferSize) > 0 ? Number(e.response._transferSize) : 0)),
      }));
  };
  const A = mk(base);
  const B = mk(cand);
  const keyExact = (r) => `${r.m} ${r.u}`;
  const keyPath = (r) => {
    try { const u = new URL(r.u); return `${r.m} ${u.host}${u.pathname}`; } catch (_) { return `${r.m} ${r.u}`; }
  };
  // 同键多条（重复请求是常态）：桶存数组，匹配时弹出未用条目，避免第二个重复被误判消失
  const mapB = new Map();
  const addTo = (prefix, key, r) => {
    const k = prefix + key;
    if (!mapB.has(k)) mapB.set(k, []);
    mapB.get(k).push(r);
  };
  for (const r of B) { addTo('e:', keyExact(r), r); addTo('p:', keyPath(r), r); }
  const used = new Set();
  const takeMatch = (a) => {
    for (const key of [keyExact(a), keyPath(a)]) {
      const bucket = mapB.get((key === keyExact(a) ? 'e:' : 'p:') + key);
      if (!bucket) continue;
      const b = bucket.find((cand) => !used.has(cand));
      if (b) return b;
    }
    return null;
  };
  const changed = [];
  const matchedA = new Set();
  for (const a of A) {
    const b = takeMatch(a);
    if (b) {
      used.add(b);
      matchedA.add(a);
      if (b.s !== a.s || Math.abs(b.t - a.t) > 50 || Math.abs(b.sz - a.sz) > 512) {
        changed.push({ m: a.m, u: redactText(a.u.length > 180 ? `${a.u.slice(0, 180)}…` : a.u), s1: a.s, s2: b.s, t1: a.t, t2: b.t, dt: b.t - a.t, sz1: a.sz, sz2: b.sz });
      }
    }
  }
  const added = B.filter((b) => !used.has(b)).map((b) => ({ m: b.m, u: redactText(b.u.length > 180 ? `${b.u.slice(0, 180)}…` : b.u), s: b.s, t: b.t, sz: b.sz }));
  // removed 只看首轮匹配结果（takeMatch 有副作用语义，重跑会把「已匹配但桶内还有孪生」的条目抢成新匹配）
  const removed = A.filter((a) => !matchedA.has(a)).map((a) => ({ m: a.m, u: redactText(a.u.length > 180 ? `${a.u.slice(0, 180)}…` : a.u), s: a.s, t: a.t, sz: a.sz }));
  const flips = changed.filter((c) => statusClass(c.s1) !== statusClass(c.s2));
  const slower = [...changed].filter((c) => c.dt > 50).sort((x, y) => y.dt - x.dt).slice(0, REPORT_ROW_CAP);
  const faster = [...changed].filter((c) => c.dt < -50).sort((x, y) => x.dt - y.dt).slice(0, REPORT_ROW_CAP);
  return {
    summary: {
      baseCount: A.length, candCount: B.length,
      matched: A.length - removed.length,
      added: added.length, removed: removed.length,
      changed: changed.length, flips: flips.length,
      slowerCount: slower.length, fasterCount: faster.length,
      baseTimeSum: A.reduce((a, r) => a + r.t, 0), candTimeSum: B.reduce((a, r) => a + r.t, 0),
    },
    changed: changed.slice(0, REPORT_ROW_CAP),
    added: added.slice(0, REPORT_ROW_CAP),
    removed: removed.slice(0, REPORT_ROW_CAP),
    slower, faster, flips: flips.slice(0, REPORT_ROW_CAP),
    comparedAt: Date.now(),
  };
}

// ── kv 投影工具 ─────────────────────────────────────────────────────────────
/** settings 规范形（服务/面板/MCP 三端同一口径；缺省全开——脱敏宁多勿少） */
function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const san = s.sanitize && typeof s.sanitize === 'object' ? s.sanitize : {};
  return {
    sanitize: {
      authHeaders: san.authHeaders !== false,
      cookies: san.cookies !== false,
      setCookies: san.setCookies !== false,
      querySecrets: san.querySecrets !== false,
      bodies: san.bodies !== false,
      urlCredentials: san.urlCredentials !== false,
    },
    outputDir: typeof s.outputDir === 'string' && s.outputDir ? s.outputDir : '',
  };
}

/** 行级时相分解（面板瀑布图；与 phaseSegments 同一套几何，输入是投影行） */
function rowSegments(row) {
  const ph = row.ph || [];
  const segs = [];
  let cursor = row.rs || 0;
  const push = (k, idx) => {
    const v = ph[idx];
    if (v == null || v < 0) return;
    segs.push({ k, s: cursor, d: v });
    cursor += v;
  };
  push('blocked', 0);
  push('dns', 1);
  const connect = ph[2] != null && ph[2] >= 0 ? ph[2] : 0;
  const ssl = ph[3] != null && ph[3] >= 0 ? ph[3] : 0;
  if (connect > 0) {
    segs.push({ k: 'connect', s: cursor, d: connect });
    if (ssl > 0) segs.push({ k: 'ssl', s: cursor + Math.max(0, connect - ssl), d: ssl });
    cursor += connect;
  } else if (ssl > 0) {
    // 异常形态：只有 ssl 无 connect，退化为普通段
    segs.push({ k: 'ssl', s: cursor, d: ssl });
    cursor += ssl;
  }
  push('send', 4);
  push('wait', 5);
  push('receive', 6);
  const spent = cursor - (row.rs || 0);
  if ((row.t || 0) > spent + 1) segs.push({ k: 'gap', s: cursor, d: row.t - spent });
  return segs;
}

function chunkRows(rows, perChunk) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += perChunk) chunks.push(rows.slice(i, i + perChunk));
  return chunks;
}

function makeHist(hists, item) {
  const next = [{ ...item, at: Date.now() }, ...hists.filter((h) => h.path !== item.path)];
  return next.slice(0, HIST_KEEP);
}

// ── 试金石 fixture（内存合成 HAR，全链路零网络）─────────────────────────────
function makeFixtureHar() {
  const base = '2026-11-02T08:00:00.000Z';
  const at = (offsetMs) => new Date(Date.parse(base) + offsetMs).toISOString();
  const hdr = (n, v) => ({ name: n, value: v });
  const entry = (o) => ({
    startedDateTime: o.at,
    time: o.time,
    timings: { blocked: o.blocked == null ? -1 : o.blocked, dns: o.dns == null ? -1 : o.dns, connect: o.connect == null ? -1 : o.connect, ssl: o.ssl == null ? -1 : o.ssl, send: o.send == null ? 1 : o.send, wait: o.wait == null ? 0 : o.wait, receive: o.receive == null ? 0 : o.receive },
    request: {
      method: o.method, url: o.url, httpVersion: 'HTTP/1.1',
      headers: o.reqHeaders || [], queryString: [], cookies: o.reqCookies || [],
      headersSize: 300, bodySize: o.reqBody != null ? o.reqBody.length : 0,
      postData: o.reqBody != null ? { mimeType: o.reqMime || 'application/json', text: o.reqBody } : undefined,
    },
    response: {
      status: o.status, statusText: o.statusText || '', httpVersion: 'HTTP/1.1',
      headers: o.resHeaders || [], cookies: o.resCookies || [],
      content: { size: o.resBody ? o.resBody.length : 0, mimeType: o.resMime || 'application/json', text: o.resBody },
      redirectURL: '', headersSize: 220, bodySize: o.resBody ? o.resBody.length : 0,
      _transferSize: o.transfer != null ? o.transfer : undefined,
    },
    cache: o.cache || {},
    _serverIPAddress: '93.184.216.34',
  });
  return {
    log: {
      version: '1.2',
      creator: { name: 'har-lens fixture', version: '0.1.0' },
      pages: [{ startedDateTime: base, id: 'p1', title: 'fixture page', pageTimings: { onContentLoad: 500, onLoad: 900 } }],
      entries: [
        entry({ at: base, time: 400, wait: 300, receive: 100, method: 'GET', url: 'https://api.example.com/v1/users?access_token=SECRET123&tab=1',
          reqHeaders: [hdr('Authorization', 'Bearer abc.def.ghi'), hdr('Cookie', 'sid=xyz123'), hdr('Accept', 'application/json')],
          status: 200, resHeaders: [hdr('Content-Type', 'application/json')], resBody: '{"users":[{"id":1,"name":"张三"},{"id":2,"name":"李四"}]}', transfer: 2100 }),
        entry({ at: at(50), time: 260, wait: 200, receive: 60, method: 'POST', url: 'https://api.example.com/v1/login',
          reqHeaders: [hdr('Content-Type', 'application/json')], reqBody: '{"user":"u1","password":"hunter2"}',
          status: 200, resHeaders: [hdr('Set-Cookie', 'session=abc123; HttpOnly'), hdr('Content-Type', 'application/json')],
          resBody: '{"ok":true,"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c"}' }),
        entry({ at: at(100), time: 15, wait: 15, method: 'GET', url: 'https://cdn.example.com/app.js',
          status: 304, resHeaders: [hdr('ETag', '"v5"')], resBody: '', cache: { beforeRequest: { lastAccess: base, eTag: '"v5"', hitCount: 3 } } }),
        entry({ at: at(150), time: 380, wait: 300, receive: 80, method: 'GET', url: 'https://api.example.com/v1/users?access_token=SECRET123&tab=1',
          reqHeaders: [hdr('Authorization', 'Bearer abc.def.ghi')], status: 200,
          resHeaders: [hdr('Content-Type', 'application/json')], resBody: '{"users":[{"id":1,"name":"张三"}]}', transfer: 1500 }),
        entry({ at: at(200), time: 1250, wait: 1100, receive: 150, method: 'GET', url: 'https://api.example.com/v1/orders',
          reqHeaders: [hdr('X-Api-Key', 'sk-proj-abcdefghij0123456789ABCD')], status: 500, statusText: 'Server Error',
          resHeaders: [hdr('Content-Type', 'application/json')],
          resBody: '{"error":"db unavailable","retry_hint":"use key sk-proj-abcdefghij0123456789ABCD","dsn":"postgres://admin:s3cret@db.internal:5432/app"}' }),
        entry({ at: at(250), time: 90, wait: 60, receive: 30, method: 'GET', url: 'https://api.example.com/v1/avatar',
          reqHeaders: [hdr('X-Auth-Token', 't0k3n_v4lu3')], status: 404, statusText: 'Not Found', resBody: 'not found', resMime: 'text/plain' }),
      ],
    },
  };
}

module.exports = {
  MAX_FILE_BYTES, MAX_ENTRIES, ROW_CAP, ROWS_PER_CHUNK, URL_TRIM, BODY_PREVIEW_CHARS,
  AUDIT_IDX_CAP, AUDIT_SAMPLES, HIST_KEEP, REPORT_ROW_CAP, MASK,
  SENSITIVE_HEADER_RE, SENSITIVE_PARAM_KEY_RE, PHASE_KEYS, AUDIT_CATS,
  isSensitiveHeaderName, isSensitiveParamKey, maskValue, redactText,
  hostOf, statusClass, pct, compactHeaders, mimeOf, toMs,
  validateHar, phaseSegments, entryFlag, rowOf, rowSegments, analyzeHar, normalizeSettings,
  auditHar, sanitizeHar, DEFAULT_SANITIZE, entryDetail,
  compareHars, chunkRows, makeHist, makeFixtureHar,
};
