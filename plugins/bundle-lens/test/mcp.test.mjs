/**
 * mcp.test.mjs —— MCP stdio 冒烟（假桥 + 真实 service 子进程 + 真实 mcp 子进程）
 *
 * 全链路：mcp/server.js 经 env 测试钩子（BUNDLELENS_SERVICE_URL/TOKEN，yizhou/
 * stream-desk 先例）直连 bridge.test.mjs 同款 mock bridge 拉起的服务，走
 * JSON-RPC：initialize → tools/list（8 工具）→ bundle_scan → bundle_packages
 * → bundle_duplicates → bundle_chunks → bundle_diff（无历史时明确报错）→
 * bundle_runs → bundle_selftest。扫描编排与断言口径与 bridge.test.mjs 一致。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { buildFixtureDist } from './fixtures.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 30_000, step = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

const PORT_BRIDGE = 29910 + Math.floor(Math.random() * 50)
const PORT_SVC = 29960 + Math.floor(Math.random() * 30)
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`
const FIXTURE = buildFixtureDist()

const kvStore = new Map()
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'POST' && req.url === '/api/router-dispatch') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const { req: inner } = JSON.parse(body)
      const p = inner.payload || {}
      let result = {}
      if (p.action === 'get') result = { value: kvStore.has(p.key) ? kvStore.get(p.key) : undefined }
      else if (p.action === 'set') { kvStore.set(p.key, p.value); result = { ok: true } }
      else if (p.action === 'delete') { kvStore.delete(p.key); result = { ok: true } }
      else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 action` })); return }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result }))
    })
    return
  }
  res.writeHead(404); res.end()
})

let svcProc = null
let mcpProc = null
let mcpRl = null
const pending = new Map()
let rpcSeq = 0

function mpcCall(method, params, timeoutMs = 300_000) {
  const id = ++rpcSeq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP 响应超时：${method}`)) }, timeoutMs)
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject })
    mcpProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC), ''], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitFor(async () => {
    try { return (await fetch(`${SERVICE_URL}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })

  mcpProc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), ''], {
    // 不注入 BUNDLELENS_SERVICE_URL 钩子——走真实发现路径：
    // kvclient（env 定位 mock bridge）→ cap.kv 读 bundlelens.meta 拿服务真 token
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  mcpRl = readline.createInterface({ input: mcpProc.stdout })
  mcpRl.on('line', (line) => {
    let msg
    try { msg = JSON.parse(line) } catch (_) { return }
    if (msg && msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      p.resolve(msg)
    }
  })
  mcpProc.stderr.on('data', () => { /* 调试时打开 */ })
  // 就绪探活：直接 await 一次 ping（响应即 stdin/stdout 链路通）
  await waitFor(async () => {
    try { const r = await mpcCall('ping', {}, 2500); return r && r.id > 0 } catch (_) { return false }
  }, { timeoutMs: 15_000, step: 300, label: 'mcp boot' })
})

after(async () => {
  try { if (mcpProc) mcpProc.kill() } catch (_) { /* 忽略 */ }
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  FIXTURE.cleanup()
})

test('initialize + tools/list：8 工具齐备', async () => {
  const init = await mpcCall('initialize', { protocolVersion: '2024-11-05' })
  assert.equal(init.result.serverInfo.name, 'bundle-lens')
  const list = await mpcCall('tools/list', {})
  const names = list.result.tools.map((t) => t.name)
  assert.deepEqual(names.sort(), ['bundle_chunks', 'bundle_diff', 'bundle_duplicates', 'bundle_packages', 'bundle_report', 'bundle_runs', 'bundle_scan', 'bundle_selftest'].sort())
})

test('bundle_scan：同步返回摘要且归因对上夹具', async () => {
  const r = await mpcCall('tools/call', { name: 'bundle_scan', arguments: { path: FIXTURE.dir } })
  assert.ok(!r.result.isError, `工具应成功：${JSON.stringify(r.result).slice(0, 300)}`)
  const out = JSON.parse(r.result.content[0].text)
  assert.equal(out.totals.chunks, FIXTURE.expectations.chunks)
  const lodash = out.topPackages.find((p) => p.name === 'lodash')
  assert.ok(lodash, 'Top10 含 lodash')
  assert.match(out.reading, /同包多份安装/)
})

test('bundle_packages：filter 与 topN 生效', async () => {
  const r = await mpcCall('tools/call', { name: 'bundle_packages', arguments: { filter: 'lo', topN: 5 } })
  const out = JSON.parse(r.result.content[0].text)
  assert.ok(out.packages.every((p) => p.name.toLowerCase().includes('lo')), '过滤生效')
  assert.ok(out.packages.some((p) => p.name === 'lodash'))
})

test('bundle_duplicates：版本冲突读数可见', async () => {
  const r = await mpcCall('tools/call', { name: 'bundle_duplicates', arguments: {} })
  const out = JSON.parse(r.result.content[0].text)
  assert.match(out.reading, /lodash/)
  assert.match(out.reading, /4\.17\.20/)
})

test('bundle_chunks：4+ chunk 清单带映射率', async () => {
  const r = await mpcCall('tools/call', { name: 'bundle_chunks', arguments: {} })
  const out = JSON.parse(r.result.content[0].text)
  assert.equal(out.chunks.length, FIXTURE.expectations.chunks)
  assert.match(out.reading, /无 map/)
})

test('bundle_diff：显式双 runId 对比全 0', async () => {
  const runs = await mpcCall('tools/call', { name: 'bundle_runs', arguments: {} })
  const { runs: list } = JSON.parse(runs.result.content[0].text)
  const oks = list.filter((x) => x.status === 'ok')
  assert.ok(oks.length >= 1)
  // 再扫一次拿两个 run
  const scan2 = await mpcCall('tools/call', { name: 'bundle_scan', arguments: { path: FIXTURE.dir } })
  assert.ok(!scan2.result.isError)
  const runs2 = JSON.parse((await mpcCall('tools/call', { name: 'bundle_runs', arguments: {} })).result.content[0].text)
  const oks2 = runs2.runs.filter((x) => x.status === 'ok')
  const a = oks2[oks2.length - 1]
  const b = oks2[0]
  const d = await mpcCall('tools/call', { name: 'bundle_diff', arguments: { runIdA: a.runId, runIdB: b.runId } })
  const out = JSON.parse(d.result.content[0].text)
  assert.equal(out.diff.totalDelta, 0)
  assert.match(out.reading, /总体积/)
})

test('bundle_selftest：离线全链路全绿', async () => {
  const r = await mpcCall('tools/call', { name: 'bundle_selftest', arguments: {} }, 150_000)
  const out = JSON.parse(r.result.content[0].text)
  assert.equal(out.ok, true, JSON.stringify(out.failed || []))
})

test('错误路径：bundle_scan 坏目录 → isError 文本错误', async () => {
  const r = await mpcCall('tools/call', { name: 'bundle_scan', arguments: { path: FIXTURE.dir + '/nope' } })
  assert.equal(r.result.isError, true)
  assert.match(r.result.content[0].text, /错误：/)
})
