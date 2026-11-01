#!/usr/bin/env node
'use strict';
/**
 * pdf-tables MCP Server —— 表格提取台的 AI 工具层
 *
 * 把 AI 的「提取 PDF 表格」意图变成真实落盘数据文件：路径进 → table-engine
 * 检测/提取 → 输出自动命名落盘（永不覆盖）→ 返回路径与摘要。与面板服务共用
 * 同一引擎（service/table-engine.js），口径不漂移。
 *
 * 工具一览（3 个）：
 *   pdf_tables_info      检测 PDF 里有哪些表格（逐页行列数/表头/填充率），只读
 *   pdf_tables_preview   把检出的表格以 markdown/tsv 文本返回（AI 直接读数，可选跨页合并）
 *   pdf_tables_extract   提取为 xlsx/csv/json 落盘（数字列自动转数值，永不覆盖）
 *
 * 安全底线：输入永不修改/删除；输出永不覆盖（自动 -2/-3）；扫描件/加密 PDF
 * 明确拒绝并明示不做 OCR/破解；零外网请求。历史登记经 cap.kv（降级容忍）。
 *
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/core.js');
const engine = require('../service/table-engine.js');
const { createKvClient } = require('../service/kvclient.js');

const SERVER_NAME = 'pdf-tables';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const MAX_INPUT_BYTES = 300 * 1024 * 1024; // 引擎全内存操作的单文件上限
const READ_RETURN_CAP = 40000;

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const APP_CONFIG_DIR = process.argv[2] || '';
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const KEY_HISTORY = 'pdf-tables.history.';
const KEY_SETTINGS = 'pdf-tables.settings';

// ── 输入读取与输出落盘 ──────────────────────────────────────────────────────

function readPdfInput(p) {
  if (typeof p !== 'string' || !p.trim()) {
    throw new Error('缺少文件路径：请提供 PDF 的绝对路径（如 C:\\Users\\me\\Desktop\\流水.pdf）');
  }
  const full = p.trim();
  if (!path.isAbsolute(full)) {
    throw new Error('路径必须是绝对路径（如 C:\\Users\\me\\Desktop\\流水.pdf），收到：' + full);
  }
  let st;
  try { st = fs.statSync(full); } catch (_) {
    throw new Error('文件不存在：' + full + '（确认盘符/路径拼写，中文路径请原样给出）');
  }
  if (!st.isFile()) throw new Error('不是文件（可能是目录）：' + full);
  if (st.size > MAX_INPUT_BYTES) {
    throw new Error('文件 ' + core.formatBytes(st.size) + ' 超过单文件上限 ' + core.formatBytes(MAX_INPUT_BYTES) + '：请先拆分');
  }
  const bytes = fs.readFileSync(full);
  if (!core.isPdfBytes(bytes)) {
    throw new Error(path.basename(full) + ' 不是 PDF（文件头缺少 %PDF- 标识）');
  }
  return { name: path.basename(full), bytes, fullPath: full };
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
    if (typeof explicit !== 'string' || !path.isAbsolute(explicit.trim())) {
      throw new Error('outputDir 必须是绝对路径（如 C:\\Users\\me\\Desktop），收到：' + explicit);
    }
    candidates.push(explicit.trim());
  }
  if (settings.outDir) candidates.push(settings.outDir);
  if (inputPath) candidates.push(path.dirname(inputPath));
  candidates.push(path.join(os.homedir(), 'Desktop'), os.homedir());
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
    const ext = path.extname(o.name) || '.bin';
    const target = core.pickOutputName(outDir, core.sanitizeStem(o.name.replace(ext, '')), ext, exists);
    fs.writeFileSync(target, o.bytes);
    return { name: path.basename(target), path: target, size: o.bytes.length };
  });
}

async function registerHistory(record) {
  try {
    await kv.kvSet(KEY_HISTORY + record.id, record);
  } catch (e) {
    log('warn', '历史登记失败（不影响输出）: ' + e.message);
  }
}

async function execute(op, input, params, outputDir) {
  const started = Date.now();
  const settings = await readSettingsSafe();
  const outDir = op === 'extract' ? resolveOutDir(outputDir, input.fullPath, settings) : '';
  const result = await engine.runOp(op, [input], params || {});
  const written = op === 'extract' ? writeOutputs(outDir, result.outputs) : [];
  const record = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    op,
    source: 'mcp',
    inputs: [input.name],
    outputs: written,
    tables: result.totalTables !== undefined ? result.totalTables : (result.tablesExtracted || 0),
    rows: result.rowsTotal || 0,
    ms: Date.now() - started,
    ok: true,
  };
  await registerHistory(record);
  return { result, written };
}

// ── 工具定义（description 写「适用句式」，AI 靠它匹配意图）──────────────────

const TOOLS = [
  {
    name: 'pdf_tables_info',
    description: '检测一个 PDF 里有哪些表格：逐页给出行列数、表头、填充率与前几行预览。适用：「这个 PDF 里有表格吗」「看看这份流水 PDF 的表格结构」。只读，不产生文件。扫描件/图片型 PDF 无文字层会明确报错（本工具不做 OCR）。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'PDF 文件绝对路径' },
        pages: { type: 'string', description: '可选页码规格（如 1-5），默认全部页' },
      },
      required: ['path'],
    },
    async run(args) {
      const input = readPdfInput(args.path);
      const { result } = await execute('detect', input, { pages: args.pages }, '');
      const lines = [`文件：${input.name}（共 ${result.pages} 页，检出 ${result.totalTables} 张表格）`];
      for (const pr of result.pageResults) {
        if (!pr.tables.length) {
          lines.push(`第 ${pr.page} 页：未检出表格${pr.textLess ? '（无文字层）' : ''}`);
          continue;
        }
        pr.tables.forEach((t, i) => {
          lines.push(`第 ${pr.page} 页表格${pr.tables.length > 1 ? '-' + (i + 1) : ''}：${t.rowsCount} 行 × ${t.colCount} 列，填充率 ${Math.round(t.fillRatio * 100)}%`);
          lines.push('  表头：' + (t.header || []).join(' | '));
          const pv = (t.preview || []).slice(1, 4);
          for (const r of pv) lines.push('  例：' + r.join(' | '));
        });
      }
      if (result.note) lines.push(result.note);
      return lines.join('\n');
    },
  },
  {
    name: 'pdf_tables_preview',
    description: '把 PDF 里检出的表格以文本返回（markdown 或 tsv），供你直接阅读/核对/续答。默认把同构表头跨页合并成一张完整表（适合流水/对账单逐页续表）。适用：「把这份流水的内容读出来」「帮我核对 PDF 表格里的金额」（先用本工具取数再分析）。可选 format=tsv、blockIndex 读第 N 张表、maxRows 截断。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'PDF 文件绝对路径' },
        pages: { type: 'string', description: '可选页码规格（如 1-5），默认全部页' },
        blockIndex: { type: 'number', description: '可选：读第几张表（0 起，默认第一张；跨页合并后通常只有一张）' },
        maxRows: { type: 'number', description: '可选：最多返回行数（默认 200，上限 2000）' },
        format: { type: 'string', enum: ['markdown', 'tsv'], description: '返回格式，默认 markdown' },
      },
      required: ['path'],
    },
    async run(args) {
      const input = readPdfInput(args.path);
      const { result } = await execute('read', input, {
        pages: args.pages, blockIndex: args.blockIndex, maxRows: args.maxRows, format: args.format,
      }, '');
      const head = [
        `已读取 ${input.name}：第 ${result.sourcePages.join('/')} 页（${result.rowsTotal} 行 × ${result.colCount} 列${result.truncated ? '，行数已按 maxRows 截断' : ''}）`,
        result.note || '',
      ].filter(Boolean).join('\n');
      const text = String(result.text || '').slice(0, READ_RETURN_CAP);
      return head + '\n\n' + text + (result.text.length > READ_RETURN_CAP ? '\n…（文本超长已截断，extract 可全量落盘）' : '');
    },
  },
  {
    name: 'pdf_tables_extract',
    description: '把 PDF 里的表格提取为真正的数据文件落盘：xlsx（数字列自动转数值可直接 SUM、表头冻结加粗）、csv（UTF-8 BOM 中文 Excel 直开）、json，或 all 全要。默认跨页续表合并。适用：「把这份流水 PDF 提取成 Excel」「把报表里的表格导出成 CSV」。输出自动命名（<原文件名>-表格.xlsx），永不覆盖已有文件。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'PDF 文件绝对路径' },
        pages: { type: 'string', description: '可选页码规格（如 1-5），默认全部页' },
        format: { type: 'string', enum: ['xlsx', 'csv', 'json', 'all'], description: '输出格式，默认 xlsx' },
        mergePages: { type: 'boolean', description: '跨页续表合并（同构表头去重拼成一张完整表），默认 true' },
        outputDir: { type: 'string', description: '可选：输出目录（默认源文件所在目录）' },
      },
      required: ['path'],
    },
    async run(args) {
      const input = readPdfInput(args.path);
      const { result, written } = await execute('extract', input, {
        pages: args.pages,
        format: args.format,
        mergePages: args.mergePages,
      }, args.outputDir);
      return [
        `提取完成：${result.tablesExtracted} 张表、共 ${result.rowsTotal} 行（${result.mergedPages ? '跨页已合并' : '逐页独立'}，格式 ${result.format}）`,
        result.note || '',
        '输出：' + written.map((w) => w.path + '（' + core.formatBytes(w.size) + '）').join('\n'),
      ].filter(Boolean).join('\n');
    },
  },
];

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

log('info', `pdf-tables MCP server v${SERVER_VERSION} ready (${APP_CONFIG_DIR || 'no-config-dir'})`);
