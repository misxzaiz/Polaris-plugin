#!/usr/bin/env node
/**
 * SQL Craft MCP Server
 * 工具：build_sql / format_sql / validate_sql
 * 纯 MCP，无 Panel/ChatCard。
 */
'use strict'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function buildSql(intent, type) {
  const i = String(intent || '').toLowerCase()
  if (type === 'insert' || i.includes('插入') || i.includes('insert')) {
    return { sql: `INSERT INTO table_name (col1, col2)\nVALUES (val1, val2);`, desc: 'INSERT 骨架' }
  }
  if (type === 'update' || i.includes('更新') || i.includes('update')) {
    return { sql: `UPDATE table_name\nSET col1 = val1\nWHERE condition;`, desc: 'UPDATE 骨架' }
  }
  if (type === 'delete' || i.includes('删除') || i.includes('delete')) {
    return { sql: `DELETE FROM table_name\nWHERE condition;`, desc: 'DELETE 骨架' }
  }
  if (i.includes('join') || i.includes('连接')) {
    return { sql: `SELECT a.col, b.col\nFROM table_a a\nJOIN table_b b ON a.id = b.aid\nWHERE condition;`, desc: 'JOIN 骨架' }
  }
  if (i.includes('group') || i.includes('分组')) {
    return { sql: `SELECT col, COUNT(*)\nFROM table_name\nGROUP BY col\nHAVING COUNT(*) > 1;`, desc: 'GROUP BY 骨架' }
  }
  // 默认 SELECT
  return { sql: `SELECT col1, col2\nFROM table_name\nWHERE condition\nORDER BY col1 DESC\nLIMIT 10;`, desc: 'SELECT 骨架' }
}

const KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'AND', 'OR', 'NOT', 'NULL', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'AS']
const NEWLINE_BEFORE = new Set(['FROM', 'WHERE', 'VALUES', 'SET', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'AND', 'OR'])

function formatSql(sql) {
  let s = String(sql || '').replace(/\s+/g, ' ').trim()
  if (!s.endsWith(';')) s += ';'
  // 关键字大写
  for (const kw of KEYWORDS) {
    s = s.replace(new RegExp(`\\b${kw}\\b`, 'gi'), kw)
  }
  // 在特定关键字前换行
  for (const kw of NEWLINE_BEFORE) {
    s = s.replace(new RegExp(`\\s+${kw}\\b`, 'g'), `\n${kw}`)
  }
  // 缩进子查询（简化：AND/OR 缩进）
  s = s.replace(/\nAND/g, '\n  AND').replace(/\nOR/g, '\n  OR')
  return s
}

function validateSql(sql) {
  const errors = [], warnings = []
  const s = String(sql || '').trim()
  if (!s) return { valid: false, errors: ['空内容'] }
  const upper = s.toUpperCase()
  const hasKeyword = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].some(k => upper.includes(k))
  if (!hasKeyword) errors.push('未识别 SQL 类型（缺少 SELECT/INSERT/UPDATE/DELETE）')
  // 括号配对
  const stack = []
  const pairs = { ')': '(', ']': '[' }
  for (const ch of s) {
    if (ch === '(' || ch === '[') stack.push(ch)
    else if (pairs[ch]) { if (stack.pop() !== pairs[ch]) { errors.push(`括号不配对: 多余 "${ch}"`); break } }
  }
  if (stack.length) errors.push(`括号不配对: 未闭合 "${stack.pop()}"`)
  // SELECT 无 FROM
  if (upper.includes('SELECT') && !upper.includes('FROM')) warnings.push('SELECT 缺少 FROM')
  // DELETE/UPDATE 无 WHERE
  if ((upper.includes('DELETE') || upper.includes('UPDATE')) && !upper.includes('WHERE')) warnings.push('DELETE/UPDATE 缺少 WHERE，可能影响全表')
  return { valid: errors.length === 0, errors, warnings }
}

const tools = [
  { name: 'build_sql', description: '根据意图生成 SQL 骨架。type: select|insert|update|delete（可选）。', inputSchema: { type: 'object', properties: { intent: { type: 'string', description: '意图描述（如"查询用户表""join 两表"）' }, type: { type: 'string' } } }, required: ['intent'] },
  { name: 'format_sql', description: '格式化 SQL（关键字大写、换行缩进）。', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
  { name: 'validate_sql', description: '基本语法校验（关键字/括号配对/WHERE 提示）。', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } }
]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
    handle(msg).catch(err => send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: String(err && err.message || err) } }))
  }
})

async function handle(msg) {
  const { method, id, params } = msg
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'sql-craft', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'build_sql') {
      const r = buildSql(args.intent, args.type)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `${r.desc}：\n\n${formatSql(r.sql)}` }], _meta: r } })
    }
    if (name === 'format_sql') {
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: formatSql(args.sql) }], _meta: { formatted: formatSql(args.sql) } } })
    }
    if (name === 'validate_sql') {
      const v = validateSql(args.sql)
      const text = v.valid ? `✓ 校验通过${v.warnings.length ? '（' + v.warnings.length + ' 提示）' : ''}${v.warnings.length ? '\n\n' + v.warnings.map(w => '⚠ ' + w).join('\n') : ''}` : `✗ 未通过：\n\n` + v.errors.map(e => '✗ ' + e).join('\n') + (v.warnings.length ? '\n\n' + v.warnings.map(w => '⚠ ' + w).join('\n') : '')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: v } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
