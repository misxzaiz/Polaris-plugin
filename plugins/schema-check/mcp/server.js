#!/usr/bin/env node
'use strict';
/**
 * JSON Schema 校验器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 校验引擎见 shared/schema-core.js（单一权威，零 node 依赖，Draft-07 高频子集）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 schemacheck_）：
 *   validate  校验数据（schema/data 均为内联对象；错误 JSON Pointer 定位，一次报全）
 *   explain   schema 结构摘要（帮 AI/用户理解 schema 要什么）
 */
const core = require('../shared/schema-core');

const SERVER_NAME = 'schema-check';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const PAYLOAD_CAP = 512 * 1024;

/** 解析 JSON 参数：接受对象或 JSON 字符串（LLM 常以字符串传 JSON） */
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
    name: 'schemacheck_validate',
    description: '按 JSON Schema（Draft-07 高频子集）校验数据：错误用 JSON Pointer 路径定位（/a/b/0），类型/必填/枚举/数值范围/长度/pattern/array 约束/additionalProperties 逐项检出，一次报全不短路。schema/data 接受对象或 JSON 字符串。$ref 不支持（如实报错）。AI 生成的 JSON 喂给程序前体检。',
    inputSchema: {
      type: 'object',
      properties: {
        schema: { type: ['object', 'string'], description: 'JSON Schema（对象或 JSON 字符串）' },
        data: { type: ['object', 'string'], description: '待校验数据（对象/数组或 JSON 字符串）' },
      },
      required: ['schema', 'data'],
    },
    async call(args) {
      const s = asJson(args && args.schema, 'schema');
      if (s.error) return err(s.error);
      const d = asJson(args && args.data, 'data');
      if (d.error) return err(d.error);
      const payload = JSON.stringify({ s: s.value, d: d.value });
      if (payload.length > PAYLOAD_CAP) return err(`payload 过大（${payload.length} 字节 > 512KB）`);
      const r = core.validate(d.value, s.value);
      const lines = [];
      if (r.valid) {
        lines.push(`✅ 校验通过：数据符合 schema（错误 0 条）`);
      } else {
        lines.push(`❌ 校验失败：${r.errors.length} 条错误`);
        for (const e of r.errors.slice(0, 30)) {
          lines.push(`  - ${e.pointer} [${e.keyword}] ${e.message}`);
        }
        if (r.errors.length > 30) lines.push(`  （另 ${r.errors.length - 30} 条略）`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'schemacheck_explain',
    description: '输出 JSON Schema 的结构摘要（每层的类型/必填/枚举/范围/约束/描述，缩进树形），帮 AI 或人快速理解 schema 要求数据长什么样，不必逐字段读原始 schema。',
    inputSchema: {
      type: 'object',
      properties: {
        schema: { type: ['object', 'string'], description: 'JSON Schema（对象或 JSON 字符串）' },
      },
      required: ['schema'],
    },
    async call(args) {
      const s = asJson(args && args.schema, 'schema');
      if (s.error) return err(s.error);
      return ok(core.explainSchema(s.value));
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（Draft-07 高频子集，纯本地无宿主依赖）`);
