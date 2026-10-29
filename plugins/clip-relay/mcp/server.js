#!/usr/bin/env node
'use strict';
/**
 * clip-relay MCP Server —— 文本接力的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 relay.* 键空间的读写。条目规范化与推送是本进程直接完成（写路径与
 * 面板同构、normalizeItem 同规则）；URL 标题补全由后台服务异步执行
 * （外网抓取下沉服务，无跨域限制）——推送后条目先显示 URL，几秒内补上标题。
 *
 * 工具一览：
 *   relay_push   推送文本/链接到所有设备的文本接力（"把这个链接发到我手机上"）
 *   relay_list   看板上的条目（可过滤、限条数）
 *   relay_read   读某条全文（按 id）
 *   relay_clear  清空整块板子（必须 confirm:true）
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const lib = require('../service/lib');

const SERVER_NAME = 'clip-relay';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const ITEM_PREFIX = 'relay.item.';
const K = {
  meta: 'relay.meta',
  readAt: 'relay.readAt',
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

async function listItems() {
  const keys = await kv.kvKeys();
  const itemKeys = keys.filter((k) => k.startsWith(ITEM_PREFIX));
  const items = await Promise.all(itemKeys.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' ? v : null;
  }));
  return items.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function fmtItem(it, withFull) {
  const time = new Date(it.createdAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const head = it.kind === 'url'
    ? `${it.title || oneLine(it.url, 80)}${it.desc ? ` — ${oneLine(it.desc, 100)}` : ''}`
    : oneLine(it.text, withFull ? 4000 : 120);
  // URL 条目已抓到标题时补原始链接行（relay_read 要能取回完整 URL）
  const urlLine = it.kind === 'url' && it.title && it.url ? `\n   ${it.url}` : '';
  return `[${it.id}]${it.pinned ? '📌' : ''}${it.kind === 'url' ? '🔗' : '📝'} (${it.from} · ${time})\n   ${head}${urlLine}`;
}

const tools = [
  {
    name: 'relay_push',
    description: '把一段文本或一个链接推送到文本接力（clip-relay），用户在手机/桌面/Web 打开 Polaris「文本接力」面板即可一键复制。适用：「把这个链接发到我手机上」「把这段报错栈推过去」「记个口令到文本接力」。链接会由后台服务自动抓取网页标题摘要（几秒内补全）。单条上限 8000 字符。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要推送的内容（纯文本或单个 http(s) URL）' },
        from: { type: 'string', description: '来源标签（默认 AI）' },
      },
      required: ['text'],
    },
    async call(args) {
      const id = 'i' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const r = lib.normalizeItem({ ...args, id, from: args.from || 'AI', createdAt: Date.now() });
      if (r.error) return err(r.error);
      const it = r.item;
      await kv.kvSet(ITEM_PREFIX + it.id, it);
      const kindHint = it.kind === 'url' ? '链接条目，后台服务正在抓取标题摘要（几秒后面板刷新可见）' : '文本条目';
      return ok(`已推送到文本接力（${kindHint}）：\n${fmtItem(it)}\n所有设备打开「文本接力」面板即可看到并一键复制。`);
    },
  },
  {
    name: 'relay_list',
    description: '列出文本接力上的条目（最新在前，置顶优先展示），可按内容子串过滤。用于「我之前往文本接力发过什么」「看看板子上有没有那个链接」。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '内容子串过滤（大小写不敏感）' },
        limit: { type: 'integer', description: '最多返回几条（默认 15，上限 50）' },
      },
    },
    async call(args) {
      let items = await listItems();
      const f = String(args.filter || '').trim().toLowerCase();
      if (f) items = items.filter((it) => (it.text || '').toLowerCase().includes(f) || (it.title || '').toLowerCase().includes(f));
      if (!items.length) return ok(f ? `文本接力上没有匹配「${args.filter}」的条目。` : '文本接力是空的（面板或 relay_push 可推送）。');
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 15));
      const shown = [...items.filter((it) => it.pinned), ...items.filter((it) => !it.pinned)].slice(0, limit);
      return ok(`文本接力共 ${items.length} 条（显示 ${shown.length} 条，置顶优先）：\n${shown.map((it) => fmtItem(it)).join('\n')}`);
    },
  },
  {
    name: 'relay_read',
    description: '按 id 读文本接力某条的完整内容（relay_list 可查 id）。用于条目被列表截断后取全文。',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '条目 id' } }, required: ['id'] },
    async call(args) {
      const it = await kv.kvGet(ITEM_PREFIX + args.id).catch(() => null);
      if (!it || typeof it !== 'object') return err(`未找到条目 ${args.id}（relay_list 可查 id）`);
      return ok(fmtItem(it, true) + (it.enrichFail ? `\n（标题抓取失败：${it.enrichFail}）` : ''));
    },
  },
  {
    name: 'relay_clear',
    description: '清空文本接力全部条目（含置顶，危险操作，必须 confirm:true）。',
    inputSchema: {
      type: 'object',
      properties: { confirm: { type: 'boolean', description: '必须为 true 才执行' } },
      required: ['confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('缺少 confirm:true——清空整块板子是危险操作，请先与用户确认。');
      const items = await listItems();
      for (const it of items) await kv.kvDel(ITEM_PREFIX + it.id).catch(() => {});
      await kv.kvDel(K.readAt).catch(() => {});
      return ok(`已清空文本接力（删除 ${items.length} 条）。`);
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

