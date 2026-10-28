#!/usr/bin/env node
'use strict';
/**
 * weibian MCP Server —— 韦编的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对韦编后台服务（127.0.0.1 + token）的调用。
 * 服务地址与 token 从 cap.kv `weibian.meta` 读取（经 Polaris IPC bridge 自发现，
 * 与服务/面板共享同一份事实库）。本进程零外网请求。
 *
 * 工具一览（AI 侧约定：这是「本地文档检索与只读引用」——
 * 引用检索结果时必须给出完整路径；read 只能在用户配置的索引目录内）：
 *   weibian_search  全文检索 {query, limit?, } 支持 `ext:pdf dir:xxx 词…` 前缀过滤
 *   weibian_read    只读原文 {path, offset?, maxChars?}——先 search 命中再 read 引用上下文
 *   weibian_status  索引状态（文档数/词项/根目录/扫描进度/降级标记）
 *   weibian_reindex 清空重建索引 {all?}（用户明确要求时才用）
 */
const { createKvClient } = require('./kvclient');

const SERVER_NAME = 'weibian';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 服务通道（meta → 127.0.0.1 + token）─────────────────────────────────────
let cachedMeta = null;
let metaReadAt = 0;

async function serviceMeta(force) {
  const now = Date.now();
  if (!force && cachedMeta && now - metaReadAt < 10 * 1000) return cachedMeta;
  const r = await kv.kvGet('weibian.meta').catch(() => null);
  const m = r && typeof r === 'object' ? r.value || r : null;
  const value = m && typeof m === 'object' && 'value' in m ? m.value : m;
  if (value && typeof value.port === 'number' && value.token) {
    cachedMeta = value;
    metaReadAt = now;
    return cachedMeta;
  }
  return null;
}

async function callService(method, apiPath, body) {
  const meta = await serviceMeta(method === 'status' || method === 'search');
  if (!meta) {
    return { ok: false, status: 0, error: '韦编服务未就绪（尚未写入 weibian.meta）：请让用户打开一次韦编面板，或稍后重试（服务由宿主自动拉起）。' };
  }
  const base = `http://127.0.0.1:${meta.port}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), method === 'read' ? 30000 : 15000);
  try {
    const res = await fetch(base + apiPath, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-weibian-token': meta.token },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!json) return { ok: false, status: res.status, error: `服务响应不可解析（HTTP ${res.status}）` };
    return { ok: res.ok && json.ok !== false, status: res.status, json, error: json.error };
  } catch (e) {
    const msg = String((e && e.message) || e);
    return { ok: false, status: 0, error: /abort/i.test(msg) ? '服务请求超时（索引可能正在大量重建，稍后重试）' : `服务不可达：${msg}（服务可能未启动；让用户打开一次韦编面板即可拉起）` };
  } finally {
    clearTimeout(timer);
  }
}

// ── 工具实现 ─────────────────────────────────────────────────────────────────
async function toolSearch(args) {
  const query = String(args.query || '').trim();
  if (!query) return err('缺少 query。示例：{"query":"缓存 假象"} 或 {"query":"ext:pdf dir:reports 年度 预算"}');
  const limit = Number.isFinite(Number(args.limit)) ? Math.min(Math.max(Number(args.limit), 1), 50) : 8;
  const r = await callService('search', '/api/search', { query, limit });
  if (!r.ok) return err(r.error || `检索失败（HTTP ${r.status}）`);
  const { total, results, took } = r.json;
  if (!results || results.length === 0) {
    return ok(`没有命中（query=${JSON.stringify(query)}${took != null ? `，${took}ms` : ''}）。\n提示：换个更具体的词；或先用 weibian_status 确认索引已建立、目标目录已在索引范围内。`);
  }
  const lines = [`命中 ${results.length}${total > results.length ? `/${total}` : ''} 条（按相关性排序；引用时给出完整路径）：`];
  results.forEach((it, i) => {
    lines.push(`\n${i + 1}. ${it.name}（${it.cat}${it.ext ? '.' + it.ext : ''}，相关性 ${it.score}）`);
    lines.push(`   路径：${it.path}`);
    if (it.snippet && it.snippet.text) lines.push(`   片段：${it.snippet.text.replace(/\s+/g, ' ').slice(0, 300)}`);
  });
  lines.push('\n下一步：需要引用上下文时用 weibian_read 传上面的完整 path（可配 offset/maxChars 分段读）。');
  return ok(lines.join('\n'));
}

async function toolRead(args) {
  if (!args.path) return err('缺少 path（先用 weibian_search 拿到完整路径）');
  const body = { path: String(args.path) };
  if (args.offset != null) body.offset = Number(args.offset) || 0;
  if (args.maxChars != null) body.maxChars = Number(args.maxChars) || undefined;
  const r = await callService('read', '/api/read', body);
  if (!r.ok) return err(r.error || `读取失败（HTTP ${r.status}）`);
  const j = r.json;
  const head = `已读 ${j.path}${j.offset ? `（偏移 ${j.offset}）` : ''}：全文 ${j.total} 字符，本次返回 ${j.text.length}${j.truncated ? '（截断，可加大 offset 续读）' : ''}。`;
  return ok(head + '\n\n' + j.text);
}

async function toolStatus() {
  const r = await callService('status', '/api/progress');
  if (!r.ok) return err(r.error || `状态获取失败（HTTP ${r.status}）`);
  const s = r.json;
  const errLine = s.errors && s.errors.length ? `\n最近问题：${s.errors.map((e) => `${e.path}（${e.reason}）`).join('；')}` : '';
  return ok([
    `韦编索引状态：`,
    `- 文档 ${s.docs}（上限 ${s.maxDocs}${s.capped ? '，已触顶——建议拆分目录或调大上限' : ''}），词项 ${s.tokens}，覆盖 ${Math.round((s.bytes || 0) / 1048576)} MB 源文件`,
    `- 索引目录 ${s.roots} 个；扫描${s.scanning ? `进行中（待处理 ${s.pending}）` : '空闲'}，上次耗时 ${s.lastScanMs || 0}ms`,
    `- 服务桥${s.degraded ? '降级（宿主桥不可达，搜索仍可用，设置不刷新）' : '正常'}`,
    errLine,
    `\n检索语法：多词按相关性排序（如「缓存 假象」）；ext:pdf / ext:code / dir:plans 可过滤。`,
  ].join('\n'));
}

async function toolReindex(args) {
  const r = await callService('reindex', '/api/reindex', { all: args.all === true });
  if (!r.ok) return err(r.error || `重建失败（HTTP ${r.status}）`);
  return ok(`已触发${args.all === true ? '清空重建' : '增量重扫'}：异步执行，用 weibian_status 观察进度。`);
}

const tools = [
  {
    name: 'weibian_search',
    description: '韦编·本地文档全文检索：在用户配置的索引目录（笔记/spec/PDF/文档/代码）里按关键词搜索，返回文件路径与命中片段，按相关性排序。支持前缀过滤：ext:pdf（或 ext:text/ext:code/ext:docx/ext:html 类别名）与 dir:子目录名。AI 需要引用用户本地资料、找"我写过/看过的内容"时用这个；拿到结果后用 weibian_read 取上下文。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词，多词空格分隔按相关性排序；可内联 ext:/dir: 过滤，如 "ext:pdf dir:reports 年度 预算"' },
        limit: { type: 'number', description: '返回条数上限（默认 8，最大 50）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'weibian_read',
    description: '韦编·只读原文：读取索引目录内文件的可读文本（txt/md/代码/PDF 文字层/docx/html），用于检索命中后取上下文引用。只能读用户配置的索引目录内的文件（越界会拒绝）；分段续读用 offset。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'weibian_search 结果给出的完整路径' },
        offset: { type: 'number', description: '起始字符偏移（默认 0）' },
        maxChars: { type: 'number', description: '本次返回的字符数（默认 6000，上限 50000）' },
      },
      required: ['path'],
    },
  },
  {
    name: 'weibian_status',
    description: '韦编·索引状态：文档数/词项数/索引目录/扫描进度/最近问题。检索结果为空时先看这里（索引是否已建立、目录是否在范围内、是否触顶）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'weibian_reindex',
    description: '韦编·重建索引：all=true 清空重建（慢，全量重提取）；否则增量重扫（通常不需要，服务每 10 分钟自动对账）。仅在用户明确要求"重建索引"时使用。',
    inputSchema: {
      type: 'object',
      properties: { all: { type: 'boolean', description: 'true=清空重建；缺省=增量重扫' } },
    },
  },
];

const HANDLERS = {
  weibian_search: toolSearch,
  weibian_read: toolRead,
  weibian_status: toolStatus,
  weibian_reindex: toolReindex,
};

// ── stdio JSON-RPC 主循环 ────────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

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
    try { msg = JSON.parse(line); } catch (e) { log('warn', `非 JSON 行：${e.message}`); continue; }
    handleMessage(msg).catch((e) => {
      log('error', `处理异常：${e.stack || e.message}`);
      if (msg && msg.id != null) send({ jsonrpc: '2.0', id: msg.id, result: err(`内部错误：${e.message}`) });
    });
  }
});
process.stdin.on('end', () => process.exit(0));

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
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const fn = HANDLERS[name];
    if (!fn) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const r = await fn(args);
      send({ jsonrpc: '2.0', id: msg.id, result: r });
    } catch (e) {
      log('error', `工具 ${name} 失败：${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`${e.message}（若为桥连接问题，请确认 Polaris 正在运行）`) });
    }
    return;
  }
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.id != null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在：${msg.method}` } });
}

log('info', `weibian mcp server v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
