#!/usr/bin/env node
'use strict';
/**
 * CSV 检查台 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js
 * 解析引擎见 shared/csv-core.js（单一权威，纯函数零 require）；
 * 文件读取（filePath 入口）收敛在本文件单侧（core 保持零 IO 可进面板 bundle）。
 * 纯本地，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 四工具（前缀 csv_lens_）：parse / infer / convert / normalize。
 * 每工具 text 与 filePath 双入口、二选一显式报错（参数一义，一参一含义）。
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/csv-core');

const SERVER_NAME = 'csv-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB 上限护栏（与需求边界一致）

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/**
 * text / filePath 双入口归一化。二选一；都传或都不传都显式报错（不猜）。
 * filePath 分支按 UTF-8 读（BOM 处理交给 core），超 10MB 拒绝。
 */
function readInput(args) {
  const hasText = typeof args.text === 'string';
  const hasFile = typeof args.filePath === 'string';
  if (hasText === hasFile) {
    return { ok: false, error: '参数 text 与 filePath 必须二选一（都传或都不传均不接受）' };
  }
  if (hasFile) {
    const p = path.resolve(args.filePath);
    let st;
    try { st = fs.statSync(p); } catch (_) { return { ok: false, error: `文件不存在或不可访问：${args.filePath}` }; }
    if (!st.isFile()) return { ok: false, error: `不是常规文件：${args.filePath}` };
    if (st.size > MAX_INPUT_BYTES) return { ok: false, error: `文件 ${(st.size / 1048576).toFixed(1)}MB 超过 10MB 上限（边界：不做大文件流式解析）` };
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return { ok: false, error: `读取失败：${e.message}` }; }
    return { ok: true, text, source: args.filePath };
  }
  return { ok: true, text: args.text, source: null };
}

/** delimiter 参数归一：支持 '\\t' 两个字符的字面写法与真实制表符，空/缺省走自动检测? 不——parse 主链路 delimiter 缺省=逗号，自动检测在 parse 报告里以建议形式给出 */
function normDelimiter(args) {
  if (args.delimiter === undefined || args.delimiter === null || args.delimiter === '') return undefined;
  if (typeof args.delimiter !== 'string') return undefined;
  if (args.delimiter === '\\t') return '\t';
  if (args.delimiter.length === 1) return args.delimiter;
  return { __invalid: args.delimiter };
}

function parseFrom(args) {
  const input = readInput(args);
  if (!input.ok) return input;
  const delim = normDelimiter(args);
  if (typeof delim === 'object' && delim !== null && delim.__invalid) {
    return { ok: false, error: `delimiter 必须是单字符（收到「${delim.__invalid}」）；制表符写 \\t` };
  }
  const r = core.parseCsv(input.text, { delimiter: delim });
  const auto = core.detectDelimiter(input.text);
  return { ok: true, r, auto, source: input.source };
}

const tools = [
  {
    name: 'csv_lens_parse',
    description: '解析 CSV 并诊断：RFC 4180 状态机解析（引号内逗号/换行/""转义），定位裸引号/引号后尾随字符/未闭合引号/列数漂移行（带行号），报告分隔符、换行风格、BOM、空行与自动检测建议。调试「CSV 导入失败不知道哪坏了」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'CSV 文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: 'CSV 文件路径（与 text 二选一，UTF-8 读取，≤10MB）' },
        delimiter: { type: 'string', description: '可选，单字符分隔符，缺省逗号；制表符写 \\t' },
      },
    },
    async call(args) {
      const p = parseFrom(args);
      if (!p.ok) return err(p.error);
      const { r, auto } = p;
      let report = core.renderParseReport(r);
      if (!args.delimiter && auto.detected !== r.delimiter) {
        report += `\n[提示] 分隔符自动检测建议「${auto.detected === '\t' ? '\\t' : auto.detected}」（引号外计数 ${JSON.stringify(auto.counts)}）——若当前解析列数异常可用 delimiter 参数重试`;
      }
      const headPreview = r.rows.slice(0, 3).map((row) => '  ' + JSON.stringify(row)).join('\n');
      return ok(`${report}\n\n前 3 行解析预览：\n${headPreview}${p.source ? `\n（来源文件：${p.source}）` : ''}`);
    },
  },
  {
    name: 'csv_lens_infer',
    description: 'CSV 逐列类型推断与统计：每列判定 int/float/bool/date/string/mixed/empty，附类型分布、空值计数与数字列 min/max/sum。判断「哪列脏了」「主键列是否唯一」类问题前先跑这个。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'CSV 文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: 'CSV 文件路径（与 text 二选一）' },
        delimiter: { type: 'string', description: '可选，单字符分隔符，缺省逗号；制表符写 \\t' },
      },
    },
    async call(args) {
      const p = parseFrom(args);
      if (!p.ok) return err(p.error);
      const inf = core.inferColumns(p.r.rows);
      if (!inf.ok) return err(inf.error);
      let report = core.renderInferReport(inf);
      if (p.r.hasError) report += '\n[提示] 解析存在结构性错误（见 parse 工具），推断口径基于容错解析结果';
      return ok(report + (p.source ? `\n（来源文件：${p.source}）` : ''));
    },
  },
  {
    name: 'csv_lens_convert',
    description: 'CSV 转换输出：json_records（对象数组，表头为键，重名表头自动加后缀并标注）/ json_rows（二维数组）/ sql（INSERT 语句，数字布尔按推断裸值，字符串转义，空→NULL）/ markdown（管道表）。只读转换不修改原文件。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'CSV 文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: 'CSV 文件路径（与 text 二选一）' },
        delimiter: { type: 'string', description: '可选，单字符分隔符，缺省逗号；制表符写 \\t' },
        format: { type: 'string', enum: ['json_records', 'json_rows', 'sql', 'markdown'], description: '目标格式' },
        tableName: { type: 'string', description: '仅 sql 格式：目标表名，缺省 my_table' },
      },
      required: ['format'],
    },
    async call(args) {
      const p = parseFrom(args);
      if (!p.ok) return err(p.error);
      const fmt = args.format;
      let out;
      if (fmt === 'json_records') out = core.toJson(p.r.rows, 'records');
      else if (fmt === 'json_rows') out = core.toJson(p.r.rows, 'rows');
      else if (fmt === 'sql') out = core.toSql(p.r.rows, { tableName: args.tableName });
      else if (fmt === 'markdown') out = core.toMarkdown(p.r.rows);
      else return err(`未知 format：${fmt}（支持 json_records/json_rows/sql/markdown）`);
      if (!out.ok) return err(out.error);
      const notes = [];
      if (out.renamed && out.renamed.length > 0) {
        notes.push(`重名表头已加后缀：${out.renamed.map((x) => `第${x.index + 1}列「${x.from}」→「${x.to}」`).join('、')}`);
      }
      return ok(`${notes.length ? notes.join('；') + '\n\n' : ''}${out.output}${p.source ? `\n\n（来源文件：${p.source}）` : ''}`);
    },
  },
  {
    name: 'csv_lens_normalize',
    description: 'CSV 规范化重序列化（RFC 4180）：CRLF 换行、minimal 引号（仅含分隔符/引号/换行的字段加引号）、引号内 " 转义 ""。把 Excel 分号 CSV / 混乱引号风格洗成标准形态。只读转换不修改原文件。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'CSV 文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: 'CSV 文件路径（与 text 二选一）' },
        delimiter: { type: 'string', description: '输入侧单字符分隔符，缺省逗号；制表符写 \\t（输出恒为标准逗号 CSV）' },
      },
    },
    async call(args) {
      const p = parseFrom(args);
      if (!p.ok) return err(p.error);
      const s = core.serialize(p.r.rows);
      if (!s.ok) return err(s.error);
      // round-trip 不变式自证：规范化产物再解析，字段矩阵必须与原解析一致（不一致说明规范化有损，如实报错不输出半成品）
      const re = core.parseCsv(s.output, {});
      const same = JSON.stringify(re.rows) === JSON.stringify(p.r.rows);
      if (!same) return err('内部错误：规范化产物 round-trip 校验不一致（有损），已拦截输出');
      return ok(`规范化 CSV（RFC 4180：CRLF / minimal 引号 / "" 转义）：\n\n${s.output}${p.source ? `\n（来源文件：${p.source}）` : ''}`);
    },
  },
];

// ── stdio JSON-RPC 接线 ────────────────────────────────────────────────────

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
  if (msg.method === 'notifications/initialized') return; // 通知无 id，不回包（按 rpc 等响应会永久挂起）
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地解析，无宿主依赖）`);
