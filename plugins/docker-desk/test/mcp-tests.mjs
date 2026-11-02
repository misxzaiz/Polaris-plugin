// MCP 全链路测试：假宿主 bridge（env 直指）+ 假引擎 + 真 service 子进程 + 真 MCP server 子进程（stdio JSON-RPC）
// 验证发现链：MCP → kv 读 dkd.service → 直连 service /mcp/*（只读路由组）
// 运行：node test/mcp-tests.mjs（零外部依赖、零外网、无真实 Docker）
import { createRequire } from 'module'
import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import http from 'http'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const path = require('path')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = join(__dirname, '..')
const { startFakeEngine, C1 } = await import('./fake-engine.mjs')

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

const fake = await startFakeEngine()
const appCfg = mkdtempSync(join(tmpdir(), 'dkd-mcp-'))
writeFileSync(join(appCfg, 'config.json'), JSON.stringify({ web: { port: hostPort, token: HOST_TOKEN } }))

const SVC_PORT = 19380 + Math.floor(Math.random() * 100)
const svc = spawn(process.execPath, [
  join(pluginDir, 'service', 'main.js'), String(SVC_PORT), appCfg, `--engine=tcp://127.0.0.1:${fake.port}`,
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(hostPort), POLARIS_TOKEN: HOST_TOKEN },
})
svc.stderr.on('data', () => { /* 静默；失败时统一 dump */ })

let svcInfo = null
for (let i = 0; i < 50 && !svcInfo; i++) { await sleep(200); svcInfo = kvStore.get('dkd.service') || null }
t('service 发布到假桥', !!svcInfo, JSON.stringify(svcInfo)?.slice(0, 100))

// ── MCP 子进程（stdio JSON-RPC） ─────────────────────────────────────────────
const mcp = spawn(process.execPath, [join(pluginDir, 'mcp', 'server.js'), appCfg], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(hostPort), POLARIS_TOKEN: HOST_TOKEN },
})
const mcpErr = []
mcp.stderr.on('data', (c) => mcpErr.push(String(c)))

let rpcId = 0
const pending = new Map()
let buf = ''
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
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch (_) { /* 跳过 */ }
  }
})

function rpc(method, params, timeoutMs = 15000) {
  const id = ++rpcId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时 ${method}`)) }, timeoutMs)
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

// initialize 握手
{
  const r = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
  t('initialize 握手', r.result?.serverInfo?.name === 'docker-desk', JSON.stringify(r.result || r.error)?.slice(0, 150))
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
}

// tools/list：恰好 8 个只读工具
let toolNames = []
{
  const r = await rpc('tools/list', {})
  toolNames = (r.result?.tools || []).map((x) => x.name)
  const expected = ['dk_status', 'dk_ps', 'dk_logs', 'dk_inspect', 'dk_stats', 'dk_images', 'dk_events', 'dk_selftest']
  t('tools/list 8 个且全匹配', expected.every((x) => toolNames.includes(x)) && toolNames.length === 8, `tools=${toolNames.join(',')}`)
  const writeish = toolNames.filter((n) => /remove|delete|stop|kill|prune|start|restart|exec/i.test(n))
  t('工具名无写语义', writeish.length === 0, `writeish=${writeish.join(',')}`)
}

async function callTool(name, args) {
  const r = await rpc('tools/call', { name, arguments: args || {} })
  const res = r.result
  if (!res) return { isError: true, text: `无 result: ${JSON.stringify(r.error || r).slice(0, 200)}` }
  return { isError: !!res.isError, text: (res.content || []).map((c) => c.text || '').join('\n') }
}

// dk_status
{
  const r = await callTool('dk_status')
  t('dk_status 引擎 ok', !r.isError && r.text.includes('已连接') && r.text.includes('27.3.1'), r.text.slice(0, 150))
}
// dk_ps
{
  const r = await callTool('dk_ps', {})
  t('dk_ps 列出运行中容器', !r.isError && r.text.includes('web-nginx') && r.text.includes('lonely-tool') && !r.text.includes('cache-redis'), r.text.slice(0, 200))
  const r2 = await callTool('dk_ps', { all: true })
  t('dk_ps all 含已退出', r2.text.includes('cache-redis') && r2.text.includes('compose 项目 demo'), r2.text.slice(0, 200))
}
// dk_logs
{
  const r = await callTool('dk_logs', { nameOrId: 'web-nginx', tail: 50 })
  t('dk_logs stdout 行', r.text.includes('serving on :80') && r.text.includes('[OUT]'), r.text.slice(0, 200))
  const r2 = await callTool('dk_logs', { nameOrId: 'web-nginx', tail: 50, filter: 'timeout' })
  t('dk_logs filter', r2.text.includes('upstream timeout') && !r2.text.includes('serving on'), r2.text.slice(0, 200))
  const r3 = await callTool('dk_logs', { nameOrId: 'no-such-container' })
  t('dk_logs 未知容器可读报错', r3.isError && r3.text.includes('不存在'), r3.text.slice(0, 150))
}
// dk_inspect env 打码
{
  const r = await callTool('dk_inspect', { nameOrId: 'web-nginx' })
  t('dk_inspect env 打码（密钥不进 AI 上下文）', r.text.includes('<masked>') && !r.text.includes('super-secret-token-value'), r.text.slice(0, 200))
  const r2 = await callTool('dk_inspect', { nameOrId: 'web-nginx', showEnv: true })
  t('dk_inspect showEnv 明文（用户同意）', r2.text.includes('super-secret-token-value'), r2.text.slice(0, 120))
}
// dk_stats
{
  const r = await callTool('dk_stats', {})
  t('dk_stats 全部运行中', r.text.includes('web-nginx') && r.text.includes('CPU 50%'), r.text.slice(0, 200))
  const r2 = await callTool('dk_stats', { nameOrId: 'lonely-tool' })
  t('dk_stats 单容器', r2.text.includes('lonely-tool'), r2.text.slice(0, 120))
}
// dk_images
{
  const r = await callTool('dk_images')
  t('dk_images 列表+磁盘汇总', r.text.includes('nginx:1.25') && r.text.includes('可回收约'), r.text.slice(0, 250))
}
// dk_events（等事件泵建流）
{
  await sleep(1500)
  const r = await callTool('dk_events', { limit: 10 })
  t('dk_events 事件流水', r.text.includes('container/die') || r.text.includes('container/start'), r.text.slice(0, 200))
}
// dk_selftest
{
  const r = await callTool('dk_selftest')
  t('dk_selftest 全绿', /自检 \d+\/\d+ 通过/.test(r.text) && !r.text.includes('✗'), r.text.slice(0, 300))
}
// 未知工具
{
  const r = await callTool('dk_remove_everything', {})
  t('未知工具被拒（写语义工具不存在）', r.isError && r.text.includes('未知工具'), r.text.slice(0, 100))
}

// ── 清理（关 stdin 优雅下线） ────────────────────────────────────────────────
mcp.stdin.end()
svc.stdin.end()
await sleep(1000)
t('service 下线后 kv 已注销', !kvStore.has('dkd.service'), JSON.stringify(kvStore.get('dkd.service'))?.slice(0, 80))
t('MCP 子进程退出', mcp.exitCode !== null || mcp.signalCode !== null, `exit=${mcp.exitCode}, signal=${mcp.signalCode}`)

fake.server.close()
fakeHost.close()

console.log(`\n=== mcp-tests: ${pass} 通过 / ${fail} 失败 ===`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  console.error('--- mcp stderr ---\n' + mcpErr.join(''))
  process.exit(1)
}
process.exit(0)
