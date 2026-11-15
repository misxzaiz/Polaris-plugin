#!/usr/bin/env node
'use strict';
// hook-consumer — MCP stdio server（2024-11-05）
// 提供 on_hook 工具：接收宿主 hook 派发（ai.session.start/end），落日志文件供验证。
import fs from 'node:fs';
import path from 'node:path';

const PROTOCOL = '2024-11-05';
const SERVER = 'hook-consumer';
const VERSION = '0.1.0';

const args = process.argv.slice(2);
// 日志目录：首个存在目录参数（appConfigDir）下 hook-consumer/，否则 cwd
let logDir = process.cwd();
for (const a of args) {
  try { if (fs.existsSync(a) && fs.statSync(a).isDirectory()) { logDir = path.join(a, 'hook-consumer'); break; } } catch (_) {}
}
try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}
const logFile = path.join(logDir, 'hook-events.log');
function appendLog(entry) {
  try { fs.appendFileSync(logFile, JSON.stringify(entry) + '\n'); } catch (_) {}
}

const TOOLS = [
  {
    name: 'on_hook',
    description: '宿主 hook 派发回调入口（ai.session.start/end）',
    inputSchema: { type: 'object', properties: { hook: { type: 'string' }, data: {} }, additionalProperties: true },
  },
];

function write(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function reply(id, result) { write({ jsonrpc: '2.0', id: id ?? null, result }); }
function replyErr(id, code, message) { write({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handle(msg);
  }
});

function handle(msg) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') {
    return reply(id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: SERVER, version: VERSION } });
  }
  if (method === 'notifications/initialized') return;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    var tool = params && params.name;
    var a = (params && params.arguments) || {};
    if (tool === 'on_hook') {
      appendLog({ ts: new Date().toISOString(), hook: a.hook, data: a.data });
      return reply(id, { content: [{ type: 'text', text: 'hook logged: ' + String(a.hook) }] });
    }
    return replyErr(id, -32601, 'unknown tool: ' + tool);
  }
  if (method && method.startsWith('notifications/')) return; // 其它通知忽略
  replyErr(id, -32601, 'unknown method: ' + String(method));
}
