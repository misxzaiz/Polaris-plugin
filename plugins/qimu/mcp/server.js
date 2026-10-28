#!/usr/bin/env node
'use strict';
/**
 * qimu MCP Server —— 启幕（AI PPT 工厂）的 AI 工具层（零依赖，自发现）
 *
 * 职责：把 AI 的"做一套 PPT"意图变成真实交付物——deck spec 经 shared/core.js
 * 归一化（容量护栏）+ 几何布局，经 render.js 产出原生可编辑 PPTX 落盘到用户
 * 导出目录（默认桌面），并登记到 cap.kv（面板/最近作品同源可见）。
 *
 * 工具一览：
 *   ppt_guide   给 AI 的版式说明书（7 类版式容量规则 + 最小完整示例）
 *   ppt_build   核心：deck spec → 真实 .pptx 落盘 + 登记 → 返回路径与摘要
 *   ppt_reveal  在系统文件管理器中定位产物（explorer/open/xdg-open）
 *   ppt_recent  最近作品列表
 *   ppt_forget  删除作品登记（不删文件，confirm=true）
 *
 * 连接方式与 pocket-ledger / shouzha 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const core = require('../shared/core.js');
const { renderDeck } = require('./render.js');

const SERVER_NAME = 'qimu';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 pocket-ledger / shouzha）────────────────────────
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
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay);
          else reject(new Error(`IPC ${command} 失败: ${e.message}`));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`IPC ${command} 超时`)); });
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
  return (res.result && res.result.value) ?? null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
}
async function kvDel(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv delete 失败');
}
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  return (res.result && res.result.keys) || [];
}

async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

/** 导出目录解析：settings.exportDir > 桌面 > Downloads > 家目录（都做存在性探测） */
function resolveExportDir(settings) {
  const candidates = [];
  if (settings.exportDir && typeof settings.exportDir === 'string' && path.isAbsolute(settings.exportDir)) {
    candidates.push(settings.exportDir);
  }
  candidates.push(path.join(os.homedir(), 'Desktop'));
  candidates.push(path.join(os.homedir(), 'Downloads'));
  candidates.push(os.homedir());
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c; } catch (_) { /* 下一个 */ }
  }
  return os.homedir();
}

// ── 工具结果封装 ───────────────────────────────────────────────────────────
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const GUIDE_TEXT = `启幕 · deck spec 版式说明书（ppt_build 的 deck 参数）

顶层：{ title(必填≤60字), subtitle?, author?, theme?, slides[] }
theme 可选：${core.THEME_KEYS.join(' / ')}

七类版式（slides 元素，容量超限会被要求拆页——宁可多页不要硬塞）：
1. {"type":"cover"}                        封面（自动取 title/subtitle/author；通常省略，自动补首尾页）
2. {"type":"section","title":"章节名","note":"补充"}  章节隔页（title≤40）
3. {"type":"bullets","title":"页标题","bullets":["纯要点" 或 {"h":"小标题","d":"说明"}]}
   ≤6 条；纯要点≤90 字；h≤24 字、d≤110 字
4. {"type":"two","title":"对比页","left":{"h":"栏标题","points":["…","…"]},"right":{…}}
   每侧 ≤5 点，每点 ≤70 字
5. {"type":"quote","text":"引言","author":"出处"}   引言页（≤130 字）
6. {"type":"chart","title":"图表标题","note":"脚注?","chart":{"kind":"bar|line|pie","labels":["类别…"],"series":[{"name":"系列名","values":[数字…]}]}}
   ≤8 个类别、≤3 个系列，labels 与每个 series.values 等长；pie 取第一个系列
7. {"type":"table","title":"表格标题","head":["列…"],"rows":[["单元格…"]]}
   ≤6 列 ×8 行，单元格 ≤40 字
8. {"type":"end","note":"结束语?"}          结尾页（缺省"谢谢观看"）

最小完整示例（可直接 ppt_build）：
{"title":"季度经营汇报","subtitle":"2026 Q3","author":"经营部","theme":"midnight","slides":[
 {"type":"section","title":"业务回顾"},
 {"type":"bullets","title":"核心成果","bullets":[{"h":"收入增长 32%","d":"新签 120 家，续约率 91%"},"交付三个大版本"]},
 {"type":"chart","title":"月度收入","chart":{"kind":"bar","labels":["7月","8月","9月"],"series":[{"name":"收入","values":[420,468,512]}]}},
 {"type":"table","title":"分区数据","head":["区域","收入"],"rows":[["华东","1842"],["华北","1105"]]},
 {"type":"two","title":"下一步","left":{"h":"做深","points":["KA 续约","交付提效"]},"right":{"h":"做大","points":["渠道下沉","海外试点"]}}]}

写作要点：先列提纲再填版式；数据页优先 chart/table；每页信息密度宁少勿多；
篇幅建议 8-15 页；标题具体化（"收入增长 32%" 优于 "收入情况"）。`;

const tools = [
  {
    name: 'ppt_guide',
    description: '启幕·版式说明书。做 PPT 前先读本工具：7 类版式的容量规则、主题清单与最小完整 deck spec 示例。读完再用 ppt_build 提交。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      return ok(GUIDE_TEXT);
    },
  },
  {
    name: 'ppt_build',
    description: '启幕·核心工具：把 deck spec 渲染成真实可编辑的 .pptx 文件并落盘（默认桌面）。构建前建议先读 ppt_guide。返回文件路径、页数与主题；超限时返回具体拆页建议。',
    inputSchema: {
      type: 'object',
      properties: {
        deck: {
          type: 'object',
          description: '完整 deck spec（见 ppt_guide）：{ title, subtitle?, author?, theme?, slides[] }',
        },
        fileName: { type: 'string', description: '可选：自定义文件名（不含扩展名与路径，非法字符会被剥除）' },
      },
      required: ['deck'],
    },
    async call(args) {
      const settings = await loadSettings();
      const r = core.normalizeDeck(args.deck);
      if (r.error) return err(`deck spec 校验未通过（请修正后重试，宁拆页不硬塞）：\n- ${r.error.split('；').join('\n- ')}`);
      const deck = r.deck;
      const named = args.fileName && typeof args.fileName === 'string'
        ? { ...core.safeFileName(args.fileName), file: `qimu-${core.safeFileName(args.fileName).name}.pptx` }
        : core.safeFileName(deck.title);
      const dir = resolveExportDir(settings);
      const filePath = path.join(dir, named.file);
      let buf;
      try {
        buf = await renderDeck(deck, { outputType: 'nodebuffer' });
      } catch (e) {
        return err(`渲染失败：${e.message}`);
      }
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, buf);
      } catch (e) {
        return err(`写入失败（${filePath}）：${e.message}。可在面板「设置」里换一个导出目录。`);
      }
      const id = core.makeId();
      const record = {
        id, file: named.file, title: deck.title, theme: deck.theme,
        slideCount: deck.slides.length, path: filePath, ts: Date.now(), source: 'ai',
      };
      await kvSet(core.K.deck(id), record);
      const sizeKb = Math.round(buf.length / 1024);
      return ok([
        `✅ 已生成：${filePath}`,
        `id=${id}`,
        `${deck.slides.length} 页 · ${deck.theme} 主题 · ${sizeKb}KB · 原生可编辑 PPTX`,
        `后续可用 ppt_reveal 在资源管理器中定位它；面板「作品」Tab 也有记录。`,
        ...(r.warnings ? [`⚠️ ${r.warnings.join('；')}`] : []),
      ].join('\n'));
    },
  },
  {
    name: 'ppt_reveal',
    description: '启幕·在系统文件管理器中定位一个已生成的 PPTX（用户说"打开/找到它"时调用）。可用 id（ppt_build/ppt_recent 返回）或绝对路径。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '作品 id（推荐）' },
        path: { type: 'string', description: '或直接给文件绝对路径' },
      },
    },
    async call(args) {
      let filePath = typeof args.path === 'string' ? args.path : '';
      if (!filePath && args.id) {
        const rec = await kvGet(core.K.deck(String(args.id).slice(0, 40)));
        if (rec && typeof rec.path === 'string') filePath = rec.path;
      }
      if (!filePath || !path.isAbsolute(filePath)) return err('需要作品 id 或文件绝对路径');
      if (!fs.existsSync(filePath)) return err(`文件不存在（可能被移动或删除）：${filePath}`);
      const dir = path.dirname(filePath);
      try {
        if (process.platform === 'win32') {
          spawn('explorer', ['/select,', filePath], { detached: true, stdio: 'ignore' }).unref();
        } else if (process.platform === 'darwin') {
          spawn('open', ['-R', filePath], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
        }
      } catch (e) {
        return ok(`未能自动打开文件管理器（${e.message}），文件在这里：${filePath}`);
      }
      return ok(`已在文件管理器中定位：${filePath}`);
    },
  },
  {
    name: 'ppt_recent',
    description: '启幕·最近生成的 PPT 作品列表（标题/页数/主题/路径/时间）。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.deckPrefix));
      if (!keys.length) return ok('还没有作品。用 ppt_build 生成第一套 PPT。');
      const recs = (await Promise.all(keys.map((k) => kvGet(k).catch(() => null))))
        .filter((r) => r && typeof r === 'object' && typeof r.path === 'string')
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const lines = recs.slice(0, 20).map((r) => {
        const exists = fs.existsSync(r.path);
        return `- ${r.title}（${r.slideCount} 页 · ${r.theme}）· ${new Date(r.ts).toLocaleString('zh-CN', { hour12: false })} · id=${r.id}${exists ? '' : ' · 文件已不在原位'}\n  ${r.path}`;
      });
      return ok(`共 ${recs.length} 个作品（新→旧）：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'ppt_forget',
    description: '启幕·删除一条作品登记（面板/最近列表不再显示）。只删登记，不删文件本身。confirm=true 才执行。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '作品 id' },
        confirm: { type: 'boolean', description: '必须为 true' },
      },
      required: ['id'],
    },
    async call(args) {
      if (args.confirm !== true) return err('只删登记不删文件；确认请带 confirm=true。文件本身的删除请在文件管理器里手动进行。');
      const id = String(args.id || '').slice(0, 40);
      const rec = await kvGet(core.K.deck(id));
      if (!rec) return err(`作品 ${id} 不存在（ppt_recent 可查）`);
      await kvDel(core.K.deck(id));
      return ok(`已删除登记：「${rec.title}」。文件仍在 ${rec.path}（未删除）。`);
    },
  },
];

// ── JSON-RPC stdio 骨架（与 pocket-ledger / shouzha 相同）──────────────────
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    void handle(msg);
  }
});

async function handle(msg) {
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
  if (String(msg.method || '').startsWith('notifications/')) return;
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
