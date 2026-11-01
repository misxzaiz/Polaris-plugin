'use strict';
/**
 * main.js —— 提示词矩阵台后台服务（零依赖，node >= 18.15）
 *
 * 单写者权威：pmtx.meta / pmtx.profiles / pmtx.datasets / pmtx.dataset.{id} /
 * pmtx.runs / pmtx.history / pmtx.run.{id} / pmtx.progress / pmtx.settings
 * 全部只由本服务写。面板与 MCP 经 pmtx.cmd 单槽信箱表达意图（{nonce, action,
 * payload}）；服务轮询 get → delete 消费（单消费者无竞态），结果写 pmtx.res
 * （nonce 对齐）+ 持久态键。
 *
 * 档案权威与安全分层（llm-probe 同款不变量）：
 *   - 完整 apiKey 只存在于服务内存与手动档案本地文件
 *     （{{appConfigDir}}/prompt-matrix/profiles.json，与宿主 config.json 同信任域）；
 *   - 宿主档案导入 = 只读宿主 config.json 的 modelProfiles[]（不经 cap.config——
 *     HTTP 通道 Remote 来源会把 apiKey 掩码成哨兵，读不到原文）；
 *   - 落 kv 的一切（档案/结果/历史）均为掩码形态（****<last4>）。
 *
 * 结果分层存储：
 *   - 全量结果写 {{appConfigDir}}/prompt-matrix/runs/{runId}.json（原子写）；
 *   - kv 只落瘦身投影（单格文本按 run 规模 200B~1.2KB），历史可复现、kv 不爆。
 *
 * 成本护栏：run 发起时校验格子数上限（200 样本 × 8 变体）；无任何定时任务；
 * judge 显式配置才跑。中止经 AbortController 全链生效。
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
const core = require('../shared/matrix-core');

const VERSION = core.VERSION;
const TICK_MS = 1500;
const META_BEAT_MS = 60 * 1000;
const KEEP_RUNS = 10;              // 保留最近 N 份运行结果（索引驱动清理）
const HISTORY_MAX = 80;
const QUEUE_MAX = 3;
const RESULT_TTL_MS = 10 * 60 * 1000;
const MAX_VARIANTS = 8;
const RUN_FILE_BUDGET = 8 * 1024 * 1024;   // 单次运行落盘预算
const JUDGE_CONCURRENCY = 2;
const RETRY_BACKOFF_MS = 1200;

const K = {
  meta: 'pmtx.meta',
  profiles: 'pmtx.profiles',
  datasets: 'pmtx.datasets',
  dataset: (id) => `pmtx.dataset.${id}`,
  datasetPrefix: 'pmtx.dataset.',
  runs: 'pmtx.runs',
  run: (id) => `pmtx.run.${id}`,
  runPrefix: 'pmtx.run.',
  history: 'pmtx.history',
  progress: 'pmtx.progress',
  settings: 'pmtx.settings',
  cmd: 'pmtx.cmd',
  res: 'pmtx.res',
};

// ── 日志（自落盘 + 512KB 轮转；绝不落 apiKey）────────────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = path.join(appConfigDir || os.tmpdir(), 'prompt-matrix');
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'service.log');
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[prompt-matrix:${level}] ${new Date().toISOString()} ${msg}`;
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
  running: null,   // 矩阵运行内存态（见 startRun）
  settings: {
    concurrency: 3,       // 1-8
    cellTimeoutMs: 60000, // 10s-180s
    retries: 1,           // 0-2（仅 429/5xx/网络层）
    judgeProfileId: '',
    judgeUserTemplate: '',
    priceIn: 0,           // 每百万输入 token 单价（估算展示用，0=不计价）
    priceOut: 0,
  },
};

// ── 档案存储（llm-probe 同款：完整 key 只在内存+本地文件）────────────────────
const profiles = new Map();

function profilesFilePath() {
  return path.join(state.appConfigDir || os.tmpdir(), 'prompt-matrix', 'profiles.json');
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
        if (existing && existing.source === 'manual') continue;
        profiles.set(id, sanitizeProfile({
          id,
          name: m.name || m.id || '宿主档案',
          baseUrl: m.baseUrl,
          apiKey: m.apiKey,
          model: m.model,
          wire: m.wireApi === 'openai-chat-completions' ? 'openai-chat-completions' : 'anthropic-messages',
          importedAt: new Date().toISOString(),
        }, 'host'));
        imported += 1;
      }
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
      if (list.length || groups.length) break;
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

// ── 结果文件（全量，原子写）─────────────────────────────────────────────────
function runsDir() {
  return path.join(state.appConfigDir || os.tmpdir(), 'prompt-matrix', 'runs');
}

function runFilePath(runId) {
  const safe = String(runId || '').replace(/[^\w.-]/g, '');
  return path.join(runsDir(), `${safe}.json`);
}

function writeRunFile(runId, data) {
  try {
    const dir = runsDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = runFilePath(runId);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    return file;
  } catch (e) {
    log('warn', `结果落盘失败：${e.message}`);
    return null;
  }
}

function readRunFile(runId) {
  try { return JSON.parse(fs.readFileSync(runFilePath(runId), 'utf8')); } catch (_) { return null; }
}

function deleteRunFile(runId) {
  try { fs.unlinkSync(runFilePath(runId)); } catch (_) { /* 忽略 */ }
}

// ── kv 持久态 ───────────────────────────────────────────────────────────────
async function kvSet(key, value) { await state.kv.kvSet(key, value); }

async function readArr(key) {
  try { const v = await state.kv.kvGet(key); return Array.isArray(v) ? v : []; } catch (_) { return []; }
}

async function loadSettings() {
  try {
    const v = await state.kv.kvGet(K.settings);
    if (v && typeof v === 'object') {
      const s = state.settings;
      s.concurrency = Math.min(Math.max(Number(v.concurrency) || 3, 1), 8);
      s.cellTimeoutMs = Math.min(Math.max(Number(v.cellTimeoutMs) || 60000, 10000), 180000);
      s.retries = Math.min(Math.max(Number(v.retries) ?? 1, 0), 2);
      s.judgeProfileId = String(v.judgeProfileId || '');
      s.judgeUserTemplate = String(v.judgeUserTemplate || '');
      s.priceIn = Math.max(Number(v.priceIn) || 0, 0);
      s.priceOut = Math.max(Number(v.priceOut) || 0, 0);
    }
  } catch (_) { /* 默认 */ }
}

// ── 数据集 ──────────────────────────────────────────────────────────────────
async function executeDatasetsUpsert(payload) {
  const name = String(payload.name || '').trim().slice(0, 80) || '未命名数据集';
  const jsonl = String(payload.jsonl == null ? '' : payload.jsonl);
  const parsed = core.parseDataset(jsonl);
  if (!parsed.samples.length) {
    return { ok: false, error: `没有有效样本（${parsed.errors.length ? parsed.errors[0].line + ' 行：' + parsed.errors[0].msg : '空数据集'}）` };
  }
  if (jsonl.length > core.MAX_JSONL_BYTES) {
    return { ok: false, error: `数据集超过 ${Math.round(core.MAX_JSONL_BYTES / 1024)}KB 上限` };
  }
  const id = String(payload.id || '').trim() || `ds-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const rec = { id, name, updatedAt: new Date().toISOString(), count: parsed.samples.length, errCount: parsed.errors.length, jsonl };
  await kvSet(K.dataset(id), rec);
  const list = await readArr(K.datasets);
  const idx = list.findIndex((x) => x.id === id);
  const head = { id, name, count: rec.count, errCount: rec.errCount, updatedAt: rec.updatedAt };
  if (idx >= 0) list[idx] = head; else list.unshift(head);
  await kvSet(K.datasets, list.slice(0, 50));
  return { ok: true, id, count: rec.count, errors: parsed.errors };
}

async function executeDatasetsDelete(payload) {
  const id = String(payload.id || '');
  const list = await readArr(K.datasets);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return { ok: false, error: `数据集不存在：${id}` };
  await state.kv.kvDel(K.dataset(id)).catch(() => {});
  await kvSet(K.datasets, next);
  return { ok: true };
}

async function getDatasetSamples(payload) {
  if (payload.jsonl != null && String(payload.jsonl).trim()) {
    const parsed = core.parseDataset(String(payload.jsonl));
    if (!parsed.samples.length) throw new Error(`临时数据集没有有效样本（${parsed.errors[0] ? parsed.errors[0].msg : '空'}）`);
    return { samples: parsed.samples, datasetName: '（临时 JSONL）', errors: parsed.errors };
  }
  const id = String(payload.datasetId || '');
  const rec = await state.kv.kvGet(K.dataset(id));
  if (!rec || !rec.jsonl) throw new Error(`数据集不存在：${id}`);
  const parsed = core.parseDataset(rec.jsonl);
  if (!parsed.samples.length) throw new Error(`数据集 ${rec.name || id} 没有有效样本`);
  return { samples: parsed.samples, datasetName: rec.name || id, errors: parsed.errors };
}

// ── 变体校验 ────────────────────────────────────────────────────────────────
/** variants → 规范化列表；非法抛错 */
function normalizeVariants(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('variants 至少 1 个');
  if (raw.length > MAX_VARIANTS) throw new Error(`variants 最多 ${MAX_VARIANTS} 个`);
  const out = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') throw new Error('variant 必须是对象');
    const profileId = String(v.profileId || '');
    const profile = profiles.get(profileId);
    if (!profile) throw new Error(`variant「${v.name || '?'}」的档案不存在：${profileId}（先导入宿主档案或手动添加）`);
    const userTemplate = String(v.userTemplate == null ? '' : v.userTemplate);
    if (!userTemplate.trim()) throw new Error(`variant「${v.name || profile.name}」的 userTemplate 为空`);
    out.push({
      name: String(v.name || profile.name).slice(0, 60),
      profileId,
      systemTemplate: String(v.systemTemplate == null ? '' : v.systemTemplate).slice(0, 32000),
      userTemplate: userTemplate.slice(0, 64000),
      maxTokens: Math.min(Math.max(Number(v.maxTokens) || 1024, 1), 32768),
      temperature: v.temperature == null ? null : Math.min(Math.max(Number(v.temperature), 0), 2),
    });
  }
  return out;
}

/** run 落盘/kv 投影的单格文本上限（按 run 规模动态收敛） */
function projectLimit(cellCount) {
  if (cellCount <= 200) return 1200;
  if (cellCount <= 800) return 400;
  return 200;
}

function projectRun(run, extra) {
  const limit = projectLimit(run.cells.length);
  const cells = run.cells.map((c) => {
    const p = core.makeCellProjection(c);
    if (p.content && p.content.length > limit) { p.content = p.content.slice(0, limit); p.truncated = true; }
    return p;
  });
  const def = {
    datasetName: run.def.datasetName,
    variants: run.def.variants.map((v, idx) => ({
      idx,
      name: v.name, profileId: v.profileId, profileName: (profiles.get(v.profileId) || {}).name || v.profileId,
      systemTemplate: v.systemTemplate, userTemplate: v.userTemplate,
      maxTokens: v.maxTokens, temperature: v.temperature,
    })),
    judge: run.def.judge ? { profileId: run.def.judge.profileId, profileName: (profiles.get(run.def.judge.profileId) || {}).name || '', userTemplate: run.def.judge.userTemplate || '' } : null,
  };
  return {
    runId: run.runId,
    version: VERSION,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    status: run.status,                       // running | done | aborted | error
    sampleSummaries: run.samples.map((s) => {
      const entries = Object.entries(s.vars || {});
      const first = entries[0];
      const label = first ? `${first[0]}=${String(typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1])).slice(0, 60)}` : '(空变量)';
      return { label, checks: s.checks || [], varCount: entries.length };
    }),
    def,
    cells,
    aggregates: core.aggregateRuns(run.cells, run.def.variants.length),
    cost: costOf(run.cells),
    ...extra,
  };
}

/** 费用估算（单价可配，0=不计价） */
function costOf(cells) {
  const s = state.settings;
  let tokIn = 0;
  let tokOut = 0;
  for (const c of cells) {
    if (c.usage) { tokIn += Number(c.usage.prompt_tokens) || 0; tokOut += Number(c.usage.completion_tokens) || 0; }
  }
  const est = (s.priceIn > 0 || s.priceOut > 0)
    ? +((tokIn / 1e6) * s.priceIn + (tokOut / 1e6) * s.priceOut).toFixed(4)
    : null;
  return { tokIn, tokOut, est };
}

// ── 矩阵执行 ────────────────────────────────────────────────────────────────
function newRunId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

async function executeRunStart(payload) {
  if (state.running) return { ok: false, error: `正忙：run ${state.running.runId}（${state.running.phase} ${state.running.done}/${state.running.total}），可先取消` };
  let samples;
  let datasetName;
  try {
    const ds = await getDatasetSamples(payload);
    samples = ds.samples;
    datasetName = ds.datasetName;
  } catch (e) {
    return { ok: false, error: `数据集错误：${(e && e.message) || e}` };
  }
  let variants;
  try { variants = normalizeVariants(payload.variants); } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
  const concurrency = Math.min(Math.max(Number(payload.concurrency) || state.settings.concurrency, 1), 8);
  const retries = Math.min(Math.max(Number(payload.retries) ?? state.settings.retries, 0), 2);
  let judge = null;
  const judgeProfileId = String((payload.judge && payload.judge.profileId) || '');
  if (judgeProfileId) {
    if (!profiles.get(judgeProfileId)) return { ok: false, error: `judge 档案不存在：${judgeProfileId}` };
    judge = { profileId: judgeProfileId, userTemplate: String((payload.judge && payload.judge.userTemplate) || state.settings.judgeUserTemplate || '') };
  }
  const runId = newRunId();
  const abort = new AbortController();
  const cells = [];
  for (let si = 0; si < samples.length; si++) {
    for (let vi = 0; vi < variants.length; vi++) {
      cells.push({ cellId: `r${si}c${vi}`, sampleIdx: si, variantIdx: vi, ok: false, status: 'pending', content: '', ms: 0, checks: [], judge: null, error: null, attempts: 0 });
    }
  }
  state.running = {
    runId,
    startedAt: new Date().toISOString(),
    def: { datasetName, variants, judge },
    samples,
    cells,
    done: 0,
    total: cells.length,
    phase: 'cells',
    status: 'running',
    finishedAt: null,
    abort,
    concurrency,
    retries,
  };
  log('info', `run ${runId} 启动：${samples.length} 样本 × ${variants.length} 变体 = ${cells.length} 格（并发 ${concurrency}，重试 ${retries}${judge ? '，judge ' + judgeProfileId : ''}）`);
  // 发起即写心跳（meta+progress）——面板/测试轮询从回执返回起就有进度可读，
  // 否则 ≤1.5s tick 窗口内 progress 缺失会被误判为「已完成」
  await beatMeta();
  // 异步执行（不阻塞信箱回执——回执立刻返回 runId，进度走 pmtx.progress）
  executeRunAsync().catch((e) => log('error', `run ${runId} 执行器异常：${(e && e.message) || e}`));
  return { ok: true, runId, cells: cells.length, samples: samples.length, variants: variants.length, judge: !!judge };
}

async function executeRunAsync() {
  const run = state.running;
  if (!run) return;
  const s = state.settings;
  try {
    // ── 阶段 1：格子矩阵（并发池）──────────────────────────────────────────
    let nextIdx = 0;
    const workers = [];
    const spawnWorker = async () => {
      for (;;) {
        if (run.abort.signal.aborted) return;
        const idx = nextIdx++;
        if (idx >= run.cells.length) return;
        await runCell(run, idx, s);
        run.done += 1;
      }
    };
    for (let i = 0; i < Math.min(run.concurrency, run.cells.length); i++) workers.push(spawnWorker());
    await Promise.all(workers);
    if (run.abort.signal.aborted) run.status = 'aborted';

    // ── 阶段 2：judge（若配置且未中止）─────────────────────────────────────
    if (run.def.judge && run.status === 'running') {
      run.phase = 'judge';
      const judgeProfile = profiles.get(run.def.judge.profileId);
      const targets = run.cells.filter((c) => c.ok);
      run.judgeTotal = targets.length;
      run.judgeDone = 0;
      let jNext = 0;
      const jWorker = async () => {
        for (;;) {
          if (run.abort.signal.aborted) return;
          const idx = jNext++;
          if (idx >= targets.length) return;
          const cell = targets[idx];
          await runJudgeCell(run, cell, judgeProfile, s);
          run.judgeDone += 1;
        }
      };
      await Promise.all([jWorker(), jWorker()]);
    }
  } catch (e) {
    log('error', `run ${run.runId} 异常：${(e && e.message) || e}`);
    run.status = 'error';
    run.error = String((e && e.message) || e);
  }
  // ── 持久化（含中止/出错路径；正常跑完置 done）────────────────────────────
  if (run.status === 'running') run.status = 'done';
  // 中止后未执行的格子不能留 pending（结果矩阵必须收敛）
  if (run.status === 'aborted') {
    for (const c of run.cells) {
      if (c.status === 'pending' || c.status === 'running') {
        c.status = 'aborted';
        c.error = { code: 'cancelled', cn: '已取消（未执行）', hint: '' };
      }
    }
  }
  run.finishedAt = new Date().toISOString();
  run.phase = 'done';
  await persistRun(run);
  if (state.running && state.running.runId === run.runId) state.running = null;
}

/** 执行单格：插值 → chatOnce（带重试）→ 检查器 */
async function runCell(run, idx, s) {
  const cell = run.cells[idx];
  const sample = run.samples[cell.sampleIdx];
  const variant = run.def.variants[cell.variantIdx];
  const profile = profiles.get(variant.profileId);
  cell.status = 'running';
  if (!profile) {
    cell.status = 'error';
    cell.error = { code: 'config', cn: `档案不存在：${variant.profileId}`, hint: '' };
    return;
  }
  const sysW = variant.systemTemplate ? core.renderTemplate(variant.systemTemplate, sample.vars) : { text: '', warnings: [] };
  const usrW = core.renderTemplate(variant.userTemplate, sample.vars);
  cell.templateWarnings = [...sysW.warnings, ...usrW.warnings].slice(0, 5);
  const messages = [];
  if (sysW.text.trim()) messages.push({ role: 'system', content: sysW.text });
  messages.push({ role: 'user', content: usrW.text });

  const maxAttempts = Math.min(Math.max(Number(run.retries) || 0, 0), 2) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (run.abort.signal.aborted) { cell.status = 'aborted'; cell.error = { code: 'cancelled', cn: '已取消', hint: '' }; return; }
    cell.attempts = attempt;
    const r = await core.chatOnce(profile, {
      messages,
      maxTokens: variant.maxTokens,
      temperature: variant.temperature,
      timeoutMs: s.cellTimeoutMs,
      signal: run.abort.signal,
    });
    if (r.ok) {
      cell.ok = true;
      cell.status = 'ok';
      cell.ms = r.ms;
      cell.content = String(r.content || '').slice(0, core.CELL_STORE_BYTES);
      cell.finishReason = r.finishReason;
      cell.usage = r.usage || null;
      cell.retried = r.retried || attempt > 1;
      cell.checks = core.runChecks(cell.content, sample.checks || []);
      return;
    }
    cell.error = r.error;
    cell.ms = r.ms;
    if (r.error && r.error.code === 'cancelled') { cell.status = 'aborted'; return; }
    if (attempt < maxAttempts && core.isRetryable(r)) {
      await new Promise((res) => setTimeout(res, RETRY_BACKOFF_MS * attempt));
      continue;
    }
    cell.status = 'error';
    return;
  }
}

/** 单格 judge（失败不毁格子，记 judgeError） */
async function runJudgeCell(run, cell, judgeProfile, s) {
  const sample = run.samples[cell.sampleIdx];
  const variant = run.def.variants[cell.variantIdx];
  const messages = core.buildJudgeMessages({
    vars: sample.vars,
    userTemplate: variant.userTemplate,
    output: cell.content,
  }, run.def.judge.userTemplate);
  const r = await core.chatOnce(judgeProfile, {
    messages,
    maxTokens: 300,
    temperature: 0,
    timeoutMs: s.cellTimeoutMs,
    signal: run.abort.signal,
  });
  if (!r.ok) {
    cell.judgeError = r.error ? `${r.error.cn}${r.error.hint ? '：' + r.error.hint : ''}` : 'judge 失败';
    return;
  }
  const parsed = core.parseJudgeOutput(r.content);
  if (!parsed) {
    cell.judgeError = 'judge 输出无法解析（期望 {"score":1-10,"reason"}）';
    cell.judgeRaw = String(r.content || '').slice(0, 300);
    return;
  }
  cell.judge = parsed;
}

/** 运行持久化：全量文件 + kv 投影 + runs 索引 + history */
async function persistRun(run) {
  const full = {
    runId: run.runId,
    version: VERSION,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    error: run.error || null,
    def: {
      datasetName: run.def.datasetName,
      variants: run.def.variants,
      judge: run.def.judge,
    },
    samples: run.samples,
    cells: run.cells.map((c) => ({ ...c, content: String(c.content || '').slice(0, core.CELL_STORE_BYTES) })),
  };
  const file = writeRunFile(run.runId, full);
  const proj = projectRun(run, { fileSaved: !!file });
  try { await kvSet(K.run(run.runId), proj); } catch (e) { log('warn', `run 投影写入失败：${e.message}`); }
  const runs = await readArr(K.runs);
  runs.unshift(run.runId);
  const keep = runs.slice(0, KEEP_RUNS);
  await kvSet(K.runs, keep);
  for (const old of runs.slice(KEEP_RUNS)) {
    await state.kv.kvDel(K.run(old)).catch(() => {});
    deleteRunFile(old);
  }
  const agg = proj.aggregates;
  await pushHistory({
    runId: run.runId,
    at: run.finishedAt,
    datasetName: run.def.datasetName,
    cells: run.cells.length,
    okCells: agg.totals.ok,
    failedCells: agg.totals.failed,
    variants: run.def.variants.map((v) => v.name),
    judged: !!run.def.judge,
    judgeAvg: agg.variants.map((v) => v.judgeAvg).filter((x) => x != null).length
      ? +(agg.variants.reduce((a, b) => a + (b.judgeAvg || 0), 0) / agg.variants.filter((v) => v.judgeN).length).toFixed(1)
      : null,
    status: run.status,
  });
  try { await state.kv.kvDel(K.progress).catch(() => {}); } catch (_) { /* 忽略 */ }
  log('info', `run ${run.runId} 完成：${run.status}，${agg.totals.ok}/${agg.totals.cells} 格成功${file ? '，已落盘' : '，落盘失败'}`);
}

async function pushHistory(entry) {
  const h = await readArr(K.history);
  h.unshift(entry);
  await kvSet(K.history, h.slice(0, HISTORY_MAX));
}

// ── 其余 actions ────────────────────────────────────────────────────────────
async function executeRunCancel() {
  if (!state.running) return { ok: false, error: '当前没有运行中的矩阵' };
  state.running.abort.abort(new Error('用户取消'));
  return { ok: true };
}

async function executeGetRun(payload) {
  const id = String(payload.runId || '');
  try {
    const v = await state.kv.kvGet(K.run(id));
    if (v) return { ok: true, run: v };
  } catch (_) { /* fallthrough */ }
  return { ok: false, error: `运行结果不存在或已被清理：${id}` };
}

async function executeGetCell(payload) {
  const runId = String(payload.runId || '');
  const cellId = String(payload.cellId || '');
  const full = readRunFile(runId);
  if (!full) return { ok: false, error: `结果文件不可读（可能已被清理）：${runId}` };
  const cell = (full.cells || []).find((c) => c.cellId === cellId);
  if (!cell) return { ok: false, error: `格子不存在：${cellId}` };
  const sample = (full.samples || [])[cell.sampleIdx] || { vars: {} };
  const variant = (full.def && full.def.variants || [])[cell.variantIdx] || {};
  return { ok: true, cell, vars: sample.vars, variant: { name: variant.name, userTemplate: variant.userTemplate, systemTemplate: variant.systemTemplate } };
}

/** 人工标注：内存/文件/kv 三处同步（运行中写内存态由 persistRun 自然落盘） */
async function executeAnnotate(payload) {
  const runId = String(payload.runId || '');
  const cellId = String(payload.cellId || '');
  const verdict = payload.verdict === 'up' || payload.verdict === 'down' ? payload.verdict : null;
  // 1. 运行中：更新内存态（随后 persistRun 落盘）
  if (state.running && state.running.runId === runId) {
    const cell = state.running.cells.find((c) => c.cellId === cellId);
    if (!cell) return { ok: false, error: `格子不存在：${cellId}` };
    cell.annotated = verdict;
    return { ok: true, applied: 'memory' };
  }
  // 2. 已完成：改文件 + 改 kv 投影
  const full = readRunFile(runId);
  if (!full) return { ok: false, error: `结果文件不可读：${runId}` };
  const cell = (full.cells || []).find((c) => c.cellId === cellId);
  if (!cell) return { ok: false, error: `格子不存在：${cellId}` };
  cell.annotated = verdict;
  writeRunFile(runId, full);
  try {
    const proj = await state.kv.kvGet(K.run(runId));
    if (proj && Array.isArray(proj.cells)) {
      const pc = proj.cells.find((c) => c.cellId === cellId);
      if (pc) pc.annotated = verdict;
      await kvSet(K.run(runId), proj);
    }
  } catch (_) { /* 投影失败不阻塞 */ }
  return { ok: true, applied: 'file' };
}

async function executeGetState() {
  let datasets = [];
  let history = [];
  try { datasets = await readArr(K.datasets); } catch (_) { /* 忽略 */ }
  history = await readArr(K.history);
  return {
    ok: true,
    profiles: maskedProfiles(),
    meta: metaPayload(),
    datasets,
    history,
    settings: { ...state.settings, judgeProfileId: state.settings.judgeProfileId || '' },
  };
}

async function executeImport() {
  const r = importHostProfiles();
  await publishProfiles();
  return { ok: true, ...r };
}

async function executeProfilesUpsert(payload) {
  const p = payload.profile || {};
  if (!p.baseUrl) return { ok: false, error: 'baseUrl 必填' };
  if (!p.apiKey && !payload.allowEmptyKey) return { ok: false, error: 'apiKey 必填（本地无鉴权端点可勾选允许空 key）' };
  const id = String(p.id || '').trim() || `manual-${crypto.randomBytes(4).toString('hex')}`;
  profiles.set(id, sanitizeProfile({ ...p, id, importedAt: profiles.get(id) && profiles.get(id).importedAt }, 'manual'));
  const saved = saveManualProfiles();
  await publishProfiles();
  return { ok: true, id, savedToFile: saved };
}

async function executeProfilesDelete(payload) {
  const p = profiles.get(String(payload.id || ''));
  if (!p) return { ok: false, error: `档案不存在：${payload.id}` };
  if (p.source === 'host' && !payload.force) return { ok: false, error: '宿主导入档案由宿主配置派生，删除请用 force:true' };
  profiles.delete(String(payload.id));
  const saved = saveManualProfiles();
  await publishProfiles();
  return { ok: true, savedToFile: saved };
}

async function executeSettingsSet(payload) {
  const s = payload || {};
  const next = state.settings;
  next.concurrency = Math.min(Math.max(Number(s.concurrency) || next.concurrency, 1), 8);
  next.cellTimeoutMs = Math.min(Math.max(Number(s.cellTimeoutMs) || next.cellTimeoutMs, 10000), 180000);
  next.retries = Math.min(Math.max(Number(s.retries) ?? next.retries, 0), 2);
  next.judgeProfileId = String(s.judgeProfileId != null ? s.judgeProfileId : next.judgeProfileId);
  next.judgeUserTemplate = String(s.judgeUserTemplate != null ? s.judgeUserTemplate : next.judgeUserTemplate);
  next.priceIn = Math.max(Number(s.priceIn) || 0, 0);
  next.priceOut = Math.max(Number(s.priceOut) || 0, 0);
  try { await kvSet(K.settings, next); } catch (_) { /* kv 失败不影响本次生效 */ }
  return { ok: true, settings: next };
}

// ── 命令分发 ────────────────────────────────────────────────────────────────
const ACTIONS = {
  run_start: executeRunStart,
  run_cancel: executeRunCancel,
  get_run: executeGetRun,
  get_cell: executeGetCell,
  annotate: executeAnnotate,
  datasets_upsert: executeDatasetsUpsert,
  datasets_delete: executeDatasetsDelete,
  import_host: executeImport,
  profiles_upsert: executeProfilesUpsert,
  profiles_delete: executeProfilesDelete,
  get_state: executeGetState,
  settings_set: executeSettingsSet,
};

function metaPayload() {
  const r = state.running;
  return {
    ts: new Date().toISOString(),
    version: VERSION,
    degraded: state.degraded,
    lastBridgeErr: state.lastBridgeErr,
    running: r ? {
      runId: r.runId, phase: r.phase, status: r.status, done: r.done, total: r.total,
      judgeDone: r.judgeDone || 0, judgeTotal: r.judgeTotal || 0,
      elapsedMs: Date.now() - new Date(r.startedAt).getTime(),
      datasetName: r.def.datasetName,
    } : null,
    profileCount: profiles.size,
  };
}

async function publishProfiles() {
  await kvSet(K.profiles, { at: new Date().toISOString(), items: maskedProfiles() });
}

async function beatMeta() {
  try {
    await kvSet(K.meta, metaPayload());
    if (state.running) {
      await kvSet(K.progress, metaPayload().running);
    }
    state.degraded = false;
    state.lastBridgeErr = null;
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
    log('warn', `meta 心跳失败（降级）：${state.lastBridgeErr}`);
  }
}

async function processQueue() {
  while (state.queue.length) {
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
      await state.kv.kvDel(K.cmd);
      state.queue.push({ nonce: v.nonce, action: String(v.action || ''), payload: v.payload || {} });
      if (state.queue.length > QUEUE_MAX) state.queue.shift();
    }
    if (state.degraded) { state.degraded = false; state.lastBridgeErr = null; }
  } catch (e) {
    state.degraded = true;
    state.lastBridgeErr = String((e && e.message) || e);
  }
  // 运行中提频心跳（面板/测试轮询实时进度）；空闲保持 60s 低频
  if (state.running) await beatMeta();
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
