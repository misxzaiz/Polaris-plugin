#!/usr/bin/env node
'use strict';
/**
 * page-sentinel MCP Server —— 网页监测的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的 tools/call 翻译为 Polaris IPC bridge 的 router_dispatch
 * （target=cap.kv）读写 sentinel.* 键空间，与服务/面板共享同一事实库。
 * 抓取永远由后台服务执行——MCP 只管「登记目标 / 触发检查 / 回读结果」。
 *
 * 工具一览：
 *   sentinel_add_watch    登记监控目标（可选立即首查）
 *   sentinel_list_watch   列出目标与最新状态
 *   sentinel_update_watch 修改目标（含暂停/恢复）
 *   sentinel_remove_watch 删除目标及其数据
 *   sentinel_check_now    立即触发一次检查并等待结果
 *   sentinel_test_fetch   一次性试抓（不落目标，验证 url+抽取配置）
 *   sentinel_get_events   回读最近变化/命中/错误事件
 *
 * 连接方式（与 news-curator / sim-paper-trading 同套路）：
 *   1. env POLARIS_HOST + POLARIS_PORT + POLARIS_TOKEN（若宿主注入则优先生效）
 *   2. anchor.json → dataRoot/config.json（web.port/token）
 *   3. 从 config 端口向上扫描 /api/health
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVER_NAME = 'page-sentinel';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

// ── sentinel.* 键空间（与 service/sentinel.js、面板 model.ts 三方一致）──────
const K = {
  target: (id) => `sentinel.target.${id}`,
  state: (id) => `sentinel.state.${id}`,
  snap: (id) => `sentinel.snap.${id}`,
  eventPrefix: (id) => `sentinel.event.${id}.`,
  cmdCheck: (id) => `sentinel.cmd.check.${id}`,
  cmdTest: (nonce) => `sentinel.cmd.test.${nonce}`,
  test: (nonce) => `sentinel.test.${nonce}`,
  settings: 'sentinel.settings',
};
const MODES = ['text', 'selector', 'regex', 'json', 'headers'];
const CONDITIONS = ['any', 'contains', 'notContains', 'lt', 'gt'];

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 news-curator）──────────────────────────────────
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
      if (typeof web.port === 'number') {
        return { host: web.host || '', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* 跳过不可读候选 */ }
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
        if (await healthCheck(host, basePort + i)) {
          return { host, port: basePort + i, token };
        }
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
          const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          };
          if (ep.token) {
            headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
          }
          const req = http.request(
            {
              hostname: ep.host, port: ep.port,
              path: `/api/${command.replace(/_/g, '-')}`,
              method: 'POST', headers, timeout,
            },
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
  return res.result && res.result.value !== undefined ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
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
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : [];
}

// ── 目标规范化（与服务端 normalizeTarget 同规则）───────────────────────────
function normalizeTarget(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return null;
  const t = {
    id: raw.id,
    name: String(raw.name || url).slice(0, 120),
    url,
    mode: MODES.includes(raw.mode) ? raw.mode : 'text',
    intervalSec: Math.max(30, Number(raw.intervalSec) > 0 ? Math.floor(Number(raw.intervalSec)) : 600),
    condition: CONDITIONS.includes(raw.condition) ? raw.condition : 'any',
    enabled: raw.enabled !== false,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
  if (raw.selector) t.selector = String(raw.selector).slice(0, 500);
  if (raw.regex) t.regex = String(raw.regex).slice(0, 500);
  if (raw.jsonPath) t.jsonPath = String(raw.jsonPath).slice(0, 500);
  if (raw.keyword !== undefined && raw.keyword !== null && String(raw.keyword).length) t.keyword = String(raw.keyword).slice(0, 500);
  if (Number.isFinite(Number(raw.threshold))) t.threshold = Number(raw.threshold);
  if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
    const h = {};
    for (const [k, v] of Object.entries(raw.headers)) {
      if (typeof k === 'string' && k.trim() && typeof v === 'string') h[k.trim()] = v.slice(0, 2000);
    }
    if (Object.keys(h).length) t.headers = h;
  }
  if (t.mode === 'selector' && !t.selector) return { error: 'selector 模式必须提供 selector' };
  if (t.mode === 'regex' && !t.regex) return { error: 'regex 模式必须提供 regex' };
  if (t.mode === 'json' && !t.jsonPath) return { error: 'json 模式必须提供 jsonPath' };
  if ((t.condition === 'contains' || t.condition === 'notContains') && !t.keyword) return { error: 'contains/notContains 条件必须提供 keyword' };
  if ((t.condition === 'lt' || t.condition === 'gt') && !Number.isFinite(t.threshold)) return { error: 'lt/gt 条件必须提供数值 threshold' };
  return t;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 工具实现 ───────────────────────────────────────────────────────────────
function shortText(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function fmtState(st, target) {
  if (!st || !st.lastCheckedAt) return '尚未检查过（等服务首轮调度，或用 sentinel_check_now 立即首查）';
  const ago = Math.round((Date.now() - st.lastCheckedAt) / 1000);
  const status = st.status === 'error' ? `错误（${st.lastError || '未知'}）` : '正常';
  const next = st.nextCheckAt ? `下次检查约 ${Math.max(0, Math.round((st.nextCheckAt - Date.now()) / 1000))}s 后` : '';
  const lastEvent = st.lastEventSummary ? `；最近事件：${st.lastEventSummary}` : '';
  return `${status}；上次检查 ${ago}s 前${next}${lastEvent}（检查 ${st.checkCount || 0} 次/错误 ${st.errorCount || 0} 次）${target && target.enabled === false ? '；【已暂停】' : ''}`;
}

async function listAll() {
  const keys = await kvKeys();
  const targets = [];
  for (const key of keys) {
    if (!key.startsWith('sentinel.target.')) continue;
    const id = key.slice('sentinel.target.'.length);
    const raw = await kvGet(key);
    if (raw && typeof raw === 'object') {
      const st = await kvGet(K.state(id)).catch(() => null);
      targets.push({ target: raw, state: st });
    }
  }
  return targets;
}

const tools = [
  {
    name: 'sentinel_add_watch',
    description: '登记一个网页监控目标（网页监测）。后台服务会按间隔抓取该 URL，抽取内容并在变化或条件满足时生成事件，面板「网页监测」可见。适用：盯价格/库存/放号/考位/release/文档更新。抓取由 Polaris 后台服务原生发起，无浏览器跨域限制。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '目标名称（如「3080 显卡库存」「xx 文档更新」）' },
        url: { type: 'string', description: '完整 URL（http/https）' },
        mode: { type: 'string', enum: MODES, description: '抽取模式：text=整页文本（默认）；selector=CSS 选择器子集（盯局部最准）；regex=正则捕获组1；json=JSON 路径（盯接口）；headers=响应头（盯 etag/last-modified）' },
        selector: { type: 'string', description: 'mode=selector 时的选择器，支持 tag/.class/#id/[attr]/后代/子代/逗号/`@属性名` 后缀（如 `a.item@href` 或 `.price`）' },
        regex: { type: 'string', description: 'mode=regex 时的正则（捕获组 1 优先）' },
        jsonPath: { type: 'string', description: 'mode=json 时的路径，如 data.items[0].price' },
        intervalSec: { type: 'integer', description: '检查间隔秒数（默认 600，最小 30）' },
        condition: { type: 'string', enum: CONDITIONS, description: '告警条件：any=内容变化（默认）；contains=包含关键词时告警；notContains=不再包含时告警；lt=数值低于阈值；gt=数值高于阈值' },
        keyword: { type: 'string', description: 'contains/notContains 条件的关键词（大小写不敏感）' },
        threshold: { type: 'number', description: 'lt/gt 条件的数值阈值' },
        headers: { type: 'object', description: '额外请求头（如 Cookie/UA），可选 { "k": "v" }' },
        checkNow: { type: 'boolean', description: '登记后立即触发一次检查（默认 true）' },
      },
      required: ['name', 'url'],
    },
    async call(args) {
      const id = 'w' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const t = normalizeTarget({ ...args, id });
      if (!t) return err('URL 必须以 http(s):// 开头');
      if (t.error) return err(t.error);
      await kvSet(K.target(id), t);
      if (args.checkNow !== false) await kvSet(K.cmdCheck(id), { op: 'check', at: Date.now() });
      return ok(`已登记监控「${t.name}」(${id})：${t.url}\n模式=${t.mode} 条件=${t.condition}${t.keyword ? ` 关键词=${t.keyword}` : ''}${t.threshold !== undefined ? ` 阈值=${t.threshold}` : ''} 间隔=${t.intervalSec}s\n已${args.checkNow !== false ? '触发首查，几秒后可用 sentinel_check_now 或 sentinel_get_events 查看结果' : '交由后台按间隔调度'}。面板「网页监测」中可见。`);
    },
  },
  {
    name: 'sentinel_list_watch',
    description: '列出网页监测的全部监控目标及其最新状态（是否正常、上次检查、最近事件）。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const all = await listAll();
      if (!all.length) return ok('当前没有任何监控目标。可用 sentinel_add_watch 登记。');
      const lines = all.map(({ target: t, state: st }, i) => {
        const cond = t.condition === 'any' ? '内容变化' : `${t.condition}${t.keyword ? `「${t.keyword}」` : ''}${t.threshold !== undefined ? ` ${t.threshold}` : ''}`;
        return `${i + 1}. [${t.id}] ${t.name}${t.enabled === false ? '（已暂停）' : ''}\n   ${t.url}\n   ${t.mode}${t.selector ? ` "${t.selector}"` : ''}${t.keyword ? ` 关键词「${t.keyword}」` : ''} | 条件=${cond} | 间隔=${t.intervalSec}s\n   状态：${fmtState(st, t)}`;
      });
      return ok(`共 ${all.length} 个监控目标：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'sentinel_update_watch',
    description: '修改网页监测监控目标：改名/改 URL/改抽取配置/改间隔/改条件/暂停(enabled=false)/恢复(enabled=true)。传 id（sentinel_list_watch 可查）+ 要改的字段。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '目标 id' },
        name: { type: 'string' }, url: { type: 'string' }, mode: { type: 'string', enum: MODES },
        selector: { type: 'string' }, regex: { type: 'string' }, jsonPath: { type: 'string' },
        intervalSec: { type: 'integer' }, condition: { type: 'string', enum: CONDITIONS },
        keyword: { type: 'string' }, threshold: { type: 'number' },
        enabled: { type: 'boolean', description: 'false=暂停，true=恢复' },
      },
      required: ['id'],
    },
    async call(args) {
      const raw = await kvGet(K.target(args.id));
      if (!raw || typeof raw !== 'object') return err(`未找到目标 ${args.id}（sentinel_list_watch 可查 id）`);
      const merged = normalizeTarget({ ...raw, ...args, id: args.id });
      if (!merged) return err('修改后 URL 非法');
      if (merged.error) return err(merged.error);
      await kvSet(K.target(args.id), merged);
      return ok(`已更新「${merged.name}」(${args.id})。${merged.enabled === false ? '目标已暂停。' : ''}`);
    },
  },
  {
    name: 'sentinel_remove_watch',
    description: '删除网页监测监控目标及其全部状态/快照/事件数据。',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '目标 id' } }, required: ['id'] },
    async call(args) {
      const raw = await kvGet(K.target(args.id));
      if (!raw) return err(`未找到目标 ${args.id}`);
      const keys = await kvKeys();
      const related = keys.filter((k) => k === K.target(args.id) || k === K.state(args.id) || k === K.snap(args.id) || k.startsWith(K.eventPrefix(args.id)) || k === K.cmdCheck(args.id));
      for (const k of related) await kvDel(k).catch(() => {});
      return ok(`已删除「${raw.name || args.id}」及其 ${related.length} 项数据。`);
    },
  },
  {
    name: 'sentinel_check_now',
    description: '让网页监测立即检查一次指定目标并等待结果（最多 40 秒）。返回检查结论与是否有新事件。',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '目标 id' } }, required: ['id'] },
    async call(args) {
      const raw = await kvGet(K.target(args.id));
      if (!raw || typeof raw !== 'object') return err(`未找到目标 ${args.id}`);
      const stBefore = await kvGet(K.state(args.id)).catch(() => null);
      const before = (stBefore && stBefore.lastCheckedAt) || 0;
      await kvSet(K.cmdCheck(args.id), { op: 'check', at: Date.now() });
      let st = null;
      for (let i = 0; i < 27; i++) {
        await sleep(1500);
        st = await kvGet(K.state(args.id)).catch(() => null);
        if (st && st.lastCheckedAt && st.lastCheckedAt > before) break;
        st = null;
      }
      if (!st) return err('等待检查结果超时（服务可能未运行——在 Polaris 设置→插件中确认网页监测服务状态，或检查间隔期间桥不可达）');
      const keys = await kvKeys();
      const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix(args.id))).sort().reverse();
      let evText = '本次检查无新事件。';
      if (evKeys.length) {
        const latest = await kvGet(evKeys[0]);
        if (latest && latest.at > before) {
          evText = `新事件【${latest.type}】${latest.summary}`;
          if (latest.diff && latest.diff.length) {
            evText += '\n' + latest.diff.slice(0, 20).map((d) => `${d.kind} ${d.text}`).join('\n');
          }
        }
      }
      return ok(`「${raw.name}」检查完成：${st.status === 'error' ? `错误：${st.lastError}` : '正常'}\n${evText}`);
    },
  },
  {
    name: 'sentinel_test_fetch',
    description: '网页监测试抓：按给定的 url+抽取配置抓一次并返回抽取文本预览（不登记目标）。用于验证 selector/regex/jsonPath 是否写对。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' }, mode: { type: 'string', enum: MODES },
        selector: { type: 'string' }, regex: { type: 'string' }, jsonPath: { type: 'string' },
      },
      required: ['url'],
    },
    async call(args) {
      const url = typeof args.url === 'string' ? args.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) return err('url 必须以 http(s):// 开头');
      const nonce = 't' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await kvSet(K.cmdTest(nonce), { ...args, url, at: Date.now() });
      for (let i = 0; i < 20; i++) {
        await sleep(1500);
        const r = await kvGet(K.test(nonce)).catch(() => null);
        if (r) {
          await kvDel(K.test(nonce)).catch(() => {});
          if (r.ok) {
            return ok(`试抓成功（HTTP ${r.status}，耗时 ${r.elapsedMs}ms）。抽取文本（前 800 字符）：\n${shortText(r.text, 800)}`);
          }
          return err(`试抓失败：${r.error}`);
        }
      }
      return err('试抓超时（服务可能未运行——在 Polaris 设置→插件中确认网页监测服务状态）');
    },
  },
  {
    name: 'sentinel_get_events',
    description: '回读网页监测的最近事件（变化/命中/失误/错误/恢复），可按目标过滤。返回时间、类型、摘要与差异预览。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '只看某个目标（可选）' },
        limit: { type: 'integer', description: '最多返回几条（默认 10，上限 30）' },
      },
    },
    async call(args) {
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      const keys = await kvKeys();
      let evKeys = keys.filter((k) => k.startsWith('sentinel.event.'));
      if (args.id) evKeys = evKeys.filter((k) => k.startsWith(K.eventPrefix(args.id)));
      evKeys.sort();
      evKeys = evKeys.slice(-limit).reverse();
      if (!evKeys.length) return ok(args.id ? `目标 ${args.id} 暂无事件。` : '暂无任何事件。');
      const lines = [];
      for (const k of evKeys) {
        const ev = await kvGet(k).catch(() => null);
        if (!ev) continue;
        const time = new Date(ev.at).toLocaleString('zh-CN', { hour12: false });
        lines.push(`[${time}] ${ev.targetName || ev.targetId} 【${ev.type}】${ev.summary}`);
        if (ev.diff && ev.diff.length) {
          lines.push(ev.diff.slice(0, 10).map((d) => `   ${d.kind} ${shortText(d.text, 120)}`).join('\n'));
        }
      }
      return ok(lines.join('\n'));
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
