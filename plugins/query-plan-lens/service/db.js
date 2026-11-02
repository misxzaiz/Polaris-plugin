'use strict';
/**
 * db.js —— 数据库驱动封装（mysql2/pg 经 vendor/vendor.cjs 单文件提供）
 *
 * 只做一件事：安全地跑 EXPLAIN 并返回原始结果。
 *   - PG：EXPLAIN (FORMAT JSON, VERBOSE[, ANALYZE])；session 级 statement_timeout 兜底；
 *   - MySQL：EXPLAIN FORMAT=JSON；max_execution_time（仅 SELECT 生效）best-effort 兜底；
 *   - 连接错误统一映射成中文可读信息（拒绝/超时/认证/库不存在）。
 * 每次调用独立短连接（EXPLAIN 是低频分析操作，不值得养池），用毕即关。
 */
const path = require('path');
const vendor = require('./vendor/vendor.cjs');

const CONNECT_TIMEOUT_MS = 8000;
const STATEMENT_TIMEOUT_MS = 45000;

/** 把底层驱动错误翻译成用户可读中文 */
function friendlyError(err, conn) {
  const code = err && err.code;
  const msg = err && err.message ? String(err.message) : String(err);
  const target = `${conn.host}:${conn.port}`;
  if (code === 'ECONNREFUSED') return `连不上 ${target}：目标端口没有监听（服务未启动/地址写错）`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `主机名解析失败：${conn.host}`;
  if (code === 'ETIMEDOUT') return `连接超时：${target}（网络不通或防火墙拦截）`;
  if (code === 'ER_ACCESS_DENIED_ERROR' || code === '28P01') return `认证失败：用户名或密码错误（${target}）`;
  if (code === 'ER_BAD_DB_ERROR' || code === '3D000') return `数据库不存在：${conn.database}`;
  if (code === 'ECONNRESET') return `连接被重置：${target}（检查 TLS/网络）`;
  if (/syntax error/i.test(msg)) return `SQL 语法错误：${msg}`;
  return msg;
}

/** EXPLAIN 包装语句 */
function wrapExplain(engine, sql, analyze) {
  if (engine === 'pg') {
    return `EXPLAIN (FORMAT JSON, VERBOSE${analyze ? ', ANALYZE' : ''}) ${sql}`;
  }
  return `EXPLAIN FORMAT=JSON ${sql}`;
}

/** 连接并执行 EXPLAIN，返回 { rows, serverVersion }；异常统一抛 Error(message) */
async function runExplain(conn, sql, analyze) {
  if (conn.engine === 'pg') return runPg(conn, sql, analyze);
  return runMysql(conn, sql);
}

async function runPg(conn, sql, analyze) {
  const client = new vendor.pg.Client({
    host: conn.host,
    port: Number(conn.port) || 5432,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: 0, // 连接级不设，用 session SET 控制精确值
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await client.connect();
    // statement_timeout 只作用于本会话；ANALYZE（真实执行）放宽，纯 EXPLAIN 收紧
    const timeoutMs = analyze ? 120000 : STATEMENT_TIMEOUT_MS;
    await client.query(`SET statement_timeout = ${Number(timeoutMs)}`);
    const ver = await client.query('SHOW server_version');
    const serverVersion = ver.rows && ver.rows[0] ? String(ver.rows[0].server_version) : '';
    const res = await client.query(wrapExplain('pg', sql, analyze));
    return { rows: res.rows, serverVersion };
  } catch (err) {
    throw new Error(friendlyError(err, conn));
  } finally {
    try { await client.end(); } catch (_) { /* 连接已断则忽略 */ }
  }
}

async function runMysql(conn, sql) {
  const pool = vendor.mysql2.createPool({
    host: conn.host,
    port: Number(conn.port) || 3306,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    connectTimeout: CONNECT_TIMEOUT_MS,
    connectionLimit: 1,
    enableKeepAlive: false,
    timezone: 'Z',
  });
  try {
    try { await pool.query('SET SESSION max_execution_time = 45000'); } catch (_) { /* 5.6 及以下无此变量 */ }
    const [verRows] = await pool.query('SELECT VERSION() AS v');
    const serverVersion = verRows && verRows[0] ? String(verRows[0].v) : '';
    const [rows] = await pool.query(wrapExplain('mysql', sql, false));
    return { rows, serverVersion };
  } catch (err) {
    throw new Error(friendlyError(err, conn));
  } finally {
    try { await pool.end(); } catch (_) { /* 忽略 */ }
  }
}

/** 从驱动返回中提取计划对象/字符串（宽容两种驱动行为） */
function extractPlanPayload(engine, rows) {
  if (!rows || !rows.length) return null;
  const first = rows[0];
  const keys = Object.keys(first);
  if (!keys.length) return null;
  const val = first[keys[0]];
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (_) { return val; } // 字符串原样返回由上层判型
  }
  return val;
}

module.exports = { runExplain, extractPlanPayload, friendlyError, wrapExplain };
