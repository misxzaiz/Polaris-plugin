#!/usr/bin/env node
'use strict';
/**
 * ocr-bench MCP Server —— 文字识别台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 ocr-bench.* 键空间命令投递。
 * 识别执行与报告写入的唯一权威是后台服务（service/main.js）——MCP 只投递
 * 命令并等待回执，与面板共享同一事实库（cap.kv）。
 *
 * 安全不变量：
 *   - 识别全本地执行：图像/文本数据不出本机（引擎无上传路径）；
 *   - 工具描述明示「仅识别用户有权的本地文件」；服务端护栏（文件数/页数/单图
 *     体积上限、单任务互斥、可中止）兜底防失控；
 *   - kv 报告每文件只带 16KB 文本头（总预算 256KB）；全文用 ocr_result 的
 *     full 参数按文件取（内存或导出 txt）。
 *
 * 工具一览（6 个）：
 *   ocr_scan     发起识别任务并等待结果（默认 ≤330s；更长指引轮询）
 *   ocr_status   当前任务进度 / 最近一次报告摘要
 *   ocr_stop     中止当前任务
 *   ocr_result   读取某次任务报告；按文件取全文（full）
 *   ocr_history  历史记录列表
 *   ocr_langs    语言包清单（内置/可选/已装）与按需下载
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'ocr-bench';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  cmd: 'ocr-bench.cmd',
  res: 'ocr-bench.res',
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const MCP_SCAN_WAIT_DEFAULT_MS = 330 * 1000;

// ── 命令投递（单槽信箱：写 cmd → 轮询 res 按 nonce 对齐）─────────────────────
let nonceCounter = 0;
async function sendCommand(action, payload, waitMs) {
  const nonce = `m${Date.now().toString(36)}-${++nonceCounter}`;
  await kv.kvSet(K.cmd, { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + (waitMs || 90000);
  let sawStale = false;
  while (Date.now() < deadline) {
    await sleep(1200);
    let res;
    try { res = await kv.kvGet(K.res); } catch (_) { continue; }
    if (res && res.nonce === nonce) {
      await kv.kvDel(K.res).catch(() => { /* 消费失败不影响结果读取 */ });
      return res.result || { ok: false, error: '回执为空' };
    }
    if (res && res.nonce) sawStale = true;
  }
  return {
    ok: false,
    pending: true,
    error: sawStale
      ? `命令已投递但 ${Math.round((waitMs || 90000) / 1000)}s 内未见回执（任务仍在后台进行）。用 ocr_status 轮询。`
      : '命令已投递但服务无响应（服务可能未启动）。打开一次文字识别台面板可触发服务自举，稍后重试。',
  };
}

// ── 报告渲染（AI 可读文本）──────────────────────────────────────────────────
function renderSummary(s) {
  return `文件 ${s.okFiles}/${s.files} 成功（失败 ${s.failFiles}）· 提取 ${s.totalChars} 字 · OCR ${s.ocrPages} 页 / 文字层直读 ${s.nativePages} 页${s.meanConfidence !== null ? ` · 平均置信度 ${s.meanConfidence}` : ''} · 用时 ${Math.round(s.durationMs / 100) / 10}s${s.aborted ? ' · ⚠ 已中止' : ''}`;
}

function renderReport(rep, { withText = true } = {}) {
  const lines = [];
  lines.push(`【识别报告】runId=${rep.runId} · ${new Date(rep.at).toLocaleString('zh-CN')} · 语言 ${Array.isArray(rep.langs) ? rep.langs.join('+') : '?'}`);
  lines.push(`汇总：${renderSummary(rep.summary || {})}`);
  for (const n of (rep.summary && rep.summary.notes) || []) lines.push(`  · ${n}`);
  const files = Array.isArray(rep.files) ? rep.files : [];
  if (files.length) lines.push(`文件清单：`);
  files.forEach((f, i) => {
    const flag = f.ok ? '✓' : '✗';
    const info = f.ok
      ? `${f.chars} 字${f.outFile ? ` · 已导出 ${core.maskPath(f.outFile)}` : ''}${f.truncatedFile ? ' · 报告内仅存头部（全文用 ocr_result fileIndex=' + i + ' full=true）' : ''}`
      : `失败：${f.error || '未知错误'}`;
    lines.push(`  [${i}] ${flag} ${core.maskPath(f.path)}（${f.type === 'pdf' ? `PDF ${f.pages.length} 页` : '图片'}）— ${info}`);
    if (withText && f.ok && f.textHead) {
      const head = f.textHead.replace(/\s+/g, ' ').slice(0, 600);
      lines.push(`      开头：${head}${f.textHead.length > 600 ? '…' : ''}`);
    }
  });
  return lines.join('\n');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolScan(args) {
  const paths = Array.isArray(args.paths) ? args.paths.map((p) => String(p || '').trim()).filter(Boolean)
    : (args.path ? [String(args.path)] : []);
  if (!paths.length) return err('未提供识别目标。paths 接受文件或目录的绝对路径数组（图片 png/jpg/bmp/webp/tiff/pnm，或 PDF）。');
  const waitMs = Math.min(Math.max(Number(args.waitMs) || MCP_SCAN_WAIT_DEFAULT_MS, 10000), 330000);
  const r = await sendCommand('scan', {
    paths,
    langs: args.langs,
    psm: args.psm,
    outDir: args.out_dir || args.outDir || null,
  }, waitMs);
  if (r.ok && r.report) {
    return ok(`识别完成（runId=${r.report.runId}）：\n${renderReport(r.report)}\n\n提示：需要某文件全文时用 ocr_result（runId + fileIndex + full=true）；要落成 txt 文件就带 out_dir 重新识别（仅中文场景无需改参数）。`);
  }
  if (r.pending) {
    return ok(`${r.error}\n\n大任务（多文件/多页 PDF）耗时超窗属正常。用 ocr_status 查看实时进度，完成后用 ocr_result 读取。`);
  }
  if (r.busy) return err(`${r.error}\n\n可先用 ocr_status 查看进度，或 ocr_stop 中止后重试。`);
  return err(r.error || '识别任务发起失败');
}

async function toolStatus() {
  const r = await sendCommand('state', {}, 20000);
  if (!r.ok) return err(r.error || '状态查询失败');
  const lines = [];
  if (r.running) {
    const s = r.running;
    lines.push(`【进行中】${s.done}/${s.total} 个文件 · ${s.elapsedS}s · 语言 ${Array.isArray(s.langs) ? s.langs.join('+') : '?'}`);
    lines.push(`当前：${s.current || '（页间切换）'} · 成功 ${s.filesOk} · 失败 ${s.filesFail} · 已提取 ${s.charsSoFar} 字`);
  } else {
    lines.push('当前没有进行中的识别任务。');
  }
  if (r.latest) {
    lines.push('');
    lines.push(`【最近报告】runId=${r.latest.runId}（${new Date(r.latest.at).toLocaleString('zh-CN')}）`);
    lines.push(renderSummary(r.latest.summary || {}));
  }
  return ok(lines.join('\n'));
}

async function toolStop() {
  const r = await sendCommand('stop', {}, 20000);
  return r.ok ? ok(`已请求中止（runId=${r.runId}）。正在识别的页会完成，后续文件不再处理。`) : err(r.error || '中止失败');
}

async function toolResult(args) {
  const runId = String(args.runId || '');
  if (!runId) return err('缺少 runId（从 ocr_scan / ocr_status / ocr_history 获得）');
  if (args.full) {
    const idx = Math.round(Number(args.fileIndex));
    if (!Number.isFinite(idx) || idx < 0) return err('full=true 时必须提供合法的 fileIndex（报告文件清单里的序号）。');
    const r = await sendCommand('result', { runId, fileIndex: idx, full: true }, 20000);
    if (!r.ok) return err(r.error || '全文读取失败');
    return ok(`【全文】${core.maskPath(r.path)}（来源：${r.from === 'file' ? '导出 txt' : '服务内存'} · ${r.text.length} 字）\n\n${r.text}`);
  }
  const r = await sendCommand('report', { runId }, 20000);
  if (!r.ok) return err(r.error || '报告读取失败');
  return ok(renderReport(r.report));
}

async function toolHistory(args) {
  const r = await sendCommand('history', { limit: args.limit }, 20000);
  if (!r.ok) return err(r.error || '历史读取失败');
  const items = r.items || [];
  if (!items.length) return ok('还没有识别历史。用 ocr_scan 发起第一次识别。');
  const lines = ['【识别历史】（新→旧）'];
  for (const h of items) {
    lines.push(`${new Date(h.at).toLocaleString('zh-CN')} · ${h.files} 文件（✓${h.okFiles} ✗${h.failFiles}）· ${h.totalChars} 字 · ${h.langs ? h.langs.join('+') : ''}${h.aborted ? ' · 已中止' : ''} · ${h.oneLine || ''} · runId=${h.runId}`);
  }
  return ok(lines.join('\n'));
}

async function toolLangs(args) {
  if (args.download && Array.isArray(args.codes) && args.codes.length) {
    const r = await sendCommand('download_lang', { codes: args.codes }, 120000);
    if (!r.ok) return err(r.error || '下载失败');
    const lines = ['【下载结果】'];
    for (const x of r.results || []) lines.push(`${x.code}：${x.ok ? (x.cached ? '已存在（免下载）' : `下载完成 ${Math.round(x.bytes / 1024)}KB`) : `失败：${x.error}`}`);
    lines.push('模型仅缓存到本机应用数据目录；图像数据永不外发。');
    return ok(lines.join('\n'));
  }
  const r = await sendCommand('langs', {}, 20000);
  if (!r.ok) return err(r.error || '语言清单读取失败');
  const lines = ['【语言包】（内置随包 + 可选按需下载，均为 tessdata_fast 档）'];
  lines.push('内置：');
  for (const l of r.builtin || []) lines.push(`  ${l.code}（${l.name}）${l.installed ? '✓已装' : '（待解压，首次识别自动完成）'}`);
  lines.push('可选（下载后可用）：');
  const opt = r.optional || [];
  for (let i = 0; i < opt.length; i += 4) {
    lines.push('  ' + opt.slice(i, i + 4).map((l) => `${l.code}（${l.name}）${l.installed ? '✓' : ''}`).join(' · '));
  }
  lines.push('下载：ocr_langs {download:true, codes:["chi_tra", ...]}');
  return ok(lines.join('\n'));
}

// ── 工具定义 ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'ocr_scan',
    description: '发起本地 OCR 识别任务（图片/扫描版 PDF → 文本，全程不出本机）。paths 为文件或目录绝对路径数组（目录会递归收集 png/jpg/jpeg/bmp/webp/tiff/pnm/pdf）；langs 缺省为内置 简体中文+英语；out_dir 可选，识别文本落成同名 txt。返回逐文件结果与文本（长任务超窗时改用 ocr_status 轮询）。仅识别用户有权处理的本地文件。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: '文件/目录绝对路径数组（≤200 文件，PDF ≤500 页，单图 ≤50MB）' },
        langs: { type: 'array', items: { type: 'string' }, description: '语言代码数组，如 ["chi_sim","eng"]；缺省用面板设置' },
        psm: { type: 'number', description: '页面切分模式：3 自动（默认）/6 统一块/4 单列/11 稀疏/7 单行' },
        out_dir: { type: 'string', description: '可选：txt 输出目录（必须在输入目录或应用数据目录内）' },
        waitMs: { type: 'number', description: '等待完成的最长毫秒（≤330000，默认 330s）' },
      },
      required: ['paths'],
    },
  },
  {
    name: 'ocr_status',
    description: '查询识别任务实时进度（已完成/总数、当前文件、已提取字数）与最近一次报告摘要（含 runId，可接 ocr_result）。ocr_scan 超窗转轮询时用这个。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ocr_stop',
    description: '中止当前识别任务（正在识别的页会完成，后续文件跳过）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ocr_result',
    description: '读取识别报告：不带 full 返回逐文件摘要与 16KB 文本头；full=true + fileIndex 返回该文件全文（来自服务内存或导出 txt）。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: '任务 ID' },
        fileIndex: { type: 'number', description: '文件序号（full=true 时必填）' },
        full: { type: 'boolean', description: '是否取该文件全文' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'ocr_history',
    description: '识别任务历史列表（新→旧，含汇总与 runId）。',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: '条数（≤40）' } } },
  },
  {
    name: 'ocr_langs',
    description: '查看语言包清单（内置/可选/已装）；download=true + codes 按需下载语言包（唯一外网流量=模型文件，图像数据永不外发）。',
    inputSchema: {
      type: 'object',
      properties: {
        download: { type: 'boolean', description: 'true=执行下载' },
        codes: { type: 'array', items: { type: 'string' }, description: '要下载的语言代码，如 ["chi_tra","jpn"]' },
      },
    },
  },
];

const TOOL_IMPL = { ocr_scan: toolScan, ocr_status: toolStatus, ocr_stop: toolStop, ocr_result: toolResult, ocr_history: toolHistory, ocr_langs: toolLangs };

// ── JSON-RPC 2.0 over stdin/stdout（stdout 只输出协议数据，日志走 stderr）────
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
    handleLine(line).catch((e) => log('error', `处理异常：${(e && e.stack) || e}`));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    const impl = TOOL_IMPL[name];
    if (!impl) {
      send({ jsonrpc: '2.0', id, result: err(`未知工具：${name}（可用：${TOOLS.map((t) => t.name).join('、')}）`) });
      return;
    }
    try {
      send({ jsonrpc: '2.0', id, result: await impl(args) });
    } catch (e) {
      log('error', `工具 ${name} 异常：${(e && e.stack) || e}`);
      send({ jsonrpc: '2.0', id, result: err(`工具执行异常：${String((e && e.message) || e).slice(0, 300)}`) });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法：${method}` } });
  }
}
