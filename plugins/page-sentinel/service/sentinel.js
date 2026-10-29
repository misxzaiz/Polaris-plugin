#!/usr/bin/env node
'use strict';
/**
 * sentinel.js —— 网页监测后台服务（零依赖，node >= 18，需有全局 fetch）
 *
 * 职责（单一抓取路径的唯一权威）：
 *   - 周期调度 watch 目标：原生 fetch（无浏览器同源策略，无 CORS）——
 *     面板/AI 永不直接抓外网，这是本插件解决"跨域"的核心设计
 *   - 抽取（text/selector/regex/json/headers）+ 行级 diff + 条件评估
 *   - 状态/快照/事件写回 cap.kv（sentinel.* 键空间），与面板、MCP 共享
 *   - 消费控制命令：sentinel.cmd.check.<id>（立即检查）、sentinel.cmd.test.<n>（试抓）
 *   - 保留策略清理（事件数/天数上限、孤儿键、过期试抓结果）
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + healthCheck=/__health，
 * 任何 2xx 视为健康；桥不可达时健康端点仍返回 200，避免被误杀重启循环，
 * 降级状态写入 sentinel.meta 供面板展示）。
 *
 * 启动参数：node sentinel.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractByMode, parseNumber } = require('./extract');
const { diffLines } = require('./diff');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 3000;
const MIN_INTERVAL_SEC = 30;
const HOST_MIN_GAP_MS = 15000;      // 同一主机两次请求最小间隔（礼貌抓取）
const FETCH_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const SNAP_CAP = 256 * 1024;        // 快照文本上限
const EVENT_EXTRACT_CAP = 4 * 1024; // 事件内嵌抽取文本上限
const TEST_TEXT_CAP = 32 * 1024;
const RETENTION_SWEEP_MS = 15 * 60 * 1000;
const META_BEAT_MS = 60 * 1000;
const ERROR_EVENT_MIN_GAP_MS = 60 * 60 * 1000; // 同目标错误事件限频

const DEFAULT_SETTINGS = {
  pausedAll: false,
  maxConcurrency: 3,
  retentionDays: 30,
  maxEventsPerTarget: 50,
  userAgent: '',
};

// ── kv 键空间（与面板/MCP 保持一致，契约见 README）─────────────────────────
const K = {
  target: (id) => `sentinel.target.${id}`,
  state: (id) => `sentinel.state.${id}`,
  snap: (id) => `sentinel.snap.${id}`,
  event: (id, at) => `sentinel.event.${id}.${String(at).padStart(13, '0')}`,
  eventPrefix: (id) => `sentinel.event.${id}.`,
  cmdCheck: (id) => `sentinel.cmd.check.${id}`,
  cmdTest: (nonce) => `sentinel.cmd.test.${nonce}`,
  test: (nonce) => `sentinel.test.${nonce}`,
  settings: 'sentinel.settings',
  meta: 'sentinel.meta',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'page-sentinel.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.SENTINEL_DEBUG === '1';
function log(level, msg) {
  const line = `[page-sentinel:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n'); // 服务 stdout 无消费者；stderr 仅诊断
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 目标规范化/校验（防御面板与 MCP 之外的脏数据）───────────────────────────
const MODES = new Set(['text', 'selector', 'regex', 'json', 'headers']);
const CONDITIONS = new Set(['any', 'contains', 'notContains', 'lt', 'gt']);

function normalizeTarget(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return null;
  const t = {
    id: raw.id,
    name: String(raw.name || url).slice(0, 120),
    url,
    mode: MODES.has(raw.mode) ? raw.mode : 'text',
    intervalSec: Math.max(MIN_INTERVAL_SEC, Number(raw.intervalSec) > 0 ? Math.floor(Number(raw.intervalSec)) : 600),
    condition: CONDITIONS.has(raw.condition) ? raw.condition : 'any',
    enabled: raw.enabled !== false,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  if (raw.selector) t.selector = String(raw.selector).slice(0, 500);
  if (raw.regex) t.regex = String(raw.regex).slice(0, 500);
  if (raw.jsonPath) t.jsonPath = String(raw.jsonPath).slice(0, 500);
  if (raw.keyword !== undefined && raw.keyword !== null && String(raw.keyword).length) {
    t.keyword = String(raw.keyword).slice(0, 500);
  }
  if (Number.isFinite(Number(raw.threshold))) t.threshold = Number(raw.threshold);
  if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
    const h = {};
    for (const [k, v] of Object.entries(raw.headers)) {
      if (typeof k === 'string' && k.trim() && typeof v === 'string') h[k.trim()] = v.slice(0, 2000);
    }
    if (Object.keys(h).length) t.headers = h;
  }
  if (t.mode === 'selector' && !t.selector) return null;
  if (t.mode === 'regex' && !t.regex) return null;
  if (t.mode === 'json' && !t.jsonPath) return null;
  return t;
}

// ── 服务主体 ────────────────────────────────────────────────────────────────
function createSentinel({ port, appConfigDir }) {
  const kv = createKvClient({ appConfigDir, log });
  const startedAt = Date.now();

  /** targets: Map<id, TargetDef>；states: Map<id, TargetState>（内存镜像，进程内权威） */
  const targets = new Map();
  const states = new Map();
  const settings = { ...DEFAULT_SETTINGS };
  let lastSettingsLoad = 0;
  let lastRetentionSweep = 0;
  let lastMetaBeat = 0;
  let lastTickAt = 0;
  let ticking = false;
  let bridgeOk = false;

  const queue = [];            // 待检查 targetId 队列（去重）
  const queued = new Set();
  const inFlight = new Set();  // 正在检查的 targetId
  const hostLastFetch = new Map(); // hostname → ts（同主机礼貌间隔）
  const skipGapOnce = new Set();   // 手动命令（立即检查）跳过同主机间隔——节流只该约束周期调度
  const workers = [];
  let stopped = false;         // 置位后 worker 循环退出、定时器停摆（进程可干净退出）

  function getState(id) {
    if (!states.has(id)) {
      states.set(id, {
        id, status: 'ok', checkCount: 0, errorCount: 0,
        conditionState: 'unknown', // contains/notContains/lt/gt 的边沿状态
        lastErrorEventAt: 0,
      });
    }
    return states.get(id);
  }

  // ── 抓取 ──
  async function fetchUrl(url, { headers, timeoutMs } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('fetch 超时')), timeoutMs || FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers,
      });
      const h = {};
      res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
      const declaredLen = parseInt(h['content-length'] || '', 10);
      if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
        // 超大响应：只关心头信息
        return { status: res.status, headers: h, body: '' };
      }
      const buf = await res.arrayBuffer();
      const body = buf.byteLength > MAX_BODY_BYTES
        ? Buffer.from(buf.slice(0, MAX_BODY_BYTES)).toString('utf8')
        : Buffer.from(buf).toString('utf8');
      return { status: res.status, headers: h, body };
    } finally {
      clearTimeout(timer);
    }
  }

  function defaultUserAgent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Polaris-PageSentinel/' + VERSION;
  }

  function buildHeaders(target, st, { conditional }) {
    const h = {
      'user-agent': settings.userAgent || defaultUserAgent(),
      accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    if (target.headers) Object.assign(h, target.headers);
    // headers 模式盯的就是响应头，绝不能带条件请求头（304 会掩盖头变化）
    if (conditional && target.mode !== 'headers') {
      if (st.etag) h['if-none-match'] = st.etag;
      if (st.lastModified) h['if-modified-since'] = st.lastModified;
    }
    return h;
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (_) { return '(invalid)'; }
  }

  /** 同一主机礼貌间隔：不够就等待 */
  async function respectHostGap(url) {
    const host = hostOf(url);
    const last = hostLastFetch.get(host) || 0;
    const wait = last + HOST_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, HOST_MIN_GAP_MS)));
    hostLastFetch.set(host, Date.now());
  }

  // ── 事件 ──
  async function writeEvent(target, st, ev) {
    const at = ev.at || Date.now();
    const key = K.event(target.id, at);
    const full = {
      id: `${target.id}-${at}`,
      targetId: target.id,
      targetName: target.name,
      type: ev.type,
      at,
      httpStatus: ev.httpStatus,
      summary: String(ev.summary || '').slice(0, 300),
      diff: ev.diff && ev.diff.length ? ev.diff.slice(0, 120) : undefined,
      extract: ev.extract ? ev.extract.slice(0, EVENT_EXTRACT_CAP) : undefined,
    };
    try {
      await kv.kvSet(key, full);
      log('info', `event ${ev.type} target=${target.id} ${full.summary}`);
    } catch (e) {
      log('warn', `事件写失败 ${key}: ${e.message}`);
    }
  }

  async function recordError(target, st, msg, httpStatus) {
    st.status = 'error';
    st.errorCount += 1;
    st.lastError = String(msg).slice(0, 300);
    st.lastCheckedAt = Date.now();
    // 失败同样推迟下次检查（避免每 tick 硬打失败 URL）
    st.nextCheckAt = st.lastCheckedAt + target.intervalSec * 1000 + Math.floor(Math.random() * target.intervalSec * 50);
    const due = !st.lastErrorEventAt || (Date.now() - st.lastErrorEventAt >= ERROR_EVENT_MIN_GAP_MS);
    if (due) {
      st.lastErrorEventAt = Date.now();
      st.lastEventSummary = `检查失败：${st.lastError}`;
      await writeEvent(target, st, { type: 'error', at: st.lastErrorEventAt, summary: st.lastEventSummary, httpStatus });
    }
    await persistState(target, st);
  }

  async function persistState(target, st) {
    const out = {
      id: st.id,
      status: st.status,
      lastCheckedAt: st.lastCheckedAt,
      lastOkAt: st.lastOkAt,
      lastChangeAt: st.lastChangeAt,
      nextCheckAt: st.nextCheckAt,
      checkCount: st.checkCount,
      errorCount: st.errorCount,
      contentHash: st.contentHash,
      httpStatus: st.httpStatus,
      lastError: st.lastError,
      conditionState: st.conditionState,
      lastErrorEventAt: st.lastErrorEventAt,
      lastEventSummary: st.lastEventSummary,
      etag: st.etag,
      lastModified: st.lastModified,
    };
    try { await kv.kvSet(K.state(st.id), out); } catch (e) { log('warn', `状态写失败 ${st.id}: ${e.message}`); }
  }

  function summarizeCondition(target, text, num) {
    switch (target.condition) {
      case 'contains': return `包含「${target.keyword}」`;
      case 'notContains': return `不再包含「${target.keyword}」`;
      case 'lt': return `低于阈值 ${target.threshold}（当前 ${Number.isFinite(num) ? num : '无数值'}）`;
      case 'gt': return `高于阈值 ${target.threshold}（当前 ${Number.isFinite(num) ? num : '无数值'}）`;
      default: return '内容变化';
    }
  }

  function evaluateBool(target, text) {
    const kw = (target.keyword || '').toLowerCase();
    const has = kw ? String(text || '').toLowerCase().includes(kw) : false;
    switch (target.condition) {
      case 'contains': return has;
      case 'notContains': return !has;
      case 'lt': { const n = parseNumber(text); return Number.isFinite(n) && n < target.threshold; }
      case 'gt': { const n = parseNumber(text); return Number.isFinite(n) && n > target.threshold; }
      default: return false;
    }
  }

  // ── 单目标检查 ──
  async function performCheck(target) {
    const st = getState(target.id);
    inFlight.add(target.id);
    try {
      if (skipGapOnce.delete(target.id)) {
        hostLastFetch.set(hostOf(target.url), Date.now());
      } else {
        await respectHostGap(target.url);
      }
      const conditional = !!st.etag || !!st.lastModified;
      let res;
      try {
        res = await fetchUrl(target.url, { headers: buildHeaders(target, st, { conditional }) });
      } catch (e) {
        await recordError(target, st, e.message || String(e));
        return;
      }

      // 304：内容未变
      if (res.status === 304 && target.mode !== 'headers') {
        finishOk(target, st, { unchanged: true, httpStatus: 304 });
        return;
      }

      if (res.status >= 400) {
        await recordError(target, st, `HTTP ${res.status}`, res.status);
        return;
      }

      const ex = extractByMode(target, res);
      if (!ex.ok) {
        await recordError(target, st, ex.error || '抽取失败', res.status);
        return;
      }

      // 条件请求头记忆（供下轮 304 短路）
      st.etag = res.headers.etag || undefined;
      st.lastModified = res.headers['last-modified'] || undefined;

      const text = ex.text || '';
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      const prevHash = st.contentHash;
      const firstCheck = !prevHash;
      const changed = !firstCheck && hash !== prevHash;

      // 条件边沿评估（contains/notContains/lt/gt）
      let conditionEvent = null;
      if (target.condition !== 'any') {
        const b = evaluateBool(target, text);
        const prev = st.conditionState;
        st.conditionState = b ? 'true' : 'false';
        if (prev === 'unknown') {
          // 首查只落状态不报事件
        } else if (!prevBool(prev) && b) {
          conditionEvent = {
            type: 'match',
            summary: `条件满足：${summarizeCondition(target, text, parseNumber(text))}`,
            extract: text,
          };
        } else if (prevBool(prev) && !b) {
          conditionEvent = {
            type: 'unmatch',
            summary: `条件解除：${target.condition === 'notContains' ? `重新出现「${target.keyword}」` : summarizeCondition(target, text, parseNumber(text))}`,
            extract: text,
          };
        }
      }

      let changeEvent = null;
      if (target.condition === 'any' && changed) {
        let diff = null;
        try {
          const prevSnap = await kv.kvGet(K.snap(target.id));
          const oldText = prevSnap && typeof prevSnap.text === 'string' ? prevSnap.text : '';
          const r = diffLines(oldText, text);
          diff = r.ops.filter((o) => o.kind === '-' || o.kind === '+' || o.kind === '±');
        } catch (e) { /* 快照读失败不阻塞事件 */ }
        changeEvent = {
          type: 'change',
          summary: `内容变化${diff ? `（${diff.length} 段差异）` : ''}`,
          diff,
          extract: text,
        };
      }

      // 写快照
      try {
        await kv.kvSet(K.snap(target.id), { text: text.slice(0, SNAP_CAP), at: Date.now() });
      } catch (e) { log('warn', `快照写失败 ${target.id}: ${e.message}`); }

      st.contentHash = hash;
      st.httpStatus = res.status;
      // lastEventSummary 须在 finishOk 持久化前落定，事件实体随后异步写
      if (changeEvent || conditionEvent) st.lastEventSummary = (changeEvent || conditionEvent).summary;
      finishOk(target, st, { unchanged: !changed && !conditionEvent });

      if (changeEvent) {
        st.lastChangeAt = Date.now();
        await writeEvent(target, st, changeEvent);
      }
      if (conditionEvent) await writeEvent(target, st, conditionEvent);
      if (firstCheck) log('info', `首查完成 target=${target.id} mode=${target.mode} hash=${hash.slice(0, 8)}`);
    } finally {
      inFlight.delete(target.id);
    }
  }

  function prevBool(condState) { return condState === 'true'; }

  function finishOk(target, st, { unchanged, httpStatus }) {
    const recovered = st.status === 'error';
    st.status = 'ok';
    st.lastError = undefined;
    st.lastCheckedAt = Date.now();
    st.lastOkAt = st.lastCheckedAt;
    st.checkCount += 1;
    if (httpStatus) st.httpStatus = httpStatus;
    st.nextCheckAt = st.lastCheckedAt + target.intervalSec * 1000 + Math.floor(Math.random() * target.intervalSec * 50);
    if (recovered) {
      st.lastEventSummary = '恢复正常（此前出错）';
      writeEvent(target, st, { type: 'recovered', at: st.lastOkAt, summary: st.lastEventSummary, httpStatus });
    }
    persistState(target, st);
    log('debug', `check ${target.id} ok unchanged=${!!unchanged}`);
  }

  // ── 调度 ──
  function scheduleTick() {
    const now = Date.now();
    for (const target of targets.values()) {
      if (!target.enabled || settings.pausedAll) continue;
      if (queued.has(target.id) || inFlight.has(target.id)) continue;
      const st = getState(target.id);
      const due = !st.nextCheckAt || now >= st.nextCheckAt;
      if (due) enqueue(target.id);
    }
  }

  function enqueue(id) {
    queued.add(id);
    queue.push(id);
  }

  async function workerLoop() {
    while (!stopped) {
      const id = queue.shift();
      if (id === undefined) { await sleep(300); continue; }
      queued.delete(id);
      const target = targets.get(id);
      if (!target) continue; // 已删除
      if (!target.enabled || settings.pausedAll) continue;
      try {
        await performCheck(target);
      } catch (e) {
        log('warn', `performCheck 异常 target=${id}: ${e.message}`);
        try {
          const st = getState(id);
          await recordError(target, st, e.message || String(e));
        } catch (_) { /* 尽力而为 */ }
      }
    }
  }

  // ── 控制命令 ──
  async function handleCommands(allKeys) {
    for (const key of allKeys) {
      if (key.startsWith('sentinel.cmd.check.')) {
        const id = key.slice('sentinel.cmd.check.'.length);
        await kv.kvDel(key).catch(() => {});
        const target = targets.get(id);
        if (target && target.enabled) {
          const st = getState(id);
          st.nextCheckAt = 0;
          skipGapOnce.add(id);
          if (!queued.has(id) && !inFlight.has(id)) enqueue(id);
          log('info', `收到立即检查命令 target=${id}`);
        }
      } else if (key.startsWith('sentinel.cmd.test.')) {
        const nonce = key.slice('sentinel.cmd.test.'.length);
        const spec = await kv.kvGet(key).catch(() => null);
        await kv.kvDel(key).catch(() => {});
        if (!spec || typeof spec !== 'object') continue;
        await runTest(nonce, spec);
      }
    }
  }

  async function runTest(nonce, spec) {
    const t0 = Date.now();
    let out;
    try {
      const url = typeof spec.url === 'string' ? spec.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) throw new Error('URL 必须以 http(s):// 开头');
      const res = await fetchUrl(url, {
        headers: {
          'user-agent': settings.userAgent || defaultUserAgent(),
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
      });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      const ex = extractByMode(spec, res);
      if (!ex.ok) throw new Error(ex.error || '抽取失败');
      out = { ok: true, text: (ex.text || '').slice(0, TEST_TEXT_CAP), status: res.status, at: Date.now(), elapsedMs: Date.now() - t0 };
    } catch (e) {
      out = { ok: false, error: e.message || String(e), at: Date.now(), elapsedMs: Date.now() - t0 };
    }
    try {
      await kv.kvSet(K.test(nonce), out);
      log('info', `试抓完成 nonce=${nonce} ok=${out.ok}`);
    } catch (e) {
      log('warn', `试抓结果写失败 nonce=${nonce}: ${e.message}`);
    }
  }

  // ── 保留清理 ──
  async function retentionSweep(allKeys) {
    const now = Date.now();
    const keepPerTarget = Math.max(10, Number(settings.maxEventsPerTarget) || 50);
    const maxAgeMs = Math.max(1, Number(settings.retentionDays) || 30) * 24 * 3600 * 1000;

    const eventsByKey = allKeys.filter((k) => k.startsWith('sentinel.event.'));
    const byTarget = new Map();
    for (const k of eventsByKey) {
      const rest = k.slice('sentinel.event.'.length);
      const dot = rest.lastIndexOf('.');
      if (dot <= 0) continue;
      const id = rest.slice(0, dot);
      const at = Number(rest.slice(dot + 1)) || 0;
      if (!byTarget.has(id)) byTarget.set(id, []);
      byTarget.get(id).push({ k, at });
    }
    const toDelete = [];
    for (const [id, list] of byTarget) {
      list.sort((a, b) => b.at - a.at); // 新→旧
      list.forEach((e, idx) => {
        if (idx >= keepPerTarget || (now - e.at) > maxAgeMs) toDelete.push(e.k);
      });
      if (!targets.has(id)) list.forEach((e) => toDelete.push(e.k)); // 孤儿事件
    }
    for (const k of allKeys) {
      if (k.startsWith('sentinel.state.') || k.startsWith('sentinel.snap.')) {
        const id = k.slice(k.lastIndexOf('.') + 1);
        if (!targets.has(id)) toDelete.push(k);
      }
      if (k.startsWith('sentinel.test.')) {
        // 试抓结果由消费方删；这里兜底清 15 分钟前的
        // 无时间戳在键里，值里有 at —— 略过读值成本，直接靠消费方删除
      }
    }
    if (toDelete.length) {
      log('info', `保留清理：删除 ${toDelete.length} 个过期/孤儿键`);
      for (const k of toDelete) await kv.kvDel(k).catch(() => {});
    }
  }

  // ── 心跳 ──
  async function metaBeat() {
    try {
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt,
        bridge: bridgeOk ? `${(kv.endpoint() || {}).host}:${(kv.endpoint() || {}).port}` : 'unreachable',
        targets: targets.size,
        enabled: [...targets.values()].filter((t) => t.enabled).length,
        pausedAll: settings.pausedAll,
        queued: queue.length,
        inFlight: inFlight.size,
      });
    } catch (_) { /* 桥断了等下轮 */ }
  }

  // ── 主 tick ──
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const allKeys = await kv.kvKeys();
      bridgeOk = true;
      // 心跳时间必须在本 tick 内尽早落定：metaBeat 在 tick 中段写入，若放到
      // tick 末尾赋值，首轮心跳的 lastTickAt 会是 0，面板/冒烟会误判"未报告"
      lastTickAt = Date.now();

      // 载入 targets
      const seen = new Set();
      for (const key of allKeys) {
        if (!key.startsWith('sentinel.target.')) continue;
        const id = key.slice('sentinel.target.'.length);
        const raw = await kv.kvGet(key);
        const t = normalizeTarget(raw);
        if (t) { targets.set(id, t); seen.add(id); }
        else targets.delete(id);
      }
      for (const id of [...targets.keys()]) if (!seen.has(id)) targets.delete(id);

      // 每 60s 刷新全局设置
      const now = Date.now();
      if (now - lastSettingsLoad > META_BEAT_MS) {
        lastSettingsLoad = now;
        const s = await kv.kvGet(K.settings).catch(() => null);
        if (s && typeof s === 'object') {
          settings.pausedAll = s.pausedAll === true;
          settings.maxConcurrency = Math.min(6, Math.max(1, Number(s.maxConcurrency) || 3));
          settings.retentionDays = Math.max(1, Number(s.retentionDays) || 30);
          settings.maxEventsPerTarget = Math.max(10, Number(s.maxEventsPerTarget) || 50);
          settings.userAgent = typeof s.userAgent === 'string' ? s.userAgent.slice(0, 300) : '';
        }
      }

      await handleCommands(allKeys);
      scheduleTick();

      if (now - lastRetentionSweep > RETENTION_SWEEP_MS) {
        lastRetentionSweep = now;
        await retentionSweep(allKeys).catch((e) => log('warn', `保留清理失败: ${e.message}`));
      }
      if (now - lastMetaBeat > META_BEAT_MS) {
        lastMetaBeat = now;
        await metaBeat();
      }
    } catch (e) {
      bridgeOk = false;
      log('warn', `tick 失败（桥不可达？）: ${e.message}`);
    } finally {
      ticking = false;
    }
  }

  function ensureWorkers() {
    const want = Math.min(6, Math.max(1, settings.maxConcurrency));
    while (workers.length < want) workers.push(workerLoop());
  }

  let tickTimer = null;
  let workerScalerTimer = null;
  function start() {
    initLog(appConfigDir);
    log('info', `sentinel 服务启动 v${VERSION} port=${port || '(none)'} appConfigDir=${appConfigDir || '(none)'}`);
    tickTimer = setInterval(() => { tick(); }, TICK_MS);
    tick();
    ensureWorkers();
    // 设置变化后调整 worker 数
    workerScalerTimer = setInterval(ensureWorkers, META_BEAT_MS);
  }

  function stop() {
    stopped = true;
    if (tickTimer) clearInterval(tickTimer);
    if (workerScalerTimer) clearInterval(workerScalerTimer);
    log('info', 'sentinel 服务停止');
  }

  const healthServer = http.createServer((req, res) => {
    const u = req.url || '';
    if (u.startsWith('/__health') || u.startsWith('/api/status')) {
      const body = JSON.stringify({
        status: 'ok',
        degraded: !bridgeOk,
        version: VERSION,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        lastTickAt,
        targets: targets.size,
        queued: queue.length,
        inFlight: inFlight.size,
        bridge: kv.endpoint(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return { start, stop, healthServer, tick, targets, states, settings, kv };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 入口 ──
if (require.main === module) {
  const PORT = parseInt(process.argv[2], 10) || 0;
  const APP_CONFIG_DIR = process.argv[3] || '';

  const app = createSentinel({ port: PORT, appConfigDir: APP_CONFIG_DIR });

  process.on('SIGTERM', () => { app.stop(); app.healthServer.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); });
  process.on('SIGINT', () => { app.stop(); app.healthServer.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); });

  app.healthServer.listen(PORT, '127.0.0.1', () => {
    log('info', `health 端点就绪 http://127.0.0.1:${PORT}/__health`);
  });
  app.healthServer.on('error', (e) => {
    log('warn', `health 端口监听失败（${e.message}）；服务继续运行（调度不受影响）`);
  });

  app.start();
}

module.exports = { createSentinel, normalizeTarget, K, DEFAULT_SETTINGS, VERSION };
