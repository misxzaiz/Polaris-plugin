#!/usr/bin/env node
'use strict';
/**
 * data-ark MCP Server —— 数据备份的 AI 工具层（零依赖，node >= 18）
 *
 * 职责：把 AI 的备份/恢复意图翻译为 cap.kv 的 dataark.* 读写（命令键 → 服务消费
 * → 结果键轮询）。策略计算走 shared/ark-core.js（与面板/服务同一权威）。
 * 本进程不直接碰文件系统——快照/校验/恢复全部由后台服务执行。
 *
 * 工具一览：
 *   ark_status          保护状态总览（上次/下次/库占用/degraded/最近事件）
 *   ark_backup_now      触发一次快照（异步，稍后用 ark_status 查结果）
 *   ark_list_snapshots  快照列表（时间/类型/规模/耗时）
 *   ark_list_files      浏览某份快照的文件清单（恢复前检索）
 *   ark_verify          触发完整性校验（quick/deep）
 *   ark_restore         恢复文件到暂存目录（绝不直写数据根）
 *   ark_settings        查看/修改排期、保留策略、排除规则、库上限
 *
 * 连接方式与 page-sentinel / pocket-ledger 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/ark-core.js');

const SERVER_NAME = 'data-ark';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 page-sentinel / pocket-ledger）──────────────────
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

// ── 数据备份数据访问 ───────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  const r = core.normalizeSettings(s);
  return r.error ? { ...core.DEFAULT_SETTINGS } : r.settings;
}

async function loadState() {
  const st = await kvGet(core.K.state).catch(() => null);
  return st && typeof st === 'object' ? st : {};
}

async function loadSnapshots(limit = 20) {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.snapshotPrefix));
  const vals = await Promise.all(keys.map((k) => kvGet(k).catch(() => null)));
  return vals
    .filter((v) => v && typeof v === 'object' && v.id)
    .sort((a, b) => Number(b.finishedAt) - Number(a.finishedAt))
    .slice(0, Math.min(50, Math.max(1, Number(limit) || 20)));
}

async function loadEvents(limit = 10) {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.eventPrefix));
  const vals = await Promise.all(keys.map((k) => kvGet(k).catch(() => null)));
  return vals
    .filter((v) => v && typeof v === 'object')
    .sort((a, b) => Number(b.at) - Number(a.at))
    .slice(0, Math.min(50, Number(limit) || 10));
}

/** 写命令键并轮询结果键（restore/listfiles 需要结果；backup/verify/gc 异步不等待） */
async function runCmdWithResult(cmdKey, payload, { timeoutMs = 60000, pollMs = 1500 } = {}) {
  const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const key = cmdKey(nonce);
  await kvSet(key, { ...payload, at: Date.now() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    // eslint-disable-next-line no-await-in-loop
    const r = await kvGet(core.K.cmdResult(nonce)).catch(() => null);
    if (r && typeof r === 'object') {
      kvDel(core.K.cmdResult(nonce)).catch(() => {});
      return r;
    }
  }
  return { ok: false, error: `等待服务结果超时（${Math.round(timeoutMs / 1000)}s）——后台服务可能未运行（面板「服务」页可启动/重启）` };
}

const fmtTime = (ts) => (Number.isFinite(Number(ts)) && ts > 0
  ? new Date(Number(ts)).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  : '-');

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'ark_status',
    description: '数据备份·状态总览。数据根保护范围、上次/下次备份、备份库占用、降级原因、最近事件。适合「备份状态怎么样」「上次备份是什么时候」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const [settings, state, snaps, events] = await Promise.all([loadSettings(), loadState(), loadSnapshots(3), loadEvents(6)]);
      if (!snaps.length && !state.lastSnapshotAt) {
        return ok([
          `数据备份已就绪，还没有任何快照。`,
          `保护对象（数据根）：${state.resolvedTarget ? '已定位' : '待服务首次心跳'}；调度：${describeSchedule(settings.schedule)}`,
          `备份库：${state.resolvedTarget || '（服务启动后自动解析为 <数据根>/../polaris-ark）'}`,
          '说「备份一下」我立即触发首次快照。',
        ].join('\n'));
      }
      const lines = [
        `上次备份：${fmtTime(state.lastSnapshotAt)}（${core.timeAgo(state.lastSnapshotAt)}）${state.lastResult && state.lastResult.ok === false ? ` ⚠️ 上次失败：${state.lastResult.error}` : ''}`,
        `下次自动备份：${state.nextRunAt ? fmtTime(state.nextRunAt) : '未排程'} · 调度：${describeSchedule(settings.schedule)}`,
        `备份库：${state.resolvedTarget || '（服务启动后解析）'} · 占用 ${core.formatBytes(state.storeBytes || 0)} / 上限 ${core.formatBytes(settings.maxStoreBytes)} · ${state.objectsTotal || 0} 个对象 · 快照 ${snaps.length}+ 份`,
      ];
      if (state.degraded) lines.push(`⚠️ 降级：${state.degraded.reason}`);
      const lr = state.lastResult;
      if (lr && lr.ok && lr.summary) lines.push(`最近一次：${lr.summary.totalFiles} 文件 / ${lr.summary.changedFiles} 变更 / 新对象 ${lr.summary.newObjects}，耗时 ${core.fmtDuration(lr.summary.durationMs)}`);
      const recent = snaps.slice(0, 3).map((s) => `  ${fmtTime(s.finishedAt)} ${s.type === 'full' ? '全量' : '增量'} ${s.totalFiles} 文件（变更 ${s.changedFiles}）`);
      if (recent.length) lines.push('近期快照：', ...recent);
      if (events.length) lines.push('最近事件：', ...events.map((e) => `  [${fmtTime(e.at)}] ${e.type}: ${e.msg}`));
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ark_backup_now',
    description: '数据备份·立即触发一次备份快照（异步：命令下发即返回，几秒到几分钟后完成；随后用 ark_status 查询结果）。全库内容寻址去重，第二份起只存变化。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const state = await loadState();
      if (state.lease && Number(state.lease.expiresAt) < Date.now()) {
        // 租约过期无妨：服务下次 tick 会接管；这里仅提示
      }
      await kvSet(core.K.cmdBackup, { op: 'backup', at: Date.now() });
      return ok('已触发备份：后台服务正在执行（命令队列消费）。数据根较大时首份需几分钟，之后增量秒级——说「备份状态」即可查进度。');
    },
  },
  {
    name: 'ark_list_snapshots',
    description: '数据备份·快照清单。每份快照的时间、全量/增量、文件数/变更数、逻辑大小、耗时。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '最多返回条数（默认 10，上限 50）' } },
    },
    async call(args) {
      const snaps = await loadSnapshots(args.limit);
      if (!snaps.length) return ok('还没有任何快照。说「备份一下」触发首次快照。');
      const lines = snaps.map((s) => `${fmtTime(s.finishedAt)} [${s.type === 'full' ? '全量' : '增量'}] ${s.id} · ${s.totalFiles} 文件（变更 ${s.changedFiles}）· 逻辑 ${core.formatBytes(s.logicalBytes)} · 耗时 ${core.fmtDuration(s.durationMs)}`);
      return ok(`共 ${snaps.length} 份（新→旧）：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'ark_list_files',
    description: '数据备份·浏览快照里的文件清单（恢复前检索用）。按子串过滤，返回相对路径与大小。',
    inputSchema: {
      type: 'object',
      properties: {
        snapId: { type: 'string', description: '快照 id（ark_list_snapshots 里取；缺省最新一份）' },
        query: { type: 'string', description: '路径子串过滤（如 "dialogs"、"kv.db"）' },
        limit: { type: 'integer', description: '最多返回条数（默认 50，上限 500）' },
      },
    },
    async call(args) {
      const r = await runCmdWithResult(core.K.cmdListFiles, {
        snapId: args.snapId || 'latest', query: args.query || '', limit: args.limit,
      }, { timeoutMs: 30000 });
      if (!r.ok) return err(r.error || 'list_files 失败');
      const lines = (r.files || []).map((f) => `${f.p}（${core.formatBytes(f.s)}${f.c ? '，本次有变更' : ''}）`);
      return ok([
        `快照 ${r.snapId}：共 ${r.total} 文件，匹配 ${r.matched}${(r.files || []).length < r.matched ? `，显示前 ${r.files.length}` : ''}：`,
        ...(lines.length ? lines : ['（无匹配文件）']),
      ].join('\n'));
    },
  },
  {
    name: 'ark_verify',
    description: '数据备份·完整性校验。quick=对象存在性检查（秒级）；deep=逐对象解压重算 sha256（慢，全量核对）。结果稍后可用 ark_status 的事件查看。',
    inputSchema: {
      type: 'object',
      properties: {
        snapId: { type: 'string', description: '快照 id，缺省 latest' },
        mode: { type: 'string', enum: ['quick', 'deep'], description: '缺省 quick' },
      },
    },
    async call(args) {
      await kvSet(core.K.cmdVerify(args.snapId || 'latest'), { op: 'verify', mode: args.mode === 'deep' ? 'deep' : 'quick', at: Date.now() });
      return ok(`已触发校验（${args.mode === 'deep' ? 'deep 逐对象重哈希，大库需几分钟' : 'quick 存在性检查，秒级'}）。完成后看 ark_status 的最近事件。`);
    },
  },
  {
    name: 'ark_restore',
    description: '数据备份·恢复文件。把快照中的文件解压到备份库的 restored/暂存目录（保持相对结构，绝不直写数据根）。paths 缺省=整份快照全部文件。返回暂存目录路径——替换进数据根前必须先关闭 Polaris，由用户手动完成（这是防止覆盖活跃数据的安全设计）。',
    inputSchema: {
      type: 'object',
      properties: {
        snapId: { type: 'string', description: '快照 id，缺省 latest' },
        paths: { type: 'array', items: { type: 'string' }, description: '要恢复的相对路径列表（ark_list_files 里取）；缺省全部' },
      },
    },
    async call(args) {
      const r = await runCmdWithResult(core.K.cmdRestore, {
        snapId: args.snapId || 'latest', paths: Array.isArray(args.paths) ? args.paths : null,
      }, { timeoutMs: 120000 });
      if (!r.ok) return err(r.error || 'restore 失败');
      return ok([
        `已恢复 ${r.restored} 个文件（快照共 ${r.total}）到暂存目录：`,
        r.stagingDir,
        r.notFound?.length ? `未找到/跳过 ${r.notFound.length} 个：${r.notFound.slice(0, 5).join('、')}` : '',
        '',
        '安全提示：替换数据根文件前请先完全退出 Polaris；替换后重新启动。建议替换前把当前文件改名留底。',
      ].filter(Boolean).join('\n'));
    },
  },
  {
    name: 'ark_settings',
    description: '数据备份·查看/修改设置：排期（off/interval/daily）、保留策略（日/周/月）、一级排除、额外排除 glob、库上限。用户说「改成每天凌晨3点备份」「以后只留5份周备」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'], description: '缺省 get' },
        schedule: {
          type: 'object',
          description: 'set 时：{ mode: "off"|"interval"|"daily", intervalHours?: 数字, at?: "HH:MM" }',
        },
        retention: { type: 'object', description: 'set 时：{ daily: 天, weekly: 周, monthly: 月 }' },
        excludeTop: { type: 'array', items: { type: 'string' }, description: 'set 时：数据根一级排除名列表（默认 logs/cache/plugins）' },
        extraExcludeGlobs: { type: 'array', items: { type: 'string' }, description: 'set 时：额外排除 glob' },
        targetDir: { type: 'string', description: 'set 时：备份库根目录（空=默认 <数据根>/../polaris-ark）' },
        maxStoreBytes: { type: 'number', description: 'set 时：备份库占用上限（字节）' },
      },
    },
    async call(args) {
      if (!args.action || args.action === 'get') {
        const s = await loadSettings();
        return ok([
          `调度：${describeSchedule(s.schedule)}`,
          `保留：日 ${s.retention.daily} / 周 ${s.retention.weekly} / 月 ${s.retention.monthly}`,
          `一级排除：${s.excludeTop.join('、') || '（无）'}`,
          s.extraExcludeGlobs.length ? `额外排除：${s.extraExcludeGlobs.join('、')}` : null,
          `备份库：${s.targetDir || '（默认 <数据根>/../polaris-ark）'} · 上限 ${core.formatBytes(s.maxStoreBytes)}`,
        ].filter(Boolean).join('\n'));
      }
      const cur = await loadSettings();
      const merged = {
        ...cur,
        ...(args.schedule !== undefined ? { schedule: { ...cur.schedule, ...args.schedule } } : {}),
        ...(args.retention !== undefined ? { retention: { ...cur.retention, ...args.retention } } : {}),
        ...(args.excludeTop !== undefined ? { excludeTop: args.excludeTop } : {}),
        ...(args.extraExcludeGlobs !== undefined ? { extraExcludeGlobs: args.extraExcludeGlobs } : {}),
        ...(args.targetDir !== undefined ? { targetDir: args.targetDir } : {}),
        ...(args.maxStoreBytes !== undefined ? { maxStoreBytes: args.maxStoreBytes } : {}),
      };
      const norm = core.normalizeSettings(merged);
      if (norm.error) return err(`设置不合法：${norm.error}`);
      await kvSet(core.K.settings, norm.settings);
      const s = norm.settings;
      return ok(`已保存：调度 ${describeSchedule(s.schedule)}；保留 日${s.retention.daily}/周${s.retention.weekly}/月${s.retention.monthly}；排除 ${s.excludeTop.join('、') || '无'}。下一 tick 生效。`);
    },
  },
];

function describeSchedule(sc) {
  if (!sc || sc.mode === 'off') return '手动模式（不自动备份）';
  if (sc.mode === 'interval') return `每 ${sc.intervalHours} 小时`;
  return `每天 ${sc.at}`;
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

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

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
