// 真实 MySQL 冒烟：mysql-memory-server 起真库 → 经插件 service 全链路 EXPLAIN FORMAT=JSON
// 运行：node test/smoke-real-mysql.mjs（需先在外部临时目录 npm i mysql-memory-server mysql2，
//       并设 MY_SMOKE_DIR 指向它；此文件不进 zip，依赖不进插件）
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
const MY_SMOKE_DIR = process.env.MY_SMOKE_DIR;
if (!MY_SMOKE_DIR) {
  console.error('需要 MY_SMOKE_DIR=<mysql-memory-server 安装目录>；见文件头注释');
  process.exit(2);
}
const require2 = createRequire(join(MY_SMOKE_DIR, 'package.json'));
const { createDB } = require2('mysql-memory-server');
const mysql2 = require2('mysql2/promise');

let SVC_PORT = 9871;
const TOKEN = 'mysmoke-0123456789abcdef';
const AUTH = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

async function api(path, body) {
  const res = await fetch(`http://127.0.0.1:${SVC_PORT}/${path}`, {
    method: 'POST', headers: AUTH, body: JSON.stringify(body || {}),
  });
  return res.json();
}

let svc = null;
let tmp = null;
let db = null;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { console.log(`  ✔ ${name}`); } else { failed += 1; console.error(`  ✖ ${name}${extra ? ` — ${extra}` : ''}`); }
}

try {
  console.log('[1] 启动嵌入式 MySQL（首次会下载二进制，耐心）…');
  db = await createDB({ version: '8.4.x' });
  console.log(`    MySQL ${db.version ?? ''} @ 127.0.0.1:${db.port}/${db.dbName} user=${db.username}`);

  const boot = await mysql2.createConnection({
    host: '127.0.0.1', user: db.username, port: db.port, database: db.dbName, password: '',
  });
  await boot.query('CREATE TABLE orders (id INT PRIMARY KEY AUTO_INCREMENT, customer_id INT NOT NULL, amount DECIMAL(10,2), note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  await boot.query('CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100))');
  const values = [];
  for (let i = 1; i <= 5000; i += 1) values.push(`(${i % 50 + 1}, ${(i % 97) * 1.5}, '订单备注-${i}')`);
  await boot.query(`INSERT INTO orders (customer_id, amount, note) VALUES ${values.join(',')}`);
  await boot.query('INSERT INTO customers (id, name) SELECT seq, CONCAT(\'客户-\', seq) FROM seq_1_to_50').catch(async () => {
    // seq_1_to_50 是 MariaDB 语法；MySQL 用递归 CTE
    await boot.query('INSERT INTO customers (id, name) WITH RECURSIVE s AS (SELECT 1 AS seq UNION ALL SELECT seq+1 FROM s WHERE seq < 50) SELECT seq, CONCAT(\'客户-\', seq) FROM s');
  });
  await boot.query('ANALYZE TABLE orders');
  await boot.end();

  console.log('[2] 启动插件 service（hermetic）…');
  SVC_PORT = await getFreePort();
  tmp = mkdtempSync(join(tmpdir(), 'qpl-mysmoke-'));
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
    name: '嵌入式MySQL', engine: 'mysql', host: '127.0.0.1', port: db.port,
    database: db.dbName, user: db.username, password: '',
  });
  assert.equal(save.ok, true);

  console.log('[4] conns.test…');
  const t = await api('conns.test', { id: save.id });
  check('连接成功且报版本', t.ok === true && /^\d/.test(t.serverVersion || ''), JSON.stringify(t));
  console.log(`    serverVersion=${t.serverVersion}`);

  console.log('[5] plan.explain（FORMAT=JSON，JOIN + ORDER BY 触发 filesort）…');
  const e1 = await api('plan.explain', {
    connId: save.id,
    sql: 'SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.amount > 50 ORDER BY o.created_at DESC LIMIT 20',
  });
  check('explain 成功', e1.ok === true, e1.error);
  if (e1.ok) {
    check('引擎=mysql', e1.plan.engine === 'mysql');
    check('含全表扫描节点（orders 无可用索引）', JSON.stringify(e1.plan).includes('全表扫描'));
    check('发现非空', e1.findings.length > 0, JSON.stringify(e1.findings.map((f) => f.title)));
    check('总成本来自 query_cost', e1.plan.totalCost !== null);
    console.log(`    根=${e1.plan.root.nodeType} 发现=${e1.findings.map((f) => f.title.slice(0, 28)).join(' / ')}`);
  }

  console.log('[6] ANALYZE 请求在 MySQL 上给出明确说明（估算计划兜底）…');
  const e2 = await api('plan.explain', { connId: save.id, sql: 'SELECT count(*) FROM orders', analyze: true });
  check('成功返回估算计划', e2.ok === true, e2.error);
  check('note 说明不支持 ANALYZE', e2.ok && /ANALYZE/.test(e2.meta.note || ''), e2.meta && e2.meta.note);
  check('analyzeUsed=false', e2.ok && e2.meta.analyzeUsed === false);

  console.log('[7] 护栏：写语句拒绝且库未被动…');
  const g1 = await api('plan.explain', { connId: save.id, sql: "UPDATE orders SET amount = 0 WHERE id = 1" });
  check('UPDATE 拒绝', g1.ok === false, g1.error);
  const g2 = await api('plan.explain', { connId: save.id, sql: 'SELECT REPLACE(note, "a", "b") FROM orders LIMIT 1' });
  check('REPLACE() 函数放行（真库可跑）', g2.ok === true, g2.error);
  const boot2 = await mysql2.createConnection({ host: '127.0.0.1', user: db.username, port: db.port, database: db.dbName, password: '' });
  const [rows] = await boot2.query('SELECT COUNT(*) AS n FROM orders');
  check('库中数据未被动过（5000 行）', rows[0].n === 5000, String(rows[0].n));
  await boot2.end();

  console.log('[8] 历史留痕…');
  const h = await api('history.list', {});
  check('历史 >= 2 条', h.ok && h.items.length >= 2, String(h.items?.length));
} finally {
  if (svc) svc.kill();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  try { if (db) await db.stop(); } catch (_) { /* 已停 */ }
}

if (failed) {
  console.error(`\n冒烟失败 ${failed} 项`);
  process.exit(1);
}
console.log('\n真实 MySQL 冒烟全部通过 ✔');
process.exit(0);
