#!/usr/bin/env node
'use strict';
/**
 * server.js —— 仓库体检台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与已交付调试类插件（mcp-probe / stream-desk / dep-probe）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：先经 kvclient 读 cap.kv 的 repolens.meta 拿 {port, token}，
 * 再 127.0.0.1 直连。测试钩子（yizhou/stream-desk 先例）：env REPOLENS_SERVICE_URL
 * + REPOLENS_SERVICE_TOKEN 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 八工具（AI 考古闭环：扫 → 读报告 → 定位热点 → 下钻单文件 → 耦合/卫生 → 历史）：
 *   repo_scan（同步扫完返回摘要）/ repo_report / repo_hotspots / repo_file
 *   repo_couples / repo_hygiene / repo_runs / repo_selftest
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));
const core = require(path.join(__dirname, '..', 'shared', 'core'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

// ── stderr 日志（stdout 只走协议）───────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[repo-lens-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.REPOLENS_SERVICE_URL || '';
const ENV_TOKEN = process.env.REPOLENS_SERVICE_TOKEN || '';
let svcInfo = null; // {base, token, at}

async function resolveService(force) {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (!force && svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('repolens.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('仓库体检台服务未注册（repolens.meta 缺失）：请先在 Polaris 打开「仓库体检台」面板拉起服务，或检查插件是否已启用');
  }
  svcInfo = { base: `http://127.0.0.1:${meta.port}`, token: meta.token, at: Date.now() };
  return svcInfo;
}

function svcRequest(method, apiPath, body, timeoutMs) {
  return resolveService(false).then((svc) => new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: new URL(svc.base).port,
      path: apiPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${svc.token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: timeoutMs || 35_000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        } catch (_) {
          reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('服务请求超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
}

/** 轮询直至扫描完成（repo_scan 同步语义；每 1.5s 一次，总时长上限由 timeoutMs 控制） */
async function waitScan(runId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 120_000);
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const st = await svcRequest('GET', `/api/scan/${encodeURIComponent(runId)}`, null, 10_000);
    if (st.status && st.status !== 'running') return st;
    if (Date.now() > deadline) {
      return { runId, status: 'timeout', message: `等待扫描超时（${Math.round((timeoutMs || 120_000) / 1000)}s）：扫描仍在后台进行，稍后用 repo_runs / repo_report 查询结果` };
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

function fmtHotspot(h, i) {
  return `${i + 1}. [${h.score}分] ${h.path}\n   提交 ${h.commits} 次 / 增删 ${h.addedLines + h.deletedLines} 行 / ${h.loc || '?'} 行代码 / 复杂度 ${h.cxScore}${h.complexityKnown ? '' : '(未读内容)'} / ${h.authors} 位作者 / 最近 ${h.lastTouch ? new Date(h.lastTouch * 1000).toISOString().slice(0, 10) : '?'}`;
}

async function toolRepoScan(args) {
  const p = String(args && args.path || '').trim();
  if (!p) throw new Error('缺少 path 参数（仓库目录或其子目录）');
  const days = args && args.days != null ? Number(args.days) : undefined;
  const maxCommits = args && args.maxCommits != null ? Number(args.maxCommits) : undefined;
  const { runId } = await svcRequest('POST', '/api/scan', { path: p, days, maxCommits }, 15_000);
  const st = await waitScan(runId, 240_000);
  if (st.status === 'error') throw new Error(`扫描失败：${st.error || st.message}`);
  if (st.status === 'timeout') return { runId, status: 'timeout', message: st.message };
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  return summarize(report);
}

function summarize(report) {
  const t = report.totals || {};
  const top = (report.hotspots || []).slice(0, 10).map((h, i) => fmtHotspot(h, i)).join('\n');
  const couples = (report.couples || []).slice(0, 5)
    .map((c) => `  ${c.a} ⇄ ${c.b}（${c.co} 次同提交，比例 ${c.ratio}）`).join('\n');
  const health = report.health || { total: null, parts: {} };
  return {
    runId: report.runId,
    repo: report.repo,
    window: report.window,
    totals: t,
    health,
    hygiene: report.hygiene,
    busFactor: report.busFactor,
    dupSummary: report.dupSummary,
    warnings: report.warnings,
    topHotspots: (report.hotspots || []).slice(0, 10),
    topCouples: (report.couples || []).slice(0, 5),
    reading: [
      `仓库 ${report.repo ? report.repo.top : '?'}（${report.repo ? report.repo.branch : '?'} 分支，窗口 ${report.window ? report.window.days : '?'} 天，${t.commits} 提交）`,
      `健康分 ${health.total}/100（热点集中 ${health.parts.hotspot} / 重复 ${health.parts.duplication} / 卫生 ${health.parts.hygiene} / 巴士 ${health.parts.busFactor} / 大对象 ${health.parts.bigBlobs}）`,
      `提交卫生：conventional ${Math.round((report.hygiene ? report.hygiene.conventionalRate : 0) * 100)}%，草率消息 ${report.hygiene ? report.hygiene.sloppy : 0} 条，巨提交 ${report.hygiene ? report.hygiene.bigCommits : 0} 个；巴士因子 ${report.busFactor ? report.busFactor.busFactor : '?'}（${report.busFactor ? report.busFactor.totalAuthors : '?'} 位作者）`,
      `重复：${report.dupSummary ? report.dupSummary.totalDupLines : 0} 行（占代码 ${(100 * (report.dupSummary ? report.dupSummary.ratio : 0)).toFixed(1)}%）`,
      '重构优先看（热点 Top10）：',
      top,
      couples ? `时间耦合（总是一起改，动一个要验证另一个）：\n${couples}` : '时间耦合：无显著共变对',
      (report.warnings && report.warnings.length) ? `⚠ 警告：${report.warnings.join('；')}` : '',
    ].filter(Boolean).join('\n'),
  };
}

async function toolRepoReport(args) {
  let runId = args && args.runId;
  if (!runId) runId = await latestRunId();
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  return summarize(report);
}

async function latestRunId() {
  const { runs } = await svcRequest('GET', '/api/runs', null, 15_000);
  const ok = (runs || []).find((r) => r.status === 'ok');
  if (!ok) throw new Error('没有已完成的扫描：先调 repo_scan 或在面板里扫一次');
  return ok.runId;
}

async function toolRepoHotspots(args) {
  const runId = (args && args.runId) || await latestRunId();
  const topN = Math.min(100, Math.max(1, Number(args && args.topN) || 15));
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  const rows = (report.hotspots || []).slice(0, topN);
  return {
    runId, total: (report.hotspots || []).length,
    hotspots: rows,
    reading: ['热点 = 变更频率 × 复杂度（重构优先级，分数 0-100）：', ...rows.map((h, i) => fmtHotspot(h, i))].join('\n'),
  };
}

async function toolRepoFile(args) {
  const runId = (args && args.runId) || await latestRunId();
  const fp = String(args && args.path || '').trim();
  if (!fp) throw new Error('缺少 path 参数（仓库内相对路径）');
  return svcRequest('GET', `/api/file?runId=${encodeURIComponent(runId)}&path=${encodeURIComponent(fp)}`, null, 20_000);
}

async function toolRepoCouples(args) {
  const runId = (args && args.runId) || await latestRunId();
  const topN = Math.min(100, Math.max(1, Number(args && args.topN) || 15));
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  const rows = (report.couples || []).slice(0, topN);
  return {
    runId, couples: rows,
    reading: rows.length
      ? ['时间耦合对（同窗内总是被一起改的文件——表面独立、实际一体，动一个必须验证另一个）：',
        ...rows.map((c) => `- ${c.a} ⇄ ${c.b}：${c.co} 次同提交（占比 ${c.ratio}）`)].join('\n')
      : '时间窗内无显著共变文件对（≥3 次同提交且占比 ≥0.5）。',
  };
}

async function toolRepoHygiene(args) {
  const runId = (args && args.runId) || await latestRunId();
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  const staleDays = 30;
  const stale = (report.branches || []).filter((b) => Date.now() / 1000 - b.date > staleDays * 86400);
  return {
    runId,
    hygiene: report.hygiene,
    busFactor: report.busFactor,
    blobs: report.blobs,
    branchesTotal: (report.branches || []).length,
    staleBranches: stale.slice(0, 20),
    health: report.health,
    warnings: report.warnings,
    reading: [
      `提交卫生：conventional 遵循率 ${Math.round((report.hygiene ? report.hygiene.conventionalRate : 0) * 100)}%，草率消息 ${report.hygiene ? report.hygiene.sloppy : 0} 条（占 ${Math.round((report.hygiene ? report.hygiene.sloppyRate : 0) * 100)}%），巨提交（≥20 文件）${report.hygiene ? report.hygiene.bigCommits : 0} 个（占 ${Math.round((report.hygiene ? report.hygiene.bigRate : 0) * 100)}%），平均标题长度 ${report.hygiene ? report.hygiene.avgSubjectLen : '?'} 字符`,
      `巴士因子 ${report.busFactor ? report.busFactor.busFactor : '?'}：贡献 50% 提交的最少作者数；作者 Top3：${(report.busFactor ? report.busFactor.authors.slice(0, 3) : []).map((a) => `${a.name}(${a.commits})`).join('、') || '无'}`,
      report.blobs && report.blobs.length ? `历史大对象 Top3：${report.blobs.slice(0, 3).map((b) => `${b.path}(${b.mb}MB)`).join('、')}` : '历史大对象：无 >0.01MB 级条目',
      `分支 ${stale.length}/${(report.branches || []).length} 个超过 ${staleDays} 天未动`,
    ].join('\n'),
  };
}

async function toolRepoRuns() {
  const { runs, degraded, version } = await svcRequest('GET', '/api/runs', null, 15_000);
  return { degraded, version, runs };
}

async function toolSelftest() {
  const r = await svcRequest('POST', '/api/selftest', {}, 60_000);
  return r;
}

// ── 工具清单 ────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'repo_scan',
    description: '对指定本机 git 仓库做一次完整体检（同步等待完成）：热点（变更频率×复杂度）、时间耦合、重复代码、历史大对象、提交卫生、巴士因子、陈旧分支、健康分。返回摘要与解读文本。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '仓库目录（或仓库内子目录），如 D:\\space\\base\\Polaris' },
        days: { type: 'number', description: '历史时间窗（天），默认 365' },
        maxCommits: { type: 'number', description: '最多分析的提交数，默认 5000（大仓建议先调小）' },
      },
      required: ['path'],
    },
  },
  {
    name: 'repo_report',
    description: '读取一次体检的完整摘要（默认最近一次）：健康分、热点 Top10、时间耦合 Top5、卫生、巴士因子、重复概况与警告。',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string', description: '扫描 runId；缺省用最近一次' } },
    },
  },
  {
    name: 'repo_hotspots',
    description: '列出热点文件排行（变更频率×复杂度，重构优先级）。topN 默认 15。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        topN: { type: 'number', description: '返回条数，默认 15，上限 100' },
      },
    },
  },
  {
    name: 'repo_file',
    description: '单个文件的下钻：周粒度变更时间线（52 周）、作者分布、共变伙伴、涉及的重复块、热点指标。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        path: { type: 'string', description: '仓库内相对路径，如 src/stores/foo.ts' },
      },
      required: ['path'],
    },
  },
  {
    name: 'repo_couples',
    description: '时间耦合文件对：总是被一起改的文件（隐藏依赖/假装独立）。topN 默认 15。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        topN: { type: 'number' },
      },
    },
  },
  {
    name: 'repo_hygiene',
    description: '工程卫生体检：提交规范遵循率、草率消息、巨提交、巴士因子与作者分布、历史大对象、陈旧分支、健康分构成。',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } } },
  },
  {
    name: 'repo_runs',
    description: '列出最近的扫描历史（runId、状态、健康分、耗时）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'repo_selftest',
    description: '离线自检：解析/分析主链 fixture 验证 + git 可用性检查。诊断用。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const METHOD_IMPL = {
  repo_scan: toolRepoScan,
  repo_report: toolRepoReport,
  repo_hotspots: toolRepoHotspots,
  repo_file: toolRepoFile,
  repo_couples: toolRepoCouples,
  repo_hygiene: toolRepoHygiene,
  repo_runs: toolRepoRuns,
  repo_selftest: toolSelftest,
};

// ── JSON-RPC 主循环 ─────────────────────────────────────────────────────────

function writeMsg(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function rpcResult(id, result) { writeMsg({ jsonrpc: '2.0', id, result }); }
function rpcError(id, code, message) { writeMsg({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (!msg || msg.jsonrpc !== '2.0') return;
  const { id, method, params } = msg;
  if (method === undefined) return; // 对响应不做处理
  try {
    if (method === 'initialize') {
      rpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'repo-lens', version: core.VERSION },
      });
      return;
    }
    if (method === 'notifications/initialized') return;
    if (method === 'ping') { rpcResult(id, {}); return; }
    if (method === 'tools/list') { rpcResult(id, { tools: TOOLS }); return; }
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const impl = METHOD_IMPL[name];
      if (!impl) { rpcError(id, -32602, `未知工具：${name}`); return; }
      try {
        const out = await impl(args);
        rpcResult(id, {
          content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }],
        });
      } catch (e) {
        log('warn', `tool ${name} 失败: ${e.message}`);
        rpcResult(id, { content: [{ type: 'text', text: `错误：${e.message}` }], isError: true });
      }
      return;
    }
    rpcError(id, -32601, `未知方法：${method}`);
  } catch (e) {
    log('error', `处理 ${method} 异常: ${e.stack || e.message}`);
    rpcError(id, -32603, e.message || '内部错误');
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line); // 异步吞吐：不阻塞读 stdin
  }
});
process.stdin.on('end', () => process.exit(0));
process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
log('info', `repo-lens MCP 已启动（v${core.VERSION}）`);
