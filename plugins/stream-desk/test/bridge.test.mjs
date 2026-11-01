/**
 * bridge.test.mjs —— 真桥契约集成冒烟（mock bridge 版）
 *
 * 宿主未运行时的第三层验证：起一个与生产 kvclient 契约逐字节对齐的
 * mock bridge（POST /api/router-dispatch 处理 cap.kv 四动作，{ok,result} 信封；
 * GET /api/health 200），让 service 以「真实发现路径」运行（POLARIS_HOST/PORT env →
 * kvclient → bridge），验证：
 *   ① 服务不降级，streamdesk.meta {port,token} 真实落 kv；
 *   ② 会话结束后索引 streamdesk.sessions 与掩码 transcript streamdesk.session.<id> 落 kv；
 *   ③ MCP server 不用测试钩子、走 kv→meta→127.0.0.1 直连的完整发现链（生产路径）。
 *
 * kvclient 是 net-sentinel 生产同款逐字节拷贝，bridge 契约以它为准——
 * 剩余缺口（真实宿主 SqliteStorage 行为）标注为「需真宿主验收」。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WebSocket = require(path.join(ROOT, 'service', 'vendor', 'ws.cjs'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 15_000, step = 200, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

// ── mock bridge（契约与生产 kvclient 对齐）──────────────────────────────────
const PORT_BRIDGE = 29510 + Math.floor(Math.random() * 100)
const PORT_SVC = 29610 + Math.floor(Math.random() * 100)
const PORT_WS = 29710 + Math.floor(Math.random() * 100)
const kvStore = new Map()
let bridgeHits = { dispatch: 0, health: 0 }

const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    bridgeHits.health += 1
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'POST' && req.url === '/api/router-dispatch') {
    bridgeHits.dispatch += 1
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const { req: inner } = JSON.parse(body)
        if (!req.headers.authorization || !String(req.headers.authorization).startsWith('Bearer ')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: '未授权' }))
          return
        }
        if (inner.target !== 'cap.kv') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: `未知 target ${inner.target}` }))
          return
        }
        const p = inner.payload || {}
        let result = {}
        if (p.action === 'get') result = { value: kvStore.has(p.key) ? kvStore.get(p.key) : undefined }
        else if (p.action === 'set') { kvStore.set(p.key, p.value); result = { ok: true } }
        else if (p.action === 'delete') { kvStore.delete(p.key); result = { ok: true } }
        else if (p.action === 'list') result = { keys: [...kvStore.keys()] }
        else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: `未知 action ${p.action}` })); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result }))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }
  res.writeHead(404); res.end()
})

let svcProc = null
let wsServer = null
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  wsServer = await new Promise((resolve) => {
    const wss = new WebSocket.Server({ port: PORT_WS, host: '127.0.0.1' }, () => resolve(wss))
    wss.on('connection', (ws, req) => {
      if (req.headers['x-test'] !== 'yes') { ws.close(1008, 'no x-test'); return }
      ws.send(JSON.stringify({ welcome: true }))
      ws.on('message', (d) => ws.send(JSON.stringify({ echo: d.toString('utf8') })))
    })
  })
  // 真实发现路径：POLARIS_HOST/PORT env（kvclient 的 env 分支），token 走 md5 校验接受任意 Bearer
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC)], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitFor(async () => {
    try { return (await fetch(`${SERVICE_URL}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
})

after(async () => {
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { if (wsServer) wsServer.close() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  await sleep(120)
})

// ── 用例 ────────────────────────────────────────────────────────────────────

test('meta 真实落 kv：{port,token,pid} 完整、不降级、bridge 有真实流量', async () => {
  const meta = await waitFor(() => kvStore.get('streamdesk.meta') || null, { label: 'meta 落 kv' })
  assert.equal(meta.port, PORT_SVC)
  assert.ok(typeof meta.token === 'string' && meta.token.length >= 32)
  assert.ok(Number.isFinite(meta.pid))
  assert.equal(meta.degraded, false)
  assert.ok(bridgeHits.dispatch > 0)
  // 服务自报 kv 端点 = mock bridge
  const health = await (await fetch(`${SERVICE_URL}/__health`)).json()
  assert.equal(health.degraded, false)
})

test('会话结束 → 索引与掩码 transcript 落 kv；MCP 经 kv→meta→直连的完整生产发现链可用', async () => {
  // 服务 token 自 kv meta 取（真实发现路径的一部分）
  const meta = await waitFor(() => kvStore.get('streamdesk.meta') || null, { label: 'meta' })
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` }
  // 用 WS 会话产生一条 transcript
  const open = await fetch(`${SERVICE_URL}/api/session/ws`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ url: `ws://127.0.0.1:${PORT_WS}/ws`, headers: { 'x-test': 'yes', Authorization: 'Bearer ws-secret-7777777' } }),
  }).then((r) => r.json())
  const id = open.session.id
  await waitFor(async () => {
    const d = await fetch(`${SERVICE_URL}/api/session/${id}?since=-1`, { headers: auth }).then((r) => r.json())
    return d.summary.state === 'open'
  }, { label: 'ws open' })
  await fetch(`${SERVICE_URL}/api/session/${id}/close`, { method: 'POST', headers: auth, body: '{}' })
  await waitFor(async () => {
    const d = await fetch(`${SERVICE_URL}/api/session/${id}?since=-1`, { headers: auth }).then((r) => r.json())
    return d.summary.state === 'closed'
  }, { label: 'ws closed' })
  // transcript 防抖落 kv（INDEX_DEBOUNCE 1s + transcript 即时）
  const index = await waitFor(() => {
    const idx = kvStore.get('streamdesk.sessions')
    return Array.isArray(idx) && idx.some((s) => s.id === id) ? idx : null
  }, { label: '索引落 kv', timeoutMs: 20_000 })
  assert.ok(index.some((s) => s.kind === 'ws'))
  const transcript = await waitFor(() => kvStore.get(`streamdesk.session.${id}`) || null, { label: 'transcript 落 kv' })
  assert.equal(transcript.id, id)
  // 掩码在落库路径真实生效（核心安全不变量）
  assert.equal(transcript.request.headers.Authorization, '****7777')
  assert.ok(!JSON.stringify(transcript).includes('ws-secret-7777777'), '落库内容不得含明文密钥')
  assert.ok(transcript.frames.length >= 1)

  // MCP 不带 STREAMDESK_SERVICE_URL 钩子 → 必须经 kvclient 发现 bridge → 读 meta → 直连 service
  const mcp = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js')], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
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
        if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      } catch (_) { /* 忽略 */ }
    }
  })
  let rpcId = 0
  const call = (method, params, timeoutMs = 20_000) => new Promise((resolve, reject) => {
    const rid = ++rpcId
    const t = setTimeout(() => { pending.delete(rid); reject(new Error(`MCP 超时: ${method}`)) }, timeoutMs)
    pending.set(rid, (msg) => { clearTimeout(t); resolve(msg) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n')
  })
  try {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    // session_list 走：kvclient→bridge(cap.kv meta)→127.0.0.1:meta.port 直连——生产同款链路
    const lst = await call('tools/call', { name: 'session_list', arguments: {} })
    assert.ok(!lst.result.isError, `session_list 应成功：${JSON.stringify(lst.result)}`)
    const text = lst.result.content[0].text
    assert.ok(text.includes(id), `应列出刚才的会话：${text}`)
    // transcript 工具走内存路径
    const tr = await call('tools/call', { name: 'transcript', arguments: { sessionId: id } })
    assert.ok(!tr.result.isError)
    assert.ok(tr.result.content[0].text.includes('welcome') || tr.result.content[0].text.includes('关闭'))
  } finally {
    try { mcp.kill() } catch (_) { /* 忽略 */ }
  }
})
