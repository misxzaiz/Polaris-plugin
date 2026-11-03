'use strict';
/**
 * yaml-lens MCP server 源码（esbuild --platform=node --format=cjs bundle 到 mcp/server.js，
 * js-yaml 打入产物 → 发布 zip 零 node_modules 依赖）。
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 四工具：yaml_lens_parse / yaml_lens_lint / yaml_lens_to_json / yaml_lens_to_yaml
 */
const yaml = require('js-yaml');
const core = require('../shared/yaml-core.js');

const SERVER_INFO = { name: 'yaml-lens', version: '0.1.0' };
const PREVIEW_LIMIT = 6000; // 单文档 JSON 预览截断上限（字符）

const TOOLS = [
  {
    name: 'yaml_lens_parse',
    description:
      '解析 YAML 文本（支持多文档 ---）：返回每个文档的 JSON 预览、锚点/别名清单、文档统计。解析失败时给出 1 基行列定位、原因与修复提示（重复键/Tab 缩进/未闭合 flow/未定义别名等）。基于 js-yaml 4.1.0（YAML 1.2 core 语义）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'YAML 文本（可含多文档 ---）' },
      },
      required: ['text'],
    },
  },
  {
    name: 'yaml_lens_lint',
    description:
      'YAML 坑检测（静态扫描，不依赖解析成功）：Norway problem（unquoted no/on/off 在 YAML 1.1 实现如 PyYAML/Go-yaml/kubectl 中是布尔）、前导零八进制、六十进制 12:34:56、版本号尾零丢失 1.10→1.1、大整数精度丢失（超 2^53）、重复键、Tab 缩进、智能引号、时间戳漂移（2024-01-02 → Date）、注释吞值、键后缺空格、空值 null、锚点重复/别名未定义。每条给严重度/行列/说明/修复建议。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'YAML 文本' },
      },
      required: ['text'],
    },
  },
  {
    name: 'yaml_lens_to_json',
    description:
      'YAML → JSON 转换（js-yaml 4.1.0）。单文档输出 JSON 对象，多文档输出 JSON 数组（每个元素一个文档）。解析失败如实报错带行列，不输出半成品。.inf/.nan/Date 已字符串化，不会静默变 null。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'YAML 文本' },
        indent: { type: 'number', description: 'JSON 缩进空格数，默认 2' },
      },
      required: ['text'],
    },
  },
  {
    name: 'yaml_lens_to_yaml',
    description:
      'JSON → YAML 转换（js-yaml dump：默认不折行 lineWidth=-1、noRefs 展开共享引用、可排序键）。输入必须是合法 JSON，否则如实报错。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'JSON 文本' },
        indent: { type: 'number', description: 'YAML 缩进空格数，默认 2' },
        sortKeys: { type: 'boolean', description: '是否按键名排序，默认 false' },
      },
      required: ['text'],
    },
  },
];

/** loadAll 包装：空文本 → 空文档数组；异常 → 结构化错误 */
function parseAll(text) {
  if (String(text).trim() === '') return { ok: true, docs: [], empty: true };
  try {
    const docs = yaml.loadAll(text);
    return { ok: true, docs: docs.map((d) => core.jsonSafe(d)) };
  } catch (e) {
    return { ok: false, error: core.normalizeYamlError(e) };
  }
}

function fenceJson(value, limit) {
  let s;
  try {
    s = JSON.stringify(value, null, 2) ?? String(value);
  } catch (_) {
    s = String(value);
  }
  if (limit && s.length > limit) s = s.slice(0, limit) + `\n…（已截断，原文 ${s.length} 字符）`;
  return '```json\n' + s + '\n```';
}

function anchorLines(scan) {
  const parts = [];
  if (scan.anchors.length) parts.push('锚点：' + scan.anchors.map((a) => `&${a.name}(${a.line}:${a.col})`).join(' '));
  if (scan.aliases.length) parts.push('别名：' + scan.aliases.map((a) => `*${a.name}(${a.line}:${a.col}${a.resolved ? '，已解析' : '，未定义!'})`).join(' '));
  if (scan.merges > 0) parts.push(`合并键 << ×${scan.merges}`);
  return parts;
}

const SEV_ORDER = { error: 0, warn: 1, info: 2 };
const SEV_LABEL = { error: '❌错误', warn: '⚠️警告', info: 'ℹ️提示' };

function toolParse(args) {
  const text = typeof args.text === 'string' ? args.text : '';
  const r = parseAll(text);
  if (!r.ok) {
    const e = r.error;
    return { isError: true, text: `解析失败：${e.message}${e.line ? `（第 ${e.line} 行第 ${e.column} 列）` : ''}${e.hint ? `\n\n${e.hint}` : ''}` };
  }
  const scan = core.lintYaml(text);
  const out = [];
  out.push(r.empty ? '空文本：无文档。' : `解析成功：${r.docs.length} 个文档（${scan.stats.lines} 行 / ${scan.stats.bytes} 字节）`);
  if (r.docs.length === 0) return { isError: false, text: out.join('\n') };
  const inv = anchorLines(scan);
  if (inv.length) out.push('', inv.join(' ｜ '));
  r.docs.forEach((d, i) => {
    out.push('', `## 文档 ${i + 1}${r.docs.length === 1 ? '' : `（共 ${r.docs.length} 个）`}`, '', fenceJson(d, PREVIEW_LIMIT));
  });
  return { isError: false, text: out.join('\n') };
}

function toolLint(args) {
  const text = typeof args.text === 'string' ? args.text : '';
  const scan = core.lintYaml(text);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of scan.issues) counts[i.severity]++;

  const out = [];
  out.push(`静态扫描完成：${scan.stats.lines} 行，文档 ${scan.docs} 个 —— ❌错误 ${counts.error} / ⚠️警告 ${counts.warn} / ℹ️提示 ${counts.info}`);

  // 解析状态同步报告（lint 与 parse 是两道独立闸：扫描干净 ≠ 解析成功）
  const pr = parseAll(text);
  if (!pr.ok) {
    const e = pr.error;
    out.push(`解析状态：**失败** —— ${e.message}${e.line ? `（第 ${e.line} 行第 ${e.column} 列）` : ''}`);
    if (e.hint) out.push(`> ${e.hint}`);
  } else if (pr.empty) {
    out.push('解析状态：空文本。');
  } else {
    out.push('解析状态：成功（js-yaml 4.1.0，YAML 1.2 core 语义）。');
  }

  if (scan.issues.length === 0) {
    out.push('', '未发现已知坑模式。注意：本工具覆盖跨实现语义漂移与常见书写陷阱，不等于「语义正确」。');
    return { isError: false, text: out.join('\n') };
  }

  out.push('', '| 严重度 | 位置 | 规则 | 说明 |', '|---|---|---|---|');
  const sorted = [...scan.issues].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.line - b.line || a.col - b.col);
  for (const i of sorted) {
    const msg = i.hint ? `${i.message}（${i.hint}）` : i.message;
    out.push(`| ${SEV_LABEL[i.severity]} | ${i.line}:${i.col} | \`${i.rule}\` | ${msg.replace(/\|/g, '\\|')} |`);
  }
  return { isError: false, text: out.join('\n') };
}

function toolToJson(args) {
  const text = typeof args.text === 'string' ? args.text : '';
  let indent = 2;
  if (args.indent !== undefined) {
    indent = Number(args.indent);
    if (!Number.isInteger(indent) || indent < 0 || indent > 10) return { isError: true, text: 'indent 必须是 0-10 的整数。' };
  }
  const r = parseAll(text);
  if (!r.ok) {
    const e = r.error;
    return { isError: true, text: `解析失败：${e.message}${e.line ? `（第 ${e.line} 行第 ${e.column} 列）` : ''}${e.hint ? `\n\n${e.hint}` : ''}` };
  }
  if (r.empty) return { isError: true, text: '空文本没有可转换的文档。' };
  // 单文档输出对象本身（贴合常见用法），多文档输出数组并显式说明
  const value = r.docs.length === 1 ? r.docs[0] : r.docs;
  const note = r.docs.length === 1 ? '' : `\n# 注：${r.docs.length} 个文档已输出为 JSON 数组（按文档顺序）`;
  return { isError: false, text: JSON.stringify(value, null, indent) + note };
}

function toolToYaml(args) {
  const text = typeof args.text === 'string' ? args.text : '';
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { isError: true, text: `输入不是合法 JSON：${e.message}` };
  }
  const opts = {
    indent: 2,
    sortKeys: false,
    lineWidth: -1, // 实测 js-yaml 4.1.0：-1 = 不折行（默认 80 会把长行折断）
    noRefs: true, // 展开共享引用，避免产出 &anchor/*ref 惊喜
  };
  if (args.indent !== undefined) {
    const n = Number(args.indent);
    if (!Number.isInteger(n) || n < 1 || n > 10) return { isError: true, text: 'indent 必须是 1-10 的整数。' };
    opts.indent = n;
  }
  if (args.sortKeys !== undefined) opts.sortKeys = !!args.sortKeys;
  let out;
  try {
    out = yaml.dump(value, opts);
  } catch (e) {
    return { isError: true, text: `YAML 序列化失败：${e.message}` };
  }
  return { isError: false, text: out };
}

const HANDLERS = {
  yaml_lens_parse: toolParse,
  yaml_lens_lint: toolLint,
  yaml_lens_to_json: toolToJson,
  yaml_lens_to_yaml: toolToYaml,
};

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    write({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return; // 通知无回包
  if (method === 'tools/list') {
    write({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const handler = HANDLERS[name];
    if (!handler) {
      write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `未知工具：${name}。可用：${TOOLS.map((t) => t.name).join(', ')}` }] } });
      return;
    }
    try {
      const r = handler((params && params.arguments) || {});
      write({ jsonrpc: '2.0', id, result: { isError: !!r.isError, content: [{ type: 'text', text: r.text }] } });
    } catch (e) {
      process.stderr.write(`[yaml-lens] tool ${name} 异常: ${e && e.stack ? e.stack : e}\n`);
      write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `工具内部错误：${e && e.message ? e.message : String(e)}` }] } });
    }
    return;
  }
  if (method === 'ping') {
    write({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  write({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stderr.write(`[yaml-lens] MCP server ${SERVER_INFO.version} ready (stdio)\n`);
