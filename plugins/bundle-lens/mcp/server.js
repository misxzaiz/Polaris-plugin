#!/usr/bin/env node
'use strict';
/**
 * server.js —— 包体积透视台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与已交付调试类插件（repo-lens / mcp-probe / stream-desk）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：先经 kvclient 读 cap.kv 的 bundlelens.meta 拿 {port, token}，
 * 再 127.0.0.1 直连。测试钩子（yizhou/stream-desk 先例）：env BUNDLELENS_SERVICE_URL
 * + BUNDLELENS_SERVICE_TOKEN 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 八工具（AI 透视闭环：扫 → 读报告 → 包排行 → 重复体检 → chunk 下钻 → 前后对比 → 历史 → 自检）：
 *   bundle_scan / bundle_report / bundle_packages / bundle_duplicates
 *   bundle_chunks / bundle_diff / bundle_runs / bundle_selftest
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));
const core = require(path.join(__dirname, '..', 'shared', 'core'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

function log(level, msg) {
  try { process.stderr.write(`[bundle-lens-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.BUNDLELENS_SERVICE_URL || '';
const ENV_TOKEN = process.env.BUNDLELENS_SERVICE_TOKEN || '';
let svcInfo = null; // {base, token, at}

async function resolveService() {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('bundlelens.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('包体积透视台服务未注册（bundlelens.meta 缺失）：请先在 Polaris 打开「包体积透视台」面板拉起服务，或检查插件是否已启用');
  }
  svcInfo = { base: `http://127.0.0.1:${meta.port}`, token: meta.token, at: Date.now() };
  return svcInfo;
}

function svcRequest(method, apiPath, body, timeoutMs) {
  return resolveService().then((svc) => new Promise((resolve, reject) => {
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

/** 轮询直至扫描完成（bundle_scan 同步语义；每 1.2s 一次） */
async function waitScan(runId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 180_000);
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const st = await svcRequest('GET', `/api/scan/${encodeURIComponent(runId)}`, null, 10_000);
    if (st.status && st.status !== 'running') return st;
    if (Date.now() > deadline) {
      return { runId, status: 'timeout', message: `等待扫描超时：扫描仍在后台进行，稍后用 bundle_runs / bundle_report 查询结果` };
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function latestRunId() {
  const { runs } = await svcRequest('GET', '/api/runs', null, 15_000);
  const ok = (runs || []).find((r) => r.status === 'ok');
  if (!ok) throw new Error('没有已完成的扫描：先调 bundle_scan 或在面板里扫一次');
  return ok.runId;
}

const kb = (n) => `${Math.round(n / 1024)}KB`;

function fmtPkgs(packages, topN) {
  const total = packages.reduce((a, b) => a + b.bytes, 0) || 1;
  return packages.slice(0, topN).map((p, i) => {
    const ver = p.versions.length ? `@${p.versions.join('/')}` : '';
    return `${i + 1}. ${p.name}${ver}：${kb(p.bytes)}（占包总量 ${Math.round((p.bytes / total) * 100)}%，${p.fileCount} 个源文件${p.roots.length > 1 ? `，⚠ ${p.roots.length} 份独立安装` : ''}）`;
  }).join('\n');
}

function summarize(report) {
  const t = report.totals || {};
  const dup = report.duplicates || {};
  const lines = [
    `目录 ${report.dir}`,
    `总体积 ${kb(t.totalBytes || 0)}：${t.chunks} 个 chunk（${t.chunksNoMap} 个无 map），映射覆盖 ${Math.round((t.mapCoverage || 0) * 100)}%，耗时 ${t.durationMs}ms`,
    `依赖代码 ${kb(t.vendorBytes || 0)} vs 应用代码 ${kb(t.appBytes || 0)}；npm 包 ${t.pkgCount} 个 / 源模块 ${t.moduleCount} 个`,
    dup.versionConflicts && dup.versionConflicts.length ? `⚠ 同包多份安装 ${dup.versionConflicts.length} 个：${dup.versionConflicts.slice(0, 5).map((c) => `${c.name}×${c.roots}${c.versions.length ? `(${c.versions.join('/')})` : ''}`).join('、')}` : '同包多份安装：无',
    `同源文件多 chunk ${dup.chunkDupes ? dup.chunkDupes.length : 0} 个 / 异路径同内容 ${dup.contentDupes ? dup.contentDupes.length : 0} 个`,
    report.diff ? `对比上次（${report.diff.prevRunId}）：总体积 ${(report.diff.totalDelta >= 0 ? '+' : '')}${kb(Math.abs(report.diff.totalDelta))} → ${kb(report.diff.totalNow)}` : '',
    report.suggestions && report.suggestions.length ? `建议 ${report.suggestions.length} 条：\n${report.suggestions.slice(0, 6).map((s) => `- [${s.level}] ${s.title}`).join('\n')}` : '',
    report.warnings && report.warnings.length ? `⚠ 警告：${report.warnings.join('；')}` : '',
    '',
    '体积 Top 包：',
    fmtPkgs(report.packages || [], 10),
  ].filter(Boolean);
  return {
    runId: report.runId,
    dir: report.dir,
    totals: t,
    diff: report.diff || null,
    topPackages: (report.packages || []).slice(0, 10),
    versionConflicts: dup.versionConflicts || [],
    suggestions: report.suggestions || [],
    warnings: report.warnings || [],
    reading: lines.join('\n'),
  };
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolScan(args) {
  const p = String(args && args.path || '').trim();
  if (!p) throw new Error('缺少 path 参数（构建产物目录，如 D:\\proj\\dist 或 ./build）');
  const { runId } = await svcRequest('POST', '/api/scan', { path: p }, 15_000);
  const st = await waitScan(runId, 300_000);
  if (st.status === 'error') throw new Error(`扫描失败：${st.error || st.message}`);
  if (st.status === 'timeout') return { runId, status: 'timeout', message: st.message };
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  return summarize(report);
}

async function toolReport(args) {
  let runId = args && args.runId;
  if (!runId) runId = await latestRunId();
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  return summarize(report);
}

async function toolPackages(args) {
  const runId = (args && args.runId) || await latestRunId();
  const topN = Math.min(120, Math.max(1, Number(args && args.topN) || 20));
  const q = String(args && args.filter || '').toLowerCase();
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  const all = report.packages || [];
  const rows = (q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all).slice(0, topN);
  return {
    runId, total: all.length, shown: rows.length,
    packages: rows,
    reading: rows.length
      ? [`包排行（${q ? `过滤「${q}」` : '全部'}，${rows.length}/${all.length}）：`, fmtPkgs(rows, topN)].join('\n')
      : '没有匹配的包',
  };
}

async function toolDuplicates(args) {
  const runId = (args && args.runId) || await latestRunId();
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  const dup = report.duplicates || {};
  const lines = [];
  if (dup.versionConflicts && dup.versionConflicts.length) {
    lines.push('同包多份独立安装（dedupe 收敛目标）：');
    for (const c of dup.versionConflicts.slice(0, 10)) {
      lines.push(`  - ${c.name}${c.versions.length ? `（版本 ${c.versions.join(' / ')}）` : ''}：${c.roots} 份 / ${c.files} 个文件 / ${kb(c.bytes)}`);
    }
  } else lines.push('同包多份独立安装：无 ✓');
  const cd = (dup.chunkDupes || []).filter((d) => d.wasteBytes >= 1024);
  if (cd.length) {
    lines.push('同源文件打进多个 chunk：');
    for (const d of cd.slice(0, 10)) lines.push(`  - ${d.source}：${d.chunkCount} 个 chunk，重复约 ${kb(d.wasteBytes)}`);
  } else lines.push('同源文件多 chunk：无 ✓');
  const ct = (dup.contentDupes || []).filter((d) => d.wasteBytes >= 1024);
  if (ct.length) {
    lines.push('异路径完全同内容（可疑的重复打包）：');
    for (const d of ct.slice(0, 10)) lines.push(`  - ${d.paths.length} 份 × ${kb(d.bytes)}：${d.paths.slice(0, 3).join('、')}${d.paths.length > 3 ? ' …' : ''}`);
  } else lines.push('异路径同内容：无 ✓');
  return { runId, duplicates: dup, reading: lines.join('\n') };
}

async function toolChunks(args) {
  const runId = (args && args.runId) || await latestRunId();
  const { report } = await svcRequest('GET', `/api/report/${encodeURIComponent(runId)}`, null, 20_000);
  const rows = report.chunks || [];
  const lines = rows.slice(0, 40).map((c, i) => {
    const cov = c.hasMap ? `映射 ${Math.round((c.mappedBytes / Math.max(1, c.bytes)) * 100)}%` : '⚠ 无 map（仅文件级）';
    const top = (c.topPkgs || []).slice(0, 3).map((p) => `${p.name} ${kb(p.bytes)}`).join('、');
    return `${i + 1}. ${c.relPath}：${kb(c.bytes)}（${cov}${c.pkgCount ? `，${c.pkgCount} 包` : ''}）${top ? `\n   大头：${top}` : ''}`;
  });
  return { runId, chunks: rows, reading: [`chunk 清单（${rows.length} 个）：`, ...lines].join('\n') };
}

async function toolDiff(args) {
  const runIdA = args && args.runIdA;
  const runIdB = args && args.runIdB;
  let a;
  let b;
  if (runIdA && runIdB) {
    a = (await svcRequest('GET', `/api/report/${encodeURIComponent(runIdA)}`, null, 20_000)).report;
    b = (await svcRequest('GET', `/api/report/${encodeURIComponent(runIdB)}`, null, 20_000)).report;
  } else {
    // 默认：最近一次 vs 上一次同目录
    const { report } = await svcRequest('GET', '/api/report/' + encodeURIComponent((args && args.runIdB) || await latestRunId()), null, 20_000);
    if (!report.diff) throw new Error('该扫描没有同目录的历史可对比（对同一目录至少扫描两次后自动生成 diff；也可显式传 runIdA+runIdB）');
    return { runId: report.runId, diff: report.diff, reading: fmtDiff(report.diff) };
  }
  const diff = core.diffReports(a, b);
  return { runIdA: a.runId, runIdB: b.runId, diff, reading: fmtDiff(diff) };
}

function fmtDiff(d) {
  const sign = (n) => (n > 0 ? `+${kb(n)}` : n < 0 ? `-${kb(-n)}` : '±0');
  const lines = [
    `总体积：${kb(d.totalPrev)} → ${kb(d.totalNow)}（${sign(d.totalDelta)}）`,
    d.packages.length ? '逐包变化（|增量| 降序，最多 20）：' : '逐包变化：无',
    ...d.packages.slice(0, 20).map((p) => `  - ${p.name}：${kb(p.prev)} → ${kb(p.now)}（${sign(p.delta)}${p.prev > 0 ? `，${Math.round(p.pct * 100)}%` : ''}）`),
    d.added.length ? `新增包：${d.added.map((p) => `${p.name}(${kb(p.bytes)})`).join('、')}` : '',
    d.removed.length ? `移除包：${d.removed.map((p) => `${p.name}(${kb(p.bytes)})`).join('、')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

async function toolRuns() {
  const { runs, degraded, version } = await svcRequest('GET', '/api/runs', null, 15_000);
  return { degraded, version, runs };
}

async function toolSelftest() {
  return svcRequest('POST', '/api/selftest', {}, 120_000);
}

// ── 工具清单 ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'bundle_scan',
    description: '透视一个前端构建产物目录（vite/webpack/esbuild/rollup 通吃，零配置）：解析 sourcemap 做字节级归因，产出总体积/包排行/依赖 vs 应用占比/重复依赖/确定性建议。同步等待完成。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '构建产物目录，如 D:\\proj\\dist、./build（不要指到源码 src）' },
      },
      required: ['path'],
    },
  },
  {
    name: 'bundle_report',
    description: '读取一次透视的完整摘要（默认最近一次）：总体积、map 覆盖率、vendor/应用占比、Top 包、重复概况、建议与警告。',
    inputSchema: { type: 'object', properties: { runId: { type: 'string', description: '缺省用最近一次' } } },
  },
  {
    name: 'bundle_packages',
    description: '包体积排行（可过滤/限量）：每个 npm 包占多少字节、占比、源文件数、是否有多个独立安装。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        topN: { type: 'number', description: '返回条数，默认 20，上限 120' },
        filter: { type: 'string', description: '按包名子串过滤（不区分大小写），如 lodash' },
      },
    },
  },
  {
    name: 'bundle_duplicates',
    description: '重复依赖三连体检：同包多版本/多来源、同一源文件打进多个 chunk、不同路径完全相同内容。收敛依赖的直接依据。',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } } },
  },
  {
    name: 'bundle_chunks',
    description: 'chunk 清单：每个产物文件多大、是否有 map、映射覆盖率、里面最大的几个包。定位「该拆哪个文件」。',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } } },
  },
  {
    name: 'bundle_diff',
    description: '对比两次扫描：总体积与逐包增减（默认最近一次 vs 上一次同目录；或显式传 runIdA+runIdB）。优化前后验收必备。',
    inputSchema: {
      type: 'object',
      properties: {
        runIdA: { type: 'string', description: '基准扫描（旧）' },
        runIdB: { type: 'string', description: '对比扫描（新）；缺省 = 最近一次' },
      },
    },
  },
  {
    name: 'bundle_runs',
    description: '列出扫描历史（runId、目录、总体积、包数、覆盖率、耗时）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bundle_selftest',
    description: '离线自检：临时目录自造合成产物（已知归因答案）→ 全链路断言（归因/版本冲突/建议/treemap/diff）。诊断用。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const METHOD_IMPL = {
  bundle_scan: toolScan,
  bundle_report: toolReport,
  bundle_packages: toolPackages,
  bundle_duplicates: toolDuplicates,
  bundle_chunks: toolChunks,
  bundle_diff: toolDiff,
  bundle_runs: toolRuns,
  bundle_selftest: toolSelftest,
};

// ── JSON-RPC 主循环（house 同款）────────────────────────────────────────────
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
  if (method === undefined) return;
  try {
    if (method === 'initialize') {
      rpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'bundle-lens', version: core.VERSION },
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
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));
process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
log('info', `bundle-lens MCP 已启动（v${core.VERSION}）`);
