#!/usr/bin/env node
'use strict';
/**
 * flow.js —— 文件管家后台服务（零依赖，node >= 18；零外网请求）
 *
 * 职责（fileflow.* 键空间唯一写者，契约见 README / docs/file-flow-plan.md）：
 *   - 周期消费命令键 fileflow.cmd.*（先删后做）：roots_add/remove/set、
 *     rules_add/update/delete/reorder/preset、settings_set、scan、dryrun、
 *     apply、undo、ping
 *   - 常驻监听（fs.watch recursive）+ 周期兜底扫描；auto 模式的根自动
 *     生成计划并执行（只执行 safe op；根外目的 op 仅手动确认执行）
 *   - 执行：同盘 rename；EXDEV 回退 copy+校验+unlink；EBUSY/EPERM 跳过
 *     如实记录；执行前 re-stat 防「计划期间文件被写入」
 *   - 批次日志 fileflow.batch.*（撤销凭据）+ 撤销（planUndoOps 语义）
 *   - 去重：同 size 分组 → 首 64KB+尾 64KB md5 指纹 → 同指纹保留最新
 *   - 保留清扫（15min 节流）：过期 plan/result/cmd、超量 batch
 *
 * 安全不变式：
 *   - 永不删除用户文件（recycle/dedupe 一律移入 _FileFlow回收站/）
 *   - 根外目的路径（safe=false）只在手动 apply 且 confirm=true 时执行
 *   - 新文件护栏 / 部分下载后缀 / 隐藏文件 / 目的子树排除 全部在 lib 层强制
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health，
 * 桥不可达时健康端点仍 200 防误杀，降级写 fileflow.meta）。
 *
 * 启动参数：node flow.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const lib = require('./lib');
const { statEntry, walkRoot, fingerprint, moveFile } = require('./fsutil');
const { createKvClient } = require('./kvclient');

const K = {
  meta: 'fileflow.meta',
  roots: 'fileflow.roots',
  rules: 'fileflow.rules',
  settings: 'fileflow.settings',
  snapshot: 'fileflow.snapshot',
  stats: 'fileflow.stats',
  plan: (id) => `fileflow.plan.${id}`,
  batch: (id) => `fileflow.batch.${id}`,
  cmd: (nonce) => `fileflow.cmd.${nonce}`,
  result: (nonce) => `fileflow.result.${nonce}`,
};
const CMD_PREFIX = 'fileflow.cmd.';

const TICK_MS = 2000;
const META_BEAT_MS = 60 * 1000;
const SWEEP_MS = 15 * 60 * 1000;
const SETTINGS_RELOAD_MS = 20 * 1000;
const WATCH_DEBOUNCE_MS = 3000;

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'file-flow.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.FILE_FLOW_DEBUG === '1';
function log(level, msg) {
  const line = `[file-flow:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function genId(prefix) {
  return `${prefix}.${now()}${crypto.randomBytes(3).toString('hex')}`;
}

// ── 服务主体 ───────────────────────────────────────────────────────────────
function createFlow({ port, appConfigDir }) {
  const kv = createKvClient({ appConfigDir, log });
  const startedAt = now();

  let settings = { ...lib.normalizeSettings(null) };
  let roots = [];
  let rules = [];
  let loadedAt = 0;
  let lastSweepAt = 0;
  let lastMetaAt = 0;
  let ticking = false;
  let bridgeOk = false;

  const watchers = new Map();   // rootId → FSWatcher
  const pendingScan = new Set(); // rootId（watch 触发的待扫根）
  const lastAutoAt = new Map(); // rootId → 上次 auto 扫描 ts
  let applyBusy = false;
  const applyQueue = [];        // [{plan, mode, nonce}]

  // ── 状态读写 ──
  async function loadState() {
    const [r, ru, s] = await Promise.all([
      kv.kvGet(K.roots).catch(() => null),
      kv.kvGet(K.rules).catch(() => null),
      kv.kvGet(K.settings).catch(() => null),
    ]);
    const nr = lib.normalizeRoots(r);
    const nru = lib.normalizeRules(ru);
    roots = nr.roots;
    rules = nru.rules;
    settings = lib.normalizeSettings(s);
    loadedAt = now();
  }

  async function saveRoots() { await kv.kvSet(K.roots, { roots }); }
  async function saveRules() { await kv.kvSet(K.rules, { rules }); }
  async function saveSettings() { await kv.kvSet(K.settings, settings); }

  function findRoot(rid) { return roots.find((r) => r.id === rid) || null; }
  function rulesOf(rid) { return rules.filter((r) => r.rootId === rid); }

  async function writeResult(nonce, payload) {
    try { await kv.kvSet(K.result(nonce), { ok: true, at: now(), payload }); } catch (_) {}
  }
  async function writeResultErr(nonce, error) {
    try { await kv.kvSet(K.result(nonce), { ok: false, at: now(), error: String(error).slice(0, 600) }); } catch (_) {}
  }

  // ── 快照 ──
  async function writeSnapshot(extraRootInfo) {
    const rootInfos = [];
    const byRootBatches = extraRootInfo || {};
    for (const root of roots) {
      const info = byRootBatches[root.id] || {};
      rootInfos.push({
        id: root.id,
        path: root.path,
        label: root.label,
        auto: root.auto,
        watched: watchers.has(root.id),
        lastRunAt: info.lastRunAt || null,
        lastBatchId: info.lastBatchId || null,
        lastPlanAt: info.lastPlanAt || null,
        lastPlanOps: info.lastPlanOps ?? null,
        issues: info.issues || [],
      });
    }
    const stats = (await kv.kvGet(K.stats).catch(() => null)) || { filesOrganized: 0, batches: 0, lastBatchAt: null };
    await kv.kvSet(K.snapshot, {
      at: now(),
      version: lib.VERSION,
      roots: rootInfos,
      ruleCount: rules.length,
      enabledRuleCount: rules.filter((r) => r.enabled).length,
      settings: {
        guardMinutes: settings.guardMinutes,
        maxOpsPerRun: settings.maxOpsPerRun,
        watchEnabled: settings.watchEnabled,
      },
      stats,
    });
  }

  // ── 扫描 + 计划 ──
  async function buildPlan(root, { mode }) {
    const { entries, truncated } = walkRoot(root.path, lib.destPrefixes(rules));
    const plan1 = lib.planForRoot({ root, rules: rulesOf(root.id), entries, nowMs: now(), settings, rulesAll: rules });

    // 去重指纹（dedupe 规则是集合动作：服务层算指纹 → lib 产出 losers）
    const dedupeAll = [];
    if (plan1.dedupeNeeds.length) {
      const fps = [];
      const cap = settings.dedupeMaxFiles || 300;
      for (const need of plan1.dedupeNeeds.slice(0, cap)) {
        const fp = fingerprint(path.join(root.path, need.rel), need.size);
        if (fp) fps.push({ rel: need.rel, fp, size: need.size, mtime: need.mtime });
      }
      const dedupeRuleIds = new Set(plan1.dedupeNeeds.map((d) => d.ruleId));
      for (const rid of dedupeRuleIds) {
        const rule = rules.find((r) => r.id === rid);
        if (!rule) continue;
        const relFps = fps.filter((f) => plan1.dedupeNeeds.some((d) => d.rel === f.rel && d.ruleId === rid));
        const dd = lib.planDedupe({ fingerprints: relFps, ruleId: rid, ruleDest: rule.action.dest || '', rootPath: root.path, settings });
        dedupeAll.push(...dd.ops);
      }
    }

    // 组装：去重 op 在前；被判重的文件让位（不重复归档）；from 去重
    const ops = lib.dedupeOps(lib.assembleOps(plan1.ops, { ops: dedupeAll }));
    // 计划内文件的 stat 快照：执行前比对，防「计划期间文件仍在写入」
    const entryStats = {};
    for (const op of ops) {
      const e = entries.find((x) => x.rel.replace(/\//g, '\\').toLowerCase() === op.fromRel.toLowerCase());
      if (e) entryStats[op.fromRel.toLowerCase()] = { size: e.size, mtime: e.mtime };
    }
    const planId = genId('plan');
    const plan = {
      v1: 1,
      planId,
      rootId: root.id,
      rootPath: root.path,
      createdAt: now(),
      mode,
      ops,
      entryStats,
      skipped: plan1.skipped.slice(0, 100),
      counts: { ...plan1.counts, entries: entries.length, truncated },
      safeOps: ops.filter((o) => o.safe).length,
      outsideOps: ops.filter((o) => !o.safe).length,
    };
    await kv.kvSet(K.plan(planId), plan);
    return { plan, entries, truncated };
  }

  // ── 执行 ──
  async function executePlan(plan, { mode, nonce }) {
    const root = findRoot(plan.rootId);
    if (!root) {
      if (nonce) await writeResultErr(nonce, '根目录已被移除');
      return;
    }
    const executed = [];
    let done = 0, failed = 0, bytesMoved = 0;
    const outsideAllowed = mode === 'manual';
    for (const op of plan.ops) {
      if (!op.safe && !outsideAllowed) {
        executed.push({ ...op, fromAbs: '', toAbs: '', status: 'held', why: '根外目的路径需手动确认执行' });
        continue;
      }
      const fromAbs = path.join(root.path, op.fromRel);
      // toRel=根内相对目的；toAbs=根外绝对目的（safe=false，仅手动确认执行）
      const toAbs = op.toAbs || path.join(root.path, op.toRel);
      const before = statEntry(fromAbs);
      if (!before) {
        executed.push({ ...op, fromAbs, toAbs, status: 'gone' });
        failed++;
        continue;
      }
      // 计划期间文件仍在写入（mtime/size 变化）→ 放弃本 op
      const plannedEntry = plan.entryStats && plan.entryStats[op.fromRel.toLowerCase()];
      if (plannedEntry && (plannedEntry.size !== before.size || Math.abs(plannedEntry.mtime - before.mtime) > 50)) {
        executed.push({ ...op, fromAbs, toAbs, status: 'changed', why: '计划期间文件发生变化，本轮放弃' });
        failed++;
        continue;
      }
      // 目的冲突 → 自动改名
      let finalTo = toAbs;
      if (op.action !== 'rename' && fs.existsSync(toAbs)) {
        finalTo = lib.conflictName(toAbs, (c) => fs.existsSync(c));
      }
      if (op.action === 'rename' && fs.existsSync(finalTo)) {
        executed.push({ ...op, fromAbs, toAbs, status: 'conflict', why: '重命名目标已存在' });
        failed++;
        continue;
      }
      try {
        const r = moveFile(fromAbs, finalTo);
        executed.push({ ...op, fromAbs, toAbs: finalTo, status: 'done', how: r.how });
        done++;
        bytesMoved += before.size;
      } catch (e) {
        const code = e.code || '';
        const status = ['EBUSY', 'EPERM', 'EACCES'].includes(code) ? 'locked' : 'error';
        executed.push({ ...op, fromAbs, toAbs: finalTo, status, why: String(e.message || e).slice(0, 200) });
        failed++;
      }
    }

    const batchId = genId('batch');
    const batch = {
      v1: 1,
      batchId,
      planId: plan.planId,
      rootId: plan.rootId,
      rootPath: root.path,
      at: now(),
      mode,
      undoable: true, // 全量 from→to 日志，任何批次都可按 planUndoOps 语义撤销
      ops: executed,
      summary: {
        total: plan.ops.length,
        done,
        failed,
        held: executed.filter((o) => o.status === 'held').length,
        bytesMoved,
      },
    };
    await kv.kvSet(K.batch(batchId), batch);
    const stats = (await kv.kvGet(K.stats).catch(() => null)) || { filesOrganized: 0, batches: 0, lastBatchAt: null };
    await kv.kvSet(K.stats, {
      filesOrganized: (stats.filesOrganized || 0) + done,
      batches: (stats.batches || 0) + 1,
      lastBatchAt: batch.at,
    });
    await writeSnapshot({
      [plan.rootId]: { lastRunAt: batch.at, lastBatchId: batchId, lastPlanAt: plan.createdAt, lastPlanOps: plan.ops.length, issues: [] },
    });
    log('info', `批次 ${batchId} root=${plan.rootId} done=${done} failed=${failed} held=${batch.summary.held}`);
    if (nonce) await writeResult(nonce, { batchId, summary: batch.summary, ops: executed.slice(0, 200) });
  }

  function enqueueApply(plan, { mode, nonce }) {
    applyQueue.push({ plan, mode, nonce });
  }

  // ── 撤销 ──
  async function undoBatch(batchId, nonce) {
    const batch = await kv.kvGet(K.batch(batchId));
    if (!batch || !batch.ops) throw new Error('批次不存在或已过保留期');
    const root = findRoot(batch.rootId);
    if (!root) throw new Error('根目录已被移除，无法撤销（路径已不受管）');
    const existence = {};
    for (const op of batch.ops) {
      if (op.status !== 'done') continue;
      existence[(op.toAbs || '').toLowerCase()] = fs.existsSync(op.toAbs);
      existence[(op.fromAbs || '').toLowerCase()] = fs.existsSync(op.fromAbs);
    }
    const undoOps = lib.planUndoOps(batch.ops, existence);
    const results = [];
    let undone = 0, failed = 0;
    for (const u of undoOps) {
      if (u.state !== 'ready') { results.push({ ...u, status: u.state }); failed++; continue; }
      const fromAbs = path.join(root.path, u.fromRel);
      const toAbs = path.join(root.path, u.toRel);
      try {
        // 撤销同样是移动（回收站文件也回原位），目的存在即拒绝（planUndoOps 已挡，双保险）
        if (fs.existsSync(toAbs)) throw new Error('原位置已存在同名文件');
        await moveFile(fromAbs, toAbs);
        results.push({ ...u, status: 'done' });
        undone++;
      } catch (e) {
        results.push({ ...u, status: ['EBUSY', 'EPERM', 'EACCES'].includes(e.code || '') ? 'locked' : 'error', why: String(e.message || e).slice(0, 200) });
        failed++;
      }
    }
    const undoBatchId = genId('batch');
    await kv.kvSet(K.batch(undoBatchId), {
      v1: 1,
      batchId: undoBatchId,
      undoOf: batchId,
      rootId: batch.rootId,
      rootPath: root.path,
      at: now(),
      mode: 'undo',
      ops: results.map((r) => ({ fromRel: r.fromRel, toRel: r.toRel, status: r.status, why: r.why, action: 'undo' })),
      summary: { total: undoOps.length, done: undone, failed, held: 0, bytesMoved: 0 },
    });
    log('info', `撤销 ${batchId} → undone=${undone} failed=${failed}`);
    return { undoBatchId, undone, failed, results: results.slice(0, 200) };
  }

  // ── 监听 ──
  function watchRoot(root) {
    if (watchers.has(root.id) || !settings.watchEnabled) return;
    if (root.auto === 'off') return;
    try {
      const w = fs.watch(root.path, { recursive: true, persistent: false }, () => {
        pendingScan.add(root.id);
      });
      w.on('error', (e) => {
        log('warn', `watch 失败 ${root.path}: ${e.message}`);
        try { w.close(); } catch (_) {}
        watchers.delete(root.id);
      });
      watchers.set(root.id, w);
      log('info', `监听 ${root.path}（auto=${root.auto}）`);
    } catch (e) {
      log('warn', `watch 启动失败 ${root.path}: ${e.message}`);
    }
  }
  function unwatchRoot(rid) {
    const w = watchers.get(rid);
    if (w) {
      try { w.close(); } catch (_) {}
      watchers.delete(rid);
    }
  }
  function resyncWatchers() {
    const want = new Set(roots.filter((r) => r.auto !== 'off').map((r) => r.id));
    for (const rid of Array.from(watchers.keys())) {
      if (!want.has(rid)) unwatchRoot(rid);
    }
    if (!settings.watchEnabled) {
      for (const rid of Array.from(watchers.keys())) unwatchRoot(rid);
      return;
    }
    for (const r of roots) watchRoot(r);
  }

  // ── 命令处理（先删后做）──
  async function handleCommand(cmd) {
    const type = String(cmd.type || '');
    const p = cmd.payload || {};
    switch (type) {
      case 'ping':
        return { pong: true, at: now(), roots: roots.length, rules: rules.length };
      case 'roots_add': {
        const pth = String(p.path || '').trim();
        if (!lib.isValidAbsPath(pth)) throw new Error(`路径非法：${pth}`);
        let st;
        try { st = fs.statSync(pth); } catch (_) { throw new Error('目录不存在或不可访问'); }
        if (!st.isDirectory()) throw new Error('不是目录');
        if (roots.some((r) => r.path.toLowerCase() === pth.toLowerCase().replace(/\//g, '\\'))) throw new Error('该目录已在列表中');
        if (roots.length >= 8) throw new Error('根目录数量已达上限（8）');
        roots.push({
          id: lib.slugId(pth),
          path: pth.replace(/\//g, '\\'),
          label: String(p.label || '').trim().slice(0, 24) || lib.pathBase(pth),
          auto: ['off', 'new', 'all'].includes(p.auto) ? p.auto : 'new',
          addedAt: now(),
        });
        await saveRoots();
        resyncWatchers();
        await writeSnapshot();
        return { roots };
      }
      case 'roots_remove': {
        const before = roots.length;
        roots = roots.filter((r) => r.id !== p.id);
        if (roots.length === before) throw new Error('未找到该根目录');
        unwatchRoot(p.id);
        // 该根的规则一并停用（不删，保留配置）
        for (const r of rules) { if (r.rootId === p.id) r.enabled = false; }
        await saveRules();
        await saveRoots();
        await writeSnapshot();
        return { roots };
      }
      case 'roots_set': {
        const root = findRoot(p.id);
        if (!root) throw new Error('未找到该根目录');
        if (['off', 'new', 'all'].includes(p.auto)) root.auto = p.auto;
        if (typeof p.label === 'string' && p.label.trim()) root.label = p.label.trim().slice(0, 24);
        await saveRoots();
        resyncWatchers();
        await writeSnapshot();
        return { roots };
      }
      case 'rules_add': {
        const n = lib.normalizeRule(p.rule);
        if (n.error) throw new Error(n.error);
        if (rules.length >= 40) throw new Error('规则数量已达上限（40）');
        if (n.rootId && !findRoot(n.rootId)) throw new Error('规则指向的根目录不存在');
        if (rules.some((r) => r.id === n.id)) n.id = `${n.id}${Math.floor(Math.random() * 1e4).toString(36)}`;
        rules.push(n);
        rules.sort((a, b) => a.priority - b.priority);
        await saveRules();
        return { rules };
      }
      case 'rules_update': {
        const idx = rules.findIndex((r) => r.id === p.id);
        if (idx < 0) throw new Error('未找到该规则');
        const merged = lib.mergeRule(rules[idx], p.patch);
        if (merged.error) throw new Error(merged.error);
        rules[idx] = merged;
        rules.sort((a, b) => a.priority - b.priority);
        await saveRules();
        return { rules };
      }
      case 'rules_delete': {
        const before = rules.length;
        rules = rules.filter((r) => r.id !== p.id);
        if (rules.length === before) throw new Error('未找到该规则');
        await saveRules();
        return { rules };
      }
      case 'rules_reorder': {
        if (!Array.isArray(p.ids)) throw new Error('ids 必须为数组');
        const order = new Map(p.ids.map((id, i) => [String(id), i]));
        rules.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.priority - b.priority);
        await saveRules();
        return { rules };
      }
      case 'rules_preset': {
        const root = findRoot(p.rootId);
        if (!root) throw new Error('根目录不存在');
        const packRules = lib.presetRules(String(p.packId || 'downloads'), root.id);
        if (!packRules) throw new Error('预置包不存在');
        // 幂等：同根同名规则已存在则跳过
        let added = 0;
        for (const r of packRules) {
          if (rules.some((x) => x.rootId === root.id && x.name === r.name)) continue;
          rules.push(r);
          added++;
        }
        rules.sort((a, b) => a.priority - b.priority);
        await saveRules();
        return { rules, added };
      }
      case 'settings_set': {
        settings = lib.normalizeSettings({ ...settings, ...(p.patch || {}) });
        await saveSettings();
        resyncWatchers();
        return { settings };
      }
      case 'scan':
      case 'dryrun': {
        const root = findRoot(p.rootId);
        if (!root) throw new Error('未找到该根目录');
        const { plan } = await buildPlan(root, { mode: 'manual' });
        log('info', `dryrun ${root.path} → ${plan.ops.length} ops（safe=${plan.safeOps} outside=${plan.outsideOps}）`);
        return {
          planId: plan.planId,
          rootId: root.id,
          counts: plan.counts,
          ops: plan.ops.slice(0, 150),
          opTotal: plan.ops.length,
          safeOps: plan.safeOps,
          outsideOps: plan.outsideOps,
          skipped: plan.skipped.slice(0, 50),
          truncated: plan.counts.truncated,
        };
      }
      case 'apply': {
        if (p.confirm !== true) throw new Error('apply 需要 confirm:true（先 dryrun 审阅计划）');
        const root = findRoot(p.rootId);
        if (!root) throw new Error('未找到该根目录');
        let plan;
        if (p.planId) {
          plan = await kv.kvGet(K.plan(p.planId));
          if (!plan || plan.rootId !== root.id) throw new Error('计划不存在/已过期/不属于该根');
        } else {
          plan = (await buildPlan(root, { mode: 'manual' })).plan;
        }
        enqueueApply(plan, { mode: 'manual', nonce: cmd.nonce });
        return { queued: true, planId: plan.planId, opTotal: plan.ops.length, note: '已入执行队列，结果见批次日志' };
      }
      case 'undo': {
        if (p.confirm !== true) throw new Error('undo 需要 confirm:true');
        const r = await undoBatch(String(p.batchId || ''), cmd.nonce);
        return r;
      }
      case 'batch_detail': {
        const b = await kv.kvGet(K.batch(String(p.batchId || '')));
        if (!b) throw new Error('批次不存在或已过保留期');
        return { batch: b };
      }
      default:
        throw new Error(`未知命令：${type}`);
    }
  }

  async function consumeCommands(allKeys) {
    const cmdKeys = allKeys.filter((k) => k.startsWith(CMD_PREFIX));
    for (const key of cmdKeys) {
      const nonce = key.slice(CMD_PREFIX.length);
      let cmd = null;
      try {
        cmd = await kv.kvGet(key);
      } catch (_) { continue; }
      await kv.kvDel(key).catch(() => {}); // 先删后做：防重复消费
      if (!cmd || typeof cmd !== 'object' || !cmd.type) continue;
      if (cmd.at && now() - cmd.at > 60 * 60 * 1000) continue; // 过期命令不执行
      try {
        const payload = await handleCommand(cmd);
        await writeResult(nonce, payload);
      } catch (e) {
        log('warn', `命令 ${cmd.type} 失败: ${e.message}`);
        await writeResultErr(nonce, e.message);
      }
    }
  }

  // ── 自动模式：watch 触发 / 周期兜底 ──
  async function autoPulse() {
    for (const root of roots) {
      if (root.auto === 'off') continue;
      const dueWatch = pendingScan.has(root.id);
      const last = lastAutoAt.get(root.id) || 0;
      const dueSweep = now() - last > (settings.sweepMinutes || 15) * 60 * 1000;
      if (!dueWatch && !dueSweep) continue;
      pendingScan.delete(root.id);
      lastAutoAt.set(root.id, now());
      try {
        const { plan } = await buildPlan(root, { mode: 'auto' });
        if (plan.ops.length) {
          log('info', `auto ${root.path} → ${plan.ops.length} ops`);
          enqueueApply(plan, { mode: 'auto', nonce: null });
        }
      } catch (e) {
        log('warn', `auto 扫描失败 ${root.path}: ${e.message}`);
      }
    }
  }

  async function drainApplyQueue() {
    if (applyBusy) return;
    const item = applyQueue.shift();
    if (!item) return;
    applyBusy = true;
    try {
      await executePlan(item.plan, { mode: item.mode, nonce: item.nonce });
    } catch (e) {
      log('warn', `执行失败: ${e.message}`);
      if (item.nonce) await writeResultErr(item.nonce, e.message);
    } finally {
      applyBusy = false;
    }
  }

  async function retentionSweep(allKeys) {
    const del = lib.retentionPlan(allKeys, now());
    for (const k of del) await kv.kvDel(k).catch(() => {});
    if (del.length) log('debug', `清扫 ${del.length} 个过期键`);
  }

  async function metaBeat() {
    await kv.kvSet(K.meta, {
      version: lib.VERSION,
      pid: process.pid,
      startedAt,
      lastTickAt: now(),
      bridge: bridgeOk ? 'ok' : 'down',
      roots: roots.length,
      rules: rules.length,
      watched: Array.from(watchers.keys()),
    }).catch(() => {});
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const allKeys = await kv.kvKeys();
      bridgeOk = true;
      if (now() - loadedAt > SETTINGS_RELOAD_MS) await loadState();

      await consumeCommands(allKeys);
      await autoPulse();
      await drainApplyQueue();

      if (now() - lastSweepAt > SWEEP_MS) {
        lastSweepAt = now();
        retentionSweep(allKeys).catch((e) => log('warn', `清扫失败: ${e.message}`));
      }
      if (now() - lastMetaAt > META_BEAT_MS) {
        lastMetaAt = now();
        await metaBeat();
      }
    } catch (e) {
      bridgeOk = false;
      log('warn', `tick 失败（桥不可达？）: ${e.message}`);
    } finally {
      ticking = false;
    }
  }

  async function start() {
    initLog(appConfigDir);
    log('info', `file-flow 服务启动 port=${port}`);
    // 首轮加载 + 立即建快照，面板首开即有数据
    await loadState().catch((e) => log('warn', `首轮加载失败: ${e.message}`));
    resyncWatchers();
    await writeSnapshot().catch(() => {});
    await metaBeat().catch(() => {});
    setInterval(() => { tick(); }, TICK_MS);
    tick();
  }

  const healthServer = http.createServer((req, res) => {
    const u = (req.url || '').split('?')[0];
    if (u === '/__health' || u === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'file-flow',
        version: lib.VERSION,
        bridge: bridgeOk ? 'ok' : 'down',
        roots: roots.length,
        rules: rules.length,
        uptimeMs: now() - startedAt,
      }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  return { start, healthServer, port };
}

// ── 入口 ──
const PORT = Number(process.argv[2]) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const flow = createFlow({ port: PORT, appConfigDir: APP_CONFIG_DIR });
flow.healthServer.listen(PORT, '127.0.0.1', () => {
  log('info', `health 端点就绪 http://127.0.0.1:${PORT}/__health`);
});
flow.start();

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandled: ${e && e.stack ? e.stack : e}`));
