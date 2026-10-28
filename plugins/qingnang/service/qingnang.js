#!/usr/bin/env node
'use strict';
/**
 * qingnang.js —— 青囊后台服务（零依赖，node >= 18）
 *
 * 职责（qingnang.* 键空间里「派生投影」的单写权威；实体与打卡记录由面板/MCP 直写）：
 *   - 今日应服投影 qingnang.doses：某日「未打卡且已到点」（now/overdue），
 *     面板横幅 / AI / 三端共用（服务每 tick 重算，内容不变不写）
 *   - 药箱快照 qingnang.stocks：FEFO 库存派生 + 补货预测 + 效期红黄榜（含批次级剩余）
 *     ——把「需要全量打卡记录」的派生收敛在服务端，面板/AI 读一个键即得，
 *       免去三端各自拉全量日志
 *   - 心跳 qingnang.meta（60s）供面板判定服务在线
 *
 * 设计边界（如实）：
 *   - 零外网请求、零命令信箱——实体/打卡均由面板与 MCP 直写 cap.kv，本服务只读派生；
 *     写侧幂等（occKey 覆盖语义），服务重算纯函数，无并发写面
 *   - 日志缓存：新键增量拉取 + 120s 全量兜底（打卡状态改写同键，全量兜底收敛）
 *   - 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 *     桥不可达时健康端点仍返回 200，避免被误杀重启循环，降级状态见 meta）
 *
 * 启动参数：node qingnang.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 15 * 1000;          // 投影重算周期
const META_BEAT_MS = 60 * 1000;
const ENTITY_REFRESH_MS = 20 * 1000;   // 实体值重拉（编辑可见性；量小）
const LOG_FULL_REFRESH_MS = 120 * 1000; // 打卡记录全量兜底（状态改写同键）
const DEGRADED_MS = 5 * 60 * 1000;  // 快照超过此时长视为降级（面板回落本地计算）

const K = {
  profilePrefix: 'qingnang.profile.',
  medPrefix: 'qingnang.med.',
  batchPrefix: 'qingnang.batch.',
  regPrefix: 'qingnang.reg.',
  logPrefix: 'qingnang.log.',
  settings: 'qingnang.settings',
  doses: 'qingnang.doses',
  stocks: 'qingnang.stocks',
  meta: 'qingnang.meta',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'qingnang.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.QINGNANG_DEBUG === '1';
function log(level, msg) {
  const line = `[qingnang:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 数据装载（实体增量 diff + 日志增量 + 周期全量兜底）───────────────────────
function createDataLayer(kv) {
  const cache = {
    knownKeys: null,
    profiles: new Map(), meds: new Map(), batches: new Map(), regimens: new Map(),
    logs: new Map(),          // occKey -> log
    logKeysKnown: new Set(),
    logsFullAt: 0,
    settingsRaw: null,
    settingsAt: 0,
  };

  async function loadGroup(prefix, map, validate) {
    const keys = cache.knownKeys.filter((k) => k.startsWith(prefix));
    const keySet = new Set(keys);
    for (const id of [...map.keys()]) {
      if (!keySet.has(prefix + id)) map.delete(id); // 消失键剔除（删除生效）
    }
    const todo = keys.filter((k) => !map.has(k) || !map.get(k)._fetchedAt || Date.now() - map.get(k)._fetchedAt > ENTITY_REFRESH_MS);
    // 实体量小（几十级）：新键立即拉 + 周期重拉收敛编辑
    for (const k of todo) {
      const v = await kv.kvGet(k).catch(() => null);
      if (v && typeof v === 'object' && v.id && (!validate || validate(v))) {
        v._fetchedAt = Date.now();
        map.set(v.id, v);
      } else if (!v) map.delete(k.slice(prefix.length));
    }
  }

  async function loadLogs() {
    const now = Date.now();
    const keys = cache.knownKeys.filter((k) => k.startsWith(K.logPrefix));
    const keySet = new Set(keys);
    // occKey -> kv 键；log.occKey 即去掉前缀的键名
    for (const key of [...cache.logKeysKnown]) {
      if (!keySet.has(key)) { cache.logs.delete(key.slice(K.logPrefix.length)); cache.logKeysKnown.delete(key); }
    }
    const full = now - cache.logsFullAt > LOG_FULL_REFRESH_MS;
    const todo = keys.filter((k) => full || !cache.logKeysKnown.has(k));
    for (const k of todo) {
      const v = await kv.kvGet(k).catch(() => null);
      const occKey = k.slice(K.logPrefix.length);
      if (v && typeof v === 'object' && v.occKey === occKey) {
        cache.logs.set(occKey, v);
        cache.logKeysKnown.add(k);
      } else if (!v) {
        cache.logs.delete(occKey);
        cache.logKeysKnown.delete(k);
      }
    }
    if (full) cache.logsFullAt = now;
  }

  async function refresh() {
    cache.knownKeys = await kv.kvKeys();
    await Promise.all([
      loadGroup(K.profilePrefix, cache.profiles),
      loadGroup(K.medPrefix, cache.meds),
      loadGroup(K.batchPrefix, cache.batches),
      loadGroup(K.regPrefix, cache.regimens),
      loadLogs(),
    ]);
    if (Date.now() - cache.settingsAt > 60 * 1000 || cache.settingsRaw == null) {
      cache.settingsRaw = await kv.kvGet(K.settings).catch(() => null);
      cache.settingsAt = Date.now();
    }
  }

  const clean = (m) => [...m.values()].map((v) => { const o = { ...v }; delete o._fetchedAt; return o; });
  function snapshot() {
    return {
      profiles: clean(cache.profiles),
      meds: clean(cache.meds),
      batches: clean(cache.batches),
      regimens: clean(cache.regimens),
      logs: clean(cache.logs),
      settings: cache.settingsRaw,
    };
  }

  return { refresh, snapshot, cache };
}

// ── 投影 ─────────────────────────────────────────────────────────────────────
function computeProjections(data, now) {
  const nowTs = now;
  const today = core.dayKey(nowTs);
  const ctx = {
    profiles: data.profiles, meds: data.meds, regimens: data.regimens,
    logs: data.logs, settings: data.settings,
  };
  const doses = core.dosesProjection(ctx, today, nowTs);
  const refill = core.refillForecast(ctx, nowTs);
  const expiry = core.expiryBands(data.batches, data.meds, nowTs);
  const medsStock = {};
  for (const med of data.meds) {
    const st = core.stockForMed(med.id, data.batches, data.logs, data.regimens, today);
    const f = refill.find((r) => r.medId === med.id) || {};
    medsStock[med.id] = {
      totalUsable: st.totalUsable, totalExpired: st.totalExpired, over: st.over,
      lastTakenAt: st.lastTakenAt,
      daysLeft: f.daysLeft != null ? f.daysLeft : null,
      ratePerDay: f.ratePerDay || 0, estimated: !!f.estimated, urgency: f.urgency || 'none',
      batches: st.batches,
    };
  }
  const stocks = {
    at: nowTs, today,
    meds: medsStock,
    refill,
    expiry,
    alerts: {
      dueNow: doses.items.filter((i) => i.state === 'now').length,
      overdue: doses.items.filter((i) => i.state === 'overdue').length,
      lowStock: refill.filter((r) => r.urgency === 'low').length,
      expiredBatches: expiry.filter((r) => r.band === 'expired').length,
      soonExpiry: expiry.filter((r) => r.band === 'soon').length,
    },
  };
  return { doses, stocks };
}

function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── 主循环 ───────────────────────────────────────────────────────────────────
async function main() {
  const PORT = parseInt(process.argv[2] || '0', 10) || 0;
  const APP_CONFIG_DIR = process.argv[3] || '';
  initLog(APP_CONFIG_DIR);

  const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
  const layer = createDataLayer(kv);
  let degraded = true; // 桥未就绪前健康端点仍 200，但状态如实降级
  let lastDoses = null;
  let lastStocks = null;
  let lastBeatAt = 0;

  async function tick() {
    const now = Date.now();
    try {
      await layer.refresh();
      const { doses, stocks } = computeProjections(layer.snapshot(), now);
      if (!lastDoses || !sameJson(lastDoses, doses)) {
        await kv.kvSet(K.doses, doses);
        lastDoses = doses;
        log('debug', `doses 投影更新：${doses.items.length} 项`);
      }
      if (!lastStocks || !sameJson(lastStocks, stocks)) {
        await kv.kvSet(K.stocks, stocks);
        lastStocks = stocks;
        log('debug', `stocks 快照更新：${stocks.refill.length} 药 · 预警 ${JSON.stringify(stocks.alerts)}`);
      }
      degraded = false;
    } catch (e) {
      degraded = true;
      log('warn', `tick 失败（桥未就绪或读取异常）：${e.message}`);
    }
    if (now - lastBeatAt >= META_BEAT_MS) {
      lastBeatAt = now;
      try {
        const c = layer.cache;
        await kv.kvSet(K.meta, {
          version: VERSION, pid: process.pid, startedAt: STARTED_AT, lastTickAt: now,
          bridge: kv.endpoint() ? `${kv.endpoint().host}:${kv.endpoint().port}` : '',
          degraded,
          counts: {
            profiles: c.profiles.size, meds: c.meds.size,
            batches: c.batches.size, regimens: c.regimens.size, logs: c.logs.size,
          },
          doses: lastDoses ? lastDoses.items.length : 0,
        });
      } catch (e) { log('warn', `心跳写失败：${e.message}`); }
    }
  }

  const STARTED_AT = Date.now();
  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];
    if (url === '/__health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', degraded, version: VERSION,
        uptime: Math.floor((Date.now() - STARTED_AT) / 1000),
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `qingnang service listening on 127.0.0.1:${PORT}`);
  });
  const shutdown = () => { try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); } setTimeout(() => process.exit(0), 1500).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log('info', `qingnang service v${VERSION} started (pid ${process.pid})`);
  await tick();
  setInterval(() => { tick().catch((e) => log('error', `tick 异常：${e.message}`)); }, TICK_MS);
}

main().catch((e) => {
  log('error', `启动失败：${e.stack || e.message}`);
  process.exit(1);
});
