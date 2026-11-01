#!/usr/bin/env node
'use strict';
/**
 * main.js —— 密钥扫描台后台服务（零依赖，node >= 18.15）
 *
 * 单写者权威：keyscan.scan.* / keyscan.find.* / keyscan.latest / keyscan.history /
 * keyscan.result.* / keyscan.meta 全部只由本服务写。面板与 MCP 通过
 * keyscan.cmd.scan.<nonce> 表达扫描意图；消费互斥序 = 读载荷 → kvDel 成功者才执行
 * （delete 是唯一执行凭证，并发消费者至多一个删成功，至多执行一次），轮询结果键拿产出。
 *
 * 数据安全设计（本插件的核心安全姿态）：
 *   - 只读扫描：本服务除自日志外不写任何文件，零外网请求；
 *   - 掩码存储：所有落 kv 的发现条目只含掩码预览 + FNV 指纹 + 掩码上下文行，
 *     完整密钥值永远不出被扫文件（见 shared/scan-core.js 掩码不变量）；
 *   - 键数纪律：发现分块存储（≤150 条/块），旧扫描只保留最近 5 份，到期清理。
 *
 * 生命周期：宿主 type=http + /__health（恒 200，降级也保活）；
 * 桥不可达 → degraded 心跳，60s 重试自发现，绝不自饿死。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createKvClient } = require('./kvclient');
const { scanDirectory } = require('./scanner');
const core = require('../shared/scan-core');

const VERSION = '0.1.0';
const TICK_MS = 1500;
const SETTINGS_RELOAD_MS = 30 * 1000;
const META_BEAT_MS = 60 * 1000;
const KEEP_SCANS = 5;               // 保留最近 N 份扫描记录+发现分块
const CHUNK_SIZE = 150;             // 每块发现条数（单 kv 值 ≤256KB 纪律）
const RESULT_TTL_MS = 10 * 60 * 1000;

const PREFIX = 'keyscan.';
const K = {
  settings: 'keyscan.settings',
  meta: 'keyscan.meta',
  ignore: 'keyscan.ignore',
  latest: 'keyscan.latest',
  history: 'keyscan.history',
  scan: (id) => `keyscan.scan.${id}`,
  scanPrefix: 'keyscan.scan.',
  find: (id, n) => `keyscan.find.${id}.${n}`,
  findPrefix: 'keyscan.find.',
  cmdPrefix: 'keyscan.cmd.scan.',
  result: (nonce) => `keyscan.result.${nonce}`,
  resultPrefix: 'keyscan.result.',
};

// ── 日志（宿主不收集 stdout，自落盘 + 512KB 轮转）────────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'keyscan.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 首轮无日志 */ }
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[keyscan:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) { try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ } }
}

// ── 桥客户端 ────────────────────────────────────────────────────────────────
const APP_CONFIG_DIR = process.argv[3] || process.argv[2] || '';
const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

// ── 运行时状态（进程内缓存，重启后自 kv 重建）───────────────────────────────
const state = {
  settings: { ...core.DEFAULT_SETTINGS },
  settingsLoadedAt: 0,
  ignore: [],
  ignoreLoadedAt: 0,
  recentFps: [],           // 最近 KEEP_SCANS 份扫描的指纹集合；基线 = 并集
  prevScanId: null,
  scanning: null,          // { scanId, root, startedAt, nonce }
};

/** 基线 = 最近几份扫描的指纹并集（零发现扫描不清空基线；跨目录扫描互不误报） */
function baselineFps() {
  const s = new Set();
  for (const x of state.recentFps) for (const v of x) s.add(v);
  return s;
}

function genId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function loadSettings(force) {
  if (!force && Date.now() - state.settingsLoadedAt < SETTINGS_RELOAD_MS) return state.settings;
  const v = await kv.kvGet(K.settings).catch(() => null);
  if (v && typeof v === 'object') {
    state.settings = {
      ...core.DEFAULT_SETTINGS,
      ...v,
      skipDirs: Array.isArray(v.skipDirs) ? v.skipDirs : core.DEFAULT_SETTINGS.skipDirs,
      disabledRules: Array.isArray(v.disabledRules) ? v.disabledRules : [],
    };
  }
  state.settingsLoadedAt = Date.now();
  return state.settings;
}

async function loadIgnore(force) {
  if (!force && Date.now() - state.ignoreLoadedAt < SETTINGS_RELOAD_MS) return state.ignore;
  const v = await kv.kvGet(K.ignore).catch(() => null);
  state.ignore = Array.isArray(v) ? v : [];
  state.ignoreLoadedAt = Date.now();
  return state.ignore;
}

/** 重启后重建基线：枚举保留的扫描记录（最近 KEEP_SCANS 份），并集其分块指纹 */
async function rebuildPrevFps() {
  const keys = await kv.kvKeys().catch(() => []);
  const ids = keys
    .filter((k) => k.startsWith(K.scanPrefix))
    .map((k) => k.slice(K.scanPrefix.length))
    .sort()
    .reverse()
    .slice(0, KEEP_SCANS);
  let total = 0;
  for (const id of ids) {
    const fps = new Set();
    for (let n = 0; n < 400; n++) {
      const chunk = await kv.kvGet(K.find(id, n)).catch(() => null);
      if (!chunk || !Array.isArray(chunk) || !chunk.length) break;
      for (const f of chunk) if (f && f.fp) fps.add(f.fp);
    }
    state.recentFps.push(fps);
    total += fps.size;
    state.prevScanId = id;
  }
  log('info', `基线重建完成：${ids.length} 份扫描，指纹并集 ${baselineFps().size} 个（含重叠 ${total}）`);
}

// ── 扫描执行（命令消费的正文）───────────────────────────────────────────────
async function runScan(scanId, nonce, root) {
  const settings = await loadSettings(true);
  const ignore = await loadIgnore(true);
  const record = {
    id: scanId, at: Date.now(), root,
    status: 'running', version: VERSION,
    progress: { files: 0, findings: 0 },
  };
  await kv.kvSet(K.scan(scanId), record);

  let result;
  try {
    const out = await scanDirectory({
      root,
      settings,
      onProgress: (p) => {
        record.progress = { files: p.filesSeen, findings: p.findings };
        // 扫描器 2s 节流回调一次，直接透写 kv——面板/MCP 才能看到活进度
        void kv.kvSet(K.scan(scanId), record).catch(() => {});
      },
    });

    if (out.stat.cancelled) {
      result = { ok: false, error: '扫描被取消' };
    } else {
      // 聚合 + ignore 过滤 + 基线 diff（全部纯函数，在 core）
      let agg = core.aggregateFindings(out.rawFindings);
      const beforeIgnore = agg.length;
      agg = core.applyIgnores(agg, ignore);
      const ignoredCount = beforeIgnore - agg.length;
      const counts = core.countSeverities(agg);
      const diff = core.diffFindings(agg, baselineFps());

      // 分块落 kv（值内全部为掩码形态——core 的掩码不变量）
      let chunks = 0;
      for (let i = 0; i < agg.length; i += CHUNK_SIZE) {
        await kv.kvSet(K.find(scanId, chunks), agg.slice(i, i + CHUNK_SIZE));
        chunks++;
      }

      const summary = {
        ...record,
        status: 'done',
        finishedAt: Date.now(),
        durationMs: out.durationMs,
        files: out.stat.filesSeen,
        filesScanned: out.stat.filesScanned,
        skippedBinary: out.stat.skippedBinary,
        skippedSize: out.stat.skippedSize,
        skippedDirs: out.stat.skippedDirs,
        readErrors: out.stat.readErrors,
        truncated: out.stat.truncated,
        truncatedReason: out.stat.truncatedReason,
        findingCount: agg.length,
        rawCount: out.rawFindings.length,
        chunks,
        ignoredCount,
        counts,
        new: diff,
      };
      await kv.kvSet(K.scan(scanId), summary);
      await kv.kvSet(K.latest, {
        id: scanId, at: summary.at, root,
        counts, new: diff, findingCount: agg.length, files: summary.files, durationMs: summary.durationMs,
      });
      await pushHistory({
        id: scanId, at: summary.at, root,
        counts, new: diff, findingCount: agg.length,
        files: summary.files, durationMs: summary.durationMs, truncated: !!summary.truncated,
      });

      // 清理旧扫描（保留最近 KEEP_SCANS 份，按 id 时间序）
      await pruneOldScans(scanId);

      // 基线滚动：加入本份，超出保留窗丢弃最旧（在 diff 之后做，本份不计入自己的基线）
      state.recentFps.push(new Set(agg.map((f) => f.fp)));
      if (state.recentFps.length > KEEP_SCANS) state.recentFps.shift();
      state.prevScanId = scanId;
      result = {
        ok: true, scanId,
        counts, new: diff, findingCount: agg.length,
        files: summary.files, durationMs: summary.durationMs,
        truncated: !!summary.truncated,
      };
      log('info', `扫描完成 ${scanId} root=${root} files=${summary.files} findings=${agg.length} ` +
        `new=${diff.newCount}(C${diff.newCritical}/H${diff.newHigh}) ${summary.durationMs}ms` +
        (summary.truncated ? ` [截断:${summary.truncatedReason}]` : ''));
    }
  } catch (e) {
    result = { ok: false, error: String((e && e.message) || e) };
    await kv.kvSet(K.scan(scanId), { ...record, status: 'failed', error: result.error, finishedAt: Date.now() }).catch(() => {});
    log('error', `扫描失败 ${scanId}: ${result.error}`);
  }

  if (nonce) {
    await kv.kvSet(K.result(nonce), { at: Date.now(), ...result }).catch(() => {});
  }
  state.scanning = null;
  await beat(degraded, lastBridgeErr).catch(() => {}); // 立即清除 meta.scanning（不等 60s 节拍，防 MCP/面板读到僵尸扫描态）
}

async function pushHistory(entry) {
  const h = await kv.kvGet(K.history).catch(() => null);
  const list = Array.isArray(h) ? h : [];
  list.unshift(entry);
  await kv.kvSet(K.history, list.slice(0, 20));
}

async function pruneOldScans(currentId) {
  const keys = await kv.kvKeys().catch(() => []);
  const scanIds = [...new Set(keys
    .filter((k) => k.startsWith(K.scanPrefix) && k !== K.scan(currentId))
    .map((k) => k.slice(K.scanPrefix.length)))];
  // id 以时间戳开头（base36），字典序≈时间序
  scanIds.sort();
  const toDelete = scanIds.slice(0, Math.max(0, scanIds.length - (KEEP_SCANS - 1)));
  const delKeys = [];
  for (const id of toDelete) {
    delKeys.push(K.scan(id));
    for (const k of keys) {
      if (k.startsWith(`keyscan.find.${id}.`)) delKeys.push(k);
    }
  }
  // result 键过期清理（>10 分钟无人认领即删，防键堆积）
  const now = Date.now();
  for (const k of keys) {
    if (!k.startsWith(K.resultPrefix)) continue;
    const v = await kv.kvGet(k).catch(() => null);
    if (v && typeof v.at === 'number' && now - v.at > RESULT_TTL_MS) delKeys.push(k);
    else if (!v) delKeys.push(k); // 幽灵键
  }
  for (const k of delKeys) await kv.kvDel(k).catch(() => {});
  if (delKeys.length) log('debug', `清理 ${delKeys.length} 个旧键`);
}

// ── 心跳 ────────────────────────────────────────────────────────────────────
async function beat(degraded, lastBridgeErr) {
  const meta = {
    version: VERSION,
    pid: process.pid,
    startedAt: state.startedAt,
    lastTickAt: Date.now(),
    bridge: degraded ? 'degraded' : 'ok',
    degraded: !!degraded,
    lastBridgeErr: lastBridgeErr || null,
    scanning: state.scanning ? { id: state.scanning.scanId, root: state.scanning.root, nonce: state.scanning.nonce } : null,
    rules: core.RULES.length,
    prevScanId: state.prevScanId,
  };
  await kv.kvSet(K.meta, meta).catch(() => {});
}

// ── tick 主循环 ─────────────────────────────────────────────────────────────
let lastBeatAt = 0;
let degraded = false;
let lastBridgeErr = null;

async function tick() {
  // 1. 消费扫描命令键（先删后做——幂等核心）
  let keys = [];
  try {
    keys = await kv.kvKeys();
    degraded = false;
    lastBridgeErr = null;
  } catch (e) {
    degraded = true;
    lastBridgeErr = String((e && e.message) || e);
    log('warn', `桥不可达（降级运行）：${lastBridgeErr}`);
  }

  if (!degraded) {
    const cmds = keys.filter((k) => k.startsWith(K.cmdPrefix)).sort(); // 先到先扫
    for (const cmdKey of cmds) {
      if (state.scanning) break; // 单扫描位：有活时留着命令键，扫完再消费
      // 互斥序：读载荷 → kvDel 成功者才执行（delete 是唯一执行凭证，后删者拿 false）。
      // 两消费者同时读到同一载荷也无妨——至多一个能删成功，至多执行一次。
      const payload = await kv.kvGet(cmdKey).catch(() => null);
      const del = await kv.kvDel(cmdKey).catch(() => null);
      if (!del) continue;
      const nonce = cmdKey.slice(K.cmdPrefix.length);
      const root = (payload && typeof payload.root === 'string') ? payload.root : '';
      const scanId = genId();
      state.scanning = { scanId, root, startedAt: Date.now(), nonce };
      await beat(degraded, lastBridgeErr); // 立即广播 scanning 状态（面板按 nonce 对号，不等 60s 节拍）
      log('info', `接受扫描命令 nonce=${nonce} root=${root} scanId=${scanId}`);
      runScan(scanId, nonce, root).catch((e) => log('error', `runScan 异常: ${e && e.message}`));
      break; // 一 tick 只启动一个
    }
  }

  // 2. 心跳
  if (Date.now() - lastBeatAt > META_BEAT_MS) {
    lastBeatAt = Date.now();
    await beat(degraded, lastBridgeErr);
  }
}

// ── 健康端点（恒 200，真实健康度写 meta）────────────────────────────────────
const PORT = Number(process.argv[2]) || 0;
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/__health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, version: VERSION,
      scanning: !!state.scanning,
      degraded,
    }));
    return;
  }
  res.writeHead(404); res.end();
});

state.startedAt = Date.now();
initLog(APP_CONFIG_DIR);
log('info', `keyscan 服务启动 v${VERSION} pid=${process.pid} port=${PORT}`);

server.listen(PORT, '127.0.0.1', () => {
  log('info', `健康端点就绪 127.0.0.1:${PORT}/__health`);
});
server.on('error', (e) => {
  log('error', `健康端点监听失败: ${e && e.message}`); // 端口被占等——进程退出由宿主按 restartOnFailure 处理
  process.exit(1);
});

// 启动：重建基线 → 进 tick 循环
(async () => {
  try { await rebuildPrevFps(); } catch (e) { log('warn', `基线重建失败: ${e && e.message}`); }
  const loop = async () => {
    try { await tick(); } catch (e) { log('error', `tick 异常: ${e && (e.stack || e.message)}`); }
  };
  await loop();
  setInterval(loop, TICK_MS);
})();
