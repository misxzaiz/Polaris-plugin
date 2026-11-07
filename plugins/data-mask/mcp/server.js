#!/usr/bin/env node
'use strict';
/**
 * data-mask MCP Server —— 数据脱敏台 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成三类动作——
 *   mask_text  纯核就地脱敏（core require 进程内跑，不依赖服务），台账增量落 kv；
 *   mask_file / mask_dir  命令投递给后台服务（fs 权威在服务），轮询 result 键；
 *   mask_types / mask_status  能力与状态只读查询。
 *
 * 不泄露不变量：所有面向 AI 的返回【不含任何原值】——命中只给 displayPreview
 * 掩码形态与统计；映射台账永不进返回；本层不提供还原（面板专属）。
 *
 * 工具一览（5 个）：
 *   mask_text   脱敏一段文本（日志/JSON/CSV/SQL 片段），返回脱敏后文本 + 统计
 *   mask_file   脱敏一个文件 → 写 <name>.masked.<ext>，返回输出路径与统计
 *   mask_dir    批量脱敏目录 → 镜像输出 <dir>.masked/，返回清单摘要
 *   mask_types  检测类型与模式说明
 *   mask_status 服务心跳 / 最近任务 / 台账规模（只给规模不给内容）
 *
 * 连接：复用 service/kvclient.js 端点自发现。启动参数：node mcp/server.js {{appConfigDir}}
 */
const fs = require('fs');

const { createKvClient } = require('../service/kvclient');
const core = require('../shared/mask-core');

const SERVER_NAME = 'data-mask';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'datamask.meta',
  latest: 'datamask.latest',
  ledgerMeta: 'datamask.ledger.meta',
  ledgerChunk: (owner, n) => `datamask.ledger.${owner}.${n}`,
  cmd: (nonce) => `datamask.cmd.mask.${nonce}`,
  result: (nonce) => `datamask.result.${nonce}`,
};
const MAX_TEXT_INPUT = 150 * 1024;   // 经 kv 命令键/进程内一致的上限
const MAX_TEXT_OUTPUT = 30 * 1024;   // 面向 AI 的输出截断（上下文预算保护）

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (lv, msg) => log(lv, msg) });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function oneLine(s, n = 120) {
  const s2 = String(s || '').replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
}
function genId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

/** 盐先到先写（与 service/main.js 同规则：读者绝不覆盖） */
async function ensureSalt() {
  const meta = await kv.kvGet(K.ledgerMeta).catch(() => null);
  if (meta && typeof meta.salt === 'string' && meta.salt) return meta.salt;
  const salt = core.genSalt();
  const cur = await kv.kvGet(K.ledgerMeta).catch(() => null);
  if (cur && typeof cur.salt === 'string' && cur.salt) return cur.salt;
  await kv.kvSet(K.ledgerMeta, { salt, createdAt: Date.now(), entryCount: 0 }).catch(() => {});
  return salt;
}

async function loadSettings() {
  const v = await kv.kvGet('datamask.settings').catch(() => null);
  return v && typeof v === 'object' ? v : {};
}

/** 台账增量落 kv（owner 维度分块） */
async function persistLedger(owner, newEntries) {
  if (!newEntries || !newEntries.length) return 0;
  for (let i = 0; i < newEntries.length; i += 150) {
    await kv.kvSet(K.ledgerChunk(owner, Math.floor(i / 150)), newEntries.slice(i, i + 150)).catch(() => {});
  }
  const meta = await kv.kvGet(K.ledgerMeta).catch(() => null);
  if (meta && typeof meta === 'object') {
    meta.entryCount = (meta.entryCount || 0) + newEntries.length;
    await kv.kvSet(K.ledgerMeta, meta).catch(() => {});
  }
  return newEntries.length;
}

function statsLine(stats) {
  const parts = Object.entries(stats || {}).map(([t, n]) => `${core.TYPES[t] ? core.TYPES[t].label : t}×${n}`);
  return parts.length ? parts.join('、') : '未发现敏感信息';
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolMaskText(args) {
  const text = String(args.text || '');
  if (!text.trim()) return err('缺少 text 参数：把要脱敏的日志/JSON/CSV/SQL 片段直接贴进来。');
  const truncated = text.length > MAX_TEXT_INPUT;
  const input = truncated ? text.slice(0, MAX_TEXT_INPUT) : text;

  const settings = await loadSettings();
  const salt = await ensureSalt();
  const owner = `mcp-${genId()}`;
  const r = core.maskText(input, {
    types: settings.types || {},
    structural: settings.structural !== false,
    csv: settings.csv !== false,
    cnameAggressive: !!settings.cnameAggressive,
    ipv4KeepPrivate: settings.ipv4KeepPrivate !== false,
    customRules: Array.isArray(settings.customRules) ? settings.customRules : [],
    salt,
    exposeOriginal: false, // 铁律：AI 侧永远不暴露原值
  });
  const stored = await persistLedger(owner, r.newEntries).catch(() => -1);

  const outText = r.output.length > MAX_TEXT_OUTPUT
    ? r.output.slice(0, MAX_TEXT_OUTPUT) + `\n…（输出已截断，完整 ${r.output.length} 字符见本地台账/面板）`
    : r.output;
  const lines = [
    `脱敏完成：${statsLine(r.stats)}${r.truncated || truncated ? '（输入超限已截断）' : ''}`,
    `映射已记入本地台账${stored >= 0 ? `（+${stored} 条）` : '（台账暂不可达：假名本批仍一致，跨批一致性待恢复）'}。同原值→同假名。`,
    '',
    '──── 脱敏后文本 ────',
    outText,
  ];
  return ok(lines.join('\n'));
}

async function toolMaskFile(args) {
  const p = String(args.path || '').trim();
  if (!p) return err('缺少 path 参数：要脱敏的文件绝对路径。');
  let st;
  try { st = fs.statSync(p); } catch (_) { return err(`文件不存在或不可访问：${p}`); }
  if (!st.isFile()) return err(`${p} 不是文件（目录请用 mask_dir）。`);
  return await dispatchAndWait({ kind: 'file', path: p, from: 'mcp' }, '文件');
}

async function toolMaskDir(args) {
  const p = String(args.path || '').trim();
  if (!p) return err('缺少 path 参数：要批量脱敏的目录绝对路径。');
  let st;
  try { st = fs.statSync(p); } catch (_) { return err(`目录不存在或不可访问：${p}`); }
  if (!st.isDirectory()) return err(`${p} 不是目录（单文件请用 mask_file）。`);
  return await dispatchAndWait({ kind: 'dir', path: p, from: 'mcp' }, '目录批量');
}

async function dispatchAndWait(payload, label) {
  const meta = await kv.kvGet(K.meta).catch(() => null);
  if (meta && meta.job && meta.job.id) return err(`服务正在处理另一个任务（${oneLine(meta.job.path, 50)}），稍后再试。`);

  const nonce = genId();
  await kv.kvSet(K.cmd(nonce), { ...payload, at: Date.now() });
  log('info', `已投递命令 nonce=${nonce} kind=${payload.kind} path=${payload.path}`);

  const deadline = Date.now() + 90 * 1000;
  while (Date.now() < deadline) {
    await sleep(1000);
    const r = await kv.kvGet(K.result(nonce)).catch(() => null);
    if (!r) continue;
    await kv.kvDel(K.result(nonce)).catch(() => {});
    if (!r.ok) return err(`${label}脱敏失败：${r.error || '未知错误'}`);
    if (payload.kind === 'file') {
      const s = statsLine(r.stats);
      const previews = (r.previews || []).slice(0, 10).map((h) => `${h.type}:${h.preview}`);
      return ok([
        `文件脱敏完成（${s}，共 ${r.hitCount} 处命中）。`,
        `输出文件：${r.out}`,
        r.truncated ? '⚠ 输入超限已截断，未覆盖全文。' : '',
        previews.length ? `命中预览（已掩码）：${previews.join('，')}` : '',
        '映射台账只存本机。可以用文件工具读取上面的输出文件继续分析（内容已是脱敏形态）。',
      ].filter(Boolean).join('\n'));
    }
    const m = r.manifest || {};
    return ok([
      `目录批量脱敏完成：${m.masked || 0}/${m.files || 0} 个文本文件 → 输出目录 ${r.outDir}`,
      m.skippedBinary ? `跳过二进制 ${m.skippedBinary}` : '',
      m.skippedSize ? `跳过超大 ${m.skippedSize}` : '',
      m.errors ? `出错 ${m.errors}` : '',
      r.truncated ? '⚠ 文件数达上限，未遍历全目录。' : '',
      '每个文件按原相对路径镜像输出；映射台账只存本机。',
    ].filter(Boolean).join('\n'));
  }
  return ok(`${label}脱敏已发起（${payload.path}），90 秒内未完成——大目录属正常，稍后用 mask_status 查询。`);
}

function toolTypes() {
  const lines = [`内置 ${core.TYPE_ORDER.length} 类检测（值级全部过校验位，结构感知键驱动）：`, ''];
  for (const t of core.TYPE_ORDER) {
    const tt = core.TYPES[t];
    lines.push(`· ${tt.label}（${t}）默认 ${tt.defaultMode}${tt.structuralOnly ? '，仅键名驱动' : ''}${tt.confirm ? '，命中需人工复核' : ''}`);
  }
  lines.push('',
    '三种模式：partial=部分打码（138****5678，不可还原）；fake=确定性假名（同原值同假名、保格式保校验，可经本地台账还原）；label=占位标签（〔手机号1〕）。',
    '不泄露不变量：本插件的任何返回都不含原值；映射台账（原值→假名）只存本机 kv。');
  return ok(lines.join('\n'));
}

async function toolStatus() {
  const meta = await kv.kvGet(K.meta).catch(() => null);
  const latest = await kv.kvGet(K.latest).catch(() => null);
  const lm = await kv.kvGet(K.ledgerMeta).catch(() => null);
  const lines = [];
  if (!meta) {
    lines.push('后台服务没有心跳：文件/目录脱敏不可用（mask_text 纯文本脱敏不受影响）。');
    lines.push('去 Polaris 设置→插件→数据脱敏台 检查服务状态。');
  } else {
    const age = meta.lastTickAt ? Math.round((Date.now() - meta.lastTickAt) / 1000) : Infinity;
    lines.push(`服务 v${meta.version || '?'} 心跳 ${age}s 前${meta.degraded ? '（桥降级：' + (meta.lastBridgeErr || '未知') + '）' : ''}${meta.saltReady ? '' : '（盐未就绪）'}`);
    if (meta.job) lines.push(`任务进行中：${meta.job.kind} ← ${oneLine(meta.job.path, 80)}`);
  }
  if (lm) lines.push(`台账：${lm.entryCount || 0} 条映射（内容不外显，重置即销毁）`);
  if (latest) {
    lines.push(`最近任务 ${latest.kind} ← ${oneLine(latest.path, 80)}（${new Date(latest.at).toLocaleString()}）`);
  } else {
    lines.push('还没有文件/目录任务。');
  }
  return ok(lines.join('\n'));
}

// ── 工具注册（description 写「适用句式」，决定 AI 会不会用）───────────────────
const tools = [
  {
    name: 'mask_text',
    description: '把一段文本里的个人信息（手机号/身份证/银行卡/邮箱/IP/车牌/统一社会信用代码/中文姓名/地址/出生日期）脱敏后再分析。适用于用户贴来「帮我看看这段日志/这份数据」且内容含手机号身份证等敏感信息时——先调本工具，再分析返回的脱敏文本。同原值同假名，多段数据的人物关联性保持。返回脱敏后文本与统计，不含任何原值。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要脱敏的原始文本（日志/JSON/CSV/SQL 片段均可，上限 150KB）' },
      },
      required: ['text'],
    },
    call: toolMaskText,
  },
  {
    name: 'mask_file',
    description: '把本机一个文件里的个人信息脱敏，输出 <文件名>.masked.<扩展名> 新文件（绝不覆盖原件）。适用于「把这份数据脱敏后给我分析」「先脱敏 D:\\data\\用户表.csv」。返回输出路径与命中统计（全掩码），随后可用文件工具读输出文件继续分析。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要脱敏的文件绝对路径' },
      },
      required: ['path'],
    },
    call: toolMaskFile,
  },
  {
    name: 'mask_dir',
    description: '批量脱敏一个目录下的文本文件（自动跳过依赖/二进制/图片），按原相对路径镜像输出到 <目录名>.masked/。适用于「把这份导出数据整个脱敏」「脱敏 D:\\export 下所有 csv/json/log」。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要批量脱敏的目录绝对路径' },
      },
      required: ['path'],
    },
    call: toolMaskDir,
  },
  {
    name: 'mask_types',
    description: '列出数据脱敏台的检测类型、三种脱敏模式（部分打码/确定性假名/占位标签）与隐私边界。适用于用户问「你能脱敏什么」「假名是怎么回事」。',
    inputSchema: { type: 'object', properties: {} },
    call: () => toolTypes(),
  },
  {
    name: 'mask_status',
    description: '查看数据脱敏台状态：服务心跳、最近文件任务、台账规模（只给条数不给内容）。适用于「脱敏完了吗」「台账里有多少映射」。',
    inputSchema: { type: 'object', properties: {} },
    call: toolStatus,
  },
];

// ── stdio JSON-RPC 骨架（协议数据只走 stdout，日志全走 stderr）────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      respond(msg.id, { content: [{ type: 'text', text: `未知工具 ${name}` }], isError: true });
      return;
    }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => {
        log('error', `tools/call ${name} 异常: ${e && (e.stack || e.message)}`);
        respond(msg.id, { content: [{ type: 'text', text: `工具内部错误：${e && e.message}` }], isError: true });
      });
    return;
  }
  if (msg.id !== undefined) {
    respond(msg.id, { error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

function respond(id, result) {
  const payload = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

log('info', `data-mask MCP server 启动 v${SERVER_VERSION}（appConfigDir=${APP_CONFIG_DIR || '未提供'}）`);
