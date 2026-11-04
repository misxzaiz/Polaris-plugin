'use strict';
/**
 * id-lens MCP server 源码(esbuild --platform=node --format=cjs bundle 到 mcp/server.js,
 * 零第三方依赖 → 发布 zip 零 node_modules)。
 * stdout 只输出协议 JSON 行;一切日志走 stderr(platform-constraints 纪律)。
 * 四工具:id_lens_parse / id_lens_bits / id_lens_validate / id_lens_convert
 * 引擎与面板同一权威:shared/id-core.js。
 */
const core = require('../shared/id-core.js');

const SERVER_INFO = { name: 'id-lens', version: '0.1.0' };

const LAYOUT_DESC = 'layout 可选 twitter(纪元 2010-11-04T01:42:54.657Z)或 discord(纪元 2015-01-01),缺省 twitter。Snowflake 时间还原强依赖纪元假设。';

const TOOLS = [
  {
    name: 'id_lens_parse',
    description:
      '解析标识符:自动识别 UUID(v1-v8,支持 canonical/urn/braces/无连字符形态)/ULID(26 字符 Crockford Base32)/Snowflake 雪花 ID(纯数字 ≤20 位),返回家族、版本/变体、位域逐段解读与时间还原。所有超过 2^53 的数值以字符串输出(防精度丢失)。' + LAYOUT_DESC,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '标识符(UUID/ULID/Snowflake 任一形态)' },
        layout: { type: 'string', enum: ['twitter', 'discord'], description: 'Snowflake 纪元布局,缺省 twitter' },
      },
      required: ['id'],
    },
  },
  {
    name: 'id_lens_bits',
    description:
      '位域分解:给出标识符的高低位分段表(位段名/位号范围/值/含义)与二进制位图,用于核对协议布局或排查位挪用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '标识符' },
        layout: { type: 'string', enum: ['twitter', 'discord'], description: 'Snowflake 纪元布局,缺省 twitter' },
      },
      required: ['id'],
    },
  },
  {
    name: 'id_lens_validate',
    description:
      '规范性校验:版本位/变体位是否在 RFC 9562 定义内、大小写与形态合规性、ULID Crockford 排除字母(I/L/O/U)定位、Snowflake 前导零/纪元歧义(Twitter vs Discord 对照)/41 位耗尽时间、时间戳合理性(远未来提示)。逐条给级别(error/warn/info)+ 规则名 + 修复建议。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '标识符' },
        layout: { type: 'string', enum: ['twitter', 'discord'], description: 'Snowflake 纪元布局,缺省 twitter' },
      },
      required: ['id'],
    },
  },
  {
    name: 'id_lens_convert',
    description:
      '形态互转:canonical / uppercase / urn / braces / hyphenless(无连字符)/ decimal(十进制)/ bitstring(二进制)/ hex128 / ulid(128 位家族↔ULID 编码,语义不保证会如实标注)。Snowflake(64 位)不能转 128 位家族形态(位宽不足,如实报错)。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '标识符' },
        to: { type: 'string', description: '目标形态:' + core.CONVERT_TARGETS.join(' / ') },
        layout: { type: 'string', enum: ['twitter', 'discord'], description: 'Snowflake 纪元布局,缺省 twitter' },
      },
      required: ['id', 'to'],
    },
  },
];

function argLayout(args) {
  return args && args.layout === 'discord' ? { layout: 'discord' } : undefined;
}

function toolParse(args) {
  const p = core.parseId(args.id, argLayout(args));
  if (!p.ok) {
    const e = p.error;
    return { isError: true, text: `解析失败:${e.message}${e.hint ? `\n\n${e.hint}` : ''}` };
  }
  const out = [];
  out.push(`识别:${labelOf(p.family)} · ${p.shape === 'canonical' ? '规范形态' : `形态 ${p.shape}`}`);
  if (p.version !== undefined) out.push(`版本 ${p.version} —— ${p.versionNote} | 变体 ${p.variant}(${p.variantNote})`);
  if (p.layout) out.push(`Snowflake 布局:${p.epochLabel}`);
  if (p.fields.time) out.push(`时间还原:${p.fields.time}${p.fields.dow ? '(' + p.fields.dow + ')' : ''}`);
  if (p.fields.epochMs) out.push(`Unix 毫秒:${p.fields.epochMs}`);
  if (p.fields.randomBits) out.push(`随机性:${p.fields.randomBits}`);
  for (const n of p.notes) out.push(`- ${n}`);
  return { isError: false, text: out.join('\n') };
}

function labelOf(f) {
  if (f === 'uuid') return 'UUID';
  if (f === 'ulid') return 'ULID';
  if (f === 'snowflake') return 'Snowflake';
  return f;
}

function toolBits(args) {
  const p = core.parseId(args.id, argLayout(args));
  if (!p.ok) {
    const e = p.error;
    return { isError: true, text: `解析失败:${e.message}${e.hint ? `\n\n${e.hint}` : ''}` };
  }
  const width = p.family === 'snowflake' ? 64 : 128;
  const bits = p.family === 'snowflake' ? p.hex64 : p.hex128;
  const bin = BigInt('0x' + bits).toString(2).padStart(width, '0');
  const out = [];
  out.push(`${labelOf(p.family)} · ${width} 位位图(高→低):`);
  out.push('```');
  for (let i = 0; i < bin.length; i += 64) out.push(bin.slice(i, i + 64));
  out.push('```');
  out.push('| 位段 | 位号 | 值 | 含义 |', '|---|---|---|---|');
  for (const s of p.segments) {
    out.push(`| ${s.name} | ${s.hi}..${s.lo} | \`${s.value}\` | ${s.note.replace(/\|/g, '\\|')} |`);
  }
  return { isError: false, text: out.join('\n') };
}

const LEVEL_LABEL = { error: '❌错误', warn: '⚠️警告', info: 'ℹ️提示' };

function toolValidate(args) {
  const r = core.validateId(args.id, argLayout(args));
  if (!r.ok) {
    return { isError: true, text: r.items.map((i) => `${LEVEL_LABEL[i.level]} [${i.rule}] ${i.message}${i.hint ? `\n  ${i.hint}` : ''}`).join('\n') };
  }
  if (r.items.length === 0) return { isError: false, text: '校验通过:未发现规范性问题(版本/变体在 RFC 9562 定义内,形态为 canonical,时间合理)。' };
  const out = [`校验完成:${r.items.length} 条提示`, ''];
  for (const i of r.items) out.push(`- ${LEVEL_LABEL[i.level]} \`${i.rule}\` ${i.message}${i.hint ? ` —— ${i.hint}` : ''}`);
  return { isError: false, text: out.join('\n') };
}

function toolConvert(args) {
  const r = core.convertId(args.id, args.to, argLayout(args));
  if (!r.ok) {
    const e = r.error;
    return { isError: true, text: `转换失败:${e.message}${e.hint ? `\n\n${e.hint}` : ''}` };
  }
  const out = [`转换成功(${r.from} → ${r.to}):`, '', '```', String(r.value), '```'];
  for (const n of r.notes) out.push(`- ${n}`);
  return { isError: false, text: out.join('\n') };
}

const HANDLERS = {
  id_lens_parse: toolParse,
  id_lens_bits: toolBits,
  id_lens_validate: toolValidate,
  id_lens_convert: toolConvert,
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
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return; // 通知无回包,不能按 rpc 等响应(cron-lens 坑)
  if (method === 'tools/list') {
    write({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const handler = HANDLERS[name];
    if (!handler) {
      write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `未知工具:${name}。可用:${TOOLS.map((t) => t.name).join(', ')}` }] } });
      return;
    }
    try {
      const r = handler((params && params.arguments) || {});
      write({ jsonrpc: '2.0', id, result: { isError: !!r.isError, content: [{ type: 'text', text: r.text }] } });
    } catch (e) {
      process.stderr.write(`[id-lens] tool ${name} 异常: ${e && e.stack ? e.stack : e}\n`);
      write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `工具内部错误:${e && e.message ? e.message : String(e)}` }] } });
    }
    return;
  }
  if (method === 'ping') {
    write({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  write({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stderr.write(`[id-lens] MCP server ${SERVER_INFO.version} ready (stdio)\n`);
