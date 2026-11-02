'use strict';
/**
 * pg.js —— PostgreSQL 驱动适配层（pg 包，经 vendor 单文件加载）
 *
 * 与 mysql.js 同一接口形状；元数据走 pg_catalog（信息同 information_schema，
 * 但 reltuples/pg_total_relation_size 只有 catalog 给得准）。
 * 用户 SQL 一律经 shared/core.checkSql 后才到达 query()。
 */

function loadPg() {
  try {
    return require('../vendor/vendor.cjs').pg;
  } catch (_) {
    return require('pg');
  }
}

/** 标识符转义：双引号双写 */
function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function poolOpts(profile, password) {
  return {
    host: profile.host,
    port: profile.port,
    user: profile.username,
    password: password || '',
    database: profile.database,
    connectionTimeoutMillis: 8000,
    max: 4,
    idleTimeoutMillis: 60000,
    // 查询超时（服务端取消），防全表扫挂死连接池
    statement_timeout: 15000,
    query_timeout: 15000,
    ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
  };
}

async function testConn(profile, password) {
  const { Client } = loadPg();
  const client = new Client(poolOpts(profile, password));
  await client.connect();
  try {
    const r = await client.query('SELECT version() AS v');
    return { ok: true, serverVersion: String(r.rows[0].v || '').split(' ').slice(0, 2).join(' ') };
  } finally {
    await client.end().catch(() => {});
  }
}

function createPool(profile, password) {
  return new (loadPg()).Pool(poolOpts(profile, password));
}

/**
 * 执行查询。pg 的 fields 保序；对象行键序与 fields 一致（V8 对象键序=插入序，可靠）。
 * pool.query() 对多语句（simple protocol）会逐条返回——护栏已拒绝多语句，这里防御性只取首个结果。
 */
async function query(pool, sql, opts) {
  const maxRows = (opts && opts.maxRows) || 1000;
  const res = await pool.query(sql);
  const fields = (res.fields || []).map((f) => f.name);
  const list = Array.isArray(res.rows) ? res.rows : [];
  const columns = fields.length
    ? fields
    : (list[0] ? Object.keys(list[0]) : []);
  const truncated = list.length > maxRows;
  return {
    columns,
    rows: truncated ? list.slice(0, maxRows) : list,
    rowCount: truncated ? maxRows : list.length,
    truncated,
    totalMatched: list.length,
  };
}

async function listSchemas(pool) {
  const r = await pool.query(
    "SELECT nspname AS name FROM pg_namespace " +
    "WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY nspname",
  );
  return r.rows.map((x) => String(x.name));
}

async function listTables(pool, schema) {
  const r = await pool.query(
    "SELECT c.relname AS name, " +
    "CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED TABLE' WHEN 'v' THEN 'VIEW' " +
    "WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE c.relkind::text END AS type, " +
    "c.reltuples::bigint AS est_rows, " +
    "pg_total_relation_size(c.oid) AS bytes, " +
    "obj_description(c.oid) AS comment " +
    "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
    "WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname",
    [schema],
  );
  return r.rows.map((x) => ({
    name: String(x.name),
    type: x.type,
    estRows: x.est_rows == null ? null : Number(x.est_rows),
    bytes: x.bytes == null ? null : Number(x.bytes),
    comment: x.comment ? String(x.comment) : '',
  }));
}

async function describeTable(pool, schema, table) {
  const cols = await pool.query(
    "SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision " +
    "FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    [schema, table],
  );
  const idx = await pool.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname",
    [schema, table],
  );
  let ddl = '';
  const view = await pool.query(
    "SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2",
    [schema, table],
  );
  if (view.rows[0] && (view.rows[0].relkind === 'v' || view.rows[0].relkind === 'm')) {
    const vd = await pool.query('SELECT pg_get_viewdef(' + quoteIdent(schema) + '.' + quoteIdent(table) + ', true) AS def');
    ddl = `CREATE VIEW AS\n${vd.rows[0] ? vd.rows[0].def : ''}`;
  }
  return {
    columns: cols.rows.map((c) => ({
      name: c.column_name,
      type: c.character_maximum_length
        ? `${c.data_type}(${c.character_maximum_length})`
        : c.data_type,
      nullable: c.is_nullable === 'YES',
      defaultValue: c.column_default == null ? null : String(c.column_default),
      key: '',
      extra: c.udt_name && c.udt_name !== c.data_type ? c.udt_name : '',
      comment: '',
    })),
    indexes: idx.rows.map((r) => {
      const def = String(r.indexdef || '');
      return { name: r.indexname, unique: /CREATE UNIQUE/.test(def), columns: [], ddl: def };
    }),
    ddl,
  };
}

async function previewTable(pool, schema, table, limit) {
  const lim = Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50;
  return query(pool, 'SELECT * FROM ' + quoteIdent(schema) + '.' + quoteIdent(table) + ' LIMIT ' + (lim + 1), { maxRows: lim });
}

async function closePool(pool) {
  await pool.end().catch(() => {});
}

module.exports = { testConn, createPool, query, listSchemas, listTables, describeTable, previewTable, closePool, quoteIdent };
