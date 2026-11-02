'use strict';
/**
 * main.js —— CDN 体检台后台服务（零依赖，node >= 18.15）
 *
 * 单一权威：一切核验/镜像/SRI/传播逻辑只在本服务执行；REST 是唯一命令面
 * （面板经宿主 cap.http 转发调用——跨域根治；MCP 直连本机端口）。
 * cap.kv 只做投影（发现键 cda.meta、报告 cda.report.*、历史 cda.history、
 * 传播观测 cda.watch.*），供三端同看与 MCP 兜底读取。
 *
 * 安全不变量：
 *  - 所有出网经 fetcher.js SSRF 围栏（IP 字面量/DNS 逐 IP 复检/重定向逐跳复检）；
 *  - allowLoopback 豁免只存在于 selftest 内部夹具这一处，公开 API 输入一律拒绝回环；
 *  - purge 单发 + 冷却（默认 10 分钟）——jsDelivr purge 连发会被静默限流
 *    （项目记忆实证 39~43 分钟），本服务是防呆闸而不是限流共犯；
 *  - 服务只绑 127.0.0.1；无写文件面；kv 投影内容不含完整抓取正文（仅哈希与元数据）。
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/cdn-core');
const { fencedFetch, fenceUrl, decodeBuffer, charsetFromContentType, setProxyResolver } = require('./fetcher');
const sources = require('./sources');

const VERSION = core.VERSION;
const TICK_MS = 1500;
const META_BEAT_MS = 60 * 1000;
const KEEP_REPORTS = 8;
const HISTORY_MAX = 60;
const KEEP_WATCHES = 20;
const RESOURCES_MAX = 60;
const URLS_MAX = 40;
const HTML_MAX = 2 * 1024 * 1024;
const BODY_MAX = 4 * 1024 * 1024;
const FETCH_CONCURRENCY = 6;
const SAMPLE_MAX = 240;

const K = {
  meta: 'cda.meta',
  settings: 'cda.settings',
  latest: 'cda.latest',
  runs: 'cda.runs',
  report: (id) => `cda.report.${id}`,
  reportPrefix: 'cda.report.',
  history: 'cda.history',
  watches: 'cda.watches',
  watch: (id) => `cda.watch.${id}`,
  purge: 'cda.purgeLast',
};

const DEFAULT_SETTINGS = {
  timeoutMs: 15000,
  maxBytesMB: 25,
  proxy: '',
  deep: 'auto', // auto = npm 权威双源（tarball+dataapi）；off = 仅 dataapi
  enabledMirrors: core.ALL_MIRROR_IDS,
  watchIntervalSec: 20,
  purgeCooldownMin: 10,
};

// ── 日志（自落盘 + 512KB 轮转）───────────────────────────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), 'cdn-audit');
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[cdn-audit:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) {
    try {
      let st = { size: 0 };
      try { st = fs.statSync(logFile); } catch (_) { /* 首次 */ }
      if (st.size > 512 * 1024) fs.writeFileSync(logFile, '');
      fs.appendFileSync(logFile, line + '\n');
    } catch (_) { /* 日志失败不影响业务 */ }
  }
}

// ── 状态 ────────────────────────────────────────────────────────────────────
const state = {
  appConfigDir: '',
  kv: null,
  startedAt: Date.now(),
  settings: { ...DEFAULT_SETTINGS },
  running: null, // { runId, kind, label, step, startedAt }
  watches: new Map(), // id → watch
};

function loadSettings(raw) {
  const s = raw || {};
  const mirrors = Array.isArray(s.enabledMirrors)
    ? s.enabledMirrors.filter((id) => core.ALL_MIRROR_IDS.includes(id))
    : DEFAULT_SETTINGS.enabledMirrors;
  return {
    timeoutMs: Number(s.timeoutMs) >= 3000 && Number(s.timeoutMs) <= 60000 ? Number(s.timeoutMs) : DEFAULT_SETTINGS.timeoutMs,
    maxBytesMB: Number(s.maxBytesMB) >= 1 && Number(s.maxBytesMB) <= 100 ? Number(s.maxBytesMB) : DEFAULT_SETTINGS.maxBytesMB,
    proxy: typeof s.proxy === 'string' ? s.proxy.slice(0, 120) : DEFAULT_SETTINGS.proxy,
    deep: s.deep === 'off' || s.deep === 'auto' ? s.deep : DEFAULT_SETTINGS.deep,
    enabledMirrors: mirrors.length ? mirrors : DEFAULT_SETTINGS.enabledMirrors,
    watchIntervalSec: Number(s.watchIntervalSec) >= 5 && Number(s.watchIntervalSec) <= 300 ? Number(s.watchIntervalSec) : DEFAULT_SETTINGS.watchIntervalSec,
    purgeCooldownMin: Number(s.purgeCooldownMin) >= 0 && Number(s.purgeCooldownMin) <= 120 ? Number(s.purgeCooldownMin) : DEFAULT_SETTINGS.purgeCooldownMin,
  };
}

async function loadSettingsFromKv() {
  try {
    const v = await state.kv.kvGet(K.settings);
    if (v && typeof v === 'object') state.settings = loadSettings(v);
  } catch (_) { /* 默认 */ }
  setProxyResolver(async () => state.settings.proxy);
}

// ── 抓取帮手 ────────────────────────────────────────────────────────────────
function shaAll(buf) {
  return {
    sha256: crypto.createHash('sha256').update(buf).digest('base64'),
    sha384: crypto.createHash('sha384').update(buf).digest('base64'),
    sha512: crypto.createHash('sha512').update(buf).digest('base64'),
  };
}

/** 围栏内抓取 + 摘要（allowLoopback 仅 selftest 内部夹具传 true，公开调用一律缺省 false） */
async function fetchResource(url, { timeoutMs, maxBytes, allowLoopback } = {}) {
  const started = Date.now();
  try {
    const res = await fencedFetch(url, {
      timeoutMs: timeoutMs || state.settings.timeoutMs,
      maxBytes: (maxBytes || state.settings.maxBytesMB) * 1024 * 1024,
      allowLoopback: allowLoopback === true,
    });
    return {
      ok: true, status: res.status, byteLength: res.byteLength, truncated: res.truncated,
      contentType: res.contentType, finalUrl: res.finalUrl, elapsedMs: Date.now() - started,
      digests: res.byteLength ? shaAll(res.buf) : null, buf: res.buf,
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), elapsedMs: Date.now() - started, fenced: (e && e.stage) === 'fence' };
  }
}

async function runPool(jobs, limit) {
  const out = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      try { out[i] = { ok: true, value: await jobs[i]() }; } catch (e) { out[i] = { ok: false, error: e }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return out;
}

function newRunId() { return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }

// ── 资源核验 ────────────────────────────────────────────────────────────────
/**
 * 单资源核验。返回 row：
 * { url, tag, cdnId, cdnLabel, family, pkg, ver, file,
 *   fetch: {ok,status,byteLength,elapsedMs,digests,error},
 *   verdict, verdictCn, auth: {tarball, dataapi, genuine, sourceNote, ver},
 *   sri: {attr, check, note}, sriTagSuggestion,
 *   note }
 */
async function auditResource(entry, opts) {
  let cls = core.classifyResourceUrl(entry.url);
  // selftest 专用通道：本地夹具主机不是已知 CDN，由夹具显式指定包/版本/文件，
  // 使管线走到权威比对分支（生产调用不传 forceRef，行为不变）。
  if (opts && opts.forceRef) {
    cls = { ...cls, family: 'npm', pkg: opts.forceRef.pkg, ver: opts.forceRef.ver, file: opts.forceRef.file };
  }
  const row = {
    url: entry.url,
    tag: entry.tag || 'url',
    sriAttr: entry.sriAttr || '',
    family: cls.family,
    cdnId: cls.cdnId || '',
    cdnLabel: cls.cdnLabel || '',
    host: cls.host || '',
    pkg: cls.pkg || '',
    ver: cls.ver || '',
    file: cls.file || '',
    fetch: null,
    verdict: 'error',
    auth: null,
    sri: null,
    sriTagSuggestion: null,
    note: '',
  };
  // ① 抓取实际内容（unknown 也要抓——至少给可达性；allowLoopback 仅 selftest 传入）
  const fetched = await fetchResource(entry.url, { ...opts, allowLoopback: opts.allowLoopback === true });
  row.fetch = {
    ok: fetched.ok, status: fetched.status, byteLength: fetched.byteLength,
    elapsedMs: fetched.elapsedMs, error: fetched.error || '', truncated: !!fetched.truncated,
    digests: fetched.digests || null,
  };
  if (!fetched.ok) {
    row.verdict = 'unreachable';
    row.note = fetched.error;
    return row;
  }
  const digests = fetched.digests;
  // ② 权威口径比对
  if (cls.family === 'npm') {
    if (!cls.ver && opts.noVersionResolve) {
      row.verdict = 'unverifiable';
      row.note = 'URL 未带版本号，且当前入口未启用版本解析';
      return finishRow(row);
    }
    try {
      const auth = await sources.authorityFor(cls, { timeoutMs: opts.timeoutMs });
      row.auth = { ver: auth.ver, genuine: auth.genuine, sourceNote: auth.sourceNote, tarball: !!auth.tarball, dataapi: !!auth.dataapi };
      row.ver = auth.ver || cls.ver || '';
      const official = (auth.tarball && auth.tarball.sha256) || null;
      const cdnSelf = (auth.dataapi && auth.dataapi.sha256) || null;
      if (official && official === digests.sha256) {
        row.verdict = 'match';
        row.note = 'npm tarball（真权威）一致' + (cdnSelf === digests.sha256 ? '，jsDelivr 口径亦一致（双源核验通过）' : '');
      } else if (!official && cdnSelf && cdnSelf === digests.sha256) {
        row.verdict = 'match';
        row.note = '与 jsDelivr 自报口径一致（npm tarball 源未取到：' + (auth.sourceNote || '未知原因') + '）';
      } else if (official && official !== digests.sha256) {
        row.verdict = 'mismatch';
        row.note = `与 npm tarball 官方内容不一致（官方 sha256 ${short(official)}，实际 ${short(digests.sha256)}）`;
      } else if (!official && cdnSelf && cdnSelf !== digests.sha256) {
        row.verdict = 'mismatch';
        row.note = `与 jsDelivr 自报口径不一致（口径 ${short(cdnSelf)}，实际 ${short(digests.sha256)})`;
      } else if (!auth.genuine) {
        row.verdict = 'cdn-generated';
        row.note = auth.sourceNote || '该文件不在官方包清单内（可能是 CDN 现场生成的 min 变体），无法权威核验';
      } else {
        row.verdict = 'unverifiable';
        row.note = auth.sourceNote || '权威源均不可用';
      }
    } catch (e) {
      row.verdict = 'unverifiable';
      row.note = `权威源查询失败：${String((e && e.message) || e).slice(0, 160)}`;
    }
  } else if (cls.family === 'cdnjs') {
    try {
      const sriMap = await sources.cdnjsSriMap(cls.pkg, cls.ver, { timeoutMs: opts.timeoutMs });
      if (sriMap === null) {
        row.verdict = 'unverifiable';
        row.note = `cdnjs 仓库未收录 ${cls.pkg}@${cls.ver}（镜像无法核验）`;
      } else {
        const expected = sriMap.get(cls.file);
        if (!expected) {
          row.verdict = 'unverifiable';
          row.note = 'cdnjs 该版本文件表中无此文件名（可能是镜像自生成文件）';
        } else {
          const p = core.parseSri(expected);
          if (p && digests[p.alg] === p.digest) {
            row.verdict = 'match-origin';
            row.note = '与 cdnjs 官方 SRI 一致（cdnjs 系权威口径）';
          } else {
            row.verdict = 'mismatch';
            row.note = `与 cdnjs 官方 SRI 不一致（期望 ${short(expected)}，实际 sha512 ${short(digests.sha512)}）`;
          }
        }
      }
    } catch (e) {
      row.verdict = 'unverifiable';
      row.note = `cdnjs API 查询失败：${String((e && e.message) || e).slice(0, 160)}`;
    }
  } else if (cls.family === 'gh') {
    row.verdict = 'unverifiable';
    row.note = 'gh/ 分发无逐文件权威源；请用「传播观测」对照源端（raw.githubusercontent）核验';
  } else {
    row.verdict = 'unverifiable';
    row.note = `非已知公共 CDN（${cls.host || '未知主机'}），无权威哈希源`;
  }
  return finishRow(row);
}

function finishRow(row) {
  // ③ SRI 属性核对 + 建议标签（仅在内容与官方一致、或无权威源但如实标注时给建议）
  if (row.fetch && row.fetch.digests) {
    const d = row.fetch.digests;
    if (entryHasIntegrity(row)) {
      const check = core.compareSri(row.sriAttr, d);
      row.sri = { attr: row.sriAttr, check, note: check === 'mismatch' ? '页面上的 integrity 与实际内容不符' : check === 'match' ? '页面上的 integrity 与实际内容一致' : '' };
    }
    if (row.verdict === 'match' || row.verdict === 'match-origin') {
      row.sriTagSuggestion = { integrity: core.sriTag('sha384', d.sha384), source: 'official' };
    } else if (row.verdict === 'unverifiable' || row.verdict === 'cdn-generated') {
      row.sriTagSuggestion = { integrity: core.sriTag('sha384', d.sha384), source: 'fetched' };
    }
  }
  return row;
}

function entryHasIntegrity(row) {
  return !!(row.sriAttr);
}

function short(b64) {
  const s = String(b64 || '');
  return s.length > 12 ? `${s.slice(0, 8)}…/${s.slice(-4)}` : s;
}

/** 汇编 check 报告的 findings 与评分 */
function buildCheckFindings(rows, skipped) {
  const findings = [];
  let allMatch = rows.length > 0;
  let missingSri = [];
  for (const r of rows) {
    if (r.verdict === 'mismatch') {
      allMatch = false;
      findings.push(core.F('red', 'integrity.mismatch', `资源与官方不一致：${hostOf(r)}`, `${r.url} —— ${r.note}`, '立即下线该引用，改用可信源或本地自托管；排查构建/网络链路是否被劫持'));
    }
    if (r.sri && r.sri.check === 'mismatch') {
      allMatch = false;
      findings.push(core.F('red', 'sri.mismatch', `integrity 属性与实际内容不符：${hostOf(r)}`, `${r.url} 的 integrity=${r.sri.attr} 与实际抓取内容不一致（浏览器会拒绝加载该资源）`, '用 SRI 页生成的正确标签替换，或核对该资源来源'));
    }
    if (r.verdict === 'unreachable') {
      allMatch = false;
      findings.push(core.F('yellow', 'resource.unreachable', `资源不可达：${hostOf(r)}`, `${r.url} —— ${r.note}`, '换用你网络可达的镜像（见镜像矩阵页），或本地自托管'));
    }
    if (r.verdict === 'mismatch') { /* 已计 */ } else if (r.verdict === 'cdn-generated') {
      findings.push(core.F('yellow', 'resource.cdn-generated', `CDN 现场生成文件：${hostOf(r)}`, `${r.url} —— ${r.note}`, '改用包内真实存在的文件路径，获得权威核验能力'));
    } else if (r.verdict === 'unverifiable') {
      allMatch = false;
      findings.push(core.F('yellow', 'resource.unverifiable', `无法权威核验：${hostOf(r)}`, `${r.url} —— ${r.note}`, '改用带版本号的 npm 系/cdnjs 系 URL，或本地自托管后用哈希自管'));
    }
    if ((r.tag === 'script' || r.tag === 'link') && !r.sriAttr) {
      missingSri.push(r);
    }
  }
  for (const r of missingSri.slice(0, 5)) {
    findings.push(core.F('yellow', 'sri.missing', `外链 ${r.tag} 未加 SRI：${hostOf(r)}`, r.url, '在 SRI 页生成带 integrity 的替换标签（crossorigin=anonymous）'));
  }
  if (missingSri.length > 5) {
    findings.push(core.F('yellow', 'sri.missing-more', `另有 ${missingSri.length - 5} 个外链未加 SRI`, '', ''));
  }
  if (allMatch) {
    findings.push(core.F('green', 'check.all-match', `全部 ${rows.length} 个资源与权威口径一致`, '', ''));
  } else if (rows.length && rows.every((r) => r.verdict === 'match' || r.verdict === 'match-origin' || r.verdict === 'unreachable' || r.verdict === 'unverifiable')) {
    findings.push(core.F('info', 'check.no-mismatch', '未发现内容不一致，但存在无法权威核验或不可达的资源', '', ''));
  }
  if (skipped) {
    const parts = [];
    if (skipped.relative) parts.push(`相对路径 ${skipped.relative} 个`);
    if (skipped.sameOrigin) parts.push(`同源 ${skipped.sameOrigin} 个`);
    if (skipped.dataUri) parts.push(`data: URI ${skipped.dataUri} 个`);
    if (parts.length) findings.push(core.F('info', 'check.skipped', `已跳过（不在公共 CDN 语义内）：${parts.join('、')}`, '', ''));
  }
  return findings;
}

function hostOf(row) {
  return row.cdnLabel || row.host || row.url.slice(0, 40);
}

// ── 任务：check ─────────────────────────────────────────────────────────────
async function runCheck(payload) {
  const opts = {
    timeoutMs: state.settings.timeoutMs,
    noVersionResolve: false,
  };
  const mode = payload.mode === 'html' ? 'html' : 'urls';
  let entries = [];
  let source = {};
  if (mode === 'urls') {
    const urls = Array.isArray(payload.urls) ? payload.urls.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (!urls.length) return { ok: false, error: '未提供任何 URL' };
    if (urls.length > URLS_MAX) return { ok: false, error: `URL 数量超上限（${URLS_MAX}）` };
    const seen = new Set();
    for (const u of urls) {
      const n = core.normalizeUrlInput(u);
      if (!n.ok) return { ok: false, error: `${u.slice(0, 60)}：${n.error}` };
      if (seen.has(n.url.toString())) continue;
      seen.add(n.url.toString());
      entries.push({ url: n.url.toString(), tag: 'url', sriAttr: '' });
    }
    source = { mode: 'urls', count: entries.length };
  } else {
    let html = typeof payload.html === 'string' ? payload.html : '';
    let baseUrl = '';
    if (payload.htmlUrl) {
      const n = core.normalizeUrlInput(payload.htmlUrl);
      if (!n.ok) return { ok: false, error: `htmlUrl：${n.error}` };
      baseUrl = n.url.toString();
      const page = await fetchResource(baseUrl, { maxBytes: 8 }); // 页面上限 8MB
      if (!page.ok) return { ok: false, error: `页面抓取失败：${page.error}` };
      if (page.status !== 200) return { ok: false, error: `页面返回 HTTP ${page.status}` };
      const decoded = decodeBuffer(page.buf, charsetFromContentType(page.contentType));
      html = decoded.text;
      source = { mode: 'html', htmlUrl: baseUrl, charset: decoded.charset, bytes: page.byteLength };
    } else {
      if (!html.trim()) return { ok: false, error: '未提供 HTML 内容' };
      if (html.length > HTML_MAX) return { ok: false, error: `HTML 超上限（${Math.round(HTML_MAX / 1024 / 1024)}MB）` };
      source = { mode: 'html', pasted: true };
      const meta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(html.slice(0, 2048));
      if (meta && meta[1] && !/utf-?8/i.test(meta[1])) {
        // 粘贴内容已是浏览器/编辑器解码后的文本，charset meta 仅作展示提示
      }
    }
    const extracted = core.extractExternalResources(html, baseUrl || undefined);
    entries = extracted.resources.map((r) => ({ url: r.url, tag: r.tag, sriAttr: r.integrity || '' }));
    if (!entries.length) {
      const rep = emptyReport('check', '（无外链资源）');
      rep.findings = [core.F('info', 'check.empty', '未在 HTML 中发现外部 script/link 引用', '', '确认页面结构，或改用 URL 列表模式')];
      rep.counts = core.countFindings(rep.findings);
      rep.score = { total: 100 };
      finishRep(rep);
      await persistReport(rep);
      return { ok: true, runId: rep.runId, report: rep };
    }
    if (entries.length > RESOURCES_MAX) {
      entries = entries.slice(0, RESOURCES_MAX);
      source.truncatedTo = RESOURCES_MAX;
    }
    source.skipped = extracted.skipped;
  }
  if (state.running) return { ok: false, error: '已有核验任务在运行，请稍候或先取消' };
  const runId = newRunId();
  const label = source.mode === 'html' ? (source.htmlUrl || '粘贴 HTML') : `${entries.length} 个 URL`;
  state.running = { runId, kind: 'check', label, step: 'fetch', startedAt: Date.now() };
  const rep = baseReport('check', label, runId);
  rep.source = source;
  try {
    const rows = [];
    let done = 0;
    const results = await runPool(entries.map((e) => async () => {
      const r = await auditResource(e, opts);
      done++;
      if (state.running && state.running.runId === runId) state.running.step = `核验 ${done}/${entries.length}`;
      return r;
    }), FETCH_CONCURRENCY);
    for (const r of results) rows.push(r.ok ? r.value : { url: '?', verdict: 'error', note: String((r.error && r.error.message) || r.error), tag: 'url', fetch: null });
    rep.rows = rows;
    rep.findings = core.sortFindings(buildCheckFindings(rows, source.skipped || null));
    rep.counts = core.countFindings(rep.findings);
    rep.score = { total: core.computeScore(rep.findings) };
    rep.summary = summarizeRows(rows);
    finishRep(rep);
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } catch (e) {
    log('warn', `check 异常：${e && e.stack}`);
    rep.ok = false;
    rep.fatal = { cn: '核验过程异常', detail: String((e && e.message) || e) };
    finishRep(rep);
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } finally {
    if (state.running && state.running.runId === runId) state.running = null;
  }
}

function summarizeRows(rows) {
  const c = { total: rows.length, match: 0, mismatch: 0, unverifiable: 0, unreachable: 0, cdnGenerated: 0, error: 0 };
  for (const r of rows) {
    if (r.verdict === 'match' || r.verdict === 'match-origin') c.match++;
    else if (r.verdict === 'mismatch') c.mismatch++;
    else if (r.verdict === 'unverifiable') c.unverifiable++;
    else if (r.verdict === 'unreachable') c.unreachable++;
    else if (r.verdict === 'cdn-generated') c.cdnGenerated++;
    else c.error++;
  }
  return c;
}

// ── 任务：mirror ────────────────────────────────────────────────────────────
async function runMirror(payload) {
  let cls;
  if (payload.url) {
    cls = core.classifyResourceUrl(payload.url);
    if (cls.family === 'unknown' || !cls.pkg) return { ok: false, error: `无法从该 URL 识别出包与文件（${cls.parseError || cls.family}）；镜像矩阵需要 npm 系或 cdnjs 系资源 URL` };
  } else if (payload.pkg && payload.file) {
    cls = { family: payload.family === 'cdnjs' ? 'cdnjs' : 'npm', pkg: String(payload.pkg), ver: String(payload.ver || ''), file: String(payload.file), cdnId: '', cdnLabel: '', host: '' };
  } else {
    return { ok: false, error: '需要 url 或 pkg+ver+file' };
  }
  const rows = [];
  const notes = [];
  if (cls.family === 'npm') {
    // 权威口径
    let auth = null;
    try {
      auth = await sources.authorityFor(cls, { timeoutMs: state.settings.timeoutMs });
    } catch (e) {
      notes.push(`权威源查询失败：${String((e && e.message) || e).slice(0, 120)}`);
    }
    if (!cls.ver && !(auth && auth.ver)) {
      return { ok: false, error: `无法确定版本号（${notes[0] || 'URL 未带 @version 且权威源不可达'}）——镜像矩阵必须钉版本` };
    }
    const variants = core.npmMirrorUrls({ ...cls, ver: (auth && auth.ver) || cls.ver });
    // 跨族：cdnjs 若收录同名库且文件名（basename）存在 → 一并纳入矩阵
    let crossFamily = [];
    if (!cls.pkg.startsWith('@')) {
      try {
        const sriMap = await sources.cdnjsSriMap(cls.pkg, (auth && auth.ver) || cls.ver, { timeoutMs: state.settings.timeoutMs });
        if (sriMap) {
          const base = cls.file.split('/').pop();
          if (sriMap.has(base)) {
            crossFamily = core.cdnjsMirrorUrls(cls.pkg, (auth && auth.ver) || cls.ver, base).map((v) => ({ ...v, crossFamily: true, expectSri: sriMap.get(base) }));
          } else {
            notes.push(`cdnjs 收录了 ${cls.pkg} 但无同名文件 ${base}，跨族矩阵跳过`);
          }
        }
      } catch (_) { /* cdnjs 不可达不阻塞 npm 族 */ }
    }
    const targets = [...variants, ...crossFamily].filter((v) => state.settings.enabledMirrors.includes(v.cdnId));
    if (!targets.length) return { ok: false, error: '没有启用的镜像可用于该资源（设置页可调整）' };
    const official = auth && ((auth.tarball && auth.tarball.sha256) || (auth.dataapi && auth.dataapi.sha256)) || null;
    const officialKind = auth && auth.tarball ? 'tarball' : auth && auth.dataapi ? 'dataapi' : null;
    const results = await runPool(targets.map((v) => async () => {
      const f = await fetchResource(v.url, {});
      const row = {
        cdnId: v.cdnId, label: v.label, url: v.url, crossFamily: !!v.crossFamily,
        status: f.ok ? f.status : 0, byteLength: f.ok ? f.byteLength : 0,
        elapsedMs: f.ok ? f.elapsedMs : null, error: f.ok ? '' : f.error,
        sha256: f.ok && f.digests ? f.digests.sha256 : '',
        verdict: 'unreachable',
        note: '',
      };
      if (!f.ok) { row.verdict = 'unreachable'; row.note = f.error; }
      else if (f.status !== 200) { row.verdict = 'unreachable'; row.note = `HTTP ${f.status}`; }
      else if (v.crossFamily && v.expectSri) {
        const p = core.parseSri(v.expectSri);
        if (p && f.digests && f.digests[p.alg] === p.digest) { row.verdict = 'match-origin'; row.note = '与 cdnjs 官方一致'; }
        else { row.verdict = 'mismatch'; row.note = '与 cdnjs 官方 SRI 不一致'; }
      } else if (!official) {
        row.verdict = 'unverifiable';
        row.note = '无权威口径可比对';
      } else if (f.digests && f.digests.sha256 === official) {
        row.verdict = officialKind === 'tarball' ? 'match' : 'match-origin';
        row.note = officialKind === 'tarball' ? '与 npm tarball 一致' : '与 jsDelivr 口径一致';
      } else {
        row.verdict = 'mismatch';
        row.note = `与官方不一致（官方 ${short(official)}）`;
      }
      return row;
    }), FETCH_CONCURRENCY);
    for (const r of results) rows.push(r.ok ? r.value : { cdnId: '?', label: '?', url: '?', verdict: 'error', note: String((r.error && r.error.message) || r.error), status: 0, byteLength: 0, elapsedMs: null, sha256: '' });
  } else if (cls.family === 'cdnjs') {
    const sriMap = await sources.cdnjsSriMap(cls.pkg, cls.ver, { timeoutMs: state.settings.timeoutMs }).catch((e) => { notes.push(`cdnjs API：${String((e && e.message) || e).slice(0, 120)}`); return undefined; });
    if (sriMap === undefined || sriMap === null) return { ok: false, error: (notes[0] || `cdnjs 未收录 ${cls.pkg}@${cls.ver}，无法建立跨镜像权威口径`) };
    const expect = sriMap.get(cls.file);
    if (!expect) return { ok: false, error: `cdnjs 文件表中无 ${cls.file}（检查文件名；cdnjs 常把 dist/ 前缀去掉）` };
    const variants = core.cdnjsMirrorUrls(cls.pkg, cls.ver, cls.file).filter((v) => state.settings.enabledMirrors.includes(v.cdnId));
    const p = core.parseSri(expect);
    const results = await runPool(variants.map((v) => async () => {
      const f = await fetchResource(v.url, {});
      const row = { cdnId: v.cdnId, label: v.label, url: v.url, crossFamily: false, status: f.ok ? f.status : 0, byteLength: f.ok ? f.byteLength : 0, elapsedMs: f.ok ? f.elapsedMs : null, error: f.ok ? '' : f.error, sha256: f.ok && f.digests ? f.digests.sha256 : '', verdict: 'unreachable', note: '' };
      if (!f.ok) { row.verdict = 'unreachable'; row.note = f.error; }
      else if (f.status !== 200) { row.verdict = 'unreachable'; row.note = `HTTP ${f.status}`; }
      else if (p && f.digests[p.alg] === p.digest) { row.verdict = 'match-origin'; row.note = '与 cdnjs 官方一致'; }
      else { row.verdict = 'mismatch'; row.note = '与 cdnjs 官方 SRI 不一致'; }
      return row;
    }), FETCH_CONCURRENCY);
    for (const r of results) rows.push(r.ok ? r.value : { cdnId: '?', label: '?', url: '?', verdict: 'error', note: String((r.error && r.error.message) || r.error), status: 0, byteLength: 0, elapsedMs: null, sha256: '' });
  } else {
    return { ok: false, error: '该 URL 不属于 npm 系/cdnjs 系，无镜像矩阵语义' };
  }
  const runId = newRunId();
  const label = cls.pkg && cls.file ? `${cls.pkg} @${cls.ver || '?'} / ${cls.file.split('/').pop()}` : String(payload.url || '').slice(0, 60);
  const rep = baseReport('mirror', label, runId);
  rep.rows = rows;
  rep.notes = notes;
  rep.summary = {
    total: rows.length,
    reachable: rows.filter((r) => r.status === 200).length,
    match: rows.filter((r) => r.verdict === 'match' || r.verdict === 'match-origin').length,
    mismatch: rows.filter((r) => r.verdict === 'mismatch').length,
  };
  const findings = [];
  for (const r of rows) {
    if (r.verdict === 'mismatch') findings.push(core.F('red', 'mirror.mismatch', `镜像 ${r.label} 内容与官方不一致`, `${r.url} —— ${r.note}`, '避免使用该镜像分发此资源；优先选择 match 行的镜像'));
    else if (r.verdict === 'unreachable') findings.push(core.F('yellow', 'mirror.unreachable', `镜像 ${r.label} 从本机网络不可达`, `${r.url} —— ${r.note}`, ''));
  }
  if (rep.summary.match > 0) {
    const okRows = rows.filter((r) => r.verdict === 'match' || r.verdict === 'match-origin');
    findings.push(core.F('green', 'mirror.ok', `从你的网络：${rep.summary.reachable}/${rep.summary.total} 个镜像可达，其中 ${okRows.length} 个与官方一致`, okRows.map((r) => r.label).join('、'), ''));
  }
  rep.findings = core.sortFindings(findings);
  rep.counts = core.countFindings(rep.findings);
  rep.score = { total: rep.summary.mismatch ? Math.max(0, 100 - rep.summary.mismatch * 30) : 100 };
  finishRep(rep);
  await persistReport(rep);
  return { ok: true, runId, report: rep };
}

// ── 任务：sri 生成 ──────────────────────────────────────────────────────────
async function runSri(payload) {
  const raw = String(payload.url || '').trim();
  if (!raw) return { ok: false, error: '需要资源 URL' };
  const n = core.normalizeUrlInput(raw);
  if (!n.ok) return { ok: false, error: n.error };
  const url = n.url.toString();
  const cls = core.classifyResourceUrl(url);
  const f = await fetchResource(url, {});
  if (!f.ok) return { ok: false, error: `抓取失败：${f.error}` };
  if (f.status !== 200) return { ok: false, error: `HTTP ${f.status}` };
  const d = f.digests;
  const tags = {
    script: `<script src="${url}" integrity="sha384-${d.sha384}" crossorigin="anonymous"></script>`,
    link: `<link rel="stylesheet" href="${url}" integrity="sha384-${d.sha384}" crossorigin="anonymous" />`,
    integrity: `sha384-${d.sha384}`,
    integrity512: `sha512-${d.sha512}`,
  };
  let source = 'fetched';
  let note = '哈希基于本次抓取内容。';
  if (cls.family === 'npm' && cls.ver) {
    try {
      const auth = await sources.authorityFor(cls, { timeoutMs: state.settings.timeoutMs });
      const official = auth && ((auth.tarball && auth.tarball.sha256) || (auth.dataapi && auth.dataapi.sha256));
      if (official && official === d.sha256) {
        source = 'official';
        note = auth.tarball ? '内容与 npm tarball 官方一致，哈希即官方哈希。' : '内容与 jsDelivr 自报口径一致。';
      } else if (official) {
        note = `⚠️ 本次抓取内容与官方口径不一致（疑似篡改），以下标签仅供取证，切勿引用！`;
        source = 'mismatch';
      }
    } catch (e) {
      note += `权威源查询失败：${String((e && e.message) || e).slice(0, 100)}`;
    }
  } else if (cls.family === 'cdnjs') {
    try {
      const sriMap = await sources.cdnjsSriMap(cls.pkg, cls.ver, { timeoutMs: state.settings.timeoutMs });
      const expected = sriMap && sriMap.get(cls.file);
      if (expected) {
        const p = core.parseSri(expected);
        if (p && d[p.alg] === p.digest) { source = 'official'; note = '内容与 cdnjs 官方 SRI 一致。'; tags.integrity512 = expected; }
        else { source = 'mismatch'; note = '⚠️ 与 cdnjs 官方 SRI 不一致，以下标签仅供取证，切勿引用！'; tags.integrity512 = expected; }
      }
    } catch (_) { /* 保持 fetched 口径 */ }
  }
  const runId = newRunId();
  const rep = baseReport('sri', `${cls.pkg || cls.host || url.slice(0, 40)}${cls.file ? ' / ' + cls.file.split('/').pop() : ''}`, runId);
  rep.rows = [{ url, cdnLabel: cls.cdnLabel || cls.host, family: cls.family, verdict: source === 'mismatch' ? 'mismatch' : 'match', byteLength: f.byteLength }];
  rep.tags = tags;
  rep.tagSource = source;
  rep.tagNote = note;
  const findings = [source === 'mismatch'
    ? core.F('red', 'sri.gen-mismatch', '该资源内容与官方口径不一致', note, '不要引用该内容；用镜像矩阵换可信源')
    : core.F(source === 'official' ? 'green' : 'info', 'sri.gen', 'SRI 标签已生成', note, '替换页面上的原标签，并保留 crossorigin="anonymous"')];
  rep.findings = core.sortFindings(findings);
  rep.counts = core.countFindings(rep.findings);
  rep.score = { total: source === 'mismatch' ? 0 : 100 };
  finishRep(rep);
  await persistReport(rep);
  return { ok: true, runId, report: rep };
}

// ── 传播观测（origin vs edge 对账）──────────────────────────────────────────
async function createWatch(payload) {
  const originUrl = String(payload.originUrl || '').trim();
  const edgeUrl = String(payload.edgeUrl || '').trim();
  const intervalSec = Math.max(5, Math.min(300, Number(payload.intervalSec) || state.settings.watchIntervalSec));
  const maxMinutes = Math.max(1, Math.min(720, Number(payload.maxMinutes) || 120));
  const on = core.normalizeUrlInput(originUrl);
  const ed = core.normalizeUrlInput(edgeUrl);
  if (!on.ok) return { ok: false, error: `originUrl：${on.error}` };
  if (!ed.ok) return { ok: false, error: `edgeUrl：${ed.error}` };
  // 观测目标也过围栏（观测只是反复抓取，不因形态特殊而豁免）
  const onF = fenceUrl(on.url.toString());
  const edF = fenceUrl(ed.url.toString());
  if (!onF.ok) return { ok: false, error: `originUrl：${onF.error}` };
  if (!edF.ok) return { ok: false, error: `edgeUrl：${edF.error}` };
  if (state.watches.size >= KEEP_WATCHES) return { ok: false, error: `观测数已达上限（${KEEP_WATCHES}），请先清理已结束的观测` };
  const id = `w${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const watch = {
    id, originUrl: on.url.toString(), edgeUrl: ed.url.toString(),
    intervalSec, maxMinutes,
    status: 'running', startedAt: new Date().toISOString(), nextPollAt: 0,
    deadline: Date.now() + maxMinutes * 60 * 1000,
    samples: [], finishedAt: null, equalSince: null, note: '',
  };
  state.watches.set(id, watch);
  await persistWatch(watch);
  await persistWatchList();
  return { ok: true, id, watch: publicWatch(watch) };
}

async function pollWatch(w) {
  if (w.polling) return;
  w.polling = true;
  w.nextPollAt = Date.now() + w.intervalSec * 1000;
  try {
    const [o, e] = await Promise.all([
      fetchResource(w.originUrl, { timeoutMs: Math.min(state.settings.timeoutMs, 15000), maxBytes: 8 }),
      fetchResource(w.edgeUrl, { timeoutMs: Math.min(state.settings.timeoutMs, 15000), maxBytes: 8 }),
    ]);
    const sample = {
      t: new Date().toISOString(),
      o: { ok: o.ok, status: o.status || 0, bytes: o.byteLength || 0, sha256: o.digests ? o.digests.sha256 : '' },
      e: { ok: e.ok, status: e.status || 0, bytes: e.byteLength || 0, sha256: e.digests ? e.digests.sha256 : '' },
      equal: false,
    };
    sample.equal = !!(o.ok && e.ok && o.status === 200 && e.status === 200 && o.digests && e.digests && o.digests.sha256 === e.digests.sha256);
    w.samples.push(sample);
    if (w.samples.length > SAMPLE_MAX) w.samples.shift();
    if (sample.equal) {
      w.status = 'equal';
      w.finishedAt = sample.t;
    } else if (Date.now() > w.deadline) {
      w.status = 'timeout';
      w.finishedAt = new Date().toISOString();
      w.note = '到达最大观测时长仍未一致';
    }
    await persistWatch(w);
    if (w.status !== 'running') await persistWatchList();
  } finally {
    w.polling = false;
  }
}

function publicWatch(w) {
  return {
    id: w.id, originUrl: w.originUrl, edgeUrl: w.edgeUrl, intervalSec: w.intervalSec,
    status: w.status, startedAt: w.startedAt, finishedAt: w.finishedAt,
    samples: w.samples, note: w.note,
    lastSample: w.samples.length ? w.samples[w.samples.length - 1] : null,
  };
}

async function persistWatch(w) {
  try { await state.kv.kvSet(K.watch(w.id), publicWatch(w)); } catch (_) { /* 投影失败不阻塞 */ }
}

async function persistWatchList() {
  const list = [...state.watches.values()].map((w) => ({
    id: w.id, status: w.status, startedAt: w.startedAt, finishedAt: w.finishedAt,
    originUrl: w.originUrl, edgeUrl: w.edgeUrl,
  }));
  try { await state.kv.kvSet(K.watches, list.slice(0, KEEP_WATCHES)); } catch (_) { /* 投影失败不阻塞 */ }
}

async function loadWatchesFromKv() {
  try {
    const list = await state.kv.kvGet(K.watches);
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || !item.id) continue;
      try {
        const full = await state.kv.kvGet(K.watch(item.id));
        if (full && full.samples) {
          // 服务重启会让 running 观测断流：如实标注 interrupted，不假装仍在跑
          if (full.status === 'running') { full.status = 'interrupted'; full.note = '服务重启导致观测中断，可重建'; }
          state.watches.set(full.id, { ...full, polling: false, nextPollAt: 0, deadline: Date.now() });
        }
      } catch (_) { /* 单个坏键不拖垮 */ }
    }
  } catch (_) { /* 无历史 */ }
}

async function cancelWatch(payload) {
  const w = state.watches.get(String(payload.id || ''));
  if (!w) return { ok: false, error: '观测不存在' };
  if (w.status === 'running') { w.status = 'cancelled'; w.finishedAt = new Date().toISOString(); }
  await persistWatch(w);
  await persistWatchList();
  return { ok: true, watch: publicWatch(w) };
}

async function deleteWatch(payload) {
  const id = String(payload.id || '');
  const w = state.watches.get(id);
  if (!w) return { ok: false, error: '观测不存在' };
  state.watches.delete(id);
  await state.kv.kvDel(K.watch(id)).catch(() => {});
  await persistWatchList();
  return { ok: true };
}

// ── purge（单发 + 冷却）─────────────────────────────────────────────────────
async function runPurge(payload) {
  const raw = String(payload.url || '').trim();
  if (!raw) return { ok: false, error: '需要要 purge 的 jsDelivr URL' };
  const n = core.normalizeUrlInput(raw);
  if (!n.ok) return { ok: false, error: n.error };
  const host = n.url.hostname.toLowerCase();
  if (!/(^|\.)jsdelivr\.net$/.test(host)) return { ok: false, error: '仅支持 jsDelivr 域名的 URL（cdn.jsdelivr.net 等）' };
  // 冷却防呆：连发 purge 会被 jsDelivr 静默限流（项目记忆实证 39~43 分钟）
  let last = null;
  try { last = await state.kv.kvGet(K.purge); } catch (_) { /* 无记录 */ }
  const cooldownMs = state.settings.purgeCooldownMin * 60 * 1000;
  if (last && last.at && cooldownMs > 0) {
    const remain = cooldownMs - (Date.now() - Date.parse(last.at));
    if (remain > 0) {
      return { ok: false, error: `purge 冷却中（上次 ${last.at}，还需 ${Math.ceil(remain / 60000)} 分钟）。冷却期内连发只会被静默限流，等边缘自然过期或到点再试。` };
    }
  }
  const purgeUrl = `https://purge.jsdelivr.net${n.url.pathname}`;
  const res = await fencedFetch(purgeUrl, { timeoutMs: 20000, maxBytes: 1024 * 1024, allowLoopback: false });
  let body = '';
  try { body = res.buf.toString('utf8').slice(0, 2000); } catch (_) { /* 忽略 */ }
  const record = { at: new Date().toISOString(), url: n.url.toString(), status: res.status };
  await state.kv.kvSet(K.purge, record).catch(() => {});
  return {
    ok: true,
    result: {
      httpStatus: res.status, body,
      note: res.status === 200 ? 'purge 请求已受理；边缘传播需要时间，用「传播观测」对账 origin vs edge。' : `purge 返回 HTTP ${res.status}（非 200 可能是限流或路径不存在）`,
    },
  };
}

// ── 报告持久化（cap.kv 投影）────────────────────────────────────────────────
function baseReport(kind, label, runId) {
  return {
    runId, kind, label,
    version: VERSION,
    startedAt: new Date().toISOString(),
    finishedAt: null, durationMs: 0,
    ok: true, fatal: null,
    source: null, rows: [], notes: [], findings: [], counts: null, score: null, summary: null,
  };
}

function finishRep(rep) {
  rep.finishedAt = new Date().toISOString();
  rep.durationMs = Date.now() - Date.parse(rep.startedAt);
  return rep;
}

function emptyReport(kind, label) {
  return baseReport(kind, label, newRunId());
}

async function persistReport(report) {
  try {
    await state.kv.kvSet(K.latest, report);
    let runs = [];
    try { const v = await state.kv.kvGet(K.runs); runs = Array.isArray(v) ? v : []; } catch (_) { /* 新库 */ }
    runs.unshift(report.runId);
    const keep = runs.slice(0, KEEP_REPORTS);
    for (const old of runs.slice(KEEP_REPORTS)) {
      if (!keep.includes(old)) await state.kv.kvDel(K.report(old)).catch(() => {});
    }
    await state.kv.kvSet(K.runs, keep);
    await state.kv.kvSet(K.report(report.runId), report);
    const entry = {
      runId: report.runId, at: report.finishedAt, kind: report.kind, label: report.label,
      score: report.score ? report.score.total : null, counts: report.counts || null, ok: report.ok !== false,
    };
    let h = [];
    try { const v = await state.kv.kvGet(K.history); h = Array.isArray(v) ? v : []; } catch (_) { /* 新库 */ }
    h.unshift(entry);
    await state.kv.kvSet(K.history, h.slice(0, HISTORY_MAX));
  } catch (e) {
    log('warn', `报告投影失败（不影响本机结果）：${e.message}`);
  }
}

// ── selftest（内置试金石：本地夹具服务 + 注入权威 + 全链路断言）──────────────
async function runSelftest() {
  const items = [];
  const t = (name, okv, detail) => items.push({ name, ok: !!okv, detail: detail || '' });
  const fixtureServed = {};
  const contentA = Buffer.from(`/*! left-pad 1.3.0 fixture A */\nmodule.exports = function leftpad(s, n) { return String(s).padStart(n, '0'); };\n`.repeat(3));
  const contentB = Buffer.from(`/*! left-pad 1.3.0 fixture A */\nmodule.exports = function leftpad(s, n) { return String(s).padStart(n, '0'); };\n`.repeat(3) + '\n;window.__tampered=1;\n');
  const digestA = crypto.createHash('sha256').update(contentA).digest('base64');
  let fixtureServer = null;
  let fixturePort = 0;
  try {
    // ① 本地夹具服务（模拟一个「CDN」）
    fixtureServer = http.createServer((req, res) => {
      const key = req.url;
      if (fixtureServed[key]) {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': fixtureServed[key].length });
        res.end(fixtureServed[key]);
      } else { res.writeHead(404); res.end(); }
    });
    await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
    fixturePort = fixtureServer.address().port;
    fixtureServed['/npm/left-pad@1.3.0/index.js'] = contentA;
    fixtureServed['/npm/left-pad@1.3.0/index.min.js'] = contentB;
    fixtureServed['/page.html'] = Buffer.from(`<!DOCTYPE html><html><head>
<script src="http://127.0.0.1:${fixturePort}/npm/left-pad@1.3.0/index.js" integrity="sha384-wrong"></script>
<script src="http://127.0.0.1:${fixturePort}/npm/left-pad@1.3.0/index.min.js"></script>
</head><body></body></html>`);
    // ② 注入本地权威（selftest 专用通道）
    sources.setTestAuthority((ref) => {
      if (ref.pkg === 'left-pad' && ref.ver === '1.3.0' && ref.file === 'index.js') {
        return { ver: '1.3.0', genuine: true, tarball: { sha256: digestA }, dataapi: { sha256: digestA }, sourceNote: '' };
      }
      if (ref.pkg === 'left-pad' && ref.ver === '1.3.0' && ref.file === 'index.min.js') {
        return { ver: '1.3.0', genuine: false, tarball: null, dataapi: null, sourceNote: '文件不在官方包清单（夹具模拟 CDN 现场生成）' };
      }
      return null; // 其它走真实源（本测试不会走到）
    });
    // ③ 核验管线全链路（内部通道才允许回环）
    const entries = [
      { url: `http://127.0.0.1:${fixturePort}/npm/left-pad@1.3.0/index.js`, tag: 'script', sriAttr: 'sha384-wrong' },
      { url: `http://127.0.0.1:${fixturePort}/npm/left-pad@1.3.0/index.min.js`, tag: 'script', sriAttr: '' },
    ];
    const rows = [];
    for (const e of entries) {
      rows.push(await auditResource(e, {
        timeoutMs: 5000, allowLoopback: true,
        forceRef: { pkg: 'left-pad', ver: '1.3.0', file: e.url.endsWith('index.min.js') ? 'index.min.js' : 'index.js' },
      }));
    }
    t('夹具一致资源判 match', rows[0].verdict === 'match', `verdict=${rows[0].verdict} note=${rows[0].note}`);
    t('一致资源 SRI 建议来自官方口径', rows[0].sriTagSuggestion && rows[0].sriTagSuggestion.source === 'official', JSON.stringify(rows[0].sriTagSuggestion));
    t('页面 integrity 属性错值被识别为 mismatch', rows[0].sri && rows[0].sri.check === 'mismatch', JSON.stringify(rows[0].sri));
    t('现场生成文件判 cdn-generated', rows[1].verdict === 'cdn-generated', `verdict=${rows[1].verdict} note=${rows[1].note}`);
    t('无 SRI 资源给出 fetched 口径建议', rows[1].sriTagSuggestion && rows[1].sriTagSuggestion.source === 'fetched', JSON.stringify(rows[1].sriTagSuggestion));
    // ④ findings 与评分
    const findings = core.sortFindings(buildCheckFindings(rows, null));
    t('不一致/缺 SRI 进入 findings', findings.some((f) => f.code === 'sri.mismatch') && findings.some((f) => f.code === 'sri.missing'), JSON.stringify(findings.map((f) => f.code)));
    const score = core.computeScore(findings);
    t('评分落在 0-100 且未满分', score >= 0 && score < 100, `score=${score}`);
    // ⑤ 围栏：公开口径（allowLoopback=false）必须拒绝回环
    const blocked = await fetchResource(`http://127.0.0.1:${fixturePort}/npm/left-pad@1.3.0/index.js`, { timeoutMs: 3000 });
    t('公开 API 通道拒绝回环地址', !blocked.ok && blocked.fenced, JSON.stringify({ ok: blocked.ok, error: blocked.error }));
    // ⑥ HTML 提取（core）
    const html = fixtureServed['/page.html'].toString();
    const ex = core.extractExternalResources(html);
    t('HTML 提取出 2 个外链 script', ex.resources.length === 2, JSON.stringify(ex.resources.map((r) => r.url)));
    t('HTML 提取带出 integrity 属性', ex.resources[0].integrity === 'sha384-wrong', ex.resources[0].integrity);
  } catch (e) {
    t('selftest 流程', false, String((e && e.stack) || e).slice(0, 300));
  } finally {
    sources.setTestAuthority(null);
    if (fixtureServer) { try { fixtureServer.close(); } catch (_) { /* 忽略 */ } }
  }
  return { ok: items.every((x) => x.ok), items };
}

// ── REST 路由 ───────────────────────────────────────────────────────────────
function sendJson(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) {
        reject(new Error(`请求体超上限（${Math.round(limit / 1024 / 1024)}MB）`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    port: server.address() ? server.address().port : 0,
    pid: process.pid,
    uptimeMs: Date.now() - state.startedAt,
    running: state.running
      ? { runId: state.running.runId, kind: state.running.kind, label: state.running.label, step: state.running.step, startedAt: state.running.startedAt }
      : null,
    watchesRunning: [...state.watches.values()].filter((w) => w.status === 'running').length,
  };
}

async function beatMeta() {
  try {
    await state.kv.kvSet(K.meta, metaPayload());
  } catch (e) {
    log('warn', `meta 投影失败：${String((e && e.message) || e)}`);
  }
}

async function executeStatus() {
  return { ok: true, result: metaPayload() };
}

async function executeSettingsGet() {
  return { ok: true, result: { ...state.settings, mirrors: core.NPM_FAMILY_MIRRORS.concat(core.CDNJSLIKE_MIRRORS).map((m) => ({ id: m.id, label: m.label, family: m.template.includes('{lib}') ? 'cdnjs' : 'npm' })) } };
}

async function executeSettingsSet(payload) {
  state.settings = loadSettings({ ...state.settings, ...(payload || {}) });
  try { await state.kv.kvSet(K.settings, state.settings); } catch (_) { /* kv 失败不影响本次生效 */ }
  setProxyResolver(async () => state.settings.proxy);
  log('info', `设置更新：timeout=${state.settings.timeoutMs} maxBytes=${state.settings.maxBytesMB}MB proxy=${state.settings.proxy || '无'} deep=${state.settings.deep} cooldown=${state.settings.purgeCooldownMin}min`);
  return executeSettingsGet();
}

async function executeHistory() {
  let h = [];
  try { const v = await state.kv.kvGet(K.history); h = Array.isArray(v) ? v : []; } catch (_) { /* 新库 */ }
  return { ok: true, result: { items: h } };
}

async function executeGetReport(payload) {
  const id = String((payload && payload.id) || payload || '');
  try {
    const v = await state.kv.kvGet(K.report(id));
    if (v) return { ok: true, result: v };
  } catch (_) { /* fallthrough */ }
  // 兜底：内存里刚跑完还没投影成功的
  return { ok: false, error: `报告不存在或已被清理：${id}` };
}

async function executeHistoryClear() {
  let runs = [];
  try { const v = await state.kv.kvGet(K.runs); runs = Array.isArray(v) ? v : []; } catch (_) { /* 新库 */ }
  for (const id of runs) await state.kv.kvDel(K.report(id)).catch(() => {});
  await state.kv.kvSet(K.runs, []).catch(() => {});
  await state.kv.kvSet(K.history, []).catch(() => {});
  return { ok: true, result: { cleared: true } };
}

const POST_ROUTES = {
  '/api/check': runCheck,
  '/api/mirror': runMirror,
  '/api/sri': runSri,
  '/api/watch': createWatch,
  '/api/watch_cancel': cancelWatch,
  '/api/watch_delete': deleteWatch,
  '/api/purge': runPurge,
  '/api/selftest': () => runSelftest(),
  '/api/history_clear': () => executeHistoryClear(),
  '/api/settings_set': executeSettingsSet,
  '/api/report': executeGetReport,
};

const GET_ROUTES = {
  '/api/status': executeStatus,
  '/api/settings': executeSettingsGet,
  '/api/history': executeHistory,
  '/api/watch_list': async () => ({ ok: true, result: { items: [...state.watches.values()].map(publicWatch) } }),
  '/api/watch_get': (q) => {
    const w = state.watches.get(q.get('id') || '');
    return w ? { ok: true, result: publicWatch(w) } : { ok: false, error: '观测不存在' };
  },
  '/api/report': (q) => executeGetReport({ id: q.get('id') || '' }),
};

async function handleApi(req, res, pathname, query) {
  try {
    if (req.method === 'GET' && GET_ROUTES[pathname]) {
      const r = await GET_ROUTES[pathname](query);
      sendJson(res, r);
      return;
    }
    if (req.method === 'POST' && POST_ROUTES[pathname]) {
      let payload = {};
      try {
        const raw = await readBody(req, BODY_MAX);
        payload = raw ? JSON.parse(raw) : {};
      } catch (e) {
        sendJson(res, { ok: false, error: e.message });
        return;
      }
      const r = await POST_ROUTES[pathname](payload);
      sendJson(res, r);
      return;
    }
    sendJson(res, { ok: false, error: `未知端点：${req.method} ${pathname}` });
  } catch (e) {
    log('warn', `API 异常 ${pathname}：${e && e.stack}`);
    sendJson(res, { ok: false, error: String((e && e.message) || e) });
  }
}

const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname.startsWith('/__health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, running: !!state.running }));
    return;
  }
  if (!u.pathname.startsWith('/api/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  handleApi(req, res, u.pathname, u.searchParams);
});

// 观测轮询 tick
setInterval(() => {
  (async () => {
    const now = Date.now();
    for (const w of state.watches.values()) {
      if (w.status === 'running' && !w.polling && now >= (w.nextPollAt || 0)) {
        // 逐个轮（避免并发风暴）；await 但不阻塞 tick 下轮判断
        pollWatch(w).catch((e) => log('warn', `watch ${w.id} 轮询失败：${String((e && e.message) || e)}`));
      }
    }
  })().catch(() => {});
}, TICK_MS);

function main() {
  state.appConfigDir = process.argv[3] || '';
  initLog(state.appConfigDir);
  state.kv = createKvClient({
    appConfigDir: state.appConfigDir,
    log: (lv, msg) => log(lv, msg),
  });
  (async () => {
    await loadSettingsFromKv();
    await loadWatchesFromKv();
    await beatMeta();
    log('info', `服务就绪 127.0.0.1:${server.address() ? server.address().port : PORT}`);
  })().catch((e) => log('warn', `初始化失败：${e.message}`));
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `REST 就绪 127.0.0.1:${server.address().port}`);
  });
  setInterval(beatMeta, META_BEAT_MS);
}

main();
