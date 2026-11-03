#!/usr/bin/env node
'use strict';
/**
 * openapi-desk MCP Server —— OpenAPI 调试台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 oadesk.* 键空间命令投递。合同解析、请求
 * 执行与校验的唯一权威是后台服务（service/main.js）——MCP 只投递命令并等待
 * 回执，与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量：
 *   - AI 只能对「已导入合同」的端点发请求（specId+endpointId 必填，不接受任意 URL）；
 *   - 非安全方法（POST/PUT/PATCH/DELETE）服务端强制 confirm:true（用户确认后才发）；
 *   - 面向 AI 的返回均为掩码形态：鉴权值不出现在任何工具输出；
 *   - 不提供删除合同/修改环境的工具（写操作仅限发送请求本身）。
 *
 * 工具一览（5 个）：
 *   oadesk_specs     列出已导入的合同
 *   oadesk_endpoints 列出某合同的端点（方法/路径/参数概要）
 *   oadesk_call      按合同构造并发送一次真实请求
 *   oadesk_verify    调用 + 按合同逐字段校验响应（漂移报告，核心工具）
 *   oadesk_diff      对比两版合同，标出 breaking changes
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'openapi-desk';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'oadesk.meta',
  specs: 'oadesk.specs',
  cmd: 'oadesk.cmd',
  res: 'oadesk.res',
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function oneLine(s, n = 110) {
  const s2 = String(s || '').replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
}

// ── 命令投递（单槽信箱）────────────────────────────────────────────────────
let nonceCounter = 0;
async function sendCommand(action, payload, waitMs) {
  const nonce = `m${Date.now().toString(36)}-${++nonceCounter}`;
  await kv.kvSet(K.cmd, { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + (waitMs || 120000);
  let sawStale = false;
  while (Date.now() < deadline) {
    await sleep(600);
    let res;
    try { res = await kv.kvGet(K.res); } catch (_) { continue; }
    if (res && res.nonce === nonce) {
      await kv.kvDel(K.res).catch(() => { /* 消费失败不影响结果读取 */ });
      return res.result || { ok: false, error: '回执为空' };
    }
    if (res && res.nonce) sawStale = true;
  }
  return {
    ok: false,
    pending: true,
    error: sawStale
      ? `命令已投递但 ${Math.round((waitMs || 120000) / 1000)}s 内未见回执（请求可能仍在进行）。用 oadesk_call 的 get_req 稍后读取。`
      : '命令已投递但服务无响应（服务可能未启动；打开一次插件面板可触发启动）。',
  };
}

// ── 渲染（AI 可读文本，全掩码）─────────────────────────────────────────────
function renderSpecLine(s, i) {
  return `${i + 1}. [${s.id}] ${s.name}${s.title && s.title !== s.name ? `（${s.title}）` : ''} · ${s.specVersion}/${s.version || '?'} · ${s.endpointCount} 端点 · ${s.importedAt.slice(0, 16).replace('T', ' ')}${s.serverUrls && s.serverUrls.length ? ` · ${s.serverUrls[0]}` : ''}`;
}

function renderDrifts(drifts, limit) {
  const icon = { breaking: '❌', warn: '⚠', info: 'ℹ' };
  const list = (drifts || []).slice(0, limit == null ? 12 : limit);
  const lines = list.map((d) => `${icon[d.severity] || '·'} [${d.kind}] ${d.jsonPath}\n   期望：${oneLine(d.expected, 160)}\n   实际：${oneLine(d.actual, 160)}${d.hint ? `\n   → ${oneLine(d.hint, 140)}` : ''}`);
  if ((drifts || []).length > list.length) lines.push(`…另有 ${drifts.length - list.length} 条（见面板）`);
  return lines.join('\n');
}

function renderCallRecord(rec, { withDrifts = true, withBody = false } = {}) {
  const lines = [];
  const st = rec.status || 0;
  const mark = rec.ok ? '✓' : '❌';
  lines.push(`${mark} ${rec.endpoint ? `${rec.endpoint.method} ${rec.endpoint.path}` : ''} · HTTP ${st || (rec.error ? '网络失败' : '?')} · ${rec.ms}ms${rec.location ? ` · 重定向到 ${oneLine(rec.location, 100)}` : ''}`);
  lines.push(`URL：${rec.url}`);
  if (withBody && rec.respText) lines.push(`响应体（前 600 字符）：${oneLine(rec.respText, 600)}`);
  if (rec.error) lines.push(`网络错误：${oneLine(rec.error, 200)}`);
  if (withDrifts && rec.validation) {
    const s = rec.validation.summary;
    if (!rec.validation.statusInContract) {
      lines.push(`合同校验：❌ 状态码不在合同内${s.breaking ? `（breaking ${s.breaking}）` : ''}`);
    } else if (s.total === 0) {
      lines.push('合同校验：✓ 响应与合同完全相符（零漂移）');
    } else {
      lines.push(`合同校验：breaking ${s.breaking} / 告警 ${s.warn} / 信息 ${s.info}（共 ${s.total} 条）`);
    }
    const d = renderDrifts(rec.validation.drifts);
    if (d) lines.push(d);
  }
  return lines.join('\n');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function loadSpecsOrErr() {
  try {
    const v = await kv.kvGet(K.specs);
    const items = v && Array.isArray(v.items) ? v.items : [];
    return { items };
  } catch (e) {
    return { error: `合同索引读取失败（桥不可达？）：${e.message}` };
  }
}

async function toolSpecs() {
  const { items, error } = await loadSpecsOrErr();
  if (error) return err(error);
  if (!items.length) return ok('暂无合同。请先在面板「合同库」页导入 openapi.yaml/json（粘贴/文件/URL 均可），导入后告诉我合同名即可继续。');
  return ok(`共 ${items.length} 份合同：\n${items.map(renderSpecLine).join('\n')}\n\n用 oadesk_endpoints 的 specId 查看端点。`);
}

async function toolEndpoints(args) {
  const specId = String(args.specId || '');
  let specName = specId;
  const { items, error } = await loadSpecsOrErr();
  if (error) return err(error);
  if (!items.length) return ok('暂无合同。请先在面板导入 openapi.yaml/json。');
  let target = items.find((s) => s.id === specId);
  if (!target && specId) {
    // 容错：允许传合同名（取最新一份匹配）
    const byName = items.filter((s) => s.name === specId || (s.title || '') === specId);
    if (byName.length) target = byName[byName.length - 1];
  }
  if (!target) {
    if (!specId && items.length === 1) target = items[0];
    else return ok(`请指定 specId（从 oadesk_specs 获取；也接受合同名）。当前可用：\n${items.map(renderSpecLine).join('\n')}`);
  }
  specName = target.name;
  const r = await sendCommand('spec_get', { specId: target.id }, 30000);
  if (!r.ok) return err(r.error || 'spec_get 失败');
  const eps = r.endpoints || [];
  const lines = eps.map((e, i) => {
    const params = (e.parameters || []).map((p) => `${p.name}${p.required ? '*' : ''}(${p.in}${p.type ? ':' + p.type : ''})`).join(', ');
    const body = e.hasRequestBody ? ` · 体${e.requestBodyRequired ? '(必填)' : '(可选)'}` : '';
    return `${i + 1}. [${e.id}] ${e.summary || ''}${e.deprecated ? '（已废弃）' : ''}${e.needsAuth ? ' · 需鉴权' : ''}${params ? `\n   参数：${params}` : ''}${body} · 响应码：${(e.responseCodes || []).join('/')}`;
  });
  return ok(`【${specName}】共 ${eps.length} 个端点：\n${lines.join('\n')}\n\n用 oadesk_call / oadesk_verify 的 specId=${target.id} + endpointId 调用。`);
}

/** 组装 call payload（call/verify 共用） */
async function buildCallPayload(args, viaAi) {
  const specId = String(args.specId || '');
  const { items, error } = await loadSpecsOrErr();
  if (error) return { error };
  if (!items.length) return { error: '暂无合同。请先在面板导入 openapi.yaml/json。' };
  let target = items.find((s) => s.id === specId);
  if (!target) {
    const byName = items.filter((s) => s.name === specId || (s.title || '') === specId);
    if (byName.length) target = byName[byName.length - 1];
  }
  if (!target) {
    return { error: `合同不存在：${specId || '（未提供）'}。用 oadesk_specs 查看可用合同。` };
  }
  const payload = {
    specId: target.id,
    endpointId: String(args.endpointId || ''),
    values: args.values && typeof args.values === 'object' ? args.values : {},
    bodyText: args.bodyText != null ? String(args.bodyText) : undefined,
    baseUrl: args.baseUrl != null ? String(args.baseUrl) : undefined,
    timeoutMs: args.timeoutMs,
    confirm: args.confirm === true,
    cap: { viaAi: true },
  };
  if (!payload.endpointId) {
    return { error: `endpointId 必填（形如 "GET /pets"，从 oadesk_endpoints 获取）。合同【${target.name}】可用端点先用 oadesk_endpoints 查看。` };
  }
  return { payload, spec: target };
}

async function toolCall(args) {
  const built = await buildCallPayload(args, true);
  if (built.error) return ok(built.error);
  const r = await sendCommand('call', built.payload, args.waitMs || 120000);
  if (!r.ok) {
    if (r.needsConfirm) return ok(`⏸ 未发送（安全护栏）：${r.error}`);
    return err(r.error || '调用失败');
  }
  return ok(`${renderCallRecord(r.record, { withDrifts: false, withBody: true })}\n\n（reqId=${r.record.reqId}；要按合同校验这次响应请用 oadesk_verify）`);
}

async function toolVerify(args) {
  const built = await buildCallPayload(args, true);
  if (built.error) return ok(built.error);
  const r = await sendCommand('call', built.payload, args.waitMs || 120000);
  if (!r.ok) {
    if (r.needsConfirm) return ok(`⏸ 未发送（安全护栏）：${r.error}`);
    return err(r.error || '调用失败');
  }
  const head = `【合同校验】${built.spec.name} · ${r.record.endpoint.method} ${r.record.endpoint.path}`;
  return ok(`${head}\n${renderCallRecord(r.record, { withDrifts: true, withBody: args.includeBody === true })}\n\n（reqId=${r.record.reqId}）`);
}

async function toolDiff(args) {
  const specIdA = String(args.specIdA || '');
  const specIdB = String(args.specIdB || '');
  const { items, error } = await loadSpecsOrErr();
  if (error) return err(error);
  if (items.length < 2) return ok('至少需要两份已导入合同才能对比（把新旧两版 openapi 文件各导入一次）。');
  const find = (id) => items.find((s) => s.id === id) || items.filter((s) => s.name === id || (s.title || '') === id).slice(-1)[0];
  const a = find(specIdA);
  const b = find(specIdB);
  if (!a || !b) {
    return ok(`请指定 specIdA 与 specIdB（从 oadesk_specs 获取；也接受合同名）。当前可用：\n${items.map(renderSpecLine).join('\n')}`);
  }
  const r = await sendCommand('diff', { specIdA: a.id, specIdB: b.id }, 60000);
  if (!r.ok) return err(r.error || 'diff 失败');
  const rep = r.report;
  const lines = [];
  lines.push(`【合同对比】${rep.a.name}${rep.a.version ? ` v${rep.a.version}` : ''} → ${rep.b.name}${rep.b.version ? ` v${rep.b.version}` : ''}`);
  lines.push(`结论：breaking ${rep.summary.breaking} 条${rep.summary.warn ? ` / 告警 ${rep.summary.warn} 条` : ''}${rep.summary.info ? ` / 信息 ${rep.summary.info} 条` : ''}`);
  if (!rep.changes.length) {
    lines.push('两版合同结构完全一致。');
  } else {
    const breaking = rep.changes.filter((c) => c.breaking);
    const others = rep.changes.filter((c) => !c.breaking);
    for (const c of breaking.slice(0, 20)) lines.push(`❌ [${c.kind}] ${c.method ? c.method.toUpperCase() + ' ' : ''}${c.path}\n   ${oneLine(c.detail, 200)}`);
    for (const c of others.slice(0, 25)) lines.push(`· [${c.kind}] ${c.method ? c.method.toUpperCase() + ' ' : ''}${c.path}\n   ${oneLine(c.detail, 180)}`);
    if (breaking.length > 20) lines.push(`…另有 ${breaking.length - 20} 条 breaking（见面板对比页）`);
  }
  return ok(lines.join('\n'));
}

// ── 工具注册（description 写「适用句式」）───────────────────────────────────
const tools = [
  {
    name: 'oadesk_specs',
    description: '列出已导入的 OpenAPI 合同（名称/版本/端点数/服务器地址）。适用于「有哪些接口文档」「看看合同列表」「我们要调试哪个 API」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolSpecs,
  },
  {
    name: 'oadesk_endpoints',
    description: '列出某份 OpenAPI 合同的全部端点：方法/路径/摘要/参数(名称/位置/必填/类型)/请求体/响应码/是否需要鉴权。适用于「这个 API 有哪些接口」「getUserById 的参数是什么」「哪些接口要 token」。specId 可传合同 id 或合同名。',
    inputSchema: {
      type: 'object',
      properties: { specId: { type: 'string', description: '合同 id 或合同名（从 oadesk_specs 获取；唯一合同时可省略）' } },
    },
    call: toolEndpoints,
  },
  {
    name: 'oadesk_call',
    description: '按 OpenAPI 合同构造并发送一次真实 HTTP 请求（服务端代理发送，无跨域限制）。values 格式：{path:{petId:"5"}, query:{limit:"20"}, header:{}}；bodyText 为请求体 JSON 字符串（参数形态不知道时先用 oadesk_endpoints 查）。安全护栏：POST/PUT/PATCH/DELETE 等非安全方法必须先向用户说明并获得同意，然后带 confirm:true，否则服务拒绝发送。',
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string', description: '合同 id 或合同名' },
        endpointId: { type: 'string', description: '端点 id，形如 "GET /pets"（从 oadesk_endpoints 获取，必填）' },
        values: {
          type: 'object',
          description: '参数值：{path:{...}, query:{...}, header:{...}}（按合同参数名）',
          properties: {
            path: { type: 'object' },
            query: { type: 'object' },
            header: { type: 'object' },
          },
        },
        bodyText: { type: 'string', description: '请求体 JSON 字符串（POST/PUT 等）' },
        baseUrl: { type: 'string', description: '覆盖服务器地址（缺省用面板里配置的环境或合同 servers[0]）' },
        confirm: { type: 'boolean', description: '用户已确认非安全方法的副作用（写/删操作必填）' },
        timeoutMs: { type: 'integer', description: '超时毫秒（默认 30000）' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 120000）' },
      },
      required: ['endpointId'],
    },
    call: toolCall,
  },
  {
    name: 'oadesk_verify',
    description: '按合同调用端点并逐字段校验响应（核心工具）：状态码是否在合同、字段类型漂移、必填缺失、枚举越界、格式问题，产出 breaking/告警/信息三级中文报告。适用于「这个接口返回的和文档一致吗」「帮我验收一下这些接口」「文档说返回 Pet 但实际多了/少了什么」。护栏同 oadesk_call（非安全方法需 confirm）。',
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string', description: '合同 id 或合同名' },
        endpointId: { type: 'string', description: '端点 id，形如 "GET /pets"（必填）' },
        values: {
          type: 'object',
          description: '参数值：{path:{...}, query:{...}, header:{...}}',
          properties: {
            path: { type: 'object' },
            query: { type: 'object' },
            header: { type: 'object' },
          },
        },
        bodyText: { type: 'string', description: '请求体 JSON 字符串' },
        baseUrl: { type: 'string', description: '覆盖服务器地址' },
        includeBody: { type: 'boolean', description: '结果里附带响应体前 600 字符' },
        confirm: { type: 'boolean', description: '用户已确认非安全方法的副作用' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 120000）' },
      },
      required: ['endpointId'],
    },
    call: toolVerify,
  },
  {
    name: 'oadesk_diff',
    description: '结构化对比两份已导入的 OpenAPI 合同：端点增删、参数变化、必填收紧、类型变更、枚举收缩、请求体/响应 schema 变化、鉴权变化，breaking 逐条标红并说明调用方影响。适用于「API 升级会不会炸」「新旧两版文档差在哪」「这次变更对客户端有什么破坏」。新旧两版文件各导入一次即可对比。',
    inputSchema: {
      type: 'object',
      properties: {
        specIdA: { type: 'string', description: '旧版合同 id 或合同名' },
        specIdB: { type: 'string', description: '新版合同 id 或合同名' },
      },
      required: ['specIdA', 'specIdB'],
    },
    call: toolDiff,
  },
];

// ── stdio JSON-RPC 骨架（协议数据只走 stdout，日志全走 stderr）────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function respondErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { respondErr(msg.id, -32602, `未知工具：${name}`); return; }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => respond(msg.id, err(`工具执行异常：${(e && e.message) || e}`)));
    return;
  }
  if (msg.method === 'ping') { respond(msg.id, {}); return; }
  // 未知请求忽略（保持骨架与宿主兼容）
}

log('info', `openapi-desk MCP server 启动（${SERVER_VERSION}）`);
