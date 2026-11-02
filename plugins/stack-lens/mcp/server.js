#!/usr/bin/env node
'use strict';
/**
 * server.js —— 堆栈还原台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * 与已交付调试类插件（bundle-lens / repo-lens / mcp-probe / stream-desk）同款骨架：
 * 换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 *
 * 与插件服务的通信：先经 kvclient 读 cap.kv 的 stacklens.meta 拿 {port, token}，
 * 再 127.0.0.1 直连。测试钩子（bundle-lens/stream-desk 先例）：env STACKLENS_SERVICE_URL
 * + STACKLENS_SERVICE_TOKEN 直接覆盖发现逻辑，供离线冒烟注入假服务地址。
 *
 * 六工具（AI 还原闭环：扫 map → 还原整栈 → 单点定位 → 看源码 → 体检 map → 从日志文件还原）：
 *   stack_resolve / stack_resolve_file / maps_scan / map_locate / map_source / map_validate
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

const STACK_TEXT_CAP = 512 * 1024; // 与 core.LIMITS.maxStackChars 对齐

function log(level, msg) {
  try { process.stderr.write(`[stack-lens-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用 ──────────────────────────────────────────────────────────
const ENV_URL = process.env.STACKLENS_SERVICE_URL || '';
const ENV_TOKEN = process.env.STACKLENS_SERVICE_TOKEN || '';
let svcInfo = null; // {base, token, at}

async function resolveService() {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('stacklens.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('堆栈还原台服务未注册（stacklens.meta 缺失）：请先在 Polaris 打开「堆栈还原台」面板拉起服务，或检查插件是否已启用');
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

// ── 结果摘要 ────────────────────────────────────────────────────────────────

function fmtFrame(fr, i) {
  const orig = fr.fn ? `${fr.fn} →` : '';
  if (fr.state === 'resolved') {
    const name = fr.name && fr.name !== fr.fn ? `（原名 ${fr.name}）` : '';
    return `${i}. ✓ ${orig} ${fr.source}:${fr.sourceLine}:${fr.sourceCol}${name}`;
  }
  if (fr.state === 'internal') return `${i}. ○ ${fr.url || fr.raw}（运行时内部帧，跳过）`;
  if (fr.state === 'unparsed') return `${i}. ？无法解析：${fr.raw}`;
  return `${i}. ✗ ${fr.fn || '(匿名)'} ${fr.url}:${fr.line}:${fr.col} —— ${fr.reason}`;
}

function summarizeResolve(r) {
  const s = r.summary || {};
  const lines = [
    `还原率 ${s.rate}%：${s.resolved}/${s.eligible} 帧（另有 ${s.internal} 个内部帧跳过）`,
    s.message ? `错误消息：${s.message}` : '（未识别错误消息行）',
    `栈格式：${s.format}`,
    '逐帧：',
    ...(r.frames || []).map((f, i) => fmtFrame(f, i + 1)),
  ];
  const fetches = r.sources && r.sources.fetches ? r.sources.fetches.filter((f) => !f.ok) : [];
  if (fetches.length) lines.push(`⚠ URL 抓取失败：${fetches.map((f) => `${f.url}（${f.error}）`).join('；')}`);
  if (r.warnings && r.warnings.length) lines.push(`⚠ ${r.warnings.join('；')}`);
  return {
    summary: s,
    frames: r.frames,
    maps: r.maps,
    reading: lines.join('\n'),
  };
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

async function toolResolve(args) {
  const stack = String(args && args.stack || '');
  if (!stack.trim()) throw new Error('缺少 stack 参数（minified 错误栈文本）');
  const body = {
    stack,
    mapsDir: args.mapsDir || undefined,
    mapPaths: Array.isArray(args.mapPaths) ? args.mapPaths : undefined,
    fetchUrls: Array.isArray(args.fetchUrls) ? args.fetchUrls : undefined,
    wantFrames: args.wantFrames !== false,
  };
  const r = await svcRequest('POST', '/api/resolve', body, 120_000);
  return summarizeResolve(r);
}

async function toolResolveFile(args) {
  const stackPath = String(args && args.stackPath || '').trim();
  if (!stackPath) throw new Error('缺少 stackPath 参数（错误栈/日志文件路径）');
  let text;
  try {
    const st = fs.statSync(stackPath);
    if (!st.isFile()) throw new Error('不是文件');
    if (st.size > STACK_TEXT_CAP * 4) throw new Error(`文件超过 ${Math.floor(STACK_TEXT_CAP * 4 / 1024 / 1024)}MB 上限`);
    text = fs.readFileSync(stackPath, 'utf8');
  } catch (e) {
    throw new Error(`读取栈文件失败：${e.message}`);
  }
  if (text.length > STACK_TEXT_CAP) text = text.slice(0, STACK_TEXT_CAP);
  const body = {
    stack: text,
    mapsDir: args.mapsDir || undefined,
    mapPaths: Array.isArray(args.mapPaths) ? args.mapPaths : undefined,
    wantFrames: args.wantFrames !== false,
  };
  const r = await svcRequest('POST', '/api/resolve', body, 120_000);
  return summarizeResolve(r);
}

async function toolMapsScan(args) {
  const dir = String(args && args.dir || '').trim();
  if (!dir) throw new Error('缺少 dir 参数（构建产物目录，如 D:\\proj\\dist）');
  const r = await svcRequest('POST', '/api/scan-maps', { dir }, 60_000);
  const rows = (r.maps || []).filter((m) => !m.error);
  const lines = [
    `目录 ${r.dir}：扫过 ${r.walked} 个文件，发现 ${rows.length} 个 sourcemap`,
    ...rows.slice(0, 30).map((m, i) => `${i + 1}. ${m.originPath || m.fromJs}：${m.sources != null ? `${m.sources} 个源` : ''}${m.file ? `，file=${m.file}` : ''}${m.hasContent ? '，含 sourcesContent' : '，无 sourcesContent'}`),
    r.warnings && r.warnings.length ? `⚠ ${r.warnings.join('；')}` : '',
  ].filter(Boolean);
  return { dir: r.dir, walked: r.walked, maps: rows, warnings: r.warnings, reading: lines.join('\n') };
}

function obtainMapArg(args) {
  if (args && typeof args.mapText === 'string' && args.mapText.trim()) return { mapText: args.mapText };
  if (args && args.mapPath) return { mapPath: String(args.mapPath) };
  throw new Error('缺少 mapText 或 mapPath 参数');
}

async function toolLocate(args) {
  const line = Number(args && args.line);
  const col = Number(args && args.col);
  if (!Number.isInteger(line) || line < 1) throw new Error('line 必须是 ≥1 的整数');
  const r = await svcRequest('POST', '/api/frame', {
    ...obtainMapArg(args || {}),
    line, col: Number.isFinite(col) ? col : undefined,
  }, 30_000);
  if (!r.found) return { found: false, reason: r.reason, reading: `未还原：${r.reason}` };
  const lines = [
    `生成位置 ${args.mapPath ? args.mapPath : '(内联 map)'}:${line}:${Number.isFinite(col) ? col : 1}`,
    `→ ${r.source}:${r.line}:${r.column}${r.name ? `（函数名 ${r.name}）` : ''}`,
    r.codeFrame ? `\n${r.codeFrame}` : '',
  ].filter(Boolean);
  return { ...r, reading: lines.join('\n') };
}

async function toolSource(args) {
  const r = await svcRequest('POST', '/api/source', {
    ...obtainMapArg(args || {}),
    source: args && args.source,
    line: args && args.line != null ? Number(args.line) : undefined,
    context: args && args.context != null ? Number(args.context) : undefined,
  }, 30_000);
  if (!r.found) return { found: false, reason: r.reason, reading: `取不到源内容：${r.reason}` };
  return { found: true, source: r.source, from: r.from, codeFrame: r.codeFrame, reading: `${r.source}（来自 ${r.from}）\n\n${r.codeFrame}` };
}

async function toolValidate(args) {
  const r = await svcRequest('POST', '/api/validate', { ...obtainMapArg(args || {}), label: args && args.label }, 30_000);
  if (!r.ok) return { ok: false, error: r.error, reading: `map 不可用：${r.error}` };
  const s = r.stats;
  const lines = [
    `map 有效：${s.segCount} 个映射段 / ${s.genLines} 个生成行 / ${s.sources} 个源 / ${s.names} 个名字`,
    s.sections ? `段式 index map（${s.sections} sections）` : '普通（非段式）map',
    `sourcesContent：${s.hasSourcesContent ? `${s.sourcesContentCount} 个源含内容` : '无（代码帧需磁盘源文件）'}`,
    s.file ? `file 字段：${s.file}` : '无 file 字段（配对将退化为文件名匹配）',
    r.warnings && r.warnings.length ? `⚠ ${r.warnings.join('；')}` : '',
  ].filter(Boolean);
  return { ...r, reading: lines.join('\n') };
}

// ── 工具清单 ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'stack_resolve',
    description: '还原整条 minified 错误栈：粘贴错误栈文本 + 给 sourcemap 来源（构建产物目录 / map 文件列表 / 显式 URL），逐帧还原成原始源码位置与代码帧。分析线上报错时先调这个。',
    inputSchema: {
      type: 'object',
      properties: {
        stack: { type: 'string', description: 'minified 错误栈全文（Chrome/Node/Safari/Firefox 格式均可）' },
        mapsDir: { type: 'string', description: '构建产物目录（会扫描 *.map 与 .js 内 sourceMappingURL 注释），如 D:\\proj\\dist' },
        mapPaths: { type: 'array', items: { type: 'string' }, description: '显式 .map 文件路径列表（与 mapsDir 二选一或并用）' },
        fetchUrls: { type: 'array', items: { type: 'string' }, description: '可选：从这些 URL 抓 map（http/https，60MB/15s 上限）' },
        wantFrames: { type: 'boolean', description: '是否要代码帧（默认 true）' },
      },
      required: ['stack'],
    },
  },
  {
    name: 'stack_resolve_file',
    description: '从日志/错误报告文件读取栈并还原（同 stack_resolve，栈文本来自文件；适合整份报错日志）。',
    inputSchema: {
      type: 'object',
      properties: {
        stackPath: { type: 'string', description: '错误栈/日志文件路径' },
        mapsDir: { type: 'string', description: '构建产物目录' },
        mapPaths: { type: 'array', items: { type: 'string' }, description: '显式 .map 文件路径列表' },
      },
      required: ['stackPath'],
    },
  },
  {
    name: 'maps_scan',
    description: '扫描构建产物目录里的 sourcemap 清单：每个 map 的 file 字段、源数量、是否含 sourcesContent。还原前先看有哪些 map 可用。',
    inputSchema: { type: 'object', properties: { dir: { type: 'string', description: '构建产物目录' } }, required: ['dir'] },
  },
  {
    name: 'map_locate',
    description: '单点定位：生成文件里的 行:列 → 原始源码 行:列 + 函数名 + 代码帧。已知某 minified 位置时用这个（不必整栈）。',
    inputSchema: {
      type: 'object',
      properties: {
        mapPath: { type: 'string', description: '.map 文件路径（与 mapText 二选一）' },
        mapText: { type: 'string', description: 'map JSON 全文（与 mapPath 二选一）' },
        line: { type: 'number', description: '生成文件行号（1 起）' },
        col: { type: 'number', description: '生成文件列号（1 起，可省）' },
      },
    },
  },
  {
    name: 'map_source',
    description: '取 map 里某个源文件的内容（sourcesContent 或磁盘）并渲染指定行附近的代码帧。',
    inputSchema: {
      type: 'object',
      properties: {
        mapPath: { type: 'string', description: '.map 文件路径（与 mapText 二选一）' },
        mapText: { type: 'string', description: 'map JSON 全文（与 mapPath 二选一）' },
        source: { type: ['string', 'number'], description: '源文件名（或索引）' },
        line: { type: 'number', description: '想要看到的原始行号（可选）' },
        context: { type: 'number', description: '上下行数（默认 2）' },
      },
      required: ['source'],
    },
  },
  {
    name: 'map_validate',
    description: '体检一个 sourcemap：结构是否有效、映射段数量、源数量、sourcesContent 覆盖、段式结构。还原失败时先体检 map。',
    inputSchema: {
      type: 'object',
      properties: {
        mapPath: { type: 'string', description: '.map 文件路径（与 mapText 二选一）' },
        mapText: { type: 'string', description: 'map JSON 全文（与 mapPath 二选一）' },
        label: { type: 'string', description: '展示用标签' },
      },
    },
  },
];

const METHOD_IMPL = {
  stack_resolve: toolResolve,
  stack_resolve_file: toolResolveFile,
  maps_scan: toolMapsScan,
  map_locate: toolLocate,
  map_source: toolSource,
  map_validate: toolValidate,
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
        serverInfo: { name: 'stack-lens', version: '0.1.0' },
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
log('info', 'stack-lens MCP 已启动（v0.1.0）');
