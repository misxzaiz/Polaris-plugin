#!/usr/bin/env node
'use strict';
/**
 * Markdown 结构检查器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 检查引擎见 shared/md-core.js（单一权威，零 node 依赖，行级+围栏状态感知）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 mdlen_）：
 *   lint     结构体检（行级发现 + 统计）
 *   outline  标题树大纲（层级缩进）
 */
const core = require('../shared/md-core');

const SERVER_NAME = 'markdown-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const INPUT_CAP = 1024 * 1024;

const tools = [
  {
    name: 'mdlen_lint',
    description: 'Markdown 结构体检：标题层级跳级/多 h1/锚点断链（GitHub slug，中文标题兼容）/图片无 alt/表格列数不齐/代码块无语言/重复标题/TODO 残留/裸 URL 等 12 条规则，行级报告。围栏状态感知（代码块内伪 markdown 不误报）。发布 README/文档前体检。',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'markdown 文本' } },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少 markdown 文本（text 必填且非空）');
      if (text.length > INPUT_CAP) return err(`文本过大（${text.length} 字符 > 1MB），请分段`);
      const r = core.lint(text);
      return ok(core.renderReport(r));
    },
  },
  {
    name: 'mdlen_outline',
    description: '提取 markdown 标题树大纲（层级缩进 + 行号），快速了解文档结构；也可用于定位章节后再用 lint 看细节。',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'markdown 文本' } },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少 markdown 文本（text 必填且非空）');
      if (text.length > INPUT_CAP) return err(`文本过大（${text.length} 字符 > 1MB）`);
      const r = core.lint(text);
      return ok(core.renderOutline(r.outline));
    },
  },
];

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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（12 规则行级体检，纯本地无宿主依赖）`);
