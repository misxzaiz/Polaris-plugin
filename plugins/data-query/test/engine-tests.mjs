// 引擎真测：真实 @duckdb/node-api native binding + 真实文件（vendor 随包，无下载）
// 运行：node test/engine-tests.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const core = require('../service/core.js');
const { Engine } = require('../service/engine.js');

// 订单号,品类,金额\r\nB001,办公用品,45.0\r\nB002,交通出行,8.5\r\n 的 GBK 字节（PowerShell 生成）
const GBK_HEX = 'B6A9B5A5BAC52CC6B7C0E02CBDF0B6EE0D0A423030312CB0ECB9ABD3C3C6B72C34352E300D0A423030322CBDBBCDA8B3F6D0D02C382E350D0A';

let engineDir, workspaceDir, engine;
let engineAvailable = false;

before(async () => {
  engineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-engine-'));
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-ws-'));
  engine = new Engine({ engineDir, workspaceDir });
  try {
    await engine.ensure();
    engineAvailable = true;
  } catch (e) {
    console.log(`[engine-tests] 引擎不可用，相关用例跳过：${e.message}`);
  }
});

after(async () => {
  if (engine) await engine.terminate();
  try { fs.rmSync(engineDir, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
  try { fs.rmSync(workspaceDir, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
});

function fixtureDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-fixture-'));
  return d;
}

test('导入 UTF-8 CSV（中文表头 + 引号内逗号）并聚合查询', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const d = fixtureDir();
  const file = path.join(d, 'orders.csv');
  fs.writeFileSync(file, `订单号,品类,金额,日期
A001,奶茶,12.5,2026-01-03
A002,"办公用品, 打印纸",45.0,2026-01-05
A003,奶茶,15.0,2026-02-11
A004,图书,78.9,2026-02-20
A005,奶茶,13.5,2026-03-01
`);
  const r = await engine.importPath(file);
  assert.equal(r.table, 'orders');
  assert.equal(r.rows, 5);

  const q = await engine.query("SELECT 品类, count(*) AS n, sum(金额) AS total FROM orders GROUP BY 1 ORDER BY total DESC", 10);
  assert.equal(q.rowCount, 3);
  assert.deepEqual(q.rows[0], { 品类: '图书', n: 1, total: 78.9 });
  const naicha = q.rows.find((x) => x.品类 === '奶茶');
  assert.equal(naicha.n, 3);
  assert.equal(naicha.total, 41);
  assert.equal(typeof q.rows[0].n, 'number'); // bigint 已出口转 Number
});

test('导入 GBK CSV：编码探测 + 转码 + 数据正确', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const d = fixtureDir();
  const file = path.join(d, 'gbk订单.csv');
  fs.writeFileSync(file, Buffer.from(GBK_HEX, 'hex'));
  const r = await engine.importPath(file);
  assert.ok(r.table.includes('u8ba2u5355'), `表名应含 CJK 转码：${r.table}`);
  const q = await engine.query(`SELECT * FROM ${r.table} ORDER BY 订单号`);
  assert.equal(q.rowCount, 2);
  assert.deepEqual(q.rows[0], { 订单号: 'B001', 品类: '办公用品', 金额: 45 });
  assert.deepEqual(q.rows[1], { 订单号: 'B002', 品类: '交通出行', 金额: 8.5 });
});

test('导入 JSONL + 跨表 JOIN', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const d = fixtureDir();
  const file = path.join(d, 'users.jsonl');
  fs.writeFileSync(file, [
    JSON.stringify({ uid: 'u1', name: '张三', age: 28 }),
    JSON.stringify({ uid: 'u2', name: '李四', age: 35 }),
  ].join('\n'));
  await engine.importPath(file);

  const q = await engine.query(`SELECT u.name, count(*) AS n FROM orders o JOIN users u ON o.订单号 = 'A001' AND u.uid = 'u1' GROUP BY 1`, 10);
  assert.equal(q.rows[0].name, '张三');

  const tables = await engine.tables();
  assert.ok(tables.some((t) => t.table === 'users'));
});

test('同名再导入 = 覆盖刷新（幂等）；异名自动去重', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const d = fixtureDir();
  const file = path.join(d, 'dup.csv');
  fs.writeFileSync(file, 'id,v\n1,a\n');
  const r1 = await engine.importPath(file, 'dupdata');
  assert.equal(r1.table, 'dupdata');
  fs.writeFileSync(file, 'id,v\n1,a\n2,b\n');
  const r2 = await engine.importPath(file, 'dupdata'); // CREATE OR REPLACE
  assert.equal(r2.table, 'dupdata');
  assert.equal(r2.rows, 2);

  const other = path.join(d, 'dup (1).csv');
  fs.writeFileSync(other, 'id,v\n9,z\n');
  const r3 = await engine.importPath(other); // 主干 dup__1_ → 非冲突名
  assert.ok(r3.table.startsWith('dup'), r3.table);
  const tables = await engine.tables();
  assert.equal(tables.filter((t) => t.table === 'dupdata').length, 1);
});

test('query: maxRows 截断语义', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const q = await engine.query('SELECT range AS id FROM range(100)', 10);
  assert.equal(q.rowCount, 100);
  assert.equal(q.rows.length, 10);
  assert.equal(q.truncated, true);
});

test('export: CSV 带 BOM、JSON 可解析；护栏拒绝覆盖与内部文件', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const d = fixtureDir();
  const outCsv = path.join(d, 'result.csv');
  const r = await engine.exportQuery({ sql: 'SELECT * FROM orders WHERE 品类 = \'奶茶\'', outPath: outCsv, format: 'csv' });
  assert.equal(r.rows, 3);
  const head = fs.readFileSync(outCsv).subarray(0, 3);
  assert.deepEqual([...head], [0xef, 0xbb, 0xbf]); // UTF-8 BOM（Excel 直开）
  const text = fs.readFileSync(outCsv, 'utf8');
  assert.ok(text.includes('品类'));
  assert.ok(text.includes('奶茶'));

  const outJson = path.join(d, 'result.json');
  await engine.exportQuery({ sql: 'SELECT count(*) AS c FROM orders', outPath: outJson, format: 'json' });
  const parsed = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  assert.equal(parsed[0].c, 5);

  // 护栏：已存在拒绝覆盖
  await assert.rejects(
    () => engine.exportQuery({ sql: 'SELECT 1', outPath: outCsv, format: 'csv' }),
    /已存在/,
  );
  // 护栏：内部文件
  await assert.rejects(
    () => engine.exportQuery({ sql: 'SELECT 1', outPath: engine.workspaceFile(), format: 'json' }),
    /内部文件/,
  );
  // overwrite:true 放行
  const r2 = await engine.exportQuery({ sql: 'SELECT 1 AS one', outPath: outCsv, format: 'csv', overwrite: true });
  assert.equal(r2.rows, 1);
});

test('importBytes: 内存通道（上传路径）', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const r = await engine.importBytes('upload_demo.csv', Buffer.from('a,b\n1,x\n2,y\n'));
  assert.equal(r.table, 'upload_demo');
  assert.equal(r.rows, 2);
  await assert.rejects(() => engine.importBytes('big.csv', Buffer.alloc(core.LIMITS.UPLOAD_BYTES + 1)), /上限/);
});

test('drop 与 reset（confirm 语义）', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  await assert.rejects(() => engine.reset(false), /confirm/);
  await engine.drop('upload_demo');
  const tables = await engine.tables();
  assert.ok(!tables.some((t) => t.table === 'upload_demo'));
  await engine.reset(true);
  const after = await engine.tables();
  assert.equal(after.length, 0);
  assert.ok(fs.existsSync(engine.workspaceFile())); // 工作区文件重建
});

test('重启恢复：注册表对账（库为准）', async (t) => {
  if (!engineAvailable) { t.skip("引擎不可用"); return; }
  const d = fixtureDir();
  const file = path.join(d, 'persist.csv');
  fs.writeFileSync(file, 'k,v\nhello,1\n');
  await engine.importPath(file, 'persistme');
  await engine.terminate();

  const engine2 = new Engine({ engineDir, workspaceDir });
  try {
    await engine2.ensure();
    const tables = await engine2.tables();
    const t = tables.find((x) => x.table === 'persistme');
    assert.ok(t, '重启后表应恢复');
    assert.equal(t.rows, 1);
    assert.equal(t.source, 'persist.csv'); // 注册表持久化恢复（非"未知来源"）
    assert.equal(t.kind, 'csv');
  } finally {
    await engine2.terminate();
  }
});
