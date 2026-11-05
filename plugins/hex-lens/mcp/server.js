#!/usr/bin/env node
'use strict';
/**
 * 文件魔数透视台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 引擎见 shared/hex-core.js（单一权威，零 node 依赖，只读不改文件）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 两工具（前缀 hexlens_）：
 *   inspect  识别文件真实类型（魔数+扩展名一致性+熵+头部 dump，只读头 4KB）
 *   dump     指定偏移与长度的 hex dump 切片
 */
const fs = require('fs');
const core = require('../shared/hex-core');

const SERVER_NAME = 'hex-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const HEAD_CAP = 4 * 1024;
const SLICE_CAP = 16 * 1024;

/** 读文件头部（只读，头 4KB） */
function readHead(path) {
  let st;
  try { st = fs.statSync(path); } catch (_) { return { error: `文件不存在或不可读：${path}` }; }
  if (!st.isFile()) return { error: `不是普通文件：${path}` };
  const fd = fs.openSync(path, 'r');
  try {
    const buf = Buffer.alloc(Math.min(HEAD_CAP, st.size));
    if (buf.length) fs.readSync(fd, buf, 0, buf.length, 0);
    return { buf, size: st.size };
  } finally { fs.closeSync(fd); }
}

/** 判定内容像纯文本（可读 ASCII/UTF-8 占比高） */
function isTextLike(buf) {
  if (!buf.length) return false;
  let printable = 0;
  for (const b of buf) if ((b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d || b === 0x09) printable++;
  return printable / buf.length > 0.9;
}

const tools = [
  {
    name: 'hexlens_inspect',
    description: '识别文件真实类型：魔数（magic number）匹配 20+ 常见格式签名，扩展名与实际类型不符时警告（伪装扩展名检测）；熵概览（高熵=已压缩或加密的典型特征）+ 头部 hex dump。只读头 4KB，不修改文件。诊断「扩展名骗人」「文件打不开」类问题。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径' } },
      required: ['path'],
    },
    async call(args) {
      const p = args && args.path;
      if (typeof p !== 'string' || !p.trim()) return err('缺少 path');
      const head = readHead(String(p).trim());
      if (head.error) return err(head.error);
      const hits = core.identifyMagic(head.buf);
      const r = {
        filename: String(p).trim().split(/[\/]/).pop(),
        size: head.size,
        readBytes: head.buf.length,
        entropy: core.shannonEntropy(head.buf),
        hits,
        isTextLike: isTextLike(head.buf),
        extWarning: core.extConsistency(hits, String(p)).warning,
        headDump: core.hexDump(core.slice(head.buf, 0, 128)),
      };
      return ok(core.renderInspectReport(r));
    },
  },
  {
    name: 'hexlens_dump',
    description: '文件指定偏移与长度的 hex dump 切片（偏移/HEX/ASCII 侧栏，xxd 风格）。上限 16KB/次。配合 hexlens_inspect 定位到可疑偏移后细看。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        offset: { type: 'integer', description: '起始偏移（字节，缺省 0）' },
        length: { type: 'integer', description: '长度（字节，缺省 256，上限 16384）' },
      },
      required: ['path'],
    },
    async call(args) {
      const p = args && args.path;
      if (typeof p !== 'string' || !p.trim()) return err('缺少 path');
      let st;
      try { st = fs.statSync(String(p).trim()); } catch (_) { return err(`文件不存在或不可读：${p}`); }
      const fd = fs.openSync(String(p).trim(), 'r');
      try {
        const offset = Math.max(0, Number(args && args.offset) || 0);
        const length = Math.max(1, Math.min(Number(args && args.length) || 256, 16 * 1024));
        const clamped = Math.min(length, Math.max(0, st.size - offset));
        if (clamped <= 0) return err(`偏移 ${offset} 超出文件大小（${st.size} 字节）`);
        const buf = Buffer.alloc(clamped);
        fs.readSync(fd, buf, 0, clamped, offset);
        return ok(`偏移 ${offset} 起 ${clamped} 字节：\n${core.hexDump(buf, offset)}`);
      } finally { fs.closeSync(fd); }
    },
  },
];

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（只读魔数/dump，纯本地无宿主依赖）`);
