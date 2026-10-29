#!/usr/bin/env node
'use strict';
/**
 * sundial.js —— 日程提醒后台服务（零依赖，node >= 18，需全局 fetch）
 *
 * 职责（sundial.* 键空间里「提醒投影 / ICS 同步 / 运行态」的单写权威）：
 *   - 提醒投影：按事件 + remind 展开（shared/core），到期窗口内写 sundial.reminders，
 *     面板 ack（sundial.ui.acked，面板唯一写者）与发生 done/skip 抑制都参与重算
 *   - ICS 订阅同步：条件请求（ETag / If-Modified-Since，304 零成本回跳）、按间隔轮询、
 *     解析 → planIcsSync（uid 幂等 upsert + 失踪删除 + 保留 done/remind）→ 写事件
 *   - 命令信箱（消费即删，面板/MCP → 服务的唯一触发通道）：
 *       sundial.cmd.ics.add.<n>        添加订阅并立即同步
 *       sundial.cmd.ics.refresh.<cid>  单订阅立刷
 *       sundial.cmd.ics.refreshAll.<n> 全部立刷
 *       sundial.cmd.ics.remove.<cid>   删订阅 + 联动删其全部事件
 *   - 保留策略清扫：过期一次性事件删除（重复事件永留）、done map 超限裁剪、过期死命令回收（>1h）
 *   - 心跳 sundial.meta（60s）供面板展示服务状态
 *
 * 跨域铁律：**全部外网抓取只发生在本进程**（Node 原生 fetch + SSRF 守卫，无同源策略）。
 * 面板与 MCP 永不直接 fetch 外网——单一抓取路径，无第二条写法。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 * 桥不可达时健康端点仍返回 200，避免被误杀重启循环，降级状态见 sundial.meta）。
 *
 * 启动参数：node sundial.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 5000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 60 * 1000;
const EVENTS_REREAD_MS = 8000;       // 事件缓存周期（面板/MCP 直写事件，半周期内可见）
const REMIND_INTERVAL_MS = 10 * 1000; // 提醒投影重算周期
const SWEEP_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_ICS_BODY_BYTES = 4 * 1024 * 1024;
const HOST_GAP_MS = 5 * 1000;        // 同主机两次抓取最小间隔
const MAX_CMDS_PER_TICK = 20;

const K = {
  ev: (id) => `sundial.ev.${id}`,
  evPrefix: 'sundial.ev.',
  ics: (id) => `sundial.ics.${id}`,
  icsPrefix: 'sundial.ics.',
  settings: 'sundial.settings',
  meta: 'sundial.meta',
  reminders: 'sundial.reminders',
  uiAcked: 'sundial.ui.acked',
  cmdIcsAdd: (n) => `sundial.cmd.ics.add.${n}`,
  cmdIcsRefresh: (cid) => `sundial.cmd.ics.refresh.${cid}`,
  cmdIcsRefreshAll: (n) => `sundial.cmd.ics.refreshAll.${n}`,
  cmdIcsRemove: (cid) => `sundial.cmd.ics.remove.${cid}`,
  cmdPrefix: 'sundial.cmd.',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'sundial.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.SUNDIAL_DEBUG === '1';
function log(level, msg) {
  const line = `[sundial:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── HTTP 原生抓取（超时 + 流式限长 + 条件请求头 + SSRF 守卫由调用方先过）────
async function fetchUrl(url, { timeoutMs, maxBytes, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolarisSundial/0.1; +https://github.com/misxzaiz/Polaris-plugin)',
        'Accept': 'text/calendar, application/calendar+xml, text/plain;q=0.9, */*;q=0.5',
        ...headers,
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? '抓取超时' : String(e.message || e) };
  }
  clearTimeout(timer);
  if (res.status === 304) {
    res.resume?.();
    return { ok: true, notModified: true, status: 304 };
  }
  if (!res.ok) {
    res.resume?.();
    return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  }
  // undici web ReadableStream：reader 循环，超限 cancel（防超大响应撑爆内存）
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(Buffer.from(value));
      if (size >= maxBytes) { await reader.cancel().catch(() => {}); break; }
    }
  } catch (_) {
    return { ok: false, error: '读取响应失败' };
  }
  return {
    ok: true,
    status: res.status,
    body: Buffer.concat(chunks).toString('utf8'),
    etag: res.headers.get('etag') || '',
    lastModified: res.headers.get('last-modified') || '',
  };
}

// ── 主服务 ─────────────────────────────────────────────────────────────────
/**
 * @param opts {{port?: number, appConfigDir?: string}}
 */
function createSundial(opts) {
  const port = parseInt(opts && opts.port, 10) || 0;
  const appConfigDir = (opts && opts.appConfigDir) || '';

  const kv = createKvClient({ appConfigDir, log });

  let settings = core.normalizeSettings(null);
  const events = new Map();  // eid → event（EVENTS_REREAD_MS 内复用缓存）
  const icsDefs = new Map(); // cid → ics def
  const state = {
    eventsReadAt: 0,
    icsReadAt: 0,
    settingsReadAt: 0,
    remindersAt: 0,
    hostLastAt: new Map(),
    lastSweepAt: 0,
    lastMetaAt: 0,
    startedAt: Date.now(),
    degraded: false,
    lastEndpointRefreshAt: 0,
    lastKeyList: [],
    lastKeyListAt: 0,
    busy: false,
  };

  async function keyList(forceTtlMs = 7000) {
    if (Date.now() - state.lastKeyListAt < forceTtlMs && state.lastKeyList.length) return state.lastKeyList;
    state.lastKeyList = await kv.kvKeys();
    state.lastKeyListAt = Date.now();
    return state.lastKeyList;
  }

  async function refreshSettings() {
    if (Date.now() - state.settingsReadAt < SETTINGS_REREAD_MS) return;
    const raw = await kv.kvGet(K.settings).catch(() => null);
    if (raw && typeof raw === 'object') settings = core.normalizeSettings(raw);
    state.settingsReadAt = Date.now();
  }

  /** 事件重读（8s 缓存）：面板/MCP 直写的事件与 done 标记半周期内可见 */
  async function loadEvents(force) {
    if (!force && Date.now() - state.eventsReadAt < EVENTS_REREAD_MS && events.size) return;
    const keys = await keyList();
    const evKeys = keys.filter((k) => k.startsWith(K.evPrefix));
    const defs = await Promise.all(evKeys.map(async (k) => {
      const v = await kv.kvGet(k).catch(() => null);
      return v && typeof v === 'object' && v.id ? v : null;
    }));
    events.clear();
    for (const e of defs) if (e) events.set(e.id, e);
    state.eventsReadAt = Date.now();
    log('debug', `events loaded: ${events.size}`);
  }

  /** ICS 订阅定义重读（30s 缓存；命令驱动的变更单独即时读） */
  async function loadIcsDefs(force) {
    if (!force && Date.now() - state.icsReadAt < 30000 && icsDefs.size) return;
    const keys = await keyList();
    const defKeys = keys.filter((k) => k.startsWith(K.icsPrefix));
    const defs = await Promise.all(defKeys.map(async (k) => {
      const v = await kv.kvGet(k).catch(() => null);
      return v && typeof v === 'object' && v.id ? v : null;
    }));
    icsDefs.clear();
    for (const d of defs) if (d) icsDefs.set(d.id, d);
    state.icsReadAt = Date.now();
  }

  /** 某 icsId 下的现有事件（同步用，绕缓存直读） */
  async function loadEventsOfIcs(cid) {
    const keys = await keyList();
    const evKeys = keys.filter((k) => k.startsWith(K.evPrefix));
    const out = [];
    await Promise.all(evKeys.map(async (k) => {
      const v = await kv.kvGet(k).catch(() => null);
      if (v && typeof v === 'object' && v.id && v.icsId === cid) out.push(v);
    }));
    return out;
  }

  function icsAllowed(def) {
    return !!(def && def.enabled !== false && core.isFetchableUrl(def.url));
  }

  function effectiveIntervalMs(def) {
    const s = core.normalizeSettings(settings);
    const ce = Number(def.consecutiveErrors) || 0;
    const factor = ce >= 3 ? 4 : ce >= 1 ? 2 : 1;
    return Math.floor(s.icsIntervalHours * 3600000 * factor);
  }

  /** 单订阅同步：条件请求 → 解析 → planIcsSync → 写事件/订阅运行态 */
  async function syncIcsOnce(def, { forced = false } = {}) {
    if (!icsAllowed(def)) return { skipped: true, why: 'disabled' };
    const host = (() => { try { return new URL(def.url).host; } catch (_) { return ''; } })();
    const last = state.hostLastAt.get(host) || 0;
    if (!forced && Date.now() - last < HOST_GAP_MS) return { skipped: true, why: 'host-gap' };
    state.hostLastAt.set(host, Date.now());

    const now = Date.now();
    const cond = {};
    if (def.etag) cond['If-None-Match'] = def.etag;
    if (def.lastModified) cond['If-Modified-Since'] = def.lastModified;

    const res = await fetchUrl(def.url, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_ICS_BODY_BYTES, headers: cond });

    const writeStatus = async (patch) => {
      const upd = { ...def, ...patch };
      icsDefs.set(def.id, upd);
      await kv.kvSet(K.ics(def.id), upd).catch(() => {});
    };

    if (res.ok && res.notModified) {
      await writeStatus({ lastFetchAt: now, lastStatus: 'ok', lastError: '', consecutiveErrors: 0 });
      log('debug', `304 not modified: ${def.url}`);
      return { ok: true, notModified: true };
    }
    if (!res.ok) {
      const ce = (Number(def.consecutiveErrors) || 0) + 1;
      await writeStatus({ lastFetchAt: now, lastStatus: 'error', lastError: String(res.error || '抓取失败').slice(0, 160), consecutiveErrors: ce });
      log('warn', `ics 抓取失败(${ce}): ${def.url} — ${res.error}`);
      return { ok: false };
    }
    const parsed = core.icsToRawEvents(res.body, def.name, now);
    if (!parsed.ok || !Array.isArray(parsed.raws)) {
      const ce = (Number(def.consecutiveErrors) || 0) + 1;
      await writeStatus({ lastFetchAt: now, lastStatus: 'error', lastError: 'ICS 解析失败', consecutiveErrors: ce });
      log('warn', `ics 解析失败: ${def.url}`);
      return { ok: false };
    }
    const existing = await loadEventsOfIcs(def.id);
    const plan = core.planIcsSync(existing, parsed.raws, def.id, parsed.skipsByUid, now);
    for (const e of plan.upserts) await kv.kvSet(K.ev(e.id), e).catch(() => {});
    for (const id of plan.deletes) {
      await kv.kvDel(K.ev(id)).catch(() => {});
      events.delete(id);
    }
    await writeStatus({
      etag: res.etag || '',
      lastModified: res.lastModified || '',
      lastFetchAt: now,
      lastStatus: 'ok',
      lastError: '',
      consecutiveErrors: 0,
      eventCount: existing.length - plan.deletes.length + plan.upserts.filter((e) => !existing.some((x) => x.id === e.id)).length,
      rev: (Number(def.rev) || 1) + 1,
    });
    eventsReadInvalidate();
    log('info', `ics ok: "${def.name}" ${plan.upserts.length} 条 upsert / ${plan.deletes.length} 条删除`);
    return { ok: true, upserts: plan.upserts.length, deletes: plan.deletes.length };
  }

  function eventsReadInvalidate() {
    state.eventsReadAt = 0;
    state.lastKeyListAt = 0;
  }

  /** 提醒投影重算：ack 由面板键（sundial.ui.acked，面板唯一写者）提供 */
  async function computeRemindersProjection(force) {
    if (!force && Date.now() - state.remindersAt < REMIND_INTERVAL_MS) return;
    state.remindersAt = Date.now();
    await loadEvents();
    const acked = (await kv.kvGet(K.uiAcked).catch(() => null)) || {};
    const list = core.computeReminders([...events.values()], Date.now(), {
      acked: typeof acked === 'object' && acked ? acked : {},
      graceMin: settings.reminderGraceMin,
    });
    await kv.kvSet(K.reminders, { at: Date.now(), items: list }).catch(() => {});
    log('debug', `reminders: ${list.length}`);
  }

  /** 删订阅联动清理（命令触发） */
  async function forgetIcs(cid) {
    const def = await kv.kvGet(K.ics(cid)).catch(() => null);
    await kv.kvDel(K.ics(cid)).catch(() => {});
    icsDefs.delete(cid);
    const keys = await keyList(true);
    const evKeys = keys.filter((k) => k.startsWith(K.evPrefix));
    let n = 0;
    for (const k of evKeys) {
      const v = await kv.kvGet(k).catch(() => null);
      if (v && typeof v === 'object' && v.icsId === cid) {
        await kv.kvDel(k).catch(() => {});
        events.delete(v.id);
        n++;
      }
    }
    eventsReadInvalidate();
    log('info', `forget ics ${cid}${def ? ` (${def.name})` : ''}: 删除 ${n} 个事件`);
  }

  // ── 保留策略 + 孤儿回收 ────────────────────────────────────────────────────
  async function sweep() {
    const keys = await keyList();
    const evKeys = keys.filter((k) => k.startsWith(K.evPrefix));
    const all = await Promise.all(evKeys.map(async (k) => kv.kvGet(k).catch(() => null)));
    const live = all.filter((e) => e && typeof e === 'object' && e.id);

    for (const id of core.planRetention(live, settings, Date.now())) {
      await kv.kvDel(K.ev(id)).catch(() => {});
      events.delete(id);
    }
    // done map 超限裁剪（只在变化时回写）
    for (const e of live) {
      const pruned = core.pruneDoneMap(e.done);
      if (pruned !== e.done) {
        await kv.kvSet(K.ev(e.id), { ...e, done: pruned, rev: (Number(e.rev) || 1) + 1 }).catch(() => {});
        events.set(e.id, { ...e, done: pruned });
      }
    }
    // 过期死命令（服务未运行时段堆积的 >1h 命令）
    const now = Date.now();
    for (const k of keys.filter((k2) => k2.startsWith(K.cmdPrefix))) {
      const v = await kv.kvGet(k).catch(() => null);
      if (!v || (typeof v === 'object' && Number(v.at) > 0 && now - Number(v.at) > 3600000)) {
        await kv.kvDel(k).catch(() => {});
      }
    }
    // ack 表瘦身：保留 7 天内的 ack
    const acked = await kv.kvGet(K.uiAcked).catch(() => null);
    if (acked && typeof acked === 'object') {
      const entries = Object.entries(acked).filter(([, t]) => Number(t) > now - 7 * 86400000);
      if (entries.length !== Object.keys(acked).length) {
        await kv.kvSet(K.uiAcked, Object.fromEntries(entries)).catch(() => {});
      }
    }
    log('info', `清扫完成（事件 ${live.length}）`);
  }

  // ── 命令信箱（消费即删；先删后做是幂等核心）────────────────────────────────
  async function consumeCommands(keyListNow) {
    const cmdKeys = keyListNow.filter((k) => k.startsWith(K.cmdPrefix)).slice(0, MAX_CMDS_PER_TICK);
    const actions = [];
    for (const k of cmdKeys) {
      const v = await kv.kvGet(k).catch(() => null);
      await kv.kvDel(k).catch(() => {});
      if (v && typeof v === 'object') actions.push({ k, v });
    }
    return actions;
  }

  // ── tick 主流程 ───────────────────────────────────────────────────────────
  async function tick() {
    if (state.busy) return; // 重入保护：上一轮没跑完就跳过
    state.busy = true;
    try {
      await refreshSettings();
      await loadEvents();
      const keys = await keyList();

      // 1. 命令信箱
      const actions = await consumeCommands(keys);
      const forcedCids = new Set();
      let refreshAll = false;
      let needSweep = false;
      for (const { k, v } of actions) {
        if (k.startsWith('sundial.cmd.ics.add.')) {
          const r = core.normalizeIcs(v, null);
          if (r.error) { log('warn', `ics add 命令不合法: ${r.error}`); continue; }
          await kv.kvSet(K.ics(r.ics.id), r.ics).catch(() => {});
          icsDefs.set(r.ics.id, r.ics);
          forcedCids.add(r.ics.id);
          log('info', `ics added via cmd: ${r.ics.url}`);
        } else if (k.startsWith('sundial.cmd.ics.refresh.')) {
          forcedCids.add(k.slice('sundial.cmd.ics.refresh.'.length));
        } else if (k.startsWith('sundial.cmd.ics.refreshAll.')) {
          refreshAll = true;
        } else if (k.startsWith('sundial.cmd.ics.remove.')) {
          await forgetIcs(k.slice('sundial.cmd.ics.remove.'.length));
        } else if (k.startsWith('sundial.cmd.sweep.')) {
          needSweep = true;
        }
      }
      if (refreshAll) for (const [, d] of icsDefs) forcedCids.add(d.id);
      await loadIcsDefs(Boolean(forcedCids.size));
      if (needSweep) { state.lastSweepAt = 0; }

      // 2. 计划轮询：到期最早/被强制的订阅，一次 tick 同步一个（礼貌并发 1）
      const now = Date.now();
      const due = [];
      for (const [, d] of icsDefs) {
        if (!icsAllowed(d)) continue;
        if (forcedCids.has(d.id)) { due.push({ d, forced: true }); continue; }
        if (d.lastFetchAt > 0 && now - d.lastFetchAt < effectiveIntervalMs(d)) continue;
        due.push({ d, forced: false });
      }
      due.sort((a, b) => (a.d.lastFetchAt || 0) - (b.d.lastFetchAt || 0));
      for (const item of due) {
        const r = await syncIcsOnce(item.d, { forced: item.forced });
        if (!r.skipped) break; // 本 tick 已完成一次真实抓取
      }

      // 3. 提醒投影
      await computeRemindersProjection(Boolean(actions.length));

      // 4. 保留策略 + 孤儿回收
      if (Date.now() - state.lastSweepAt > SWEEP_MS) {
        state.lastSweepAt = Date.now();
        await sweep();
      }

      // 5. 心跳
      if (Date.now() - state.lastMetaAt > META_BEAT_MS) {
        state.lastMetaAt = Date.now();
        let remindCount = 0;
        const rproj = await kv.kvGet(K.reminders).catch(() => null);
        if (rproj && Array.isArray(rproj.items)) remindCount = rproj.items.length;
        await kv.kvSet(K.meta, {
          version: VERSION,
          pid: process.pid,
          startedAt: state.startedAt,
          lastTickAt: Date.now(),
          bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
          events: events.size,
          icsCount: icsDefs.size,
          reminders: remindCount,
          settings: { icsIntervalHours: settings.icsIntervalHours, retentionDays: settings.retentionDays },
        }).catch(() => {});
      }

      if (state.degraded) {
        state.degraded = false;
        log('info', 'bridge 已恢复');
      }
    } catch (e) {
      const wasDown = state.degraded;
      state.degraded = true;
      log('warn', `tick 降级: ${e.message}`);
      if (!wasDown || Date.now() - state.lastEndpointRefreshAt > 60 * 1000) {
        if (!wasDown) log('info', 'bridge 不可达，进入降级（健康端点保持 200）');
        state.lastEndpointRefreshAt = Date.now();
        kv.refreshEndpoint(true).catch(() => {});
      }
    } finally {
      state.busy = false;
    }
  }

  let loopTimer = null;
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/__health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true, version: VERSION, degraded: state.degraded,
        uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
        events: events.size,
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  let started = false;
  function start() {
    if (started) return;
    started = true;
    state.startedAt = Date.now();
    log('info', `sundial service v${VERSION} start (pid=${process.pid}, health=${port || '(unbound)'})`);
    const run = () => { tick().catch((e) => log('error', `tick 异常: ${e.stack || e.message}`)); };
    run();
    loopTimer = setInterval(run, TICK_MS);
  }
  function stop() {
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
    started = false;
  }

  return {
    kv, tick, start, stop, loadEvents, refreshSettings, syncIcsOnce, sweep,
    computeRemindersProjection, consumeCommands, healthServer, state,
    get settings() { return settings; },
    get events() { return events; },
    get icsDefs() { return icsDefs; },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cliPort = parseInt(process.argv[2], 10) || 0;
  const cliAppConfigDir = process.argv[3] || '';
  initLog(cliAppConfigDir);
  const app = createSundial({ port: cliPort, appConfigDir: cliAppConfigDir });
  if (cliPort > 0) {
    app.healthServer.listen(cliPort, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${cliPort}`));
    app.healthServer.on('error', (e) => log('error', `health endpoint: ${e.message}`));
  }
  app.start();
  process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
  process.on('SIGTERM', () => { try { app.healthServer.close(); } catch (_) { /* ignore */ } process.exit(0); });
  process.on('SIGINT', () => { try { app.healthServer.close(); } catch (_) { /* ignore */ } process.exit(0); });
}

module.exports = { createSundial, K };
