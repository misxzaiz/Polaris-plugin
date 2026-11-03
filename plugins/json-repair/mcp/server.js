#!/usr/bin/env node
'use strict';
/**
 * LLM JSON 修复器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 修复引擎见 shared/repair-core.js（单一权威，零 node 依赖）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 工具（前缀 jsonrepair_）：
 *   repair  修复坏 JSON（逐处修改点报告；不可修如实 isError 不输出半成品）
 */
const core = require('../shared/repair-core');

const SERVER_NAME = 'json-repair';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const INPUT_CAP = 512 * 1024;

const tools = [
  {
    name: 'jsonrepair_repair',
    description: '修复 LLM 输出的坏 JSON：尾逗号、单引号、未转义控制字符（裸换行/制表符）、// 与 /* */ 注释、NaN/Infinity、裸词键、未闭合括号/引号补全、markdown 代码围栏剥离。返回修复后 JSON 与逐处修改点报告；不可修时如实报错（不输出半成品）。与 schema-check 组成工具链：先 repair 再按 schema 校验。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待修复的（可能坏的）JSON 文本' },
      },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少待修复文本（text 必填且非空）');
      if (text.length > INPUT_CAP) return err(`文本过大（${text.length} 字符 > 512KB），请分段`);
      const r = core.repair(text);
      if (!r.ok) {
        return err(`无法修复：${r.error}\n（策略式修复不保证覆盖任意坏 JSON；可尝试人工检查后分段修复）`);
      }
      const report = core.renderReport(r);
      return ok(`${report}\n\n修复后 JSON：\n${r.json}`);
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（策略式修复，纯本地无宿主依赖）`);
