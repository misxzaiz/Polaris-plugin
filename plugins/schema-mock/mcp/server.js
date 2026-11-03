#!/usr/bin/env node
'use strict';
/**
 * Mock 数据生成器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 生成引擎见 shared/mock-core.js（单一权威，零 node 依赖，Draft-07 子集反向生成）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 schemamock_）：
 *   generate  按 schema 生成 1 组假数据（闭环自检：产物过 schema-check 必过）
 *   batch     按 schema 批量生成 N 组（各用 seed+i，整体可复现）
 */
const core = require('../shared/mock-core');

const SERVER_NAME = 'schema-mock';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const PAYLOAD_CAP = 512 * 1024;

function asJson(v, field) {
  if (v === undefined) return { error: `缺少 ${field} 参数` };
  if (typeof v === 'object' && v !== null) return { value: v };
  if (typeof v === 'string') {
    try { return { value: JSON.parse(v) }; } catch (e) { return { error: `${field} JSON 解析失败：${e.message.slice(0, 120)}` }; }
  }
  return { error: `${field} 须为对象或 JSON 字符串` };
}

const tools = [
  {
    name: 'schemamock_generate',
    description: '按 JSON Schema（Draft-07 高频子集）生成随机合法假数据：type/enum/const/数值范围/字符串长度/array 约束/additionalProperties 反向生成，seed 可复现。产物经 schema-check 闭环自检必过。有 pattern 且重试上限内无法满足时如实报错。AI 测试数据/联调边界样本来源。',
    inputSchema: {
      type: 'object',
      properties: {
        schema: { type: ['object', 'string'], description: 'JSON Schema（对象或 JSON 字符串）' },
        seed: { type: 'integer', description: '随机种子（相同 seed 生成相同结果，可复现）' },
      },
      required: ['schema'],
    },
    async call(args) {
      const s = asJson(args && args.schema, 'schema');
      if (s.error) return err(s.error);
      if (JSON.stringify(s.value).length > PAYLOAD_CAP) return err('schema 过大（>512KB）');
      try {
        const item = core.generate(s.value, { seed: args && args.seed });
        return ok(`生成的假数据：\n${JSON.stringify(item, null, 2)}`);
      } catch (e) {
        return err(`无法生成：${String(e.message || e).slice(0, 200)}`);
      }
    },
  },
  {
    name: 'schemamock_batch',
    description: '按 JSON Schema 批量生成 N 组假数据（1-50，各用 seed+i 保证多样且整体可复现），逐组过 schema-check 闭环自检。适合测试集/边界样本/演示数据。',
    inputSchema: {
      type: 'object',
      properties: {
        schema: { type: ['object', 'string'], description: 'JSON Schema（对象或 JSON 字符串）' },
        seed: { type: 'integer', description: '随机种子基值' },
        count: { type: 'integer', description: '生成组数（1-50，缺省 3）' },
      },
      required: ['schema'],
    },
    async call(args) {
      const s = asJson(args && args.schema, 'schema');
      if (s.error) return err(s.error);
      if (JSON.stringify(s.value).length > PAYLOAD_CAP) return err('schema 过大（>512KB）');
      try {
        const items = core.generateBatch(s.value, { seed: args && args.seed, count: args && args.count });
        return ok(`生成 ${items.length} 组假数据（逐组已过 schema-check 闭环自检）：\n${JSON.stringify(items, null, 2)}`);
      } catch (e) {
        return err(`无法生成：${String(e.message || e).slice(0, 200)}`);
      }
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（Draft-07 子集反向生成，纯本地无宿主依赖）`);
