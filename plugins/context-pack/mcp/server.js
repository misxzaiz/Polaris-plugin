#!/usr/bin/env node
'use strict';
/**
 * server.js —— 上下文打包台 MCP Server（零依赖，stdio JSON-RPC 2.0）
 *
 * AI 自助打包入口：三个工具，全部直连 fs（复用 shared/core.js），不依赖宿主服务存活：
 *   ctx_scan     目录概览（忽略规则生效）：汇总统计 + 树文本（可截断）+ 顶层分布
 *   ctx_estimate 文件级 token/大小估算（不生成内容）
 *   ctx_pack     打包写文件 <dataRoot>/polaris-context/bundles/，返回统计 + 预览；
 *                文本 ≤ inlineBytes（默认 24KB）时全文内联；同时写 cpk.pack.<id> 索引键
 *                （origin='mcp'，无内容分块）让面板包历史可见 —— bridge 不可达时静默降级
 *
 * 启动参数：node server.js <appConfigDir>
 * 安全边界：只读用户显式指定的目录；唯一写路径是 polaris-context/bundles/ 的 bundle 文件。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const core = require('../shared/core');
const { createKvClient } = require('../shared/kvclient');

const VERSION = core.VERSION;
const PACK_PREFIX = 'cpk.pack.';

// ── stdio JSON-RPC（换行分帧；stdout 仅协议数据）────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

const TOOLS = [
  {
    name: 'ctx_scan',
    description: '扫描一个本地目录（代码仓库/文件夹），返回文件统计与目录树，用于决定打包哪些文件。自动忽略 .git/node_modules 等并遵循 .gitignore；每个文件附启发式 token 估算。大目录返回顶层分布 + 截断树。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要扫描的目录绝对路径' },
        treeLines: { type: 'number', description: '树文本最大行数，默认 300，最大 2000' },
      },
      required: ['path'],
    },
  },
  {
    name: 'ctx_estimate',
    description: '估算目录（或指定文件清单）的打包体积：每个文件的启发式 token 数与字节大小、合计。不生成内容。用于在打包前做 token 预算决策。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录绝对路径' },
        include: { type: 'array', items: { type: 'string' }, description: '可选：仅估算这些相对路径的文件；缺省=全目录（忽略规则生效）' },
        limit: { type: 'number', description: '明细列表最大条数，默认 50' },
      },
      required: ['path'],
    },
  },
  {
    name: 'ctx_pack',
    description: '把目录（或指定文件清单）打包成单个 LLM 友好的上下文文本包（含目录树 + 文件内容）。总是写 bundle 文件并返回其绝对路径与统计；结果较小时（≤inlineBytes）同时全文内联，较大时请用文件路径自行分段读取。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录绝对路径' },
        include: { type: 'array', items: { type: 'string' }, description: '可选：仅打包这些相对路径的文件；缺省=全目录（忽略规则生效）' },
        exclude: { type: 'array', items: { type: 'string' }, description: '可选：glob 排除规则（.gitignore 语法），对 include/全目录结果再过滤' },
        format: { type: 'string', enum: ['xml', 'md'], description: '包格式：xml（默认，<file path> 包裹）或 md' },
        header: { type: 'string', description: '可选：包头部说明文字（如任务上下文），替换默认说明' },
        inlineBytes: { type: 'number', description: '全文内联阈值字节，默认 24000；0=永不内联' },
      },
      required: ['path'],
    },
  },
];

// ── 工具实现 ───────────────────────────────────────────────────────────────
const appConfigDir = process.argv[2] || '';
let kv = null;
function getKv() {
  if (!kv) {
    try { kv = createKvClient({ appConfigDir, log: () => {} }); } catch (_) { kv = null; }
  }
  return kv;
}

function assertDir(p) {
  const abs = path.resolve(String(p || ''));
  let st = null;
  try { st = fs.statSync(abs); } catch (_) { /* below */ }
  if (!st || !st.isDirectory()) throw new Error(`目录不存在或不是目录: ${p}`);
  return abs;
}

function scanOpts() {
  // MCP 侧不给用户设置面板：用默认（含锁文件与否按默认忽略）
  return { includeLockfiles: false, extraIgnores: '', maxFileKb: 512, maxFiles: 20000 };
}

async function toolScan(args) {
  const abs = assertDir(args.path);
  const { entries, stats } = await core.scanDirectory(abs, scanOpts(), null);
  const maxLines = Math.max(10, Math.min(2000, Number(args.treeLines) || 300));
  let tree = core.renderTree(entries, { withTokens: true });
  const lines = tree.split('\n');
  let treeNote = '';
  if (lines.length > maxLines) {
    tree = lines.slice(0, maxLines).join('\n');
    treeNote = `\n…（树共 ${lines.length} 行，已按 ${maxLines} 行截断）`;
  }
  // 顶层目录分布（按直接子目录聚合 token）
  const byTop = new Map();
  for (const e of entries) {
    if (e[1]) continue;
    const top = e[0].includes('/') ? e[0].split('/')[0] : '(根)';
    const cur = byTop.get(top) || { files: 0, tokens: 0 };
    cur.files++;
    cur.tokens += e[3] || 0;
    byTop.set(top, cur);
  }
  const topLines = [...byTop.entries()]
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 20)
    .map(([d, v]) => `  ${d}: ${v.files} 文件, ~${v.tokens} tokens`);
  const text = [
    `扫描完成: ${abs}`,
    `文件 ${stats.fileCount} 个 / 目录 ${stats.dirCount} 个 / 合计 ~${stats.totalTokens} tokens / ${core.fmtBytes(stats.totalBytes)}`,
    stats.truncated ? `⚠ 文件数超过 20000 上限，结果不完整` : '',
    stats.skipped ? `（${stats.skipped} 项不可读已跳过；${stats.ignored} 项被忽略规则排除）` : '',
    '',
    'token 大头（按顶层目录）:',
    ...topLines,
    '',
    '目录树:',
    tree,
    treeNote,
  ].filter((l) => l !== '').join('\n');
  return { content: [{ type: 'text', text }] };
}

async function toolEstimate(args) {
  const abs = assertDir(args.path);
  let files;
  let note = '';
  if (Array.isArray(args.include) && args.include.length) {
    const f = core.filterExistingFiles(abs, args.include);
    files = f.files.map((rel) => readEntryLine(abs, rel));
    if (f.rejected.length) note = `（${f.rejected.length} 个路径无效已剔除）`;
  } else {
    const { entries } = await core.scanDirectory(abs, scanOpts(), null);
    files = entries.filter((e) => !e[1]);
  }
  const limit = Math.max(1, Math.min(500, Number(args.limit) || 50));
  const totalTokens = files.reduce((s, e) => s + (e[3] || 0), 0);
  const totalBytes = files.reduce((s, e) => s + (e[2] || 0), 0);
  const top = files.slice().sort((a, b) => (b[3] || 0) - (a[3] || 0)).slice(0, limit);
  const lines = top.map((e) => `  ${e[0]}  ~${e[3]} tok / ${core.fmtBytes(e[2])}${e[4] ? ` [${e[4]}]` : ''}`);
  const text = [
    `估算: ${abs}`,
    `文件 ${files.length} 个 / 合计 ~${totalTokens} tokens / ${core.fmtBytes(totalBytes)}${note}`,
    `(token 为启发式估算，精度约 ±20%；b=二进制 L=超单文件上限不打包内容)`,
    '',
    `最大的 ${Math.min(limit, files.length)} 个文件:`,
    ...lines,
  ].join('\n');
  return { content: [{ type: 'text', text }] };
}

/** 单文件估算行（不重扫目录；与 scanDirectory 行格式一致） */
function readEntryLine(rootAbs, rel) {
  const abs = path.join(rootAbs, rel);
  let size = 0;
  let flags = '';
  let tokens = 0;
  try {
    size = fs.statSync(abs).size;
    if (core.isBinaryExt(rel)) {
      flags = 'b';
    } else if (size > 512 * 1024) {
      flags = 'L';
      tokens = core.estimateTokensFromSize(size);
    } else {
      const buf = fs.readFileSync(abs);
      if (core.sniffBinary(buf)) flags = 'b';
      else tokens = core.estimateTokens(buf.toString('utf8'));
    }
  } catch (_) { flags = 'b'; }
  return [rel, 0, size, tokens, flags];
}

async function toolPack(args) {
  const abs = assertDir(args.path);
  const format = args.format === 'md' ? 'md' : 'xml';
  let files;
  let treeEntries = null;
  let note = '';
  if (Array.isArray(args.include) && args.include.length) {
    const f = core.filterExistingFiles(abs, args.include);
    files = f.files;
    if (f.rejected.length) note = `（${f.rejected.length} 个路径无效已剔除）`;
    if (Array.isArray(args.exclude) && args.exclude.length) {
      const engine = core.createIgnoreEngine({ extraIgnores: args.exclude.join('\n'), includeLockfiles: true });
      files = files.filter((rel) => !engine.ignored(rel, false, []));
    }
  } else {
    const { entries } = await core.scanDirectory(abs, scanOpts(), null);
    treeEntries = entries;
    files = entries.filter((e) => !e[1] && !String(e[4]).includes('b') && !String(e[4]).includes('L')).map((e) => e[0]);
    if (Array.isArray(args.exclude) && args.exclude.length) {
      const engine = core.createIgnoreEngine({ extraIgnores: args.exclude.join('\n'), includeLockfiles: true });
      files = files.filter((rel) => !engine.ignored(rel, false, []));
      treeEntries = treeEntries.filter((e) => !engine.ignored(e[0], !!e[1], []));
    }
  }
  if (!files.length) throw new Error('打包清单为空（include 无效或忽略规则排除了全部文件）');
  const treeText = treeEntries ? core.renderTree(treeEntries, { withTokens: true }) : files.join('\n');
  const packed = core.packBundle(abs, files, {
    format,
    header: args.header ? String(args.header).slice(0, 2000) : undefined,
    treeText,
    maxFileKb: 512,
  });
  // 落盘（与 service 同目录；目录解析失败则退 tmp）
  const dir = bundlesDirSafe();
  const ext = format === 'md' ? '.md' : '.txt';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${stamp}-${id.slice(0, 8)}${ext}`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, packed.text, 'utf8');
  // 索引键（origin=mcp，无内容分块；bridge 不可达静默降级）
  try {
    const k = getKv();
    if (k) {
      await k.kvSet(`${PACK_PREFIX}${id}`, {
        id, path: abs, format, state: 'done', origin: 'mcp',
        startedAt: Date.now(), finishedAt: Date.now(),
        stats: {
          files: packed.stats.files, bytes: packed.stats.bytes,
          tokens: packed.stats.tokens, treeLines: packed.stats.treeLines,
        },
        file: filePath,
        fileBytes: Buffer.byteLength(packed.text, 'utf8'),
        chunks: 0,
        truncatedFiles: packed.stats.truncatedFiles.slice(0, 50),
      });
    }
  } catch (_) { /* 降级：索引写失败不影响打包产物 */ }
  const inlineBytes = Number.isFinite(Number(args.inlineBytes)) ? Math.max(0, Number(args.inlineBytes)) : 24000;
  const sizeBytes = Buffer.byteLength(packed.text, 'utf8');
  const head = [
    `打包完成: ${abs}`,
    `文件 ${packed.stats.files} 个 / ~${packed.stats.tokens} tokens / ${core.fmtBytes(sizeBytes)}${note}`,
    `bundle 文件: ${filePath}`,
    packed.stats.truncatedFiles.length ? `⚠ ${packed.stats.truncatedFiles.length} 个文件内容未完整纳入（二进制/超上限/读取失败，见包内注记）` : '',
    '',
  ].filter((l) => l !== '');
  if (inlineBytes > 0 && sizeBytes <= inlineBytes) {
    return { content: [{ type: 'text', text: `${head.join('\n')}\n${packed.text}` }] };
  }
  const preview = packed.text.slice(0, 1200);
  return {
    content: [{
      type: 'text',
      text: `${head.join('\n')}包体积 ${core.fmtBytes(sizeBytes)} 超过内联阈值，仅附前 1200 字节预览。请用文件路径（${filePath}）分段读取全文。\n\n${preview}\n…（预览截断）`,
    }],
  };
}

function bundlesDirSafe() {
  const cands = [];
  // appConfigDir 就近优先（dev=Polaris-dev 自身即数据根；prod=数据根本身），anchor 兜底
  if (appConfigDir) cands.push(appConfigDir);
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(a.dataRoot);
    } catch (_) { /* 跳过 */ }
  }
  const base = cands[0] || os.tmpdir();
  const dir = path.join(base, 'polaris-context', 'bundles');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* 写时再报错 */ }
  return dir;
}

// ── JSON-RPC 骨架 ──────────────────────────────────────────────────────────
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
    let msg = null;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    void handleMessage(msg);
  }
});

async function handleMessage(msg) {
  if (!msg || msg.id === undefined) return; // 通知类忽略
  try {
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'context-pack', version: VERSION },
      } });
      return;
    }
    if (msg.method === 'notifications/initialized') return;
    if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
      return;
    }
    if (msg.method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const fn = name === 'ctx_scan' ? toolScan : name === 'ctx_estimate' ? toolEstimate : name === 'ctx_pack' ? toolPack : null;
      if (!fn) {
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
        return;
      }
      try {
        const r = await fn(args);
        send({ jsonrpc: '2.0', id: msg.id, result: r });
      } catch (e) {
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `失败: ${e && e.message || e}` }], isError: true } });
      }
      return;
    }
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method 未知: ${msg.method}` } });
  } catch (e) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e && e.message || e) } });
  }
}

process.on('uncaughtException', (e) => {
  process.stderr.write(`[context-pack-mcp] uncaughtException: ${e && e.stack || e}\n`);
});
