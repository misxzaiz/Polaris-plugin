#!/usr/bin/env node
'use strict';
/**
 * cdn-audit MCP Server —— CDN 体检台的 AI 工具层（零依赖 stdio）
 *
 * 本层不做核验本体（那是 service 的单权威），只做：参数规整 → HTTP 调 service
 * （端口经 cap.kv cda.meta 自发现，回退 manifest 9891，测试可用 CDNAUDIT_PORT 覆盖）
 * → 结果渲染成 AI 可读文本。
 *
 * 工具一览（8 个）：
 *   cda_check        资源完整性核验（URL 列表 / HTML 页面 → 每个资源与官方口径比对）
 *   cda_mirror       镜像矩阵（同一文件在各公共 CDN 的可达性 + 内容一致性）
 *   cda_sri          生成带 integrity 的外链标签（官方口径优先）
 *   cda_watch        建立传播观测（origin vs edge 内容对账，冷却期内自动轮询）
 *   cda_watch_status 观测状态与采样时间线
 *   cda_report       读取报告详情（缺省最近一次）
 *   cda_history      体检历史
 *   cda_selftest     内置试金石自检（本地夹具全链路，零外网）
 *
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'cdn-audit';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const MANIFEST_PORT = 9891;

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

let cachedPort = 0;

async function servicePort() {
  if (cachedPort) return cachedPort;
  const envPort = parseInt(process.env.CDNAUDIT_PORT || '', 10);
  if (envPort > 0) { cachedPort = envPort; return cachedPort; }
  try {
    const meta = await kv.kvGet('cda.meta');
    if (meta && typeof meta.port === 'number' && meta.port > 0) { cachedPort = meta.port; return cachedPort; }
  } catch (_) { /* kv 不可用走回退 */ }
  cachedPort = MANIFEST_PORT;
  return cachedPort;
}

function serviceRequest(method, apiPath, bodyObj, timeoutMs) {
  return servicePort().then((port) => new Promise((resolve, reject) => {
    const data = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: apiPath,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        timeout: timeoutMs || 120000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.ok === true) resolve(parsed.result !== undefined ? parsed.result : parsed);
            else reject(new Error((parsed && parsed.error) || `service 返回异常（HTTP ${res.statusCode}）`));
          } catch (_) {
            reject(new Error(`service 返回非 JSON（HTTP ${res.statusCode}）——服务可能未启动`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('service 请求超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function oneLine(s, n = 120) {
  const s2 = String(s || '').replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
}

/* ── 渲染 ─────────────────────────────────────────────────────────────────── */
const VERDICT_MARK = {
  match: '✅', 'match-origin': '✅', mismatch: '🚨', 'cdn-generated': '⚠️',
  unreachable: '🚫', unverifiable: '❔', error: '❌',
};

function renderCheckReport(rep) {
  const lines = [];
  lines.push(`核验报告 ${rep.runId}（${rep.label}）${rep.score ? ` 健康分 ${rep.score.total}/100` : ''}`);
  if (rep.summary) {
    lines.push(`资源 ${rep.summary.total}：一致 ${rep.summary.match} / 不一致 ${rep.summary.mismatch} / 不可达 ${rep.summary.unreachable} / 无法核验 ${rep.summary.unverifiable} / CDN 生成 ${rep.summary.cdnGenerated}`);
  }
  lines.push('');
  for (const r of rep.rows || []) {
    const mark = VERDICT_MARK[r.verdict] || '·';
    lines.push(`${mark} [${r.cdnLabel || r.host || '?'}] ${oneLine(r.url, 130)}`);
    if (r.note) lines.push(`   ${oneLine(r.note, 170)}`);
    if (r.sriTagSuggestion) {
      lines.push(`   SRI 建议（${r.sriTagSuggestion.source === 'official' ? '官方口径' : '基于本次抓取'}）：integrity="${r.sriTagSuggestion.integrity}"`);
    }
  }
  lines.push('');
  const SEV = { red: '❌', yellow: '⚠️', info: '·', green: '✓' };
  for (const f of rep.findings || []) {
    lines.push(`${SEV[f.sev] || '·'} ${f.title}${f.detail ? `：${oneLine(f.detail, 150)}` : ''}`);
    if (f.fix) lines.push(`   → ${oneLine(f.fix, 150)}`);
  }
  return lines.join('\n');
}

function renderMirrorReport(rep) {
  const lines = [];
  lines.push(`镜像矩阵 ${rep.runId}（${rep.label}）`);
  if (rep.summary) {
    lines.push(`可达 ${rep.summary.reachable}/${rep.summary.total}，与官方一致 ${rep.summary.match}，不一致 ${rep.summary.mismatch}`);
  }
  lines.push('');
  for (const r of rep.rows || []) {
    const mark = VERDICT_MARK[r.verdict] || '·';
    const cross = r.crossFamily ? '（跨族 cdnjs 系）' : '';
    lines.push(`${mark} ${r.label}${cross} — HTTP ${r.status || '-'} ${r.elapsedMs != null ? r.elapsedMs + 'ms' : ''} ${r.byteLength ? r.byteLength + 'B' : ''}${r.note ? ' — ' + oneLine(r.note, 110) : ''}`);
  }
  for (const n of rep.notes || []) lines.push(`· ${n}`);
  lines.push('');
  for (const f of rep.findings || []) lines.push(`${f.sev === 'red' ? '❌' : f.sev === 'yellow' ? '⚠️' : '·'} ${f.title}${f.detail ? `：${oneLine(f.detail, 150)}` : ''}`);
  return lines.join('\n');
}

/* ── 工具定义 ─────────────────────────────────────────────────────────────── */
const TOOLS = [
  {
    name: 'cda_check',
    description: 'CDN 资源完整性核验：给一组静态资源 URL（或一个网页 URL/HTML 片段），从本机网络逐个抓取，与官方发布内容（npm tarball / jsDelivr 口径 / cdnjs SRI）做哈希比对，报告是否被篡改、是否可达、SRI 属性是否正确。适用于：检查页面引用的公共库是否被 CDN 投毒、发版前审计外链、验证换源后的资源一致性。',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: '资源 URL 列表（≤40 个），如 https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' },
        htmlUrl: { type: 'string', description: '网页 URL：抓取该页面并核验其中的外部 script/link 引用' },
        html: { type: 'string', description: 'HTML 片段（与 htmlUrl 二选一）：提取其中的外链资源并核验' },
      },
    },
    run: async (args) => {
      let payload = {};
      if (Array.isArray(args.urls) && args.urls.length) payload = { mode: 'urls', urls: args.urls.slice(0, 40) };
      else if (args.htmlUrl) payload = { mode: 'html', htmlUrl: String(args.htmlUrl) };
      else if (args.html) payload = { mode: 'html', html: String(args.html) };
      else return err('需要 urls 数组、htmlUrl 或 html 之一。示例：cda_check {urls:["https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"]}');
      const r = await serviceRequest('POST', '/api/check', payload, 300000);
      return ok(renderCheckReport((r && r.report) || r));
    },
  },
  {
    name: 'cda_mirror',
    description: '镜像矩阵：对同一个 npm/cdnjs 资源，探测 jsDelivr（主域/gcore/testingcf/fastly）、unpkg、npmmirror 及 cdnjs 系镜像从本机网络的可达性与内容一致性，回答「从这台机器，哪个镜像安全可用」。输入资源 URL（推荐带版本号）。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '资源 URL，如 https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' },
        pkg: { type: 'string', description: '或直接给包名' },
        ver: { type: 'string', description: '版本号' },
        file: { type: 'string', description: '包内文件路径' },
      },
    },
    run: async (args) => {
      const payload = args.url ? { url: String(args.url) } : { pkg: args.pkg, ver: args.ver, file: args.file };
      if (!payload.url && !payload.pkg) return err('需要 url 或 pkg+ver+file');
      const r = await serviceRequest('POST', '/api/mirror', payload, 300000);
      return ok(renderMirrorReport((r && r.report) || r));
    },
  },
  {
    name: 'cda_sri',
    description: 'SRI 标签生成：对资源 URL 抓取内容并生成带 integrity（sha384，可选 sha512）与 crossorigin 的 <script>/<link> 替换标签。内容与官方一致时标注「官方口径」；不一致时明确警告切勿引用。',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: '资源 URL（带版本号的 npm 系/cdnjs 系可获得官方口径）' } },
    },
    run: async (args) => {
      if (!args.url) return err('需要 url');
      const r = await serviceRequest('POST', '/api/sri', { url: String(args.url) }, 120000);
      const rep = (r && r.report) || r;
      const t = rep.tags || {};
      const lines = [
        `资源：${oneLine((rep.rows && rep.rows[0] && rep.rows[0].url) || args.url, 140)}`,
        `口径：${rep.tagSource === 'official' ? '官方（与权威源一致）' : rep.tagSource === 'mismatch' ? '不一致（仅供取证！）' : '基于本次抓取'}`,
        `说明：${rep.tagNote || ''}`,
        '',
        `integrity 属性：${t.integrity || ''}`,
        '',
        'script 标签：',
        t.script || '',
        '',
        'link 标签：',
        t.link || '',
        '',
        `sha512 口径：${t.integrity512 || ''}`,
      ];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'cda_watch',
    description: '传播观测：对「源端 URL vs CDN 边缘 URL」建立内容对账（如 raw.githubusercontent.com/... vs cdn.jsdelivr.net/gh/...，或发版后 npm registry vs jsDelivr），按间隔轮询直到两侧哈希一致或超时。立即返回观测 id，用 cda_watch_status 查进度。',
    inputSchema: {
      type: 'object',
      properties: {
        originUrl: { type: 'string', description: '源端 URL（发布真相，如 raw.githubusercontent.com/… 或 registry.npmjs.org 的 tarball）' },
        edgeUrl: { type: 'string', description: 'CDN 边缘 URL（如 cdn.jsdelivr.net/gh/…）' },
        intervalSec: { type: 'number', description: '轮询间隔秒（默认 20，5-300）' },
        maxMinutes: { type: 'number', description: '最长观测分钟（默认 120，1-720）' },
      },
    },
    run: async (args) => {
      if (!args.originUrl || !args.edgeUrl) return err('需要 originUrl 与 edgeUrl');
      const r = await serviceRequest('POST', '/api/watch', {
        originUrl: String(args.originUrl), edgeUrl: String(args.edgeUrl),
        intervalSec: args.intervalSec, maxMinutes: args.maxMinutes,
      }, 30000);
      const w = (r && r.watch) || {};
      const lines = [
        `观测已建立：${r.id}（间隔 ${w.intervalSec}s，最长 ${args.maxMinutes || 120} 分钟）`,
        `origin：${oneLine(w.originUrl, 130)}`,
        `edge：${oneLine(w.edgeUrl, 130)}`,
        w.lastSample ? `首次采样：origin ${w.lastSample.o.status}/${w.lastSample.o.bytes}B，edge ${w.lastSample.e.status}/${w.lastSample.e.bytes}B，${w.lastSample.equal ? '已一致 ✅' : '尚未一致'}` : '首采进行中',
        '',
        '用 cda_watch_status {id} 查询进度；边缘更新后本观测会自动判「一致」并结束。',
      ];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'cda_watch_status',
    description: '查询传播观测的当前状态与最近采样时间线（哈希何时一致）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '观测 id（cda_watch 返回）' } },
    },
    run: async (args) => {
      if (!args.id) {
        const list = await serviceRequest('GET', '/api/watch_list', undefined, 15000);
        const items = (list.items || []).map((w) => `${w.id} [${w.status}] ${new Date(w.startedAt).toLocaleString()} ${oneLine(w.edgeUrl, 80)}`);
        return ok(items.length ? `全部观测：\n${items.join('\n')}` : '尚无观测。用 cda_watch 建立。');
      }
      const w = await serviceRequest('GET', `/api/watch_get?id=${encodeURIComponent(String(args.id))}`, undefined, 15000);
      const lines = [
        `观测 ${w.id} [${w.status}]`,
        `origin：${oneLine(w.originUrl, 130)}`,
        `edge：${oneLine(w.edgeUrl, 130)}`,
        `开始 ${w.startedAt}${w.finishedAt ? ` → 结束 ${w.finishedAt}` : '（进行中）'}`,
        '',
        '最近采样：',
        ...(w.samples || []).slice(-8).map((s) => `  ${s.t} origin=${s.o.status}/${s.o.bytes}B edge=${s.e.status}/${s.e.bytes}B ${s.equal ? '✅ 一致' : '×'}`),
        w.note ? `\n${w.note}` : '',
      ];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'cda_report',
    description: '读取核验/镜像/SRI 报告详情（缺省最近一次）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '报告 runId（缺省最近一次）' } },
    },
    run: async (args) => {
      let rep;
      if (args && args.id) rep = await serviceRequest('POST', '/api/report', { id: String(args.id) }, 30000);
      else {
        const h = await serviceRequest('GET', '/api/history', undefined, 15000);
        const items = h.items || [];
        if (!items.length) return err('还没有任何报告');
        rep = await serviceRequest('POST', '/api/report', { id: items[0].runId }, 30000);
      }
      if (rep.kind === 'mirror') return ok(renderMirrorReport(rep));
      if (rep.kind === 'check') return ok(renderCheckReport(rep));
      return ok(JSON.stringify(rep, null, 1).slice(0, 4000));
    },
  },
  {
    name: 'cda_history',
    description: '体检历史（最近 60 次：类型/对象/评分/结论计数）。',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const h = await serviceRequest('GET', '/api/history', undefined, 15000);
      const items = (h.items || []).map((x) => `${new Date(x.at).toLocaleString()} [${x.kind}] ${x.label} — ${x.score != null ? x.score + ' 分' : ''}${x.counts ? ` 红${x.counts.red}/黄${x.counts.yellow}/绿${x.counts.green}` : ''}`);
      return ok(items.length ? `最近 ${items.length} 次体检：\n${items.join('\n')}` : '尚无体检记录。');
    },
  },
  {
    name: 'cda_selftest',
    description: '内置试金石自检：本地夹具服务 + 注入权威哈希，全链路验证核验管线（一致/篡改/现场生成/SRI 错值/围栏拒绝），零外网。服务疑似异常时先跑这个。',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const r = await serviceRequest('POST', '/api/selftest', {}, 60000);
      const lines = [`自检 ${r.ok ? '全绿 ✅' : '存在失败 ❌'}`];
      for (const it of r.items || []) lines.push(`  ${it.ok ? '✓' : '✗'} ${it.name}${it.ok ? '' : ' — ' + oneLine(it.detail, 160)}`);
      return ok(lines.join('\n'));
    },
  },
];

/* ── JSON-RPC stdio 主循环 ─────────────────────────────────────────────────── */
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    handleMessage(line).catch((e) => log('error', `消息处理异常：${e && e.stack}`));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    respond(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    respond(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    return;
  }
  if (method === 'tools/call') {
    const t = TOOLS.find((x) => x.name === (params && params.name));
    if (!t) {
      respond(id, { content: [{ type: 'text', text: `未知工具：${params && params.name}` }], isError: true });
      return;
    }
    try {
      const result = await t.run((params && params.arguments) || {});
      respond(id, result);
    } catch (e) {
      respond(id, err(`工具执行失败：${String((e && e.message) || e)}`));
    }
    return;
  }
  if (method === 'ping') { respond(id, {}); return; }
  if (id !== undefined) respond(id, { error: { code: -32601, message: `未知方法：${method}` } });
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

log('info', `cdn-audit MCP server 就绪（pid ${process.pid}）`);
