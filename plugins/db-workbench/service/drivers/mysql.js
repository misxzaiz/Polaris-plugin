'use strict';
/**
 * mysql.js —— MySQL 驱动适配层（mysql2/promise，经 vendor 单文件加载）
 *
 * 职责：连接测试 / 连接池 / 查询执行（列序保真）/ schema 元数据。
 * 元数据查询全部由本层构造（标识符反引号双写转义），不经用户 SQL 护栏路径；
 * 用户 SQL 一律经 shared/core.checkSql 后才到达 query()。
 */

const VENDOR_PATH = '../vendor/vendor.cjs';

function loadMysql2() {
  try {
    return require(VENDOR_PATH).mysql2;
  } catch (_) {
    // 开发态回退：仓库内 node_modules 直接可用（打包后只带 vendor.cjs）
    return require('mysql2/promise');
  }
}

/** 标识符转义：反引号双写（MySQL 标识符内含反引号的唯一正确写法） */
function quoteIdent(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

function connOpts(profile, password) {
  return {
    host: profile.host,
    port: profile.port,
    user: profile.username,
    password: password || '',
    database: profile.database || undefined,
    connectTimeout: 8000,
    connectionLimit: 4,
    maxIdle: 2,
    idleTimeout: 60000,
    // 统一字符串化：DATE/DATETIME/TIMESTAMP 免时区漂移；DECIMAL/BIGINT 免精度漂移
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    enableKeepAlive: false,
    timezone: 'Z',
  };
}

async function testConn(profile, password) {
  const mysql2 = loadMysql2();
  const conn = await mysql2.createConnection(connOpts(profile, password));
  try {
    const [[v]] = await conn.query('SELECT VERSION() AS v');
    return { ok: true, serverVersion: String(v.v || '') };
  } finally {
    await conn.end().catch(() => {});
  }
}

function createPool(profile, password) {
  return loadMysql2().createPool(connOpts(profile, password));
}

/**
 * 执行查询。返回 { columns, rows, rowCount, truncated }。
 * 调用方已完成护栏校验与 LIMIT 注入；本层再加行数硬闸（防御 SHOW 等无 LIMIT 语句）。
 */
async function query(pool, sql, opts) {
  const maxRows = (opts && opts.maxRows) || 1000;
  const timeoutMs = (opts && opts.timeoutMs) || 15000;
  const [rows, fields] = await pool.query({ sql, timeout: timeoutMs });
  const list = Array.isArray(rows) ? rows : [rows];
  const columns = (fields || []).map((f) => f.name);
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
  // 注意：information_schema.schemata 的列是 schema_name（tables 才是 table_schema）
  const [rows] = await pool.query(
    "SELECT schema_name AS name FROM information_schema.schemata " +
    "WHERE schema_name NOT IN ('information_schema','mysql','performance_schema','sys') ORDER BY schema_name",
  );
  return rows.map((r) => String(r.name));
}

async function listTables(pool, schema) {
  const [rows] = await pool.query(
    'SELECT table_name AS name, table_type AS type, table_rows AS est_rows, ' +
    '(data_length + index_length) AS bytes, table_comment AS comment ' +
    'FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
    [schema],
  );
  return rows.map((r) => ({
    name: String(r.name),
    type: r.type === 'VIEW' ? 'VIEW' : 'TABLE',
    estRows: r.est_rows == null ? null : Number(r.est_rows),
    bytes: r.bytes == null ? null : Number(r.bytes),
    comment: r.comment ? String(r.comment) : '',
  }));
}

async function describeTable(pool, schema, table) {
  // 列键以服务器 metadata 大小写为准（大写），必须显式别名到稳定小写键
  const [cols] = await pool.query(
    'SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_default AS dflt, column_key AS k, extra AS extra, column_comment AS comment ' +
    'FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
    [schema, table],
  );
  const [idx] = await pool.query(
    'SELECT index_name AS idx_name, non_unique AS non_unique, seq_in_index AS seq, column_name AS col ' +
    'FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? ORDER BY index_name, seq_in_index',
    [schema, table],
  );
  let ddl = '';
  try {
    const [c] = await pool.query('SHOW CREATE TABLE ' + quoteIdent(schema) + '.' + quoteIdent(table));
    if (Array.isArray(c) && c[0]) ddl = String(c[0]['Create Table'] || c[0]['Create View'] || '');
  } catch (e) {
    ddl = '';
  }
  const indexMap = new Map();
  for (const r of idx) {
    if (!indexMap.has(r.idx_name)) {
      indexMap.set(r.idx_name, { name: r.idx_name, unique: Number(r.non_unique) === 0, columns: [] });
    }
    indexMap.get(r.idx_name).columns.push(r.col);
  }
  return {
    columns: cols.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable === 'YES',
      defaultValue: c.dflt == null ? null : String(c.dflt),
      key: c.k || '',
      extra: c.extra || '',
      comment: c.comment || '',
    })),
    indexes: Array.from(indexMap.values()),
    ddl,
  };
}

/** 表数据预览（面板结构页点击表） */
async function previewTable(pool, schema, table, limit) {
  const lim = Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50;
  return query(pool, 'SELECT * FROM ' + quoteIdent(schema) + '.' + quoteIdent(table) + ' LIMIT ' + (lim + 1), { maxRows: lim });
}

async function closePool(pool) {
  await pool.end().catch(() => {});
}

module.exports = { testConn, createPool, query, listSchemas, listTables, describeTable, previewTable, closePool, quoteIdent };
