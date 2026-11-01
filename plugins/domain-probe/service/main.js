'use strict';
/**
 * main.js —— 域名诊断台后台服务（零依赖，node >= 18.15）
 *
 * 单写者权威：dom.meta / dom.settings / dom.latest / dom.report.* / dom.runs /
 * dom.history / dom.res 全部只由本服务写。面板与 MCP 经 dom.cmd 单槽信箱表达
 * 意图（{nonce, action, payload}）；服务轮询 get → delete 消费（先删后做防重放），
 * 结果写 dom.res（nonce 对齐）+ 持久态键。
 *
 * 安全不变量：
 *  - 全只读：DNS 走 DoH JSON API（端点固定白名单），证书走 tls.connect 只读取证，
 *    不发邮件、不写任何第三方系统、不存任何密钥；
 *  - 证书探测前过双重守卫：isDiagnosticsSafeHost（拒 IP 字面量/内网后缀）+
 *    DoH 解析结果逐 IP 复核（拒私网/环回/链路本地/CGNAT/云元数据），
 *    确认公网后才对「该 IP」发起连接（SNI 用原域名）；
 *  - DoH 端点固定白名单（见 shared/domain-core.js RESOLVERS），
 *    测试钩子 DOMPROBE_DOH_OVERRIDES 仅接受 http://127.0.0.1 前缀（离线联调用）。
 *
 * 生命周期：type=http + /__health（恒 200，降级也保活）；桥不可达 → degraded
 * 心跳，60s 重试自发现，绝不自饿死。单任务互斥可取消。
 *
 * 启动参数：node main.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const https = require('https');
const tls = require('tls');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/domain-core');

const VERSION = core.VERSION;
const TICK_MS = 1500;
const META_BEAT_MS = 60 * 1000;
const KEEP_REPORTS = 6;
const HISTORY_MAX = 60;
const QUEUE_MAX = 3;
const DOH_CONCURRENCY = 8;
const ANSWER_CAP = 40;              // 单查询答案条数上限（防异常区域刷屏）
const TXT_CAP = 2048;               // 单条 TXT 数据截断

const K = {
  meta: 'dom.meta',
  settings: 'dom.settings',
  latest: 'dom.latest',
  runs: 'dom.runs',
  report: (id) => `dom.report.${id}`,
  reportPrefix: 'dom.report.',
  history: 'dom.history',
  cmd: 'dom.cmd',
  res: 'dom.res',
};

const DEFAULT_SETTINGS = {
  primary: core.DEFAULT_PRIMARY,
  timeoutMs: 8000,
  enabledResolvers: core.RESOLVERS.map((r) => r.id),
  dkimSelectorsExtra: [],
};

// ── 日志（自落盘 + 512KB 轮转）───────────────────────────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), 'domain-probe');
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[domain-probe:${level}] ${new Date().toISOString()} ${msg}`;
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

// ── 解析器配置（白名单 + 测试钩子）───────────────────────────────────────────
/** 测试钩子：DOMPROBE_DOH_OVERRIDES = {"alidns":"http://127.0.0.1:9/dns"}。
 *  仅接受 http://127.0.0.1 / http://localhost 前缀——生产构建不提供本地 DoH 语义。 */
function loadDohOverrides() {
  const raw = process.env.DOMPROBE_DOH_OVERRIDES || '';
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out = {};
    for (const [id, ep] of Object.entries(obj)) {
      if (typeof ep === 'string' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(ep)) out[id] = ep;
    }
    if (Object.keys(out).length) log('warn', `DoH 测试钩子生效（仅限本地回环）：${Object.keys(out).join(',')}`);
    return out;
  } catch (_) { return {}; }
}
const DOH_OVERRIDES = loadDohOverrides();

function resolverById(id) {
  const base = core.RESOLVERS.find((r) => r.id === id);
  if (!base) return null;
  return DOH_OVERRIDES[id] ? { ...base, endpoint: DOH_OVERRIDES[id], overridden: true } : base;
}

// ── 状态 ────────────────────────────────────────────────────────────────────
const state = {
  appConfigDir: '',
  kv: null,
  degraded: false,
  lastBridgeErr: null,
  lastCmdNonce: '',
  queue: [],
  running: null,          // { runId, action, domain, step, startedAt, abort }
  settings: { ...DEFAULT_SETTINGS },
};

async function kvSet(key, value) { await state.kv.kvSet(key, value); }

function loadSettings(raw) {
  const s = raw || {};
  const enabled = Array.isArray(s.enabledResolvers)
    ? s.enabledResolvers.filter((id) => core.RESOLVERS.some((r) => r.id === id))
    : DEFAULT_SETTINGS.enabledResolvers;
  return {
    primary: core.RESOLVERS.some((r) => r.id === s.primary) ? s.primary : DEFAULT_SETTINGS.primary,
    timeoutMs: Number(s.timeoutMs) >= 2000 && Number(s.timeoutMs) <= 20000 ? Number(s.timeoutMs) : DEFAULT_SETTINGS.timeoutMs,
    enabledResolvers: enabled.length ? enabled : DEFAULT_SETTINGS.enabledResolvers,
    dkimSelectorsExtra: Array.isArray(s.dkimSelectorsExtra)
      ? s.dkimSelectorsExtra.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[\w.-]{1,63}$/.test(x)).slice(0, 12)
      : [],
  };
}

async function loadSettingsFromKv() {
  try {
    const v = await state.kv.kvGet(K.settings);
    if (v && typeof v === 'object') state.settings = loadSettings(v);
  } catch (_) { /* 默认 */ }
}

// ── fetch 帮手（超时 + 外部信号联动 + 响应限长）──────────────────────────────
function fetchWithTimeout(url, init, timeoutMs, outerSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  const onOuter = () => ctrl.abort(new Error('cancelled'));
  if (outerSignal) {
    if (outerSignal.aborted) { clearTimeout(timer); return Promise.reject(new Error('cancelled')); }
    outerSignal.addEventListener('abort', onOuter, { once: true });
  }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onOuter);
  });
}

// ── DoH 查询 ────────────────────────────────────────────────────────────────
function buildDohUrl(endpoint, name, typeNum) {
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}&type=${typeNum}`;
}

/** 单解析器 DoH 查询，返回 core.parseDohResponse 归一结果；失败抛错 */
async function dohQuery(resolverId, name, typeNum, { timeoutMs, signal } = {}) {
  const resolver = resolverById(resolverId);
  if (!resolver) throw new Error(`未知解析器：${resolverId}`);
  const url = buildDohUrl(resolver.endpoint, name, typeNum);
  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/dns-json', 'user-agent': `domain-probe/${VERSION}` },
  }, timeoutMs || state.settings.timeoutMs, signal);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 512 * 1024) throw new Error('响应超长');
  return core.parseDohResponse(JSON.parse(text));
}

/**
 * 带逐解析器降级的记录查询：按 enabledResolvers 顺序（primary 提前）逐个尝试。
 * 返回 { parsed, resolverUsed, failures:[{id,error}] }；全部失败抛错。
 */
async function queryWithFallback(name, typeNum, { timeoutMs, signal } = {}) {
  const order = resolverOrder();
  const failures = [];
  for (const id of order) {
    try {
      const parsed = await dohQuery(id, name, typeNum, { timeoutMs, signal });
      return { parsed, resolverUsed: id, failures };
    } catch (e) {
      failures.push({ id, error: String((e && e.message) || e) });
      if (signal && signal.aborted) throw new Error('cancelled');
    }
  }
  const err = new Error(`所有解析器均失败：${failures.map((f) => `${f.id}(${f.error})`).join('; ')}`);
  err.failures = failures;
  throw err;
}

function resolverOrder() {
  const enabled = state.settings.enabledResolvers.filter((id) => resolverById(id));
  const primary = state.settings.primary;
  return [primary, ...enabled.filter((id) => id !== primary)];
}

/** 并发受限地跑一批异步任务（保序返回结果/错误对象，不抛） */
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

// ── 证书探测（双重守卫后对已核验 IP 连接）────────────────────────────────────
async function probeCert(domain, { timeoutMs, signal } = {}) {
  // ① 域名形态守卫
  const guard = core.isDiagnosticsSafeHost(domain);
  if (!guard.ok) return { ok: false, refused: guard.reason };
  // ② 解析并逐 IP 复核（用 DoH 的答案，不用本机 resolver，保证「查过的就是连的」）
  const results = await runPool([
    () => queryWithFallback(domain, core.DNS_TYPES.A, { timeoutMs, signal }),
    () => queryWithFallback(domain, core.DNS_TYPES.AAAA, { timeoutMs, signal }),
  ], 2);
  const ips = [];
  const why = [];
  for (const r of results) {
    if (r.ok && r.value && r.value.parsed) {
      for (const a of r.value.parsed.answers) if (a.typeName === 'A' || a.typeName === 'AAAA') ips.push(a.data);
    } else if (!r.ok) {
      why.push(String((r.error && r.error.message) || r.error));
    } else if (r.value && r.value.__fail) {
      why.push(String((r.value.__fail && r.value.__fail.message) || r.value.__fail));
    }
  }
  const publicIp = ips.find((ip) => !core.isPrivateAnswerIp(ip));
  if (!publicIp) {
    if (!ips.length) return { ok: false, refused: `未能解析出任何地址${why.length ? `（${[...new Set(why)].slice(0, 3).join('; ')}）` : '（无 A/AAAA 记录）'}` };
    return { ok: false, refused: `解析出的地址均非公网（${ips.slice(0, 3).join(', ')}），按护栏拒绝连接` };
  }
  // ③ 对已核验 IP 建立只读 TLS 取证（SNI 用原域名）
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; try { sock.destroy(); } catch (_) { /* noop */ } resolve(r); } };
    const sock = tls.connect({
      host: publicIp, port: 443, servername: domain,
      rejectUnauthorized: false, timeout: timeoutMs || state.settings.timeoutMs,
    });
    sock.once('secureConnect', () => {
      try {
        const cert = sock.getPeerCertificate(true);
        done({
          ok: true,
          cert: core.shapeCertInfo(cert, domain, sock.getProtocol(), sock.authorizationError || ''),
          verifiedIp: publicIp,
        });
      } catch (e) { done({ ok: false, refused: String((e && e.message) || e) }); }
    });
    sock.once('error', (e) => done({ ok: false, refused: String((e && e.message) || e) }));
    sock.once('timeout', () => done({ ok: false, refused: '连接超时（443 端口未响应）' }));
    if (signal) signal.addEventListener('abort', () => done({ ok: false, refused: '已取消' }), { once: true });
  });
}

// ── 邮件身份采集 ────────────────────────────────────────────────────────────
/** 猜测父域（最后两段；诚实标注：未用 Public Suffix List，co.uk 类会猜错） */
function guessOrgDomain(domain) {
  const parts = String(domain || '').split('.');
  return parts.length >= 3 ? parts.slice(-2).join('.') : '';
}

async function collectMailIdentity(domain, { signal } = {}) {
  const jobs = {
    mx: () => queryWithFallback(domain, core.DNS_TYPES.MX, { signal }),
    txt: () => queryWithFallback(domain, core.DNS_TYPES.TXT, { signal }),
    dmarc: () => queryWithFallback(`_dmarc.${domain}`, core.DNS_TYPES.TXT, { signal }),
  };
  const org = guessOrgDomain(domain);
  if (org) jobs.dmarcOrg = () => queryWithFallback(`_dmarc.${org}`, core.DNS_TYPES.TXT, { signal }).catch((e) => ({ __fail: e }));
  const selectors = [...state.settings.dkimSelectorsExtra, ...core.COMMON_DKIM_SELECTORS];
  const dkimJobs = selectors.map((sel) => async () => {
    try {
      const r = await queryWithFallback(`${sel}._domainkey.${domain}`, core.DNS_TYPES.TXT, { signal });
      const txt = r.parsed.answers.find((a) => a.typeName === 'TXT');
      return { selector: sel, found: !!txt, record: txt ? core.parseDkimRecord(txt.data) : null, resolverUsed: r.resolverUsed };
    } catch (e) {
      if (String((e && e.message) || e) === 'cancelled') throw e;
      return { selector: sel, found: false, record: null, error: String((e && e.message) || e) };
    }
  });
  const allResults = await runPool([
    jobs.mx, jobs.txt, jobs.dmarc, ...(jobs.dmarcOrg ? [jobs.dmarcOrg] : []), ...dkimJobs,
  ], DOH_CONCURRENCY);
  const mxR = allResults[0];
  const txtR = allResults[1];
  const dmarcR = allResults[2];
  const dmarcOrgR = jobs.dmarcOrg ? allResults[3] : null;
  const dkimRs = allResults.slice(jobs.dmarcOrg ? 4 : 3); // 无父域查询时不可固定下标，否则吞掉第一个 DKIM 结果
  const grab = (r) => (r && r.ok ? r.value.parsed : null);
  const mxParsed = grab(mxR);
  const txtParsed = grab(txtR);
  const dmarcParsed = grab(dmarcR);
  const dmarcOrgParsed = jobs.dmarcOrg ? grab(dmarcOrgR) : null;
  const dkimProbed = dkimRs.map((r) => (r && r.ok ? r.value : { selector: '?', found: false }));
  return {
    mxParsed, txtParsed, dmarcParsed, dmarcOrgParsed, dkimProbed,
    orgGuess: jobs.dmarcOrg ? org : '',
    failures: [mxR, txtR, dmarcR].map((r) => (r && !r.ok ? r.error : null)).filter(Boolean),
  };
}

function buildMailFindings(mail, domain) {
  const out = [];
  const txtAnswers = mail.txtParsed ? mail.txtParsed.answers.filter((a) => a.typeName === 'TXT').map((a) => a.data.slice(0, TXT_CAP)) : [];
  const spfRecords = core.findSpfRecords(txtAnswers);
  const spfParse = spfRecords.length ? core.parseSpfRecord(spfRecords[0]) : null;
  const mxAnswers = mail.mxParsed ? mail.mxParsed.answers.filter((a) => a.typeName === 'MX') : [];
  const mxPresent = mxAnswers.length > 0 && !mxAnswers.every((a) => a.data === '' || a.data === '.');
  const hasA = false; // 邮件模式不查 A（full 模式才查），SPF 提示按 mxPresent 归类
  out.push(...core.spfFindings({ records: spfRecords, mxPresent, hasA, parse: spfParse }));
  const dmarcRecord = mail.dmarcParsed && mail.dmarcParsed.status === 0
    ? core.parseDmarcRecord((mail.dmarcParsed.answers.find((a) => a.typeName === 'TXT') || {}).data || '')
    : null;
  const orgRecord = mail.dmarcOrgParsed && mail.dmarcOrgParsed.status === 0
    ? core.parseDmarcRecord((mail.dmarcOrgParsed.answers.find((a) => a.typeName === 'TXT') || {}).data || '')
    : null;
  out.push(...core.dmarcFindings({ record: dmarcRecord, orgRecord, isSubdomain: !!mail.orgGuess && !dmarcRecord }));
  out.push(...core.dkimFindings(mail.dkimProbed));
  out.push(...core.mxFindings({ answers: mxAnswers, hasA: true }));
  return {
    findings: out,
    detail: {
      spf: { records: spfRecords, parse: spfParse, lookup: spfParse ? core.spfLookupCount(spfParse.terms) : null },
      dmarc: { record: dmarcRecord, orgRecord, orgGuess: mail.orgGuess },
      dkim: mail.dkimProbed.map((x) => ({ selector: x.selector, found: x.found, record: x.record ? { version: x.record.version, keyType: x.record.keyType, revoked: x.record.revoked, hasPubKey: x.record.hasPubKey, errors: x.record.errors, flags: x.record.flags } : null })),
      mx: { answers: mxAnswers, parsed: !!mail.mxParsed, statusCn: mail.mxParsed ? mail.mxParsed.statusCn : null },
    },
  };
}

// ── 报告持久化 ──────────────────────────────────────────────────────────────
async function persistReport(report) {
  await kvSet(K.latest, report);
  let runs = [];
  try { const v = await state.kv.kvGet(K.runs); runs = Array.isArray(v) ? v : []; } catch (_) { /* 新库 */ }
  runs.unshift(report.runId);
  const keep = runs.slice(0, KEEP_REPORTS);
  await kvSet(K.runs, keep);
  for (const old of runs.slice(KEEP_REPORTS)) await state.kv.kvDel(K.report(old)).catch(() => {});
  await kvSet(K.report(report.runId), report);
  const entry = {
    runId: report.runId, at: report.finishedAt, kind: report.kind, domain: report.domain,
    score: report.score ? report.score.total : null,
    counts: report.counts || null,
    ok: report.ok !== false,
  };
  let h = [];
  try { const v = await state.kv.kvGet(K.history); h = Array.isArray(v) ? v : []; } catch (_) { /* 新库 */ }
  h.unshift(entry);
  await kvSet(K.history, h.slice(0, HISTORY_MAX));
}

// ── 任务实现 ────────────────────────────────────────────────────────────────
function newRunId() { return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }

/** 诊断目标入口审查：规范化 + 安全守卫（拒 IP 字面量/环回/内网后缀——README 承诺不支持对 IP 探测） */
function vetDomainInput(input) {
  const dom = core.normalizeDomain(input);
  if (!dom.ok) return dom;
  const guard = core.isDiagnosticsSafeHost(dom.domain);
  if (!guard.ok) return { ok: false, reason: guard.reason };
  return dom;
}

function baseReport(kind, domain, runId) {
  return {
    runId, kind, domain,
    version: VERSION,
    startedAt: new Date().toISOString(),
    finishedAt: null, durationMs: 0,
    ok: true, fatal: null,
    resolversUsed: [], resolverFailures: [],
    sections: {}, findings: [], counts: null, score: null,
  };
}

function finishReport(rep, findings, sections) {
  rep.findings = core.sortFindings(findings);
  rep.counts = core.countFindings(rep.findings);
  rep.score = core.computeScore(rep.findings);
  rep.sections = sections || {};
  rep.finishedAt = new Date().toISOString();
  rep.durationMs = Date.now() - Date.parse(rep.startedAt);
  return rep;
}

async function runFullDiagnose(payload) {
  const dom = vetDomainInput(payload.domain);
  if (!dom.ok) return { ok: false, error: dom.reason };
  if (dom.warn) log('warn', `体检 ${dom.domain}：${dom.warn}`);
  const runId = newRunId();
  const abort = new AbortController();
  state.running = { runId, action: 'full', domain: dom.domain, step: 'dns', startedAt: Date.now(), abort };
  const rep = baseReport('full', dom.domain, runId);
  const used = new Set();
  const failures = [];
  const track = (r) => {
    const v = r && r.ok ? r.value : null;
    if (v && v.resolverUsed) used.add(v.resolverUsed);
    const fails = (v && v.failures) || (r && !r.ok && r.error && r.error.failures) || (r && r.failures) || [];
    failures.push(...fails);
  };
  try {
    // ① DNS 基础
    const [nsR, soaR, aR, aaaaR, caaR, dsR] = await runPool([
      () => queryWithFallback(dom.domain, core.DNS_TYPES.NS, { signal: abort.signal }),
      () => queryWithFallback(dom.domain, core.DNS_TYPES.SOA, { signal: abort.signal }),
      () => queryWithFallback(dom.domain, core.DNS_TYPES.A, { signal: abort.signal }),
      () => queryWithFallback(dom.domain, core.DNS_TYPES.AAAA, { signal: abort.signal }),
      () => queryWithFallback(dom.domain, core.DNS_TYPES.CAA, { signal: abort.signal }),
      () => queryWithFallback(dom.domain, core.DNS_TYPES.DS, { signal: abort.signal }),
    ], DOH_CONCURRENCY);
    if (state.running) state.running.step = 'email';
    [nsR, soaR, aR, aaaaR, caaR, dsR].forEach(track);
    const grab = (r) => (r && r.ok ? r.value.parsed : null);
    const nsParsed = grab(nsR);
    const soaParsed = grab(soaR);
    const aParsed = grab(aR);
    const aaaaParsed = grab(aaaaR);
    const caaParsed = grab(caaR);
    const dsParsed = grab(dsR);
    const allFailed = [nsParsed, soaParsed, aParsed, aaaaParsed].every((x) => x == null);
    if (allFailed) {
      rep.ok = false;
      rep.fatal = { cn: '所有解析器均不可达或查询全部失败', detail: [...new Set(failures.map((f) => `${f.id}: ${f.error}`))].slice(0, 6).join('; ') };
      rep.resolversUsed = [...used]; rep.resolverFailures = failures;
      finishReport(rep, [core.F('red', 'dns.all-failed', '所有解析器查询失败', rep.fatal.detail, '检查本机网络与防火墙后重试')], {});
      await persistReport(rep);
      return { ok: true, runId, report: rep };
    }
    // ② 邮件身份
    const mail = await collectMailIdentity(dom.domain, { signal: abort.signal });
    track({ resolverUsed: null, failures: mail.failures });
    if (state.running) state.running.step = 'cert';
    // ③ 证书（探测内部已含解析与守卫，不走解析器池，无需 track）
    const cert = await probeCert(dom.domain, { signal: abort.signal });
    // ④ findings 汇编（apex 地址检查已并入 dnsFindings，不重复拼接）
    const dnsFindings = [
      ...core.nsSoaFindings(nsParsed, soaParsed),
      ...core.apexAddressFindings(aParsed, aaaaParsed).findings,
      ...core.caaFindings(caaParsed ? caaParsed.answers.filter((x) => x.type === core.DNS_TYPES.CAA) : []),
      ...core.dnssecFindings(dsParsed),
    ];
    const mailBuilt = buildMailFindings(mail, dom.domain);
    const certFindings = cert.ok && cert.cert
      ? core.certFindings(cert.cert, dom.domain)
      : [core.F('yellow', 'cert.unavailable', '未取到证书信息', cert.refused || '443 未开放。若该域名不提供 HTTPS 可忽略。', '')];
    const sections = {
      dns: { ns: nsParsed, soa: soaParsed, a: aParsed, aaaa: aaaaParsed, caa: caaParsed, ds: dsParsed },
      mail: mailBuilt.detail,
      cert: cert.ok ? { ...cert.cert, verifiedIp: cert.verifiedIp } : { refused: cert.refused },
    };
    if (dom.warn) sections.note = { warn: dom.warn };
    rep.resolversUsed = [...used];
    rep.resolverFailures = failures;
    finishReport(rep, [...dnsFindings, ...mailBuilt.findings, ...certFindings], sections);
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } catch (e) {
    if (String((e && e.message) || e) === 'cancelled') {
      rep.ok = false; rep.fatal = { cn: '用户取消' };
      finishReport(rep, [], {});
      return { ok: false, error: '已取消', runId };
    }
    log('warn', `体检异常：${e && e.stack}`);
    rep.ok = false;
    rep.fatal = { cn: '体检过程异常', detail: String((e && e.message) || e) };
    finishReport(rep, [core.F('red', 'internal.error', '体检过程异常', rep.fatal.detail, '查看服务日志排查（设置页有日志路径）')], {});
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } finally {
    if (state.running && state.running.runId === runId) state.running = null;
  }
}

async function runEmailDiagnose(payload) {
  const dom = vetDomainInput(payload.domain);
  if (!dom.ok) return { ok: false, error: dom.reason };
  const runId = newRunId();
  const abort = new AbortController();
  state.running = { runId, action: 'email', domain: dom.domain, step: 'mail', startedAt: Date.now(), abort };
  const rep = baseReport('email', dom.domain, runId);
  try {
    const mail = await collectMailIdentity(dom.domain, { signal: abort.signal });
    const built = buildMailFindings(mail, dom.domain);
    rep.resolversUsed = [...new Set(mail.dkimProbed.filter((x) => x.resolverUsed).map((x) => x.resolverUsed))];
    rep.resolverFailures = mail.failures;
    finishReport(rep, built.findings, { mail: built.detail });
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } catch (e) {
    if (String((e && e.message) || e) === 'cancelled') return { ok: false, error: '已取消', runId };
    log('warn', `邮件体检异常：${e && e.stack}`);
    rep.ok = false; rep.fatal = { cn: '体检过程异常', detail: String((e && e.message) || e) };
    finishReport(rep, [core.F('red', 'internal.error', '体检过程异常', rep.fatal.detail, '查看服务日志')], {});
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } finally {
    if (state.running && state.running.runId === runId) state.running = null;
  }
}

async function runCertDiagnose(payload) {
  const dom = vetDomainInput(payload.domain);
  if (!dom.ok) return { ok: false, error: dom.reason };
  const runId = newRunId();
  const abort = new AbortController();
  state.running = { runId, action: 'cert', domain: dom.domain, step: 'cert', startedAt: Date.now(), abort };
  const rep = baseReport('cert', dom.domain, runId);
  try {
    const cert = await probeCert(dom.domain, { signal: abort.signal });
    const findings = cert.ok && cert.cert
      ? core.certFindings(cert.cert, dom.domain)
      : [core.F('yellow', 'cert.unavailable', '未取到证书信息', cert.refused || '', '')];
    finishReport(rep, findings, { cert: cert.ok ? { ...cert.cert, verifiedIp: cert.verifiedIp } : { refused: cert.refused } });
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } catch (e) {
    if (String((e && e.message) || e) === 'cancelled') return { ok: false, error: '已取消', runId };
    log('warn', `证书体检异常：${e && e.stack}`);
    rep.ok = false; rep.fatal = { cn: '体检过程异常', detail: String((e && e.message) || e) };
    finishReport(rep, [], {});
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } finally {
    if (state.running && state.running.runId === runId) state.running = null;
  }
}

async function runLookup(payload) {
  const dom = vetDomainInput(payload.domain);
  if (!dom.ok) return { ok: false, error: dom.reason };
  const type = core.resolveType(payload.type);
  if (!type) return { ok: false, error: `不支持的记录类型：${payload.type}（可用：${Object.keys(core.DNS_TYPES).join('/')}）` };
  const allResolvers = payload.allResolvers === true;
  const runId = newRunId();
  const abort = new AbortController();
  state.running = { runId, action: 'lookup', domain: dom.domain, step: `query ${type.name}`, startedAt: Date.now(), abort };
  const rep = baseReport('lookup', dom.domain, runId);
  try {
    let per = [];
    if (allResolvers) {
      const ids = state.settings.enabledResolvers.filter((id) => resolverById(id));
      const rs = await runPool(ids.map((id) => async () => {
        try {
          const parsed = await dohQuery(id, dom.domain, type.num, { signal: abort.signal, timeoutMs: state.settings.timeoutMs });
          return { resolver: id, ok: true, status: parsed.status, statusCn: parsed.statusCn, ad: parsed.ad, answers: parsed.answers };
        } catch (e) {
          return { resolver: id, ok: false, error: String((e && e.message) || e) };
        }
      }), DOH_CONCURRENCY);
      per = rs.map((r) => (r.ok ? r.value : { resolver: '?', ok: false, error: r.error && r.error.message }));
    } else {
      try {
        const r = await queryWithFallback(dom.domain, type.num, { signal: abort.signal });
        per = [{ resolver: r.resolverUsed, ok: true, status: r.parsed.status, statusCn: r.parsed.statusCn, ad: r.parsed.ad, answers: r.parsed.answers }];
      } catch (e) {
        per = [{ resolver: state.settings.primary, ok: false, error: String((e && e.message) || e) }];
      }
    }
    rep.resolversUsed = per.filter((x) => x.ok).map((x) => x.resolver);
    const diff = allResolvers ? core.diffResolvers(per) : null;
    const findings = [];
    const okRows = per.filter((x) => x.ok);
    if (!okRows.length) findings.push(core.F('red', 'lookup.failed', '查询失败', per.map((x) => x.error).filter(Boolean).join('; '), '检查网络后重试'));
    else if (okRows.every((x) => x.status === 3)) findings.push(core.F('yellow', 'lookup.nxdomain', '该名称不存在（NXDOMAIN）', '域名未注册、未配置，或类型写错。', ''));
    else if (okRows.every((x) => !x.answers.length)) findings.push(core.F('info', 'lookup.nodata', '该名称存在但无此类型记录（NOERROR/NODATA）', '', ''));
    else findings.push(core.F('green', 'lookup.ok', `共 ${okRows.reduce((n, x) => n + x.answers.length, 0)} 条答案`, '', ''));
    if (diff && !diff.consistent && diff.okCount > 0) {
      findings.push(core.F('yellow', 'lookup.divergent', '不同解析器返回的答案不一致（传播未完成或权威配置漂移）',
        `分组：${diff.groups.map((g) => `${g.resolvers.join('+')}→${g.answers.length}条`).join('；')}${diff.unreachable.length ? `；不可达：${diff.unreachable.map((u) => u.id).join(',')}` : ''}`,
        '刚改过解析请稍等 TTL 过期后复查；确认权威端正确后可联系托管商'));
    }
    finishReport(rep, findings, { query: { name: dom.domain, type: type.name }, per, diff });
    await persistReport(rep);
    return { ok: true, runId, report: rep };
  } finally {
    if (state.running && state.running.runId === runId) state.running = null;
  }
}

// ── 命令实现（轻操作）────────────────────────────────────────────────────────
async function executeGetState() {
  let latest = null;
  let history = [];
  try { latest = await state.kv.kvGet(K.latest); } catch (_) { /* 忽略 */ }
  try { const v = await state.kv.kvGet(K.history); history = Array.isArray(v) ? v : []; } catch (_) { /* 忽略 */ }
  return {
    ok: true,
    meta: metaPayload(),
    settings: state.settings,
    latest,
    history,
    resolvers: core.RESOLVERS.map((r) => ({ id: r.id, label: r.label, region: r.region, overridden: !!DOH_OVERRIDES[r.id] })),
  };
}

async function executeGetReport(payload) {
  const id = String(payload.runId || '');
  try {
    const v = await state.kv.kvGet(K.report(id));
    if (v) return { ok: true, report: v };
  } catch (_) { /* fallthrough */ }
  return { ok: false, error: `报告不存在或已被清理：${id}` };
}

async function executeCancel() {
  if (!state.running) return { ok: false, error: '当前没有运行中的任务' };
  state.running.abort.abort(new Error('cancelled'));
  return { ok: true };
}

async function executeSettingsSet(payload) {
  state.settings = loadSettings({ ...state.settings, ...(payload || {}) });
  try { await kvSet(K.settings, state.settings); } catch (_) { /* kv 失败不影响本次生效 */ }
  log('info', `设置更新：primary=${state.settings.primary} timeout=${state.settings.timeoutMs} enabled=${state.settings.enabledResolvers.join(',')} extraSelectors=${state.settings.dkimSelectorsExtra.join(',')}`);
  return { ok: true, settings: state.settings };
}

// ── 命令分发（单槽信箱：先删后做）────────────────────────────────────────────
const ACTIONS = {
  full: runFullDiagnose,
  email: runEmailDiagnose,
  cert: runCertDiagnose,
  lookup: runLookup,
  get_state: executeGetState,
  get_report: executeGetReport,
  cancel: executeCancel,
  settings_set: executeSettingsSet,
};
const HEAVY_ACTIONS = new Set(['full', 'email', 'cert', 'lookup']);

function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: state.running
      ? { runId: state.running.runId, action: state.running.action, domain: state.running.domain, step: state.running.step, startedAt: state.running.startedAt }
      : null,
  };
}

async function beatMeta() {
  try {
    await kvSet(K.meta, metaPayload());
    state.degraded = false;
    state.lastBridgeErr = null;
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
    log('warn', `meta 心跳失败（降级）：${state.lastBridgeErr}`);
  }
}

async function processQueue() {
  while (state.queue.length && !state.running) {
    const cmd = state.queue.shift();
    const fn = ACTIONS[cmd.action];
    let result;
    if (!fn) result = { ok: false, error: `未知 action：${cmd.action}（支持：${Object.keys(ACTIONS).join('/')}）` };
    else {
      try { result = await fn(cmd.payload); } catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
    }
    try {
      await kvSet(K.res, { nonce: cmd.nonce, action: cmd.action, at: new Date().toISOString(), result });
    } catch (e) {
      log('warn', `回执写入失败：${e.message}`);
    }
  }
}

async function tick() {
  try {
    const v = await state.kv.kvGet(K.cmd);
    if (v && typeof v === 'object' && v.nonce && v.nonce !== state.lastCmdNonce) {
      state.lastCmdNonce = v.nonce;
      await state.kv.kvDel(K.cmd); // 先删后做：两个消费者同时扫到时，删除天然互斥
      const action = String(v.action || '');
      if (HEAVY_ACTIONS.has(action) && state.running) {
        await kvSet(K.res, { nonce: v.nonce, action, at: new Date().toISOString(), result: { ok: false, error: `正忙（${state.running.domain} ${state.running.step}），可先取消或稍后再试` } }).catch(() => {});
      } else {
        state.queue.push({ nonce: v.nonce, action, payload: v.payload || {} });
        if (state.queue.length > QUEUE_MAX) state.queue.shift();
      }
    }
    if (state.degraded) { state.degraded = false; state.lastBridgeErr = null; }
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
  }
  await processQueue();
}

// ── HTTP 健康端点 ───────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2] || '0', 10) || 0;
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/__health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, running: !!state.running }));
    return;
  }
  res.writeHead(404);
  res.end();
});

function main() {
  state.appConfigDir = process.argv[3] || '';
  initLog(state.appConfigDir);
  state.kv = createKvClient({
    appConfigDir: state.appConfigDir,
    log: (lv, msg) => log(lv, msg),
  });
  (async () => {
    await loadSettingsFromKv();
    await beatMeta();
  })().catch((e) => log('warn', `初始化失败：${e.message}`));
  server.listen(PORT, '127.0.0.1', () => {
    log('info', `健康端点就绪 127.0.0.1:${server.address().port}/__health`);
  });
  setInterval(tick, TICK_MS);
  setInterval(beatMeta, META_BEAT_MS);
}

main();
