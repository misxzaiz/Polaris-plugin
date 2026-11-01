'use strict';
/**
 * exec-core.js —— 任务载荷校验 / 出口掩码 / 历史分块（纯函数、零依赖）
 *
 * 安全语义：
 *  - http 任务：仅 http/https；默认拒私网（loopback/RFC1918/CGNAT/链路本地/
 *    组播/localhost/.local），allowPrivate:true 显式放行——本机服务心跳是
 *    定时任务平台的合法场景，与「抓公网网页」类插件的硬拒绝语义不同（设计
 *    取舍记录于 docs/task-runner-plan.md §3.4）。
 *  - command 任务：创建与手动执行强制 confirm（面板勾选 + MCP 双闸）。
 *  - ai 任务：apiKey 只存本插件 kv（与 llm-probe 同信任域），一切出口掩码。
 *  - 数量/体积护栏：任务数、prompt、命令、响应摘录均有上限，防 kv 膨胀。
 */

const engine = require('./engine');

const JOB_TYPES = engine.JOB_TYPES;
const MAX_JOBS = 100;
const RUN_CHUNK_SIZE = 25; // 每块 25 条，单块 ≈ ≤115KB < 256KB 单值建议上限
const EXCERPT_CAP = 4 * 1024; // 历史里保存的输出/响应摘录上限（字节）
const SUMMARY_CAP = 200;

// ── 通用小工具 ───────────────────────────────────────────────────────────────

function clampInt(v, lo, hi, dft) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dft;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function strLimit(s, cap) {
  const t = String(s == null ? '' : s);
  return t.length <= cap ? t : t.slice(0, cap);
}

function tailBytes(s, cap) {
  const t = String(s == null ? '' : s);
  if (t.length <= cap) return t;
  return '…' + t.slice(t.length - (cap - 1));
}

function maskSecret(s) {
  const t = String(s == null ? '' : s);
  if (!t) return '';
  if (t.length <= 8) return '****';
  return '****' + t.slice(-4);
}

function maskProviders(list) {
  return (Array.isArray(list) ? list : []).map((p) => ({
    ...p,
    apiKey: maskSecret(p && p.apiKey),
  }));
}

// ── 私网判定（SSRF 分级闸）──────────────────────────────────────────────────

/** @returns {boolean} true = 视为私网/保留地址（默认拒绝，allowPrivate 放行） */
function isPrivateUrl(u) {
  let url;
  try {
    url = new URL(String(u || ''));
  } catch (_) {
    return true; // 解析失败一律按私网拒
  }
  const proto = (url.protocol || '').toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') return true;
  let host = (url.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || /\.(local|lan|internal)$/.test(host)) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (host.includes(':')) {
    if (/^(f[cd]|fe80)/i.test(host)) return true; // IPv6 UFC/链路本地
    return false;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o.some((x) => !Number.isInteger(x) || x > 255)) return true; // 畸形地址拒
    const [a, b] = o;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播/保留
  }
  return false;
}

// ── 载荷归一化（返回 {ok,value} | {ok:false,error}）─────────────────────────

function normalizeNotifyPayload(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const message = String(r.message || '').trim();
  if (!message) return { ok: false, error: '提醒内容不能为空' };
  if (message.length > 2000) return { ok: false, error: '提醒内容过长（≤2000 字）' };
  return { ok: true, value: { message } };
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'];

function normalizeHttpPayload(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  let url;
  try {
    url = new URL(String(r.url || '').trim());
  } catch (_) {
    return { ok: false, error: 'URL 无法解析' };
  }
  const proto = url.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    return { ok: false, error: '仅支持 http/https' };
  }
  const method = HTTP_METHODS.includes(String(r.method || 'GET').toUpperCase())
    ? String(r.method).toUpperCase() : 'GET';
  let headers = {};
  if (r.headers != null && typeof r.headers === 'object' && !Array.isArray(r.headers)) {
    const entries = Object.entries(r.headers);
    if (entries.length > 16) return { ok: false, error: '请求头过多（≤16 个）' };
    for (const [k, v] of entries) {
      const key = String(k).trim();
      const val = String(v);
      if (!key || key.length > 128) return { ok: false, error: '请求头名非法或过长' };
      if (val.length > 2048) return { ok: false, error: `请求头 ${key} 值过长` };
      headers[key] = val;
    }
  }
  let body = r.body == null ? '' : String(r.body);
  if (body.length > 64 * 1024) return { ok: false, error: '请求体过大（≤64KB）' };
  if ((method === 'GET' || method === 'HEAD') && body) {
    return { ok: false, error: 'GET/HEAD 不支持请求体' };
  }
  const allowPrivate = r.allowPrivate === true;
  return {
    ok: true,
    value: { url: url.toString(), method, headers, body: body || '', allowPrivate },
  };
}

function normalizeAiPayload(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const providerId = String(r.providerId || '').trim();
  if (!providerId) return { ok: false, error: '须选择 AI 供应商' };
  const prompt = String(r.prompt || '').trim();
  if (!prompt) return { ok: false, error: '提示词不能为空' };
  if (prompt.length > 8000) return { ok: false, error: '提示词过长（≤8000 字）' };
  let system = String(r.system || '').trim();
  if (system.length > 4000) return { ok: false, error: '系统提示过长（≤4000 字）' };
  return { ok: true, value: { providerId, prompt, system, maxTokens: clampInt(r.maxTokens, 16, 4096, 1024) } };
}

function normalizeCommandPayload(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const shell = r.shell === 'cmd' ? 'cmd' : 'powershell';
  const command = String(r.command || '').trim();
  if (!command) return { ok: false, error: '命令不能为空' };
  if (command.length > 8000) return { ok: false, error: '命令过长（≤8000 字）' };
  return { ok: true, value: { shell, command } };
}

const PAYLOAD_NORMALIZERS = {
  notify: normalizeNotifyPayload,
  http: normalizeHttpPayload,
  ai: normalizeAiPayload,
  command: normalizeCommandPayload,
};

/** 任务归一化（新增/编辑共用）。返回 {ok, job} | {ok:false, error} */
function normalizeJob(raw, genId) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const name = String(r.name || '').trim();
  if (!name) return { ok: false, error: '任务名不能为空' };
  if (name.length > 80) return { ok: false, error: '任务名过长（≤80 字）' };
  const type = String(r.type || '');
  if (!JOB_TYPES.includes(type)) {
    return { ok: false, error: `任务类型须为 ${JOB_TYPES.join('/')}` };
  }
  const sched = engine.normalizeSchedule(r.schedule);
  if (!sched.ok) return { ok: false, error: sched.error };
  const payload = PAYLOAD_NORMALIZERS[type](r.payload);
  if (!payload.ok) return { ok: false, error: payload.error };
  const now = Date.now();
  const job = {
    id: String(r.id || genId()),
    name,
    type,
    schedule: sched.schedule,
    payload: payload.value,
    enabled: r.enabled !== false,
    createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
    updatedAt: now,
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: null,
    lastSummary: '',
  };
  return { ok: true, job };
}

// ── 设置归一化 ───────────────────────────────────────────────────────────────

function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    retentionRuns: clampInt(r.retentionRuns, 50, 1000, 200),
    timeoutCommandSec: clampInt(r.timeoutCommandSec, 5, 600, 120),
    timeoutHttpSec: clampInt(r.timeoutHttpSec, 3, 300, 30),
    timeoutAiSec: clampInt(r.timeoutAiSec, 5, 600, 120),
  };
}

// ── 历史分块 ────────────────────────────────────────────────────────────────

/** 单条运行记录（服务端构造，保证体积上限） */
function makeRun(o) {
  return {
    id: String(o.id || ''),
    jobId: String(o.jobId || ''),
    jobName: strLimit(o.jobName, 80),
    type: o.type,
    trigger: o.trigger === 'manual' ? 'manual' : 'auto',
    missed: o.missed === true,
    status: o.status === 'ok' ? 'ok' : o.status === 'timeout' ? 'timeout' : 'fail',
    summary: strLimit(o.summary, SUMMARY_CAP),
    excerpt: o.excerpt == null ? '' : tailBytes(String(o.excerpt), EXCERPT_CAP),
    startedAt: Number.isFinite(o.startedAt) ? o.startedAt : Date.now(),
    durationMs: clampInt(o.durationMs, 0, 24 * 3600 * 1000, 0),
  };
}

/** 追加一条到分块存储计划。chunks: {list:[runs[]], idx:{chunkCount,total}} */
function planRunAppend(chunkRuns, run, retentionRuns) {
  const keep = [...chunkRuns, run];
  if (keep.length <= RUN_CHUNK_SIZE) {
    return { lastChunk: keep, overflow: null };
  }
  return { lastChunk: keep.slice(0, RUN_CHUNK_SIZE), overflow: keep.slice(RUN_CHUNK_SIZE) };
}

/** 保留策略应保留的块数 */
function retentionChunks(retentionRuns) {
  return Math.max(1, Math.ceil(clampInt(retentionRuns, 50, 1000, 200) / RUN_CHUNK_SIZE));
}

/** AI/面板出口掩码：运行记录不含敏感值，但历史摘要里兜底再过一遍 key 形态 */
function maskProviderForDisplay(p) {
  if (!p || typeof p !== 'object') return p;
  return { ...p, apiKey: maskSecret(p.apiKey) };
}

module.exports = {
  JOB_TYPES,
  MAX_JOBS,
  RUN_CHUNK_SIZE,
  EXCERPT_CAP,
  SUMMARY_CAP,
  HTTP_METHODS,
  clampInt,
  strLimit,
  tailBytes,
  maskSecret,
  maskProviders,
  maskProviderForDisplay,
  isPrivateUrl,
  normalizeNotifyPayload,
  normalizeHttpPayload,
  normalizeAiPayload,
  normalizeCommandPayload,
  normalizeJob,
  normalizeSettings,
  makeRun,
  planRunAppend,
  retentionChunks,
};
