#!/usr/bin/env node
'use strict';
/**
 * main.js —— 链路追踪台后台服务（零依赖，node >= 18）
 *
 * 职责：
 *   - OTLP/HTTP-JSON 接收器（127.0.0.1:<port>）：POST /v1/traces 收
 *     ExportTraceServiceRequest JSON，归一化后落 spans.jsonl（权威全量，8MB 轮转）
 *   - 聚合：内存 traceIndex（traceId → 概览），启动全量扫 JSONL 重建，ingest 增量更新
 *   - kv 投影：tl.meta（心跳+统计）、tl.idx、tl.rec.*（trace 概览分块）、
 *     tl.trace.<id>（最近 TRACE_FULL_KV_LIMIT 条全文，面板跨端读）；单写者=本进程
 *   - tick 主循环（4s）：消费命令键（clear_all/drop_trace，先删后做）→ rec 镜像 →
 *     全文投影修剪 → meta 心跳（60s）
 *   - /__health 恒 200：bridge 不可达也活着（降级收数不中断——接收/落盘不依赖 bridge）
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js <port> <appConfigDir>
 * 安全边界：只绑 127.0.0.1（跨机采集不是本插件场景）；除 /__health 与 OTLP 端点外
 * 不提供任何读 API（读走 kv 投影 / MCP 直读 JSONL），无外发路径。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 4000;
const META_BEAT_MS = 60 * 1000;
const ROTATE_BYTES = 8 * 1024 * 1024;
const REQ_BODY_CAP = 32 * 1024 * 1024; // 单批 OTLP 请求上限（大批量上报防御）

const K = {
  meta: 'tl.meta',
  idx: 'tl.idx',
};
const REC_PREFIX = 'tl.rec.';
const TRACE_PREFIX = 'tl.trace.';
const CMD_PREFIX = 'tl.cmd.';
const RESULT_PREFIX = 'tl.result.';

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'trace-lens.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.TRACE_LENS_DEBUG === '1';
function log(level, msg) {
  // 纪律：日志不落 span 内容（属性可能含 prompt/敏感数据），只落统计与路径
  const line = `[trace-lens:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
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
  // TRACE_LENS_STORE_DIR 仅供冒烟测试隔离存储（生产路径= dataRoot 兄弟目录）
  if (process.env.TRACE_LENS_STORE_DIR) return process.env.TRACE_LENS_STORE_DIR;
  const dataRoot = resolveDataRoot();
  return dataRoot ? path.join(path.dirname(dataRoot), 'polaris-trace') : path.join(appConfigDir || os.tmpdir(), 'trace-lens');
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

if (!PORT) {
  process.stderr.write('[trace-lens:fatal] 缺少端口参数（宿主应注入 {{port}}）\n');
  process.exit(1);
}
initLog(APP_CONFIG_DIR);

const STORE_DIR = resolveStoreDir(APP_CONFIG_DIR);
const SPANS_FILE = path.join(STORE_DIR, 'spans.jsonl');
const SPANS_OLD = `${SPANS_FILE}.old`;

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

// traceId → 概览（内存索引；JSONL 是权威，重启全量重建）
const traceIndex = new Map(); // traceId → { summary, spanIds:Set }
let spansTotal = 0;
let lastSpanAt = 0;
let ringDirty = false;
let prevChunkCount = 0;
let fullKvIds = []; // 全文投影 LRU（新在前）
let degraded = false;
let lastEndpointRefreshAt = 0;
let lastMetaAt = 0;
let metaDirty = false; // 统计变更即写 meta（否则面板/MCP 最多看 60s 陈旧统计——drop 后 tracesTotal 不更新的实证）
const startedAt = Date.now();

// ── JSONL（权威全量）────────────────────────────────────────────────────────
function initStore() {
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) { log('warn', `存储目录创建失败: ${e.message}`); }
}
function fileBytes(f) {
  try { return fs.statSync(f).size; } catch (_) { return 0; }
}
function appendSpan(rec) {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.appendFileSync(SPANS_FILE, JSON.stringify(rec) + '\n');
    if (fileBytes(SPANS_FILE) > ROTATE_BYTES) {
      try { fs.renameSync(SPANS_FILE, SPANS_OLD); log('info', 'spans.jsonl 已轮转到 .old'); } catch (_) { /* 下一轮再试 */ }
    }
    return true;
  } catch (e) {
    log('warn', `spans.jsonl 追加失败: ${e.message}`);
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
/** 按行流式扫全部 span（.old 在前） */
function iterAllSpans(cb) {
  iterLines(SPANS_OLD, cb);
  iterLines(SPANS_FILE, cb);
}

// ── 索引重建 / 更新 ─────────────────────────────────────────────────────────
function indexSpan(rec) {
  const traceId = rec.traceId;
  let entry = traceIndex.get(traceId);
  if (!entry) {
    entry = { summary: null, spanIds: new Set() };
    traceIndex.set(traceId, entry);
  }
  if (!entry.spanIds.has(rec.spanId)) {
    entry.spanIds.add(rec.spanId);
    spansTotal += 1;
    metaDirty = true;
  }
  if (rec.ingestAt && rec.ingestAt > lastSpanAt) lastSpanAt = rec.ingestAt;
  entry.summary = null; // 失效，ring 镜像时惰性重算
}
function rebuildIndex() {
  traceIndex.clear();
  spansTotal = 0;
  lastSpanAt = 0;
  iterAllSpans((rec) => {
    if (rec && rec.traceId && rec.spanId) indexSpan(rec);
  });
  log('info', `索引重建：${traceIndex.size} traces / ${spansTotal} spans`);
}
/** 惰性重算概览并刷新 LRU（fullKvIds 视作最近活跃 trace 序列） */
function touchTrace(traceId) {
  const entry = traceIndex.get(traceId);
  if (!entry) return null;
  if (!entry.summary) {
    const spans = [];
    iterAllSpans((rec) => { if (rec.traceId === traceId) spans.push(rec); });
    entry.summary = core.traceSummary(traceId, spans);
  }
  fullKvIds = [traceId, ...fullKvIds.filter((id) => id !== traceId)].slice(0, core.TRACE_FULL_KV_LIMIT);
  ringDirty = true;
  return entry.summary;
}
/** ring：最近活跃 trace 概览（按最近触达排序） */
function currentRing() {
  const out = [];
  for (const id of fullKvIds) {
    const e = traceIndex.get(id);
    if (e && e.summary) out.push(e.summary);
  }
  return out.slice(0, core.RING_LIMIT);
}

// ── kv 镜像（rec 分块 + idx + trace 全文 LRU；服务是唯一写者）───────────────
async function readSpansOf(traceId) {
  const spans = [];
  iterAllSpans((rec) => { if (rec.traceId === traceId) spans.push(rec); });
  return spans;
}
async function mirrorFullTraces() {
  // 只投影 fullKvIds 里的键；先删不再投影的旧键（先读现键做差集，避免每轮全删全写）
  const stale = fullKvIdsStale;
  for (const id of stale) {
    try { await kv.kvDel(`${TRACE_PREFIX}${id}`); } catch (_) { /* 下轮重试 */ }
  }
  for (const id of fullKvIds) {
    if (mirroredFullIds.has(id)) continue;
    try {
      const spans = await readSpansOf(id);
      const { ordered } = core.buildTrace(spans);
      await kv.kvSet(`${TRACE_PREFIX}${id}`, { traceId: id, spans: ordered, updatedAt: Date.now() });
      mirroredFullIds.add(id);
    } catch (e) {
      log('warn', `trace 全文投影失败 ${id.slice(0, 12)}（下轮重试）: ${e.message}`);
    }
  }
}
// 投影去重集合：镜像成功过的 id（进程内）；stale = 已不在 LRU 的 id
const mirroredFullIds = new Set();
let fullKvIdsStale = [];
function computeStale() {
  fullKvIdsStale = [...mirroredFullIds].filter((id) => !fullKvIds.includes(id));
  for (const id of fullKvIdsStale) mirroredFullIds.delete(id);
}

async function mirrorRing() {
  if (!ringDirty) return;
  // 惰性重算 dirty trace 的 summary
  for (const id of fullKvIds) {
    const e = traceIndex.get(id);
    if (e && !e.summary) {
      const spans = await readSpansOf(id);
      e.summary = core.traceSummary(id, spans);
    }
  }
  const ring = currentRing();
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
      total: traceIndex.size,
      spansTotal,
      chunkCount: prevChunkCount,
      oldestAt: ring.length ? ring[ring.length - 1].startedAt : 0,
      updatedAt: Date.now(),
    });
  } catch (e) { log('warn', `idx 写失败（下轮重试）: ${e.message}`); return; }
  ringDirty = false;
}

// ── OTLP 接收 ───────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
/** hex 直通；24/12 位合法 base64（protobuf-JSON bytes 方言）→ hex（Node 侧 Buffer） */
function decodeId(id, byteLen) {
  if (id.length === byteLen * 2 && /^[0-9a-fA-F]+$/.test(id)) return id;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(id)) {
    try {
      const buf = Buffer.from(id, 'base64');
      if (buf.length === byteLen) return buf.toString('hex');
    } catch (_) { /* 落回原样 */ }
  }
  return id;
}
function handleOtlp(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (/x-protobuf|application\/protobuf/i.test(ct)) {
    sendJson(res, 415, {
      ok: false,
      error: '本接收器只支持 OTLP/HTTP JSON 编码（Content-Type: application/json）。请把 OTel SDK 导出协议设为 http/json（OTEL_EXPORTER_OTLP_PROTOCOL=http/json）。',
    });
    req.resume();
    return;
  }
  const chunks = [];
  let received = 0;
  let aborted = false;
  req.on('data', (c) => {
    if (aborted) return;
    received += c.length;
    if (received > REQ_BODY_CAP) {
      aborted = true;
      sendJson(res, 413, { ok: false, error: `请求体超过 ${Math.round(REQ_BODY_CAP / 1048576)}MB 上限` });
      setTimeout(() => req.destroy(), 300);
    } else {
      chunks.push(c);
    }
  });
  req.on('error', () => { aborted = true; });
  req.on('end', () => {
    if (aborted) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      sendJson(res, 400, { ok: false, error: `请求体不是合法 JSON: ${e.message}` });
      return;
    }
    const norm = core.normalizeOtlpRequest(body, { decodeId });
    if (norm.error) {
      sendJson(res, 400, { ok: false, error: norm.error });
      return;
    }
    if (!norm.spans.length) {
      // 空批也算成功（OTLP 语义），但如实返回 dropped
      sendJson(res, 200, { partialSuccess: { rejectedSpans: String(norm.dropped || 0) } });
      return;
    }
    const ingestAt = Date.now();
    let appended = 0;
    for (const s of norm.spans) {
      const rec = { ...s, ingestAt };
      if (appendSpan(rec)) {
        appended += 1;
        indexSpan(rec);
        touchTrace(rec.traceId);
      }
    }
    if (appended < norm.spans.length) {
      // 落盘部分失败：仍答 200 但报 rejected（接收器自伤如实暴露，不静默吞）
      sendJson(res, 200, { partialSuccess: { rejectedSpans: String(norm.spans.length - appended + norm.dropped) } });
      return;
    }
    if (norm.dropped) log('info', `批次含 ${norm.dropped} 个无法归一化的 span（缺 traceId/时间），已拒`);
    log('info', `ingest ${appended} spans / ${new Set(norm.spans.map((s) => s.traceId)).size} traces（累计 ${traceIndex.size} traces / ${spansTotal} spans）`);
    sendJson(res, 200, { partialSuccess: {} });
  });
}

// ── HTTP 服务（攻击面仅 /__health + OTLP 端点；无读 API）────────────────────
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'bad request' });
    return;
  }
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/__health') {
    sendJson(res, 200, {
      ok: true, version: VERSION, degraded,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      traces: traceIndex.size, spans: spansTotal, port: PORT,
    });
    return;
  }
  // OTLP 标准路径（容忍尾斜杠）
  if (pathname === '/v1/traces' && (req.method === 'POST' || req.method === 'PUT')) {
    handleOtlp(req, res);
    return;
  }
  sendJson(res, 404, { ok: false, error: 'not found（OTLP 端点形如 POST /v1/traces，Content-Type: application/json）' });
  req.resume();
});

// 端口被占用：诚实失败退出（健康检查固定在声明端口，换端口会漂移导致重启循环）
server.on('error', (e) => {
  log('error', `服务端口 ${PORT} 监听失败: ${e.message}（被占用时请释放 ${PORT} 或在设置里停用服务）`);
  process.exit(1);
});

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
      if (cmd.op === 'clear_all') await cmdClearAll(cmd, resultKey);
      else if (cmd.op === 'drop_trace') await cmdDropTrace(cmd, resultKey);
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

/** 原子重写 JSONL（只保留 filterFn 为真的行）；返回保留行数 */
function rewriteJsonl(filterFn) {
  let kept = 0;
  const lines = [];
  for (const f of [SPANS_OLD, SPANS_FILE]) {
    iterLines(f, (r) => { if (filterFn(r)) { kept += 1; lines.push(JSON.stringify(r)); } });
    if (f === SPANS_OLD) { try { fs.unlinkSync(SPANS_OLD); } catch (_) { /* 无文件 */ } }
  }
  const tmp = `${SPANS_FILE}.tmp`;
  fs.writeFileSync(tmp, lines.length ? lines.join('\n') + '\n' : '');
  fs.renameSync(tmp, SPANS_FILE);
  return kept;
}
function clearFullProjection() {
  fullKvIds = [];
  mirroredFullIds.clear();
  fullKvIdsStale = [];
}
async function cmdClearAll(cmd, resultKey) {
  if (cmd.confirm !== true) throw new Error('清空全部链路留痕是不可逆操作，必须传 confirm:true');
  const kept = rewriteJsonl(() => false);
  traceIndex.clear();
  spansTotal = 0;
  lastSpanAt = 0;
  ringDirty = true;
  metaDirty = true;
  prevChunkCount = core.RING_LIMIT / core.CHUNK_SIZE; // 让所有 rec 块进删除计划
  clearFullProjection();
  await kv.kvSet(resultKey, { ok: true, kept, at: Date.now() }).catch(() => {});
  log('info', `已清空全部链路留痕`);
}
async function cmdDropTrace(cmd, resultKey) {
  const traceId = String(cmd.traceId || '').trim().toLowerCase();
  if (!traceId) throw new Error('缺少 traceId 参数');
  const kept = rewriteJsonl((r) => r.traceId !== traceId);
  const entry = traceIndex.get(traceId);
  if (entry) {
    spansTotal = Math.max(0, spansTotal - entry.spanIds.size);
    traceIndex.delete(traceId);
    metaDirty = true;
  }
  fullKvIds = fullKvIds.filter((id) => id !== traceId);
  fullKvIdsStale = [traceId];
  ringDirty = true;
  await kv.kvSet(resultKey, { ok: true, kept, at: Date.now() }).catch(() => {});
  log('info', `删除 trace ${traceId.slice(0, 12)}（保留 ${kept} 行 span 留痕）`);
}

// ── tick 主循环 ────────────────────────────────────────────────────────────
async function tick() {
  try {
    computeStale();
    await consumeCommands();
    await mirrorFullTraces();
    await mirrorRing();

    if (Date.now() - lastMetaAt > META_BEAT_MS || metaDirty) {
      metaDirty = false;
      lastMetaAt = Date.now();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        degraded,
        port: PORT,
        storeDir: STORE_DIR,
        filePath: SPANS_FILE,
        fileBytes: fileBytes(SPANS_FILE),
        tracesTotal: traceIndex.size,
        spansTotal,
        lastSpanAt,
        endpoint: `http://127.0.0.1:${PORT}/v1/traces`,
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
      if (!wasDown) log('info', 'bridge 不可达，进入降级（接收/落盘不受影响，健康端点保持 200）');
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
rebuildIndex();
server.listen(PORT, '127.0.0.1', () => {
  log('info', `链路追踪台服务 v${VERSION} (pid=${process.pid}) 127.0.0.1:${PORT}，存储 ${STORE_DIR}`);
  log('info', `OTLP 端点 http://127.0.0.1:${PORT}/v1/traces（Content-Type: application/json，协议 http/json）`);
});
setInterval(tick, TICK_MS);
