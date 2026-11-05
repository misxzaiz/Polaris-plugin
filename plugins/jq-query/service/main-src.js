'use strict';
/**
 * main-src.js —— jq 查询台后台服务（esbuild bundle → service/main.js）
 *
 * 职责（字节面全部本地，零外联）：
 *   POST /api/query      真实 jq 查询（worker 隔离 + 超时护栏；input ≤64MB，结果 >8MB 截断）
 *   POST /api/check      查询语法校验（-n 空输入跑一次；类型错误需真实数据才能暴露，如实标注）
 *   POST /api/outline    JSON 结构大纲（写查询前先看懂形状；json 内联或 filePath 直读）
 *   POST /api/reference  内置函数速查表（关键词搜索）
 *   POST /api/selftest   试金石：14 断言走真实 worker（保真/错误语义/超时击杀+重生成/NDJSON）
 *   GET  /__health
 *
 * 安全底线：
 *   - 只绑 127.0.0.1；除 /__health 外全部要求 x-jq-query-token（meta 写 cap.kv 供面板取）。
 *   - 隐私：查询内容与输入 JSON 绝不落日志、不落 kv（日志只记尺寸/耗时/错误类型）。
 *   - filePath 仅允许绝对路径直读（与 qr-desk decode imagePath 同口径；插件服务是本机可信进程）。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const engineApi = require('../shared/engine-api.js');
const { outlineFromText } = require('../shared/outline.js');
const { searchReference, renderReference } = require('../shared/reference.js');
const { createEngine } = require('./engine.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'jq-query';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;
const BODY_LIMIT = 64 * 1024 * 1024 + 1024 * 1024; // 输入上限 64MB + JSON 包装余量

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志（宿主不收集 stdout/stderr；自落盘 + 512KB 轮转；绝不记录查询内容与输入数据）──
const logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + '.log') : '';
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug') return;
  process.stderr.write(line + '\n');
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > LOG_MAX) fs.renameSync(logFile, logFile + '.old');
    } catch (_) { /* 首次无文件 */ }
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) { /* 日志失败不影响业务 */ }
}

// ── 桥（降级不致命：核心查询能力不依赖 kv）────────────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const KEY_META = PLUGIN_ID + '.meta';
const token = process.env.JQ_QUERY_TEST_TOKEN || crypto.randomBytes(16).toString('hex');

// ── 引擎（service 与 MCP 同一权威实现；worker 为独立文件，bundle 后 __dirname 仍是 service/）──
const engine = createEngine({ workerPath: path.join(__dirname, 'worker.js'), log });

// ── 业务处理 ───────────────────────────────────────────────────────────────
function userErr(msg) { return Object.assign(new Error(msg), { user: true }); }

function readInputText(body) {
  if (body.input == null) return '';
  if (typeof body.input !== 'string') throw userErr('input 必须是字符串（JSON/NDJSON 文本）');
  if (Buffer.byteLength(body.input, 'utf8') > engineApi.LIMITS.INPUT_MAX_BYTES) {
    throw userErr(`输入超过上限 ${Math.round(engineApi.LIMITS.INPUT_MAX_BYTES / 1048576)}MB`);
  }
  return body.input;
}

/** filePath 直读（MCP 与 outline 共用；绝对路径 + 上限） */
function readFilePath(fp) {
  if (!fp || typeof fp !== 'string') throw userErr('需要 json（内联文本）或 filePath（绝对路径）');
  if (!path.isAbsolute(fp)) throw userErr('filePath 必须是绝对路径');
  if (fp.includes('\0')) throw userErr('filePath 含非法字符');
  let st;
  try { st = fs.statSync(fp); } catch (_) { throw userErr(`文件不存在或不可读：${fp}`); }
  if (st.size > engineApi.LIMITS.INPUT_MAX_BYTES) {
    throw userErr(`文件 ${Math.round(st.size / 1048576)}MB 超过上限 ${Math.round(engineApi.LIMITS.INPUT_MAX_BYTES / 1048576)}MB`);
  }
  return fs.readFileSync(fp, 'utf8');
}

async function doQuery(body) {
  const query = body.query;
  if (typeof query !== 'string' || !query.trim()) throw userErr('需要非空 query（jq 过滤器）');
  const nf = engineApi.normalizeFlags(body.flags);
  if (!nf.ok) throw userErr(nf.error);
  const input = readInputText(body);
  const timeoutMs = engineApi.clampTimeoutMs(body.timeoutMs);
  const inputInfo = engineApi.inputStats(input);
  if (inputInfo.hasParseError && !nf.flags.includes('-R') && !nf.flags.includes('-n')) {
    // 输入解析错误不拦截（jq 自己也会报），但提前给出人话提示位置
    throw userErr(`输入不是合法 JSON/NDJSON：${inputInfo.parseError}（若是日志文本请勾选 -R 原样行输入）`);
  }
  let r;
  try {
    r = await engine.run({ input, query, flags: nf.flags, timeoutMs });
  } catch (e) {
    // jq 的错误（编译/运行）原样透传给面板展示（含 stderr 定位信息），不打日志内容
    if (e && e.jq) throw userErr(`jq 错误：${e.message}`);
    throw e;
  }
  const raw = r.out;
  const bytes = Buffer.byteLength(raw, 'utf8');
  const truncated = bytes > engineApi.LIMITS.RESULT_MAX_BYTES;
  const out = {
    raw,
    rawBytes: bytes,
    ms: r.ms,
    truncated,
    truncationNotice: truncated ? engineApi.truncationNotice(bytes, engineApi.LIMITS.RESULT_MAX_BYTES) : null,
    inputDocs: inputInfo.docCount,
    inputBytes: inputInfo.bytes,
    flags: nf.flags,
    timeoutMs,
  };
  if (!truncated) {
    const parsed = engineApi.parseOutputs(raw);
    out.outputs = parsed;
    out.outputCount = parsed.length;
  } else {
    out.outputCount = null;
  }
  return out;
}

async function doCheck(body) {
  const query = body.query;
  if (typeof query !== 'string' || !query.trim()) throw userErr('需要非空 query');
  const nf = engineApi.normalizeFlags(body.flags);
  if (!nf.ok) throw userErr(nf.error);
  // 口径：-n 空输入真实跑一次。exit 3 语法错误 → syntaxOk=false；运行期错误 → 语法 OK 类型错；
  // 成功/输出为空 → 全 OK。如实标注这是语法层校验。
  try {
    await engine.run({ input: 'null', query, flags: ['-n'], timeoutMs: engineApi.clampTimeoutMs(body.timeoutMs) });
    return { syntaxOk: true, error: null, errorKind: null, note: '语法 OK（-n 空输入执行一次；数据相关类型错误需真实输入才能暴露）' };
  } catch (e) {
    const msg = String(e && e.message || e);
    if (e && e.timeout) throw e;
    const isSyntax = /syntax error|compile error|1 compile error|unexpected/i.test(msg);
    return {
      syntaxOk: !isSyntax,
      error: isSyntax ? msg : null,
      errorKind: isSyntax ? 'syntax' : 'runtime',
      runtimeNote: isSyntax ? null : `语法 OK，但空输入下出现运行期错误：${msg.slice(0, 300)}`,
      note: '语法层校验；数据相关类型错误需真实输入才能暴露',
    };
  }
}

async function doOutline(body) {
  const depth = Math.max(1, Math.min(8, Number(body.depth) || 3));
  const maxChildren = Math.max(1, Math.min(64, Number(body.maxChildren) || 24));
  let text;
  if (body.json != null) {
    if (typeof body.json !== 'string') throw userErr('json 必须是 JSON 文本字符串');
    if (Buffer.byteLength(body.json, 'utf8') > engineApi.LIMITS.INPUT_MAX_BYTES) throw userErr('json 超过上限 64MB');
    text = body.json;
  } else if (body.filePath) {
    text = readFilePath(body.filePath);
  } else {
    throw userErr('需要 json（内联文本）或 filePath（绝对路径）');
  }
  const r = outlineFromText(text, { depth, maxChildren });
  if (!r) throw userErr('输入不是合法 JSON（outline 只接受单文档 JSON；NDJSON 请先取单个文档）');
  return { node: r.node, text: r.text, depth, maxChildren };
}

// ── 试金石（走真实 worker 的 14 断言；与 test/run-tests.mjs 的离线断言互补）──
async function doSelftest() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: Boolean(cond), detail: detail || '' });
  const q = async (input, query, flags) => {
    const r = await engine.run({ input, query, flags: flags || [], timeoutMs: 8000 });
    return r.out;
  };
  try {
    const a = await q('{"a":{"b":[1,2,3]}}', '.a.b | add');
    ok('取值+聚合 add', a.trim() === '6', a);
  } catch (e) { ok('取值+聚合 add', false, String(e.message)); }
  try {
    const b = await q('[{"n":1},{"n":5},{"n":9}]', '[.[] | select(.n > 3)] | length');
    ok('select 过滤', b.trim() === '2', b);
  } catch (e) { ok('select 过滤', false, String(e.message)); }
  try {
    const c = await q('{"n":1}\n{"n":2}\n{"n":3}', 'length', ['--slurp']);
    ok('NDJSON 多文档 --slurp', c.trim() === '3', c);
  } catch (e) { ok('NDJSON 多文档 --slurp', false, String(e.message)); }
  try {
    const d = await q('{"a":1}\n{"a":2}', '.a');
    ok('多文档流式多输出', d.trim() === '1\n2', d);
  } catch (e) { ok('多文档流式多输出', false, String(e.message)); }
  try {
    const e1 = await q('"x,y"', '["a","b"] | @csv', ['-r']);
    ok('-r 原样输出 + @csv', e1.includes('"a","b"'), e1);
  } catch (e) { ok('-r 原样输出 + @csv', false, String(e.message)); }
  try {
    await q('null', '.a | tonumber');
    ok('运行期错误 exit 5 必须抛出', false, '竞未抛错');
  } catch (e) { ok('运行期错误 exit 5 必须抛出', Boolean(e && e.jq), String(e.message).slice(0, 80)); }
  try {
    await q('null', '.a ++');
    ok('语法错误必须抛出', false, '竞未抛错');
  } catch (e) { ok('语法错误必须抛出', Boolean(e && e.jq && /syntax|compile/i.test(String(e.message))), String(e.message).slice(0, 80)); }
  try {
    const g = await q('null', '$x + $y.v', ['-n', '--argjson', 'x', '4', '--argjson', 'y', '{"v":38}']);
    ok('--arg/--argjson 注入', g.trim() === '42', g);
  } catch (e) { ok('--arg/--argjson 注入', false, String(e.message)); }
  try {
    const h = await q('1700000000', 'todate | startswith("2023-11-14")');
    ok('时间函数 todate', h.trim() === 'true', h);
  } catch (e) { ok('时间函数 todate', false, String(e.message)); }
  try {
    const i = await q('"id=42x"', 'capture("(?<n>[0-9]+)") | .n');
    ok('正则 capture 命名组', i.trim() === '"42"', i);
  } catch (e) { ok('正则 capture 命名组', false, String(e.message)); }
  // 超时击杀 + 重生成（护栏语义本体就是被测对象）
  const statsBefore = engine.stats().timeouts;
  try {
    await engine.run({ input: '0', query: '[repeat(.+1)]', flags: [], timeoutMs: 800 });
    ok('死查询必须被超时击杀', false, '竞未超时');
  } catch (e) {
    ok('死查询必须被超时击杀', Boolean(e && e.timeout), String(e.message).slice(0, 80));
  }
  ok('超时计数 +1', engine.stats().timeouts === statsBefore + 1, `before=${statsBefore} after=${engine.stats().timeouts}`);
  try {
    const k = await q('{"v":[10,20]}', '.v | add');
    ok('击杀后引擎重生成可用', k.trim() === '30', k);
  } catch (e) { ok('击杀后引擎重生成可用', false, String(e.message)); }
  try {
    const l = engineApi.normalizeFlags(['-rn']);
    ok('聚合式 flags 展开', l.ok && l.flags.join(' ') === '-r -n', JSON.stringify(l.flags));
  } catch (e) { ok('聚合式 flags 展开', false, String(e.message)); }
  try {
    const m = outlineFromText('{"rows":[{"id":1},{"id":2},{"id":3}]}', { depth: 2 }).node;
    ok('outline 元素键并集', m.children[0].elementKeys && m.children[0].elementKeys[0] === 'id', JSON.stringify(m.children[0].elementKeys));
  } catch (e) { ok('outline 元素键并集', false, String(e.message)); }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  return { pass, fail, total: results.length, results, engine: engine.stats() };
}

// ── HTTP 骨架 ───────────────────────────────────────────────────────────────
function sendJson(res, code, obj, extraHeaders) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    ...(extraHeaders || {}),
  });
  res.end(data);
}
function fail(res, code, msg) { sendJson(res, code, { ok: false, error: msg }); }

function authed(req) {
  return String(req.headers['x-jq-query-token'] || '') === token;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on('data', (c) => {
      if (exceeded) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        exceeded = true;
        chunks.length = 0;
        req.removeAllListeners('data');
        req.resume();
        reject(userErr('请求体超限（输入上限 64MB）'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (exceeded) return;
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(userErr('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') {
    // web 构建加固：面板若在浏览器 origin，直接 fetch 需预检放行
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-jq-query-token',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }
  try {
    if (url === '/__health') {
      sendJson(res, 200, { ok: true, version: VERSION, uptimeMs: Math.round(process.uptime() * 1000), engine: engine.stats() });
      return;
    }
    if (!url.startsWith('/api/')) { fail(res, 404, '未知路径'); return; }
    if (!authed(req)) { fail(res, 401, '缺少或错误的 token（面板应从 cap.kv jq-query.meta 读取）'); return; }

    const body = await readBody(req);
    switch (url) {
      case '/api/query': {
        const r = await doQuery(body);
        log('info', `query ok ms=${r.ms} in=${r.inputBytes}B docs=${r.inputDocs} out=${r.rawBytes}B${r.truncated ? ' TRUNCATED' : ''}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/check': {
        const r = await doCheck(body);
        log('info', `check syntaxOk=${r.syntaxOk}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/outline': {
        const r = await doOutline(body);
        log('info', `outline depth=${r.depth}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/reference': {
        const kw = typeof body.keyword === 'string' ? body.keyword : '';
        const r = searchReference(kw, engineApi.LIMITS.REFERENCE_RESULT_CAP);
        sendJson(res, 200, { ok: true, keyword: kw, ...r, rendered: renderReference(r.entries) });
        return;
      }
      case '/api/selftest': {
        const r = await doSelftest();
        log('info', `selftest pass=${r.pass}/${r.total} timeouts=${r.engine.timeouts}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      default:
        fail(res, 404, `未知 API ${url}`);
    }
  } catch (err) {
    const isUser = err && err.user;
    log(isUser ? 'info' : 'error', `${url} ${isUser ? '拒绝' : '内部错误'}: ${err && err.message}`);
    fail(res, isUser ? 400 : 500, (err && err.message) || '内部错误');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : PORT;
  log('info', `service listening on 127.0.0.1:${port} (version ${VERSION})`);
  kv.kvSet(KEY_META, {
    token, port, version: VERSION,
    startedAt: new Date().toISOString(),
  }).then(() => log('info', 'meta 写入 cap.kv 成功'))
    .catch((e) => log('warn', `meta 写 cap.kv 失败（桥降级，面板将显示离线）: ${e && e.message}`));
});

process.on('uncaughtException', (e) => log('error', `uncaught: ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`));
function shutdown() {
  log('info', '收到退出信号，关闭服务');
  engine.shutdown().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
