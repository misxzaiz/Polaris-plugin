#!/usr/bin/env node
'use strict';
/**
 * llm-probe MCP Server —— 模型体检台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 llmprobe.* 键空间命令投递。
 * 探针执行与结果写入的唯一权威是后台服务（service/main.js）——MCP 只投递
 * 命令并等待回执，与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量：所有面向 AI 的返回均为掩码形态（****<last4>），完整 apiKey
 * 对 MCP 不可见（掩码在 service 侧落 kv 时已完成，本层只读 kv）。
 *
 * 工具一览（5 个）：
 *   llmprobe_profiles 列出可体检档案（掩码）
 *   llmprobe_run      对指定档案发起体检查看（等待完成或指引轮询）
 *   llmprobe_report   读取体检/基准报告详情
 *   llmprobe_history  历史趋势与对比摘要
 *   llmprobe_bench    发起基准测试（TTFT/TPS 分档，显式花费确认）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'llm-probe';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'llmprobe.meta',
  profiles: 'llmprobe.profiles',
  latest: 'llmprobe.latest',
  history: 'llmprobe.history',
  report: (id) => `llmprobe.report.${id}`,
  bench: (id) => `llmprobe.bench.${id}`,
  cmd: 'llmprobe.cmd',
  res: 'llmprobe.res',
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
    await sleep(1200);
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
      ? `命令已投递但 ${Math.round((waitMs || 90000) / 1000)}s 内未见回执（体检仍在后台进行）。用 llmprobe_report/latest 轮询，或稍后重试。`
      : '命令已投递但服务无响应（服务可能未启动或正忙）。',
  };
}

// ── 报告渲染（AI 可读文本，全掩码）──────────────────────────────────────────
function fmtStepLine(name, label, s) {
  if (!s) return `  · ${label}：未执行`;
  if (s.skipped) return `  · ${label}：⏭ 跳过（${oneLine(s.detail || '', 60)}）`;
  if (s.ok === false) {
    const e = s.error || {};
    return `  · ${label}：❌ ${e.cn || '失败'}[${e.code || '?'}] ${oneLine(e.hint || '', 90)}`;
  }
  let extra = '';
  if (name === 'models') extra = `${s.count} 个模型${s.hasTarget == null ? '' : (s.hasTarget ? '，目标模型在列 ✓' : '，目标模型不在列 ⚠')}`;
  else if (name === 'stream') extra = `TTFT ${s.ttftMs}ms / ${s.tps} tok/s / 总 ${s.totalMs}ms`;
  else if (name === 'chat') extra = `${s.ms}ms${s.finishReason ? `（finish=${s.finishReason}）` : ''}`;
  else if (name === 'tools') extra = s.toolCalled ? `已触发 ✓ ${oneLine(s.detail || '', 60)}` : `HTTP 成功但模型未发起工具调用（${oneLine(s.detail || '', 50)}）`;
  return `  · ${label}：✓ ${extra}${s.ms && name === 'connect' ? `（${s.ms}ms）` : ''}`;
}

function renderReport(rep) {
  const p = rep.profile || {};
  const lines = [];
  lines.push(`【${p.name}】${p.wire === 'anthropic-messages' ? 'Anthropic Messages' : 'OpenAI Chat'} · ${p.baseUrl} · key ${p.keyMask || '无'} · 模型 ${p.model || '(空)'}`);
  if (rep.kind === 'bench') {
    const b = rep.bench || {};
    lines.push(b.ok ? '基准完成：' : '基准失败：');
    for (const s of (b.sizes || [])) {
      if (s.error && !s.ttftP50) { lines.push(`  · ${s.tokens} tok 档：❌ ${oneLine((s.error && s.error.cn) || '', 80)}`); continue; }
      lines.push(`  · ${s.tokens} tok 档：TTFT P50 ${s.ttftP50}ms（${s.ttftMin}~${s.ttftMax}）/ TPS P50 ${s.tpsP50}（${s.tpsMin}~${s.tpsMax}）/ 总 ${s.totalP50}ms${s.errs ? ` / 失败 ${s.errs} 轮` : ''}`);
    }
    for (const c of (b.compat || [])) lines.push(`  ⚠ ${c}`);
    return lines.join('\n');
  }
  if (rep.fatal) lines.push(`✋ ${rep.fatal.cn || ''} ${oneLine(rep.fatal.hint || '', 90)}`);
  const sc = rep.score || { total: 0, components: {} };
  lines.push(`健康分 ${sc.total}/100（${(rep.verdict && rep.verdict.cn) || ''}）｜连通 ${sc.components.connect}·鉴权 ${sc.components.auth}·模型表 ${sc.components.models}·对话 ${sc.components.chat}·流式 ${sc.components.stream}·工具 ${sc.components.tools}`);
  for (const [name, label] of Object.entries({ connect: '连通性', chat: '对话', models: '模型表', stream: '流式', tools: '工具调用' })) {
    lines.push(fmtStepLine(name, label, rep.steps && rep.steps[name]));
  }
  if (rep.urls) lines.push(`解析终点：chat=${rep.urls.chat}`);
  const warns = [];
  for (const st of Object.values(rep.steps || {})) {
    for (const c of (st && st.compat) || []) warns.push(c);
  }
  if (warns.length) lines.push(`兼容性提示：${warns.slice(0, 4).map(oneLine).join('；')}`);
  return lines.join('\n');
}

async function loadProfilesOrErr() {
  try {
    const v = await kv.kvGet(K.profiles);
    const items = v && Array.isArray(v.items) ? v.items : [];
    return { items };
  } catch (e) {
    return { error: `档案读取失败（桥不可达？）：${e.message}` };
  }
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolProfiles() {
  const { items, error } = await loadProfilesOrErr();
  if (error) return err(error);
  if (!items.length) return ok('暂无档案。先执行 llmprobe_run 的 suggest_import 提示，或在面板「档案」页点「导入宿主档案」，或用面板手动添加端点。');
  const lines = items.map((p, i) =>
    `${i + 1}. [${p.id}] ${p.name}｜${p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}｜${p.baseUrl}｜模型 ${p.model || '(空)'}｜key ${p.keyMask}｜${p.source === 'host' ? '宿主导入' : '手动'}`);
  return ok(`共 ${items.length} 个档案（key 均已掩码）：\n${lines.join('\n')}\n\n用 llmprobe_run 的 profileId 发起体检。`);
}

async function toolRun(args) {
  const profileId = String(args.profileId || '');
  const { items, error } = await loadProfilesOrErr();
  if (error) return err(error);
  if (!items.length) return ok('暂无档案。请先在面板「档案」页「导入宿主档案」或手动添加端点后重试。');
  if (!profileId || !items.some((p) => p.id === profileId)) {
    return ok(`请指定 profileId（必填，从 llmprobe_profiles 里选）。当前可选：\n${items.map((p) => `- ${p.id}（${p.name}）`).join('\n')}`);
  }
  const r = await sendCommand('run_suite', { profileId }, args.waitMs || 90000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  if (r.pending) return ok(`${r.error}\n\n也可用 llmprobe_report 读最新报告（llmprobe.latest）。`);
  return err(r.error || '体检失败');
}

async function toolReport(args) {
  const runId = String(args.runId || '');
  if (runId) {
    const kind = String(args.kind || 'suite');
    let rep = null;
    try { rep = await kv.kvGet(kind === 'bench' ? K.bench(runId) : K.report(runId)); } catch (_) { /* 忽略 */ }
    if (rep) return ok(renderReport(rep));
    return err(`报告 ${runId} 不存在或已被清理（仅保留最近几份）`);
  }
  let latest = null;
  try { latest = await kv.kvGet(K.latest); } catch (_) { /* 忽略 */ }
  if (!latest) return ok('尚无体检报告。用 llmprobe_run 发起一次体检。');
  return ok(`（最近一次报告，runId=${latest.runId || '?'}）\n${renderReport(latest)}`);
}

async function toolHistory(args) {
  let h = [];
  try {
    const v = await kv.kvGet(K.history);
    h = Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
  } catch (e) { return err(`历史读取失败：${e.message}`); }
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);
  const filter = args.profileId ? String(args.profileId) : '';
  const rows = h.filter((x) => !filter || x.profileId === filter).slice(0, limit);
  if (!rows.length) return ok('暂无历史记录。');
  const lines = rows.map((x) => {
    const metric = x.kind === 'bench' ? `基准 ${x.verdict || ''}` : `分 ${x.score != null ? x.score : '?'}（${x.verdict || ''}）`;
    const perf = x.ttftMs != null ? ` TTFT ${x.ttftMs}ms${x.tps != null ? ` / ${x.tps} tok/s` : ''}` : '';
    const mark = x.ok ? '✓' : '❌';
    return `${mark} ${String(x.at || '').replace('T', ' ').slice(0, 16)} [${x.profileName}] ${metric}${perf}`;
  });
  // 同档案趋势摘要
  const byName = {};
  for (const x of h) { if (x.profileId) (byName[x.profileId] = byName[x.profileId] || { name: x.profileName, n: 0, scores: [] }); byName[x.profileId].n += 1; if (x.kind !== 'bench' && x.score != null) byName[x.profileId].scores.push(x.score); }
  const trend = Object.values(byName).slice(0, 8).map((t) => {
    const s = t.scores;
    const avg = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
    return `${t.name}：${t.n} 次记录${avg != null ? `，均分 ${avg}（最近 ${s[0]}）` : ''}`;
  });
  return ok(`最近记录：\n${lines.join('\n')}\n\n趋势：\n${trend.join('\n')}`);
}

async function toolBench(args) {
  const profileId = String(args.profileId || '');
  const { items, error } = await loadProfilesOrErr();
  if (error) return err(error);
  if (!profileId || !items.some((p) => p.id === profileId)) {
    return ok(`请指定 profileId。当前可选：\n${items.map((p) => `- ${p.id}（${p.name}）`).join('\n')}\n\n注意：基准测试会向该端点发送真实生成请求（${args.rounds || 2} 轮 × ${Array.isArray(args.sizes) && args.sizes.length ? args.sizes.join('/') : 512} token 提示），产生少量费用，请确认用户已同意。`);
  }
  const sizes = Array.isArray(args.sizes) && args.sizes.length ? args.sizes : [512];
  const rounds = Math.min(Math.max(Number(args.rounds) || 2, 1), 5);
  const r = await sendCommand('run_bench', { profileId, sizes, rounds }, args.waitMs || 300000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  if (r.pending) return ok(`${r.error}\n\n基准耗时长，可用 llmprobe_report kind=bench 稍后读取。`);
  return err(r.error || '基准失败');
}

// ── 工具注册（description 写「适用句式」）───────────────────────────────────
const tools = [
  {
    name: 'llmprobe_profiles',
    description: '列出可体检的 LLM 端点档案（宿主已配置的模型供应商自动导入 + 手动添加）。适用于「我有哪些接口可以体检」「列出模型供应商」。key 全程掩码。',
    inputSchema: { type: 'object', properties: {} },
    call: toolProfiles,
  },
  {
    name: 'llmprobe_run',
    description: '对指定的 LLM 端点档案发起一次自动化体检：连通性/鉴权/模型表/非流式对话/流式 TTFT-TPS/工具调用逐项检查并打健康分（0-100），失败步骤给出中文诊断与修复建议。适用于「帮我测测 DeepSeek 这个 key 还能用吗」「这个端点为什么连不上」「对比一下这两家谁快」。会产生极少量生成花费（每步 ≤16 token）。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '档案 id（从 llmprobe_profiles 获取）' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 90000；超时后报告仍在后台继续写）' },
      },
      required: ['profileId'],
    },
    call: toolRun,
  },
  {
    name: 'llmprobe_report',
    description: '读取体检/基准报告详情。适用于「上次体检结果」「刚才那个报告」。缺省返回最近一次体检报告。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: '报告 id（缺省=最近一次）' },
        kind: { type: 'string', enum: ['suite', 'bench'], description: '报告类型（默认 suite）' },
      },
    },
    call: toolReport,
  },
  {
    name: 'llmprobe_history',
    description: '查看体检历史与趋势：每次体检的分数/TTFT/TPS 与按档案聚合的均值。适用于「我的接口最近变慢了吗」「上次体检什么时候」「历史对比」。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '只看某档案' },
        limit: { type: 'integer', description: '返回条数（默认 15，上限 40）' },
      },
    },
    call: toolHistory,
  },
  {
    name: 'llmprobe_bench',
    description: '对指定端点发起基准测试（流式 TTFT/TPS 分档测量，提示词 64/512/2048 token 可选档位）。会产生真实生成花费，调用前必须向用户确认。适用于「压一下这个端点的速度」「测 2k 上下文时 TTFT 多少」。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '档案 id' },
        sizes: { type: 'array', items: { type: 'integer', enum: [64, 512, 2048] }, description: '提示词规模档（≈token），默认 [512]' },
        rounds: { type: 'integer', description: '每档轮数 1-5，默认 2' },
        waitMs: { 'type': 'integer', description: '等待完成毫秒（默认 300000）' },
      },
      required: ['profileId'],
    },
    call: toolBench,
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
  // 未知请求忽略（保持骨架与宿主兼容）
}

log('info', `llm-probe MCP server 启动（${SERVER_VERSION}）`);
