'use strict';
/**
 * main.js —— 长连接调试台后台服务（零外部服务，数据不出本机）
 *
 * 职责：作为 WS/SSE 的「客户端引擎」。浏览器面板有两个结构性限制，
 * 本服务存在的意义就是把它们都解决掉：
 *   1. 浏览器 WebSocket API 握手不能带自定义头（Authorization 等）——服务端 node 客户端可以；
 *   2. EventSource 只能 GET、不能带头、不能带 body——AI 流式接口（POST+Bearer+SSE）没法调，
 *      服务端 fetch 流式读取可以，且逐事件计时（TTFT/间隔 p95）。
 *
 * 架构（三方共享 cap.kv 同一事实库，与 net-sentinel/webhook-station 同范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token，流式帧走 fetch-SSE 实时通道)──▶ 本服务
 *   MCP  ──(kv 读 streamdesk.meta 拿 port/token → 127.0.0.1 直连)──────▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主（meta/索引/transcript/settings）
 *
 * kv 键空间（全部 streamdesk. 前缀，勿与他插件撞）：
 *   streamdesk.meta          {port,token,pid,version,startedAt,live} 心跳 60s
 *   streamdesk.sessions      会话索引（摘要数组，cap 60）
 *   streamdesk.session.<id>  已结束会话 transcript（掩码投影，cap 30 个，启动 sweep 孤儿）
 *   streamdesk.settings      用户设置
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1（调试目标是「出站连接」，本服务不为外部提供入口）；
 *   - 除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）；
 *   - 头离开服务进程（kv/MCP/面板握手展示）一律过 maskHeaders；
 *   - 面板 iframe 内发跨源请求需 CORS：ACAO:* + Allow-Headers（token 是 128bit 随机，
 *     与 api-bench/imgforge/mcp-probe 面板直连面同款威胁模型）。
 *
 * 已知边界（如实）：
 *   - 进行中会话的帧只在内存；服务崩溃重启后 index 中标记 interrupted，帧不恢复；
 *   - WebSocket 客户端不协商 perMessageDeflate（调试要看原始帧，压缩会毁掉可读性）。
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');
const WebSocket = require('./vendor/ws.cjs');

const VERSION = '0.1.0';
const META_BEAT_MS = 60_000;
const INDEX_DEBOUNCE_MS = 1_000;
const STREAM_FLUSH_MS = 100;
const STREAM_HB_MS = 15_000;
const MAX_BODY_BYTES = 1_048_576; // 入站请求体上限 1MB
const WS_HANDSHAKE_TIMEOUT_MS = 15_000;
const PROBE_HARD_CAP_MS = 130_000;
const MAX_TRANSCRIPTS = 30;
const MAX_INDEX = 60;

const appConfigDir = process.argv[3] || '';
const kv = createKvClient({ appConfigDir, log });

// ── 日志（stderr；stdout 永不承载协议）───────────────────────────────────────
function log(level, msg) {
  try { process.stderr.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 设置 ────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  maxFrames: 500,          // 每会话帧环形缓冲上限
  frameBodyCap: 16_384,    // 单帧体字符上限（超出截断标注）
  pingIntervalSec: 0,      // WS 自动 ping 间隔（0=关）
  maskHeaders: true,       // 出站投影掩码开关（cookie/authorization 恒掩，见 core.maskHeaders）
  sseMaxEvents: 2_000,     // SSE 抓取默认事件上限
  sseDurationMsMax: 120_000,
  transcriptTail: 200,
};
let settings = { ...DEFAULT_SETTINGS };

function clampSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  out.maxFrames = int(s.maxFrames, 50, 5_000, DEFAULT_SETTINGS.maxFrames);
  out.frameBodyCap = int(s.frameBodyCap, 256, 262_144, DEFAULT_SETTINGS.frameBodyCap);
  out.pingIntervalSec = int(s.pingIntervalSec, 0, 600, DEFAULT_SETTINGS.pingIntervalSec);
  out.maskHeaders = s.maskHeaders !== false;
  out.sseMaxEvents = int(s.sseMaxEvents, 10, 10_000, DEFAULT_SETTINGS.sseMaxEvents);
  out.sseDurationMsMax = int(s.sseDurationMsMax, 1_000, 600_000, DEFAULT_SETTINGS.sseDurationMsMax);
  out.transcriptTail = int(s.transcriptTail, 10, 1_000, DEFAULT_SETTINGS.transcriptTail);
  return out;
}

// ── 状态 ────────────────────────────────────────────────────────────────────
/** @type {Map<string, object>} */
const sessions = new Map();
let degraded = false; // kv 不可达
// 测试钩子（yizhou 先例）：STREAMDESK_TOKEN 允许离线冒烟固定 token；
// 生产路径不设置该 env，token 随机生成并持久化进 kv meta。
let token = process.env.STREAMDESK_TOKEN || crypto.randomBytes(24).toString('hex');
let metaTimer = null;

function newId() { return `sd${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`; }

// ── 帧记录（环形缓冲 + 游标唤醒 + 实时推送 + 索引防抖）───────────────────────
function pushFrame(session, partial) {
  const now = Date.now();
  const seq = session.nextSeq++;
  const gapMs = session.lastFrameAt ? now - session.lastFrameAt : (session.startedAt ? now - session.startedAt : 0);
  session.lastFrameAt = now;
  const frame = { seq, ts: now, gapMs, dir: 'note', kind: 'note', ...partial };
  session.frames.push(frame);
  if (session.frames.length > settings.maxFrames) {
    session.frames.splice(0, session.frames.length - settings.maxFrames);
  }
  // 唤醒 long-poll 等待者
  if (session.waiters.length) {
    const ready = session.waiters.filter((w) => frame.seq > w.after);
    session.waiters = session.waiters.filter((w) => !ready.includes(w));
    for (const w of ready) { clearTimeout(w.timer); w.resolve(); }
  }
  // 实时推送队列
  session.pushQueue.push(frame);
  if (!session.flushTimer) session.flushTimer = setTimeout(() => flushStream(session), STREAM_FLUSH_MS);
  return frame;
}

function flushStream(session) {
  session.flushTimer = null;
  if (!session.pushQueue.length || !session.streams.size) return;
  const frames = session.pushQueue.splice(0, session.pushQueue.length)
    .map((f) => core.projectFrame(f, settings.frameBodyCap));
  const payload = JSON.stringify({ type: 'frames', frames });
  for (const res of session.streams) {
    try { res.write(`data: ${payload}\n\n`); } catch (_) { session.streams.delete(res); }
  }
}

function pushStatus(session) {
  const payload = JSON.stringify({ type: 'status', summary: core.sessionSummary(session) });
  for (const res of session.streams) {
    try { res.write(`data: ${payload}\n\n`); } catch (_) { session.streams.delete(res); }
  }
}

// ── WS 会话引擎 ─────────────────────────────────────────────────────────────
function openWsSession(params) {
  const url = String(params.url || '').trim();
  if (!/^wss?:\/\//i.test(url)) throw new Error('WS 地址必须以 ws:// 或 wss:// 开头');
  const headers = sanitizeHeaders(params.headers);
  const subprotocols = Array.isArray(params.subprotocols)
    ? params.subprotocols.map(String).filter(Boolean).slice(0, 8) : [];
  const pingSec = clampInterval(params.pingIntervalSec != null ? params.pingIntervalSec : settings.pingIntervalSec);

  const session = baseSession('ws', url, params.title, {
    headers, subprotocols, pingIntervalSec: pingSec,
  });
  session.state = 'connecting';
  sessions.set(session.id, session);
  scheduleIndexPersist();
  pushStatus(session);

  const startedAt = Date.now();
  let upgradeRes = null;

  let ws;
  try {
    ws = new WebSocket(url, subprotocols.length ? subprotocols : undefined, {
      headers,
      handshakeTimeout: WS_HANDSHAKE_TIMEOUT_MS,
      perMessageDeflate: false, // 调试台要看原始帧，不协商压缩
    });
  } catch (e) {
    session.state = 'error';
    session.closedReason = `客户端构造失败：${e.message}`;
    pushFrame(session, { kind: 'error', level: 'error', message: session.closedReason });
    finalizeSession(session);
    return session;
  }
  session.ws = ws;

  ws.on('upgrade', (res) => {
    upgradeRes = res;
    session.handshake = {
      ok: true,
      httpStatus: res.statusCode,
      statusText: res.statusMessage || '',
      latencyMs: Date.now() - startedAt,
      headers: res.headers || {},
    };
    pushFrame(session, {
      kind: 'status', dir: 'note', level: 'info',
      httpStatus: res.statusCode,
      message: `握手 101 延迟 ${session.handshake.latencyMs}ms；响应头 ${Object.keys(res.headers || {}).length} 个（敏感头已掩码展示）`,
    });
  });

  ws.on('open', () => {
    session.state = 'open';
    session.openAt = Date.now();
    if (!session.handshake) {
      session.handshake = { ok: true, httpStatus: 101, latencyMs: Date.now() - startedAt, headers: {} };
    }
    pushStatus(session);
    if (pingSec > 0) {
      session.pingTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.ping(Buffer.from(String(Date.now())));
        session.counters.pings = (session.counters.pings || 0) + 1;
      }, pingSec * 1000);
    }
    scheduleIndexPersist();
  });

  ws.on('unexpected-response', (req, res) => {
    session.handshake = {
      ok: false,
      httpStatus: res.statusCode,
      statusText: res.statusMessage || '',
      latencyMs: Date.now() - startedAt,
      headers: res.headers || {},
    };
    const chunks = [];
    res.on('data', (c) => { if (chunks.join('').length < 4096) chunks.push(c.toString('utf8')); });
    res.on('end', () => {
      const body = chunks.join('');
      pushFrame(session, {
        kind: 'status', dir: 'in', level: 'warn', httpStatus: res.statusCode,
        message: `非 101 应答（服务器拒绝升级，常见于鉴权失败/路径错误），延迟 ${session.handshake.latencyMs}ms`,
        text: body ? body.slice(0, settings.frameBodyCap) : undefined,
        size: body.length,
      });
      session.state = 'error';
      session.closedReason = `握手失败 HTTP ${res.statusCode}（非 101 Switching Protocols）`;
      pushStatus(session);
      finalizeSession(session);
    });
  });

  ws.on('message', (data, isBinary) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    session.counters.in = (session.counters.in || 0) + 1;
    session.counters.bytesIn = (session.counters.bytesIn || 0) + buf.length;
    if (isBinary) {
      pushFrame(session, { dir: 'in', kind: 'binary', size: buf.length, b64: buf.toString('base64') });
    } else {
      const text = buf.toString('utf8');
      const t = core.truncateText(text, settings.frameBodyCap);
      pushFrame(session, { dir: 'in', kind: 'text', size: buf.length, text: t.text, truncated: t.truncated || undefined });
    }
  });

  ws.on('ping', (data) => {
    // 服务器主动 ping（ws 库自动回 pong）；记录为 note
    const s = data ? data.toString('utf8').slice(0, 64) : '';
    pushFrame(session, { dir: 'in', kind: 'ping', size: data ? data.length : 0, message: s ? `服务器 ping（载荷 ${s}）` : '服务器 ping' });
  });
  ws.on('pong', (data) => {
    session.counters.pongs = (session.counters.pongs || 0) + 1;
    const payload = data ? data.toString('utf8') : '';
    const sentAt = Number(payload);
    const rtt = Number.isFinite(sentAt) && sentAt > 0 ? Date.now() - sentAt : undefined;
    pushFrame(session, {
      dir: 'note', kind: 'pong', rttMs: rtt,
      message: rtt != null ? `pong RTT ${rtt}ms` : 'pong',
    });
  });

  ws.on('error', (e) => {
    session.counters.errors = (session.counters.errors || 0) + 1;
    pushFrame(session, { dir: 'note', kind: 'error', level: 'error', message: `连接错误：${e.message}` });
    if (session.state === 'connecting') {
      session.handshake = { ok: false, latencyMs: Date.now() - startedAt, error: e.message, headers: {} };
    }
  });

  ws.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString('utf8') : '';
    const wasOpen = session.state === 'open';
    session.state = wasOpen ? 'closed' : (session.state === 'error' ? 'error' : 'closed');
    session.closedReason = `关闭 ${code} ${core.wsCloseCodeName(code)}${reasonStr ? `：${reasonStr}` : ''}`;
    pushFrame(session, {
      dir: 'note', kind: 'close', code, reason: reasonStr,
      message: session.closedReason,
    });
    if (!session.handshake && session.state !== 'error') {
      session.handshake = { ok: false, latencyMs: Date.now() - startedAt, error: '未完成握手即关闭', headers: {} };
    }
    pushStatus(session);
    finalizeSession(session);
  });

  return session;
}

function clampInterval(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(600, Math.max(1, Math.round(n)));
}

/** 入站请求头白名单化：仅允许字符串值；大小限制防滥用 */
function sanitizeHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  let count = 0;
  for (const [k, v] of Object.entries(headers)) {
    if (count >= 48) break;
    if (typeof v !== 'string') continue;
    if (!k || k.length > 256 || v.length > 16_384) continue;
    if (k.toLowerCase() === 'host' || k.toLowerCase() === 'connection' || k.toLowerCase() === 'sec-websocket-key') continue; // 协议保留头不透传（ws 库自管）
    out[String(k)] = v;
    count += 1;
  }
  return out;
}

// ── SSE 抓取引擎 ────────────────────────────────────────────────────────────
function openSseSession(params) {
  const url = String(params.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('SSE 地址必须以 http:// 或 https:// 开头');
  const method = (String(params.method || 'GET') || 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method) || method === 'CONNECT' || method === 'TRACE') {
    throw new Error(`不支持的 method：${method}`);
  }
  const headers = sanitizeHeaders(params.headers);
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'accept')) {
    headers.Accept = 'text/event-stream'; // 仅在用户未指定时补默认（记录在案）
  }
  const body = typeof params.body === 'string' && method !== 'GET' && method !== 'HEAD' ? params.body : undefined;
  const maxEvents = Math.min(10_000, Math.max(1, Math.round(Number(params.maxEvents) || settings.sseMaxEvents)));
  const durationMs = Math.min(settings.sseDurationMsMax, Math.max(1_000, Math.round(Number(params.durationMs) || settings.sseDurationMsMax)));

  const session = baseSession('sse', url, params.title, {
    method, headers, body, maxEvents, durationMs,
  });
  session.state = 'capturing';
  sessions.set(session.id, session);
  scheduleIndexPersist();
  pushStatus(session);
  runCapture(session);
  return session;
}

async function runCapture(session) {
  const startedAt = Date.now();
  const ac = new AbortController();
  session.abort = ac;
  const reqHeaders = { ...session.request.headers };
  const parser = core.createSseParser();
  session._parser = parser; // finalize 时读 comments()（服务器心跳行数，诊断「活着但没事件」）
  let parseMode = null; // 'sse' | 'chunk'，响应头确定
  let firstByteAt = 0;
  let firstEventAt = 0;
  let totalBytes = 0;

  const durationTimer = setTimeout(() => {
    session.stopReason = '达到时长上限（durationMs）';
    try { ac.abort(); } catch (_) { /* 忽略 */ }
  }, session.request.durationMs);

  try {
    const res = await fetch(session.request.url, {
      method: session.request.method,
      headers: reqHeaders,
      body: session.request.body,
      signal: ac.signal,
      redirect: 'follow',
    });
    session.handshake = {
      ok: res.ok,
      httpStatus: res.status,
      statusText: res.statusText,
      latencyMs: Date.now() - startedAt,
      headers: res.headers ? Object.fromEntries(res.headers.entries()) : {},
    };
    const ct = res.headers ? (res.headers.get('content-type') || '') : '';
    parseMode = core.isEventStreamContentType(ct) ? 'sse' : 'chunk';
    pushFrame(session, {
      kind: 'status', dir: 'in', httpStatus: res.status,
      level: res.ok ? 'info' : 'warn',
      message: `HTTP ${res.status} ${ct || '(无 content-type)'} → ${parseMode === 'sse' ? 'SSE 事件解析' : '原始分块捕获'}，响应头 ${Object.keys(session.handshake.headers).length} 个`,
    });

    if (!res.body) {
      // 无体响应（如 204）
      session.stopReason = `HTTP ${res.status} 无响应体`;
      finalizeSession(session, 'closed');
      clearTimeout(durationTimer);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!firstByteAt) { firstByteAt = Date.now(); session.stats.ttftMs = firstByteAt - startedAt; }
      totalBytes += value.byteLength;
      session.stats.bytes = totalBytes;
      const text = decoder.decode(value, { stream: true });
      if (parseMode === 'sse') {
        for (const ev of parser.push(text)) {
          recordSseEvent(session, ev, startedAt, () => { firstEventAt = Date.now(); session.stats.firstEventMs = firstEventAt - startedAt; });
        }
      } else {
        const t = core.truncateText(text, settings.frameBodyCap);
        pushFrame(session, { dir: 'in', kind: 'chunk', size: value.byteLength, text: t.text, truncated: t.truncated || undefined });
        session.stats.chunkCount = (session.stats.chunkCount || 0) + 1;
      }
      if (session.stopReason) break;
    }
    // 流自然结束：冲掉解码器尾部与悬挂事件
    const tail = decoder.decode();
    if (parseMode === 'sse' && tail) {
      for (const ev of parser.push(tail)) recordSseEvent(session, ev, startedAt, () => { firstEventAt = Date.now(); session.stats.firstEventMs = firstEventAt - startedAt; });
    }
    if (parseMode === 'sse') {
      for (const ev of parser.flush()) recordSseEvent(session, ev, startedAt, () => { firstEventAt = Date.now(); session.stats.firstEventMs = firstEventAt - startedAt; });
    }
    if (!session.stopReason) session.stopReason = '服务器结束响应';
    finalizeSession(session, 'closed');
  } catch (e) {
    if (ac.signal.aborted) {
      finalizeSession(session, session.manualStop ? 'stopped' : 'closed');
    } else {
      const msg = `请求失败：${e && e.message ? e.message : String(e)}`;
      pushFrame(session, { kind: 'error', level: 'error', message: msg });
      session.handshake = session.handshake || { ok: false, latencyMs: Date.now() - startedAt, error: msg, headers: {} };
      session.closedReason = msg;
      finalizeSession(session, 'error');
    }
  } finally {
    clearTimeout(durationTimer);
  }
}

function recordSseEvent(session, ev, startedAt, onFirstEvent) {
  if (session.state !== 'capturing') return;
  if (!firstEventGuard(session)) onFirstEvent();
  const size = Buffer.byteLength(ev.data, 'utf8');
  const t = core.truncateText(ev.data, settings.frameBodyCap);
  pushFrame(session, {
    dir: 'in', kind: 'event', event: ev.event, id: ev.id,
    size, text: t.text, truncated: t.truncated || undefined,
    message: ev.partial ? '（无 data 行的悬挂事件，诊断用）' : undefined,
  });
  session.counters.in = (session.counters.in || 0) + 1;
  session.stats.eventCount = (session.stats.eventCount || 0) + 1;
  if (session.request.maxEvents && session.stats.eventCount >= session.request.maxEvents) {
    session.stopReason = `达到事件数上限（maxEvents=${session.request.maxEvents}）`;
    try { session.abort.abort(); } catch (_) { /* 忽略 */ }
  }
}

function firstEventGuard(session) { return session.stats.firstEventMs != null; }

// ── 会话基座 / 收尾 ─────────────────────────────────────────────────────────
function baseSession(kind, url, title, requestExtra) {
  const now = Date.now();
  const host = (() => { try { return new URL(url).host; } catch (_) { return url.slice(0, 40); } })();
  return {
    id: newId(),
    kind,
    url,
    title: (title && String(title).slice(0, 120)) || `${kind === 'ws' ? 'WS' : 'SSE'} ${host}`,
    state: 'connecting',
    createdAt: now,
    startedAt: now,
    openAt: null,
    closedAt: null,
    closedReason: '',
    request: { url, ...requestExtra }, // url 单一事实源：runCapture 从 request.url 取
    handshake: null,
    frames: [],
    nextSeq: 0,
    lastFrameAt: 0,
    counters: { in: 0, out: 0 },
    stats: {},
    waiters: [],
    streams: new Set(),
    pushQueue: [],
    flushTimer: null,
    ws: null,
    abort: null,
    pingTimer: null,
    manualStop: false,
    stopReason: '',
  };
}

function finalizeSession(session, terminalState) {
  if (session.finalized) return;
  session.finalized = true;
  if (terminalState && !['error'].includes(session.state)) session.state = terminalState;
  session.closedAt = Date.now();
  if (!session.closedReason) session.closedReason = session.stopReason || (session.manualStop ? '手动停止' : '已结束');
  session.stats.totalMs = session.closedAt - session.startedAt;
  if (session.kind === 'sse') {
    const gaps = session.frames.filter((f) => f.kind === 'event' || f.kind === 'chunk').map((f) => f.gapMs).slice(1);
    session.stats.gaps = core.gapStats(gaps);
    session.stats.comments = session._parser ? session._parser.comments() : 0;
  }
  // 清理资源；long-poll 等待者立即释放（帧不会再来了，让它们拿到 final=true）
  if (session.pingTimer) { clearInterval(session.pingTimer); session.pingTimer = null; }
  if (session.flushTimer) { clearTimeout(session.flushTimer); session.flushTimer = null; }
  const pendingWaiters = session.waiters.splice(0, session.waiters.length);
  for (const w of pendingWaiters) { clearTimeout(w.timer); w.resolve(); }
  session.ws = null;
  session.abort = null;
  flushStream(session);
  pushStatus(session);
  persistTranscript(session);
  scheduleIndexPersist();
}

function evictClosedSessions() {
  const closed = [...sessions.values()].filter((s) => s.finalized).sort((a, b) => a.closedAt - b.closedAt);
  const liveCount = [...sessions.values()].filter((s) => !s.finalized).length;
  const cap = Math.max(4, 12 - liveCount);
  while (closed.length > cap) {
    const victim = closed.shift();
    if (victim) {
      sessions.delete(victim.id);
      victim.streams.clear();
    }
  }
}

// ── kv 持久化（meta 心跳 / 索引防抖 / transcript 收尾落盘）──────────────────
let indexTimer = null;
function scheduleIndexPersist() {
  if (indexTimer) return;
  indexTimer = setTimeout(() => {
    indexTimer = null;
    persistIndex();
  }, INDEX_DEBOUNCE_MS);
}

async function persistIndex() {
  if (degraded) return;
  try {
    const summaries = [...sessions.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_INDEX)
      .map(core.sessionSummary);
    await kv.kvSet('streamdesk.sessions', summaries);
  } catch (e) {
    log('warn', `索引落 kv 失败：${e.message}`);
  }
}

async function persistTranscript(session) {
  if (degraded) return;
  try {
    const proj = core.projectSessionForKv(session, {
      bodyCap: 2048, tail: settings.transcriptTail, maskHeaders: settings.maskHeaders,
    });
    proj.stats = session.stats;
    await kv.kvSet(`streamdesk.session.${session.id}`, proj);
    await sweepTranscripts();
  } catch (e) {
    log('warn', `transcript 落 kv 失败：${e.message}`);
  }
}

/** transcript 数量治理：仅依据内存索引（不调 kv list），超出 cap 删最旧 */
async function sweepTranscripts() {
  try {
    const index = (await kv.kvGet('streamdesk.sessions')) || [];
    const ids = index.map((s) => s.id).slice(0, MAX_TRANSCRIPTS);
    const all = index.map((s) => s.id);
    for (const id of all.slice(MAX_TRANSCRIPTS)) {
      await kv.kvDel(`streamdesk.session.${id}`);
    }
    void ids;
  } catch (_) { /* 治理失败不致命 */ }
}

async function writeMeta() {
  try {
    await kv.kvSet('streamdesk.meta', {
      port: PORT, token, pid: process.pid, version: VERSION,
      startedAt: STARTED_AT, live: [...sessions.values()].filter((s) => !s.finalized).length,
      degraded: false,
    });
    if (degraded) { degraded = false; log('info', 'kv bridge 恢复'); }
  } catch (e) {
    if (!degraded) { degraded = true; log('warn', `kv bridge 不可达（降级模式，健康检查保持 200）：${e.message}`); }
  }
}

// ── HTTP 服务 ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 9874;
const STARTED_AT = Date.now();

function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  });
  res.end(body);
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function authorized(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  return timingSafeEq(m[1], token);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('请求体超过 1MB 上限')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error(`JSON 解析失败：${e.message}`)); }
    });
    req.on('error', reject);
  });
}

function getSessionOr404(id, res) {
  const s = sessions.get(String(id || ''));
  if (!s) { sendJson(res, 404, { error: '会话不存在（可能已被清理或服务重启——进行中会话不跨重启存活）' }); return null; }
  return s;
}

async function handleApi(req, res, pathname, query) {
  // CORS 预检（面板 blob iframe 直连需要）
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { error: '未授权：需要 Bearer token（面板/MCP 经 streamdesk.meta 获取）' });
    return;
  }

  // ── 会话集合 ──
  if (pathname === '/api/sessions' && req.method === 'GET') {
    const summaries = [...sessions.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(core.sessionSummary);
    sendJson(res, 200, { sessions: summaries, degraded, version: VERSION });
    return;
  }

  if (pathname === '/api/session/ws' && req.method === 'POST') {
    const body = await readBody(req);
    evictClosedSessions();
    const live = [...sessions.values()].filter((s) => !s.finalized).length;
    if (live >= 12) { sendJson(res, 429, { error: '进行中会话已达 12 个上限，先关闭一些再试' }); return; }
    try {
      const s = openWsSession(body);
      sendJson(res, 200, { session: core.sessionSummary(s) });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  if (pathname === '/api/session/sse' && req.method === 'POST') {
    const body = await readBody(req);
    evictClosedSessions();
    const live = [...sessions.values()].filter((s) => !s.finalized).length;
    if (live >= 12) { sendJson(res, 429, { error: '进行中会话已达 12 个上限，先关闭一些再试' }); return; }
    try {
      const s = openSseSession(body);
      sendJson(res, 200, { session: core.sessionSummary(s) });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  // ── 一次性探测（MCP sse_capture 用；同步等捕获结束）──
  if (pathname === '/api/probe' && req.method === 'POST') {
    const body = await readBody(req);
    const live = [...sessions.values()].filter((s) => !s.finalized).length;
    if (live >= 12) { sendJson(res, 429, { error: '进行中会话已达 12 个上限' }); return; }
    let s;
    try { s = openSseSession(body); } catch (e) { sendJson(res, 400, { error: e.message }); return; }
    const deadline = Date.now() + Math.min(PROBE_HARD_CAP_MS, (Number(body.durationMs) || settings.sseDurationMsMax) + 10_000);
    await new Promise((resolve) => {
      const t = setInterval(() => {
        if (s.finalized || Date.now() > deadline) { clearInterval(t); resolve(); }
      }, 150);
    });
    if (!s.finalized) { s.manualStop = true; s.stopReason = '探测硬超时'; try { s.abort.abort(); } catch (_) { /* 忽略 */ } }
    const samples = s.frames.filter((f) => f.kind === 'event').slice(0, 3).map((f) => {
      let json = null;
      try { json = JSON.parse(f.text || ''); } catch (_) { /* 非 JSON 保留原文 */ }
      return { event: f.event, id: f.id, size: f.size, data: (f.text || '').slice(0, 2048), json };
    });
    sendJson(res, 200, {
      summary: core.sessionSummary(s),
      handshake: s.handshake ? { ...s.handshake, headers: core.maskHeaders(s.handshake.headers, settings.maskHeaders) } : null,
      stats: s.stats,
      closedReason: s.closedReason,
      samples,
    });
    return;
  }

  // ── 单会话 ──
  const m = /^\/api\/session\/([A-Za-z0-9]+)(\/[a-z]+)?$/.exec(pathname);
  if (m) {
    const [, id, action] = m;
    if (!action && req.method === 'GET') {
      const s = getSessionOr404(id, res); if (!s) return;
      const since = parseInt(query.get('since') || '-1', 10);
      const frames = s.frames.filter((f) => f.seq > since).slice(-300)
        .map((f) => core.projectFrame(f, settings.frameBodyCap));
      sendJson(res, 200, {
        summary: core.sessionSummary(s),
        request: {
          method: s.request.method, url: s.url,
          headers: core.maskHeaders(s.request.headers, settings.maskHeaders),
          subprotocols: s.request.subprotocols, pingIntervalSec: s.request.pingIntervalSec,
          body: s.request.body != null ? core.truncateText(s.request.body, 4096).text : undefined,
          maxEvents: s.request.maxEvents, durationMs: s.request.durationMs,
        },
        handshake: s.handshake ? { ...s.handshake, headers: core.maskHeaders(s.handshake.headers, settings.maskHeaders) } : null,
        frames,
        cursor: s.nextSeq - 1,
        degraded,
      });
      return;
    }
    if (action === '/send' && req.method === 'POST') {
      const s = getSessionOr404(id, res); if (!s) return;
      if (s.kind !== 'ws') { sendJson(res, 400, { error: '仅 WS 会话可发送' }); return; }
      if (!s.ws || s.ws.readyState !== WebSocket.OPEN) { sendJson(res, 409, { error: `连接未就绪（state=${s.state}）` }); return; }
      const body = await readBody(req);
      const op = body.op === 'binary' || body.op === 'ping' ? body.op : 'text';
      try {
        if (op === 'ping') {
          s.ws.ping(Buffer.from(String(body.text || Date.now())));
          s.counters.pings = (s.counters.pings || 0) + 1;
          const payload = String(body.text || '');
          pushFrame(s, { dir: 'out', kind: 'ping', size: Buffer.byteLength(payload), message: `手动 ping${payload ? `（载荷 ${payload.slice(0, 64)}）` : ''}` });
        } else if (op === 'binary') {
          const buf = Buffer.from(String(body.b64 || ''), 'base64');
          if (!buf.length) { sendJson(res, 400, { error: 'b64 为空或非法' }); return; }
          s.ws.send(buf, { binary: true });
          s.counters.out = (s.counters.out || 0) + 1;
          s.counters.bytesOut = (s.counters.bytesOut || 0) + buf.length;
          pushFrame(s, { dir: 'out', kind: 'binary', size: buf.length, b64: core.truncateText(buf.toString('base64'), settings.frameBodyCap).text });
        } else {
          const text = String(body.text == null ? '' : body.text);
          if (text.length > 1_048_576) { sendJson(res, 400, { error: '文本超过 1MB 上限' }); return; }
          s.ws.send(text, { binary: false });
          s.counters.out = (s.counters.out || 0) + 1;
          s.counters.bytesOut = (s.counters.bytesOut || 0) + Buffer.byteLength(text);
          const t = core.truncateText(text, settings.frameBodyCap);
          pushFrame(s, { dir: 'out', kind: 'text', size: Buffer.byteLength(text), text: t.text, truncated: t.truncated || undefined });
        }
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 500, { error: `发送失败：${e.message}` });
      }
      return;
    }
    if (action === '/close' && req.method === 'POST') {
      const s = getSessionOr404(id, res); if (!s) return;
      const body = await readBody(req);
      const code = Number.isFinite(Number(body.code)) ? Math.min(4999, Math.max(1000, Math.round(Number(body.code)))) : 1000;
      const reason = String(body.reason || '').slice(0, 120);
      if (s.kind === 'ws') {
        if (s.ws) {
          if (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING) {
            try { s.ws.close(code, reason); } catch (_) { try { s.ws.terminate(); } catch (_) { /* 忽略 */ } }
          }
        } else {
          s.manualStop = true; s.stopReason = '手动关闭';
          finalizeSession(s, 'stopped');
        }
      } else {
        s.manualStop = true; s.stopReason = '手动停止';
        try { s.abort.abort(); } catch (_) { /* 忽略 */ }
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (action === '/stop' && req.method === 'POST') {
      const s = getSessionOr404(id, res); if (!s) return;
      s.manualStop = true; s.stopReason = '手动停止';
      try { if (s.abort) s.abort.abort(); } catch (_) { /* 忽略 */ }
      try { if (s.ws && s.ws.readyState <= WebSocket.OPEN) s.ws.close(1000, 'client stop'); } catch (_) { /* 忽略 */ }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (action === '/reconnect' && req.method === 'POST') {
      const s = getSessionOr404(id, res); if (!s) return;
      const live = [...sessions.values()].filter((x) => !x.finalized).length;
      if (live >= 12) { sendJson(res, 429, { error: '进行中会话已达 12 个上限' }); return; }
      const params = {
        url: s.url, title: s.title,
        headers: s.request.headers, subprotocols: s.request.subprotocols,
        pingIntervalSec: s.request.pingIntervalSec,
        method: s.request.method, body: s.request.body,
        maxEvents: s.request.maxEvents, durationMs: s.request.durationMs,
      };
      try {
        const ns = s.kind === 'ws' ? openWsSession(params) : openSseSession(params);
        sendJson(res, 200, { session: core.sessionSummary(ns) });
      } catch (e) { sendJson(res, 400, { error: e.message }); }
      return;
    }
    if (action === '/next' && req.method === 'GET') {
      // long-poll：等新帧（MCP ws_wait_frame 用）。responded 守卫：超时与 finalize
      // 可能竞态触发同一次挂起，双重应答会让 http 层抛 headers-sent。
      const s = getSessionOr404(id, res); if (!s) return;
      const after = parseInt(query.get('after') || '-1', 10);
      const timeoutMs = Math.min(30_000, Math.max(0, parseInt(query.get('timeoutMs') || '10000', 10)));
      const collect = () => s.frames.filter((f) => f.seq > after).slice(-100)
        .map((f) => core.projectFrame(f, 2048));
      const existing = collect();
      if (existing.length || s.finalized || timeoutMs === 0) {
        sendJson(res, 200, { frames: existing, final: s.finalized, cursor: s.nextSeq - 1 });
        return;
      }
      let responded = false;
      const respond = (payload) => {
        if (responded) return;
        responded = true;
        sendJson(res, 200, payload);
      };
      const waiter = { after, resolve: null, timer: null };
      const p = new Promise((resolve) => { waiter.resolve = resolve; });
      waiter.timer = setTimeout(() => {
        sessionWaiterRemove(s, waiter);
        respond({ frames: [], timeout: true, final: s.finalized, cursor: s.nextSeq - 1 });
      }, timeoutMs);
      s.waiters.push(waiter);
      await p;
      respond({ frames: collect(), final: s.finalized, cursor: s.nextSeq - 1 });
      return;
    }
    if (action === '/stream' && req.method === 'GET') {
      // 实时帧推送（fetch-SSE；面板用自定义客户端解析）
      const s = getSessionOr404(id, res); if (!s) return;
      const since = parseInt(query.get('since') || '-1', 10);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      const backlog = s.frames.filter((f) => f.seq > since).slice(-300)
        .map((f) => core.projectFrame(f, settings.frameBodyCap));
      if (backlog.length) res.write(`data: ${JSON.stringify({ type: 'frames', frames: backlog })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'status', summary: core.sessionSummary(s) })}\n\n`);
      s.streams.add(res);
      const hb = setInterval(() => {
        try { res.write(': hb\n\n'); } catch (_) { /* 忽略 */ }
      }, STREAM_HB_MS);
      req.on('close', () => { clearInterval(hb); s.streams.delete(res); });
      return;
    }
    if ((!action || action === '') && req.method === 'DELETE') {
      const s = getSessionOr404(id, res); if (!s) return;
      if (!s.finalized) {
        s.manualStop = true; s.stopReason = '手动移除';
        try { if (s.abort) s.abort.abort(); } catch (_) { /* 忽略 */ }
        try { if (s.ws && s.ws.readyState <= WebSocket.OPEN) s.ws.terminate(); } catch (_) { /* 忽略 */ }
      }
      sessions.delete(s.id);
      scheduleIndexPersist();
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  // ── 设置 / 元信息 ──
  if (pathname === '/api/settings' && req.method === 'GET') {
    sendJson(res, 200, { settings, degraded, version: VERSION, uptime: Date.now() - STARTED_AT });
    return;
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    settings = clampSettings({ ...settings, ...body });
    if (!degraded) { try { await kv.kvSet('streamdesk.settings', settings); } catch (_) { /* 忽略 */ } }
    sendJson(res, 200, { settings });
    return;
  }
  if (pathname === '/api/history/clear' && req.method === 'POST') {
    // 清理历史：删全部 transcript + 重建索引（保留进行中会话）
    if (!degraded) {
      try {
        const keys = await kv.kvKeys();
        const mine = keys.filter((k) => /^streamdesk\.session\./.test(k));
        for (const k of mine) await kv.kvDel(k);
      } catch (_) { /* 忽略 */ }
    }
    for (const s of [...sessions.values()]) { if (s.finalized) sessions.delete(s.id); }
    scheduleIndexPersist();
    sendJson(res, 200, { ok: true });
    return;
  }
  if (pathname === '/api/meta' && req.method === 'GET') {
    sendJson(res, 200, {
      version: VERSION, port: PORT, uptime: Date.now() - STARTED_AT,
      degraded, live: [...sessions.values()].filter((s) => !s.finalized).length,
      kvEndpoint: kv.endpoint() ? `${kv.endpoint().host}:${kv.endpoint().port}` : null,
    });
    return;
  }

  sendJson(res, 404, { error: `未知 API：${req.method} ${pathname}` });
}

function sessionWaiterRemove(s, waiter) {
  const i = s.waiters.indexOf(waiter);
  if (i >= 0) s.waiters.splice(i, 1);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = u.pathname;
  if (pathname === '/__health') {
    sendJson(res, 200, { status: 'ok', version: VERSION, degraded, sessions: sessions.size, uptime: Date.now() - STARTED_AT });
    return;
  }
  handleApi(req, res, pathname, u.searchParams).catch((e) => {
    log('error', `API 处理异常 ${pathname}: ${e.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: `服务内部错误：${e.message}` });
    else try { res.end(); } catch (_) { /* 忽略 */ }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log('info', `长连接调试台服务 http://127.0.0.1:${PORT} (pid ${process.pid}, v${VERSION})`);
  // 读回 token（持久化，重启不换，与 api-bench 同策略）+ 恢复索引 + 启动 sweep
  (async () => {
    try {
      const meta = await kv.kvGet('streamdesk.meta');
      if (meta && typeof meta.token === 'string' && meta.token.length >= 32) {
        token = meta.token;
        log('info', 'token 自 kv meta 恢复');
      }
      const savedSettings = await kv.kvGet('streamdesk.settings');
      if (savedSettings) settings = clampSettings(savedSettings);
      const index = await kv.kvGet('streamdesk.sessions');
      if (Array.isArray(index) && index.length) {
        // 上次进程的「进行中」会话随进程死亡——标记 interrupted（帧不恢复，如实标注）
        for (const s of index) {
          if (s && typeof s.id === 'string' && ['open', 'connecting', 'capturing'].includes(s.state)) {
            s.state = 'interrupted';
            s.closedReason = '服务重启，进行中会话中断（帧不跨重启存活）';
          }
        }
        await kv.kvSet('streamdesk.sessions', index.slice(0, MAX_INDEX));
        log('info', `历史索引恢复：${index.length} 条`);
      }
      // 孤儿 transcript sweep：索引外的 session.* 键删除（kvKeys 只取键名，负担小，仅启动一次）
      try {
        const keys = await kv.kvKeys();
        const orphans = keys.filter((k) => /^streamdesk\.session\./.test(k))
          .filter((k) => !index.some((s) => `streamdesk.session.${s.id}` === k));
        for (const k of orphans) await kv.kvDel(k);
        if (orphans.length) log('info', `清理孤儿 transcript ${orphans.length} 个`);
      } catch (_) { /* sweep 失败不致命 */ }
    } catch (_) { /* 降级模式由 writeMeta 处理 */ }
    writeMeta();
  })();
  metaTimer = setInterval(writeMeta, META_BEAT_MS);
});

// ── 进程守卫（net-sentinel 纪律：异常只记不退）───────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : String(e)}`));

function shutdown() {
  log('info', '收到退出信号，清理会话…');
  try { if (metaTimer) clearInterval(metaTimer); } catch (_) { /* 忽略 */ }
  for (const s of sessions.values()) {
    try { if (s.ws && s.ws.readyState <= WebSocket.OPEN) s.ws.close(1001, 'service shutdown'); } catch (_) { /* 忽略 */ }
    try { if (s.abort) s.abort.abort(); } catch (_) { /* 忽略 */ }
  }
  persistIndex().catch(() => {}).finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
