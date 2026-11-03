#!/usr/bin/env node
'use strict';
/**
 * server.js —— 链路追踪台 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层：把 tools/call 翻译成对链路数据的查询与操作。
 *   - trace_lens_overview / recent：读 cap.kv（tl.meta / tl.rec.*）
 *   - trace_lens_get / search：直读 spans.jsonl（全量保真，服务端组树）；
 *     留痕文件路径来自 tl.meta（服务写入，同一事实库）
 *   - trace_lens_clear：写命令键（服务消费，先删后做）
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 * 注意：span 属性可能含 prompt / 敏感数据——返回给 AI 的内容仅限本机会话使用，
 * 工具描述已提示 AI 转述时对敏感字段脱敏。
 */
const fs = require('fs');
const crypto = require('crypto');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[trace-lens:mcp] ${msg}\n`); }
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 数据读取 ───────────────────────────────────────────────────────────────
async function readMeta() {
  const v = await kv.kvGet('tl.meta').catch(() => null);
  return v && typeof v === 'object' && v.lastTickAt ? v : null;
}
/** 读 rec 分块 → trace 概览 ring（新在前） */
async function readRing() {
  const keys = (await kv.kvKeys().catch(() => [])).filter((k) => /^tl\.rec\.\d+$/.test(k));
  const map = {};
  for (const k of keys.slice(0, 40)) {
    const v = await kv.kvGet(k).catch(() => null);
    if (Array.isArray(v)) map[k] = v;
  }
  return core.readRing(map);
}
/** 直读 JSONL 全部 span（.old 在前；服务未上线时 filePath 未知则扫兜底路径） */
function readSpansAll(filePath) {
  const out = [];
  for (const f of [`${filePath}.old`, filePath]) {
    let raw = '';
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    for (const line of raw.split('\n')) {
      const rec = core.parseJsonlLine(line);
      if (rec && rec.traceId && rec.spanId) out.push(rec);
    }
  }
  return out;
}
/** spans 按 traceId 分组 */
function groupByTrace(spans) {
  const map = new Map();
  for (const s of spans) {
    if (!map.has(s.traceId)) map.set(s.traceId, []);
    map.get(s.traceId).push(s);
  }
  return map;
}
/** 写命令键 → 轮询结果键（服务 tick 4s，轮询 20s） */
async function sendCommand(op, payload, timeoutMs) {
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const resultKey = `tl.result.${nonce}`;
  await kv.kvSet(`tl.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    const r = await kv.kvGet(resultKey).catch(() => null);
    if (r && typeof r === 'object') {
      await kv.kvDel(resultKey).catch(() => {});
      return r;
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  return { ok: false, error: '服务未在时限内响应（可能未运行：去 设置→插件→链路追踪台 看服务状态）' };
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolOverview() {
  const meta = await readMeta();
  if (!meta) return { text: '链路追踪台服务未上线（没有心跳）。请到 设置→插件→链路追踪台 查看服务状态并启动。', isError: true };
  const age = Math.round((Date.now() - (meta.lastTickAt || 0)) / 1000);
  const lines = [
    `服务: v${meta.version} ${meta.degraded ? '（bridge 降级：接收/落盘不受影响）' : '正常'}，心跳 ${age <= 90 ? `${age} 秒前` : `${Math.round(age / 60)} 分钟前（可能已停止）`}`,
    `OTLP 端点: POST ${meta.endpoint || `http://127.0.0.1:${meta.port}/v1/traces`}（Content-Type: application/json）`,
    '接入方法（任意 OpenTelemetry SDK）:',
    '  Node:   OTEL_EXPORTER_OTLP_PROTOCOL=http/json  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:' + meta.port,
    '  Python: 同上两个环境变量（opentelemetry-exporter-otlp-proto-http 的 JSON 模式）',
    `统计: 累计 ${meta.tracesTotal || 0} traces / ${meta.spansTotal || 0} spans，最近一条 ${meta.lastSpanAt ? core.fmtTime(meta.lastSpanAt) : '无'}`,
    `留痕: ${meta.filePath || '未知'}（${Math.round((meta.fileBytes || 0) / 1024)}KB，8MB 轮转，数据不出本机）`,
    '提示: span 属性可能含 prompt/密钥等敏感数据，向用户转述时请对敏感字段脱敏。',
  ];
  return { text: lines.join('\n') };
}

async function toolRecent(args) {
  const ring = await readRing();
  if (!ring.length) {
    return { text: '暂无链路数据。把 OTel SDK 的导出端点指向 trace_lens_overview 返回的地址（协议 http/json），触发一次业务请求后即可看到 trace。' };
  }
  const limit = Math.min(Math.max(parseInt(args && args.limit, 10) || 15, 1), 60);
  const onlyErr = args && args.hasError === true;
  const rows = ring.filter((r) => !onlyErr || r.hasError).slice(0, limit);
  if (!rows.length) return { text: onlyErr ? '概览里没有错误 trace（最近 60 条范围内）。' : '无记录。' };
  return { text: `最近链路 ${rows.length} 条（新在前）：\n${rows.map((r) => `- ${core.summarizeTrace(r)}`).join('\n')}\n\n要看某条的完整瀑布用 trace_lens_get 传 id；搜索用 trace_lens_search。` };
}

async function toolGet(args) {
  const id = String((args && args.id) || '').trim().toLowerCase();
  if (!id) return { text: '缺少 id 参数（先 trace_lens_recent 拿 id；可只传 traceId 前缀，≥8 位即可唯一匹配）', isError: true };
  const meta = await readMeta();
  if (!meta || !meta.filePath) return { text: '服务未上线，无法定位留痕文件。', isError: true };
  const spans = readSpansAll(meta.filePath);
  let traceId = id;
  const exact = spans.filter((s) => s.traceId === id);
  if (!exact.length) {
    const matches = [...new Set(spans.map((s) => s.traceId).filter((t) => t.startsWith(id)))];
    if (matches.length === 1) traceId = matches[0];
    else if (matches.length > 1) return { text: `前缀 ${id} 匹配到 ${matches.length} 条 trace，请给更长前缀。`, isError: true };
    else return { text: `trace 不存在（可能已被清理或轮转）: ${id}`, isError: true };
  }
  const traceSpans = spans.filter((s) => s.traceId === traceId);
  return { text: core.traceDetailText(traceId, traceSpans) };
}

async function toolSearch(args) {
  const q = String((args && args.q) || '').trim();
  const hasError = args && args.hasError === true;
  const slowerThanMs = Math.max(0, parseInt(args && args.slowerThanMs, 10) || 0);
  const sort = args && args.sort === 'slow' ? 'slow' : 'recent';
  const limit = Math.min(Math.max(parseInt(args && args.limit, 10) || 10, 1), 30);
  if (!q && !hasError && !slowerThanMs) return { text: '至少给一个条件：关键词 q / hasError:true / slowerThanMs', isError: true };
  const meta = await readMeta();
  if (!meta || !meta.filePath) return { text: '服务未上线，无法定位留痕文件。', isError: true };
  const grouped = groupByTrace(readSpansAll(meta.filePath));
  const hits = [];
  for (const [traceId, spans] of grouped) {
    if (core.matchTrace(spans, { q, hasError, slowerThanMs })) {
      hits.push(core.traceSummary(traceId, spans));
    }
  }
  if (sort === 'slow') hits.sort((a, b) => b.durationMs - a.durationMs);
  else hits.sort((a, b) => b.startedAt - a.startedAt);
  if (!hits.length) return { text: `没有匹配的 trace（q=${q || '-'} hasError=${hasError} slowerThanMs=${slowerThanMs || '-'}）。留痕仅保留最近轮转窗口内的记录。` };
  const rows = hits.slice(0, limit);
  const head = sort === 'slow' ? `最慢 ${rows.length} 条 / 共 ${hits.length} 条匹配（耗时降序）：` : `匹配 ${hits.length} 条，显示前 ${rows.length} 条（新在前）：`;
  return { text: `${head}\n${rows.map((r) => `- ${core.summarizeTrace(r)}`).join('\n')}\n\n要看某条的完整瀑布用 trace_lens_get 传 id。` };
}

async function toolClear(args) {
  if (args.confirm !== true) {
    return { text: '清空会删除全部链路留痕（不可恢复）。请与用户确认后传 confirm:true 重试。', isError: true };
  }
  const r = await sendCommand('clear_all', { confirm: true });
  if (!r.ok) return { text: `清空失败：${r.error}`, isError: true };
  return { text: '已清空全部链路留痕（spans.jsonl 与面板概览/全文投影）。' };
}

// ── 工具声明（description 写「适用句式」，AI 靠它匹配意图）─────────────────
const TOOLS = [
  {
    name: 'trace_lens_overview',
    description: '查看「链路追踪台」服务状态与 OTLP 接入端点、SDK 配置方法。适用：「链路追踪在跑吗」「怎么把 trace 发进来」「OTLP 端点是什么」「OpenTelemetry 怎么接」。返回端点 URL、Node/Python 环境变量配置、统计与留痕位置。',
    inputSchema: { type: 'object', properties: {} },
    run: toolOverview,
  },
  {
    name: 'trace_lens_recent',
    description: '列出最近收到的链路 trace（时间/根 span/服务/耗时/span 数/错误数）。适用：「最近有哪些链路」「刚才那次请求的 trace 到了没」「有没有报错的链路」。可选 hasError 只看错误链；返回 id 供 trace_lens_get 使用。',
    inputSchema: {
      type: 'object',
      properties: {
        hasError: { type: 'boolean', description: '可选，true 时只看含错误 span 的 trace' },
        limit: { type: 'number', description: '可选，返回条数（默认 15，最多 60）' },
      },
    },
    run: toolRecent,
  },
  {
    name: 'trace_lens_get',
    description: '查看一条 trace 的完整瀑布树：每个 span 的层级/服务/起始偏移/耗时，错误 span 的消息与属性、根 span 请求属性、慢 span（占全链过半）自动标注。适用：「这条链路慢在哪」「为什么这个请求报错」「看看这次调用的完整链路」。id 来自 trace_lens_recent / trace_lens_search，支持 ≥8 位前缀。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'traceId（或其 ≥8 位前缀）' } },
      required: ['id'],
    },
    run: toolGet,
  },
  {
    name: 'trace_lens_search',
    description: '在链路留痕里按条件筛 trace：关键词（匹配 span 名/属性键值/服务名）、hasError 只看错误链、slowerThanMs 只看慢链，sort=slow 按耗时降序。适用：「找出所有调 stripe 的链路」「有没有超过 2 秒的链路」「哪些链路报错了」。返回概览列表，id 供 trace_lens_get。',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '关键词（子串匹配 span 名/属性/服务名）' },
        hasError: { type: 'boolean', description: '可选，true 时只看错误链' },
        slowerThanMs: { type: 'number', description: '可选，只看全链耗时超过该毫秒数的 trace' },
        sort: { type: 'string', description: '可选，recent（默认，按时间）或 slow（按耗时降序）' },
        limit: { type: 'number', description: '可选，返回条数（默认 10，最多 30）' },
      },
    },
    run: toolSearch,
  },
  {
    name: 'trace_lens_clear',
    description: '清空链路追踪台的全部留痕（spans.jsonl + 面板概览，不可恢复，危险操作需 confirm）。适用：「把链路数据都清了」「清空测试数据」。不影响 OTel SDK 接入配置。',
    inputSchema: {
      type: 'object',
      properties: { confirm: { type: 'boolean', description: '必须显式传 true 才会执行' } },
      required: ['confirm'],
    },
    run: toolClear,
  },
];

// ── JSON-RPC stdio 主循环 ──────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handle(msg).catch((e) => {
      slog(`handle error: ${e.stack || e.message}`);
      if (msg && msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: '内部错误' } });
    });
  }
});

async function handle(msg) {
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'trace-lens', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    try {
      const r = await tool.run(args);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: core.oneLine(r.text, 8000) }], isError: r.isError === true },
      });
    } catch (e) {
      slog(`tool ${name} 抛错: ${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `执行异常：${e.message}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

slog(`trace-lens mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
