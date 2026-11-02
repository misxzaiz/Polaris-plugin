// 真实 PG 冒烟：embedded-postgres 起真库 → 经插件 service 全链路 EXPLAIN
// 运行：node test/smoke-real-pg.mjs（需先 npm i embedded-postgres pg 于外部临时目录，
//       并设 PG_SMOKE_DIR 指向它；此文件不进 zip，依赖不进插件）
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFreePort } from './helpers.mjs';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PG_SMOKE_DIR = process.env.PG_SMOKE_DIR;
if (!PG_SMOKE_DIR) {
  console.error('需要 PG_SMOKE_DIR=<embedded-postgres 安装目录>；见文件头注释');
  process.exit(2);
}
const require2 = createRequire(join(PG_SMOKE_DIR, 'package.json'));
const epModule = require2('embedded-postgres');
const EmbeddedPostgres = epModule.default || epModule;
const { Client: PgClient } = require2('pg');

let PORT = 54329;
let SVC_PORT = 9869;
const TOKEN = 'pgsmoke-0123456789abcdef';
const AUTH = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

async function api(path, body) {
  const res = await fetch(`http://127.0.0.1:${SVC_PORT}/${path}`, {
    method: 'POST', headers: AUTH, body: JSON.stringify(body || {}),
  });
  return res.json();
}

const pgTmp = mkdtempSync(join(tmpdir(), 'qpl-pgdata-'));
PORT = await getFreePort();
const pg = new EmbeddedPostgres({
  database: 'shopdb', user: 'postgres', password: 'smoke-pw', port: PORT, persistent: false,
  databaseDir: join(pgTmp, 'data'),
});

let svc = null;
let tmp = null;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { console.log(`  ✔ ${name}`); } else { failed += 1; console.error(`  ✖ ${name}${extra ? ` — ${extra}` : ''}`); }
}

try {
  console.log('[1] 启动嵌入式 PostgreSQL…');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('shopdb');

  // 造数据：orders 5000 行，customer_id 无索引（保证全表扫诊断命中）
  const boot = new PgClient({ host: '127.0.0.1', port: PORT, database: 'shopdb', user: 'postgres', password: 'smoke-pw' });
  await boot.connect();
  await boot.query('CREATE TABLE orders (id serial primary key, customer_id int not null, amount numeric(10,2), note text, created_at timestamptz default now())');
  await boot.query('CREATE TABLE customers (id serial primary key, name text)');
  await boot.query('INSERT INTO customers (name) SELECT \'客户\' || i FROM generate_series(1, 50) i');
  await boot.query(`INSERT INTO orders (customer_id, amount, note)
    SELECT (i % 50) + 1, (i % 97)::numeric * 1.5, '订单备注-' || i
    FROM generate_series(1, 5000) i`);
  // 故意造统计偏差：把统计目标设小再 ANALYZE，让优化器低估
  await boot.query('ANALYZE orders');
  await boot.end();

  console.log('[2] 启动插件 service（hermetic）…');
  SVC_PORT = await getFreePort();
  tmp = mkdtempSync(join(tmpdir(), 'qpl-pgsmoke-'));
  svc = spawn(process.execPath, [join(ROOT, 'service', 'main.js'), String(SVC_PORT), tmp], {
    env: { ...process.env, QPL_NO_KV: '1', QPL_TOKEN: TOKEN },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${SVC_PORT}/__health`)).ok) break; } catch (_) { /* wait */ }
    if (Date.now() - t0 > 10000) throw new Error('service 未就绪');
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log('[3] 保存真实连接…');
  const save = await api('conns.save', {
    name: '嵌入式PG', engine: 'pg', host: '127.0.0.1', port: PORT,
    database: 'shopdb', user: 'postgres', password: 'smoke-pw',
  });
  assert.equal(save.ok, true);

  console.log('[4] conns.test（真连接）…');
  const t = await api('conns.test', { id: save.id });
  check('连接成功且报版本', t.ok === true && /^\d/.test(t.serverVersion || ''), JSON.stringify(t));
  console.log(`    serverVersion=${t.serverVersion} latency=${t.latencyMs}ms`);

  console.log('[5] plan.explain 估算计划（FORMAT JSON）…');
  const e1 = await api('plan.explain', {
    connId: save.id,
    sql: 'SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.amount > 50 ORDER BY o.created_at DESC LIMIT 20',
  });
  check('explain 成功', e1.ok === true, e1.error);
  if (e1.ok) {
    check('引擎=pg', e1.plan.engine === 'pg');
    check('树含 Limit 根', e1.plan.root.nodeType === 'Limit', e1.plan.root.nodeType);
    check('计划含 Seq Scan（orders 无可用索引）', JSON.stringify(e1.plan).includes('Seq Scan'));
  check('发现非空', e1.findings.length > 0, JSON.stringify(e1.findings.map((f) => f.title)));
  check('估算计划无 Execution Time 字段（本就属 ANALYZE）', e1.plan.executionMs === null);
    console.log(`    节点数=${e1.plan.nodeCount} 发现=${e1.findings.map((f) => f.title.slice(0, 24)).join(' / ')}`);
  }

  console.log('[6] plan.explain ANALYZE（真实执行）…');
  const e2 = await api('plan.explain', {
    connId: save.id,
    sql: 'SELECT customer_id, count(*) FROM orders GROUP BY customer_id ORDER BY count(*) DESC',
    analyze: true,
  });
  check('ANALYZE 成功', e2.ok === true, e2.error);
  if (e2.ok) {
  check('meta.analyzeUsed=true', e2.meta.analyzeUsed === true);
  check('存在实际行数节点', JSON.stringify(e2.plan).includes('"actRowsTotal"') && e2.plan.root.actRowsTotal !== null);
  check('自耗时已计算', e2.plan.root.selfMs !== null);
  check('ANALYZE 报告 Execution Time', e2.plan.executionMs !== null);
    console.log(`    执行=${fmtMs(e2.plan.executionMs)} 发现=${e2.findings.map((f) => f.title.slice(0, 24)).join(' / ') || '无'}`);
  }

  console.log('[7] 护栏：对真库发写语句必须拒绝且未执行…');
  const guard1 = await api('plan.explain', { connId: save.id, sql: "INSERT INTO orders (customer_id, amount) VALUES (1, 1)" });
  check('INSERT 拒绝', guard1.ok === false, guard1.error);
  const guard2 = await api('plan.explain', { connId: save.id, sql: 'SELECT 1; DELETE FROM orders' });
  check('多语句拒绝', guard2.ok === false, guard2.error);
  const cnt = new PgClient({ host: '127.0.0.1', port: PORT, database: 'shopdb', user: 'postgres', password: 'smoke-pw' });
  await cnt.connect();
  const c1 = await cnt.query('SELECT count(*)::int AS n FROM orders');
  check('库中数据未被动过（5000 行）', c1.rows[0].n === 5000, String(c1.rows[0].n));
  await cnt.end();

  console.log('[8] ANALYZE 未执行场景：SELECT 空返回计划仍成功…');
  const e3 = await api('plan.explain', { connId: save.id, sql: 'SELECT * FROM orders WHERE id = -1' });
  check('空结果集计划成功', e3.ok === true, e3.error);

  console.log('[9] 历史自动留痕…');
  const h = await api('history.list', {});
  check('历史 >= 2 条', h.ok && h.items.length >= 2, String(h.items?.length));
  const g = await api('history.get', { id: h.items[0].id });
  check('历史回读成功', g.ok === true, g.error);
} finally {
  if (svc) svc.kill();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  try { await pg.stop(); } catch (_) { /* already */ }
  await new Promise((r) => setTimeout(r, 500)); // Windows：postmaster 句柄释放有延迟
  try {
    rmSync(pgTmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (e) {
    console.warn(`（临时 PG 数据目录清理被占用，留待系统回收：${e.code || e.message}）`);
  }
}

function fmtMs(n) {
  if (n === null || n === undefined) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Number(n).toFixed(1)}ms`;
}

if (failed) {
  console.error(`\n冒烟失败 ${failed} 项`);
  process.exit(1);
}
console.log('\n真实 PG 冒烟全部通过 ✔');
