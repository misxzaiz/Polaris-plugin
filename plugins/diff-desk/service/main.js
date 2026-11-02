'use strict';
/**
 * main.js —— Diff 对比台后台服务（零依赖，node http）。
 *
 * 职责：四类对比的编排与护栏（文本/JSON/目录/双 URL）、历史留档（仅元数据）、
 * 心跳（dfx.meta）、试金石自检。
 *
 * 安全边界：
 *   - 仅监听 127.0.0.1 + 回环地址双重校验；不发 CORS 头（面板一律走宿主 cap.http 通道）。
 *   - 全只读：文件走 files.js（无任何写调用）；唯一出网口是 fetcher.js（SSRF 围栏）。
 *   - 业务错误统一 HTTP 200 + {ok:false,error}；响应体按各 LIMITS 截断。
 *   - 历史只存元数据（kind/label/统计），正文永不落 kv；URL 只留 origin+pathname。
 */
const http = require('http');
const path = require('path');
const core = require('../shared/core');
const { createKvClient } = require('./kvclient');
const files = require('./files');
const {
  fencedFetch, fenceUrl, isPrivateIp, setProxyResolver, parseProxyConfig,
} = require('./fetcher');

const VERSION = '0.1.0';
const PORT = parseInt(process.argv[2] || '', 10) || 9877;
const APP_CONFIG_DIR = process.argv[3] || '';
const KV_PREFIX = 'dfx';
const STARTED_AT = Date.now();

const LIMITS = {
  pasteBytes: 5 * 1024 * 1024, // 粘贴文本单侧上限
  fileBytes: 20 * 1024 * 1024, // 文件读取单侧上限
  bodyBytes: 12 * 1024 * 1024, // 请求体总上限（含双侧粘贴）
  dirEntries: 20000, // 目录遍历条目上限
  hashCapBytes: 8 * 1024 * 1024, // 目录对比参与哈希的单文件上限
  hashBudgetBytes: 256 * 1024 * 1024, // 目录对比每侧哈希总预算
  hunkLines: 400, // diff 输出行数上限
  jsonChanges: 500, // JSON 差异条数上限
  changeText: 2000, // 单条差异值展示上限
  dirList: 2000, // 目录对比单列表上限
  fetchBytes: 5 * 1024 * 1024, // URL 抓取响应上限
  fetchTimeoutMs: 15000,
  historyMax: 30,
  ignorePathMax: 20,
};

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (lv, msg) => slog(lv, msg) });

/* ============================ 设置（内存权威、kv 镜像） ============================ */

const settings = { proxy: '' }; // '' = 自动（env → Windows 系统代理 → 直连）

async function loadSettings() {
  try {
    const v = await kv.kvGet(`${KV_PREFIX}.settings`);
    if (v && typeof v === 'object') {
      // 仅在内存仍是默认值时采纳 kv（避免晚到的加载覆盖用户的即时修改）
      if (typeof v.proxy === 'string' && settings.proxy === '') settings.proxy = v.proxy;
    }
  } catch (_) { /* 桥不可用用默认 */ }
}

function applyProxyResolver() {
  setProxyResolver(async () => settings.proxy);
}

/* ============================ 小工具 ============================ */

function slog(level, msg) {
  const line = `[diff-desk][${level}] ${msg}`;
  if (level === 'error') console.error(line);
  else console.error(line); // 日志一律 stderr（stdout 不承载协议以外内容）
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function ok(res, result) {
  sendJson(res, 200, { ok: true, result });
}

function fail(res, error) {
  sendJson(res, 200, { ok: false, error: typeof error === 'string' ? error : error.message });
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return; // 超限后继续收流丢弃（防 keep-alive 半截体毒化连接），但不再缓冲
      total += c.length;
      if (total > maxBytes) {
        done = true;
        chunks.length = 0;
        const err = new Error(`请求体超过上限 ${(maxBytes / 1048576).toFixed(0)}MB`);
        err.code = 'LIMIT_BODY';
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req, LIMITS.bodyBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error('请求体不是合法 JSON');
  }
}

function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

function normOpts(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  let ignorePaths = Array.isArray(o.ignorePaths) ? o.ignorePaths : [];
  ignorePaths = ignorePaths
    .filter((s) => typeof s === 'string' && s.trim())
    .slice(0, LIMITS.ignorePathMax)
    .map((s) => String(s).slice(0, 200));
  return {
    ignoreWhitespace: o.ignoreWhitespace === true,
    ignoreCase: o.ignoreCase === true,
    contextLines: clampInt(o.contextLines, 0, 10, 3),
    ignorePaths,
    arrayAlign: o.arrayAlign !== false,
  };
}

function checkPasteSize(text, tag) {
  if (typeof text !== 'string') throw new Error(`${tag} 侧内容缺失`);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > LIMITS.pasteBytes) {
    throw new Error(`${tag} 侧 ${(bytes / 1048576).toFixed(1)}MB 超过粘贴上限 ${(LIMITS.pasteBytes / 1048576).toFixed(0)}MB`);
  }
  return text;
}

function truncVal(s) {
  return typeof s === 'string' ? core.truncate(s, LIMITS.changeText) : s;
}

/* ============================ 对比核心编排 ============================ */

/** 文本/JSON 统一入口。mode: 'text' | 'json'（调用方先决定） */
function runDiff(mode, aText, bText, opts) {
  if (mode === 'json') {
    const pa = core.parseJsonLoose(aText);
    if (!pa.ok) {
      throw new Error(`A 侧不是合法 JSON（第 ${pa.error.line} 行第 ${pa.error.col} 列：${pa.error.msg}）`);
    }
    const pb = core.parseJsonLoose(bText);
    if (!pb.ok) {
      throw new Error(`B 侧不是合法 JSON（第 ${pb.error.line} 行第 ${pb.error.col} 列：${pb.error.msg}）`);
    }
    const result = core.semanticJsonDiff(pa.value, pb.value, {
      ignorePaths: opts.ignorePaths,
      arrayAlign: opts.arrayAlign,
    });
    const overCap = result.changes.length > LIMITS.jsonChanges;
    const changes = result.changes.slice(0, LIMITS.jsonChanges).map((c) => ({
      path: c.path,
      type: c.type,
      oldText: truncVal(c.oldText),
      newText: truncVal(c.newText),
      note: c.note,
    }));
    return {
      kind: 'json',
      stats: result.stats,
      changes,
      truncated: result.truncated || overCap,
    };
  }
  const diff = core.lineDiff(aText, bText, opts);
  const built = core.buildHunks(diff.items, opts.contextLines, LIMITS.hunkLines);
  const patch = core.makeUnifiedPatch(diff.items, opts.contextLines, 'a', 'b', LIMITS.hunkLines);
  return {
    kind: 'text',
    stats: diff.stats,
    hunks: built.hunks.map((h) => ({
      aStart: h.aStart,
      bStart: h.bStart,
      lines: h.lines.map((l) => shapeItem(l.item)),
      rows: core.buildSideBySide(h.lines.map((l) => l.item)),
    })),
    truncated: built.truncated,
    patch: patch.patch,
    patchTruncated: patch.truncated,
  };
}

function shapeItem(it) {
  if (it.type === 'modify') {
    return { type: it.type, aNo: it.aNo, bNo: it.bNo, aText: it.aText, bText: it.bText, spans: it.spans };
  }
  return { type: it.type, aNo: it.aNo, bNo: it.bNo, text: it.text };
}

/** mode auto：两侧都能解析成 JSON → json，否则 text */
function resolveAutoMode(aText, bText) {
  const pa = core.parseJsonLoose(aText);
  const pb = core.parseJsonLoose(bText);
  return pa.ok && pb.ok ? 'json' : 'text';
}

/* ============================ 历史（仅元数据） ============================ */

let historyCache = null;

async function loadHistory() {
  if (historyCache) return historyCache;
  try {
    const v = await kv.kvGet(`${KV_PREFIX}.history`);
    historyCache = Array.isArray(v) ? v.slice(0, LIMITS.historyMax) : [];
  } catch (_) {
    historyCache = []; // 桥不可用时退化为内存态（本进程内仍可用）
  }
  return historyCache;
}

async function pushHistory(entry) {
  const list = await loadHistory();
  list.unshift(entry);
  if (list.length > LIMITS.historyMax) list.length = LIMITS.historyMax;
  try {
    await kv.kvSet(`${KV_PREFIX}.history`, list);
  } catch (_) { /* 镜像失败不阻塞对比 */ }
  return list;
}

function labelForNames(kind, aName, bName) {
  return `${aName} ⇄ ${bName}`;
}

function urlLabel(u) {
  try {
    const parsed = new URL(u);
    return parsed.origin + parsed.pathname; // 剥 query（防 token 进历史）
  } catch (_) {
    return '(url)';
  }
}

async function recordHistory(kind, label, stats) {
  await pushHistory({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    kind,
    label,
    stats,
  });
}

/* ============================ 各路由实现 ============================ */

async function handleDiffText(params, res) {
  const opts = normOpts(params.opts);
  const aText = checkPasteSize(params.a, 'A');
  const bText = checkPasteSize(params.b, 'B');
  const mode = params.mode === 'json' || params.mode === 'text' ? params.mode : resolveAutoMode(aText, bText);
  const result = runDiff(mode, aText, bText, opts);
  await recordHistory(mode === 'json' ? 'json' : 'text', '粘贴内容对比', result.stats);
  ok(res, result);
}

async function handleDiffFiles(params, res) {
  const opts = normOpts(params.opts);
  if (!params.aPath || !params.bPath) throw new Error('需要 aPath 与 bPath');
  const fa = files.readFileLimited(params.aPath, LIMITS.fileBytes);
  const fb = files.readFileLimited(params.bPath, LIMITS.fileBytes);
  let mode = params.mode;
  if (mode !== 'json' && mode !== 'text') mode = resolveAutoMode(fa.text, fb.text);
  const result = runDiff(mode, fa.text, fb.text, opts);
  result.aMeta = { path: fa.path, size: fa.size, charset: fa.charset };
  result.bMeta = { path: fb.path, size: fb.size, charset: fb.charset };
  await recordHistory(mode === 'json' ? 'json' : 'text', labelForNames('files', path.basename(fa.path), path.basename(fb.path)), result.stats);
  ok(res, result);
}

async function handleDiffDirs(params, res) {
  const opts = params.opts && typeof params.opts === 'object' ? params.opts : {};
  if (!params.aPath || !params.bPath) throw new Error('需要 aPath 与 bPath');
  const skipNames = new Set(files.SKIP_NAMES);
  if (opts.includeNodeModules) skipNames.delete('node_modules');
  const maxEntries = clampInt(opts.maxEntries, 100, LIMITS.dirEntries, LIMITS.dirEntries);
  const wa = files.walkDir(params.aPath, { maxEntries, skipNames });
  const wb = files.walkDir(params.bPath, { maxEntries, skipNames });

  // 同大小且双侧都存在的文件参与哈希对比（预算内）
  const mapA = new Map(wa.entries.map((e) => [e.path, e]));
  const mapB = new Map(wb.entries.map((e) => [e.path, e]));
  let budgetA = LIMITS.hashBudgetBytes;
  let budgetB = LIMITS.hashBudgetBytes;
  const rootA = files.assertSafePath(params.aPath);
  const rootB = files.assertSafePath(params.bPath);
  for (const [p, ea] of mapA) {
    const eb = mapB.get(p);
    if (!eb || ea.kind !== 'file') continue;
    if (ea.size !== eb.size || ea.size > LIMITS.hashCapBytes) continue;
    if (ea.size > budgetA || eb.size > budgetB) continue;
    const ha = files.sha256File(path.join(rootA, p), LIMITS.hashCapBytes);
    const hb = files.sha256File(path.join(rootB, p), LIMITS.hashCapBytes);
    budgetA -= ea.size;
    budgetB -= eb.size;
    if (ha) ea.sha256 = ha;
    if (hb) eb.sha256 = hb;
  }

  const result = core.dirDiffTrees(wa.entries, wb.entries);
  const capList = (arr) => ({
    items: arr.slice(0, LIMITS.dirList),
    total: arr.length,
    truncated: arr.length > LIMITS.dirList,
  });
  result.onlyLeft = capList(result.onlyLeft);
  result.onlyRight = capList(result.onlyRight);
  result.changed = capList(result.changed);
  result.aMeta = { path: rootA, entries: wa.entries.length, skipped: wa.skipped, truncated: wa.truncated };
  result.bMeta = { path: rootB, entries: wb.entries.length, skipped: wb.skipped, truncated: wb.truncated };
  await recordHistory('dirs', labelForNames('dirs', path.basename(rootA) || rootA, path.basename(rootB) || rootB), {
    onlyLeft: result.onlyLeft.total,
    onlyRight: result.onlyRight.total,
    changed: result.changed.total,
    same: result.same,
  });
  ok(res, result);
}

async function handleDiffUrls(params, res) {
  const opts = normOpts(params.opts);
  if (!params.aUrl || !params.bUrl) throw new Error('需要 aUrl 与 bUrl');
  const method = params.method === 'POST' ? 'POST' : 'GET';
  const body = typeof params.body === 'string' && params.body.length <= 65536 ? params.body : '';
  const fetchOpts = {
    method,
    headers: params.headers,
    body,
    timeoutMs: LIMITS.fetchTimeoutMs,
    maxBytes: LIMITS.fetchBytes,
  };
  const [ra, rb] = await Promise.all([
    fencedFetch(params.aUrl, fetchOpts),
    fencedFetch(params.bUrl, fetchOpts),
  ]);
  let mode = params.mode;
  if (mode !== 'json' && mode !== 'text') {
    const looksJson = (r) => /json/i.test(r.contentType) || /^\s*[[{]/.test(r.bodyText);
    mode = looksJson(ra) && looksJson(rb) ? 'json' : 'text';
  }
  const result = runDiff(mode, ra.bodyText, rb.bodyText, opts);
  result.aSide = {
    url: urlLabel(params.aUrl),
    finalUrl: urlLabel(ra.finalUrl),
    status: ra.status,
    contentType: ra.contentType,
    byteLength: ra.byteLength,
    truncated: ra.truncated,
    redirects: ra.redirects.length,
    elapsedMs: ra.elapsedMs,
  };
  result.bSide = {
    url: urlLabel(params.bUrl),
    finalUrl: urlLabel(rb.finalUrl),
    status: rb.status,
    contentType: rb.contentType,
    byteLength: rb.byteLength,
    truncated: rb.truncated,
    redirects: rb.redirects.length,
    elapsedMs: rb.elapsedMs,
  };
  await recordHistory('urls', labelForNames('urls', urlLabel(params.aUrl), urlLabel(params.bUrl)), result.stats);
  ok(res, result);
}

/* ============================ 自检（试金石） ============================ */

function runSelftest() {
  const items = [];
  function t(name, fn) {
    try {
      fn();
      items.push({ name, ok: true });
    } catch (e) {
      items.push({ name, ok: false, detail: e.message });
    }
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || '断言失败');
  }

  t('行级 diff：增/删/改统计', () => {
    const r = core.lineDiff('a\nb\nc\n', 'a\nx\nc\n');
    assert(r.stats.modifies === 1 && r.stats.additions === 0 && r.stats.deletions === 0, JSON.stringify(r.stats));
    assert(r.items.some((it) => it.type === 'modify' && it.aText === 'b' && it.bText === 'x'), '应有 modify 行');
  });
  t('行级 diff：行号含共前缀偏移', () => {
    const r = core.lineDiff('l1\nl2\nl3\nl4\nl5', 'l1\nl2\nl3\nl4\nL5');
    const mod = r.items.find((it) => it.type === 'modify');
    assert(mod && mod.aNo === 5 && mod.bNo === 5, `行号应为 5/5，实际 ${mod && mod.aNo}/${mod && mod.bNo}`);
  });
  t('行级 diff：忽略空白与大小写', () => {
    const r = core.lineDiff('Hello  World\nx', 'hello world\nx', { ignoreWhitespace: true, ignoreCase: true });
    assert(r.stats.additions + r.stats.deletions + r.stats.modifies === 0, JSON.stringify(r.stats));
  });
  t('行内字级 spans', () => {
    const r = core.lineDiff('timeout: 30s', 'timeout: 60s');
    const mod = r.items.find((it) => it.type === 'modify');
    const joined = mod.spans.right.map((s) => s.text).join('');
    assert(joined === 'timeout: 60s', '右侧 spans 拼接应还原整行');
    assert(mod.spans.right.some((s) => s.type === 'ins' && s.text.includes('6')), '应标出 6 为新增');
  });
  t('统一 hunks 与 patch 生成', () => {
    const r = core.lineDiff('a\nb\nc\nd\ne\nf\ng\nh', 'a\nb\nX\nd\ne\nf\ng\nh');
    const built = core.buildHunks(r.items, 2, 400);
    assert(built.hunks.length === 1, '应合并为一个 hunk');
    const patch = core.makeUnifiedPatch(r.items, 2, 'a.txt', 'b.txt', 400);
    assert(patch.patch.startsWith('--- a.txt'), 'patch 头');
    assert(patch.patch.includes('@@'), 'patch 应含 hunk 头');
    assert(patch.patch.includes('-c') && patch.patch.includes('+X'), 'patch 应含 -/+ 行');
  });
  t('JSON 语义：键序无关', () => {
    const r = core.semanticJsonDiff({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 });
    assert(r.changes.length === 0, JSON.stringify(r.changes));
  });
  t('JSON 语义：值变更路径', () => {
    const r = core.semanticJsonDiff({ users: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }, { users: [{ id: 1, name: 'a' }, { id: 2, name: 'B' }] });
    assert(r.stats.changed === 1, JSON.stringify(r.stats));
    assert(r.changes[0].path.includes('users') && r.changes[0].path.includes('name'), r.changes[0].path);
    assert(r.changes[0].oldText === 'b' && r.changes[0].newText === 'B', '应给旧值→新值');
  });
  t('JSON 语义：数组重排只报顺序', () => {
    const r = core.semanticJsonDiff({ arr: [1, 2, 3] }, { arr: [3, 1, 2] });
    assert(r.stats.order === 1 && r.stats.changed + r.stats.added + r.stats.removed === 0, JSON.stringify(r));
  });
  t('JSON 语义：对象数组按内容对齐（重排+改字段）', () => {
    const A = { list: [{ k: 'x', v: 1 }, { k: 'y', v: 2 }] };
    const B = { list: [{ k: 'y', v: 3 }, { k: 'x', v: 1 }] };
    const r = core.semanticJsonDiff(A, B);
    assert(r.stats.changed === 1, JSON.stringify(r.changes));
    assert(r.changes[0].path === '$.list[1].v', `变更应落在 k=y 项（A 侧索引 1），实际 ${r.changes[0].path}`);
  });
  t('JSON 语义：纯重排元素相同的对象数组', () => {
    const r = core.semanticJsonDiff({ l: [1, 2] }, { l: [2, 1] });
    assert(r.stats.order === 1, JSON.stringify(r));
  });
  t('JSON 语义：忽略路径（精确+通配）', () => {
    const A = { meta: { updatedAt: 1, v: 1 }, items: [{ id: 1, ts: 11 }, { id: 2, ts: 22 }] };
    const B = { meta: { updatedAt: 99, v: 1 }, items: [{ id: 1, ts: 99 }, { id: 2, ts: 99 }] };
    const r1 = core.semanticJsonDiff(A, B, { ignorePaths: ['$.meta.updatedAt'] });
    assert(r1.stats.changed === 2, 'glob 前应剩 2 处');
    const r2 = core.semanticJsonDiff(A, B, { ignorePaths: ['$.meta.updatedAt', '$.items[*].ts'] });
    assert(r2.changes.length === 0, JSON.stringify(r2.changes));
  });
  t('JSON 语义：类型差异标注', () => {
    const r = core.semanticJsonDiff({ n: 1 }, { n: '1' });
    assert(r.stats.changed === 1 && r.changes[0].note && r.changes[0].note.includes('类型'), JSON.stringify(r.changes));
  });
  t('JSON 解析错误定位', () => {
    const r = core.parseJsonLoose('{\n  "a": 1,\n  "b": ]\n}');
    assert(!r.ok && r.error.line === 3, JSON.stringify(r));
  });
  t('目录对比：same/changed/only', () => {
    const A = [
      { path: 'a.txt', kind: 'file', size: 10, mtimeMs: 1000 },
      { path: 'b.txt', kind: 'file', size: 20, mtimeMs: 1000 },
      { path: 'gone.txt', kind: 'file', size: 5, mtimeMs: 1000 },
      { path: 'sub', kind: 'dir', size: 0, mtimeMs: 1000 },
    ];
    const B = [
      { path: 'a.txt', kind: 'file', size: 10, mtimeMs: 1000 },
      { path: 'b.txt', kind: 'file', size: 99, mtimeMs: 1000 },
      { path: 'new.txt', kind: 'file', size: 1, mtimeMs: 1000 },
      { path: 'sub', kind: 'dir', size: 0, mtimeMs: 1000 },
    ];
    const r = core.dirDiffTrees(A, B);
    assert(r.same === 1 && r.changed.length === 1 && r.dirCount === 1, JSON.stringify(r));
    assert(r.onlyLeft.length === 1 && r.onlyLeft[0] === 'gone.txt', 'A 独有');
    assert(r.onlyRight.length === 1 && r.onlyRight[0] === 'new.txt', 'B 独有');
  });
  t('SSRF 围栏：协议与私网拒绝', () => {
    assert(!fenceUrl('file:///etc/passwd').ok, 'file 协议应拒绝');
    assert(!fenceUrl('ftp://x/').ok, 'ftp 应拒绝');
    assert(!fenceUrl('http://127.0.0.1/x').ok, '回环应拒绝');
    assert(!fenceUrl('http://169.254.169.254/latest/meta-data/').ok, '元数据地址应拒绝');
    assert(!fenceUrl('http://10.1.2.3/').ok, '10/8 应拒绝');
    assert(!fenceUrl('http://172.16.0.1/').ok, '172.16/12 应拒绝');
    assert(!fenceUrl('http://192.168.1.1/').ok, '192.168 应拒绝');
    assert(!fenceUrl('http://[::1]/').ok, 'IPv6 回环应拒绝');
    assert(!fenceUrl('http://user:pass@example.com/').ok, '内嵌凭据应拒绝');
    assert(!fenceUrl('http://100.64.0.1/').ok, 'CGNAT 应拒绝');
  });
  t('SSRF 围栏：公网地址放行', () => {
    assert(fenceUrl('https://example.com/api?x=1').ok, '公网 https 应放行');
    assert(fenceUrl('http://8.8.8.8/').ok, '公网 IP 应放行');
    assert(isPrivateIp('fc00::1') && !isPrivateIp('2606:4700::1'), 'IPv6 ULA 拒/公网放');
  });
  t('相似度与规范化', () => {
    assert(core.canonical({ b: 1, a: 2 }) === core.canonical({ a: 2, b: 1 }), '键序无关规范化');
    assert(core.similarity('timeout: 30s', 'timeout: 60s') >= 0.5, '相似串应过阈值');
    assert(core.similarity('abc', 'xyz') < 0.5, '无关串应低于阈值');
  });
  t('超长安全数组回退（位置对齐不炸）', () => {
    const a = Array.from({ length: 600 }, (_, i) => ({ id: i, v: i }));
    const b = Array.from({ length: 600 }, (_, i) => ({ id: i, v: i === 599 ? 999 : i }));
    const r = core.semanticJsonDiff(a, b, { ignorePaths: ['$[*].id'] });
    assert(r.stats.changed === 1, JSON.stringify(r.stats));
  });

  return { items, allGreen: items.every((x) => x.ok) };
}

/* ============================ 路由与服务器 ============================ */

async function handle(req, res, url) {
  const p = url.pathname;
  const method = req.method || 'GET';

  if (method === 'GET' && p === '/__health') {
    ok(res, { version: VERSION, ts: Date.now() });
    return;
  }
  if (method === 'GET' && p === '/api/status') {
    const hist = await loadHistory();
    ok(res, {
      version: VERSION,
      pid: process.pid,
      port: PORT,
      startedAt: STARTED_AT,
      uptimeMs: Date.now() - STARTED_AT,
      historyCount: hist.length,
    });
    return;
  }
  if (method === 'GET' && p === '/api/history') {
    const hist = await loadHistory();
    ok(res, { items: hist, metaOnly: true, note: '历史仅存元数据（不存对比正文），URL 只留 origin+pathname' });
    return;
  }
  if (method === 'GET' && p === '/api/settings') {
    ok(res, {
      proxy: settings.proxy,
      proxyNote: '留空=自动（用户配置 → DIFFDESK_PROXY 环境变量 → Windows 系统代理 → 直连）',
    });
    return;
  }

  const body = await readJsonBody(req);
  if (method === 'POST' && p === '/api/settings') {
    const raw = body && typeof body.proxy === 'string' ? body.proxy.trim() : '';
    if (raw && !parseProxyConfig(raw)) {
      throw new Error('代理格式须为 host:port（如 127.0.0.1:7890）；留空=自动');
    }
    settings.proxy = raw;
    try {
      await kv.kvSet(`${KV_PREFIX}.settings`, { proxy: settings.proxy });
    } catch (_) { /* kv 镜像失败不阻塞（内存权威，下次启动 loadSettings 再取） */ }
    ok(res, { proxy: settings.proxy });
    return;
  }
  if (method === 'POST' && p === '/api/history_clear') {
    historyCache = [];
    try { await kv.kvDel(`${KV_PREFIX}.history`); } catch (_) { /* 镜像失败不阻塞 */ }
    ok(res, { cleared: true });
    return;
  }
  if (method === 'POST' && p === '/api/selftest') {
    const r = runSelftest();
    ok(res, r);
    return;
  }

  // 请求体已在上方统一读取一次（body）；此处严禁二次 readJsonBody——
  // 流被首次读取消费后，再次挂 data/end 监听永远不触发，请求将永久悬挂。
  if (method === 'POST' && p === '/api/diff_text') {
    await handleDiffText(body, res);
    return;
  }
  if (method === 'POST' && p === '/api/diff_files') {
    await handleDiffFiles(body, res);
    return;
  }
  if (method === 'POST' && p === '/api/diff_dirs') {
    await handleDiffDirs(body, res);
    return;
  }
  if (method === 'POST' && p === '/api/diff_urls') {
    await handleDiffUrls(body, res);
    return;
  }
  sendJson(res, 404, { ok: false, error: `未知路由：${method} ${p}` });
}

function isLoopback(addr) {
  return /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(addr || '');
}

const server = http.createServer((req, res) => {
  const remote = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!isLoopback(remote) && remote !== '::1') {
    sendJson(res, 403, { ok: false, error: '仅允许本机访问' });
    return;
  }
  let url;
  try {
    url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'URL 非法' });
    return;
  }
  handle(req, res, url).catch((e) => {
    // 业务错误：200 + ok:false（保持通道契约）；异常栈进 stderr
    try {
      fail(res, e && e.message ? e.message : String(e));
    } catch (_) { /* res 可能已结束 */ }
    slog('error', `${req.method} ${req.url} → ${e && e.message ? e.message : e}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  slog('info', `diff-desk service listening on 127.0.0.1:${PORT} (v${VERSION})`);
});

/* ============================ 心跳与收尾 ============================ */

let hbTimer = null;
async function heartbeat() {
  try {
    await kv.kvSet(`${KV_PREFIX}.meta`, {
      version: VERSION,
      port: PORT,
      pid: process.pid,
      startedAt: STARTED_AT,
      lastTickAt: Date.now(),
    });
  } catch (_) { /* 桥未就绪时静默，下轮再试 */ }
}

heartbeat();
hbTimer = setInterval(() => { void heartbeat(); }, 20000);
void loadSettings().then(applyProxyResolver);

function shutdown() {
  if (hbTimer) clearInterval(hbTimer);
  kv.kvDel(`${KV_PREFIX}.meta`).catch(() => {}).finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
