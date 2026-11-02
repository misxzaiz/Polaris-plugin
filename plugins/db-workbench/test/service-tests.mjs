// service 集成测试：起「假宿主 bridge」（内存 kv）+ 真 service 子进程，HTTP 全链路断言
// 运行：node test/service-tests.mjs（零外部依赖，无真实数据库）
import { createRequire } from 'module'
import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
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
  if (ok) pass += 1
  else { fail += 1; failures.push(`${name} → ${detail}`) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 假宿主 bridge（内存 kv + md5 token 鉴权，协议与宿主一致） ────────────────
const HOST_TOKEN = 'test-host-token'
const HOST_MD5 = crypto.createHash('md5').update(HOST_TOKEN).digest('hex')
const kvStore = new Map()

const fakeHost = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/health') { res.writeHead(200); res.end('ok'); return }
    if (url.pathname === '/api/router-dispatch') {
      const auth = String(req.headers.authorization || '')
      if (auth !== `Bearer ${HOST_MD5}`) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'bad host token' })); return }
      let parsed
      try { parsed = JSON.parse(body) } catch (_) { parsed = null }
      const { target, payload } = parsed && parsed.req ? parsed.req : {}
      let out
      if (target === 'cap.kv') {
        const a = payload.action
        if (a === 'get') out = { ok: true, result: { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null } }
        else if (a === 'set') { kvStore.set(payload.key, payload.value); out = { ok: true, result: { ok: true } } }
        else if (a === 'delete') { kvStore.delete(payload.key); out = { ok: true, result: { ok: true } } }
        else if (a === 'list') out = { ok: true, result: { keys: Array.from(kvStore.keys()) } }
        else out = { ok: false, error: `unknown action ${a}` }
      } else {
        out = { ok: false, error: `unknown target ${target}` }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(out))
      return
    }
    res.writeHead(404); res.end('nf')
  })
})

await new Promise((r) => fakeHost.listen(0, '127.0.0.1', r))
const hostPort = fakeHost.address().port

// ── 临时 appConfigDir（带 config.json 引导发现） ─────────────────────────────
const appCfg = mkdtempSync(join(tmpdir(), 'dbw-test-'))
writeFileSync(join(appCfg, 'config.json'), JSON.stringify({ web: { port: hostPort, token: HOST_TOKEN } }))

// ── 起 service ───────────────────────────────────────────────────────────────
const SVC_PORT = 18970 + Math.floor(Math.random() * 400)
const svc = spawn(process.execPath, [join(pluginDir, 'service', 'main.js'), String(SVC_PORT), appCfg], {
  stdio: ['ignore', 'pipe', 'pipe'],
  // 强制 bridge 走假宿主：kvclient 的 env 发现优先级最高（高于 anchor/config 扫描），
  // 避免本机真宿主在跑时把测试数据写进真实数据根
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(hostPort), POLARIS_TOKEN: HOST_TOKEN },
})
let svcLog = ''
svc.stderr.on('data', (c) => { svcLog += c })
svc.stdout.on('data', (c) => { svcLog += c })

async function svcHttp(method, p, body, token) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json' }
  const r = await fetch(`http://127.0.0.1:${SVC_PORT}${p}`, { method, headers, body: payload })
  let json = null
  try { json = JSON.parse(await r.text()) } catch (_) { /* 保留 null */ }
  return { status: r.status, json }
}

// 等服务起来（读 /__health）
let up = false
for (let i = 0; i < 60 && !up; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/__health`)
    up = r.status === 200
  } catch (_) { await sleep(250) }
}
t('service 启动且 /__health 200', up, svcLog.slice(-300))

// 等 service 把发现信息写进 kv（重试发布最多 ~10 次但通常一次成）
let svcInfo = null
for (let i = 0; i < 20 && !svcInfo; i++) {
  svcInfo = kvStore.get('dbl.service') || null
  if (!svcInfo) await sleep(400)
}
t('service 发现信息写入 kv（dbl.service）', svcInfo && svcInfo.port === SVC_PORT && typeof svcInfo.token === 'string', JSON.stringify(svcInfo))
const TOKEN = svcInfo ? svcInfo.token : ''

// ── 鉴权 ─────────────────────────────────────────────────────────────────────
{
  const r = await svcHttp('GET', '/api/info')
  t('无 token 401', r.status === 401, `got ${r.status}`)
  const r2 = await svcHttp('GET', '/api/info', undefined, 'wrong-token')
  t('错 token 401', r2.status === 401, `got ${r2.status}`)
  const r3 = await svcHttp('GET', '/api/info', undefined, TOKEN)
  t('对 token 200 + 版本', r3.status === 200 && r3.json.ok === true && typeof r3.json.version === 'string', JSON.stringify(r3.json))
}

// ── profile CRUD（经假宿主 kv） ──────────────────────────────────────────────
{
  const r = await svcHttp('POST', '/api/profiles', {
    profile: { type: 'mysql', name: '本地库', host: '127.0.0.1', username: 'root', database: 'app', rememberPass: true },
    password: 'p@ss',
  }, TOKEN)
  t('创建 profile', r.status === 200 && r.json.ok === true && r.json.profile.id, JSON.stringify(r.json))
  t('创建后 hasStoredPass=true（密码落本地文件）', r.json.profile && r.json.profile.hasStoredPass === true, JSON.stringify(r.json.profile))
  t('响应不含明文密码', JSON.stringify(r.json).includes('p@ss') === false, '密码泄漏')
  const id = r.json.profile.id

  const r2 = await svcHttp('GET', '/api/profiles', undefined, TOKEN)
  t('profile 列表经 kv 可读', r2.status === 200 && r2.json.items.length === 1, JSON.stringify(r2.json))

  const r3 = await svcHttp('POST', '/api/profiles', {
    profile: { id, type: 'mysql', name: '本地库改', host: '127.0.0.1', username: 'root', database: 'app', rememberPass: true },
  }, TOKEN)
  t('更新 profile（未传密码沿用已存）', r3.status === 200 && r3.json.profile.name === '本地库改' && r3.json.profile.hasStoredPass === true, JSON.stringify(r3.json))

  const r4 = await svcHttp('POST', '/api/profiles', { profile: { type: 'oracle', name: 'x', host: 'h' } }, TOKEN)
  t('非法 type 422', r4.status === 422, `got ${r4.status}`)

  // 密码文件确实在 appConfigDir 下且 kv 里没有
  const fs = await import('fs')
  const credPath = join(appCfg, 'db-workbench', 'credentials.json')
  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'))
  t('密码写进本地文件（不进 kv）', creds[id] === 'p@ss' && !JSON.stringify(Array.from(kvStore.entries())).includes('p@ss'), JSON.stringify(creds))
}

// ── 护栏在 HTTP 层生效 ───────────────────────────────────────────────────────
{
  // 建一个 redis profile 测 SQL 通道拒绝 + redis 白名单
  const rr = await svcHttp('POST', '/api/profiles', { profile: { type: 'redis', name: 'r1', host: '127.0.0.1', port: 16399 } }, TOKEN)
  const rid = rr.json.profile.id

  const q1 = await svcHttp('POST', '/api/query', { profileId: rid, sql: 'SELECT 1' }, TOKEN)
  t('redis 连接走 SQL 通道被拒', q1.status === 422 && /Redis/.test(q1.json.error), JSON.stringify(q1.json))

  const q2 = await svcHttp('POST', '/api/redis', { profileId: rid, command: 'FLUSHALL' }, TOKEN)
  t('redis FLUSHALL 422 永拒', q2.status === 422 && q2.json.error && q2.json.error.includes('永久拒绝'), JSON.stringify(q2.json))

  const q3 = await svcHttp('POST', '/api/redis', { profileId: rid, command: 'SCAN', args: ['0'] }, TOKEN)
  t('redis SCAN 无 COUNT 422', q3.status === 422, JSON.stringify(q3.json))

  const q4 = await svcHttp('POST', '/api/redis', { profileId: rid, command: 'SET', args: ['a', 'b'] }, TOKEN)
  t('redis SET 无 allowWrite 422', q4.status === 422 && q4.json.needsWrite === true, JSON.stringify(q4.json))

  const q5 = await svcHttp('POST', '/api/redis', { profileId: rid, command: 'KEYS', args: ['*'] }, TOKEN)
  t('redis KEYS 不在白名单', q5.status === 422, JSON.stringify(q5.json))

  // 不存在的 profile
  const q6 = await svcHttp('POST', '/api/query', { profileId: 'nope', sql: 'SELECT 1' }, TOKEN)
  t('不存在连接 404', q6.status === 404, `got ${q6.status}`)

  // 真实 MySQL 连接（不存在的端口）→ 连接失败但护栏先放行（read 语句），错误应来自驱动
  const q7 = await svcHttp('POST', '/api/query', { profileId: rid, sql: 'UPDATE x SET a=1' }, TOKEN)
  t('SQL 写语句在护栏层拒绝（即使连接不存在）', q7.status === 422 && /只读|写模式/.test(q7.json.error), JSON.stringify(q7.json))

  // 历史已记录失败尝试
  const h = await svcHttp('GET', '/api/history', undefined, TOKEN)
  t('失败查询已入历史', h.status === 200 && h.json.items.length >= 3, `items=${h.json.items.length}`)
  t('历史不含密码字段', JSON.stringify(h.json).toLowerCase().includes('"password"') === false, JSON.stringify(h.json).slice(0, 200))
}

// ── 连接测试端点（不可达端口 → ok:false 而非 500） ───────────────────────────
{
  const rr = await svcHttp('POST', '/api/profiles', { profile: { type: 'redis', name: 'rdead', host: '127.0.0.1', port: 1 } }, TOKEN)
  const id = rr.json.profile.id
  const r = await svcHttp('POST', `/api/profiles/${id}/test`, {}, TOKEN)
  t('不可达连接 test 返回 ok:false（非 5xx）', r.status === 200 && r.json.ok === false, JSON.stringify(r.json))
}

// ── selftest ────────────────────────────────────────────────────────────────
{
  const r = await svcHttp('POST', '/api/selftest', {}, TOKEN)
  t('selftest 全绿', r.status === 200 && r.json.ok === true && r.json.selftest.failed === 0, JSON.stringify(r.json.selftest && r.json.selftest.checks && r.json.selftest.checks.filter((c) => !c.ok)))
}

// ── MCP 通道 forceReadonly ───────────────────────────────────────────────────
{
  // 建一个可写 SQL profile（连不上也行，护栏在驱动之前）
  const rr = await svcHttp('POST', '/api/profiles', {
    profile: { type: 'mysql', name: 'w1', host: 127 + '.0.0.1', username: 'root', database: 'db', readonly: false, allowWrite: true, rememberPass: false },
  }, TOKEN)
  const wid = rr.json.profile.id
  const r = await svcHttp('POST', '/mcp/query', { profileId: wid, sql: 'DROP TABLE t' }, TOKEN)
  t('MCP 通道写语句 422（forceReadonly）', r.status === 422, JSON.stringify(r.json))
  const r2 = await svcHttp('POST', '/mcp/redis', { profileId: wid, command: 'GET' }, TOKEN)
  t('MCP 通道 redis 工具对非 redis 连接 422', r2.status === 422, JSON.stringify(r2.json))
}

// ── 清理 ─────────────────────────────────────────────────────────────────────
svc.kill()
fakeHost.close()

console.log(`\nservice 集成测试: ${pass} 通过, ${fail} 失败`)
if (fail > 0) {
  console.error('失败项:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  console.error('service 日志尾部:\n' + svcLog.slice(-800))
  process.exit(1)
}
process.exit(0)
