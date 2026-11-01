#!/usr/bin/env node
'use strict';
/**
 * server.js —— 日志透视台 MCP server（stdio JSON-RPC 2.0，零依赖）
 *
 * AI 取证层：六个只读工具，全部经本机服务 HTTP（127.0.0.1，单一读路径权威）
 * 读取。服务未运行时返回明确引导信息，不猜测不兜底。
 *
 * 端口发现：env LOGLENS_PORT（测试钩子）→ cap.kv lls.meta.port → manifest 9870。
 * 协议数据只走 stdout；日志走 stderr。
 * 注意：日志内容可能含密钥/PII——工具描述已提示 AI 摘要时对敏感字段脱敏。
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = core.VERSION;
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[log-lens:mcp] ${msg}\n`); }
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 服务客户端（本机直连，零跨域）───────────────────────────────────────────
let portResolved = null;
async function resolvePort() {
  if (process.env.LOGLENS_PORT) return parseInt(process.env.LOGLENS_PORT, 10); // 测试钩子
  if (portResolved) return portResolved;
  try {
    const meta = await kv.kvGet('lls.meta');
    if (meta && Number(meta.port) > 0) {
      portResolved = Number(meta.port);
      return portResolved;
    }
  } catch (_) { /* bridge 不可用，走回退 */ }
  return core.MANIFEST_PORT;
}

function svcGet(pathname, params, timeoutMs) {
  return resolvePort().then((port) => new Promise((resolve, reject) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const qsText = qs.toString();
    const req = http.get({
      hostname: '127.0.0.1', port,
      path: `${pathname}${qsText ? `?${qsText}` : ''}`,
      timeout: timeoutMs || 15000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (_) {
          reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('服务响应超时')); });
    req.on('error', reject);
  }));
}

/** 统一调用包装：服务离线 → 引导信息；ok:false → 错误透传 */
async function callSvc(pathname, params, timeoutMs) {
  try {
    const r = await svcGet(pathname, params, timeoutMs);
    if (r && r.ok === false) throw new Error(r.error || '服务返回失败');
    return r;
  } catch (e) {
    if (e.code === 'ECONNREFUSED' || /ECONNREFUSED|socket hang up/.test(String(e.message))) {
      throw new Error('日志透视台服务未运行。请到 设置→插件→日志透视台 检查服务状态（autoStart 开启时宿主启动会自动拉起）。');
    }
    throw e;
  }
}

const SENSITIVE_NOTE = '\n（提示：日志可能含密钥/PII，向用户摘要时对 token/key/password 等字段脱敏）';

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolOverview() {
  const r = await callSvc('/api/sources');
  const files = r.files || [];
  if (!files.length) {
    return { text: `服务正常（v${r.version || VERSION}），但数据根${r.dataRoot ? ` ${r.dataRoot}` : ''}下没有发现日志文件。可在面板「设置」里添加其他日志目录/文件。` };
  }
  const top = files.slice(0, 12);
  const lines = [
    `日志透视台服务正常（v${r.version || VERSION}），数据根: ${r.dataRoot || '未找到'}`,
    `发现日志文件 ${files.length} 个（按修改时间倒序，前 ${top.length} 个）:`,
    ...top.map((f) => `  - ${f.path}  ${core.formatBytes(f.size)}  ${core.formatTs(f.mtimeMs)}  [${f.source}]`),
    files.length > top.length ? `  …其余 ${files.length - top.length} 个略（用 log_files 工具或面板查看全部）` : '',
    '下一步：log_tail 看最新内容 / log_stats 透视错误分布 / log_errors 取证最近报错。',
  ].filter(Boolean);
  return { text: lines.join('\n') };
}

async function toolTail(args) {
  const file = String((args && args.file) || '').trim();
  if (!file) return { text: '缺少 file 参数（先 log_overview 拿文件清单）', isError: true };
  const r = await callSvc('/api/tail', {
    file,
    maxLines: Math.min(Math.max(parseInt(args && args.maxLines, 10) || 40, 1), 200),
    levels: args && args.levels ? args.levels.join(',') : '',
    q: args && args.q,
  }, 20000);
  if (!r.entries || !r.entries.length) {
    return { text: `文件末尾没有匹配的行（levels=${(args && args.levels) || '全部'} q=${(args && args.q) || '-'}）。` };
  }
  const lines = [
    `${core.baseName(file)} 末尾 ${r.entries.length} 行（格式 ${r.format}/${r.encoding}，文件 ${core.formatBytes(r.fileSize)}）:`,
    ...r.entries.map((e) => `  ${core.summarizeEntry(e, 200)}`),
    r.hasMore ? '  （窗口截断：还有更早的匹配行，可减小 maxLines 或加过滤条件）' : '',
  ];
  return { text: lines.filter(Boolean).join('\n') + SENSITIVE_NOTE };
}

async function toolSearch(args) {
  const q = String((args && args.q) || '').trim();
  const regex = args && args.regex ? String(args.regex) : '';
  const files = Array.isArray(args && args.files) ? args.files.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!q && !regex) return { text: '缺少搜索条件：给 q（关键词）或 regex（正则）', isError: true };
  if (!files.length) {
    const src = await callSvc('/api/sources');
    if (!src.files || !src.files.length) return { text: '没有可搜索的日志文件（数据根与用户源都是空）。', isError: true };
    files.push(...src.files.slice(0, 5).map((f) => f.path));
  }
  const capped = files.slice(0, 10);
  const r = await callSvc('/api/search', {
    files: capped.join('|'),
    q, regex,
    levels: args && args.levels ? args.levels.join(',') : '',
    limitPerFile: Math.min(Math.max(parseInt(args && args.limit, 10) || 15, 1), 50),
  }, 30000);
  const out = [`搜索 "${regex || q}" 命中 ${r.totalMatches} 行（扫描 ${capped.length} 个文件）:`];
  for (const res of r.results || []) {
    out.push(`◆ ${core.baseName(res.file)}${res.truncated ? '（截断：仅前部分匹配）' : ''}${res.error ? `（错误: ${res.error}）` : ''}`);
    for (const e of (res.matches || []).slice(0, 15)) out.push(`  ${core.summarizeEntry(e, 200)}`);
  }
  out.push('要看某条上下文用 log_context 传该行的 offset。');
  return { text: out.join('\n') + SENSITIVE_NOTE };
}

async function toolStats(args) {
  const file = String((args && args.file) || '').trim();
  if (!file) return { text: '缺少 file 参数（先 log_overview 拿文件清单）', isError: true };
  const r = await callSvc('/api/stats', { file }, 120000);
  const lv = r.levels || {};
  const total = r.totalEntries || 0;
  const lines = [
    `${core.baseName(file)} 透视（格式 ${r.format}/${r.encoding}，共 ${total} 条${r.approximate ? '，大文件采样近似' : ''}）:`,
    `  级别: TRACE=${lv.TRACE || 0} DEBUG=${lv.DEBUG || 0} INFO=${lv.INFO || 0} WARN=${lv.WARN || 0} ERROR=${lv.ERROR || 0} FATAL=${lv.FATAL || 0}${lv.unknown ? ` 未识别=${lv.unknown}` : ''}`,
    `  时间跨度: ${core.formatTs(r.firstTs)} ~ ${core.formatTs(r.lastTs)}`,
  ];
  if (r.hourly && r.hourly.length) {
    const worst = r.hourly.filter((h) => h.problems > 0).sort((a, b) => b.problems - a.problems).slice(0, 5);
    if (worst.length) {
      lines.push('  问题高发时段（WARN+ERROR+FATAL 最多）:');
      for (const h of worst) lines.push(`    ${core.formatTs(h.hour).slice(0, 13)}时  问题 ${h.problems}/${h.total}`);
    }
  }
  if (r.clusters && r.clusters.length) {
    lines.push(`  错误聚类 Top ${r.clusters.length}（同类报错已归并，共 ${r.distinctClusters} 类）:`);
    for (const c of r.clusters) {
      lines.push(`    ×${c.count} [${c.level}] ${core.oneLine(c.sample, 160)}`);
    }
  } else {
    lines.push('  无 WARN/ERROR/FATAL 记录。');
  }
  return { text: lines.join('\n') + SENSITIVE_NOTE };
}

async function toolErrors(args) {
  const file = String((args && args.file) || '').trim();
  if (!file) return { text: '缺少 file 参数（先 log_overview 拿文件清单）', isError: true };
  const r = await callSvc('/api/tail', {
    file,
    maxLines: Math.min(Math.max(parseInt(args && args.maxLines, 10) || 100, 10), 500),
    levels: 'WARN,ERROR,FATAL',
  }, 30000);
  if (!r.entries || !r.entries.length) {
    return { text: `${core.baseName(file)} 末尾窗口内没有 WARN/ERROR/FATAL 记录（窗口=文件末尾 4MB）。` };
  }
  // 就地聚类（MCP 侧轻量归并，口径与 analyze 一致）
  const { normalizeMessage } = require('../service/analyze');
  const groups = new Map();
  for (const e of r.entries) {
    const key = `${e.level}|${normalizeMessage(e.message)}`;
    let g = groups.get(key);
    if (!g) { g = { level: e.level, count: 0, sample: e, first: e.ts, last: e.ts, lastOffset: e.offset }; groups.set(key, g); }
    g.count++;
    if (e.ts && (!g.last || e.ts > g.last)) { g.last = e.ts; g.sample = e; g.lastOffset = e.offset; }
    if (e.ts && (!g.first || e.ts < g.first)) g.first = e.ts;
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
  const out = [
    `${core.baseName(file)} 末尾窗口内问题行 ${r.entries.length} 条，归并为 ${sorted.length} 类:`,
    ...sorted.slice(0, 15).map((g) => `  ×${g.count} [${g.level}] 最近 ${core.formatTs(g.last)}  offset=${g.lastOffset}\n      ${core.oneLine(g.sample.message, 200)}`),
    '  要看某类完整现场用 log_context 传 offset。',
  ];
  return { text: out.join('\n') + SENSITIVE_NOTE };
}

async function toolContext(args) {
  const file = String((args && args.file) || '').trim();
  const offset = parseInt(args && args.offset, 10);
  if (!file || !Number.isFinite(offset)) {
    return { text: '需要 file 与 offset（来自 log_search / log_errors 的行）', isError: true };
  }
  const r = await callSvc('/api/context', {
    file, offset,
    before: Math.min(Math.max(parseInt(args && args.before, 10) || 10, 0), 50),
    after: Math.min(Math.max(parseInt(args && args.after, 10) || 10, 0), 50),
  }, 20000);
  const out = [`上下文窗口（${r.entries.length} 行，锚点 offset=${offset}）:`];
  for (const e of r.entries) {
    const mark = e.offset === offset ? ' ▶' : '  ';
    out.push(`${mark} ${core.summarizeEntry(e, 240)}`);
    // 多行消息（span/栈）缩进展开
    if (e.message.includes('\n')) {
      for (const l of e.message.split('\n').slice(1, 12)) out.push(`        ${core.oneLine(l, 240)}`);
    }
  }
  return { text: out.join('\n') + SENSITIVE_NOTE };
}

// ── 工具声明（description 写「适用句式」，AI 靠它匹配意图）─────────────────
const TOOLS = [
  {
    name: 'log_overview',
    description: '查看「日志透视台」服务状态与本机日志文件清单（数据根自动发现 + 用户添加源，含大小与修改时间）。适用：「日志在哪」「今天有哪些日志」「有没有报错的日志文件」。返回文件路径供其他 log_* 工具使用。',
    inputSchema: { type: 'object', properties: {} },
    run: toolOverview,
  },
  {
    name: 'log_tail',
    description: '看某个日志文件的最后 N 行（可按级别/关键词过滤），流式反读不整载大文件。适用：「看最新日志」「服务启动了吗」「最后几行报了什么」。file 来自 log_overview。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '日志文件绝对路径' },
        maxLines: { type: 'number', description: '行数（默认 40，最多 200）' },
        levels: { type: 'array', items: { type: 'string' }, description: '可选级别过滤，如 ["ERROR","WARN"]' },
        q: { type: 'string', description: '可选关键词过滤' },
      },
      required: ['file'],
    },
    run: toolTail,
  },
  {
    name: 'log_search',
    description: '跨日志文件搜索关键词/正则（大小写不敏感，可按级别过滤）。适用：「找出所有 timeout」「搜 connection refused」「哪里出现了 500」。返回匹配行与 offset（供 log_context 追上下文）。',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '关键词（子串）' },
        regex: { type: 'string', description: '正则（与 q 二选一或并用）' },
        files: { type: 'array', items: { type: 'string' }, description: '可选，限定文件（默认自动取最近 5 个）' },
        levels: { type: 'array', items: { type: 'string' }, description: '可选级别过滤' },
        limit: { type: 'number', description: '每文件返回条数（默认 15，最多 50）' },
      },
    },
    run: toolSearch,
  },
  {
    name: 'log_stats',
    description: '全文件透视：级别直方图 + 问题高发时段 + 错误聚类 Top N（数字/UUID/IP/路径归一化，同类报错归并计数）。适用：「日志哪里不对劲」「错误分布」「今天报错多吗」。AI 取证主力工具。',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string', description: '日志文件绝对路径' } },
      required: ['file'],
    },
    run: toolStats,
  },
  {
    name: 'log_errors',
    description: '抽取某文件末尾窗口内的 WARN/ERROR/FATAL 并聚类分组（每类给最近时间与 offset）。适用：「为什么失败」「把报错归个类」「最近有什么异常」。比 log_stats 更聚焦最近现场。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '日志文件绝对路径' },
        maxLines: { type: 'number', description: '窗口行数（默认 100，最多 500）' },
      },
      required: ['file'],
    },
    run: toolErrors,
  },
  {
    name: 'log_context',
    description: '看某条日志前后的上下文（多行消息/调用栈展开）。适用：「这条报错前后发生了什么」「展开这个堆栈」。offset 来自 log_search / log_errors。',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '日志文件绝对路径' },
        offset: { type: 'number', description: '目标行字节偏移' },
        before: { type: 'number', description: '前文行数（默认 10，最多 50）' },
        after: { type: 'number', description: '后文行数（默认 10，最多 50）' },
      },
      required: ['file', 'offset'],
    },
    run: toolContext,
  },
];

// ── JSON-RPC stdio 主循环（与 house 样板一致）──────────────────────────────
function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }

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
    handle(msg).catch((e) => {
      slog(`handle error: ${e.stack || e.message}`);
      if (msg && msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: '内部错误' } });
    });
  }
});

async function handle(msg) {
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: core.PLUGIN_ID, version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    try {
      const r = await tool.run(args);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: core.oneLine(r.text, 8000) }], isError: r.isError === true },
      });
    } catch (e) {
      slog(`tool ${name} 抛错: ${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `执行异常：${e.message}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

slog(`log-lens mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
