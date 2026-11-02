// 真实数据库集成 smoke：三协议真连通（需要本机已启动测试库）
//   Redis   127.0.0.1:16379（无密码）
//   MySQL   127.0.0.1:13306（root 空密码 + dev/dev123456，库 appdb）
//   PG      127.0.0.1:15432（postgres，trust，库 postgres）
// 同时起「假宿主 + 真 service」，验证 service 层与 MCP 层对真库的全链路。
// 运行：node test/smoke-real.mjs
import { createRequire } from 'module'
import { spawn } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import http from 'http'
import crypto from 'crypto'

const require = createRequire(import.meta.url)
const path = require('path')
const pluginDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:')), '..')

let pass = 0
let fail = 0
const failures = []
function t(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`) } else { fail += 1; failures.push(`${name} → ${detail}`); console.log(`  ✗ ${name} → ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const vendor = require('../service/vendor/vendor.cjs')
const redisDrv = require('../service/drivers/redis.js')

console.log('── 驱动层直连 ──')

// ── Redis 驱动 ───────────────────────────────────────────────────────────────
{
  const conn = new redisDrv.RedisConn({ host: '127.0.0.1', port: 16379 })
  try {
    const pong = await conn.exec(['PING'], 5000)
    t('redis PING → PONG', pong === 'PONG', JSON.stringify(pong))
    await conn.exec(['FLUSHDB'], 3000).catch(() => {}) // 测试专用实例，直接清
    await conn.exec(['SET', 'dbw:测试键', '值1'], 3000)
    const g = await conn.exec(['GET', 'dbw:测试键'], 3000)
    t('redis SET/GET 中文 roundtrip', g === '值1', JSON.stringify(g))
    await conn.exec(['HSET', 'dbw:h', 'a', '1', 'b', '2'], 3000)
    const h = await conn.exec(['HGETALL', 'dbw:h'], 3000)
    t('redis HGETALL 数组形状', Array.isArray(h) && h.length === 4 && h[0] === 'a' && h[3] === '2', JSON.stringify(h))
    await conn.exec(['ZADD', 'dbw:z', '1.5', 'one', '2.5', 'two'], 3000)
    const z = await conn.exec(['ZRANGE', 'dbw:z', '0', '-1', 'WITHSCORES'], 3000)
    t('redis ZRANGE WITHSCORES', z[0] === 'one' && z[1] === '1.5', JSON.stringify(z))
    const scan = await conn.exec(['SCAN', '0', 'MATCH', 'dbw:*', 'COUNT', '100'], 3000)
    t('redis SCAN 游标形状', Array.isArray(scan) && Array.isArray(scan[1]) && scan[1].length >= 3, JSON.stringify(scan))
    const err = await conn.exec(['GETIT', 'x'], 3000).catch((e) => e)
    t('redis 错误命令回包 → Error', err instanceof Error && /unknown/i.test(err.message), String(err))
    // 整数回包与 nil
    await conn.exec(['DEL', 'dbw:none'], 3000)
    const n = await conn.exec(['GET', 'dbw:none'], 3000)
    t('redis GET 不存在 → nil', n === null, JSON.stringify(n))
  } finally {
    conn.close()
  }
}

// ── MySQL 驱动（vendor mysql2；root 空密码 caching_sha2 路径） ────────────────
let mysqlPool = null
{
  const mysql2 = vendor.mysql2
  try {
    const conn = await mysql2.createConnection({ host: '127.0.0.1', port: 13306, user: 'root', password: '', connectTimeout: 8000, dateStrings: true })
    const [[v]] = await conn.query('SELECT VERSION() AS v')
    t('mysql root 空密码 + caching_sha2 连接', String(v.v).startsWith('8.0.'), String(v.v))
    const [rows, fields] = await conn.query('SELECT * FROM appdb.users ORDER BY id')
    t('mysql 中文/DECIMAL/DATETIME 字符串化', rows[0].name === '张三' && rows[0].amount === '120.50' && typeof rows[0].created === 'string', JSON.stringify(rows[0]))
    t('mysql fields 保序', fields.map((f) => f.name).join(',') === 'id,name,amount,created', fields.map((f) => f.name).join(','))
    // 带密码用户（caching_sha2 完整认证路径）
    const conn2 = await mysql2.createConnection({ host: '127.0.0.1', port: 13306, user: 'dev', password: 'dev123456', connectTimeout: 8000 })
    const [[dv]] = await conn2.query('SELECT CURRENT_USER() AS u')
    t('mysql dev 带密码用户连接', String(dv.u).startsWith('dev@'), String(dv.u))
    await conn2.end()
    await conn.end()
    mysqlPool = mysql2.createPool({ host: '127.0.0.1', port: 13306, user: 'dev', password: 'dev123456', database: 'appdb', connectionLimit: 3, dateStrings: true })
  } catch (e) {
    t('mysql 连接', false, e.message)
  }
}

// ── PG 驱动（vendor pg） ─────────────────────────────────────────────────────
let pgPool = null
{
  const { Pool } = vendor.pg
  try {
    pgPool = new Pool({ host: '127.0.0.1', port: 15432, user: 'postgres', password: '', database: 'postgres', max: 3, connectionTimeoutMillis: 8000 })
    const r = await pgPool.query('SELECT version() AS v')
    t('pg 连接', String(r.rows[0].v).includes('PostgreSQL 16'), String(r.rows[0].v).slice(0, 40))
    const o = await pgPool.query('SELECT item, qty, price FROM orders ORDER BY id LIMIT 2')
    t('pg 查询行', o.rows.length === 2 && o.rows[0].item === 'item1' && String(o.rows[0].price) === '1.50', JSON.stringify(o.rows[0]))
  } catch (e) {
    t('pg 连接', false, e.message)
  }
}

console.log('── 驱动适配层（metadata/护栏） ──')
const mysqlDrv = require('../service/drivers/mysql.js')
const pgDrv = require('../service/drivers/pg.js')
{
  if (mysqlPool) {
    const sch = await mysqlDrv.listSchemas(mysqlPool)
    t('mysql listSchemas 含 appdb', sch.includes('appdb'), JSON.stringify(sch))
    const tabs = await mysqlDrv.listTables(mysqlPool, 'appdb')
    t('mysql listTables users', tabs.some((x) => x.name === 'users' && x.type === 'TABLE'), JSON.stringify(tabs))
    const d = await mysqlDrv.describeTable(mysqlPool, 'appdb', 'users')
    t('mysql describe 列/索引', d.columns.length === 4 && /varchar/i.test(d.columns[1].type), JSON.stringify(d.columns.map((c) => c.type)))
    t('mysql describe 含 DDL', /CREATE TABLE/.test(d.ddl), d.ddl.slice(0, 60))
    const pv = await mysqlDrv.previewTable(mysqlPool, 'appdb', 'users', 2)
    t('mysql preview 行数截断', pv.rowCount === 2 && pv.truncated === true, `rows=${pv.rowCount} trunc=${pv.truncated}`)
  }
  if (pgPool) {
    const sch = await pgDrv.listSchemas(pgPool)
    t('pg listSchemas 含 public', sch.includes('public'), JSON.stringify(sch))
    const tabs = await pgDrv.listTables(pgPool, 'public')
    t('pg listTables orders（估算行数）', tabs.some((x) => x.name === 'orders'), JSON.stringify(tabs.map((x) => x.name)))
    const d = await pgDrv.describeTable(pgPool, 'public', 'orders')
    t('pg describe 列含 serial 类型', d.columns.some((c) => /integer|bigint/.test(c.type)), JSON.stringify(d.columns.map((c) => c.type)))
    t('pg describe 索引含主键', d.indexes.some((i) => i.unique), JSON.stringify(d.indexes.map((i) => i.name)))
    const pv = await pgDrv.previewTable(pgPool, 'public', 'orders', 3)
    t('pg preview', pv.rowCount === 3 && pv.truncated === true, `rows=${pv.rowCount}`)
  }
}

console.log('── service + MCP 全链路（真库） ──')
const HOST_TOKEN = 'smoke-token'
const HOST_MD5 = crypto.createHash('md5').update(HOST_TOKEN).digest('hex')
const kvStore = new Map()
const fakeHost = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/health') { res.writeHead(200); res.end('ok'); return }
    const { target, payload } = JSON.parse(body).req
    let out
    if (payload.action === 'get') out = { ok: true, result: { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null } }
    else if (payload.action === 'set') { kvStore.set(payload.key, payload.value); out = { ok: true, result: { ok: true } } }
    else if (payload.action === 'delete') { kvStore.delete(payload.key); out = { ok: true, result: { ok: true } } }
    else out = { ok: false, error: '?' }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(out))
  })
})
await new Promise((r) => fakeHost.listen(0, '127.0.0.1', r))
const appCfg = mkdtempSync(join(tmpdir(), 'dbw-smoke-'))
const SVC_PORT = 19600 + Math.floor(Math.random() * 200)
const svc = spawn(process.execPath, [join(pluginDir, 'service', 'main.js'), String(SVC_PORT), appCfg], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(fakeHost.address().port), POLARIS_TOKEN: HOST_TOKEN },
})
let TOKEN = ''
for (let i = 0; i < 30 && !TOKEN; i++) {
  const info = kvStore.get('dbl.service')
  if (info && info.token) TOKEN = info.token
  else await sleep(300)
}
t('service 起动并发布发现信息', !!TOKEN, 'no dbl.service')

async function svcHttp(method, p, body) {
  const headers = { Authorization: `Bearer ${TOKEN}` }
  let payload
  if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json' }
  const r = await fetch(`http://127.0.0.1:${SVC_PORT}${p}`, { method, headers, body: payload })
  return { status: r.status, json: await r.json().catch(() => null) }
}

// 建 profile（记住密码 → credentials 本地文件路径）
const pm = await svcHttp('POST', '/api/profiles', { profile: { type: 'mysql', name: '本地MySQL', host: '127.0.0.1', port: 13306, username: 'dev', database: 'appdb', rememberPass: true }, password: 'dev123456' })
const mp = pm.json.profile
t('mysql profile 创建', mp && mp.hasStoredPass === true, JSON.stringify(pm.json))
const pp = await svcHttp('POST', '/api/profiles', { profile: { type: 'postgres', name: '本地PG', host: '127.0.0.1', port: 15432, username: 'postgres', database: 'postgres', rememberPass: true }, password: '' })
const pgp = pp.json.profile
const pr = await svcHttp('POST', '/api/profiles', { profile: { type: 'redis', name: '本地Redis', host: '127.0.0.1', port: 16379, rememberPass: true }, password: '' })
const rp = pr.json.profile

// SQL 查询（面板通道）
{
  const r = await svcHttp('POST', '/api/query', { profileId: mp.id, sql: 'SELECT * FROM users ORDER BY id' })
  t('面板通道 mysql 查询真数据', r.json.ok && r.json.rows[0].name === '张三' && r.json.columns.join(',') === 'id,name,amount,created', JSON.stringify(r.json).slice(0, 200))
  const r2 = await svcHttp('POST', '/api/query', { profileId: mp.id, sql: 'DELETE FROM users' })
  t('只读连接 DELETE 被拒', r2.status === 422 && /只读/.test(r2.json.error), JSON.stringify(r2.json))
  const r3 = await svcHttp('POST', '/api/query', { profileId: mp.id, sql: 'SHOW TABLES' })
  t('SHOW TABLES 放行', r3.json.ok && r3.json.rows.length >= 1, JSON.stringify(r3.json).slice(0, 120))
  const r4 = await svcHttp('POST', '/api/query', { profileId: pgp.id, sql: 'SELECT count(*) AS n FROM orders' })
  t('面板通道 pg 查询', r4.json.ok && r4.json.rows[0].n === '5', JSON.stringify(r4.json).slice(0, 160))
  // 写模式：改数据再改回（真实写路径）
  const r5 = await svcHttp('POST', '/api/query', { profileId: pgp.id, sql: 'UPDATE orders SET qty = qty + 1 WHERE id = 1' })
  t('只读 profile 拒绝 UPDATE（即使面板想写）', r5.status === 422, JSON.stringify(r5.json))
}
// Redis（面板通道 allowWrite 开启后可写）
{
  const g1 = await svcHttp('POST', '/api/redis', { profileId: rp.id, command: 'GET', args: ['k1'] })
  t('redis GET（nil）', g1.json.ok && g1.json.reply === null, JSON.stringify(g1.json))
  // 开 allowWrite
  await svcHttp('POST', '/api/profiles', { profile: { ...rp, allowWrite: true } })
  const s1 = await svcHttp('POST', '/api/redis', { profileId: rp.id, command: 'SET', args: ['k1', 'v1'] })
  t('redis SET（allowWrite 后放行）', s1.json.ok && s1.json.reply === 'OK', JSON.stringify(s1.json))
  const g2 = await svcHttp('POST', '/api/redis', { profileId: rp.id, command: 'GET', args: ['k1'] })
  t('redis GET 回读', g2.json.ok && g2.json.reply === 'v1', JSON.stringify(g2.json))
  const s2 = await svcHttp('POST', '/api/redis', { profileId: rp.id, command: 'SCAN', args: ['0', 'MATCH', 'k*', 'COUNT', '100'] })
  t('redis SCAN 经 service', s2.json.ok && Array.isArray(s2.json.reply) && s2.json.reply[1].includes('k1'), JSON.stringify(s2.json).slice(0, 140))
}
// 结构浏览
{
  const tb = await svcHttp('GET', `/api/tables?profileId=${mp.id}&schema=appdb`)
  t('结构: mysql tables', tb.json.ok && tb.json.items.some((x) => x.name === 'users'), JSON.stringify(tb.json).slice(0, 160))
  const de = await svcHttp('GET', `/api/describe?profileId=${mp.id}&schema=appdb&table=users`)
  t('结构: mysql describe', de.json.ok && de.json.columns.length === 4 && de.json.ddl.includes('CREATE TABLE'), '')
  const tbg = await svcHttp('GET', `/api/tables?profileId=${pgp.id}&schema=public`)
  t('结构: pg tables', tbg.json.ok && tbg.json.items.some((x) => x.name === 'orders'), '')
}

// MCP 层真库
{
  const mcp = spawn(process.execPath, [join(pluginDir, 'mcp', 'server.js'), appCfg], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(fakeHost.address().port), POLARIS_TOKEN: HOST_TOKEN },
  })
  let buf = ''
  const pending = new Map()
  let nid = 1
  mcp.stdout.setEncoding('utf8')
  mcp.stdout.on('data', (c) => {
    buf += c
    for (;;) {
      const i = buf.indexOf('\n')
      if (i === -1) break
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!line) continue
      try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } } catch (_) { /* 忽略 */ }
    }
  })
  const rpc = (method, params) => new Promise((resolve) => {
    const id = nid++
    const timer = setTimeout(() => resolve({ error: 'timeout' }), 15000)
    pending.set(id, (m) => { clearTimeout(timer); resolve(m) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  await sleep(1000)
  const call = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args })
    return { isError: !!(r.result && r.result.isError), text: r.result && r.result.content ? r.result.content[0].text : JSON.stringify(r) }
  }
  const q = await call('dbw_query', { profileId: mp.id, sql: 'SELECT name, amount FROM users WHERE amount > 100 ORDER BY amount DESC' })
  t('MCP: dbw_query 真库返回中文行', !q.isError && q.text.includes('张三') && q.text.includes('王五'), q.text.slice(0, 160))
  const qr = await call('dbw_query', { profileId: mp.id, sql: 'SELECT * FROM users' })
  t('MCP: dbw_query 返回行数上限内', !qr.isError, qr.text.slice(0, 100))
  const wr = await call('dbw_query', { profileId: pgp.id, sql: 'DELETE FROM orders' })
  t('MCP: 对 PG 写语句仍被拒', wr.isError && /只读/.test(wr.text), wr.text)
  const rd = await call('dbw_redis', { profileId: rp.id, command: 'GET', args: ['k1'] })
  t('MCP: dbw_redis GET', !rd.isError && rd.text.includes('v1'), rd.text)
  const tbm = await call('dbw_tables', { profileId: pgp.id })
  t('MCP: dbw_tables 默认 schema=public', !tbm.isError && tbm.text.includes('orders'), tbm.slice ? tbm.slice(0, 100) : tbm.text.slice(0, 100))
  const dm = await call('dbw_describe', { profileId: mp.id, table: 'users' })
  t('MCP: dbw_describe', !dm.isError && dm.text.includes('VARCHAR') === false || dm.text.includes('name'), dm.text.slice(0, 120))
  mcp.kill()
}

svc.kill()
fakeHost.close()
if (mysqlPool) await mysqlPool.end().catch(() => {})
if (pgPool) await pgPool.end().catch(() => {})

console.log(`\n真实库 smoke: ${pass} 通过, ${fail} 失败`)
if (fail > 0) { console.error(failures.join('\n')); process.exit(1) }
process.exit(0)
