#!/usr/bin/env node
/**
 * polaris-git MCP Server —— AI 工具层 stdio 接线（零依赖，JSON-RPC 2.0）
 *
 * 协议与 plugins/ai-scheduler/mcp/server.js 完全一致：
 *   - 协议数据只走 stdout，日志只走 stderr
 *   - newline-delimited JSON（逐行 JSON-RPC 2.0）
 *   - 支持 initialize / notifications/initialized / tools/list / tools/call
 *
 * 工具面见 tools.js（从 KNOWN_ACTIONS 自动派生）；工具实现经 HTTP 调本插件 service，
 * 端口从参数 / env / .port 文件惰性发现。
 *
 * 启动参数：node server.js {{appConfigDir}} [port]
 *
 * 本插件 package.json 为 "type": "module"，故使用 ESM。
 */
import { createHttpDispatcher, buildTools, textResult } from './tools.js';

const SERVER_NAME = 'polaris-git';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const dispatch = createHttpDispatcher();
const tools = buildTools(dispatch);

function err(text) { return textResult(text, true); }

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
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
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : e}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'}, tools=${tools.length})`);
