#!/usr/bin/env node
'use strict';
/**
 * main.js —— Webhook 调试台后台服务（零依赖，node >= 18）
 *
 * 职责：
 *   - 捕获服务（0.0.0.0:<port>）：ANY /hook/<bucketSecret> 收下入站回调，
 *     按 bucket 应答（fixed 固定应答 / forward 转发到本地应用并镜像上游响应）
 *   - 全量留痕：dataRoot 兄弟目录 polaris-webhook/captures.jsonl（8MB 轮转 .old）
 *   - 预览镜像：cap.kv whs.rec.<n> 分块（面板跨端读；单写者=本进程）
 *   - tick 主循环（4s）：settings 热更(5s) → 消费命令键(先删后做) → rec 镜像 →
 *     meta 心跳(60s)
 *   - /__health 恒 200：bridge 不可达也活着（降级语义见 meta.degraded），
 *     捕获/转发不依赖 bridge——JSONL 是权威，kv 只是跨端投影
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js <port> <appConfigDir>
 * 安全边界：服务不提供任何 CORS 开放的读 API（攻击面仅 /__health + 捕获端点），
 * 捕获内容只落本机（JSONL + 本机 sqlite kv），无外发路径。
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 4000;
const SETTINGS_REREAD_MS = 5 * 1000;   // 转发配置改完 5s 内生效
const META_BEAT_MS = 60 * 1000;
const ROTATE_BYTES = 8 * 1024 * 1024;

const K = {
  settings: 'whs.settings',
  meta: 'whs.meta',
  idx: 'whs.idx',
};
const REC_PREFIX = 'whs.rec.';
const CMD_PREFIX = 'whs.cmd.';
const RESULT_PREFIX = 'whs.result.';

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'webhook-station.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.WHS_DEBUG === '1';
function log(level, msg) {
  // 纪律：日志不落 payload 内容与完整 secret（掩码显示）
  const line = `[webhook-station:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}
function maskSecret(s) {
  const t = String(s || '');
  return t.length >= 8 ? `${t.slice(0, 4)}****${t.slice(-4)}` : '****';
}

// ── 存储目录：anchor.json → dataRoot 兄弟目录（不污染备份源），兜底 appConfigDir ──
function resolveDataRoot() {
  const cands = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ];
  for (const c of cands) {
    if (!c) continue;
    try {
      const a = JSON.parse(fs.readFileSync(c, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot && fs.existsSync(a.dataRoot)) return a.dataRoot;
    } catch (_) { /* 跳过不可读候选 */ }
  }
  return '';
}
function resolveStoreDir(appConfigDir) {
  // WHS_STORE_DIR 仅供冒烟测试隔离存储（生产路径= dataRoot 兄弟目录）
  if (process.env.WHS_STORE_DIR) return process.env.WHS_STORE_DIR;
  const dataRoot = resolveDataRoot();
  return dataRoot ? path.join(path.dirname(dataRoot), 'polaris-webhook') : path.join(appConfigDir || os.tmpdir(), 'webhook-station');
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

if (!PORT) {
  process.stderr.write('[webhook-station:fatal] 缺少端口参数（宿主应注入 {{port}}）\n');
  process.exit(1);
}
initLog(APP_CONFIG_DIR);

const STORE_DIR = resolveStoreDir(APP_CONFIG_DIR);
const CAPTURES_FILE = path.join(STORE_DIR, 'captures.jsonl');
const CAPTURES_OLD = `${CAPTURES_FILE}.old`;

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

let settings = core.normalizeSettings(null);
let settingsLoaded = false;
let ring = [];              // 最近捕获预览（新在前），唯一权威=JSONL，kv 为跨端投影
let ringDirty = false;
let prevChunkCount = 0;
let capturesTotal = 0;
let lastCaptureAt = 0;
let degraded = false;
let lastEndpointRefreshAt = 0;
let settingsReadAt = 0;
let lastMetaAt = 0;
const startedAt = Date.now();

// ── JSONL（权威全量；append 为主，删除/清空走原子重写）──────────────────────
function initStore() {
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) { log('warn', `存储目录创建失败: ${e.message}`); }
}
function fileBytes(f) {
  try { return fs.statSync(f).size; } catch (_) { return 0; }
}
function appendCapture(rec) {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.appendFileSync(CAPTURES_FILE, JSON.stringify(rec) + '\n');
    if (fileBytes(CAPTURES_FILE) > ROTATE_BYTES) {
      try { fs.renameSync(CAPTURES_FILE, CAPTURES_OLD); log('info', 'captures.jsonl 已轮转到 .old'); } catch (_) { /* 下一轮再试 */ }
    }
    return true;
  } catch (e) {
    log('warn', `captures.jsonl 追加失败: ${e.message}`);
    return false;
  }
}
function iterLines(file, cb) {
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  for (const line of raw.split('\n')) {
    const rec = core.parseJsonlLine(line);
    if (rec) cb(rec);
  }
}
/** 按 id 找全量捕获记录（当前文件优先，其次 .old） */
function findById(id) {
  let found = null;
  iterLines(CAPTURES_FILE, (r) => { if (!found && r.id === id) found = r; });
  if (!found) iterLines(CAPTURES_OLD, (r) => { if (!found && r.id === id) found = r; });
  return found;
}
/** 原子重写 JSONL（只保留 filterFn 为真的行）；返回保留条数 */
function rewriteJsonl(filterFn) {
  let kept = 0;
  const lines = [];
  for (const f of [CAPTURES_OLD, CAPTURES_FILE]) {
    iterLines(f, (r) => { if (filterFn(r)) { kept += 1; lines.push(JSON.stringify(r)); } });
    if (f === CAPTURES_OLD) { try { fs.unlinkSync(CAPTURES_OLD); } catch (_) { /* 无文件 */ } }
  }
  const tmp = `${CAPTURES_FILE}.tmp`;
  fs.writeFileSync(tmp, lines.length ? lines.join('\n') + '\n' : '');
  fs.renameSync(tmp, CAPTURES_FILE);
  return kept;
}

// ── kv 镜像（rec 分块 + idx；服务是唯一写者）────────────────────────────────
async function mirrorRing() {
  if (!ringDirty) return;
  const plan = core.planChunkWrites(ring, prevChunkCount);
  for (const p of plan) {
    try {
      if (p.value === null) await kv.kvDel(p.key);
      else await kv.kvSet(p.key, p.value);
    } catch (e) {
      log('warn', `rec 镜像写失败（下轮重试）${p.key}: ${e.message}`);
      return; // 保持 dirty，下轮继续
    }
  }
  prevChunkCount = Math.ceil(ring.length / core.CHUNK_SIZE);
  try {
    await kv.kvSet(K.idx, {
      count: ring.length,
      total: capturesTotal,
      chunkCount: prevChunkCount,
      oldestAt: ring.length ? ring[ring.length - 1].receivedAt : 0,
      updatedAt: Date.now(),
    });
  } catch (e) { log('warn', `idx 写失败（下轮重试）: ${e.message}`); return; }
  ringDirty = false;
}

// ── settings（面板/MCP 写；服务仅键缺失时引导写默认桶）──────────────────────
async function ensureSettings() {
  // 双读防竞态：读取瞬断时绝不引导写默认桶（否则可能覆盖用户既有桶）
  let raw = await kv.kvGet(K.settings).catch(() => null);
  if (!raw) raw = await kv.kvGet(K.settings).catch(() => null);
  if (raw && typeof raw === 'object' && Array.isArray(raw.buckets)) {
    settings = core.normalizeSettings(raw);
    settingsLoaded = true;
    return;
  }
  // 首次引导：生成默认桶并写入（仅当键确实缺失时执行一次）
  settings = core.bootstrapSettings(raw);
  try {
    await kv.kvSet(K.settings, settings);
    log('info', `首次运行：已生成默认桶 default（secret=${maskSecret(settings.buckets[0].secret)}）`);
  } catch (e) {
    log('warn', `初始 settings 写入失败: ${e.message}`);
  }
  settingsLoaded = true;
}

// ── 转发引擎（转发与重放共用；不跟随重定向；响应限长限速）────────────────────
function forwardRequest(targetUrl, method, headers, bodyBuf) {
  const v = core.validateForwardUrl(targetUrl);
  if (!v.ok) return Promise.resolve({ ok: false, error: v.error, status: 0, latencyMs: 0 });
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const u = new URL(v.url);
    const mod = u.protocol === 'https:' ? https : http;
    const fwdHeaders = core.filterForwardHeaders(headers);
    if (bodyBuf && bodyBuf.length > 0) fwdHeaders['Content-Length'] = String(bodyBuf.length);
    let req;
    try {
      req = mod.request(
        { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method, headers: fwdHeaders, timeout: core.FORWARD_TIMEOUT_MS },
        (res) => {
          const chunks = [];
          let received = 0;
          let over = false;
          res.on('data', (c) => {
            received += c.length;
            if (received > core.RESP_BODY_CAP) { over = true; req.destroy(); return; }
            chunks.push(c);
          });
          res.on('end', () => {
            if (over) { done({ ok: false, error: `上游响应超过 ${Math.round(core.RESP_BODY_CAP / 1048576)}MB 上限`, status: res.statusCode || 0, latencyMs: Date.now() - t0 }); return; }
            done({
              ok: true,
              status: res.statusCode || 0,
              contentType: res.headers['content-type'] || '',
              body: Buffer.concat(chunks),
              latencyMs: Date.now() - t0,
            });
          });
          res.on('error', (e) => done({ ok: false, error: `上游响应读取失败: ${e.message}`, status: res.statusCode || 0, latencyMs: Date.now() - t0 }));
        },
      );
    } catch (e) {
      done({ ok: false, error: `转发请求构造失败: ${e.message}`, status: 0, latencyMs: Date.now() - t0 });
      return;
    }
    req.on('timeout', () => { req.destroy(new Error(`转发超时（${core.FORWARD_TIMEOUT_MS / 1000}s）`)); });
    req.on('error', (e) => done({ ok: false, error: `转发失败: ${e.message}`, status: 0, latencyMs: Date.now() - t0 }));
    if (bodyBuf && bodyBuf.length > 0) req.write(bodyBuf);
    req.end();
  });
}
function recBodyBuf(rec) {
  if (rec.kind === 'text' && rec.bodyText) return Buffer.from(rec.bodyText, 'utf8');
  if (rec.kind === 'binary' && rec.bodyBase64) {
    try { return Buffer.from(rec.bodyBase64, 'base64'); } catch (_) { return Buffer.alloc(0); }
  }
  return Buffer.alloc(0);
}
function previewText(buf, contentType, cap) {
  const r = core.classifyBody(contentType, buf, cap || 8 * 1024);
  return r.kind === 'text' ? r.bodyText : `（二进制 ${r.size}B）`;
}

// ── 捕获处理 ───────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
function findBucketBySecret(secret) {
  return settings.buckets.find((b) => b.secret === secret) || null;
}

function handleHook(req, res, url, secret, subPath) {
  const bucket = findBucketBySecret(secret);
  if (!bucket) {
    sendJson(res, 404, { ok: false, error: '未知捕获地址（检查 secret 是否正确，桶列表见面板）' });
    req.resume();
    return;
  }
  const chunks = [];
  let received = 0;
  let aborted = false;
  req.on('data', (c) => {
    if (aborted) return;
    received += c.length;
    if (received > core.REQ_BODY_CAP) {
      aborted = true;
      sendJson(res, 413, { ok: false, error: `请求体超过 ${Math.round(core.REQ_BODY_CAP / 1048576)}MB 上限` });
      setTimeout(() => req.destroy(), 300); // 留 300ms flush 413，否则对端只见网络错误
    } else {
      chunks.push(c);
    }
  });
  req.on('error', () => { aborted = true; });
  req.on('end', async () => {
    if (aborted) return;
    const bodyBuf = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const cls = core.classifyBody(contentType, bodyBuf, settings.retention.bodyCapKb * 1024);
    const base = core.normalizeCapture({
      bucketId: bucket.id,
      method: req.method,
      path: url.pathname,
      query: url.search ? url.search.slice(1) : '',
      headers: req.headers,
      sourceIp: clientIp(req),
      contentType,
      kind: cls.kind,
      size: cls.size,
      truncated: cls.truncated,
      bodyText: cls.bodyText,
      bodyBase64: cls.bodyBase64,
    });

    let responded = null;
    let forwardInfo = null;
    if (bucket.responseMode === 'forward' && bucket.forwardUrl) {
      const fr = await forwardRequest(bucket.forwardUrl, req.method, req.headers, bodyBuf);
      forwardInfo = {
        url: bucket.forwardUrl,
        status: fr.status,
        ok: fr.ok === true,
        latencyMs: fr.latencyMs,
        error: fr.error || undefined,
        bodyPreview: fr.ok ? previewText(fr.body, fr.contentType) : undefined,
      };
      if (fr.ok) {
        responded = { status: fr.status, mode: 'forward' };
        const headersOut = { 'Content-Type': fr.contentType || 'application/octet-stream' };
        res.writeHead(fr.status, headersOut);
        res.end(fr.body);
      } else {
        responded = { status: 502, mode: 'forward' };
        sendJson(res, 502, { ok: false, error: fr.error || '转发失败', target: bucket.forwardUrl });
      }
    } else {
      const body = bucket.fixedBody || JSON.stringify({ received: true, id: base.id });
      const isJson = /^\s*[[{]/.test(body);
      responded = { status: bucket.fixedStatus, mode: 'fixed' };
      res.writeHead(bucket.fixedStatus, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' });
      res.end(body);
    }

    base.responded = responded;
    base.forward = forwardInfo;
    appendCapture(base);
    const r = core.applyCapture(ring, core.previewForKv(base), settings.retention.maxPerBucket);
    ring = r.ring;
    ringDirty = true;
    capturesTotal += 1;
    lastCaptureAt = base.receivedAt;
    log('info', `捕获 ${base.method} ${maskSecret(secret)}${subPath || ''} (${bucket.id}) → ${responded.status}${forwardInfo ? (forwardInfo.ok ? ` 转发${forwardInfo.status} ${forwardInfo.latencyMs}ms` : ` 转发失败`) : ''} 来自 ${base.sourceIp} 体 ${base.size}B`);
  });
}

// ── 命令消费（先删后做；结果写 result 键）──────────────────────────────────
async function consumeCommands() {
  const keys = await kv.kvKeys();
  const cmdKeys = keys.filter((k) => k.startsWith(CMD_PREFIX));
  for (const k of cmdKeys) {
    const cmd = await kv.kvGet(k).catch(() => null);
    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);
    if (!delOk) continue; // 别人抢到了，跳过
    if (!cmd || typeof cmd !== 'object') continue;
    const nonce = String(cmd.nonce || k.slice(CMD_PREFIX.length).split('.').pop() || 'unknown');
    const resultKey = `${RESULT_PREFIX}${nonce}`;
    log('info', `消费命令 ${k}`);
    try {
      if (cmd.op === 'replay') await cmdReplay(cmd, resultKey);
      else if (cmd.op === 'clear') await cmdClear(cmd, resultKey);
      else if (cmd.op === 'drop_capture') await cmdDropCapture(cmd, resultKey);
      else await kv.kvSet(resultKey, { ok: false, error: `未知命令 op=${cmd.op}`, at: Date.now() }).catch(() => {});
    } catch (e) {
      log('warn', `命令 ${k} 执行失败: ${e.message}`);
      await kv.kvSet(resultKey, { ok: false, error: e.message, at: Date.now() }).catch(() => {});
    }
  }
  // 清理过期结果键（>1h 无人认领）
  const resultKeys = keys.filter((k) => k.startsWith(RESULT_PREFIX));
  for (const k of resultKeys) {
    const v = await kv.kvGet(k).catch(() => null);
    if (v && typeof v === 'object' && v.at && Date.now() - v.at > 3600 * 1000) {
      await kv.kvDel(k).catch(() => {});
    }
  }
}

/** replay：把已捕获的请求原样重发到目标（默认桶 forwardUrl） */
async function cmdReplay(cmd, resultKey) {
  const rec = findById(String(cmd.captureId || ''));
  if (!rec) throw new Error(`捕获记录不存在（可能已被清理或轮转）: ${cmd.captureId}`);
  const bucketId = cmd.bucketId || rec.bucketId;
  const bucket = settings.buckets.find((b) => b.id === bucketId);
  const target = String(cmd.targetUrl || '').trim() || (bucket && bucket.forwardUrl) || '';
  if (!target) throw new Error('未指定重放目标 targetUrl，且该桶未配置转发地址（先在面板配 forwardUrl 或显式传 targetUrl）');
  const fr = await forwardRequest(target, rec.method, rec.headers, recBodyBuf(rec));
  await kv.kvSet(resultKey, {
    ok: fr.ok === true,
    captureId: rec.id,
    target,
    status: fr.status,
    latencyMs: fr.latencyMs,
    bodyPreview: fr.ok ? previewText(fr.body, fr.contentType) : undefined,
    error: fr.error || undefined,
    at: Date.now(),
  }).catch((e) => log('warn', `replay 结果写失败: ${e.message}`));
  log('info', `重放 ${rec.id} → ${target} ${fr.ok ? fr.status : '失败'}`);
}

/** clear：清空某桶捕获（必须显式 confirm） */
async function cmdClear(cmd, resultKey) {
  if (cmd.confirm !== true) throw new Error('清空桶捕获是不可逆操作，必须传 confirm:true');
  const bucketId = String(cmd.bucketId || '');
  if (!core.isValidBucketId(bucketId)) throw new Error(`非法 bucketId: ${bucketId}`);
  const kept = rewriteJsonl((r) => r.bucketId !== bucketId);
  ring = ring.filter((r) => r.bucketId !== bucketId);
  ringDirty = true;
  await kv.kvSet(resultKey, { ok: true, kept, at: Date.now() }).catch(() => {});
  log('info', `清空桶 ${bucketId}（保留其它桶 ${kept} 条）`);
}

/** drop_capture：删除单条捕获 */
async function cmdDropCapture(cmd, resultKey) {
  const id = String(cmd.captureId || '');
  const kept = rewriteJsonl((r) => r.id !== id);
  ring = ring.filter((r) => r.id !== id);
  ringDirty = true;
  await kv.kvSet(resultKey, { ok: true, kept, at: Date.now() }).catch(() => {});
  log('info', `删除捕获 ${id}`);
}

// ── HTTP 服务（攻击面仅 /__health + 捕获端点；无 CORS 读 API）───────────────
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'bad request' });
    return;
  }
  const pathname = url.pathname;
  if (pathname === '/__health') {
    sendJson(res, 200, {
      ok: true, version: VERSION, degraded,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      captures: ring.length, buckets: settings.buckets.length, port: PORT,
    });
    return;
  }
  const m = /^\/hook\/([0-9a-f]{12})(\/.*)?$/.exec(pathname);
  if (m) {
    handleHook(req, res, url, m[1], m[2] || '');
    return;
  }
  sendJson(res, 404, { ok: false, error: 'not found（捕获地址形如 /hook/<secret>）' });
  req.resume();
});

// 端口被占用：诚实失败退出（健康检查固定在声明端口，换端口会漂移导致重启循环）
server.on('error', (e) => {
  log('error', `服务端口 ${PORT} 监听失败: ${e.message}（被占用时请释放 ${PORT} 或在设置里停用服务）`);
  process.exit(1);
});

// ── tick 主循环 ────────────────────────────────────────────────────────────
function lanIps() {
  const out = [];
  const ni = os.networkInterfaces();
  for (const name of Object.keys(ni)) {
    for (const f of ni[name] || []) {
      if (f.family === 'IPv4' && !f.internal) out.push(f.address);
    }
  }
  return out;
}

async function tick() {
  try {
    if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS || !settingsLoaded) {
      await ensureSettings();
      settingsReadAt = Date.now();
    }

    await consumeCommands();
    await mirrorRing();

    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        degraded,
        port: PORT,
        lanIp: core.pickLanIp(os.networkInterfaces()),
        lanUrls: lanIps(),
        storeDir: STORE_DIR,
        filePath: CAPTURES_FILE,
        fileBytes: fileBytes(CAPTURES_FILE),
        capturesTotal,
        lastCaptureAt,
        settings,
      }).catch((e) => log('warn', `meta 心跳失败: ${e.message}`));
    }

    if (degraded) {
      degraded = false;
      log('info', 'bridge 已恢复');
    }
  } catch (e) {
    const wasDown = degraded;
    degraded = true;
    log('warn', `tick 降级: ${e.message}`);
    if (!wasDown || Date.now() - lastEndpointRefreshAt > 60 * 1000) {
      if (!wasDown) log('info', 'bridge 不可达，进入降级（捕获/转发不受影响，健康端点保持 200）');
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  }
}

// ── 生命周期 ───────────────────────────────────────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

initStore();
server.listen(PORT, '0.0.0.0', () => {
  const lan = core.pickLanIp(os.networkInterfaces());
  log('info', `Webhook 调试台服务 v${VERSION} (pid=${process.pid}) 端口 ${PORT}，存储 ${STORE_DIR}`);
  log('info', `本机入口 http://127.0.0.1:${PORT}  局域网入口 ${lan ? `http://${lan}:${PORT}` : '（未检测到局域网 IPv4）'}`);
});
setInterval(tick, TICK_MS);
