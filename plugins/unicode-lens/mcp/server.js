#!/usr/bin/env node
'use strict';
/**
 * unicode-lens MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。扫描/清洗/报告引擎见 shared/unicode-core.js
 * （单一权威，零 node 依赖）。纯本地检测，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 四工具（前缀 ulens_）：
 *   scan          全量安检：隐形注入载体 + 同形字 + 混排 + 归一化，中文分级报告
 *   scrub         清洗：删隐形注入载体/控制字符，NBSP→空格，可选同形字映射回 ASCII + NFC
 *   char_info     逐字符解释（≤32 个 code point）：codepoint/名称/类别/风险/清洗策略
 *   confusables   同形混淆专项（用户名/域名/代码标识符场景）：同形字 + 混排 + NFC
 */
const fs = require('fs');
const core = require('../shared/unicode-core');

const SERVER_NAME = 'unicode-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const TEXT_CAP = 512 * 1024;
const FILE_CAP = 512 * 1024;
const SCRUB_ECHO_LIMIT = 8 * 1024; // 内联回显清洗结果的上限（超出建议用 outPath 落盘）

/** 统一取文本：优先内联文本，其次文件路径（node 侧读取）。field=内联字段名，pathField=路径字段名（默认 filePath） */
function loadSource(args, field = 'text', pathField = 'filePath') {
  if (typeof args[field] === 'string' && args[field]) {
    return { text: args[field], source: `内联 ${field}` };
  }
  if (typeof args[pathField] === 'string' && args[pathField]) {
    const p = String(args[pathField]);
    let st;
    try { st = fs.statSync(p); } catch (_) { return { error: `文件不存在或不可读：${p}` }; }
    if (st.size > FILE_CAP) return { error: `文件过大（${st.size} 字节 > ${FILE_CAP} 字节），请检查是否指错文件或分段处理` };
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return { error: `读取失败：${e.message}` }; }
    return { text, source: p };
  }
  return { error: `缺少 ${field}（内联文本）或 ${pathField}（文件路径）之一` };
}

const tools = [
  {
    name: 'ulens_scan',
    description: 'Unicode 全量安检：检出隐形注入载体（双向控制字符/Trojan Source、Unicode Tag 隐形标签——人眼不可见但 LLM 可读的提示词注入载体、零宽字符、不可见填充、变体选择符、控制字符）、同形异码字（西里尔/希腊/全角/数学变体）、混合文字系统混排、NFC 未归一化与编码损坏标志（U+FFFD）。输出中文分级报告（高危/中危/提示）与处置建议。给 AI 审查提示词、代码文件、用户输入前先安检用。支持内联 text 或 filePath。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待扫描文本（内联）' },
        filePath: { type: 'string', description: '待扫描文件路径（与 text 二选一；按 UTF-8 读取）' },
      },
    },
    async call(args) {
      const src = loadSource(args);
      if (src.error) return err(src.error);
      if (src.text.length > TEXT_CAP) return err('文本超 512KB，请分段扫描');
      let scan;
      try { scan = core.scanText(src.text); } catch (e) { return err(`扫描失败：${e.message}`); }
      return ok(`${core.renderReport(scan)}\n\n（扫描源：${src.source}）`);
    },
  },
  {
    name: 'ulens_scrub',
    description: '清洗文本中的隐形 Unicode 风险：删除双向控制字符/Tag 隐形标签/零宽字符/不可见填充/变体选择符/控制字符/孤立零宽连接符（emoji 序列中的 ZWJ 自动保留），NBSP 等异常空白替换为普通空格（全角空格默认保留）。可选：fixHomoglyph=true 把同形异码字映射回 ASCII；nfcNormalize=true 统一 NFC；dropPua=true 删私有区字符。默认只删不改语义（同形字默认仅报告）。可用 outPath 落盘清洗结果（覆盖已有文件需 overwrite=true）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待清洗文本（内联）' },
        filePath: { type: 'string', description: '待清洗文件路径（与 text 二选一；按 UTF-8 读取）' },
        fixHomoglyph: { type: 'boolean', description: '同形异码字映射回 ASCII（默认 false 仅报告）' },
        nfcNormalize: { type: 'boolean', description: 'NFC 归一化（默认 false）' },
        dropPua: { type: 'boolean', description: '删除私有使用区字符（默认 false）' },
        keepIdeographicSpace: { type: 'boolean', description: '保留全角空格（默认 true；false 时替换为普通空格）' },
        outPath: { type: 'string', description: '清洗结果写出路径（可选；覆盖已有文件须 overwrite=true）' },
        overwrite: { type: 'boolean', description: 'outPath 已存在时是否覆盖（默认 false）' },
      },
    },
    async call(args) {
      const src = loadSource(args);
      if (src.error) return err(src.error);
      if (src.text.length > TEXT_CAP) return err('文本超 512KB，请分段清洗');
      let result;
      try {
        result = core.scrubText(src.text, {
          fixHomoglyph: args.fixHomoglyph === true,
          nfcNormalize: args.nfcNormalize === true,
          dropPua: args.dropPua === true,
          keepIdeographicSpace: args.keepIdeographicSpace !== false,
        });
      } catch (e) { return err(`清洗失败：${e.message}`); }

      const lines = [];
      lines.push(result.changed ? '清洗完成，文本已变更。' : '清洗完成：未发现需清洗内容，文本原样。');
      const del = Object.entries(result.deleted).map(([k, v]) => `${core.CATS[k] ? core.CATS[k].title : k}×${v}`);
      const rep = Object.entries(result.replaced).map(([k, v]) => `${core.CATS[k] ? core.CATS[k].title : k}×${v}`);
      if (del.length) lines.push(`删除：${del.join('、')}`);
      if (rep.length) lines.push(`替换：${rep.join('、')}`);
      if (result.homoglyphFixed) lines.push(`同形字映射回 ASCII：${result.homoglyphFixed} 处`);
      if (result.normalized) lines.push('已做 NFC 归一化。');

      let outNote = '';
      if (typeof args.outPath === 'string' && args.outPath) {
        const outPath = String(args.outPath);
        try {
          const exists = fs.existsSync(outPath);
          if (exists && args.overwrite !== true) return err(`输出文件已存在：${outPath}（覆盖需 overwrite=true）`);
          fs.writeFileSync(outPath, result.cleaned, 'utf8');
          outNote = `清洗结果已写出：${outPath}（${Buffer.byteLength(result.cleaned, 'utf8')} 字节）`;
        } catch (e) {
          return err(`写出失败：${e.message}`);
        }
        lines.push(outNote);
      } else if (result.changed) {
        if (result.cleaned.length <= SCRUB_ECHO_LIMIT) {
          lines.push('');
          lines.push('清洗后文本：');
          lines.push(result.cleaned);
        } else {
          lines.push('');
          lines.push(`清洗后文本过长（${result.cleaned.length} 字符），仅回显前 ${SCRUB_ECHO_LIMIT} 字符预览（建议用 outPath 落盘获取全文）：`);
          lines.push(core.truncate(result.cleaned, SCRUB_ECHO_LIMIT));
        }
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ulens_char_info',
    description: '逐字符解释（最多 32 个 code point）：codepoint、名称、风险类别、中文说明与清洗策略。用于查单个可疑字符「这是什么、为什么危险、怎么处理」。',
    inputSchema: {
      type: 'object',
      properties: {
        chars: { type: 'string', description: '待解释的字符（1–32 个 code point，多余截断计数）' },
      },
      required: ['chars'],
    },
    async call(args) {
      if (typeof args.chars !== 'string' || !args.chars) return err('缺少 chars（待解释字符）');
      let info;
      try { info = core.charInfo(args.chars); } catch (e) { return err(`解释失败：${e.message}`); }
      const lines = [`共 ${info.total} 个 code point${info.truncated ? '（仅解释前 32 个）' : ''}：`];
      for (const it of info.items) {
        lines.push(`- ${it.cp} ${it.char === '\n' ? '⏎' : it.char}｜${it.catTitle}｜${it.name}｜风险: ${it.risk === 'none' ? '无' : it.risk}`);
        lines.push(`  ${it.desc} 清洗策略: ${it.scrub}${it.suggest ? `（建议替换为 "${it.suggest}"）` : ''}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ulens_confusables',
    description: '同形混淆专项检查（用户名/域名/代码标识符/账号名场景）：检出与 ASCII 视觉等价的西里尔/希腊/全角/数学变体字符、混合文字系统混排行、NFC 未归一化序列。不含隐形字符检测（那是 ulens_scan 的职责）。支持内联 text 或 filePath。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待检文本（内联）' },
        filePath: { type: 'string', description: '待检文件路径（与 text 二选一）' },
      },
    },
    async call(args) {
      const src = loadSource(args);
      if (src.error) return err(src.error);
      if (src.text.length > TEXT_CAP) return err('文本超 512KB，请分段');
      let scan;
      try { scan = core.scanText(src.text); } catch (e) { return err(`检查失败：${e.message}`); }
      return ok(`${core.renderConfusablesReport(scan)}\n\n（检查源：${src.source}）`);
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（纯本地检测，无宿主依赖）`);
