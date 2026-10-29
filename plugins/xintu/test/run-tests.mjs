/**
 * 心图 canvas-core 单测（node --test test/run-tests.mjs）
 * 覆盖：newBoard/sanitizeDoc/applyOps 成功与整批回滚/校验矩阵/级联删边/
 * 容量上限/三布局算法（含环与孤点）/export/snap/bounds/索引。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/canvas-core.js');

const board = () => core.newBoard('测试板', 1700000000000).doc;
const addCard = (doc, id, x, y, extra) =>
  core.applyOps(doc, [{ op: 'add_card', args: { id, x, y, title: `卡${id}`, text: '正文' } }], { now: 1 }).doc;

// ── newBoard / 键空间 ───────────────────────────────────────────────────────

test('newBoard：默认标题、rev=1、空板形状', () => {
  const r = core.newBoard('', 123);
  assert.equal(r.doc.title, '未命名画布');
  assert.equal(r.doc.rev, 1);
  assert.deepEqual(r.doc.nodes, []);
  assert.deepEqual(r.doc.edges, []);
  assert.ok(core.validId(r.id));
});

test('newBoard：标题超长拒绝', () => {
  assert.ok(core.newBoard('长'.repeat(121), 1).error);
  assert.ok(!core.newBoard('长'.repeat(120), 1).error);
});

test('K 键空间前缀 xt.*', () => {
  assert.equal(core.K.board('a1'), 'xt.board.a1');
  assert.equal(core.K.INDEX, 'xt.boards');
  assert.ok(core.K.board('a1').startsWith(core.K.PREFIX));
});

// ── sanitizeDoc ─────────────────────────────────────────────────────────────

test('sanitizeDoc：剔除坏节点坏边、坐标吸附、悬空边丢弃', () => {
  const doc = {
    rev: 'x', title: 42, createdAt: 'a', updatedAt: 'b',
    nodes: [
      { id: 'n1', type: 'card', x: 33, y: 55, w: 9999, h: -5, title: 'ok', text: '', color: '不存在' },
      { id: 'n1', type: 'note', x: 0, y: 0 }, // 重复 id
      { id: 'bad type', type: 'note', x: 0, y: 0 }, // id 非法
      { id: 'n2', type: '形状错', x: 0, y: 0 }, // 类型非法
      { id: 'n3', type: 'note', x: NaN, y: Infinity }, // 坐标非法
      { id: 'g1', type: 'group', x: 0, y: 0, w: 1000, h: 800 },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' }, // n2 已被剔除 → 悬空
      { id: 'e2', from: 'n1', to: 'n1' }, // 自环
      { id: 'e3', from: 'n1', to: 'g1' },
      { id: 'e3', from: 'g1', to: 'n1' }, // 重复 id
      { id: 'e4', from: 'g1', to: 'n1' }, // 重复 pair
    ],
  };
  const d = core.sanitizeDoc(doc);
  assert.equal(d.rev, 0);
  assert.equal(d.title, '未命名画布');
  assert.deepEqual(d.nodes.map((n) => n.id).sort(), ['g1', 'n1']);
  const n1 = d.nodes.find((n) => n.id === 'n1');
  assert.equal(n1.x, 40); // 33 吸附到 40
  assert.equal(n1.color, 'default');
  assert.ok(n1.w <= core.LIMITS.MAX_W && n1.h >= core.LIMITS.MIN_H);
  assert.deepEqual(d.edges.map((e) => e.id).sort(), ['e3', 'e4']); // a→b 与 b→a 是方向不同的两条边，仅去重同向同 pair
  const g1 = d.nodes.find((n) => n.id === 'g1');
  assert.equal(g1.z, -1, 'group 默认 z 靠后');
});

test('sanitizeDoc：非对象返回 null', () => {
  assert.equal(core.sanitizeDoc(null), null);
  assert.equal(core.sanitizeDoc('x'), null);
});

// ── applyOps：成功路径 ──────────────────────────────────────────────────────

test('applyOps：批量增节点连边，同批 add 后即可引用其 id', () => {
  const r = core.applyOps(board(), [
    { op: 'add_card', args: { id: 'a', x: 0, y: 0, title: 'A' } },
    { op: 'add_note', args: { id: 'b', x: 400, y: 0, text: 'B' } },
    { op: 'add_edge', args: { id: 'e1', from: 'a', to: 'b', label: '依赖' } },
  ], { now: 2 });
  assert.equal(r.applied, 3);
  assert.equal(r.doc.rev, 2);
  assert.equal(r.doc.nodes.length, 2);
  assert.equal(r.doc.edges[0].label, '依赖');
  assert.equal(r.doc.updatedAt, 2);
});

test('applyOps：缺省 id 自动生成、缺省坐标吸附、color 档位', () => {
  const r = core.applyOps(board(), [{ op: 'add_note', args: { x: 100, y: 3, color: 'blue' } }], { now: 1 });
  const n = r.doc.nodes[0];
  assert.ok(core.validId(n.id) && n.id.startsWith('n_'));
  assert.equal(n.x, 120) ;
  assert.equal(n.y, 0);
  assert.equal(n.color, 'blue');
});

// ── applyOps：整批拒绝（试算回滚）───────────────────────────────────────────

test('applyOps：中间 op 失败 → 整批拒绝，原 doc 未被改动', () => {
  const doc = addCard(board(), 'a', 0, 0);
  const before = JSON.stringify(doc);
  const r = core.applyOps(doc, [
    { op: 'add_card', args: { id: 'b', x: 0, y: 0 } },
    { op: 'add_edge', args: { from: 'b', to: 'ghost' } },
    { op: 'add_card', args: { id: 'c', x: 0, y: 0 } },
  ], { now: 9 });
  assert.equal(r.applied, 0);
  assert.equal(r.doc, undefined);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].index, 1);
  assert.ok(r.errors[0].error.includes('to 节点不存在'));
  assert.equal(JSON.stringify(doc), before, '原 doc 不得被试算污染');
});

test('applyOps：ops 形状与数量防线', () => {
  const doc = board();
  assert.ok(core.applyOps(doc, []).errors[0].error.includes('非空数组'));
  assert.ok(core.applyOps(doc, 'x').errors[0].error.includes('非空数组'));
  assert.ok(core.applyOps(doc, [{ op: '不存在' }]).errors[0].error.includes('未知 op'));
  const many = Array.from({ length: core.LIMITS.MAX_OPS + 1 }, () => ({ op: 'set_title', args: { title: 't' } }));
  assert.ok(core.applyOps(doc, many).errors[0].error.includes('超限'));
  assert.ok(core.applyOps(null, [{ op: 'set_title', args: { title: 't' } }]).errors[0].error.includes('形状非法'));
});

test('校验矩阵：id 重复/坐标非法/文本超长/color 非法/自环/重复边', () => {
  let doc = addCard(board(), 'a', 0, 0);
  const t = (ops) => core.applyOps(doc, ops, { now: 1 }).errors[0].error;
  assert.ok(t([{ op: 'add_card', args: { id: 'a', x: 0, y: 0 } }]).includes('已存在'));
  assert.ok(t([{ op: 'add_note', args: { x: NaN, y: 0 } }]).includes('有限坐标'));
  assert.ok(t([{ op: 'add_note', args: { x: 1e9, y: 0 } }]).includes('有限坐标'));
  assert.ok(t([{ op: 'add_note', args: { x: 0, y: 0, text: '长'.repeat(2001) } }]).includes('超长'));
  assert.ok(t([{ op: 'add_note', args: { x: 0, y: 0, color: '黑' } }]).includes('color'));
  doc = core.applyOps(doc, [{ op: 'add_note', args: { id: 'b', x: 400, y: 0 } }], { now: 1 }).doc;
  assert.ok(t([{ op: 'add_edge', args: { from: 'a', to: 'a' } }]).includes('自环'));
  doc = core.applyOps(doc, [{ op: 'add_edge', args: { id: 'e1', from: 'a', to: 'b' } }], { now: 1 }).doc; // 首条边落板
  assert.ok(t([{ op: 'add_edge', args: { from: 'a', to: 'b' } }]).includes('重复边'));
  assert.ok(t([{ op: 'update_node', args: { id: 'a', patch: { type: 'note' } } }]).includes('不支持字段'));
  assert.ok(t([{ op: 'move_node', args: { id: 'a', x: 'x', y: 0 } }]).includes('有限坐标'));
  assert.ok(t([{ op: 'delete_node', args: { id: 'zz' } }]).includes('不存在'));
  assert.ok(t([{ op: 'set_title', args: { title: '  ' } }]).includes('非空'));
  assert.ok(t([{ op: 'relayout', args: { direction: '斜' } }]).includes('direction'));
});

// ── 级联与容量 ──────────────────────────────────────────────────────────────

test('delete_node 级联删边', () => {
  let doc = addCard(addCard(board(), 'a', 0, 0), 'b', 400, 0);
  doc = core.applyOps(doc, [{ op: 'add_edge', args: { id: 'e', from: 'a', to: 'b' } }], { now: 1 }).doc;
  doc = core.applyOps(doc, [{ op: 'delete_node', args: { id: 'a' } }], { now: 1 }).doc;
  assert.deepEqual(doc.nodes.map((n) => n.id), ['b']);
  assert.deepEqual(doc.edges, []);
});

test('容量上限：节点 500 / 边 1000（分批喂，单批上限 200）', () => {
  let doc = board();
  const chunk = (ops) => {
    for (let i = 0; i < ops.length; i += core.LIMITS.MAX_OPS) {
      const r = core.applyOps(doc, ops.slice(i, i + core.LIMITS.MAX_OPS), { now: 1 });
      assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
      doc = r.doc;
    }
  };
  const nodeOps = [];
  for (let i = 0; i < core.LIMITS.MAX_NODES; i++) nodeOps.push({ op: 'add_note', args: { id: `n${i}`, x: (i % 20) * 400, y: Math.floor(i / 20) * 200 } });
  chunk(nodeOps);
  assert.equal(doc.nodes.length, core.LIMITS.MAX_NODES);
  const r = core.applyOps(doc, [{ op: 'add_note', args: { id: 'overflow', x: 0, y: 0 } }], { now: 1 });
  assert.ok(r.errors[0].error.includes('节点数已达上限'));

  const edgeOps = [];
  for (let i = 0; i < core.LIMITS.MAX_NODES - 1; i++) edgeOps.push({ op: 'add_edge', args: { id: `e${i}`, from: `n${i}`, to: `n${i + 1}` } });
  // 补足到 MAX_EDGES-1 条：生成器只走 i<j 的 pair，不会与链式边/收尾两条反向边撞车
  let gi = 0; let gj = 2;
  while (edgeOps.length < core.LIMITS.MAX_EDGES - 1) {
    edgeOps.push({ op: 'add_edge', args: { id: `x${gi}_${gj}`, from: `n${gi}`, to: `n${gj}` } });
    gj += 1;
    if (gj >= core.LIMITS.MAX_NODES) { gi += 1; gj = gi + 2; }
  }
  chunk(edgeOps);
  assert.equal(doc.edges.length, core.LIMITS.MAX_EDGES - 1);
  const r2 = core.applyOps(doc, [{ op: 'add_edge', args: { from: 'n499', to: 'n0' } }], { now: 1 });
  assert.equal(r2.errors.length, 0, JSON.stringify(r2.errors)); // 第 1000 条边可加
  const r3 = core.applyOps(r2.doc, [{ op: 'add_edge', args: { from: 'n498', to: 'n0' } }], { now: 1 });
  assert.ok(r3.errors[0].error.includes('边数已达上限'));
});

// ── 布局算法 ────────────────────────────────────────────────────────────────

test('radial 布局：根居中、邻层环形、孤点不丢', () => {
  let doc = board();
  for (const [id, x] of [['root', 0], ['a', 400], ['b', 800], ['lonely', 1200]]) {
    doc = core.applyOps(doc, [{ op: 'add_card', args: { id, x, y: 0 } }], { now: 1 }).doc;
  }
  doc = core.applyOps(doc, [
    { op: 'add_edge', args: { from: 'root', to: 'a' } },
    { op: 'add_edge', args: { from: 'root', to: 'b' } },
  ], { now: 1 }).doc;
  const r = core.applyOps(doc, [{ op: 'relayout', args: { direction: 'radial', root: 'root' } }], { now: 1 });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const byId = new Map(r.doc.nodes.map((n) => [n.id, n]));
  const c = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const rootC = c(byId.get('root'));
  assert.ok(dist(c(byId.get('a')), rootC) >= 200, `a 应在一环上（椭圆 y 半径 0.72×340，实际 ${dist(c(byId.get('a')), rootC)}）`);
  assert.ok(dist(c(byId.get('b')), rootC) >= 200, 'b 应在一环上');
  assert.ok(Number.isFinite(byId.get('lonely').x), '孤点有坐标');
});

test('LR 布局：入度为 0 在左层、层级单调、环不死循环、孤点收尾', () => {
  let doc = board();
  for (const id of ['s', 'm1', 'm2', 't', 'cycle1', 'cycle2', 'lonely']) {
    doc = core.applyOps(doc, [{ op: 'add_card', args: { id, x: 0, y: 0 } }], { now: 1 }).doc;
  }
  doc = core.applyOps(doc, [
    { op: 'add_edge', args: { from: 's', to: 'm1' } },
    { op: 'add_edge', args: { from: 's', to: 'm2' } },
    { op: 'add_edge', args: { from: 'm1', to: 't' } },
    { op: 'add_edge', args: { from: 'm2', to: 't' } },
    { op: 'add_edge', args: { from: 'cycle1', to: 'cycle2' } },
    { op: 'add_edge', args: { from: 'cycle2', to: 'cycle1' } }, // 环
  ], { now: 1 }).doc;
  const r = core.applyOps(doc, [{ op: 'relayout', args: { direction: 'LR' } }], { now: 1 });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const byId = new Map(r.doc.nodes.map((n) => [n.id, n]));
  assert.ok(byId.get('s').x < byId.get('m1').x, 's 在 m1 左侧');
  assert.ok(byId.get('m1').x < byId.get('t').x, 'm1 在 t 左侧');
  assert.equal(byId.get('m1').x, byId.get('m2').x, '同层同列（x 对齐）');
  assert.ok(Math.abs(byId.get('m1').y - byId.get('m2').y) >= 120, '同层节点纵向堆叠不重叠');
  assert.ok(Number.isFinite(byId.get('lonely').x) && Number.isFinite(byId.get('cycle1').x), '孤点与环节点都有坐标');
});

test('TB 布局：纵向分层', () => {
  let doc = addCard(addCard(board(), 'top', 0, 0), 'bottom', 0, 0);
  doc = core.applyOps(doc, [{ op: 'add_edge', args: { from: 'top', to: 'bottom' } }], { now: 1 }).doc;
  const r = core.applyOps(doc, [{ op: 'relayout', args: { direction: 'TB' } }], { now: 1 });
  const byId = new Map(r.doc.nodes.map((n) => [n.id, n]));
  assert.ok(byId.get('bottom').y > byId.get('top').y, 'bottom 在 top 下方');
});

test('relayout：空画布与坏 root 拒绝', () => {
  assert.ok(core.applyOps(board(), [{ op: 'relayout', args: {} }], { now: 1 }).errors[0].error.includes('空'));
  const doc = addCard(board(), 'a', 0, 0);
  assert.ok(core.applyOps(doc, [{ op: 'relayout', args: { direction: 'radial', root: 'zz' } }], { now: 1 }).errors[0].error.includes('root'));
});

// ── 导出 / bounds / 索引 ────────────────────────────────────────────────────

test('exportMarkdown：分组几何归档 + 关联行', () => {
  let doc = board();
  doc = core.applyOps(doc, [
    { op: 'add_group', args: { id: 'g', x: 0, y: 0, w: 800, h: 400, title: '核心区' } },
    { op: 'add_card', args: { id: 'a', x: 40, y: 40, title: '卡A', text: '第一行\n第二行' } },
    { op: 'add_note', args: { id: 'b', x: 1200, y: 0, title: '便签B' } },
    { op: 'add_edge', args: { from: 'a', to: 'b', label: '引用' } },
  ], { now: 1 }).doc;
  const r = core.exportMarkdown(doc);
  assert.ok(r.markdown.includes('# 测试板'));
  assert.ok(r.markdown.includes('## 分组：核心区'));
  assert.ok(/## 分组：核心区[\s\S]*- 卡A[\s\S]*第一行/.test(r.markdown), '组内节点缩进归档');
  assert.ok(r.markdown.includes('## 未分组'));
  assert.ok(/- 卡A → 便签B（引用）/.test(r.markdown), `关联行：${r.markdown}`);
  assert.equal(core.exportMarkdown(null).error, '板文档形状非法');
});

test('bounds：含 w/h 的包围盒与空板零盒', () => {
  const doc = addCard(board(), 'a', 80, 40);
  const b = core.bounds(doc);
  assert.deepEqual([b.minX, b.minY], [80, 40]);
  assert.equal(b.width, core.LIMITS.DEFAULT_W.card);
  assert.deepEqual(core.bounds({ nodes: [] }).width, 0);
});

test('索引：upsert 覆盖同 id、remove 删除、indexEntryOf 口径', () => {
  const doc = addCard(board(), 'a', 0, 0);
  const e1 = core.indexEntryOf('b1', doc, 5);
  assert.deepEqual(e1, { id: 'b1', title: '测试板', updatedAt: doc.updatedAt, nodeCount: 1 });
  let idx = core.upsertIndex([], e1);
  const e2 = { ...e1, title: '改名' };
  idx = core.upsertIndex(idx, e2);
  assert.equal(idx.length, 1);
  assert.equal(idx[0].title, '改名');
  idx = core.removeIndex(idx, 'b1');
  assert.equal(idx.length, 0);
  assert.deepEqual(core.removeIndex(null, 'x'), []);
});
