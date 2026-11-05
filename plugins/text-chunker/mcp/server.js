#!/usr/bin/env node
'use strict';
/**
 * LLM 文本切块台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 引擎见 shared/chunk-core.js（单一权威，零 node 依赖，token 估算启发式如实声明）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 textchunk_）：
 *   split       切块（可带文本，或 count_only 只报统计）
 *   count_only  只统计 token 不切块（快速预算）
 */
const core = require('../shared/chunk-core');

const SERVER_NAME = 'text-chunker';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const INPUT_CAP = 2 * 1024 * 1024;

const tools = [
  {
    name: 'textchunk_split',
    description: '把长文本按 token 预算切块：段落/句子边界贪心（不在词中间断）、可配重叠窗口防语义断裂、每块 token 估算。喂长文档给 AI 前的预处理。count_only=true 时只报统计不返回全文。token 估算为启发式（非精确 tokenizer，如实声明）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待切块长文本' },
        maxTokens: { type: 'integer', description: '每块 token 上限（50-32000，缺省 800）' },
        overlapTokens: { type: 'integer', description: '相邻块重叠 tokens（0-上限一半，缺省 0）' },
        countOnly: { type: 'boolean', description: 'true=只报统计不返回块文本' },
      },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少文本（text 必填且非空）');
      if (text.length > INPUT_CAP) return err(`文本过大（${text.length} 字符 > 2MB），请先分段`);
      const r = core.chunkText(text, { maxTokens: args && args.maxTokens, overlapTokens: args && args.overlapTokens });
      const head = `切块完成：${r.chunks.length} 块 · 全文估算 ${r.totalTokens} tokens（上限 ${args && args.maxTokens || 800}/块）`;
      if (args && args.countOnly) {
        return ok(`${head}\n${r.estimateNote}\n各块 tokens：${r.chunks.map((c) => c.tokens).join(', ')}`);
      }
      return ok(head + '\n' + core.renderReport(r));
    },
  },
  {
    name: 'textchunk_count',
    description: '只估算文本 token 数（不切块）——喂给模型前快速预算。启发式口径（CJK≈1 字/token、拉丁≈4 字符/token），如实声明非精确。',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '文本' } },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string') return err('缺少 text');
      if (text.length > INPUT_CAP) return err('文本过大（>2MB）');
      const tokens = core.estimateTokens(text);
      const lines = [`估算 ${tokens} tokens（${text.length} 字符，CJK ${String(text).replace(/[^\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').length} 字）`, core.ESTIMATE_NOTE];
      return ok(lines.join('\n'));
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（启发式 token 估算如实声明，纯本地无宿主依赖）`);
