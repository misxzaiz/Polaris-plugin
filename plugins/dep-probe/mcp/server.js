#!/usr/bin/env node
'use strict';
/**
 * server.js —— 依赖体检台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与宿主已交付调试类插件（mcp-probe / stream-desk / webhook-station）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：不直连发现，先经 kvclient 读 cap.kv 的 depprobe.meta
 * 拿 {port, token}，再 127.0.0.1 直连（stream-desk 的 resolveService 同款）。
 * 测试钩子（yizhou/stream-desk 先例）：env DEPPROBE_SERVICE_URL + DEPPROBE_SERVICE_TOKEN
 * 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 七工具（AI 体检闭环：扫 → 读报告 → 定位 → 给修复方案）：
 *   dep_scan（同步扫完返回摘要）/ dep_report / dep_findings / dep_fix_plan
 *   dep_check_pkg（单包即时查）/ dep_runs / dep_selftest
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));
const core = require(path.join(__dirname, '..', 'shared', 'core'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

// ── stderr 日志（stdout 只走协议）───────────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[dep-probe-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.DEPPROBE_SERVICE_URL || '';
const ENV_TOKEN = process.env.DEPPROBE_SERVICE_TOKEN || '';
let svcInfo = null; // {base, token, at}

async function resolveService(force) {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (!force && svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('depprobe.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('依赖体检台服务未注册（depprobe.meta 缺失）：请先在 Polaris 打开「依赖体检台」面板拉起服务，或检查插件是否已启用');
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

// ── 渲染辅助 ────────────────────────────────────────────────────────────────
const SEV_TAG = { critical: '[严重]', high: '[高]  ', medium: '[中]  ', low: '[低]  ', unknown: '[未分级]' };

function countsLine(counts) {
  if (!counts) return '';
  return `严重 ${counts.critical || 0} / 高 ${counts.high || 0} / 中 ${counts.medium || 0} / 低 ${counts.low || 0} / 未分级 ${counts.unknown || 0}`;
}

function findingLine(f) {
  const fixed = f.fixed && f.fixed.length ? ` → 修复版本 ${f.fixed.join(' / ')}` : ' → 官方未给出修复版本';
  const alias = f.aliases && f.aliases.length ? `（${f.aliases.join(', ')}）` : '';
  const summ = f.summary ? ` — ${f.summary}` : '';
  return `${SEV_TAG[f.severity] || '[?]'} ${f.pkg}@${f.version} (${f.ecosystem}) ${f.vulnId}${alias}${summ}${fixed}`;
}

function fixPlanLine(p) {
  return `${p.pkg} (${p.ecosystem}) ${p.from} → ${p.to || '（无修复版本，建议换包/升级大版本）'}：消除 ${p.vulnIds.length} 个漏洞（最高 ${core.SEV_LABEL[p.severity] || p.severity}）`;
}

function reportSummaryText(rep) {
  const secs = Math.round(((rep.finishedAt || Date.now()) - (rep.startedAt || 0)) / 1000);
  const lines = [
    `扫描 ${rep.runId} ${rep.error ? `失败：${rep.error}` : '完成'}（${secs}s）`,
    rep.error ? '' : `范围 ${rep.repos.length} 个仓库 / ${rep.lockfileCount} 个 lockfile / ${rep.packageCount} 个包；发现 ${rep.findingCount} 条漏洞${rep.ignoredCount ? `（忽略 ${rep.ignoredCount}）` : ''}${rep.truncated ? '（发现超上限已截断展示）' : ''}`,
    rep.error ? '' : `分级：${countsLine(rep.counts)}`,
    ...(rep.warnings || []).slice(0, 5).map((w) => `注意：${w}`),
  ].filter(Boolean);
  return lines.join('\n');
}

/** 等扫描完成（轮询 /api/scan/:id），deadline 内未完成则如实报超时 */
async function waitForScan(runId, deadlineMs) {
  const deadline = Date.now() + (deadlineMs || 240_000);
  let last = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_000));
    try {
      last = await svcRequest('GET', `/api/scan/${runId}`, null, 8_000);
    } catch (e) { last = { error: e.message }; }
    if (last && (last.status === 'done' || last.status === 'error')) return last;
  }
  throw new Error(`扫描超时（${Math.round(deadlineMs / 1000)}s）：runId=${runId}，可用 dep_report 稍后取结果`);
}

async function loadReport(runId) {
  const r = runId && runId !== 'latest' ? runId : 'latest';
  const resp = await svcRequest('GET', `/api/report/${encodeURIComponent(r)}`, null, 15_000);
  return resp.report;
}

// ── 工具定义 ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'dep_scan',
    description: '对本地路径做依赖漏洞体检（同步扫完返回摘要）：递归发现 package-lock.json / pnpm-lock.yaml / Cargo.lock / requirements*.txt / go.mod，解析全部依赖版本后经 OSV.dev（Google 开源漏洞库）批量比对已知漏洞。返回按严重度分级的摘要；细节用 dep_report / dep_findings / dep_fix_plan 取。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: '要体检的目录或 lockfile 文件路径（1-10 个；目录会递归发现 lockfile，最多 4 层深）' },
      },
      required: ['paths'],
    },
    async run(args) {
      const raw = Array.isArray(args.paths) ? args.paths : [args.paths];
      const paths = raw.map((p) => String(p || '').trim()).filter(Boolean);
      if (!paths.length) throw new Error('paths 不能为空');
      const started = await svcRequest('POST', '/api/scan', { paths }, 15_000);
      const done = await waitForScan(started.runId, 240_000);
      if (done.status === 'error') return `扫描失败：${done.progress && done.progress.error || done.error || '未知错误'}`;
      const rep = done.report;
      let text = reportSummaryText(rep);
      const top = (rep.findings || []).slice(0, 10);
      if (top.length) {
        text += `\n\n最严重的发现（前 ${top.length} 条，完整列表用 dep_findings）：`;
        for (const f of top) text += `\n  ${findingLine(f)}`;
      }
      const plan = (rep.fixPlan || []).slice(0, 10);
      if (plan.length) {
        text += `\n\n最小修复方案（前 ${plan.length} 项，完整用 dep_fix_plan）：`;
        for (const p of plan) text += `\n  ${fixPlanLine(p)}`;
      }
      if (!top.length && !plan.length) text += '\n（未发现已知漏洞）';
      return text;
    },
  },
  {
    name: 'dep_report',
    description: '读取一次依赖体检的完整报告（默认最近一次）：各仓库 lockfile 与包数、漏洞分级统计、警告（解析失败/批次失败等不完整因素）。',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string', description: '可选；缺省=最近一次' } },
    },
    async run(args) {
      const rep = await loadReport(args.runId);
      let text = reportSummaryText(rep);
      for (const r of rep.repos || []) {
        text += `\n\n仓库 ${r.dir}（${r.packageCount} 包）`;
        for (const lf of r.files || []) text += `\n  ${lf.file} [${lf.ecosystem}] ${lf.count} 包`;
      }
      return text;
    },
  },
  {
    name: 'dep_findings',
    description: '列出体检报告中的漏洞发现清单，可按严重度/生态/包名过滤。每条含：包@版本、漏洞 ID、摘要、修复版本。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: '可选；缺省=最近一次' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'unknown'], description: '可选，按严重度过滤' },
        ecosystem: { type: 'string', enum: ['npm', 'crates.io', 'PyPI', 'Go'], description: '可选，按生态过滤' },
        pkg: { type: 'string', description: '可选，按包名过滤（精确）' },
        limit: { type: 'number', description: '最多返回条数（默认 40，上限 200）' },
      },
    },
    async run(args) {
      const rep = await loadReport(args.runId);
      let list = rep.findings || [];
      if (args.severity) list = list.filter((f) => f.severity === args.severity);
      if (args.ecosystem) list = list.filter((f) => f.ecosystem === args.ecosystem);
      if (args.pkg) list = list.filter((f) => f.pkg === args.pkg);
      const limit = Math.min(200, Math.max(1, Math.round(Number(args.limit) || 40)));
      if (!list.length) {
        return `（无匹配发现——${rep.findingCount ? '过滤条件过严或该维度无漏洞' : '报告本身无漏洞'}）报告：${reportSummaryText(rep)}`;
      }
      const head = `共 ${list.length} 条匹配${list.length > limit ? `，展示前 ${limit} 条` : ''}：`;
      return `${head}\n${list.slice(0, limit).map(findingLine).join('\n')}`;
    },
  },
  {
    name: 'dep_fix_plan',
    description: '给出体检报告的最小修复方案：每个有漏洞的依赖升到哪个版本能消除其全部已知漏洞（取各漏洞 fixed 版本的最大值）。含修复不了（无 fixed）的依赖清单。',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string', description: '可选；缺省=最近一次' } },
    },
    async run(args) {
      const rep = await loadReport(args.runId);
      const plan = rep.fixPlan || [];
      if (!plan.length) return `（没有可输出的修复方案——${rep.findingCount ? '漏洞均未提供修复版本' : '报告无漏洞'}）`;
      const fixable = plan.filter((p) => p.to);
      const stuck = plan.filter((p) => !p.to);
      let text = `修复 ${fixable.length} 项（升版即可消除对应漏洞）：`;
      for (const p of fixable) text += `\n  ${fixPlanLine(p)}`;
      if (stuck.length) {
        text += `\n\n暂无修复版本的 ${stuck.length} 项（关注上游/考虑替换）：`;
        for (const p of stuck) text += `\n  ${fixPlanLine(p)}`;
      }
      return text;
    },
  },
  {
    name: 'dep_check_pkg',
    description: '即时查询单个包在指定版本是否存在已知漏洞（不经扫描，直接问 OSV.dev）。适合升级前验证某个具体版本是否干净。',
    inputSchema: {
      type: 'object',
      properties: {
        ecosystem: { type: 'string', enum: ['npm', 'crates.io', 'PyPI', 'Go'], description: '包生态' },
        pkg: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本号（如 4.17.15；go 模块可带或不带 v 前缀）' },
      },
      required: ['ecosystem', 'pkg', 'version'],
    },
    async run(args) {
      const r = await svcRequest('POST', '/api/check', { ecosystem: args.ecosystem, pkg: args.pkg, version: args.version }, 60_000);
      if (!r.findings.length) return `${r.pkg}@${r.version}（${r.ecosystem}）：未发现已知漏洞。`;
      const lines = r.findings.map(findingLine);
      return `${r.pkg}@${r.version}（${r.ecosystem}）：${r.findings.length} 条已知漏洞\n${lines.join('\n')}`;
    },
  },
  {
    name: 'dep_runs',
    description: '列出依赖体检的扫描历史（最近 20 次），含时间、仓库数、包数、漏洞分级。',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const resp = await svcRequest('GET', '/api/runs', null, 10_000);
      if (!resp.runs.length) return '（暂无扫描历史）';
      return resp.runs.map((r) => {
        const t = new Date(r.startedAt).toLocaleString();
        return `${r.runId}  ${t}  ${r.repos} 仓 / ${r.packageCount} 包 / 发现 ${r.findingCount}（${countsLine(r.counts)}）${r.truncated ? ' [截断]' : ''}`;
      }).join('\n');
    },
  },
  {
    name: 'dep_selftest',
    description: '离线自检：用内置 fixture 验证五种 lockfile 解析、OSV 响应归并、忽略规则、修复方案、版本比较全管道（零网络）。',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const r = await svcRequest('POST', '/api/selftest', {}, 15_000);
      return `${r.ok ? '✅ 自检通过' : '❌ 自检失败'}\n${r.checks.join('\n')}`;
    },
  },
];

// ── JSON-RPC 骨架（stream-desk/webhook-station 同款）────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

function okResult(id, text) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
}
function errResult(id, text) {
  // MCP 规范：isError 在 result 内部（宿主据此把 content 视为错误呈现）
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
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
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `处理异常: ${e.message}`);
      if (msg && msg.id != null) send(errResult(msg.id, `内部错误：${e.message}`));
    });
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (!msg || msg.id == null) return; // 通知/未知忽略
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dep-probe', version: '0.1.0' },
      },
    });
    return;
  }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) { send(errResult(id, `未知工具：${name}`)); return; }
    try {
      const text = await tool.run(args);
      send(okResult(id, text));
    } catch (e) {
      send(errResult(id, `${e.message}（提示：服务未运行时，先在 Polaris 打开「依赖体检台」面板拉起服务）`));
    }
    return;
  }
  send({
    jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` },
  });
}

log('info', 'dep-probe MCP server 启动（stdio）');
