'use strict';
/**
 * qr-desk MCP server 源码（esbuild bundle → mcp/server.js，发布 zip 零 node_modules）。
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 五工具：qr_generate / qr_decode / qr_inspect / qr_batch / qr_selftest
 * 引擎与面板/服务同一权威：shared/core.js + render + image + selftest。
 *
 * 脱敏纪律：工具结果包含用户主动请求的载荷内容（含 2FA secret/密码）——这是工具的
 * 存在意义；但 stderr 日志绝不记载荷，只记类型与尺寸。
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/core.js');
const render = require('../shared/render.js');
const image = require('../shared/image.js');
const { generateOne, uniquePath } = require('../shared/generate.js');
const { runSelftest } = require('../shared/selftest.js');

const SERVER_INFO = { name: 'qr-desk', version: '0.1.0' };

const TOOLS = [
  {
    name: 'qr_generate',
    description:
      '生成二维码。直接给 text（任意文本/URL），或给 template 结构化模板：type=text/url/wifi/vcard/otpauth + fields。' +
      'wifi 字段 ssid/password/encryption(WPA|WEP|nopass)/hidden；vcard 字段 name/last/first/org/tel/email/url/note；' +
      'otpauth 字段 label(如 GitHub:alice)/secret(Base32)/algorithm/digits/period/counter(otpType=totp|hotp)。' +
      '返回模块数/字节数/纠错级别与终端预览；给 outDir（绝对路径）则 PNG 落盘（永不覆盖，冲突自动 -2 递增）。' +
      '全程本地计算零外联，密钥类载荷不出本机。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '直接载荷文本（与 template 二选一）' },
        template: {
          type: 'object',
          description: '结构化模板 {type, fields}；type ∈ text/url/wifi/vcard/otpauth',
          properties: {
            type: { type: 'string', enum: ['text', 'url', 'wifi', 'vcard', 'otpauth'] },
            fields: { type: 'object', description: '字段按 type 而定，值可含 {列名} 占位（批量用）' },
          },
          required: ['type'],
        },
        ecl: { type: 'string', enum: ['L', 'M', 'Q', 'H'], description: '纠错级别，缺省 M' },
        margin: { type: 'number', description: '静区模块数，缺省 4' },
        scale: { type: 'number', description: 'PNG 每模块像素，缺省 8' },
        outDir: { type: 'string', description: '输出目录（绝对路径）；给了就把 PNG 落盘' },
        fileName: { type: 'string', description: '文件名主干（不含扩展名），缺省 qr' },
        withSvg: { type: 'boolean', description: '落盘时同时输出 SVG，缺省 false' },
      },
    },
  },
  {
    name: 'qr_decode',
    description:
      '解码图片中的二维码：给 imagePath（绝对路径，PNG/JPEG）。返回原始载荷 + 类型识别 + 结构化字段' +
      '（WiFi 转义还原、vCard 属性、otpauth 参数与 TOTP 当前码、Google Authenticator 迁移码 protobuf 逐账户解读）。' +
      '支持自动反色。注意：结果可能含 2FA secret/密码等敏感字段，仅用于用户自己的数据。',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: '图片绝对路径（PNG/JPEG，≤10MB，≤4096×4096）' },
      },
      required: ['imagePath'],
    },
  },
  {
    name: 'qr_inspect',
    description:
      '解读二维码载荷文本（不解图）：识别 url/wifi/vcard/mecard/otpauth/otpauth-migration/mailto/tel/sms/geo/text，' +
      '逐字段解析；otpauth 与迁移码给出 TOTP/HOTP 当前码预览。适合用户粘贴一段扫码得到的文本追问含义。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '二维码载荷原文' },
      },
      required: ['text'],
    },
  },
  {
    name: 'qr_batch',
    description:
      '批量出码：rows（对象数组）或 csv（首行表头，逗号分隔）+ template（fields 的值用 {列名} 引用行数据）' +
      '+ outDir（绝对路径）→ 逐行生成 PNG 落盘，同名自动递增，≤500 行。返回落盘文件清单。',
    inputSchema: {
      type: 'object',
      properties: {
        rows: { type: 'array', description: '行对象数组；与 csv 二选一', items: { type: 'object' } },
        csv: { type: 'string', description: 'CSV 文本（首行表头）' },
        template: {
          type: 'object',
          description: '{type, fields}；fields 值中的 {列名} 被行值替换',
          properties: {
            type: { type: 'string', enum: ['text', 'url', 'wifi', 'vcard', 'otpauth'] },
            fields: { type: 'object' },
          },
          required: ['type'],
        },
        outDir: { type: 'string', description: '输出目录（绝对路径）' },
        fileBase: { type: 'string', description: '文件名前缀，缺省 qr' },
        nameCol: { type: 'string', description: '用作文件名的列（缺省用 ssid/name/label 或行号）' },
        ecl: { type: 'string', enum: ['L', 'M', 'Q', 'H'], description: '缺省 M' },
        scale: { type: 'number', description: 'PNG 每模块像素，缺省 8' },
      },
      required: ['outDir', 'template'],
    },
  },
  {
    name: 'qr_selftest',
    description:
      '试金石自检：12 条断言（RFC 4226/6238 OTP 金标、WiFi/vCard/迁移码 round-trip、' +
      '生成→PNG→解码全链路、JPEG 通道、护栏拒绝、CSV/批量命名）逐一报告通过与否，纯本地计算。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── 人类可读输出 ────────────────────────────────────────────────────────────
function dump(value, indent) {
  const pad = indent || '';
  if (value == null) return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '（空）';
    return value.map((v) => `${pad}- ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n');
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== null && value[k] !== undefined && value[k] !== '' && !(Array.isArray(value[k]) && !value[k].length));
    if (!keys.length) return '（空）';
    return keys.map((k) => {
      const v = value[k];
      if (typeof v === 'object') return `${pad}${k}:\n${dump(v, pad + '  ')}`;
      return `${pad}${k}: ${String(v)}`;
    }).join('\n');
  }
  return `${pad}${String(value)}`;
}

function formatInspected(insp) {
  const head = `类型: ${insp.type}（${insp.byteLength} 字节）`;
  if (insp.type === 'otpauth-migration' && insp.entries) {
    const lines = insp.entries.map((e, i) => {
      const pv = e.preview || {};
      const codeLine = pv.code ? `当前码: ${pv.code}${pv.remainingMs ? `（${Math.ceil(pv.remainingMs / 1000)}s 后刷新）` : ''}` : '当前码: 不适用';
      return `条目 ${i + 1}:\n${dump({ ...e, preview: undefined }, '  ')}\n  ${codeLine}`;
    });
    return `${head}\n批次: size=${insp.batchSize} index=${insp.batchIndex} id=${insp.batchId}\n${lines.join('\n')}`;
  }
  if (insp.preview && insp.preview.code) {
    const pv = insp.preview;
    const rem = pv.remainingMs ? `（${Math.ceil(pv.remainingMs / 1000)}s 后刷新）` : '';
    return `${head}\n${dump(insp.fields)}\n当前码: ${pv.code}${rem}`;
  }
  return `${head}\n${dump(insp.fields)}`;
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
function toolGenerate(args) {
  const body = {
    template: args.template,
    text: args.text,
    ecl: args.ecl,
    margin: args.margin,
    scale: args.scale,
    save: args.outDir ? { outDir: args.outDir, fileName: args.fileName, withSvg: args.withSvg } : null,
  };
  const r = generateOne(body); // 唯一权威实现在 shared/generate.js（与 service 同源）
  const lines = [
    `已生成：模块 ${r.meta.modules}×${r.meta.modules}，载荷 ${r.meta.bytes} 字节，纠错 ${r.meta.ecl}，PNG ${r.meta.pixelSize}px`,
  ];
  if (r.savedTo) lines.push(`已落盘:\n${dump(r.savedTo, '  ')}`);
  if (r.meta.modules <= 45) lines.push(`终端预览:\n${r.textArt}`);
  else lines.push('（码较大，终端预览省略）');
  return { text: lines.join('\n\n') };
}

function toolDecode(args) {
  if (!args.imagePath) return { isError: true, text: '需要 imagePath（图片绝对路径）' };
  const p = String(args.imagePath);
  if (!path.isAbsolute(p)) return { isError: true, text: 'imagePath 必须是绝对路径' };
  const buf = fs.readFileSync(p);
  const r = image.decodeQrFromImage(buf);
  if (!r.found) {
    return { text: `未找到二维码：${r.format} ${r.width}×${r.height}。已尝试反色检测；请确认图内码占比足够大且完整清晰。` };
  }
  let insp = null;
  try { insp = core.inspect(r.payload); } catch (_) { insp = null; }
  const lines = [`解码成功（${r.format} ${r.width}×${r.height}）`, `原始载荷:\n${r.payload}`];
  if (insp) lines.push(`解读:\n${formatInspected(insp)}`);
  return { text: lines.join('\n\n') };
}

function toolInspect(args) {
  const insp = core.inspect(String(args.text == null ? '' : args.text));
  return { text: formatInspected(insp) };
}

async function toolBatch(args) {
  if (!args.outDir || !path.isAbsolute(String(args.outDir))) {
    return { isError: true, text: '需要 outDir（绝对路径）' };
  }
  const dir = String(args.outDir);
  fs.mkdirSync(dir, { recursive: true });
  let rows = args.rows;
  if (!Array.isArray(rows) && typeof args.csv === 'string') {
    rows = core.csvToObjects(args.csv).rows;
  }
  const plan = core.planBatch({ rows, template: args.template, fileBase: args.fileBase, nameCol: args.nameCol });
  const ecl = args.ecl || 'M';
  const scale = Math.max(2, Math.min(20, Number(args.scale == null ? 8 : args.scale)));
  const margin = 4;
  const files = [];
  for (const item of plan) {
    const m = render.qrMatrix(item.payload, ecl);
    const png = render.pngFromMatrix(m, { margin, scale });
    const p = uniquePath(dir, item.fileName);
    fs.writeFileSync(p, png);
    files.push(p);
  }
  process.stderr.write(`[qr-desk] batch 写出 ${files.length} 个文件 → ${dir}\n`);
  return { text: `已生成 ${files.length} 个 PNG → ${dir}\n${files.map((f) => `- ${path.basename(f)}`).join('\n')}` };
}

function toolSelftest() {
  const r = runSelftest();
  const lines = r.items.map((i) => `${i.ok ? '✓' : '✗'} ${i.name}${i.ok ? '' : ` —— ${i.detail}`}`);
  return { text: `自检 ${r.pass}/${r.items.length} 通过\n${lines.join('\n')}`, isError: r.fail > 0 };
}

const HANDLERS = {
  qr_generate: (args) => toolGenerate(args || {}),
  qr_decode: (args) => toolDecode(args || {}),
  qr_inspect: (args) => toolInspect(args || {}),
  qr_batch: (args) => toolBatch(args || {}),
  qr_selftest: () => toolSelftest(),
};

// ── JSON-RPC over stdio（newline-delimited，与 house 框架一致）──────────────
function write(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
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
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    write({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return; // 通知无回包(cron-lens 坑)
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
      process.stderr.write(`[qr-desk] tool ${name} 异常: ${e && e.stack ? e.stack : e}\n`);
      const msgText = e && e.user ? e.message : `工具内部错误:${e && e.message ? e.message : String(e)}`;
      write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: msgText }] } });
    }
    return;
  }
  if (method === 'ping') { write({ jsonrpc: '2.0', id, result: {} }); return; }
  write({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stderr.write(`[qr-desk] MCP server ${SERVER_INFO.version} ready (stdio)\n`);
