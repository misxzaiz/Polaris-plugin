'use strict';
/**
 * main.js —— OpenAPI 调试台后台服务（除 js-yaml 外零依赖，node >= 18.15）
 *
 * 单写者权威：oadesk.meta / oadesk.specs / oadesk.spec.<id> / oadesk.envs /
 * oadesk.latest / oadesk.req.* / oadesk.history / oadesk.diff.<id> 只由本服务写。
 * 面板与 MCP 经 oadesk.cmd 单槽信箱表达意图（{nonce, action, payload}）；
 * 服务轮询消费，结果写 oadesk.res（nonce 对齐）+ 持久态键。
 *
 * 安全分层（与 house 契约一致）：
 *   - 鉴权值（bearer token / apiKey / basic 密码）只存在于服务内存与手动档案
 *     本地文件（{{appConfigDir}}/openapi-desk/envs.json，与宿主 config.json 同信任域）；
 *   - 落 kv / 进日志 / 返回 AI 的一切鉴权值均为掩码形态（****last4）；
 *   - AI（MCP）通道护栏：只能对「已导入合同」的端点发请求（不接受任意 URL）、
 *     非安全方法（POST/PUT/PATCH/DELETE）必须 confirm:true（防误写真实服务）；
 *   - 请求发送 redirect:'manual'——调试台要看见 301/302 与 Location，不静默跟随；
 *   - 合同文本 ≤ 4MB；spec 落 kv ≤ 2MB；响应体落 kv 截断 64KB。
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
const yaml = require('./vendor/yaml-bundle');

const { createKvClient } = require('./kvclient');
const core = require('../shared/openapi-core');

const VERSION = core.VERSION;
const TICK_MS = 500;                // 信箱轮询（调试台要求响应快，比样板 1.2s 更密）
const META_BEAT_MS = 60 * 1000;
const SPEC_TEXT_LIMIT = 4 * 1024 * 1024;   // 合同文本上限
const SPEC_KV_LIMIT = 2 * 1024 * 1024;     // spec 落 kv 上限（序列化后）
const RESP_KEEP = 64 * 1024;               // 响应文本落 kv 截断
const KEEP_REQ = 30;
const HISTORY_MAX = 60;
const QUEUE_MAX = 4;
const DEFAULT_TIMEOUT_MS = 30000;

const K = {
  meta: 'oadesk.meta',
  specs: 'oadesk.specs',
  spec: (id) => `oadesk.spec.${id}`,
  specPrefix: 'oadesk.spec.',
  envs: 'oadesk.envs',
  latest: 'oadesk.latest',
  req: (id) => `oadesk.req.${id}`,
  reqPrefix: 'oadesk.req.',
  reqids: 'oadesk.reqids',
  history: 'oadesk.history',
  diff: (id) => `oadesk.diff.${id}`,
  diffPrefix: 'oadesk.diff.',
  cmd: 'oadesk.cmd',
  res: 'oadesk.res',
};

// ── 日志（自落盘 + 512KB 轮转；绝不落鉴权值与响应体全文）─────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), 'openapi-desk');
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[openapi-desk:${level}] ${new Date().toISOString()} ${msg}`;
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
  running: null,      // { reqId, label, startedAt, abort }
};
/** 内存合同库：id → normalizeSpec 产物（含 raw 与完整 env 值视图） */
const specs = new Map();
/** 内存环境：specId → {baseUrl, auth}（含完整鉴权值；绝不落 kv） */
const envs = new Map();

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

// ── 环境档案（本地文件 + 内存；kv 只落掩码视图）──────────────────────────────
function envsFilePath() {
  return path.join(state.appConfigDir || os.tmpdir(), 'openapi-desk', 'envs.json');
}

function loadEnvsFromFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(envsFilePath(), 'utf8'));
    for (const [specId, env] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      if (env && typeof env === 'object') envs.set(specId, env);
    }
    if (envs.size) log('info', `环境档案载入 ${envs.size} 条`);
  } catch (_) { /* 首次/无文件 */ }
}

function saveEnvsToFile() {
  const file = envsFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(envs), null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    log('warn', `环境档案保存失败（内存仍有效）：${e.message}`);
    return false;
  }
}

function sanitizeEnv(env) {
  const e = env && typeof env === 'object' ? env : {};
  const out = { baseUrl: String(e.baseUrl || '').trim() || null, auth: null };
  if (e.auth && typeof e.auth === 'object' && e.auth.type) {
    const t = String(e.auth.type);
    if (t === 'bearer') out.auth = { type: 'bearer', token: String(e.auth.token || '') };
    else if (t === 'basic') out.auth = { type: 'basic', username: String(e.auth.username || ''), password: String(e.auth.password || '') };
    else if (t === 'apiKey') out.auth = { type: 'apiKey', in: e.auth.in === 'query' ? 'query' : 'header', name: String(e.auth.name || 'X-Api-Key'), value: String(e.auth.value || '') };
    else return { error: `未知鉴权类型：${t}（支持 bearer/basic/apiKey）` };
  }
  return { value: out };
}

// ── 合同持久化 ──────────────────────────────────────────────────────────────
/** kv 里的合同条目（raw 完整保留供 $ref 解析；超限拒绝） */
function specForKv(spec) {
  const copy = { ...spec };
  const json = JSON.stringify(copy);
  if (json.length > SPEC_KV_LIMIT) return { ok: false, error: `合同序列化后 ${(json.length / 1024 / 1024).toFixed(1)}MB 超过落库上限 2MB（组件过多请精简后重试）` };
  return { ok: true, value: copy };
}

function specSummary(spec) {
  return {
    id: spec.id, name: spec.name, title: spec.title, version: spec.version,
    specVersion: spec.specVersion, openapiVersion: spec.openapiVersion,
    source: spec.source, sourceDetail: spec.sourceDetail,
    importedAt: spec.importedAt, endpointCount: spec.endpoints.length,
    pathCount: spec.pathCount, serverUrls: spec.servers.map((s) => s.url),
    externalRefs: spec.externalRefs.length, hints: spec.hints,
    infoDescription: spec.infoDescription,
  };
}

async function publishSpecs() {
  const items = [...specs.values()].map(specSummary);
  await state.kv.kvSet(K.specs, { at: new Date().toISOString(), items });
}

async function restoreSpecs() {
  try {
    const idx = await state.kv.kvGet(K.specs);
    const items = idx && Array.isArray(idx.items) ? idx.items : [];
    let restored = 0;
    for (const it of items) {
      try {
        const full = await state.kv.kvGet(K.spec(it.id));
        if (full && full.raw && Array.isArray(full.endpoints)) {
          specs.set(full.id, full);
          restored += 1;
        }
      } catch (_) { /* 单条损坏跳过 */ }
    }
    if (restored) log('info', `合同库恢复 ${restored}/${items.length} 条`);
  } catch (_) { /* 桥未就绪时靠 tick 恢复逻辑外的显式导入 */ }
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
  await state.kv.kvSet(K.history, h.slice(0, HISTORY_MAX));
}

// ── 合同解析（YAML/JSON 文本或 URL）─────────────────────────────────────────
function parseSpecText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { ok: false, error: '合同内容为空' };
  if (trimmed.length > SPEC_TEXT_LIMIT) return { ok: false, error: `合同 ${(trimmed.length / 1024 / 1024).toFixed(1)}MB 超过 4MB 上限` };
  if (trimmed.startsWith('{')) {
    try {
      return { ok: true, doc: JSON.parse(trimmed), format: 'json' };
    } catch (e) {
      // 以 { 开头但解析失败：明确报 JSON 错误（不 fallback yaml，避免混淆定位）
      return { ok: false, error: `JSON 解析失败：${(e && e.message) || e}` };
    }
  }
  try {
    const doc = yaml.load(trimmed);
    if (doc === null || doc === undefined) return { ok: false, error: 'YAML 解析结果为空（内容是否为注释/空文档？）' };
    return { ok: true, doc, format: 'yaml' };
  } catch (e) {
    // js-yaml 错误带 mark（line/column），转成面向用户的定位
    const mark = e && e.mark ? `（第 ${(e.mark.line || 0) + 1} 行，第 ${(e.mark.column || 0) + 1} 列）` : '';
    return { ok: false, error: `YAML 解析失败${mark}：${(e && e.message) || e}` };
  }
}

async function fetchSpecUrl(url) {
  let u;
  try { u = new URL(String(url || '')); } catch (_) { return { ok: false, error: 'URL 不合法' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: '仅支持 http/https 拉取' };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('拉取超时 20s')), 20000);
  try {
    const res = await fetch(u, { signal: abort.signal, redirect: 'follow' });
    if (res.status !== 200) return { ok: false, error: `拉取失败：HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `拉取失败：${String((e && e.message) || e)}` };
  } finally {
    clearTimeout(timer);
  }
}

// ── 动作实现 ────────────────────────────────────────────────────────────────
async function executeSpecImport(payload) {
  let text = '';
  let source = 'text';
  let sourceDetail = '';
  if (payload.source === 'url') {
    const r = await fetchSpecUrl(payload.url);
    if (!r.ok) return r;
    text = r.text;
    source = 'url';
    sourceDetail = String(payload.url || '');
  } else {
    text = String(payload.content || '');
    sourceDetail = String(payload.name || '').slice(0, 120);
  }
  const parsed = parseSpecText(text);
  if (!parsed.ok) return parsed;
  const norm = core.normalizeSpec(parsed.doc, { name: payload.name, source, sourceDetail });
  if (!norm.ok) return norm;
  const spec = norm.spec;
  // 同名+同版本视为重新导入（幂等替换），否则新增
  const existing = [...specs.values()].find((s) => s.name === spec.name && s.version === spec.version);
  spec.id = existing ? existing.id : newId('oad');
  specs.set(spec.id, spec);

  const kvOk = specForKv(spec);
  if (!kvOk.ok) {
    specs.delete(spec.id);
    return { ok: false, error: kvOk.error };
  }
  try {
    await state.kv.kvSet(K.spec(spec.id), kvOk.value);
  } catch (e) {
    specs.delete(spec.id);
    return { ok: false, error: `合同落库失败：${e.message}` };
  }
  await publishSpecs();
  log('info', `合同导入：${spec.name}（${spec.endpoints.length} 端点，id=${spec.id}）`);
  return {
    ok: true, specId: spec.id, replaced: !!existing,
    summary: specSummary(spec), hints: spec.hints,
    externalRefs: spec.externalRefs,
    warning: spec.externalRefs.length
      ? `检测到 ${spec.externalRefs.length} 处外部文件引用（如 ${spec.externalRefs[0]}）：本台暂不解析外部文件，被引用的 schema 将不可展开`
      : null,
  };
}

async function executeSpecList() {
  return { ok: true, items: [...specs.values()].map(specSummary) };
}

async function executeSpecGet(payload) {
  const spec = specs.get(String(payload.specId || ''));
  if (!spec) return { ok: false, error: `合同不存在：${payload.specId}（可能已被删除或服务重启后未恢复）` };
  const env = envs.get(spec.id) || null;
  const envView = env ? { baseUrl: env.baseUrl, auth: env.auth ? core.sanitizeEnvForKv({ auth: env.auth }).auth : null } : null;
  if (payload.endpointId) {
    const ep = spec.endpoints.find((e) => e.id === String(payload.endpointId));
    if (!ep) return { ok: false, error: `端点不存在：${payload.endpointId}` };
    const exampleBody = core.exampleBodyForEndpoint(spec.raw, ep);
    return {
      ok: true,
      spec: specSummary(spec),
      endpoint: {
        ...core.endpointBrief(ep),
        description: ep.description,
        parameters: ep.parameters.map((p) => ({
          name: p.name, in: p.in, required: p.required, description: p.description,
          type: p.schema ? core.describeSchemaType(spec.raw, p.schema) : null,
          example: p.example !== undefined ? p.example : undefined,
        })),
        exampleBody: exampleBody ? { mediaType: exampleBody.mediaType, text: exampleBody.value === undefined ? '' : JSON.stringify(exampleBody.value, null, 2) } : null,
        responses: Object.fromEntries(Object.entries(ep.responses).map(([code, r]) => [code, { description: r.description, hasSchema: !!r.schema, contentTypes: r.contentTypes || [] }])),
        needsAuth: ep.needsAuth,
        securityReqs: ep.securityReqs === null ? spec.securityReqs : ep.securityReqs,
      },
      env: envView,
    };
  }
  // 整册概览：端点列表（brief）
  return {
    ok: true,
    spec: specSummary(spec),
    endpoints: spec.endpoints.map((e) => core.endpointBrief(e)),
    env: envView,
  };
}

async function executeSpecDelete(payload) {
  const id = String(payload.specId || '');
  const spec = specs.get(id);
  if (!spec) return { ok: false, error: `合同不存在：${id}` };
  specs.delete(id);
  envs.delete(id);
  saveEnvsToFile();
  try {
    await state.kv.kvDel(K.spec(id));
    const idx = await state.kv.kvGet(K.specs);
    if (idx && Array.isArray(idx.items)) {
      await state.kv.kvSet(K.specs, { at: new Date().toISOString(), items: idx.items.filter((x) => x.id !== id) });
    } else {
      await publishSpecs();
    }
  } catch (e) {
    log('warn', `合同删除落库失败（内存已删）：${e.message}`);
  }
  return { ok: true };
}

async function executeEnvSet(payload) {
  const spec = specs.get(String(payload.specId || ''));
  if (!spec) return { ok: false, error: `合同不存在：${payload.specId}` };
  const s = sanitizeEnv(payload.env);
  if (s.error) return { ok: false, error: s.error };
  envs.set(spec.id, s.value);
  const saved = saveEnvsToFile();
  try {
    await state.kv.kvSet(K.envs, { at: new Date().toISOString(), items: [...envs.entries()].map(([id, env]) => ({ specId: id, baseUrl: env.baseUrl || '', auth: env.auth ? core.sanitizeEnvForKv({ auth: env.auth }).auth : null })) });
  } catch (_) { /* 掩码视图失败不影响生效 */ }
  return { ok: true, savedToFile: saved, env: { baseUrl: s.value.baseUrl, auth: s.value.auth ? core.sanitizeEnvForKv({ auth: s.value.auth }).auth : null } };
}

const SAFE_METHODS = new Set(['get', 'head', 'options']);

async function executeCall(payload) {
  const spec = specs.get(String(payload.specId || ''));
  if (!spec) return { ok: false, error: `合同不存在：${payload.specId}` };
  const ep = spec.endpoints.find((e) => e.id === String(payload.endpointId || ''));
  if (!ep) return { ok: false, error: `端点不存在：${payload.endpointId}（用 spec_get 查看可用端点）` };

  // AI 通道护栏：非安全方法需要显式 confirm（面板通道 confirm 缺省视为 true——用户亲手点发送）
  const viaAi = payload.cap && payload.cap.viaAi === true;
  if (viaAi && !SAFE_METHODS.has(ep.method) && payload.confirm !== true) {
    return {
      ok: false,
      needsConfirm: true,
      error: `该端点是 ${ep.method.toUpperCase()}（会产生真实写入/删除副作用）。AI 通道必须用户确认后才能发送：请向用户说明将要调用的端点与影响，用户同意后在调用时带 confirm:true。`,
    };
  }

  const savedEnv = envs.get(spec.id) || null;
  const baseUrl = String(payload.baseUrl || (savedEnv && savedEnv.baseUrl) || '').trim();
  const auth = payload.auth && typeof payload.auth === 'object' && (payload.auth.type || payload.auth.token || payload.auth.value)
    ? sanitizeEnv({ auth: payload.auth }).value.auth
    : (savedEnv && savedEnv.auth) || null;

  const built = core.buildRequest({
    root: spec.raw, endpoint: ep, baseUrl,
    values: payload.values, bodyText: payload.bodyText, auth,
    contentType: payload.contentType,
  });
  if (!built.ok) return built;
  if (!/^https?:/i.test(built.url)) return { ok: false, error: '仅支持 http/https 目标' };

  const reqId = newReqId();
  const abort = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), 300000);
  const timer = setTimeout(() => abort.abort(new Error(`超时 ${timeoutMs}ms（可在调试页调整）`)), timeoutMs);
  state.running = { reqId, label: `${ep.method.toUpperCase()} ${ep.path}`, startedAt: Date.now(), abort };

  const startedAt = Date.now();
  let status = 0;
  let respText = '';
  let respHeaders = {};
  let fetchErr = null;
  try {
    const fetchInit = { method: built.method, headers: built.headers, signal: abort.signal, redirect: 'manual' };
    if (built.bodyText && !SAFE_METHODS.has(ep.method)) fetchInit.body = built.bodyText;
    const res = await fetch(built.url, fetchInit);
    status = res.status;
    respHeaders = Object.fromEntries([...res.headers.entries()]);
    respText = await res.text();
  } catch (e) {
    fetchErr = String((e && e.message) || e);
  } finally {
    clearTimeout(timer);
    if (state.running && state.running.reqId === reqId) state.running = null;
  }

  const ms = Date.now() - startedAt;
  let validation = null;
  if (!fetchErr) {
    validation = core.validateResponse(spec.raw, ep, { status, bodyText: respText });
  }

  const maskedAuth = auth ? core.sanitizeEnvForKv({ auth }).auth : null;
  const record = {
    reqId,
    at: new Date().toISOString(),
    spec: { id: spec.id, name: spec.name },
    endpoint: { id: ep.id, method: ep.method.toUpperCase(), path: ep.path },
    url: built.url,
    maskedHeaders: built.maskedHeaders,
    authUsed: maskedAuth ? { type: maskedAuth.type, name: maskedAuth.name, masked: maskedAuth.tokenMask || maskedAuth.valueMask } : null,
    status,
    ms,
    location: respHeaders.location || null,
    respHeaders: pickRespHeaders(respHeaders),
    respText: respText.slice(0, RESP_KEEP),
    respBytes: respText.length,
    validation,
    ok: !fetchErr && status >= 200 && status < 300,
    error: fetchErr,
    viaAi,
  };

  try {
    await state.kv.kvSet(K.latest, record);
    await state.kv.kvSet(K.req(reqId), record);
    let ids = [];
    try { const v = await state.kv.kvGet(K.reqids); if (Array.isArray(v)) ids = v; } catch (_) { /* 首次 */ }
    ids.unshift(reqId);
    const keep = ids.slice(0, KEEP_REQ);
    await state.kv.kvSet(K.reqids, keep);
    for (const old of ids.slice(KEEP_REQ)) await state.kv.kvDel(K.req(old)).catch(() => {});
    const vSummary = validation ? validation.summary : null;
    await pushHistory({
      reqId, at: record.at, specId: spec.id, specName: spec.name,
      endpointId: ep.id, method: ep.method.toUpperCase(), path: ep.path,
      status, ms, ok: record.ok, viaAi,
      drifts: vSummary ? `${vSummary.breaking}/${vSummary.warn}/${vSummary.info}` : null,
    });
  } catch (e) {
    log('warn', `记录落库失败（结果仍返回）：${e.message}`);
  }
  return { ok: true, record };
}

function pickRespHeaders(headers) {
  const want = ['content-type', 'content-length', 'location', 'server', 'date', 'cache-control', 'x-request-id', 'x-ratelimit-remaining', 'www-authenticate', 'allow', 'retry-after'];
  const out = {};
  for (const k of Object.keys(headers)) {
    if (want.includes(k.toLowerCase())) out[k] = String(headers[k]).slice(0, 300);
  }
  return out;
}

async function executeDiff(payload) {
  const a = specs.get(String(payload.specIdA || ''));
  const b = specs.get(String(payload.specIdB || ''));
  if (!a) return { ok: false, error: `合同 A 不存在：${payload.specIdA}` };
  if (!b) return { ok: false, error: `合同 B 不存在：${payload.specIdB}` };
  if (a.id === b.id) return { ok: false, error: '请选择两份不同的合同（同一合同的两次导入会有不同 id；同名同版本重新导入会替换原条目）' };
  const r = core.diffSpecs(a, b);
  const report = {
    id: newId('dif'),
    at: new Date().toISOString(),
    a: { id: a.id, name: a.name, version: a.version, importedAt: a.importedAt },
    b: { id: b.id, name: b.name, version: b.version, importedAt: b.importedAt },
    changes: r.changes,
    summary: r.summary,
  };
  try {
    await state.kv.kvSet(K.diff(report.id), report);
    let ids = [];
    try { const v = await state.kv.kvGet('oadesk.diffids'); if (Array.isArray(v)) ids = v; } catch (_) { /* 首次 */ }
    ids.unshift(report.id);
    const keep = ids.slice(0, 20);
    await state.kv.kvSet('oadesk.diffids', keep);
    for (const old of ids.slice(20)) await state.kv.kvDel(K.diff(old)).catch(() => {});
  } catch (e) {
    log('warn', `diff 报告落库失败（结果仍返回）：${e.message}`);
  }
  return { ok: true, report };
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
  let envItems = [];
  try { const v = await state.kv.kvGet(K.envs); envItems = v && Array.isArray(v.items) ? v.items : []; } catch (_) { /* 忽略 */ }
  return {
    ok: true,
    specs: [...specs.values()].map(specSummary),
    envs: envItems,
    latest,
    history,
    meta: metaPayload(),
  };
}

async function executeCancel() {
  if (!state.running) return { ok: false, error: '当前没有进行中的请求' };
  state.running.abort.abort(new Error('用户取消'));
  return { ok: true };
}

// ── 命令分发 ────────────────────────────────────────────────────────────────
const ACTIONS = {
  spec_import: executeSpecImport,
  spec_list: executeSpecList,
  spec_get: executeSpecGet,
  spec_delete: executeSpecDelete,
  env_set: executeEnvSet,
  call: executeCall,
  diff: executeDiff,
  get_req: executeGetReq,
  get_state: executeGetState,
  cancel: executeCancel,
};

function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: state.running
      ? { reqId: state.running.reqId, label: state.running.label, startedAt: state.running.startedAt }
      : null,
    specCount: specs.size,
  };
}

async function beatMeta() {
  try {
    await state.kv.kvSet(K.meta, metaPayload());
    state.degraded = false;
    state.lastBridgeErr = null;
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
    log('warn', `meta 心跳失败（降级）：${state.lastBridgeErr}`);
  }
}

function newReqId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
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
      await state.kv.kvSet(K.res, { nonce: cmd.nonce, action: cmd.action, at: new Date().toISOString(), result });
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
        await state.kv.kvSet(K.res, { nonce: v.nonce, action: v.action, at: new Date().toISOString(), result: { ok: false, error: `正在请求 ${state.running.label}，请稍候或先取消` } }).catch(() => {});
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
    res.end(JSON.stringify({ ok: true, version: VERSION, running: !!state.running, specs: specs.size }));
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
  loadEnvsFromFile();
  (async () => {
    await restoreSpecs();
    await beatMeta();
  })().catch((e) => log('warn', `初始化失败：${e.message}`));

  server.listen(PORT, '127.0.0.1', () => {
    log('info', `健康端点就绪 127.0.0.1:${server.address().port}/__health`);
  });
  setInterval(tick, TICK_MS);
  setInterval(beatMeta, META_BEAT_MS);
}

main();
