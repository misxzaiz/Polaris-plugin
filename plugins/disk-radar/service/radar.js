#!/usr/bin/env node
'use strict';
/**
 * radar.js —— 磁盘雷达后台服务（零依赖，node >= 18；零外网请求）
 *
 * 职责（键空间唯一写者，契约见 README / shared/disk-core.js）：
 *   - 周期消费命令键 diskrad.cmd.*（先删后做）：scan / cancel / report /
 *     quarantine / restore / purge / roots_add / roots_remove
 *   - 扫描执行：预算内遍历（scanner.walkRoot），产出快照（树 depth≤2）+
 *     垃圾清单 + state 汇总（含与上一份完整快照的增量）
 *   - 隔离区机制：同卷 rename 进 .DiskRadarTrash/<id>，可恢复，确认后 rm
 *   - 自动快照：每根每 snapshotHours 补跑一次（只补最近一次，不回放）
 *   - 保留清扫（15min 节流）：过期 result/cmd、超量快照、孤儿键、隔离区到期清理
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health，
 * 桥不可达时健康端点仍 200 防误杀，降级写 diskrad.meta）。
 *
 * 启动参数：node radar.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/disk-core');
const { walkRoot, probeDir } = require('./scanner');
const { createKvClient } = require('./kvclient');

const VERSION = core.VERSION;
const TICK_MS = 3000;
const SCAN_PROGRESS_MS = 1500;
const META_BEAT_MS = 60 * 1000;
const SWEEP_MS = 15 * 60 * 1000;
const SETTINGS_RELOAD_MS = 30 * 1000;
const RESULT_TTL_MS = 15 * 60 * 1000;
const CMD_TTL_MS = 60 * 60 * 1000;
const MAX_SCAN_QUEUE = 5;

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'disk-radar.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.DISK_RADAR_DEBUG === '1';
function log(level, msg) {
  const line = `[disk-radar:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 服务主体 ────────────────────────────────────────────────────────────────
function createRadar({ port, appConfigDir }) {
  const kv = createKvClient({ appConfigDir, log });
  const startedAt = now();

  const settings = { ...core.DEFAULT_SETTINGS };
  let roots = [];                        // [{id,path,label,addedAt}]
  let settingsLoadedAt = 0;
  let lastRootsLoad = 0;
  let lastSweepAt = 0;
  let lastMetaAt = 0;
  let lastTickAt = 0;
  let ticking = false;
  let bridgeOk = false;

  const scanQueue = [];                  // [{rid, path, kind, deep, nonce}]
  let cancelRequested = false;
  let scanBusy = false;
  let reportBusy = false;
  const lastProgressWrite = { at: 0 };
  const lastAutoAt = new Map();          // rid → 上次自动快照 ts

  // ── 基础读写 ──
  async function loadRoots() {
    const raw = await kv.kvGet(core.K.roots).catch(() => null);
    if (raw && typeof raw === 'object' && Array.isArray(raw.roots)) {
      roots = raw.roots.filter((r) => r && typeof r.id === 'string' && typeof r.path === 'string');
    }
  }
  async function saveRoots() {
    await kv.kvSet(core.K.roots, { roots });
  }
  function findRoot(rid) {
    return roots.find((r) => r.id === rid) || null;
  }
  async function writeResult(nonce, payload) {
    try { await kv.kvSet(core.K.result(nonce), { ok: true, at: now(), payload }); } catch (_) {}
  }
  async function writeResultErr(nonce, error) {
    try { await kv.kvSet(core.K.result(nonce), { ok: false, at: now(), error: String(error).slice(0, 500) }); } catch (_) {}
  }

  // ── 快照/垃圾/state 持久化 ──
  async function persistScanResult(root, res, { kind, deep }) {
    const rid = root.id;
    const keys = await kv.kvKeys();
    const ridSnaps = keys.filter((k) => k.startsWith(core.K.snapPrefix(rid)));

    // 增量基准：本份之前最近一份「完整」快照
    let prev = null;
    const sorted = ridSnaps
      .map((k) => ({ k, seq: Number(k.slice(core.K.snapPrefix(rid).length)) || 0 }))
      .sort((a, b) => b.seq - a.seq);
    for (const s of sorted) {
      const v = await kv.kvGet(s.k).catch(() => null);
      if (v && v.partial !== true) { prev = v; break; }
    }

    const at = now();
    const seq = core.nextSeq(ridSnaps, rid);
    const snap = {
      seq, at, kind, deep,
      partial: res.partial === true,
      total: res.total,
      files: res.files,
      dirs: core.pruneTree(res.dirs || [], core.SNAP_NODE_BUDGET),
      junkCount: res.junkItems.length,
      junkBytes: res.junkItems.reduce((s, it) => s + (it.bytes || 0), 0),
      deniedFiles: res.deniedFiles,
      deniedDirs: res.deniedDirs,
      volume: res.volume || null,
      elapsedMs: res.elapsedMs,
    };
    await kv.kvSet(core.K.snap(rid, seq), snap);
    for (const k of core.pickExpiredSnaps(keys.filter((x) => x.startsWith(core.K.snapPrefix(rid))), rid, Math.max(3, settings.keepSnapshots))) {
      await kv.kvDel(k).catch(() => {});
    }

    // 垃圾清单（取消/中断也如实标 partial）
    const junkItems = res.junkItems.slice(0, core.JUNK_ITEM_CAP);
    await kv.kvSet(core.K.junk(rid), {
      at, partial: res.partial === true || res.cancelled === true,
      rootPath: root.path,
      items: junkItems,
    });

    // state 汇总（面板/AI 的快速读键）
    const stateRaw = await kv.kvGet(core.K.state).catch(() => null);
    const stateObj = stateRaw && typeof stateRaw === 'object' && stateRaw.roots ? stateRaw : { roots: {}, updatedAt: 0 };
    stateObj.roots[rid] = {
      rid,
      path: root.path,
      label: root.label,
      total: res.total,
      files: res.files,
      lastScanAt: at,
      kind, deep,
      partial: res.partial === true,
      prevTotal: prev ? prev.total : null,
      prevAt: prev ? prev.at : null,
      deltaBytes: prev ? res.total - prev.total : null,
      junkBytes: snap.junkBytes,
      junkCount: snap.junkCount,
      free: res.volume ? res.volume.free : null,
      volumeTotal: res.volume ? res.volume.total : null,
      lastError: null,
    };
    stateObj.updatedAt = at;
    await kv.kvSet(core.K.state, stateObj);
    log('info', `扫描完成 rid=${rid} path=${root.path} total=${core.fmtBytes(res.total)} files=${res.files} junk=${junkItems.length} partial=${snap.partial} ${res.elapsedMs}ms`);
  }

  async function persistScanError(root, err) {
    const stateRaw = await kv.kvGet(core.K.state).catch(() => null);
    const stateObj = stateRaw && typeof stateRaw === 'object' && stateRaw.roots ? stateRaw : { roots: {}, updatedAt: 0 };
    const prevEntry = (stateObj.roots && stateObj.roots[root.id]) || {};
    stateObj.roots[root.id] = {
      ...prevEntry,
      rid: root.id, path: root.path, label: root.label,
      lastScanAt: now(), lastError: String(err.message || err).slice(0, 300),
    };
    stateObj.updatedAt = now();
    await kv.kvSet(core.K.state, stateObj).catch(() => {});
  }

  // ── 扫描执行 ──
  async function runScanJob(job) {
    const root = findRoot(job.rid);
    if (!root) {
      if (job.nonce) await writeResultErr(job.nonce, '根目录已被移除');
      return;
    }
    scanBusy = true;
    cancelRequested = false;
    const budgetMs = (job.deep ? settings.deepBudgetMin * 60 * 1000 : settings.autoBudgetSec * 1000);
    log('info', `扫描开始 rid=${job.rid} path=${root.path} deep=${!!job.deep} kind=${job.kind} budget=${Math.round(budgetMs / 1000)}s`);
    let progressDirty = true;
    const progress = { bytes: 0, files: 0, currentPath: '', startedAt: now() };
    const progressTimer = setInterval(() => {
      if (!progressDirty || now() - lastProgressWrite.at < SCAN_PROGRESS_MS) return;
      lastProgressWrite.at = now();
      progressDirty = false;
      kv.kvSet(core.K.scan, {
        id: job.rid, path: root.path, kind: job.kind, deep: !!job.deep,
        bytes: progress.bytes, files: progress.files, currentPath: progress.currentPath,
        startedAt: progress.startedAt, updatedAt: now(),
      }).catch(() => {});
    }, 500);
    try {
      const res = await walkRoot({
        rootPath: root.path,
        recordDepth: 2,
        budgetMs,
        collectJunk: true,
        settings,
        shouldCancel: () => cancelRequested,
        onProgress: (p) => {
          progress.bytes = p.bytes;
          progress.files = p.files;
          progress.currentPath = p.currentPath;
          progressDirty = true;
        },
      });
      await persistScanResult(root, res, { kind: job.kind, deep: !!job.deep });
      lastAutoAt.set(job.rid, now());
      if (job.nonce) {
        await writeResult(job.nonce, {
          ok: true, rid: job.rid, total: res.total, files: res.files,
          partial: res.partial, cancelled: res.cancelled,
          junkCount: res.junkItems.length, elapsedMs: res.elapsedMs,
        });
      }
    } catch (e) {
      log('warn', `扫描失败 rid=${job.rid}: ${e.message}`);
      await persistScanError(root, e).catch(() => {});
      if (job.nonce) await writeResultErr(job.nonce, e.message || String(e));
    } finally {
      clearInterval(progressTimer);
      kv.kvDel(core.K.scan).catch(() => {});
      scanBusy = false;
    }
  }

  async function drainScanQueue() {
    while (scanQueue.length && !scanBusy) {
      const job = scanQueue.shift();
      await runScanJob(job);
    }
  }

  // ── 隔离区：rename / 恢复 / 彻底删除 ──
  async function loadJunk(rid) {
    const v = await kv.kvGet(core.K.junk(rid)).catch(() => null);
    return v && typeof v === 'object' && Array.isArray(v.items) ? v : { at: 0, partial: false, rootPath: '', items: [] };
  }
  async function loadQman(rid) {
    const v = await kv.kvGet(core.K.qman(rid)).catch(() => null);
    return v && typeof v === 'object' && Array.isArray(v.items) ? v : { items: [] };
  }

  async function doQuarantine(root, itemIds) {
    const junkDoc = await loadJunk(root.id);
    const qman = await loadQman(root.id);
    const moved = [];
    const errors = [];
    const trashBase = path.join(root.path, core.TRASH_DIR);
    for (const itemId of itemIds) {
      const item = junkDoc.items.find((it) => it.id === itemId);
      if (!item) { errors.push({ id: itemId, error: '垃圾清单里没有该条目（可能已扫描刷新或已移入）' }); continue; }
      try {
        const rel = core.safeRelPath(item.relPath);
        if (!rel) throw new Error('条目相对路径非法');
        const origPath = path.join(root.path, rel);
        core.assertUnderRoot(root.path, origPath);
        if (origPath === path.resolve(root.path)) throw new Error('不能隔离根目录本身');
        const target = core.trashPathFor(root.path, item.id);
        try { fs.mkdirSync(trashBase, { recursive: true }); } catch (_) { /* 已存在 */ }
        let dest = target;
        if (fs.existsSync(dest)) dest = `${target}-${now().toString(36)}`;
        fs.renameSync(core.longPath(origPath), core.longPath(dest));
        moved.push(item);
      } catch (e) {
        const busy = e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'ENOTEMPTY';
        errors.push({
          id: itemId,
          error: busy
            ? `${item.name}：文件被占用（可能有程序正在使用），关闭相关进程后重试`
            : `${item.name}：${e.message}`,
        });
      }
    }
    if (moved.length) {
      const movedIds = new Set(moved.map((m) => m.id));
      junkDoc.items = junkDoc.items.filter((it) => !movedIds.has(it.id));
      junkDoc.at = now();
      for (const m of moved) {
        qman.items.push({
          id: m.id, relPath: m.relPath, name: m.name, kind: m.kind,
          bytes: m.bytes, movedAt: now(),
        });
      }
      await kv.kvSet(core.K.junk(root.id), junkDoc).catch(() => {});
      await kv.kvSet(core.K.qman(root.id), qman).catch(() => {});
    }
    return { moved: moved.length, movedBytes: moved.reduce((s, m) => s + (m.bytes || 0), 0), errors };
  }

  async function doRestore(root, itemIds) {
    const qman = await loadQman(root.id);
    const junkDoc = await loadJunk(root.id);
    const restored = [];
    const errors = [];
    for (const itemId of itemIds) {
      const item = qman.items.find((it) => it.id === itemId);
      if (!item) { errors.push({ id: itemId, error: '隔离区里没有该条目' }); continue; }
      try {
        const rel = core.safeRelPath(item.relPath);
        if (!rel) throw new Error('条目相对路径非法');
        const origPath = path.join(root.path, rel);
        core.assertUnderRoot(root.path, origPath);
        const src = core.trashPathFor(root.path, item.id);
        if (fs.existsSync(origPath)) throw new Error('原位置已存在同名目录，不覆盖');
        if (!fs.existsSync(src)) throw new Error('隔离区目录已不存在（可能已被删除）');
        fs.renameSync(core.longPath(src), core.longPath(origPath));
        restored.push(item);
      } catch (e) {
        errors.push({ id: itemId, error: `${item.name}：${e.message}` });
      }
    }
    if (restored.length) {
      const ids = new Set(restored.map((m) => m.id));
      qman.items = qman.items.filter((it) => !ids.has(it.id));
      for (const r of restored) {
        junkDoc.items.push({
          id: r.id, relPath: r.relPath, name: r.name, kind: r.kind,
          note: r.note, bytes: r.bytes, files: 0, lastWrite: r.movedAt,
        });
      }
      junkDoc.partial = true; // 手工变更，标脏避免被误读为完整扫描结果
      junkDoc.at = now();
      await kv.kvSet(core.K.junk(root.id), junkDoc).catch(() => {});
      await kv.kvSet(core.K.qman(root.id), qman).catch(() => {});
    }
    return { restored: restored.length, errors };
  }

  async function doPurge(root, { itemIds, all, olderThanDays }) {
    const qman = await loadQman(root.id);
    let targets = [];
    if (all || (olderThanDays !== undefined && olderThanDays !== null)) {
      const cutoff = olderThanDays !== undefined && olderThanDays !== null
        ? now() - Number(olderThanDays) * 24 * 3600 * 1000
        : Number.MAX_SAFE_INTEGER;
      targets = qman.items.filter((it) => Number(it.movedAt || 0) <= cutoff);
    } else {
      const want = new Set((itemIds || []).map(String));
      targets = qman.items.filter((it) => want.has(it.id));
    }
    const purged = [];
    const errors = [];
    let freed = 0;
    for (const item of targets) {
      try {
        const dir = core.trashPathFor(root.path, item.id);
        // 双重保险：只允许删隔离区直接子目录
        core.assertUnderRoot(path.join(root.path, core.TRASH_DIR), dir);
        await fs.promises.rm(core.longPath(dir), { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
        purged.push(item);
        freed += Number(item.bytes) || 0;
      } catch (e) {
        errors.push({ id: item.id, error: `${item.name}：${e.message}` });
      }
    }
    if (purged.length) {
      const ids = new Set(purged.map((m) => m.id));
      qman.items = qman.items.filter((it) => !ids.has(it.id));
      await kv.kvSet(core.K.qman(root.id), qman).catch(() => {});
    }
    return { purged: purged.length, freed, errors };
  }

  // ── 命令消费（先删后做）──
  async function handleCommands(allKeys) {
    const cmdKeys = allKeys.filter((k) => k.startsWith(core.K.cmdPrefix));
    for (const key of cmdKeys) {
      const rest = key.slice(core.K.cmdPrefix.length);
      const dot = rest.indexOf('.');
      if (dot <= 0) continue;
      const op = rest.slice(0, dot);
      const nonce = rest.slice(dot + 1);
      const body = await kv.kvGet(key).catch(() => null);
      const deleted = await kv.kvDel(key).then(() => true).catch(() => false);
      if (!deleted) continue; // 别的消费者先删了——让给它们
      try {
        await runCommand(op, nonce, body && typeof body === 'object' ? body : {});
      } catch (e) {
        log('warn', `命令 ${op} 执行失败: ${e.message}`);
        if (nonce) await writeResultErr(nonce, e.message || String(e));
      }
    }
  }

  async function runCommand(op, nonce, body) {
    switch (op) {
      case 'scan': {
        let targetPath = body.path;
        let rid = body.rootId;
        if (targetPath) {
          const norm = core.normalizeRootPath(targetPath);
          if (!norm.ok) { await writeResultErr(nonce, norm.error); return; }
          targetPath = norm.path;
          rid = core.rootIdOf(targetPath);
          if (!findRoot(rid)) {
            roots.push({ id: rid, path: targetPath, label: String(body.label || path.basename(targetPath) || targetPath).slice(0, 80), addedAt: now() });
            await saveRoots();
            log('info', `登记新根 ${targetPath} → ${rid}`);
          }
        } else if (rid) {
          if (!findRoot(rid)) { await writeResultErr(nonce, `未登记的根 ${rid}`); return; }
        } else {
          // 不带参数：扫全部已登记根
          if (!roots.length) { await writeResultErr(nonce, '尚无登记的根目录——先在面板「设置」或用 path 参数登记'); return; }
          if (scanQueue.length + roots.length > MAX_SCAN_QUEUE + 3) { await writeResultErr(nonce, '扫描队列过长，请稍后再试'); return; }
          for (const r of roots) scanQueue.push({ rid: r.id, path: r.path, kind: 'manual', deep: body.deep === true });
          await writeResult(nonce, { ok: true, queued: roots.length, deep: body.deep === true });
          log('info', `命令 scan：全部 ${roots.length} 根入队`);
          return;
        }
        if (scanQueue.length >= MAX_SCAN_QUEUE) { await writeResultErr(nonce, '扫描队列过长，请稍后再试'); return; }
        scanQueue.push({ rid, path: targetPath || (findRoot(rid) || {}).path, kind: 'manual', deep: body.deep === true, nonce });
        log('info', `命令 scan：rid=${rid} deep=${body.deep === true}`);
        return;
      }
      case 'cancel': {
        cancelRequested = true;
        scanQueue.length = 0;
        await writeResult(nonce, { ok: true });
        log('info', '命令 cancel：请求取消当前扫描并清空队列');
        return;
      }
      case 'report': {
        const p = typeof body.path === 'string' ? body.path.trim() : '';
        if (!path.isAbsolute(p)) { await writeResultErr(nonce, 'path 必须是绝对路径'); return; }
        let st = null;
        try { st = await fs.promises.stat(core.longPath(p)); } catch (_) {}
        if (!st || !st.isDirectory()) { await writeResultErr(nonce, `目录不存在或不可读：${p}`); return; }
        if (reportBusy) { await writeResultErr(nonce, '上一个细查还在进行，稍后再试'); return; }
        reportBusy = true;
        try {
          const r = await probeDir({
            dirPath: p,
            maxDepth: body.maxDepth,
            budgetMs: body.budgetMs,
            settings,
          });
          await writeResult(nonce, {
            ok: true, path: p,
            total: r.total, files: r.files,
            dirs: core.pruneTree(r.dirs || [], 2000),
            junkItems: r.junkItems.slice(0, 50),
            deniedFiles: r.deniedFiles, deniedDirs: r.deniedDirs,
            partial: r.partial, elapsedMs: r.elapsedMs,
          });
        } catch (e) {
          await writeResultErr(nonce, e.message || String(e));
        } finally {
          reportBusy = false;
        }
        return;
      }
      case 'quarantine': {
        const root = findRoot(String(body.rootId || ''));
        if (!root) { await writeResultErr(nonce, `未登记的根 ${body.rootId}`); return; }
        const r = await doQuarantine(root, (body.itemIds || []).map(String));
        log('info', `隔离完成 rid=${root.id} moved=${r.moved} errors=${r.errors.length}`);
        await writeResult(nonce, { ok: true, ...r });
        return;
      }
      case 'restore': {
        const root = findRoot(String(body.rootId || ''));
        if (!root) { await writeResultErr(nonce, `未登记的根 ${body.rootId}`); return; }
        const r = await doRestore(root, (body.itemIds || []).map(String));
        await writeResult(nonce, { ok: true, ...r });
        return;
      }
      case 'purge': {
        const root = findRoot(String(body.rootId || ''));
        if (!root) { await writeResultErr(nonce, `未登记的根 ${body.rootId}`); return; }
        if (body.confirm !== true) {
          // 删除是危险操作：MCP/面板必须显式 confirm（ pocket-host kill 护栏同款）
          await writeResultErr(nonce, '彻底删除需要 confirm: true——请先与用户确认');
          return;
        }
        const r = await doPurge(root, {
          itemIds: body.itemIds, all: body.all === true,
          olderThanDays: body.olderThanDays,
        });
        log('info', `彻底删除 rid=${root.id} n=${r.purged} freed=${core.fmtBytes(r.freed)} errors=${r.errors.length}`);
        await writeResult(nonce, { ok: true, ...r });
        return;
      }
      case 'roots_add': {
        const norm = core.normalizeRootPath(body.path);
        if (!norm.ok) { await writeResultErr(nonce, norm.error); return; }
        const rid = core.rootIdOf(norm.path);
        if (findRoot(rid)) { await writeResult(nonce, { ok: true, rid, existed: true }); return; }
        roots.push({ id: rid, path: norm.path, label: String(body.label || path.basename(norm.path) || norm.path).slice(0, 80), addedAt: now() });
        await saveRoots();
        log('info', `roots_add ${norm.path} → ${rid}`);
        await writeResult(nonce, { ok: true, rid, existed: false });
        return;
      }
      case 'roots_remove': {
        const rid = String(body.rootId || '');
        const before = roots.length;
        roots = roots.filter((r) => r.id !== rid);
        if (roots.length === before) { await writeResult(nonce, { ok: true, removed: false }); return; }
        if (roots.length) await saveRoots();
        else await kv.kvDel(core.K.roots).catch(() => {}); // 空了就整键删除，不留垃圾键
        // 派生键一并清理（隔离区在磁盘上保留，见 README）
        const keys = await kv.kvKeys();
        for (const k of keys) {
          if (k.startsWith(core.K.snapPrefix(rid)) || k === core.K.junk(rid) || k === core.K.qman(rid)) {
            await kv.kvDel(k).catch(() => {});
          }
        }
        const stateRaw = await kv.kvGet(core.K.state).catch(() => null);
        if (stateRaw && stateRaw.roots && stateRaw.roots[rid]) {
          delete stateRaw.roots[rid];
          stateRaw.updatedAt = now();
          await kv.kvSet(core.K.state, stateRaw).catch(() => {});
        }
        lastAutoAt.delete(rid);
        log('info', `roots_remove rid=${rid}`);
        await writeResult(nonce, { ok: true, removed: true });
        return;
      }
      default:
        log('warn', `未知命令 op=${op} nonce=${nonce}`);
    }
  }

  // ── 自动快照调度 ──
  async function scheduleAutoSnaps() {
    if (!settings.autoSnapshot || scanQueue.length || scanBusy) return;
    const everyMs = settings.snapshotHours * 3600 * 1000;
    for (const root of roots) {
      if (scanQueue.length >= MAX_SCAN_QUEUE) break;
      const last = lastAutoAt.get(root.id) || 0;
      if (last && now() - last < everyMs) continue;
      if (!last) {
        // 启动后首次：参考 state.lastScanAt（手动扫描也算新鲜数据）
        const stateRaw = await kv.kvGet(core.K.state).catch(() => null);
        const entry = stateRaw && stateRaw.roots && stateRaw.roots[root.id];
        if (entry && entry.lastScanAt && now() - entry.lastScanAt < everyMs) {
          lastAutoAt.set(root.id, entry.lastScanAt);
          continue;
        }
      }
      scanQueue.push({ rid: root.id, path: root.path, kind: 'auto', deep: false });
      log('info', `自动快照入队 rid=${root.id}`);
      lastAutoAt.set(root.id, now()); // 入队即记，防止调度风暴（完成后以实际时间为准再刷新）
    }
  }

  // ── 保留清扫 ──
  async function retentionSweep(allKeys) {
    const t = now();
    let deleted = 0;
    for (const k of allKeys) {
      if (k.startsWith(core.K.resultPrefix) || k.startsWith(core.K.cmdPrefix)) {
        const v = await kv.kvGet(k).catch(() => null);
        const at = v && Number(v.at) || 0;
        const ttl = k.startsWith(core.K.resultPrefix) ? RESULT_TTL_MS : CMD_TTL_MS;
        if (!at || t - at > ttl) { await kv.kvDel(k).catch(() => {}); deleted += 1; }
      }
    }
    const rootIds = new Set(roots.map((r) => r.id));
    for (const k of allKeys) {
      const isSnap = k.startsWith(core.K.snapPrefixAll);
      const isJunk = k.startsWith(core.K.junkPrefixAll);
      const isQman = k.startsWith(core.K.qmanPrefixAll);
      if (!isSnap && !isJunk && !isQman) continue;
      const rid = isSnap ? k.slice(core.K.snapPrefixAll.length, k.lastIndexOf('.')) : k.split('.').pop();
      if (!rootIds.has(rid)) { await kv.kvDel(k).catch(() => {}); deleted += 1; }
    }
    // 隔离区到期自动清理（用户已显式移入；天数 0 = 关闭）
    if (settings.quarantineDays > 0) {
      for (const root of roots) {
        const qman = await loadQman(root.id);
        const cutoff = t - settings.quarantineDays * 24 * 3600 * 1000;
        const expired = qman.items.filter((it) => Number(it.movedAt || 0) <= cutoff);
        if (!expired.length) continue;
        const r = await doPurge(root, { itemIds: expired.map((it) => it.id) });
        deleted += r.purged;
        if (r.purged) log('info', `隔离区到期清理 rid=${root.id} n=${r.purged} freed=${core.fmtBytes(r.freed)}`);
      }
    }
    if (deleted) log('debug', `保留清扫删除 ${deleted} 项`);
  }

  // ── 心跳 ──
  async function metaBeat() {
    try {
      await kv.kvSet(core.K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt,
        bridge: bridgeOk ? `${(kv.endpoint() || {}).host}:${(kv.endpoint() || {}).port}` : 'unreachable',
        roots: roots.length,
        scanning: scanBusy,
        queued: scanQueue.length,
        settings: {
          autoSnapshot: settings.autoSnapshot,
          snapshotHours: settings.snapshotHours,
          quarantineDays: settings.quarantineDays,
        },
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
      lastTickAt = now();

      const t = now();
      if (t - settingsLoadedAt > SETTINGS_RELOAD_MS) {
        settingsLoadedAt = t;
        const s = await kv.kvGet(core.K.settings).catch(() => null);
        Object.assign(settings, core.normalizeSettings(s));
      }
      if (t - (lastRootsLoad || 0) > SETTINGS_RELOAD_MS) {
        lastRootsLoad = t;
        await loadRoots();
      }

      await handleCommands(allKeys);
      await scheduleAutoSnaps();
      drainScanQueue(); // 异步：内部串行，tick 不阻塞

      if (t - lastSweepAt > SWEEP_MS) {
        lastSweepAt = t;
        retentionSweep(allKeys).catch((e) => log('warn', `保留清扫失败: ${e.message}`));
      }
      if (t - lastMetaAt > META_BEAT_MS) {
        lastMetaAt = t;
        await metaBeat();
      }
    } catch (e) {
      bridgeOk = false;
      log('warn', `tick 失败（桥不可达？）: ${e.message}`);
    } finally {
      ticking = false;
    }
  }

  function start() {
    initLog(appConfigDir);
    log('info', `disk-radar 服务启动 v${VERSION} port=${port || '(none)'} appConfigDir=${appConfigDir || '(none)'}`);
    setInterval(() => { tick(); }, TICK_MS);
    tick();
  }

  function stop() {
    log('info', 'disk-radar 服务停止');
  }

  const healthServer = http.createServer((req, res) => {
    const u = req.url || '';
    if (u.startsWith('/__health') || u.startsWith('/api/status')) {
      const body = JSON.stringify({
        status: 'ok',
        degraded: !bridgeOk,
        version: VERSION,
        uptimeSec: Math.floor((now() - startedAt) / 1000),
        lastTickAt,
        roots: roots.length,
        scanning: scanBusy,
        queued: scanQueue.length,
        bridge: kv.endpoint(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return { start, stop, healthServer, tick, settings, kv };
}

// ── 入口 ──
if (require.main === module) {
  const PORT = parseInt(process.argv[2], 10) || 0;
  const APP_CONFIG_DIR = process.argv[3] || '';

  const app = createRadar({ port: PORT, appConfigDir: APP_CONFIG_DIR });

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

module.exports = { createRadar };
