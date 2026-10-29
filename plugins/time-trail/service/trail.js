#!/usr/bin/env node
'use strict';
/**
 * trail.js —— 时间统计服务主循环（时间归集引擎，天账本唯一写者）
 *
 * 架构（spec §3/§5，主仓 plans/time-trail-plugin-spec.md）：
 *   spawn collector.ps1（PowerShell 子进程，stdout=JSONL）
 *     → 行驱动归集（间隙归因 ≤90s，空闲单独记）
 *     → 天账本 timetrail.day.<date>（20s flush；读-合-写，双缓冲防丢）
 *     → snapshot(30s) / meta(60s) 供面板心跳与 MCP 读数
 *   命令邮箱 timetrail.cmd.<nonce>（先删后做）：flush/collector_restart/
 *   purge_app/purge_all；结果写 timetrail.result.<nonce>。
 *
 * flush 双缓冲（本服务正确性关键）：
 *   handleLine 同步把每条间隙同时写进「内存视图 day」与「未持久缓冲 pending」。
 *   flush 时先同步换出 pending → buf（此后新归集进新 pending，不丢），再读 kv
 *   权威 → 合并 buf → 覆写；成功则不动 day（day 是始终最新视图，恒 ⊇ kv）；
 *   失败则把 buf 回滚进 pending 下轮重试。崩溃/桥断重启后从 kv 装载续记，
 *   不双记不丢已归集数据。
 *
 * 生命周期：SIGTERM flush 后杀采集器退出；采集器意外退出指数退避重启
 * （5s→300s）；paused=true 不采集不归集；非 Windows collector=unsupported。
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const core = require('../shared/trail-core');
const { createKvClient } = require('./kvclient');

const APP_CONFIG_DIR = process.argv[3] || '';
const PORT = parseInt(process.argv[2] || '0', 10) || 0;

const IS_WIN = process.platform === 'win32';
const COLLECTOR_PATH = path.join(__dirname, 'collector.ps1');
// 测试钩子：冒烟用假采集器（进程名/时钟可控），生产不设置
const COLLECTOR_CMD_OVERRIDE = (process.env.TIMETRAIL_COLLECTOR_CMD || '').trim();
const FLUSH_MS = 20 * 1000;
const SNAPSHOT_MS = 30 * 1000;
const META_MS = 60 * 1000;
const SETTINGS_MS = 60 * 1000;
const CMD_MS = 5 * 1000;
const SWEEP_MS = 10 * 60 * 1000;
const ORPHAN_RESULT_MS = 15 * 60 * 1000;
const LINE_FUTURE_SKEW_MS = 10 * 1000;
const CURRENT_FRESH_MS = 120 * 1000;

function log(level, msg) {
  process.stderr.write(`[time-trail:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

// ── 状态 ───────────────────────────────────────────────────────────────────
const startedAt = Date.now();
let settings = core.normalizeSettings(null);
let degraded = true;          // 桥不可达（健康端点仍 200，防重启循环）
let lastBridgeErr = '';

let dayDate = core.dateKeyOf(Date.now());
let day = core.emptyDay(dayDate);       // 内存权威视图（恒 ⊇ kv，含未 flush 增量）
let pending = core.emptyDay(dayDate);   // 未持久缓冲（flush 换出-合并-失败回滚）

let lastEvt = null;          // {t, app, title, idle, idleMsRaw}
let curApp = null;
let curSince = 0;

const collector = {
  proc: null, alive: false, pid: null, restarts: 0,
  lastErr: '', backoffMs: 5000, unsupported: !IS_WIN,
};
let lastLineAt = 0;

let flushing = false;
let lastSweepAt = 0;
let shuttingDown = false;
let collectorRespawnTimer = null;

// ── 采集器管理 ─────────────────────────────────────────────────────────────
function collectorDesired() {
  return IS_WIN && !settings.paused && !shuttingDown;
}

function killCollector() {
  if (collector.proc) {
    try { collector.proc.kill(); } catch (_) { /* 已退出 */ }
  }
}

function spawnCollector() {
  if (collectorRespawnTimer) { clearTimeout(collectorRespawnTimer); collectorRespawnTimer = null; }
  killCollector();
  collector.proc = null;
  collector.alive = false;
  collector.pid = null;
  if (!collectorDesired()) return;
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', COLLECTOR_PATH,
    '-TickSec', String(settings.tickSec),
    '-IdleSec', String(settings.idleSec),
    '-ParentProcId', String(process.pid),
  ];
  if (settings.captureTitles) args.push('-CaptureTitle');
  log('info', `spawn collector: tick=${settings.tickSec}s idle=${settings.idleSec}s titles=${settings.captureTitles}${COLLECTOR_CMD_OVERRIDE ? '（测试钩子覆盖）' : ''}`);
  let proc;
  try {
    proc = COLLECTOR_CMD_OVERRIDE
      ? spawn(COLLECTOR_CMD_OVERRIDE, { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    collector.lastErr = `spawn 失败: ${e.message}`;
    scheduleCollectorRespawn();
    return;
  }
  collector.proc = proc;
  collector.alive = true;
  collector.pid = proc.pid;
  lastEvt = null; // 新采集器实例=新基线，旧 lastEvt 不得跨实例归因
  curApp = null;
  curSince = 0;

  let outBuf = '';
  let errTail = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    outBuf += chunk;
    let idx;
    while ((idx = outBuf.indexOf('\n')) !== -1) {
      const line = outBuf.slice(0, idx).trim();
      outBuf = outBuf.slice(idx + 1);
      if (line) handleLine(line);
    }
    if (outBuf.length > 64 * 1024) outBuf = ''; // 无换行脏数据防膨胀
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => {
    errTail = (errTail + chunk).slice(-400);
  });
  proc.on('error', (e) => {
    collector.lastErr = e.message;
  });
  proc.on('exit', (code) => {
    if (collector.proc !== proc) return; // 旧实例退出事件
    collector.alive = false;
    collector.pid = null;
    if (errTail.trim()) collector.lastErr = errTail.trim().split('\n').pop();
    if (!shuttingDown && !settings.paused && IS_WIN) {
      log('warn', `collector 退出 code=${code}${collector.lastErr ? `: ${collector.lastErr}` : ''}，${Math.round(collector.backoffMs / 1000)}s 后重启`);
      scheduleCollectorRespawn();
    }
  });
}

function scheduleCollectorRespawn() {
  if (collector.unsupported || settings.paused || shuttingDown) return;
  if (collectorRespawnTimer) return;
  collector.restarts += 1;
  const wait = collector.backoffMs;
  collector.backoffMs = Math.min(300 * 1000, collector.backoffMs * 2);
  collectorRespawnTimer = setTimeout(() => {
    collectorRespawnTimer = null;
    collector.backoffMs = 5000;
    spawnCollector();
  }, wait);
}

// ── 归集 ───────────────────────────────────────────────────────────────────
/** 行驱动归集：间隙归给起点行（≤90s）；idle 归 idle 桶；跨界应用切换计数 */
function handleLine(raw) {
  let evt;
  try { evt = JSON.parse(raw); } catch (_) { return; }
  if (!evt || typeof evt.t !== 'number') return;
  if (settings.paused) return;
  const now = Date.now();
  if (evt.t > now + LINE_FUTURE_SKEW_MS) return; // 时钟前跳的脏行
  if (lastEvt && evt.t <= lastEvt.t) return;     // 乱序/重复行

  if (lastEvt) {
    const gap = core.attributionSec(lastEvt.t, evt.t); // ms 差换算秒 + 90s 截断
    if (gap > 0) {
      const attrDate = core.dateKeyOf(lastEvt.t);
      const rec = { ts: lastEvt.t, sec: gap, idle: lastEvt.idle };
      if (!lastEvt.idle && lastEvt.app) {
        rec.app = lastEvt.app;
        if (settings.captureTitles && lastEvt.title) rec.title = lastEvt.title;
        if (evt.app && evt.app !== lastEvt.app) {
          day.switches += 1;
          pending.switches += 1;
        }
      }
      if (attrDate === dayDate) {
        core.dayAdd(day, rec);
        core.dayAdd(pending, rec);
      } else {
        // 跨零点的 ≤90s 迟到归集：直写对应天记录（rare path）
        addForeignDay(attrDate, rec).catch((e) => log('warn', `跨天归集失败: ${e.message}`));
      }
    }
  }

  lastEvt = {
    t: evt.t,
    app: evt.app || null,
    title: evt.title || null,
    idle: evt.idle === true,
    idleMsRaw: typeof evt.idleMs === 'number' ? evt.idleMs : 0,
  };
  if (evt.app !== curApp) {
    curApp = evt.app || null;
    curSince = evt.t;
  }
  lastLineAt = Date.now();
  collector.backoffMs = 5000; // 行流健康，重置退避
}

/** 非当前日的迟到归集（≤90s，跨零点边界）：读-改-写对应天记录 */
async function addForeignDay(dateKey, rec) {
  const raw = await kv.kvGet(core.K.day(dateKey)).catch(() => null);
  const d = core.hydrateDay(raw, dateKey);
  core.dayAdd(d, rec);
  core.capTitles(d);
  await kv.kvSet(core.K.day(dateKey), d);
}

// ── 落盘（双缓冲 flush，见文件头说明）───────────────────────────────────────
async function flushDay() {
  if (flushing) return;
  if (!core.hasDayContent(pending)) return;
  flushing = true;
  const buf = pending;
  pending = core.emptyDay(dayDate); // 先换缓冲：此后的新归集进新 pending，不丢
  try {
    const key = core.K.day(dayDate);
    const raw = await kv.kvGet(key).catch(() => null);
    const merged = core.hydrateDay(raw, dayDate);
    core.mergeDayInto(merged, buf);
    core.capTitles(merged);
    await kv.kvSet(key, merged);
    degraded = false;
    lastBridgeErr = '';
  } catch (e) {
    core.mergeDayInto(pending, buf); // 回滚进未持久缓冲，下轮重试
    degraded = true;
    lastBridgeErr = e.message;
    log('warn', `flush 失败（已回滚 pending 重试）: ${e.message}`);
  } finally {
    flushing = false;
  }
}

function activeSecOf(d) {
  let sum = 0;
  for (const sec of Object.values(d.apps)) sum += Number(sec) || 0;
  return sum;
}

async function writeSnapshot() {
  const now = Date.now();
  const fresh = lastEvt && (now - lastEvt.t) <= CURRENT_FRESH_MS;
  const current = fresh && lastEvt.app
    ? {
        app: lastEvt.app,
        since: curSince,
        idle: lastEvt.idle,
        idleMs: lastEvt.idleMsRaw || 0,
      }
    : null;
  if (current && settings.captureTitles && lastEvt.title) current.title = lastEvt.title;
  const snap = {
    at: now,
    version: core.VERSION,
    tickSec: settings.tickSec,
    idleSec: settings.idleSec,
    paused: settings.paused,
    collector: collector.unsupported ? 'unsupported' : (collector.alive ? 'alive' : 'dead'),
    current,
    today: {
      date: dayDate,
      activeSec: activeSecOf(day),
      idleSec: Math.round(day.idleSec),
      switches: day.switches,
      apps: Object.keys(day.apps).length,
    },
  };
  if (lastBridgeErr) snap.degraded = lastBridgeErr;
  if (collector.lastErr && !collector.alive) snap.collectorErr = collector.lastErr;
  try {
    await kv.kvSet(core.K.snapshot, snap);
    degraded = false;
  } catch (e) {
    degraded = true;
    lastBridgeErr = e.message;
  }
}

async function writeMeta() {
  const meta = {
    version: core.VERSION,
    pid: process.pid,
    startedAt,
    lastTickAt: Date.now(),
    lastLineAt: lastLineAt || null,
    bridge: kv.endpoint() ? `${kv.endpoint().host}:${kv.endpoint().port}` : '',
    collectorPid: collector.pid,
    collectorRestarts: collector.restarts,
    retentionDays: settings.retentionDays,
    captureTitles: settings.captureTitles,
    tickSec: settings.tickSec,
    idleSec: settings.idleSec,
    paused: settings.paused,
  };
  if (lastBridgeErr) meta.lastBridgeErr = lastBridgeErr;
  try { await kv.kvSet(core.K.meta, meta); } catch (_) { /* 心跳失败不致命 */ }
}

// ── 命令消费（先删后做）────────────────────────────────────────────────────
async function consumeCmds() {
  const keys = await kv.kvKeys();
  const cmdKeys = keys.filter((k) => k.startsWith(core.K.cmdPrefix));
  for (const key of cmdKeys) {
    let cmd = null;
    try { cmd = await kv.kvGet(key); } catch (_) { /* 下轮重试 */ }
    await kv.kvDel(key).catch(() => {});
    if (!cmd || typeof cmd !== 'object' || !cmd.action) continue;
    const nonce = key.slice(core.K.cmdPrefix.length);
    try {
      const payload = await runCmd(cmd);
      await kv.kvSet(core.K.result(nonce), { ok: true, at: Date.now(), payload });
      log('info', `cmd ${cmd.action} 完成`);
    } catch (e) {
      await kv.kvSet(core.K.result(nonce), { ok: false, at: Date.now(), error: e.message }).catch(() => {});
      log('warn', `cmd ${cmd.action} 失败: ${e.message}`);
    }
  }
}

async function runCmd(cmd) {
  if (cmd.action === 'flush') {
    await flushDay();
    await writeSnapshot();
    return { flushed: true };
  }
  if (cmd.action === 'collector_restart') {
    collector.backoffMs = 5000;
    spawnCollector();
    return { restarted: true };
  }
  if (cmd.action === 'purge_app') {
    const app = String(cmd.app || '').toLowerCase();
    if (!app) throw new Error('缺少 app 参数');
    await purgeAppEverywhere(app);
    return { purged: app };
  }
  if (cmd.action === 'purge_all') {
    if (cmd.confirm !== true) throw new Error('purge_all 需要 confirm:true');
    await purgeAllDays();
    return { purged: 'all' };
  }
  throw new Error(`未知命令: ${cmd.action}`);
}

/** 从全部历史天记录 + 内存/pending 中移除某应用（面板「删除此应用记录」） */
async function purgeAppEverywhere(app) {
  for (const [a] of Object.entries(pending.apps)) if (a === app) delete pending.apps[a];
  for (const [a] of Object.entries(pending.titles)) if (a === app) delete pending.titles[a];
  for (const bucket of Object.values(pending.hours)) if (bucket[app] !== undefined) delete bucket[app];
  for (const [a] of Object.entries(day.apps)) if (a === app) delete day.apps[a];
  for (const [a] of Object.entries(day.titles)) if (a === app) delete day.titles[a];
  for (const bucket of Object.values(day.hours)) if (bucket[app] !== undefined) delete bucket[app];
  const keys = await kv.kvKeys();
  const dayKeys = keys.filter((k) => k.startsWith(core.K.dayPrefix));
  for (const key of dayKeys) {
    const raw = await kv.kvGet(key).catch(() => null);
    if (!raw || typeof raw !== 'object') continue;
    let touched = false;
    const d = raw;
    if (d.apps && d.apps[app] !== undefined) { delete d.apps[app]; touched = true; }
    if (d.titles && d.titles[app] !== undefined) { delete d.titles[app]; touched = true; }
    if (d.hours && typeof d.hours === 'object') {
      for (const bucket of Object.values(d.hours)) {
        if (bucket && bucket[app] !== undefined) { delete bucket[app]; touched = true; }
      }
    }
    if (touched) await kv.kvSet(key, d).catch(() => {});
  }
  await flushDay();
}

/** 清空全部天记录（保留 settings/cats；内存账本重置） */
async function purgeAllDays() {
  const keys = await kv.kvKeys();
  const dayKeys = keys.filter((k) => k.startsWith(core.K.dayPrefix));
  for (const key of dayKeys) await kv.kvDel(key).catch(() => {});
  day = core.emptyDay(dayDate);
  pending = core.emptyDay(dayDate);
  lastEvt = null;
  await writeSnapshot();
  return dayKeys.length;
}

/** 保留清扫：过期天 + 孤儿 result */
async function sweep() {
  const keys = await kv.kvKeys();
  const todayKey = core.dateKeyOf(Date.now());
  let pruned = 0;
  for (const key of keys) {
    if (key.startsWith(core.K.dayPrefix)) {
      const dateKey = key.slice(core.K.dayPrefix.length);
      if (core.isPrunable(dateKey, settings.retentionDays, todayKey)) {
        await kv.kvDel(key).catch(() => {});
        pruned += 1;
      }
    } else if (key.startsWith(core.K.resultPrefix)) {
      const raw = await kv.kvGet(key).catch(() => null);
      if (raw && typeof raw === 'object' && typeof raw.at === 'number' && Date.now() - raw.at > ORPHAN_RESULT_MS) {
        await kv.kvDel(key).catch(() => {});
        pruned += 1;
      }
    }
  }
  if (pruned) log('info', `清扫 ${pruned} 个过期键（retention=${settings.retentionDays}d）`);
}

// ── 设置轮询 ───────────────────────────────────────────────────────────────
async function pollSettings() {
  const raw = await kv.kvGet(core.K.settings).catch(() => null);
  if (raw === null) return; // 无设置键保持现状
  const next = core.normalizeSettings(raw);
  const collectorArgsChanged =
    next.tickSec !== settings.tickSec ||
    next.idleSec !== settings.idleSec ||
    next.captureTitles !== settings.captureTitles;
  const pausedChanged = next.paused !== settings.paused;
  settings = next;
  if (pausedChanged) {
    log('info', `paused=${settings.paused}`);
    if (settings.paused) {
      await flushDay().catch(() => {}); // 暂停即封账
    } else if (!collector.alive && !collector.unsupported) {
      // 暂停期间若采集器不在（如暂停状态下启动），恢复时补拉起
      collector.backoffMs = 5000;
      spawnCollector();
    }
    // 采集器保留运行（冷启动 ~30s，暂停/恢复不应反复付此成本）；
    // 行丢弃由 handleLine 的 paused 守卫完成，落盘前即截断
    lastEvt = null; // 跨暂停边界不得归因（否则恢复后首段被误记给暂停前应用）
    curApp = null;
    curSince = 0;
  } else if (collectorArgsChanged && !settings.paused) {
    log('info', '采集参数变更，重启采集器');
    collector.backoffMs = 5000;
    spawnCollector();
  }
}

// ── 日切换 ─────────────────────────────────────────────────────────────────
async function rolloverIfNeeded() {
  const today = core.dateKeyOf(Date.now());
  if (today === dayDate) return;
  log('info', `日切换 ${dayDate} → ${today}`);
  await flushDay().catch(() => {});        // 封旧账（换出的 buf 已落盘）
  const leftover = pending;                // flush 期间新归集的零点边界数据
  pending = core.emptyDay(today);
  if (core.hasDayContent(leftover)) {
    // 结转：leftover 属于旧日期，直写旧天记录
    const oldDate = dayDate;
    const raw = await kv.kvGet(core.K.day(oldDate)).catch(() => null);
    const merged = core.hydrateDay(raw, oldDate);
    core.mergeDayInto(merged, leftover);
    core.capTitles(merged);
    await kv.kvSet(core.K.day(oldDate), merged).catch(() => {});
  }
  dayDate = today;
  day = core.emptyDay(today);
  lastEvt = null; // 零点边界后的行开新基线
}

// ── HTTP（健康检查；面板不直连本服务，数据走 cap.kv）───────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      version: core.VERSION,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      degraded,
      collector: collector.unsupported ? 'unsupported' : (collector.alive ? 'alive' : 'dead'),
      paused: settings.paused,
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

// ── 启动 ───────────────────────────────────────────────────────────────────
async function loadInitial() {
  const rawSettings = await kv.kvGet(core.K.settings).catch(() => null);
  settings = core.normalizeSettings(rawSettings);
  const rawDay = await kv.kvGet(core.K.day(dayDate)).catch(() => null);
  if (rawDay) day = core.hydrateDay(rawDay, dayDate);
  log('info', `启动：今日 ${dayDate} 已有 ${activeSecOf(day)}s / ${Object.keys(day.apps).length} 应用；paused=${settings.paused}`);
}

function main() {
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `trail service listening on 127.0.0.1:${PORT}`);
    process.send?.({ type: 'ready', port: PORT });
  });

  loadInitial()
    .catch((e) => log('warn', `初始加载失败（服务继续，pending 兜底）: ${e.message}`))
    .then(() => {
      if (collector.unsupported) {
        log('warn', '非 Windows 平台：采集器不可用（历史数据仍可读）');
      } else if (!settings.paused) {
        spawnCollector();
      }
      // 首个快照/心跳即时落盘：面板与 MCP 不必等 30s/60s 定时器
      writeSnapshot().catch(() => {});
      writeMeta().catch(() => {});
    });

  setInterval(() => {
    consumeCmds().catch((e) => { degraded = true; lastBridgeErr = e.message; });
    rolloverIfNeeded().catch((e) => log('warn', `日切换检查失败: ${e.message}`));
  }, CMD_MS);
  setInterval(() => { flushDay().catch(() => {}); }, FLUSH_MS);
  setInterval(() => { writeSnapshot().catch(() => {}); }, SNAPSHOT_MS);
  setInterval(() => { writeMeta().catch(() => {}); }, META_MS);
  setInterval(() => { pollSettings().catch((e) => log('warn', `设置轮询失败: ${e.message}`)); }, SETTINGS_MS);
  setInterval(() => {
    if (Date.now() - lastSweepAt >= SWEEP_MS) {
      lastSweepAt = Date.now();
      sweep().catch((e) => log('warn', `清扫失败: ${e.message}`));
    }
  }, CMD_MS);

  const shutdown = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', `收到 ${sig}，flush 后退出`);
    killCollector();
    const deadline = setTimeout(() => process.exit(0), 4000);
    flushDay()
      .catch(() => {})
      .then(() => writeSnapshot())
      .catch(() => {})
      .then(() => { clearTimeout(deadline); process.exit(0); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('exit', () => { try { killCollector(); } catch (_) { /* 忽略 */ } });
}

main();
