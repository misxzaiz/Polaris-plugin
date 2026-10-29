#!/usr/bin/env node
'use strict';
/**
 * 书签体检 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 读路径（stats/search/dead/resurface）：直接读 cap.kv 的 bmd.rec.* 分块，
 * 服务不在线也能用。写路径（import/check/remove/tag）走命令键先删后做，
 * 由后台服务消费（单写者）。
 *
 * 工具：
 *   dig_stats        考古统计（总数/存活/死链/分类/死链重灾区）
 *   dig_search       检索书签（标题/URL/文件夹/标签 + 状态/分类/域名过滤）
 *   dig_dead         死链清单（按域名过滤）
 *   dig_resurface    捞一条沉睡的活书签（按沉睡时长×书龄加权）并记录重访
 *   dig_import_path  从磁盘导入 Netscape 书签导出 HTML（绝对路径）
 *   dig_check        启动体检运行（默认从没查过的开始）
 *   dig_remove       删除书签（必须 confirm:true）
 *   dig_tag          给书签打标签
 */
const path = require('path');

const { createKvClient } = require('../service/kvclient');
const core = require('../shared/dig-core');

const SERVER_NAME = 'bookmark-dig';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const APP_CONFIG_DIR = process.argv[2] || '';

const REC_PREFIX = 'bmd.rec.';
const RESULT_PREFIX = 'bmd.result.';
const K = { settings: 'bmd.settings', meta: 'bmd.meta', run: 'bmd.run' };

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => log(l, m) });

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

async function readAllRecords() {
  const keys = await kv.kvKeys();
  const nums = keys.filter((k) => k.startsWith(REC_PREFIX))
    .map((k) => Number(k.slice(REC_PREFIX.length)))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  const chunks = await Promise.all(nums.map(async (n) => kv.kvGet(REC_PREFIX + n).catch(() => null)));
  const out = [];
  for (const c of chunks) if (Array.isArray(c)) for (const r of c) if (r && r.id && r.normKey) out.push(r);
  return out;
}

const STATUS_CN = {
  pending: '未检查', ok: '存活', redirect: '重定向', dead4xx: '死链(4xx)', dead5xx: '5xx',
  dns: '域名失效', timeout: '超时', ssl: '证书错误', blocked: '内网拒检', invalid: '非法URL',
};

function fmtRec(r) {
  const st = STATUS_CN[r.status] || r.status;
  const meta = [
    r.httpStatus ? `HTTP ${r.httpStatus}` : '',
    r.latencyMs ? `${r.latencyMs}ms` : '',
    r.failReason ? oneLine(r.failReason, 60) : '',
  ].filter(Boolean).join(' · ');
  return `[${r.id}] ${oneLine(r.title || r.host, 70)}\n   ${r.url}\n   ${st}${meta ? `（${meta}）` : ''} · ${core.classifyUrl(r.url)} · 存于 ${new Date(r.addedAt).toLocaleDateString('zh-CN')}${r.folder ? ` · ${oneLine(r.folder, 40)}` : ''}${r.tags.length ? ` · 🏷${r.tags.join(',')}` : ''}`;
}

async function sendCmd(op, payload) {
  const nonce = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await kv.kvSet(`bmd.cmd.${op}.${nonce}`, { ...payload, nonce, at: Date.now() });
  return nonce;
}

async function pollResult(nonce, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const r = await kv.kvGet(RESULT_PREFIX + nonce).catch(() => null);
    if (r) { kv.kvDel(RESULT_PREFIX + nonce).catch(() => {}); return r; }
  }
  return null;
}

const tools = [
  {
    name: 'dig_stats',
    description: '书签体检统计：总数/存活/死链/待查/重复、分类分布、死链重灾区域名。适用：「我的书签健康情况怎么样」「有多少死链」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const recs = await readAllRecords();
      if (!recs.length) return ok('书签库是空的。用 dig_import_path 导入浏览器书签导出 HTML，或面板「检查」页选文件导入。');
      const roll = core.rollup(recs);
      const lines = [
        `书签体检统计（共 ${roll.total} 条）`,
        `存活 ${roll.alive} · 死链 ${roll.dead} · 待检查 ${roll.pending} · 重复 ${roll.duplicates}`,
        '',
        '分类分布：' + roll.categories.slice(0, 10).map((c) => `${c.name} ${c.count}`).join('，'),
      ];
      if (roll.topDeadDomains.length) {
        lines.push('', '死链重灾区：' + roll.topDeadDomains.map((d) => `${d.host}(${d.count})`).join('、'));
      }
      const run = await kv.kvGet(K.run).catch(() => null);
      if (run && run.queue) lines.push('', `检查进行中：${run.cursor}/${run.queue.length}（${run.type}）`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'dig_search',
    description: '检索书签库（标题/URL/文件夹/标签子串，可按状态/分类/域名过滤）。适用：「我存过关于 rust 的书签吗」「看看活着的 github 链接」。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词子串（可空）' },
        status: { type: 'string', enum: ['alive', 'dead', 'pending'], description: '状态过滤' },
        category: { type: 'string', description: '分类过滤（如 代码仓库/文档/视频/论文）' },
        domain: { type: 'string', description: '域名子串过滤' },
        limit: { type: 'integer', description: '最多返回几条（默认 10，上限 30）' },
      },
    },
    async call(args) {
      const recs = await readAllRecords();
      const hits = core.searchRecords(recs, args.query || '', { status: args.status, category: args.category, domain: args.domain });
      if (!hits.length) return ok(`没有匹配的书签（query=${args.query || '空'} status=${args.status || '全部'} category=${args.category || '全部'}）。`);
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      return ok(`命中 ${hits.length} 条（显示 ${Math.min(limit, hits.length)}）：\n${hits.slice(0, limit).map(fmtRec).join('\n')}`);
    },
  },
  {
    name: 'dig_dead',
    description: '列出死链书签（4xx/域名失效/证书错误等），可按域名过滤。适用：「帮我看看哪些链接死了」「某域名下的死链有哪些」。清理用 dig_remove（要先与用户确认）。',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '域名子串过滤' },
        limit: { type: 'integer', description: '最多返回几条（默认 15，上限 50）' },
      },
    },
    async call(args) {
      const recs = await readAllRecords();
      const dead = core.searchRecords(recs, '', { status: 'dead', domain: args.domain });
      if (!dead.length) return ok(args.domain ? `${args.domain} 下没有死链。` : '没有死链记录（可能还没体检过，用 dig_check 启动）。');
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 15));
      return ok(`死链 ${dead.length} 条（显示 ${Math.min(limit, dead.length)}）：\n${dead.slice(0, limit).map(fmtRec).join('\n')}\n\n清理：dig_remove 需要 ids + confirm:true（先与用户确认）。`);
    },
  },
  {
    name: 'dig_resurface',
    description: '从沉睡的活书签里捞一条最值得重访的（按沉睡时长×书龄加权随机），并记录本次重访。适用：「给我捞个老书签看看」「今天挖出点东西」「随机复习一下收藏」。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const recs = await readAllRecords();
      const pick = core.pickResurface(recs, {});
      if (!pick) return ok('没有可复活的活书签（先体检出存活记录，或书签库为空）。');
      const nonce = await sendCmd('visit', { id: pick.id });
      pollResult(nonce, 15000).catch(() => {});
      return ok(`今天挖出：\n\n${fmtRec(pick)}\n\n它已沉睡 ${Math.max(1, Math.round((Date.now() - Math.max(pick.lastVisitAt || 0, pick.lastResurfaceAt || 0, pick.importedAt || 0)) / 86400000))} 天——推荐给用户重访一下，并简述它可能的价值（按标题/分类/文件夹推断）。`);
    },
  },
  {
    name: 'dig_import_path',
    description: '从磁盘导入浏览器书签导出 HTML（Netscape 格式，Chrome/Edge/Firefox 通用；书签管理器→导出书签得到）。传绝对路径。导入后按设置自动开始体检。适用：用户给出书签文件路径时。',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '导出 HTML 的绝对路径' } }, required: ['path'] },
    async call(args) {
      const p = String(args.path || '').trim();
      if (!p) return err('path 必填');
      const nonce = await sendCmd('import_path', { path: p });
      const r = await pollResult(nonce, 60000);
      if (!r) return err('导入超时（60s）：后台服务可能未运行（面板「设置 → 服务管理」启动）。');
      if (!r.ok) return err(`导入失败：${r.error}`);
      const s = r.summary;
      return ok(`导入完成：解析 ${s.parsed} 条，新增 ${s.added}，更新 ${s.updated}，重复 ${s.duplicates}，无效 ${s.invalid}，跳过行 ${s.skippedLines}。体检将按设置自动开始。`);
    },
  },
  {
    name: 'dig_check',
    description: '启动书签体检运行（服务并发逐条检查链接存活性）。默认从没查过的开始；deadOnly 重查已知死链。适用：「体检一下书签」「重新查查死链」。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '本轮最多查几条（默认取设置 batchSize）' },
        deadOnly: { type: 'boolean', description: '只重查已知死链' },
      },
    },
    async call(args) {
      const runNow = await kv.kvGet(K.run).catch(() => null);
      if (runNow && runNow.queue) return ok(`已有运行进行中：${runNow.cursor}/${runNow.queue.length}。等它跑完再启动新的。`);
      const nonce = await sendCmd(args.deadOnly ? 'recheck_dead' : 'check', { limit: args.limit });
      const r = await pollResult(nonce, 20000);
      if (!r) return err('命令超时：后台服务可能未运行（面板「设置 → 服务管理」启动）。');
      if (!r.ok) return err(r.error || '启动失败');
      return ok(`体检已启动：队列 ${(r.summary.queued)} 条。进度在面板「检查」页可见，dig_stats 可查概况。`);
    },
  },
  {
    name: 'dig_remove',
    description: '删除书签（按 ids）。危险操作必须 confirm:true 且先与用户确认。通常配合 dig_dead 的清理建议使用。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: '要删除的书签 id 列表' },
        confirm: { type: 'boolean', description: '必须为 true 才执行' },
      },
      required: ['ids', 'confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('缺少 confirm:true——删除书签是危险操作，请先向用户展示清单并确认。');
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
      if (!ids.length) return err('ids 为空');
      const nonce = await sendCmd('remove', { ids, confirm: true });
      const r = await pollResult(nonce, 20000);
      if (!r) return err('命令超时：后台服务可能未运行。');
      if (!r.ok) return err(r.error || '删除失败');
      return ok(`已删除 ${r.summary.removed} 条。`);
    },
  },
  {
    name: 'dig_tag',
    description: '给书签打标签（覆盖式设置 tags）。适用：用户要求整理/归档某批书签时。先用 dig_search 拿 id，再打标签。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: '书签 id 列表' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签（最多 8 个）' },
      },
      required: ['ids', 'tags'],
    },
    async call(args) {
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
      const tags = Array.isArray(args.tags) ? args.tags.map(String).slice(0, 8) : [];
      if (!ids.length || !tags.length) return err('ids 与 tags 都必填');
      const nonce = await sendCmd('tag', { ids, tags });
      const r = await pollResult(nonce, 20000);
      if (!r) return err('命令超时：后台服务可能未运行。');
      if (!r.ok) return err(r.error || '打标失败');
      return ok(`已给 ${r.summary.tagged} 条打上标签：${tags.join(', ')}`);
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
