#!/usr/bin/env node
'use strict';
/**
 * quote-sentinel MCP Server —— 盘哨的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的 tools/call 翻译为 Polaris IPC bridge 的 router_dispatch
 * （target=cap.kv）读写 qsent.* 键空间，与服务/面板共享同一事实库。
 * 外网抓取永远由后台服务执行——MCP 只管「查询 / 登记 / 触发抓取并回读」。
 *
 * 工具一览：
 *   qs_overview          大盘概览（默认指数 + 自选涨跌榜 + 服务状态）
 *   qs_quote_query       查询实时行情（命令通道，服务侧真实时抓取）
 *   qs_search            名称/代码搜索（smartbox，标注是否可行情）
 *   qs_watchlist_list    列出自选与最新行情
 *   qs_watchlist_add     添加自选（自动识别市场）
 *   qs_watchlist_remove  移除自选
 *   qs_position_set      设置/清除持仓成本（用于盈亏显示）
 *   qs_alert_set         新建/修改到价或涨跌幅提醒
 *   qs_alert_list        列出提醒规则与最近触发
 *   qs_alert_remove      删除提醒
 *
 * 命令模式（伪 IPC）：MCP 写 qsent.cmd.*.<nonce> → 后台服务消费并写
 * qsent.<result>.<nonce> → MCP 轮询回读后清理。等待上限 12s。
 *
 * 免责声明随查询结果一并返回：行情数据仅供个人参考，非投资建议。
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { normalizeCode, fmtNum, fmtAmountWan, fmtVolumeHand } = require('../service/normalize');
const { describeAlert } = require('../service/alerts');

const SERVER_NAME = 'quote-sentinel';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const DISCLAIMER = '（数据来自公开行情接口，可能有延迟或错误，仅供个人参考，非投资建议）';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── qsent.* 键空间（与 service/quotes.js、面板 model.ts 三方一致）────────────
const K = {
  watch: (id) => `qsent.watch.${id}`,
  state: (id) => `qsent.state.${id}`,
  minute: (id) => `qsent.minute.${id}`,
  cmdQuote: (nonce) => `qsent.cmd.quote.${nonce}`,
  quote: (nonce) => `qsent.quote.${nonce}`,
  cmdSearch: (nonce) => `qsent.cmd.search.${nonce}`,
  search: (nonce) => `qsent.search.${nonce}`,
  alert: (aid) => `qsent.alert.${aid}`,
  alertFeed: 'qsent.alert.feed',
  position: (id) => `qsent.position.${id}`,
  settings: 'qsent.settings',
  meta: 'qsent.meta',
};

// ── Polaris IPC 自发现（与 page-sentinel 同套路）────────────────────────────
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
    } catch (_) { /* 跳过 */ }
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
      if (typeof web.port === 'number' && web.port > 0) {
        return { host: web.host || '', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/api/health', timeout: 1200 },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _endpointPromise = null;
function resolveEndpoint() {
  if (!_endpointPromise) {
    _endpointPromise = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) {
        return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      }
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
  return _endpointPromise;
}

function polarisIpc(command, args = {}, { retries = 2, retryDelay = 300, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      resolveEndpoint()
        .then((ep) => {
          const data = JSON.stringify(args);
          const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
          if (ep.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
          const req = http.request(
            { hostname: ep.host, port: ep.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout },
            (res) => {
              let responseData = '';
              res.on('data', (chunk) => { responseData += chunk; });
              res.on('end', () => {
                try { resolve(JSON.parse(responseData)); } catch (_) { resolve(responseData); }
              });
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
        })
        .catch((e) => reject(e));
    };
    attempt(0);
  });
}

// ── cap.kv 封装 ────────────────────────────────────────────────────────────
async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv get 失败');
  const r = res.result;
  return r && r.value !== undefined ? r.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value: value === undefined ? null : value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
  return true;
}
async function kvDel(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv delete 失败');
  return true;
}
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  const r = res.result;
  return r && Array.isArray(r.keys) ? r.keys : [];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 命令模式：写命令键 → 轮询结果键 → 清理 → 返回结果（服务未运行时超时报清晰错误） */
async function runCommand(cmdKey, resultKey, payload, { timeoutMs = 12000, pollMs = 800 } = {}) {
  await kvSet(cmdKey, { ...payload, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const r = await kvGet(resultKey).catch(() => null);
    if (r && typeof r === 'object') {
      kvDel(resultKey).catch(() => {});
      kvDel(cmdKey).catch(() => {});
      return r;
    }
  }
  throw new Error('后台服务未响应（可能未运行：设置 → 插件 → 盘哨 查看服务状态）');
}

// ── 格式化辅助 ─────────────────────────────────────────────────────────────
function arrow(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '';
  return pct > 0 ? '↑' : (pct < 0 ? '↓' : '→');
}
function fmtQuoteLine(q, extra = '') {
  const pct = fmtNum(q.pct);
  return `${q.name}(${q.id}) 现价 ${fmtNum(q.price)} ${arrow(q.pct)}${pct}% `
    + `涨跌 ${fmtNum(q.chg)} 高 ${fmtNum(q.high)} 低 ${fmtNum(q.low)} `
    + `量 ${fmtVolumeHand(q.volume)} 额 ${fmtAmountWan(q.amount)}${extra} [${q.time ? q.time.slice(4, 6) + '-' + q.time.slice(6, 8) + ' ' + q.time.slice(8, 10) + ':' + q.time.slice(10, 12) : '时间未知'} 来源:${q.source}]`;
}
function nonce() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
async function loadWatchIds() {
  const keys = await kvKeys();
  return keys.filter((k) => k.startsWith('qsent.watch.')).map((k) => k.slice('qsent.watch.'.length));
}
async function loadAlerts() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith('qsent.alert.') && k !== 'qsent.alert.feed')
    .map((k) => k.slice('qsent.alert.'.length));
  const vals = await Promise.all(ids.map((id) => kvGet(K.alert(id)).catch(() => null)));
  return vals.filter((a) => a && typeof a === 'object');
}
/** 尽力通过搜索解析名称（失败静默返回 code） */
async function resolveName(code, id) {
  try {
    const n = nonce(); // 同上：命令键与结果键共用
    const r = await runCommand(K.cmdSearch(n), K.search(n), { q: code }, { timeoutMs: 9000 });
    if (r && r.ok && Array.isArray(r.results)) {
      const hit = r.results.find((x) => x.id === id) || r.results.find((x) => x.code === code);
      if (hit) return hit.name;
    }
  } catch (_) { /* 名称解析失败不影响添加 */ }
  return code;
}

// ── 工具定义 ───────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'qs_overview',
    description: '盘哨：大盘概览。返回默认指数（上证指数/深证成指/创业板指）最新行情、自选股涨跌榜与服务运行状态。适合回答「今天大盘怎么样」「我的自选整体如何」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const settings = (await kvGet(K.settings)) || {};
      const indexIds = Array.isArray(settings.indexes) && settings.indexes.length
        ? settings.indexes : ['sh000001', 'sz399001', 'sz399006'];
      const watchIds = await loadWatchIds();
      const stateIds = [...new Set([...indexIds, ...watchIds])];
      const states = await Promise.all(stateIds.map((id) => kvGet(K.state(id)).catch(() => null)));
      const meta = await kvGet(K.meta).catch(() => null);
      const lines = [];
      const idx = [];
      const rows = [];
      stateIds.forEach((id, i) => {
        const q = states[i];
        if (!q) return;
        if (indexIds.includes(id)) idx.push(q); else rows.push(q);
      });
      if (idx.length) {
        lines.push('【指数】');
        for (const q of idx) lines.push('  ' + fmtQuoteLine(q));
      }
      if (rows.length) {
        rows.sort((a, b) => (b.pct || 0) - (a.pct || 0));
        lines.push(`【自选 ${rows.length} 只，按涨跌排序】`);
        for (const q of rows) {
          const pos = await kvGet(K.position(q.id)).catch(() => null);
          let extra = '';
          if (pos && Number.isFinite(Number(pos.cost)) && Number.isFinite(Number(pos.shares)) && pos.shares > 0) {
            const pnl = (q.price - pos.cost) * pos.shares;
            extra = ` 持仓盈亏 ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`;
          }
          lines.push('  ' + fmtQuoteLine(q, extra));
        }
      }
      if (!idx.length && !rows.length) lines.push('暂无行情数据（服务可能尚未完成首次轮询，或尚未添加自选）');
      if (meta) {
        const sess = meta.inSession ? '交易时段' : '非交易时段（盘外降频轮询）';
        lines.push(`【服务】运行中 v${meta.version || '?'}，轮询间隔 ${meta.pollSec}s（${sess}），数据源 ${meta.lastSource || '暂无'}`
          + (meta.lastError ? `，注意：${meta.lastError}` : ''));
      } else {
        lines.push('【服务】未检测到运行心跳（后台服务可能未启动：设置 → 插件 → 盘哨）');
      }
      lines.push(DISCLAIMER);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'qs_quote_query',
    description: '盘哨：查询 A股/ETF/指数 实时行情。传入 6 位代码（可带 sh/sz/bj 前缀）或已加入自选的代码；经后台服务实时抓取（腾讯主源，东财备源）。不支持场外基金（如 006348）、港股、美股。',
    inputSchema: {
      type: 'object',
      properties: {
        codes: { type: 'array', items: { type: 'string' }, description: '代码列表，如 ["600519","sh000001","510300"]' },
      },
      required: ['codes'],
    },
    async call(args) {
      const codes = Array.isArray(args.codes) ? args.codes.map(String) : [];
      if (!codes.length) return err('请提供至少一个代码，如 ["600519"]');
      const ids = [];
      for (const c of codes) {
        const r = normalizeCode(c);
        if (!r.id) return err(r.error);
        if (!ids.includes(r.id)) ids.push(r.id);
      }
      const n = nonce(); // 同上：命令键与结果键共用
      const r = await runCommand(K.cmdQuote(n), K.quote(n), { codes: ids });
      if (!r.ok && !(Array.isArray(r.quotes) && r.quotes.length)) return err(r.error || '查询失败');
      const lines = [];
      if (r.source === 'cache') lines.push(`注意：实时源不可用，以下为缓存数据。${r.error || ''}`);
      else if (Array.isArray(r.missing) && r.missing.length) lines.push(`未取到: ${r.missing.join(', ')}`);
      for (const q of r.quotes || []) lines.push(fmtQuoteLine(q));
      if (!lines.length) lines.push('未取到任何行情（代码可能有误或已退市）');
      lines.push(DISCLAIMER);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'qs_search',
    description: '盘哨：按名称或代码搜索证券（A股/ETF/指数/港股/场外基金均会返回，港股与场外基金标记为不可行情）。用于先把名称变成代码再查询或加自选。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '名称或代码，如「茅台」「510300」「券商ETF」' } },
      required: ['query'],
    },
    async call(args) {
      const q = String(args.query || '').trim();
      if (!q) return err('请输入搜索词');
      const n = nonce(); // 命令键与结果键必须同 nonce（此前两次调用生成不同值导致永远等不到结果）
      const r = await runCommand(K.cmdSearch(n), K.search(n), { q });
      if (!r.ok) return err(r.error || '搜索失败');
      const results = Array.isArray(r.results) ? r.results : [];
      if (!results.length) return ok(`没有找到「${q}」的匹配结果`);
      const lines = results.slice(0, 12).map((x) =>
        `${x.tradable ? '[可行情]' : '[暂不支持]'} ${x.id} ${x.name}（类型:${x.type || '未知'}）`);
      lines.push('可行情的代码可用 qs_quote_query 查询或 qs_watchlist_add 加入自选。');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'qs_watchlist_list',
    description: '盘哨：列出自选清单及各标的最新行情快照。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const ids = await loadWatchIds();
      if (!ids.length) return ok('自选为空。可用 qs_watchlist_add 添加，或建议用户在盘哨面板添加。');
      const defs = await Promise.all(ids.map((id) => kvGet(K.watch(id)).catch(() => null)));
      const states = await Promise.all(ids.map((id) => kvGet(K.state(id)).catch(() => null)));
      const lines = [`自选 ${ids.length} 只：`];
      ids.forEach((id, i) => {
        const q = states[i];
        const def = defs[i];
        if (q) lines.push('  ' + fmtQuoteLine(q));
        else lines.push(`  ${id} ${(def && def.name) || ''}（暂无行情数据）`);
      });
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'qs_watchlist_add',
    description: '盘哨：添加自选。支持 6 位代码（可带 sh/sz/bj 前缀）；000 开头的上证指数必须写 sh000001。港股/美股/场外基金不支持。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '如 600519 / sh000001 / 510300' },
        note: { type: 'string', description: '备注（可选）' },
      },
      required: ['code'],
    },
    async call(args) {
      const r = normalizeCode(args.code);
      if (!r.id) return err(r.error);
      const existed = await kvGet(K.watch(r.id));
      if (existed) return ok(`${r.id} 已在自选中`);
      const name = await resolveName(r.code, r.id);
      const def = { id: r.id, code: r.code, market: r.market, name, createdAt: Date.now() };
      if (args.note) def.note = String(args.note).slice(0, 120);
      await kvSet(K.watch(r.id), def);
      // 触发一次即时抓取，尽快让面板看到首条行情
      runCommand(K.cmdQuote(nonce()), K.quote(nonce()), { codes: [r.id] }).catch(() => {});
      return ok(`已加入自选：${name}(${r.id})。行情将在后台服务下个轮询周期出现（盘中默认 20 秒）。`);
    },
  },
  {
    name: 'qs_watchlist_remove',
    description: '盘哨：移除自选（同时清理其行情缓存与分时数据；提醒规则保留，可另行删除）。',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: '如 600519 / sh000001' } },
      required: ['code'],
    },
    async call(args) {
      const r = normalizeCode(args.code);
      if (!r.id) return err(r.error);
      const existed = await kvGet(K.watch(r.id));
      if (!existed) return ok(`${r.id} 不在自选中`);
      await kvDel(K.watch(r.id));
      await kvDel(K.state(r.id)).catch(() => {});
      await kvDel(K.minute(r.id)).catch(() => {});
      await kvDel(K.position(r.id)).catch(() => {});
      return ok(`已移除自选 ${r.id}（其提醒规则仍保留，可用 qs_alert_list 查看）。`);
    },
  },
  {
    name: 'qs_position_set',
    description: '盘哨：设置或清除持仓（成本价 + 股数），用于面板与概览中显示浮动盈亏。shares/cost 任一 ≤0 或缺省即清除该持仓。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '如 600519' },
        cost: { type: 'number', description: '成本价（元/份）' },
        shares: { type: 'number', description: '持仓数量（股/份）' },
      },
      required: ['code'],
    },
    async call(args) {
      const r = normalizeCode(args.code);
      if (!r.id) return err(r.error);
      const cost = Number(args.cost);
      const shares = Number(args.shares);
      if (Number.isFinite(cost) && cost > 0 && Number.isFinite(shares) && shares > 0) {
        await kvSet(K.position(r.id), { code: r.id, cost, shares, updatedAt: Date.now() });
        return ok(`已设置 ${r.id} 持仓：成本 ${cost} × ${shares}。`);
      }
      await kvDel(K.position(r.id)).catch(() => {});
      return ok(`已清除 ${r.id} 的持仓记录。`);
    },
  },
  {
    name: 'qs_alert_set',
    description: '盘哨：新建或修改行情提醒（同一标同一类型只保留一条）。类型：price_above 价格升至、price_below 价格跌至、pct_above 涨幅达、pct_below 跌幅达。每个交易日每条规则最多触发一次。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '标的代码，如 600519（须在自选中）' },
        type: { type: 'string', enum: ['price_above', 'price_below', 'pct_above', 'pct_below'] },
        value: { type: 'number', description: '价格阈值或百分比阈值（pct_* 用百分比数字，如 3 表示 3%）' },
        note: { type: 'string', description: '备注（可选）' },
        enabled: { type: 'boolean', description: '默认 true；传 false 可暂停该规则' },
      },
      required: ['code', 'type', 'value'],
    },
    async call(args) {
      const r = normalizeCode(args.code);
      if (!r.id) return err(r.error);
      const type = String(args.type || '');
      const value = Number(args.value);
      if (!['price_above', 'price_below', 'pct_above', 'pct_below'].includes(type)) return err('type 必须是 price_above/price_below/pct_above/pct_below');
      if (!Number.isFinite(value) || value === 0) return err('value 必须是非零数字');
      if ((type === 'pct_above' && value < 0) || (type === 'pct_below' && value > 0)) {
        return err('pct_above 应为正数（涨幅阈值），pct_below 应为负数（跌幅阈值，如 -3 表示跌 3%）');
      }
      const existing = (await loadAlerts()).find((a) => a.code === r.id && a.type === type);
      const alert = existing || {
        id: 'a' + crypto.randomUUID().replace(/-/g, '').slice(0, 10),
        code: r.id,
        type,
        createdAt: Date.now(),
      };
      alert.value = +value.toFixed(4);
      alert.enabled = args.enabled !== false;
      if (args.note) alert.note = String(args.note).slice(0, 120);
      await kvSet(K.alert(alert.id), alert);
      const watchDef = await kvGet(K.watch(r.id)).catch(() => null);
      const name = (watchDef && watchDef.name) || r.id;
      return ok(`${existing ? '已更新' : '已创建'}提醒 [id=${alert.id}]：${name}(${r.id}) ${describeAlert(alert)}${alert.enabled ? '' : '（当前为暂停状态）'}。触发后写入盘哨面板「提醒」页与 qs_alert_list；删除用 qs_alert_remove 传此 id。`);
    },
  },
  {
    name: 'qs_alert_list',
    description: '盘哨：列出全部提醒规则（含最近触发时间）与最近触发记录。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const alerts = await loadAlerts();
      const lines = [];
      if (alerts.length) {
        lines.push(`提醒规则 ${alerts.length} 条：`);
        const states = await Promise.all(alerts.map((a) => kvGet(K.state(a.code)).catch(() => null)));
        alerts.forEach((a, i) => {
          const q = states[i];
          const cur = q ? `现价 ${fmtNum(q.price)}（${fmtNum(q.pct)}%）` : '暂无行情';
          lines.push(`  ${a.enabled === false ? '[已暂停] ' : ''}${a.code} ${describeAlert(a)}，${cur}${a.lastFiredDate ? `，上次触发 ${a.lastFiredDate}` : ''}${a.note ? `，备注:${a.note}` : ''} [id=${a.id}]`);
        });
      } else {
        lines.push('暂无提醒规则。可用 qs_alert_set 创建（如「600519 价格到 1350 提醒我」）。');
      }
      const feed = await kvGet(K.alertFeed).catch(() => null);
      if (Array.isArray(feed) && feed.length) {
        lines.push('最近触发：');
        for (const f of feed.slice(0, 8)) {
          const d = new Date(f.at);
          lines.push(`  ${d.toISOString().slice(5, 16).replace('T', ' ')} ${f.msg || f.code}`);
        }
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'qs_alert_remove',
    description: '盘哨：删除提醒规则（按 id；id 可从 qs_alert_list 获得）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '提醒规则 id' } },
      required: ['id'],
    },
    async call(args) {
      const id = String(args.id || '');
      const a = await kvGet(K.alert(id));
      if (!a) return err(`找不到提醒 ${id}（可用 qs_alert_list 查看）`);
      await kvDel(K.alert(id));
      return ok(`已删除提醒：${a.code} ${describeAlert(a)}`);
    },
  },
];

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

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
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
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

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
