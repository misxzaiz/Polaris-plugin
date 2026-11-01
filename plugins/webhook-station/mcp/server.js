#!/usr/bin/env node
'use strict';
/**
 * server.js —— Webhook 调试台 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层：把 tools/call 翻译成对捕获数据的查询与操作。
 *   - hook_overview / hook_recent：读 cap.kv（whs.meta / whs.settings / whs.rec.*）
 *   - hook_get / hook_search：直读 captures.jsonl（全量保真；路径来自 whs.meta）
 *   - hook_replay / hook_clear：写命令键（服务消费，先删后做）
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 * 注意：捕获内容可能含敏感数据（签名/密钥/PII）——返回给 AI 的内容仅限本机
 * 会话使用，工具描述已提示 AI 摘要时对密钥字段脱敏。
 */
const fs = require('fs');
const crypto = require('crypto');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[webhook-station:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 数据读取 ───────────────────────────────────────────────────────────────
async function readMeta() {
  const v = await kv.kvGet('whs.meta').catch(() => null);
  return v && typeof v === 'object' && v.lastTickAt ? v : null;
}
async function readSettings() {
  const v = await kv.kvGet('whs.settings').catch(() => null);
  return core.normalizeSettings(v);
}
/** 读 rec 分块 → 最近捕获预览 ring */
async function readRing() {
  const keys = (await kv.kvKeys().catch(() => [])).filter((k) => /^whs\.rec\.\d+$/.test(k));
  const map = {};
  for (const k of keys.slice(0, 40)) {
    const v = await kv.kvGet(k).catch(() => null);
    if (Array.isArray(v)) map[k] = v;
  }
  return core.readRing(map);
}
/** 直读 JSONL 全量行（当前文件 + .old；用于 hook_get / hook_search） */
function readJsonlAll(filePath) {
  const out = [];
  for (const f of [`${filePath}.old`, filePath]) {
    let raw = '';
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    for (const line of raw.split('\n')) {
      const rec = core.parseJsonlLine(line);
      if (rec) out.push(rec);
    }
  }
  out.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return out;
}
/** 写命令键 → 轮询结果键（服务 tick 4s；replay 含转发耗时，轮询 25s） */
async function sendCommand(op, payload, timeoutMs) {
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const resultKey = `whs.result.${nonce}`;
  await kv.kvSet(`whs.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    const r = await kv.kvGet(resultKey).catch(() => null);
    if (r && typeof r === 'object') {
      await kv.kvDel(resultKey).catch(() => {});
      return r;
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  return { ok: false, error: '服务未在时限内响应（可能未运行：去 设置→插件→Webhook 调试台 看服务状态）' };
}
/** 密钥脱敏：键名含敏感词的头部值打掩码（返回给 AI 的文本用） */
const SENSITIVE_HEADER_RE = /(authorization|cookie|token|secret|signature|sign|key|password)/i;
function maskHeaderValue(name, value) {
  return SENSITIVE_HEADER_RE.test(name) ? `${String(value).slice(0, 6)}…（已脱敏）` : String(value);
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolOverview() {
  const meta = await readMeta();
  if (!meta) return { text: 'Webhook 调试台服务未上线（没有心跳）。请到 设置→插件→Webhook 调试台 查看服务状态并启动。', isError: true };
  const s = core.normalizeSettings(meta.settings);
  const age = Math.round((Date.now() - (meta.lastTickAt || 0)) / 1000);
  const lines = [
    `服务: v${meta.version} ${meta.degraded ? '（bridge 降级：捕获/转发不受影响）' : '正常'}，心跳 ${age <= 90 ? `${age} 秒前` : `${Math.round(age / 60)} 分钟前（可能已停止）`}`,
    `捕获地址: http://127.0.0.1:${meta.port}/hook/<桶secret>  局域网 ${meta.lanIp ? `http://${meta.lanIp}:${meta.port}/hook/<桶secret>` : '未检测到'}`,
    `桶列表（捕获路径 = /hook/<secret>，配合任意内网穿透隧道把隧道指向 127.0.0.1:${meta.port} 即可）:`,
    ...s.buckets.map((b) => `  - [${b.id}] ${b.name} secret=${b.secret} 模式=${b.responseMode === 'forward' ? `转发→${b.forwardUrl}` : `固定应答 ${b.fixedStatus}`}`),
    `统计: 累计捕获 ${meta.capturesTotal || 0} 条，最近一条 ${meta.lastCaptureAt ? new Date(meta.lastCaptureAt).toISOString().replace('T', ' ').slice(0, 19) : '无'}`,
    `留痕: ${meta.filePath || '未知'}（${Math.round((meta.fileBytes || 0) / 1024)}KB，数据不出本机）`,
  ];
  return { text: lines.join('\n') };
}

async function toolRecent(args) {
  const ring = await readRing();
  if (!ring.length) {
    return { text: '暂无捕获记录。把回调地址（见 hook_overview）配到第三方或隧道后触发一次即可；也可以先说「给我回调地址」拿 URL。' };
  }
  const bucketId = args && args.bucketId ? String(args.bucketId) : '';
  const limit = Math.min(Math.max(parseInt(args && args.limit, 10) || 15, 1), 50);
  const rows = ring.filter((r) => !bucketId || r.bucketId === bucketId).slice(0, limit);
  if (!rows.length) return { text: `桶 ${bucketId} 暂无捕获记录。` };
  return { text: `最近捕获 ${rows.length} 条（新在前）：\n${rows.map((r) => `- ${core.summarizeRec(r)}`).join('\n')}\n\n要看某条全文用 hook_get 传 id。` };
}

async function toolGet(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return { text: '缺少 id 参数（先 hook_recent 拿 id）', isError: true };
  const meta = await readMeta();
  if (!meta || !meta.filePath) return { text: '服务未上线，无法定位留痕文件。', isError: true };
  const rec = readJsonlAll(meta.filePath).find((r) => r.id === id);
  if (!rec) return { text: `捕获记录不存在（可能已被清理或轮转）: ${id}`, isError: true };
  const headers = Object.entries(rec.headers || {})
    .map(([k, v]) => `    ${k}: ${maskHeaderValue(k, v)}`)
    .join('\n');
  const body = rec.kind === 'text'
    ? core.prettyBodyText(rec.bodyText)
    : rec.kind === 'binary'
      ? `（二进制 ${rec.size}B，base64 前 200 字符: ${(rec.bodyBase64 || '').slice(0, 200)}）`
      : '（空体）';
  const lines = [
    `id=${rec.id}  [${rec.bucketId}]`,
    `${rec.method} ${rec.path}${rec.query ? `?${rec.query}` : ''}`,
    `时间: ${new Date(rec.receivedAt).toISOString().replace('T', ' ').slice(0, 19)}  来源: ${rec.sourceIp}  应答: ${rec.responded ? rec.responded.status : '-'}${rec.responded && rec.responded.mode === 'forward' ? '（转发镜像）' : ''}`,
    `体: ${rec.kind} ${rec.size}B${rec.truncated ? '（存储时已截断）' : ''}  Content-Type: ${rec.contentType || '-'}`,
    `请求头:\n${headers || '    （无）'}`,
    `请求体:\n${body}`,
  ];
  if (rec.forward) {
    lines.push(rec.forward.ok
      ? `转发: → ${rec.forward.url}  状态 ${rec.forward.status}  ${rec.forward.latencyMs}ms\n转发响应预览: ${oneLine(rec.forward.bodyPreview || '', 300)}`
      : `转发: → ${rec.forward.url}  失败: ${rec.forward.error || '未知'}`);
  }
  return { text: lines.join('\n') };
}

async function toolSearch(args) {
  const q = String((args && args.q) || '').trim();
  const bucketId = args && args.bucketId ? String(args.bucketId) : '';
  const limit = Math.min(Math.max(parseInt(args && args.limit, 10) || 10, 1), 30);
  if (!q && !bucketId) return { text: '至少给一个搜索词 q 或桶 bucketId', isError: true };
  const meta = await readMeta();
  if (!meta || !meta.filePath) return { text: '服务未上线，无法定位留痕文件。', isError: true };
  const all = readJsonlAll(meta.filePath).filter((r) => (!bucketId || r.bucketId === bucketId) && core.matchSearch(r, q));
  if (!all.length) return { text: `没有匹配的捕获（q=${q || '-'} bucket=${bucketId || '-'}）。留痕文件仅保留最近轮转窗口内的记录。` };
  const rows = all.slice(0, limit);
  return { text: `匹配 ${all.length} 条，显示前 ${rows.length} 条：\n${rows.map((r) => `- ${core.summarizeRec(r)}`).join('\n')}\n\n要看某条全文用 hook_get 传 id。` };
}

async function toolReplay(args) {
  if (args.confirm !== true) {
    return {
      text: '重放会向目标地址再发一次真实请求（可能是支付回调/业务接口）。请与用户确认目标后传 confirm:true 重试。',
      isError: true,
    };
  }
  const r = await sendCommand('replay', {
    captureId: String(args.captureId || ''),
    targetUrl: args.targetUrl ? String(args.targetUrl) : undefined,
    bucketId: args.bucketId ? String(args.bucketId) : undefined,
  }, 25000);
  if (!r.ok) return { text: `重放失败：${r.error}`, isError: true };
  return { text: `已重放 ${r.captureId} → ${r.target}\n响应 ${r.status}（${r.latencyMs}ms）${r.bodyPreview ? `\n响应预览: ${oneLine(r.bodyPreview, 500)}` : ''}` };
}

async function toolClear(args) {
  if (args.confirm !== true) {
    return {
      text: '清空桶会删除该桶全部捕获留痕（不可恢复）。请与用户确认后传 confirm:true 重试。',
      isError: true,
    };
  }
  const r = await sendCommand('clear', { bucketId: String(args.bucketId || 'default'), confirm: true });
  if (!r.ok) return { text: `清空失败：${r.error}`, isError: true };
  return { text: `已清空桶 ${args.bucketId} 的捕获（其它桶保留 ${r.kept} 条留痕）。` };
}

// ── 工具声明（description 写「适用句式」，AI 靠它匹配意图）─────────────────
const TOOLS = [
  {
    name: 'hook_overview',
    description: '查看「Webhook 调试台」服务状态与全部捕获地址。适用：「webhook 服务在跑吗」「给我支付回调的测试地址」「回调 URL 是什么」「怎么配内网穿透」。返回每个桶的 secret 与捕获路径、转发配置、统计与留痕位置。',
    inputSchema: { type: 'object', properties: {} },
    run: toolOverview,
  },
  {
    name: 'hook_recent',
    description: '列出最近收到的 webhook 回调（时间/方法/路径/应答码/转发结果）。适用：「最近有回调进来吗」「支付回调收到了吗」「看看刚触发的 webhook」。可选 bucketId 过滤；返回 id 供 hook_get / hook_replay 使用。',
    inputSchema: {
      type: 'object',
      properties: {
        bucketId: { type: 'string', description: '可选，只看某个桶（如 pay）' },
        limit: { type: 'number', description: '可选，返回条数（默认 15，最多 50）' },
      },
    },
    run: toolRecent,
  },
  {
    name: 'hook_get',
    description: '查看一条捕获回调的全文：完整请求头（敏感值自动脱敏）、请求体、应答与转发结果。适用：「看这条回调的内容」「这条微信支付回调带了什么字段」「验签需要的原始报文」。id 来自 hook_recent / hook_search。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '捕获记录 id' } },
      required: ['id'],
    },
    run: toolGet,
  },
  {
    name: 'hook_search',
    description: '在捕获留痕里按关键词搜索（匹配路径/请求体/方法/来源 IP，大小写不敏感）。适用：「找出所有应答 5xx 的回调」（搜路径或字段值）、「搜 out_trade_no=123 的那条」「哪个 IP 在打回调」。',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '关键词（子串匹配）' },
        bucketId: { type: 'string', description: '可选，限定桶' },
        limit: { type: 'number', description: '可选，返回条数（默认 10，最多 30）' },
      },
    },
    run: toolSearch,
  },
  {
    name: 'hook_replay',
    description: '把一条已捕获的回调原样重发到目标地址（默认该桶配置的转发地址，可传 targetUrl 覆盖，如重发到本地应用的 /api/pay/notify）。适用：「把这条回调再发一次」「重放到我本地 3000 端口试试」。会发出真实请求，需 confirm:true。',
    inputSchema: {
      type: 'object',
      properties: {
        captureId: { type: 'string', description: '捕获记录 id' },
        targetUrl: { type: 'string', description: '可选，覆盖目标地址（默认用桶的转发地址）' },
        bucketId: { type: 'string', description: '可选，用于取默认转发地址' },
        confirm: { type: 'boolean', description: '必须显式传 true 才会执行' },
      },
      required: ['captureId', 'confirm'],
    },
    run: toolReplay,
  },
  {
    name: 'hook_clear',
    description: '清空某个桶的全部捕获留痕（不可恢复，危险操作需 confirm）。适用：「清空测试桶」「把调试数据都删了」。其它桶不受影响。',
    inputSchema: {
      type: 'object',
      properties: {
        bucketId: { type: 'string', description: '要清空的桶 id（默认 default）' },
        confirm: { type: 'boolean', description: '必须显式传 true 才会执行' },
      },
      required: ['confirm'],
    },
    run: toolClear,
  },
];

// ── JSON-RPC stdio 主循环 ──────────────────────────────────────────────────
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
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handle(msg).catch((e) => {
      slog(`handle error: ${e.stack || e.message}`);
      if (msg && msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: '内部错误' } });
    });
  }
});

async function handle(msg) {
  const { method, id } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'webhook-station', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...rest }) => rest) } });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    try {
      const r = await tool.run(args);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: oneLine(r.text, 6000) }], isError: r.isError === true },
      });
    } catch (e) {
      slog(`tool ${name} 抛错: ${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `执行异常：${e.message}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

slog(`webhook-station mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
