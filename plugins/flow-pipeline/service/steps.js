'use strict';
/**
 * steps.js —— 流水线九类步骤执行器（零依赖，node ≥ 18）
 *
 *   http     手工等价 curl：方法/头/体/超时/重定向逐跳 SSRF 围栏
 *   mcp      宿主 cap.mcp 直调（任意已装插件的 MCP 工具即步骤）
 *   ai       供应商直连非流式（openai-chat-completions / anthropic-messages 双协议，
 *            语义对齐 task-runner executors.runAi，勿改字段名）
 *   extract  JSONPath-lite 提取（from 来源值上按 paths 逐个取）
 *   template 模板渲染（engine.resolveTemplate）
 *   script   node:vm 沙箱片段（超时 2s、无 require/process；本机信任模型与
 *            task-runner 命令行步骤同级，防误写死循环为主）
 *   kv       cap.kv 读写删（跨运行持久化）
 *   file     白名单根目录写文件（appConfigDir/flow-pipeline/outputs、桌面、临时目录）
 *   notify   webhook 出站通知（钉钉/企微/飞书/Bark 都是 POST，同 http 围栏）
 *
 * 执行器签名：async (step, ctx, ex) → { ok, output?, excerpt?, error? }
 *   ctx  = { vars, steps, params, env }（engine 上下文）
 *   ex   = { signal, allowLocal, kv, providers, getSetting, appConfigDir, log }
 * 输出统一保存到 ctx.steps[saveAs]（runner 负责）；excerpt 进运行记录（runner 负责掩码）。
 */
const http = require('http');
const https = require('https');
const dns = require('dns');
const vm = require('vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const engine = require('../shared/engine');

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 响应体读取上限 2MB
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 文件步骤写入上限
const SCRIPT_TIMEOUT_MS = 2000;
const MAX_REDIRECTS = 3;

// ── SSRF 围栏 ────────────────────────────────────────────────────────────────
const ALWAYS_DENY_IPS = new Set(['169.254.169.254', '::ffff:169.254.169.254']); // 云元数据地址永不放行

function isPrivateIPv4(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT（Tailscale 等内网段）
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 段
  return false;
}

function isPrivateIPv6(ip) {
  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true;
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // fc00::/7
  if (low.startsWith('fe8') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')) return true; // fe80::/10
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(low);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIp(ip) {
  if (ALWAYS_DENY_IPS.has(ip)) return true;
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * 围栏检查：解析 DNS 全部地址，任一为私网/环回/链路本地/元数据 → 拒。
 * allowLocal=true 时放行私网（本地联调场景），元数据地址仍永不放行。
 * @throws Error 人话原因
 */
async function fenceUrl(rawUrl, allowLocal) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch (_) {
    throw new Error(`URL 无法解析：${String(rawUrl).slice(0, 80)}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅允许 http/https 协议（收到 ${u.protocol}）`);
  }
  const host = u.hostname;
  // 字面量 IP 直接判；域名先解析再逐 IP 判
  if (net.isIP(host)) {
    if (isPrivateIp(host) && !(allowLocal && !ALWAYS_DENY_IPS.has(host))) {
      throw new Error(allowLocal ? `目标 ${host} 为元数据/受保护地址，永不放行` : `目标 ${host} 是私网/环回地址：流水线未开「允许本机/内网目标」（allowLocal）`);
    }
    return { host };
  }
  const addrs = await new Promise((resolve, reject) => {
    dns.lookup(host, { all: true, verbatim: true }, (err, list) => {
      if (err) reject(new Error(`DNS 解析失败：${host}（${err.message}）`));
      else resolve(list || []);
    });
  });
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      if (ALWAYS_DENY_IPS.has(address)) {
        throw new Error(`目标域名 ${host} 解析到受保护地址 ${address}（云元数据），永不放行`);
      }
      if (!allowLocal) {
        throw new Error(`目标域名 ${host} 解析到私网地址 ${address}：流水线未开「允许本机/内网目标」（allowLocal）`);
      }
    }
  }
  return { host };
}

/** 响应体封顶读取：兼容 fetch 的 web ReadableStream 与 Node IncomingMessage 两种形态 */
function readBodyCapped(reslike, cap) {
  // web 流（undici fetch Response）
  if (reslike && reslike.body && typeof reslike.body.getReader === 'function') {
    return (async () => {
      const reader = reslike.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > cap) {
          try { await reader.cancel(); } catch (_) { /* 已取消 */ }
          throw new Error(`响应体超过 ${Math.round(cap / 1024)}KB 上限，已中止读取`);
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks).toString('utf8');
    })();
  }
  // Node 流
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    reslike.on('data', (c) => {
      size += c.length;
      if (size > cap) {
        reslike.destroy();
        reject(new Error(`响应体超过 ${Math.round(cap / 1024)}KB 上限，已中止读取`));
        return;
      }
      chunks.push(c);
    });
    reslike.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    reslike.on('error', reject);
  });
}

/** 组合外部停止信号与超时（Node ≥20 AbortSignal.any） */
function combineSignals(userSignal, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs);
  const onAbort = () => ac.abort(userSignal.reason);
  if (userSignal) {
    if (userSignal.aborted) ac.abort(userSignal.reason);
    else userSignal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ac.signal,
    done() {
      clearTimeout(timer);
      if (userSignal) userSignal.removeEventListener('abort', onAbort);
    },
  };
}

/** 手动跟重定向：逐跳围栏 + 跨源剥鉴权（diff-desk 同款语义） */
async function fetchWithFence(rawUrl, init, { allowLocal, timeoutMs, userSignal }) {
  let url = String(rawUrl);
  const headers = { ...init.headers };
  const originalHost = (() => { try { return new URL(url).host; } catch (_) { return ''; } })();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await fenceUrl(url, allowLocal);
    const last = hop === MAX_REDIRECTS;
    const combo = combineSignals(userSignal, timeoutMs);
    let res;
    try {
      res = await fetch(url, { ...init, headers: hop === 0 ? headers : stripAuth(headers, url, originalHost), redirect: 'manual', signal: combo.signal });
    } finally {
      combo.done();
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      try { res.body && res.body.cancel && res.body.cancel(); } catch (_) { /* 忽略 */ }
      if (last) throw new Error(`重定向超过 ${MAX_REDIRECTS} 跳上限（最后指向 ${loc.slice(0, 80)}）`);
      url = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new Error('unreachable');
}

function stripAuth(headers, url, originalHost) {
  const out = { ...headers };
  let host = '';
  try { host = new URL(url).host; } catch (_) { /* 忽略 */ }
  if (host !== originalHost) {
    // 跨源重定向：鉴权类头一律剥掉，防止凭据泄漏到第三方
    for (const k of Object.keys(out)) {
      if (/^authorization$|^cookie$|^x-api-key$|^proxy-authorization$/i.test(k)) delete out[k];
    }
  }
  return out;
}

function parseMaybeJson(text, contentType) {
  const ct = String(contentType || '');
  if (/json/i.test(ct)) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }
  const t = text.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { return JSON.parse(t); } catch (_) { return null; }
  }
  return null;
}

// ── http / notify ────────────────────────────────────────────────────────────
async function runHttp(step, ctx, ex) {
  const method = String(step.method || 'GET').toUpperCase();
  const url = engine.stringifyValue(engine.resolveTemplate(step.url, ctx).value).trim();
  if (!url) return { ok: false, error: 'url 插值后为空' };
  const timeoutMs = Math.max(2, Math.min(120, Number(step.timeoutSec) || 30)) * 1000;
  const headers = {};
  const hr = engine.resolveDeep(step.headers || {}, ctx);
  for (const [k, v] of Object.entries(hr.value || {})) {
    if (v === null || v === undefined) continue;
    headers[String(k)] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  let body;
  if (!['GET', 'HEAD'].includes(method) && step.body !== undefined && step.body !== null && String(step.body) !== '') {
    const br = engine.resolveDeep(step.body, ctx);
    body = typeof br.value === 'object' ? JSON.stringify(br.value) : String(br.value);
    if (!Object.keys(headers).some((k) => /^content-type$/i.test(k))) headers['Content-Type'] = 'application/json';
  }
  const started = Date.now();
  const res = await fetchWithFence(url, { method, headers, body }, {
    allowLocal: ex.allowLocal,
    timeoutMs,
    userSignal: ex.signal,
  });
  const text = await readBodyCapped(res, MAX_BODY_BYTES);
  const durationMs = Date.now() - started;
  const json = parseMaybeJson(text, res.headers.get('content-type'));
  const respHeaders = {};
  res.headers.forEach((v, k) => { respHeaders[k] = v; });
  const output = { status: res.status, ok: res.ok, durationMs, headers: respHeaders, body: text, json };
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}（${durationMs}ms）${text.slice(0, 160)}`, output, excerpt: `HTTP ${res.status}（${durationMs}ms）` };
  }
  return { ok: true, output, excerpt: `HTTP ${res.status}（${durationMs}ms）${summarizeBody(text)}` };
}

async function runNotify(step, ctx, ex) {
  const url = engine.stringifyValue(engine.resolveTemplate(step.url, ctx).value).trim();
  if (!url) return { ok: false, error: 'notify url 插值后为空' };
  const payload = engine.resolveDeep(step.payload !== undefined ? step.payload : { text: '' }, ctx).value;
  const headers = { 'Content-Type': 'application/json' };
  const hr = engine.resolveDeep(step.headers || {}, ctx);
  for (const [k, v] of Object.entries(hr.value || {})) {
    if (v === null || v === undefined) continue;
    headers[String(k)] = String(v);
  }
  const started = Date.now();
  const res = await fetchWithFence(url, { method: 'POST', headers, body: JSON.stringify(payload) }, {
    allowLocal: ex.allowLocal,
    timeoutMs: 15000,
    userSignal: ex.signal,
  });
  const text = await readBodyCapped(res, 256 * 1024);
  const durationMs = Date.now() - started;
  if (!res.ok) {
    return { ok: false, error: `通知目标返回 HTTP ${res.status}：${text.slice(0, 120)}`, excerpt: `HTTP ${res.status}（${durationMs}ms）` };
  }
  return { ok: true, output: { status: res.status, durationMs, body: text }, excerpt: `已投递（HTTP ${res.status}，${durationMs}ms）` };
}

function summarizeBody(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return ' ' + t.slice(0, 120).replace(/\s+/g, ' ');
}

// ── mcp ──────────────────────────────────────────────────────────────────────
async function runMcp(step, ctx, ex) {
  const serverId = engine.stringifyValue(engine.resolveTemplate(step.serverId, ctx).value).trim();
  const tool = engine.stringifyValue(engine.resolveTemplate(step.tool, ctx).value).trim();
  if (!serverId || !tool) return { ok: false, error: 'mcp 步骤的 serverId/tool 插值后为空' };
  let args = step.arguments === undefined || step.arguments === '' ? {} : step.arguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch (_) { return { ok: false, error: 'arguments JSON 无法解析' }; }
  }
  const ar = engine.resolveDeep(args, ctx);
  let result;
  try {
    result = await ex.kv.dispatchOk('cap.mcp', { action: 'call', mcpServerId: serverId, tool, arguments: ar.value }, { timeoutMs: 90_000, retries: 0 });
  } catch (e) {
    return { ok: false, error: `cap.mcp 调用失败：${e.message}` };
  }
  const text = extractMcpText(result);
  return {
    ok: true,
    output: { serverId, tool, result, text },
    excerpt: `${serverId}.${tool} → ${text.slice(0, 160) || '(无文本输出)'}`,
  };
}

function extractMcpText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result.content)) {
    return result.content
      .map((c) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : typeof c === 'string' ? c : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof result.text === 'string') return result.text;
  try { return JSON.stringify(result); } catch (_) { return String(result); }
}

// ── ai ───────────────────────────────────────────────────────────────────────
function resolveEndpoint(baseUrl, wire) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('baseUrl 为空');
  if (wire === 'anthropic-messages') {
    if (/\/messages$/.test(raw)) return raw;
    if (/\/v\d+/.test(raw)) return raw + '/messages';
    return raw + '/v1/messages';
  }
  if (/\/chat\/completions$/.test(raw)) return raw;
  if (/\/v\d+/.test(raw)) return raw + '/chat/completions';
  return raw + '/v1/chat/completions';
}

async function runAi(step, ctx, ex) {
  const providerId = engine.stringifyValue(engine.resolveTemplate(step.providerId, ctx).value).trim();
  const provider = (ex.providers || []).find((p) => p.id === providerId);
  if (!provider) {
    return { ok: false, error: `找不到 AI 供应商「${providerId}」：到设置里添加或从宿主导入` };
  }
  const pr = engine.resolveTemplate(step.prompt, ctx);
  const prompt = String(pr.value ?? '');
  const wire = provider.wire === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions';
  let endpoint;
  try {
    endpoint = resolveEndpoint(provider.baseUrl, wire);
  } catch (e) {
    return { ok: false, error: `供应商配置错误：${e.message}` };
  }
  const headers = { 'Content-Type': 'application/json' };
  const messages = [];
  let body;
  const sys = step.system ? String(engine.resolveTemplate(step.system, ctx).value ?? '') : '';
  const maxTokens = Math.max(16, Math.min(8192, Number(step.maxTokens) || 2048));
  if (wire === 'anthropic-messages') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = { model: provider.model, max_tokens: maxTokens, stream: false, messages: [{ role: 'user', content: prompt }] };
    if (sys) body.system = sys;
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
    if (sys) messages.push({ role: 'system', content: sys });
    messages.push({ role: 'user', content: prompt });
    body = { model: provider.model, max_tokens: maxTokens, stream: false, messages };
    const temp = Number(step.temperature);
    if (Number.isFinite(temp)) body.temperature = Math.max(0, Math.min(2, temp));
  }
  const timeoutMs = Math.max(5, Math.min(600, Number(ex.getSetting('aiTimeoutSec')) || 120)) * 1000;
  const started = Date.now();
  const combo = combineSignals(ex.signal, timeoutMs);
  let res;
  try {
    // AI 供应商是用户显式配置的外部 API，不走 SSRF 围栏（用户可能配内网网关），但尊重停止信号
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: combo.signal });
  } catch (e) {
    return { ok: false, error: `AI 请求失败：${e.message}` };
  } finally {
    combo.done();
  }
  const text = await readBodyCapped(res, 1024 * 1024);
  const durationMs = Date.now() - started;
  if (!res.ok) {
    let upstream = '';
    try {
      const j = JSON.parse(text);
      upstream = String((j.error && (j.error.message || j.error.type)) || '').slice(0, 200);
    } catch (_) { /* 非 JSON 上游错误 */ }
    return { ok: false, error: `供应商返回 HTTP ${res.status}（${durationMs}ms）${upstream ? '：' + upstream : ''}` };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    return { ok: false, error: '供应商返回非 JSON（检查 baseUrl 是否指向 API 根）' };
  }
  const outText = wire === 'anthropic-messages'
    ? (Array.isArray(data.content) ? data.content.map((c) => (c && c.type === 'text' ? c.text : '')).join('') : '')
    : String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '');
  if (!outText) return { ok: false, error: '供应商返回空内容（检查 model 是否匹配该供应商）' };
  return {
    ok: true,
    output: { text: outText, model: data.model || provider.model, durationMs, usage: data.usage || null },
    excerpt: outText.slice(0, 300),
  };
}

// ── extract / template ───────────────────────────────────────────────────────
function runExtract(step, ctx) {
  const src = engine.lookupPath(ctx, step.from);
  if (!src.found) {
    return { ok: false, error: `extract 来源「${step.from}」不存在：确认前置步骤 saveAs 或参数名` };
  }
  const out = {};
  const warnings = [];
  for (const [name, expr] of Object.entries(step.paths || {})) {
    const r = engine.getPath(src.value, expr);
    if (r.found) out[name] = r.value;
    else {
      out[name] = null;
      warnings.push(`路径 {{${step.from}.${expr}}} 未命中 → null`);
    }
  }
  return { ok: true, output: out, excerpt: engine.stringifyValue(out).slice(0, 200), warnings };
}

function runTemplate(step, ctx) {
  const r = engine.resolveTemplate(step.text, ctx);
  return { ok: true, output: r.value, excerpt: String(r.value).slice(0, 200), warnings: r.warnings };
}

// ── script ───────────────────────────────────────────────────────────────────
function runScript(step, ctx) {
  const code = String(step.code || '');
  const logs = [];
  const sandbox = {
    vars: cloneJson(ctx.vars) || {},
    params: cloneJson(ctx.params) || {},
    steps: cloneJson(snapshotSteps(ctx.steps)) || {},
    console: {
      log: (...a) => logs.push(a.map((x) => engine.stringifyValue(x)).join(' ')),
    },
    JSON, Math, Number, String, Boolean, Array, Object, RegExp, Error, Date,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  };
  let result;
  try {
    result = vm.runInNewContext(`(function(){ "use strict";\n${code}\n})()`, vm.createContext(sandbox), {
      timeout: SCRIPT_TIMEOUT_MS,
      displayErrors: true,
    });
  } catch (e) {
    const msg = e.message || String(e);
    return { ok: false, error: /Script execution timed out/.test(msg) ? `脚本超时（>${SCRIPT_TIMEOUT_MS}ms）：检查是否有死循环` : `脚本执行失败：${msg.slice(0, 200)}` };
  }
  if (result === undefined) {
    return { ok: false, error: '脚本没有 return 返回值（补一句 return {...}）' };
  }
  // vm 上下文里创建的对象原型与本进程不同，出沙箱即深克隆归一
  const output = typeof result === 'object' && result !== null ? cloneJson(result) : result;
  return { ok: true, output, excerpt: (logs.length ? `[log] ${logs.join(' | ').slice(0, 150)}` : engine.stringifyValue(output).slice(0, 200)) };
}

function cloneJson(v) {
  if (v === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; }
}

function snapshotSteps(steps) {
  // 步骤输出给脚本只读快照；body 上限 256KB 防脚本上下文过大
  const out = {};
  for (const [k, v] of Object.entries(steps || {})) {
    if (v && typeof v === 'object' && typeof v.body === 'string' && v.body.length > 256 * 1024) {
      out[k] = { ...v, body: v.body.slice(0, 256 * 1024) + '…(截断)' };
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── kv ───────────────────────────────────────────────────────────────────────
async function runKv(step, ctx, ex) {
  const key = engine.stringifyValue(engine.resolveTemplate(step.key, ctx).value).trim();
  if (!key) return { ok: false, error: 'kv key 插值后为空' };
  const action = String(step.action || 'get');
  try {
    if (action === 'get') {
      const value = await ex.kv.kvGet(key);
      return { ok: true, output: value, excerpt: `get ${key} → ${engine.stringifyValue(value).slice(0, 120) || '(null)'}` };
    }
    if (action === 'set') {
      const vr = engine.resolveDeep(step.value, ctx);
      await ex.kv.kvSet(key, vr.value);
      return { ok: true, output: vr.value, excerpt: `set ${key} ← ${engine.stringifyValue(vr.value).slice(0, 120)}` };
    }
    if (action === 'del') {
      await ex.kv.kvDel(key);
      return { ok: true, output: null, excerpt: `del ${key}` };
    }
    return { ok: false, error: `未知 kv action：${action}` };
  } catch (e) {
    return { ok: false, error: `cap.kv ${action} 失败：${e.message}` };
  }
}

// ── file ─────────────────────────────────────────────────────────────────────
function fileRoots(appConfigDir) {
  const roots = [];
  if (appConfigDir) roots.push(path.join(appConfigDir, 'flow-pipeline', 'outputs'));
  const desktop = path.join(os.homedir(), 'Desktop');
  roots.push(desktop);
  roots.push(os.tmpdir());
  return roots.filter(Boolean);
}

function resolveWritablePath(rawPath, appConfigDir) {
  const p = String(rawPath || '').trim();
  if (!p) return { error: 'path 为空' };
  // 相对路径默认落输出目录（appConfigDir/flow-pipeline/outputs）；无 appConfigDir 时退桌面
  const outputsRoot = appConfigDir ? path.join(appConfigDir, 'flow-pipeline', 'outputs') : path.join(os.homedir(), 'Desktop');
  const abs = path.isAbsolute(p) ? path.normalize(p) : path.join(outputsRoot, p);
  const roots = fileRoots(appConfigDir);
  for (const root of roots) {
    const norm = path.normalize(root);
    if (abs === norm || abs.startsWith(norm + path.sep)) return { abs, root: norm };
  }
  return {
    error: `path 不在允许的根目录内（白名单：${roots.join(' ; ')}）。相对路径默认落输出目录`,
  };
}

async function runFile(step, ctx, ex) {
  const pr = engine.resolveTemplate(step.path, ctx);
  const target = resolveWritablePath(engine.stringifyValue(pr.value), ex.appConfigDir);
  if (target.error) return { ok: false, error: target.error };
  const action = String(step.action || 'write');
  const cr = engine.resolveDeep(step.content, ctx);
  let content = typeof cr.value === 'string' ? cr.value : JSON.stringify(cr.value, null, 2);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_FILE_BYTES) return { ok: false, error: `内容 ${(bytes / 1024 / 1024).toFixed(1)}MB 超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限` };
  try {
    fs.mkdirSync(path.dirname(target.abs), { recursive: true });
    if (action === 'append') fs.appendFileSync(target.abs, content);
    else fs.writeFileSync(target.abs, content);
  } catch (e) {
    return { ok: false, error: `写文件失败：${e.message}` };
  }
  const warning = pr.warnings.length ? `（path 有未命中占位符）` : '';
  return { ok: true, output: { path: target.abs, bytes }, excerpt: `${action} ${target.abs}（${bytes}B）${warning}`, warnings: pr.warnings };
}

// ── 分发 ─────────────────────────────────────────────────────────────────────
async function runStep(step, ctx, ex) {
  try {
    switch (step.type) {
      case 'http': return await runHttp(step, ctx, ex);
      case 'notify': return await runNotify(step, ctx, ex);
      case 'mcp': return await runMcp(step, ctx, ex);
      case 'ai': return await runAi(step, ctx, ex);
      case 'extract': return runExtract(step, ctx);
      case 'template': return runTemplate(step, ctx);
      case 'script': return runScript(step, ctx);
      case 'kv': return await runKv(step, ctx, ex);
      case 'file': return await runFile(step, ctx, ex);
      default: return { ok: false, error: `未知步骤类型：${step.type}` };
    }
  } catch (e) {
    // 围栏拒绝 / DNS 失败 / 流读取异常等抛错型失败 → 统一转为可记录结果
    if (ex && ex.signal && ex.signal.aborted) {
      return { ok: false, error: '运行已被停止' };
    }
    return { ok: false, error: String(e.message || e).slice(0, 400) };
  }
}

function selfTestFence() {
  // 离线自检：围栏对私网字面量/元数据地址的判定（不发任何真实请求）
  const cases = [
    ['127.0.0.1', false, false], // 私网 + 未开 allowLocal → 应拒
    ['127.0.0.1', true, true],   // 私网 + allowLocal → 放行
    ['169.254.169.254', true, false], // 元数据 → 永拒
    ['10.1.2.3', false, false],
    ['192.168.1.7', false, false],
    ['example.com', true, true], // 公网域名（围栏阶段只判私网，公网放行）
  ];
  const results = [];
  for (const [host, allowLocal, expectOk] of cases) {
    let ok;
    let reason = '';
    try {
      const isIp = net.isIP(host);
      if (isIp) {
        if (isPrivateIp(host) && !(allowLocal && !ALWAYS_DENY_IPS.has(host))) throw new Error('private');
        ok = true;
      } else {
        ok = true; // 域名走 DNS 路径，自检只验字面量分支
      }
    } catch (e) {
      ok = false;
      reason = e.message;
    }
    results.push({ host, allowLocal, ok, expectOk, pass: ok === expectOk, reason });
  }
  return results;
}

module.exports = {
  runStep,
  fenceUrl,
  isPrivateIp,
  resolveEndpoint,
  resolveWritablePath,
  fileRoots,
  extractMcpText,
  selfTestFence,
  MAX_BODY_BYTES,
  MAX_FILE_BYTES,
  SCRIPT_TIMEOUT_MS,
};
