#!/usr/bin/env node
'use strict';
/**
 * pocket-host MCP Server —— 口袋主机的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 hostmon.* 键空间的读写。采样/告警/kill 全部由后台服务单权威执行——
 * MCP 只负责「读快照 / 读事件 / 投递 kill 命令并等待结果」，不自行采样，
 * 与服务共享同一事实库（单写者：service/host.js）。
 *
 * 工具一览：
 *   host_status     主机当前状态一句话摘要（CPU/内存/磁盘/uptime/告警）
 *   host_processes  按内存排序的进程表（可按名字过滤）
 *   host_ports      监听端口 → 进程归属（可查单个端口被谁占用）
 *   host_history    最近 N 分钟 CPU/内存走势摘要（均值/峰值）
 *   host_events     阈值告警事件流（CPU/内存/磁盘）
 *   host_kill       结束进程（必须 confirm:true；按 port 结束由服务执行时
 *                   重新解析归属，防 PID 复用误杀；guardKill 拒绝系统/Polaris 进程）
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现（env → anchor → config → 扫描）。
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const lib = require('../service/lib');

const SERVER_NAME = 'pocket-host';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  snapshot: 'hostmon.snapshot',
  meta: 'hostmon.meta',
  eventPrefix: 'hostmon.event.',
  cmdKill: (nonce) => `hostmon.cmd.kill.${nonce}`,
  result: (nonce) => `hostmon.result.${nonce}`,
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
/** 快照龄期（秒）；无快照返回 Infinity */
function snapshotAge(snap) {
  if (!snap || typeof snap.at !== 'number') return Infinity;
  return Math.max(0, Math.round((Date.now() - snap.at) / 1000));
}

async function loadSnapshotOrErr() {
  const snap = await kv.kvGet(K.snapshot).catch(() => null);
  if (!snap || typeof snap !== 'object') {
    return { error: '暂无主机快照：口袋主机后台服务可能未运行（Polaris 设置→插件→口袋主机 查看服务状态；面板可一键启动）' };
  }
  const age = snapshotAge(snap);
  if (age > 120) {
    return { error: `快照已停滞 ${age}s（>120s）：后台服务可能已停止或桥不可达。请打开面板「口袋主机」→ 设置 检查服务状态。` };
  }
  return { snap, age };
}

function fmtGb(n) {
  return Number.isFinite(n) ? `${n} GB` : '?';
}

function renderStatus(snap, age) {
  const h = snap.host || {};
  const lines = [];
  lines.push(`主机 ${h.name || '?'}（${h.platform || '?'} ${h.release || ''} ${h.arch || ''}）· ${h.cores || '?'} 核 · 开机 ${lib.formatUptime(snap.uptimeSec)}`);
  lines.push(`CPU：${Number.isFinite(snap.cpuPct) ? `${snap.cpuPct}%` : '采样中'} ｜ 内存：${Number.isFinite(snap.memPct) ? `${snap.memPct}%` : '采样中'}（${(snap.memUsedBytes / 1073741824).toFixed(1)}/${((h.totalMemBytes || 0) / 1073741824).toFixed(1)} GB）`);
  if (Array.isArray(snap.disks) && snap.disks.length) {
    lines.push(`磁盘：${snap.disks.map((d) => `${d.mount} ${fmtGb(d.freeGb)} 可用 (${100 - Math.round(d.pct)}%)`).join('；')}`);
  } else {
    lines.push('磁盘：暂无数据');
  }
  const procs = (snap.procs && snap.procs.list) || [];
  if (procs.length) {
    lines.push(`内存占用 Top${Math.min(5, procs.length)}：${procs.slice(0, 5).map((p) => `${p.name}(${p.pid}) ${p.memMb}MB`).join('、')}（共 ${snap.procs.count} 进程）`);
  }
  const ports = (snap.ports && snap.ports.list) || [];
  lines.push(`监听端口 ${ports.length} 个${(snap.ports && snap.ports.count) > ports.length ? `（快照仅含前 ${ports.length}）` : ''}，用 host_ports 查归属`);
  const al = snap.alerts || {};
  const activeAl = [];
  if (al.cpu_high) activeAl.push('CPU 超阈值');
  if (al.mem_high) activeAl.push('内存超阈值');
  if (al.disk_low) activeAl.push(`磁盘不足(${(al.lowMounts || []).join(',') || '—'})`);
  lines.push(activeAl.length ? `⚠ 告警中：${activeAl.join('；')}` : '无进行中的阈值告警');
  lines.push(`（快照龄期 ${age}s；服务心跳正常）`);
  return lines.join('\n');
}

const tools = [
  {
    name: 'host_status',
    description: '查看口袋主机监控的电脑当前状态：CPU/内存占用、磁盘余量、开机时长、内存占用 Top 进程、监听端口数与进行中的告警。适用于「电脑现在什么状态」「是不是卡了」「C 盘还剩多少」。手机上通过 Polaris 查问时看到的是桌面机的实时状态。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const r = await loadSnapshotOrErr();
      if (r.error) return err(r.error);
      return ok(renderStatus(r.snap, r.age));
    },
  },
  {
    name: 'host_processes',
    description: '列出主机上按内存占用排序的进程（含 PID）。适用于「谁在吃内存」「node 是不是又没退干净」。找到目标后可用 host_kill 结束。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '进程名子串过滤（大小写不敏感，如 node、chrome）' },
        limit: { type: 'integer', description: '最多返回几条（默认 15，上限 40）' },
      },
    },
    async call(args) {
      const r = await loadSnapshotOrErr();
      if (r.error) return err(r.error);
      const rows = lib.pickProcs(
        (r.snap.procs && r.snap.procs.list || []).map((p) => ({ name: p.name, pid: p.pid, memK: Math.round((p.memMb || 0) * 1024) })),
        { limit: Math.min(40, Math.max(1, Number(args.limit) || 15)), filter: args.filter || '' },
      );
      if (!rows.length) {
        return ok(args.filter ? `快照中没有名字含「${args.filter}」的进程（快照含内存 Top25，进程可能在列表之外）。` : '快照中没有进程数据（服务慢采样可能尚未完成，稍后再试）。');
      }
      const lines = rows.map((p, i) => `${i + 1}. ${p.name}  PID=${p.pid}  ${p.memMb} MB`);
      return ok(`按内存排序（快照 Top${(r.snap.procs && r.snap.procs.list || []).length}，全机 ${r.snap.procs.count} 进程）：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'host_ports',
    description: '查询主机 TCP 监听端口及占用进程。适用于「9827 端口被谁占了」「dev server 起不来是不是端口冲突」。可用 host_kill 按 port 结束占用者。',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'integer', description: '只查这个端口（如 9829）' },
        limit: { type: 'integer', description: '最多返回几条（默认 30，上限 100）' },
      },
    },
    async call(args) {
      const r = await loadSnapshotOrErr();
      if (r.error) return err(r.error);
      const rows = (r.snap.ports && r.snap.ports.list) || [];
      if (!rows.length) return ok('快照中没有监听端口数据（服务慢采样可能尚未完成，稍后再试）。');
      const want = Number(args.port);
      const list = Number.isFinite(want) && want > 0 ? rows.filter((p) => p.port === want) : rows.slice(0, Math.min(100, Math.max(1, Number(args.limit) || 30)));
      if (!list.length) {
        return ok(`端口 ${want} 当前无监听（快照龄期 ${r.age}s，若刚启动进程请稍后重查；也可用 host_kill port=${want} 直接按端口结束——服务执行时会重新解析归属）。`);
      }
      const lines = list.map((p) => `:${p.port}  ←  ${p.name || '未知'} (PID ${p.pid})`);
      return ok(`${Number.isFinite(want) && want > 0 ? `端口 ${want}` : `监听端口 ${list.length}/${r.snap.ports.count}`}：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'host_history',
    description: '回看主机最近 N 分钟的 CPU/内存走势（均值与峰值），判断「刚才是不是卡过一阵」「负载什么时候起来的」。采样窗口约 15 分钟，取决于服务运行时长。',
    inputSchema: { type: 'object', properties: { minutes: { type: 'integer', description: '回看分钟数（默认 15，上限 15）' } } },
    async call(args) {
      const r = await loadSnapshotOrErr();
      if (r.error) return err(r.error);
      const hist = Array.isArray(r.snap.history) ? r.snap.history : [];
      if (!hist.length) return ok('暂无历史样本（服务刚启动，攒 1-2 分钟再看）。');
      const minutes = Math.min(15, Math.max(1, Number(args.minutes) || 15));
      const since = Math.floor(Date.now() / 1000) - minutes * 60;
      const win = hist.filter((s) => Array.isArray(s) && s[0] >= since);
      if (!win.length) return ok(`最近 ${minutes} 分钟内无样本（历史窗口约 15 分钟）。`);
      const cpuArr = win.map((s) => s[1] || 0);
      const memArr = win.map((s) => s[2] || 0);
      const avg = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10;
      const peak = (a) => Math.max(...a);
      const spanMin = Math.round((win[win.length - 1][0] - win[0][0]) / 60 * 10) / 10;
      const bars = (v) => '█'.repeat(Math.max(1, Math.round(v / 10)));
      const cpuSpark = win.slice(-24).map((s) => bars(s[1])).join('');
      return ok(`最近 ${spanMin} 分钟（${win.length} 个样本）：\nCPU 均值 ${avg(cpuArr)}%  峰值 ${peak(cpuArr)}%\n内存 均值 ${avg(memArr)}%  峰值 ${peak(memArr)}%\nCPU 近段走势(10%/█)：${cpuSpark}`);
    },
  },
  {
    name: 'host_events',
    description: '回读口袋主机的阈值告警事件（CPU/内存持续偏高、磁盘空间不足及各自恢复记录）。',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: '最多返回几条（默认 10，上限 30）' } } },
    async call(args) {
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      const keys = await kv.kvKeys();
      const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort().slice(-limit).reverse();
      if (!evKeys.length) return ok('暂无告警事件（运行期间没有触发过阈值）。');
      const lines = [];
      for (const k of evKeys) {
        const ev = await kv.kvGet(k).catch(() => null);
        if (!ev) continue;
        const time = new Date(ev.at).toLocaleString('zh-CN', { hour12: false });
        lines.push(`[${time}] ${ev.summary}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'host_kill',
    description: '结束主机上的进程（危险操作）。必须传 confirm:true 才执行；可按 PID 结束，或按 port 结束监听者（推荐——服务执行时会重新解析端口归属，避免 PID 复用误杀新进程）。系统关键进程（PID<=4）与 Polaris 自身进程会被服务拒绝。适用于「9827 被占了帮我释放」「杀掉失控的 node」。',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'integer', description: '目标进程 PID（与 port 二选一）' },
        port: { type: 'integer', description: '释放该端口的监听进程（推荐，执行时重新解析归属）' },
        confirm: { type: 'boolean', description: '必须为 true 才会执行' },
        reason: { type: 'string', description: '结束原因（会记入结果，可选）' },
      },
    },
    async call(args) {
      if (args.confirm !== true) {
        return err('缺少 confirm:true——结束进程是危险操作。请先与用户确认目标进程确属可杀（可用 host_processes / host_ports 核对 PID 与名字），再带 confirm:true 重试。');
      }
      const cmd = lib.normalizeKillCmd(args);
      if (cmd.error) return err(cmd.error);
      const nonce = 'k' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await kv.kvSet(K.cmdKill(nonce), { ...cmd, at: Date.now() });
      for (let i = 0; i < 27; i++) {
        await sleep(1500);
        const r = await kv.kvGet(K.result(nonce)).catch(() => null);
        if (r) {
          await kv.kvDel(K.result(nonce)).catch(() => {});
          if (r.ok) {
            const lines = (r.results || []).map((x) => `  ${x.name || '?'} (PID ${x.pid})：已结束${x.output ? `（${x.output}）` : ''}`);
            return ok(`已执行${r.byPort ? `（按端口 ${r.byPort}，执行时重新解析归属）` : ''}：\n${lines.join('\n')}`);
          }
          if (r.error) return err(r.error);
          const lines = (r.results || []).map((x) => `  ${x.name || '?'} (PID ${x.pid})：${x.error || '失败' + (x.output ? `（${x.output}）` : '')}`);
          return err(`未全部成功：\n${lines.join('\n')}`);
        }
      }
      return err('kill 结果等待超时（后台服务可能未运行——面板「口袋主机」→ 设置 可查看/启动服务）。命令键已留在队列，服务恢复后会执行，请稍后用 host_ports 复核。');
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
