#!/usr/bin/env node
'use strict';
/**
 * net-sentinel MCP Server —— 网哨的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 netmon.* 键空间的读写。探测/聚合/告警/测速全部由后台服务单权威执行——
 * MCP 只负责「读快照 / 读桶聚合 / 读事件 / 投递测速与目标命令并等待结果」，
 * 不自行探测，与服务共享同一事实库（单写者：service/net.js）。
 *
 * 工具一览：
 *   net_status     当前在线状态 + 各目标延迟/丢包/DNS（「现在网怎么样」）
 *   net_history    回看最近 N 小时分目标聚合（「今天上午网怎么样」）
 *   net_events     断网/恢复/失联/劣化事件流（「昨晚有没有断网」）
 *   net_speedtest  按需测速（confirm:true；mb≤25；SSRF 守卫）（「测下网速」）
 *   net_targets    探测目标管理 list/add/remove/enable/disable（「帮我盯 xyz」）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现（env → anchor → config → 扫描）。
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const lib = require('../service/lib');

const SERVER_NAME = 'net-sentinel';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  snapshot: 'netmon.snapshot',
  meta: 'netmon.meta',
  hourPrefix: 'netmon.h.',
  eventPrefix: 'netmon.event.',
  speedPrefix: 'netmon.speed.',
  cmdSpeed: (nonce) => `netmon.cmd.speed.${nonce}`,
  cmdTargets: (nonce) => `netmon.cmd.targets.${nonce}`,
  result: (nonce) => `netmon.result.${nonce}`,
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 快照读取与新鲜度 ───────────────────────────────────────────────────────
function snapshotAge(snap) {
  if (!snap || typeof snap.at !== 'number') return Infinity;
  return Math.max(0, Math.round((Date.now() - snap.at) / 1000));
}

async function loadSnapshotOrErr() {
  const snap = await kv.kvGet(K.snapshot).catch(() => null);
  if (!snap || typeof snap !== 'object') {
    return { error: '暂无网络快照：网哨后台服务可能未运行（Polaris 设置→插件→网哨 查看服务状态；面板可一键启动）' };
  }
  const age = snapshotAge(snap);
  if (age > 120) {
    return { error: `快照已停滞 ${age}s（>120s）：后台服务可能已停止或桥不可达。请打开面板「网哨」→ 设置 检查服务状态。` };
  }
  return { snap, age };
}

function fmtMs(ms) { return lib.formatMs(ms); }

/** 快照 round → 按目标渲染行 */
function renderTargets(snap) {
  const lines = [];
  const targets = snap.targets || [];
  const round = snap.round || {};
  const kindLabel = { gateway: '网关', anchor: '锚点', normal: '站点' };
  for (const t of targets) {
    const r = round[t.id];
    const recent = (snap.recent && snap.recent[t.id]) || [];
    const win = recent.slice(-30).filter((x) => Array.isArray(x));
    const okN = win.filter((x) => x[1] !== null && Number.isFinite(x[1])).length;
    const lossPct = win.length ? Math.round(((win.length - okN) / win.length) * 100) : null;
    if (!r) {
      lines.push(`  ○ ${t.label}（${t.host}:${t.port}，${kindLabel[t.kind] || t.kind}）${t.enabled ? '：等待本轮探测' : '：已停用'}`);
      continue;
    }
    if (r.ok) {
      const dns = Number.isFinite(r.dnsMs) ? `，DNS ${fmtMs(r.dnsMs)}` : '';
      const loss = lossPct === null ? '' : `，近30轮丢包 ${lossPct}%`;
      lines.push(`  ✓ ${t.label}（${t.host}:${t.port}）${fmtMs(r.ms)}${dns}${loss}`);
    } else {
      lines.push(`  ✗ ${t.label}（${t.host}:${t.port}）失联（${r.err || '无应答'}${Number.isFinite(r.dnsMs) ? `，DNS ${fmtMs(r.dnsMs)} ${r.dnsMs > 800 ? '偏慢' : '正常'}` : ''}）`);
    }
  }
  return lines;
}

const tools = [
  {
    name: 'net_status',
    description: '查看本机网络当前状态：是否在线（锚点判定）、网关/DNS/常用站点的 TCP 握手延迟、DNS 解析耗时、近期丢包率、进行中的断网或劣化告警。适用于「现在网怎么样」「github 能连上吗」「是 DNS 慢还是网络慢」。手机上通过 Polaris 查问时看到的是桌面机所在网络的实时状态。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const r = await loadSnapshotOrErr();
      if (r.error) return err(r.error);
      const snap = r.snap;
      const lines = [];
      lines.push(`网络${snap.online ? '在线 ✓' : '离线 ✗（锚点判定）'} · 探测间隔 ${snap.tickSec}s · 快照龄期 ${r.age}s`);
      if (snap.speeding) lines.push(`⚠ 测速进行中：${snap.speeding.url}（约 ${snap.speeding.mb}MB）`);
      lines.push(...renderTargets(snap));
      const speeds = snap.speeds || [];
      if (speeds.length) {
        lines.push(`最近测速：${speeds.slice(0, 3).map((s) => `${new Date(s.at).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${s.ok ? `${s.mbps} Mbps` : `失败(${s.err || '?'})`}`).join('；')}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'net_history',
    description: '回看本机网络最近 N 小时的历史：分目标的平均/峰值/P95 延迟、丢包率、失联分钟数（按小时桶聚合）。适用于「今天上午网怎么样」「这一个小时 github 延迟如何」「最近三小时掉过包吗」。',
    inputSchema: {
      type: 'object',
      properties: {
        hours: { type: 'integer', description: '回看小时数（默认 1，上限 72）' },
        target: { type: 'string', description: '只看该目标（id 或标签子串，如 github），缺省看全部' },
      },
    },
    async call(args) {
      const r = await loadSnapshotOrErr();
      if (r.error) return err(r.error);
      const snap = r.snap;
      const hours = Math.min(72, Math.max(1, Math.floor(Number(args.hours) || 1)));
      // 找最近 hours 个小时键（含当前小时）
      const keys = [];
      const now = Date.now();
      for (let i = 0; i < hours; i++) {
        keys.push(`netmon.h.${lib.hourKey(now - i * 3600 * 1000)}`);
      }
      const uniqKeys = [...new Set(keys)];
      const buckets = await Promise.all(uniqKeys.map((k) => kv.kvGet(k).catch(() => null)));
      const byTarget = new Map();
      for (const b of buckets) {
        if (!b || typeof b !== 'object' || !b.byTarget) continue;
        for (const [tid, recs] of Object.entries(b.byTarget)) {
          if (!byTarget.has(tid)) byTarget.set(tid, []);
          byTarget.get(tid).push(...(Array.isArray(recs) ? recs : []));
        }
      }
      const want = String(args.target || '').trim().toLowerCase();
      const tmap = new Map((snap.targets || []).map((t) => [t.id, t]));
      const lines = [];
      let anyData = false;
      for (const [tid, recs] of byTarget) {
        const t = tmap.get(tid);
        const label = t ? t.label : tid;
        if (want && !tid.toLowerCase().includes(want) && !label.toLowerCase().includes(want)) continue;
        recs.sort((a, b) => (a[0] || 0) - (b[0] || 0));
        const st = lib.aggStats(recs);
        if (!st.cnt) continue;
        anyData = true;
        const lossPct = Math.round((st.loss / st.cnt) * 1000) / 10;
        lines.push(`  ${label}：均值 ${fmtMs(st.avg)} · P95 ${fmtMs(st.p95)} · 峰值 ${fmtMs(st.max)} · 丢包 ${lossPct}%（${st.cnt} 次探测）`);
      }
      if (!anyData) {
        return ok(`最近 ${hours} 小时暂无数据（服务刚启动或快照停滞前无样本；可先用 net_status 看当前状态）。`);
      }
      const head = `最近 ${hours} 小时（${snap.online ? '当前在线' : '当前离线'}）：`;
      return ok(`${head}\n${lines.join('\n')}`);
    },
  },
  {
    name: 'net_events',
    description: '回读网哨记录的网络事件流：断网/恢复、单目标失联/恢复、延迟劣化/回落（边沿触发、带时间与持续时长）。适用于「昨晚有没有断网」「这周网络什么时候不稳」「github 最近是不是老连不上」。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '最多返回几条（默认 10，上限 30）' },
      },
    },
    async call(args) {
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      const keys = await kv.kvKeys();
      const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort().slice(-limit).reverse();
      if (!evKeys.length) return ok('暂无网络事件（运行期间没有断网/失联/劣化发生过——好事）。');
      const lines = [];
      for (const k of evKeys) {
        const ev = await kv.kvGet(k).catch(() => null);
        if (!ev || typeof ev !== 'object') continue;
        const time = new Date(ev.at).toLocaleString('zh-CN', { hour12: false });
        lines.push(`[${time}] ${ev.summary}`);
      }
      return ok(lines.join('\n') || '暂无网络事件。');
    },
  },
  {
    name: 'net_speedtest',
    description: '按需跑一次网速测试（下载计速，Mbps）。危险等级低但耗时 10-30s 且下载数 MB 流量，必须传 confirm:true。可用 mb 限制下载量（默认 10MB，上限 25），可用 url 指定测速地址（默认 Cloudflare speed 端点；面板设置可改）。局域网 NAS 测速需 allowPrivate:true。',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: '必须为 true 才会执行（会下载数 MB 流量）' },
        mb: { type: 'integer', description: '下载上限 MB（默认 10，上限 25）' },
        url: { type: 'string', description: '测速地址（可选；默认走面板设置或 Cloudflare；含 {bytes} 占位符会被替换为字节数）' },
        allowPrivate: { type: 'boolean', description: '允许本机/私网地址（局域网 NAS 测速用，默认拒绝）' },
      },
    },
    async call(args) {
      if (args.confirm !== true) {
        return err('缺少 confirm:true——测速会下载数 MB 流量。请先与用户确认（尤其移动网络），再带 confirm:true 重试。');
      }
      const nonce = 's' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await kv.kvSet(K.cmdSpeed(nonce), {
        confirm: true,
        mb: Number(args.mb) || undefined,
        url: typeof args.url === 'string' ? args.url.slice(0, 300) : undefined,
        allowPrivate: args.allowPrivate === true,
        at: Date.now(),
      });
      for (let i = 0; i < 40; i++) {
        await sleep(1500);
        const r = await kv.kvGet(K.result(nonce)).catch(() => null);
        if (r) {
          await kv.kvDel(K.result(nonce)).catch(() => {});
          if (r.ok) {
            const p = r.payload || {};
            const lat = Number.isFinite(p.latencyMs) ? `，首字节 ${fmtMs(p.latencyMs)}` : '';
            return ok(`测速完成：${p.mbps} Mbps（${(p.bytes / 1000 / 1000).toFixed(1)}MB / ${(p.durMs / 1000).toFixed(1)}s${lat}）\n地址：${p.url}`);
          }
          return err(r.error || '测速失败');
        }
      }
      return err('测速结果等待超时（后台服务可能未运行——面板「网哨」→ 设置 可查看/启动服务；测速大文件时也可能超过 60s）。');
    },
  },
  {
    name: 'net_targets',
    description: '查看或管理网哨的探测目标（网关/DNS/站点列表，每 10s 探测一轮）。action=list 列出全部；action=add 增加（target:{label,host,port,kind?}）；action=remove/enable/disable 按 id 操作。适用于「帮我盯一下 xyz.com」「把 github 加进监控」。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove', 'enable', 'disable'], description: '操作类型' },
        target: {
          type: 'object',
          description: 'add 时的目标：{label(≤24字), host(域名或IP；gateway 可空=自动发现), port(1-65535), kind: anchor|normal|gateway}',
          properties: {
            label: { type: 'string' },
            host: { type: 'string' },
            port: { type: 'integer' },
            kind: { type: 'string', enum: ['anchor', 'normal', 'gateway'] },
          },
        },
        id: { type: 'string', description: 'remove/enable/disable 的目标 id' },
      },
    },
    async call(args) {
      const action = String(args.action || 'list');
      if (action === 'list') {
        const snap = await kv.kvGet(K.snapshot).catch(() => null);
        const targets = (snap && Array.isArray(snap.targets)) ? snap.targets : null;
        if (!targets || !targets.length) {
          const raw = await kv.kvGet('netmon.targets').catch(() => null);
          const list = raw && Array.isArray(raw.targets) ? raw.targets : [];
          if (!list.length) return ok('目标列表为空（服务未初始化，稍后再试）。');
          return ok(`探测目标 ${list.length} 个：\n${list.map((t) => `  ${t.id}  ${t.label}（${t.host || '(自动网关)'}:${t.port}，${t.kind}${t.enabled !== false ? '' : '，已停用'}）`).join('\n')}`);
        }
        const round = (snap && snap.round) || {};
        return ok(`探测目标 ${targets.length} 个：\n${targets.map((t) => {
          const r = round[t.id];
          return `  ${t.id}  ${t.label}（${t.host}:${t.port}，${t.kind}${t.enabled ? '' : '，已停用'}）${r ? (r.ok ? ` ${fmtMs(r.ms)}` : ` 失联(${r.err || '?'})`) : ''}`;
        }).join('\n')}`);
      }
      const nonce = 't' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await kv.kvSet(K.cmdTargets(nonce), { action, target: args.target, id: args.id, at: Date.now() });
      for (let i = 0; i < 10; i++) {
        await sleep(1200);
        const r = await kv.kvGet(K.result(nonce)).catch(() => null);
        if (r) {
          await kv.kvDel(K.result(nonce)).catch(() => {});
          if (r.ok) {
            const list = (r.payload && r.payload.targets) || [];
            return ok(`已${action === 'add' ? '新增目标' : action === 'remove' ? '移除目标' : action === 'enable' ? '启用目标' : '停用目标'}（服务每轮自动探测，10s 内生效）。\n当前目标 ${list.length} 个：${list.map((t) => `${t.label}(${t.enabled !== false ? '开' : '停'})`).join('、')}`);
          }
          return err(r.error || '操作失败');
        }
      }
      return err('目标命令结果等待超时（后台服务可能未运行）。命令键已留在队列，服务恢复后会执行。');
    },
  },
];

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
