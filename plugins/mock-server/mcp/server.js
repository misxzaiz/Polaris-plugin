#!/usr/bin/env node
'use strict';
/**
 * server.js —— Mock 接口台 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层：把 tools/call 翻译成对 mock 路由/历史的查询与操作。
 *   - mock_overview / mock_routes / mock_history：读 cap.kv（mck.meta / mck.settings / mck.hist.*）
 *   - mock_upsert / mock_delete / mock_import_openapi：读改写 mck.settings（写前重读）
 *   - mock_test / mock_selftest：写单槽命令键 mck.cmd（服务消费，先删后做，结果 mck.result）
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 * 注意：历史里的请求头已由服务脱敏；AI 摘要时仍建议对 payload 中的敏感字段二次脱敏。
 */
const crypto = require('crypto');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[mock-server:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── 数据读取 ───────────────────────────────────────────────────────────────
async function readMeta() {
  const v = await kv.kvGet('mck.meta').catch(() => null);
  return v && typeof v === 'object' && v.lastTickAt ? v : null;
}
async function readSettings() {
  const v = await kv.kvGet('mck.settings').catch(() => null);
  return core.normalizeSettings(v);
}
/** 写回 settings（读-改-写之间不设长事务；单用户语义，写前重读对齐 changqi 纪律） */
async function writeSettings(mutator) {
  const fresh = await readSettings();
  const out = mutator(fresh);
  if (out.error) return out;
  out.settings.updatedAt = Date.now();
  await kv.kvSet('mck.settings', out.settings);
  return { ok: true, settings: out.settings };
}
/** 读历史分块（按 idx.chunkCount 直读，不用 kvKeys——避开宿主 list 语义） */
async function readHistory() {
  const idx = await kv.kvGet('mck.idx').catch(() => null);
  const chunkCount = idx && Number.isInteger(idx.chunkCount) ? Math.min(idx.chunkCount, core.HIST_CHUNKS_KEEP) : 0;
  const map = {};
  for (let i = 0; i < chunkCount; i++) {
    const v = await kv.kvGet(`mck.hist.${i}`).catch(() => null);
    if (Array.isArray(v)) map[`mck.hist.${i}`] = v;
  }
  return core.readRing(map);
}
/** 写单槽命令键 → 轮询结果键（服务 tick 3s；自检含延迟路由，轮询 40s） */
async function sendCommand(op, payload, timeoutMs) {
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  await kv.kvSet('mck.cmd', { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    const r = await kv.kvGet('mck.result').catch(() => null);
    if (r && typeof r === 'object' && r.nonce === nonce) {
      await kv.kvDel('mck.result').catch(() => {});
      return r;
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  return { ok: false, error: '服务未在时限内响应（可能未运行：去 设置→插件→Mock 接口台 看服务状态）' };
}

// ── 工具实现 ───────────────────────────────────────────────────────────────
async function toolOverview() {
  const meta = await readMeta();
  if (!meta) return { text: 'Mock 接口台服务未上线（没有心跳）。请到 设置→插件→Mock 接口台 查看服务状态并启动。', isError: true };
  const s = await readSettings();
  const age = Math.round((Date.now() - (meta.lastTickAt || 0)) / 1000);
  const lines = [
    `服务: v${meta.version} ${meta.degraded ? '（kv 降级：mock 应答不受影响）' : '正常'}，心跳 ${age <= 90 ? `${age} 秒前` : `${Math.round(age / 60)} 分钟前（可能已停止）`}`,
    `入口: http://127.0.0.1:${meta.port}（仅本机）——把前端/测试的 baseURL 指向它即可`,
    `路由: ${meta.routeCount} 条（启用 ${meta.enabledCount}）  CORS: ${meta.corsMode}  fallback: ${meta.fallbackEnabled ? '开' : '关'}`,
    ...s.routes.slice(0, 30).map((r) => `  - [${r.enabled ? '启用' : '停用'}] ${r.method} ${r.path} → ${r.status}${r.delayMs ? ` 延迟${r.delayMs}ms` : ''}${r.errorRate ? ` 错误率${r.errorRate}%` : ''}  ${r.name}`),
    `历史: 累计 ${meta.histTotal || 0} 条，最近一条 ${meta.lastReqAt ? new Date(meta.lastReqAt).toISOString().replace('T', ' ').slice(0, 19) : '无'}`,
    `提示: 未匹配路径会打 404 诊断体；说「帮我造一个 /api/xxx 的 mock 接口」即可用 mock_upsert 建路由。`,
  ];
  return { text: lines.join('\n') };
}

async function toolRoutes() {
  const meta = await readMeta();
  const s = await readSettings();
  if (!s.routes.length) return { text: `还没有路由。服务入口 http://127.0.0.1:${meta ? meta.port : 9868}。直接说「帮我造一个 GET /api/users 返回用户列表的 mock」我来建。` };
  const lines = s.routes.map((r, i) => `${i + 1}. [${r.id}] ${r.enabled ? '✓' : '✗'} ${r.method} ${r.path} → ${r.status} ${r.bodyType}${r.delayMs ? ` 延迟${r.delayMs}ms` : ''}${r.errorRate ? ` 错误率${r.errorRate}%` : ''}\n     ${r.name}  体 ${r.body.length}B`);
  return { text: `共 ${s.routes.length} 条路由：\n${lines.join('\n')}\n\n要新建/修改用 mock_upsert（传 id 为修改），要删用 mock_delete。` };
}

async function toolUpsert(args) {
  const meta = await readMeta();
  if (!meta) return { text: '服务未上线（读不到 kv 也可能只是服务没跑；仍可写路由，服务起来后 3s 内生效）。', isError: false };
  const routeInput = args && args.route;
  if (!routeInput || typeof routeInput !== 'object') return { text: '缺少 route 对象（字段：method/path/status/body/bodyType/delayMs/errorRate/enabled/name/headers）', isError: true };
  const n = core.normalizeRoute(routeInput, routeInput.id ? { partial: true } : {});
  if (!n.ok) return { text: `路由不合法: ${n.error}`, isError: true };
  const r = await writeSettings((fresh) => {
    const up = core.upsertRoute(fresh.routes, n.route);
    if (!up.ok) return { error: up.error };
    fresh.routes = up.routes;
    return { settings: fresh };
  });
  if (r.error) return { text: r.error, isError: true };
  const route = n.route;
  const port = meta.port || 9868;
  return {
    text: [
      `${routeInput.id ? '已更新' : '已新建'}路由 [${route.id}] ${route.name}`,
      `  ${route.method} http://127.0.0.1:${port}${route.path} → ${route.status}${route.delayMs ? `（延迟 ${route.delayMs}ms）` : ''}${route.errorRate ? `（错误率 ${route.errorRate}%）` : ''}`,
      routeInput.id ? '' : '  提示：服务 3s 内热更生效；可立即用 mock_test 试一发验证。',
    ].filter(Boolean).join('\n'),
  };
}

async function toolDelete(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return { text: '缺少 id（先 mock_routes 拿 id）', isError: true };
  const r = await writeSettings((fresh) => {
    const rm = core.removeRoute(fresh.routes, id);
    if (!rm.ok) return { error: `路由不存在: ${id}` };
    fresh.routes = rm.routes;
    return { settings: fresh };
  });
  if (r.error) return { text: r.error, isError: true };
  return { text: `已删除路由 [${id}]（服务 3s 内生效）。` };
}

async function toolHistory(args) {
  const ring = await readHistory();
  if (!ring.length) return { text: '暂无请求历史（历史只保留最近 500 条，服务重启清空）。往 http://127.0.0.1:<port>/你的路由 发一次请求再看。' };
  const q = String((args && args.q) || '').trim().toLowerCase();
  const status = parseInt(args && args.status, 10) || 0;
  const limit = Math.min(Math.max(parseInt(args && args.limit, 10) || 15, 1), 50);
  let rows = ring;
  if (q) rows = rows.filter((r) => `${r.method} ${r.path} ${r.query} ${JSON.stringify(r.reqBodyPreview)}`.toLowerCase().includes(q));
  if (status) rows = rows.filter((r) => Math.floor(r.status / 100) === Math.floor(status / 100));
  rows = rows.slice(0, limit);
  if (!rows.length) return { text: '没有符合条件的历史记录。' };
  return { text: `最近请求 ${rows.length} 条（新在前；请求头敏感字段已脱敏）：\n${rows.map((r) => `- ${core.summarizeHist(r)}`).join('\n')}\n\n要看某条的请求体/请求头全文，把它的 path 告诉用户或在面板「历史」页查看。` };
}

async function toolTest(args) {
  const meta = await readMeta();
  if (!meta) return { text: '服务未上线，无法试发。', isError: true };
  const routeId = String((args && args.routeId) || '').trim();
  if (!routeId) return { text: '缺少 routeId（先 mock_routes 拿 id）', isError: true };
  const payload = { routeId };
  if (args && args.query) payload.query = String(args.query);
  if (args && args.body !== undefined) payload.body = args.body;
  const r = await sendCommand('test_route', payload, 25000);
  if (!r.ok) return { text: `试发失败: ${r.error || '未知'}`, isError: true };
  const lines = [
    `请求: ${r.request}`,
    `状态: ${r.status}${r.error ? `（错误: ${r.error}）` : ''}`,
    `响应体预览:\n${oneLine(r.bodyPreview || '(空)', 1500)}`,
  ];
  return { text: lines.join('\n') };
}

async function toolSelftest() {
  const r = await sendCommand('selftest', {}, 45000);
  if (!r.ok) return { text: `自检失败: ${r.error || '未知'}`, isError: true };
  const rep = r.report;
  const lines = [
    `自检 ${rep.passed}/${rep.total} ${rep.allGreen ? '✅ 全绿' : '❌ 有失败'}（${rep.durationMs}ms）`,
    ...rep.checks.map((c) => `  ${c.pass ? '✅' : '❌'} ${c.item} —— ${c.detail}（${c.ms}ms）`),
  ];
  return { text: lines.join('\n'), isError: !rep.allGreen };
}

async function toolImportOpenApi(args) {
  let spec = args && args.spec;
  if (typeof spec === 'string') {
    try { spec = JSON.parse(spec); } catch (e) { return { text: `spec 不是合法 JSON: ${e.message}（YAML 请先转 JSON）`, isError: true }; }
  }
  const apply = (args && args.apply) === true;
  const prefix = String((args && args.prefix) || '');
  const imp = core.importOpenApi(spec, { prefix });
  if (!imp.ok) return { text: `导入失败: ${imp.error}${imp.warnings && imp.warnings.length ? `\n${imp.warnings.join('\n')}` : ''}`, isError: true };
  if (!apply) {
    const preview = imp.routes.slice(0, 20).map((r) => `  ${r.method} ${r.path} → ${r.status}  ${r.name}`);
    return { text: `可导入 ${imp.routes.length} 条路由（预览前 ${Math.min(20, imp.routes.length)} 条）：\n${preview.join('\n')}\n\n确认后带 apply:true 重新调用即写入。${imp.warnings.length ? `\n警告:\n${imp.warnings.join('\n')}` : ''}` };
  }
  const r = await writeSettings((fresh) => {
    let routes = fresh.routes;
    let added = 0; let skipped = 0;
    for (const rt of imp.routes) {
      const up = core.upsertRoute(routes, rt);
      if (!up.ok) { skipped += 1; continue; }
      routes = up.routes; added += 1;
    }
    fresh.routes = routes;
    return { settings: fresh, added, skipped };
  });
  if (r.error) return { text: r.error, isError: true };
  const meta = await readMeta();
  return { text: `已导入 ${r.added || imp.routes.length} 条路由到 http://127.0.0.1:${meta ? meta.port : 9868}（3s 内生效）。${r.skipped ? `（${r.skipped} 条因路由数达上限跳过）` : ''}\n用 mock_routes 看全表，mock_test 抽查。` };
}

const TOOLS = [
  {
    name: 'mock_overview',
    description: '查看 Mock 接口台总览：服务状态、本机入口地址（http://127.0.0.1:<port>）、路由清单摘要、CORS/fallback 配置、请求历史统计。适用：「mock 服务在哪」「现在有哪些假接口」「服务跑着吗」。',
    inputSchema: { type: 'object', properties: {} },
    run: toolOverview,
  },
  {
    name: 'mock_routes',
    description: '列出全部 mock 路由（id/方法/路径/状态码/延迟/错误率/启用状态/响应体大小）。id 供 mock_upsert（修改）/ mock_delete / mock_test 使用。',
    inputSchema: { type: 'object', properties: {} },
    run: toolRoutes,
  },
  {
    name: 'mock_upsert',
    description: '新建或修改一条 mock 路由。适用：「帮我造一个 GET /api/users 返回 3 个用户的接口」「把这个接口改成返回 500」「给它加 2 秒延迟」。响应体支持模板：{{int 1,99}} {{cname}} {{email}} {{uuid}} {{pick a|b|c}} {{req.path.id}} {{req.query.x}} {{req.body.a.b}} 等（未识别的表达式按字面保留）。传 id=修改，不传 id=新建。',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'object',
          description: '路由对象：method(GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/ANY)、path(如 /api/users/:id，* 结尾为通配)、status、bodyType(json/text/empty)、body(响应体模板字符串)、delayMs(0-60000)、errorRate(0-100)、errorStatus(400-599)、enabled、name、headers(自定义响应头对象，≤10个)',
          required: ['method', 'path'],
        },
      },
      required: ['route'],
    },
    run: toolUpsert,
  },
  {
    name: 'mock_delete',
    description: '删除一条 mock 路由。适用：「把 /api/xxx 那个 mock 删了」。不可恢复（需要时重建即可，成本很低）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '路由 id（来自 mock_routes）' } },
      required: ['id'],
    },
    run: toolDelete,
  },
  {
    name: 'mock_history',
    description: '查看最近打到 mock 服务的请求历史（时间/方法/路径/应答码/延迟/匹配到的路由；请求头敏感字段已脱敏）。适用：「刚才前端打了哪些请求」「有没有 404」「这个接口被调了多少次」。历史只保留最近 500 条、服务重启清空。',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '可选，关键词（匹配方法/路径/请求体）' },
        status: { type: 'number', description: '可选，按状态类过滤（如 404、500）' },
        limit: { type: 'number', description: '可选，条数（默认 15，最多 50）' },
      },
    },
    run: toolHistory,
  },
  {
    name: 'mock_test',
    description: '按路由配置真实试发一次请求（路径参数自动用示例值实例化），返回实际状态码与响应体预览。适用：「试一下这个接口」「改完验证返回什么」。服务端自发自收（127.0.0.1），这次试发也会进历史。',
    inputSchema: {
      type: 'object',
      properties: {
        routeId: { type: 'string', description: '路由 id（来自 mock_routes）' },
        query: { type: 'string', description: '可选，query 串（如 tag=abc&x=1）' },
        body: { type: 'object', description: '可选，POST/PUT 的 JSON 请求体' },
      },
      required: ['routeId'],
    },
    run: toolTest,
  },
  {
    name: 'mock_selftest',
    description: '运行内置试金石自检：临时挂 5 条探针路由（模板/参数回显/延迟/错误注入/POST 体回显）+ 404 诊断 + CORS 预检，逐项打真请求断言，用后即删。适用：「mock 服务还好吗」「自检一下」。单飞互斥，约 1-2 秒。',
    inputSchema: { type: 'object', properties: {} },
    run: toolSelftest,
  },
  {
    name: 'mock_import_openapi',
    description: '把 OpenAPI 3.x JSON 导入为 mock 路由（每个 operation 一条，从 schema 生成带模板的示例响应体）。先不带 apply 预览，确认后 apply:true 写入。适用：「把这份 OpenAPI 变成 mock」「照 api.json 造一套假接口」。YAML 请先转 JSON。',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { description: 'OpenAPI 3.x JSON（对象或 JSON 字符串）' },
        apply: { type: 'boolean', description: '是否写入（先 false 预览，确认后 true）' },
        prefix: { type: 'string', description: '可选，路径前缀（如 /mock）' },
      },
      required: ['spec'],
    },
    run: toolImportOpenApi,
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
        serverInfo: { name: 'mock-server', version: VERSION },
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

slog(`mock-server mcp v${VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
