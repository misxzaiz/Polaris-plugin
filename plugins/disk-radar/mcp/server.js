#!/usr/bin/env node
'use strict';
/**
 * disk-radar MCP Server —— 磁盘雷达的 AI 工具层（全只读，零依赖）
 *
 * 把 AI 的 tools/call 翻译为 Polaris IPC bridge 的 router_dispatch
 * （target=cap.kv）读 diskrad.* 键空间 + 写命令键，与面板/服务共享同一事实库。
 *
 * 安全设计：**没有任何删除类工具**。AI 只能看（overview/top/growth/junk）、
 * 只能发起扫描（scan_start/report）——一切删除动作由用户在面板手工执行
 * （隔离区两步模型）。工具描述里明示这一边界，避免 AI 越权承诺清理。
 *
 * 工具一览：
 *   disk_overview    总览：各根总量/卷余量/增量/垃圾汇总/扫描进度
 *   disk_top         空间大头：某根 top 目录（快照树 depth≤2）
 *   disk_growth      增量归因：最近两次完整快照谁涨谁跌
 *   disk_junk        可回收清单：开发垃圾分组 + 隔离区状态
 *   disk_scan_start  发起扫描（快/深），可带新路径自动登记根
 *   disk_report      细查任意目录（有预算，内联等待结果）
 */
const crypto = require('crypto');

const core = require('../shared/disk-core');
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'disk-radar';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const kvGet = kv.kvGet;
const kvSet = kv.kvSet;
const kvDel = kv.kvDel;
const kvKeys = kv.kvKeys;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 数据访问辅助 ────────────────────────────────────────────────────────────
async function loadRoots() {
  const raw = await kvGet(core.K.roots).catch(() => null);
  return raw && typeof raw === 'object' && Array.isArray(raw.roots) ? raw.roots : [];
}
async function loadState() {
  const raw = await kvGet(core.K.state).catch(() => null);
  return raw && typeof raw === 'object' && raw.roots ? raw : { roots: {} };
}
async function latestSnap(rid, { completeOnly = false } = {}) {
  const keys = await kvKeys();
  const list = keys
    .filter((k) => k.startsWith(core.K.snapPrefix(rid)))
    .map((k) => ({ k, seq: Number(k.slice(core.K.snapPrefix(rid).length)) || 0 }))
    .sort((a, b) => b.seq - a.seq);
  for (const s of list) {
    const v = await kvGet(s.k).catch(() => null);
    if (v && typeof v === 'object') {
      if (completeOnly && v.partial === true) continue;
      return v;
    }
  }
  return null;
}
async function resolveRootArg(rootPath) {
  const roots = await loadRoots();
  if (rootPath) {
    const norm = core.normalizeRootPath(rootPath);
    if (!norm.ok) return { error: norm.error };
    const rid = core.rootIdOf(norm.path);
    const root = roots.find((r) => r.id === rid);
    return root ? { root } : { error: `路径 ${norm.path} 尚未登记为扫描根（可先用 disk_scan_start 传 path 自动登记）` };
  }
  if (roots.length === 1) return { root: roots[0] };
  if (!roots.length) return { error: '尚无登记的扫描根——让用户在面板设置里添加，或用 disk_scan_start 传 path' };
  return { roots, needChoose: true };
}

function fmtSize(n) { return core.fmtBytes(n); }
function timeStr(ts) {
  if (!ts) return '从未';
  return new Date(Number(ts)).toLocaleString('zh-CN', { hour12: false });
}
function ageStr(ts) {
  if (!ts) return '从未';
  const s = Math.max(0, Math.round((Date.now() - Number(ts)) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return `${Math.round(s / 86400)} 天前`;
}

/** 命令键发送 + 轮询结果（结果由本进程读后删） */
async function runCmd(op, body, { waitMs = 0, stepMs = 1500 } = {}) {
  const nonce = 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await kvSet(core.K.cmd(op, nonce), { ...body, at: Date.now() });
  if (!waitMs) return { nonce, result: null };
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(stepMs);
    const r = await kvGet(core.K.result(nonce)).catch(() => null);
    if (r) {
      await kvDel(core.K.result(nonce)).catch(() => {});
      return { nonce, result: r };
    }
  }
  return { nonce, result: null };
}

/** 目录树 → 文本（带百分比条） */
function treeText(dirs, total, { maxItems = 20, indent = '' } = {}) {
  const rows = [];
  const walk = (list, prefix, depth) => {
    if (depth > 2) return;
    for (const nd of (list || []).slice(0, depth === 1 ? maxItems : 8)) {
      const pct = total > 0 ? ((nd.b || 0) / total) * 100 : 0;
      const bars = '▓'.repeat(Math.max(1, Math.round(pct / 5)));
      const tags = [];
      if (nd.j) tags.push(core.JUNK_KIND_LABEL[nd.j] || nd.j);
      if (nd.d) tags.push('无权限');
      rows.push(`${prefix}${nd.n}${tags.length ? `【${tags.join('/')}】` : ''}  ${fmtSize(nd.b)}（${pct.toFixed(1)}%）${bars}`);
      if (nd.c && nd.c.length && depth < 2) walk(nd.c, `${prefix}  `, depth + 1);
    }
  };
  walk(dirs, indent, 1);
  return rows.join('\n');
}

const NO_DATA_HINT = '（还没有快照——先用 disk_scan_start 发起扫描，等 1~2 分钟后重试）';

// ── 工具定义 ────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'disk_overview',
    description: '磁盘雷达总览：列出所有已登记扫描根的总占用、卷剩余空间、距上次完整快照的增量、可回收垃圾量与最近扫描时间；有扫描进行中时返回实时进度。适用：用户问「磁盘还剩多少」「D 盘什么情况」「空间有没有变化」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const [roots, state, meta, scan] = await Promise.all([
        loadRoots(), loadState(), kvGet(core.K.meta).catch(() => null), kvGet(core.K.scan).catch(() => null),
      ]);
      const lines = [];
      if (scan && scan.path && scan.updatedAt && Date.now() - scan.updatedAt < 15000) {
        lines.push(`▶ 扫描进行中：${scan.path}${scan.deep ? '（深扫）' : ''}——已扫 ${fmtSize(scan.bytes)} / ${scan.files} 文件，当前 ${scan.currentPath || '…'}`);
      }
      if (!roots.length) {
        lines.push('尚无登记的扫描根。让用户在面板「磁盘雷达 → 设置」添加（如 D:\\space），或调 disk_scan_start 传 path 自动登记。');
        return ok(lines.join('\n'));
      }
      for (const r of roots) {
        const st = (state.roots || {})[r.id];
        if (!st || !st.lastScanAt) {
          lines.push(`◇ ${r.label}（${r.path}）：尚未扫描——disk_scan_start 可发起`);
          continue;
        }
        const delta = st.deltaBytes == null ? '' : `，较上次完整快照 ${core.fmtDelta(st.deltaBytes)}${st.partial ? '（最新快照不完整）' : ''}`;
        const vol = st.volumeTotal ? `；卷余量 ${fmtSize(st.free)} / ${fmtSize(st.volumeTotal)}` : '';
        lines.push(`◆ ${r.label}（${r.path}）：占用 ${fmtSize(st.total)}（${core.fmtCount(st.files)} 文件）${vol}${delta}\n   垃圾 ${st.junkCount || 0} 项 ${fmtSize(st.junkBytes || 0)}；扫描于 ${ageStr(st.lastScanAt)}${st.lastError ? `；上次错误：${st.lastError}` : ''}`);
      }
      if (meta && meta.lastTickAt) lines.push(`（服务 ${ageStr(meta.lastTickAt)}在线${meta.bridge ? '，桥 ' + meta.bridge : ''}）`);
      else lines.push('（服务心跳缺失——服务可能未运行，让用户到 设置→插件 检查磁盘雷达服务状态）');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'disk_top',
    description: '磁盘雷达空间大头：列出某扫描根下最占空间的目录（快照树，depth≤2，含百分比）。适用：用户问「什么最占空间」「哪个目录最肥」「C 盘满是什么吃的」。',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: '扫描根路径（可选；不传且只登记了一个根时自动选它）' },
        limit: { type: 'integer', description: '列前几个（默认 15，上限 30）' },
      },
    },
    async call(args) {
      const rs = await resolveRootArg(args.rootPath);
      if (rs.error) return err(rs.error);
      if (rs.needChoose) {
        return err(`登记了多个根：${rs.roots.map((r) => r.path).join('、')}——请用 rootPath 指定其中一个`);
      }
      const snap = await latestSnap(rs.root.id);
      if (!snap) return ok(`${rs.root.path} ${NO_DATA_HINT}`);
      const dirs = core.sortTree([...(snap.dirs || [])]);
      const limit = Math.min(30, Math.max(3, Number(args.limit) || 15));
      const text = treeText(dirs, snap.total, { maxItems: limit });
      return ok(`${rs.root.path} 占用 ${fmtSize(snap.total)}（${core.fmtCount(snap.files)} 文件）${snap.partial ? '【快照不完整，深扫可补全】' : ''}，快照于 ${ageStr(snap.at)}：\n${text || '（空目录）'}`);
    },
  },
  {
    name: 'disk_growth',
    description: '磁盘雷达增量归因：对比最近两份完整快照，按目录列出增减 Top——「谁偷了我的磁盘」。适用：用户问「最近什么占了这么多」「磁盘怎么又满了」「哪些目录在变大」。',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: '扫描根路径（可选）' },
        limit: { type: 'integer', description: '列前几条（默认 15，上限 30）' },
      },
    },
    async call(args) {
      const rs = await resolveRootArg(args.rootPath);
      if (rs.error) return err(rs.error);
      if (rs.needChoose) {
        return err(`登记了多个根：${rs.roots.map((r) => r.path).join('、')}——请用 rootPath 指定其中一个`);
      }
      const rid = rs.root.id;
      const keys = await kvKeys();
      const list = keys
        .filter((k) => k.startsWith(core.K.snapPrefix(rid)))
        .map((k) => ({ k, seq: Number(k.slice(core.K.snapPrefix(rid).length)) || 0 }))
        .sort((a, b) => b.seq - a.seq);
      const snaps = [];
      for (const s of list) {
        const v = await kvGet(s.k).catch(() => null);
        if (v && typeof v === 'object' && v.partial !== true) snaps.push(v);
        if (snaps.length >= 2) break;
      }
      if (snaps.length < 2) {
        return ok(`完整快照还不足两份（现有 ${snaps.length} 份）——等自动快照或用 disk_scan_start 再扫一次之后才能归因增量。`);
      }
      const [cur, prev] = snaps;
      const movers = core.growthDiff(prev.dirs || [], cur.dirs || []);
      const limit = Math.min(30, Math.max(3, Number(args.limit) || 15));
      if (!movers.length) return ok('两次完整快照之间顶层目录没有变化（±0）。');
      const lines = movers.slice(0, limit).map((m) => {
        const arrow = m.delta > 0 ? '📈' : '📉';
        return `${arrow} ${m.path}：${core.fmtDelta(m.delta)}（${fmtSize(m.from)} → ${fmtSize(m.to)}）`;
      });
      return ok(`${rs.root.path} 从 ${timeStr(prev.at)} 到 ${timeStr(cur.at)}（总变化 ${core.fmtDelta(cur.total - prev.total)}）增量归因 Top${limit}：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'disk_junk',
    description: '磁盘雷达可回收清单：某扫描根下的开发垃圾（依赖包/构建产物/缓存，按兄弟文件锚定判定）分组列表 + 隔离区当前状态。只读——删除必须由用户在面板操作（先移入隔离区，确认后才彻底删除）。适用：用户问「有什么能删的」「清理开发垃圾」「node_modules 占多少」。',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: '扫描根路径（可选）' },
        limit: { type: 'integer', description: '每组最多列几条（默认 10，上限 30）' },
      },
    },
    async call(args) {
      const rs = await resolveRootArg(args.rootPath);
      if (rs.error) return err(rs.error);
      if (rs.needChoose) {
        return err(`登记了多个根：${rs.roots.map((r) => r.path).join('、')}——请用 rootPath 指定其中一个`);
      }
      const rid = rs.root.id;
      const junk = await kvGet(core.K.junk(rid)).catch(() => null);
      const qman = await kvGet(core.K.qman(rid)).catch(() => null);
      const lines = [];
      if (!junk || !Array.isArray(junk.items) || !junk.items.length) {
        if (junk && junk.at) {
          lines.push(`${rs.root.path}：最近扫描没发现开发垃圾（${ageStr(junk.at)}扫的）。`);
        } else {
          lines.push(`${rs.root.path} ${NO_DATA_HINT}`);
        }
      } else {
        const byKind = new Map();
        for (const it of junk.items) {
          if (!byKind.has(it.kind)) byKind.set(it.kind, []);
          byKind.get(it.kind).push(it);
        }
        const limit = Math.min(30, Math.max(3, Number(args.limit) || 10));
        for (const [kind, items] of byKind) {
          const bytes = items.reduce((s, it) => s + (it.bytes || 0), 0);
          lines.push(`【${core.JUNK_KIND_LABEL[kind] || kind}】${items.length} 项，共 ${fmtSize(bytes)}`);
          for (const it of items.slice(0, limit)) {
            lines.push(`  · ${it.relPath} — ${fmtSize(it.bytes)} / ${core.fmtCount(it.files)} 文件，最后写入 ${ageStr(it.lastWrite)}${it.note ? `（${it.note}）` : ''}`);
          }
        }
        if (junk.partial) lines.push('⚠ 清单来自不完整扫描，深扫可补全。');
        lines.push('（删除走面板两步：移入隔离区 → 确认彻底删除；AI 无法代删。）');
      }
      if (qman && Array.isArray(qman.items) && qman.items.length) {
        const bytes = qman.items.reduce((s, it) => s + (it.bytes || 0), 0);
        lines.push(`\n【隔离区】已有 ${qman.items.length} 项（${fmtSize(bytes)}，等用户确认后彻底删除/可恢复）。`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'disk_scan_start',
    description: '磁盘雷达发起扫描（立即返回，不等待完成）。传 path 可顺带把新目录登记为扫描根；deep=true 深扫（不限深度、预算更长、可补全不完整快照）。之后用 disk_overview 跟进度、disk_top/disk_junk 看结果。适用：用户说「扫一下 D:\\space」「重新扫」「深扫一遍」。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要扫描/登记的绝对路径（如 D:\\space）；不传则扫描全部已登记根' },
        deep: { type: 'boolean', description: 'true=深扫（更久更全，默认 false 快扫）' },
        label: { type: 'string', description: '新根的显示名（可选）' },
      },
    },
    async call(args) {
      const { result } = await runCmd('scan', {
        path: typeof args.path === 'string' ? args.path : undefined,
        deep: args.deep === true,
        label: typeof args.label === 'string' ? args.label.slice(0, 80) : undefined,
      }, { waitMs: 8000 });
      if (result && result.ok === false) return err(result.error || '扫描入队失败');
      if (result && result.payload && result.payload.queued) {
        return ok(`已把 ${result.payload.queued} 个已登记根加入扫描队列${result.payload.deep ? '（深扫）' : ''}。用 disk_overview 查进度，完成后 disk_top / disk_junk / disk_growth 看结果。`);
      }
      return ok(`扫描已入队${args.deep ? '（深扫）' : ''}${args.path ? `：${args.path}` : ''}。大目录可能要几分钟——之后用 disk_overview 查进度，disk_top / disk_junk / disk_growth 看结果。`);
    },
  },
  {
    name: 'disk_report',
    description: '磁盘雷达细查任意目录（不必是已登记根）：有预算地遍历并返回目录树/垃圾/无权限计数，内联等待结果（≤40 秒）。适用：用户说「看看这个文件夹里面有什么」「这个目录多大」。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '绝对路径' },
        maxDepth: { type: 'integer', description: '目录树深度（默认 2，上限 4）' },
        budgetMs: { type: 'integer', description: '遍历预算毫秒（默认 15000，上限 30000）' },
      },
      required: ['path'],
    },
    async call(args) {
      const p = typeof args.path === 'string' ? args.path.trim() : '';
      if (!p) return err('path 必填');
      const { result } = await runCmd('report', {
        path: p,
        maxDepth: Math.min(4, Math.max(1, Number(args.maxDepth) || 2)),
        budgetMs: Math.min(30000, Math.max(2000, Number(args.budgetMs) || 15000)),
      }, { waitMs: 40000, stepMs: 1200 });
      if (!result) return err('细查超时（服务可能未运行——设置→插件 检查磁盘雷达服务状态）');
      if (result.ok === false) return err(result.error || '细查失败');
      const pl = result.payload || {};
      const lines = [
        `${p}：${fmtSize(pl.total)} / ${core.fmtCount(pl.files)} 文件（${Math.round((pl.elapsedMs || 0) / 100) / 10}s${pl.partial ? '，预算内未扫完' : ''}${pl.deniedDirs ? `，${pl.deniedDirs} 个目录无权限` : ''}${pl.deniedFiles ? `，${pl.deniedFiles} 个文件无权限` : ''}）`,
        treeText(core.sortTree([...(pl.dirs || [])]), pl.total, { maxItems: 20 }),
      ];
      if (pl.junkItems && pl.junkItems.length) {
        lines.push('发现开发垃圾：');
        for (const it of pl.junkItems.slice(0, 15)) {
          lines.push(`  · ${it.relPath} — ${fmtSize(it.bytes)}【${core.JUNK_KIND_LABEL[it.kind] || it.kind}】`);
        }
      }
      return ok(lines.filter(Boolean).join('\n'));
    },
  },
];

// ── 包装 ────────────────────────────────────────────────────────────────────
function ok(text) {
  return { content: [{ type: 'text', text: String(text).slice(0, 20000) }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text: String(text) }], isError: true };
}

// ── JSON-RPC 2.0 over stdio（协议数据只走 stdout，日志全走 stderr）──────────
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
