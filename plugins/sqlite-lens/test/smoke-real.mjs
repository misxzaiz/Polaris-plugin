/**
 * SQLite 检查台真实桥冒烟：node test/smoke-real.mjs
 *
 * 对运行中的生产 Polaris 做全链路验证（disk-radar/page-sentinel 同配方）：
 *   1. 自发现真实桥端点
 *   2. 防误伤护栏：真实 kv 已有 sqltl.* 业务键 → 拒跑（不清他人数据）
 *   3. 临时目录造夹具库（真 SQLite + 假 .db + node_modules 隐藏库）
 *   4. spawn 真实服务进程（无 env 注入）→ 等心跳键 sqltl.meta
 *   5. 直连服务 HTTP：radar→open→schema→rows→query→两步写（预览/取消/提交）
 *      →断言写前备份真实落盘→export→stats→integrity
 *   6. spawn 真实 mcp/server.js（stdio JSON-RPC）→ initialize/tools/list
 *      →tools/call 闭环（open/query/write/confirm）
 *   7. finally：杀进程 + 删光 sqltl.* 键 + 删临时目录 → 报告 N/N
 */
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'

const require = createRequire(import.meta.url)
const { resolveEndpoint, md5 } = require('../service/kvclient.js')
const core = require('../shared/lens-core.js')

const results = []
let failed = false
function pass(name) { results.push(`✓ ${name}`) }
function fail(name, detail) { failed = true; results.push(`✗ ${name}\n    ${detail}`) }
async function t(name, fn) {
  try { await fn(); pass(name) } catch (e) { fail(name, e.message) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms, step = 500, label = '') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  throw new Error(`冒烟超时：${label}`)
}
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)) })
  })
}

// ── 1. 真桥端点 ──
const EP = await resolveEndpoint()
console.log(`桥端点：${EP.host}:${EP.port}（via ${EP.via}${EP.token ? ', authed' : ''}）`)

function dispatch(target, payload, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } })
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`
    const req = http.request(
      { hostname: EP.host, port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('dispatch timeout')) })
    req.write(data)
    req.end()
  })
}
async function kvGet(key) {
  const r = await dispatch('cap.kv', { action: 'get', key }).catch(() => null)
  return r && r.ok ? (r.result && r.result.value !== undefined ? r.result.value : null) : null
}
async function kvSet(key, value) {
  const r = await dispatch('cap.kv', { action: 'set', key, value }).catch(() => null)
  return !!(r && r.ok)
}
async function kvDel(key) {
  await dispatch('cap.kv', { action: 'delete', key }).catch(() => {})
}
async function kvKeys() {
  const r = await dispatch('cap.kv', { action: 'list' }).catch(() => null)
  return r && r.ok && r.result && Array.isArray(r.result.keys) ? r.result.keys : []
}

// ── 2. 防误伤护栏 ──
const existing = (await kvKeys()).filter((k) => k.startsWith('sqltl.'))
if (existing.length > 0) {
  console.error(`✗ 拒跑：真实 kv 已存在 sqltl.* 键（${existing.slice(0, 5).join('、')}…）——可能插件已正式安装，冒烟不清他人数据。`)
  process.exit(1)
}
console.log('护栏通过：真实 kv 无 sqltl.* 键')

// ── 3. 夹具 ──
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sqltl-smoke-'))
const appConfigDir = path.join(tmpBase, 'appconfig')
fs.mkdirSync(appConfigDir, { recursive: true })
const dbDir = path.join(tmpBase, 'dbs')
fs.mkdirSync(dbDir, { recursive: true })
const fixtureDb = path.join(dbDir, 'fixture.db')
{
  const db = new DatabaseSync(fixtureDb)
  db.exec('CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT)')
  db.exec('CREATE TABLE visits (id INTEGER PRIMARY KEY, url_id INTEGER, at INTEGER)')
  db.prepare('INSERT INTO urls (url, title) VALUES (?, ?)').run('https://example.com', 'Example')
  db.prepare('INSERT INTO urls (url, title) VALUES (?, ?)').run('https://test.org', 'Test')
  db.prepare('INSERT INTO visits (url_id, at) VALUES (1, 1700000000)')
  db.close()
}
const fakeDb = path.join(dbDir, 'fake.db')
fs.writeFileSync(fakeDb, Buffer.alloc(100, 3)) // 非 SQLite 魔数
const nmDir = path.join(dbDir, 'node_modules')
fs.mkdirSync(nmDir, { recursive: true })
fs.writeFileSync(path.join(nmDir, 'hidden.db'), Buffer.from('SQLite format 3\0' + 'y'.repeat(100)))
console.log(`夹具就绪：${dbDir}`)

// ── 4. spawn 真实服务 ──
const svcPort = await freePort()
const svc = spawn(process.execPath, [path.join('service', 'lens.js'), String(svcPort), appConfigDir], {
  cwd: path.resolve(import.meta.dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
})
const svcErr = []
svc.stderr.on('data', (c) => svcErr.push(String(c)))
await waitFor(async () => await kvGet(core.K.meta), 20000, 600, '服务心跳键 sqltl.meta')
const meta = await kvGet(core.K.meta)
assert.ok(meta && meta.port === svcPort, 'meta.port 应等于服务端口')
assert.ok(meta.token, 'meta.token 应存在')
console.log(`服务已起：127.0.0.1:${meta.port}（心跳键就位）`)

function apiCall(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {})
    const req = http.request(
      {
        hostname: '127.0.0.1', port: meta.port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SqliteLens-Token': meta.token, 'Content-Length': Buffer.byteLength(data) },
        timeout: 30000,
      },
      (res) => {
        let b = ''
        res.on('data', (c) => { b += c })
        res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
      },
    )
    req.on('error', reject)
    req.write(data); req.end()
  })
}

// ── 5. 直连服务全链路 ──
await t('health 200（真服务）', async () => {
  const r = await new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: meta.port, path: '/__health', timeout: 3000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve(JSON.parse(b)))
    }).on('error', reject)
  })
  assert.ok(r.ok)
})

let dbId = ''
await t('radar 真实发现夹具库（魔数区分真假）', async () => {
  const r = await apiCall('/api/radar', { root: dbDir, budgetMs: 3000 })
  assert.ok(r.ok, r.error)
  const hit = r.items.find((i) => i.path === fixtureDb)
  assert.ok(hit, '应发现 fixture.db')
  assert.equal(hit.sqlite, true)
  const fake = r.items.find((i) => i.path === fakeDb)
  assert.ok(fake && fake.sqlite === false, 'fake.db 应标非 SQLite')
  assert.ok(!r.items.some((i) => i.path.includes('node_modules')), 'node_modules 应跳过')
})

await t('open 真库（清单入库+签名识别）', async () => {
  const r = await apiCall('/api/open', { path: fixtureDb })
  assert.ok(r.ok, r.error)
  dbId = r.dbId
  assert.ok(r.tables.includes('urls'))
  // urls+visits 两表命中 Chrome 签名（≥2 门槛）——应识别
  assert.equal(r.knownAs, 'Chrome/Edge 浏览历史')
  const libs = (await kvGet(core.K.libs)).libs
  assert.ok(libs.some((l) => l.dbId === dbId), 'libs 清单应入库（真桥）')
})

await t('open 假库明确报错', async () => {
  const r = await apiCall('/api/open', { path: fakeDb })
  assert.ok(!r.ok); assert.match(r.error, /魔数/)
})

await t('schema 单表', async () => {
  const r = await apiCall('/api/schema', { dbId, table: 'urls' })
  assert.ok(r.ok, r.error)
  assert.equal(r.rowCount, 2)
})

await t('rows 分页/过滤', async () => {
  const r = await apiCall('/api/rows', { dbId, table: 'urls', where: "url = 'https://test.org'", limit: 10 })
  assert.ok(r.ok, r.error)
  assert.equal(r.total, 1)
})

await t('query 只读（真桥留历史）', async () => {
  const r = await apiCall('/api/query', { dbId, sql: 'SELECT * FROM urls' })
  assert.ok(r.ok, r.error)
  assert.equal(r.totalRows, 2)
  const qh = await kvGet(core.K.qhist)
  assert.ok(Array.isArray(qh.items) && qh.items.length >= 1, '查询历史应经真桥落 kv')
})

await t('两步写：预览回滚→取消（数据不变）', async () => {
  const p = await apiCall('/api/write', { dbId, sql: "UPDATE urls SET title = 'SMOKE' WHERE id = 1" })
  assert.ok(p.ok, p.error)
  assert.equal(p.preview.changes, 1)
  const pend = await kvGet(core.K.pendingPrefix + p.pendingId)
  assert.ok(pend, '待确认单应经真桥落 kv')
  const c = await apiCall('/api/confirm', { pendingId: p.pendingId, decision: 'cancel' })
  assert.ok(c.ok && c.executed === false)
  const q = await apiCall('/api/query', { dbId, sql: 'SELECT title FROM urls WHERE id = 1' })
  assert.notEqual(q.rows[0][0].v, 'SMOKE')
})

let backupPath = ''
await t('两步写：确认提交+写前备份真实落盘', async () => {
  const p = await apiCall('/api/write', { dbId, sql: "UPDATE urls SET title = 'SMOKE' WHERE id = 1" })
  assert.ok(p.ok, p.error)
  const c = await apiCall('/api/confirm', { pendingId: p.pendingId, decision: 'commit' })
  assert.ok(c.ok, c.error)
  assert.equal(c.changes, 1)
  backupPath = c.backup && c.backup.dest
  assert.ok(backupPath && fs.existsSync(backupPath), `备份应存在：${backupPath}`)
  const audit = await kvGet(core.K.audit)
  assert.ok(audit.items.some((a) => a.status === 'committed'), '审计应留痕（真桥）')
  const q = await apiCall('/api/query', { dbId, sql: 'SELECT title FROM urls WHERE id = 1' })
  assert.equal(q.rows[0][0].v, 'SMOKE')
})

await t('export CSV 到临时目录', async () => {
  const outDir = path.join(tmpBase, 'export')
  const r = await apiCall('/api/export', { dbId, table: 'urls', format: 'csv', outDir })
  assert.ok(r.ok, r.error)
  assert.ok(fs.existsSync(r.path))
  assert.ok(fs.readFileSync(r.path, 'utf8').includes('https://example.com'))
})

await t('stats+integrity', async () => {
  const s = await apiCall('/api/stats', { dbId })
  assert.ok(s.ok && s.pageCount > 0)
  const c = await apiCall('/api/integrity', { dbId })
  assert.ok(c.ok && c.healthy)
})

// ── 6. 真实 MCP server stdio 闭环 ──
await t('MCP：initialize/tools/list（8 工具）/tools/call 闭环', async () => {
  const mcp = spawn(process.execPath, [path.join('mcp', 'server.js'), appConfigDir], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const mcpErr = []
  mcp.stderr.on('data', (c) => mcpErr.push(String(c)))
  const lines = []
  let buf = ''
  mcp.stdout.on('data', (c) => {
    buf += String(c)
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) lines.push(JSON.parse(line))
    }
  })
  const call = (method, params, id) => {
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n')
  }
  const waitReply = async (id, label) => {
    return waitFor(() => lines.find((l) => l.id === id), 30000, 200, label)
  }
  try {
    call('initialize', { protocolVersion: '2024-11-05', capabilities: {} }, 1)
    const init = await waitReply(1, 'initialize')
    assert.equal(init.result.serverInfo.name, 'sqlite-lens')
    call('tools/list', {}, 2)
    const tl = await waitReply(2, 'tools/list')
    const names = tl.result.tools.map((x) => x.name)
    assert.deepEqual(names.sort(), ['sqlite_confirm', 'sqlite_export', 'sqlite_open', 'sqlite_query', 'sqlite_radar', 'sqlite_schema', 'sqlite_stats', 'sqlite_write'])
    // tools/call: radar（直连真实服务）
    call('tools/call', { name: 'sqlite_radar', arguments: { root: dbDir, limit: 10 } }, 3)
    const r3 = await waitReply(3, 'radar call')
    assert.ok(r3.result.content[0].text.includes('fixture.db'), `radar 文本应含夹具：${r3.result.content[0].text.slice(0, 120)}`)
    // tools/call: open → query
    call('tools/call', { name: 'sqlite_open', arguments: { path: fixtureDb } }, 4)
    const r4 = await waitReply(4, 'open call')
    const openText = r4.result.content[0].text
    assert.ok(openText.includes('dbId:'), openText.slice(0, 150))
    const m = /dbId: ([0-9a-f]+)/.exec(openText)
    call('tools/call', { name: 'sqlite_query', arguments: { dbId: m[1], sql: 'SELECT COUNT(*) AS c FROM urls' } }, 5)
    const r5 = await waitReply(5, 'query call')
    // COUNT 返回 1 行、值 2（不是「2 行」）
    assert.ok(r5.result.content[0].text.includes('行数：1') && /\b2\b/.test(r5.result.content[0].text), r5.result.content[0].text.slice(0, 150))
    // tools/call: write → confirm（全链路两步）
    call('tools/call', { name: 'sqlite_write', arguments: { dbId: m[1], sql: "UPDATE urls SET title = 'MCP' WHERE id = 2" } }, 6)
    const r6 = await waitReply(6, 'write call')
    const pid = /pendingId：([0-9a-f]+)/.exec(r6.result.content[0].text)
    assert.ok(pid, r6.result.content[0].text.slice(0, 200))
    call('tools/call', { name: 'sqlite_confirm', arguments: { pendingId: pid[1], decision: 'commit' } }, 7)
    const r7 = await waitReply(7, 'confirm call')
    assert.ok(r7.result.content[0].text.includes('已提交'), r7.result.content[0].text.slice(0, 200))
  } finally {
    mcp.kill()
  }
})

// ── 7. 清理 ──
svc.kill()
await sleep(300)
const keys = await kvKeys()
for (const k of keys.filter((k) => k.startsWith('sqltl.'))) await kvDel(k)
try { fs.rmSync(tmpBase, { recursive: true, force: true }) } catch (_) {}

console.log('\n══════════════ 真桥冒烟结果 ══════════════')
for (const r of results) console.log(r)
console.log(`══════════════ ${results.filter((r) => r.startsWith('✓')).length}/${results.length} 通过 ══════════════`)
if (svcErr.length) console.log(`[服务 stderr 摘要] ${svcErr.join('').slice(0, 500)}`)
if (failed) process.exit(1)
console.log('冒烟全部通过 ✓（sqltl.* 键已清理，备份目录已保留审计记录不动）')
