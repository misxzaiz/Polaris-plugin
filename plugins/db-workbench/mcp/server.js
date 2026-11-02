'use strict';
/**
 * server.js —— 数据库工作台 MCP server（stdio JSON-RPC，零依赖）
 *
 * AI 工具层。七工具全部只读：query/redis 走 service 的 /mcp/* 通道
 * （service 侧 forceReadonly，与面板写模式无关），AI 永远无法经本工具改库。
 *
 * 发现链：本进程经 cap.kv 读 `dbl.service`（{port, token}）→ 直连
 * 127.0.0.1:<port> 的 service HTTP。宿主未起或服务未起时返回可读错误。
 *
 * 协议数据只走 stdout；日志走 stderr。启动参数：node server.js <appConfigDir>
 */
const http = require('http');
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function slog(msg) { process.stderr.write(`[db-workbench:mcp] ${msg}\n`); }
function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });

// ── service HTTP 客户端 ─────────────────────────────────────────────────────

let cachedSvc = null;

async function serviceInfo() {
  if (cachedSvc && Date.now() - cachedSvc.at < 30000) return cachedSvc.info;
  const info = await kv.kvGet('dbl.service').catch(() => null);
  if (!info || !Number.isFinite(info.port) || !info.token) {
    throw new Error('db-workbench 服务不可达：宿主未启动或服务未就绪（可在面板打开「数据库工作台」后重试）');
  }
  cachedSvc = { info, at: Date.now() };
  return info;
}

function invalidateService() { cachedSvc = null; }

function svcRequest(method, path, body, timeoutMs) {
  return serviceInfo().then((svc) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port: svc.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${svc.token}`,
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs || 20000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.payload = parsed;
            reject(err);
          } else resolve(parsed);
        } catch (_) {
          reject(new Error(`service 返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('service 请求超时')));
    req.on('error', (e) => {
      invalidateService(); // 连接失败大概率是服务已重启/端口漂移，强制下次重读 kv
      reject(e);
    });
    req.write(data);
    req.end();
  }));
}

// ── 工具输出格式化 ──────────────────────────────────────────────────────────

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(e) { return { content: [{ type: 'text', text: `✗ ${e && e.message ? e.message : String(e)}` }], isError: true }; }

function fmtProfile(p) {
  const bits = [
    `${p.name} [${p.id}]`,
    `${p.type}://${core.describeTarget(p)}`,
    p.readonly ? '只读' : (p.allowWrite ? '可写(面板写模式生效)' : '读写关闭'),
    p.hasStoredPass ? '已存密码' : '无存密码',
  ];
  return bits.join('  ');
}

function fmtTable(columns, rows, maxRows) {
  if (!rows || !rows.length) return '（0 行）';
  const cols = columns && columns.length ? columns : Object.keys(rows[0]);
  const lines = [cols.join(' | ')];
  for (const r of rows.slice(0, maxRows)) {
    lines.push(cols.map((c) => oneLine(r[c] == null ? 'NULL' : r[c], 60)).join(' | '));
  }
  return lines.join('\n');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

async function toolConnections() {
  const r = await svcRequest('GET', '/api/profiles');
  const items = r.items || [];
  if (!items.length) return ok('尚无连接。请在 Polaris 面板「数据库工作台 → 连接」里先创建（AI 出于安全不可添加连接）。');
  return ok(`共 ${items.length} 个连接：\n${items.map(fmtProfile).join('\n')}\n\n提示：dbw_query {profileId, sql} 只读查询；dbw_redis {profileId, command, args} 执行 Redis 白名单命令。`);
}

async function toolTables(args) {
  const profileId = String(args.profileId || '');
  let items;
  let schema = '';
  const profR = await svcRequest('GET', '/api/profiles');
  const prof = (profR.items || []).find((x) => x.id === profileId);
  if (!prof) return err(new Error('连接不存在（用 dbw_connections 查看）'));
  if (prof.type === 'redis') return err(new Error('Redis 连接没有表结构；用 dbw_redis {command:"SCAN", args:[...]} 浏览键'));
  if (prof.type === 'mysql') schema = args.schema || prof.database;
  else schema = args.schema || 'public';
  const t = await svcRequest('GET', `/api/tables?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}`);
  items = t.items || [];
  if (!items.length) return ok(`schema「${schema}」下没有表。`);
  const lines = items.map((x) => {
    const size = x.bytes != null && x.bytes > 0 ? `${(x.bytes / 1024).toFixed(1)}KB` : '';
    const rows = x.estRows != null ? `~${x.estRows}行` : '';
    return `${x.name}  [${x.type}]  ${rows} ${size} ${x.comment ? `— ${oneLine(x.comment, 40)}` : ''}`.trim();
  });
  return ok(`schema「${schema}」共 ${items.length} 个表：\n${lines.join('\n')}\n\n用 dbw_describe {profileId, table} 看结构。`);
}

async function toolDescribe(args) {
  const profileId = String(args.profileId || '');
  const table = String(args.table || '');
  if (!table) return err(new Error('table 必填'));
  const profR = await svcRequest('GET', '/api/profiles');
  const prof = (profR.items || []).find((x) => x.id === profileId);
  if (!prof) return err(new Error('连接不存在'));
  const schema = args.schema || (prof.type === 'mysql' ? prof.database : 'public');
  const q = `/api/describe?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`;
  const r = await svcRequest('GET', q);
  const cols = (r.columns || []).map((c) =>
    `${c.name}  ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.defaultValue != null ? ` 默认=${oneLine(c.defaultValue, 30)}` : ''}${c.comment ? ` — ${oneLine(c.comment, 40)}` : ''}`);
  const idx = (r.indexes || []).map((i) => `  ${i.name}${i.unique ? ' UNIQUE' : ''} ${i.ddl ? oneLine(i.ddl, 100) : (i.columns || []).join(',')}`.trim());
  let out = `表 ${schema}.${table}（${cols.length} 列）：\n${cols.join('\n')}`;
  if (idx.length) out += `\n\n索引：\n${idx.join('\n')}`;
  if (r.ddl) out += `\n\nDDL：\n${oneLine(r.ddl, 2000)}`;
  return ok(out);
}

async function toolQuery(args) {
  const profileId = String(args.profileId || '');
  const sql = String(args.sql || '');
  if (!sql.trim()) return err(new Error('sql 必填'));
  const r = await svcRequest('POST', '/mcp/query', { profileId, sql });
  if (!r.ok) {
    const hint = r.needsConfirm ? '（AI 通道永远只读；写语句一律拒绝）' : '';
    return err(new Error(`${r.error}${hint}`));
  }
  let out = `${r.rowCount} 行（${r.ms}ms）${r.truncated ? ` —— 结果超限已截断（只展示前 ${core.MCP_MAX_ROWS} 行）` : ''}\n`;
  out += fmtTable(r.columns, r.rows, core.MCP_MAX_ROWS);
  if (r.truncated) out += '\n\n提示：如需聚合结果，用 COUNT/SUM/GROUP BY 缩小行数。';
  return ok(out);
}

async function toolRedis(args) {
  const profileId = String(args.profileId || '');
  const command = String(args.command || '');
  const argsList = Array.isArray(args.args) ? args.args : [];
  const r = await svcRequest('POST', '/mcp/redis', { profileId, command, args: argsList });
  if (!r.ok) return err(new Error(r.error || 'redis 命令失败'));
  let replyText;
  if (Array.isArray(r.reply)) {
    replyText = r.reply.map((x) => (x == null ? 'nil' : typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n');
    if (replyText.length > 4000) replyText = `${replyText.slice(0, 4000)}…[截断]`;
  } else if (r.reply == null) {
    replyText = '(nil)';
  } else if (typeof r.reply === 'object') {
    replyText = JSON.stringify(r.reply, null, 2);
  } else {
    replyText = String(r.reply);
  }
  return ok(`(${r.ms}ms) ${replyText}`);
}

async function toolHistory() {
  const r = await svcRequest('GET', '/api/history');
  const items = (r.items || []).slice(0, 20);
  if (!items.length) return ok('暂无查询历史。');
  return ok(`最近 ${items.length} 条查询（新→旧）：\n${items.map((h) =>
    `${new Date(h.at).toLocaleString('zh-CN')}  ${h.ok ? '✓' : '✗'}  ${h.kind}  ${h.rows}行 ${h.ms}ms  [${h.profileName}]  ${oneLine(h.sql, 80)}${h.error ? `  错误:${oneLine(h.error, 60)}` : ''}`,
  ).join('\n')}`);
}

async function toolSelftest() {
  const r = await svcRequest('POST', '/api/selftest', {});
  const s = r.selftest || {};
  const lines = (s.checks || []).map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
  return ok(`自检 ${s.passed}/${s.total} 通过：\n${lines.join('\n')}\n\nservice 版本 ${VERSION}，pid ${s.at ? '运行中' : '未知'}。`);
}

// ── MCP 协议层 ──────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'dbw_connections',
    description: '列出数据库工作台里已配置的连接（MySQL/PostgreSQL/Redis），返回 profileId 供其他 dbw_* 工具使用。AI 不可添加连接。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dbw_tables',
    description: '列出某连接某 schema 下的所有表/视图，含估算行数与占用空间。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '连接 id（来自 dbw_connections）' },
        schema: { type: 'string', description: '可选。缺省用连接默认库（PG 默认 public）' },
      },
      required: ['profileId'],
    },
  },
  {
    name: 'dbw_describe',
    description: '查看表结构：列/类型/可空/默认值/注释/索引/DDL。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        table: { type: 'string', description: '表名' },
        schema: { type: 'string', description: '可选。缺省用连接默认库' },
      },
      required: ['profileId', 'table'],
    },
  },
  {
    name: 'dbw_query',
    description: '对 MySQL/PostgreSQL 执行只读 SQL 查询（SELECT/SHOW/DESCRIBE/EXPLAIN）。写语句一律拒绝；长表自动 LIMIT 50 并提示。数据经护栏与行数上限。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        sql: { type: 'string', description: '单条只读 SQL；多条/写语句会被拒绝' },
      },
      required: ['profileId', 'sql'],
    },
  },
  {
    name: 'dbw_redis',
    description: '对 Redis 连接执行白名单只读命令（GET/MGET/TTL/TYPE/HGETALL/LRANGE/ZRANGE/SCAN/INFO/PING 等）。写命令被拒绝；SCAN 必须带 COUNT<=1000。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        command: { type: 'string', description: 'Redis 命令名，如 GET / TTL / SCAN / HGETALL' },
        args: { type: 'array', items: { type: 'string' }, description: '命令参数，如 SCAN 的 ["0","MATCH","cache:*","COUNT","200"]' },
      },
      required: ['profileId', 'command'],
    },
  },
  {
    name: 'dbw_history',
    description: '查看最近查询历史（含成功/失败/耗时/行数），帮助 AI 了解上下文避免重复提问。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dbw_selftest',
    description: '运行护栏与协议自检（无需外部数据库连接），验证插件自身健康。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const HANDLERS = {
  dbw_connections: toolConnections,
  dbw_tables: toolTables,
  dbw_describe: toolDescribe,
  dbw_query: toolQuery,
  dbw_redis: toolRedis,
  dbw_history: toolHistory,
  dbw_selftest: toolSelftest,
};

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
    try { msg = JSON.parse(line); } catch (e) { slog(`非 JSON 行: ${oneLine(line, 100)}`); continue; }
    handleMsg(msg).catch((e) => slog(`handleMsg 异常: ${e.message}`));
  }
});

async function handleMsg(msg) {
  const { id, method } = msg;
  try {
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'db-workbench', version: VERSION },
      } });
    } else if (method === 'notifications/initialized') {
      // 无需响应
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const fn = HANDLERS[name];
      if (!fn) {
        send({ jsonrpc: '2.0', id, result: err(new Error(`未知工具 ${name}`)) });
        return;
      }
      try {
        const r = await fn(args);
        send({ jsonrpc: '2.0', id, result: r });
      } catch (e) {
        send({ jsonrpc: '2.0', id, result: err(e) });
      }
    } else if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法 ${method}` } });
    }
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, result: err(e) });
  }
}

process.stderr.write(`[db-workbench:mcp] started (version ${VERSION})\n`);
