#!/usr/bin/env node
'use strict';
/**
 * zhifang MCP Server —— PDF 工坊（本地 PDF 工坊）的 AI 工具层
 *
 * 把 AI 的「操作 PDF」意图变成真实落盘文件：路径进 → pdf-engine 处理 →
 * 输出自动命名落盘（永不覆盖）→ 返回路径与摘要。与面板服务共用同一引擎
 * （service/pdf-engine.js），口径不漂移。
 *
 * 工具一览（5 个）：
 *   zhifang_info      查看 PDF 结构信息（页数/页面尺寸/元数据）
 *   zhifang_merge     按顺序合并多个 PDF
 *   zhifang_pages     抽取页/重排页/拆分/旋转/删页（一个工具五种页面操作）
 *   zhifang_images2pdf jpg/png 图片合成 PDF
 *   zhifang_text      提取文字层（AI 直接读内容；可选落盘 txt）
 *
 * 安全底线：输入永不修改/删除；输出永不覆盖（自动 -2/-3）；加密 PDF 拒绝并
 * 明示不做破解；零外网请求。历史登记经 cap.kv（降级容忍，核心操作不依赖桥）。
 *
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/core.js');
const engine = require('../service/pdf-engine.js');
const { createKvClient } = require('../service/kvclient.js');

const SERVER_NAME = 'zhifang';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const MAX_INPUT_BYTES = 300 * 1024 * 1024; // 引擎全内存操作的单文件上限
const TEXT_RETURN_CAP = 20000;

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const APP_CONFIG_DIR = process.argv[2] || '';
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const KEY_HISTORY = 'zhifang.history.';
const KEY_SETTINGS = 'zhifang.settings';

// ── 输入读取与输出落盘 ──────────────────────────────────────────────────────

function assertAbsolutePath(p) {
  if (typeof p !== 'string' || !p.trim()) {
    throw new Error('缺少文件路径：请提供 PDF 的绝对路径（如 C:\\Users\\me\\Desktop\\a.pdf）');
  }
  if (!path.isAbsolute(p)) {
    throw new Error('路径必须是绝对路径（如 C:\\Users\\me\\Desktop\\a.pdf），收到：' + p);
  }
  return p.trim();
}

function readPdfInput(p) {
  assertAbsolutePath(p);
  let st;
  try { st = fs.statSync(p); } catch (_) {
    throw new Error('文件不存在：' + p + '（确认盘符/路径拼写，中文路径请原样给出）');
  }
  if (!st.isFile()) throw new Error('不是文件（可能是目录）：' + p);
  if (st.size > MAX_INPUT_BYTES) {
    throw new Error('文件 ' + core.formatBytes(st.size) + ' 超过单文件上限 ' + core.formatBytes(MAX_INPUT_BYTES) + '：请先拆分');
  }
  const bytes = fs.readFileSync(p);
  if (!core.isPdfBytes(bytes)) {
    throw new Error(path.basename(p) + ' 不是 PDF（文件头缺少 %PDF- 标识）');
  }
  return { name: path.basename(p), bytes };
}

function readImageInput(p) {
  assertAbsolutePath(p);
  let st;
  try { st = fs.statSync(p); } catch (_) {
    throw new Error('图片不存在：' + p);
  }
  if (!st.isFile()) throw new Error('不是文件（可能是目录）：' + p);
  if (st.size > MAX_INPUT_BYTES) {
    throw new Error('图片 ' + core.formatBytes(st.size) + ' 超过单文件上限 ' + core.formatBytes(MAX_INPUT_BYTES));
  }
  const bytes = fs.readFileSync(p);
  const kind = core.imageKind(bytes);
  if (!kind) {
    throw new Error(path.basename(p) + ' 不是 JPG/PNG 图片（HEIC/WebP 等格式请先转换）');
  }
  return { name: path.basename(p), bytes };
}

async function readSettingsSafe() {
  try {
    return core.normalizeSettings(await kv.kvGet(KEY_SETTINGS));
  } catch (_) {
    return core.normalizeSettings(null);
  }
}

/** MCP 输出目录优先级：参数 outputDir > 面板设置 outDir > 输入文件所在目录 > 桌面 */
function resolveOutDir(explicit, inputPath, settings) {
  const candidates = [];
  if (explicit) {
    assertAbsolutePath(explicit);
    candidates.push(explicit);
  }
  if (settings.outDir) candidates.push(settings.outDir);
  if (inputPath) candidates.push(path.dirname(inputPath));
  for (const home of [os.homedir()]) {
    candidates.push(path.join(home, 'Desktop'), home);
  }
  for (const c of candidates) {
    try {
      if (c && path.isAbsolute(c) && fs.statSync(c).isDirectory()) return c;
    } catch (_) { /* 下一个候选 */ }
  }
  throw new Error('找不到可用的输出目录：请用 outputDir 参数指定一个存在的目录');
}

function writeOutputs(outDir, outputs) {
  const exists = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
  return outputs.map((o) => {
    const target = core.pickOutputName(outDir, core.sanitizeStem(o.name), extOf(o.name), exists);
    fs.writeFileSync(target, o.bytes);
    return { name: path.basename(target), path: target, size: o.bytes.length };
  });
}

function extOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name));
  return m ? '.' + m[1].toLowerCase() : '.pdf';
}

async function registerHistory(record) {
  try {
    await kv.kvSet(KEY_HISTORY + record.id, record);
  } catch (e) {
    log('warn', '历史登记失败（不影响输出）: ' + e.message);
  }
}

async function execute(op, { inputs, inputPath, params, outputDir }) {
  const started = Date.now();
  const settings = await readSettingsSafe();
  const outDir = resolveOutDir(outputDir, inputPath, settings);
  const result = await engine.runOp(op, inputs, params || {});
  const written = writeOutputs(outDir, result.outputs);
  if (op === 'text' && params && params.writeTxt && result.text) {
    const exists = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
    const txt = core.pickOutputName(outDir, core.sanitizeStem(inputs[0].name) + '-文字', '.txt', exists);
    fs.writeFileSync(txt, result.text, 'utf8');
    written.push({ name: path.basename(txt), path: txt, size: Buffer.byteLength(result.text) });
  }
  const record = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    op,
    source: 'mcp',
    inputs: inputs.map((i) => i.name),
    outputs: written,
    pages: result.pages || 0,
    ms: Date.now() - started,
    ok: true,
  };
  await registerHistory(record);
  return { result, written };
}

// ── 工具定义（description 写「适用句式」，AI 靠它匹配意图）──────────────────

const TOOLS = [
  {
    name: 'zhifang_info',
    description: '查看一个 PDF 的结构信息：页数、页面尺寸、标题/作者/生成工具等元数据。适用：「这个 PDF 有几页」「看看这份 PDF 的信息/是谁生成的」。只读，不产生文件。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'PDF 文件绝对路径' } },
      required: ['path'],
    },
    async run(args) {
      const input = readPdfInput(args.path);
      const { result } = await execute('info', { inputs: [input], inputPath: args.path, params: {} });
      const i = result.info;
      return [
        `文件：${i.name}`,
        `页数：${i.pages} 页；页面尺寸：${i.pageSize || '未知'}`,
        i.title ? `标题：${i.title}` : '',
        i.author ? `作者：${i.author}` : '',
        i.producer || i.creator ? `生成：${[i.producer, i.creator].filter(Boolean).join(' / ')}` : '',
        i.createdAt ? `创建时间：${i.createdAt}` : '',
      ].filter(Boolean).join('\n');
    },
  },
  {
    name: 'zhifang_merge',
    description: '把多个 PDF 按给定顺序合并成一个文件。适用：「把桌面上这三个 PDF 合并」「把 a.pdf 和 b.pdf 拼在一起」。输出自动命名（<第一个文件名>-合并.pdf），永不覆盖已有文件。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'PDF 文件绝对路径数组，按合并顺序排列' },
        outputDir: { type: 'string', description: '可选：输出目录（默认第一个文件所在目录）' },
      },
      required: ['paths'],
    },
    async run(args) {
      const paths = Array.isArray(args.paths) ? args.paths : [];
      if (paths.length < 2) throw new Error('合并至少需要 2 个 PDF 文件路径');
      const inputs = paths.map((p) => readPdfInput(p));
      const { result, written } = await execute('merge', { inputs, inputPath: paths[0], params: {}, outputDir: args.outputDir });
      return `合并完成：${paths.length} 份 → ${result.pages} 页\n输出：${written.map((w) => w.path + '（' + core.formatBytes(w.size) + '）').join('\n')}`;
    },
  },
  {
    name: 'zhifang_pages',
    description: '对一个 PDF 做页面级操作，action 四选一：extract 抽取/重排页（如「抽出第 3-12 页」「把第 2 页挪到最前」）、split 按页数拆分成多份、rotate 旋转选中页、delete 删除选中页。适用：「抽出这份合同的第 3-12 页」「把 PDF 每 10 页拆一份」「把扫描歪的页旋转 90 度」「删掉第 1 页」。输出永不覆盖。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'PDF 文件绝对路径' },
        action: { type: 'string', enum: ['extract', 'split', 'rotate', 'delete'], description: 'extract=抽取/重排页（pages 保序，可写 3,1,2 重排）；split=拆分；rotate=旋转；delete=删页' },
        pages: { type: 'string', description: '页码规格（1-based）：如 1-3,5、3-end、all；extract 用它保序重排；rotate/delete 用它选页' },
        every: { type: 'number', description: 'action=split 时每几页一份（如 10）' },
        angle: { type: 'number', description: 'action=rotate 时旋转角度：90/180/270（顺时针）或负数逆时针，累计生效' },
        outputDir: { type: 'string', description: '可选：输出目录（默认源文件所在目录）' },
      },
      required: ['path', 'action'],
    },
    async run(args) {
      const input = readPdfInput(args.path);
      const params = { pages: args.pages, every: args.every, angle: args.angle };
      const { result, written } = await execute(args.action, { inputs: [input], inputPath: args.path, params, outputDir: args.outputDir });
      const head = `${actionLabel(args.action)}完成：${input.name}（${result.pages} 页）`;
      return [head, result.note || '', '输出：' + written.map((w) => w.path + '（' + core.formatBytes(w.size) + '）').join('\n')].filter(Boolean).join('\n');
    },
  },
  {
    name: 'zhifang_images2pdf',
    description: '把多张 JPG/PNG 图片按给定顺序合成一个 PDF（每图一页，页尺寸=图片尺寸）。适用：「把这几张扫描图合成一个 PDF」「这堆截图转成 PDF」。HEIC/WebP 请先转 JPG/PNG。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: '图片绝对路径数组（.jpg/.jpeg/.png），按页序排列' },
        margin: { type: 'number', description: '可选：页边距 pt（0-200，默认 0）' },
        outputDir: { type: 'string', description: '可选：输出目录（默认第一张图所在目录）' },
      },
      required: ['paths'],
    },
    async run(args) {
      const paths = Array.isArray(args.paths) ? args.paths : [];
      if (!paths.length) throw new Error('没有收到图片路径');
      const inputs = paths.map((p) => readImageInput(p));
      const { result, written } = await execute('images2pdf', { inputs, inputPath: paths[0], params: { margin: args.margin }, outputDir: args.outputDir });
      return `图片合成完成：${inputs.length} 张 → ${result.pages} 页 PDF\n输出：${written.map((w) => w.path + '（' + core.formatBytes(w.size) + '）').join('\n')}`;
    },
  },
  {
    name: 'zhifang_text',
    description: '提取 PDF 的文字层并直接返回文本（供你阅读/续答/总结）。适用：「把这份 PDF 的内容读出来」「总结这个 PDF」（先用本工具取文字再总结）。扫描件/图片型 PDF 无文字层会明确报错（本工具不做 OCR）。可选 writeTxt 把全文落盘。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'PDF 文件绝对路径' },
        pages: { type: 'string', description: '可选页码规格（如 1-5），默认全部页' },
        writeTxt: { type: 'boolean', description: '是否把全文落盘为 <文件名>-文字.txt（默认 false）' },
        outputDir: { type: 'string', description: '可选：txt 输出目录（默认源文件所在目录）' },
      },
      required: ['path'],
    },
    async run(args) {
      const input = readPdfInput(args.path);
      const { result, written } = await execute('text', { inputs: [input], inputPath: args.path, params: { pages: args.pages, writeTxt: args.writeTxt }, outputDir: args.outputDir });
      const head = [
        `已提取 ${input.name}（共 ${result.pages} 页，${result.textTotalChars} 字${result.truncated ? '，下面截取前 ' + TEXT_RETURN_CAP + ' 字' : ''}）`,
        written.length ? '全文已落盘：' + written[0].path : '',
      ].filter(Boolean).join('\n');
      return head + '\n\n' + String(result.text || '').slice(0, TEXT_RETURN_CAP);
    },
  },
];

function actionLabel(a) {
  return { extract: '抽页', split: '拆分', rotate: '旋转', delete: '删页' }[a] || a;
}

// ── stdio JSON-RPC（协议数据只走 stdout，日志全走 stderr）──────────────────

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    handleMessage(line).catch((e) => log('error', 'handleMessage: ' + (e && e.stack || e)));
  }
});
process.stdin.on('end', () => process.exit(0));

function writeMsg(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg || {};
  try {
    if (method === 'initialize') {
      writeMsg({
        id, result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
    } else if (method === 'notifications/initialized') {
      // 无响应
    } else if (method === 'tools/list') {
      writeMsg({
        id, result: {
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        },
      });
    } else if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === (params && params.name));
      if (!tool) {
        writeMsg({ id, result: { content: [{ type: 'text', text: '未知工具：' + (params && params.name) }], isError: true } });
        return;
      }
      try {
        const text = await tool.run((params && params.arguments) || {});
        writeMsg({ id, result: { content: [{ type: 'text', text: String(text) }], isError: false } });
      } catch (e) {
        // 业务失败走 isError（AI 能读并自纠），不抛进程异常
        writeMsg({ id, result: { content: [{ type: 'text', text: '失败：' + String((e && e.message) || e) }], isError: true } });
        log('warn', `tools/call ${params && params.name} 业务失败: ${e && e.message}`);
      }
    } else if (method !== undefined && id !== undefined) {
      writeMsg({ id, error: { code: -32601, message: 'method not found: ' + method } });
    }
  } catch (e) {
    if (id !== undefined) writeMsg({ id, error: { code: -32603, message: String((e && e.message) || e) } });
    log('error', 'handler error: ' + (e && e.stack || e));
  }
}

log('info', `zhifang MCP server v${SERVER_VERSION} ready (${APP_CONFIG_DIR || 'no-config-dir'})`);
