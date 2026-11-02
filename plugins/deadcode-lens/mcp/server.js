#!/usr/bin/env node
'use strict';
/**
 * server.js —— 死代码透视台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与宿主已交付调试类插件（mcp-probe / dep-probe / stream-desk）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：先经 kvclient 读 cap.kv 的 deadlens.meta 拿 {port, token}，
 * 再 127.0.0.1 直连。测试钩子（house 先例）：env DEADLENS_SERVICE_URL +
 * DEADLENS_SERVICE_TOKEN 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 六工具（AI 死代码清理闭环：扫 → 读发现 → 查证据 → 定方案）：
 *   dl_scan     发起扫描并等待完成，返回摘要（同步语义，大仓有 10 分钟上限）
 *   dl_findings 按类别/关键词过滤发现明细（files/exports/deps/unresolved/cycles）
 *   dl_why      单文件完整证据（谁引用它/它引用谁/导出消费情况/判定结论）
 *   dl_report   完整报告 JSON（含入口清单与警告）
 *   dl_runs     扫描历史
 *   dl_selftest 离线自检（零网络零盘验证引擎管道）
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

// ── stderr 日志（stdout 只走协议）───────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[deadcode-lens-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.DEADLENS_SERVICE_URL || '';
const ENV_TOKEN = process.env.DEADLENS_SERVICE_TOKEN || '';
let svcInfo = null; // {base, token, at}

async function resolveService(force) {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (!force && svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('deadlens.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('deadcode-lens 服务未就绪（kv 无 deadlens.meta）：请先在插件面板里打开一次服务，或确认插件已启用');
  }
  svcInfo = { base: `http://127.0.0.1:${meta.port}`, token: meta.token, at: Date.now() };
  return svcInfo;
}

async function svcRequest(method, apiPath, body, { timeoutMs = 660_000 } = {}) {
  const { base, token } = await resolveService(false);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { Authorization: `Bearer ${token}` };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ hostname: '127.0.0.1', port: Number(new URL(base).port), path: apiPath, method, headers, timeout: timeoutMs }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (_) { reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('服务请求超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** 发起扫描并轮询到终态（AI 同步语义；超时上限 10 分钟） */
async function scanAndWait(root, entries, ignorePrefixes) {
  const start = await svcRequest('POST', '/api/scan', { root, entries, ignorePrefixes }, { timeoutMs: 30_000 });
  if (!start.ok) throw new Error(start.error || '发起扫描失败');
  const runId = start.runId;
  const t0 = Date.now();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 700));
    // eslint-disable-next-line no-await-in-loop
    const st = await svcRequest('GET', `/api/run/${runId}`, null, { timeoutMs: 15_000 });
    if (!st.ok) throw new Error(st.error || '查询进度失败');
    if (st.run.status === 'done') return { runId, run: st.run };
    if (st.run.status === 'error') throw new Error(`扫描失败: ${st.run.error || '未知错误'}`);
    if (Date.now() - t0 > 10 * 60_000) throw new Error(`扫描超 10 分钟上限（runId=${runId}，可稍后用 dl_report 取结果）`);
  }
}

// ── 工具定义 ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'dl_scan',
    description: '死代码透视台：扫描一个 JS/TS 项目根目录，找出死文件/未使用导出/未使用依赖/悬空导入/循环依赖。同步等扫描完成后返回摘要。引擎完全离线，文件只读。',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: '要扫描的项目根目录（绝对路径）' },
        entries: { type: 'array', items: { type: 'string' }, description: '可选：补充入口文件/目录（相对扫描根）' },
        ignorePrefixes: { type: 'array', items: { type: 'string' }, description: '可选：忽略的路径前缀' },
      },
      required: ['root'],
    },
  },
  {
    name: 'dl_findings',
    description: '死代码透视台：读取一次扫描的发现明细。kind 可选 files(死文件)/exports(未使用导出)/deps(未使用依赖)/unresolved(悬空导入)/cycles(循环依赖)；q 按路径/名称模糊过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: '可选，缺省取最近一次' },
        kind: { type: 'string', enum: ['files', 'exports', 'deps', 'unresolved', 'cycles'], description: '发现类别' },
        q: { type: 'string', description: '模糊过滤关键词' },
        limit: { type: 'number', description: '返回条数上限（默认 50）' },
      },
    },
  },
  {
    name: 'dl_why',
    description: '死代码透视台：给出单个文件被判定为死/活的完整证据——谁引用它（含是否可达）、它引用谁、导出消费情况、结论。删除文件前用它复核。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '扫描根相对路径，如 src/utils/legacy.ts' } },
      required: ['path'],
    },
  },
  {
    name: 'dl_report',
    description: '死代码透视台：取一次扫描的完整报告（计数、入口清单、各类发现全文、警告）。',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string', description: '可选，缺省取最近一次' } },
    },
  },
  {
    name: 'dl_runs',
    description: '死代码透视台：列出最近扫描历史（runId/根目录/状态/发现计数）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dl_selftest',
    description: '死代码透视台：离线自检——内置虚拟项目 fixture 验证引擎全管道（死文件/导出/依赖/悬空/循环/入口），零网络零盘。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function latestReportId(runId) {
  if (runId) return runId;
  const r = await svcRequest('GET', '/api/latest');
  if (!r.ok || !r.runId) throw new Error('还没有任何扫描记录，请先 dl_scan');
  return r.runId;
}

function filterFindings(report, kind, q, limit) {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 400) : 50;
  const ql = String(q || '').toLowerCase();
  // q 命中任意标识字段（路径/名称/导入者/环成员），不是只看第一个
  const match = (x) => !ql || [x.path, x.name, x.importer, x.specifier, ...(Array.isArray(x.files) ? x.files : [])]
    .some((s) => s && String(s).toLowerCase().includes(ql));
  let items = [];
  if (kind === 'files') items = report.orphanFiles.map((o) => ({ path: o.path, reason: o.reason, importers: o.importerCount, bytes: o.bytes, loc: o.loc }));
  else if (kind === 'exports') items = report.unusedExports.map((x) => ({ path: x.path, name: x.name, suggestion: x.suggestion, typeOnly: x.typeOnly }));
  else if (kind === 'deps') items = (report.deps.unused || []).map((d) => ({ name: d.name, kind: d.kind, tooling: d.tooling, note: d.note }));
  else if (kind === 'unresolved') items = report.unresolvedImports.map((u) => ({ importer: u.importer, specifier: u.specifier, note: u.note }));
  else if (kind === 'cycles') items = report.cycles.map((c) => ({ size: c.size, files: c.files, truncated: c.truncated }));
  else {
    // 未指定 kind：返回计数 + 各类前几条
    return {
      counts: report.counts,
      hint: '用 kind 参数取明细：files/exports/deps/unresolved/cycles',
      samples: {
        files: report.orphanFiles.slice(0, 10).map((o) => o.path),
        exports: report.unusedExports.slice(0, 10).map((x) => `${x.path}::${x.name}`),
        deps: (report.deps.unused || []).slice(0, 10).map((d) => d.name),
        unresolved: report.unresolvedImports.slice(0, 10),
        cycles: report.cycles.slice(0, 5).map((c) => c.files),
      },
    };
  }
  const filtered = items.filter(match);
  return { kind: kind || 'all', total: filtered.length, items: filtered.slice(0, cap), truncated: filtered.length > cap };
}

async function callTool(name, args) {
  const a = args || {};
  switch (name) {
    case 'dl_scan': {
      if (!a.root || typeof a.root !== 'string') throw new Error('缺少 root（要扫描的项目根目录绝对路径）');
      const { runId, run } = await scanAndWait(a.root, a.entries, a.ignorePrefixes);
      const rep = await svcRequest('GET', `/api/report/${runId}`);
      const report = rep.ok ? rep.report : null;
      return {
        runId, root: run.root, durationMs: run.durationMs, counts: run.counts,
        warnings: report ? report.warnings.slice(0, 10) : [],
        topFiles: report ? report.orphanFiles.slice(0, 15).map((o) => ({ path: o.path, reason: o.reason })) : [],
        next: '用 dl_findings(kind=…) 取明细；删除前用 dl_why 复核单文件证据',
      };
    }
    case 'dl_findings': {
      const runId = await latestReportId(a.runId);
      const rep = await svcRequest('GET', `/api/report/${runId}`);
      if (!rep.ok) throw new Error(rep.error || '报告不存在');
      return { runId, ...filterFindings(rep.report, a.kind, a.q, a.limit) };
    }
    case 'dl_why': {
      if (!a.path) throw new Error('缺少 path');
      const r = await svcRequest('POST', '/api/why', { path: a.path });
      if (!r.ok) throw new Error(r.error || 'why 查询失败');
      return r.why;
    }
    case 'dl_report': {
      const runId = await latestReportId(a.runId);
      const rep = await svcRequest('GET', `/api/report/${runId}`);
      if (!rep.ok) throw new Error(rep.error || '报告不存在');
      return { runId, report: rep.report };
    }
    case 'dl_runs': {
      const r = await svcRequest('GET', '/api/history');
      if (!r.ok) throw new Error(r.error || '历史查询失败');
      return { runs: (r.runs || []).slice(0, 20) };
    }
    case 'dl_selftest': {
      const r = await svcRequest('POST', '/api/selftest', {});
      if (!r.ok) throw new Error(r.error || '自检请求失败');
      return r.selftest;
    }
    default:
      throw new Error(`未知工具 ${name}`);
  }
}

// ── JSON-RPC 骨架 ───────────────────────────────────────────────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line).catch((e) => log('error', `handleLine: ${e.message}`));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'deadcode-lens', version: '0.1.0' },
      });
    } else if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) {
      // 通知无需应答
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      const result = await callTool(name, args);
      reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] });
    } else if (method === 'ping') {
      reply(id, {});
    } else {
      reply(id, undefined, { code: -32601, message: `method 不存在: ${method}` });
    }
  } catch (e) {
    reply(id, undefined, { code: -32000, message: String((e && e.message) || e) });
  }
}

function reply(id, result, error) {
  const msg = error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result };
  try { process.stdout.write(`${JSON.stringify(msg)}\n`); } catch (_) { /* 管道关闭 */ }
}

log('info', 'deadcode-lens MCP server ready (stdio)');
