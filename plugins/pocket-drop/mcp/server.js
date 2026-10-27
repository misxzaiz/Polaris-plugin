#!/usr/bin/env node
'use strict';
/**
 * server.js —— 口袋快传 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层：把 tools/call 翻译成 cap.kv 命令键（服务消费，先删后做）+
 * 读状态键。数据面与面板/服务共享 pdrop.* 键空间（权威键表见 README）。
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 */
const crypto = require('crypto');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[pocket-drop:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 工具实现 ───────────────────────────────────────────────────────────────
/** 写命令键 → 轮询结果键（服务 tick 4s，轮询 15s 足够） */
async function sendCommand(op, payload, timeoutMs) {
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const resultKey = `pdrop.result.${nonce}`;
  await kv.kvSet(`pdrop.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    const r = await kv.kvGet(resultKey).catch(() => null);
    if (r && typeof r === 'object') {
      await kv.kvDel(resultKey).catch(() => {});
      return r;
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  return { ok: false, error: '服务未在 15 秒内响应（可能未运行：去 设置→插件→口袋快传 看服务状态）' };
}

async function readItems() {
  const v = await kv.kvGet('pdrop.items').catch(() => null);
  return v && Array.isArray(v.items) ? v.items : null;
}

async function toolDropSend(args) {
  const r = await sendCommand('send', { path: args.path, note: args.note });
  if (!r.ok) return { text: `投递失败：${r.error}`, isError: true };
  return { text: `已投递「${r.name}」到快传区（id=${r.itemId}）。手机在投递列表即可下载；链接与二维码见「口袋快传」面板。` };
}

async function toolDropList() {
  const items = await readItems();
  if (items === null) return { text: '读取投递区失败：服务可能未运行（去 设置→插件→口袋快传 看服务状态）', isError: true };
  if (!items.length) return { text: '投递区当前为空。' };
  const now = Date.now();
  const lines = items
    .slice()
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .map((it) => {
      const from = it.from === 'phone' ? '手机' : it.from === 'desktop' ? '面板' : 'AI';
      const ttl = core.ttlLabel(it.expiresAt, now);
      return `- id=${it.id} | ${it.name} | ${core.formatBytes(it.size)} | 来自${from} | ${ttl ? `剩 ${ttl}` : '即将清理'}${it.note ? ` | 备注:${oneLine(it.note, 60)}` : ''}`;
    });
  return { text: `投递区共 ${items.length} 条：\n${lines.join('\n')}` };
}

async function toolDropSave(args) {
  const r = await sendCommand('save', { id: args.id, dest: args.dest, confirm: args.confirm === true });
  if (!r.ok) return { text: `保存失败：${r.error}`, isError: true };
  return { text: `已保存「${r.name}」→ ${r.dest}` };
}

async function toolDropClear(args) {
  if (args.confirm !== true) {
    return {
      text: '清空投递区会删除全部投递文件（含手机端还没下载的），不可恢复。请与用户确认后传 confirm:true 重试。',
      isError: true,
    };
  }
  const r = await sendCommand('clear', { confirm: true });
  if (!r.ok) return { text: `清空失败：${r.error}`, isError: true };
  return { text: `已清空投递区（${r.count} 条）。` };
}

async function toolDropStatus() {
  const meta = await kv.kvGet('pdrop.meta').catch(() => null);
  const settings = await kv.kvGet('pdrop.settings').catch(() => null);
  if (!meta || typeof meta !== 'object') {
    return { text: '服务未上线（没有心跳）。请到 设置→插件→口袋快传 查看服务状态并启动。', isError: true };
  }
  const age = Math.round((Date.now() - (meta.lastTickAt || 0)) / 1000);
  const s = core.normalizeSettings(settings);
  const lines = [
    `服务: v${meta.version} pid=${meta.pid} ${meta.degraded ? '（bridge 降级：文件收发不受影响）' : '正常'}`,
    `心跳: ${age <= 90 ? `${age} 秒前` : `${Math.round(age / 60)} 分钟前（可能已停止）`}`,
    `端口: ${meta.port} | 局域网入口: ${meta.lanUrl || '未检测到'}`,
    `存储: ${meta.dropDir || '未知'}（当前 ${meta.itemCount || 0} 条 / ${core.formatBytes(meta.storeBytes || 0)}）`,
    `设置: TTL ${s.ttlHours}h · 单文件 ${s.maxSizeMb}MB · 总容量 ${s.totalCapMb}MB · PIN 长度 ${s.pin ? s.pin.length : '未设置'}`,
  ];
  return { text: lines.join('\n') };
}

// ── 工具声明（description 写「适用句式」，AI 靠它匹配意图）─────────────────
const TOOLS = [
  {
    name: 'drop_send',
    description: '把电脑上的一个文件投到「口袋快传」，用户在手机上打开口袋快传页面即可下载。适用：「把 D:\\reports\\报表.xlsx 传到我手机」「刚生成的 PDF 发到手机上」「把这个文件给手机」。path 必须是本机存在的文件绝对路径。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要投递的本机文件绝对路径' },
        note: { type: 'string', description: '可选备注（≤200 字），会显示在手机列表' },
      },
      required: ['path'],
    },
    run: toolDropSend,
  },
  {
    name: 'drop_list',
    description: '列出「口袋快传」投递区当前的全部文件（含手机刚上传的）。适用：「我手机传了什么」「看看快传区有什么」「刚传的照片在哪」。返回 id 供 drop_save / drop_clear 使用。',
    inputSchema: { type: 'object', properties: {} },
    run: toolDropList,
  },
  {
    name: 'drop_save',
    description: '把投递区里的一个文件（通常是手机上传的）保存到电脑指定绝对路径。适用：「把我手机传的照片存到工作区」「把 drop_list 里那个文件存下来」。覆盖已存在文件需要 confirm:true。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '投递条目 id（来自 drop_list）' },
        dest: { type: 'string', description: '保存目标的绝对路径（文件完整路径，不是目录）' },
        confirm: { type: 'boolean', description: '目标文件已存在时是否覆盖（默认否）' },
      },
      required: ['id', 'dest'],
    },
    run: toolDropSave,
  },
  {
    name: 'drop_clear',
    description: '清空「口袋快传」投递区的全部文件（不可恢复，危险操作需 confirm）。适用：「清空快传」「把传完的都删了」。',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: '必须显式传 true 才会执行' },
      },
      required: ['confirm'],
    },
    run: toolDropClear,
  },
  {
    name: 'drop_status',
    description: '查看「口袋快传」服务状态：是否运行、局域网入口地址、存储目录与占用、TTL/容量设置。适用：「快传服务在跑吗」「手机怎么访问快传」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolDropStatus,
  },
];

// ── JSON-RPC stdio 主循环 ──────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handle(msg).catch((e) => {
      slog(`handle error: ${e.stack || e.message}`);
      if (msg && msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: '内部错误' } });
    });
  }
});

async function handle(msg) {
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'pocket-drop', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    try {
      const r = await tool.run(args);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: oneLine(r.text, 4000) }], isError: r.isError === true },
      });
    } catch (e) {
      slog(`tool ${name} 抛错: ${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `执行异常：${e.message}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

slog(`pocket-drop mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
