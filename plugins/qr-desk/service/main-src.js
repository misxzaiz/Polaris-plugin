'use strict';
/**
 * main-src.js —— 二维码工作台（qr-desk）后台服务（esbuild bundle → service/main.js）
 *
 * 职责：
 *   - 面板字节面：/api/generate（SVG+PNG+终端预览，可落盘）、/api/decode（PNG/JPEG→载荷+解读）、
 *     /api/inspect（文本→类型+字段+OTP 实时码）、/api/batch（CSV/JSON→异步出码 job）、
 *     /api/selftest（试金石 12 断言）。
 *   - MCP 与本服务共用 shared/ 引擎（MCP 不经 HTTP，直接 require）。
 *   - kv：qr-desk.meta（token/port，面板读取）、qr-desk.settings（默认出图目录，仅读）。
 *
 * 安全底线：
 *   - 只绑 127.0.0.1；除 /__health 外全部要求 x-qr-desk-token（meta 写入 cap.kv 供面板取）。
 *   - 日志只记类型/尺寸/数量，绝不记载荷内容（WiFi 密码/2FA secret 不落盘不进日志）。
 *   - 输出永不覆盖（冲突 -2 递增）；只写用户指定的 outDir。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入）
 * 健康检查：GET /__health 恒 200。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/core.js');
const render = require('../shared/render.js');
const image = require('../shared/image.js');
const { generateOne, uniquePath } = require('../shared/generate.js');
const { runSelftest } = require('../shared/selftest.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'qr-desk';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;
const BODY_LIMIT = 16 * 1024 * 1024; // base64 后 10MB 图 ≈ 13.4MB，留余量
const JOB_RING = 10; // 内存任务环：只留最近 10 个批量任务

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志（宿主不收集 stdout/stderr，自落盘 + 512KB 轮转；绝不记录载荷内容）──
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

// ── 桥（降级不致命：核心能力不依赖 kv）────────────────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const PREFIX = PLUGIN_ID + '.';
const KEY_META = PREFIX + 'meta';
const KEY_SETTINGS = PREFIX + 'settings';
// 测试钩子（yizhou 惯例）：仅 service-verify 冒烟注入；生产路径恒为随机 token
const token = process.env.QR_DESK_TEST_TOKEN || crypto.randomBytes(16).toString('hex');

// ── 输出文件：路径安全与永不覆盖 ───────────────────────────────────────────
function safeOutDir(dir) {
  if (!dir || typeof dir !== 'string') { const e = new Error('需要输出目录 outDir（绝对路径）'); e.user = true; throw e; }
  if (!path.isAbsolute(dir)) { const e = new Error(`outDir 必须是绝对路径，收到 ${dir}`); e.user = true; throw e; }
  if (dir.includes('\0')) { const e = new Error('outDir 含非法字符'); e.user = true; throw e; }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── 生成（单张，同步；唯一权威实现在 shared/generate.js）───────────────────
function doGenerate(body) {
  return generateOne(body);
}

// ── 解码 ────────────────────────────────────────────────────────────────────
function doDecode(body) {
  let buf;
  if (body.imageBase64 != null && body.imageBase64 !== '') {
    buf = Buffer.from(String(body.imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
  } else if (body.imagePath) {
    const p = String(body.imagePath);
    if (!path.isAbsolute(p)) { const e = new Error('imagePath 必须是绝对路径'); e.user = true; throw e; }
    buf = fs.readFileSync(p); // 超限时由 decodeImage 统一报错
  } else {
    const e = new Error('需要 imageBase64（面板拖拽/粘贴）或 imagePath（文件路径）'); e.user = true; throw e;
  }
  const r = image.decodeQrFromImage(buf);
  const base = { found: r.found, width: r.width, height: r.height, format: r.format, corners: r.corners || null };
  if (!r.found) {
    return { ...base, message: '图中未找到二维码（支持自动反色检测；确认图内码占比足够大、清晰完整）' };
  }
  // 解读：载荷是不可信文本，只结构化返回；解析失败不影响返回原始载荷
  let inspected = null;
  try { inspected = core.inspect(r.payload); } catch (_) { inspected = null; }
  return { ...base, payload: r.payload, inspected };
}

// ── 批量（异步 job：进度可轮询）────────────────────────────────────────────
const jobs = new Map(); // id → job
function jobSnapshot(j) {
  return {
    id: j.id, status: j.status, total: j.total, done: j.done,
    outDir: j.outDir, files: j.files.slice(0, 500), error: j.error,
    startedAt: j.startedAt, finishedAt: j.finishedAt,
  };
}

function doBatchStart(body) {
  // 行数据：rows（对象数组）或 csv（文本，首行表头）
  let rows = body.rows;
  if (!Array.isArray(rows) && typeof body.csv === 'string') {
    rows = core.csvToObjects(body.csv).rows;
  }
  const plan = core.planBatch({
    rows,
    template: body.template,
    fileBase: body.fileBase,
    nameCol: body.nameCol,
  });
  const dir = safeOutDir(body.outDir);
  const scale = Math.max(2, Math.min(20, Number(body.scale == null ? 8 : body.scale)));
  const ecl = body.ecl || 'M';
  const margin = Math.max(0, Math.min(10, Number(body.margin == null ? 4 : body.margin)));
  const job = {
    id: crypto.randomUUID(), status: 'running', total: plan.length, done: 0,
    files: [], error: null, outDir: dir,
    startedAt: new Date().toISOString(), finishedAt: null,
  };
  jobs.set(job.id, job);
  while (jobs.size > JOB_RING) {
    const oldest = jobs.keys().next().value;
    jobs.delete(oldest);
  }
  // 后台执行：逐行出码写盘（服务单线程，批量任务不阻塞健康检查——Node 事件循环天然交错）
  setImmediate(() => {
    try {
      for (const item of plan) {
        const m = render.qrMatrix(item.payload, ecl);
        const png = render.pngFromMatrix(m, { margin, scale });
        const p = uniquePath(dir, item.fileName);
        fs.writeFileSync(p, png);
        job.files.push({ file: p, bytes: png.length });
        job.done += 1;
      }
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = (err && err.message) || String(err);
    }
    job.finishedAt = new Date().toISOString();
    log('info', `batch job ${job.id}: ${job.status} ${job.done}/${job.total} → ${job.outDir}`);
  });
  return { jobId: job.id, total: job.total, outDir: dir };
}

function doJobQuery(id) {
  const j = jobs.get(String(id || ''));
  if (!j) { const e = new Error('任务不存在或已被清理（服务仅保留最近 10 个）'); e.user = true; throw e; }
  return jobSnapshot(j);
}

// ── 设置（默认出图目录；面板经 cap.kv 写，服务只读）────────────────────────
async function readSettings() {
  try {
    const s = await kv.kvGet(KEY_SETTINGS);
    if (s && typeof s === 'object') return s;
  } catch (_) { /* 桥降级：用空设置 */ }
  return {};
}

// ── HTTP 骨架 ───────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}
function fail(res, code, msg) { sendJson(res, code, { ok: false, error: msg }); }

function authed(req) {
  return String(req.headers['x-qr-desk-token'] || '') === token;
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
        // 不 destroy：摘掉 data 监听并排空，让 400 能送回客户端
        exceeded = true;
        chunks.length = 0;
        req.removeAllListeners('data');
        req.resume();
        reject(Object.assign(new Error('请求体超限（图像上限 10MB）'), { user: true }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (exceeded) return; // 已 reject
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(Object.assign(new Error('请求体不是合法 JSON'), { user: true })); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  try {
    if (url === '/__health') { sendJson(res, 200, { ok: true, version: VERSION, uptimeMs: Math.round(process.uptime() * 1000) }); return; }
    if (!url.startsWith('/api/')) { fail(res, 404, '未知路径'); return; }
    if (!authed(req)) { fail(res, 401, '缺少或错误的 token（面板应从 cap.kv qr-desk.meta 读取）'); return; }
    if (req.method !== 'POST' && url !== '/api/job') { fail(res, 405, ` ${url} 需要 POST`); return; }

    if (url === '/api/job') {
      const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
      sendJson(res, 200, { ok: true, job: doJobQuery(id) });
      return;
    }

    const body = await readBody(req);
    switch (url) {
      case '/api/generate': {
        const r = doGenerate(body);
        log('info', `generate ecl=${r.meta.ecl} modules=${r.meta.modules} bytes=${r.meta.bytes}${r.savedTo ? ` → saved ${r.savedTo.length}` : ''}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/decode': {
        const r = doDecode(body);
        log('info', `decode ${r.format || '?'} ${r.width}x${r.height} found=${r.found}${r.found && r.inspected ? ` type=${r.inspected.type}` : ''}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/inspect': {
        const r = core.inspect(String(body.text == null ? '' : body.text));
        log('info', `inspect type=${r.type} bytes=${r.byteLength}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/batch': {
        const settings = await readSettings();
        const outDir = body.outDir || settings.outDir;
        const r = doBatchStart({ ...body, outDir });
        log('info', `batch start job=${r.jobId} total=${r.total} → ${r.outDir}`);
        sendJson(res, 200, { ok: true, ...r });
        return;
      }
      case '/api/selftest': {
        const r = runSelftest();
        log('info', `selftest pass=${r.pass} fail=${r.fail}`);
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
  // meta 写 cap.kv（面板取 token/port；桥降级时面板走重试/重启）
  kv.kvSet(KEY_META, {
    token, port, version: VERSION,
    startedAt: new Date().toISOString(),
  }).then(() => log('info', 'meta 写入 cap.kv 成功'))
    .catch((e) => log('warn', `meta 写 cap.kv 失败（桥降级，面板将显示离线）: ${e && e.message}`));
});

// ── 进程护栏 ────────────────────────────────────────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaught: ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`));
function shutdown() {
  log('info', '收到退出信号，关闭服务');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
