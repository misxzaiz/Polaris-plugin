#!/usr/bin/env node
'use strict';
/**
 * mcp/server.js —— 执行计划透视台 MCP Server（stdio JSON-RPC 2.0，薄透传层）
 *
 * 工具一律转发到本地 service（127.0.0.1:<kv qpl.service.port>，Bearer token），
 * 不直接触碰数据库/文件——单一路径权威在 service，护栏（只读/ANALYZE 闸）在 service 强制。
 * AI 永远拿不到：密码、完整连接串（conns.list 只回掩码形态）。
 *
 * 启动参数：node mcp/server.js <appConfigDir>
 */
const http = require('http');
const path = require('path');
const os = require('os');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));

const APP_CONFIG_DIR = process.argv[2] || '';
const slog = (msg) => { process.stderr.write(`[query-plan-lens:mcp] ${msg}\n`); };
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── JSON-RPC 骨架 ───────────────────────────────────────────────────────────

function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }

const TOOLS = [
  {
    name: 'qpl_connections',
    description: '列出执行计划透视台已保存的数据库连接（MySQL/PostgreSQL，掩码形态，无密码）。用户说「用 xx 连接解释这条 SQL」前先拿这里的名字。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'qpl_explain',
    description: '对已保存连接执行 EXPLAIN 并返回执行计划树 + 中文诊断发现。默认只做估算计划；analyze=true 时 PG 会真实执行该查询（仅 SELECT/WITH，写语句永久拒绝），用于获取实际耗时与行数。connection 传连接名或 id（来自 qpl_connections）。',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: '连接名或连接 id' },
        sql: { type: 'string', description: '单条只读 SQL（SELECT/WITH 开头，不要带 EXPLAIN 前缀）' },
        analyze: { type: 'boolean', description: '是否实际执行（PG 专用，默认 false）' },
      },
      required: ['connection', 'sql'],
    },
  },
  {
    name: 'qpl_parse',
    description: '离线解析粘贴的执行计划（不连数据库）：PG 的 EXPLAIN 文本输出或任一引擎的 FORMAT=JSON 输出，返回计划树与诊断发现。适用于用户从 psql/mysql 客户端复制出来的计划。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'EXPLAIN 原始输出（文本或 JSON）' },
        engine: { type: 'string', enum: ['auto', 'pg', 'mysql'], description: '引擎（默认 auto 自动识别）' },
      },
      required: ['text'],
    },
  },
  {
    name: 'qpl_history',
    description: '列出最近的分析历史（SQL 摘要/引擎/发现数），配合 qpl_history_get 深挖某一条。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '条数上限，默认 10，最大 30' } },
    },
  },
  {
    name: 'qpl_history_get',
    description: '按 id 取一条历史分析的完整计划与发现。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'qpl_history 返回的条目 id' } },
      required: ['id'],
    },
  },
];

// ── service 客户端 ──────────────────────────────────────────────────────────

let cachedMeta = null;
let metaTs = 0;

async function serviceMeta() {
  if (cachedMeta && Date.now() - metaTs < 10000) return cachedMeta;
  // env 覆盖（hermetic 测试；对齐 kvclient「若未来宿主注入则优先生效」的惯例）
  if (process.env.QPL_SERVICE_PORT) {
    const meta = { port: Number(process.env.QPL_SERVICE_PORT), token: process.env.QPL_SERVICE_TOKEN || '' };
    cachedMeta = meta;
    metaTs = Date.now();
    return meta;
  }
  const meta = await kv.kvGet('qpl.service');
  if (!meta || !meta.port) throw new Error('执行计划台服务未就绪（kv 无 qpl.service）——请打开插件面板或重启宿主');
  cachedMeta = meta;
  metaTs = Date.now();
  return meta;
}

function callService(routeName, body, timeoutMs) {
  return serviceMeta().then((meta) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1',
      port: meta.port,
      method: 'POST',
      path: `/${routeName}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${meta.token || ''}`,
      },
      timeout: timeoutMs || 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) {
          reject(new Error(`服务响应不可解析：${e.message}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('服务请求超时')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  }));
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

function text(content, isError) {
  return { content: [{ type: 'text', text: content }], ...(isError ? { isError: true } : {}) };
}

async function toolConnections() {
  const r = await callService('conns.list', {});
  if (!r.ok) return text(`获取连接失败：${r.error}`, true);
  if (!r.connections.length) return text('尚无已保存连接。请用户在「执行计划透视台」面板中配置数据库连接。');
  const lines = r.connections.map((c) => `- ${c.name}（${c.engine === 'pg' ? 'PostgreSQL' : 'MySQL'} ${c.user}@${c.host}:${c.port}/${c.database}${c.hasPassword ? '' : '，未存密码'}）`);
  return text(`已保存连接 ${r.connections.length} 个：\n${lines.join('\n')}`);
}

async function toolExplain(args) {
  const conn = String(args.connection || '').trim();
  const sql = String(args.sql || '');
  if (!sql.trim()) return text('sql 不能为空', true);
  const list = await callService('conns.list', {});
  if (!list.ok) return text(`获取连接失败：${list.error}`, true);
  const target = list.connections.find((c) => c.id === conn) ||
    list.connections.find((c) => c.name === conn) ||
    list.connections.find((c) => c.name.toLowerCase() === conn.toLowerCase());
  if (!target) {
    return text(`找不到连接「${conn}」。可用：${list.connections.map((c) => c.name).join('、') || '（无）'}`, true);
  }
  const r = await callService('plan.explain', {
    connId: target.id, sql, analyze: !!args.analyze,
  }, 150000);
  if (!r.ok) return text(`EXPLAIN 失败：${r.error}`, true);
  const { core } = loadCore();
  const summary = core.summarizeForAi(r.plan, r.findings);
  const head = `【${target.name} · ${r.plan.engine === 'pg' ? 'PostgreSQL' : 'MySQL'}】${r.meta.analyzeUsed ? '实际执行（ANALYZE）' : '估算计划'}${r.meta.note ? `（${r.meta.note}）` : ''}\n\n`;
  return text(head + summary);
}

async function toolParse(args) {
  const r = await callService('plan.parse', { text: String(args.text || ''), engine: args.engine || 'auto' });
  if (!r.ok) return text(`解析失败：${r.error}`, true);
  const { core } = loadCore();
  return text(`【粘贴解析 · ${r.plan.engine === 'pg' ? 'PostgreSQL' : 'MySQL'}】\n\n${core.summarizeForAi(r.plan, r.findings)}`);
}

async function toolHistory(args) {
  const r = await callService('history.list', { limit: Math.min(Number(args && args.limit) || 10, 30) });
  if (!r.ok) return text(`历史读取失败：${r.error}`, true);
  if (!r.items.length) return text('暂无分析历史。');
  const lines = r.items.map((e) => `- ${e.id} | ${new Date(e.ts).toLocaleString()} | ${e.engine}${e.analyzeUsed ? '+ANALYZE' : ''} | 发现 ${e.findingsCount} 条 | ${e.connName} | ${e.sql.slice(0, 120)}`);
  return text(`最近 ${r.items.length} 条分析：\n${lines.join('\n')}`);
}

async function toolHistoryGet(args) {
  const r = await callService('history.get', { id: String(args.id || '') });
  if (!r.ok) return text(`读取失败：${r.error}`, true);
  const { core } = loadCore();
  return text(`【历史 · ${r.plan.engine === 'pg' ? 'PostgreSQL' : 'MySQL'}】\n\n${core.summarizeForAi(r.plan, r.findings)}`);
}

/** core 仅用于 summarizeForAi 的文本装配（与 service 同一份逻辑源） */
let coreCache = null;
function loadCore() {
  if (!coreCache) coreCache = { core: require(path.join(__dirname, '..', 'service', 'core.js')) };
  return coreCache;
}

async function dispatchTool(name, args) {
  switch (name) {
    case 'qpl_connections': return toolConnections();
    case 'qpl_explain': return toolExplain(args || {});
    case 'qpl_parse': return toolParse(args || {});
    case 'qpl_history': return toolHistory(args || {});
    case 'qpl_history_get': return toolHistoryGet(args || {});
    default: return text(`未知工具 ${name}`, true);
  }
}

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
    let msg = null;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    void (async () => {
      try {
        if (msg.method === 'initialize') {
          send({
            jsonrpc: '2.0', id: msg.id, result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'query-plan-lens', version: '0.1.0' },
            },
          });
        } else if (msg.method === 'tools/list') {
          send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
        } else if (msg.method === 'tools/call') {
          const args = (msg.params && msg.params.arguments) || {};
          const name = msg.params && msg.params.name;
          try {
            const result = await dispatchTool(name, args);
            send({ jsonrpc: '2.0', id: msg.id, result });
          } catch (err) {
            send({ jsonrpc: '2.0', id: msg.id, result: text(`执行失败：${err && err.message}`, true) });
          }
        } else if (msg.method === 'ping') {
          send({ jsonrpc: '2.0', id: msg.id, result: {} });
        } else if (msg.id !== undefined) {
          send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在: ${msg.method}` } });
        }
      } catch (err) {
        slog(`消息处理异常：${err && err.stack ? err.stack.split('\n')[0] : err}`);
        if (msg && msg.id !== undefined) {
          send({ jsonrpc: '2.0', id: msg.id, result: text(`内部错误：${err && err.message}`, true) });
        }
      }
    })();
  }
});
process.stdin.resume();
slog(`started (appConfigDir=${APP_CONFIG_DIR || '(未提供，使用 tmp)'})`);
