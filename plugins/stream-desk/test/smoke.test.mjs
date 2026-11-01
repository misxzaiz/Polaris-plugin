/**
 * smoke.test.mjs —— 长连接调试台端到端冒烟（零外部服务，全本机）
 *
 * 夹具：① WS echo 服务器（用与生产同款的 vendor/ws.cjs 起服务端）；
 *       ② SSE / 原始分块 HTTP 服务器（node:http）。
 * 被测：service/main.js 真实进程（kv 置死 → 降级模式路径同时被覆盖）
 *       + mcp/server.js 真实进程（stdio JSON-RPC，七工具闭环）。
 *
 * 验证的核心主张（与 README 一致）：
 *   A. WS 握手自定义头真实到达服务器（无 x-test 头被服务端 1008 拒，有则开）；
 *   B. SSE 抓取 POST + Authorization + body 可用（EventSource 做不到的事）；
 *   C. 逐事件计时与间隔统计真实产出（TTFT / gaps p95）；
 *   D. long-poll ws_wait_frame 的「发一条等回复」闭环；
 *   E. MCP stdio 七工具 handshake + 调用闭环。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WebSocket = require(path.join(ROOT, 'service', 'vendor', 'ws.cjs'))

const TOKEN = 'smoke-token-0123456789abcdef'
const PORT_SVC = 29710 + Math.floor(Math.random() * 200)
const PORT_WS = 29910 + Math.floor(Math.random() * 200)
const PORT_SSE = 29910 + Math.floor(Math.random() * 200) + 200
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`
const AUTH = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

let svcProc = null
let wsServer = null
let sseServer = null
let wsReceivedHeaders = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function svcApi(method, apiPath, body, withAuth = true, timeoutMs = 20_000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${SERVICE_URL}${apiPath}`, {
      method,
      headers: withAuth ? { ...AUTH, ...(body ? {} : {}) } : { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch (_) { /* 保留 null */ }
    return { status: res.status, json, text }
  } finally { clearTimeout(t) }
}

async function waitFor(fn, { timeoutMs = 15_000, step = 200, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

// ── 夹具 ────────────────────────────────────────────────────────────────────

function startWsFixture() {
  return new Promise((resolve) => {
    const wss = new WebSocket.Server({ port: PORT_WS, host: '127.0.0.1' }, () => resolve(wss))
    wss.on('connection', (ws, req) => {
      wsReceivedHeaders = req.headers
      // 夹具的「鉴权」：要求握手头带 x-test: yes——验证服务端客户端真的能送自定义头
      if (req.headers['x-test'] !== 'yes') {
        ws.close(1008, 'missing x-test header')
        return
      }
      ws.send(JSON.stringify({ welcome: true, proto: ws.protocol || '(none)' }))
      ws.on('message', (data, isBinary) => {
        if (isBinary) { ws.send(data, { binary: true }); return }
        const text = data.toString('utf8')
        if (text === 'boom') { ws.close(1008, 'fixture asked to close'); return }
        ws.send(JSON.stringify({ echo: text, at: Date.now() }))
      })
    })
  })
}

function startSseFixture() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/sse') {
        // POST 路径必须带正确 Authorization（模拟 AI 流式接口）
        if (req.headers.authorization !== 'Bearer test-key-12345678') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'Incorrect API key' } }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
        const n = Math.min(20, Math.max(1, parseInt(u.searchParams.get('n') || '5', 10)))
        let i = 0
        res.write(': heartbeat comment\n\n') // 心跳行（诊断计数用）
        const timer = setInterval(() => {
          i += 1
          if (i <= n) {
            const payload = i === 2
              ? 'event: delta\ndata: {"n":2,"text":"第一行"}\ndata: 第二行\n\n' // 多行 data
              : `id: ${i}\ndata: {"n":${i},"chunk":"token-${i}"}\n\n`
            res.write(payload)
          } else {
            clearInterval(timer)
            res.write('data: [DONE]\n\n')
            res.end()
          }
        }, 40)
        req.on('close', () => clearInterval(timer))
        return
      }
      if (u.pathname === '/raw') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        let i = 0
        const timer = setInterval(() => {
          i += 1
          if (i <= 4) res.write(`chunk-${i} `)
          else { clearInterval(timer); res.end() }
        }, 30)
        req.on('close', () => clearInterval(timer))
        return
      }
      res.writeHead(404); res.end()
    })
    server.listen(PORT_SSE, '127.0.0.1', () => resolve(server))
  })
}

// ── 生命周期 ────────────────────────────────────────────────────────────────

before(async () => {
  wsServer = await startWsFixture()
  sseServer = await startSseFixture()
  // kv 置死（POLARIS_PORT=1 连接拒绝）→ 覆盖降级模式；固定 token 经测试钩子注入
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC)], {
    env: {
      ...process.env,
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: '1',
      STREAMDESK_TOKEN: TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let svcLog = ''
  svcProc.stderr.on('data', (c) => { svcLog += c.toString() })
  svcProc.on('exit', (code) => { if (code && code !== 0) console.error('[service 异常退出]', svcLog.slice(-2000)) })
  await waitFor(async () => {
    try {
      const r = await fetch(`${SERVICE_URL}/__health`)
      return r.status === 200
    } catch (_) { return false }
  }, { label: 'service /__health', timeoutMs: 15_000 })
})

after(async () => {
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { if (wsServer) wsServer.close() } catch (_) { /* 忽略 */ }
  try { if (sseServer) sseServer.close() } catch (_) { /* 忽略 */ }
  await sleep(150)
})

// ── 服务基础 ────────────────────────────────────────────────────────────────

test('健康检查开放访问；无 token 的 API 被拒 401；降级模式如实暴露', async () => {
  const health = await (await fetch(`${SERVICE_URL}/__health`)).json()
  assert.equal(health.status, 'ok')
  const noAuth = await svcApi('GET', '/api/sessions', null, false)
  assert.equal(noAuth.status, 401)
  const badToken = await fetch(`${SERVICE_URL}/api/sessions`, { headers: { Authorization: 'Bearer wrong-token-xx' } })
  assert.equal(badToken.status, 401)
  // degraded 要等 boot 首次写 kv 失败后才置位（重试退避 ~2s），轮询等待
  const meta = await waitFor(async () => {
    const m = await svcApi('GET', '/api/meta')
    return m.json.degraded === true ? m.json : null
  }, { label: 'degraded flag', timeoutMs: 15_000 })
  assert.equal(meta.degraded, true)
})

// ── WS 闭环 ────────────────────────────────────────────────────────────────

test('WS: 无自定义头被夹具拒（1008）→ 证明夹具校验真实生效', async () => {
  const r = await svcApi('POST', '/api/session/ws', { url: `ws://127.0.0.1:${PORT_WS}/ws`, headers: {} })
  assert.equal(r.status, 200)
  const id = r.json.session.id
  await waitFor(async () => {
    const d = await svcApi('GET', `/api/session/${id}?since=-1`)
    return ['closed', 'error'].includes(d.json.summary.state) && d.json.summary.closedReason
  }, { label: 'ws rejected' })
  const d = await svcApi('GET', `/api/session/${id}?since=-1`)
  assert.ok(d.json.summary.closedReason.includes('1008'), `应 1008 关闭，实际：${d.json.summary.closedReason}`)
})

test('WS: 自定义握手头 x-test 到达服务器；echo 往返 + 二进制 + ping + long-poll 闭环', async () => {
  // ① 开连接（带 x-test 头 —— 浏览器 WebSocket API 做不到的事）
  const open = await svcApi('POST', '/api/session/ws', {
    url: `ws://127.0.0.1:${PORT_WS}/ws`,
    headers: { 'x-test': 'yes', Authorization: 'Bearer ws-secret-987654321' },
    title: 'smoke-echo',
  })
  assert.equal(open.status, 200)
  const id = open.json.session.id

  // ② 等 open，握手信息齐备
  const detail = await waitFor(async () => {
    const d = await svcApi('GET', `/api/session/${id}?since=-1`)
    return d.json.summary.state === 'open' ? d.json : null
  }, { label: 'ws open' })
  assert.equal(detail.handshake.ok, true)
  assert.equal(detail.handshake.httpStatus, 101)
  assert.ok(Number.isFinite(detail.handshake.latencyMs))
  // 夹具收到的头里必须有 x-test 与 Authorization（核心主张 A）
  assert.equal(wsReceivedHeaders['x-test'], 'yes')
  assert.equal(wsReceivedHeaders.authorization, 'Bearer ws-secret-987654321')
  // 出站投影里 Authorization 掩码（服务返回的面板视图）
  assert.equal(detail.request.headers.Authorization, '****4321')

  // ③ 服务器的 welcome 帧（dir=in）已在帧流里
  assert.ok(detail.frames.some((f) => f.dir === 'in' && f.kind === 'text' && f.text.includes('welcome')), '应有 welcome 帧')

  // ④ 发文本 → long-poll 等 echo（核心主张 D：发一条等回复）
  await svcApi('POST', `/api/session/${id}/send`, { op: 'text', text: '你好调试台' })
  const waited = await svcApi('GET', `/api/session/${id}/next?after=${detail.cursor}&timeoutMs=5000`)
  const echo = waited.json.frames.find((f) => f.dir === 'in' && f.text && f.text.includes('echo'))
  assert.ok(echo, `long-poll 应等到 echo 帧，实际：${JSON.stringify(waited.json.frames)}`)
  assert.ok(JSON.parse(echo.text).echo.includes('你好调试台'))

  // ⑤ 二进制往返
  const b64 = Buffer.from([1, 2, 3, 250]).toString('base64')
  await svcApi('POST', `/api/session/${id}/send`, { op: 'binary', b64 })
  const binWait = await svcApi('GET', `/api/session/${id}/next?after=${waited.json.cursor}&timeoutMs=5000`)
  const binFrame = binWait.json.frames.find((f) => f.dir === 'in' && f.kind === 'binary')
  assert.ok(binFrame, '应有二进制 echo 帧')
  assert.deepEqual(Buffer.from(binFrame.b64, 'base64'), Buffer.from([1, 2, 3, 250]))

  // ⑥ 手动 ping（服务器 ws 库自动回 pong）
  await svcApi('POST', `/api/session/${id}/send`, { op: 'ping', text: String(Date.now()) })
  const pongWait = await svcApi('GET', `/api/session/${id}/next?after=${binWait.json.cursor}&timeoutMs=5000`)
  assert.ok(pongWait.json.frames.some((f) => f.kind === 'pong'), '应有 pong 帧')

  // ⑦ 主动关闭 1000
  await svcApi('POST', `/api/session/${id}/close`, { code: 1000, reason: 'smoke done' })
  const fin = await waitFor(async () => {
    const d = await svcApi('GET', `/api/session/${id}?since=-1`)
    return d.json.summary.state === 'closed' ? d.json : null
  }, { label: 'ws close' })
  assert.ok(fin.summary.closedReason.includes('1000'))
  const cnt = fin.summary.counters
  // 收：welcome + echo文本 + echo二进制；发：文本 + 二进制（ping 单独计 pings）
  assert.ok(cnt.out >= 2 && cnt.pings >= 1 && cnt.pongs >= 1 && cnt.in >= 3, `计数应齐：${JSON.stringify(cnt)}`)
})

// ── SSE 闭环 ────────────────────────────────────────────────────────────────

test('SSE: POST+Authorization+body 抓取（EventSource 做不到的事）+ 事件计时统计', async () => {
  const open = await svcApi('POST', '/api/session/sse', {
    url: `${sseBase()}/sse?n=5`,
    method: 'POST',
    headers: { Authorization: 'Bearer test-key-12345678' },
    body: JSON.stringify({ model: 'test', stream: true }),
    maxEvents: 20,
    durationMs: 15_000,
    title: 'smoke-sse',
  })
  assert.equal(open.status, 200)
  const id = open.json.session.id

  const fin = await waitFor(async () => {
    const d = await svcApi('GET', `/api/session/${id}?since=-1`)
    return d.json.summary.state === 'closed' ? d.json : null
  }, { label: 'sse done', timeoutMs: 20_000 })

  // 核心主张 B：401 没拦住我们（头真实送达），事件真实解析
  assert.equal(fin.handshake.httpStatus, 200)
  const events = fin.frames.filter((f) => f.kind === 'event')
  assert.ok(events.length >= 6, `应有 ≥6 事件（5 数据 + [DONE]），实际 ${events.length}`)

  // 核心主张 C：计时统计真实产出
  const stats = fin.summary.stats
  assert.ok(Number.isFinite(stats.ttftMs) && stats.ttftMs >= 0, `TTFT 应存在：${JSON.stringify(stats)}`)
  assert.ok(Number.isFinite(stats.firstEventMs))
  assert.ok(stats.eventCount >= 6)
  assert.ok(stats.gaps && stats.gaps.count >= 5, `gap 统计应有样本：${JSON.stringify(stats.gaps)}`)
  assert.ok(stats.comments >= 1, '夹具的心跳注释行应被计数')

  // 内容正确性：多行 data 事件（第 2 个事件）
  const multi = events.find((f) => f.text && f.text.includes('第一行'))
  assert.ok(multi, '应有跨行 data 事件')
  assert.equal(multi.event, 'delta')
  assert.ok(multi.text.includes('第二行'))
  // [DONE] 终止事件
  assert.ok(events.some((f) => f.text === '[DONE]'))
  // id 字段透传
  assert.ok(events.some((f) => f.id === '3'))

  // 掩码：响应头不含明文（夹具头本无敏感值，但 authorization 不在响应头——校验投影不炸即可）
  assert.ok(fin.summary.frameCount >= events.length)
})

test('SSE: 错误 API key → 401 被如实呈现为握手失败（不吞错）', async () => {
  const open = await svcApi('POST', '/api/session/sse', {
    url: `${sseBase()}/sse?n=1`,
    method: 'POST',
    headers: { Authorization: 'Bearer wrong-key' },
  })
  assert.equal(open.status, 200)
  const id = open.json.session.id
  const fin = await waitFor(async () => {
    const d = await svcApi('GET', `/api/session/${id}?since=-1`)
    return d.json.summary.state === 'closed' ? d.json : null
  }, { label: 'sse 401' })
  assert.equal(fin.handshake.httpStatus, 401)
  assert.ok(fin.summary.closedReason.includes('401') || fin.frames.some((f) => f.kind === 'status' && f.httpStatus === 401))
})

test('SSE: 非 event-stream 响应按原始分块捕获（chunk 模式）', async () => {
  const open = await svcApi('POST', '/api/session/sse', {
    url: `${sseBase()}/raw`,
    headers: { Authorization: 'Bearer test-key-12345678' },
    durationMs: 10_000,
  })
  const id = open.json.session.id
  const fin = await waitFor(async () => {
    const d = await svcApi('GET', `/api/session/${id}?since=-1`)
    return d.json.summary.state === 'closed' ? d.json : null
  }, { label: 'raw done' })
  const chunks = fin.frames.filter((f) => f.kind === 'chunk')
  assert.ok(chunks.length >= 2, `应有分块帧：${chunks.length}`)
  assert.ok(chunks.some((c) => c.text && c.text.includes('chunk-1')))
  assert.ok(fin.summary.stats.chunkCount >= 2)
})

test('probe（同步一次性抓取）: samples + stats 一次拿全（MCP sse_capture 的底层）', async () => {
  const r = await svcApi('POST', '/api/probe', {
    url: `${sseBase()}/sse?n=3`,
    method: 'GET',
    headers: { Authorization: 'Bearer test-key-12345678' },
    durationMs: 10_000,
  }, true, 30_000)
  assert.equal(r.status, 200)
  assert.ok(r.json.summary.state === 'closed')
  assert.ok(r.json.stats.eventCount >= 4) // 3 数据 + [DONE]
  assert.ok(Array.isArray(r.json.samples) && r.json.samples.length >= 1)
  const s0 = r.json.samples[0]
  assert.ok(s0.json && s0.json.n === 1, `样本应自动 JSON 解析：${JSON.stringify(s0)}`)
})

test('设置读写回环 + 会话删除', async () => {
  const g = await svcApi('GET', '/api/settings')
  assert.equal(g.json.settings.maxFrames, 500)
  const p = await svcApi('POST', '/api/settings', { maxFrames: 800 })
  assert.equal(p.json.settings.maxFrames, 800)
  const p2 = await svcApi('POST', '/api/settings', { maxFrames: 99999999 })
  assert.equal(p2.json.settings.maxFrames, 5000, '应被 clamp 到上限')
  await svcApi('POST', '/api/settings', { maxFrames: 500 })

  const list = await svcApi('GET', '/api/sessions')
  assert.ok(list.json.sessions.length >= 4)
  const victim = list.json.sessions[list.json.sessions.length - 1].id
  const del = await svcApi('DELETE', `/api/session/${victim}`)
  assert.equal(del.json.ok, true)
  const after = await svcApi('GET', `/api/sessions`)
  assert.ok(!after.json.sessions.some((s) => s.id === victim))
})

// ── MCP stdio 闭环 ──────────────────────────────────────────────────────────

test('MCP: stdio 握手 + tools/list 七工具 + ws/sse 全链路调用', async () => {
  const mcp = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js')], {
    env: {
      ...process.env,
      STREAMDESK_SERVICE_URL: SERVICE_URL,
      STREAMDESK_SERVICE_TOKEN: TOKEN,
    },
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
  const call = (method, params, timeoutMs = 40_000) => new Promise((resolve, reject) => {
    const id = ++rpcId
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`MCP 调用超时：${method}`)) }, timeoutMs)
    pending.set(id, (msg) => { clearTimeout(t); resolve(msg) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })

  try {
    // initialize
    const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } })
    assert.equal(init.result.serverInfo.name, 'stream-desk')
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

    // tools/list：七个工具
    const tools = await call('tools/list', {})
    const names = tools.result.tools.map((t) => t.name)
    assert.deepEqual(names.sort(), ['session_list', 'sse_capture', 'transcript', 'ws_close', 'ws_connect', 'ws_send', 'ws_wait_frame'])

    // sse_capture：AI 一次调用拿全量体检
    const cap = await call('tools/call', {
      name: 'sse_capture',
      arguments: {
        url: `${sseBase()}/sse?n=3`,
        method: 'POST',
        headers: { Authorization: 'Bearer test-key-12345678' },
        durationMs: 8000,
      },
    })
    assert.ok(!cap.result.isError, `sse_capture 不应报错：${JSON.stringify(cap.result)}`)
    const capText = cap.result.content[0].text
    assert.ok(capText.includes('抓取结束'), capText)
    assert.ok(capText.includes('TTFT'), capText)
    assert.ok(capText.includes('事件间隔统计'), capText)
    assert.ok(capText.includes('token-1'), capText)

    // ws_connect → ws_send → ws_wait_frame → ws_close
    const conn = await call('tools/call', {
      name: 'ws_connect',
      arguments: { url: `ws://127.0.0.1:${PORT_WS}/ws`, headers: { 'x-test': 'yes', Authorization: 'Bearer ws-secret-1' } },
    })
    assert.ok(!conn.result.isError, `ws_connect 不应报错：${JSON.stringify(conn.result)}`)
    const connText = conn.result.content[0].text
    assert.ok(connText.includes('握手成功'), connText)
    const sid = /会话 (sd[a-z0-9]+)/.exec(connText)[1]

    await call('tools/call', { name: 'ws_send', arguments: { sessionId: sid, text: '来自 AI 的测试' } })
    const wait = await call('tools/call', { name: 'ws_wait_frame', arguments: { sessionId: sid, timeoutMs: 5000 } })
    const waitText = wait.result.content[0].text
    assert.ok(waitText.includes('来自 AI 的测试') || waitText.includes('echo'), `应等到 echo：${waitText}`)
    assert.ok(waitText.includes('cursor='), waitText)

    const closer = await call('tools/call', { name: 'ws_close', arguments: { sessionId: sid, code: 1000, reason: 'mcp smoke' } })
    assert.ok(!closer.result.isError)

    // transcript 读历史
    const tr = await call('tools/call', { name: 'transcript', arguments: { sessionId: sid } })
    assert.ok(!tr.result.isError)
    assert.ok(tr.result.content[0].text.includes('关闭'), tr.result.content[0].text)

    // session_list
    const lst = await call('tools/call', { name: 'session_list', arguments: {} })
    assert.ok(lst.result.content[0].text.includes('[ws]'), lst.result.content[0].text)

    // 未知工具 → isError
    const bad = await call('tools/call', { name: 'no_such_tool', arguments: {} })
    assert.ok(bad.result.isError)
  } finally {
    try { mcp.kill() } catch (_) { /* 忽略 */ }
  }
})

function sseBase() { return `http://127.0.0.1:${PORT_SSE}` }
