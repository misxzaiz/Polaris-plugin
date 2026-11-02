'use strict';
/**
 * main.js —— 堆栈还原台后台服务（node ≥18，零外部依赖；数据不出本机）
 *
 * 职责：把「minified 错误栈 + sourcemap 来源」变成「可读源码位置 + 代码帧」。
 *   收集 map 来源（目录扫描 / 指定文件 / URL 抓取 / 面板内联粘贴）→ core.resolveStack
 *   → 逐帧还原（带原因的三态）→ 大 map 解析结果内存缓存（mtime 失效）。
 *
 * 架构（bundle-lens / repo-lens / stream-desk 共享范式）：
 *   面板 ──(127.0.0.1 直连 + Bearer token)──▶ 本服务
 *   MCP  ──(kv 读 stacklens.meta 拿 port/token → 127.0.0.1 直连)──▶ 本服务
 *   本服务 ──(kvclient → 宿主 /api/router-dispatch → cap.kv)──▶ 宿主
 *
 * kv 键空间（全部 stacklens. 前缀，勿与他插件撞；不使用 kv list——宿主 kv list
 * 已实测会楔死 dispatch 通道，本服务绝不调用）：
 *   stacklens.meta     {port,token,pid,version,startedAt,live} 心跳 60s
 *   stacklens.settings {recentDirs[]} —— 只存目录路径；错误栈/map 内容/源码帧
 *                      一律不落盘（栈常含内网 URL、用户 ID 等敏感信息）
 *
 * 安全模型：
 *   - 仅监听 127.0.0.1；除 /__health 外全部要求 Authorization: Bearer <token>（timingSafe 比对）
 *   - 不带 CORS 头（同源宿主代理/面板直连，不放行任意 origin）
 *   - fs 只读（map/源文件读取），零写入
 *   - 唯一出站网络 = fetchMap：用户显式给出 map URL 的 GET，http/https only，
 *     60MB/15s 上限，不带凭证不跟随自定义协议；localhost 合法（自家 dev server 的 map）
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { createKvClient } = require('./kvclient');
const core = require('../shared/core');

const VERSION = core.VERSION;
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const appConfigDir = process.argv[3] || '';
const STARTED_AT = Date.now();
const META_BEAT_MS = 60_000;
const BODY_LIMIT = 24 * 1024 * 1024;   // 内联粘贴 map 的现实上限
const MAP_CACHE_MAX = 24;              // 解析结果缓存上限（LRU 简版）
const SOURCE_READ_CAP = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_BYTES = core.LIMITS.maxMapBytes;

function log(level, msg) {
  try { process.stderr.write(`[stack-lens-svc][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

const kv = createKvClient({ appConfigDir, log });

// ── 状态 ────────────────────────────────────────────────────────────────────
let token = crypto.randomBytes(32).toString('hex');
let degraded = false; // 宿主 kv 桥不可达 = 面板/MCP 仍可用本服务，meta 不投影
let settings = { recentDirs: [] };
const mapCache = new Map(); // cacheKey → {parsed, at}；key = originPath + mtime 或 textHash

function clampSettings(s) {
  const out = { recentDirs: [] };
  if (s && Array.isArray(s.recentDirs)) {
    out.recentDirs = s.recentDirs.filter((p) => typeof p === 'string').slice(0, 10)
      .map((p) => p.slice(0, 500));
  }
  return out;
}

async function kvSafe(fn, what) {
  try { await fn(); if (degraded) { degraded = false; log('info', `宿主 kv 桥恢复（${what}）`); } }
  catch (e) {
    if (!degraded) { degraded = true; log('warn', `宿主 kv 桥不可达（${what}）：${e.message}，进入降级（服务照常，meta 不投影）`); }
  }
}

async function persistSettings() {
  await kvSafe(() => kv.kvSet('stacklens.settings', settings), 'settings');
}

async function loadSettings() {
  try {
    const v = await kv.kvGet('stacklens.settings');
    if (v) { settings = clampSettings(v); log('info', `settings 载入：${settings.recentDirs.length} 个最近目录`); }
  } catch (e) { log('warn', `settings 载入失败（非致命）：${e.message}`); }
}

function beatMeta() {
  const meta = { port: PORT, token, pid: process.pid, version: VERSION, startedAt: STARTED_AT, live: Date.now() };
  kvSafe(() => kv.kvSet('stacklens.meta', meta), 'meta');
}

function rememberDir(dir) {
  const d = String(dir || '').slice(0, 500);
  if (!d) return;
  settings.recentDirs = [d, ...settings.recentDirs.filter((x) => x !== d)].slice(0, 10);
  persistSettings();
}

// ── map 装载（带缓存）───────────────────────────────────────────────────────

function textHash(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);
}

/** 解析并缓存一个 map（originPath+mtime 或内容哈希为 key）；返回 {map} 或 {error} */
function loadMap(jsonText, originPath) {
  let key = null;
  try {
    if (originPath) {
      const st = fs.statSync(originPath);
      key = `${originPath}::${st.size}::${Math.floor(st.mtimeMs)}`;
    } else {
      key = `text::${textHash(jsonText)}`;
    }
  } catch (_) { key = `text::${textHash(jsonText)}`; }
  const hit = mapCache.get(key);
  if (hit) { hit.at = Date.now(); return { map: hit.parsed }; }
  const parsed = core.parseSourceMap(jsonText, originPath || 'inline');
  if (parsed.error) return { error: parsed.error };
  mapCache.set(key, { parsed, at: Date.now() });
  while (mapCache.size > MAP_CACHE_MAX) {
    let oldestK = null; let oldestAt = Infinity;
    for (const [k, v] of mapCache) { if (v.at < oldestAt) { oldestAt = v.at; oldestK = k; } }
    if (oldestK) mapCache.delete(oldestK); else break;
  }
  return { map: parsed };
}

/** 读一个 map 文件（大小上限校验） */
function readMapFile(p) {
  const st = fs.statSync(p);
  if (!st.isFile()) throw new Error(`不是文件：${p}`);
  if (st.size > core.LIMITS.maxMapBytes) throw new Error(`map 超过 ${Math.floor(core.LIMITS.maxMapBytes / 1024 / 1024)}MB 上限：${p}`);
  return { jsonText: fs.readFileSync(p, 'utf8'), bytes: st.size };
}

/** 磁盘源文件读取（给 core 当 fsReader；供 sourcesContent 缺失时出代码帧） */
function diskSourceReader(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > SOURCE_READ_CAP) return null;
    return fs.readFileSync(p, 'utf8');
  } catch (_) { return null; }
}

// ── URL 抓取（唯一出站网络：用户显式给 URL 的 map GET）──────────────────────

async function fetchMap(url) {
  let u;
  try { u = new URL(url); } catch (_) { throw new Error(`URL 不合法：${url}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅支持 http/https 抓取（收到 ${u.protocol}）`);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('抓取超时')), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const lenHeader = parseInt(res.headers.get('content-length') || '0', 10);
    if (lenHeader > FETCH_MAX_BYTES) throw new Error(`content-length ${lenHeader}B 超过抓取上限`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > FETCH_MAX_BYTES) throw new Error(`响应体 ${buf.length}B 超过抓取上限`);
    const text = buf.toString('utf8');
    if (!/^\s*[{[]/.test(text)) throw new Error('响应不是 JSON（map 必须是 JSON 文本）');
    return { jsonText: text, bytes: buf.length, url: u.href };
  log('info','CHK5 finally'); } finally {
    clearTimeout(timer);
  }
}

// ── 请求处理 ────────────────────────────────────────────────────────────────

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) { reject(new Error(`请求体超限（>${Math.floor(limit / 1024 / 1024)}MB）`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error(`请求体不是合法 JSON：${e.message}`)); }
    });
    req.on('error', reject);
  });
}

function checkAuth(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 从请求参数收集 map 输入（四来源）：
 *   inlineMaps: [{label?, mapText|jsonText, fromJs?, originPath?}]  面板粘贴/拖拽
 *   mapPaths:   [绝对路径]                                          指定文件
 *   mapsDir:    目录（core.scanMapsDir：*.map + sourceMappingURL 注释）
 *   fetchUrls:  [url]                                               显式抓取
 * 返回 {mapInputs, mapReports, warnings}
 */
function collectMaps(body) {
  const mapInputs = [];
  const mapReports = [];
  const warnings = [];
  // ① 内联
  for (const im of (body.inlineMaps || []).slice(0, core.LIMITS.maxMaps)) {
    const text = im.mapText != null ? im.mapText : im.jsonText;
    if (typeof text !== 'string' || !text.trim()) continue;
    mapInputs.push({ jsonText: text, originPath: im.originPath, fromJs: im.fromJs, label: im.label || (im.originPath ? path.basename(im.originPath) : undefined) });
  }
  // ② 指定文件
  for (const p of (body.mapPaths || []).slice(0, core.LIMITS.maxMaps)) {
    try {
      const { jsonText, bytes } = readMapFile(p);
      mapInputs.push({ jsonText, originPath: p, label: path.basename(p) });
      mapReports.push({ label: path.basename(p), ok: true, bytes, from: 'path' });
    } catch (e) {
      mapReports.push({ label: String(p), ok: false, error: e.message, from: 'path' });
    }
  }
  // ③ 目录
  if (body.mapsDir && typeof body.mapsDir === 'string') {
    const scan = core.scanMapsDir(body.mapsDir);
    for (const w of scan.warnings) warnings.push(`目录扫描：${w}`);
    for (const m of scan.maps) {
      mapInputs.push({ jsonText: m.jsonText, originPath: m.originPath, fromJs: m.fromJs, label: m.originPath ? path.basename(m.originPath) : `sourceMappingURL:${m.fromJs}` });
    }
    mapReports.push({ label: `目录 ${body.mapsDir}`, ok: true, count: scan.maps.length, walked: scan.walked, from: 'dir' });
    rememberDir(body.mapsDir);
  }
  // ④ URL 抓取是异步的——collectMaps 只做同步部分，fetch 由调用方先行并入 inlineMaps
  return { mapInputs, mapReports, warnings };
}

// ── 路由 ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/__health') { sendJson(res, 200, { ok: true, version: VERSION }); return; }
  if (!checkAuth(req)) { sendJson(res, 401, { error: '未授权（Bearer token 不匹配）' }); return; }
  handle(req, res, urlPath).catch((e) => {
    log('error', `处理 ${urlPath} 失败：${e.message}`);
    try { sendJson(res, 500, { error: e.message }); } catch (_) { /* 已发送 */ }
  });
});

async function handle(req, res, urlPath) {
  // 服务自况
  if (req.method === 'GET' && urlPath === '/api/meta') {
    sendJson(res, 200, {
      version: VERSION, pid: process.pid, degraded,
      uptime: Date.now() - STARTED_AT,
      settings, mapsCached: mapCache.size,
      limits: core.LIMITS,
    });
    return;
  }
  if (req.method === 'GET' && urlPath === '/api/settings') {
    sendJson(res, 200, { settings });
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req, BODY_LIMIT); } catch (e) { sendJson(res, 400, { error: e.message }); return; }

    // 还原主接口：{stack, mapsDir?, mapPaths?, inlineMaps?, fetchUrls?, wantFrames?}
    if (urlPath === '/api/resolve') {
      const fetchReports = [];
      const inline = Array.isArray(body.inlineMaps) ? body.inlineMaps.slice() : [];
      for (const u of (body.fetchUrls || []).slice(0, 10)) {
        try {
          const r = await fetchMap(u);
          inline.push({ mapText: r.jsonText, label: `fetched:${u}` });
          fetchReports.push({ url: u, ok: true, bytes: r.bytes });
        } catch (e) {
          fetchReports.push({ url: u, ok: false, error: e.message });
        }
      }
      const body2 = { ...body, inlineMaps: inline };
      const { mapInputs, mapReports, warnings } = collectMaps(body2);
      const report = core.resolveStack(body.stack, mapInputs, { fsReader: diskSourceReader, wantFrames: body.wantFrames !== false });
      sendJson(res, 200, {
        ...report,
        sources: { maps: mapReports, fetches: fetchReports },
      });
      return;
    }

    // 目录扫描（面板地图页）：{dir}
    if (urlPath === '/api/scan-maps') {
      if (!body.dir || typeof body.dir !== 'string') { sendJson(res, 400, { error: '缺少 dir' }); return; }
      const scan = core.scanMapsDir(body.dir);
      const briefs = scan.maps.map((m) => ({ ...(m.jsonText != null ? core.mapBrief(m.jsonText, m.originPath) : {}), fromJs: m.fromJs }));
      rememberDir(body.dir);
      sendJson(res, 200, { dir: body.dir, walked: scan.walked, warnings: scan.warnings, maps: briefs });
      return;
    }

    // 单点定位：{mapPath?|mapText?, line, col}
    if (urlPath === '/api/frame') {
      const { jsonText, error } = obtainMapText(body);
      if (error) { sendJson(res, 400, { error }); return; }
      const loaded = loadMap(jsonText, body.mapPath);
      if (loaded.error) { sendJson(res, 400, { error: loaded.error }); return; }
      const line = parseInt(body.line, 10);
      const col = parseInt(body.col, 10);
      if (!Number.isInteger(line) || line < 1) { sendJson(res, 400, { error: 'line 必须是 ≥1 的整数' }); return; }
      const pos = core.originalPositionFor(loaded.map, line - 1, Number.isInteger(col) && col >= 1 ? col - 1 : 0);
      if (!pos) { sendJson(res, 200, { found: false, reason: `生成行 ${line} 无带源映射的段` }); return; }
      const content = core.contentFor(loaded.map, pos.sourceIndex, pos.source, diskSourceReader, { originPath: body.mapPath });
      sendJson(res, 200, {
        found: true,
        source: pos.source, line: pos.line + 1, column: pos.column + 1, name: pos.name,
        codeFrame: content ? core.codeFrame(content.text, pos.line + 1, pos.column + 1, 3) : null,
        codeFrameFrom: content ? content.from : null,
      });
      return;
    }

    // 源码帧：{mapPath?|mapText?, source(index|name), line?, context?}
    if (urlPath === '/api/source') {
      const { jsonText, error } = obtainMapText(body);
      if (error) { sendJson(res, 400, { error }); return; }
      const loaded = loadMap(jsonText, body.mapPath);
      if (loaded.error) { sendJson(res, 400, { error: loaded.error }); return; }
      const idx = resolveSourceIndex(loaded.map, body.source);
      if (idx == null) { sendJson(res, 400, { error: `找不到 source：${String(body.source)}` }); return; }
      const name = loaded.map.sources[idx];
      const content = core.contentFor(loaded.map, idx, name, diskSourceReader, { originPath: body.mapPath });
      if (!content) { sendJson(res, 200, { found: false, reason: '无 sourcesContent 且磁盘不可得' }); return; }
      const line1 = parseInt(body.line, 10);
      const ctx = body.context != null ? parseInt(body.context, 10) : 2;
      sendJson(res, 200, {
        found: true, source: name, from: content.from,
        codeFrame: core.codeFrame(content.text, Number.isInteger(line1) && line1 >= 1 ? line1 : 1, body.col, Number.isFinite(ctx) ? ctx : 2),
        totalLines: content.text.replace(/\r\n/g, '\n').split('\n').length,
      });
      return;
    }

    // map 体检：{mapPath?|mapText?, label?}
    if (urlPath === '/api/validate') {
      const { jsonText, error } = obtainMapText(body);
      if (error) { sendJson(res, 400, { error }); return; }
      const v = core.validateMap(jsonText, body.label);
      sendJson(res, 200, v);
      return;
    }

    sendJson(res, 404, { error: `未知 POST 路由：${urlPath}` });
    return;
  }
  sendJson(res, 404, { error: `未知路由：${req.method} ${urlPath}` });
}

/** 从 body 拿 map 文本（mapText 优先，否则 mapPath 读盘） */
function obtainMapText(body) {
  if (typeof body.mapText === 'string' && body.mapText.trim()) return { jsonText: body.mapText };
  if (body.mapPath) {
    try { return readMapFile(String(body.mapPath)); }
    catch (e) { return { error: e.message }; }
  }
  return { error: '缺少 mapText 或 mapPath' };
}

function resolveSourceIndex(map, source) {
  if (typeof source === 'number' && Number.isInteger(source) && source >= 0 && source < map.sources.length) return source;
  if (typeof source === 'string') {
    const byExact = map.sources.indexOf(source);
    if (byExact >= 0) return byExact;
    const base = source.split(/[\\/]/).pop();
    const byBase = map.sources.findIndex((s) => s.split(/[\\/]/).pop() === base);
    if (byBase >= 0) return byBase;
  }
  return null;
}

// ── 启动 ────────────────────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  log('info', `堆栈还原台服务就绪：127.0.0.1:${PORT}（v${VERSION}）`);
  loadSettings().then(beatMeta);
});
server.on('error', (e) => {
  log('error', `服务启动失败：${e.message}`);
  process.exitCode = 1;
});

const beatTimer = setInterval(beatMeta, META_BEAT_MS);
beatTimer.unref?.();

process.on('uncaughtException', (e) => { log('error', `uncaughtException：${e.stack || e.message}`); });
process.on('unhandledRejection', (e) => { log('error', `unhandledRejection：${e && e.stack ? e.stack : e}`); });

// selftest 钩子（离线冒烟：真读临时目录的 map/源文件，验证 fs 链路）
// 结构纪律：清理（rm）在 finally，退出（exit）在清理之后——exit 决不能放 finally 里，
// 否则 try 抛异常时 exit(0) 抢在 catch 之前执行，断言失败全变静默假绿（本插件实测踩坑）。
if (process.env.STACKLENS_SELFTEST === '1') {
  const os = require('os');
  const fsp = fs.promises;
  (async () => {
    let err = null;
    let okPayload = null;
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'stack-lens-selftest-'));
    try {
      // 1) 造 minified js + map + 源文件（esbuild 风格：sourcesContent 缺失，考磁盘读取）
      //    map 的 sources 相对 map 所在目录解析：'src/app.ts' → tmp/src/app.ts
      const srcDir = path.join(tmp, 'src');
      await fsp.mkdir(srcDir, { recursive: true });
      const srcText = 'function greet(name){\n  return "hi " + name;\n}\nfunction boom(){\n  return greet(void 0).trim();\n}\nboom();\n';
      await fsp.writeFile(path.join(srcDir, 'app.ts'), srcText, 'utf8');
      const genText = 'function greet(n){return"hi "+n}\nfunction boom(){return greet(void 0).trim()}\nboom();\n';
      const jsPath = path.join(tmp, 'app.min.js');
      await fsp.writeFile(jsPath, genText + '//# sourceMappingURL=app.min.js.map\n', 'utf8');
      const mapObj = {
        version: 3, file: 'app.min.js',
        sources: ['src/app.ts'], sourcesContent: null, names: [],
        // 走编码器生成真实 mappings：段1 gen(col0)→src(行0,列0)；段2 gen(col0)→src(行4,列0)
        mappings: encodeMappings([[[0, 0, 0, 0]], [[0, 0, 4, 0]]]),
      };
      const mapPath = path.join(tmp, 'app.min.js.map');
      await fsp.writeFile(mapPath, JSON.stringify(mapObj), 'utf8');
      // 2) 目录扫描：直读 .map 与 sourceMappingURL 注释命中同一文件 → 去重后恰 1 条
      const scan = core.scanMapsDir(tmp);
      if (scan.maps.length !== 1) throw new Error(`selftest：目录扫描应去重为 1 条 map，实得 ${scan.maps.length}`);
      // 3) resolveStack：栈指向 app.min.js:2:23 → 应还原 src/app.ts 5 行
      const stack = 'TypeError: Cannot read properties of undefined\n    at boom (' + jsPath + ':2:23)\n    at Object.<anonymous> (' + jsPath + ':3:1)';
      const inputs = scan.maps.map((m) => ({ jsonText: m.jsonText, originPath: m.originPath, fromJs: m.fromJs }));
      const report = core.resolveStack(stack, inputs, { fsReader: diskSourceReader });
      const r2 = report.frames[0];
      if (r2.state !== 'resolved' || r2.sourceLine !== 5 || r2.source !== 'src/app.ts') {
        throw new Error(`selftest：帧还原错误——state=${r2.state} source=${r2.source} sourceLine=${r2.sourceLine}`);
      }
      if (!r2.codeFrame || !r2.codeFrame.includes('return greet')) {
        throw new Error(`selftest：磁盘代码帧缺失——${r2.codeFrameNote || r2.codeFrame}`);
      }
      // 第 2 帧（生成行 3）map 无映射段 → 必须是未还原且带原因
      const r3 = report.frames[1];
      if (r3.state !== 'unresolved' || !r3.reason) throw new Error(`selftest：无映射帧应显式未还原，实得 ${r3.state}`);
      // 4) REST 冒烟（/__health；服务 listen 与 selftest 并发，重试等就绪）
      let healthOk = false;
      for (let i = 0; i < 10 && !healthOk; i++) {
        // eslint-disable-next-line no-await-in-loop
        healthOk = await new Promise((resolve) => {
          const probe = http.get({ host: '127.0.0.1', port: PORT, path: '/__health', timeout: 1500 }, (r4) => {
            r4.resume(); resolve(r4.statusCode === 200);
          });
          probe.on('error', () => resolve(false));
          probe.on('timeout', () => { probe.destroy(); resolve(false); });
        });
        if (!healthOk) await new Promise((r5) => setTimeout(r5, 300));
      }
      if (!healthOk) throw new Error('selftest：/__health 未就绪');
      okPayload = { resolved: report.summary.resolved, rate: report.summary.rate };
    } catch (e) {
      err = e;
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
    // 输出走 stderr（Node 在 Windows 上 stderr 恒同步；fd 1 非阻塞管道会丢输出——实测坑）
    if (err) {
      log('error', `selftest 失败：${err.message}`);
      process.stderr.write(`[stack-lens-svc][selftest] ${JSON.stringify({ selftest: 'fail', error: err.message })}\n`);
      process.exit(1);
    }
    process.stderr.write(`[stack-lens-svc][selftest] ${JSON.stringify({ selftest: 'ok', ...okPayload })}\n`);
    process.exit(0);
  })();
}

// ── VLQ 编码（selftest 造 fixture 用；bundle-lens 同款）─────────────────────
function encodeVlq(value) {
  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += B64C[digit];
  } while (vlq > 0);
  return out;
}
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encodeMappings(linesArr) {
  // linesArr: [[[genCol, srcIdx, srcLine, srcCol], ...], ...]
  let ps = 0, pl = 0, pc = 0, pn = 0;
  return linesArr.map((segs) => {
    let prevCol = 0;
    return segs.map((s) => {
      let out = encodeVlq(s[0] - prevCol);
      prevCol = s[0];
      out += encodeVlq(s[1] - ps); ps = s[1];
      out += encodeVlq(s[2] - pl); pl = s[2];
      out += encodeVlq(s[3] - pc); pc = s[3];
      if (s.length > 4) { out += encodeVlq(s[4] - pn); pn = s[4]; }
      return out;
    }).join(',');
  }).join(';');
}
