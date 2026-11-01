'use strict';
/**
 * core.js —— Webhook 调试台纯函数核心（零依赖，service / mcp / panel 共用）
 *
 * 全部业务规则收敛在此（testing.md：坑先在纯函数层暴露最便宜）：
 *   settings/桶 归一化校验、捕获记录归一化、body 分类与截断、hop-by-hop 过滤、
 *   环形缓冲与 rec 分块写计划、cURL 生成、统计聚合、搜索过滤、LAN 地址挑选。
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

// ── 常量（与服务/面板约定一致，README 同步）────────────────────────────────
const CHUNK_SIZE = 20;                    // whs.rec.<n> 每块条数
const KV_PREVIEW_CAP = 10 * 1024;         // kv 镜像单条 body 预览上限
const REQ_BODY_CAP = 10 * 1024 * 1024;    // 接收请求体上限（超出 413）
const FILE_BODY_DEFAULT_KB = 256;         // JSONL 单条 body 存储默认上限
const FILE_BODY_MAX_KB = 1024;            // 存储上限硬顶
const MAX_BUCKETS = 20;
const MAX_PER_BUCKET_HARD = 500;          // retention.maxPerBucket 硬上限
const PATH_CAP = 2048;
const HEADER_VALUE_CAP = 8 * 1024;
const HEADER_COUNT_CAP = 60;
const RESP_BODY_CAP = 10 * 1024 * 1024;   // 转发响应回传上限
const FORWARD_TIMEOUT_MS = 15 * 1000;

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length',
]);

const TEXT_CONTENT_RE = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|form-urlencoded|yaml|toml|csv|graphql|soap|rss|atom))/i;

// ── id / secret ───────────────────────────────────────────────────────────
/** 捕获 id：时间前缀（字典序≈时间序）+ 随机尾 */
function newId() {
  return `${Date.now().toString(36)}-${randomHex(5)}`;
}
/** 桶 secret：12 位 hex，URL 路径用（不可猜） */
function newSecret() {
  return randomHex(6);
}
function isValidSecret(s) {
  return typeof s === 'string' && /^[0-9a-f]{12}$/.test(s);
}
function isValidBucketId(s) {
  return typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(s);
}

// ── settings / 桶 ─────────────────────────────────────────────────────────
function sanitizeName(s, fallback) {
  const t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 30);
  return t || fallback;
}
/** 校验转发目标：仅 http/https（允许 127.0.0.1/内网——本插件存在的意义），拒绝其它 scheme */
function validateForwardUrl(url) {
  const t = String(url == null ? '' : url).trim();
  if (!t) return { ok: true, url: '' };
  let u;
  try { u = new URL(t); } catch (_) { return { ok: false, error: '不是合法 URL' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `仅支持 http/https（收到 ${u.protocol}）` };
  }
  if (!u.hostname) return { ok: false, error: '缺少主机名' };
  return { ok: true, url: u.toString() };
}
/**
 * 归一化单个桶；非法字段逐项纠正（宽容读：绝不因字段非法丢整桶——
 * forwardUrl 非法 → 清空并降级 fixed，避免静默数据丢失；面板写入前自行验证）。
 */
function normalizeBucket(b) {
  if (!b || typeof b !== 'object') return null;
  if (!isValidBucketId(b.id)) return null;
  if (!isValidSecret(b.secret)) return null;
  const fv = validateForwardUrl(b.forwardUrl);
  const urlOk = fv.ok && fv.url;
  let mode = b.responseMode === 'forward' ? 'forward' : 'fixed';
  if (mode === 'forward' && !urlOk) mode = 'fixed';
  let status = parseInt(b.fixedStatus, 10);
  if (!Number.isInteger(status) || status < 200 || status > 599) status = 200;
  const fixedBody = typeof b.fixedBody === 'string' ? b.fixedBody.slice(0, 4 * 1024) : '';
  return {
    id: b.id,
    name: sanitizeName(b.name, b.id),
    secret: b.secret,
    createdAt: Number(b.createdAt) || 0,
    responseMode: mode,
    fixedStatus: status,
    fixedBody,
    forwardUrl: urlOk ? fv.url : '',
  };
}
function DEFAULT_SETTINGS() {
  return {
    version: 1,
    buckets: [],
    retention: { maxPerBucket: 200, bodyCapKb: FILE_BODY_DEFAULT_KB },
    updatedAt: 0,
  };
}
/**
 * settings 归一化（宽容读、严格写规范形）。
 * 注意：responseMode==='forward' 但 forwardUrl 为空 → 自动降级 'fixed'（诚实纠正）。
 */
function normalizeSettings(raw) {
  const out = DEFAULT_SETTINGS();
  if (!raw || typeof raw !== 'object') return out;
  const buckets = Array.isArray(raw.buckets) ? raw.buckets : [];
  const seen = new Set();
  for (const b of buckets.slice(0, MAX_BUCKETS)) {
    const nb = normalizeBucket(b);
    if (!nb || seen.has(nb.secret) || seen.has(nb.id)) continue;
    seen.add(nb.secret);
    seen.add(nb.id);
    if (nb.responseMode === 'forward' && !nb.forwardUrl) nb.responseMode = 'fixed';
    out.buckets.push(nb);
  }
  const r = raw.retention && typeof raw.retention === 'object' ? raw.retention : {};
  let mpb = parseInt(r.maxPerBucket, 10);
  if (!Number.isFinite(mpb)) mpb = 200;
  out.retention.maxPerBucket = Math.min(MAX_PER_BUCKET_HARD, Math.max(10, mpb));
  let cap = parseInt(r.bodyCapKb, 10);
  if (!Number.isFinite(cap)) cap = FILE_BODY_DEFAULT_KB;
  out.retention.bodyCapKb = Math.min(FILE_BODY_MAX_KB, Math.max(8, cap));
  out.updatedAt = Number(raw.updatedAt) || 0;
  return out;
}
/** 服务首次引导：生成默认桶（settings 键缺失时调用一次） */
function bootstrapSettings(prev) {
  const s = normalizeSettings(prev);
  if (s.buckets.length === 0) {
    s.buckets.push({
      id: 'default',
      name: '默认桶',
      secret: newSecret(),
      createdAt: Date.now(),
      responseMode: 'fixed',
      fixedStatus: 200,
      fixedBody: '',
      forwardUrl: '',
    });
  }
  s.updatedAt = Date.now();
  return s;
}

// ── 捕获记录 ──────────────────────────────────────────────────────────────
/**
 * body 分类与截断：文本类 content-type（或缺省）按 utf8 解码为 bodyText；
 * 解码后替换符占比过高判为二进制 → bodyBase64。超出 capBytes 截断并标 truncated。
 */
function classifyBody(contentType, buf, capBytes) {
  const size = buf ? buf.length : 0;
  const cap = Math.max(1, capBytes);
  if (!buf || size === 0) {
    return { kind: 'empty', size: 0, truncated: false, bodyText: '', bodyBase64: '' };
  }
  const ct = String(contentType || '');
  const looksText = !ct || TEXT_CONTENT_RE.test(ct);
  const slice = buf.slice(0, cap);
  let truncated = size > cap;
  if (looksText) {
    const text = slice.toString('utf8');
    const bad = (text.match(/\ufffd/g) || []).length;
    // 容忍 ≤2 个替换符（capBytes 截断可能切断多字节字符尾部）；更多即判定二进制
    if (bad > Math.max(2, text.length * 0.02)) {
      // 文本声明但解码稀烂 → 按二进制处理
      return { kind: 'binary', size, truncated, bodyText: '', bodyBase64: slice.toString('base64') };
    }
    return { kind: 'text', size, truncated, bodyText: text, bodyBase64: '' };
  }
  return { kind: 'binary', size, truncated, bodyText: '', bodyBase64: slice.toString('base64') };
}
/** 头归一化：键小写、值截断、数量截断（含重复头合并为逗号串） */
function normalizeHeaders(headers) {
  const out = {};
  let n = 0;
  const raw = headers || {};
  for (const k of Object.keys(raw)) {
    if (n >= HEADER_COUNT_CAP) break;
    const v = Array.isArray(raw[k]) ? raw[k].join(', ') : String(raw[k] == null ? '' : raw[k]);
    out[k.toLowerCase()] = v.slice(0, HEADER_VALUE_CAP);
    n += 1;
  }
  return out;
}
/**
 * 归一化一条入站请求为捕获记录（不含 body；body 由 classifyBody 结果并入）。
 * method 大写、path/query 截断、headers 归一化。id/receivedAt 缺省即生成。
 */
function normalizeCapture(input) {
  const i = input || {};
  return {
    id: i.id || newId(),
    bucketId: isValidBucketId(i.bucketId) ? i.bucketId : '',
    method: String(i.method || 'GET').toUpperCase().slice(0, 16),
    path: String(i.path || '/').slice(0, PATH_CAP),
    query: String(i.query || '').slice(0, PATH_CAP),
    headers: normalizeHeaders(i.headers),
    sourceIp: String(i.sourceIp || '').slice(0, 64),
    receivedAt: Number(i.receivedAt) || Date.now(),
    contentType: String(i.contentType || ''),
    kind: i.kind || 'empty',
    size: Math.max(0, Number(i.size) || 0),
    truncated: i.truncated === true,
    bodyText: typeof i.bodyText === 'string' ? i.bodyText : '',
    bodyBase64: typeof i.bodyBase64 === 'string' ? i.bodyBase64 : '',
    responded: i.responded || null,   // {status, mode}
    forward: i.forward || null,       // {url, status, ok, latencyMs, error, bodyPreview}
  };
}
/** 去除 hop-by-hop 头（转发/重放用；content-length 由 node 重算） */
function filterForwardHeaders(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = headers[k];
  }
  return out;
}
/** 捕获记录的 kv 预览形态（剥掉超长 body，附派生展示字段） */
function previewForKv(rec, cap) {
  const c = Math.max(1, Math.min(cap || KV_PREVIEW_CAP, KV_PREVIEW_CAP));
  let bodyText = '';
  let bodyBase64 = '';
  let previewTruncated = rec.truncated === true;
  if (rec.kind === 'text') {
    bodyText = rec.bodyText || '';
    if (bodyText.length > c) { bodyText = bodyText.slice(0, c); previewTruncated = true; }
  } else if (rec.kind === 'binary') {
    if ((rec.bodyBase64 || '').length > c) { bodyBase64 = rec.bodyBase64.slice(0, c); previewTruncated = true; }
    else bodyBase64 = rec.bodyBase64 || '';
  }
  return {
    id: rec.id, bucketId: rec.bucketId, method: rec.method, path: rec.path, query: rec.query,
    headers: rec.headers, sourceIp: rec.sourceIp, receivedAt: rec.receivedAt,
    contentType: rec.contentType, kind: rec.kind, size: rec.size,
    truncated: rec.truncated, previewTruncated,
    bodyText, bodyBase64,
    responded: rec.responded, forward: rec.forward,
  };
}
/** 桶 URL（host: port 形态由调用方给） */
function bucketPath(bucket) {
  return `/hook/${bucket.secret}`;
}
function pickLanIp(ifaces) {
  const all = [];
  for (const name of Object.keys(ifaces || {})) {
    for (const f of ifaces[name] || []) {
      if (f.family === 'IPv4' && !f.internal) all.push(f.address);
    }
  }
  // 优先 192.168 → 10. → 172. → 其余
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  all.sort((a, b) => rank(a) - rank(b));
  return all[0] || '';
}

// ── 环形缓冲与 rec 分块（服务单写者）───────────────────────────────────────
/**
 * 入队一条捕获（新的在头），按桶限淘汰最旧。
 * @returns {{ring: Array, evicted: number}}
 */
function applyCapture(ring, rec, maxPerBucket) {
  const limit = Math.max(1, Math.min(maxPerBucket || 200, MAX_PER_BUCKET_HARD));
  const next = [rec, ...ring]; // 头=最新
  const counts = new Map();
  const keep = [];
  let evicted = 0;
  // 从新到旧扫：每桶保留最新 limit 条，更旧的淘汰
  for (let i = 0; i < next.length; i++) {
    const r = next[i];
    const c = counts.get(r.bucketId) || 0;
    if (c >= limit) { evicted += 1; continue; }
    counts.set(r.bucketId, c + 1);
    keep.push(r);
  }
  return { ring: keep, evicted }; // 头=最新
}
/**
 * 计算分块写计划（先删后写语义由调用方执行）：
 * 返回 [{key, value}]，value=null 表示该块应删除。
 * ring 头块 = rec.0（最新）。
 */
function planChunkWrites(ring, prevChunkCount) {
  const need = Math.ceil(ring.length / CHUNK_SIZE);
  const plan = [];
  for (let i = 0; i < need; i++) {
    plan.push({ key: `whs.rec.${i}`, value: ring.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map((r) => previewForKv(r)) });
  }
  for (let i = need; i < (prevChunkCount || 0); i++) {
    plan.push({ key: `whs.rec.${i}`, value: null });
  }
  return plan;
}
/** 读侧：分块 map（key → 数组）合并为按时间倒序的 ring（面板/MCP 用） */
function readRing(chunksMap) {
  const ring = [];
  for (const key of Object.keys(chunksMap || {})) {
    const arr = chunksMap[key];
    if (Array.isArray(arr)) ring.push(...arr.filter((r) => r && r.id));
  }
  ring.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return ring;
}

// ── 展示与导出 ────────────────────────────────────────────────────────────
/** body 尝试 JSON 美化（失败原样返回） */
function prettyBodyText(s) {
  if (typeof s !== 'string' || !s) return s || '';
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object') return JSON.stringify(j, null, 2);
  } catch (_) { /* 非 JSON 原样 */ }
  return s;
}
/** 生成 cURL 命令（hostPort 形如 127.0.0.1:9869） */
function toCurl(rec, hostPort) {
  const q = rec.query ? `?${rec.query}` : '';
  const url = `http://${hostPort}${rec.path}${q}`;
  const parts = [`curl -X ${rec.method}`, `'${url}'`];
  for (const [k, v] of Object.entries(rec.headers || {})) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'content-length' || lk === 'connection') continue;
    parts.push(`-H '${k}: ${String(v).replace(/'/g, `'\\''`)}'`);
  }
  if (rec.kind === 'text' && rec.bodyText) {
    parts.push(`--data '${rec.bodyText.replace(/'/g, `'\\''`)}'`);
  } else if (rec.kind === 'binary' && rec.bodyBase64) {
    parts.push(`# 二进制体 ${rec.size}B：--data-binary @file.bin（base64 已存记录）`);
  }
  return parts.join(' ');
}
/** 单行摘要（MCP 列表/冒烟断言用） */
function summarizeRec(rec) {
  const t = new Date(rec.receivedAt || 0).toISOString().slice(5, 19).replace('T', ' ');
  const fwd = rec.forward
    ? (rec.forward.ok ? ` →转发${rec.forward.status}(${rec.forward.latencyMs}ms)` : ` →转发失败:${rec.forward.error || ''}`)
    : '';
  return `${t} ${rec.method} ${rec.path}${rec.query ? `?${rec.query}` : ''} [${rec.bucketId}] ${rec.responded ? rec.responded.status : '-'}${fwd} id=${rec.id}`;
}
/** 搜索：path/method/body/sourceIp 子串（大小写不敏感） */
function matchSearch(rec, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return true;
  const hay = `${rec.path} ${rec.query} ${rec.method} ${rec.sourceIp} ${rec.kind === 'text' ? rec.bodyText : ''}`.toLowerCase();
  return hay.includes(t);
}

// ── 统计 ──────────────────────────────────────────────────────────────────
function statusBucketOf(rec) {
  const s = rec.responded && rec.responded.status;
  if (!s) return '其他';
  if (s < 300) return '2xx';
  if (s < 400) return '3xx';
  if (s < 500) return '4xx';
  return '5xx';
}
/**
 * 聚合统计。byHour 为最近 24 小时逐小时计数（索引 0 = 23h 前，索引 23 = 当前小时）。
 */
function aggregateStats(recs, now) {
  const n = now || Date.now();
  const hourMs = 3600 * 1000;
  const byHour = new Array(24).fill(0);
  const byStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 其他: 0 };
  const byMethod = {};
  const byBucket = {};
  const pathCount = new Map();
  for (const r of recs || []) {
    const at = Number(r.receivedAt) || 0;
    if (at > n - 24 * hourMs && at <= n) {
      byHour[23 - Math.floor((n - at) / hourMs)] += 1;
    }
    byStatus[statusBucketOf(r)] += 1;
    byMethod[r.method] = (byMethod[r.method] || 0) + 1;
    byBucket[r.bucketId] = (byBucket[r.bucketId] || 0) + 1;
    pathCount.set(r.path, (pathCount.get(r.path) || 0) + 1);
  }
  const topPaths = [...pathCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }));
  return { total: (recs || []).length, byStatus, byMethod, byBucket, byHour, topPaths };
}

/** JSONL 一行解析（坏行跳过返回 null；rotate 后的行同样适用） */
function parseJsonlLine(line) {
  const t = String(line || '').trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t);
    return j && typeof j === 'object' && j.id ? j : null;
  } catch (_) { return null; }
}

module.exports = {
  // 常量
  CHUNK_SIZE, KV_PREVIEW_CAP, REQ_BODY_CAP, FILE_BODY_DEFAULT_KB, FILE_BODY_MAX_KB,
  MAX_BUCKETS, MAX_PER_BUCKET_HARD, RESP_BODY_CAP, FORWARD_TIMEOUT_MS, HOP_BY_HOP, PATH_CAP,
  // id / secret
  newId, newSecret, isValidSecret, isValidBucketId,
  // settings
  DEFAULT_SETTINGS, normalizeSettings, normalizeBucket, bootstrapSettings,
  validateForwardUrl, sanitizeName, bucketPath, pickLanIp,
  // 捕获
  classifyBody, normalizeCapture, normalizeHeaders, filterForwardHeaders, previewForKv,
  // ring / chunk
  applyCapture, planChunkWrites, readRing,
  // 展示
  prettyBodyText, toCurl, summarizeRec, matchSearch, statusBucketOf, aggregateStats,
  parseJsonlLine,
};
