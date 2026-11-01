#!/usr/bin/env node
'use strict';
/**
 * chexia.js —— 车辖后台服务（零依赖，node >= 18）
 *
 * 职责（chexia.* 键空间里「全家快照」的单写权威；车辆/补能/养护项/维保/证件由面板与 MCP 直写）：
 *   - 全家快照 chexia.snapshot：每辆车 {里程/日均里程/期间能耗(元每公里)/养护项投影/证件红黄榜/费用透视}
 *     + 个人证件段——面板（三端）与 AI 读一个键即得，免去各自拉全量流水现算
 *   - 心跳 chexia.meta（60s）供面板判定服务在线
 *
 * 设计边界（如实）：
 *   - 零外网请求、零命令信箱——写侧（面板/MCP 直写 cap.kv）与本服务无协议耦合，
 *     快照纯函数重算（core.familySnapshot），内容不变不写，无并发写面
 *   - 流水增量拉取 + 120s 全量兜底（编辑改写同键，全量兜底收敛）
 *   - 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 *     桥不可达时健康端点仍返回 200，避免被误杀重启循环，降级状态见 meta）
 *
 * 启动参数：node chexia.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 15 * 1000;
const META_BEAT_MS = 60 * 1000;
const RECORD_FULL_REFRESH_MS = 120 * 1000; // 补能/维保流水全量兜底（编辑改写同键）
const ENTITY_REFRESH_MS = 20 * 1000;       // 车/养护项/证件重拉（编辑可见性；量小）

const K = {
  carPrefix: 'chexia.car.',
  energyPrefix: 'chexia.energy.',
  itemPrefix: 'chexia.item.',
  svcPrefix: 'chexia.svc.',
  docPrefix: 'chexia.doc.',
  settings: 'chexia.settings',
  snapshot: 'chexia.snapshot',
  meta: 'chexia.meta',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'chexia.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.CHEXIA_DEBUG === '1';
function log(level, msg) {
  const line = `[chexia:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 数据装载（实体增量 diff + 流水增量 + 周期全量兜底）───────────────────────
function createDataLayer(kv) {
  const cache = {
    knownKeys: null,
    cars: new Map(), items: new Map(), docs: new Map(),          // 实体：键名 -> 值
    energies: new Map(), svcs: new Map(),                        // 流水：键名 -> 值
    recFullAt: 0,
    settingsRaw: null,
    settingsAt: 0,
  };

  async function loadGroup(prefix, map, { isRecord } = {}) {
    const keys = cache.knownKeys.filter((k) => k.startsWith(prefix));
    const keySet = new Set(keys);
    for (const k of [...map.keys()]) {
      if (!keySet.has(k)) map.delete(k); // 消失键剔除（删除生效）
    }
    const full = isRecord && (cache.recFullAt === 0 || Date.now() - cache.recFullAt > RECORD_FULL_REFRESH_MS);
    const todo = keys.filter((k) => full
      || !map.has(k)
      || Date.now() - (map.get(k)._fetchedAt || 0) > (isRecord ? 60 * 1000 : ENTITY_REFRESH_MS));
    for (const k of todo) {
      // eslint-disable-next-line no-await-in-loop
      const v = await kv.kvGet(k).catch(() => null);
      if (v && typeof v === 'object' && v.id) {
        v._fetchedAt = Date.now();
        map.set(k, v);
      } else if (!v) map.delete(k);
    }
    if (full) cache.recFullAt = Date.now();
  }

  async function refresh() {
    cache.knownKeys = await kv.kvKeys();
    await loadGroup(K.carPrefix, cache.cars);
    await loadGroup(K.itemPrefix, cache.items);
    await loadGroup(K.docPrefix, cache.docs);
    await loadGroup(K.energyPrefix, cache.energies, { isRecord: true });
    await loadGroup(K.svcPrefix, cache.svcs, { isRecord: true });
    if (Date.now() - cache.settingsAt > 60 * 1000 || cache.settingsRaw == null) {
      cache.settingsRaw = await kv.kvGet(K.settings).catch(() => null);
      cache.settingsAt = Date.now();
    }
  }

  const clean = (m) => [...m.values()].map((v) => { const o = { ...v }; delete o._fetchedAt; return o; });
  function snapshot() {
    return {
      cars: clean(cache.cars),
      energies: clean(cache.energies),
      items: clean(cache.items),
      svcs: clean(cache.svcs),
      docs: clean(cache.docs),
      settings: cache.settingsRaw,
    };
  }

  return { refresh, snapshot, cache };
}

function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── 主循环 ───────────────────────────────────────────────────────────────────
async function main() {
  const PORT = parseInt(process.argv[2] || '0', 10) || 0;
  const APP_CONFIG_DIR = process.argv[3] || '';
  initLog(APP_CONFIG_DIR);

  const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
  const layer = createDataLayer(kv);
  const STARTED_AT = Date.now();
  let degraded = true;
  let lastSnapshot = null;
  let lastBeatAt = 0;

  async function tick() {
    const now = Date.now();
    try {
      await layer.refresh();
      const data = layer.snapshot();
      const snap = core.familySnapshot(data.cars, data.energies, data.items, data.svcs, data.docs, now, data.settings);
      if (!lastSnapshot || !sameJson(lastSnapshot, snap)) {
        await kv.kvSet(K.snapshot, snap);
        lastSnapshot = snap;
        log('debug', `快照更新：${snap.cars.length} 车 · 证件预警 ${snap.cars.reduce((n, c) => n + c.docsDue.length, 0) + snap.personalDocs.length}`);
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
            cars: c.cars.size, items: c.items.size, docs: c.docs.size,
            energies: c.energies.size, svcs: c.svcs.size,
          },
        });
      } catch (e) { log('warn', `心跳写失败：${e.message}`); }
    }
  }

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
    log('info', `chexia service listening on 127.0.0.1:${PORT}`);
  });
  const shutdown = () => { try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); } setTimeout(() => process.exit(0), 1500).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log('info', `chexia service v${VERSION} started (pid ${process.pid})`);
  await tick();
  setInterval(() => { tick().catch((e) => log('error', `tick 异常：${e.message}`)); }, TICK_MS);
}

main().catch((e) => {
  log('error', `启动失败：${e.stack || e.message}`);
  process.exit(1);
});
