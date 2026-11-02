// 离线纯逻辑单测：node --test test/run-tests.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../service/core.js');

// ── 只读护栏 ───────────────────────────────────────────────────────────────

test('guard: 正常只读语句通过（含 ORDER BY DESC / 函数 / 常见列名 / FETCH FIRST）', () => {
  for (const sql of [
    'SELECT * FROM users WHERE age > 21 ORDER BY created_at DESC LIMIT 10',
    'select 品类, sum(x) from t group by 1',
    'WITH a AS (SELECT 1) SELECT * FROM a',
    'SELECT REPLACE(name, \'a\', \'b\') FROM users',
    'SELECT comment FROM posts',
    'SELECT * FROM t ORDER BY id DESC, name ASC',
    'SELECT * FROM orders FETCH FIRST 10 ROWS ONLY',
    'TABLE users',
    'VALUES (1), (2)',
    'SELECT COUNT(*) FROM t WHERE note = \'please delete me\'',
    '(SELECT 1) UNION (SELECT 2)',
  ]) {
    const r = core.assertReadOnlySelect(sql);
    assert.equal(r.ok, true, `应放行: ${sql} (${r.reason})`);
  }
});

test('guard: 写/DDL/管理语句拒绝', () => {
  for (const sql of [
    'INSERT INTO t VALUES (1)',
    'DELETE FROM t',
    'UPDATE t SET x=1',
    'UPDATE users SET name=\'x\' WHERE id=1',
    'DROP TABLE t',
    'TRUNCATE t',
    'CREATE TABLE t AS SELECT 1',
    'ALTER TABLE t ADD COLUMN c int',
    'GRANT ALL ON db.* TO u',
    'REPLACE INTO t VALUES (1)',
    'COPY t TO \'C:/x.csv\'',
    'CALL proc(1)',
    'SET @x = 1',
    'VACUUM t',
    'LOCK TABLES t WRITE',
    'KILL 123',
    'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE',
  ]) {
    const r = core.assertReadOnlySelect(sql);
    assert.equal(r.ok, false, `应拒绝: ${sql}`);
  }
});

test('guard: 多语句拒绝（含注释里藏分号/字符串里藏分号）', () => {
  assert.equal(core.assertReadOnlySelect('SELECT 1; DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1;DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1 -- 注释\n; DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1 /* x */ ; DROP TABLE t').ok, false);
  assert.equal(core.assertReadOnlySelect('SELECT 1;\nDELETE FROM t').ok, false);
});

test('guard: 字符串字面量里的关键词不误杀、borrowing 不成立', () => {
  assert.equal(core.assertReadOnlySelect("SELECT 'DROP TABLE t' AS x").ok, true);
  assert.equal(core.assertReadOnlySelect("SELECT * FROM t WHERE note = 'delete from x now'").ok, true);
  assert.equal(core.assertReadOnlySelect('SELECT * FROM t WHERE name = \'it\'\'s\'').ok, true);
});

test('guard: 用户自带 EXPLAIN 前缀 / 未闭合字符串 / 空输入拒绝', () => {
  assert.match(core.assertReadOnlySelect('EXPLAIN SELECT 1').reason, /EXPLAIN/);
  assert.match(core.assertReadOnlySelect("SELECT 'abc").reason, /未闭合/);
  assert.match(core.assertReadOnlySelect('/* 只有注释 */').reason, /空/);
  assert.equal(core.assertReadOnlySelect('   ').ok, false);
});

// ── PG FORMAT=JSON 解析 ────────────────────────────────────────────────────

const PG_JSON_FIXTURE = [
  {
    'Query Plan': {
      Plan: {
        'Node Type': 'Limit', 'Parallel Aware': false,
        'Startup Cost': 35.51, 'Total Cost': 35.52, 'Plan Rows': 1, 'Plan Width': 8,
        'Actual Startup Time': 0.051, 'Actual Total Time': 0.052, 'Actual Rows': 1, 'Actual Loops': 1,
        Plans: [
          {
            'Node Type': 'Sort', 'Parallel Aware': false,
            'Startup Cost': 35.5, 'Total Cost': 35.51, 'Plan Rows': 2, 'Plan Width': 8,
            'Actual Startup Time': 0.049, 'Actual Total Time': 0.05, 'Actual Rows': 2000, 'Actual Loops': 1,
            'Sort Key': ['users.created_at DESC'],
            'Sort Method': 'quicksort', 'Sort Space Used': 25, 'Sort Space Type': 'Memory',
            Plans: [
              {
                'Node Type': 'Seq Scan', 'Parent Relationship': 'Outer',
                'Relation Name': 'users', 'Alias': 'u', 'Schema': 'public',
                'Startup Cost': 0.0, 'Total Cost': 35.5, 'Plan Rows': 2, 'Plan Width': 8,
                'Actual Startup Time': 0.03, 'Actual Total Time': 0.04, 'Actual Rows': 2000, 'Actual Loops': 1,
                Filter: '(u.age > 21)', 'Rows Removed by Filter': 48000,
              },
            ],
          },
        ],
      },
      'Planning Time': 0.123,
      'Execution Time': 0.089,
      Settings: { work_mem: '4MB' },
    },
  },
];

test('pg json: 解析树形与自耗时', () => {
  const r = core.parsePgExplainJson(PG_JSON_FIXTURE);
  assert.equal(r.ok, true, r.error);
  const p = r.plan;
  assert.equal(p.engine, 'pg');
  assert.equal(p.executionMs, 0.089);
  assert.equal(p.planningMs, 0.123);
  assert.equal(p.totalCost, 35.52);
  assert.equal(p.nodeCount, 3);
  const limit = p.root;
  assert.equal(limit.nodeType, 'Limit');
  assert.equal(limit.children[0].nodeType, 'Sort');
  const seq = limit.children[0].children[0];
  assert.equal(seq.nodeType, 'Seq Scan');
  assert.equal(seq.relation, 'users');
  assert.equal(seq.actRowsTotal, 2000);
  assert.equal(seq.removedByFilter, 48000);
  assert.equal(seq.selfMs !== null && seq.selfMs >= 0, true);
  // Limit 自耗时 = 0.052 − 0.050 = 0.002
  assert.ok(Math.abs(limit.selfMs - 0.002) < 1e-9);
});

test('pg json: 诊断发现（全表扫/误估/过滤丢弃/热点）', () => {
  const r = core.parsePgExplainJson(PG_JSON_FIXTURE);
  const findings = core.analyzePlan(r.plan);
  const titles = findings.map((f) => f.title);
  assert.ok(titles.some((t) => t.includes('全表扫描')), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes('估算偏差')), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes('条件过滤丢弃')), JSON.stringify(titles));
  // 微型计划（总耗时 <20ms）不报热点节点——本身就是快查询，热点提示是噪音
  assert.ok(!titles.some((t) => t.includes('热点节点')), JSON.stringify(titles));
  assert.equal(findings[0].severity, 'warn'); // 本 fixture 无 critical，warn 排最前
});

test('pg json: 慢计划报热点节点', () => {
  const slow = {
    engine: 'pg', statement: null, totalCost: 5000, actualMs: 800, planningMs: 0.5, executionMs: 800,
    settings: null, triggers: 0, nodeCount: 2,
    root: {
      id: '1', engine: 'pg', nodeType: 'Nested Loop', relation: null, alias: null, indexName: null,
      estRows: 100, estCost: 5000, actRows: 10, actRowsTotal: 10, loops: 1,
      actualMs: 800, selfMs: 30, startupMs: 0, removedByFilter: null, neverExecuted: false,
      flags: [], detail: {}, children: [],
    },
  };
  const inner = {
    id: '1.1', engine: 'pg', nodeType: 'Seq Scan', relation: 'big', alias: null, indexName: null,
    estRows: 100, estCost: 4000, actRows: 500000, actRowsTotal: 500000, loops: 1,
    actualMs: 770, selfMs: 770, startupMs: 0, removedByFilter: 4000000, neverExecuted: false,
    flags: [], detail: {}, children: [],
  };
  slow.root.children.push(inner);
  const findings = core.analyzePlan(slow);
  const hot = findings.find((f) => f.title.includes('热点节点'));
  assert.ok(hot, JSON.stringify(findings.map((f) => f.title)));
  assert.ok(hot.title.includes('Seq Scan'));
});

test('pg json: 外排磁盘 → critical', () => {
  const plan = {
    engine: 'pg', statement: null, totalCost: 1000, actualMs: 500, planningMs: null, executionMs: 500,
    settings: null, triggers: 0, nodeCount: 1,
    root: {
      id: '1', engine: 'pg', nodeType: 'Sort', relation: null, alias: null, indexName: null,
      estRows: 100000, estCost: 1000, actRows: 100000, actRowsTotal: 100000, loops: 1,
      actualMs: 500, selfMs: 500, startupMs: 10, removedByFilter: null, neverExecuted: false,
      flags: ['排序外排磁盘'], detail: { 'Sort Space Used': '4096kB' }, children: [],
    },
  };
  const findings = core.analyzePlan(plan);
  const spill = findings.find((f) => f.title.includes('外排磁盘'));
  assert.ok(spill, JSON.stringify(findings));
  assert.equal(spill.severity, 'critical');
});

test('pg json: 容忍裸计划节点与 {Plan} 包装', () => {
  const bare = PG_JSON_FIXTURE[0]['Query Plan'].Plan;
  assert.equal(core.parsePgExplainJson(bare).ok, true);
  assert.equal(core.parsePgExplainJson(PG_JSON_FIXTURE[0]['Query Plan']).ok, true);
  assert.equal(core.parsePgExplainJson({ foo: 1 }).ok, false);
  assert.equal(core.parsePgExplainJson(null).ok, false);
});

// ── MySQL FORMAT=JSON 解析 ─────────────────────────────────────────────────

const MYSQL_JSON_FIXTURE = {
  query_block: {
    select_id: 1,
    cost_info: { query_cost: '12345.67' },
    ordering_operation: {
      using_filesort: true,
      nested_loop: [
        {
          table: {
            table_name: 'orders', access_type: 'ALL',
            possible_keys: ['idx_customer'],
            rows_examined_per_scan: 100000, rows_produced_per_join: 10000, filtered: '10.00',
            cost_info: { read_cost: '8000.00', eval_cost: '2000.00', prefix_cost: '10000.00', data_read_per_join: '15M' },
            used_columns: ['id', 'customer_id', 'amount'],
            attached_condition: '(`shop`.`orders`.`amount` > 100)',
          },
        },
        {
          table: {
            table_name: 'customers', access_type: 'eq_ref',
            possible_keys: ['PRIMARY'], key: 'PRIMARY', used_key_parts: ['id'], key_length: '8',
            ref: ['shop.orders.customer_id'],
            rows_examined_per_scan: 1, rows_produced_per_join: 1, filtered: '100.00',
            cost_info: { read_cost: '0.25', eval_cost: '0.10', prefix_cost: '10000.35', data_read_per_join: '1K' },
          },
        },
      ],
    },
  },
};

test('mysql json: JOIN 链 + Sort 虚拟节点 + filesort 标记', () => {
  const r = core.parseMysqlExplainJson(MYSQL_JSON_FIXTURE);
  assert.equal(r.ok, true, r.error);
  const p = r.plan;
  assert.equal(p.engine, 'mysql');
  assert.equal(p.totalCost, 12345.67);
  const sort = p.root;
  assert.equal(sort.nodeType, 'Sort (ORDER BY)');
  assert.ok(sort.flags.includes('Using filesort（排序未走索引）'));
  assert.equal(sort.children.length, 1);
  const orders = sort.children[0];
  assert.equal(orders.nodeType, '全表扫描 (ALL)');
  assert.equal(orders.relation, 'orders');
  assert.equal(orders.children.length, 1);
  const customers = orders.children[0];
  assert.equal(customers.nodeType, '唯一索引等值 (eq_ref)');
  assert.equal(customers.indexName, 'PRIMARY');
});

test('mysql json: 诊断发现（全表扫/filesort/候选索引未用）', () => {
  const r = core.parseMysqlExplainJson(MYSQL_JSON_FIXTURE);
  const findings = core.analyzePlan(r.plan);
  const titles = findings.map((f) => f.title);
  assert.ok(titles.some((t) => t.includes('全表扫描') && t.includes('orders')), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes('filesort')), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes('候选索引未使用')), JSON.stringify(titles));
});

test('mysql json: JSON 字符串输入与坏输入', () => {
  assert.equal(core.parseMysqlExplainJson(JSON.stringify(MYSQL_JSON_FIXTURE)).ok, true);
  assert.equal(core.parseMysqlExplainJson('{bad json').ok, false);
  assert.equal(core.parseMysqlExplainJson({ foo: 1 }).ok, false);
});

test('mysql json: UNION 多成员挂虚拟根', () => {
  const union = {
    query_block: {
      select_id: 1,
      union_result: {
        table: { table_name: '<union1,2>', access_type: 'ALL', rows_examined_per_scan: 4, rows_produced_per_join: 4, filtered: '100.00' },
        query_specifications: [
          { query_block: { select_id: 1, table: { table_name: 'a', access_type: 'ALL', rows_examined_per_scan: 2, rows_produced_per_join: 2, filtered: '100.00' } } },
          { query_block: { select_id: 2, table: { table_name: 'b', access_type: 'ALL', rows_examined_per_scan: 2, rows_produced_per_join: 2, filtered: '100.00' } } },
        ],
      },
    },
  };
  const r = core.parseMysqlExplainJson(union);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.plan.root.nodeType, 'UNION 结果');
  // union_result.table 的子树成员应有 2 个查询块链
  assert.equal(r.plan.root.children.length, 3);
});

// ── PG 经典文本解析 ────────────────────────────────────────────────────────

const PG_TEXT_FIXTURE = `Sort  (cost=135.62..135.87 rows=100 width=8) (actual time=42.1..42.3 rows=2000 loops=1)
  Sort Key: u.created_at DESC
  Sort Method: external merge  Disk: 4096kB
  ->  Seq Scan on users u  (cost=0.00..120.00 rows=100 width=8) (actual time=0.03..30.0 rows=2000 loops=1)
        Filter: (u.age > 21)
        Rows Removed by Filter: 48000
Planning Time: 0.25 ms
Execution Time: 45.00 ms`;

test('pg text: 列定位建树 + 注解 + 元信息', () => {
  const r = core.parsePgExplainText(PG_TEXT_FIXTURE);
  assert.equal(r.ok, true, r.error);
  const p = r.plan;
  assert.equal(p.executionMs, 45.0);
  assert.equal(p.planningMs, 0.25);
  assert.equal(p.root.nodeType, 'Sort');
  assert.equal(p.root.estRows, 100);
  assert.equal(p.root.actualMs, 42.3);
  assert.equal(p.root.detail['Sort Key'], 'u.created_at DESC');
  assert.equal(p.root.flags.includes('排序外排磁盘'), true);
  const seq = p.root.children[0];
  assert.equal(seq.nodeType, 'Seq Scan');
  assert.equal(seq.relation, 'users');
  assert.equal(seq.alias, 'u');
  assert.equal(seq.actRowsTotal, 2000);
  assert.equal(seq.removedByFilter, 48000);
  const findings = core.analyzePlan(p);
  const titles = findings.map((f) => f.title);
  assert.ok(titles.some((t) => t.includes('外排磁盘')), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.includes('全表扫描')), JSON.stringify(titles));
});

const PG_TEXT_DEEP = `Nested Loop Left Join  (cost=10.00..500.00 rows=50 width=16) (actual time=1.0..10.0 rows=50 loops=1)
  Join Filter: (a.id = b.aid)
  Rows Removed by Join Filter: 4900
  ->  Seq Scan on a  (cost=0.00..10.00 rows=50 width=8) (actual time=0.01..0.50 rows=50 loops=1)
  ->  Index Scan using b_aid_idx on b  (cost=0.29..9.00 rows=2 width=8) (actual time=0.01..0.15 rows=99 loops=50)
        Index Cond: (b.aid = a.id)
        Buffers: shared hit=500
  ->  Materialize  (cost=0.00..20.00 rows=100 width=8) (never executed)
        ->  Seq Scan on c  (cost=0.00..15.00 rows=100 width=8) (never executed)
Planning Time: 0.10 ms`;

test('pg text: 三层嵌套 / never executed / 索引扫描 using / loops', () => {
  const r = core.parsePgExplainText(PG_TEXT_DEEP);
  assert.equal(r.ok, true, r.error);
  const p = r.plan;
  assert.equal(p.root.nodeType, 'Nested Loop Left Join');
  assert.equal(p.root.children.length, 3);
  const idx = p.root.children[1];
  assert.equal(idx.nodeType, 'Index Scan');
  assert.equal(idx.indexName, 'b_aid_idx');
  assert.equal(idx.relation, 'b');
  assert.equal(idx.loops, 50);
  assert.equal(idx.actRowsTotal, 99 * 50);
  const mat = p.root.children[2];
  assert.equal(mat.nodeType, 'Materialize');
  assert.equal(mat.neverExecuted, true);
  assert.equal(mat.children[0].nodeType, 'Seq Scan');
  // Join Filter 丢弃 → 连接条件丢弃发现（4900/(50+4900)>0.9）
  const findings = core.analyzePlan(p);
  assert.ok(findings.some((f) => f.title.includes('丢弃') && f.title.includes('Nested Loop')), JSON.stringify(findings.map((f) => f.title)));
});

test('pg text: 坏输入拒绝', () => {
  assert.equal(core.parsePgExplainText('').ok, false);
  assert.equal(core.parsePgExplainText('hello world nothing here').ok, false);
});

// ── AI 摘要与工具函数 ──────────────────────────────────────────────────────

test('summarizeForAi: 有界、含树与发现', () => {
  const r = core.parsePgExplainJson(PG_JSON_FIXTURE);
  const findings = core.analyzePlan(r.plan);
  const s = core.summarizeForAi(r.plan, findings);
  assert.ok(s.includes('PostgreSQL'));
  assert.ok(s.includes('计划树'));
  assert.ok(s.includes('诊断发现'));
  assert.ok(s.length <= 6100);
  const long = { ...r.plan, root: deepTree(1) };
  const s2 = core.summarizeForAi(long, []);
  assert.ok(s2.length <= 6100);
});

function deepTree(depth) {
  const node = {
    id: String(depth), engine: 'pg', nodeType: 'Seq Scan', relation: `t${depth}`, alias: null, indexName: null,
    estRows: 100, estCost: 10, actRows: 10, actRowsTotal: 10, loops: 1,
    actualMs: 1, selfMs: 1, startupMs: 0, removedByFilter: null, neverExecuted: false,
    flags: [], detail: {}, children: [],
  };
  if (depth < 40) node.children.push(deepTree(depth + 1));
  return node;
}

test('sqlSnippet / rowsFmt', () => {
  assert.equal(core.rowsFmt(1500), '1500');
  assert.equal(core.rowsFmt(48000), '48.0k');
  assert.equal(core.rowsFmt(2000000), '2.0M');
  assert.equal(core.rowsFmt(42), '42');
  assert.equal(core.rowsFmt(null), '—');
  assert.equal(core.sqlSnippet('SELECT\n  a\nFROM b').startsWith('SELECT a FROM b'), true);
  assert.ok(core.sqlSnippet('x'.repeat(400)).length <= 301);
});
