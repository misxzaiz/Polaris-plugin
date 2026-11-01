#!/usr/bin/env node
'use strict';
/**
 * server.js —— 长连接调试台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与宿主已交付调试类插件（mcp-probe / webhook-station）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：不直连发现，先经 kvclient 读 cap.kv 的 streamdesk.meta
 * 拿 {port, token}，再 127.0.0.1 直连（mcp-probe 的 readServiceInfo 同款）。
 * 测试钩子（yizhou 先例）：env STREAMDESK_SERVICE_URL + STREAMDESK_SERVICE_TOKEN
 * 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 七工具（AI 调试闭环：连上 → 发 → 等回复 → 解读）：
 *   ws_connect / ws_send / ws_wait_frame / ws_close
 *   sse_capture（同步抓完返回，AI 一次调用拿全量流式体检）
 *   session_list / transcript
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

// ── stderr 日志（stdout 只走协议）───────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[stream-desk-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.STREAMDESK_SERVICE_URL || '';
const ENV_TOKEN = process.env.STREAMDESK_SERVICE_TOKEN || '';
let svcInfo = null; // {port, token, at}

async function resolveService(force) {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (!force && svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('streamdesk.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('长连接调试台服务未注册（streamdesk.meta 缺失）：请先在 Polaris 打开「长连接调试台」面板拉起服务，或检查插件是否已启用');
  }
  svcInfo = { base: `http://127.0.0.1:${meta.port}`, token: meta.token, at: Date.now() };
  return svcInfo;
}

function svcRequest(method, apiPath, body, timeoutMs) {
  return resolveService(false).then((svc) => new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: new URL(svc.base).port,
      path: apiPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${svc.token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: timeoutMs || 35_000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        } catch (e) {
          reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('服务请求超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
}

/** 等待 WS 会话出结果（open/error/closed），MCP ws_connect 用 */
async function waitForOpen(sessionId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15_000);
  let last = null;
  while (Date.now() < deadline) {
    const r = await svcRequest('GET', `/api/session/${sessionId}?since=-1`, null, 5_000);
    last = r;
    if (['open', 'error', 'closed'].includes(r.summary.state)) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  return last;
}

function frameLine(f) {
  const dir = f.dir === 'out' ? '→' : (f.dir === 'in' ? '←' : '·');
  const gap = typeof f.gapMs === 'number' ? ` +${f.gapMs}ms` : '';
  const size = typeof f.size === 'number' ? ` (${f.size}B)` : '';
  let body = '';
  if (f.kind === 'text' || f.kind === 'chunk' || f.kind === 'event') body = (f.text || '').replace(/\s+\z/, '');
  else if (f.kind === 'binary') body = `[二进制${f.truncated ? '，已截断' : ''} b64=${(f.b64 || '').slice(0, 48)}…]`;
  else if (f.message) body = f.message;
  const extra = [];
  if (f.event) extra.push(`event=${f.event}`);
  if (f.rttMs != null) extra.push(`rtt=${f.rttMs}ms`);
  if (f.code != null && f.kind === 'close') extra.push('见关闭码说明');
  const prefix = extra.length ? ` [${extra.join(' ')}]` : '';
  const trunc = f.truncated ? ' ⋯(截断)' : '';
  return `#${f.seq} ${dir} ${f.kind}${gap}${size}${prefix} ${body}${trunc}`.trimEnd();
}

function handshakeText(h) {
  if (!h) return '（无握手信息）';
  const hdrs = h.headers && Object.keys(h.headers).length
    ? Object.entries(h.headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  （无）';
  return `HTTP ${h.httpStatus} ${h.statusText || ''} 延迟 ${h.latencyMs}ms\n响应头（敏感头已掩码）：\n${hdrs}${h.error ? `\n错误：${h.error}` : ''}`;
}

function statsText(stats) {
  if (!stats) return '（无统计）';
  const parts = [];
  if (stats.ttftMs != null) parts.push(`首字节(TTFT) ${stats.ttftMs}ms`);
  if (stats.firstEventMs != null) parts.push(`首事件 ${stats.firstEventMs}ms`);
  if (stats.eventCount != null) parts.push(`事件 ${stats.eventCount}`);
  if (stats.chunkCount != null) parts.push(`分块 ${stats.chunkCount}`);
  if (stats.bytes != null) parts.push(`字节 ${stats.bytes}`);
  if (stats.totalMs != null) parts.push(`总时长 ${stats.totalMs}ms`);
  if (stats.comments) parts.push(`心跳/注释行 ${stats.comments}（服务器活着但没发事件）`);
  let out = parts.join('，');
  if (stats.gaps) {
    out += `\n事件间隔统计：min ${stats.gaps.min}ms / 中位 ${stats.gaps.median}ms / 均值 ${stats.gaps.mean}ms / p95 ${stats.gaps.p95}ms / 最大 ${stats.gaps.max}ms（p95 高=流卡顿）`;
  }
  return out || '（无统计）';
}

// ── 工具定义 ────────────────────────────────────────────────────────────────
const HEADER_DESC = '请求头对象，如 {"Authorization":"Bearer xxx","X-Custom":"1"}。值仅在本地使用，返回报告中自动掩码（****尾4）';

const TOOLS = [
  {
    name: 'ws_connect',
    description: '建立 WebSocket 连接（支持自定义握手请求头——浏览器做不到的事，比如 Authorization）。返回握手结果（状态码/延迟/响应头掩码）。用 ws_send 发消息、ws_wait_frame 等回复、ws_close 关闭。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'WebSocket 地址，ws:// 或 wss:// 开头' },
        headers: { type: 'object', description: HEADER_DESC, additionalProperties: { type: 'string' } },
        subprotocols: { type: 'array', items: { type: 'string' }, description: '可选，Sec-WebSocket-Protocol 子协议列表' },
        pingIntervalSec: { type: 'number', description: '可选，自动 ping 间隔秒数（0=不自动 ping），用于测连接保活与 RTT' },
        title: { type: 'string', description: '可选，会话备注名' },
      },
      required: ['url'],
    },
    async run(args) {
      const opened = await svcRequest('POST', '/api/session/ws', {
        url: args.url, headers: args.headers || {}, subprotocols: args.subprotocols,
        pingIntervalSec: args.pingIntervalSec, title: args.title,
      });
      const detail = await waitForOpen(opened.session.id, 15_000);
      const s = detail.summary;
      const lines = [
        `会话 ${s.id}（${s.title}）状态：${s.state}`,
        s.state === 'open' ? '握手成功' : `未建立：${s.closedReason || detail.handshake && detail.handshake.error || '超时'}`,
        handshakeText(detail.handshake),
        s.state === 'open' ? '下一步：ws_send 发送测试帧，然后 ws_wait_frame 等回复。' : '',
      ];
      return lines.filter(Boolean).join('\n');
    },
  },
  {
    name: 'ws_send',
    description: '向已建立的 WebSocket 会话发送一帧：文本、二进制（base64）或 ping。发送后通常接着调 ws_wait_frame 等对端回复。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'ws_connect 返回的会话 ID' },
        op: { type: 'string', enum: ['text', 'binary', 'ping'], description: '帧类型，默认 text' },
        text: { type: 'string', description: '文本内容（text/ping 时的载荷）' },
        b64: { type: 'string', description: 'base64（binary 时必填）' },
      },
      required: ['sessionId'],
    },
    async run(args) {
      await svcRequest('POST', `/api/session/${args.sessionId}/send`, {
        op: args.op || 'text', text: args.text, b64: args.b64,
      });
      return `已发送 ${args.op || 'text'} 帧。用 ws_wait_frame 等回复。`;
    },
  },
  {
    name: 'ws_wait_frame',
    description: '等待 WebSocket 会话的新帧（长轮询，服务端挂起直到有帧或超时）。「发一条等回复」的核心动作。返回新帧列表（含方向/间隔/大小/内容）。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID' },
        afterSeq: { type: 'number', description: '只等 seq 大于此值的帧（上次调用返回的 cursor），默认 -1 等全部' },
        timeoutMs: { type: 'number', description: '最长等待毫秒（≤30000，默认 10000）' },
      },
      required: ['sessionId'],
    },
    async run(args) {
      const after = Number.isFinite(Number(args.afterSeq)) ? Math.round(Number(args.afterSeq)) : -1;
      const timeoutMs = Math.min(30_000, Math.max(0, Math.round(Number(args.timeoutMs) || 10_000)));
      const r = await svcRequest('GET', `/api/session/${args.sessionId}/next?after=${after}&timeoutMs=${timeoutMs}`, null, timeoutMs + 8_000);
      if (!r.frames.length) {
        return r.final ? '会话已结束，不会再有新帧。' : `等待 ${timeoutMs}ms 无新帧（对端沉默）。可继续等待或 ws_close。`;
      }
      const lines = r.frames.map(frameLine);
      lines.push(`（cursor=${r.cursor}；下次把 afterSeq 传这个值只看新帧）`);
      return lines.join('\n');
    },
  },
  {
    name: 'ws_close',
    description: '关闭 WebSocket 会话（可指定关闭码与原因）。也用于放弃不再需要的会话。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID' },
        code: { type: 'number', description: '关闭码，默认 1000' },
        reason: { type: 'string', description: '关闭原因' },
      },
      required: ['sessionId'],
    },
    async run(args) {
      await svcRequest('POST', `/api/session/${args.sessionId}/close`, { code: args.code, reason: args.reason });
      return `已请求关闭 ${args.sessionId}。`;
    },
  },
  {
    name: 'sse_capture',
    description: '一次性抓取 SSE/流式 HTTP 响应并同步返回完整体检：状态码、TTFT（首字节）、首事件延迟、事件数、事件间隔统计（p95 高=流卡顿）、前几个事件样本（自动尝试 JSON 解析）。支持 POST + 自定义头 + body——这正是浏览器 EventSource 做不到的。适合一句话诊断 AI 流式接口。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'SSE/流式接口地址，http(s)://' },
        method: { type: 'string', description: '默认 GET；AI 流式接口通常 POST' },
        headers: { type: 'object', description: HEADER_DESC, additionalProperties: { type: 'string' } },
        body: { type: 'string', description: '请求体（POST 时的 JSON 等）' },
        maxEvents: { type: 'number', description: '最多抓取事件数（默认 200，上限 10000）' },
        durationMs: { type: 'number', description: '最长抓取毫秒（默认 30000，上限 120000）' },
      },
      required: ['url'],
    },
    async run(args) {
      const r = await svcRequest('POST', '/api/probe', {
        url: args.url,
        method: args.method || 'GET',
        headers: args.headers || {},
        body: args.body,
        maxEvents: args.maxEvents,
        durationMs: Math.min(120_000, Math.max(1_000, Math.round(Number(args.durationMs) || 30_000))),
      }, 140_000);
      const s = r.summary;
      const lines = [
        `抓取结束：${r.closedReason || s.state}`,
        handshakeText(r.handshake),
        statsText(r.stats),
      ];
      if (r.samples && r.samples.length) {
        lines.push('事件样本（前 3 个）：');
        for (const sp of r.samples) {
          lines.push(`  [${sp.event || 'message'}] ${sp.json ? JSON.stringify(sp.json).slice(0, 600) : sp.data.slice(0, 600)}`);
        }
      } else {
        lines.push('（未捕获到任何事件——若 content-type 非 text/event-stream 会按原始分块捕获，看 transcript 工具；心跳注释行计数在统计里）');
      }
      return lines.join('\n');
    },
  },
  {
    name: 'session_list',
    description: '列出长连接调试台的会话（WS 连接与 SSE 抓取），含状态、帧数、计数。',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const r = await svcRequest('GET', '/api/sessions', null, 8_000);
      if (!r.sessions.length) return '（暂无会话）';
      return r.sessions.map((s) => {
        const c = s.counters || {};
        return `${s.id} [${s.kind}] ${s.state} 「${s.title}」 帧${s.frameCount} 收${c.in || 0}/发${c.out || 0}${s.closedReason ? ` — ${s.closedReason}` : ''}`;
      }).join('\n');
    },
  },
  {
    name: 'transcript',
    description: '读取会话的帧记录（时间线文本视图：方向/类型/间隔/内容）。优先读内存中的会话；服务重启后自动降级读 kv 里的掩码 transcript。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID' },
        tail: { type: 'number', description: '只看最后 N 帧（默认 50，上限 200）' },
      },
      required: ['sessionId'],
    },
    async run(args) {
      const tail = Math.min(200, Math.max(1, Math.round(Number(args.tail) || 50)));
      let text = '';
      try {
        const r = await svcRequest('GET', `/api/session/${args.sessionId}?since=-1`, null, 8_000);
        text = r.frames.slice(-tail).map(frameLine).join('\n');
        if (r.summary.state === 'open' || r.summary.state === 'capturing') text += `\n（会话进行中，以上为最近 ${tail} 帧）`;
        else text += `\n状态：${r.summary.state}；${r.summary.closedReason || ''}\n${statsText(r.summary.stats)}`;
      } catch (_) {
        // 服务重启后内存会话没了 → 读 kv transcript（掩码投影）
        const kvKey = `streamdesk.session.${args.sessionId}`;
        const rec = await kv.kvGet(kvKey);
        if (!rec) throw new Error(`会话 ${args.sessionId} 无记录（内存中不存在且 kv 无 transcript）`);
        const frames = (rec.frames || []).slice(-tail);
        text = frames.map(frameLine).join('\n');
        text += `\n（来自 kv 历史 transcript，头部已掩码；状态：${rec.state}；${rec.closedReason || ''}）`;
      }
      return text || '（无帧记录）';
    },
  },
];

// ── JSON-RPC 骨架（webhook-station 同款）────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

function okResult(id, text) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
}
function errResult(id, text) {
  // MCP 规范：isError 在 result 内部（宿主据此把 content 视为错误呈现）
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
}

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
    handleMessage(msg).catch((e) => {
      log('error', `处理异常: ${e.message}`);
      if (msg && msg.id != null) send(errResult(msg.id, `内部错误：${e.message}`));
    });
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (!msg || msg.id == null) return; // 通知/未知忽略
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'stream-desk', version: '0.1.0' },
      },
    });
    return;
  }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) { send(errResult(id, `未知工具：${name}`)); return; }
    try {
      const text = await tool.run(args);
      send(okResult(id, text));
    } catch (e) {
      send(errResult(id, `${e.message}（提示：服务未运行时，先在 Polaris 打开「长连接调试台」面板拉起服务）`));
    }
    return;
  }
  send({
    jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` },
  });
}

log('info', 'stream-desk MCP server 启动（stdio）');
