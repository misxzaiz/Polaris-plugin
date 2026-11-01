#!/usr/bin/env node
'use strict';
/**
 * api-bench MCP Server —— 接口压测台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 api-bench.* 键空间命令投递。
 * 压测执行与报告写入的唯一权威是后台服务（service/main.js）——MCP 只投递
 * 命令并等待回执，与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量：
 *   - headers 在 service 侧落 kv 前已掩码，本层只读 kv，敏感头对 AI 不可见；
 *   - 工具描述明示「仅对拥有授权的目标压测」；服务端护栏（连接/时长上限、
 *     单任务互斥、可中止）兜底防失控；
 *   - 无定时压测、无自动重压：每个 run 都是一次显式调用。
 *
 * 工具一览（6 个）：
 *   api_bench_run     发起一次压测并等待结果（默认 ≤90s；更长指引轮询）
 *   api_bench_status  当前运行状态 / 最近一次报告摘要
 *   api_bench_stop    中止当前压测
 *   api_bench_history 历史记录列表
 *   api_bench_report  读取某次压测完整报告
 *   api_bench_compare 两次压测 A/B 对比（吞吐/分位延迟/错误，方向语义正确）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/bench-core');

const SERVER_NAME = 'api-bench';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'api-bench.meta',
  latest: 'api-bench.latest',
  history: 'api-bench.history',
  report: (id) => `api-bench.report.${id}`,
  cmd: 'api-bench.cmd',
  res: 'api-bench.res',
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

const MCP_RUN_WAIT_DEFAULT_MS = 90 * 1000;

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
      ? `命令已投递但 ${Math.round((waitMs || 90000) / 1000)}s 内未见回执（压测仍在后台进行）。用 api_bench_status 轮询。`
      : '命令已投递但服务无响应（服务可能未启动）。打开一次压测台面板可触发服务自举，稍后重试。',
  };
}

// ── 报告渲染（AI 可读文本；headers 已是掩码形态）────────────────────────────
function fmtDelta(pct) {
  if (pct === null || pct === undefined) return 'n/a';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

function renderReport(rep) {
  const t = rep.target || {};
  const s = rep.summary || {};
  const l = s.latencies || {};
  const lines = [];
  lines.push(`【压测报告】${t.method || 'GET'} ${t.url}`);
  lines.push(`参数：${t.connections} 连接 × ${s.durationS}s（实际）· pipelining ${t.pipelining} · timeout ${t.timeoutS}s${t.rate ? ` · 限速 ${t.rate}/s` : ''}${t.scope === 'public' ? ' · ⚠ 公网目标' : ''}`);
  lines.push(`吞吐：平均 ${core.fmtRate(s.rpsMean)}（峰值 ${core.fmtRate(s.rpsPeak)}）· ${core.fmtBytes(s.bytesMean)} · 共 ${s.totalRequests} 请求 / ${core.fmtBytes(s.bytesTotal)}`);
  lines.push(`延迟：p50 ${core.fmtMs(l.p50)} · p75 ${core.fmtMs(l.p75)} · p90 ${core.fmtMs(l.p90)} · p97.5 ${core.fmtMs(l.p97_5)} · p99 ${core.fmtMs(l.p99)} · 均值 ${core.fmtMs(l.mean)}（σ ${core.fmtMs(l.stddev)}）· 最小 ${core.fmtMs(l.min)} / 最大 ${core.fmtMs(l.max)}`);
  const dist = Object.entries(s.statusDist || {}).sort((x, y) => y[1] - x[1]).slice(0, 6)
    .map(([c, n]) => `${c}×${n}`).join(' · ');
  lines.push(`状态码：${dist || '（无响应）'} · 非 2xx ${s.non2xx}（${s.non2xxPct}%）· 连接/请求错误 ${s.errors} · 超时 ${s.timeouts}${s.aborted ? ' · ⚠ 已手动中止（部分结果）' : ''}`);
  const v = rep.verdict || { oneLine: '', notes: [] };
  lines.push(`结论：${v.oneLine}`);
  for (const n of (v.notes || [])) lines.push(`  · ${n}`);
  lines.push(`（runId=${rep.runId}，可用 api_bench_compare 与其他报告对比）`);
  return lines.join('\n');
}

function renderComparison(cmp) {
  const rows = cmp.rows || [];
  const lines = [];
  lines.push(`【A/B 对比】B 相对 A`);
  lines.push(`A：${cmp.a && cmp.a.target ? `${cmp.a.target.method} ${cmp.a.target.url}` : cmp.a && cmp.a.runId}（${cmp.a && cmp.a.at ? String(cmp.a.at).replace('T', ' ').slice(0, 16) : '?'}）`);
  lines.push(`B：${cmp.b && cmp.b.target ? `${cmp.b.target.method} ${cmp.b.target.url}` : cmp.b && cmp.b.runId}（${cmp.b && cmp.b.at ? String(cmp.b.at).replace('T', ' ').slice(0, 16) : '?'}）`);
  lines.push('');
  for (const r of rows) {
    const better = r.better === 'b' ? '✓ B' : (r.better === 'a' ? '✓ A' : (r.better === 'tie' ? '—' : '?'));
    lines.push(`${r.label.padEnd(8, '　')} A ${r.a}${r.unit} ｜ B ${r.b}${r.unit} ｜ Δ ${fmtDelta(r.deltaPct)} ｜ ${better}`);
  }
  lines.push('');
  const verdict = cmp.bWins > cmp.aWins ? `B 总体更优（${cmp.bWins} 项胜 ${cmp.aWins} 项，平 ${cmp.ties}）` : (cmp.aWins > cmp.bWins ? `A 总体更优（${cmp.aWins} 项胜 ${cmp.bWins} 项，平 ${cmp.ties}）` : `两者打平（${cmp.ties} 项持平）`);
  lines.push(`结论：${verdict}。方向语义：吞吐升为优，延迟/错误降为优。`);
  return lines.join('\n');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolRun(args) {
  const waitMs = Math.min(Math.max(Number(args.waitMs) || MCP_RUN_WAIT_DEFAULT_MS, 5000), 330000);
  const r = await sendCommand('run', {
    url: args.url,
    method: args.method,
    headers: args.headers,
    body: args.body,
    connections: args.connections,
    durationS: args.durationS,
    pipelining: args.pipelining,
    rate: args.rate,
    timeoutS: args.timeoutS,
  }, waitMs);
  if (r.ok && r.report) {
    const t = r.report.target || {};
    return ok(`压测完成（runId=${r.report.runId}）：\n${renderReport(r.report)}\n\n提示：如需再对比优化效果，改动目标后用相同参数再跑一次，然后 api_bench_compare。`);
  }
  if (r.pending) {
    return ok(`${r.error}\n\n压测时长超过等待窗口时属正常现象。`);
  }
  if (r.busy) return err(`${r.error}\n\n可先用 api_bench_status 查看进度，或 api_bench_stop 中止后重试。`);
  return err(r.error || '压测失败');
}

async function toolStatus() {
  const r = await sendCommand('state', {}, 20000);
  if (!r.ok) return err(r.error || '状态读取失败');
  if (r.running) {
    const v = r.running;
    return ok(`压测进行中（runId=${v.runId}，来源 ${v.source}）：\n目标：${v.method} ${v.url}\n进度：${v.elapsedS}s / ${v.durationS}s（${v.connections} 连接）\n实时：${core.fmtRate(v.rps)} · 窗口延迟 mean ${v.latMean != null ? core.fmtMs(v.latMean) : '采样中'} / p97.5 ${v.latP97_5 != null ? core.fmtMs(v.latP97_5) : '采样中'} · 错误 ${v.errs} · 非 2xx ${v.non2xx}`);
  }
  if (r.latest) return ok(`当前空闲。最近一次报告：\n${renderReport(r.latest)}`);
  return ok('当前空闲，且没有任何历史报告。用 api_bench_run 发起第一次压测（可先用内置试金石 http://127.0.0.1:<服务端口>/demo/ok 验证工具本身——端口见面板或 api_bench_status 的服务信息）。');
}

async function toolStop() {
  const r = await sendCommand('stop', {}, 20000);
  if (r.ok) return ok(`已发送中止指令（runId=${r.runId}），报告会以部分结果落库。`);
  return err(r.error || '中止失败');
}

async function toolHistory(args) {
  const r = await sendCommand('history', { limit: args.limit }, 20000);
  if (!r.ok) return err(r.error || '历史读取失败');
  const items = r.items || [];
  if (!items.length) return ok('暂无压测历史。用 api_bench_run 发起第一次压测。');
  const lines = items.map((x, i) => {
    const mark = x.aborted ? '⏹' : '✓';
    return `${i + 1}. ${mark} ${String(x.at || '').replace('T', ' ').slice(0, 16)} [runId=${x.runId}] ${x.method} ${x.url} · ${x.connections}c×${x.durationS}s · ${core.fmtRate(x.rpsMean)} · p97.5 ${core.fmtMs(x.p97_5)} · 错误 ${x.errors} · 非2xx ${x.non2xx}`;
  });
  return ok(`最近 ${items.length} 次压测（新→旧）：\n${lines.join('\n')}\n\n用 api_bench_report {runId} 看详情，api_bench_compare {a, b} 对比。`);
}

async function toolReport(args) {
  const runId = String(args.runId || '');
  if (!runId) {
    let latest = null;
    try { latest = await kv.kvGet(K.latest); } catch (_) { /* 桥不可达 */ }
    if (!latest) return ok('尚无报告。用 api_bench_run 发起一次压测，或指定 runId。');
    return ok(`（最近一次报告，runId=${latest.runId}）\n${renderReport(latest)}`);
  }
  const r = await sendCommand('report', { runId }, 20000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  return err(r.error || `报告读取失败：${runId}`);
}

async function toolCompare(args) {
  const a = String(args.a || '');
  const b = String(args.b || '');
  if (!a || !b) {
    let h = [];
    try {
      const v = await kv.kvGet(K.history);
      h = Array.isArray(v) ? v : [];
    } catch (_) { /* 忽略 */ }
    return ok(`请提供两次压测的 runId（参数 a=基准，b=对比）。最近历史：\n${h.slice(0, 8).map((x) => `- ${x.runId}（${String(x.at || '').replace('T', ' ').slice(0, 16)} ${x.method} ${x.url}）`).join('\n') || '（暂无历史）'}`);
  }
  const r = await sendCommand('compare', { a, b }, 20000);
  if (r.ok) return ok(renderComparison(r.comparison));
  return err(r.error || '对比失败');
}

// ── 工具注册（description 写「适用句式」）───────────────────────────────────
const tools = [
  {
    name: 'api_bench_run',
    description: '对指定 HTTP 接口发起一次本地压测（并发/时长/限速可控），返回吞吐、延迟分位（p50/p90/p97.5/p99）、状态码分布与中文结论。适用于「压一下这个接口」「这个接口能扛多少 QPS」「加缓存前后对比一下性能」。只对拥有授权的目标使用（本机/内网服务、或你拥有的公网服务）。本机无依赖直接可测；也可以先压内置试金石验证工具。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '目标 URL（http/https）' },
        method: { type: 'string', description: 'HTTP 方法，默认 GET' },
        headers: { type: 'object', description: '请求头 {名: 值}（host/content-length 由客户端托管不可设置；敏感头在报告中自动掩码）' },
        body: { type: 'string', description: '请求体（GET/HEAD 不可携带；对象会自动 JSON 序列化）' },
        connections: { type: 'integer', description: '并发连接数 1-1000，默认 10' },
        durationS: { type: 'integer', description: '持续秒数 1-300，默认 10' },
        pipelining: { type: 'integer', description: '管道复用数 1-10，默认 1' },
        rate: { type: 'integer', description: '可选：每秒总请求数上限（限速压测）' },
        timeoutS: { type: 'integer', description: '单请求超时秒数 0.5-60，默认 10' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 90000；压测本身超过该时长则提示轮询 api_bench_status）' },
      },
      required: ['url'],
    },
    call: toolRun,
  },
  {
    name: 'api_bench_status',
    description: '查看压测台当前状态：正在运行的压测实时进度（RPS/延迟/错误），或最近一次报告摘要。适用于「压测跑得怎么样了」「上次压测结果是什么」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStatus,
  },
  {
    name: 'api_bench_stop',
    description: '中止当前正在进行的压测（报告会以部分结果保留）。适用于「别压了」「停下来」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStop,
  },
  {
    name: 'api_bench_history',
    description: '列出最近压测历史（时间/目标/吞吐/p97.5/错误）。适用于「我压过哪些接口」「之前的结果」。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '返回条数（默认 20，上限 50）' } },
    },
    call: toolHistory,
  },
  {
    name: 'api_bench_report',
    description: '读取某次压测的完整报告（吞吐/延迟分位/状态码分布/结论）。缺省返回最近一次。适用于「那次压测的详情」。',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string', description: '压测 runId（缺省=最近一次）' } },
    },
    call: toolReport,
  },
  {
    name: 'api_bench_compare',
    description: '对比两次压测（A=基准，B=改动后）：吞吐/延迟分位/错误的逐项 Δ 与胜负判定（吞吐升为优，延迟/错误降为优）。适用于「优化前后差多少」「加缓存有没有效果」「两个版本谁快」。',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'string', description: '基准报告 runId' },
        b: { type: 'string', description: '对比报告 runId' },
      },
      required: ['a', 'b'],
    },
    call: toolCompare,
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

log('info', `api-bench MCP server 启动（${SERVER_VERSION}）`);
