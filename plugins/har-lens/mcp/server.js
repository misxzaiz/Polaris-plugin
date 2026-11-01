#!/usr/bin/env node
'use strict';
/**
 * server.js —— HAR 分析台 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层：把 tools/call 翻译成对 har.* 投影的读取与命令信箱操作。
 *   - har_overview / har_requests / har_audit：直读 cap.kv 投影（har.report / har.rows.* / har.audit）
 *   - har_open / har_entry / har_sanitize / har_compare / har_selftest：写单槽命令键 har.cmd
 *     （服务消费，先删后做 + nonce 防重放；回执 har.result）
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 * 安全说明：所有投影与详情均已脱敏（kv 无明文密钥）；har_sanitize 是唯一写文件
 * 的工具（默认源文件同目录 *.sanitized.har，覆盖需 overwrite:true）。
 */
const crypto = require('crypto');
const { createKvClient } = require('../service/kvclient');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[har-lens:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 数据读取 ───────────────────────────────────────────────────────────────
async function readMeta() {
  const v = await kv.kvGet('har.meta').catch(() => null);
  return v && typeof v === 'object' && v.lastTickAt ? v : null;
}
async function readReport() {
  const v = await kv.kvGet('har.report').catch(() => null);
  return v && typeof v === 'object' && typeof v.entryCount === 'number' ? v : null;
}
async function readRows() {
  const idx = await kv.kvGet('har.rows.idx').catch(() => null);
  const chunkCount = idx && Number.isInteger(idx.chunkCount) ? idx.chunkCount : 0;
  const rows = [];
  for (let i = 0; i < chunkCount; i++) {
    // eslint-disable-next-line no-await-in-loop
    const chunk = await kv.kvGet(`har.rows.${i}`).catch(() => null);
    if (Array.isArray(chunk)) rows.push(...chunk);
  }
  return rows;
}
/** 写单槽命令键 → 轮询结果键（open 大文件服务侧解析可达数秒；轮询 60s） */
async function sendCommand(op, payload, timeoutMs) {
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  await kv.kvSet('har.cmd', { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + (timeoutMs || 60000);
  while (Date.now() < deadline) {
    const r = await kv.kvGet('har.result').catch(() => null);
    if (r && typeof r === 'object' && r.nonce === nonce) {
      await kv.kvDel('har.result').catch(() => {});
      return r;
    }
    await new Promise((res) => setTimeout(res, 700));
  }
  return { ok: false, error: '服务未在时限内响应（可能未运行：到 设置→插件→HAR 分析台 查看服务状态）' };
}

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : `${(n / 1024).toFixed(1)}KB`);

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolOpen(args) {
  const p = args && args.path;
  if (!p || typeof p !== 'string') return { text: '缺少 path（.har 文件的绝对路径）', isError: true };
  const r = await sendCommand('open', { path: p }, 60000);
  if (!r.ok) return { text: `打开失败: ${r.error || '未知'}`, isError: true };
  const lines = [
    `已打开: ${r.path}（${kb(r.fileBytes)}）`,
    r.summary || '',
    r.errorCount ? `其中错误请求 ${r.errorCount} 条——可用 har_requests filter=errors 查看。` : '',
    r.warnings && r.warnings.length ? `警告: ${r.warnings.join('；')}` : '',
    `下一步: har_audit 查敏感信息；har_sanitize 生成可分享的脱敏版；har_requests 看清单；har_entry 看单条详情。`,
  ].filter(Boolean);
  return { text: lines.join('\n') };
}

async function toolOverview() {
  const meta = await readMeta();
  if (!meta) return { text: 'HAR 分析台服务未上线（没有心跳）。请到 设置→插件→HAR 分析台 查看服务状态。', isError: true };
  if (!meta.activePath) return { text: `服务在线（${meta.state}${meta.error ? `：${meta.error}` : ''}），但尚未打开 HAR。用 har_open 传 .har 文件绝对路径。` };
  const rep = await readReport();
  if (!rep) return { text: '概览未就绪（服务可能刚重启，请重新 har_open）。', isError: true };
  const age = Math.round((Date.now() - (meta.lastTickAt || 0)) / 1000);
  const st = rep.statusCounts || {};
  const lines = [
    `文件: ${rep.path}（${kb(rep.fileBytes || 0)}，打开于 ${new Date(rep.openedAt || Date.now()).toISOString().slice(0, 19)}）`,
    `概览: ${rep.entryCount} 条请求 · 跨度 ${(rep.spanMs / 1000).toFixed(2)}s · 传输 ${kb(rep.transferBytes || 0)} · 导出器 ${rep.creator || '?'}`,
    `状态: 2xx ${st['2xx'] || 0} / 3xx ${st['3xx'] || 0} / 4xx ${st['4xx'] || 0} / 5xx ${st['5xx'] || 0} / 中断 ${st['0/abort'] || 0}`,
    `时延: p50 ${rep.times && rep.times.p50}ms · p95 ${rep.times && rep.times.p95}ms · max ${rep.times && rep.times.max}ms · 平均 ${rep.times && rep.times.avg}ms`,
    `时相合计: blocked ${(rep.phaseTotalsMs || [])[0] || 0}ms · dns ${(rep.phaseTotalsMs || [])[1] || 0}ms · connect ${(rep.phaseTotalsMs || [])[2] || 0}ms · wait ${(rep.phaseTotalsMs || [])[5] || 0}ms · receive ${(rep.phaseTotalsMs || [])[6] || 0}ms`,
    `域: ${(rep.domains || []).slice(0, 5).map((d) => `${d.h}(${d.n}条/${kb(d.bytes)})`).join(', ')}`,
  ];
  if (rep.errors && rep.errors.length) {
    lines.push(`错误 TOP（共 ${rep.errorCount}）:`);
    for (const e of rep.errors.slice(0, 8)) lines.push(`  [${e.s}] ${e.m} ${oneLine(e.u, 110)} ${e.t}ms`);
  }
  if (rep.slowTop && rep.slowTop.length) {
    lines.push(`最慢请求:`);
    for (const e of rep.slowTop.slice(0, 5)) lines.push(`  ${e.t}ms [${e.s}] ${e.m} ${oneLine(e.u, 100)}`);
  }
  if (rep.dupUncached && rep.dupUncached.length) {
    lines.push(`疑似无缓存重复: ${(rep.dupUncached || []).slice(0, 3).map((g) => `${g.key} ×${g.count}`).join('；')}`);
  }
  const au = rep.auditHigh;
  if (au && au.total >= 0) lines.push(`敏感审计速览: ${au.total} 处命中（高危 ${au.high}）——详见 har_audit`);
  lines.push(`(服务心跳 ${age <= 90 ? `${age} 秒前` : `${Math.round(age / 60)} 分钟前`})`);
  return { text: lines.join('\n') };
}

async function toolRequests(args) {
  const rep = await readReport();
  if (!rep) return { text: '尚未打开 HAR（先 har_open）。', isError: true };
  const filter = String((args && args.filter) || 'all');
  const q = String((args && args.q) || '').toLowerCase();
  const limit = Math.min(50, Math.max(1, Number((args && args.limit)) || 15));
  let list;
  let label;
  if (filter === 'errors') { list = rep.errors || []; label = '错误请求'; }
  else if (filter === 'slow') { list = rep.slowTop || []; label = '最慢请求'; }
  else if (filter === 'large') { list = rep.largeTop || []; label = '最大响应'; }
  else if (filter === 'dup') {
    const groups = rep.dupUncached || [];
    const text = groups.map((g) => `${g.key} ×${g.count}（合计 ${g.timeSumMs}ms，状态 ${g.statuses.join('/')}）`).join('\n') || '（无重复组）';
    return { text: `疑似无缓存重复请求（同方法+URL 且无 304/缓存证据，按 count×耗时 排序）：\n${text}\n\n提示: 这类重复往往是重复渲染/未做请求合并的信号。` };
  } else {
    const rows = await readRows();
    list = rows;
    label = '全部请求（按打开顺序）';
  }
  let items = list;
  if (q) items = items.filter((r) => (`${r.m} ${r.u}`).toLowerCase().includes(q));
  if (filter === 'all') items = [...items].sort((a, b) => a.i - b.i);
  items = items.slice(0, limit);
  const head = `共 ${list.length} 条（${label}${q ? `，按「${q}」过滤后 ${items.length}` : ''}）：`;
  const lines = items.map((r) => `  #${r.i} [${r.s}] ${r.m} ${oneLine(r.u, 120)}  ${r.t}ms ${kb(r.sz)}${r.flags ? `  ${r.flags}` : ''}`);
  return { text: `${head}\n${lines.join('\n') || '（无匹配）'}\n\n看单条详情（头/时相/体预览，已脱敏）用 har_entry 传 index。` };
}

async function toolEntry(args) {
  const idx = Number(args && args.index);
  if (!Number.isInteger(idx) || idx < 0) return { text: '缺少 index（0 起，来自 har_requests 行首 #N）', isError: true };
  const r = await sendCommand('entry', { index: idx }, 20000);
  if (!r.ok) return { text: `取详情失败: ${r.error || '未知'}`, isError: true };
  const e = r.entry;
  const lines = [
    `#${e.i} ${e.method} ${e.url}`,
    `状态: ${e.status} ${e.statusText} · ${e.httpVersion} · 服务端 ${e.serverIp || '?'} · 开始 ${e.startedAt}`,
    `耗时 ${e.time}ms → blocked:${e.timings.blocked} dns:${e.timings.dns} connect:${e.timings.connect} ssl:${e.timings.ssl} send:${e.timings.send} wait:${e.timings.wait} receive:${e.timings.receive}（-1=不适用；wait 大=服务端慢，receive 大=下载慢）`,
    e.query && e.query.length ? `Query: ${e.query.map(([k, v]) => `${k}=${oneLine(v, 40)}`).join('&').slice(0, 300)}` : '',
    `请求头:`,
    ...e.reqHeaders.slice(0, 15).map(([n, v]) => `  ${n}: ${oneLine(v, 90)}`),
    `响应头:`,
    ...e.resHeaders.slice(0, 15).map(([n, v]) => `  ${n}: ${oneLine(v, 90)}`),
    e.reqBody && e.reqBody.text ? `请求体预览（已脱敏）: ${oneLine(e.reqBody.text, 400)}` : '',
    e.resBody && e.resBody.text ? `响应体预览（已脱敏）: ${oneLine(e.resBody.text, 600)}` : '',
    e.cache ? `缓存: ${e.cache}` : '',
  ].filter(Boolean);
  return { text: lines.join('\n') };
}

async function toolAudit() {
  const a = await kv.kvGet('har.audit').catch(() => null);
  if (!a || typeof a !== 'object' || !Array.isArray(a.findings)) return { text: '审计报告未就绪（先 har_open 打开 HAR）。', isError: true };
  if (!a.findings.length) return { text: `审计完成：${a.scannedEntries} 条请求中未发现敏感信息命中。仍建议对外分享前用 har_sanitize 做一次全量脱敏（审计只覆盖已知特征）。` };
  const lines = [
    `审计: ${a.scannedEntries} 条请求，命中 ${a.total} 处（高危 ${a.highCount}）：`,
    ...a.findings.map((f) => `  [${f.sev === 'high' ? '高危' : '中危'}] ${f.label}：${f.count} 处 / ${f.entryCount} 条请求（如 #${f.idx.slice(0, 8).join(' #')}${f.idx.length > 8 ? '…' : ''}）`),
    ``,
    `样例（已脱敏）:`,
    ...a.findings.slice(0, 4).flatMap((f) => f.samples.slice(0, 2).map((s) => `  #${s.i} ${s.where}: ${oneLine(s.masked, 100)}`)),
    ``,
    `建议: 对外分享前跑 har_sanitize 生成脱敏版（默认六类全开，输出源文件同目录 *.sanitized.har）。`,
  ];
  return { text: lines.join('\n') };
}

async function toolSanitize(args) {
  const meta = await readMeta();
  if (!meta || !meta.activePath) return { text: '尚未打开 HAR（先 har_open）。', isError: true };
  const payload = {};
  if (args && args.outputPath) payload.outputPath = String(args.outputPath);
  if (args && args.confirm === true) payload.confirm = true;
  if (args && args.overwrite === true) payload.overwrite = true;
  const r = await sendCommand('sanitize', payload, 60000);
  if (!r.ok) return { text: `脱敏导出失败: ${r.error || '未知'}`, isError: true };
  if (r.preview) {
    const o = r.options || {};
    return {
      text: [
        `脱敏预检（未写盘）：`,
        `  输出到: ${r.outputPath}${r.overwrite ? '（⚠ 目标已存在，确认覆盖需 confirm:true + overwrite:true）' : ''}`,
        `  开关: 鉴权头:${o.authHeaders ? '清' : '留'} Cookie:${o.cookies ? '清' : '留'} Set-Cookie:${o.setCookies ? '清' : '留'} 敏感query:${o.querySecrets ? '清' : '留'} 体内容:${o.bodies ? '清' : '留'} URL凭据:${o.urlCredentials ? '清' : '留'}`,
        r.hint || '',
      ].join('\n'),
    };
  }
  const st = r.stats || {};
  const lines = [
    `已导出脱敏 HAR: ${r.outputPath}`,
    `大小 ${kb(r.bytes || 0)} · sha256 ${r.sha256}`,
    `脱敏统计: ${Object.entries(st).map(([k, n]) => `${k}:${n}`).join(', ') || '无命中'}`,
    r.recheck ? `复核: 结构${r.recheck.valid ? '合法' : '异常(!)'} · 复核审计剩余 ${r.recheck.auditTotal} 处（高危 ${r.recheck.auditHigh}）` : '',
    `提示: 该文件仍含 URL 与请求元数据（主机名/路径），分享前请确认这些不构成敏感信息。`,
  ].filter(Boolean);
  return { text: lines.join('\n') };
}

async function toolCompare(args) {
  const meta = await readMeta();
  if (!meta || !meta.activePath) return { text: '尚未打开基准 HAR（先 har_open），再 har_compare 传第二个文件。', isError: true };
  const p = args && args.path;
  if (!p || typeof p !== 'string') return { text: '缺少 path（对比 HAR 文件路径）', isError: true };
  const r = await sendCommand('compare', { path: p }, 60000);
  if (!r.ok) return { text: `对比失败: ${r.error || '未知'}`, isError: true };
  const s = r.summary;
  const lines = [
    `对比完成: 基准 ${s.baseCount} 条 vs 对比件 ${s.candCount} 条`,
    `匹配 ${s.matched} · 新增 ${s.added} · 消失 ${s.removed} · 变化 ${s.changed}（状态翻转 ${s.flips}）`,
    `变慢 ${s.slowerCount} · 变快 ${s.fasterCount} · 请求总耗时 ${s.baseTimeSum}ms → ${s.candTimeSum}ms（${s.candTimeSum >= s.baseTimeSum ? '+' : ''}${s.candTimeSum - s.baseTimeSum}ms）`,
  ];
  const d = await kv.kvGet('har.diff').catch(() => null);
  if (d) {
    if (d.slower && d.slower.length) {
      lines.push('变慢 TOP:');
      for (const c of d.slower.slice(0, 8)) lines.push(`  +${c.dt}ms [${c.s1}→${c.s2}] ${c.m} ${oneLine(c.u, 90)}`);
    }
    if (d.flips && d.flips.length) {
      lines.push('状态翻转:');
      for (const c of d.flips.slice(0, 8)) lines.push(`  ${c.s1}→${c.s2} ${c.m} ${oneLine(c.u, 90)}`);
    }
    if (d.added && d.added.length) {
      lines.push(`新增（前 5）: ${d.added.slice(0, 5).map((a) => `[${a.s}] ${oneLine(a.u, 60)}`).join('；')}`);
    }
    if (d.removed && d.removed.length) {
      lines.push(`消失（前 5）: ${d.removed.slice(0, 5).map((a) => `[${a.s}] ${oneLine(a.u, 60)}`).join('；')}`);
    }
  }
  return { text: lines.join('\n') };
}

async function toolSelftest() {
  const r = await sendCommand('selftest', {}, 45000);
  if (!r.ok || !r.report) return { text: `自检失败: ${r.error || '未知'}`, isError: true };
  const rep = r.report;
  const lines = [
    `自检 ${rep.passed}/${rep.total} ${rep.allGreen ? '✅ 全绿' : '❌ 有失败'}（${rep.durationMs}ms）`,
    ...rep.checks.map((c) => `  ${c.pass ? '✅' : '❌'} ${c.item}${c.pass ? '' : ` —— ${c.detail}`}`),
  ];
  return { text: lines.join('\n'), isError: !rep.allGreen };
}

const TOOLS = [
  {
    name: 'har_open',
    description: '打开本地 .har 文件（浏览器 DevTools Network 面板导出的抓包）并完成解析分析，返回概览摘要。适用：「帮我分析这个 HAR」「看看 trace.har 为什么慢」。文件不出本机；上限 150MB。',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '.har 文件绝对路径（.json 扩展名的 HAR 也可以）' } }, required: ['path'] },
    run: toolOpen,
  },
  {
    name: 'har_overview',
    description: '查看当前打开 HAR 的全景概览：条目数/时间跨度/传输量/状态分布/p50-p95 时延/时相合计（DNS·连接·等待·下载）/TOP 域/错误 TOP/最慢请求/疑似无缓存重复/敏感审计速览。适用：「这个 HAR 整体怎么样」「哪里最慢」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolOverview,
  },
  {
    name: 'har_requests',
    description: '列出当前 HAR 的请求清单（已脱敏）：filter=all 全部（按打开顺序）/errors 错误/slow 最慢/large 最大响应/dup 疑似无缓存重复；q 关键词过滤；limit 条数（默认 15，最多 50）。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'errors', 'slow', 'large', 'dup'], description: '清单类型（默认 all）' },
        q: { type: 'string', description: '关键词（匹配方法/URL）' },
        limit: { type: 'number', description: '条数（默认 15，最多 50）' },
      },
    },
    run: toolRequests,
  },
  {
    name: 'har_entry',
    description: '查看单条请求详情：完整 URL/状态/服务端 IP/七段时相分解/请求与响应头（敏感值已掩码）/query/请求与响应体预览（已脱敏）。适用：「#12 这条请求具体怎么回事」「它的等待时间为什么这么长」。',
    inputSchema: { type: 'object', properties: { index: { type: 'number', description: '条目索引（har_requests 行首 #N）' } }, required: ['index'] },
    run: toolEntry,
  },
  {
    name: 'har_audit',
    description: '对当前 HAR 做敏感信息审计：鉴权头/Cookie/Set-Cookie/URL 敏感参数/URL 内嵌凭据/云厂商密钥特征（AKIA、sk-、ghp_、xox、AIza）/私钥块/JWT/数据库连接串。返回分类计数、命中条目与脱敏样例。适用：「这个 HAR 里有敏感信息吗」「能不能直接发给别人」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolAudit,
  },
  {
    name: 'har_sanitize',
    description: '生成脱敏版 HAR 并写盘（默认源文件同目录 <name>.sanitized.har）：鉴权头置掩码/清 Cookie/清 Set-Cookie/清敏感 query/体内容整体替换占位/清 URL 内嵌凭据（六开关默认全开）。先不带 confirm 预检，确认后 confirm:true 落盘；覆盖已存在文件须 overwrite:true。返回 sha256 与复核审计。适用：「把这个 HAR 脱敏后发支持」「生成安全分享版」。',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: '可选，输出 .har 路径（默认源文件同目录 *.sanitized.har）' },
        confirm: { type: 'boolean', description: '确认写盘（先省略做预检）' },
        overwrite: { type: 'boolean', description: '覆盖已存在文件' },
      },
    },
    run: toolSanitize,
  },
  {
    name: 'har_compare',
    description: '用当前打开的 HAR 作基准，与第二个 HAR 对比：新增/消失请求、状态翻转、变慢/变快 TOP（按 URL 精确匹配优先、去 query 后同路径兜底）。适用：「优化前后对比」「这次发布有没有引入新请求/回归」。',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '对比 .har 文件路径' } }, required: ['path'] },
    run: toolCompare,
  },
  {
    name: 'har_selftest',
    description: '运行内置试金石自检：内存合成 fixture HAR 走 解析→分析→审计→脱敏→对比→详情 全链路逐项断言（零网络、不碰真实文件）。适用：「HAR 分析台还好吗」「自检一下」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolSelftest,
  },
];

// ── stdio JSON-RPC 主循环 ───────────────────────────────────────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; });
process.stdin.on('end', () => process.exit(0));

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  };
  const replyErr = (code, message) => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
  };
  try {
    if (method === 'initialize') {
      reply({ protocolVersion: (params && params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'har-lens', version: VERSION } });
      return;
    }
    if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return;
    if (method === 'tools/list') {
      reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
      return;
    }
    if (method === 'tools/call') {
      const name = params && params.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) { replyErr(-32602, `未知工具 ${name}`); return; }
      const out = await tool.run((params && params.arguments) || {});
      const content = [{ type: 'text', text: out.text }];
      reply(out.isError ? { isError: true, content } : { content });
      return;
    }
    if (method === 'ping') { reply({}); return; }
    replyErr(-32601, `未知方法 ${method}`);
  } catch (e) {
    slog(`处理异常: ${e.message}`);
    replyErr(-32603, e.message);
  }
}

// 逐行解析 JSON-RPC（LSP 式 Content-Length 与裸行 JSON 均兼容）
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  if (t.startsWith('Content-')) return;
  let msg;
  try { msg = JSON.parse(t); } catch (_) { slog(`非 JSON 行忽略: ${oneLine(t, 60)}`); return; }
  void handle(msg);
});
rl.on('close', () => process.exit(0));

slog(`har-lens MCP server v${VERSION} 就绪（stdio；appConfigDir=${APP_CONFIG_DIR || '(未注入)'})`);
