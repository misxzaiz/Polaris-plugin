#!/usr/bin/env node
'use strict';
/**
 * abacus MCP Server —— AI 用量账的 AI 工具层（零依赖 stdio JSON-RPC）
 *
 * 职责：把「我这 AI 到底花了多少钱/token、花在哪、哪里在漏钱」翻译为对
 * cap.kv abacus.* 聚合面的只读查询（聚合由后台服务唯一写入，MCP 永不计算，
 * 与面板同源同口径）。唯一写入工具是 abacus_price_set（补价目，显式意图）。
 *
 * 工具一览：
 *   abacus_summary   总账（today/d7/d30/all：请求数/token 分解/成本/缓存节省/分源）
 *   abacus_models    模型账本（成本/缓存命中/TTFT/近30天）
 *   abacus_projects  项目账本（按目录 × 源归组）
 *   abacus_quality   质量透视（限流/错误/重试/TTFT/工具遥测/漏钱洞察）
 *   abacus_sessions  最烧钱会话 Top N
 *   abacus_prices    价目表（USD/Mtok，只读）
 *   abacus_price_set 补/改一个模型的价目（未知模型入账的唯一途径）
 *
 * 连接方式与 pocket-ledger / decision-journal 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/abacus-core.js');

const SERVER_NAME = 'abacus';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 decision-journal）───────────────────────────────
const APP_CONFIG_DIR = process.argv[2] || '';
const ENV_HOST = process.env.POLARIS_HOST || '';
const ENV_PORT = parseInt(process.env.POLARIS_PORT || '', 10);
const ENV_TOKEN = process.env.POLARIS_TOKEN || '';

function configCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过不可读候选 */ }
  }
  if (APP_CONFIG_DIR) cands.push(path.join(APP_CONFIG_DIR, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number') return { host: web.host || '', port: web.port, token: web.token || '' };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/api/health', timeout: 1200 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _ep = null;
function resolveEndpoint() {
  if (!_ep) {
    _ep = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await healthCheck(host, basePort + i)) return { host, port: basePort + i, token };
      }
      return { host, port: basePort, token };
    })();
  }
  return _ep;
}

function polarisIpc(command, args = {}, { retries = 2, retryDelay = 300, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      resolveEndpoint().then((ep) => {
        const data = JSON.stringify(args);
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (ep.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
        const req = http.request(
          { hostname: ep.host, port: ep.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(body); } });
          },
        );
        req.on('error', (e) => {
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error(`Polaris IPC ${command} 失败: ${e.message}`));
        });
        req.on('timeout', () => {
          req.destroy();
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error('Polaris IPC timeout'));
        });
        req.write(data);
        req.end();
      }).catch(reject);
    };
    attempt(0);
  });
}

async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv get 失败');
  return res.result && res.result.value !== undefined ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
  return true;
}

// ── 格式化 ─────────────────────────────────────────────────────────────────

function fmtTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtUsd(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

async function loadFx() {
  const s = await kvGet(core.K.settings).catch(() => null);
  const fx = s && Number(s.fxRate);
  return Number.isFinite(fx) && fx > 0 ? fx : core.DEFAULT_SETTINGS.fxRate;
}

function money(usd, fx) {
  if (!Number.isFinite(usd)) return '—';
  return `${fmtUsd(usd)}（≈¥${(usd * fx).toFixed(2)}）`;
}

// ── 数据访问（只读聚合面）──────────────────────────────────────────────────

async function loadAgg() {
  const meta = await kvGet(core.K.meta).catch(() => null);
  if (!meta) {
    throw new Error('AI 用量账服务还没有发布过聚合（首次扫描约需 1 分钟）：请确认插件已启用并稍候，或打开AI 用量账面板查看扫描状态。');
  }
  const [summary, models, projects, quality, sessions, prices] = await Promise.all([
    kvGet(core.K.summary), kvGet(core.K.models), kvGet(core.K.projects),
    kvGet(core.K.quality), kvGet(core.K.sessions), kvGet(core.K.prices),
  ]);
  return { meta, summary, models: models || [], projects: projects || [], quality, sessions: sessions || [], prices: prices && Object.keys(prices).length ? prices : core.DEFAULT_PRICES };
}

const PERIODS = ['today', 'd7', 'd30', 'all'];

function bucketText(label, b, fx) {
  const lines = [
    `【${label}】请求 ${b.req} 次（可计价 ${b.priced}）`,
    `token：全价输入 ${fmtTokens(b.fin)} ｜ 缓存读 ${fmtTokens(b.cr)} ｜ 缓存写 ${fmtTokens(b.cw)} ｜ 输出 ${fmtTokens(b.out)}`,
    `成本 ${money(b.costUsd, fx)} ｜ 缓存帮你省了 ${fmtUsd(b.cacheSavings)}`,
  ];
  if (b.unpricedTokens > 0) lines.push(`未计价 token ${fmtTokens(b.unpricedTokens)}（价目表缺这些模型）`);
  return lines.filter(Boolean).join('\n');
}

// ── 工具定义 ───────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'abacus_summary',
    description: 'AI 花销总账：某时段的请求数、token 四分解（全价输入/缓存读/缓存写/输出）、成本（USD 与人民币折算）、缓存节省、分源（zcode 编程 / claude / polaris 聊天）小计。回答「这个月 AI 花了多少」「今天烧了多少 token」。',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS, description: '时段：today=今天 / d7=近7天 / d30=近30天 / all=累计。默认 d30' },
      },
    },
    async call(args) {
      const agg = await loadAgg();
      const fx = await loadFx();
      const period = PERIODS.includes(args.period) ? args.period : 'd30';
      const label = { today: '今天', d7: '近 7 天', d30: '近 30 天', all: '累计' }[period];
      const s = agg.summary;
      if (!s) return err('聚合数据缺失（服务尚未完成首扫）');
      const lines = [
        `AI 用量账 · ${label}总账（扫描于 ${new Date(agg.meta.lastScanAt || Date.now()).toLocaleString()}）`,
        '',
        bucketText(label, s[period], fx),
        '',
        '分源：',
        ...Object.entries(s.bySrc || {}).map(([src, b]) => `  ${src}：${b.req} 次 ｜ 成本 ${fmtUsd(b.costUsd)} ｜ token ${fmtTokens(b.fin + b.cr + b.cw + b.out)}`),
      ];
      const q = agg.quality;
      if (q && q.insights && q.insights.length) {
        lines.push('', '漏钱透视（摘要）：', ...q.insights.slice(0, 3).map((i) => `  [${i.level}] ${i.text}`));
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'abacus_models',
    description: '模型账本：每个模型的请求数、token 分解、成本、缓存命中率、TTFT P50/P90、错误数、近 30 天小计。回答「哪个模型最烧钱」「GLM 的缓存命中多少」。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '返回条数上限，默认 10' } },
    },
    async call(args) {
      const agg = await loadAgg();
      const fx = await loadFx();
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      if (!agg.models.length) return ok('暂无模型数据（服务尚未完成首扫或台账为空）');
      const lines = [`模型账本（按成本降序，前 ${limit}；累计口径）：`];
      for (const m of agg.models.slice(0, limit)) {
        lines.push(
          `• ${m.model}${m.priced === 0 ? '（未计价）' : ''} — ${money(m.costUsd, fx)}`,
          `  请求 ${m.req} 次（近30天 ${m.d30Req} 次 / ${fmtUsd(m.d30Cost)}）｜ 全价输入 ${fmtTokens(m.fin)} ｜ 缓存读 ${fmtTokens(m.cr)}${m.cacheHit !== null ? `（命中 ${m.cacheHit}%）` : ''} ｜ 输出 ${fmtTokens(m.out)}`,
          `  缓存节省 ${fmtUsd(m.savings)}${m.ttftP50 ? ` ｜ TTFT P50 ${Math.round(m.ttftP50)}ms` : ''}${m.err ? ` ｜ 错误 ${m.err}` : ''}`,
        );
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'abacus_projects',
    description: '项目账本：按项目目录 × 数据源归组的 token/成本/会话数。回答「Polaris 这个项目烧了多少」「哪个项目最贵」。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '返回条数上限，默认 12' } },
    },
    async call(args) {
      const agg = await loadAgg();
      const fx = await loadFx();
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 12));
      if (!agg.projects.length) return ok('暂无项目数据');
      const lines = [`项目账本（按 token 降序，前 ${limit}）：`];
      for (const p of agg.projects.slice(0, limit)) {
        lines.push(`• ${p.proj} [${p.src}] — token ${fmtTokens(p.tokens)} ｜ 成本 ${money(p.costUsd, fx)} ｜ ${p.sessions} 会话 / ${p.req} 请求 ｜ 最近 ${p.lastDay || '—'}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'abacus_quality',
    description: '质量与漏钱透视：限流/错误分类计数、重试行数、TTFT 与时长分位、工具调用遥测（Top 工具/破坏性操作计数）、以及AI 用量账自动生成的漏钱洞察列表。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const agg = await loadAgg();
      const q = agg.quality;
      if (!q) return ok('暂无质量数据');
      const lines = ['质量与漏钱透视（zcode 遥测口径）：'];
      const errTotal = Object.values(q.errorsByType || {}).reduce((s, n) => s + n, 0);
      lines.push(`错误请求：${errTotal} 次${Object.keys(q.errorsByType || {}).length ? `（${Object.entries(q.errorsByType).map(([k, n]) => `${k}=${n}`).join('，')}）` : ''}`);
      lines.push(`重试行：${q.retriedRows} / ${q.zcodeRows} 请求行`);
      if (q.ttftP50) lines.push(`TTFT：P50 ${Math.round(q.ttftP50)}ms ｜ P90 ${Math.round(q.ttftP90 || 0)}ms`);
      if (q.durP50) lines.push(`请求时长：P50 ${Math.round(q.durP50)}ms ｜ P90 ${Math.round(q.durP90 || 0)}ms`);
      if (q.tools && q.tools.total) {
        lines.push(`工具调用：共 ${q.tools.total} 次（破坏性 ${q.tools.destructive} 次）`);
        for (const t of (q.tools.byName || []).slice(0, 6)) lines.push(`  ${t.name} ×${t.n}${t.avgDurMs ? `（均 ${t.avgDurMs}ms）` : ''}`);
      }
      if (q.insights && q.insights.length) {
        lines.push('', '洞察：', ...q.insights.map((i) => `  [${i.level}] ${i.text}`));
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'abacus_sessions',
    description: '最烧钱的会话 Top N（跨三源）：标题、项目、源、请求数、token、成本、起止日期。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数上限，默认 10' },
      },
    },
    async call(args) {
      const agg = await loadAgg();
      const fx = await loadFx();
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      if (!agg.sessions.length) return ok('暂无会话数据');
      const lines = [`最烧钱会话 Top ${limit}：`];
      for (const s of agg.sessions.slice(0, limit)) {
        lines.push(`• [${s.src}] ${s.title || s.sid.slice(0, 16)} — ${money(s.costUsd, fx)} ｜ token ${fmtTokens(s.tokens)} ｜ ${s.req} 请求 ｜ ${s.firstDay}~${s.lastDay}${s.proj ? ` ｜ ${s.proj}` : ''}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'abacus_prices',
    description: '查看当前价目表（USD / 百万 token：全价输入 in / 缓存读 cacheRead / 缓存写 cacheWrite / 输出 out）。只读；改价用 abacus_price_set。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const agg = await loadAgg();
      const lines = ['价目表（USD / Mtok）：'];
      for (const [model, p] of Object.entries(agg.prices)) {
        lines.push(`• ${model}${p.preset ? '（内置预设，可改）' : p.source === 'litellm' ? '（LiteLLM 同步）' : ''} — in ${p.in} ｜ cacheRead ${p.cacheRead} ｜ cacheWrite ${p.cacheWrite} ｜ out ${p.out}`);
      }
      lines.push('', '改价：abacus_price_set（写入后下一次聚合立即生效）。');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'abacus_price_set',
    description: '设置一个模型的价目（USD / 百万 token）。用于把「未计价模型」入账或修正价格。四个价格字段至少给一个；未给的字段保持原值。',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: '模型名（与台账中一致，如 sensenova-6.8-flash-lite）' },
        in: { type: 'number', description: '全价输入 USD/Mtok' },
        cacheRead: { type: 'number', description: '缓存读 USD/Mtok' },
        cacheWrite: { type: 'number', description: '缓存写 USD/Mtok' },
        out: { type: 'number', description: '输出 USD/Mtok' },
      },
      required: ['model'],
    },
    async call(args) {
      const model = String(args.model || '').trim();
      if (!model || model === '(未记录)') return err('model 必填（且不能是 "(未记录)"）');
      const agg = await loadAgg();
      const prices = { ...agg.prices };
      const prev = prices[model] || { in: 0, cacheRead: 0, cacheWrite: 0, out: 0 };
      const next = {
        in: Number.isFinite(Number(args.in)) && args.in !== undefined ? Number(args.in) : prev.in,
        cacheRead: Number.isFinite(Number(args.cacheRead)) && args.cacheRead !== undefined ? Number(args.cacheRead) : prev.cacheRead,
        cacheWrite: Number.isFinite(Number(args.cacheWrite)) && args.cacheWrite !== undefined ? Number(args.cacheWrite) : prev.cacheWrite,
        out: Number.isFinite(Number(args.out)) && args.out !== undefined ? Number(args.out) : prev.out,
        preset: false,
        source: 'manual',
      };
      if (next.in < 0 || next.out < 0 || next.cacheRead < 0 || next.cacheWrite < 0) return err('价格不能为负数');
      prices[model] = next;
      await kvSet(core.K.prices, prices);
      return ok(`已写入 ${model}：in ${next.in} ｜ cacheRead ${next.cacheRead} ｜ cacheWrite ${next.cacheWrite} ｜ out ${next.out}。后台服务 30s 内热加载并重算聚合。`);
    },
  },
];

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) }); return; }
    try {
      send({ jsonrpc: '2.0', id: msg.id, result: await tool.call(args) });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      handleMessage(JSON.parse(line)).catch((e) => log('error', `handle: ${e.message}`));
    } catch (e) {
      log('error', `bad json: ${e.message}`);
    }
  }
});
process.stdin.on('end', () => process.exit(0));

log('info', `abacus MCP v${SERVER_VERSION} 就绪（7 工具，只读聚合面 + 显式补价）`);
