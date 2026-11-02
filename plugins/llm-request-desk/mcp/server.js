#!/usr/bin/env node
'use strict';
/**
 * llm-request-desk MCP Server —— LLM 请求调试台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 llmdesk.* 键空间命令投递。请求执行与结果
 * 写入的唯一权威是后台服务（service/main.js）——MCP 只投递命令并等待回执，
 * 与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量：
 *   - 所有面向 AI 的返回均为掩码形态（****last4），完整 apiKey 对 MCP 不可见；
 *   - AI 只能对「已保存端点」发请求（endpointId 必填，不接受任意 URL）；
 *   - 成本护栏：AI 通道 maxTokens 缺省 256，上限 256；confirm:true 才放宽到 4096；
 *   - 不提供删除/修改端点的工具（写操作仅限发送请求本身）。
 *
 * 工具一览（4 个）：
 *   llmdesk_endpoints 列出可调试端点（掩码）
 *   llmdesk_send      代发一次 LLM 请求并带回诊断结论
 *   llmdesk_get       读取某次请求的完整记录（构造体/响应/诊断/时间线摘要）
 *   llmdesk_history   请求历史一览
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'llm-request-desk';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'llmdesk.meta',
  endpoints: 'llmdesk.endpoints',
  latest: 'llmdesk.latest',
  history: 'llmdesk.history',
  req: (id) => `llmdesk.req.${id}`,
  cmd: 'llmdesk.cmd',
  res: 'llmdesk.res',
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
    await sleep(1200);
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
      ? `命令已投递但 ${Math.round((waitMs || 120000) / 1000)}s 内未见回执（请求可能仍在进行）。用 llmdesk_get 稍后读取。`
      : '命令已投递但服务无响应（服务可能未启动）。',
  };
}

// ── 渲染（AI 可读文本，全掩码）─────────────────────────────────────────────
function renderFindings(findings) {
  const icon = { error: '❌', warn: '⚠', info: 'ℹ' };
  return (findings || []).map((f) => `${icon[f.severity] || '·'} [${f.id}] ${f.title}\n   ${oneLine(f.detail, 220)}${f.fix ? `\n   → 修复：${oneLine(f.fix, 180)}` : ''}`).join('\n');
}

function renderRecord(rec, { body = false } = {}) {
  const ep = rec.endpoint || {};
  const lines = [];
  lines.push(`【${ep.name}】${ep.wire === 'anthropic-messages' ? 'Anthropic Messages' : 'OpenAI Chat'} · ${ep.baseUrl} · key ${ep.keyMask || '（无）'}`);
  const st = rec.status || 0;
  const mark = rec.ok ? '✓' : '❌';
  lines.push(`${mark} HTTP ${st || (rec.error ? '网络失败' : '?')} · 总耗时 ${rec.ms}ms`);
  if (rec.streamInfo) {
    const si = rec.streamInfo;
    lines.push(`流式：chunk ${si.chunkCount} 个 / TTFT ${si.ttftMs != null ? si.ttftMs + 'ms' : '—'} / ${si.tps || 0} tok/s(估)${si.finishReason ? ` / finish=${si.finishReason}` : ' / 无终止标记'}${si.doneMarker ? ' / [DONE] ✓' : ''}`);
    if (si.usage) lines.push(`用量：输入 ${si.usage.prompt ?? '?'} + 输出 ${si.usage.completion ?? '?'} token`);
    const text = (si.text || '').trim();
    if (text) lines.push(`正文：${oneLine(text, 500)}`);
    if (si.reasoning) lines.push(`思考：${oneLine(si.reasoning, 200)}`);
    if (si.sawError) lines.push(`流内错误：${oneLine(si.sawError.message || JSON.stringify(si.sawError), 200)}`);
  } else if (rec.content) {
    lines.push(`正文：${oneLine(rec.content, 500)}`);
  } else if (rec.parsedError) {
    lines.push(`错误体：[${rec.parsedError.providerCode || '?'}] ${oneLine(rec.parsedError.message, 240)}`);
  } else if (rec.error) {
    lines.push(`网络错误：${oneLine(rec.error, 200)}`);
  }
  if (body && rec.body) lines.push(`请求体：${oneLine(JSON.stringify(rec.body), 600)}`);
  if (rec.url) lines.push(`URL：${rec.url}`);
  const f = renderFindings(rec.findings);
  if (f) lines.push(`诊断：\n${f}`);
  return lines.join('\n');
}

async function loadEndpointsOrErr() {
  try {
    const v = await kv.kvGet(K.endpoints);
    const items = v && Array.isArray(v.items) ? v.items : [];
    return { items };
  } catch (e) {
    return { error: `端点读取失败（桥不可达？）：${e.message}` };
  }
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolEndpoints() {
  const { items, error } = await loadEndpointsOrErr();
  if (error) return err(error);
  if (!items.length) return ok('暂无端点。请在面板「端点」页点「导入宿主端点」，或手动添加。');
  const lines = items.map((p, i) =>
    `${i + 1}. [${p.id}] ${p.name}｜${p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}｜${p.baseUrl}｜key ${p.keyMask}｜${p.source === 'host' ? '宿主导入' : '手动'}`);
  return ok(`共 ${items.length} 个端点（key 均已掩码）：\n${lines.join('\n')}\n\n用 llmdesk_send 的 endpointId 发请求。`);
}

async function toolSend(args) {
  const endpointId = String(args.endpointId || '');
  const { items, error } = await loadEndpointsOrErr();
  if (error) return err(error);
  if (!items.length) return ok('暂无端点。请先在面板「端点」页导入宿主端点或手动添加。');
  if (!endpointId || !items.some((p) => p.id === endpointId)) {
    return ok(`请指定 endpointId（必填，从 llmdesk_endpoints 里选；本工具不接受任意 URL）。当前可选：\n${items.map((p) => `- ${p.id}（${p.name}）`).join('\n')}`);
  }

  // 变异重放模式：先从历史记录变异，再发送
  let draft = args.draft && typeof args.draft === 'object' ? args.draft : null;
  if (args.reqId && args.mutatorId) {
    const m = await sendCommand('mutate', { reqId: String(args.reqId), mutatorId: String(args.mutatorId) }, 30000);
    if (!m.ok) return err(`变异失败：${m.error}`);
    draft = draft ? { ...m.body, ...stripEmpty(draft) } : m.body;
  } else if (!draft && !args.rawJson) {
    return ok('请提供 draft（model/messages 等）、或 rawJson（完整请求体 JSON 字符串）、或 reqId+mutatorId（变异重放）三者之一。');
  }
  if (args.rawJson) {
    try {
      const raw = JSON.parse(String(args.rawJson));
      if (!raw || typeof raw !== 'object') throw new Error('请求体必须是 JSON 对象');
      if (draft && draft.messages && !raw.messages) draft = { ...draft, rawBody: raw };
      else draft = { rawBody: raw };
    } catch (e) {
      return err(`rawJson 解析失败：${e.message}`);
    }
  }

  const confirm = args.confirm === true;
  const r = await sendCommand('send', {
    endpointId,
    draft,
    force: args.force === true,
    cap: { maxTokensMax: confirm ? 4096 : 256 },
  }, args.waitMs || 120000);
  if (!r.ok) {
    if (r.precheck && !args.force) {
      return ok(`发送被预检拦截（未消耗端点额度）：\n${(r.precheck.errors || []).map((e) => `❌ ${e}`).join('\n')}${(r.precheck.warnings || []).length ? `\n⚠ ${(r.precheck.warnings).join('\n⚠ ')}` : ''}\n\n可修正 draft 后重试；确认要坚持发送可带 force:true。`);
    }
    return err(r.error || '发送失败');
  }
  return ok(`${renderRecord(r.record, { body: true })}\n\n（reqId=${r.record.reqId}，可用 llmdesk_get 回读；变异重放用 llmdesk_send 带 reqId+mutatorId）`);
}

function stripEmpty(d) {
  const out = {};
  for (const [k, v] of Object.entries(d || {})) if (v != null && v !== '') out[k] = v;
  return out;
}

async function toolGet(args) {
  const reqId = String(args.reqId || '');
  let rec = null;
  try {
    rec = reqId ? await kv.kvGet(K.req(reqId)) : await kv.kvGet(K.latest);
  } catch (e) {
    return err(`记录读取失败：${e.message}`);
  }
  if (!rec) return ok(reqId ? `记录 ${reqId} 不存在或已被清理（保留最近 30 条完整记录）。` : '尚无请求记录。用 llmdesk_send 发一次。');
  return ok(`（${reqId ? '指定记录' : '最近一次请求'}，reqId=${rec.reqId}）\n${renderRecord(rec, { body: true })}`);
}

async function toolHistory(args) {
  let h = [];
  try {
    const v = await kv.kvGet(K.history);
    h = Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
  } catch (e) { return err(`历史读取失败：${e.message}`); }
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);
  const filter = args.endpointId ? String(args.endpointId) : '';
  const rows = h.filter((x) => !filter || x.endpointId === filter).slice(0, limit);
  if (!rows.length) return ok('暂无请求历史。');
  const lines = rows.map((x) => {
    const mark = x.ok ? '✓' : '❌';
    const ttft = x.ttftMs != null ? ` TTFT ${x.ttftMs}ms` : '';
    const finding = x.firstFinding ? ` ｜${oneLine(x.firstFinding, 60)}` : '';
    return `${mark} ${String(x.at || '').replace('T', ' ').slice(0, 16)} [${x.endpointName}] ${x.model || '?'} HTTP ${x.status} ${x.ms}ms${ttft}${finding}（reqId=${x.reqId}）`;
  });
  return ok(`最近 ${rows.length} 条请求：\n${lines.join('\n')}\n\n用 llmdesk_get reqId=... 看详情，或 llmdesk_send reqId=... mutatorId=... 做变异重放。`);
}

// ── 工具注册（description 写「适用句式」）───────────────────────────────────
const tools = [
  {
    name: 'llmdesk_endpoints',
    description: '列出可调试的 LLM 端点（宿主已配置的供应商自动导入 + 手动添加，key 全掩码）。适用于「有哪些端点可以调试」「列出模型供应商」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolEndpoints,
  },
  {
    name: 'llmdesk_send',
    description: '向已保存的 LLM 端点代发一次真实请求并带回完整诊断（HTTP 状态、流式时间线、中文根因分析与修复建议）。适用于「帮我把这个请求发到 XX 看看什么错」「这个 400 到底哪里的参数不对」「试试去掉某个字段能不能过」。三种用法：① draft（model/messages/maxTokens/temperature/stream/extra）；② rawJson（完整请求体 JSON 字符串，原样透传）；③ reqId+mutatorId（把某次历史请求变异后重放，变异器如 append-empty-user/standard-fields/minimal/halve-messages/no-tools/no-stream/lower-max-tokens/drop-trailing-assistant/convert-system）。成本护栏：AI 通道 maxTokens 上限 256（confirm:true 放宽到 4096），会产生真实生成费用，大请求前请向用户确认。',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string', description: '端点 id（从 llmdesk_endpoints 获取，必填）' },
        draft: {
          type: 'object',
          description: '请求草稿：{model, system?, messages:[{role:user|assistant,content}], maxTokens?, temperature?, topP?, stream?, extra?}',
          properties: {
            model: { type: 'string' },
            system: { type: 'string' },
            messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string' } }, required: ['role', 'content'] } },
            maxTokens: { type: 'integer' },
            temperature: { type: 'number' },
            topP: { type: 'number' },
            stream: { type: 'boolean' },
            extra: { type: 'object', description: '非标准字段透传（thinking 等），实验用' },
          },
        },
        rawJson: { type: 'string', description: '完整请求体 JSON 字符串（原样透传，高级模式）' },
        reqId: { type: 'string', description: '变异重放：源请求记录 id' },
        mutatorId: { type: 'string', description: '变异重放：变异器 id（与 reqId 搭配）' },
        force: { type: 'boolean', description: '预检失败仍强制发送（默认 false）' },
        confirm: { type: 'boolean', description: '用户已确认花费，maxTokens 上限放宽到 4096' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 120000）' },
      },
      required: ['endpointId'],
    },
    call: toolSend,
  },
  {
    name: 'llmdesk_get',
    description: '读取某次 LLM 请求的完整记录：请求体、响应、流式时间线摘要、逐条诊断。适用于「刚才那次请求的详情」「看看上次 400 的请求体长什么样」。缺省返回最近一次。',
    inputSchema: {
      type: 'object',
      properties: { reqId: { type: 'string', description: '请求记录 id（缺省=最近一次）' } },
    },
    call: toolGet,
  },
  {
    name: 'llmdesk_history',
    description: 'LLM 请求历史一览：每次请求的状态/耗时/TTFT/首条诊断。适用于「最近发过哪些请求」「之前那个 400 是什么时候」。',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string', description: '只看某端点' },
        limit: { type: 'integer', description: '返回条数（默认 15，上限 40）' },
      },
    },
    call: toolHistory,
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

log('info', `llm-request-desk MCP server 启动（${SERVER_VERSION}）`);
