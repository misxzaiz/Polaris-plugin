#!/usr/bin/env node
'use strict';
/**
 * watchtower MCP Server —— 守望台：插件用量计量 + 生命周期治理（AI 工具层）
 *
 * 职责：把 AI 的「看看哪个插件冷/热」「停掉/启用来释放资源」「报告一次用量」
 * 意图翻译为对宿主三个能力的读写：
 *   - cap.kv                  → 用量账本（watchtower.usage.<pluginId>）
 *   - cap.pluginDiscovery     → discover（插件清单）/ uninstall（卸载）
 *   - cap.pluginServiceManager → list_status / start / stop / restart（服务管理）
 * 全部计算逻辑走 shared/usage-core.js（与面板同一权威，口径不漂移）。
 *
 * 与 lingxi / pocket-ledger 相同连接方式：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 * 无后台服务、无外网请求——纯本地账本。
 *
 * 工具一览（8 个）：
 *   watchtower_usage_stats    用量总览（热冷榜/近N天/活跃分级）
 *   watchtower_plugin                单插件用量详情
 *   watchtower_report_usage   计量一次插件使用（AI 主动报，扩展覆盖全插件）
 *   watchtower_service_status 全部后台服务状态
 *   watchtower_service_start  启动某后台服务
 *   watchtower_service_stop   停止某后台服务
 *   watchtower_service_restart 重启某后台服务
 *   watchtower_cold_plugins   冷门/沉睡插件治理建议
 *   watchtower_uninstall      卸载插件（需确认，只限非内置）
 *
 * 边界声明（如实）：
 *   - 计量是「报告式」：MCP 工具调用自动记；AI/面板之外的使用需 watchtower_report_usage 补记
 *   - 服务状态粒度 = 宿主 cap.pluginServiceManager 提供（running/exited/port/pid/uptime），无 CPU/内存
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/usage-core.js');

const SERVER_NAME = 'watchtower';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 lingxi / pocket-ledger）─────────────────────────
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

// ── 宿主能力读写 ─────────────────────────────────────────────────────────────
async function bus(target, payload) {
  const res = await polarisIpc('router_dispatch', { req: { target, payload } });
  if (!res || res.ok === false) throw new Error((res && res.error) || `${target} 调用失败`);
  return (res && res.result !== undefined) ? res.result : {};
}

// cap.kv
async function kvGet(key) {
  const r = await bus('cap.kv', { action: 'get', key });
  return (r && r.value !== undefined) ? r.value : null;
}
async function kvSet(key, value) {
  await bus('cap.kv', { action: 'set', key, value });
  return true;
}
async function kvKeys() {
  const r = await bus('cap.kv', { action: 'list' });
  return (r && Array.isArray(r.keys)) ? r.keys : [];
}

// cap.pluginDiscovery
async function plDiscover() {
  return await bus('cap.pluginDiscovery', { action: 'discover' });
}
async function plUninstall(installPath) {
  const r = await bus('cap.pluginDiscovery', { action: 'uninstall_local', installPath });
  return r;
}
async function plListServices() {
  return await bus('cap.pluginServiceManager', { action: 'list_status' });
}
async function plService(action, pluginId, serviceId) {
  const payload = { action, pluginId, serviceId };
  return await bus('cap.pluginServiceManager', payload);
}

// ── 账本读写 ────────────────────────────────────────────────────────────────
async function loadAllUsage() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(core.K.usagePrefix))
    .map((k) => k.slice(core.K.usagePrefix.length));
  const byPlugin = {};
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(core.K.usage(id));
    const rec = core.normalizeUsage(v);
    if (rec && rec.pluginId) byPlugin[rec.pluginId] = rec;
  }
  return byPlugin;
}

async function loadPluginList() {
  const res = await plDiscover();
  const raw = (res && Array.isArray(res.plugins)) ? res.plugins : [];
  return raw.map(core.normalizePlugin).filter(Boolean);
}

async function loadServiceList() {
  const res = await plListServices();
  return (Array.isArray(res) ? res : []).map(core.normalizeServiceStatus).filter(Boolean);
}

async function recordOne(pluginId, source) {
  const k = core.K.usage(pluginId);
  const prev = core.normalizeUsage(await kvGet(k));
  await kvSet(k, core.recordUsage(pluginId, source, prev));
  return true;
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'watchtower_usage_stats',
    description: '守望台·插件用量总览。列出全部插件的使用统计：调用次数/面板打开/末次使用/活跃分级（活跃·沉睡·冷门·从未），附近 1/7/30 天趋势与治理建议。用户问「哪些插件在用/没用」「最近谁被用得多」「帮我看看插件使用情况」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        focus: { type: 'string', enum: ['active', 'cold', 'all'], description: 'active=只看活跃榜；cold=只看冷门榜；缺省 all 全量' },
        days: { type: 'integer', description: '聚合窗口天数（1/7/30，缺省 7）' },
      },
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const [plugins, usage, services] = await Promise.all([loadPluginList(), loadAllUsage(), loadServiceList()]);
      const sum = core.summarize(plugins, usage, services);
      const focus = args.focus || 'all';
      const days = Number(args.days) || 7;
      const lines = [];
      const totals = sum.totals;
      lines.push(`插件用量（共 ${totals.plugins} 个：活跃 ${totals.active} · 沉睡 ${totals.idle} · 冷门 ${totals.cold} · 从未 ${totals.never}；运行中服务 ${totals.runningServices}）`);
      lines.push('');
      if (focus === 'cold') {
        lines.push('冷门/从未使用榜（近 30 天加权成本升序）：');
        for (const r of sum.byCold) {
          const w30 = r.windows.find((w) => w.days === 30);
          lines.push(`  ${r.plugin.name}（${r.plugin.id}） ${r.activityMeta.label}：近30天来源${w30 ? w30.total : 0}次，末次${r.usage.lastUsed ? core.fmtDay(r.usage.lastUsed) : '—'}`);
        }
        if (sum.suggestions.length) {
          lines.push('');
          lines.push('治理建议：');
          for (const s of sum.suggestions.slice(0, 6)) {
            lines.push(`  [${s.suggestion}] ${s.name}：${s.reason}`);
          }
        }
      } else if (focus === 'active') {
        lines.push(`活跃榜（近 ${days} 天加权成本降序）：`);
        for (const r of sum.byActivity.filter((x) => x.activity === 'active')) {
          const w = r.windows.find((x) => x.days === days);
          lines.push(`  ${r.plugin.name}（${r.plugin.id}） ${w ? w.total : 0} 次/近${days}天（工具${w ? w.mcp : 0}/面板${w ? w.panel : 0}），末次${r.usage.lastUsed ? core.fmtDay(r.usage.lastUsed) : '—'}`);
        }
      } else {
        lines.push('全部插件（按近 7 天加权成本排序）：');
        for (const r of sum.byActivity) {
          const w7 = r.windows.find((w) => w.days === 7);
          lines.push(`  ${r.plugin.name}（${r.plugin.id}） ${r.activityMeta.label}：累计${r.usage.count}次工具+${r.usage.panelOpens}次面板，近7天${w7 ? w7.total : 0}次，末次${r.usage.lastUsed ? core.fmtDay(r.usage.lastUsed) : '从未'}`);
        }
      }
      lines.push('');
      lines.push('提示：各种来源经本插件 MCP 调用自动记账；面板打开自动记录；其它来源可用 watchtower_report_usage 补记。');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'watchtower_plugin',
    description: '守望台·查看单个插件的完整用量：累计/近 1/7/30 天/末次/首次/日趋势，活跃分级，是否在跑后台服务。用户问「XX 插件用得怎么样」「XX 最近用过吗」时调用。',
    inputSchema: {
      type: 'object',
      properties: { pluginId: { type: 'string', description: '插件 id' } },
      required: ['pluginId'],
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const [plugins, usage, services] = await Promise.all([loadPluginList(), loadAllUsage(), loadServiceList()]);
      const p = plugins.find((x) => x.id === args.pluginId);
      if (!p) return err(`未找到插件 ${args.pluginId}（可 watchtower_usage_stats 看全部）`);
      const rec = core.normalizeUsage(usage[p.id]);
      const activity = core.activityOf(rec);
      const lines = [
        `${p.name}（${p.id} ${p.version ? 'v' + p.version : ''}）${p.builtin ? ' [内置]' : ''}`,
        `活跃：${core.activityLabel(activity).label}（${core.activityLabel(activity).desc}）`,
        `累计：${rec.count} 次工具调用 + ${rec.panelOpens} 次面板打开，末次 ${rec.lastUsed ? core.fmtDay(rec.lastUsed) : '从未'}`,
      ];
      for (const n of core.TREND_WINDOWS) {
        const w = core.aggregateWindow(rec, n);
        lines.push(`近${n}天：工具${w.mcp} / 面板${w.panel} / 合计${w.total}`);
      }
      if (p.origin && p.origin.downloadUrl) lines.push(`来源：远端安装（${p.origin.downloadUrl}）`);
      else if (p.source && typeof p.source.kind === 'string') lines.push(`来源：${p.source.kind}`);
      if (core.hasServices(p)) {
        const svcs = services.filter((s) => s.pluginId === p.id) || [];
        lines.push(`后台服务：${svcs.length ? svcs.map((s) => `${s.serviceId}=${s.state}${s.port ? ':' + s.port : ''}`).join(' ') : '声明但未启动'}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'watchtower_report_usage',
    description: '守望台·补记一次插件使用。当 AI 或用户经本插件 MCP 之外使用某插件（如直接调其它插件的工具，或在对话里讨论）时，调用它把这次使用记入账本——让计量覆盖所有插件，不只是本插件。用户说「刚才用了 XX」「把 XX 也记一下」时配合使用。',
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: { type: 'string', description: '被使用的插件 id' },
        source: { type: 'string', enum: ['mcp', 'panel'], description: 'mcp=工具调用；panel=面板打开。缺省 mcp' },
      },
      required: ['pluginId'],
    },
    async call(args) {
      const pid = args.pluginId;
      const source = args.source === 'panel' ? 'panel' : 'mcp';
      if (!pid || typeof pid !== 'string') return err('pluginId 必填');
      await recordOne(pid, source);
      const rec = core.normalizeUsage(await kvGet(core.K.usage(pid)));
      return ok(`已记录：${pid} +1次${source === 'panel' ? '面板打开' : '工具调用'}（累计 ${rec.count} 工具 + ${rec.panelOpens} 面板）`);
    },
  },
  {
    name: 'watchtower_service_status',
    description: '守望台·全部后台服务的运行状态。列出每个声明了后台服务（contributes.services）的插件的服务状态：running/exited、端口、pid、uptime、重启次数、最近错误。用户问「哪些插件在后台跑着」「XX 服务挂了没」时调用。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      await recordOne('watchtower', 'mcp');
      const services = await loadServiceList();
      if (!services.length) return ok('当前没有正在管理/已声明的后台服务。');
      const lines = [`后台服务（${services.length} 个）：`];
      for (const s of services) {
        const bits = [s.state];
        if (s.port) bits.push(`端口 ${s.port}`);
        if (s.uptime != null) bits.push(`up ${Math.round(s.uptime / 1000)}s`);
        if (s.restartCount) bits.push(`重启×${s.restartCount}`);
        lines.push(`  ${s.pluginId}/${s.serviceId}：${bits.join('，')}${s.lastError ? ` ⚠️ ${s.lastError}` : ''}`);
      }
      lines.push('');
      lines.push('服务启停：watchtower_service_start / _stop / _restart（停用插件 = cap.pluginDiscovery 级 enabled 门，比杀进程更干净）。');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'watchtower_service_start',
    description: '守望台·启动某插件的后台服务。用户说「把 XX 的服务拉起来」「启动 XX 服务」时调用。需要 pluginId + serviceId。',
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: { type: 'string', description: '插件 id' },
        serviceId: { type: 'string', description: '服务 id（watchtower_service_status 可查）' },
      },
      required: ['pluginId', 'serviceId'],
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const r = await plService('start', args.pluginId, args.serviceId);
      const s = core.normalizeServiceStatus(r);
      const st = s ? s.state : 'unknown';
      return ok(`已请求启动 ${args.pluginId}/${args.serviceId} → ${st}${s && s.port ? `（端口 ${s.port}）` : ''}`);
    },
  },
  {
    name: 'watchtower_service_stop',
    description: '守望台·停止某插件的后台服务。用户说「把 XX 的服务停掉」「XX 别跑了」时调用（通常用于释放资源）。需要 pluginId + serviceId；也可先 watchtower_service_status 看谁在跑。',
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: { type: 'string', description: '插件 id' },
        serviceId: { type: 'string', description: '服务 id' },
      },
      required: ['pluginId', 'serviceId'],
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const r = await plService('stop', args.pluginId, args.serviceId);
      const s = core.normalizeServiceStatus(r);
      return ok(`已请求停止 ${args.pluginId}/${args.serviceId} → ${s ? s.state : 'unknown'}`);
    },
  },
  {
    name: 'watchtower_service_restart',
    description: '守望台·重启某插件的后台服务。用户说「XX 服务重启一下」「XX 卡了帮我重启」时调用。需要 pluginId + serviceId。',
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: { type: 'string', description: '插件 id' },
        serviceId: { type: 'string', description: '服务 id' },
      },
      required: ['pluginId', 'serviceId'],
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const r = await plService('restart', args.pluginId, args.serviceId);
      const s = core.normalizeServiceStatus(r);
      return ok(`已请求重启 ${args.pluginId}/${args.serviceId} → ${s ? s.state : 'unknown'}`);
    },
  },
  {
    name: 'watchtower_cold_plugins',
    description: '守望台·冷门/沉睡插件治理建议。列出近 30 天零使用（冷门）或近 7 天未用但历史用过（沉睡）的插件，以及「冷门且后台服务仍在跑」的高优先级项，给停用/卸载建议。用户问「哪些插件可以清理」「帮我瘦身插件列表」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        include: { type: 'string', enum: ['cold', 'all'], description: 'cold=只看冷门/从未；all=含沉睡建议。缺省 cold' },
      },
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const [plugins, usage, services] = await Promise.all([loadPluginList(), loadAllUsage(), loadServiceList()]);
      const suggestions = core.governanceSuggestions(plugins, usage, services);
      const include = args.include || 'cold';
      if (!include || include === 'all' || !suggestions.length) {
        const filtered = include === 'cold'
          ? suggestions.filter((s) => s.activity !== 'idle')
          : suggestions;
        if (!filtered.length) return ok('没有可治理的冷门插件——都用得好好的。');
        const lines = [`治理建议（${filtered.length} 条）：`];
        for (const s of filtered) {
          lines.push(`  [${s.suggestion}] ${s.name}（${s.pluginId}）：${s.reason}`);
        }
        lines.push('');
        lines.push('操作入口：watchtower_plugin_uninstall（卸载）；停用可在面板或宿主插件设置完成（本插件不加 enabled 门以免越权）。');
        return ok(lines.join('\n'));
      }
      // include=cold 且没有提：降级返回全部建议
      if (!suggestions.length) return ok('没有可治理的冷门插件——都用得好好的。');
      const lines = ['治理建议：'];
      for (const s of suggestions) lines.push(`  [${s.suggestion}] ${s.name}：${s.reason}`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'watchtower_uninstall',
    description: '守望台·卸载插件。危险操作，仅限非内置插件；调用前务必向用户二次确认插件 id 与不可逆性。靠 installPath 执行（cap.pluginDiscovery uninstall）。卸载后不可恢复，请谨慎。用户明确说「卸载 XX 插件」且你已确认时才调用。',
    inputSchema: {
      type: 'object',
      properties: { pluginId: { type: 'string', description: '插件 id' } },
      required: ['pluginId'],
    },
    async call(args) {
      await recordOne('watchtower', 'mcp');
      const [plugins] = [await loadPluginList()];
      const p = plugins.find((x) => x.id === args.pluginId);
      if (!p) return err(`未找到插件 ${args.pluginId}`);
      if (p.builtin) return err(`${p.name} 是内置插件，不可卸载。`);
      const r = await plUninstall(p.installPath);
      return ok(`已请求卸载 ${p.name}（${p.id}）：${JSON.stringify(r)}`);
    },
  },
];

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