// MCP 全链路测试：假宿主 bridge + 真 service + 真 MCP server 子进程（stdio JSON-RPC）
// 验证发现链：MCP → kv 读 dbl.service → 直连 service /mcp/*（forceReadonly）
// 运行：node test/mcp-tests.mjs（零外部依赖，无真实数据库）
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
  if (ok) pass += 1
  else { fail += 1; failures.push(`${name} → ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 假宿主 bridge ────────────────────────────────────────────────────────────
const HOST_TOKEN = 'mcp-test-token'
const HOST_MD5 = crypto.createHash('md5').update(HOST_TOKEN).digest('hex')
const kvStore = new Map()
const fakeHost = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/health') { res.writeHead(200); res.end('ok'); return }
    if (url.pathname === '/api/router-dispatch') {
      if (String(req.headers.authorization || '') !== `Bearer ${HOST_MD5}`) { res.writeHead(401); res.end('{}'); return }
      const { target, payload } = JSON.parse(body).req
      let out
      if (target === 'cap.kv') {
        if (payload.action === 'get') out = { ok: true, result: { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null } }
        else if (payload.action === 'set') { kvStore.set(payload.key, payload.value); out = { ok: true, result: { ok: true } } }
        else if (payload.action === 'delete') { kvStore.delete(payload.key); out = { ok: true, result: { ok: true } } }
        else out = { ok: false, error: '?' }
      } else out = { ok: false, error: '?' }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(out))
      return
    }
    res.writeHead(404); res.end('nf')
  })
})
await new Promise((r) => fakeHost.listen(0, '127.0.0.1', r))
const hostPort = fakeHost.address().port

const appCfg = mkdtempSync(join(tmpdir(), 'dbw-mcp-'))
const { writeFileSync } = await import('fs')

// ── 起 service（连假宿主） ───────────────────────────────────────────────────
const SVC_PORT = 19400 + Math.floor(Math.random() * 300)
const svc = spawn(process.execPath, [join(pluginDir, 'service', 'main.js'), String(SVC_PORT), appCfg], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(hostPort), POLARIS_TOKEN: HOST_TOKEN },
})
let svcToken = ''
for (let i = 0; i < 30 && !svcToken; i++) {
  const info = kvStore.get('dbl.service')
  if (info && info.token) svcToken = info.token
  else await sleep(300)
}

// 预置一个 redis profile + 一个 mysql profile（供 MCP 工具使用）
const put = (k, v) => kvStore.set(k, v)
put('dbl.profiles', {
  items: [
    { id: 'mcp_redis', type: 'redis', name: 'r', host: '127.0.0.1', port: 16999, username: '', database: '0', readonly: true, allowWrite: false, rememberPass: false, hasStoredPass: false, ssl: false, note: '', createdAt: Date.now(), lastUsedAt: 0 },
    { id: 'mcp_mysql', type: 'mysql', name: 'm', host: '127.0.0.1', port: 19999, username: 'root', database: 'app', readonly: true, allowWrite: false, rememberPass: false, hasStoredPass: false, ssl: false, note: '', createdAt: Date.now(), lastUsedAt: 0 },
  ],
  updatedAt: Date.now(),
})

// ── 起 MCP server（stdio JSON-RPC） ─────────────────────────────────────────
const mcp = spawn(process.execPath, [join(pluginDir, 'mcp', 'server.js'), appCfg], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(hostPort), POLARIS_TOKEN: HOST_TOKEN },
})
let mcpErr = ''
mcp.stderr.on('data', (c) => { mcpErr += c })

let buf = ''
const pending = new Map()
let nextId = 1
mcp.stdout.setEncoding('utf8')
mcp.stdout.on('data', (c) => {
  buf += c
  for (;;) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch (_) { /* 忽略坏行 */ }
  }
})

function rpc(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc 超时: ${method}`)) }, 15000)
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function toolCall(name, args) {
  const r = await rpc('tools/call', { name, arguments: args })
  const text = r.result && r.result.content && r.result.content[0] ? r.result.content[0].text : JSON.stringify(r)
  return { isError: !!(r.result && r.result.isError), text }
}

// 等 MCP 起来
await sleep(1200)

// initialize
{
  const r = await rpc('initialize', {})
  const info = r.result && r.result.serverInfo
  t('initialize 返回 serverInfo db-workbench', info && info.name === 'db-workbench', JSON.stringify(r).slice(0, 200))
}
{
  const r = await rpc('tools/list', {})
  const names = (r.result.tools || []).map((x) => x.name)
  t('tools/list 七工具', ['dbw_connections', 'dbw_tables', 'dbw_describe', 'dbw_query', 'dbw_redis', 'dbw_history', 'dbw_selftest']
    .every((n) => names.includes(n)), names.join(','))
}
{
  const r = await toolCall('dbw_connections', {})
  t('dbw_connections 列出预置 profile', !r.isError && r.text.includes('mcp_redis') && r.text.includes('mcp_mysql'), r.text.slice(0, 200))
}
{
  const r = await toolCall('dbw_query', { profileId: 'nope', sql: 'SELECT 1' })
  t('dbw_query 不存在连接 → 明确错误', r.isError && /不存在/.test(r.text), r.text)
}
{
  const r = await toolCall('dbw_query', { profileId: 'mcp_mysql', sql: 'DROP TABLE users' })
  t('dbw_query 写语句被拒（MCP 通道 forceReadonly）', r.isError && /只读|写/.test(r.text), r.text)
}
{
  const r = await toolCall('dbw_query', { profileId: 'mcp_mysql', sql: 'SELECT 1' })
  t('dbw_query 只读语句放行到驱动层（连接失败报连接错误而非护栏错误）', r.isError && !/只读|写语句|多语句/.test(r.text), r.text)
}
{
  const r = await toolCall('dbw_redis', { profileId: 'mcp_redis', command: 'FLUSHALL' })
  t('dbw_redis FLUSHALL 永拒', r.isError && /永久拒绝/.test(r.text), r.text)
}
{
  const r = await toolCall('dbw_redis', { profileId: 'mcp_redis', command: 'SCAN', args: ['0', 'COUNT', '100'] })
  t('dbw_redis SCAN 合法（到驱动层报连接错误）', r.isError && !/白名单|COUNT/.test(r.text), r.text)
}
{
  const r = await toolCall('dbw_redis', { profileId: 'mcp_redis', command: 'SET', args: ['a', 'b'] })
  t('dbw_redis 写命令拒绝', r.isError && /allowWrite|写命令/.test(r.text), r.text)
}
{
  const r = await toolCall('dbw_selftest', {})
  t('dbw_selftest 全绿', !r.isError && /0 失败|failed.: 0|全绿|通过/.test(r.text) && !/✗/.test(r.text), r.text.slice(0, 300))
}
{
  const r = await toolCall('dbw_history', {})
  t('dbw_history 可读（含 MCP 拒绝记录）', !r.isError, r.text.slice(0, 120))
}

mcp.kill()
svc.kill()
fakeHost.close()

console.log(`\nMCP 全链路测试: ${pass} 通过, ${fail} 失败`)
if (fail > 0) {
  console.error('失败项:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  console.error('mcp stderr:\n' + mcpErr.slice(-600))
  process.exit(1)
}
process.exit(0)
