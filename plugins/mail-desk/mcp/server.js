#!/usr/bin/env node
'use strict';
/**
 * server.js —— 邮件调试台 MCP server(stdio JSON-RPC,零依赖)
 *
 * AI 工具层:发现信息(cap.kv mdk.service{port,token})→ HTTP 直调服务数据面
 * (127.0.0.1,与面板同源同权)。协议数据只走 stdout;日志走 stderr。
 * 启动参数:node server.js <appConfigDir>
 *
 * 核心场景:测试邮件已截到本机后,AI 一句话读邮件/提取验证码/搜历史/清理。
 */
const http = require('http');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

// MDK_TEST_NO_BRIDGE=1:测试模式——kv 降级为空实现,防止集成测试读到/写到真实宿主 kv。
// 生产环境无此变量,照常走宿主桥(cap.kv mdk.service)。
const TEST_NO_BRIDGE = process.env.MDK_TEST_NO_BRIDGE === '1';
function createKvClientSafe() {
  if (TEST_NO_BRIDGE) {
    return {
      dispatch: async () => { throw new Error('test no-bridge'); },
      dispatchOk: async () => { throw new Error('test no-bridge'); },
      kvGet: async () => null,
      kvSet: async () => true,
      kvDel: async () => true,
      kvKeys: async () => [],
      endpoint: () => null,
      refreshEndpoint: async () => null,
    };
  }
  const { createKvClient } = require('../service/kvclient');
  return createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });
}

function slog(msg) { process.stderr.write(`[mail-desk:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClientSafe();

// ── 服务发现与 HTTP 直调 ────────────────────────────────────────────────────
let svcCache = null;
let svcAt = 0;
// MDK_TEST_SERVICE 仅测试环境注入 {port,token,smtpPort}(无桥模式下 kv 不可用);生产无此变量
const TEST_SERVICE = (() => {
  try {
    const v = process.env.MDK_TEST_SERVICE ? JSON.parse(process.env.MDK_TEST_SERVICE) : null;
    return v && typeof v.port === 'number' && v.token ? v : null;
  } catch (_) { return null; }
})();

async function readService(force) {
  if (TEST_SERVICE) return TEST_SERVICE;
  if (!force && svcCache && Date.now() - svcAt < 10_000) return svcCache;
  const v = await kv.kvGet('mdk.service').catch(() => null);
  if (v && typeof v === 'object' && typeof v.port === 'number' && v.token) {
    svcCache = v;
    svcAt = Date.now();
    return v;
  }
  return null;
}

function svcRequest(svc, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { Authorization: `Bearer ${svc.token}` };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(
      { hostname: '127.0.0.1', port: svc.port, path: apiPath, method, headers, timeout: 15000 },
      (res) => {
        let out = '';
        res.on('data', (c) => { out += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(out); } catch (_) { /* 非 JSON */ }
          if (res.statusCode >= 400) {
            reject(new Error((parsed && parsed.error) || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(parsed || {});
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('服务响应超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function withService(fn) {
  const svc = await readService();
  if (!svc) {
    return { text: '邮件调试台服务未就绪(读不到 mdk.service):服务可能在启动中,或插件被停用。请到 设置→插件→邮件调试台 查看服务状态。', isError: true };
  }
  return fn(svc);
}

// ── 摘要格式化 ──────────────────────────────────────────────────────────────
function fmtSummary(m, i) {
  const att = m.attachments && m.attachments.length ? ` 📎${m.attachments.length}` : '';
  const time = m.date || new Date(m.receivedAt).toISOString();
  return `${i}. [${m.id}] 「${m.subject}」\n   来自 ${m.fromText || '(未知)'} → ${m.toText || '(未指定)'}  ${time.replace('T', ' ').slice(0, 19)}${att}`;
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolStats() {
  return withService(async (svc) => {
    const meta = await svcRequest(svc, 'GET', '/api/meta');
    const age = Math.round((Date.now() - new Date(svc.startedAt || 0).getTime()) / 1000);
    const lines = [
      `服务: v${meta.version},已运行 ${age < 120 ? `${age} 秒` : `${Math.round(age / 60)} 分钟`}`,
      `SMTP 收信口: 127.0.0.1:${meta.smtpPort}${meta.smtpListening ? '(监听中)' : `(未监听:${meta.smtpLastError || '未知'})`} —— 把应用的 SMTP host 指向它即可`,
      `收件箱: ${meta.count} 封 / ${Math.round(meta.totalBytes / 1024)} KB(环形上限 500 封/200MB,超出自动淘汰最旧)`,
      `存储: ${meta.dir}`,
      `提示: 说「读一下最新邮件」用 mail_get,「提取验证码」也用 mail_get(返回 codes 字段)。`,
    ];
    return { text: lines.join('\n') };
  });
}

async function toolList(args) {
  const query = args && typeof args.query === 'string' ? args.query : '';
  const limit = args && Number.isFinite(args.limit) ? args.limit : 15;
  return withService(async (svc) => {
    const r = await svcRequest(svc, 'GET', `/api/mail?query=${encodeURIComponent(query)}&offset=0&limit=${Math.min(50, Math.max(1, limit))}`);
    if (!r.items || !r.items.length) {
      return { text: query ? `没有匹配「${query}」的邮件(共 ${r.total} 封)。` : '收件箱为空。把应用的 SMTP 指向 127.0.0.1:' + svc.smtpPort + ' 后发一封测试邮件即可。' };
    }
    const lines = r.items.map((m, i) => fmtSummary(m, i + 1));
    return { text: `共 ${r.total} 封${query ? `(匹配「${query}」)` : ''},显示前 ${r.items.length} 封:\n${lines.join('\n')}\n\n读全文用 mail_get(传 id;不传读最新一封)。` };
  });
}

async function toolGet(args) {
  return withService(async (svc) => {
    let id = args && typeof args.id === 'string' ? args.id : '';
    if (!id) {
      const r = await svcRequest(svc, 'GET', '/api/mail?offset=0&limit=1');
      if (!r.items || !r.items.length) return { text: '收件箱为空,没有可读的邮件。' };
      id = r.items[0].id;
    }
    const d = await svcRequest(svc, 'GET', `/api/mail/${encodeURIComponent(id)}`);
    const m = d.meta;
    const lines = [
      `「${m.subject}」`,
      `来自 ${m.fromText || '(未知)'} → ${m.toText || '(未指定)'}`,
      `时间 ${m.date || new Date(m.receivedAt).toISOString().replace('T', ' ').slice(0, 19)}`,
      m.attachments && m.attachments.length
        ? `附件(${m.attachments.length}):${m.attachments.map((a) => `${a.filename}(${Math.round(a.size / 1024)}KB)`).join(', ')}`
        : '无附件',
      '',
      d.text ? `—— 纯文本 ——\n${d.text.slice(0, 3000)}` : '(无纯文本部分)',
    ];
    if (d.codes && d.codes.length) lines.push('', `疑似验证码(按置信度): ${d.codes.join(', ')}`);
    if (d.html) lines.push(`(另有 HTML 版正文 ${d.html.length} 字符,面板可预览渲染)`);
    return { text: lines.join('\n') };
  });
}

async function toolSearch(args) {
  const q = args && typeof args.query === 'string' ? args.query.trim() : '';
  if (!q) return { text: '缺少 query(主题/发件人/收件人/正文关键词)。', isError: true };
  return withService(async (svc) => {
    const r = await svcRequest(svc, 'GET', `/api/mail?query=${encodeURIComponent(q)}&offset=0&limit=15`);
    if (!r.items || !r.items.length) return { text: `没有匹配「${q}」的邮件。` };
    return { text: `匹配「${q}」共 ${r.total} 封:\n${r.items.map((m, i) => fmtSummary(m, i + 1)).join('\n')}` };
  });
}

async function toolDelete(args) {
  const id = args && typeof args.id === 'string' ? args.id : '';
  if (!id) return { text: '缺少 id(来自 mail_list / mail_search 的方括号内)。', isError: true };
  return withService(async (svc) => {
    const r = await svcRequest(svc, 'DELETE', `/api/mail/${encodeURIComponent(id)}`);
    return { text: `已删除 ${r.deleted}` };
  });
}

async function toolClear() {
  return withService(async (svc) => {
    const r = await svcRequest(svc, 'POST', '/api/clear', {});
    return { text: `已清空收件箱(${r.cleared} 封)。` };
  });
}

async function toolSelftest() {
  return withService(async (svc) => {
    const r = await svcRequest(svc, 'POST', '/api/selftest', {});
    if (r.ok) return { text: `自检通过(${r.elapsedMs}ms):SMTP 会话与收信入库链路正常(自检信 [${r.receivedId}] 已收到)。` };
    return { text: `自检失败: ${r.error || '未知'}\n步骤: ${(r.steps || []).join(' | ')}`, isError: true };
  });
}

// ── 工具清单 ───────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'mail_stats',
    description: '查看邮件调试台状态:SMTP 收信口端口、收件箱数量/容量、存储目录。适用:「邮件调试台是什么状态」「测试邮件收到几封了」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolStats,
  },
  {
    name: 'mail_list',
    description: '列出收件箱里的测试邮件(新的在前)。每封含 id/主题/发件人/收件人/时间/附件数。适用:「看看收到什么邮件」「列一下邮件」。读全文用 mail_get。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选,关键词(主题/发件人/收件人/正文)' },
        limit: { type: 'number', description: '可选,条数(默认 15,最多 50)' },
      },
    },
    run: toolList,
  },
  {
    name: 'mail_get',
    description: '读一封邮件的全文(纯文本正文+疑似验证码+附件清单)。不传 id 读最新一封。适用:「读一下最新邮件」「刚才那封验证码是多少」——验证码直接看返回里的 codes 字段,不要自己猜。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '可选,邮件 id(来自 mail_list/mail_search;缺省=最新一封)' },
      },
    },
    run: toolGet,
  },
  {
    name: 'mail_search',
    description: '在收件箱里搜邮件(主题/发件人/收件人/正文关键词)。适用:「找一下来自 noreply 的邮件」「搜带 重置密码 的邮件」。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词(必填)' },
      },
      required: ['query'],
    },
    run: toolSearch,
  },
  {
    name: 'mail_delete',
    description: '删除一封邮件(不可逆)。适用:「删掉这封」。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '邮件 id(必填)' } },
      required: ['id'],
    },
    run: toolDelete,
  },
  {
    name: 'mail_clear',
    description: '清空整个收件箱(不可逆,慎用)。环形上限(500 封/200MB)之外不需要手动清理。',
    inputSchema: { type: 'object', properties: {} },
    run: toolClear,
  },
  {
    name: 'mail_selftest',
    description: '运行内置自检:向本机 SMTP 收信口发一封真信并断言收到,验证收信链路端到端可用。适用:「邮件调试台还好吗」「收不到信,先自检一下」。约 1-6 秒。',
    inputSchema: { type: 'object', properties: {} },
    run: toolSelftest,
  },
];

// ── JSON-RPC stdio 主循环(与 mock-server 同范式;协议数据只走 stdout)──────────
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
        serverInfo: { name: 'mail-desk', version: VERSION },
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

slog(`mail-desk mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
