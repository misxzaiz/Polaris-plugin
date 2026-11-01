#!/usr/bin/env node
'use strict';
/**
 * SQLite 检查台 MCP Server —— AI 工具层（stdio，零依赖）
 *
 * 与 disk-radar 不同：本插件的操作是交互式查询（毫秒级），所以 MCP 直连
 * 服务 HTTP（127.0.0.1:<meta.port> + token，meta 在 cap.kv sqltl.meta），
 * 不走 kv 命令轮询。服务不在时尝试经 cap.pluginServiceManager 自举启动。
 *
 * 安全设计（工具描述里明示）：
 *   - sqlite_query 只读；sqlite_write 是两步写——先预览出 pendingId，
 *     必须经用户确认后用 sqlite_confirm 才真正落库；写前自动整库备份。
 *   - UPDATE/DELETE 无 WHERE 会被闸门拒绝。
 *
 * 工具一览：
 *   sqlite_radar    发现磁盘上的 SQLite 库文件
 *   sqlite_open     打开库（校验魔数，返回表清单/签名识别）
 *   sqlite_schema   表结构（列/索引/外键/DDL/行数）
 *   sqlite_query    只读查询（SELECT/WITH/EXPLAIN/只读 PRAGMA）
 *   sqlite_stats    文件膨胀/页统计
 *   sqlite_write    两步写·第一步：预览（回滚验证，返回待确认单）
 *   sqlite_confirm  两步写·第二步：确认提交（先备份）/取消
 *   sqlite_export   导出 CSV/JSON 文件
 */
const http = require('http');
const crypto = require('crypto');

const core = require('../shared/lens-core');
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'sqlite-lens';
const SERVER_VERSION = core.VERSION;
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

// ── 服务访问（meta → 直连 HTTP；不可达时自举启动一次）───────────────────────
async function loadMeta() {
  const m = await kv.kvGet(core.K.meta).catch(() => null);
  if (m && typeof m === 'object' && typeof m.port === 'number' && m.port && typeof m.token === 'string' && m.token) {
    return m;
  }
  return null;
}

function svcOnce(meta, pathname, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request(
      {
        hostname: '127.0.0.1', port: meta.port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SqliteLens-Token': meta.token, 'Content-Length': Buffer.byteLength(data) },
        timeout: 60000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(buf)); } catch (_) { resolve({ ok: false, error: `服务返回非 JSON（HTTP ${res.statusCode}）` }); }
        });
      },
    );
    req.on('timeout', () => { req.destroy(new Error('服务超时（60s）')); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(data);
    req.end();
  });
}

async function tryBootstrapService() {
  // 与面板 serviceAction 同款三步：list_status → discover → start
  try {
    const st = await kv.dispatchOk('cap.pluginServiceManager', { action: 'list_status' });
    const arr = Array.isArray(st) ? st : [];
    const mine = arr.find((s) => s.pluginId === 'sqlite-lens' && s.serviceId === 'sqlite-lens-service');
    if (mine && (mine.state === 'running' || mine.status === 'running')) return true;
    const r = await kv.dispatchOk('cap.pluginDiscovery', { action: 'discover' });
    const self = (r.plugins || []).find((p) => p.id === 'sqlite-lens');
    const svc = self && self.contributes && self.contributes.services && self.contributes.services.find((s) => s.id === 'sqlite-lens-service');
    if (!self || !svc) return false;
    await kv.dispatchOk('cap.pluginServiceManager', {
      action: 'start', pluginId: 'sqlite-lens', installPath: self.installPath,
      contribution: {
        id: svc.id, type: svc.type ?? svc.serviceType, command: svc.command,
        argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
        port: svc.port ?? null, healthCheck: svc.healthCheck ?? null,
        healthCheckTimeout: svc.healthCheckTimeout ?? null, autoStart: svc.autoStart ?? true,
        restartOnFailure: svc.restartOnFailure ?? true, maxRestarts: svc.maxRestarts ?? 3,
        description: svc.description ?? null,
      },
    });
    return true;
  } catch (e) {
    log('warn', `自举启动失败: ${e.message}`);
    return false;
  }
}

/** 服务调用统一入口：meta 失效/服务不在 → 自举一次 → 重试一次 */
async function svc(pathname, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const meta = await loadMeta();
    if (meta) {
      const r = await svcOnce(meta, pathname, body);
      if (!(r && r.ok === false && /ECONNREFUSED|EHOSTUNREACH|socket hang up|服务超时/.test(String(r.error)))) {
        return r;
      }
    }
    if (attempt === 0) {
      log('info', '服务不可达，尝试自举启动…');
      const okBoot = await tryBootstrapService();
      if (!okBoot) {
        return { ok: false, error: 'SQLite 检查台服务未运行且自举失败——请在 Polaris 面板打开一次「SQLite 检查台」再试' };
      }
      await new Promise((r2) => setTimeout(r2, 2500)); // 等服务起
    }
  }
  return { ok: false, error: 'SQLite 检查台服务不可达' };
}

// ── 结果格式化 ───────────────────────────────────────────────────────────────
function ok(text) {
  return { content: [{ type: 'text', text: String(text).slice(0, 20000) }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text: String(text) }], isError: true };
}

function fmtTable(columns, rows, { maxRows = 30 } = {}) {
  if (!rows.length) return '（0 行）';
  const widths = columns.map((c) => String(c).length);
  const cell = (v) => {
    if (v === null || v === undefined) return 'NULL';
    const t = typeof v === 'object' && v !== null && 't' in v ? v.v : v;
    return String(t).replace(/\r?\n/g, '␤').slice(0, 60);
  };
  const table = rows.slice(0, maxRows).map((r) => r.map(cell));
  for (const r of table) r.forEach((v, i) => { widths[i] = Math.min(60, Math.max(widths[i], v.length)); });
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
  const line = (r) => r.map((v, i) => String(v).padEnd(widths[i])).join(' | ');
  const head = line(columns);
  let out = [head, sep, ...table.map(line)];
  if (rows.length > maxRows) out.push(`…（共 ${rows.length} 行，仅显示前 ${maxRows} 行）`);
  return out.join('\n');
}

function fmtRowsPayload(r) {
  const lines = [];
  lines.push(`行数：${r.totalRows ?? r.rows.length}${r.truncated ? '（已截断）' : ''}${r.ms !== undefined ? ` · ${r.ms}ms` : ''}`);
  if (r.columns.length) lines.push(`列：${r.columns.join(' | ')}`);
  lines.push('');
  lines.push(fmtTable(r.columns, r.rows, { maxRows: 30 }));
  return lines.join('\n');
}

// ── 工具定义 ─────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'sqlite_radar',
    description: 'SQLite 检查台·库文件雷达：扫描常见目录（或指定根）找 .db/.sqlite 等库文件，读文件头区分真 SQLite 库与碰巧同名的文件，按大小排序。适用：用户问「我电脑上有哪些 sqlite 数据库」「帮我找找 xx 应用的数据库文件」。',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: '扫描根目录绝对路径（可选；不传扫内置常见目录）' },
        maxDepth: { type: 'integer', description: '目录深度（默认 5，上限 8）' },
        limit: { type: 'integer', description: '最多返回几条（默认 40，上限 200）' },
      },
    },
    async call(args) {
      const r = await svc('/api/radar', { root: args.root, maxDepth: args.maxDepth, budgetMs: 4000 });
      if (!r.ok) return err(r.error || '雷达扫描失败');
      const lim = Math.min(200, Math.max(5, Number(args.limit) || 40));
      const items = r.items.slice(0, lim);
      if (!items.length) return ok(`${args.root ? args.root : '常见目录'}里没找到 .db/.sqlite 文件（扫描了 ${r.walked} 个目录${r.partial ? '，预算内未扫完' : ''}）。`);
      const lines = [`找到 ${r.items.length} 个库文件候选（${r.partial ? '预算内未扫完，' : ''}按大小排序）：`];
      for (const it of items) {
        const tag = it.sqlite === true ? '' : it.sqlite === false ? '【非SQLite】' : '';
        lines.push(`  · ${it.path} — ${core.fmtBytes(it.sizeBytes)}${tag}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'sqlite_open',
    description: 'SQLite 检查台·打开库：校验文件头、以只读方式打开，返回库概览（表清单/视图/索引数、已知应用签名识别、journal 模式）。之后的 schema/query/stats 等工具都要用返回的 dbId。适用：用户说「打开这个数据库」「看看 xx.db 里有什么」。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '库文件绝对路径' },
      },
      required: ['path'],
    },
    async call(args) {
      const p = typeof args.path === 'string' ? args.path.trim() : '';
      if (!p) return err('path 必填');
      const r = await svc('/api/open', { path: p });
      if (!r.ok) return err(r.error || '打开失败');
      const lines = [
        `已打开（只读）：${r.file}`,
        `大小 ${core.fmtBytes(r.sizeBytes)} · journal=${r.journalMode} · 表 ${r.tables.length} / 视图 ${r.views} / 索引 ${r.indexes}`,
        r.knownAs ? `识别为：${r.knownAs}` : '',
        '',
        `dbId: ${r.dbId}（后续工具请带这个 id）`,
        `表：${r.tables.slice(0, 60).join('、')}${r.tables.length > 60 ? ` …共 ${r.tables.length} 张` : ''}`,
      ];
      return ok(lines.filter(Boolean).join('\n'));
    },
  },
  {
    name: 'sqlite_schema',
    description: 'SQLite 检查台·查表结构：列定义/主键/索引/外键/建表 DDL/行数。传 table 看单表；不传看全库对象清单。适用：写 SQL 前先看结构。',
    inputSchema: {
      type: 'object',
      properties: {
        dbId: { type: 'string', description: 'sqlite_open 返回的 dbId' },
        table: { type: 'string', description: '表名（可选；不传返回全库对象清单）' },
      },
      required: ['dbId'],
    },
    async call(args) {
      const r = await svc('/api/schema', { dbId: args.dbId, table: args.table });
      if (!r.ok) return err(r.error || '查 schema 失败');
      if (args.table) {
        const lines = [`表 ${r.table}：${r.rowCount !== null && r.rowCount !== undefined ? `${r.rowCount} 行` : '行数未知'}`];
        if (r.columns.length) {
          lines.push('列：');
          for (const c of r.columns) {
            lines.push(`  · ${c.name} ${c.type || '(无类型)'}${c.pk ? ' [主键]' : ''}${c.notNull ? ' NOT NULL' : ''}${c.dflt ? ` DEFAULT ${c.dflt}` : ''}`);
          }
        }
        if (r.indexes.length) lines.push(`索引：${r.indexes.map((i) => `${i.name}${i.unique ? ' (唯一)' : ''}`).join('、')}`);
        if (r.foreignKeys && r.foreignKeys.length) {
          lines.push('外键：');
          for (const f of r.foreignKeys) lines.push(`  · ${f.from} → ${f.table}.${f.to}`);
        }
        if (r.ddl && r.ddl[0] && r.ddl[0].sql) lines.push(`\nDDL：${r.ddl[0].sql}`);
        return ok(lines.join('\n'));
      }
      const lines = [`库对象（${r.objects.length} 个）：`];
      const byType = new Map();
      for (const o of r.objects) {
        if (!byType.has(o.type)) byType.set(o.type, []);
        byType.get(o.type).push(o.name);
      }
      for (const [t, names] of byType) lines.push(`【${t}】${names.slice(0, 40).join('、')}${names.length > 40 ? ` …共 ${names.length}` : ''}`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'sqlite_query',
    description: 'SQLite 检查台·只读查询：跑 SELECT/WITH/EXPLAIN/只读 PRAGMA，返回结果表（自动截断，无 LIMIT 会自动包裹防全量倾泻）。UPDATE/DELETE 等写语句在这里会被拒绝——写走 sqlite_write 两步通道。适用：用户问数据、AI 取证分析。',
    inputSchema: {
      type: 'object',
      properties: {
        dbId: { type: 'string', description: 'sqlite_open 返回的 dbId' },
        sql: { type: 'string', description: '单条只读 SQL（多语句会被拒绝）' },
        limit: { type: 'integer', description: '结果行上限（默认 1000）' },
      },
      required: ['dbId', 'sql'],
    },
    async call(args) {
      const r = await svc('/api/query', { dbId: args.dbId, sql: args.sql, limit: args.limit });
      if (!r.ok) return err(r.error || '查询失败');
      return ok(fmtRowsPayload(r));
    },
  },
  {
    name: 'sqlite_stats',
    description: 'SQLite 检查台·库统计：文件大小/页统计/空闲页（VACUUM 可回收空间）/journal 模式/WAL 大小/对象计数。适用：用户问「这个库为什么这么大」「能不能瘦身」。',
    inputSchema: {
      type: 'object',
      properties: { dbId: { type: 'string', description: 'dbId' } },
      required: ['dbId'],
    },
    async call(args) {
      const r = await svc('/api/stats', { dbId: args.dbId });
      if (!r.ok) return err(r.error || '统计失败');
      const lines = [
        `文件 ${core.fmtBytes(r.fileSize)} · 页 ${r.pageCount} × ${r.pageSize}B · journal=${r.journalMode} · WAL ${core.fmtBytes(r.walSize)}`,
        `空闲页 ${r.freelistPages}（可回收 ${core.fmtBytes(r.reclaimableBytes)}）`,
        `对象：表 ${r.counts.tables} / 视图 ${r.counts.views} / 索引 ${r.counts.indexes} / 触发器 ${r.counts.triggers}`,
        r.hint ? `提示：${r.hint}` : '',
      ];
      return ok(lines.filter(Boolean).join('\n'));
    },
  },
  {
    name: 'sqlite_write',
    description: 'SQLite 检查台·两步写第一步（预览）：校验写语句（UPDATE/DELETE 无 WHERE 拒绝；单语句），在事务里执行后回滚验证，返回影响行数与待确认单 pendingId。此时数据库【尚未改动】。必须把预览结果给用户看，经用户明确同意后用 sqlite_confirm 提交。写前会自动整库备份。适用：用户明确要求改数据/建表/删数据。',
    inputSchema: {
      type: 'object',
      properties: {
        dbId: { type: 'string', description: 'dbId' },
        sql: { type: 'string', description: '单条写 SQL（INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/VACUUM）' },
      },
      required: ['dbId', 'sql'],
    },
    async call(args) {
      const r = await svc('/api/write', { dbId: args.dbId, sql: args.sql });
      if (!r.ok) return err(r.error || '预览失败');
      const lines = [
        '【两步写·预览】（数据库尚未改动）',
        `SQL：${r.sql}`,
        `预计影响行数：${r.preview.changes === null ? '—（VACUUM 重建整个文件）' : r.preview.changes}`,
        `待确认单 pendingId：${r.pendingId}（10 分钟内有效）`,
        '',
        '下一步：把预览结果告诉用户，用户同意后调用 sqlite_confirm {pendingId, decision:"commit"}；用户不同意则 decision:"cancel"。',
      ];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'sqlite_confirm',
    description: 'SQLite 检查台·两步写第二步：提交（decision="commit"，写前自动整库备份，可恢复）或取消（decision="cancel"）。必须有用户的明确同意才能 commit——不要替用户做主。',
    inputSchema: {
      type: 'object',
      properties: {
        pendingId: { type: 'string', description: 'sqlite_write 返回的待确认单 id' },
        decision: { type: 'string', enum: ['commit', 'cancel'], description: 'commit=执行；cancel=取消' },
      },
      required: ['pendingId', 'decision'],
    },
    async call(args) {
      const r = await svc('/api/confirm', { pendingId: args.pendingId, decision: args.decision });
      if (!r.ok) return err(r.error || '确认失败');
      if (!r.executed) return ok('已取消，数据库未改动。');
      const lines = [
        '【已提交】',
        `影响行数：${r.changes}`,
        r.backup ? `备份：${r.backup.dest}（${core.fmtBytes(r.backup.size)}，方式 ${r.backup.how}）` : '（本次未新增备份——此前已备份过该文件）',
      ];
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'sqlite_export',
    description: 'SQLite 检查台·导出：把查询结果或整表导出为 CSV/JSON 文件（默认写 Downloads，BOM+RFC4180，Excel 直开）。适用：用户说「导出成 CSV」「把这个表存成 JSON」。',
    inputSchema: {
      type: 'object',
      properties: {
        dbId: { type: 'string', description: 'dbId' },
        sql: { type: 'string', description: '只读 SQL（与 table 二选一）' },
        table: { type: 'string', description: '整表导出的表名（与 sql 二选一）' },
        format: { type: 'string', enum: ['csv', 'json'], description: '默认 csv' },
        fileName: { type: 'string', description: '文件名（不含扩展名）' },
        outDir: { type: 'string', description: '输出目录绝对路径（默认用户 Downloads）' },
      },
      required: ['dbId'],
    },
    async call(args) {
      const r = await svc('/api/export', {
        dbId: args.dbId, sql: args.sql, table: args.table,
        format: args.format, fileName: args.fileName, outDir: args.outDir,
      });
      if (!r.ok) return err(r.error || '导出失败');
      return ok(`已导出 ${r.rows} 行 → ${r.path}（${core.fmtBytes(r.bytes)}，${r.format.toUpperCase()}）`);
    },
  },
];

// ── JSON-RPC 2.0 over stdio（协议数据只走 stdout，日志全走 stderr）──────────
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
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
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
