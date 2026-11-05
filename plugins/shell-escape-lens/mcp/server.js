#!/usr/bin/env node
'use strict';
/**
 * Shell 转义对照台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 引擎见 shared/escape-core.js（单一权威，零 node 依赖，三 shell 引用/解析常用子集）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 shellescape_）：
 *   quote  文本 → bash/cmd/powershell 三 shell 安全引用对照（+特殊字符语义表）
 *   parse  命令行 → argv（按指定 shell 分词还原，看实际参数）
 */
const core = require('../shared/escape-core');

const SERVER_NAME = 'shell-escape-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const INPUT_CAP = 256 * 1024;

const tools = [
  {
    name: 'shellescape_quote',
    description: '把一段文本/参数转成 bash/cmd/powershell 三种 shell 的安全引用形态对照：特殊字符（$ ` " \ ! % | & ; < > ( ) ^）各 shell 怎么处理逐项标注。跨 shell 写自动化命令时防转义翻车。bash 产物已用本机 bash round-trip 实测锚定。',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '待引用的文本/参数' } },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少文本（text 必填且非空）');
      if (text.length > INPUT_CAP) return err('文本过大（>256KB）');
      return ok(core.renderQuoteReport(text));
    },
  },
  {
    name: 'shellescape_parse',
    description: '把一行命令按指定 shell 的分词规则解析为 argv（引号/转义还原）——看「程序实际收到的参数」。bash（POSIX 单引号/双引号/反斜杠）/ powershell（单引号翻倍/反引号转义）/ cmd（双引号/^，近似子集如实声明）。',
    inputSchema: {
      type: 'object',
      properties: {
        line: { type: 'string', description: '命令行' },
        shell: { type: 'string', enum: ['bash', 'powershell', 'cmd'], description: '按哪种 shell 的规则解析（缺省 bash）' },
      },
      required: ['line'],
    },
    async call(args) {
      const line = args && args.line;
      const shell = (args && args.shell) || 'bash';
      if (typeof line !== 'string' || !line.trim()) return err('缺少命令行（line 必填且非空）');
      if (line.length > INPUT_CAP) return err('输入过大（>256KB）');
      const parser = core.PARSERS[shell];
      if (!parser) return err(`不支持的 shell: ${shell}（可选 ${core.SHELLS.join('/')}）`);
      const r = parser(line);
      if (!r.ok) return err(r.error);
      return ok(`${shell} 解析为 ${r.argv.length} 个参数：\n${r.argv.map((a, i) => `  [${i}] ${a}`).join('\n')}`);
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（三 shell 引用/解析，bash round-trip 实测锚定）`);
