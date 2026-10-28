#!/usr/bin/env node
'use strict';
/**
 * quotes.js —— 盘哨后台服务（零依赖，node >= 18，需有全局 fetch）
 *
 * 职责（行情状态的唯一写权威）：
 *   - 周期批量拉取自选+指数行情：腾讯 qt.gtimg.cn 主源 → 东财 push2 备源
 *     →（两源全挂时保留上一轮 state，标 source:'cache'，不产生假数据）
 *   - 到价/涨跌幅提醒评估与触发（交易日单次去重，只评估今日行情）
 *   - 消费命令键：qsent.cmd.search.<n>（搜索）、qsent.cmd.quote.<n>（即时查）、
 *     qsent.cmd.minute.<id>（当日分时）——面板与 AI 经此请求服务侧抓取
 *   - 状态写回 cap.kv（qsent.* 键空间，契约见 README）
 *
 * 面板/AI 永不直连外网——外网抓取全部由本服务原生 fetch 执行，
 * 这是「盘哨」解决浏览器跨域/同源限制的核心设计。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + healthCheck=/__health，
 * 任何 2xx 视为健康；桥不可达时健康端点仍返回 200，避免被误杀重启循环，
 * 降级状态写入 qsent.meta 供面板展示）。
 *
 * 启动参数：node quotes.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createKvClient } = require('./kvclient');
const providers = require('./providers');
const norm = require('./normalize');
const alertsEngine = require('./alerts');

const VERSION = '0.1.0';
const TICK_MS = 1000;
const DEFS_REFRESH_MS = 5000;     // 自选/提醒/设置刷新周期
const META_BEAT_MS = 60 * 1000;
const FEED_CAP = 100;             // 提醒历史条数上限
const CMD_SCAN_MS = 2000;         // 命令键扫描周期
const INDEXES_CAP = 8;

const DEFAULT_SETTINGS = {
  pollSec: 20,
  offHoursPollSec: 300,
  redUp: true,
  indexes: ['sh000001', 'sz399001', 'sz399006'],
};

// ── kv 键空间（与面板/MCP 保持一致，契约见 README）─────────────────────────
const K = {
  watch: (id) => `qsent.watch.${id}`,
  state: (id) => `qsent.state.${id}`,
  minute: (id) => `qsent.minute.${id}`,
  cmdMinute: (id) => `qsent.cmd.minute.${id}`,
  cmdQuote: (nonce) => `qsent.cmd.quote.${nonce}`,
  quote: (nonce) => `qsent.quote.${nonce}`,
  cmdSearch: (nonce) => `qsent.cmd.search.${nonce}`,
  search: (nonce) => `qsent.search.${nonce}`,
  alert: (aid) => `qsent.alert.${aid}`,
  alertFeed: 'qsent.alert.feed',
  position: (id) => `qsent.position.${id}`,
  settings: 'qsent.settings',
  meta: 'qsent.meta',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'quote-sentinel.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.QSENT_DEBUG === '1';
function log(level, msg) {
  const line = `[quote-sentinel:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 设置规范化 ───────────────────────────────────────────────────────────────
function clamp(n, lo, hi, dflt) {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  s.pollSec = clamp(raw.pollSec, 10, 300, DEFAULT_SETTINGS.pollSec);
  s.offHoursPollSec = clamp(raw.offHoursPollSec, 60, 3600, DEFAULT_SETTINGS.offHoursPollSec);
  s.redUp = raw.redUp !== false;
  if (Array.isArray(raw.indexes)) {
    const seen = new Set();
    s.indexes = raw.indexes
      .map((x) => (typeof x === 'string' ? norm.normalizeCode(x) : null))
      .filter((r) => r && r.id && !seen.has(r.id) && seen.add(r.id))
      .map((r) => r.id)
      .slice(0, INDEXES_CAP);
  }
  return s;
}

// ── 主服务 ───────────────────────────────────────────────────────────────────
function createService(opts = {}) {
  const kv = opts.kv || createKvClient({ appConfigDir: opts.appConfigDir, log });
  const deps = { fetchImpl: opts.fetchImpl }; // 测试注入；undefined 时用全局 fetch

  const S = {
    settings: { ...DEFAULT_SETTINGS },
    watches: new Map(),       // secid → def
    alerts: new Map(),        // aid → alert
    lastStates: new Map(),    // secid → 最近一次成功行情（缓存兜底与提醒评估）
    lastPollAt: 0,
    lastOkAt: 0,
    lastSource: '',
    lastError: '',
    startedAt: Date.now(),
    inFlightPoll: false,
  };

  async function refreshDefinitions() {
    try {
      const keys = await kv.kvKeys();
      const watchIds = keys.filter((k) => k.startsWith('qsent.watch.')).map((k) => k.slice('qsent.watch.'.length));
      const alertIds = keys.filter((k) => k.startsWith('qsent.alert.') && k !== 'qsent.alert.feed' && !k.startsWith('qsent.alertReadAt'))
        .map((k) => k.slice('qsent.alert.'.length));
      const [watchVals, alertVals, settings] = await Promise.all([
        Promise.all(watchIds.map((id) => kv.kvGet(K.watch(id)))),
        Promise.all(alertIds.map((aid) => kv.kvGet(K.alert(aid)))),
        kv.kvGet(K.settings).catch(() => null),
      ]);
      const nextWatches = new Map();
      watchIds.forEach((id, i) => {
        const w = watchVals[i];
        if (w && typeof w === 'object' && typeof w.id === 'string') nextWatches.set(w.id, w);
      });
      const nextAlerts = new Map();
      alertIds.forEach((aid, i) => {
        const a = alertsEngine.normalizeAlert(alertVals[i]);
        if (a) nextAlerts.set(a.id, a);
      });
      S.watches = nextWatches;
      S.alerts = nextAlerts;
      S.settings = normalizeSettings(settings);
    } catch (e) {
      log('warn', `刷新定义失败（保留旧值继续）: ${e.message}`);
    }
  }

  function pollIntervalSec() {
    const now = Date.now();
    return norm.inTradingSession(now) ? S.settings.pollSec : S.settings.offHoursPollSec;
  }

  function targetIds() {
    const ids = [];
    for (const id of S.settings.indexes || []) if (!ids.includes(id)) ids.push(id);
    for (const id of S.watches.keys()) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  /** 只在内容变化时写 state（停牌/收盘时数据不变，避免高频空写） */
  async function writeState(quote) {
    const prev = S.lastStates.get(quote.id);
    const same = prev && prev.price === quote.price && prev.pct === quote.pct
      && prev.time === quote.time && prev.source === quote.source;
    S.lastStates.set(quote.id, quote);
    if (same) return;
    await kv.kvSet(K.state(quote.id), quote);
  }

  async function persistAlertFire(alert, quote) {
    const now = Date.now();
    const updated = { ...alert, lastFiredDate: norm.bjNow(now).date };
    const fire = {
      at: now,
      alertId: alert.id,
      code: alert.code,
      name: (quote && quote.name) || alert.code,
      type: alert.type,
      value: alert.value,
      price: quote ? quote.price : null,
      pct: quote ? quote.pct : null,
      time: quote ? quote.time : '',
      msg: `${(quote && quote.name) || alert.code} ${alertsEngine.describeAlert(alert)}——现价 ${quote ? quote.price : '—'}（${quote ? quote.pct : '—'}%）`,
    };
    // 顺序：先落规则去重位（防重复触发），再进 feed
    await kv.kvSet(K.alert(alert.id), updated);
    let feed = [];
    try {
      const cur = await kv.kvGet(K.alertFeed);
      if (Array.isArray(cur)) feed = cur;
    } catch (_) { /* feed 读失败不阻塞触发记录 */ }
    feed.unshift(fire);
    if (feed.length > FEED_CAP) feed.length = FEED_CAP;
    await kv.kvSet(K.alertFeed, feed);
    log('info', `提醒触发: ${fire.msg}`);
  }

  async function pollQuotes() {
    if (S.inFlightPoll) return; // 上一轮未结束不叠加（礼貌抓取 + 防重入）
    const ids = targetIds();
    if (!ids.length) { S.lastPollAt = Date.now(); return; }
    S.inFlightPoll = true;
    try {
      const r = await providers.fetchQuotes(ids, deps);
      const now = Date.now();
      S.lastPollAt = now;
      S.lastOkAt = now;
      S.lastSource = r.source;
      S.lastError = r.degraded && r.missing && r.missing.length
        ? `部分标的未取到: ${r.missing.join(',')}` : '';
      for (const q of r.quotes.values()) {
        await writeState(q);
      }
      // 提醒评估：只用刚取到的今日行情
      const today = norm.bjNow(now).date;
      const fires = alertsEngine.evaluateAlerts([...S.alerts.values()], r.quotes, today);
      for (const f of fires) {
        await persistAlertFire(f.alert, f.quote);
        S.alerts.set(f.alert.id, { ...f.alert, lastFiredDate: today });
      }
      if (DEBUG) log('debug', `poll ok: ${r.quotes.size}/${ids.length} source=${r.source} fires=${fires.length}`);
    } catch (e) {
      // 两源全挂：保留既有 state（面板可见 source=cache 时间不更新），如实记录
      S.lastPollAt = Date.now();
      S.lastError = `行情源不可用（保留缓存）: ${e.message}`;
      log('warn', S.lastError);
    } finally {
      S.inFlightPoll = false;
    }
  }

  // ── 命令消费（面板/MCP → 服务侧抓取）─────────────────────────────────────
  async function consumeSearch(key) {
    const nonce = key.slice(K.cmdSearch('').length);
    try {
      const cmd = await kv.kvGet(key);
      await kv.kvDel(key);
      const q = cmd && typeof cmd.q === 'string' ? cmd.q.trim() : '';
      if (!q) throw new Error('缺少搜索词');
      const results = await providers.fetchSearch(q, deps);
      await kv.kvSet(K.search(nonce), { ok: true, at: Date.now(), results });
    } catch (e) {
      await kv.kvSet(K.search(nonce), { ok: false, at: Date.now(), error: e.message }).catch(() => {});
      log('warn', `搜索失败: ${e.message}`);
    }
  }

  async function consumeQuote(key) {
    const nonce = key.slice(K.cmdQuote('').length);
    try {
      const cmd = await kv.kvGet(key);
      await kv.kvDel(key);
      const codes = Array.isArray(cmd && cmd.codes) ? cmd.codes.slice(0, providers.MAX_BATCH) : [];
      if (!codes.length) throw new Error('缺少 codes');
      const ids = [];
      for (const c of codes) {
        const r = norm.normalizeCode(c);
        if (r.id && !ids.includes(r.id)) ids.push(r.id);
        else if (r.error && ids.length === 0) throw new Error(r.error);
      }
      if (!ids.length) throw new Error('没有可查询的有效代码');
      try {
        const r = await providers.fetchQuotes(ids, deps);
        await kv.kvSet(K.quote(nonce), {
          ok: true, at: Date.now(),
          quotes: [...r.quotes.values()],
          source: r.source,
          missing: r.missing || [],
        });
        for (const q of r.quotes.values()) await writeState(q);
      } catch (e) {
        // 两源全挂 → 缓存兜底（标注 stale，不冒充实时）
        const cached = ids.map((id) => S.lastStates.get(id)).filter(Boolean)
          .map((q) => ({ ...q, source: 'cache' }));
        await kv.kvSet(K.quote(nonce), {
          ok: cached.length > 0, at: Date.now(),
          quotes: cached,
          source: 'cache',
          error: cached.length ? `实时源不可用，返回缓存: ${e.message}` : e.message,
        });
      }
    } catch (e) {
      await kv.kvSet(K.quote(nonce), { ok: false, at: Date.now(), error: e.message }).catch(() => {});
      log('warn', `即时查失败: ${e.message}`);
    }
  }

  async function consumeMinute(key) {
    const id = key.slice(K.cmdMinute('').length);
    try {
      await kv.kvGet(key);
      await kv.kvDel(key);
      if (!/^(sh|sz|bj)\d{6}$/.test(id)) throw new Error('非法代码');
      const m = await providers.fetchMinute(id, deps);
      await kv.kvSet(K.minute(id), { ok: true, fetchedAt: Date.now(), ...m });
    } catch (e) {
      await kv.kvSet(K.minute(id), { ok: false, fetchedAt: Date.now(), error: e.message }).catch(() => {});
      log('warn', `分时获取失败 ${id}: ${e.message}`);
    }
  }

  async function consumeCommands(keys) {
    const jobs = [];
    for (const key of keys) {
      if (key.startsWith('qsent.cmd.search.')) jobs.push(consumeSearch(key));
      else if (key.startsWith('qsent.cmd.quote.')) jobs.push(consumeQuote(key));
      else if (key.startsWith('qsent.cmd.minute.')) jobs.push(consumeMinute(key));
    }
    if (jobs.length) await Promise.allSettled(jobs);
  }

  async function writeMeta() {
    const enabledAlerts = [...S.alerts.values()].filter((a) => a.enabled !== false).length;
    await kv.kvSet(K.meta, {
      version: VERSION,
      pid: process.pid,
      startedAt: S.startedAt,
      wroteAt: Date.now(),
      lastPollAt: S.lastPollAt || null,
      lastOkAt: S.lastOkAt || null,
      lastSource: S.lastSource,
      lastError: S.lastError,
      watches: S.watches.size,
      alerts: S.alerts.size,
      enabledAlerts,
      pollSec: pollIntervalSec(),
      inSession: norm.inTradingSession(Date.now()),
      bridge: (kv.endpoint && kv.endpoint() && `${kv.endpoint().host}:${kv.endpoint().port}`) || null,
    }).catch((e) => log('warn', `meta 写入失败: ${e.message}`));
  }

  // ── 主循环 ────────────────────────────────────────────────────────────────
  let lastDefsAt = 0;
  let lastCmdScanAt = 0;
  let lastMetaAt = 0;
  let stopped = false;

  async function tick() {
    const now = Date.now();
    try {
      if (now - lastDefsAt >= DEFS_REFRESH_MS) { lastDefsAt = now; await refreshDefinitions(); }
      if (now - lastCmdScanAt >= CMD_SCAN_MS) {
        lastCmdScanAt = now;
        try {
          const keys = await kv.kvKeys();
          await consumeCommands(keys);
        } catch (e) {
          log('debug', `命令扫描失败: ${e.message}`);
        }
      }
      if (now - S.lastPollAt >= pollIntervalSec() * 1000) await pollQuotes();
      if (now - lastMetaAt >= META_BEAT_MS) { lastMetaAt = now; await writeMeta(); }
    } catch (e) {
      log('warn', `tick 异常: ${e.message}`);
    }
    if (!stopped) timer = setTimeout(tick, TICK_MS);
  }

  let timer = null;
  function start() {
    log('info', `盘哨服务 v${VERSION} 启动 (pid ${process.pid})`);
    timer = setTimeout(tick, 300);
  }
  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  }

  return { start, stop, tick, S, kv, pollQuotes, refreshDefinitions, writeState, persistAlertFire, normalizeSettings };
}

// ── 健康端点（桥不可达仍 200，避免宿主误杀重启循环）─────────────────────────
function startHealthServer(port, service) {
  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];
    if (url === '/__health' || url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      const s = service ? service.S : {};
      res.end(JSON.stringify({
        ok: true,
        version: VERSION,
        watches: s.watches ? s.watches.size : 0,
        lastSource: s.lastSource || '',
        degraded: Boolean(s.lastError),
      }));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.on('error', (e) => {
      log('warn', `健康端口 ${port} 不可用: ${e.message}（继续无健康端点运行）`);
      resolve(null);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// ── 入口 ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const port = parseInt(process.argv[2] || '', 10) || 0;
  const appConfigDir = process.argv[3] || '';
  initLog(appConfigDir);
  const service = createService({ appConfigDir });
  service.start();
  if (port) startHealthServer(port, service);
  const shutdown = () => { service.stop(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createService, normalizeSettings, DEFAULT_SETTINGS, K };
