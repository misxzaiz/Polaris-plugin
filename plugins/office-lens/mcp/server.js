#!/usr/bin/env node
'use strict';
/**
 * Office 文档透视台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 提取引擎见 shared/core.js（单一权威，零依赖，面板/MCP 同源）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 olens_）：
 *   extract  Office 文档（docx/pptx/xlsx）→ Markdown（xlsx 可选 sheet/CSV）
 *   outline  概览：docx 标题树 / pptx 标题列表 / xlsx sheet 清单（不产全文）
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/core');

const SERVER_NAME = 'office-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/** 规整路径：剥 file:// 前缀 + URL 解码 + 展开 ~ */
function normalizePath(raw) {
  let p = String(raw || '').trim();
  if (p.startsWith('file://')) {
    p = p.slice(7).replace(/^\/([A-Za-z]:)/, '$1');
    try { p = decodeURIComponent(p); } catch (_) { /* 保留原样 */ }
  }
  if (p === '~' || p.startsWith('~/')) {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    if (home) p = path.join(home, p.slice(1));
  }
  return p;
}

async function loadFile(filePath) {
  const p = normalizePath(filePath);
  if (!p) throw new Error('缺少文件路径（filePath 必填）');
  let st;
  try { st = fs.statSync(p); } catch (_) { throw new Error(`文件不存在或不可读：${p}`); }
  if (!st.isFile()) throw new Error(`路径不是文件：${p}`);
  if (st.size > core.LIMITS.MAX_FILE_BYTES) {
    throw new Error(`文件 ${(st.size / 1048576).toFixed(1)}MB 超上限 100MB`);
  }
  return { bytes: fs.readFileSync(p), resolvedPath: p };
}

function preface(r) {
  const bits = [r.format.toUpperCase()];
  if (r.stats) {
    if (r.stats.words != null) bits.push(`约 ${r.stats.words} 字`);
    if (r.stats.slides != null) bits.push(`幻灯片 ${r.stats.slides}`);
    if (r.stats.tables != null) bits.push(`表格 ${r.stats.tables}`);
    if (r.stats.rows != null) bits.push(`${r.stats.rows} 行 × ${r.stats.cols} 列`);
    if (r.stats.ms != null) bits.push(`${r.stats.ms}ms`);
  }
  const lines = [`[office-lens] ${bits.join('｜')}`];
  if (r.warnings && r.warnings.length) for (const w of r.warnings) lines.push(`[注意] ${w}`);
  return lines.join('\n');
}

const tools = [
  {
    name: 'olens_extract',
    description: '把本地 Office 文档提取为 Markdown：docx（标题/粗斜体/链接/多级列表/表格/脚注）、pptx（每页标题+正文+演讲者备注+表格）、xlsx（单元格值/日期自动识别/公式缓存值/多工作表，可选 CSV 输出）。先 outline 看结构再整提更稳；xlsx 用 sheet 参数选工作表。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '文档绝对路径（支持 file:// 与 ~）' },
        sheet: { type: 'string', description: 'xlsx 专用：工作表名称或 1 起序号；缺省取第一个' },
        csv: { type: 'boolean', description: 'xlsx 专用：true 时输出 CSV 而非 Markdown 表格' },
      },
      required: ['filePath'],
    },
    async call(args) {
      const { bytes } = await loadFile(args && args.filePath);
      const r = await core.extractAuto(bytes, { sheet: args.sheet, csv: !!args.csv });
      const md = r.markdown.length > core.LIMITS.MAX_OUTPUT_CHARS
        ? r.markdown.slice(0, core.LIMITS.MAX_OUTPUT_CHARS) + `\n\n---\n（输出已截断：原始 ${r.markdown.length} 字符；xlsx 可用 sheet 参数缩小范围）`
        : r.markdown;
      return ok(`${preface(r)}\n\n${md}`);
    },
  },
  {
    name: 'olens_outline',
    description: 'Office 文档概览（不产全文）：docx 返回标题树、pptx 返回每页标题列表、xlsx 返回工作表清单（名称+行列数+首行预览）。用于先判断文档结构，再决定提取策略。',
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string', description: '文档绝对路径' } },
      required: ['filePath'],
    },
    async call(args) {
      const { bytes } = await loadFile(args && args.filePath);
      const o = await core.outlineAuto(bytes);
      return ok(`[office-lens] ${o.format.toUpperCase()} 概览\n\n${o.text}`);
    },
  },
];

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
    try { msg = JSON.parse(line); } catch (e) {
      log('warn', '非 JSON 行已丢弃: ' + e.message);
      continue;
    }
    handleMessage(msg).catch((e) => log('error', 'handle: ' + (e && e.stack || e)));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method } = msg;
  const reply = (result) => {
    if (id != null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  };
  const replyErr = (code, message) => {
    if (id != null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
  };
  try {
    if (method === 'initialize') {
      reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    } else if (method === 'notifications/initialized') {
      // 无需响应
    } else if (method === 'tools/list') {
      reply({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    } else if (method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const tool = tools.find((t) => t.name === name);
      if (!tool) { replyErr(-32602, `未知工具: ${name}`); return; }
      try {
        const result = await tool.call(args);
        reply(result);
      } catch (e) {
        log('warn', `tools/call ${name}: ${e.message}`);
        reply(err(`office-lens: ${e.message}`));
      }
    } else if (method === 'ping') {
      reply({});
    } else if (id != null) {
      replyErr(-32601, `未知方法: ${method}`);
    }
  } catch (e) {
    replyErr(-32603, e.message);
  }
}

process.on('uncaughtException', (e) => log('error', 'uncaught: ' + (e && e.stack || e)));
log('info', `office-lens MCP server 启动 (v${SERVER_VERSION})`);
