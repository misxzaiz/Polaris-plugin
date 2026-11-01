'use strict';
/**
 * main.js —— 模型体检台后台服务（零依赖，node >= 18.15）
 *
 * 单写者权威：llmprobe.meta / llmprobe.profiles / llmprobe.latest /
 * llmprobe.report.* / llmprobe.runs / llmprobe.history / llmprobe.bench.* /
 * llmprobe.res / llmprobe.settings 全部只由本服务写。面板与 MCP 经
 * llmprobe.cmd 单槽信箱表达意图（{nonce, action, payload}）；服务轮询
 * get → delete 消费（单消费者无竞态，刻意避开 kv list 全量扫描），
 * 结果写 llmprobe.res（nonce 对齐）+ 持久态键。
 *
 * 档案权威与安全分层：
 *   - 完整 apiKey 只存在于服务内存与手动档案本地文件
 *     （{{appConfigDir}}/llm-probe/profiles.json，与宿主 config.json 同信任域）；
 *   - 宿主档案导入 = 只读宿主 config.json 的 modelProfiles[]（服务与后端同机，
 *     不经 cap.config——HTTP 通道 Remote 来源会把 apiKey 掩码成哨兵，读不到原文）；
 *   - 落 kv 的一切（档案/报告/历史/AI 返回）均为掩码形态（****<last4>）；
 *   - 成本护栏：体检每步 max_tokens≤16；基准测试显式发起，无任何定时任务。
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
const crypto = require('crypto');

const { createKvClient } = require('./kvclient');
const core = require('../shared/probe-core');

const VERSION = core.VERSION;
const TICK_MS = 1500;
const META_BEAT_MS = 60 * 1000;
const KEEP_REPORTS = 5;            // 保留最近 N 份体检报告（runs 索引驱动清理，不用 kv list）
const KEEP_BENCH = 3;
const HISTORY_MAX = 80;
const QUEUE_MAX = 3;               // 命令本地队列上限（超出丢最旧并回执错误）
const RESULT_TTL_MS = 10 * 60 * 1000;

const K = {
  meta: 'llmprobe.meta',
  profiles: 'llmprobe.profiles',
  latest: 'llmprobe.latest',
  runs: 'llmprobe.runs',
  report: (id) => `llmprobe.report.${id}`,
  reportPrefix: 'llmprobe.report.',
  bench: (id) => `llmprobe.bench.${id}`,
  benchPrefix: 'llmprobe.bench.',
  history: 'llmprobe.history',
  settings: 'llmprobe.settings',
  cmd: 'llmprobe.cmd',
  res: 'llmprobe.res',
};

// ── 日志（自落盘 + 512KB 轮转；绝不落 apiKey）────────────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), 'llm-probe');
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[llm-probe:${level}] ${new Date().toISOString()} ${msg}`;
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
  degraded: false,
  lastBridgeErr: null,
  lastCmdNonce: '',
  queue: [],
  running: null,          // { runId, action, profileName, step, startedAt, abort }
  settings: { chatMs: 30000, streamMs: 60000, modelsMs: 15000 },
  benchRun: null,         // { runId, profileName, sizes, rounds, done, total }
};

// ── 档案存储 ────────────────────────────────────────────────────────────────
/** 内存档案（含完整 key；绝不落 kv） */
const profiles = new Map();

function profilesFilePath() {
  return path.join(state.appConfigDir || os.tmpdir(), 'llm-probe', 'profiles.json');
}

function loadManualProfiles() {
  try {
    const raw = JSON.parse(fs.readFileSync(profilesFilePath(), 'utf8'));
    for (const p of (Array.isArray(raw) ? raw : [])) {
      if (p && p.id && p.baseUrl) profiles.set(p.id, sanitizeProfile(p, 'manual'));
    }
    log('info', `手动档案载入 ${profiles.size} 条`);
  } catch (_) { /* 首次/无文件 */ }
}

function saveManualProfiles() {
  const list = [...profiles.values()].filter((p) => p.source === 'manual');
  const file = profilesFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    log('warn', `手动档案保存失败（内存仍有效）：${e.message}`);
    return false;
  }
  return true;
}

function sanitizeProfile(p, source) {
  return {
    id: String(p.id || '').slice(0, 64),
    name: String(p.name || '未命名').slice(0, 80),
    baseUrl: String(p.baseUrl || '').trim(),
    apiKey: String(p.apiKey || ''),
    model: String(p.model || '').trim(),
    wire: p.wire === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions',
    source: source === 'host' ? 'host' : 'manual',
    importedAt: p.importedAt || new Date().toISOString(),
  };
}

/** 宿主 config.json 定位（与 kvclient 候选序一致） */
function hostConfigCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* 跳过 */ }
  }
  if (state.appConfigDir) cands.push(path.join(state.appConfigDir, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

/** 导入宿主 modelProfiles（幂等：按 id upsert，host 来源不覆盖手动档案同名 id） */
function importHostProfiles() {
  let imported = 0;
  let seenFile = null;
  for (const p of hostConfigCandidates()) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const list = Array.isArray(cfg.modelProfiles) ? cfg.modelProfiles : [];
      seenFile = p;
      for (const m of list) {
        if (!m || !m.baseUrl) continue;
        const id = `host-${String(m.id || crypto.createHash('md5').update(String(m.baseUrl) + String(m.model)).digest('hex').slice(0, 10))}`;
        const existing = profiles.get(id);
        if (existing && existing.source === 'manual') continue; // 手动优先，不覆盖
        profiles.set(id, sanitizeProfile({
          id,
          name: m.name || m.id || '宿主档案',
          baseUrl: m.baseUrl,
          apiKey: m.apiKey,
          model: m.model,
          // wire：宿主缺省 = anthropic-messages（ModelProfile wire_api None 语义）
          wire: m.wireApi === 'openai-chat-completions' ? 'openai-chat-completions' : 'anthropic-messages',
          importedAt: new Date().toISOString(),
        }, 'host'));
        imported += 1;
      }
      // providerGroups 成员 keys 也是可用端点（多 key 池），导出为独立档案
      const groups = Array.isArray(cfg.providerGroups) ? cfg.providerGroups : [];
      for (const g of groups) {
        for (const mem of (Array.isArray(g.members) ? g.members : [])) {
          const keys = Array.isArray(mem.keys) ? mem.keys : (mem.key ? [mem.key] : []);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!k || !mem.baseUrl) continue;
            const id = `hostgrp-${crypto.createHash('md5').update(String(mem.baseUrl) + String(k) + String(i)).digest('hex').slice(0, 10)}`;
            if (profiles.has(id)) continue;
            profiles.set(id, sanitizeProfile({
              id,
              name: `${g.name || '分组'}·${mem.name || mem.profileId || '成员'}${keys.length > 1 ? `#${i + 1}` : ''}`,
              baseUrl: mem.baseUrl,
              apiKey: typeof k === 'string' ? k : '',
              model: mem.model || g.defaultModel || '',
              wire: mem.wireApi === 'openai-chat-completions' ? 'openai-chat-completions' : 'anthropic-messages',
              importedAt: new Date().toISOString(),
            }, 'host'));
            imported += 1;
          }
        }
      }
      if (list.length || groups.length) break; // 命中含档案的配置文件即止
    } catch (_) { /* 下一候选 */ }
  }
  log('info', `宿主档案导入 ${imported} 条（总数 ${profiles.size}）${seenFile ? ` @ ${seenFile}` : ''}`);
  return { imported, total: profiles.size, configFile: seenFile || '' };
}

function maskedProfiles() {
  return [...profiles.values()].map((p) => ({
    id: p.id, name: p.name, baseUrl: p.baseUrl, model: p.model, wire: p.wire,
    keyMask: core.maskKey(p.apiKey), source: p.source, importedAt: p.importedAt,
  }));
}

// ── kv 持久态写入 ───────────────────────────────────────────────────────────
async function kvSet(key, value) { await state.kv.kvSet(key, value); }

async function publishProfiles() {
  await kvSet(K.profiles, { at: new Date().toISOString(), items: maskedProfiles() });
}

async function loadHistory() {
  try {
    const v = await state.kv.kvGet(K.history);
    return Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
  } catch (_) { return []; }
}

async function pushHistory(entry) {
  const h = await loadHistory();
  h.unshift(entry);
  await kvSet(K.history, h.slice(0, HISTORY_MAX));
}

async function loadSettings() {
  try {
    const v = await state.kv.kvGet(K.settings);
    if (v && typeof v === 'object') {
      state.settings = {
        chatMs: Number(v.chatMs) > 2000 ? Number(v.chatMs) : 30000,
        streamMs: Number(v.streamMs) > 5000 ? Number(v.streamMs) : 60000,
        modelsMs: Number(v.modelsMs) > 2000 ? Number(v.modelsMs) : 15000,
      };
    }
  } catch (_) { /* 默认 */ }
}

// ── 运行执行器 ──────────────────────────────────────────────────────────────
function newRunId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function stepOfRunning() {
  return state.running ? state.running.step : null;
}

async function executeRunSuite(payload) {
  const profile = profiles.get(String(payload.profileId || ''));
  if (!profile) return { ok: false, error: `档案不存在：${payload.profileId}（可能尚未导入，先执行「导入宿主档案」或手动添加）` };
  const runId = newRunId();
  const abort = new AbortController();
  state.running = { runId, action: 'run_suite', profileName: profile.name, step: 'connect', startedAt: Date.now(), abort };
  const stepNames = ['connect', 'chat', 'models', 'stream', 'tools'];
  let stepIdx = 0;
  // 步骤进度：探针各步之间没有回调钩子，用轻量定时器按步骤推进展示（仅 UI 进度，非断言）
  const progress = setInterval(() => {
    stepIdx = Math.min(stepIdx + 1, stepNames.length - 1);
    if (state.running) state.running.step = stepNames[stepIdx];
  }, 2500);
  let report;
  try {
    report = await core.runSuite(profile, {
      runId,
      signal: abort.signal,
      timeouts: state.settings,
      fetchImpl: (url, init) => fetch(url, init),
    });
  } catch (e) {
    report = { ...core.maskedProfileOf(profile, { runId, steps: {} }), error: String((e && e.message) || e), score: core.computeScore({}), verdict: core.verdictOf(0) };
  } finally {
    clearInterval(progress);
  }
  if (state.running && state.running.runId === runId) state.running = null;
  // 持久化：latest + report.* + runs 索引 + history
  await kvSet(K.latest, report);
  const runs = await (async () => {
    try { const v = await state.kv.kvGet(K.runs); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  })();
  runs.unshift(runId);
  const keep = runs.slice(0, KEEP_REPORTS);
  await kvSet(K.runs, keep);
  for (const old of runs.slice(KEEP_REPORTS)) await state.kv.kvDel(K.report(old)).catch(() => {});
  await kvSet(K.report(runId), report);
  const s = report.score || {};
  await pushHistory({
    runId, at: new Date().toISOString(), profileId: profile.id, profileName: profile.name,
    kind: 'suite', score: s.total || 0, verdict: (report.verdict && report.verdict.cn) || '',
    ttftMs: report.steps && report.steps.stream && report.steps.stream.ok ? report.steps.stream.ttftMs : null,
    tps: report.steps && report.steps.stream && report.steps.stream.ok ? report.steps.stream.tps : null,
    ok: !!(report.steps && report.steps.chat && report.steps.chat.ok),
  });
  return { ok: true, runId, report };
}

async function executeRunBench(payload) {
  const profile = profiles.get(String(payload.profileId || ''));
  if (!profile) return { ok: false, error: `档案不存在：${payload.profileId}` };
  let urls;
  try { urls = core.resolveUrls(profile.baseUrl, profile.wire); } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
  const runId = newRunId();
  const sizes = Array.isArray(payload.sizes) ? payload.sizes.filter((n) => [64, 512, 2048].includes(n)) : [512];
  const rounds = Math.min(Math.max(Number(payload.rounds) || 2, 1), 5);
  const abort = new AbortController();
  state.running = { runId, action: 'run_bench', profileName: profile.name, step: `bench ${sizes.join('/')}`, startedAt: Date.now(), abort };
  let bench;
  try {
    bench = await core.runBenchmark(profile, urls, { signal: abort.signal, sizes, rounds });
  } catch (e) {
    bench = { ok: false, sizes: [], compat: [String((e && e.message) || e)] };
  }
  if (state.running && state.running.runId === runId) state.running = null;
  const report = { ...core.maskedProfileOf(profile, { runId, kind: 'bench', finishedAt: new Date().toISOString(), sizes, rounds }), bench };
  await kvSet(K.bench(runId), report);
  const runs = await (async () => {
    try { const v = await state.kv.kvGet(K.benchRuns || 'llmprobe.benchruns'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  })();
  runs.unshift(runId);
  const keep = runs.slice(0, KEEP_BENCH);
  await kvSet('llmprobe.benchruns', keep);
  for (const old of runs.slice(KEEP_BENCH)) await state.kv.kvDel(K.bench(old)).catch(() => {});
  await pushHistory({
    runId, at: new Date().toISOString(), profileId: profile.id, profileName: profile.name,
    kind: 'bench', score: null, verdict: bench.ok ? `基准完成（${sizes.join('/')} tok × ${rounds}）` : '基准失败',
    ttftMs: bench.ok && bench.sizes[0] ? bench.sizes[0].ttftP50 : null,
    tps: bench.ok && bench.sizes[0] ? bench.sizes[0].tpsP50 : null,
    ok: !!bench.ok,
  });
  return { ok: true, runId, report };
}

async function executeImport() {
  const r = importHostProfiles();
  await publishProfiles();
  return { ok: true, ...r };
}

async function executeProfilesUpsert(payload) {
  const p = payload.profile || {};
  if (!p.baseUrl) return { ok: false, error: 'baseUrl 必填' };
  if (!p.apiKey && !payload.allowEmptyKey) return { ok: false, error: 'apiKey 必填（本地无鉴权端点可在名称中注明）' };
  const id = String(p.id || '').trim() || `manual-${crypto.randomBytes(4).toString('hex')}`;
  profiles.set(id, sanitizeProfile({ ...p, id, importedAt: profiles.get(id) && profiles.get(id).importedAt }, 'manual'));
  const saved = saveManualProfiles();
  await publishProfiles();
  return { ok: true, id, savedToFile: saved };
}

async function executeProfilesDelete(payload) {
  const p = profiles.get(String(payload.id || ''));
  if (!p) return { ok: false, error: `档案不存在：${payload.id}` };
  if (p.source === 'host' && !payload.force) return { ok: false, error: '宿主导入档案由宿主配置派生，删除请用 force:true（或从宿主设置移除后重新导入）' };
  profiles.delete(String(payload.id));
  const saved = saveManualProfiles();
  await publishProfiles();
  return { ok: true, savedToFile: saved };
}

async function executeGetReport(payload) {
  const id = String(payload.runId || '');
  try {
    const v = payload.kind === 'bench'
      ? await state.kv.kvGet(K.bench(id))
      : await state.kv.kvGet(K.report(id));
    if (v) return { ok: true, report: v };
  } catch (_) { /* fallthrough */ }
  return { ok: false, error: `报告不存在或已被清理：${id}` };
}

async function executeGetState() {
  let latest = null;
  let history = [];
  try { latest = await state.kv.kvGet(K.latest); } catch (_) { /* 忽略 */ }
  history = await loadHistory();
  return {
    ok: true,
    profiles: maskedProfiles(),
    meta: metaPayload(),
    latest,
    history,
  };
}

async function executeCancel() {
  if (!state.running) return { ok: false, error: '当前没有运行中的任务' };
  state.running.abort.abort(new Error('用户取消'));
  return { ok: true };
}

async function executeSettingsSet(payload) {
  const s = payload || {};
  state.settings = {
    chatMs: Number(s.chatMs) > 2000 ? Number(s.chatMs) : 30000,
    streamMs: Number(s.streamMs) > 5000 ? Number(s.streamMs) : 60000,
    modelsMs: Number(s.modelsMs) > 2000 ? Number(s.modelsMs) : 15000,
  };
  try { await kvSet(K.settings, state.settings); } catch (_) { /* kv 失败不影响本次生效 */ }
  log('info', `超时设置更新：chat=${state.settings.chatMs} stream=${state.settings.streamMs} models=${state.settings.modelsMs}`);
  return { ok: true, settings: state.settings };
}

// ── 命令分发 ────────────────────────────────────────────────────────────────
const ACTIONS = {
  run_suite: executeRunSuite,
  run_bench: executeRunBench,
  import_host: executeImport,
  profiles_upsert: executeProfilesUpsert,
  profiles_delete: executeProfilesDelete,
  get_report: executeGetReport,
  get_state: executeGetState,
  cancel: executeCancel,
  settings_set: executeSettingsSet,
};

function metaPayload() {
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: state.running
      ? { runId: state.running.runId, action: state.running.action, profileName: state.running.profileName, step: state.running.step, startedAt: state.running.startedAt }
      : null,
    profileCount: profiles.size,
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
    else if (cmd.action === 'run_suite' || cmd.action === 'run_bench') {
      // 重活直接执行（state.running 已在内部设置）
      try { result = await fn(cmd.payload); } catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
    } else {
      try { result = await fn(cmd.payload); } catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
    }
    // 写回执（保留最近一条；面板/MCP 按 nonce 对齐）
    try {
      await kvSet(K.res, { nonce: cmd.nonce, action: cmd.action, at: new Date().toISOString(), result });
    } catch (e) {
      log('warn', `回执写入失败：${e.message}`);
    }
  }
}

async function tick() {
  // 1. 消费命令信箱（单槽：get → delete 拿到即消费）
  try {
    const v = await state.kv.kvGet(K.cmd);
    if (v && typeof v === 'object' && v.nonce && v.nonce !== state.lastCmdNonce) {
      state.lastCmdNonce = v.nonce;
      await state.kv.kvDel(K.cmd);
      const action = String(v.action || '');
      if (action === 'run_suite' || action === 'run_bench') {
        if (state.running) {
          // 忙碌：拒绝而不是排队（基准/体检是分钟级重活，排队语义容易误解）
          await kvSet(K.res, { nonce: v.nonce, action, at: new Date().toISOString(), result: { ok: false, error: `正忙（${state.running.profileName} ${state.running.step}），稍后再试或先取消` } }).catch(() => {});
        } else {
          state.queue.push({ nonce: v.nonce, action, payload: v.payload || {} });
          if (state.queue.length > QUEUE_MAX) state.queue.shift();
        }
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
    res.end(JSON.stringify({ ok: true, version: VERSION, running: !!state.running, profiles: profiles.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── 入口 ────────────────────────────────────────────────────────────────────
function main() {
  state.appConfigDir = process.argv[3] || '';
  initLog(state.appConfigDir);
  state.kv = createKvClient({
    appConfigDir: state.appConfigDir,
    log: (lv, msg) => log(lv, msg),
  });
  loadManualProfiles();
  importHostProfiles();
  (async () => {
    await loadSettings();
    await publishProfiles();
    await beatMeta();
  })().catch((e) => log('warn', `初始化持久态失败：${e.message}`));

  server.listen(PORT, '127.0.0.1', () => {
    log('info', `健康端点就绪 127.0.0.1:${server.address().port}/__health`);
  });
  setInterval(tick, TICK_MS);
  setInterval(beatMeta, META_BEAT_MS);
}

main();
