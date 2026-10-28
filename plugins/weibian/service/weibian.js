#!/usr/bin/env node
'use strict';
/**
 * weibian.js —— 韦编后台服务（node >= 18，零外部依赖；PDF 走 vendor/pdfjs）
 *
 * 职责（weibian.* 键空间里 stats/meta 的单写权威；settings 仅面板写）：
 *   - 本地文档全文索引：settings.roots 白名单目录 → 指纹对账（mtime+size）→
 *     预算化提取（25 文件/轮 × 600ms，不卡盘）→ 内存倒排 + 每文档一个 JSON
 *     （<appConfigDir>/weibian-index/docs/<docId>.json，docId=sha256(realpath) 前 12 位）。
 *   - 提取器见 extract.js（文本/GBK/PDF/docx/html）；文本 >128KB 只存词项不存正文
 *     （检索命中时按需重提取，50 条 LRU）。
 *   - HTTP API（127.0.0.1 + token，鉴权头 x-weibian-token）：
 *       POST /api/search {query,limit?}        BM25 + 片段高亮
 *       POST /api/read   {path,offset?,maxChars?}  只读原文（根目录 containment）
 *       POST /api/reindex {all?|root?}          清空重建（异步，进度走 /api/progress）
 *       GET  /api/progress                       扫描进度/错误
 *       GET  /__health                           恒 200（宿主 30s 周期）
 *   - 心跳：weibian.meta（token/port，60s）、weibian.stats（内容变化才写）。
 *
 * 安全底线：零外网请求；用户文件只读；read 严格限制在 settings.roots 内
 * （resolve + realpath 归一后 containsPath）；索引明文存本机数据根（与源文件同信任域）。
 *
 * 启动参数：node weibian.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const core = require('../shared/core.js');
const { sha256Hex } = require('../shared/sha256.js');
const extract = require('./extract.js');
const { createKvClient } = require('./kvclient.js');

const PLUGIN_ID = 'weibian';
const VERSION = '0.1.0';
const LOG_MAX = 512 * 1024;

const PORT = parseInt(process.argv[2] || '', 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const INDEX_DIR = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, 'weibian-index', 'docs') : path.join(os.tmpdir(), 'weibian-index', 'docs');

const SCAN_TICK_MS = 600;
const SCAN_BUDGET = 25;          // 每轮最多提取的文件数（pdf 慢，靠多轮消化）
const RESCAN_MS = 10 * 60 * 1000; // 周期增量重扫
const SETTINGS_REREAD_MS = 30 * 1000;
const META_BEAT_MS = 60 * 1000;
const STATS_MIN_INTERVAL_MS = 3 * 1000;
const TEXT_INLINE_LIMIT = 128 * 1024; // 正文 ≤128KB 随词项内嵌，超出按需重提取
const READ_LRU_MAX = 50;
const SNIPPET_W = 256;

// ── 日志（宿主不收集 stdout/stderr，自落盘 + 轮转）──────────────────────────
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

// ── 自发现桥（降级不致命：检索不依赖 kv）────────────────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
let bridgeDegraded = true;

const PREFIX = PLUGIN_ID + '.';
const KEY_SETTINGS = PREFIX + 'settings';
const KEY_META = PREFIX + 'meta';
const KEY_STATS = PREFIX + 'stats';

let settings = core.normalizeSettings(null);
let settingsReadAt = 0;
let tokenCache = '';

async function readSettings(force) {
  const now = Date.now();
  if (!force && now - settingsReadAt < SETTINGS_REREAD_MS) return settings;
  settingsReadAt = now;
  try {
    const r = await kv.kvGet(KEY_SETTINGS); // kvclient 已解包：r 就是 settings 值本体
    bridgeDegraded = false;
    const next = core.normalizeSettings(r);
    const rootsChanged = JSON.stringify(next.roots) !== JSON.stringify(settings.roots)
      || JSON.stringify(next.extraExcludes) !== JSON.stringify(settings.extraExcludes)
      || next.includeHidden !== settings.includeHidden
      || next.maxFileBytes !== settings.maxFileBytes
      || next.maxTextBytes !== settings.maxTextBytes
      || next.maxDocs !== settings.maxDocs;
    settings = next;
    if (rootsChanged) engine.scheduleFullScan('settings-changed');
  } catch (e) {
    if (!bridgeDegraded) { bridgeDegraded = true; log('warn', '桥不可达，降级运行：' + e.message); }
  }
  return settings;
}

async function ensureToken() {
  if (tokenCache) return tokenCache;
  try {
    const m = await kv.kvGet(KEY_META); // 已解包：m 就是 meta 值本体
    if (m && typeof m.token === 'string' && m.token) { tokenCache = m.token; bridgeDegraded = false; return tokenCache; }
  } catch (_) { /* 桥不可达 */ }
  tokenCache = crypto.randomBytes(16).toString('hex');
  await writeMeta();
  return tokenCache;
}

let lastMetaWrite = 0;
let realPort = PORT; // listen(0) 时由 address() 回填（meta.port 必须是真实端口）
async function writeMeta(force) {
  const now = Date.now();
  if (!force && now - lastMetaWrite < 5000) return;
  lastMetaWrite = now;
  try {
    await kv.kvSet(KEY_META, { v: 1, version: VERSION, port: realPort, token: tokenCache, pid: process.pid, at: now });
    bridgeDegraded = false;
  } catch (e) {
    bridgeDegraded = true;
  }
}

let lastStatsJson = '';
let lastStatsAt = 0;
async function writeStats(force) {
  const now = Date.now();
  if (!force && now - lastStatsAt < STATS_MIN_INTERVAL_MS) return;
  lastStatsAt = now;
  const snap = engine.statsSnapshot();
  const json = JSON.stringify(snap);
  if (!force && json === lastStatsJson) return;
  lastStatsJson = json;
  try {
    await kv.kvSet(KEY_STATS, snap);
    bridgeDegraded = false;
  } catch (e) {
    bridgeDegraded = true;
  }
}

// ── 索引引擎 ─────────────────────────────────────────────────────────────────
const engine = (() => {
  const docs = new Map();      // docId → {id,path,name,ext,cat,root,mtime,size,addedAt,len,textBytes,text?,tf,nameTf}
  const inverted = new Map();  // token → Map<docId, tf>
  const pathIndex = new Map(); // normLowerPath → docId（对账去重/改名识别）
  const readLru = new Map();   // docId → text（按需重提取缓存）

  const state = {
    scanning: false, pending: 0, doneThisRound: 0,
    lastScanAt: 0, lastScanMs: 0, capped: false,
    errors: [],           // [{path, reason, at}] ≤ 20
    bootAt: Date.now(),
  };
  let queue = [];          // 待提取 [{abs, rel, root, size, mtime}]
  let scanningPromise = null;

  const normKey = (p) => core.normSlashes(path.resolve(String(p))).toLowerCase();

  function postingsAdd(docId, tf) {
    for (const [t, n] of tf) {
      let m = inverted.get(t);
      if (!m) { m = new Map(); inverted.set(t, m); }
      m.set(docId, n);
    }
  }
  function postingsRemove(docId, tf) {
    for (const [t] of tf) {
      const m = inverted.get(t);
      if (!m) continue;
      m.delete(docId);
      if (m.size === 0) inverted.delete(t);
    }
  }

  function docFile(docId) { return path.join(INDEX_DIR, docId + '.json'); }

  function persistDoc(doc) {
    const obj = {
      v: 1, id: doc.id, path: doc.path, name: doc.name, ext: doc.ext, cat: doc.cat,
      root: doc.root, mtime: doc.mtime, size: doc.size, addedAt: doc.addedAt, len: doc.len,
      textBytes: doc.textBytes, text: doc.text || null,
      tokens: [...doc.tf], nameTokens: [...doc.nameTf],
    };
    fs.mkdirSync(INDEX_DIR, { recursive: true });
    fs.writeFileSync(docFile(doc.id), JSON.stringify(obj));
  }

  function removeDoc(docId, opts) {
    const doc = docs.get(docId);
    if (!doc) return;
    postingsRemove(docId, doc.tf);
    docs.delete(docId);
    pathIndex.delete(normKey(doc.path));
    readLru.delete(docId);
    if (!(opts && opts.keepFile)) {
      try { fs.unlinkSync(docFile(docId)); } catch (_) { /* 已不存在 */ }
    }
  }

  function loadFromDisk() {
    let ids = [];
    try {
      fs.mkdirSync(INDEX_DIR, { recursive: true });
      ids = fs.readdirSync(INDEX_DIR).filter((f) => f.endsWith('.json'));
    } catch (_) { return; }
    let n = 0;
    for (const f of ids) {
      try {
        const obj = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, f), 'utf8'));
        if (!obj || obj.v !== 1 || typeof obj.id !== 'string') continue;
        const doc = {
          id: obj.id, path: obj.path, name: obj.name, ext: obj.ext, cat: obj.cat,
          root: obj.root, mtime: obj.mtime || 0, size: obj.size || 0, addedAt: obj.addedAt || 0,
          len: obj.len || 0, textBytes: obj.textBytes || 0, text: obj.text || null,
          tf: new Map(obj.tokens || []), nameTf: new Map(obj.nameTokens || []),
        };
        if (docs.has(doc.id)) continue;
        docs.set(doc.id, doc);
        pathIndex.set(normKey(doc.path), doc.id);
        postingsAdd(doc.id, doc.tf);
        n++;
      } catch (_) { /* 单文档损坏跳过，下轮对账重建 */ }
    }
    log('info', `索引装载完成：${n}/${ids.length} 文档，词项 ${inverted.size}`);
  }

  /** 目录树收集候选（剪枝：排除段/隐藏段/大小/ext） */
  function walkRoot(root, out, seenDirs) {
    let st;
    try { st = fs.statSync(root); } catch (_) { state.errors.push({ path: root, reason: 'root-missing', at: Date.now() }); return; }
    if (!st.isDirectory()) { state.errors.push({ path: root, reason: 'root-not-dir', at: Date.now() }); return; }
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      const key = normKey(dir);
      if (seenDirs.has(key)) continue;
      seenDirs.add(key);
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const ent of entries) {
        const abs = path.join(dir, ent.name);
        const rel = path.relative(root, abs);
        if (ent.isDirectory()) {
          const probe = core.isIndexable(rel + '/x.txt', 0, settings);
          // 目录层只关心 hidden/exclude；ext/size 规则由文件层判定
          const badDir = probe.reason === 'hidden' || String(probe.reason).startsWith('exclude');
          if (!badDir) stack.push(abs);
          continue;
        }
        if (!ent.isFile()) continue;
        let st2;
        try { st2 = fs.statSync(abs); } catch (_) { continue; }
        const chk = core.isIndexable(rel, st2.size, settings);
        if (!chk.ok) continue;
        out.push({ abs, rel, root, size: st2.size, mtime0: Math.floor(st2.mtimeMs) });
        if (out.length >= settings.maxDocs) return; // 上限护栏
      }
    }
  }

  async function extractOne(job) {
    const t0 = Date.now();
    let buf;
    try { buf = fs.readFileSync(job.abs); } catch (e) {
      if (e && e.code === 'ENOENT') return { skip: true, reason: 'gone' }; // 扫描间隙被删，不算错误
      state.errors.push({ path: job.abs, reason: 'read:' + (e.code || e.message), at: Date.now() });
      return null;
    }
    let cat = core.classifyExt(core.extOf(job.rel));
    if (!cat) return null;
    let text = null, reason = '';
    if (cat === 'text' || cat === 'code') {
      const r = extract.decodeText(buf);
      text = r.text; reason = r.reason;
      if (cat === 'code') {
        // 代码文件：开头 256KB 足够索引（巨大的生成物价值低）
        if (text && text.length > 256 * 1024) text = text.slice(0, 256 * 1024);
      }
    } else if (cat === 'pdf') {
      const r = await extract.extractPdf(buf, settings.maxTextBytes);
      text = r.text; reason = r.reason;
    } else if (cat === 'docx') {
      const r = extract.extractDocx(buf, settings.maxTextBytes);
      text = r.text; reason = r.reason;
    } else if (cat === 'html') {
      const r = extract.extractHtml(buf.toString('utf8'), settings.maxTextBytes);
      text = r.text; reason = r.reason;
    }
    if (text == null) {
      if (reason && reason !== 'binary') state.errors.push({ path: job.abs, reason, at: Date.now() });
      return { skip: true, reason: reason || 'binary' };
    }
    text = String(text).replace(/\r\n?/g, '\n');
    if (!text.trim()) return { skip: true, reason: 'empty' };
    const st = fs.statSync(job.abs);
    const id = sha256Hex(normKey(job.abs)).slice(0, 12);
    const name = path.basename(job.abs);
    const tf = core.tokenize(text);
    const nameTf = core.tokenize(name);
    let len = 0; for (const [, n] of tf) len += n;
    const prev = docs.get(id);
    if (prev) postingsRemove(id, prev.tf);
    const doc = {
      id, path: job.abs, name, ext: core.extOf(name), cat, root: job.root,
      mtime: Math.floor(st.mtimeMs), size: st.size, addedAt: prev ? prev.addedAt : Date.now(),
      len, textBytes: text.length,
      text: text.length <= TEXT_INLINE_LIMIT ? text : null,
      tf, nameTf,
    };
    docs.set(id, doc);
    pathIndex.set(normKey(job.abs), id);
    postingsAdd(id, doc.tf);
    readLru.delete(id);
    try { persistDoc(doc); } catch (e) { log('warn', '索引落盘失败 ' + id + ': ' + e.message); }
    state.doneThisRound++;
    log('debug', `提取 ${path.basename(job.abs)} ${Date.now() - t0}ms ${len} tok`);
    return { ok: true };
  }

  /** 全量对账：列出候选 → 指纹 diff 出待提取/待删除 → 入队 */
  function scheduleFullScan(why) {
    const t0 = Date.now();
    const candidates = [];
    const seenDirs = new Set();
    for (const root of settings.roots) walkRoot(root, candidates, seenDirs);
    // 现存文档指纹表（按 path）
    const wanted = new Map(); // normPath → job
    for (const c of candidates) wanted.set(normKey(c.abs), c);
    // 删除：现存但不在候选（被排除/被删/超出上限的不算——上限内候选以 wanted 为准）
    for (const [id, doc] of [...docs]) {
      if (!wanted.has(normKey(doc.path))) removeDoc(id);
    }
    // 入队：新增或指纹变化（mtime+size）
    queue = [];
    for (const [k, c] of wanted) {
      const existId = pathIndex.get(k);
      const doc = existId ? docs.get(existId) : null;
      if (doc && doc.mtime === c.mtime0 && doc.size === c.size) continue;
      queue.push(c);
    }
    state.pending = queue.length;
    state.capped = candidates.length >= settings.maxDocs;
    state.scanning = true;
    state.lastScanAt = Date.now();
    log('info', `对账(${why})：候选 ${candidates.length}，待提取 ${queue.length}，上限${state.capped ? '已触顶' : '未触'}`);
    return queue;
  }

  function ensureScanLoop() {
    if (scanningPromise) return scanningPromise;
    scanningPromise = (async () => {
      try {
        while (queue.length) {
          const batch = queue.splice(0, SCAN_BUDGET);
          state.pending = queue.length;
          for (const job of batch) {
            try { await extractOne(job); } catch (e) { log('warn', '提取异常 ' + job.abs + ': ' + e.message); }
          }
          writeStats();
          await new Promise((r) => setTimeout(r, SCAN_TICK_MS));
        }
      } finally {
        scanningPromise = null; // 允许下一轮扫描重新进入（reindex/周期重扫依赖）
        state.scanning = false;
        state.pending = 0;
        state.lastScanMs = Date.now() - state.lastScanAt;
        state.lastScanAt = Date.now();
        if (state.errors.length > 20) state.errors = state.errors.slice(-20);
        writeStats(true);
        log('info', `扫描完成：${state.doneThisRound} 文档提取，${state.lastScanMs}ms`);
        state.doneThisRound = 0;
      }
    })();
    return scanningPromise;
  }

  async function reindex(all) {
    if (all) {
      for (const id of [...docs.keys()]) removeDoc(id);
      try { fs.rmSync(INDEX_DIR, { recursive: true, force: true }); } catch (_) { }
      try { fs.mkdirSync(INDEX_DIR, { recursive: true }); } catch (_) { }
      inverted.clear();
      readLru.clear();
    }
    await readSettings(true);
    scheduleFullScan(all ? 'reindex-all' : 'reindex');
    ensureScanLoop();
    return { ok: true };
  }

  function statsSnapshot() {
    let bytes = 0;
    const byExt = {};
    for (const d of docs.values()) {
      bytes += d.size;
      byExt[d.ext || '?'] = (byExt[d.ext || '?'] || 0) + 1;
    }
    return {
      v: 1, docs: docs.size, tokens: inverted.size, bytes,
      roots: settings.roots.length, maxDocs: settings.maxDocs,
      scanning: state.scanning, pending: state.pending,
      lastScanAt: state.lastScanAt, lastScanMs: state.lastScanMs,
      capped: state.capped, errors: state.errors.slice(-5),
      byExt, bootAt: state.bootAt, degraded: bridgeDegraded,
    };
  }

  async function textOf(doc) {
    if (doc.text != null) return doc.text;
    if (readLru.has(doc.id)) return readLru.get(doc.id);
    let text = null;
    try {
      const buf = fs.readFileSync(doc.path);
      if (doc.cat === 'pdf') text = (await extract.extractPdf(buf, settings.maxTextBytes)).text;
      else if (doc.cat === 'docx') text = extract.extractDocx(buf, settings.maxTextBytes).text;
      else if (doc.cat === 'html') text = extract.extractHtml(buf.toString('utf8'), settings.maxTextBytes).text;
      else text = extract.decodeText(buf).text;
    } catch (_) { text = null; }
    if (text == null) return '';
    readLru.set(doc.id, text);
    if (readLru.size > READ_LRU_MAX) readLru.delete(readLru.keys().next().value);
    return text;
  }

  async function search(payload) {
    const q = payload && typeof payload.query === 'string' ? payload.query : '';
    const limit = Math.min(Math.max(parseInt(payload && payload.limit, 10) || 8, 1), 50);
    const parsed = core.parseQuery(q);
    const memDocs = new Map();
    for (const [id, d] of docs) {
      memDocs.set(id, { len: d.len, nameTf: d.nameTf, pathLower: core.normSlashes(d.path).toLowerCase(), ext: d.ext, cat: d.cat });
    }
    const hits = core.rank(q, inverted, memDocs, { limit });
    const results = [];
    for (const h of hits) {
      const d = docs.get(h.docId);
      if (!d) continue;
      const text = await textOf(d);
      const snip = text ? core.snippet(text, parsed.raw, SNIPPET_W) : { text: '', hits: [] };
      results.push({
        id: d.id, path: d.path, name: d.name, ext: d.ext, cat: d.cat,
        score: Math.round(h.score * 100) / 100, size: d.size, mtime: d.mtime,
        snippet: snip,
      });
    }
    return { query: q, total: hits.length, took: 0, results };
  }

  function resolveSafe(targetPath) {
    const raw = String(targetPath || '');
    if (!raw) return { err: '缺少 path' };
    if (raw.includes('\0')) return { err: '非法路径' };
    let resolved;
    try { resolved = path.resolve(raw); } catch (_) { return { err: '非法路径' }; }
    const roots = settings.roots || [];
    if (!roots.length) return { err: '未配置索引目录' };
    let ok = false;
    for (const root of roots) {
      let rootReal = root;
      try { rootReal = fs.realpathSync(root); } catch (_) { /* 根不存在时用归一路径 */ }
      if (core.containsPath(rootReal, resolved)) { ok = true; break; }
    }
    if (!ok) return { err: '路径不在索引目录内（只读服务拒绝越界）' };
    let real = resolved;
    try { real = fs.realpathSync(resolved); } catch (e) { return { err: '文件不可读：' + (e.code || e.message) }; }
    // realpath 后复核（防符号链接逃逸）
    let ok2 = false;
    for (const root of roots) {
      let rootReal = root;
      try { rootReal = fs.realpathSync(root); } catch (_) { }
      if (core.containsPath(rootReal, real)) { ok2 = true; break; }
    }
    if (!ok2) return { err: '路径不在索引目录内（只读服务拒绝越界）' };
    return { real };
  }

  /** probe：建议常用目录（桌面/文档/下载/主目录）并校验任意输入是否存在 */
  function probe(payload) {
    const home = os.homedir();
    const cands = [
      ['桌面', path.join(home, 'Desktop')],
      ['文档', path.join(home, 'Documents')],
      ['下载', path.join(home, 'Downloads')],
      ['主目录', home],
    ];
    const suggestions = [];
    for (const [label, p] of cands) {
      try {
        if (fs.statSync(p).isDirectory()) suggestions.push({ label, path: p });
      } catch (_) { /* 不存在跳过 */ }
    }
    let checked = null;
    const q = payload && typeof payload.path === 'string' ? payload.path.trim() : '';
    if (q) {
      try {
        const st = fs.statSync(path.resolve(q));
        checked = { path: path.resolve(q), exists: true, isDir: st.isDirectory() };
      } catch (_) {
        checked = { path: q, exists: false, isDir: false };
      }
    }
    return { suggestions, home, checked };
  }

  async function read(payload) {
    const chk = resolveSafe(payload && payload.path);
    if (chk.err) return { err: chk.err };
    const offset = Math.max(0, parseInt(payload.offset, 10) || 0);
    const maxChars = Math.min(Math.max(parseInt(payload.maxChars, 10) || 6000, 200), 50000);
    let st;
    try { st = fs.statSync(chk.real); } catch (e) { return { err: '文件不可读：' + (e.code || e.message) }; }
    if (!st.isFile()) return { err: '不是常规文件' };
    if (st.size > settings.maxFileBytes) return { err: '文件超出索引大小上限（' + core.fmtBytes(settings.maxFileBytes) + '）' };
    let buf;
    try { buf = fs.readFileSync(chk.real); } catch (e) { return { err: '文件不可读：' + (e.code || e.message) }; }
    const ext = core.extOf(chk.real);
    const cat = core.classifyExt(ext);
    let text = null, reason = '';
    if (cat === 'pdf') { const r = await extract.extractPdf(buf, settings.maxTextBytes); text = r.text; reason = r.reason; }
    else if (cat === 'docx') { const r = extract.extractDocx(buf, settings.maxTextBytes); text = r.text; reason = r.reason; }
    else if (cat === 'html') { const r = extract.extractHtml(buf.toString('utf8'), settings.maxTextBytes); text = r.text; reason = r.reason; }
    else if (cat) { const r = extract.decodeText(buf); text = r.text; reason = r.reason; }
    else { const r = extract.decodeText(buf); text = r.text; reason = r.reason; }
    if (text == null) return { err: '无法以文本读取该文件（' + (reason || 'binary') + '）' };
    const total = text.length;
    const slice = text.slice(offset, offset + maxChars);
    return { path: chk.real, total, offset, text: slice, truncated: offset + maxChars < total, totalBytes: st.size };
  }

  return { loadFromDisk, scheduleFullScan, ensureScanLoop, reindex, statsSnapshot, search, read, probe, get docs() { return docs; } };
})();

// ── HTTP ─────────────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-weibian-token',
    'Access-Control-Max-Age': '86400',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (_) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function authed(req) {
  if (!tokenCache) return false;
  return String(req.headers['x-weibian-token'] || '') === tokenCache;
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }
  if (req.method === 'GET' && url === '/__health') {
    sendJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: VERSION, degraded: bridgeDegraded, scanning: engine.statsSnapshot().scanning });
    return;
  }
  if (!authed(req)) {
    sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板/MCP 应从 cap.kv weibian.meta 读取）' });
    return;
  }
  try {
    if (req.method === 'POST' && url === '/api/search') {
      const body = await readBody(req);
      if (!body) { sendJson(res, 400, { ok: false, error: 'JSON 解析失败' }); return; }
      const t0 = Date.now();
      const r = await engine.search(body);
      r.took = Date.now() - t0;
      sendJson(res, 200, { ok: true, ...r });
      return;
    }
    if (req.method === 'POST' && url === '/api/read') {
      const body = await readBody(req);
      if (!body) { sendJson(res, 400, { ok: false, error: 'JSON 解析失败' }); return; }
      const r = await engine.read(body);
      if (r.err) sendJson(res, 403, { ok: false, error: r.err });
      else sendJson(res, 200, { ok: true, ...r });
      return;
    }
    if (req.method === 'POST' && url === '/api/reindex') {
      const body = (await readBody(req)) || {};
      const r = await engine.reindex(body.all === true);
      sendJson(res, 200, { ok: true, ...r });
      return;
    }
    if (req.method === 'GET' && url === '/api/progress') {
      sendJson(res, 200, { ok: true, ...engine.statsSnapshot() });
      return;
    }
    if (req.method === 'POST' && url === '/api/probe') {
      const body = (await readBody(req)) || {};
      sendJson(res, 200, { ok: true, ...engine.probe(body) });
      return;
    }
    sendJson(res, 404, { ok: false, error: '未知端点' });
  } catch (e) {
    log('error', 'API 异常 ' + url + ': ' + (e && e.stack || e));
    sendJson(res, 500, { ok: false, error: '服务内部错误：' + String((e && e.message) || e) });
  }
});

async function main() {
  await ensureToken();
  await readSettings(true);
  engine.loadFromDisk();
  if (settings.roots.length && settings.enabled) {
    engine.scheduleFullScan('boot');
    engine.ensureScanLoop();
  }
  await writeMeta();
  await writeStats(true);
  setInterval(() => { writeMeta(); }, META_BEAT_MS);
  setInterval(async () => {
    await readSettings();
    if (settings.enabled && settings.roots.length && !engine.statsSnapshot().scanning) {
      engine.scheduleFullScan('periodic');
      engine.ensureScanLoop();
    }
    writeStats();
  }, RESCAN_MS);
  server.listen(PORT, '0.0.0.0', () => {
    const addr = server.address();
    if (addr && typeof addr === 'object' && addr.port) realPort = addr.port;
    log('info', `weibian 服务就绪：0.0.0.0:${realPort}（业务端点 token 鉴权） 索引目录 ${INDEX_DIR}`);
    writeMeta(true); // 端口回填必须落盘（ensureToken 可能在 listen 前写过 port=0 的 meta）
  });
}

process.on('unhandledRejection', (e) => log('error', 'unhandledRejection: ' + (e && e.stack || e)));
process.on('uncaughtException', (e) => log('error', 'uncaughtException: ' + (e && e.stack || e)));

main().catch((e) => {
  log('error', '启动失败: ' + (e && e.stack || e));
  process.exit(1);
});
