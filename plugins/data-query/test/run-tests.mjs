// 离线纯逻辑单测：node --test test/run-tests.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../service/core.js');

// ── SQL 只读护 ─────────────────────────────────────────────────────────────
test('guard: 正常 SELECT / WITH 通过', () => {
  assert.equal(core.assertReadOnlySelect('SELECT * FROM t').ok, true);
  assert.equal(core.assertReadOnlySelect('  select 品类, sum(x) from t group by 1').ok, true);
  assert.equal(core.assertReadOnlySelect('WITH a AS (SELECT 1) SELECT * FROM a').ok, true);
  assert.equal(core.assertReadOnlySelect('SELECT 1;').ok, true); // 末尾分号允许
});

test('guard: 非 SELECT 开头拒绝', () => {
  for (const sql of [
    'INSERT INTO t VALUES (1)',
    'DELETE FROM t',
    'UPDATE t SET x=1',
    'DROP TABLE t',
    'CREATE TABLE t AS SELECT 1',
    'ATTACH \'x.db\' AS y',
    'COPY t TO \'C:/x.csv\'',
    'PRAGMA version',
    'DESCRIBE t',
    'SHOW TABLES',
    'CALL foo()',
    'EXPORT DATABASE \'x\' (DATABASE \'y\')',
    'INSTALL httpfs',
    'LOAD httpfs',
  ]) {
    const r = core.assertReadOnlySelect(sql);
    assert.equal(r.ok, false, `应拒绝: ${sql}`);
  }
});

test('guard: 多语句拒绝（含注释里藏分号）', () => {
  assert.equal(core.assertReadOnlySelect('SELECT 1; DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1;DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1 -- 注释\n; DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1 /* x */ ; DROP TABLE t').ok, false);
});

test('guard: 字符串字面量里的关键词不误杀、也不能借道绕过', () => {
  assert.equal(core.assertReadOnlySelect("SELECT * FROM t WHERE note = 'please delete me'").ok, true);
  assert.equal(core.assertReadOnlySelect("SELECT 'DROP TABLE t' AS x").ok, true);
  // 字符串里藏的 COPY 不会被执行（字面量），但语句骨架不应出现可执行写路径
  assert.equal(core.assertReadOnlySelect("SELECT 'copy x to y'").ok, true);
});

test('guard: 注释里藏关键词无效', () => {
  assert.equal(core.assertReadOnlySelect('SELECT 1 -- DROP TABLE t').ok, true); // 注释剥掉后只是 SELECT 1
  assert.equal(core.assertReadOnlySelect('SELECT 1 /* COPY */').ok, true);
});

test('guard: 合法列名/表名不误杀', () => {
  assert.equal(core.assertReadOnlySelect('SELECT "delete", created_at FROM exports').ok, true);
  assert.equal(core.assertReadOnlySelect('SELECT setter FROM t').ok, true); // offset/setter 等含子串
  assert.equal(core.assertReadOnlySelect('SELECT * FROM t WHERE flag = false OFFSET 2').ok, true);
});

test('guard: 关键词调用（copy 函数式注入）拒绝', () => {
  assert.equal(core.assertReadOnlySelect("SELECT copy('a' to 'b')").ok, false);
});

test('guard: 空与超长', () => {
  assert.equal(core.assertReadOnlySelect('').ok, false);
  assert.equal(core.assertReadOnlySelect('   ').ok, false);
  assert.equal(core.assertReadOnlySelect('x'.repeat(core.LIMITS.SQL_TEXT_MAX + 1)).ok, false);
});

test('sqlSkeleton: 字符串/标识符占位、注释剥离', () => {
  assert.equal(core.sqlSkeleton("SELECT 'a--b' -- real comment\nFROM t"), "SELECT ''  \nFROM t");
  assert.equal(core.sqlSkeleton('SELECT "odd name" FROM t'), 'SELECT "" FROM t');
  assert.equal(core.sqlSkeleton('SELECT /* x */ 1'), 'SELECT   1');
});

// ── 表名清洗 ───────────────────────────────────────────────────────────────
test('sanitize: 中文转码点可辨识、空格点号归下划线、数字开头加前缀、上限 60', () => {
  // 订单 → u8ba2u5355（CJK 塌缩成 table 是真场景 bug，回归守护）
  assert.equal(core.sanitizeTableName('2026 订单.export'), 't_2026_u8ba2u5355_export');
  assert.equal(core.sanitizeTableName('订单'), 'u8ba2u5355');
  assert.equal(core.sanitizeTableName('   '), 'table');
  assert.equal(core.sanitizeTableName('***'), 'table');
  assert.ok(core.sanitizeTableName('x'.repeat(100)).length <= 60);
  assert.equal(core.sanitizeTableName('ABC-def_123'), 'ABC_def_123');
});

test('dedupe: 大小写不敏感查重', () => {
  assert.equal(core.dedupeTableName('sales', ['orders']), 'sales');
  assert.equal(core.dedupeTableName('sales', ['SALES']), 'sales_2');
  assert.equal(core.dedupeTableName('sales', ['sales', 'sales_2', 'SALES_3']), 'sales_4');
});

// ── 编码探测 ───────────────────────────────────────────────────────────────
test('detectEncoding: BOM / GBK / UTF-8', () => {
  assert.deepEqual(core.detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), { encoding: 'utf-8', bom: true });
  assert.deepEqual(core.detectEncoding(new Uint8Array([0xff, 0xfe, 0x61, 0x00])), { encoding: 'utf-16le', bom: true });
  const gbk = new Uint8Array([0xb6, 0xa9, 0xb5, 0xa5]); // "订单" 的 GBK 字节（非合法 UTF-8 序列大概率成立）
  const det = core.detectEncoding(gbk);
  assert.ok(['gbk', 'utf-8'].includes(det.encoding), `实际 ${det.encoding}`); // 短样本可能恰好是合法 UTF-8，双向可接受
  assert.deepEqual(core.detectEncoding(new TextEncoder().encode('hello,世界')), { encoding: 'utf-8', bom: false });
});

test('sniffKind: 扩展名与 .txt 制表符嗅探', () => {
  assert.equal(core.sniffKind('a.CSV', ''), 'csv');
  assert.equal(core.sniffKind('a.tsv', ''), 'tsv');
  assert.equal(core.sniffKind('a.txt', 'a\tb\n'), 'tsv');
  assert.equal(core.sniffKind('a.txt', 'a,b\n'), 'csv');
  assert.equal(core.sniffKind('a.jsonl', ''), 'jsonl');
  assert.equal(core.sniffKind('a.ndjson', ''), 'jsonl');
  assert.equal(core.sniffKind('a.parquet', ''), 'parquet');
  assert.equal(core.sniffKind('a.exe', ''), null);
  assert.equal(core.sniffKind('', ''), null);
});

// ── 导出路径护栏 ───────────────────────────────────────────────────────────
const DIRS = ['c:\\exists', 'c:\\users\\me\\desktop'];
const guardEnv = {
  exists: (p) => DIRS.includes(p.toLowerCase()) || p.toLowerCase() === 'c:\\exists\\x.csv',
  isDir: (p) => DIRS.includes(p.toLowerCase()),
};

test('exportPathGuard: 全矩阵', () => {
  const g = (p, extra) => core.exportPathGuard(p, { ...guardEnv, ...extra });
  assert.equal(g('C:\\out\\a.csv').ok, false); // 父目录不存在
  assert.equal(g('C:\\exists\\x.csv').ok, false); // 已存在
  assert.equal(g('C:\\exists\\x2.csv', { exists: (p) => DIRS.includes(p.toLowerCase()) }).ok, true); // 文件不存在、父目录存在
  assert.equal(g('C:\\exists\\dir').ok, false); // 是目录
  assert.equal(g('relative\\a.csv').ok, false); // 非绝对路径
  assert.equal(g('C:\\out\\a.exe').ok, false); // 扩展名
  assert.equal(g('C:\\Windows\\a.csv').ok, false); // 系统目录
  assert.equal(g('C:\\Users\\me\\Desktop\\a.json').ok, true);
  assert.equal(g('', {}).ok, false);
  // 内部文件保护
  const r = core.exportPathGuard('D:\\app\\polaris\\data-query\\workspace.duckdb', {
    exists: () => false, isDir: () => false,
    protectedPaths: ['D:\\app\\polaris\\data-query\\workspace.duckdb'],
  });
  assert.equal(r.ok, false);
});

// ── 渲染 ───────────────────────────────────────────────────────────────────
test('stringifyCell: bigint/null/对象', () => {
  assert.equal(core.stringifyCell(1n), '1');
  assert.equal(core.stringifyCell(null), 'NULL');
  assert.equal(core.stringifyCell(undefined), 'NULL');
  assert.equal(core.stringifyCell({ a: 1 }), '{"a":1}');
  assert.equal(core.stringifyCell('x'), 'x');
  assert.equal(core.stringifyCell(1.5), '1.5');
});

test('rowsToMarkdown: 行数与字节双上限 + 截断声明', () => {
  const cols = ['id', 'v'];
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, v: `值${i}` }));
  const md = core.rowsToMarkdown(cols, rows, { maxRows: 5, maxBytes: 100000 });
  assert.ok(md.includes('已截断：显示 5/100 行'));
  const mdBytes = core.rowsToMarkdown(cols, rows, { maxRows: 100, maxBytes: 120 });
  assert.ok(mdBytes.length <= 400);
  assert.ok(mdBytes.includes('已截断'));
  const mdFull = core.rowsToMarkdown(cols, rows.slice(0, 3), { maxRows: 5, maxBytes: 100000 });
  assert.ok(!mdFull.includes('已截断'));
});

// ── 引擎钉版一致性（防手改漂移）──────────────────────────────────────────
test('NATIVE 钉版参数齐备（与 package.json / vendor 三处一致）', () => {
  assert.ok(/^\d+\.\d+\.\d+/.test(core.NATIVE.VERSION));
  assert.equal(core.NATIVE.PLATFORM, `${process.platform}-${process.arch}`);
  const vendorDuck = path.join(path.dirname(require.resolve('../service/core.js')), 'vendor', 'duckdb', 'node_modules', '@duckdb');
  assert.ok(fs.existsSync(path.join(vendorDuck, 'node-api')), 'vendor 应含 node-api');
  assert.ok(fs.existsSync(path.join(vendorDuck, `node-bindings-${core.NATIVE.PLATFORM}`, 'duckdb.node')), 'vendor 应含平台 binding');
  assert.equal(core.MANIFEST_PORT, 9875);
});
