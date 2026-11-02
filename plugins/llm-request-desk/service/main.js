'use strict';
/**
 * main.js —— LLM 请求调试台后台服务（零依赖，node >= 18.15）
 *
 * 单写者权威：llmdesk.meta / llmdesk.endpoints / llmdesk.latest /
 * llmdesk.req.* / llmdesk.history / llmdesk.settings 全部只由本服务写。
 * 面板与 MCP 经 llmdesk.cmd 单槽信箱表达意图（{nonce, action, payload}）；
 * 服务轮询 get → delete 消费，结果写 llmdesk.res（nonce 对齐）+ 持久态键。
 *
 * 安全分层（与 house 契约一致）：
 *   - 完整 apiKey 只存在于服务内存与手动档案本地文件
 *     （{{appConfigDir}}/llm-request-desk/endpoints.json，与宿主 config.json 同信任域）；
 *   - 宿主端点导入 = 只读宿主 config.json 的 modelProfiles[]/providerGroups[]
 *     （服务与后端同机；cap.config 通道 Remote 来源会掩码 key，读不到原文）；
 *   - 落 kv / 进日志 / 返回 AI 的一切均为掩码形态（****last4）；
 *   - 请求体不含 key（key 只在 header），可全文落 kv 供复盘；
 *   - AI 通道护栏：maxTokens 缺省/上限 256（显式 confirm 才放宽）、请求体 ≤1MB、
 *     只能对已保存端点发请求；面板通道上限 32768。
 *
 * 生命周期：宿主 type=http + /__health（恒 200，降级也保活）；
 * 桥不可达 → degraded 心跳，60s 重试自发现，绝不自饿死。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/request-core');

const VERSION = core.VERSION;
const TICK_MS = 1200;
const META_BEAT_MS = 60 * 1000;
const KEEP_REQ = 30;               // 保留最近 N 份完整请求记录
const HISTORY_MAX = 60;
const QUEUE_MAX = 4;
const BODY_LIMIT = 1024 * 1024;    // 请求体上限 1MB
const RESP_KEEP = 20 * 1024;       // 响应文本落 kv 截断
const TIMELINE_MAX = 400;          // SSE 时间线落 kv 截断条数
const DEFAULT_TIMEOUT_MS = 60000;
const STREAM_TIMEOUT_MS = 180000;

const K = {
  meta: 'llmdesk.meta',
  endpoints: 'llmdesk.endpoints',
  latest: 'llmdesk.latest',
  req: (id) => `llmdesk.req.${id}`,
  reqPrefix: 'llmdesk.req.',
  history: 'llmdesk.history',
  settings: 'llmdesk.settings',
  cmd: 'llmdesk.cmd',
  res: 'llmdesk.res',
};

// ── 日志（自落盘 + 512KB 轮转；绝不落 apiKey 与请求体全文）──────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), 'llm-request-desk');
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[llm-request-desk:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) {
    try {
      let st = { size: 0 };
      try { st = fs.statSync(logFile); } catch (_) { /* 首次 */ }
      if (st.size > 512 * 1024) fs.writeFileSync(logFile, '');
      fs.appendFileSync(logFile, line + '\n');
    } catch (_) { /* 日志失败不影响业务 */ }
  }
}

// ── 状态 ────────────────────────────────────────────────────────────────────
const state = {
  appConfigDir: '',
  kv: null,
  degraded: false,
  lastBridgeErr: null,
  lastCmdNonce: '',
  queue: [],
  running: null,      // { reqId, endpointName, startedAt, abort }
  settings: { timeoutMs: DEFAULT_TIMEOUT_MS },
};

// ── 端点档案 ────────────────────────────────────────────────────────────────
/** 内存端点（含完整 key；绝不落 kv） */
const endpoints = new Map();

function endpointsFilePath() {
  return path.join(state.appConfigDir || os.tmpdir(), 'llm-request-desk', 'endpoints.json');
}

function loadManualEndpoints() {
  try {
    const raw = JSON.parse(fs.readFileSync(endpointsFilePath(), 'utf8'));
    for (const p of (Array.isArray(raw) ? raw : [])) {
      if (p && p.id && p.baseUrl) endpoints.set(p.id, sanitizeEndpoint(p, 'manual'));
    }
    log('info', `手动端点载入 ${endpoints.size} 条`);
  } catch (_) { /* 首次/无文件 */ }
}

function saveManualEndpoints() {
  const list = [...endpoints.values()].filter((p) => p.source === 'manual');
  const file = endpointsFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    log('warn', `手动端点保存失败（内存仍有效）：${e.message}`);
    return false;
  }
  return true;
}

function sanitizeEndpoint(p, source) {
  return {
    id: String(p.id || '').slice(0, 64),
    name: String(p.name || '未命名').slice(0, 80),
    baseUrl: String(p.baseUrl || '').trim(),
    apiKey: String(p.apiKey || ''),
    pathOverride: String(p.pathOverride || '').trim(),
    anthropicVersion: String(p.anthropicVersion || '2023-06-01'),
    wire: p.wire === core.WIRE_ANTHROPIC ? core.WIRE_ANTHROPIC : core.WIRE_OPENAI,
    source: source === 'host' ? 'host' : 'manual',
    importedAt: p.importedAt || new Date().toISOString(),
  };
}

/** 宿主 config.json 定位（与 kvclient 候选序一致） */
function hostConfigCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* 跳过 */ }
  }
  if (state.appConfigDir) cands.push(path.join(state.appConfigDir, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

/** 导入宿主端点（幂等 upsert；手动档案不被覆盖） */
function importHostEndpoints() {
  let imported = 0;
  let seenFile = null;
  for (const p of hostConfigCandidates()) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const list = Array.isArray(cfg.modelProfiles) ? cfg.modelProfiles : [];
      seenFile = p;
      for (const m of list) {
        if (!m || !m.baseUrl) continue;
        const id = `host-${String(m.id || crypto.createHash('md5').update(String(m.baseUrl) + String(m.model)).digest('hex').slice(0, 10))}`;
        const existing = endpoints.get(id);
        if (existing && existing.source === 'manual') continue;
        endpoints.set(id, sanitizeEndpoint({
          id,
          name: m.name || m.id || '宿主端点',
          baseUrl: m.baseUrl,
          apiKey: m.apiKey,
          wire: m.wireApi === 'openai-chat-completions' ? core.WIRE_OPENAI : core.WIRE_ANTHROPIC,
          importedAt: new Date().toISOString(),
        }, 'host'));
        imported += 1;
      }
      const groups = Array.isArray(cfg.providerGroups) ? cfg.providerGroups : [];
      for (const g of groups) {
        for (const mem of (Array.isArray(g.members) ? g.members : [])) {
          const keys = Array.isArray(mem.keys) ? mem.keys : (mem.key ? [mem.key] : []);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!k || !mem.baseUrl) continue;
            const id = `hostgrp-${crypto.createHash('md5').update(String(mem.baseUrl) + String(k) + String(i)).digest('hex').slice(0, 10)}`;
            if (endpoints.has(id)) continue;
            endpoints.set(id, sanitizeEndpoint({
              id,
              name: `${g.name || '分组'}·${mem.name || mem.profileId || '成员'}${keys.length > 1 ? `#${i + 1}` : ''}`,
              baseUrl: mem.baseUrl,
              apiKey: typeof k === 'string' ? k : '',
              model: mem.model || g.defaultModel || '',
              wire: mem.wireApi === 'openai-chat-completions' ? core.WIRE_OPENAI : core.WIRE_ANTHROPIC,
              importedAt: new Date().toISOString(),
            }, 'host'));
            imported += 1;
          }
        }
      }
      if (list.length || groups.length) break;
    } catch (_) { /* 下一候选 */ }
  }
  log('info', `宿主端点导入 ${imported} 条（总数 ${endpoints.size}）${seenFile ? ` @ ${seenFile}` : ''}`);
  return { imported, total: endpoints.size, configFile: seenFile || '' };
}

function maskedEndpoints() {
  return [...endpoints.values()].map((p) => ({
    id: p.id, name: p.name, baseUrl: p.baseUrl, wire: p.wire,
    pathOverride: p.pathOverride, anthropicVersion: p.anthropicVersion,
    keyMask: core.maskKey(p.apiKey), source: p.source, importedAt: p.importedAt,
  }));
}

// ── kv 持久态 ───────────────────────────────────────────────────────────────
async function kvSet(key, value) { await state.kv.kvSet(key, value); }

async function publishEndpoints() {
  await kvSet(K.endpoints, { at: new Date().toISOString(), items: maskedEndpoints() });
}

async function loadHistory() {
  try {
    const v = await state.kv.kvGet(K.history);
    return Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
  } catch (_) { return []; }
}

async function pushHistory(entry) {
  const h = await loadHistory();
  h.unshift(entry);
  await kvSet(K.history, h.slice(0, HISTORY_MAX));
}

async function loadSettings() {
  try {
    const v = await state.kv.kvGet(K.settings);
    if (v && typeof v === 'object' && Number(v.timeoutMs) >= 5000) {
      state.settings = { timeoutMs: Math.min(Number(v.timeoutMs), 300000) };
    }
  } catch (_) { /* 默认 */ }
}

// ── 请求执行 ────────────────────────────────────────────────────────────────
function newReqId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function sanitizeDraft(draft) {
  const d = draft && typeof draft === 'object' ? draft : {};
  const out = { model: String(d.model || '').trim(), system: d.system == null ? '' : String(d.system).slice(0, 100000), messages: [], stream: !!d.stream };
  if (d.maxTokens != null && Number.isFinite(Number(d.maxTokens))) out.maxTokens = Math.max(1, Math.round(Number(d.maxTokens)));
  if (d.temperature != null && Number.isFinite(Number(d.temperature))) out.temperature = Number(d.temperature);
  if (d.topP != null && Number.isFinite(Number(d.topP))) out.topP = Number(d.topP);
  if (d.stop != null) out.stop = d.stop;
  if (Array.isArray(d.tools)) out.tools = d.tools;
  if (d.toolChoice) out.toolChoice = d.toolChoice;
  if (d.extra && typeof d.extra === 'object') out.extra = d.extra;
  if (d.rawBody && typeof d.rawBody === 'object') out.rawBody = d.rawBody;
  for (const m of (Array.isArray(d.messages) ? d.messages : [])) {
    if (!m) continue;
    out.messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content == null ? '' : String(m.content).slice(0, 500000) });
  }
  return out;
}

/**
 * 执行一次真实请求：构造 → 预检 → fetch（流式逐 chunk 解析）→ 解析 → 诊断 → 落库。
 * cap：{ maxTokensMax, requireConfirm } —— AI 通道限 256，面板通道 32768。
 */
async function executeSend(payload) {
  const ep = endpoints.get(String(payload.endpointId || ''));
  if (!ep) return { ok: false, error: `端点不存在：${payload.endpointId}（先「导入宿主端点」或手动添加）` };
  const cap = payload.cap && typeof payload.cap === 'object' ? payload.cap : {};
  const maxTokensMax = Math.min(Math.max(Number(cap.maxTokensMax) || 32768, 1), 32768);
  const draft = sanitizeDraft(payload.draft || {});
  if (cap.maxTokensMax) {
    if (draft.maxTokens == null) draft.maxTokens = Math.min(256, maxTokensMax);
    else draft.maxTokens = Math.min(draft.maxTokens, maxTokensMax);
  }

  const built = core.buildRequest(ep, draft);
  const bodyStr = JSON.stringify(built.body);
  if (bodyStr.length > BODY_LIMIT) return { ok: false, error: `请求体 ${(bodyStr.length / 1024).toFixed(0)}KB 超过 1MB 上限，请裁剪 messages` };

  // 发送前预检：校验「实际发送体」（rawBody 模式即用户手写的体），结构性错误直接拦截（省一次必然的 400）
  const pre = core.validatePayload(built.wire, built.body);
  if (!pre.ok && !payload.force) {
    return { ok: false, precheck: pre, error: `预检未通过：${pre.errors.join('；')}`, findings: pre.errors.map((e) => ({ id: 'precheck', severity: 'error', title: '预检拦截', detail: e, fix: '修正后重发，或带 force:true 强制发送' })) };
  }

  const reqId = newReqId();
  const abort = new AbortController();
  const isStream = !!built.body.stream;
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs) || state.settings.timeoutMs, 3000), 300000);
  const timer = setTimeout(() => abort.abort(new Error(`超时 ${timeoutMs}ms（可在设置调整）`)), isStream ? Math.max(timeoutMs, STREAM_TIMEOUT_MS) : timeoutMs);
  state.running = { reqId, endpointName: ep.name, startedAt: Date.now(), abort };

  const startedAt = Date.now();
  let status = 0;
  let respText = '';
  let respHeaders = {};
  let streamInfo = null;
  let timeline = [];
  let fetchErr = null;

  try {
    const res = await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: bodyStr,
      signal: abort.signal,
    });
    status = res.status;
    respHeaders = Object.fromEntries([...res.headers.entries()]);
    if (isStream && res.body && typeof res.body.getReader === 'function') {
      const parser = core.createSSEParser(built.wire);
      const agg = core.createStreamAggregator();
      const reader = res.body.getReader();
      const t0 = Date.now();
      const dec = new TextDecoder();
      let respContentType = String(respHeaders['content-type'] || '');
      if (/application\/json/i.test(respContentType)) {
        // 端点忽略 stream=true 返回整包 JSON（诊断规则 stream-downgraded 的执行层对照）
        respText = (await res.text()).slice(0, RESP_KEEP * 2);
      } else {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = dec.decode(value, { stream: true });
          const evs = parser.feed(chunkText);
          const bytes = value.byteLength;
          if (timeline.length < TIMELINE_MAX) timeline.push({ dt: Date.now() - t0, bytes, preview: chunkText.length > 80 ? chunkText.slice(0, 80) + '…' : chunkText });
          for (const e of (Array.isArray(evs) ? evs : [evs])) agg.add(e, bytes);
        }
        for (const e of parser.flush()) agg.add(e, 0);
        agg.end();
        streamInfo = agg.summary;
      }
    } else {
      respText = (await res.text()).slice(0, RESP_KEEP * 2);
    }
  } catch (e) {
    fetchErr = String((e && e.message) || e);
  } finally {
    clearTimeout(timer);
    if (state.running && state.running.reqId === reqId) state.running = null;
  }

  const ms = Date.now() - startedAt;
  const parsedError = status && (status < 200 || status >= 300) ? core.parseErrorBody(status, respText, respHeaders) : null;
  const findings = fetchErr
    ? [{ id: 'network-error', severity: 'error', title: '请求未到达端点（网络层失败）', detail: fetchErr, fix: '检查 baseUrl 可达性、代理/防火墙、DNS；本机端点确认服务已启动。' }]
    : core.diagnose({
        wire: built.wire, url: built.url, reqBody: built.body, status,
        respText, parsedError, streamInfo, requestedStream: isStream,
      });

  // 提取正文（非流式）
  let content = null;
  if (!streamInfo && status >= 200 && status < 300 && respText) {
    try {
      const j = JSON.parse(respText);
      if (built.wire === core.WIRE_ANTHROPIC) {
        content = Array.isArray(j.content) ? j.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('') : null;
      } else {
        const ch = j.choices && j.choices[0];
        content = ch && ch.message && typeof ch.message.content === 'string' ? ch.message.content : null;
      }
    } catch (_) { /* 非 JSON 响应 */ }
  }

  const record = {
    reqId,
    at: new Date().toISOString(),
    endpoint: { id: ep.id, name: ep.name, baseUrl: ep.baseUrl, wire: built.wire, keyMask: core.maskKey(ep.apiKey) },
    url: built.url,
    body: built.body,
    maskedHeaders: built.maskedHeaders,
    status,
    ms,
    stream: isStream,
    streamInfo,
    timeline,
    respText: respText.slice(0, RESP_KEEP),
    parsedError,
    content,
    findings,
    ok: !fetchErr && status >= 200 && status < 300 && !(streamInfo && streamInfo.sawError),
    error: fetchErr,
  };

  // 持久化：latest + req.* + history 索引（runs 索引驱动清理）
  try {
    await kvSet(K.latest, record);
    await kvSet(K.req(reqId), record);
    const ids = await (async () => {
      try { const v = await state.kv.kvGet('llmdesk.reqids'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
    })();
    ids.unshift(reqId);
    const keep = ids.slice(0, KEEP_REQ);
    await kvSet('llmdesk.reqids', keep);
    for (const old of ids.slice(KEEP_REQ)) await state.kv.kvDel(K.req(old)).catch(() => {});
    await pushHistory({
      reqId, at: record.at, endpointId: ep.id, endpointName: ep.name,
      model: (built.body && built.body.model) || '', status, ms,
      ttftMs: streamInfo ? streamInfo.ttftMs : null,
      ok: record.ok,
      firstFinding: (findings.find((f) => f.severity === 'error') || findings[0] || {}).title || '',
    });
  } catch (e) {
    log('warn', `记录落库失败（结果仍返回）：${e.message}`);
  }
  return { ok: true, record };
}

/** 应用变异器：从已有记录或给定 draft 产出变异后的 draft（不自动发送） */
async function executeMutate(payload) {
  let body = null;
  let wire = payload.wire === core.WIRE_ANTHROPIC ? core.WIRE_ANTHROPIC : undefined;
  if (payload.reqId) {
    let rec = null;
    try { rec = await state.kv.kvGet(K.req(String(payload.reqId))); } catch (_) { /* 忽略 */ }
    if (!rec) return { ok: false, error: `请求记录不存在：${payload.reqId}` };
    body = rec.body;
    wire = rec.endpoint && rec.endpoint.wire;
  } else if (payload.body && typeof payload.body === 'object') {
    body = payload.body;
  }
  if (!body) return { ok: false, error: '需要 reqId 或 body 之一' };
  if (!wire) wire = core.WIRE_OPENAI;
  const mut = core.mutators(wire).find((m) => m.id === String(payload.mutatorId || ''));
  if (!mut) return { ok: false, error: `未知变异器：${payload.mutatorId}（可用：${core.mutators(wire).map((m) => m.id).join('/')}）` };
  const out = mut.apply(body);
  if (!out) return { ok: false, error: `变异「${mut.label}」不适用于当前请求体` };
  return { ok: true, mutator: { id: mut.id, label: mut.label, note: mut.note }, body: out };
}

/** 列出当前请求体可用的变异器 */
async function executeMutators(payload) {
  const wire = payload && payload.wire === core.WIRE_ANTHROPIC ? core.WIRE_ANTHROPIC : core.WIRE_OPENAI;
  return { ok: true, items: core.mutators(wire).map((m) => ({ id: m.id, label: m.label, note: m.note })) };
}

/** 拉模型表（OpenAI 语义 GET /v1/models） */
async function executeModels(payload) {
  const ep = endpoints.get(String(payload.endpointId || ''));
  if (!ep) return { ok: false, error: `端点不存在：${payload.endpointId}` };
  const url = core.resolveModelsUrl(ep.baseUrl);
  const headers = {};
  if (ep.apiKey) {
    if (ep.wire === core.WIRE_ANTHROPIC) { headers['x-api-key'] = ep.apiKey; headers['anthropic-version'] = ep.anthropicVersion || '2023-06-01'; }
    else headers['Authorization'] = `Bearer ${ep.apiKey}`;
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('拉取模型超时')), 15000);
  try {
    const res = await fetch(url, { headers, signal: abort.signal });
    const text = await res.text();
    if (res.status !== 200) {
      const pe = core.parseErrorBody(res.status, text, Object.fromEntries([...res.headers.entries()]));
      return { ok: false, error: `HTTP ${res.status}：${pe.message.slice(0, 200)}` };
    }
    const j = JSON.parse(text);
    const arr = Array.isArray(j.data) ? j.data : (Array.isArray(j.models) ? j.models : (Array.isArray(j) ? j : []));
    const ids = arr.map((m) => (m && (m.id || m.name)) || '').filter(Boolean);
    return { ok: true, count: ids.length, models: ids.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: `拉取失败：${String((e && e.message) || e)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function executeImport() {
  const r = importHostEndpoints();
  await publishEndpoints();
  return { ok: true, ...r };
}

async function executeEndpointUpsert(payload) {
  const p = payload.endpoint || {};
  if (!p.baseUrl) return { ok: false, error: 'baseUrl 必填' };
  try { core.resolveUrl(p.baseUrl, p.wire || core.WIRE_OPENAI, p.pathOverride); } catch (e) {
    return { ok: false, error: `baseUrl 不合法：${e.message}` };
  }
  if (!p.apiKey && !payload.allowEmptyKey) return { ok: false, error: 'apiKey 必填（本地无鉴权端点如 Ollama 可在高级里允许空 key）' };
  const id = String(p.id || '').trim() || `manual-${crypto.randomBytes(4).toString('hex')}`;
  endpoints.set(id, sanitizeEndpoint({ ...p, id, importedAt: endpoints.get(id) && endpoints.get(id).importedAt }, 'manual'));
  const saved = saveManualEndpoints();
  await publishEndpoints();
  return { ok: true, id, savedToFile: saved };
}

async function executeEndpointDelete(payload) {
  const p = endpoints.get(String(payload.id || ''));
  if (!p) return { ok: false, error: `端点不存在：${payload.id}` };
  if (p.source === 'host' && !payload.force) return { ok: false, error: '宿主导入端点由宿主配置派生，删除请用 force:true（或从宿主设置移除后重新导入）' };
  endpoints.delete(String(payload.id));
  const saved = saveManualEndpoints();
  await publishEndpoints();
  return { ok: true, savedToFile: saved };
}

async function executeGetReq(payload) {
  const id = String(payload.reqId || '');
  try {
    const v = await state.kv.kvGet(K.req(id));
    if (v) return { ok: true, record: v };
  } catch (_) { /* fallthrough */ }
  return { ok: false, error: `请求记录不存在或已被清理：${id}（保留最近 ${KEEP_REQ} 条）` };
}

async function executeGetState() {
  let latest = null;
  let history = [];
  try { latest = await state.kv.kvGet(K.latest); } catch (_) { /* 忽略 */ }
  history = await loadHistory();
  return { ok: true, endpoints: maskedEndpoints(), meta: metaPayload(), latest, history };
}

async function executeCancel() {
  if (!state.running) return { ok: false, error: '当前没有进行中的请求' };
  state.running.abort.abort(new Error('用户取消'));
  return { ok: true };
}

async function executeSettingsSet(payload) {
  const t = Number(payload && payload.timeoutMs);
  if (Number.isFinite(t) && t >= 5000 && t <= 300000) state.settings.timeoutMs = Math.round(t);
  try { await kvSet(K.settings, state.settings); } catch (_) { /* kv 失败不影响本次生效 */ }
  return { ok: true, settings: state.settings };
}

// ── 命令分发 ────────────────────────────────────────────────────────────────
const ACTIONS = {
  send: executeSend,
  mutate: executeMutate,
  mutators: executeMutators,
  models: executeModels,
  import_host: executeImport,
  endpoint_upsert: executeEndpointUpsert,
  endpoint_delete: executeEndpointDelete,
  get_req: executeGetReq,
  get_state: executeGetState,
  cancel: executeCancel,
  settings_set: executeSettingsSet,
};

function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: state.running
      ? { reqId: state.running.reqId, endpointName: state.running.endpointName, startedAt: state.running.startedAt }
      : null,
    endpointCount: endpoints.size,
  };
}

async function beatMeta() {
  try {
    await kvSet(K.meta, metaPayload());
    state.degraded = false;
    state.lastBridgeErr = null;
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
    log('warn', `meta 心跳失败（降级）：${state.lastBridgeErr}`);
  }
}

async function processQueue() {
  while (state.queue.length && !state.running) {
    const cmd = state.queue.shift();
    const fn = ACTIONS[cmd.action];
    let result;
    if (!fn) result = { ok: false, error: `未知 action：${cmd.action}（支持：${Object.keys(ACTIONS).join('/')}）` };
    else {
      try { result = await fn(cmd.payload); } catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
    }
    try {
      await kvSet(K.res, { nonce: cmd.nonce, action: cmd.action, at: new Date().toISOString(), result });
    } catch (e) {
      log('warn', `回执写入失败：${e.message}`);
    }
  }
}

async function tick() {
  try {
    const v = await state.kv.kvGet(K.cmd);
    if (v && typeof v === 'object' && v.nonce && v.nonce !== state.lastCmdNonce) {
      state.lastCmdNonce = v.nonce;
      await state.kv.kvDel(K.cmd);
      if (state.running) {
        await kvSet(K.res, { nonce: v.nonce, action: v.action, at: new Date().toISOString(), result: { ok: false, error: `正在发送请求到 ${state.running.endpointName}，请稍候或先取消` } }).catch(() => {});
      } else {
        state.queue.push({ nonce: v.nonce, action: String(v.action || ''), payload: v.payload || {} });
        if (state.queue.length > QUEUE_MAX) state.queue.shift();
      }
    }
    if (state.degraded) { state.degraded = false; state.lastBridgeErr = null; }
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
  }
  await processQueue();
}

// ── HTTP 健康端点 ───────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/__health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, running: !!state.running, endpoints: endpoints.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── 入口 ────────────────────────────────────────────────────────────────────
function main() {
  state.appConfigDir = process.argv[3] || '';
  initLog(state.appConfigDir);
  state.kv = createKvClient({
    appConfigDir: state.appConfigDir,
    log: (lv, msg) => log(lv, msg),
  });
  loadManualEndpoints();
  importHostEndpoints();
  (async () => {
    await loadSettings();
    await publishEndpoints();
    await beatMeta();
  })().catch((e) => log('warn', `初始化持久态失败：${e.message}`));

  server.listen(PORT, '127.0.0.1', () => {
    log('info', `健康端点就绪 127.0.0.1:${server.address().port}/__health`);
  });
  setInterval(tick, TICK_MS);
  setInterval(beatMeta, META_BEAT_MS);
}

main();
