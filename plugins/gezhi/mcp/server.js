#!/usr/bin/env node
'use strict';
/**
 * gezhi MCP Server —— 格致（AI Excel 工厂）的 AI 工具层（无状态透传，零 npm 依赖）
 *
 * 职责：把 AI 的「做表格」意图翻译为真实 .xlsx 文件 + cap.kv 登记；
 * 全部计算走 shared/core.js（归一化/护栏/布局）与 shared/render.js（exceljs 渲染）。
 * 无后台服务、无网络外联——文件落在用户可见的导出目录，数据不出设备。
 *
 * 工具一览：
 *   xlsx_build   核心：Sheet Spec → 真实 .xlsx 落盘（样式/公式/条件格式/冻结）+ 登记
 *   xlsx_guide   给 AI 的 spec 契约手册（字段/容量护栏/最小示例/台账配方提示）
 *   xlsx_recent  最近作品（标题/规格/路径/时间）
 *   xlsx_reveal  在资源管理器中定位作品（仅限已登记作品，win/mac/linux 三平台）
 *   xlsx_forget  删除作品登记（confirm=true；不删文件本身）
 *
 * 连接方式与 changqi / pocket-ledger 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const core = require('../shared/core.js');
const render = require('../shared/render.js');

const SERVER_NAME = 'gezhi';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 changqi / pocket-ledger）────────────────────────
const APP_CONFIG_DIR = process.argv[2] || '';
const ENV_HOST = process.env.POLARIS_HOST || '';
const ENV_PORT = parseInt(process.env.POLARIS_PORT || '', 10);
const ENV_TOKEN = process.env.POLARIS_TOKEN || '';

function configCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过 */ }
  }
  if (APP_CONFIG_DIR) cands.push(path.join(APP_CONFIG_DIR, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number') return { host: web.host || '', port: web.port, token: web.token || '' };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/api/health', timeout: 1200 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _ep = null;
function resolveEndpoint() {
  if (!_ep) {
    _ep = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await healthCheck(host, basePort + i)) return { host, port: basePort + i, token };
      }
      return { host, port: basePort, token };
    })();
  }
  return _ep;
}

function polarisIpc(command, args = {}, { retries = 2, retryDelay = 300, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      resolveEndpoint().then((ep) => {
        const data = JSON.stringify(args);
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (ep.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
        const req = http.request(
          { hostname: ep.host, port: ep.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(body); } });
          },
        );
        req.on('error', (e) => {
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error(`Polaris IPC ${command} 失败: ${e.message}`));
        });
        req.on('timeout', () => {
          req.destroy();
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error('Polaris IPC timeout'));
        });
        req.write(data);
        req.end();
      }).catch(reject);
    };
    attempt(0);
  });
}

async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv get 失败');
  return res.result && res.result.value !== undefined ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
  return true;
}
async function kvDel(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv delete 失败');
  return true;
}
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : [];
}

// ── 数据访问 ───────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

async function saveSettings(patch) {
  const cur = await loadSettings();
  const next = { ...cur, ...patch, schemaVersion: 1 };
  await kvSet(core.K.settings, next);
  return next;
}

async function loadBooks() {
  const keys = await kvKeys();
  const bookKeys = keys.filter((k) => k.startsWith(core.K.bookPrefix));
  const books = [];
  for (const bk of bookKeys) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(bk);
    if (v && typeof v === 'object' && v.id) books.push(v);
  }
  books.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return books;
}

/** 导出目录：设置优先（存在且是目录），否则探测 桌面→下载→家目录 */
function defaultExportDir() {
  const home = os.homedir();
  for (const d of [path.join(home, 'Desktop'), path.join(home, 'Downloads'), home]) {
    try { if (fs.statSync(d).isDirectory()) return d; } catch (_) { /* 下一个 */ }
  }
  return home;
}

function resolveExportDir(settings) {
  const configured = settings && typeof settings.exportDir === 'string' ? settings.exportDir.trim() : '';
  if (configured && path.isAbsolute(configured)) {
    try {
      if (fs.statSync(configured).isDirectory()) return { dir: configured, from: '设置' };
      return { dir: defaultExportDir(), from: '缺省（设置的目录不存在）' };
    } catch (_) {
      return { dir: defaultExportDir(), from: '缺省（设置的目录不可访问）' };
    }
  }
  return { dir: defaultExportDir(), from: '缺省' };
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── 工具 ───────────────────────────────────────────────────────────────────
const GUIDE_TEXT = `【格致 Sheet Spec 契约】xlsx_build 的 arguments 本身就是 spec：

{
  "title": "三月采购台账",            // 必填，≤50 字；用于文件名与登记
  "theme": "slate",                  // 可选：slate石墨/indigo靛青/forest林绿/crimson绛红/plain素简
  "sheets": [                        // 必填，1~6 个工作表
    {
      "name": "采购明细",             // sheet 名 ≤31 字符，不可含 : \\ / ? * [ ]
      "caption": "生成于 2026-10-29", // 可选标题行（合并首行）
      "columns": [                   // 必填，≤32 列
        { "h": "品名", "type": "text" },
        { "h": "数量", "type": "int" },
        { "h": "单价", "type": "money" },
        { "h": "小计", "type": "money", "formula": "=B{r}*C{r}" }   // 行公式：{r}=实际行号
      ],
      "rows": [ ["红富士苹果", 12, 3.5], ["香蕉", 20, 2] ],        // ≤2000 行；数值直接给数字
      "stats": [ { "label": "合计", "type": "sum", "cols": [1, 2, 3] } ],  // 真实 =SUM 公式行
      "conditional": [ { "col": 3, "op": "gt", "value": 100, "style": "warn" } ],  // 条件格式
      "zebra": true, "freeze": true, "autofilter": true   // 缺省全开
    }
  ]
}

列类型 type：text 文本 / number 数值 / int 整数 / money 金额（#,##0.00）/ percent 百分比（0.0%）/ date 日期（yyyy-mm-dd，值给 "YYYY-MM-DD"）。
可用 fmt 覆盖默认数字格式（≤24 字符，如 "0.0"、"yyyy/m/d"）。
conditional 的 op：gt/lt/ge/le/eq/ne/contains（contains 匹配文本关键词，value 传字符串）；style：warn 黄/good 绿/bad 红。
stats 的 type：sum/avg/count/max/min；cols 为 0 起始列索引，缺省对全部数值列生效。

容量护栏（超限报错，请拆分或汇总后再建）：≤6 表 / ≤32 列 / ≤2000 行 / 单元格文本 ≤200 字。
行公式只允许引用本行（{r} 占位）；stats 生成的是真实 Excel 公式（改单元格会自动重算）。

台账配方提示：记账（日期/事项/金额列 + sum 合计 + 条件格式标红大额）；库存（品名/数量 + 小于阈值 warn）；考勤（姓名/日期列 + count）；对比表（多 sheet 各一表）。

最小示例（可直接构建验证）：
{"title":"示例","sheets":[{"name":"数据","columns":[{"h":"名称","type":"text"},{"h":"金额","type":"money"}],"rows":[["苹果",3.5],["香蕉",2]],"stats":[{"type":"sum"}]}]}`;

const SHEET_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'sheet 名（≤31 字符，不可含 : \\ / ? * [ ]）' },
    caption: { type: 'string', description: '可选标题行（如「生成于 2026-10-29」）' },
    columns: {
      type: 'array',
      description: '列定义（≤32 列）',
      items: {
        type: 'object',
        properties: {
          h: { type: 'string', description: '表头' },
          type: { type: 'string', enum: core.TYPES, description: '列类型，缺省 text' },
          fmt: { type: 'string', description: '可选自定义数字格式（≤24 字符）' },
          formula: { type: 'string', description: '行公式模板，如 "=B{r}*C{r}"（{r}=行号）；有 formula 的列忽略行值' },
        },
        required: ['h'],
      },
    },
    rows: { type: 'array', description: '数据行（≤2000 行），每行为与 columns 等长的数组', items: { type: 'array' } },
    stats: {
      type: 'array',
      description: '可选汇总行（真实公式）',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '行首标签，缺省「合计/平均…」' },
          type: { type: 'string', enum: Object.keys(core.STATS_FNS), description: '缺省 sum' },
          cols: { type: 'array', description: '生效列索引（0 起始），缺省全部数值列', items: { type: 'integer' } },
        },
      },
    },
    conditional: {
      type: 'array',
      description: '可选条件格式（≤6 条）',
      items: {
        type: 'object',
        properties: {
          col: { type: 'integer', description: '列索引（0 起始）' },
          op: { type: 'string', enum: core.COND_OPS, description: '缺省 gt' },
          value: { description: '阈值数字（contains 时为关键词）' },
          style: { type: 'string', enum: ['warn', 'good', 'bad'], description: '缺省 warn' },
        },
        required: ['col'],
      },
    },
    zebra: { type: 'boolean', description: '斑马纹，缺省 true' },
    freeze: { type: 'boolean', description: '冻结表头，缺省 true' },
    autofilter: { type: 'boolean', description: '筛选，缺省 true' },
  },
  required: ['name', 'columns', 'rows'],
};

const tools = [
  {
    name: 'xlsx_build',
    description: '格致·构建真实 Excel 文件。把整理好的数据表交给它：产出一套带原生表头样式/列宽/数字格式/真实公式（行公式与=SUM汇总）/条件格式/冻结表头/筛选的可编辑 .xlsx，落到用户导出目录并登记。 arguments 就是 Sheet Spec 本身（title/theme/sheets）。用户说「做成 Excel」「导出表格」「给我台账」即用此工具；不确定字段契约时先调 xlsx_guide。数据必须在 arguments 里给全——不要让用户再粘贴。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '工作簿标题（≤50 字），用于文件名与登记' },
        theme: { type: 'string', enum: core.THEME_KEYS, description: '表头主题，缺省 slate' },
        sheets: { type: 'array', description: '1~6 个工作表', items: SHEET_SCHEMA },
      },
      required: ['title', 'sheets'],
    },
    async call(args) {
      const now = Date.now();
      const norm = core.normalizeBook(args);
      if (norm.error) return err(`Spec 未通过校验：${norm.error}\n调 xlsx_guide 获取完整契约与示例，修正后重试。`);
      const { book } = norm;
      const g = core.layout(book);
      const buf = await render.renderToBuffer(book, g);

      const settings = await loadSettings();
      const { dir, from } = resolveExportDir(settings);
      const name = core.safeFileName(book.title, now);
      const filePath = path.join(dir, name.file);
      fs.writeFileSync(filePath, Buffer.from(buf));

      const id = core.makeId(now);
      const sheetCount = book.sheets.length;
      const rowCount = book.sheets.reduce((a, s) => a + s.rows.length, 0);
      const entry = { id, file: name.file, title: book.title, theme: book.theme, sheetCount, rowCount, path: filePath, ts: now };
      await kvSet(core.K.book(id), entry);

      const lines = [
        `✅ 已生成 ${name.file}`,
        `路径：${filePath}（导出目录：${from}）`,
        `规模：${sheetCount} 个工作表 / ${rowCount} 行数据；主题：${core.THEMES[book.theme].label}`,
      ];
      for (const sh of book.sheets) {
        const extras = [];
        if (sh.stats && sh.stats.length) extras.push(`${sh.stats.length} 条汇总公式`);
        if (sh.conditional && sh.conditional.length) extras.push(`${sh.conditional.length} 条条件格式`);
        if (sh.columns.some((c) => c.formula)) extras.push('行公式');
        lines.push(`  · ${sh.name}：${sh.columns.length} 列 × ${sh.rows.length} 行${extras.length ? `（${extras.join('、')}）` : ''}`);
      }
      if (norm.warnings && norm.warnings.length) lines.push(`提示：${norm.warnings.join('；')}`);
      lines.push('文件为原生 OOXML，Excel/WPS 打开即可继续编辑；「在资源管理器中打开」可让我调用 xlsx_reveal 定位。');
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'xlsx_guide',
    description: '格致·spec 契约手册。返回 xlsx_build 的完整字段说明、容量护栏、最小示例与台账配方。构建前拿不准字段/想确认公式写法时调用，一次调用即可，不要重复调用。',
    inputSchema: { type: 'object', properties: {} },
    async call() { return ok(GUIDE_TEXT); },
  },
  {
    name: 'xlsx_recent',
    description: '格致·最近生成的 Excel 作品列表（标题/规格/路径/时间）。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '条数，缺省 10' } },
    },
    async call(args) {
      const limit = Math.max(1, Math.min(50, Number(args && args.limit) || 10));
      const books = (await loadBooks()).slice(0, limit);
      if (!books.length) return ok('还没有作品。对话里说「帮我把这些数据做成 Excel」即可生成。');
      const lines = books.map((b, i) => {
        const d = new Date(b.ts || 0);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return `${i + 1}. ${b.title}（${b.sheetCount} 表 / ${b.rowCount} 行 / ${core.THEMES[b.theme] ? core.THEMES[b.theme].label : b.theme}）\n   ${ds} · ${b.path}`;
      });
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'xlsx_reveal',
    description: '格致·在资源管理器中定位某个已生成的 Excel 文件（Windows/macOS/Linux 三平台）。只接受 xlsx_recent 里列出的作品路径。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '作品路径（来自 xlsx_recent）' } },
      required: ['path'],
    },
    async call(args) {
      const p = String((args && args.path) || '').trim();
      if (!p) return err('path 必填（来自 xlsx_recent）');
      const books = await loadBooks();
      const hit = books.find((b) => b.path === p);
      if (!hit) return err('该路径不在作品登记中——出于安全考虑只允许定位已生成的作品。先调 xlsx_recent 获取路径。');
      try { fs.accessSync(p); } catch (_) { return err(`文件已不存在：${p}（可能被移动或删除）`); }
      const dir = path.dirname(p);
      try {
        if (process.platform === 'win32') {
          spawn('explorer', ['/select,' + p], { detached: true, stdio: 'ignore' }).unref();
        } else if (process.platform === 'darwin') {
          spawn('open', ['-R', p], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
        }
        return ok(`已在文件管理器中定位：${p}`);
      } catch (e) {
        return ok(`定位失败（${e.message}），请手动打开目录：${dir}`);
      }
    },
  },
  {
    name: 'xlsx_forget',
    description: '格致·删除作品登记（仅移除列表记录，不删除文件本身）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '作品 id（xlsx_recent 返回）' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['id', 'confirm'],
    },
    async call(args) {
      if (!args || args.confirm !== true) return err('删除登记需显式 confirm=true（文件不会被删除）。');
      const id = String(args.id || '');
      const key = core.K.book(id);
      const v = await kvGet(key);
      if (!v) return err(`作品 ${id} 不存在（或已删除）。`);
      await kvDel(key);
      return ok(`已移除登记「${v.title}」。文件本身保留在：${v.path}`);
    },
  },
];

// ── stdio JSON-RPC（同 changqi）────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

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
