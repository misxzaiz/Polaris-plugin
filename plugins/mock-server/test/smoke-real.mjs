/**
 * 真桥冒烟（真实宿主 cap.kv + 真实 HTTP）：node test/smoke-real.mjs
 *
 * 前置：Polaris 桌面/Web 宿主正在运行（web 桥可达，kvclient 自发现）。
 * 链路：
 *   0. 预清理：删残留 mck.* 键（自清理纪律）
 *   1. 服务起在测试端口 9877 → /__health 200 且 degraded=false（真桥可达）
 *   2. 真实 kv：mck.settings 引导示例路由 + mck.meta 心跳（端口 9877）
 *   3. 真实 HTTP：GET /mockdemo/users 模板真实渲染（中文姓名/邮箱形态）
 *   4. 真实 kv 写路由 → 4.5s 内热更命中（跨真桥生效）
 *   5. 真实 kv 信箱：selftest 命令 → 7/7 全绿（报告落 mck.selftest）
 *   6. 真实 kv：历史镜像 mck.idx/mck.hist.0 有记录、敏感头已脱敏
 *   7. MCP（真桥）：initialize/tools/list + mock_overview 报「正常」+ mock_upsert 落真库
 *   8. 收尾自清理：杀进程 + 删全部 mck.* 键并核验
 * 退出码 0=全绿。任何一步失败如实报告并尝试清理。
 */
import assert from 'node:assert'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SMOKE_PORT = 9877

const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
}

// ── 直连真桥的最小客户端（与 kvclient 同款发现+鉴权；只用于清理与断言）────────
function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex') }
function configCandidates() {
  const cands = []
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'))
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'))
    } catch (_) {}
  }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'))
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'))
  return cands
}
function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'))
      const web = root.web || {}
      if (typeof web.port === 'number' && web.port > 0) return { host: '127.0.0.1', port: web.port, token: web.token || '' }
    } catch (_) {}
  }
  return null
}
const WEB = loadWebConfig()
if (!WEB) { console.error('❌ 未找到宿主 web 配置（anchor.json/config.json）——真桥冒烟需要宿主在运行'); process.exit(2) }

function bridgeDispatch(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target: 'cap.kv', payload } })
    const req = http.request({
      hostname: WEB.host, port: WEB.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(WEB.token ? { Authorization: `Bearer ${md5(WEB.token)}` } : {}) },
      timeout: 8000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('bridge timeout')); })
    req.write(data)
    req.end()
  })
}
async function kvSet(k, v) { const r = await bridgeDispatch({ action: 'set', key: k, value: v }); if (r.ok !== true) throw new Error(`kvSet 失败: ${JSON.stringify(r).slice(0, 120)}`) }
async function kvGet(k) { const r = await bridgeDispatch({ action: 'get', key: k }); return r.ok ? (r.result && r.result.value !== undefined ? r.result.value : null) : null }
async function kvDel(k) { await bridgeDispatch({ action: 'delete', key: k }) }

async function listMckKeys() {
  // 用已知键位清单核验（不走 list，避免宿主 list 语义差异）
  const keys = ['mck.settings', 'mck.meta', 'mck.idx', 'mck.cmd', 'mck.result', 'mck.selftest',
    ...Array.from({ length: 13 }, (_, i) => `mck.hist.${i}`)]
  const present = []
  for (const k of keys) { if (await kvGet(k) !== null) present.push(k) }
  return present
}

// ── HTTP 工具 ───────────────────────────────────────────────────────────────
function httpReq(method, port, urlPath, { headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: { ...(body !== null ? { 'Content-Type': 'application/json' } : {}), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

// ── 进程 ───────────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mck-smoke-'))
let svc = null
let mcp = null
let mcpErrTail = ''

async function startService() {
  svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(SMOKE_PORT), tmpDir], {
    env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let errTail = ''
  svc.stderr.on('data', (c) => { errTail = (errTail + c).slice(-3000) })
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try {
      const h = await httpReq('GET', SMOKE_PORT, '/__health')
      if (h.status === 200) {
        // /__health 先于首个 tick 就绪；等首 tick（meta 心跳 + settings 引导）落真库再返回
        const meta = await kvGet('mck.meta')
        const settings = await kvGet('mck.settings')
        if (meta && meta.port === SMOKE_PORT && settings && Array.isArray(settings.routes)) {
          return JSON.parse(h.text)
        }
      }
    } catch (_) { /* 未就绪 */ }
    await sleep(400)
  }
  throw new Error(`服务未上线（25s 内 health/meta/settings 未就绪）\n${errTail}`)
}

const pending = new Map()
let mcpSeq = 10
function callRpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = mcpSeq++
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时 ${method}；MCP stderr: ${mcpErrTail}`)) }, 30000)
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}
async function toolCall(name, args) {
  const r = await callRpc('tools/call', { name, arguments: args || {} })
  const text = (r.result && r.result.content || []).map((c) => c.text || '').join('\n')
  return { text, isError: r.result && r.result.isError === true }
}

try {
  // 0. 预清理 + 宿主连通性
  const stale = await listMckKeys()
  for (const k of stale) await kvDel(k)

  let health = null
  await t('真桥在线：服务起在 9877，/__health 200 且 degraded=false', async () => {
    health = await startService()
    assert.strictEqual(health.ok, true)
    assert.strictEqual(health.degraded, false, '应发现真实桥（degraded=false）')
    assert.strictEqual(health.port, SMOKE_PORT)
  })

  await t('真实 kv：settings 引导示例路由 + meta 心跳落真库', async () => {
    const s = await kvGet('mck.settings')
    assert.ok(s && Array.isArray(s.routes) && s.routes.length >= 2, 'settings 未引导')
    assert.ok(s.routes.some((r) => r.id === 'demo-users'))
    const meta = await kvGet('mck.meta')
    assert.ok(meta && meta.port === SMOKE_PORT && meta.lastTickAt > 0)
  })

  await t('真实 HTTP：示例路由模板真实渲染（中文姓名/邮箱/布尔）', async () => {
    const r = await httpReq('GET', SMOKE_PORT, '/mockdemo/users')
    assert.strictEqual(r.status, 200)
    const j = JSON.parse(r.text)
    assert.ok(/^[\u4e00-\u9fa5]{2,3}$/.test(j.data[0].name))
    assert.match(j.data[0].email, /^[^@]+@[^@]+\.[^@]+$/)
    assert.strictEqual(typeof j.data[0].vip, 'boolean')
  })

  await t('真实 kv 写路由 → 4.5s 内热更命中（跨真桥生效）', async () => {
    const s = await kvGet('mck.settings')
    s.routes.push({
      id: 'smoke-1', name: '冒烟', method: 'GET', path: '/smoke/ping', status: 200,
      bodyType: 'json', body: '{"pong":"{{req.query.tag}}","n":{{int 1,9}}}', delayMs: 0,
      errorRate: 0, errorStatus: 500, enabled: true, builtin: false, headers: {},
      createdAt: Date.now(), updatedAt: Date.now(),
    })
    await kvSet('mck.settings', s)
    const deadline = Date.now() + 8000
    let ok = false
    while (Date.now() < deadline) {
      const r = await httpReq('GET', SMOKE_PORT, '/smoke/ping?tag=real')
      if (r.status === 200) {
        const j = JSON.parse(r.text)
        if (j.pong === 'real' && Number.isInteger(j.n)) { ok = true; break }
      }
      await sleep(500)
    }
    assert.ok(ok, '8s 内未热更生效')
  })

  await t('真实 kv 信箱：selftest → 7/7 全绿（报告落 mck.selftest）', async () => {
    const nonce = `smoke${Date.now()}`
    await kvSet('mck.cmd', { op: 'selftest', nonce, at: Date.now() })
    const deadline = Date.now() + 45000
    let rep = null
    while (Date.now() < deadline) {
      const r = await kvGet('mck.result')
      if (r && r.nonce === nonce) { rep = r.report; await kvDel('mck.result'); break }
      await sleep(600)
    }
    assert.ok(rep, '45s 内无回执')
    assert.strictEqual(rep.passed, 7, `未全绿: ${JSON.stringify(rep.checks.filter((c) => !c.pass))}`)
    const stored = await kvGet('mck.selftest')
    assert.ok(stored && stored.allGreen === true)
  })

  await t('真实 kv：历史镜像有记录且敏感头脱敏', async () => {
    await httpReq('GET', SMOKE_PORT, '/smoke/ping?tag=hist', { headers: { Authorization: 'Bearer sk-smoke-secret-42' } })
    await sleep(4500)
    const idx = await kvGet('mck.idx')
    assert.ok(idx && idx.count >= 1, 'idx 未落')
    const chunk = await kvGet('mck.hist.0')
    assert.ok(Array.isArray(chunk) && chunk.length >= 1)
    const rec = chunk.find((x) => x.path === '/smoke/ping')
    assert.ok(rec, '记录未找到')
    assert.ok(!/sk-smoke-secret/.test(rec.reqHeaders.authorization || ''), '敏感头未脱敏')
    assert.match(rec.reqHeaders.authorization || '', /（已脱敏）/)
  })

  await t('MCP（真桥）：initialize + tools/list 8 工具 + mock_overview 正常', async () => {
    mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), tmpDir], {
      env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    mcp.stderr.on('data', (c) => { mcpErrTail = (mcpErrTail + c).slice(-2000) })
    readline.createInterface({ input: mcp.stdout }).on('line', (line) => {
      let msg; try { msg = JSON.parse(line) } catch (_) { return }
      if (msg && msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    })
    const init = await callRpc('initialize', {})
    assert.strictEqual(init.result.serverInfo.name, 'mock-server')
    const list = await callRpc('tools/list', {})
    assert.strictEqual(list.result.tools.length, 8)
    const ov = await toolCall('mock_overview')
    assert.match(ov.text, /正常/)
    assert.match(ov.text, new RegExp(`127\\.0\\.0\\.1:${SMOKE_PORT}`))
    assert.match(ov.text, /\/smoke\/ping/)
  })

  await t('MCP（真桥）：mock_upsert 落真库 + mock_routes 可见', async () => {
    const up = await toolCall('mock_upsert', { route: { method: 'GET', path: '/smoke/mcp-route', status: 200, bodyType: 'json', body: '{"via":"mcp"}', name: 'MCP冒烟' } })
    assert.match(up.text, /已新建路由/)
    const ls = await toolCall('mock_routes')
    assert.match(ls.text, /\/smoke\/mcp-route/)
    const s = await kvGet('mck.settings')
    assert.ok(s.routes.some((r) => r.path === '/smoke/mcp-route'))
  })

  await t('收尾自清理：杀进程 + 删全部 mck.* 键并核验', async () => {
    if (mcp) { try { mcp.kill('SIGTERM') } catch (_) {} }
    if (svc) { try { svc.kill('SIGTERM') } catch (_) {} }
    await sleep(800)
    for (const k of await listMckKeys()) await kvDel(k)
    const left = await listMckKeys()
    assert.strictEqual(left.length, 0, `残留: ${left.join(',')}`)
  })
} catch (e) {
  results.push({ name: '冒烟主流程', pass: false, detail: e.message })
  if (mcp) { try { mcp.kill('SIGTERM') } catch (_) {} }
  if (svc) { try { svc.kill('SIGTERM') } catch (_) {} }
  try { for (const k of await listMckKeys()) await kvDel(k) } catch (_) {}
}

try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}

let fail = 0
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`)
  if (!r.pass) fail += 1
}
console.log(`\n真桥冒烟: ${results.length - fail}/${results.length} 通过`)
process.exit(fail ? 1 : 0)
