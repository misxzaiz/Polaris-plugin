// 服务端点冒烟（hermetic：QPL_NO_KV 不碰真实宿主 kv；node --test test/service-smoke.mjs）
// 需要 vendor.cjs 已构建（service 依赖驱动打包产物）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFreePort } from './helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
let PORT = 9867;
let BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'smoke-token-0123456789abcdef';
const AUTH = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

let child = null;
let tmp = null;

async function api(path, body, headers) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: headers || AUTH,
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

before(async () => {
  PORT = await getFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
  tmp = mkdtempSync(join(tmpdir(), 'qpl-smoke-'));
  child = spawn(process.execPath, [join(ROOT, 'service', 'main.js'), String(PORT), tmp], {
    env: { ...process.env, QPL_NO_KV: '1', QPL_TOKEN: TOKEN },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', () => { /* 冒烟期日志静默 */ });
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${BASE}/__health`);
      if (r.ok) break;
    } catch (_) { /* not yet */ }
    if (Date.now() - t0 > 10000) throw new Error('服务 10s 未就绪');
    await new Promise((r) => setTimeout(r, 150));
  }
});

after(() => {
  if (child) child.kill();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('health 与 meta', async () => {
  const health = await (await fetch(`${BASE}/__health`)).json();
  assert.equal(health.status, 'ok');
  const meta = await api('meta');
  assert.equal(meta.ok, true);
  assert.equal(meta.version, '0.1.0');
});

test('鉴权：无 token 401 / 错 token 401', async () => {
  const noAuth = await api('conns.list', {}, { 'Content-Type': 'application/json' });
  assert.ok(noAuth.error && noAuth.error.includes('鉴权'), JSON.stringify(noAuth));
  const badAuth = await api('conns.list', {}, { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' });
  assert.ok(badAuth.error.includes('鉴权'));
});

test('连接增删查：UTF-8 中文名不损坏、密码不出现', async () => {
  const save = await api('conns.save', {
    name: '商城主库-测试', engine: 'mysql', host: '127.0.0.1', port: 3306,
    database: 'shop', user: 'root', password: 'super-secret-123',
  });
  assert.equal(save.ok, true);
  const id = save.id;
  const list = await api('conns.list');
  const conn = list.connections.find((c) => c.id === id);
  assert.ok(conn, '列表应含新连接');
  assert.equal(conn.name, '商城主库-测试');
  assert.equal(conn.hasPassword, true);
  assert.equal('password' in conn, false);
  assert.equal(JSON.stringify(list).includes('super-secret'), false, '任何接口响应不得出现明文密码');
  const del = await api('conns.delete', { id });
  assert.equal(del.ok, true);
  const list2 = await api('conns.list');
  assert.equal(list2.connections.find((c) => c.id === id), undefined);
});

test('连接测试：连不上的库给友好中文错误', async () => {
  const save = await api('conns.save', {
    name: '不通', engine: 'pg', host: '127.0.0.1', port: 54320, database: 'x', user: 'u', password: 'p',
  });
  const r = await api('conns.test', { id: save.id });
  assert.equal(r.ok, false);
  assert.match(r.error, /连不上|超时/);
});

test('plan.explain：写语句拒绝、EXPLAIN 前缀拒绝、坏连接报错', async () => {
  const save = await api('conns.save', {
    name: 'x', engine: 'pg', host: '127.0.0.1', port: 54320, database: 'x', user: 'u', password: 'p',
  });
  const w = await api('plan.explain', { connId: save.id, sql: 'DELETE FROM users' });
  assert.equal(w.ok, false);
  assert.match(w.error, /只读|只接受/);
  const e = await api('plan.explain', { connId: save.id, sql: 'EXPLAIN SELECT 1' });
  assert.equal(e.ok, false);
  assert.match(e.error, /EXPLAIN/);
  const c = await api('plan.explain', { connId: 'nope', sql: 'SELECT 1' });
  assert.equal(c.ok, false);
  assert.match(c.error, /连接不存在/);
});

test('plan.parse：PG 文本 / MySQL JSON / auto 识别 / 坏输入', async () => {
  const pgText = await api('plan.parse', {
    text: 'Seq Scan on users  (cost=0.00..35.50 rows=2 width=8) (actual time=0.03..30.0 rows=2000 loops=1)\n  Filter: (u.age > 21)\n  Rows Removed by Filter: 48000\nPlanning Time: 0.25 ms\nExecution Time: 45.00 ms',
  });
  assert.equal(pgText.ok, true);
  assert.equal(pgText.plan.engine, 'pg');
  assert.ok(pgText.findings.some((f) => f.title.includes('全表扫描')));

  const mysqlJson = {
    query_block: {
      select_id: 1,
      cost_info: { query_cost: '12345.67' },
      nested_loop: [
        { table: { table_name: 'orders', access_type: 'ALL', rows_examined_per_scan: 100000, rows_produced_per_join: 10000, filtered: '10.00' } },
        { table: { table_name: 'customers', access_type: 'eq_ref', key: 'PRIMARY', rows_examined_per_scan: 1, rows_produced_per_join: 1, filtered: '100.00' } },
      ],
    },
  };
  const my = await api('plan.parse', { text: JSON.stringify(mysqlJson), engine: 'mysql' });
  assert.equal(my.ok, true);
  assert.equal(my.plan.engine, 'mysql');
  // JOIN 链：第一个表（orders，全表扫）为根，customers 为其子节点
  assert.equal(my.plan.root.nodeType, '全表扫描 (ALL)');
  assert.equal(my.plan.root.children[0].nodeType, '唯一索引等值 (eq_ref)');

  const auto = await api('plan.parse', { text: JSON.stringify(mysqlJson) });
  assert.equal(auto.ok, true);
  assert.equal(auto.plan.engine, 'mysql');

  const bad = await api('plan.parse', { text: '随便一段话' });
  assert.equal(bad.ok, false);
  const empty = await api('plan.parse', { text: '' });
  assert.equal(empty.ok, false);
});

test('history：explain 失败不入历史；parse 不入历史', async () => {
  const r = await api('history.list');
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 0);
});

test('未知端点 404 / 非 POST 405', async () => {
  const nf = await api('no.such.route');
  assert.ok(nf.error.includes('未知端点'));
  const res = await fetch(`${BASE}/__health`, { method: 'DELETE' });
  assert.equal(res.status, 405);
});
