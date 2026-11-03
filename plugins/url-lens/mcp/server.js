#!/usr/bin/env node
'use strict';
/**
 * URL 调试台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 解析引擎见 shared/url-core.js（单一权威，全局 URL/URLSearchParams，零 require）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 三工具（前缀 urllens_）：
 *   parse   结构分解 + query 参数全展开（含重复键警告）
 *   build   参数对象重建 URL（编码归一）
 *   decode  各段 raw vs 解码对照（编码语义坑标注）
 */
const core = require('../shared/url-core');

const SERVER_NAME = 'url-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const tools = [
  {
    name: 'urllens_parse',
    description: '解析 URL 结构：protocol/host/port/path/query/fragment 逐项分解，query 参数全展开（重复键全列并警告、空值标注）。调试 Webhook 回调/OAuth redirect/带追踪参数链接时用。纯本地不发请求。',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: '待解析 URL' } },
      required: ['url'],
    },
    async call(args) {
      const parsed = core.parseUrl(args && args.url);
      if (!parsed.ok) return err(parsed.error);
      return ok(core.renderReport(parsed));
    },
  },
  {
    name: 'urllens_build',
    description: '从结构对象重建 URL：protocol/hostname/port/pathname/params（键值对数组，重复键保留顺序）/hash。参数按 URLSearchParams 标准编码（+ 空格、%XX、&= 转义）。',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          properties: {
            protocol: { type: 'string', description: '缺省 https' },
            hostname: { type: 'string' },
            port: { type: 'string', description: '缺省不写（协议默认端口）' },
            pathname: { type: 'string', description: '缺省 /' },
            params: { type: 'array', description: '键值对数组 [{name, value}]，重复键按顺序保留', items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } } } },
            hash: { type: 'string', description: 'fragment（带不带 # 均可）' },
          },
          required: ['hostname'],
        },
      },
      required: ['spec'],
    },
    async call(args) {
      const r = core.buildUrl(args && args.spec);
      if (!r.ok) return err(r.error);
      return ok(`重建 URL：\n${r.url}`);
    },
  },
  {
    name: 'urllens_decode',
    description: 'URL 各段 raw vs 解码对照表：pathname（%XX 解码、+ 是字面量）、query 参数（+ → 空格、重复键全展开）、hash。排查「参数解码不对」类问题（URLSearchParams 语义坑系统化呈现）。',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: '待解析 URL' } },
      required: ['url'],
    },
    async call(args) {
      const r = core.decodeSegments(args && args.url);
      if (!r.ok) return err(r.error);
      const lines = ['各段 raw vs 解码对照：'];
      for (const row of r.rows) {
        lines.push(`  ${row.segment}: ${row.raw === row.decoded ? row.raw : `${row.raw} → ${row.decoded}`}${row.note ? `  （${row.note}）` : ''}`);
      }
      return ok(lines.join('\n'));
    },
  },
];

// ── stdio JSON-RPC 接线 ────────────────────────────────────────────────────

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
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地解析，无宿主依赖）`);
