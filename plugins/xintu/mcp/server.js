#!/usr/bin/env node
'use strict';
/**
 * 心图画布 MCP Server —— AI 画布工具层（零依赖 stdio，无状态透传）
 *
 * 职责：把 AI「画到画布上」的意图翻译为 cap.kv 的 xt.* 键读写；
 * 全部校验/试算/布局/导出走 shared/canvas-core.js（与面板同一权威，口径不漂移）。
 * 纯本地：无网络请求、无 shell、无 fs 写入（只经宿主 router_dispatch 落 kv）。
 *
 * 工具一览：
 *   xintu_list    列出全部画布
 *   xintu_create  新建空画布
 *   xintu_read    读整板 JSON（编辑前必读）
 *   xintu_edit    批量 op 整批原子应用（任一失败整批拒绝）
 *   xintu_delete  删除画布（需 confirm=id 防误删）
 *   xintu_export  导出 markdown 大纲
 *
 * 连接方式与 page-sentinel / pocket-ledger 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描（见 kvclient.js）
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/canvas-core.js');
const { createKvClient } = require('./kvclient.js');

const SERVER_NAME = 'xintu';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

async function kvGet(key) {
  const r = await kv.dispatchOk('cap.kv', { action: 'get', key });
  return r && r.value !== undefined ? r.value : null;
}
async function kvSet(key, value) {
  await kv.dispatchOk('cap.kv', { action: 'set', key, value: value === undefined ? null : value });
  return true;
}
async function kvDel(key) {
  await kv.dispatchOk('cap.kv', { action: 'delete', key });
  return true;
}

// ⚠️ 绝不调用 cap.kv 的 list 动作：实测在大数据根上会拖垮/打死宿主进程
// （2026-10-30 生产实例实证：一次 list 后宿主假死/崩溃）。画布清单一律走
// xt.boards 索引键（get/set 均为安全操作），索引由 create/edit/delete 维护。

// ── 画布数据访问 ───────────────────────────────────────────────────────────

/** 读板：kv 原始值 → sanitizeDoc（坏数据不炸消费方）。不存在返回 null */
async function loadBoard(id) {
  if (!core.validId(id)) return null;
  const raw = await kvGet(core.K.board(id)).catch(() => null);
  return raw ? core.sanitizeDoc(raw) : null;
}

async function loadIndex() {
  const v = await kvGet(core.K.INDEX).catch(() => null);
  return Array.isArray(v) ? v : [];
}

/** 维护 xt.boards 索引条目（与板写入同口径，LWW） */
async function refreshIndexEntry(id, doc) {
  const index = await loadIndex();
  const next = core.upsertIndex(index, core.indexEntryOf(id, doc));
  await kvSet(core.K.INDEX, next);
}

/** 清单=索引 + 逐条 loadBoard 校验（索引残条就地剔除并回写愈合） */
async function listBoards() {
  const index = await loadIndex();
  const entries = [];
  let changed = false;
  for (const e of index) {
    // eslint-disable-next-line no-await-in-loop
    const doc = e && typeof e.id === 'string' ? await loadBoard(e.id) : null;
    if (doc) {
      entries.push(core.indexEntryOf(e.id, doc));
      if (!e || e.nodeCount !== doc.nodes.length || e.title !== doc.title) changed = true;
    } else {
      changed = true;
    }
  }
  if (changed) await kvSet(core.K.INDEX, entries).catch(() => {});
  return entries;
}

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'xintu_list',
    description: '心图画布·列出全部画布（id、标题、节点/边数、更新时间）。画布是持久空间资产，用户说「画到画布上/整理成图」时先 list 看有没有可复用的板。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const entries = await listBoards();
      if (!entries.length) return ok('暂无画布。用 xintu_create 新建。');
      const lines = entries.map((e) => `[${e.id}] 《${e.title}》 节点 ${e.nodeCount} · 更新 ${fmtTime(e.updatedAt)}`);
      return ok(`共 ${entries.length} 块画布：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'xintu_create',
    description: '心图画布·新建一块空画布并返回 id。之后用 xintu_edit 落节点/连线（编辑前建议先 xintu_read 确认现状；新板可直接 edit）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: `画布标题（≤${core.LIMITS.MAX_TITLE} 字，可省略=「未命名画布」）` },
      },
    },
    async call(args) {
      const count = (await loadIndex()).length;
      if (count >= core.LIMITS.MAX_BOARDS) return err(`画布数已达上限 ${core.LIMITS.MAX_BOARDS}，请先整理（xintu_delete 删旧板）。`);
      const r = core.newBoard(args.title);
      if (r.error) return err(r.error);
      await kvSet(core.K.board(r.id), r.doc);
      await refreshIndexEntry(r.id, r.doc).catch(() => {});
      return ok(`已创建画布《${r.doc.title}》（id=${r.id}）。下一步：xintu_edit 批量落节点与连线（id 可自定，同批内先 add 再连边即可互相引用）。`);
    },
  },
  {
    name: 'xintu_read',
    description: '心图画布·读整板 JSON（rev/title/nodes/edges 全量）。编辑前必读——基于最新内容构造 ops，避免覆盖他人改动。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '画布 id（xintu_list 获得）' } },
      required: ['id'],
    },
    async call(args) {
      const doc = await loadBoard(args.id);
      if (!doc) return err(`画布不存在或已删除：${args.id}`);
      return ok(JSON.stringify(doc));
    },
  },
  {
    name: 'xintu_edit',
    description: [
      `心图画布·在画布上批量应用 op 数组（整批原子：任何一个 op 非法则整批拒绝、不写入）。`,
      `op 一律形如 { op, args }，可用：`,
      `- add_card { id?, x, y, title?, text?, color?, w?, h? } 便签卡（id 可自定，同批内即可被 add_edge 引用）`,
      `- add_note { id?, x, y, title?, text?, color?, w?, h? } 轻便签`,
      `- add_group { id?, x, y, w, h, title? } 分组框（仅视觉容器，z 在底层，移动框不带走节点）`,
      `- add_edge { id?, from, to, label? } 连线（端点必须已存在，同批先 add 即可；同向重复边拒绝）`,
      `- update_node { id, patch: { title?/text?/color? } }`,
      `- move_node { id, x, y }`,
      `- delete_node { id }（级联删相关连线）/ delete_edge { id }`,
      `- set_title { title }`,
      `- relayout { direction: 'radial'|'LR'|'TB', root? } 确定性重排（脑暴用 radial，流程/架构用 LR 或 TB）`,
      `坐标会吸附到 ${core.LIMITS.GRID}px 网格，|值| ≤ ${core.LIMITS.COORD_LIMIT}；color ∈ ${core.COLORS.join('/')}；`,
      `文字上限：title ${core.LIMITS.MAX_TITLE} 字、text ${core.LIMITS.MAX_TEXT} 字、label ${core.LIMITS.MAX_LABEL} 字；单批 ≤ ${core.LIMITS.MAX_OPS} 个 op。`,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '画布 id' },
        ops: { type: 'array', description: 'op 数组，按序应用', items: { type: 'object' } },
      },
      required: ['id', 'ops'],
    },
    async call(args) {
      const doc = await loadBoard(args.id);
      if (!doc) return err(`画布不存在或已删除：${args.id}`);
      const r = core.applyOps(doc, args.ops);
      if (r.errors && r.errors.length) {
        const e = r.errors[0];
        return err(`第 ${e.index + 1} 个 op（${e.op || '?'}）失败：${e.error}。整批已拒绝、未写入；修正后重发全部 ops。`);
      }
      await kvSet(core.K.board(args.id), r.doc);
      await refreshIndexEntry(args.id, r.doc).catch(() => {});
      return ok(`已应用 ${r.applied} 个 op，rev → ${r.doc.rev}。现 ${r.doc.nodes.length} 节点 / ${r.doc.edges.length} 边。面板轮询可见（≤5s）。`);
    },
  },
  {
    name: 'xintu_delete',
    description: '心图画布·删除整块画布（不可恢复）。为防误删，confirm 必须传画布 id 本身；删除前可先 xintu_export 留底。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '画布 id' },
        confirm: { type: 'string', description: '必须与 id 完全一致，确认删除' },
      },
      required: ['id'],
    },
    async call(args) {
      if (args.confirm !== args.id) {
        return err(`为防误删，confirm 参数必须传画布 id 本身（"${args.id}"）。如确认删除，请带上 confirm="${args.id}" 重新调用；删除前可先 xintu_export 留底。`);
      }
      const doc = await loadBoard(args.id);
      if (!doc) return err(`画布不存在或已删除：${args.id}`);
      await kvDel(core.K.board(args.id));
      const index = await loadIndex();
      await kvSet(core.K.INDEX, core.removeIndex(index, args.id));
      return ok(`已删除画布《${doc.title}》（${args.id}）。`);
    },
  },
  {
    name: 'xintu_export',
    description: '心图画布·导出画布为 markdown 大纲（分组按几何包含归档、连线列为「A → B（label）」）。适合把画布内容带回到对话里继续讨论。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '画布 id' },
        format: { type: 'string', description: '当前仅支持 markdown（默认）' },
      },
      required: ['id'],
    },
    async call(args) {
      const fmt = args.format === undefined || args.format === null ? 'markdown' : String(args.format);
      if (fmt !== 'markdown') return err(`暂只支持 format=markdown（收到：${fmt}）`);
      const doc = await loadBoard(args.id);
      if (!doc) return err(`画布不存在或已删除：${args.id}`);
      const r = core.exportMarkdown(doc);
      if (r.error) return err(r.error);
      return ok(r.markdown);
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
