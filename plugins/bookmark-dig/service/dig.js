#!/usr/bin/env node
'use strict';
/**
 * dig.js —— 书签体检后台服务（零依赖，node >= 18，需全局 fetch）
 *
 * 单写者权威：bmd.rec.* / bmd.run / bmd.report.* 只由本进程写；
 * 面板/MCP 一切变更经命令键（先删后做，见 consumeCommands）。
 *
 * 职责：
 *   - 命令消费：import(分批)/import_path/check/recheck_dead/remove/tag/visit/wipe
 *   - 检查引擎：并发池（默认 6）逐批检查 run 队列，脏分块合并刷盘（3s 节流）
 *   - 断点续跑：run 清单持久化在 bmd.run，重启后从 cursor 接着跑
 *   - 运行报告：完成写 bmd.report.<runId>，保留最近 5 份
 *   - 心跳 bmd.meta（60s）；/__health 恒 200（bridge 不可达降级不重启循环）
 *
 * fetch 守卫：isFetchableUrl 拒绝环回/内网/链路本地（记录任何端都可导入，
 * 不得让「导入一条书签」变成对 localhost 的探测）。改动必须保留。
 *
 * 启动参数：node dig.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/dig-core');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 3000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 30 * 1000;
const FLUSH_MS = 3000;
const RUN_PERSIST_EVERY = 10;   // 每 N 个完成持久化一次 run
const FETCH_TIMEOUT_DEFAULT = 12000;
const MAX_BODY_BYTES = 64 * 1024; // 存活判断只需响应头 + 少量正文
const MAX_BATCH_RECORDS = 400;    // import 命令单批上限（kv 单值护栏）
const REPORT_KEEP = 5;

const K = {
  settings: 'bmd.settings',
  meta: 'bmd.meta',
  run: 'bmd.run',
};
const REC_PREFIX = 'bmd.rec.';
const CMD_PREFIX = 'bmd.cmd.';
const RESULT_PREFIX = 'bmd.result.';
const REPORT_PREFIX = 'bmd.report.';

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'bookmark-dig.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.BMD_DEBUG === '1';
function log(level, msg) {
  const line = `[bookmark-dig:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 主流程状态 ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

let settings = core.normalizeSettings(null);
let settingsReadAt = 0;
let degraded = false;
let lastEndpointRefreshAt = 0;
const startedAt = Date.now();
let lastMetaAt = 0;
let lastFlushAt = 0;
let loaded = false;
let loading = null;

// 记录缓存（唯一写者才有内存缓存权）：recs 数组 + id → {chunk, idx} 索引
let recs = [];
let chunks = new Map();     // n → items 数组（与 kv 中对象同引用，改完直接回写）
let idIndex = new Map();    // id → {n, idx}
const dirtyChunks = new Set();
const kvHasChunk = new Set();

async function loadAll() {
  const keys = await kv.kvKeys();
  const chunkNums = keys.filter((k) => k.startsWith(REC_PREFIX)).map((k) => Number(k.slice(REC_PREFIX.length))).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  const items = await Promise.all(chunkNums.map(async (n) => ({ n, v: await kv.kvGet(REC_PREFIX + n).catch(() => null) })));
  recs = [];
  chunks = new Map();
  idIndex = new Map();
  kvHasChunk.clear();
  for (const { n, v } of items) {
    if (!Array.isArray(v)) continue;
    kvHasChunk.add(n);
    const arr = [];
    v.forEach((r, idx) => {
      if (!r || typeof r !== 'object' || !r.id || !r.normKey) return;
      const pos = { n, idx: arr.length };
      idIndex.set(r.id, pos);
      arr.push(r);
      recs.push(r);
    });
    chunks.set(n, arr);
  }
  loaded = true;
  log('info', `已加载 ${recs.length} 条记录（${chunks.size} 个分块）`);
}

function ensureLoaded() {
  if (loaded) return Promise.resolve();
  if (!loading) loading = loadAll().finally(() => { loading = null; });
  return loading;
}

/** 单写者合并刷盘：脏分块整体回写；新增分块直接 set；被清空的分块 delete */
async function flushDirty() {
  if (!dirtyChunks.size) return;
  const ops = [];
  for (const n of dirtyChunks) {
    const arr = chunks.get(n);
    if (!arr || arr.length === 0) {
      if (kvHasChunk.has(n)) ops.push(kv.kvDel(REC_PREFIX + n).then(() => { kvHasChunk.delete(n); }).catch(() => {}));
    } else {
      ops.push(kv.kvSet(REC_PREFIX + n, arr).then(() => { kvHasChunk.add(n); }).catch((e) => log('warn', `分块 ${n} 回写失败: ${e.message}`)));
    }
  }
  dirtyChunks.clear();
  await Promise.all(ops);
}

/** 把（已存在于缓存或新增的）记录落回分块结构 */
function upsertInCache(rec) {
  const pos = idIndex.get(rec.id);
  if (pos) {
    const arr = chunks.get(pos.n);
    if (arr && arr[pos.idx]) {
      arr[pos.idx] = rec;
      const i = recs.findIndex((r) => r.id === rec.id);
      if (i >= 0) recs[i] = rec;
      dirtyChunks.add(pos.n);
      return;
    }
  }
  // 新增：放最后一个未满分块，否则开新块
  let targetN = -1;
  for (const n of [...chunks.keys()].sort((a, b) => b - a)) {
    if (chunks.get(n).length < core.CHUNK_SIZE) { targetN = n; break; }
  }
  if (targetN === -1) targetN = chunks.size ? Math.max(...chunks.keys()) + 1 : 0;
  if (!chunks.has(targetN)) chunks.set(targetN, []);
  const arr = chunks.get(targetN);
  arr.push(rec);
  idIndex.set(rec.id, { n: targetN, idx: arr.length - 1 });
  recs.push(rec);
  dirtyChunks.add(targetN);
}

// ── 抓取（SSRF 守卫 + 超时 + 限长；web ReadableStream reader 循环读）────────
async function checkUrl(url, timeoutMs) {
  if (!core.isFetchableUrl(url)) return { status: core.STATUS.BLOCKED, reason: '不允许抓取的地址（内网/非公网）' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_DEFAULT);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolarisBookmarkDig/0.1; +https://github.com/misxzaiz/Polaris-plugin)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = String(e && e.cause && e.cause.code || e.message || e);
    if (e.name === 'AbortError') return { status: core.STATUS.TIMEOUT, reason: `超时（${timeoutMs}ms）` };
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return { status: core.STATUS.DNS, reason: '域名解析失败' };
    if (/CERT|SSL|TLS|self-signed|certificate/i.test(msg)) return { status: core.STATUS.SSL, reason: '证书错误' };
    if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH/i.test(msg)) return { status: core.STATUS.DNS, reason: '连接失败' };
    return { status: core.STATUS.DNS, reason: msg.slice(0, 120) };
  }
  clearTimeout(timer);
  // 读少量正文后立刻断（存活判断不需要整页；限长防大文件）
  try {
    if (res.body) {
      const reader = res.body.getReader();
      let size = 0;
      const readLoop = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size >= MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); break; }
        }
      };
      await Promise.race([readLoop(), new Promise((r) => setTimeout(r, 3000))]);
      reader.cancel().catch(() => {});
    } else {
      res.resume?.();
    }
  } catch (_) { /* 正文读取失败不影响状态判定 */ }
  const latencyMs = Date.now() - t0;
  const finalUrl = res.url || url;
  const redirected = finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '');
  const status = core.classifyHttp(res.status, redirected ? { redirected: true } : undefined);
  return { status, httpStatus: res.status, latencyMs, finalUrl };
}

/** 单条检查 → 返回记录补丁（不落库，调用方合并） */
async function checkRecord(rec, settingsNow) {
  const norm = core.normalizeUrl(rec.url);
  if (norm.error) return { status: core.STATUS.INVALID, failReason: norm.error };
  const r = await checkUrl(norm.url, settingsNow.timeoutMs);
  const patch = {
    lastCheckedAt: Date.now(),
    status: r.status,
    failReason: r.status === core.STATUS.OK || r.status === core.STATUS.REDIRECT ? '' : (r.reason || ''),
    tries: (rec.tries || 0) + 1,
  };
  if (r.httpStatus !== undefined) patch.httpStatus = r.httpStatus;
  if (r.latencyMs !== undefined) patch.latencyMs = r.latencyMs;
  if (r.finalUrl && r.finalUrl !== rec.url) patch.finalUrl = r.finalUrl;
  if (r.status === core.STATUS.OK || r.status === core.STATUS.REDIRECT) patch.lastOkAt = Date.now();
  return patch;
}

// ── 运行引擎 ───────────────────────────────────────────────────────────────
let run = null; // {id, type, startedAt, queue:[ids], cursor, done, checked, okCount, deadCount, persistPending}

async function startRun(type, ids) {
  run = { id: 'r' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), type, startedAt: Date.now(), queue: ids, cursor: 0, done: 0, checked: 0, okCount: 0, deadCount: 0, byStatus: {} };
  await kv.kvSet(K.run, { ...run, queue: ids }).catch(() => {});
  log('info', `运行开始 type=${type} queue=${ids.length}`);
}

async function persistRun(force) {
  if (!run) return;
  if (!force && run.done % RUN_PERSIST_EVERY !== 0) return;
  await kv.kvSet(K.run, { ...run }).catch(() => {});
}

async function finishRun() {
  if (!run) return;
  const reportId = run.id;
  const counts = { ...run.byStatus };
  const report = {
    id: reportId, type: run.type, startedAt: run.startedAt, finishedAt: Date.now(),
    total: run.queue.length, checked: run.checked, okCount: run.okCount, deadCount: run.deadCount, byStatus: counts,
  };
  await kv.kvSet(REPORT_PREFIX + reportId, report).catch(() => {});
  await kv.kvDel(K.run).catch(() => {});
  log('info', `运行完成 ${reportId}: checked=${run.checked} ok=${run.okCount} dead=${run.deadCount}`);
  // 报告保留最近 5 份
  try {
    const keys = await kv.kvKeys();
    const rids = keys.filter((k) => k.startsWith(REPORT_PREFIX)).map((k) => k.slice(REPORT_PREFIX.length)).sort();
    for (const rid of rids.slice(0, Math.max(0, rids.length - REPORT_KEEP))) {
      await kv.kvDel(REPORT_PREFIX + rid).catch(() => {});
    }
  } catch (_) { /* 清理失败不影响主流程 */ }
  run = null;
}

async function runTick() {
  if (!run) return;
  if (!settings.checkEnabled) return; // 暂停：run 保留，设置打开后继续
  const conc = Math.max(1, Math.min(12, settings.concurrency));
  const batch = run.queue.slice(run.cursor, run.cursor + conc);
  if (!batch.length) { await finishRun(); return; }
  const byId = new Map(recs.map((r) => [r.id, r]));
  const jobs = batch.map(async (id) => {
    const rec = byId.get(id);
    if (!rec) return null;
    const patch = await checkRecord(rec, settings);
    return { rec, patch };
  });
  const results = await Promise.all(jobs);
  for (const r of results) {
    if (!r) { run.cursor += 1; continue; } // 记录已被删除：跳过
    const next = core.patchRecord(r.rec, r.patch);
    upsertInCache(next);
    run.cursor += 1;
    run.done += 1;
    run.checked += 1;
    run.byStatus[r.patch.status] = (run.byStatus[r.patch.status] || 0) + 1;
    if (r.patch.status === core.STATUS.OK || r.patch.status === core.STATUS.REDIRECT) run.okCount += 1;
    else run.deadCount += 1;
  }
  await persistRun(false);
}

// ── 命令消费（先删后做；import 分批按 seq 有序）────────────────────────────
async function setResult(nonce, obj) {
  await kv.kvSet(RESULT_PREFIX + nonce, { ...obj, at: Date.now() }).catch(() => {});
}

async function consumeCommands() {
  const keys = await kv.kvKeys();
  const cmds = keys.filter((k) => k.startsWith(CMD_PREFIX));
  if (!cmds.length) return;

  // import 分批：bmd.cmd.import.<seq> 先收集按 seq 排序
  const importKeys = cmds.filter((k) => /^bmd\.cmd\.import\.\d+$/.test(k))
    .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
  for (const k of importKeys) {
    const cmd = await kv.kvGet(k).catch(() => null);
    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);
    if (!delOk) continue;
    if (!cmd || !Array.isArray(cmd.records)) { log('warn', `import 批次格式错误: ${k}`); continue; }
    if (cmd.records.length > MAX_BATCH_RECORDS) { log('warn', `import 批次超限（${cmd.records.length}>${MAX_BATCH_RECORDS}）截断`); }
    const now = Date.now();
    const merged = core.mergeRecords(recs, cmd.records.slice(0, MAX_BATCH_RECORDS), now);
    for (const rec of merged.toUpsert) upsertInCache(rec);
    log('info', `import 批次 ${k.split('.').pop()}: +${merged.added} 更新${merged.updated} 重复${merged.duplicateIds.length} 无效${merged.invalid}`);
    // 首次导入且允许 → 自动起检查运行
    if (settings.autoCheckOnImport && !run) {
      const ids = core.planCheckQueue(recs, { limit: settings.batchSize, recheckDays: settings.recheckDays });
      if (ids.length) await startRun('auto', ids);
    }
  }

  // import_path：服务直接读磁盘（无 kv 单值上限问题）
  const pathKeys = cmds.filter((k) => k.startsWith(CMD_PREFIX + 'import_path.'));
  for (const k of pathKeys) {
    const cmd = await kv.kvGet(k).catch(() => null);
    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);
    if (!delOk) continue;
    const nonce = k.slice((CMD_PREFIX + 'import_path.').length);
    try {
      const p = String(cmd && cmd.path || '');
      if (!path.isAbsolute(p)) throw new Error('path 必须是绝对路径');
      const html = fs.readFileSync(p, 'utf8');
      const parsed = core.parseNetscapeHtml(html);
      const merged = core.mergeRecords(recs, parsed.records, Date.now());
      for (const rec of merged.toUpsert) upsertInCache(rec);
      log('info', `import_path ${p}: 解析${parsed.records.length} +${merged.added} 重复${merged.duplicateIds.length} 跳过${parsed.skipped}`);
      await setResult(nonce, { ok: true, summary: { parsed: parsed.records.length, added: merged.added, updated: merged.updated, duplicates: merged.duplicateIds.length, invalid: merged.invalid, skippedLines: parsed.skipped } });
      if (settings.autoCheckOnImport && !run) {
        const ids = core.planCheckQueue(recs, { limit: settings.batchSize, recheckDays: settings.recheckDays });
        if (ids.length) await startRun('auto', ids);
      }
    } catch (e) {
      log('warn', `import_path 失败: ${e.message}`);
      await setResult(nonce, { ok: false, error: e.message });
    }
  }

  // 普通命令
  const plainKeys = cmds.filter((k) => !/^bmd\.cmd\.import\.\d+$/.test(k) && !k.startsWith(CMD_PREFIX + 'import_path.'));
  for (const k of plainKeys) {
    const cmd = await kv.kvGet(k).catch(() => null);
    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);
    if (!delOk || !cmd || typeof cmd !== 'object') continue;
    const rest = k.slice(CMD_PREFIX.length);
    const nonce = rest.split('.').pop();
    const op = rest.slice(0, rest.length - nonce.length - 1);
    try {
      if (op === 'check') {
        if (run) throw new Error('已有运行在进行（见面板「检查」页进度）');
        const ids = core.planCheckQueue(recs, { limit: Number(cmd.limit) || settings.batchSize, recheckDays: 0 });
        if (!ids.length) throw new Error('没有需要检查的书签（全部已检查；用 recheck_dead 或设置 recheckDays）');
        await startRun('manual', ids);
        await setResult(nonce, { ok: true, summary: { runId: run.id, queued: ids.length } });
      } else if (op === 'recheck_dead') {
        if (run) throw new Error('已有运行在进行');
        const ids = core.planCheckQueue(recs, { limit: Number(cmd.limit) || settings.batchSize, deadOnly: true });
        if (!ids.length) throw new Error('没有需要重查的死链');
        await startRun('recheck_dead', ids);
        await setResult(nonce, { ok: true, summary: { runId: run.id, queued: ids.length } });
      } else if (op === 'recheck_ids') {
        if (run) throw new Error('已有运行在进行');
        const want = Array.isArray(cmd.ids) ? [...new Set(cmd.ids.map(String))].slice(0, 2000) : [];
        if (!want.length) throw new Error('缺少 ids');
        const byId = new Map(recs.map((r) => [r.id, r]));
        const ids = want.filter((id) => byId.has(id));
        if (!ids.length) throw new Error('给定的 id 都不在库中');
        await startRun('recheck_ids', ids);
        await setResult(nonce, { ok: true, summary: { runId: run.id, queued: ids.length } });
      } else if (op === 'remove') {
        if (cmd.confirm !== true) throw new Error('缺少 confirm:true——删除书签是危险操作');
        const ids = new Set(Array.isArray(cmd.ids) ? cmd.ids : []);
        let removed = 0;
        for (const id of ids) {
          const pos = idIndex.get(id);
          if (!pos) continue;
          const arr = chunks.get(pos.n);
          if (arr) { arr.splice(pos.idx, 1); dirtyChunks.add(pos.n); }
          idIndex.delete(id);
          const i = recs.findIndex((r) => r.id === id);
          if (i >= 0) recs.splice(i, 1);
          removed += 1;
        }
        // 同块删除后 idx 失效，重建索引（廉价：本块内重排）
        for (const n of [...dirtyChunks]) {
          const arr = chunks.get(n);
          if (!arr) continue;
          arr.forEach((r, idx) => { idIndex.set(r.id, { n, idx }); });
        }
        if (run) run.queue = run.queue.filter((id) => !ids.has(id));
        log('info', `remove: ${removed} 条`);
        await setResult(nonce, { ok: true, summary: { removed } });
      } else if (op === 'tag') {
        const ids = new Set(Array.isArray(cmd.ids) ? cmd.ids : []);
        const tags = Array.isArray(cmd.tags) ? cmd.tags.map(String).slice(0, 8) : [];
        let tagged = 0;
        for (const id of ids) {
          const pos = idIndex.get(id);
          if (!pos) continue;
          const arr = chunks.get(pos.n);
          const rec = arr && arr[pos.idx];
          if (!rec) continue;
          const next = core.patchRecord(rec, { tags });
          upsertInCache(next);
          tagged += 1;
        }
        await setResult(nonce, { ok: true, summary: { tagged } });
      } else if (op === 'visit') {
        const pos = idIndex.get(String(cmd.id || ''));
        const arr = pos && chunks.get(pos.n);
        const rec = arr && arr[pos.idx];
        if (!rec) throw new Error('未找到该书签');
        const next = core.patchRecord(rec, { lastVisitAt: Date.now(), lastResurfaceAt: Date.now() });
        upsertInCache(next);
        await setResult(nonce, { ok: true, summary: { visited: cmd.id } });
      } else if (op === 'wipe') {
        if (cmd.confirm !== true) throw new Error('缺少 confirm:true——清空全部数据是危险操作');
        let wiped = 0;
        for (const n of [...chunks.keys()]) {
          if (kvHasChunk.has(n)) { await kv.kvDel(REC_PREFIX + n).catch(() => {}); kvHasChunk.delete(n); }
          wiped += chunks.get(n).length;
          chunks.delete(n);
        }
        dirtyChunks.clear();
        recs = [];
        idIndex.clear();
        run = null;
        await kv.kvDel(K.run).catch(() => {});
        log('warn', `wipe: 清空 ${wiped} 条记录`);
        await setResult(nonce, { ok: true, summary: { wiped } });
      } else {
        log('warn', `未知命令 ${op}（${k}）`);
      }
    } catch (e) {
      log('warn', `命令 ${op} 失败: ${e.message}`);
      await setResult(nonce, { ok: false, error: e.message });
    }
  }
}

// ── 主循环 ─────────────────────────────────────────────────────────────────
async function tick() {
  try {
    await ensureLoaded();
    if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS) {
      const raw = await kv.kvGet(K.settings).catch(() => null);
      if (raw && typeof raw === 'object') settings = core.normalizeSettings(raw);
      settingsReadAt = Date.now();
    }

    await consumeCommands();
    await runTick();

    if (dirtyChunks.size && Date.now() - lastFlushAt > FLUSH_MS) {
      lastFlushAt = Date.now();
      await flushDirty();
    }

    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        degraded,
        settings,
        records: recs.length,
        run: run ? { id: run.id, type: run.type, cursor: run.cursor, total: run.queue.length } : null,
      }).catch(() => {});
    }

    if (degraded) {
      degraded = false;
      log('info', 'bridge 已恢复');
    }
  } catch (e) {
    const wasDown = degraded;
    degraded = true;
    log('warn', `tick 降级: ${e.message}`);
    if (!wasDown || Date.now() - lastEndpointRefreshAt > 60 * 1000) {
      if (!wasDown) log('info', 'bridge 不可达，进入降级（健康端点保持 200）');
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  }
}

// ── 健康端点（宿主仅看 2xx；bridge 不可达也返回 200，降级见 meta）───────────
const server = http.createServer((req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, loaded, records: recs.length, run: run ? { cursor: run.cursor, total: run.queue.length } : null, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

if (PORT > 0) {
  server.listen(PORT, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${PORT}`));
  server.on('error', (e) => log('error', `health endpoint: ${e.message}`));
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

log('info', `bookmark-dig service v${VERSION} start (pid=${process.pid})`);
setInterval(tick, TICK_MS);
