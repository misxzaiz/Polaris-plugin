#!/usr/bin/env node
'use strict';
/**
 * 正则调试台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 引擎见 shared/regex-core.js（单一权威，零 node 依赖，与面板同一份）。
 * 纯本地执行，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 四工具（前缀 regexdesk_）：
 *   test     正则匹配测试：匹配列表/捕获组/命名组/耗时
 *   redos    ReDoS 检测：静态模式识别 + 静态可疑时输入长度阶梯实测
 *   explain  逐 token 中文解释
 *   replace  替换预览（$1 / $<name> 按 JS 原生语义）
 */
const core = require('../shared/regex-core');

const SERVER_NAME = 'regex-desk';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const tools = [
  {
    name: 'regexdesk_test',
    description: 'JS 正则匹配测试：返回匹配位置/文本/捕获组/命名组/耗时。纯本地 V8 引擎真实语义。给 AI：生成或修改正则后先跑样本验证再用。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则源码（不带两侧斜杠）' },
        flags: { type: 'string', description: 'flags（g/i/m/s/u/v/y/d 子集，可空）' },
        text: { type: 'string', description: '待匹配的样本文本' },
      },
      required: ['pattern', 'text'],
    },
    async call(args) {
      const pattern = args && args.pattern;
      const text = args && args.text;
      if (typeof pattern !== 'string' || pattern === '') return err('缺少 pattern（正则源码，不带两侧斜杠）');
      if (typeof text !== 'string' || text === '') return err('缺少 text（样本文本）');
      const r = core.runMatch(pattern, args.flags || '', text);
      if (!r.ok) return err(r.error);
      return ok(core.renderTestReport(r));
    },
  },
  {
    name: 'regexdesk_redos',
    description: 'ReDoS（灾难性回溯）检测：静态模式识别（嵌套无限量词/重复交替分支等）+ 静态可疑时用输入长度阶梯真实计时复核。给 AI：把正则用于不可信输入前先自检，检出高危给出改写建议。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则源码' },
        flags: { type: 'string', description: 'flags（可空）' },
      },
      required: ['pattern'],
    },
    async call(args) {
      const pattern = args && args.pattern;
      if (typeof pattern !== 'string' || pattern === '') return err('缺少 pattern');
      const r = core.analyzeRedos(pattern, (args && args.flags) || '');
      if (!r.ok) return err(r.error);
      return ok(core.renderRedosReport(r));
    },
  },
  {
    name: 'regexdesk_explain',
    description: '逐构造（token）中文解释正则：每个字面/转义/字符类/量词/组/环视的含义与 JS 语义细节（如类内 \\b 是退格、贪婪 vs 惰性）。语法错误时如实报错。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则源码' },
        flags: { type: 'string', description: 'flags（可空）' },
      },
      required: ['pattern'],
    },
    async call(args) {
      const pattern = args && args.pattern;
      if (typeof pattern !== 'string' || pattern === '') return err('缺少 pattern');
      const r = core.explain(pattern, (args && args.flags) || '');
      if (!r.ok) return err(r.error);
      return ok(core.renderExplainReport(r));
    },
  },
  {
    name: 'regexdesk_replace',
    description: '正则替换预览：返回替换次数与结果文本（$1、$<name> 按 JS 原生语义）。给 AI：写 replace 前先预览确认，避免误替换。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则源码' },
        flags: { type: 'string', description: 'flags（g 决定是否全替换，可空）' },
        replacement: { type: 'string', description: '替换串（支持 $1 / $<name>）' },
        text: { type: 'string', description: '原始文本' },
      },
      required: ['pattern', 'replacement', 'text'],
    },
    async call(args) {
      const pattern = args && args.pattern;
      const replacement = args && args.replacement;
      const text = args && args.text;
      if (typeof pattern !== 'string' || pattern === '') return err('缺少 pattern');
      if (typeof replacement !== 'string') return err('缺少 replacement');
      if (typeof text !== 'string' || text === '') return err('缺少 text');
      const r = core.runReplace(pattern, args.flags || '', replacement, text);
      if (!r.ok) return err(r.error);
      return ok(core.renderReplaceReport(r));
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地 V8 语义，无宿主依赖）`);
