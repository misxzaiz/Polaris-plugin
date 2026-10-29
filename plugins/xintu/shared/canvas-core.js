'use strict';
/**
 * canvas-core.js —— 心图画布共享计算权威（CJS 零依赖纯函数）
 *
 * 面板（src/）与 MCP server（mcp/）共用同一份逻辑，口径不漂移（对齐
 * pocket-ledger 的 shared core 模式）。全部函数不抛错，错误以 { error } 返回。
 *
 * 数据模型（cap.kv 键空间 xt.*，整板单键整存整取）：
 *   xt.boards        → [{ id, title, updatedAt, nodeCount }]（索引，可由板键重建）
 *   xt.board.<id>    → { rev, title, createdAt, updatedAt, nodes[], edges[] }
 *     node: { id, type:'note'|'card'|'group', x, y, w, h, title, text, color, z }
 *     edge: { id, from, to, label }
 *
 * 并发语义（如实）：cap.kv 无 CAS，板级 last-write-wins；单人双端同时编辑
 * 同一块板的窗口极小，本层不做合并（spec §九 已标注）。
 *
 * group 语义：group 仅是 z 序靠后的视觉容器节点，不携带子节点关系、移动
 * 分组框不带走内部节点（spec §四 的克制决策）。
 */

const LIMITS = {
  MAX_BOARDS: 50,
  MAX_NODES: 500,
  MAX_EDGES: 1000,
  MAX_TITLE: 120,
  MAX_TEXT: 2000,
  MAX_LABEL: 80,
  MAX_OPS: 200,
  GRID: 40,
  COORD_LIMIT: 100000,
  MIN_W: 80,
  MIN_H: 40,
  MAX_W: 2000,
  MAX_H: 4000,
  DEFAULT_W: { note: 220, card: 260, group: 480 },
  DEFAULT_H: { note: 96, card: 140, group: 320 },
};

const NODE_TYPES = ['note', 'card', 'group'];
const COLORS = ['default', 'blue', 'green', 'amber', 'rose', 'violet'];
const LAYOUT_DIRECTIONS = ['radial', 'LR', 'TB'];
const OPS = [
  'add_note', 'add_card', 'add_group', 'add_edge',
  'update_node', 'move_node', 'delete_node', 'delete_edge',
  'set_title', 'relayout',
];

const K = {
  INDEX: 'xt.boards',
  BOARD_PREFIX: 'xt.board.',
  PREFIX: 'xt.',
  board: (id) => `xt.board.${id}`,
};

// ── 基础工具 ────────────────────────────────────────────────────────────────

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 吸附到 40px 网格（AI 与人共编的坐标都对齐，画面不散） */
function snap(v) {
  return Math.round(Number(v) / LIMITS.GRID) * LIMITS.GRID;
}

function clampNum(v, min, max) {
  return Math.min(max, Math.max(min, Number(v)));
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function validStr(s, max) {
  return typeof s === 'string' && s.length <= max;
}

function validXY(v) {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMITS.COORD_LIMIT;
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

/** 节点显示名：标题优先，否则正文首行，截 40 字（export/边列表用） */
function nodeLabel(node) {
  if (!node) return '?';
  const head = (node.title && String(node.title).trim()) || String(node.text || '').split('\n')[0].trim();
  return head ? head.slice(0, 40) : node.id;
}

// ── 板与文档 ────────────────────────────────────────────────────────────────

/** 新建空板：返回 { id, doc }（title 非法时返回 { error }） */
function newBoard(title, now) {
  const t = title === undefined || title === null || String(title).trim() === ''
    ? '未命名画布' : String(title).trim();
  if (t.length > LIMITS.MAX_TITLE) return { error: `标题超长（上限 ${LIMITS.MAX_TITLE} 字）` };
  const ts = now || Date.now();
  return {
    id: newId('xt'),
    doc: { rev: 1, title: t, createdAt: ts, updatedAt: ts, nodes: [], edges: [] },
  };
}

/**
 * 宽松校验一份从 kv 读出的板文档：修整形状、剔除非法节点/边。
 * 面板渲染与 MCP 编辑前都先过这里，坏数据不炸消费方。
 */
function sanitizeDoc(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const doc = {
    rev: Number.isFinite(Number(raw.rev)) ? Math.max(0, Math.floor(Number(raw.rev))) : 0,
    title: validStr(raw.title, LIMITS.MAX_TITLE) ? raw.title : '未命名画布',
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
    nodes: [],
    edges: [],
  };
  const seen = new Set();
  if (Array.isArray(raw.nodes)) {
    for (const n of raw.nodes) {
      if (!n || typeof n !== 'object' || !validId(n.id) || seen.has(n.id)) continue;
      if (!NODE_TYPES.includes(n.type)) continue;
      if (!validXY(n.x) || !validXY(n.y)) continue;
      seen.add(n.id);
      doc.nodes.push({
        id: n.id,
        type: n.type,
        x: snap(n.x),
        y: snap(n.y),
        w: clampNum(n.w || LIMITS.DEFAULT_W[n.type], LIMITS.MIN_W, LIMITS.MAX_W),
        h: clampNum(n.h || LIMITS.DEFAULT_H[n.type], LIMITS.MIN_H, LIMITS.MAX_H),
        title: validStr(n.title, LIMITS.MAX_TITLE) ? n.title : '',
        text: validStr(n.text, LIMITS.MAX_TEXT) ? n.text : '',
        color: COLORS.includes(n.color) ? n.color : 'default',
        z: Number.isFinite(Number(n.z)) ? Number(n.z) : (n.type === 'group' ? -1 : 0),
      });
    }
  }
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeSeen = new Set();
  if (Array.isArray(raw.edges)) {
    for (const e of raw.edges) {
      if (!e || typeof e !== 'object' || !validId(e.id) || edgeSeen.has(e.id)) continue;
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) continue;
      const pairKey = `${e.from}->${e.to}`;
      if (edgeSeen.has(pairKey)) continue;
      edgeSeen.add(e.id);
      edgeSeen.add(pairKey);
      doc.edges.push({
        id: e.id,
        from: e.from,
        to: e.to,
        label: validStr(e.label, LIMITS.MAX_LABEL) ? e.label : '',
      });
    }
  }
  return doc;
}

// ── op 校验与应用（试算整批原子）───────────────────────────────────────────

/** add_note / add_card / add_group 的归一化。返回 { node } | { error } */
function normalizeNewNode(opType, args, doc) {
  const type = opType === 'add_note' ? 'note' : opType === 'add_card' ? 'card' : 'group';
  const a = args && typeof args === 'object' ? args : {};
  let id = a.id;
  if (id === undefined || id === null || id === '') id = newId('n');
  if (!validId(id)) return { error: `节点 id 非法（只允许字母数字_-，≤64 位）：${JSON.stringify(id)}` };
  if (doc.nodes.some((n) => n.id === id)) return { error: `节点 id 已存在：${id}` };
  if (!validXY(a.x) || !validXY(a.y)) {
    return { error: `${type} 节点需要有限坐标 x/y（|值| ≤ ${LIMITS.COORD_LIMIT}），收到 x=${JSON.stringify(a.x)} y=${JSON.stringify(a.y)}` };
  }
  if (a.title !== undefined && !validStr(a.title, LIMITS.MAX_TITLE)) return { error: `title 超长（上限 ${LIMITS.MAX_TITLE} 字）` };
  if (a.text !== undefined && !validStr(a.text, LIMITS.MAX_TEXT)) return { error: `text 超长（上限 ${LIMITS.MAX_TEXT} 字）` };
  if (a.color !== undefined && !COLORS.includes(a.color)) return { error: `color 必须是 ${COLORS.join('/')} 之一` };
  return {
    node: {
      id,
      type,
      x: snap(a.x),
      y: snap(a.y),
      w: a.w === undefined ? LIMITS.DEFAULT_W[type] : clampNum(a.w, LIMITS.MIN_W, LIMITS.MAX_W),
      h: a.h === undefined ? LIMITS.DEFAULT_H[type] : clampNum(a.h, LIMITS.MIN_H, LIMITS.MAX_H),
      title: typeof a.title === 'string' ? a.title : '',
      text: typeof a.text === 'string' ? a.text : '',
      color: a.color === undefined ? 'default' : a.color,
      z: type === 'group' ? -1 : 0,
    },
  };
}

/** add_edge 归一化：端点必须已存在于当前试算状态。返回 { edge } | { error } */
function normalizeNewEdge(args, doc) {
  const a = args && typeof args === 'object' ? args : {};
  let id = a.id;
  if (id === undefined || id === null || id === '') id = newId('e');
  if (!validId(id)) return { error: `边 id 非法：${JSON.stringify(id)}` };
  if (doc.edges.some((e) => e.id === id)) return { error: `边 id 已存在：${id}` };
  if (!validId(a.from) || !validId(a.to)) return { error: 'add_edge 需要 from/to 两个节点 id' };
  if (a.from === a.to) return { error: `不允许自环（from=to=${a.from}）` };
  if (!doc.nodes.some((n) => n.id === a.from)) return { error: `from 节点不存在：${a.from}（同一批 op 里先 add 再连边即可）` };
  if (!doc.nodes.some((n) => n.id === a.to)) return { error: `to 节点不存在：${a.to}` };
  if (doc.edges.some((e) => e.from === a.from && e.to === a.to)) {
    return { error: `重复边：${a.from} → ${a.to} 已存在` };
  }
  if (a.label !== undefined && !validStr(a.label, LIMITS.MAX_LABEL)) return { error: `label 超长（上限 ${LIMITS.MAX_LABEL} 字）` };
  return { edge: { id, from: a.from, to: a.to, label: typeof a.label === 'string' ? a.label : '' } };
}

function findNode(doc, id) {
  return doc.nodes.find((n) => n.id === id) || null;
}

/** 应用单个 op 到（试算中的）doc。成功返回 null，失败返回 { error } */
function applyOne(doc, op) {
  if (!op || typeof op !== 'object' || !OPS.includes(op.op)) {
    return { error: `未知 op：${JSON.stringify(op && op.op)}（可用：${OPS.join('/')}）` };
  }
  const a = op.args && typeof op.args === 'object' ? op.args : {};
  switch (op.op) {
    case 'add_note':
    case 'add_card':
    case 'add_group': {
      if (doc.nodes.length >= LIMITS.MAX_NODES) return { error: `节点数已达上限 ${LIMITS.MAX_NODES}` };
      const r = normalizeNewNode(op.op, a, doc);
      if (r.error) return r;
      doc.nodes.push(r.node);
      return null;
    }
    case 'add_edge': {
      if (doc.edges.length >= LIMITS.MAX_EDGES) return { error: `边数已达上限 ${LIMITS.MAX_EDGES}` };
      const r = normalizeNewEdge(a, doc);
      if (r.error) return r;
      doc.edges.push(r.edge);
      return null;
    }
    case 'update_node': {
      const n = findNode(doc, a.id);
      if (!n) return { error: `节点不存在：${a.id}` };
      const patch = a.patch && typeof a.patch === 'object' ? a.patch : {};
      const keys = Object.keys(patch);
      if (!keys.length) return { error: 'update_node 需要 patch（title/text/color）' };
      for (const k of keys) {
        if (k === 'title') {
          if (!validStr(patch.title, LIMITS.MAX_TITLE)) return { error: 'title 非法或超长' };
          n.title = patch.title;
        } else if (k === 'text') {
          if (!validStr(patch.text, LIMITS.MAX_TEXT)) return { error: 'text 非法或超长' };
          n.text = patch.text;
        } else if (k === 'color') {
          if (!COLORS.includes(patch.color)) return { error: `color 必须是 ${COLORS.join('/')} 之一` };
          n.color = patch.color;
        } else {
          return { error: `update_node 不支持字段 ${k}（类型/坐标请用 move_node 或重建节点）` };
        }
      }
      return null;
    }
    case 'move_node': {
      const n = findNode(doc, a.id);
      if (!n) return { error: `节点不存在：${a.id}` };
      if (!validXY(a.x) || !validXY(a.y)) return { error: `move_node 需要有限坐标 x/y，收到 x=${JSON.stringify(a.x)} y=${JSON.stringify(a.y)}` };
      n.x = snap(a.x);
      n.y = snap(a.y);
      return null;
    }
    case 'delete_node': {
      const n = findNode(doc, a.id);
      if (!n) return { error: `节点不存在：${a.id}` };
      doc.nodes = doc.nodes.filter((x) => x.id !== a.id);
      // 级联删边：引用该节点的边一并移除，防悬空引用
      doc.edges = doc.edges.filter((e) => e.from !== a.id && e.to !== a.id);
      return null;
    }
    case 'delete_edge': {
      const e = doc.edges.find((x) => x.id === a.id);
      if (!e) return { error: `边不存在：${a.id}` };
      doc.edges = doc.edges.filter((x) => x.id !== a.id);
      return null;
    }
    case 'set_title': {
      const t = typeof a.title === 'string' ? a.title.trim() : '';
      if (!t) return { error: 'set_title 需要非空 title' };
      if (t.length > LIMITS.MAX_TITLE) return { error: `标题超长（上限 ${LIMITS.MAX_TITLE} 字）` };
      doc.title = t;
      return null;
    }
    case 'relayout': {
      const dir = a.direction === undefined ? 'radial' : a.direction;
      if (!LAYOUT_DIRECTIONS.includes(dir)) return { error: `direction 必须是 ${LAYOUT_DIRECTIONS.join('/')} 之一` };
      if (a.root !== undefined && a.root !== null && !findNode(doc, a.root)) return { error: `root 节点不存在：${a.root}` };
      const r = computeLayout(doc, dir, a.root || null);
      if (r.error) return r;
      return null;
    }
    default:
      return { error: `未知 op：${op.op}` };
  }
}

/**
 * 试算并整批应用 ops（spec §四：任一失败整批拒绝，绝不半截提交）。
 * 返回 { doc, applied } 或 { errors: [{ index, op, error }] }。
 * @param ctx {{ now?: number }}
 */
function applyOps(doc, ops, ctx) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    return { errors: [{ index: -1, op: null, error: '板文档形状非法（缺 nodes/edges）' }] };
  }
  if (!Array.isArray(ops) || ops.length === 0) {
    return { errors: [{ index: -1, op: null, error: 'ops 必须是非空数组' }] };
  }
  if (ops.length > LIMITS.MAX_OPS) {
    return { errors: [{ index: -1, op: null, error: `单批 op 数超限（${ops.length} > ${LIMITS.MAX_OPS}），请拆批` }] };
  }
  const next = deepClone(doc);
  next.nodes = next.nodes || [];
  next.edges = next.edges || [];
  const errors = [];
  for (let i = 0; i < ops.length; i++) {
    const e = applyOne(next, ops[i]);
    if (e) {
      errors.push({ index: i, op: ops[i] && ops[i].op, error: e.error });
      break;
    }
  }
  if (errors.length) return { errors, applied: 0 };
  next.rev = (Number(doc.rev) || 0) + 1;
  next.updatedAt = (ctx && ctx.now) || Date.now();
  return { doc: next, applied: ops.length, errors: [] };
}

// ── 确定性布局（spec §四：布局是函数不是 AI 自由发挥）──────────────────────

/**
 * 对 doc 就地计算布局。
 * radial：以 root（或连接度最高的节点）为心，BFS 分层环形铺开。
 * LR/TB：有向分层（忽略回边防死循环），孤立节点排尾行/尾列。
 */
function computeLayout(doc, direction, rootId) {
  const nodes = doc.nodes;
  if (!nodes.length) return { error: '画布为空，无从布局' };
  const byId = new Map(nodes.map((n) => [n.id, n]));

  if (direction === 'radial') {
    // 无向邻接 + BFS 分层
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of doc.edges) {
      if (!adj.has(e.from) || !adj.has(e.to)) continue;
      adj.get(e.from).push(e.to);
      adj.get(e.to).push(e.from);
    }
    let root = rootId && byId.has(rootId) ? rootId : null;
    if (!root) {
      // 取连接度最高的节点（并列取文档序靠前），孤立画布取首节点
      let bestDeg = -1;
      for (const n of nodes) {
        const deg = (adj.get(n.id) || []).length;
        if (deg > bestDeg) { bestDeg = deg; root = n.id; }
      }
    }
    const depth = new Map([[root, 0]]);
    const queue = [root];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj.get(cur) || []) {
        if (!depth.has(nb)) { depth.set(nb, depth.get(cur) + 1); queue.push(nb); }
      }
    }
    // 每层成员按文档序
    const layers = new Map();
    for (const n of nodes) {
      const d = depth.get(n.id) === undefined ? 999 : depth.get(n.id);
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d).push(n);
    }
    // 画布中心取当前包围盒中心，避免布局后整体跳走
    const b = boundsOf(nodes);
    const cx = Math.round((b.minX + b.maxX) / 2);
    const cy = Math.round((b.minY + b.maxY) / 2);
    const RING = 340;
    for (const [d, members] of layers) {
      if (d === 0) {
        members[0].x = snap(cx - members[0].w / 2);
        members[0].y = snap(cy - members[0].h / 2);
        continue;
      }
      const radius = RING * Math.min(d, 6) + (d > 6 ? 120 * (d - 6) : 0);
      members.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / members.length - Math.PI / 2 + d * 0.35;
        n.x = snap(cx + Math.cos(angle) * radius - n.w / 2);
        n.y = snap(cy + Math.sin(angle) * radius * 0.72 - n.h / 2);
      });
    }
    return {};
  }

  // LR / TB：有向最长路径分层，忽略回边
  const out = new Map(nodes.map((n) => [n.id, []]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of doc.edges) {
    if (!out.has(e.from) || !out.has(e.to) || e.from === e.to) continue;
    out.get(e.from).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  }
  // Kahn 拓扑分层；环上剩余节点归入尾层（不丢节点）
  const layer = new Map();
  let frontier = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  if (!frontier.length) frontier = [nodes[0].id];
  frontier.forEach((id) => layer.set(id, 0));
  let d = 0;
  let placed = frontier.length;
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      for (const nb of out.get(id) || []) {
        if (layer.has(nb)) continue; // 回边/跨层边忽略
        layer.set(nb, d + 1);
        next.push(nb);
      }
    }
    frontier = next;
    if (frontier.length) { d += 1; placed += frontier.length; }
  }
  const maxLayer = d;
  const GAP_MAIN = direction === 'LR' ? 360 : 240;
  const GAP_CROSS = direction === 'LR' ? 160 : 200;
  const buckets = new Map();
  for (const n of nodes) {
    const ld = layer.has(n.id) ? layer.get(n.id) : maxLayer + 1;
    if (!buckets.has(ld)) buckets.set(ld, []);
    buckets.get(ld).push(n);
  }
  const b = boundsOf(nodes);
  const originX = direction === 'LR' ? b.minX : Math.round((b.minX + b.maxX) / 2);
  const originY = direction === 'LR' ? Math.round((b.minY + b.maxY) / 2) : b.minY;
  for (const [ld, members] of buckets) {
    members.forEach((n, i) => {
      if (direction === 'LR') {
        n.x = snap(originX + ld * GAP_MAIN);
        n.y = snap(originY + (i - (members.length - 1) / 2) * GAP_CROSS - n.h / 2);
      } else {
        n.x = snap(originX + (i - (members.length - 1) / 2) * GAP_CROSS - n.w / 2);
        n.y = snap(originY + ld * GAP_MAIN);
      }
    });
  }
  return {};
}

/** 节点集合的包围盒（relayout 居中基准 / 面板 fit 用）。空集合返回 0 盒 */
function boundsOf(nodes) {
  if (!nodes || !nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function bounds(doc) {
  return boundsOf(doc && Array.isArray(doc.nodes) ? doc.nodes : []);
}

// ── 导出与索引 ──────────────────────────────────────────────────────────────

/** 大纲导出：分组缩进 + 关联行。AI 可直接引用回对话 */
function exportMarkdown(doc) {
  const d = sanitizeDoc(doc);
  if (!d) return { error: '板文档形状非法' };
  const lines = [`# ${d.title}`, ''];
  const inGroup = new Set();
  const groups = d.nodes.filter((n) => n.type === 'group');
  const loose = d.nodes.filter((n) => n.type !== 'group');
  const emitNode = (n, indent) => {
    const pad = '  '.repeat(indent);
    const head = nodeLabel(n);
    lines.push(`${pad}- ${head}`);
    const body = String(n.text || '').split('\n').filter((l) => l.trim());
    if (n.title && n.text && body.join('').trim()) {
      for (const l of body) lines.push(`${pad}  ${l.trim()}`);
    }
  };
  let looseEmitted = false;
  for (const g of groups) {
    lines.push(`## 分组：${nodeLabel(g)}`);
    // 语义决策：group 不携带子节点关系，导出按几何包含关系归档（只读推导，不改数据）
    const inner = loose.filter((n) => n.x >= g.x && n.x + n.w <= g.x + g.w && n.y >= g.y && n.y + n.h <= g.y + g.h);
    for (const n of inner) { inGroup.add(n.id); emitNode(n, 1); }
    if (!inner.length) lines.push('  （空）');
  }
  const rest = loose.filter((n) => !inGroup.has(n.id));
  if (rest.length) {
    if (groups.length) { lines.push(''); lines.push('## 未分组'); }
    for (const n of rest) { emitNode(n, 0); looseEmitted = true; }
  }
  if (!groups.length && !looseEmitted && !d.nodes.length) lines.push('（空画布）');
  if (d.edges.length) {
    lines.push('');
    lines.push('## 关联');
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    for (const e of d.edges) {
      const f = byId.get(e.from);
      const t = byId.get(e.to);
      if (!f || !t) continue;
      lines.push(`- ${nodeLabel(f)} → ${nodeLabel(t)}${e.label ? `（${e.label}）` : ''}`);
    }
  }
  return { markdown: lines.join('\n') };
}

/** 索引条目（xt.boards 维护与重建共用此口径） */
function indexEntryOf(id, doc, now) {
  return {
    id,
    title: (doc && doc.title) || '未命名画布',
    updatedAt: (doc && doc.updatedAt) || now || 0,
    nodeCount: doc && Array.isArray(doc.nodes) ? doc.nodes.length : 0,
  };
}

/** 索引 upsert（同一 id 覆盖，保序：更新的在后） */
function upsertIndex(index, entry) {
  const list = Array.isArray(index) ? index.filter((e) => e && e.id !== entry.id) : [];
  list.push(entry);
  return list;
}

function removeIndex(index, id) {
  return (Array.isArray(index) ? index : []).filter((e) => e && e.id !== id);
}

module.exports = {
  LIMITS, NODE_TYPES, COLORS, LAYOUT_DIRECTIONS, OPS, K,
  newId, snap, clampNum, validId, nodeLabel,
  newBoard, sanitizeDoc, applyOps, computeLayout,
  bounds, boundsOf, exportMarkdown,
  indexEntryOf, upsertIndex, removeIndex,
};
