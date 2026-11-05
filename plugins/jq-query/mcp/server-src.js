'use strict';
/**
 * jq-query MCP server 源码（esbuild bundle → mcp/server.js，发布 zip 零 node_modules）。
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 五工具：jq_query / jq_check / jq_reference / json_outline / jq_selftest
 * 引擎与面板/服务同一权威：service/engine.js（worker 隔离 + 超时护栏）+ shared/*。
 *
 * 隐私口径：工具结果包含用户主动请求的查询输出——这是工具的存在意义；
 * stderr 日志绝不记录输入 JSON 内容与查询文本，只记尺寸与耗时。
 *
 * filePath 口径：绝对路径直读（≤64MB）——MCP 是本机可信进程，与 qr-decode imagePath 同口径。
 */
const fs = require('fs');
const path = require('path');
const { createEngine } = require('../service/engine.js');
const engineApi = require('../shared/engine-api.js');
const { outlineFromText, outlineOf, renderOutline } = require('../shared/outline.js');
const { searchReference, renderReference } = require('../shared/reference.js');

const SERVER_INFO = { name: 'jq-query', version: '0.1.0' };
// worker 是独立文件（不可 bundle）：mcp/server.js 相对定位 ../service/worker.js（zip 内同仓）
const engine = createEngine({
  workerPath: path.join(__dirname, '..', 'service', 'worker.js'),
  log: (level, msg) => {
    try { process.stderr.write(`[jq-query-mcp:${level}] ${new Date().toISOString()} ${msg}\n`); } catch (_) { /* ignore */ }
  },
});

const TOOLS = [
  {
    name: 'jq_query',
    description:
      '用真实 jq 引擎（jq 1.7 语义）查询/变换 JSON。三选一输入：json（内联 JSON/NDJSON 文本）、' +
      'filePath（绝对路径直读 ≤64MB）、input（纯文本配 -R 按行读）。返回全部输出与耗时。' +
      '适合：从 API 响应/日志/配置/HAR 中确定性提取字段、过滤数组、聚合统计——大 JSON 不要手算，用本工具是精确的。' +
      '常用 flag：-r（字符串去引号）、-c（单行）、-s（整个输入读成数组）、-n（不读输入造数据）、' +
      '--arg k v / --argjson k v（注入 $k 变量）。查询语法拿不准可先调 jq_reference。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'jq 过滤器，如 ".users[] | select(.age > 30) | {name, age}"' },
        json: { type: 'string', description: '内联输入：JSON 或 NDJSON（多文档流）文本；与 filePath 二选一' },
        filePath: { type: 'string', description: '输入文件绝对路径（≤64MB）；与 json 二选一' },
        flags: {
          type: 'array', items: { type: 'string' },
          description: 'jq CLI flags：-r -c -s -n -R -S -j --tab --arg <名> <值> --argjson <名> <JSON>（支持聚合式 -rn）',
        },
        timeoutMs: { type: 'number', description: '超时毫秒，缺省 5000，上限 30000；超时查询被终止且不自动重试' },
      },
      required: ['query'],
    },
  },
  {
    name: 'jq_check',
    description:
      '校验 jq 查询语法（-n 空输入真实执行一次）。语法错误给出 jq 原生报错（含位置）；' +
      '运行期错误说明语法 OK 但空输入下出错（数据相关类型错误需真实输入才能暴露）。写复杂查询前先自检一次。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '要校验的 jq 过滤器' } },
      required: ['query'],
    },
  },
  {
    name: 'jq_reference',
    description:
      'jq 内置函数/语法速查表（约 90 条，离线）。给 keyword 按签名/语义/示例搜索（如 "group"、"时间"、"正则"、' +
      '"select"）；不给 keyword 返回常用子集。每条含最小可跑示例。',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string', description: '搜索关键词（可空）' } },
    },
  },
  {
    name: 'json_outline',
    description:
      '输出 JSON 结构大纲（不依赖 jq）：根类型、键集合、数组长度与元素类型分布、对象元素的键并集、' +
      '样本值（截断）。写查询前先看懂大 JSON 的形状；配 depth 控制展开深度（缺省 3）。',
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'string', description: '内联 JSON 文本；与 filePath 二选一' },
        filePath: { type: 'string', description: '文件绝对路径（≤64MB）' },
        depth: { type: 'number', description: '展开深度 1-8，缺省 3' },
        maxChildren: { type: 'number', description: '每个层级最多展开的子节点数，缺省 24' },
      },
    },
  },
  {
    name: 'jq_selftest',
    description: '试金石自检：14 断言走真实引擎（取值/过滤/NDJSON/flags/错误语义/超时击杀+重生成/outline），逐一报告通过与否。引擎行为异常时先跑这个。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── 人类可读输出 ────────────────────────────────────────────────────────────
function dump(value, indent) {
  const pad = indent || '';
  if (value == null) return String(value);
  // 字符串也按 JSON 形态展示（带引号）——工具输出是 JSON 结果清单，不能与 -r 原文混淆
  try { return pad + JSON.stringify(value, null, 2); } catch (_) { return pad + String(value); }
}

function truncate(text, max) {
  const s = String(text == null ? '' : text);
  if (s.length <= max) return s;
  return s.slice(0, Math.floor(max * 0.7)) + `\n…（中段截断，全文 ${s.length} 字符）…\n` + s.slice(-Math.floor(max * 0.2));
}

function readFilePath(fp) {
  if (!fp || typeof fp !== 'string') throw userErr('需要 json（内联文本）或 filePath（绝对路径）');
  if (!path.isAbsolute(fp)) throw userErr(`filePath 必须是绝对路径：${fp}`);
  if (fp.includes('\0')) throw userErr('filePath 含非法字符');
  let st;
  try { st = fs.statSync(fp); } catch (_) { throw userErr(`文件不存在或不可读：${fp}`); }
  if (st.size > engineApi.LIMITS.INPUT_MAX_BYTES) {
    throw userErr(`文件 ${Math.round(st.size / 1048576)}MB 超过上限 ${Math.round(engineApi.LIMITS.INPUT_MAX_BYTES / 1048576)}MB`);
  }
  return fs.readFileSync(fp, 'utf8');
}

function userErr(msg) { return Object.assign(new Error(msg), { user: true }); }

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolJqQuery(args) {
  const query = args && args.query;
  if (typeof query !== 'string' || !query.trim()) throw userErr('需要非空 query');
  const nf = engineApi.normalizeFlags(args.flags);
  if (!nf.ok) throw userErr(nf.error);
  let input;
  if (args.json != null) {
    if (typeof args.json !== 'string') throw userErr('json 必须是字符串');
    if (Buffer.byteLength(args.json, 'utf8') > engineApi.LIMITS.INPUT_MAX_BYTES) throw userErr('json 超过上限 64MB');
    input = args.json;
  } else if (args.filePath) {
    input = readFilePath(args.filePath);
  } else {
    input = '';
  }
  const timeoutMs = engineApi.clampTimeoutMs(args.timeoutMs);
  const inputInfo = engineApi.inputStats(input);
  if (inputInfo.hasParseError && !nf.flags.includes('-R') && !nf.flags.includes('-n')) {
    throw userErr(`输入不是合法 JSON/NDJSON：${inputInfo.parseError}（若是日志文本请加 -R 按行原样读）`);
  }
  let r;
  try {
    r = await engine.run({ input, query, flags: nf.flags, timeoutMs });
  } catch (e) {
    if (e && e.jq) throw userErr(`jq 错误：${e.message}`);
    throw e;
  }
  const raw = r.out;
  const bytes = Buffer.byteLength(raw, 'utf8');
  const lines = [];
  lines.push(`jq 查询完成：${r.ms}ms，输入 ${inputInfo.bytes}B/${inputInfo.docCount} 文档，输出 ${bytes}B，flags=[${nf.flags.join(' ')}]`);
  if (bytes > engineApi.LIMITS.RESULT_MAX_BYTES) {
    lines.push(`（输出超过 8MB 上限已截断——用 -c 或 limit/first 缩小结果）`);
    lines.push(truncate(raw, 6000));
  } else {
    const parsed = engineApi.parseOutputs(raw);
    lines.push(`输出 ${parsed.length} 项：`);
    if (parsed.length === 0) {
      lines.push('（空流：查询合法但未产出结果）');
    } else {
      const shown = parsed.slice(0, 20);
      for (const p of shown) {
        if (p.error) lines.push(`  ⚠ 输出段解析失败（原样保留前 200 字符）：${p.raw}`);
        else lines.push(truncate(dump(p.value, '  '), 2000));
      }
      if (parsed.length > shown.length) lines.push(`…其余 ${parsed.length - shown.length} 项未展开（共 ${parsed.length} 项）`);
    }
  }
  return lines.join('\n');
}

async function toolJqCheck(args) {
  const query = args && args.query;
  if (typeof query !== 'string' || !query.trim()) throw userErr('需要非空 query');
  try {
    await engine.run({ input: 'null', query, flags: ['-n'], timeoutMs: engineApi.clampTimeoutMs(args && args.timeoutMs) });
    return '✓ 语法 OK（-n 空输入执行一次；数据相关类型错误需真实输入才能暴露）';
  } catch (e) {
    const msg = String(e && e.message || e);
    if (e && e.timeout) throw e;
    const isSyntax = /syntax error|compile error|unexpected/i.test(msg);
    if (isSyntax) throw userErr(`✗ 语法错误：${msg}`);
    return `✓ 语法 OK（空输入下出现运行期错误，属数据相关：${truncate(msg, 240)}）`;
  }
}

async function toolJqReference(args) {
  const kw = args && typeof args.keyword === 'string' ? args.keyword : '';
  const r = searchReference(kw, engineApi.LIMITS.REFERENCE_RESULT_CAP);
  const head = kw
    ? `关键词「${kw}」命中 ${r.total} 条${r.truncated ? `（仅显示前 ${r.entries.length}）` : ''}：`
    : `jq 速查表共 ${r.total + 0} 条命中（未给关键词，显示前 ${r.entries.length} 条；给 keyword 可搜索全部）:`;
  return `${head}\n\n${renderReference(r.entries)}`;
}

async function toolJsonOutline(args) {
  const depth = Math.max(1, Math.min(8, Number(args && args.depth) || 3));
  const maxChildren = Math.max(1, Math.min(64, Number(args && args.maxChildren) || 24));
  let text;
  if (args && args.json != null) {
    if (typeof args.json !== 'string') throw userErr('json 必须是字符串');
    text = args.json;
  } else if (args && args.filePath) {
    text = readFilePath(args.filePath);
  } else {
    throw userErr('需要 json（内联文本）或 filePath（绝对路径）');
  }
  const r = outlineFromText(text, { depth, maxChildren });
  if (!r) throw userErr('输入不是合法 JSON（outline 只接受单文档 JSON；NDJSON 请先取单个文档或用 jq -s）');
  return `JSON 结构大纲（depth=${depth}）：\n${truncate(r.text, 8000)}\n\n提示：用 .rows[] | select(.id == …) 遍历数组；元素键并集已在上方列出。`;
}

async function toolJqSelftest() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: Boolean(cond), detail: detail || '' });
  const q = async (input, query, flags) => (await engine.run({ input, query, flags: flags || [], timeoutMs: 8000 })).out;
  try { ok('add 聚合', (await q('{"a":{"b":[1,2,3]}}', '.a.b | add')).trim() === '6'); } catch (e) { ok('add 聚合', false, String(e.message)); }
  try { ok('select 过滤', (await q('[{"n":1},{"n":5}]', '[.[] | select(.n > 3)] | length')).trim() === '1'); } catch (e) { ok('select 过滤', false, String(e.message)); }
  try { ok('NDJSON --slurp', (await q('{"n":1}\n{"n":2}\n{"n":3}', 'length', ['--slurp'])).trim() === '3'); } catch (e) { ok('NDJSON --slurp', false, String(e.message)); }
  try { ok('多文档多输出', (await q('{"a":1}\n{"a":2}', '.a')).trim() === '1\n2'); } catch (e) { ok('多文档多输出', false, String(e.message)); }
  try { ok('-r + @csv', (await q('"x"', '["a","b"] | @csv', ['-r'])).includes('"a","b"')); } catch (e) { ok('-r + @csv', false, String(e.message)); }
  try { await q('null', '.a | tonumber'); ok('运行错误必须抛出', false); } catch (e) { ok('运行错误必须抛出', Boolean(e && e.jq), String(e.message).slice(0, 60)); }
  try { await q('null', '.a ++'); ok('语法错误必须抛出', false); } catch (e) { ok('语法错误必须抛出', Boolean(e && e.jq && /syntax|compile/i.test(String(e.message))), String(e.message).slice(0, 60)); }
  try { ok('--arg/--argjson', (await q('null', '$x + $y.v', ['-n', '--argjson', 'x', '4', '--argjson', 'y', '{"v":38}'])).trim() === '42'); } catch (e) { ok('--arg/--argjson', false, String(e.message)); }
  try { ok('todate', (await q('1700000000', 'todate | startswith("2023-11-14")')).trim() === 'true'); } catch (e) { ok('todate', false, String(e.message)); }
  try { ok('capture 命名组', (await q('"id=42x"', 'capture("(?<n>[0-9]+)") | .n')).trim() === '"42"'); } catch (e) { ok('capture 命名组', false, String(e.message)); }
  const before = engine.stats().timeouts;
  try { await engine.run({ input: '0', query: '[repeat(.+1)]', flags: [], timeoutMs: 800 }); ok('超时击杀', false); } catch (e) { ok('超时击杀', Boolean(e && e.timeout), String(e.message).slice(0, 60)); }
  ok('超时计数+1', engine.stats().timeouts === before + 1);
  try { ok('击杀后重生成可用', (await q('{"v":[10,20]}', '.v | add')).trim() === '30'); } catch (e) { ok('击杀后重生成可用', false, String(e.message)); }
  try {
    const o = outlineOf({ rows: [{ id: 1 }] }, { depth: 2 });
    ok('outline 键并集', o.children[0].elementKeys && o.children[0].elementKeys[0] === 'id');
  } catch (e) { ok('outline 键并集', false, String(e.message)); }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  const lines = results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
  return `试金石 ${pass}/${results.length} 通过（fail=${fail}，引擎 timeouts=${engine.stats().timeouts}）\n${lines.join('\n')}`;
}

const TOOL_IMPL = {
  jq_query: toolJqQuery,
  jq_check: toolJqCheck,
  jq_reference: toolJqReference,
  json_outline: toolJsonOutline,
  jq_selftest: toolJqSelftest,
};

// ── stdio JSON-RPC 2.0 主循环（house 手搓协议：stdout 只输出协议行）─────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', () => process.exit(0));

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function rpcError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return; // 无需回复
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    const impl = TOOL_IMPL[name];
    if (!impl) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    const t0 = Date.now();
    try {
      const text = await impl(args);
      process.stderr.write(`[jq-query-mcp:info] tool=${name} ms=${Date.now() - t0}\n`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(text) }], isError: false } });
    } catch (e) {
      process.stderr.write(`[jq-query-mcp:info] tool=${name} error ms=${Date.now() - t0} user=${Boolean(e && e.user)}\n`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `错误：${(e && e.message) || String(e)}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined && id !== null) rpcError(id, -32601, `未知方法: ${method}`);
}

let pending = Promise.resolve();
process.stdin.on('data', () => {
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    // 串行处理：单 worker 引擎本身串行，协议层同样保持顺序
    pending = pending.then(() => handle(msg)).catch((e) => {
      process.stderr.write(`[jq-query-mcp:error] handle: ${e && e.stack ? e.stack : e}\n`);
      if (msg && msg.id !== undefined && msg.id !== null) rpcError(msg.id, -32603, '内部错误');
    });
  }
});

process.on('uncaughtException', (e) => {
  process.stderr.write(`[jq-query-mcp:error] uncaught: ${e && e.stack ? e.stack : e}\n`);
});
process.on('unhandledRejection', (e) => {
  process.stderr.write(`[jq-query-mcp:error] unhandledRejection: ${e && e.stack ? e.stack : e}\n`);
});
async function shutdown() {
  await engine.shutdown().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
