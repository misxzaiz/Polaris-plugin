#!/usr/bin/env node
'use strict';
/**
 * 防注入检查器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 检测引擎见 shared/injection-core.js（单一权威，零 node 依赖）。
 * 纯本地检测，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 promptguard_）：
 *   check_text     检测文本注入风险，分级报告（findings 脱敏，不含原文全文）
 *   check_patterns 列出全部检测规则
 */
const core = require('../shared/injection-core');

const SERVER_NAME = 'prompt-guard';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const tools = [
  {
    name: 'promptguard_check_text',
    description: '检测文本的 prompt injection 风险（网页抓取内容/文件内容/用户粘贴内容喂给模型前自检）。纯本地规则检测，分级 clean/suspicious/dangerous，返回命中规则与脱敏片段。文本不出本机。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待检文本（网页内容/文件内容/任意将喂给模型的文本）' },
      },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少待检文本（text 必填且非空）');
      if (text.length > 512 * 1024) return err(`文本过大（${text.length} 字符 > 512KB），请分段检测`);
      const r = core.checkText(text);
      const lines = [
        `风险分级：${core.levelLabel(r.level)}（${r.level}）· 分数 ${r.score} · 规则 ${r.ruleCount} 条`,
      ];
      if (r.findings.length === 0) {
        lines.push('未命中任何注入模式。注意：规则检测不能替代语义判断，高风险来源仍建议人工过目。');
      } else {
        lines.push(`命中 ${r.findings.length} 条规则（按严重度排序）：`);
        for (const f of r.findings.slice(0, 12)) {
          lines.push(`- [${f.category}] ${f.ruleId}（权重 ${f.weight}×${f.count}）命中片段：${f.preview}`);
        }
        if (r.findings.length > 12) lines.push(`（另 ${r.findings.length - 12} 条略）`);
        lines.push('建议：dangerous 级文本不要直接喂给主对话模型；确需处理时剥离命中片段或人工复核。');
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'promptguard_check_patterns',
    description: '列出防注入检查器的全部检测规则（id/类别/权重/说明），便于理解检测覆盖面。零参数。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const rules = core.listRules();
      const lines = [`检测规则 ${rules.length} 条：`];
      for (const r of rules) {
        lines.push(`- ${r.id}（${r.category}，权重 ${r.weight}）：${r.desc}`);
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地检测，无宿主依赖）`);
