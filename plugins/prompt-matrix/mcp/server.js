#!/usr/bin/env node
'use strict';
/**
 * prompt-matrix MCP Server —— 提示词矩阵台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 pmtx.* 键空间命令投递。
 * 执行与结果写入的唯一权威是后台服务（service/main.js）——MCP 只投递命令并
 * 等待回执，与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量：所有面向 AI 的返回均为掩码形态（****<last4>），完整 apiKey
 * 对 MCP 不可见；结果默认瘦身投影（全文经 pmtx_result 的 cell 参数按格取）。
 *
 * 工具一览（6 个）：
 *   pmtx_profiles  列可评测模型档案（掩码）
 *   pmtx_datasets  列数据集
 *   pmtx_run       发起矩阵运行（先向用户确认花费）
 *   pmtx_status    运行进度
 *   pmtx_result    读结果（聚合统计 + 矩阵；cell 参数取单格全文）
 *   pmtx_history   历史运行列表
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/matrix-core');

const SERVER_NAME = 'prompt-matrix';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'pmtx.meta',
  profiles: 'pmtx.profiles',
  datasets: 'pmtx.datasets',
  runs: 'pmtx.runs',
  run: (id) => `pmtx.run.${id}`,
  history: 'pmtx.history',
  progress: 'pmtx.progress',
  cmd: 'pmtx.cmd',
  res: 'pmtx.res',
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function oneLine(s, n = 110) {
  const s2 = String(s || '').replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
}

// ── 命令投递（单槽信箱：写 cmd → 轮询 res 按 nonce 对齐）─────────────────────
let nonceCounter = 0;
async function sendCommand(action, payload, waitMs) {
  const nonce = `m${Date.now().toString(36)}-${++nonceCounter}`;
  await kv.kvSet(K.cmd, { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + (waitMs || 90000);
  let sawStale = false;
  while (Date.now() < deadline) {
    await sleep(1500);
    let res;
    try { res = await kv.kvGet(K.res); } catch (_) { continue; }
    if (res && res.nonce === nonce) {
      await kv.kvDel(K.res).catch(() => { /* 消费失败不影响结果读取 */ });
      return res.result || { ok: false, error: '回执为空' };
    }
    if (res && res.nonce) sawStale = true;
  }
  return {
    ok: false,
    pending: true,
    error: sawStale
      ? `命令已投递但 ${Math.round((waitMs || 90000) / 1000)}s 内未见回执（可能仍在后台执行）。用 pmtx_status 查进度、pmtx_result 读结果。`
      : '命令已投递但服务无响应（服务可能未启动）。',
  };
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolProfiles() {
  let items = [];
  try {
    const v = await kv.kvGet(K.profiles);
    items = v && Array.isArray(v.items) ? v.items : [];
  } catch (e) { return err(`档案读取失败（桥不可达？）：${e.message}`); }
  if (!items.length) return ok('暂无模型档案。请先在面板「档案」页点「导入宿主档案」，或手动添加端点后重试。');
  const lines = items.map((p, i) =>
    `${i + 1}. [${p.id}] ${p.name}｜${p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}｜${p.model || '(未设模型)'}｜key ${p.keyMask || '无'}｜${p.source === 'host' ? '宿主导入' : '手动'}`);
  return ok(`共 ${items.length} 个模型档案（key 已掩码）：\n${lines.join('\n')}\n\n用 pmtx_run 的 variants[].profileId 引用。`);
}

async function toolDatasets() {
  let list = [];
  try { list = await kv.kvGet(K.datasets) || []; } catch (e) { return err(`数据集读取失败：${e.message}`); }
  if (!Array.isArray(list) || !list.length) return ok('暂无数据集。可在面板「数据集」页创建，或 pmtx_run 直接传 jsonl（临时数据集，不落库）。');
  const lines = list.map((d, i) => `${i + 1}. [${d.id}] ${d.name}｜${d.count} 条样本${d.errCount ? `（${d.errCount} 行有格式错误，运行时跳过）` : ''}｜更新于 ${String(d.updatedAt || '').replace('T', ' ').slice(0, 16)}`);
  return ok(`共 ${list.length} 个数据集：\n${lines.join('\n')}`);
}

/** variants 参数容错：接受数组；字符串时按 JSON 解析 */
function parseVariantsArg(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { const j = JSON.parse(raw); return Array.isArray(j) ? j : null; } catch (_) { return null; }
  }
  return null;
}

async function toolRun(args) {
  const variants = parseVariantsArg(args.variants);
  if (!variants || !variants.length) {
    return ok('variants 必填（数组，1-8 个）。每个元素：{"name": "显示名", "profileId": "从 pmtx_profiles 获取", "systemTemplate": "系统提示词模板（可选，支持 {{变量}} 插值）", "userTemplate": "用户提示词模板（必填，支持 {{变量}} 插值）", "maxTokens": 1024, "temperature": 0.7}。同一模板配多个 profileId 即模型对比；同一 profileId 配不同模板即提示词 A/B。');
  }
  let profiles = [];
  try {
    const v = await kv.kvGet(K.profiles);
    profiles = v && Array.isArray(v.items) ? v.items : [];
  } catch (_) { /* 忽略 */ }
  for (const v of variants) {
    if (!v || !v.profileId || !profiles.some((p) => p.id === v.profileId)) {
      return ok(`variant 的 profileId 无效。当前可选：\n${profiles.map((p) => `- ${p.id}（${p.name}）`).join('\n') || '（无档案，先在面板导入宿主档案）'}`);
    }
  }
  const hasDataset = args.datasetId || (args.jsonl && String(args.jsonl).trim());
  if (!hasDataset) {
    return ok('需要数据集：传 datasetId（pmtx_datasets 获取）或直接传 jsonl（JSONL 文本，每行一个 {"vars": {...}} 对象）。');
  }
  const payload = {
    variants,
    datasetId: args.datasetId || undefined,
    jsonl: args.jsonl || undefined,
    concurrency: args.concurrency,
    retries: args.retries,
  };
  if (args.judgeProfileId) payload.judge = { profileId: args.judgeProfileId, userTemplate: args.judgeUserTemplate };
  const r = await sendCommand('run_start', payload, 15000);
  if (!r.ok) {
    if (r.pending) return ok(`${r.error}`);
    return err(r.error || '发起失败');
  }
  const est = r.samples && r.variants ? `样本 ${r.samples} × 变体 ${r.variants} = ${r.cells} 格` : `${r.cells} 格`;
  return ok(`矩阵已启动（runId=${r.runId}）：${est}${r.judge ? '，含 LLM 评判' : ''}。每次调用都是真实 LLM 请求，会产生 token 费用——本工具假定你已向用户确认。用 pmtx_status 查进度，完成后 pmtx_result 读结果。`);
}

async function toolStatus() {
  let p = null;
  try { p = await kv.kvGet(K.progress); } catch (_) { /* 忽略 */ }
  let meta = null;
  try { meta = await kv.kvGet(K.meta); } catch (_) { /* 忽略 */ }
  if (p && p.runId) {
    const judge = p.judgeTotal ? `；judge ${p.judgeDone}/${p.judgeTotal}` : '';
    return ok(`运行中：${p.runId}｜${p.phase === 'judge' ? '评判阶段' : '矩阵执行'}｜${p.done}/${p.total} 格完成${judge}｜已 ${Math.round((p.elapsedMs || 0) / 1000)}s｜数据集：${p.datasetName || '?'}`);
  }
  if (meta && meta.running && meta.running.runId) {
    return ok(`运行中：${meta.running.runId}｜${meta.running.phase}｜${meta.running.done}/${meta.running.total} 格`);
  }
  return ok('当前没有运行中的矩阵。最近一次结果可用 pmtx_result 直接读取。');
}

function renderRun(run, { withCells = false } = {}) {
  const def = run.def || {};
  const variantNames = (def.variants || []).map((v, i) => `${i + 1}. ${v.name}（${v.profileName || v.profileId}${v.model ? '' : ''}${v.maxTokens ? `，max ${v.maxTokens}` : ''}${v.temperature != null ? `，T=${v.temperature}` : ''}）`);
  const lines = [];
  lines.push(`run ${run.runId}｜${run.status || '?'}｜数据集：${def.datasetName || '?'}｜${run.startedAt ? String(run.startedAt).replace('T', ' ').slice(0, 16) : ''}`);
  lines.push(`变体：\n${variantNames.map((x) => '  ' + x).join('\n')}`);
  const agg = run.aggregates;
  if (agg) {
    const t = agg.totals || {};
    lines.push(`总计：${t.ok || 0}/${t.cells || 0} 格成功${t.failed ? `，${t.failed} 失败` : ''}｜tokens in/out：${t.tokIn || 0}/${t.tokOut || 0}${run.cost && run.cost.est != null ? `｜估算费用 $${run.cost.est}` : ''}`);
    const vs = (agg.variants || []).map((v) => {
      const name = (def.variants && def.variants[v.idx] && def.variants[v.idx].name) || `变体${v.idx + 1}`;
      const checkTxt = v.total && (v.ok ? `检查全过 ${v.checkAllPass}/${v.ok}` : '');
      const judgeTxt = v.judgeAvg != null ? `judge 均 ${v.judgeAvg}/10（${v.judgeN} 格）` : '';
      return `  ${name}：✓${v.ok}/${v.total}${v.failed ? ` ✗${v.failed}` : ''}${checkTxt ? `｜${checkTxt}` : ''}${judgeTxt ? `｜${judgeTxt}` : ''}｜均时 ${v.avgMs}ms｜tok ${v.tokIn}/${v.tokOut}`;
    });
    lines.push(`按变体：\n${vs.join('\n')}`);
  }
  if (withCells && Array.isArray(run.cells) && Array.isArray(run.sampleSummaries)) {
    lines.push('矩阵（行=样本，列=变体）：');
    run.sampleSummaries.forEach((s, si) => {
      const row = (def.variants || []).map((_, vi) => {
        const c = run.cells.find((x) => x.sampleIdx === si && x.variantIdx === vi);
        if (!c) return '—';
        if (c.status === 'pending' || c.status === 'running') return '⏳';
        if (!c.ok) return `✗ ${(c.error && c.error.cn) || '失败'}`;
        const judge = c.judge ? ` J${c.judge.score}` : '';
        const checkBad = (c.checks || []).filter((x) => !x.pass).length;
        const checkTxt = checkBad ? ` 检查✗${checkBad}` : ((c.checks || []).length ? ' 检查✓' : '');
        const mark = c.annotated === 'up' ? '👍' : c.annotated === 'down' ? '👎' : '';
        return `✓${judge}${checkTxt}${mark} ${oneLine(c.content, 50)}`;
      }).join(' ┃ ');
      lines.push(`  [${si}] ${oneLine(s.label, 40)} → ${row}`);
    });
  }
  return lines.join('\n');
}

async function toolResult(args) {
  const runId = String(args.runId || '');
  let run = null;
  if (runId) {
    try { run = await kv.kvGet(K.run(runId)); } catch (_) { /* 忽略 */ }
    if (!run) return err(`结果不存在或已被清理（仅保留最近 10 份）：${runId}`);
  } else {
    let runs = [];
    try { runs = await kv.kvGet(K.runs) || []; } catch (_) { /* 忽略 */ }
    const latest = Array.isArray(runs) && runs.length ? runs[0] : null;
    if (!latest) return ok('尚无运行结果。用 pmtx_run 发起一次矩阵。');
    try { run = await kv.kvGet(K.run(latest)); } catch (_) { /* 忽略 */ }
    if (!run) return err('最近结果读取失败');
  }
  if (args.cell) {
    const r = await sendCommand('get_cell', { runId: run.runId, cellId: args.cell }, 15000);
    if (r.ok) {
      const c = r.cell;
      const lines = [`格子 ${c.cellId}（${run.runId}）全文：`];
      lines.push(`状态：${c.ok ? '✓' : '✗'}｜${c.ms}ms｜attempts ${c.attempts || 1}${c.retried ? '（有重试）' : ''}`);
      if (c.error) lines.push(`错误：${c.error.cn}｜${oneLine(c.error.hint, 120)}`);
      if (c.usage) lines.push(`tokens：in ${c.usage.prompt_tokens || '?'} / out ${c.usage.completion_tokens || '?'}`);
      for (const ck of c.checks || []) lines.push(`检查 ${ck.label}：${ck.pass ? '✓' : '✗'}｜${oneLine(ck.detail, 100)}`);
      if (c.judge) lines.push(`judge：${c.judge.score}/10｜${oneLine(c.judge.reason, 120)}`);
      if (c.judgeError) lines.push(`judge 失败：${oneLine(c.judgeError, 120)}`);
      if (c.templateWarnings && c.templateWarnings.length) lines.push(`模板警告：${c.templateWarnings.map(oneLine).join('；')}`);
      lines.push(`输出全文：\n${c.content || '(空)'}`);
      return ok(lines.join('\n'));
    }
    return err(r.error || '格子读取失败（结果文件可能已被清理）');
  }
  return ok(renderRun(run, { withCells: true }));
}

async function toolHistory(args) {
  let h = [];
  try {
    const v = await kv.kvGet(K.history);
    h = Array.isArray(v) ? v : [];
  } catch (e) { return err(`历史读取失败：${e.message}`); }
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);
  const rows = h.slice(0, limit);
  if (!rows.length) return ok('暂无历史运行。');
  const lines = rows.map((x) => {
    const mark = x.status === 'done' ? '✓' : x.status === 'aborted' ? '⏹' : '❌';
    const judge = x.judgeAvg != null ? `｜judge 均 ${x.judgeAvg}` : '';
    return `${mark} ${String(x.at || '').replace('T', ' ').slice(0, 16)} [${x.runId}] ${x.datasetName || '?'}：${x.okCells}/${x.cells} 格${x.failedCells ? `，${x.failedCells} 失败` : ''}${judge}｜变体：${(x.variants || []).join(' vs ')}`;
  });
  return ok(`最近 ${rows.length} 次运行：\n${lines.join('\n')}\n\n用 pmtx_result 的 runId 读详情。`);
}

// ── 工具注册 ────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'pmtx_profiles',
    description: '列出可评测的 LLM 模型档案（宿主已配置的供应商自动导入 + 手动添加）。适用于「有哪些模型可以测」「列出供应商」。key 全程掩码。',
    inputSchema: { type: 'object', properties: {} },
    call: toolProfiles,
  },
  {
    name: 'pmtx_datasets',
    description: '列已保存的评测数据集（JSONL 样本集）。适用于「有哪些测试集」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolDatasets,
  },
  {
    name: 'pmtx_run',
    description: '发起一次提示词矩阵运行：数据集（一组输入样本）× 变体（模型/提示词模板/参数）批量执行真实 LLM 请求，产出逐格结果、确定性检查（如 JSON 有效/关键词命中）与可选 LLM 评判（1-10 分）。适用于「用这 10 条样本对比这 3 个模型」「测一下新提示词在这组样例上的表现」「把这段 JSONL 批量翻译并检查」。会产生真实 token 费用（样本数×变体数次请求）——调用前必须向用户确认数量与花费。',
    inputSchema: {
      type: 'object',
      properties: {
        variants: {
          description: '变体数组（1-8 个）：{name, profileId, systemTemplate?, userTemplate(支持 {{变量}} 插值), maxTokens?, temperature?}',
        },
        datasetId: { type: 'string', description: '数据集 id（pmtx_datasets 获取）；与 jsonl 二选一' },
        jsonl: { type: 'string', description: '临时 JSONL 数据集文本（每行 {"vars": {...}}），不落库' },
        concurrency: { type: 'integer', description: '并发 1-8（默认 3）' },
        retries: { type: 'integer', description: '失败重试 0-2（默认 1，仅限流/5xx/网络错误）' },
        judgeProfileId: { type: 'string', description: '可选：LLM 评判员档案 id（对每个输出打 1-10 分）' },
        judgeUserTemplate: { type: 'string', description: '可选：评判提示词模板（可用 {{output}} 与样本变量）' },
      },
    },
    call: toolRun,
  },
  {
    name: 'pmtx_status',
    description: '查询当前矩阵运行进度（完成格数/评判进度/耗时）。适用于「跑完了吗」「进度如何」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStatus,
  },
  {
    name: 'pmtx_result',
    description: '读取矩阵运行结果：聚合统计（成功率/检查通过率/judge 均分/tokens）+ 矩阵总览（行=样本，列=变体，格子含输出摘要与状态）。传 cell 参数（如 r0c1）取单格全文与检查明细。缺省读最近一次运行。适用于「评测结果怎样」「第 3 个样本两个模型的回答分别是什么」。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: '运行 id（缺省=最近一次）' },
        cell: { type: 'string', description: '单格 id（如 r0c1），传了则只返回该格全文' },
      },
    },
    call: toolResult,
  },
  {
    name: 'pmtx_history',
    description: '历史运行列表（数据集/格数/成功率/judge 均分/变体名单）。适用于「之前跑过哪些评测」「上次对比的结果」。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '返回条数（默认 15，上限 40）' } },
    },
    call: toolHistory,
  },
];

// ── stdio JSON-RPC 骨架（协议数据只走 stdout，日志全走 stderr）────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function respondErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { respondErr(msg.id, -32602, `未知工具：${name}`); return; }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => respond(msg.id, err(`工具执行异常：${(e && e.message) || e}`)));
    return;
  }
  if (msg.method === 'ping') { respond(msg.id, {}); return; }
}

log('info', `prompt-matrix MCP server 启动（${SERVER_VERSION}）`);
