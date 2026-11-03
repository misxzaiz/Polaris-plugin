#!/usr/bin/env node
'use strict';
/**
 * .gitignore 检查器 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 解析引擎见 shared/gitignore-core.js（单一权威，零 node 依赖，git 语义常用子集）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 gitignorelens_）：
 *   check    逐路径判定（被忽略/复活/父目录压住 + 命中行号 + 原因）
 *   analyze  解析规则清单（逐行归类）+ 静态坑检测
 */
const core = require('../shared/gitignore-core');

const SERVER_NAME = 'gitignore-lens';
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
    name: 'gitignorelens_check',
    description: '逐路径判定路径是否被 .gitignore 规则忽略：返回 被忽略/未被忽略/被复活 + 命中规则行号 + 原因；父目录被忽略时否定规则无法复活其中文件（经典坑，如实提示）。路径相对仓库根用 / 分隔。',
    inputSchema: {
      type: 'object',
      properties: {
        gitignore: { type: 'string', description: '.gitignore 规则内容（多行文本）' },
        paths: { type: 'array', items: { type: 'string' }, description: '待判定路径数组（相对仓库根）' },
      },
      required: ['gitignore', 'paths'],
    },
    async call(args) {
      const gi = args && args.gitignore;
      const paths = args && args.paths;
      if (typeof gi !== 'string' || !gi.trim()) return err('缺少 gitignore 规则文本');
      if (!Array.isArray(paths) || !paths.length) return err('缺少 paths（路径数组）');
      if (gi.length > INPUT_CAP || JSON.stringify(paths).length > INPUT_CAP) return err('输入超 512KB');
      const parsed = core.parseGitignore(gi);
      const j = core.judgePaths(parsed, paths);
      const lines = [`判定 ${j.results.length} 条路径：`];
      for (const r of j.results) {
        const flag = r.ignored ? '🚫 忽略' : '✅ 保留';
        lines.push(`- ${flag} ${r.path} —— ${r.reason}${r.trap ? '（⚠ 坑：negated-under-ignored-dir）' : ''}`);
      }
      const traps = core.detectTraps(parsed);
      if (traps.length) {
        lines.push('', '规则静态坑提示：');
        for (const t of traps) lines.push(`  ⚠ ${t}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'gitignorelens_analyze',
    description: '解析 .gitignore 规则清单：逐行归类（否定/锚定/目录限定/通配类型）+ 静态坑检测（否定被父目录压住、裸双星等）。用于理解一份 .gitignore 到底写了什么。',
    inputSchema: {
      type: 'object',
      properties: {
        gitignore: { type: 'string', description: '.gitignore 规则内容（多行文本）' },
      },
      required: ['gitignore'],
    },
    async call(args) {
      const gi = args && args.gitignore;
      if (typeof gi !== 'string' || !gi.trim()) return err('缺少 gitignore 规则文本');
      if (gi.length > INPUT_CAP) return err('输入超 512KB');
      const parsed = core.parseGitignore(gi);
      const lines = [`规则 ${parsed.rules.length} 条（另有 ${parsed.errors.length} 行解析异常）：`];
      for (const r of parsed.rules) {
        const flags = [
          r.negated ? '否定!' : '',
          r.anchored ? '锚定/' : '',
          r.dirOnly ? '目录/' : '',
        ].filter(Boolean).join(' ');
        lines.push(`  [${r.line}] ${flags || '普通'} ${r.raw}`);
      }
      for (const e of parsed.errors.slice(0, 10)) {
        lines.push(`  ⚠ [${e.line}] 解析异常：${e.content}`);
      }
      const traps = core.detectTraps(parsed);
      if (traps.length) {
        lines.push('', '静态坑检测：');
        for (const t of traps) lines.push(`  ⚠ ${t}`);
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（git 语义常用子集，纯本地无宿主依赖）`);
