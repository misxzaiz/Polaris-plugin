#!/usr/bin/env node
'use strict';
/**
 * ark.js —— 数据方舟后台服务（零依赖，node >= 18）
 *
 * 启动：node ark.js <port> <appConfigDir>   （{{port}}/{{appConfigDir}} 由宿主注入）
 * 职责：租约选举（单写者）→ 调度/补偿快照 → 消费面板/AI 命令（kv cmd 键）
 *       → 轮换 GC → 事件流 → 健康端点（恒 200，degraded 用字段表达，
 *       与 page-sentinel 同规：不因内部状态异常被宿主重启循环误杀）。
 *
 * 设计红线：
 *  - 本服务对数据根只读（快照扫描/读取），所有写入仅落在备份库与 cap.kv；
 *  - 日志自落盘 <appConfigDir>/data-ark.log（宿主不收集服务 stdout，512KB 轮转）；
 *  - 租约 TTL 90s，每 tick(30s) 续约；持租者才做快照，双实例自动主备。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/ark-core.js');
const { createKvClient } = require('./kvclient.js');
const { createArkFs } = require('./snapshot.js');

const VERSION = '0.1.0';
const TICK_MS = 30 * 1000;
const LEASE_TTL_MS = 90 * 1000;
const INSTANCE_ID = `ark-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

// ── 自落盘日志（宿主不收集服务 stdout；512KB 轮转保 1 份 .old）──────────────
const APP_CONFIG_DIR = process.argv[3] || '';
let logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, 'data-ark.log') : '';
function log(level, msg) {
  const line = `[data-ark:${level}] ${new Date().toISOString()} ${msg}\n`;
  process.stderr.write(line);
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) {
        try { fs.unlinkSync(`${logFile}.old`); } catch (_) { /* 无旧文件 */ }
        fs.renameSync(logFile, `${logFile}.old`);
      }
    } catch (_) { /* 不存在即直接写 */ }
    fs.appendFileSync(logFile, line);
  } catch (_) { /* 日志失败不致命 */ }
}

// ── 桥客户端与数据根定位 ───────────────────────────────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

/** 数据根：anchor.json → dataRoot（与桥同一处配置，兜底 appConfigDir） */
function resolveDataRoot() {
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot && fs.existsSync(a.dataRoot)) return a.dataRoot;
    } catch (_) { /* 跳过 */ }
  }
  return APP_CONFIG_DIR || '';
}

// ── 状态 ───────────────────────────────────────────────────────────────────
const S = {
  startedAt: Date.now(),
  dataRoot: '',
  libDir: '',
  role: 'leader',       // leader | standby | init
  leaseInfo: null,
  settings: { ...core.DEFAULT_SETTINGS },
  state: {},
  inFlight: null,       // 进行中的动作名
  lastTickAt: 0,
  storeCache: null,     // { objectsTotal, storeBytes, manifests, at }
  stopping: false,
};
const arkfs = createArkFs({ log });

async function kvGet(key) { return kv.kvGet(key).catch(() => null); }
async function kvSet(key, value) { return kv.kvSet(key, value); }
async function kvKeys() { return kv.kvKeys().catch(() => []); }

async function loadState() {
  const st = await kvGet(core.K.state);
  return st && typeof st === 'object' ? st : {};
}
async function saveState(patch) {
  S.state = { ...S.state, ...patch };
  await kvSet(core.K.state, S.state);
}

async function addEvent(type, msg, extra) {
  try {
    await kvSet(core.K.event(Date.now(), Math.random().toString(36).slice(2, 6)), {
      at: Date.now(), type, msg: String(msg).slice(0, 300), ...(extra || {}),
    });
    // 事件滚动保留 50 条：超量删最旧
    const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.eventPrefix));
    if (keys.length > 50) {
      const ents = await Promise.all(keys.map(async (k) => ({ k, v: await kvGet(k) })));
      const stale = ents.filter((e) => e.v && typeof e.v === 'object')
        .sort((a, b) => Number(b.v.at) - Number(a.v.at))
        .slice(50)
        .map((e) => e.k);
      await Promise.all(stale.map((k) => kv.kvDel(k)));
    }
  } catch (e) {
    log('warn', `addEvent 失败: ${e.message}`);
  }
}

// ── 租约（单写者）──────────────────────────────────────────────────────────
async function acquireLease() {
  const now = Date.now();
  const cur = (S.state && S.state.lease) || null;
  if (cur && cur.id !== INSTANCE_ID && Number(cur.expiresAt) > now) {
    S.role = 'standby';
    S.leaseInfo = cur;
    return false;
  }
  S.role = 'leader';
  S.leaseInfo = null;
  await saveState({ lease: { id: INSTANCE_ID, host: os.hostname(), pid: process.pid, expiresAt: now + LEASE_TTL_MS } });
  return true;
}

// ── 快照执行（含状态/索引/事件/轮换的完整闭环）─────────────────────────────
async function doSnapshot(trigger) {
  if (S.inFlight) return { ok: false, error: `已有动作进行中：${S.inFlight}` };
  S.inFlight = `snapshot(${trigger})`;
  const startedAt = Date.now();
  try {
    await saveState({ lastTrigger: trigger, lastStartedAt: startedAt });
    const r = await arkfs.runSnapshot({ dataRoot: S.dataRoot, settings: S.settings, libDir: S.libDir });
    if (!r.ok) {
      await saveState({ lastResult: { ok: false, error: r.error, at: Date.now(), trigger }, degraded: { reason: `快照失败：${r.error}`, at: Date.now() } });
      await addEvent('snapshot_fail', r.error, { trigger });
      return { ok: false, error: r.error };
    }
    const idx = { ...r.summary, trigger, at: Date.now() };
    await kvSet(core.K.snapshot(r.manifest.id), idx);
    const rotated = await rotateIfDue();
    const store = arkfs.storeStats(S.libDir);
    S.storeCache = { ...store, at: Date.now() };
    const nextRunAt = core.planNextRun(S.settings.schedule, Date.now(), Date.now());
    await saveState({
      lastResult: { ok: true, at: Date.now(), trigger, snapshotId: r.manifest.id, summary: r.summary },
      lastSnapshotId: r.manifest.id, lastSnapshotAt: r.manifest.finishedAt,
      nextRunAt, resolvedTarget: S.libDir, degraded: null, storeBytes: store.storeBytes, objectsTotal: store.objectsTotal,
    });
    await addEvent('snapshot_ok',
      `${r.summary.totalFiles} 文件 / ${r.summary.changedFiles} 变更 / 新对象 ${r.summary.newObjects}（${core.formatBytes(r.summary.storedBytes)}）· ${core.fmtDuration(r.summary.durationMs)}${rotated ? ` · 轮换裁 ${rotated.manifestsDeleted} 份` : ''}`,
      { snapshotId: r.manifest.id, trigger });
    log('info', `snapshot ok ${r.manifest.id} files=${r.summary.totalFiles} changed=${r.summary.changedFiles} new=${r.summary.newObjects} stored=${r.summary.storedBytes}ms=${r.summary.durationMs}`);
    return { ok: true, summary: r.summary };
  } catch (e) {
    log('error', `snapshot 异常: ${e.stack || e.message}`);
    await saveState({ lastResult: { ok: false, error: e.message, at: Date.now(), trigger }, degraded: { reason: `快照异常：${e.message}`, at: Date.now() } });
    await addEvent('snapshot_fail', e.message, { trigger });
    return { ok: false, error: e.message };
  } finally {
    S.inFlight = null;
  }
}

/** GFS 轮换：删 manifest 文件 + kv 索引键，再 GC 无引用对象 */
async function rotateIfDue() {
  try {
    const mans = arkfs.listManifests(S.libDir);
    const plan = core.planRotation(mans.map((m) => ({ id: m.id, finishedAt: m.finishedAt, ok: m.ok })), S.settings.retention, Date.now());
    if (!plan.prune.length) return null;
    for (const id of plan.prune) {
      try { fs.unlinkSync(path.join(S.libDir, 'snapshots', `${id}.manifest.json`)); } catch (_) { /* 已删 */ }
    }
    await Promise.all(plan.prune.map((id) => kv.kvDel(core.K.snapshot(id)).catch(() => {})));
    const g = await arkfs.gc({ libDir: S.libDir, retention: S.settings.retention });
    log('info', `rotation: prune=${plan.prune.length} gcObjects=${g.objectsDeleted} freed=${g.bytesFreed}`);
    return { manifestsDeleted: plan.prune.length, ...g };
  } catch (e) {
    log('warn', `rotation 失败: ${e.message}`);
    return null;
  }
}

// ── 命令消费（面板/AI → kv cmd 键；先删后做，杜绝双跑）────────────────────
/** 命令键里的 nonce（restore/listfiles 两类需要回写结果） */
function nonceOf(key) {
  if (key.startsWith('dataark.cmd.restore.')) return key.slice('dataark.cmd.restore.'.length);
  if (key.startsWith('dataark.cmd.listfiles.')) return key.slice('dataark.cmd.listfiles.'.length);
  return null;
}

async function consumeCmds(isLeader) {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.cmdPrefix) && !k.startsWith(core.K.cmdResultPrefix));
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    const cmd = await kvGet(key);
    if (!cmd || typeof cmd !== 'object') { await kv.kvDel(key).catch(() => {}); continue; }
    // 先删命令键（消费语义），失败重试一次；再执行
    await kv.kvDel(key).catch(() => kv.kvDel(key));
    if (!isLeader) {
      // 备机不执行；需要回显结果的命令回写备机提示
      // eslint-disable-next-line no-await-in-loop
      const nonce = nonceOf(key);
      if (nonce) await kvSet(core.K.cmdResult(nonce), { ok: false, error: '本实例处于备机状态（另一 Polaris 实例持有租约）' }).catch(() => {});
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await runCmd(key, cmd);
  }
}

async function runCmd(key, cmd) {
  const nonceOf = (k) => {
    if (k.startsWith('dataark.cmd.restore.')) return k.slice('dataark.cmd.restore.'.length);
    if (k.startsWith('dataark.cmd.listfiles.')) return k.slice('dataark.cmd.listfiles.'.length);
    return null;
  };
  try {
    if (key === core.K.cmdBackup) {
      const r = await doSnapshot('cmd');
      log('info', `cmd.backup -> ${r.ok ? r.summary.id : r.error}`);
      return;
    }
    if (key === core.K.cmdGc) {
      S.inFlight = 'gc';
      try {
        const g = await arkfs.gc({ libDir: S.libDir, retention: S.settings.retention });
        S.storeCache = { ...arkfs.storeStats(S.libDir), at: Date.now() };
        await saveState({ storeBytes: S.storeCache.storeBytes, objectsTotal: S.storeCache.objectsTotal });
        await addEvent('gc', `手动回收：删 ${g.manifestsDeleted} 份快照 / ${g.objectsDeleted} 个对象，释放 ${core.formatBytes(g.bytesFreed)}`);
      } finally { S.inFlight = null; }
      return;
    }
    if (key.startsWith(core.K.cmdVerify(''))) {
      // 键形态 dataark.cmd.verify.<id|latest>
      const snapId = key.slice((core.K.cmdVerify('')).length) || 'latest';
      const mode = cmd && cmd.mode === 'deep' ? 'deep' : 'quick';
      S.inFlight = `verify(${snapId})`;
      try {
        const r = await arkfs.verifySnapshot({ libDir: S.libDir, snapId, mode });
        await saveState({ lastVerify: { ...r, at: Date.now() } });
        await addEvent(r.ok ? 'verify_ok' : 'verify_fail',
          `校验 ${snapId}（${mode}）：${r.checked} 文件${r.missing?.length ? `，缺失 ${r.missing.length}` : ''}${r.corrupt?.length ? `，损坏 ${r.corrupt.length}` : ''}${r.ok ? '，全部完好' : ''}`);
      } finally { S.inFlight = null; }
      return;
    }
    const nonce = nonceOf(key);
    if (nonce && key.startsWith('dataark.cmd.restore.')) {
      const r = await arkfs.restoreFiles({ libDir: S.libDir, snapId: cmd.snapId, paths: cmd.paths });
      const out = r.ok
        ? { ok: true, stagingDir: r.stagingDir, restored: r.restored, notFound: r.notFound, total: r.total, at: Date.now() }
        : { ok: false, error: r.error, at: Date.now() };
      await kvSet(core.K.cmdResult(nonce), out);
      if (r.ok) await addEvent('restore', `恢复 ${r.restored}/${r.total} 个文件 → ${r.stagingDir}`);
      return;
    }
    if (nonce && key.startsWith('dataark.cmd.listfiles.')) {
      const r = arkfs.listSnapshotFiles({ libDir: S.libDir, snapId: cmd.snapId, query: cmd.query, limit: cmd.limit });
      await kvSet(core.K.cmdResult(nonce), { ...r, at: Date.now() });
      return;
    }
    log('warn', `未知命令键 ${key}（已删除）`);
  } catch (e) {
    log('error', `cmd ${key} 失败: ${e.stack || e.message}`);
    const n = nonceOf(key);
    if (n) await kvSet(core.K.cmdResult(n), { ok: false, error: e.message, at: Date.now() }).catch(() => {});
    await addEvent('cmd_fail', `${key}: ${e.message}`);
  }
}

// ── 主循环 ─────────────────────────────────────────────────────────────────
async function tick() {
  if (S.stopping) return;
  S.lastTickAt = Date.now();
  try {
    // 1. 设置
    const raw = await kvGet(core.K.settings);
    const norm = core.normalizeSettings(raw);
    if (norm.error) log('warn', `settings 非法（沿用默认）：${norm.error}`);
    S.settings = norm.error ? { ...core.DEFAULT_SETTINGS } : norm.settings;

    // 2. 数据根/备份库定位
    if (!S.dataRoot) S.dataRoot = resolveDataRoot();
    if (!S.dataRoot) { S.role = 'init'; log('warn', '尚未定位到数据根'); return; }
    S.libDir = arkfs.resolveLibDir(S.dataRoot, S.settings);

    // 3. 租约
    const isLeader = await acquireLease();
    S.state = await loadState(); // acquireLease 里可能已写，重新对齐

    // 4. 命令
    await consumeCmds(isLeader);

    // 5. 调度（错过补偿：无论晚几个周期，只补跑一次，防风暴）
    if (isLeader && !S.inFlight) {
      const now = Date.now();
      const planned = Number.isFinite(Number(S.state.nextRunAt)) ? Number(S.state.nextRunAt) : core.planNextRun(S.settings.schedule, now, S.state.lastSnapshotAt);
      if (planned && now >= planned) {
        const label = now - planned > 2 * TICK_MS ? 'catchup' : 'schedule';
        if (label === 'catchup' && S.settings.schedule.mode !== 'off') {
          const info = core.catchUpInfo(S.state, S.settings.schedule, now);
          if (info.overdue) await addEvent('catchup', `错过约 ${info.missed} 个周期，自动补跑`);
        }
        await doSnapshot(label);
      } else if (planned && planned !== S.state.nextRunAt) {
        await saveState({ nextRunAt: planned, resolvedTarget: S.libDir });
      }
    }

    // 6. 库占用与上限（每 10 分钟刷新缓存）
    if (isLeader && (!S.storeCache || Date.now() - S.storeCache.at > 10 * 60 * 1000)) {
      S.storeCache = { ...arkfs.storeStats(S.libDir), at: Date.now() };
      const over = S.storeCache.storeBytes > S.settings.maxStoreBytes;
      await saveState({ storeBytes: S.storeCache.storeBytes, objectsTotal: S.storeCache.objectsTotal, resolvedTarget: S.libDir });
      if (over) {
        await saveState({ degraded: { reason: `备份库 ${core.formatBytes(S.storeCache.storeBytes)} 超过上限 ${core.formatBytes(S.settings.maxStoreBytes)}（已 GC 后仍超），自动备份暂停`, at: Date.now() } });
        await addEvent('degraded', '备份库超上限，自动备份暂停（可提高上限/收紧保留/手动回收）');
      } else if (S.state.degraded && String(S.state.degraded.reason || '').includes('超上限')) {
        await saveState({ degraded: null });
      }
    }
  } catch (e) {
    log('error', `tick 异常: ${e.stack || e.message}`);
  }
}

// ── 健康端点（恒 200；内部状态用字段表达）──────────────────────────────────
function handleHealth(req, res) {
  const body = JSON.stringify({
    status: 'ok',
    role: S.role,
    lease: S.leaseInfo ? { id: S.leaseInfo.id, host: S.leaseInfo.host, expiresAt: S.leaseInfo.expiresAt } : null,
    version: VERSION,
    instance: INSTANCE_ID,
    uptimeSec: Math.round((Date.now() - S.startedAt) / 1000),
    lastTickAt: S.lastTickAt,
    dataRoot: S.dataRoot,
    resolvedTarget: S.libDir,
    inFlight: S.inFlight,
    nextRunAt: S.state.nextRunAt || null,
    lastSnapshotAt: S.state.lastSnapshotAt || null,
    degraded: S.state.degraded || null,
    store: S.storeCache ? { objects: S.storeCache.objectsTotal, bytes: S.storeCache.storeBytes } : null,
  });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// ── 启动 ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const server = http.createServer((req, res) => {
  if (req.url === '/__health' || req.url === '/api/status') return handleHealth(req, res);
  res.writeHead(404).end();
});
if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `data-ark service v${VERSION} listening on 127.0.0.1:${PORT} instance=${INSTANCE_ID}`);
    // 启动清理 tmp 残留（定位到 libDir 后做一次）
    setTimeout(async () => {
      try {
        const raw = await kvGet(core.K.settings);
        const norm = core.normalizeSettings(raw);
        S.settings = norm.error ? { ...core.DEFAULT_SETTINGS } : norm.settings;
        S.dataRoot = resolveDataRoot();
        if (S.dataRoot) {
          S.libDir = arkfs.resolveLibDir(S.dataRoot, S.settings);
          arkfs.cleanupTmp(S.libDir);
          S.state = await loadState();
        }
      } catch (e) { log('warn', `启动清理失败: ${e.message}`); }
    }, 1500);
  });
  const timer = setInterval(() => { void tick(); }, TICK_MS);
  timer.unref?.();
  void tick();
  const shutdown = async (sig) => {
    if (S.stopping) return;
    S.stopping = true;
    log('info', `${sig} received, shutting down`);
    try {
      // 释放租约：让另一实例立即接管，而不是等 TTL
      const st = await loadState();
      if (st.lease && st.lease.id === INSTANCE_ID) await kvSet(core.K.state, { ...st, lease: null });
    } catch (_) { /* 尽力 */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref?.();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandled: ${(e && e.stack) || e}`));

module.exports = { createArkService: () => ({ tick, handleHealth, S }) };
