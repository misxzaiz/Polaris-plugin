#!/usr/bin/env node
'use strict';
/**
 * main.js —— 图片工坊（imgforge）后台服务（node >= 18）
 *
 * 职责：
 *   - 面板的图片变换引擎入口：面板把「目录/文件清单 + 管道参数」POST 到
 *     http://127.0.0.1:<port>/api/process，本服务以异步任务执行（进度可轮询），
 *     输出落盘（永不覆盖），全程只绑回环 + token 鉴权。
 *   - /api/scan 目录扫描（魔数+尺寸+GPS 概览）；/api/job 任务进度；/api/probe 目录探测。
 *   - MCP 共用引擎（service/engine.js）与任务历史（cap.kv imgforge.history.*）、
 *     设置热读（imgforge.settings 仅面板写）、命令键消费（imgforge.cmd 先删后做）。
 *   - 安全底线：零外网请求；输入永不修改/删除；输出永不覆盖（-2/-3 递增）。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}（宿主注入占位符）
 * 健康检查：GET /__health 恒 200（宿主周期探测，连续失败判死重启）。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const core = require('../shared/core.js');
const engine = require('./engine.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'imgforge';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;
const JOB_RING = 20; // 内存任务环：只留最近 20 个任务的完整结果

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

// ── 日志（宿主不收集 stdout/stderr，自落盘 + 512KB 轮转）───────────────────
const logFile = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, PLUGIN_ID + '.log') : '';
function log(level, msg) {
  const line = `[${PLUGIN_ID}:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug') return; // debug 不落盘
  process.stderr.write(line + '\n');
  if (!logFile) return;
  try {
    try {
      const st = fs.statSync(logFile);
      if (st.size > LOG_MAX) fs.renameSync(logFile, logFile + '.old');
    } catch (_) { /* 首次无文件 */ }
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) { /* 日志失败不影响业务 */ }
}

// ── 桥（降级不致命：核心变换不依赖 kv）──────────────────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
let bridgeDegraded = true;

const PREFIX = PLUGIN_ID + '.';
const KEY_SETTINGS = PREFIX + 'settings';
const KEY_META = PREFIX + 'meta';
const KEY_CMD = PREFIX + 'cmd';
const KEY_HISTORY = PREFIX + 'history.';

let settingsCache = core.normalizeSettings(null);
let settingsReadAt = 0;

async function readSettings(force) {
  if (!force && Date.now() - settingsReadAt < 5000) return settingsCache;
  try {
    const raw = await kv.kvGet(KEY_SETTINGS);
    settingsCache = core.normalizeSettings(raw);
    settingsReadAt = Date.now();
  } catch (e) {
    if (!bridgeDegraded) log('warn', 'settings 读取失败（用默认值/缓存）: ' + e.message);
  }
  return settingsCache;
}

/** 桌面目录候选链（OneDrive 重定向兼容），返回存在的第一个，否则 home */
function desktopCandidates() {
  const home = os.homedir();
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive', '桌面'),
    path.join(home, '桌面'),
    home,
  ];
}

/** 输出目录解析：任务参数 outDir > 设置 outDir > <输入目录>/imgforge-out（自动创建）> 桌面 */
function resolveOutDir(explicit, inputDir) {
  const candidates = [];
  let creatableDerived = '';
  if (explicit) candidates.push(explicit);
  if (settingsCache.outDir) candidates.push(settingsCache.outDir);
  if (inputDir) {
    creatableDerived = path.join(inputDir, 'imgforge-out');
    candidates.push(creatableDerived); // 派生目录允许自动创建（其余候选必须已存在）
  }
  for (const c of desktopCandidates()) candidates.push(c);
  for (const c of candidates) {
    try {
      if (c === creatableDerived && creatableDerived) {
        fs.mkdirSync(c, { recursive: true });
        return c;
      }
      if (c && path.isAbsolute(c) && fs.statSync(c).isDirectory()) return c;
    } catch (_) { /* 候选不可用，下一个 */ }
  }
  return null;
}

// ── 历史（环形 cap）与命令键 ────────────────────────────────────────────────

async function appendHistory(entry) {
  try {
    const id = KEY_HISTORY + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    await kv.kvSet(id, entry);
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith(KEY_HISTORY)).sort();
    const over = keys.length - settingsCache.historyCap;
    for (let i = 0; i < over; i++) await kv.kvDel(keys[i]).catch(() => { });
  } catch (e) {
    log('warn', '历史登记失败（不影响输出）: ' + e.message);
  }
}

async function consumeCmd() {
  try {
    const cmd = await kv.kvGet(KEY_CMD);
    if (!cmd || typeof cmd !== 'object') return;
    await kv.kvDel(KEY_CMD); // 先删后做（单写者纪律）
    if (cmd.action === 'clearHistory') {
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith(KEY_HISTORY));
      for (const k of keys) await kv.kvDel(k).catch(() => { });
      log('info', '已清空任务历史 ' + keys.length + ' 条');
    }
  } catch (_) { /* 降级容忍 */ }
}

async function heartbeat() {
  try {
    const meta = await kv.kvGet(KEY_META);
    bridgeDegraded = false; // kvGet 成功本身就是桥可达的证明（首次心跳即报 ok）
    const token = (meta && typeof meta.token === 'string' && meta.token) || crypto.randomBytes(16).toString('hex');
    tokenCache = token; // 首次启动时即时生效，无需等待重启
    await kv.kvSet(KEY_META, {
      token,
      port: PORT,
      version: VERSION,
      pid: process.pid,
      startedAt: meta && meta.startedAt ? meta.startedAt : new Date().toISOString(),
      lastTickAt: new Date().toISOString(),
      bridge: bridgeDegraded ? 'degraded' : 'ok',
    });
    bridgeDegraded = false;
  } catch (e) {
    bridgeDegraded = true;
    log('warn', 'bridge 心跳失败（健康端点仍 200）: ' + e.message);
  }
}

// ── 任务管理（异步执行 + 进度轮询；内存环 20 个）────────────────────────────

const jobs = new Map();

function jobSnapshot(id) {
  const j = jobs.get(id);
  if (!j) return null;
  return {
    id: j.id,
    state: j.state,
    done: j.done,
    total: j.total,
    pipelineLabel: j.pipelineLabel,
    outDir: j.outDir,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    error: j.error,
    summary: j.summary,
    // 完整结果只在最近 JOB_RING 个任务里保留；轮询方拿到的是快照
    results: j.results,
  };
}

function pruneJobs() {
  const ids = [...jobs.keys()].sort((a, b) => jobs.get(a).seq - jobs.get(b).seq);
  while (ids.length > JOB_RING) {
    const old = ids.shift();
    jobs.delete(old);
  }
}

async function startJob(body) {
  const settings = await readSettings(true);
  const pipeline = core.normalizePipeline(body && body.pipeline);
  const explicitOut = typeof (body && body.outDir) === 'string' && body.outDir.trim() ? body.outDir.trim() : '';

  // 输入清单：显式 paths 优先，否则扫目录
  let inputDir = '';
  let items = [];
  const paths = Array.isArray(body && body.paths) ? body.paths : [];
  if (paths.length) {
    // 显式路径逐个校验：无效的跳过并记录（不因个别路径拖死整批），全无效才报错
    const skipped = [];
    for (const p of paths.slice(0, settings.maxBatch)) {
      try {
        const abs = core.guardAbsolute(p, '图片');
        const st = fs.statSync(abs);
        if (!st.isFile()) throw new Error('不是文件');
        const ext = path.extname(abs).toLowerCase();
        if (core.SUPPORTED_SCAN_EXTS.indexOf(ext) < 0) throw new Error('不支持的图片扩展名 ' + ext);
        items.push({ path: abs, name: path.basename(abs), ext, size: st.size });
      } catch (e) {
        skipped.push(p + '（' + String((e && e.message) || e) + '）');
      }
    }
    if (!items.length) throw new Error('全部输入路径无效，第一条原因：' + (skipped[0] || '未知'));
    if (skipped.length) log('info', '跳过 ' + skipped.length + ' 条无效输入: ' + skipped.slice(0, 5).join(' | '));
  } else {
    inputDir = core.guardAbsolute(body && body.dir, '目录');
    let st;
    try { st = fs.statSync(inputDir); } catch (_) { throw new Error('目录不存在：' + inputDir); }
    if (!st.isDirectory()) throw new Error('不是目录：' + inputDir);
    const { files, skippedNonImage } = engine.listImageFiles(inputDir, { recursive: !!body.recursive, maxScan: settings.maxBatch });
    items = files;
    if (skippedNonImage.length) log('info', '扫描跳过非图片 ' + skippedNonImage.length + ' 个: ' + skippedNonImage.slice(0, 3).join(' | '));
  }
  if (!items.length) throw new Error('没有找到可处理的图片（支持 ' + core.SUPPORTED_SCAN_EXTS.join(' ') + '）');
  if (items.length > settings.maxBatch) {
    throw new Error('本次 ' + items.length + ' 张超过单批上限 ' + settings.maxBatch + '（可在面板设置调大 maxBatch）');
  }
  const outDir = resolveOutDir(explicitOut ? core.guardAbsolute(explicitOut, '输出目录') : '', inputDir || (items[0] ? path.dirname(items[0].path) : ''));
  if (!outDir) throw new Error('找不到可用的输出目录：请在面板设置里填写输出目录，或确认输入目录可写');

  const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const job = {
    id,
    seq: Date.now(),
    state: 'running',
    done: 0,
    total: items.length,
    pipelineLabel: core.pipelineLabel(pipeline),
    outDir,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    summary: null,
    results: null,
  };
  jobs.set(id, job);
  pruneJobs();

  // 异步执行（不 await）：调用方立即拿 jobId 轮询进度
  (async () => {
    const t0 = Date.now();
    try {
      const { results, summary } = await engine.runPipeline(items, pipeline, {
        outDir: job.outDir,
        concurrency: settings.concurrency,
        maxFileMB: settings.maxFileMB,
        onProgress: (p) => { job.done = p.done; },
      });
      summary.ms = Date.now() - t0;
      job.results = results;
      job.summary = summary;
      job.done = summary.total;
      job.state = 'done';
      job.finishedAt = new Date().toISOString();
      await appendHistory({
        id,
        at: job.finishedAt,
        source: 'panel',
        pipeline: job.pipelineLabel,
        total: summary.total,
        ok: summary.ok,
        fail: summary.fail,
        inBytes: summary.inBytes,
        outBytes: summary.outBytes,
        savedBytes: summary.savedBytes,
        outDir: job.outDir,
        ms: summary.ms,
        results: results.slice(0, 50),
        okState: true,
      });
      log('info', `job ${id} 完成: ${summary.ok}/${summary.total} ok, 省 ${core.formatBytes(Math.max(0, summary.savedBytes))}, ${summary.ms}ms`);
    } catch (e) {
      job.state = 'error';
      job.error = String((e && e.message) || e);
      job.finishedAt = new Date().toISOString();
      await appendHistory({
        id,
        at: job.finishedAt,
        source: 'panel',
        pipeline: job.pipelineLabel,
        total: job.total,
        ok: 0,
        fail: job.total,
        inBytes: 0,
        outBytes: 0,
        savedBytes: 0,
        outDir: job.outDir,
        ms: Date.now() - t0,
        results: [],
        okState: false,
        error: job.error,
      });
      log('warn', `job ${id} 失败: ${job.error}`);
    }
  })();

  return { id, total: job.total, pipelineLabel: job.pipelineLabel, outDir: job.outDir };
}

// ── HTTP 层 ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Imgforge-Token',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEADERS));
  res.end(body);
}

let tokenCache = '';

function authed(req) {
  if (!tokenCache) return false;
  return String(req.headers['x-imgforge-token'] || '') === tokenCache;
}

async function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > maxBytes) {
      reject(new Error('请求体 ' + core.formatBytes(len) + ' 超过上限 ' + core.formatBytes(maxBytes)));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('请求体超过上限 ' + core.formatBytes(maxBytes)));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function ok2(res, obj) { sendJson(res, 200, Object.assign({ ok: true }, obj)); }
function fail(res, code, msg) { sendJson(res, code, { ok: false, error: String(msg) }); }

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === 'GET' && url === '/__health') {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION, degraded: bridgeDegraded });
    return;
  }
  // 任务进度查询（GET，token 鉴权）
  if (req.method === 'GET' && url.startsWith('/api/job')) {
    if (!authed(req)) { fail(res, 401, '缺少或错误的 token（面板应从 cap.kv imgforge.meta 读取）'); return; }
    const q = new URL('http://x' + (req.url || '')).searchParams;
    const snap = jobSnapshot(String(q.get('id') || ''));
    if (!snap) { fail(res, 404, '任务不存在或已被清理（只保留最近 ' + JOB_RING + ' 个任务）'); return; }
    ok2(res, { job: snap });
    return;
  }
  if (req.method === 'POST' && (url === '/api/scan' || url === '/api/process' || url === '/api/probe' || url === '/api/ping')) {
    if (!authed(req)) {
      fail(res, 401, '缺少或错误的 token（面板应从 cap.kv imgforge.meta 读取）');
      return;
    }
    readBody(req, 2 * 1024 * 1024).then(async (raw) => {
      let body = {};
      try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch (_) {
        fail(res, 400, '请求体不是合法 JSON');
        return;
      }
      try {
        if (url === '/api/ping') {
          await readSettings(true);
          ok2(res, {
            version: VERSION,
            outDir: settingsCache.outDir || '',
            desktop: desktopCandidates().filter((c) => { try { return fs.statSync(c).isDirectory(); } catch (_) { return false; } }),
            home: os.homedir(),
            degraded: bridgeDegraded,
          });
        } else if (url === '/api/probe') {
          const p = typeof body.path === 'string' ? body.path.trim() : '';
          const result = {
            desktop: desktopCandidates().filter((c) => { try { return fs.statSync(c).isDirectory(); } catch (_) { return false; } }),
            home: os.homedir(),
          };
          if (p) {
            try {
              const st = fs.statSync(p);
              result.checked = { path: p, exists: true, isDir: st.isDirectory() };
            } catch (_) {
              result.checked = { path: p, exists: false, isDir: false };
            }
          }
          ok2(res, result);
        } else if (url === '/api/scan') {
          const settings = await readSettings(true);
          const dir = core.guardAbsolute(body.dir, '目录');
          let st;
          try { st = fs.statSync(dir); } catch (_) { throw new Error('目录不存在：' + dir); }
          if (!st.isDirectory()) throw new Error('不是目录：' + dir);
          const r = await engine.scanDir(dir, {
            recursive: !!body.recursive,
            maxScan: Math.min(Number(body.maxScan) || settings.maxBatch * 4, 5000),
            probeLimit: Math.min(Number(body.probeLimit) || 500, 2000),
          });
          ok2(res, r);
        } else if (url === '/api/process') {
          const started = await startJob(body);
          ok2(res, started);
        }
      } catch (e) {
        log('warn', url + ' 失败: ' + (e && e.message));
        fail(res, 200, (e && e.message) || String(e)); // 业务错误统一 200 + ok:false（面板易读）
      }
    }).catch((e) => fail(res, 413, (e && e.message) || String(e)));
    return;
  }
  fail(res, 404, 'not found');
});

// token 需要先从桥读一次（服务重启不换 token；首次生成）
(async () => {
  try {
    const meta = await kv.kvGet(KEY_META);
    tokenCache = (meta && typeof meta.token === 'string' && meta.token) || '';
  } catch (_) { tokenCache = ''; }
  await readSettings(true);
  await heartbeat();
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `imgforge service listening on 127.0.0.1:${PORT} (v${VERSION})`);
  });
})();

const TICK_MS = 30000;
setInterval(() => {
  consumeCmd();
  heartbeat();
  readSettings(true);
}, TICK_MS).unref();

process.on('uncaughtException', (e) => log('error', 'uncaughtException: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection: ' + (e && e.stack || e)));
