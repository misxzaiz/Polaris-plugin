/**
 * mcp.test.mjs —— MCP server 冒烟（stdio JSON-RPC + env 钩子注入假服务地址）
 *
 * 起真服务子进程（同 bridge.test.mjs 的 mock bridge 供给 meta），再起 mcp/server.js
 * 子进程，env STACKLENS_SERVICE_URL/TOKEN 直连服务（bundle-lens/stream-desk 同款测试钩子）：
 *   ① initialize 握手 + tools/list 六工具；
 *   ② stack_resolve 全链路（还原率/逐帧三态/函数原名）；
 *   ③ maps_scan / map_locate / map_source / map_validate；
 *   ④ 未知工具 -32602；坏参数走 isError 文本不崩进程；
 *   ⑤ stack_resolve 缺 stack → isError。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFixtureDist, appStack } from './fixtures.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, opts) {
  const { timeoutMs = 30_000, step = 250, label = 'condition' } = opts || {}
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

const PORT_BRIDGE = 29710 + Math.floor(Math.random() * 100)
const PORT_SVC = 29810 + Math.floor(Math.random() * 100)
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`

const FIXTURE = buildFixtureDist()

// mock bridge（只供 meta 心跳；MCP 用 env 直连服务）
const kvStore = new Map()
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') { res.writeHead(200); res.end('{"ok":true}'); return }
  if (req.method === 'POST' && req.url === '/api/router-dispatch') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const { req: inner } = JSON.parse(body)
        const p = inner.payload || {}
        let result = {}
        if (p.action === 'get') result = { value: kvStore.has(p.key) ? kvStore.get(p.key) : undefined }
        else if (p.action === 'set') { kvStore.set(p.key, p.value); result = { ok: true } }
        else if (p.action === 'delete') { kvStore.delete(p.key); result = { ok: true } }
        else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: '未知 action' })); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result }))
      } catch (e) { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message })) }
    })
    return
  }
  res.writeHead(404)
  res.end()
})

let svcProc = null
let mcpProc = null
let mcpBuf = ''
const pending = new Map() // id → resolve

function mcpSend(msg) {
  return new Promise((resolve) => {
    const id = msg.id
    pending.set(id, resolve)
    mcpProc.stdin.write(JSON.stringify(msg) + '\n')
  })
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC), ''], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  svcProc.stderr.on('data', () => {})
  await waitFor(async () => {
    try { return (await fetch(`${SERVICE_URL}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
  await waitFor(() => kvStore.has('stacklens.meta'), { label: 'meta 落 kv' })

  mcpProc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), ''], {
    env: { ...process.env, STACKLENS_SERVICE_URL: SERVICE_URL, STACKLENS_SERVICE_TOKEN: kvStore.get('stacklens.meta').token },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  mcpProc.stdout.setEncoding('utf8')
  mcpProc.stdout.on('data', (chunk) => {
    mcpBuf += chunk
    let idx
    while ((idx = mcpBuf.indexOf('\n')) >= 0) {
      const line = mcpBuf.slice(0, idx).trim()
      mcpBuf = mcpBuf.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      } catch (_) { /* 忽略非 JSON 行 */ }
    }
  })
  mcpProc.stderr.on('data', () => {})

  const init = await mcpSend({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: {} })
  assert.equal(init.result.serverInfo.name, 'stack-lens')
  mcpProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
})

after(async () => {
  try { if (mcpProc) mcpProc.kill() } catch (_) {}
  try { if (svcProc) svcProc.kill() } catch (_) {}
  try { bridge.close() } catch (_) {}
  FIXTURE.cleanup()
})

async function call(name, args) {
  const res = await mcpSend({ jsonrpc: '2.0', id: `c-${name}-${Math.random().toString(36).slice(2, 7)}`, method: 'tools/call', params: { name, arguments: args || {} } })
  return res
}

test('tools/list：六工具齐', async () => {
  const res = await mcpSend({ jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} })
  const names = res.result.tools.map((t) => t.name)
  assert.deepEqual(names.sort(), ['map_locate', 'map_source', 'map_validate', 'maps_scan', 'stack_resolve', 'stack_resolve_file'])
})

test('stack_resolve：全链路还原（rate/三态/原名）', async () => {
  const res = await call('stack_resolve', { stack: appStack(FIXTURE.dir), mapPaths: [path.join(FIXTURE.dir, 'app.min.js.map')] })
  assert.ok(!res.error, `不应有 RPC 错误：${JSON.stringify(res.error)}`)
  assert.ok(!res.result.isError, `不应是工具错误：${res.result.content[0].text}`)
  const out = JSON.parse(res.result.content[0].text)
  assert.equal(out.summary.rate, 100)
  assert.equal(out.frames[0].state, 'resolved')
  assert.equal(out.frames[0].displayName, 'boom')
  assert.ok(out.reading.includes('✓'))
  assert.ok(out.reading.includes('src/app.ts:7:3'))
})

test('stack_resolve_file：从栈文件还原', async () => {
  const res = await call('stack_resolve_file', { stackPath: path.join(FIXTURE.dir, 'app.min.js').replace(/\.js$/, '.nonexist') })
  // 文件不存在 → isError 文本
  assert.equal(res.result.isError, true)
  // 真文件：用 vendor.min.js 当"栈文件"虽无栈——换真实场景：把栈写进临时文件
  const stackPath = path.join(FIXTURE.dir, 'error.log')
  fs.writeFileSync(stackPath, appStack(FIXTURE.dir), 'utf8')
  const res2 = await call('stack_resolve_file', { stackPath, mapsDir: FIXTURE.dir })
  const out = JSON.parse(res2.result.content[0].text)
  assert.equal(out.summary.rate, 100)
})

test('maps_scan / map_locate / map_source / map_validate 四件', async () => {
  const scan = await call('maps_scan', { dir: FIXTURE.dir })
  const scanOut = JSON.parse(scan.result.content[0].text)
  assert.equal(scanOut.maps.length, 3)

  const loc = await call('map_locate', { mapPath: path.join(FIXTURE.dir, 'app.min.js.map'), line: 2, col: 32 })
  const locOut = JSON.parse(loc.result.content[0].text)
  assert.equal(locOut.found, true)
  assert.equal(locOut.line, 7)
  assert.ok(locOut.reading.includes('src/app.ts:7:3'))

  const src = await call('map_source', { mapPath: path.join(FIXTURE.dir, 'app.min.js.map'), source: 'src/app.ts', line: 7 })
  const srcOut = JSON.parse(src.result.content[0].text)
  assert.ok(srcOut.codeFrame.includes('greet(undefined'))

  const val = await call('map_validate', { mapPath: path.join(FIXTURE.dir, 'app.min.js.map') })
  const valOut = JSON.parse(val.result.content[0].text)
  assert.equal(valOut.ok, true)
  assert.equal(valOut.stats.segCount, 3)
})

test('未知工具 -32602 / 坏参数 isError / 缺 stack isError', async () => {
  const unknown = await call('no_such_tool', {})
  assert.equal(unknown.error.code, -32602)

  const noStack = await call('stack_resolve', {})
  assert.equal(noStack.result.isError, true)
  assert.ok(noStack.result.content[0].text.includes('stack'))

  const noDir = await call('maps_scan', {})
  assert.equal(noDir.result.isError, true)

  const noMap = await call('map_locate', { line: 1, col: 1 })
  assert.equal(noMap.result.isError, true)
  // 进程仍存活
  const ping = await mcpSend({ jsonrpc: '2.0', id: 'ping-x', method: 'ping', params: {} })
  assert.ok(ping.result)
})

