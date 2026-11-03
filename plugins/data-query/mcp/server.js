#!/usr/bin/env node
'use strict';
/**
 * server.js —— 数据查询台 MCP server（stdio JSON-RPC 2.0，零依赖）
 *
 * AI 问数层：七个工具全部经本机服务 HTTP（127.0.0.1，单一权威）执行。
 * 服务未运行时返回明确引导信息，不猜测不兜底。
 *
 * 端口发现：env DATAQUERY_PORT（测试钩子）→ cap.kv `dq.meta` → manifest 9875。
 * 协议数据只走 stdout；日志走 stderr。
 */
const http = require('http');
const core = require('../service/core');
const { createKvClient } = require('../service/kvclient');

const VERSION = core.VERSION;
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[data-query:mcp] ${msg}\n`); }
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 服务客户端 ─────────────────────────────────────────────────────────────
let portResolved = null;
async function resolvePort() {
  if (process.env.DATAQUERY_PORT) return parseInt(process.env.DATAQUERY_PORT, 10); // 测试钩子
  if (portResolved) return portResolved;
  try {
    const meta = await kv.kvGet(core.KV_META_KEY);
    if (meta && Number(meta.port) > 0) {
      portResolved = Number(meta.port);
      return portResolved;
    }
  } catch (_) { /* bridge 不可用，走回退 */ }
  return core.MANIFEST_PORT;
}

function svcCall(method, pathname, body, timeoutMs) {
  return resolvePort().then((port) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      timeout: timeoutMs || 120000,
      headers: data
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {},
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 20 * 1024 * 1024) { res.destroy(); resolve({ status: res.statusCode, body: '{"ok":false,"error":"响应超过 20MB 截断"}' }); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error(`服务请求超时（>${(timeoutMs || 120000) / 1000}s）——大查询请拆分或缩小扫描范围`)); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
}

async function svcJson(method, pathname, body, timeoutMs) {
  const r = await svcCall(method, pathname, body, timeoutMs);
  let parsed = null;
  try { parsed = JSON.parse(r.body); } catch (_) { /* 原文返回 */ }
  if (parsed && parsed.ok === false) {
    const e = new Error(parsed.error || `服务返回错误（HTTP ${r.status}）`);
    e.userFacing = true;
    throw e;
  }
  if (!parsed) throw new Error(`服务响应不可解析（HTTP ${r.status}）：${String(r.body).slice(0, 200)}`);
  return parsed;
}

function serviceDownGuide(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|端口|超时/.test(msg)) {
    return `数据查询台服务未就绪：${msg}\n请打开 Polaris 的「数据查询台」面板（会自动拉起服务）后再试。`;
  }
  return `数据查询台服务调用失败：${msg}`;
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolStatus() {
  try {
    const s = await svcJson('GET', '/status');
    const e = s.engine || {};
    const lines = [
      `数据查询台 v${s.version}｜引擎（DuckDB ${core.NATIVE.VERSION} native）：${e.engine === 'ready' ? '就绪' : e.engine === 'initializing' ? '初始化中' : e.engine === 'error' ? `错误：${e.error}` : e.engine}`,
      `已导入表：${e.tables || 0} 张（共 ${e.rowsTotal || 0} 行，工作区 ${(e.workspaceBytes / 1048576).toFixed(1)}MB）`,
      `工作区：${e.workspaceFile || s.workspaceDir}`,
    ];
    if (e.engine !== 'ready') lines.push('（引擎未就绪时导入/查询会自动等待初始化完成）');
    return { text: lines.join('\n') };
  } catch (e) {
    return { text: serviceDownGuide(e), isError: true };
  }
}

async function toolTables() {
  const r = await svcJson('GET', '/tables');
  if (!r.tables.length) return { text: '工作区暂无表。用 dq_import 导入本机数据文件（.csv/.tsv/.txt/.json/.jsonl/.ndjson/.parquet）。' };
  const lines = r.tables.map((t) => `- ${t.table}｜${t.rows} 行｜${(t.sizeBytes / 1024).toFixed(0)}KB｜来源 ${t.source}${t.kind && t.kind !== 'unknown' ? `（${t.kind}）` : ''}`);
  return { text: `共 ${r.tables.length} 张表（跨表可直接 JOIN，表名即标识符）：\n${lines.join('\n')}` };
}

async function toolSchema(args) {
  const table = String(args.table || '').trim();
  if (!table) return { text: '缺少 table 参数（先用 dq_tables 查看表清单）。', isError: true };
  const r = await svcJson('GET', `/schema?table=${encodeURIComponent(table)}`);
  const cols = r.columns.map((c) => `- ${c.name}（${c.type}）`).join('\n');
  const sample = core.rowsToMarkdown(r.columns.map((c) => c.name), r.sample, { maxRows: 3, maxBytes: 1500 });
  return { text: `表 ${r.table}｜${r.columns.length} 列：\n${cols}\n\n样例（前 3 行）：\n${sample}` };
}

async function toolImport(args) {
  const p = String(args.path || '').trim();
  if (!p) return { text: '缺少 path 参数（数据文件的绝对路径）。', isError: true };
  const r = await svcJson('POST', '/import', { path: p, table: args.table || undefined }, 300000);
  return { text: `导入成功：表 ${r.table}，${r.rows} 行，耗时 ${(r.elapsedMs / 1000).toFixed(2)}s（来源 ${r.source}）。可用 dq_schema 看列结构，或直接 SQL 查询。` };
}

async function toolQuery(args) {
  const sql = String(args.sql || '').trim();
  if (!sql) return { text: '缺少 sql 参数。', isError: true };
  const maxRows = Math.min(Number(args.maxRows) || 60, 500);
  try {
    const r = await svcJson('POST', '/query', { sql, maxRows }, 180000);
    const md = core.rowsToMarkdown(r.columns, r.rows, { maxRows, maxBytes: 6000 });
    const head = `查询完成：${r.rowCount} 行，耗时 ${(r.elapsedMs / 1000).toFixed(2)}s${r.truncated ? '（结果超出 maxRows，仅展示部分）' : ''}`;
    return { text: `${head}\n\n${md}${r.rowCount > maxRows ? `\n（完整结果共 ${r.rowCount} 行；可在面板查看/导出，或调大 maxRows≤500）` : ''}` };
  } catch (e) {
    return { text: `查询失败：${e.message}\n提示：只允许单条 SELECT/WITH；表在默认工作区，直接用表名引用；表结构可用 dq_schema 查看。`, isError: true };
  }
}

async function toolExport(args) {
  const sql = String(args.sql || '').trim();
  const p = String(args.path || '').trim();
  if (!sql || !p) return { text: '需要 sql 与 path 两个参数（path 为导出文件绝对路径，.csv/.json/.ndjson）。', isError: true };
  try {
    const r = await svcJson('POST', '/export', { sql, path: p, format: args.format || 'csv', overwrite: args.overwrite === true }, 300000);
    return { text: `导出成功：${r.path}（${r.format.toUpperCase()}，${r.rows} 行，${(r.bytes / 1024).toFixed(0)}KB，耗时 ${(r.elapsedMs / 1000).toFixed(2)}s）${r.format === 'csv' ? '，UTF-8 带 BOM，Excel 可直开' : ''}` };
  } catch (e) {
    return { text: `导出失败：${e.message}`, isError: true };
  }
}

async function toolDrop(args) {
  const table = String(args.table || '').trim();
  if (!table) return { text: '缺少 table 参数。', isError: true };
  const r = await svcJson('POST', '/drop', { table });
  return { text: `已删除表 ${r.dropped}（源文件不受影响，可重新导入）。` };
}

// ── 工具声明（description 写「适用句式」，AI 靠它匹配意图）─────────────────
const TOOLS = [
  {
    name: 'dq_status',
    description: '查看「数据查询台」引擎与工作区状态（引擎是否就绪/已导入多少表多少行）。适用：「数据查询台怎么了」「引擎下好没有」「现在有哪些数据」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolStatus,
  },
  {
    name: 'dq_tables',
    description: '列出工作区全部已导入表（表名/行数/来源文件）。适用：「有哪些表」「我能查什么数据」。表名可直接用于 SQL，跨表可 JOIN。',
    inputSchema: { type: 'object', properties: {} },
    run: toolTables,
  },
  {
    name: 'dq_schema',
    description: '看某张表的列名/类型和前 3 行样例。适用：「xx 表有什么列」「这表长什么样」。table 来自 dq_tables。写 SQL 前先看一眼可避免猜列名。',
    inputSchema: {
      type: 'object',
      properties: { table: { type: 'string', description: '表名（dq_tables 返回的）' } },
      required: ['table'],
    },
    run: toolSchema,
  },
  {
    name: 'dq_import',
    description: '把本机数据文件导入为可 SQL 查询的表（支持 .csv/.tsv/.txt/.json/.jsonl/.ndjson/.parquet，自动探测 GBK/UTF-16 编码并转码）。适用：「帮我把下载目录的 sales.csv 导进来」「分析 D:/账单/2026.csv」。同名再导入 = 覆盖刷新。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '数据文件绝对路径' },
        table: { type: 'string', description: '可选：自定义表名（默认取文件名主干）' },
      },
      required: ['path'],
    },
    run: toolImport,
  },
  {
    name: 'dq_query',
    description: '对已导入的表跑只读 SQL（DuckDB 方言，单条 SELECT/WITH；聚合/分组/JOIN/窗口函数都可用）。适用：「按月汇总金额」「哪类目退货最多」「两张表 JOIN 对比」。结果以 markdown 表返回（默认 60 行，maxRows≤500）。写操作/建表不支持，导出用 dq_export。',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: '单条只读 SQL（SELECT 或 WITH 开头）' },
        maxRows: { type: 'number', description: '返回行数上限（默认 60，最大 500）' },
      },
      required: ['sql'],
    },
    run: toolQuery,
  },
  {
    name: 'dq_export',
    description: '把查询结果落成本机文件（CSV 带 BOM Excel 直开/JSON/NDJSON）。适用：「把结果导出到桌面」「存成 CSV」。需要绝对路径；已存在文件默认拒绝覆盖（overwrite:true 才覆盖）。',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: '单条只读 SQL' },
        path: { type: 'string', description: '导出文件绝对路径（.csv/.json/.ndjson）' },
        format: { type: 'string', description: 'csv（默认）/json/ndjson' },
        overwrite: { type: 'boolean', description: '已存在时是否覆盖（默认 false）' },
      },
      required: ['sql', 'path'],
    },
    run: toolExport,
  },
  {
    name: 'dq_drop',
    description: '从工作区删除一张导入的表（源文件不受影响）。适用：「把 xx 表删了」「清理工作区」（清空全部用面板的重置按钮）。',
    inputSchema: {
      type: 'object',
      properties: { table: { type: 'string', description: '表名' } },
      required: ['table'],
    },
    run: toolDrop,
  },
];

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function oneLine(text, cap) {
  const s = String(text == null ? '' : text);
  return s.length > cap ? `${s.slice(0, cap)}…（截断）` : s;
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'data-query', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return;
  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0', id,
      result: { tools: TOOLS.map(({ run, ...rest }) => rest) },
    });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true } });
      return;
    }
    try {
      const r = await tool.run((params && params.arguments) || {});
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: oneLine(r.text, 24000) }], isError: r.isError === true },
      });
    } catch (e) {
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: oneLine(serviceDownGuide(e), 8000) }], isError: true },
      });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  // 逐行分隔 JSON-RPC（与宿主 McpClient 换行分隔协议对齐）
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) {
      slog(`bad json line: ${e.message}`);
      continue;
    }
    handle(msg).catch((e) => slog(`handle error: ${e && e.stack ? e.stack : e}`));
  }
});
process.stdin.on('end', () => process.exit(0));

slog(`mcp server ready (v${VERSION}, appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
