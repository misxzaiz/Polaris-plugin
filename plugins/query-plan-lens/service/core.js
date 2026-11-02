'use strict';
/**
 * core.js —— 执行计划透视台纯逻辑单权威（零依赖）
 *
 * 职责（全部可离线单测，不碰网络/文件/进程）：
 *   1. assertReadOnlySelect —— EXPLAIN 目标语句只读护栏（字符串/注释感知）
 *   2. parsePgExplainJson / parseMysqlExplainJson —— 双引擎 JSON 计划 → 统一树
 *   3. parsePgExplainText —— PG 经典文本 EXPLAIN 粘贴解析（生产库连不上时的路径）
 *   4. analyzePlan —— 中文诊断规则引擎（全表扫/行数误估/外排落盘/filesort/...）
 *   5. summarizeForAi —— 供 MCP/IAB 的有界摘要文本
 *
 * 统一树节点（UnifiedNode）：
 *   { id, engine, nodeType, relation, alias, indexName, estRows, estCost,
 *     actRows, actRowsTotal, loops, actualMs, selfMs, startupMs,
 *     removedByFilter, flags[], detail{}, children[] }
 * 根包装（UnifiedPlan）：
 *   { engine, statement, totalCost, actualMs, planningMs, executionMs, nodeCount, root }
 */

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 单条计划原始 JSON 入库上限（字节，防 kv 撑爆） */
const MAX_RAW_PLAN_BYTES = 256 * 1024;
/** 单条历史 SQL 摘要长度上限 */
const MAX_SQL_SNIPPET = 300;
/** 历史条数上限 */
const HISTORY_LIMIT = 30;

// ── 1. 只读护栏（EXPLAIN 目标语句） ────────────────────────────────────────

/**
 * 剥离字符串字面量与注释，返回语句骨架（关键字骨架分析用）。
 * 返回 { skeleton, err }：遇到未闭合字符串/注释返回 err。
 * 语义：'...'、"..."、`...` 内部内容替换为空格（MySQL 反引号为标识符引号，
 * 一并置空不影响骨架）；-- 到行尾、/* *\/ 到闭合均为注释。
 */
function sqlSkeleton(sql) {
  const out = [];
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      let closed = false;
      while (i < n) {
        if (sql[i] === '\\' && quote !== '`') { i += 2; continue; } // 反斜杠转义（MySQL 语义）
        if (sql[i] === quote) {
          if (quote !== '`' && sql[i + 1] === quote) { i += 2; continue; } // 双写转义
          i += 1; closed = true; break;
        }
        i += 1;
      }
      if (!closed) return { skeleton: '', err: `存在未闭合的 ${quote} 字符串` };
      out.push(' ');
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i += 1;
      continue;
    }
    if (c === '#') { // MySQL 行注释
      while (i < n && sql[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return { skeleton: '', err: '存在未闭合的 /* 块注释' };
      out.push(' ');
      i = end + 2;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return { skeleton: out.join(''), err: '' };
}

/**
 * 硬阻断动词清单。取舍原则：
 *   - PG 的 EXPLAIN ANALYZE 会**真实执行** INSERT/UPDATE/DELETE/MERGE/CALL/DO/COPY/SET 等，
 *     这批必须拦；其余管理语句虽不执行，也一并拦住避免歧义。
 *   - 刻意**不**拦（服务端会自然拒绝、且与 SELECT 语法高频碰撞的词）：
 *     desc/describe/show/use/handler（ORDER BY x DESC、EXPLAIN 表结构习惯）；
 *     load/fetch/comment（列名常见：load、FETCH FIRST n ROWS ONLY、comment 列）。
 *   - replace 特判：SELECT REPLACE(...) 是字符串函数，用 (?!\s*\() 只拦语句形态。
 */
const WRITE_VERBS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'upsert',
  'create', 'alter', 'drop', 'rename', 'grant', 'revoke',
  'vacuum', 'analyze', 'reindex', 'cluster',
  'copy', 'call', 'do', 'lock', 'listen', 'notify', 'install',
  'attach', 'detach', 'import', 'export', 'set', 'reset',
  'shutdown', 'kill', 'optimize', 'flush', 'purge', 'checkpoint', 'discard',
];
/** 需要负向预查的动词（函数名与语句名同形） */
const FUNCTION_LOOKALIKE = { replace: true };

/**
 * EXPLAIN 目标只读护栏：
 *   - 允许：SELECT / WITH...SELECT / (SELECT...) / TABLE t / VALUES(...)；
 *   - 拒绝：多语句（骨架顶层分号，允许末尾一个）、写/DDL/管理动词、用户自带 EXPLAIN 前缀。
 * 字符串/注释里的关键字不误杀（先剥骨架）；骨架按词边界匹配动词。
 */
function assertReadOnlySelect(sql) {
  if (typeof sql !== 'string' || !sql.trim()) return { ok: false, reason: 'SQL 为空' };
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (/^\s*explain\b/i.test(trimmed)) {
    return { ok: false, reason: '不要自己带 EXPLAIN 前缀——服务会为语句自动套 EXPLAIN' };
  }
  const { skeleton, err } = sqlSkeleton(trimmed);
  if (err) return { ok: false, reason: err };
  if (!skeleton.trim()) return { ok: false, reason: 'SQL 为空（仅注释）' };
  // 多语句：骨架中出现顶层分号即拒绝（末尾分号已剥）
  if (/;/.test(skeleton)) return { ok: false, reason: '检测到多条语句（一次只分析一条）' };
  const head = skeleton.trim();
  if (!/^(select|with|values|table|\()/i.test(head)) {
    return { ok: false, reason: '只接受 SELECT / WITH / VALUES / TABLE 开头的只读语句' };
  }
  const lower = head.toLowerCase();
  for (const verb of WRITE_VERBS) {
    const re = new RegExp(`\\b${verb}\\b`);
    if (re.test(lower)) {
      return { ok: false, reason: `检测到非只读关键字「${verb.toUpperCase()}」，执行计划台永久只读` };
    }
  }
  for (const verb of Object.keys(FUNCTION_LOOKALIKE)) {
    const re = new RegExp(`\\b${verb}\\b(?=\\s+[^(:]|$)`); // 同名函数（后随括号）放行，语句形态拦截
    if (re.test(lower)) {
      return { ok: false, reason: `检测到非只读关键字「${verb.toUpperCase()}」，执行计划台永久只读` };
    }
  }
  return { ok: true, reason: '' };
}

/** 是否允许 EXPLAIN ANALYZE（真实执行）——在只读通过的前提下全放行（SELECT/WITH 均可） */
function allowAnalyze(sql) {
  const g = assertReadOnlySelect(sql);
  return g;
}

// ── 2a. PG FORMAT=JSON 解析 ────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

/** 信任的 PG 节点字段白名单（进 detail，未知字段丢弃避免泄漏无关内容） */
const PG_DETAIL_KEYS = [
  'Filter', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Join Filter', 'Merge Cond',
  'Sort Key', 'Sort Method', 'Sort Space Used', 'Sort Space Type', 'HashAgg Batches',
  'HashAgg Disk Usage', 'Peak Memory Usage', 'Buffers', 'I/O Timings', 'Output',
  'Workers Planned', 'Workers Launched', 'Heap Fetches', 'Rows Removed by Index Recheck',
  'Rows Removed by Join Filter', 'Subplan Name', 'Parent Relationship', 'CTE Name',
  'Scan Direction', 'Join Type', 'Inner Unique', 'Parallel Aware', 'Async Capable',
  'Cache Key', 'Cache Mode', 'Cache Hits', 'Cache Evictions', 'Disk Usage',
];

function pgNodeFrom(obj, id) {
  const loops = toNum(obj['Actual Loops']) || 1;
  const actRowsPerLoop = toNum(obj['Actual Rows']);
  const hasActual = actRowsPerLoop !== null || obj['Actual Total Time'] !== undefined;
  const actRowsTotal = actRowsPerLoop === null ? null : actRowsPerLoop * loops;
  const detail = {};
  for (const k of PG_DETAIL_KEYS) {
    const v = obj[k];
    if (v === undefined || v === null || v === '') continue;
    detail[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  const flags = [];
  if (obj['Sort Method'] && /external/i.test(String(obj['Sort Method']))) flags.push('排序外排磁盘');
  if (toNum(obj['HashAgg Batches']) > 1) flags.push('聚合外排磁盘');
  return {
    id,
    engine: 'pg',
    nodeType: String(obj['Node Type'] || 'Unknown'),
    relation: obj['Relation Name'] || obj['CTE Name'] || obj['Subplan Name'] || null,
    alias: obj['Alias'] || null,
    indexName: obj['Index Name'] || null,
    estRows: toNum(obj['Plan Rows']),
    estCost: toNum(obj['Total Cost']),
    actRows: actRowsPerLoop,
    actRowsTotal,
    loops,
    actualMs: toNum(obj['Actual Total Time']),
    startupMs: toNum(obj['Actual Startup Time']),
    selfMs: null,
    removedByFilter: toNum(obj['Rows Removed by Filter']),
    neverExecuted: !hasActual,
    flags,
    detail,
    children: [],
  };
}

/** 递归转换 PG Plan 节点 */
function pgConvert(obj, prefix, out) {
  const id = `${prefix}`;
  const node = pgNodeFrom(obj, id);
  out.byId[id] = node;
  const plans = Array.isArray(obj.Plans) ? obj.Plans : [];
  plans.forEach((child, i) => {
    node.children.push(pgConvert(child, `${id}.${i + 1}`, out));
  });
  return node;
}

/**
 * 解析 PG EXPLAIN (FORMAT JSON) 结果。
 * 输入容忍三种形态：rows[0]['Query Plan'] 对象 / {Plan,...} 包装 / 裸计划节点；
 * 或直接是被 JSON.parse 过的数组。
 */
function parsePgExplainJson(raw) {
  let wrapper = raw;
  if (Array.isArray(raw)) wrapper = raw.length ? (raw[0]['Query Plan'] || raw[0]) : null;
  if (!wrapper || typeof wrapper !== 'object') return { ok: false, error: 'PG 计划 JSON 为空或形状不符' };
  let plan = wrapper.Plan ? wrapper.Plan : wrapper;
  if (!plan || typeof plan !== 'object' || !plan['Node Type']) {
    return { ok: false, error: '未找到计划节点（缺少 Node Type）——请确认使用 EXPLAIN (FORMAT JSON)' };
  }
  const out = { byId: {} };
  const root = pgConvert(plan, '1', out);
  computeSelfMs(root);
  return {
    ok: true,
    plan: {
      engine: 'pg',
      statement: null,
      totalCost: toNum(plan['Total Cost']),
      actualMs: toNum(wrapper['Execution Time']),
      planningMs: toNum(wrapper['Planning Time']),
      executionMs: toNum(wrapper['Execution Time']),
      settings: wrapper.Settings ? JSON.stringify(wrapper.Settings) : null,
      triggers: wrapper.Triggers ? wrapper.Triggers.length : 0,
      nodeCount: countNodes(root),
      root,
    },
  };
}

/** 自耗时 = 本节点 actual − Σ子节点 actual（并行子树可能超父，钳 0） */
function computeSelfMs(node) {
  let childSum = 0;
  for (const c of node.children) {
    computeSelfMs(c);
    if (c.actualMs !== null) childSum += c.actualMs;
  }
  node.selfMs = node.actualMs === null ? null : Math.max(0, node.actualMs - childSum);
}

// ── 2b. MySQL FORMAT=JSON 解析 ─────────────────────────────────────────────

/** 信任的 MySQL 表节点字段白名单 */
const MYSQL_TABLE_KEYS = [
  'table_name', 'access_type', 'possible_keys', 'key', 'used_key_parts', 'key_length', 'ref',
  'rows_examined_per_scan', 'rows_produced_per_join', 'filtered', 'using_index',
  'using_temporary_table', 'using_filesort', 'using_join_buffer', 'attached_condition',
  'used_columns', 'index_condition', 'partial_index_key', 'cacheable', 'dependent',
];

const MYSQL_ACCESS_TYPE_LABEL = {
  system: 'System 常量表',
  const: 'Const 单行常量',
  eq_ref: '唯一索引等值 (eq_ref)',
  ref: '索引等值查找 (ref)',
  range: '索引范围扫描 (range)',
  index: '全索引扫描 (index)',
  all: '全表扫描 (ALL)',
  index_merge: '索引合并 (index_merge)',
  fulltext: '全文索引 (fulltext)',
  ref_or_null: '索引查找 (ref_or_null)',
  unique_subquery: '子查询唯一查找',
  index_subquery: '子查询索引查找',
};

function mysqlTableNode(tableObj, id) {
  const access = String(tableObj.access_type || '').toLowerCase();
  const detail = {};
  for (const k of MYSQL_TABLE_KEYS) {
    const v = tableObj[k];
    if (v === undefined || v === null || v === '') continue;
    detail[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  const cost = tableObj.cost_info && typeof tableObj.cost_info === 'object'
    ? {
      read: toNum(tableObj.cost_info.read_cost),
      eval: toNum(tableObj.cost_info.eval_cost),
      prefix: toNum(tableObj.cost_info.prefix_cost),
    }
    : null;
  const flags = [];
  if (tableObj.using_filesort) flags.push('Using filesort（排序未走索引）');
  if (tableObj.using_temporary_table) flags.push('Using temporary（临时表）');
  if (tableObj.using_join_buffer) flags.push(`Join Buffer（${tableObj.using_join_buffer}）`);
  if (tableObj.using_index) flags.push('Using index（覆盖索引）');
  return {
    id,
    engine: 'mysql',
    nodeType: MYSQL_ACCESS_TYPE_LABEL[access] || `访问类型 ${access || '?'}`,
    relation: tableObj.table_name || null,
    alias: null,
    indexName: tableObj.key || null,
    estRows: toNum(tableObj.rows_produced_per_join),
    examinedPerScan: toNum(tableObj.rows_examined_per_scan),
    estCost: cost ? cost.prefix : null,
    costInfo: cost,
    filteredPct: toNum(tableObj.filtered),
    actRows: null, actRowsTotal: null, loops: 1,
    actualMs: null, selfMs: null, startupMs: null,
    removedByFilter: null, neverExecuted: true,
    flags,
    detail,
    children: [],
  };
}

/** MySQL 包装容器 → 虚拟节点类型（filesort/temporary 等标记挂在这里，语义更真） */
const MYSQL_WRAPPER_LABEL = {
  ordering_operation: 'Sort (ORDER BY)',
  grouping_operation: 'Group (GROUP BY)',
  windowing_operation: 'Window Function',
  distinct_operation: 'Distinct',
  duplicating_operation: 'Deduplicate',
  materialized_from_subquery: 'Materialized Subquery',
};

function mysqlVirtualNode(nodeType, id, flags) {
  return {
    id, engine: 'mysql', nodeType, relation: null, alias: null, indexName: null,
    estRows: null, estCost: null, actRows: null, actRowsTotal: null, loops: 1,
    actualMs: null, selfMs: null, startupMs: null, removedByFilter: null, neverExecuted: true,
    flags, detail: {}, children: [],
  };
}

/**
 * 递归走 MySQL JSON 计划容器（5.7/8.0 形状差异宽容），返回该容器产生的节点数组。
 *
 * 语义：
 *   - nested_loop[] / tables[] 是**左深 JOIN 链**（顺序即连接顺序）→ 建成链式树：
 *     第一个表为根，后续表依次为前一个的子节点；
 *   - ordering/grouping/windowing/distinct/materialized_from_subquery 包装容器 →
 *     建虚拟节点（Sort/Group/...）承载容器级 using_filesort / using_temporary_table；
 *   - union_result.query_specifications[] 是 UNION 成员 → 各自独立子树；
 *   - 表节点同级出现的包装容器 → 作为该表的子树。
 */
function mysqlVisitContainer(container, prefix, out) {
  if (!container || typeof container !== 'object') return [];
  if (Array.isArray(container)) {
    return container.flatMap((c, i) => mysqlVisitContainer(c, `${prefix}.${i + 1}`, out));
  }
  // 情形一：表节点
  if (container.table && typeof container.table === 'object' && !Array.isArray(container.table)) {
    const node = mysqlTableNode(container.table, prefix);
    out.byId[prefix] = node;
    const subKeys = ['ordering_operation', 'grouping_operation', 'windowing_operation',
      'distinct_operation', 'duplicating_operation', 'materialized_from_subquery', 'nested_loop', 'tables'];
    for (const key of subKeys) {
      if (container[key] === undefined || container[key] === null) continue;
      const subs = mysqlBuildByKey(key, container[key], `${prefix}.${key.slice(0, 3)}`, out);
      for (const n of subs) node.children.push(n);
    }
    return [node];
  }
  // 情形二：查询块/union 容器
  const collected = [];
  for (const key of ['ordering_operation', 'grouping_operation', 'windowing_operation',
    'distinct_operation', 'duplicating_operation', 'materialized_from_subquery',
    'nested_loop', 'tables']) {
    const v = container[key];
    if (v === undefined || v === null) continue;
    collected.push(...mysqlBuildByKey(key, v, `${prefix}.${key.slice(0, 3)}`, out));
  }
  if (container.union_result) {
    const ur = container.union_result;
    if (ur.table) collected.push(...mysqlVisitContainer({ table: ur.table }, `${prefix}.urt`, out));
    if (Array.isArray(ur.query_specifications)) {
      ur.query_specifications.forEach((qb, i) => {
        collected.push(...mysqlVisitContainer(qb, `${prefix}.us${i + 1}`, out));
      });
    }
  }
  if (container.query_block) {
    collected.push(...mysqlVisitContainer(container.query_block, prefix, out));
  }
  return collected;
}

/** 按容器键构建子树：JOIN 数组建链；包装容器建虚拟节点 */
function mysqlBuildByKey(key, v, prefix, out) {
  if (MYSQL_WRAPPER_LABEL[key]) {
    const inner = mysqlVisitContainer(v, prefix, out);
    if (!inner.length) return [];
    const flags = [];
    if (v.using_filesort) flags.push('Using filesort（排序未走索引）');
    if (v.using_temporary_table) flags.push('Using temporary（临时表）');
    const virtual = mysqlVirtualNode(MYSQL_WRAPPER_LABEL[key], `${prefix}~`, flags);
    virtual.children = inner;
    out.byId[virtual.id] = virtual;
    return [virtual];
  }
  // nested_loop / tables：左深链
  const items = Array.isArray(v) ? v : [v];
  const chain = items.flatMap((c, i) => mysqlVisitContainer(c, `${prefix}.${i + 1}`, out));
  if (chain.length <= 1) return chain;
  let cur = chain[0];
  for (let i = 1; i < chain.length; i += 1) {
    cur.children.push(chain[i]);
    cur = chain[i];
  }
  return [chain[0]];
}

/**
 * 解析 MySQL EXPLAIN FORMAT=JSON。
 * 输入容忍：JSON 字符串（mysql2 返回字符串列）/ 已 parse 的对象。
 */
function parseMysqlExplainJson(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) { return { ok: false, error: 'MySQL 计划 JSON 字符串解析失败' }; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'MySQL 计划形状不符（期望 {query_block: ...}）' };
  }
  if (!obj.query_block) {
    return { ok: false, error: '未找到 query_block——请确认使用 EXPLAIN FORMAT=JSON' };
  }
  const out = { byId: {} };
  const roots = mysqlVisitContainer(obj, '1', out);
  if (!roots.length) return { ok: false, error: '计划为空（未发现任何表节点）' };
  // 单链直接成树；多根（UNION 成员）挂虚拟根
  let root;
  if (roots.length === 1) {
    root = roots[0];
  } else {
    root = {
      id: '1', engine: 'mysql', nodeType: 'UNION 结果', relation: null, alias: null, indexName: null,
      estRows: null, estCost: null, actRows: null, actRowsTotal: null, loops: 1,
      actualMs: null, selfMs: null, startupMs: null, removedByFilter: null, neverExecuted: true,
      flags: [], detail: {}, children: roots,
    };
    out.byId['1'] = root;
  }
  const rootCost = obj.query_block && obj.query_block.cost_info ? toNum(obj.query_block.cost_info.query_cost) : null;
  return {
    ok: true,
    plan: {
      engine: 'mysql',
      statement: null,
      totalCost: rootCost,
      actualMs: null,
      planningMs: null,
      executionMs: null,
      settings: null,
      triggers: 0,
      nodeCount: countNodes(root),
      root,
    },
  };
}

// ── 2c. PG 经典文本 EXPLAIN 解析 ───────────────────────────────────────────

const PG_TEXT_NODE_KEYS = [
  'Output', 'Filter', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Join Filter', 'Merge Cond',
  'Sort Key', 'Sort Method', 'HashAgg Batches', 'Peak Memory Usage', 'Buffers', 'I/O Timings',
  'Workers Planned', 'Workers Launched', 'Heap Fetches', 'Subplan Name', 'CTE Name', 'Disk Usage',
];

/** 节点头：取第一个 `  (cost=` 前的文本（容忍 cost 前多空格） */
function splitPgHeader(lineText) {
  const m = lineText.match(/\(cost=|\(never executed\)/);
  const header = m ? lineText.slice(0, m.index).trim() : lineText.trim();
  return header;
}

function parsePgHeaderParts(header) {
  // 类型 + [using <index>] + on [<schema>.]<relation> [<alias>]
  let nodeType = header;
  let relation = null;
  let alias = null;
  let indexName = null;
  const usingIdx = header.match(/^(.*?)\s+using\s+(\S+)(\s+on\s+(.*))?$/i);
  if (usingIdx) {
    indexName = usingIdx[2];
    nodeType = usingIdx[1];
    if (usingIdx[4]) {
      const relParts = usingIdx[4].trim().split(/\s+/);
      relation = relParts[0].split('.').pop();
      if (relParts[1]) alias = relParts[1];
    }
  } else {
    const onM = header.match(/^(.*?)\s+on\s+(\S+)(?:\s+(\S+))?$/i);
    if (onM) {
      nodeType = onM[1];
      relation = onM[2].split('.').pop();
      alias = onM[3] || null;
      // CTE Scan on xxx / Subquery Scan on xxx：on 后是名字
    } else {
      nodeType = header;
    }
  }
  return { nodeType: nodeType.trim(), relation, alias, indexName };
}

/**
 * 解析 PG 经典文本 EXPLAIN（EXPLAIN / EXPLAIN ANALYZE 输出，含 Buffers 注解行）。
 * 列定位算法：节点行 = 出现 (cost= 的行；深度由节点文本起始列决定，
 * 父 = 栈顶起始列更小的最近节点（pev2 同法）。
 */
function parsePgExplainText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '文本为空' };
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const stack = []; // { col, node }
  const byId = {};
  let seq = 0;
  let planningMs = null;
  let executionMs = null;
  let settings = null;
  let statement = null; // Query 文本行（EXPLAIN 输出首行常有）
  let root = null;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    // 顶层元信息
    const pm = rawLine.match(/^Planning Time:\s*([\d.]+)\s*ms/);
    if (pm) { planningMs = Number(pm[1]); continue; }
    const em = rawLine.match(/^Execution Time:\s*([\d.]+)\s*ms/);
    if (em) { executionMs = Number(em[1]); continue; }
    const sm = rawLine.match(/^Settings:\s*(.+)$/);
    if (sm) { settings = sm[1]; continue; }
    const qm = rawLine.match(/^(?:Query Text|QUERY):\s*(.+)$/i);
    if (qm) { statement = qm[1]; continue; }
    if (/^JIT:/i.test(rawLine.trim())) continue;

    const isNodeLine = /\(cost=/.test(rawLine) || /\(never executed\)/.test(rawLine) ||
      /\(actual time=/.test(rawLine) || /\(rows=\d+ width=\d+\)/.test(rawLine);
    const col = rawLine.length - rawLine.replace(/^[\s>-]*/, '').length; // 起始列（-> 前缀归零）
    const text1 = rawLine.replace(/^(\s|->|-)+/, '').trimEnd();

    if (isNodeLine) {
      seq += 1;
      const id = String(seq);
      const header = splitPgHeader(text1);
      const parts = parsePgHeaderParts(header);
      const node = {
        id,
        engine: 'pg',
        nodeType: parts.nodeType || 'Unknown',
        relation: parts.relation,
        alias: parts.alias,
        indexName: parts.indexName,
        estRows: null, estCost: null,
        actRows: null, actRowsTotal: null, loops: 1,
        actualMs: null, selfMs: null, startupMs: null,
        removedByFilter: null, neverExecuted: false,
        flags: [], detail: {}, children: [],
      };
      // 括号段解析
      const groups = text1.match(/\(([^()]*)\)/g) || [];
      for (const g of groups) {
        const body = g.slice(1, -1);
        if (/^cost=/.test(body)) {
          const c = body.match(/cost=([\d.]+)\.\.([\d.]+)/);
          if (c) node.estCost = Number(c[2]);
          const r = body.match(/rows=(\d+)/);
          if (r) node.estRows = Number(r[1]);
        } else if (/^actual time=/.test(body)) {
          const t = body.match(/time=([\d.]+)\.\.([\d.]+)/);
          if (t) node.actualMs = Number(t[2]);
          const r = body.match(/rows=(\d+)/);
          if (r) { node.actRows = Number(r[1]); node.actRowsTotal = node.actRows; }
          const l = body.match(/loops=(\d+)/);
          if (l) { node.loops = Number(l[1]); node.actRowsTotal = (node.actRows || 0) * node.loops; }
        } else if (body === 'never executed') {
          node.neverExecuted = true;
          node.actRows = 0; node.actRowsTotal = 0; node.actualMs = null;
        }
      }
      byId[id] = node;
      // 定位父：栈顶 col 更小者为父
      while (stack.length && stack[stack.length - 1].col >= col) stack.pop();
      if (stack.length) stack[stack.length - 1].node.children.push(node);
      else if (!root) {
        root = node;
      }
      // （root 已存在且栈空：第二个顶层节点——PG 文本计划单根，此情形视为异常忽略其树关系，仍入栈供注解挂靠）
      stack.push({ col, node });
      continue;
    }

    // 注解行 → 挂到栈顶节点
    const ann = text1.match(/^([A-Z][A-Za-z0-9 ]+?):\s*(.*)$/);
    if (ann && stack.length) {
      const key = ann[1].trim();
      const val = ann[2].trim();
      const top = stack[stack.length - 1].node;
      if (/^Rows Removed by/.test(key)) {
        const rm = val.match(/([\d,]+)/);
        const n = rm ? Number(rm[1].replace(/,/g, '')) : 0;
        if (/Index Recheck/.test(key)) top.detail['Rows Removed by Index Recheck'] = String(n);
        else if (/Join Filter/.test(key)) top.detail['Rows Removed by Join Filter'] = String(n);
        else { top.removedByFilter = n; }
      } else if (PG_TEXT_NODE_KEYS.includes(key)) {
        top.detail[key] = val;
        if (key === 'Sort Method' && /external/i.test(val)) top.flags.push('排序外排磁盘');
        if (key === 'HashAgg Batches' && Number(val) > 1) top.flags.push('聚合外排磁盘');
      }
      continue;
    }
    // 其他未识别行（如 Query 文本、Trigger 说明）忽略
  }

  if (!root) return { ok: false, error: '未解析到任何计划节点（缺 (cost= 行）——请粘贴 EXPLAIN 原始输出' };
  computeSelfMs(root);
  return {
    ok: true,
    plan: {
      engine: 'pg',
      statement,
      totalCost: root.estCost,
      actualMs: executionMs,
      planningMs,
      executionMs,
      settings,
      triggers: 0,
      nodeCount: countNodes(root),
      root,
    },
  };
}

// ── 通用辅助 ───────────────────────────────────────────────────────────────

function countNodes(node) {
  return 1 + node.children.reduce((s, c) => s + countNodes(c), 0);
}

function walkTree(node, fn) {
  fn(node);
  for (const c of node.children) walkTree(c, fn);
}

/** 千/万/百万缩写 */
function rowsFmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// ── 4. 诊断规则引擎 ────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };

/**
 * 分析统一树，产出中文发现列表。
 * 返回 [{id, severity, title, nodeId, nodeLabel, detail, suggestion}]
 */
function analyzePlan(plan) {
  const findings = [];
  const engine = plan.engine;
  const isPg = engine === 'pg';
  let hot = null; // 最耗时叶子节点

  walkTree(plan.root, (node) => {
    const label = nodeLabel(node);
    // ── 全表扫描 ──
    if (isPg && node.nodeType === 'Seq Scan' && !/Index/.test(node.nodeType)) {
      const rows = node.actRowsTotal !== null && node.actRowsTotal > 0 ? node.actRowsTotal : node.estRows;
      if (rows !== null && rows >= 1000) {
        findings.push({
          severity: rows >= 100000 ? 'critical' : 'warn',
          title: `全表扫描：${node.relation || '表'}（约 ${rowsFmt(rows)} 行）`,
          nodeId: node.id, nodeLabel: label,
          detail: node.detail.Filter ? `过滤条件：${node.detail.Filter}` : '顺序读取全部数据页',
          suggestion: '检查 WHERE 条件是否可命中索引；若条件选择性好则补索引，若确实要全表且表很大，考虑分区或覆盖索引。',
        });
      }
    }
    if (!isPg && /\(ALL\)/.test(node.nodeType)) {
      const rows = node.examinedPerScan;
      if (rows !== null && rows >= 1000) {
        findings.push({
          severity: rows >= 100000 ? 'critical' : 'warn',
          title: `全表扫描：${node.relation || '表'}（每扫约 ${rowsFmt(rows)} 行）`,
          nodeId: node.id, nodeLabel: label,
          detail: node.detail.attached_condition ? `条件：${node.detail.attached_condition}` : '无可用索引或优化器放弃索引',
          suggestion: '检查 WHERE/JOIN 条件是否可命中索引；若 possible_keys 有候选但未用，多半是统计信息或类型不匹配（隐式转换/函数包裹列）。',
        });
      }
    }
    // ── 行数误估（PG 实际执行时才有意义） ──
    if (isPg && node.actRowsTotal !== null && node.estRows !== null &&
        (node.actRowsTotal >= 100 || node.estRows >= 100)) {
      const ratio = node.actRowsTotal / Math.max(1, node.estRows);
      if (ratio >= 10 || ratio <= 0.1) {
        findings.push({
          severity: 'warn',
          title: `行数估算偏差 ${(ratio).toFixed(0)}×：${label}（估 ${rowsFmt(node.estRows)} → 实 ${rowsFmt(node.actRowsTotal)}）`,
          nodeId: node.id, nodeLabel: label,
          detail: '优化器按错误行数选择计划，可能连锁导致错误的连接方式',
          suggestion: '对该表执行 ANALYZE 更新统计信息；长期偏差考虑提高采样（ALTER TABLE ... SET STATISTICS）或检查列相关性。',
        });
      }
    }
    // ── 外排落盘（PG） ──
    if (isPg && (node.flags.includes('排序外排磁盘') || node.flags.includes('聚合外排磁盘'))) {
      const disk = node.detail['Sort Space Used'] || node.detail['HashAgg Disk Usage'] || '';
      findings.push({
        severity: 'critical',
        title: `排序/聚合外排磁盘：${label}${disk ? `（${disk}）` : ''}`,
        nodeId: node.id, nodeLabel: label,
        detail: '数据装不进内存，落盘排序是慢查询的常见头号原因',
        suggestion: '适当调大 work_mem（注意每节点每查询都会分配）；或减少该步骤输出行数（提前过滤/索引消除排序）。',
      });
    }
    // ── 大比例过滤丢弃（PG：Rows Removed by Filter / Rows Removed by Join Filter） ──
    const joinFilterRemoved = node.detail['Rows Removed by Join Filter']
      ? Number(String(node.detail['Rows Removed by Join Filter']).replace(/,/g, '')) : 0;
    const removed = Math.max(node.removedByFilter || 0, joinFilterRemoved || 0);
    const isJoinFilter = joinFilterRemoved > (node.removedByFilter || 0);
    if (isPg && removed >= 1000 &&
        node.actRowsTotal !== null && removed / Math.max(1, removed + node.actRowsTotal) > 0.9) {
      findings.push({
        severity: 'warn',
        title: `${isJoinFilter ? '连接条件' : '条件过滤'}丢弃 ${rowsFmt(removed)} 行只留 ${rowsFmt(node.actRowsTotal)}：${label}`,
        nodeId: node.id, nodeLabel: label,
        detail: node.detail.Filter ? `Filter：${node.detail.Filter}`
          : (isJoinFilter ? `Join Filter：${node.detail['Join Filter'] || ''}` : ''),
        suggestion: isJoinFilter
          ? '连接条件在连接阶段才过滤大量行——检查被驱动表连接列是否有索引，或让驱动侧先过滤减量。'
          : '该过滤条件选择性好但没走索引——考虑按这些列建索引，或把条件改成可走索引的形式（避免对列套函数）。',
      });
    }
    // ── MySQL filesort / temporary ──
    if (!isPg && node.flags.includes('Using filesort（排序未走索引）')) {
      findings.push({
        severity: 'warn',
        title: `Using filesort：${node.relation || label}（排序在存储引擎之外完成）`,
        nodeId: node.id, nodeLabel: label,
        detail: 'ORDER BY / GROUP BY 无法利用索引顺序',
        suggestion: '让排序键与索引顺序一致（联合索引最左前缀 + 同序），或减小排序数据集。',
      });
    }
    if (!isPg && node.flags.includes('Using temporary（临时表）')) {
      findings.push({
        severity: 'warn',
        title: `Using temporary：${node.relation || label}（建内部临时表）`,
        nodeId: node.id, nodeLabel: label,
        detail: '常见于 DISTINCT / GROUP BY 与排序键不一致、或 UNION 去重',
        suggestion: '调整索引使 GROUP BY/ORDER BY 同序；MySQL 8 可尝试 /*+ NO_MERGE() */ 或改写查询。',
      });
    }
    if (!isPg && node.flags.some((f) => f.startsWith('Join Buffer')) &&
        (node.estRows === null || node.estRows >= 1000)) {
      findings.push({
        severity: 'info',
        title: `Join Buffer：${node.relation || label}（连接未走索引）`,
        nodeId: node.id, nodeLabel: label,
        detail: node.detail.using_join_buffer || '',
        suggestion: '为被驱动表的连接列补索引，避免 Block Nested Loop / Hash Join 兜底。',
      });
    }
    if (!isPg && node.detail.possible_keys && node.detail.possible_keys !== 'null' &&
        !node.indexName && node.examinedPerScan !== null && node.examinedPerScan >= 100) {
      findings.push({
        severity: 'info',
        title: `有候选索引未使用：${node.relation || label}`,
        nodeId: node.id, nodeLabel: label,
        detail: `possible_keys：${node.detail.possible_keys}`,
        suggestion: '优化器认为全扫更便宜或条件不可索引（隐式类型转换、列上函数、前导通配 LIKE）。核对条件写法与统计信息。',
      });
    }
    // ── 热点节点 ──
    if (isPg && node.selfMs !== null) {
      if (!hot || node.selfMs > hot.selfMs) hot = node;
    }
  });

  if (hot && plan.actualMs !== null && plan.actualMs >= 20 && hot.selfMs / Math.max(0.001, plan.actualMs) >= 0.35) {
    findings.push({
      severity: 'info',
      title: `热点节点（占计划总耗时 ${(100 * hot.selfMs / Math.max(1, plan.actualMs)).toFixed(0)}%）：${nodeLabel(hot)}`,
      nodeId: hot.id, nodeLabel: nodeLabel(hot),
      detail: `自耗时 ${hot.selfMs.toFixed(1)}ms / 总 ${plan.actualMs.toFixed(1)}ms`,
      suggestion: '优化从这里开始：看该节点读的是什么、过滤掉多少、能否换访问路径。',
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return findings.map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

function nodeLabel(node) {
  const bits = [node.nodeType];
  if (node.relation) bits.push(`on ${node.relation}`);
  if (node.indexName) bits.push(`using ${node.indexName}`);
  return bits.join(' ');
}

// ── 5. AI 摘要 ─────────────────────────────────────────────────────────────

/** 生成给 AI 的有界摘要（≤ MAX_AI_SUMMARY_CHARS 字符） */
const MAX_AI_SUMMARY_CHARS = 6000;

function summarizeForAi(plan, findings) {
  const lines = [];
  lines.push(`引擎：${plan.engine === 'pg' ? 'PostgreSQL' : 'MySQL'}`);
  if (plan.statement) lines.push(`SQL：${plan.statement.slice(0, 300)}`);
  lines.push(`总${plan.engine === 'pg' ? '执行' : '估算'}成本：${plan.totalCost ?? '—'}${plan.actualMs !== null ? `；总耗时 ${plan.actualMs}ms` : ''}${plan.executionMs !== null ? `（Execution Time ${plan.executionMs}ms）` : ''}`);
  lines.push('计划树（缩进=层级；格式: 节点 | 估行→实行 | 耗时ms | 成本）：');
  const render = (node, depth) => {
    if (depth > 12 || lines.length > 80) return;
    const est = node.estRows !== null ? rowsFmt(node.estRows) : '—';
    const act = node.actRowsTotal !== null ? rowsFmt(node.actRowsTotal) : '—';
    const ms = node.actualMs !== null ? `${node.actualMs.toFixed(1)}` : '—';
    const cost = node.estCost !== null ? `${node.estCost}` : '—';
    const flags = node.flags.length ? ` [${node.flags.join('; ')}]` : '';
    const rel = node.relation ? ` on ${node.relation}${node.indexName ? ` using ${node.indexName}` : ''}` : '';
    lines.push(`${'  '.repeat(depth)}${node.nodeType}${rel} | 估${est}→实${act} | ${ms}ms | cost=${cost}${flags}`);
    for (const c of node.children) render(c, depth + 1);
  };
  render(plan.root, 0);
  if (lines.length > 80) lines.push(`…（树过深截断，共 ${plan.nodeCount} 节点）`);
  if (findings.length) {
    lines.push('');
    lines.push('诊断发现：');
    for (const f of findings) {
      lines.push(`- [${f.severity === 'critical' ? '严重' : f.severity === 'warn' ? '警告' : '提示'}] ${f.title} → ${f.suggestion}`);
    }
  }
  let text = lines.join('\n');
  if (text.length > MAX_AI_SUMMARY_CHARS) text = `${text.slice(0, MAX_AI_SUMMARY_CHARS)}\n…（已截断）`;
  return text;
}

/** SQL 摘要（历史列表用，单行化截断） */
function sqlSnippet(sql) {
  const one = String(sql || '').replace(/\s+/g, ' ').trim();
  return one.length > MAX_SQL_SNIPPET ? `${one.slice(0, MAX_SQL_SNIPPET)}…` : one;
}

module.exports = {
  MAX_RAW_PLAN_BYTES,
  HISTORY_LIMIT,
  sqlSkeleton,
  assertReadOnlySelect,
  allowAnalyze,
  parsePgExplainJson,
  parseMysqlExplainJson,
  parsePgExplainText,
  analyzePlan,
  summarizeForAi,
  sqlSnippet,
  rowsFmt,
  nodeLabel,
};
