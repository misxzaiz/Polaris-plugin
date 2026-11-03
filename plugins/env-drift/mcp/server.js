#!/usr/bin/env node
'use strict';
/**
 * .env 漂移检查器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 解析/diff/报告引擎见 shared/env-core.js（单一权威，零 node 依赖）。
 * 纯本地检测，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 envdrift_）：
 *   compare  对比 example 与 actual 两侧 .env 文本（脱敏：不含 actual 值原文）
 *   parse    解析单个 .env 文本结构（键列表/顺序/重复键/格式错误行）
 */
const fs = require('fs');
const core = require('../shared/env-core');

const SERVER_NAME = 'env-drift';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const TEXT_CAP = 512 * 1024;

/** 统一取文本：优先内联 text，其次 filePath（node 侧读取，50KB 上限防大文件） */
function loadSource(args, field) {
  if (typeof args[field] === 'string' && args[field]) {
    return { text: args[field], source: `内联 ${field}` };
  }
  if (typeof args[field + 'Path'] === 'string' && args[field + 'Path']) {
    const p = String(args[field + 'Path']);
    let st;
    try { st = fs.statSync(p); } catch (_) { return { error: `文件不存在或不可读：${p}` }; }
    if (st.size > 200 * 1024) return { error: `文件过大（${st.size} 字节 > 200KB），请检查是否指错文件` };
    try { return { text: fs.readFileSync(p, 'utf8'), source: p }; } catch (e) { return { error: `读取失败：${e.message}` }; }
  }
  return { error: `缺少 ${field}（内联文本）或 ${field}Path（文件路径）之一` };
}

const tools = [
  {
    name: 'envdrift_compare',
    description: '对比 .env.example 与实际 .env 的键漂移：缺失键/多余键/值差异（脱敏，不含实际值原文）/空值键/重复键/格式错误行。支持内联文本（example/actual）或文件路径（examplePath/actualPath）。部署前/push 前体检项目配置漂移。',
    inputSchema: {
      type: 'object',
      properties: {
        example: { type: 'string', description: '.env.example 文本（内联）' },
        examplePath: { type: 'string', description: '.env.example 文件路径（与 example 二选一）' },
        actual: { type: 'string', description: '实际 .env 文本（内联）' },
        actualPath: { type: 'string', description: '实际 .env 文件路径（与 actual 二选一）' },
      },
    },
    async call(args) {
      const ex = loadSource(args, 'example');
      if (ex.error) return err(ex.error);
      const ac = loadSource(args, 'actual');
      if (ac.error) return err(ac.error);
      if (ex.text.length > TEXT_CAP || ac.text.length > TEXT_CAP) return err('文本超 512KB，请分段');
      const parsedExample = core.parseEnv(ex.text);
      const parsedActual = core.parseEnv(ac.text);
      const report = core.renderReport(parsedExample, parsedActual, { example: parsedExample, actual: parsedActual });
      return ok(`${report}\n\n（对比源：example=${ex.source} · actual=${ac.source}）`);
    },
  },
  {
    name: 'envdrift_parse',
    description: '解析单个 .env 文本结构：键列表（按首次出现顺序）、重复键、格式错误行（含行号与原因）。用于诊断 .env 本身的问题或了解配置项清单。支持内联 text 或 filePath。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '.env 文本（内联）' },
        filePath: { type: 'string', description: '.env 文件路径（与 text 二选一）' },
      },
    },
    async call(args) {
      const src = loadSource(args, 'text');
      if (src.error) return err(src.error);
      if (src.text.length > TEXT_CAP) return err('文本超 512KB，请分段');
      const parsed = core.parseEnv(src.text);
      const lines = [
        `解析完成：${parsed.order.length} 个键 / ${parsed.duplicates.length} 次重复赋值 / ${parsed.errors.length} 处格式错误`,
      ];
      if (parsed.order.length) {
        lines.push('键清单（首次出现顺序）：');
        for (const k of parsed.order.slice(0, 50)) {
          const v = parsed.vars[k];
          lines.push(`  - ${k}${v === '' ? '（空值）' : ''}`);
        }
        if (parsed.order.length > 50) lines.push(`  （另 ${parsed.order.length - 50} 键略）`);
      }
      if (parsed.duplicates.length) lines.push(`重复键：${[...new Set(parsed.duplicates)].join(', ')}（后者覆盖前者）`);
      if (parsed.errors.length) {
        lines.push('格式错误行：');
        for (const e of parsed.errors.slice(0, 10)) lines.push(`  [${e.line}] ${e.reason}：${e.content}`);
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
