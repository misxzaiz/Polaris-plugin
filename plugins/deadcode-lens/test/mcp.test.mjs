// mcp.test.mjs —— MCP 全链路测试：stdio JSON-RPC → 真服务子进程 → 完整扫描链
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const MCP = join(import.meta.dirname, '..', 'mcp', 'server.js')
const SERVICE = join(import.meta.dirname, '..', 'service', 'main.js')

// mock cap.kv bridge（同 service.test.mjs 口径）
function startMockBridge() {
  const store = new Map()
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const { req: inner } = JSON.parse(body || '{}')
      const { action, key, value } = inner.payload || {}
      if (action === 'get') res.end(JSON.stringify({ ok: true, result: { value: store.has(key) ? store.get(key) : null } }))
      else if (action === 'set') { store.set(key, value === undefined ? null : value); res.end(JSON.stringify({ ok: true, result: { ok: true } })) }
      else if (action === 'delete') { store.delete(key); res.end(JSON.stringify({ ok: true, result: { ok: true } })) }
      else if (action === 'list') res.end(JSON.stringify({ ok: true, result: { keys: [...store.keys()] } }))
      else res.end(JSON.stringify({ ok: false, error: 'bad action' }))
    })
  })
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, store }))
  })
}

function jsonHttp(port, path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data) }
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (_) { resolve(null) } })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dcl-mcp-'))
  const w = (rel, content) => {
    const p = join(dir, rel)
    mkdirSync(p.slice(0, p.lastIndexOf(join.sep)), { recursive: true })
    writeFileSync(p, content)
  }
  w('package.json', JSON.stringify({ name: 'mcpfix', main: 'index.js', dependencies: { deaddep: '^1.0.0' } }))
  w('index.js', "import { a } from './lib'\nimport './extra'\nexport const m = a")
  w('lib.js', 'export const a = 1')
  w('extra.js', 'export const unusedThing = 5') // side-effect 引用：文件活、导出死
  w('orphan.js', 'export const dead = 2')
  return dir
}

test('MCP 全链路：initialize/tools 列表/六工具逐一调用/未知工具报错', { timeout: 60_000 }, async () => {
  const bridge = await startMockBridge()
  const fixture = buildFixture()
  const cfg = mkdtempSync(join(tmpdir(), 'dcl-mcp-cfg-'))
  const svcPort = 10400 + Math.floor(Math.random() * 400)

  // 1) 起服务
  const svc = spawn(process.execPath, [SERVICE, String(svcPort), cfg], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: 't' },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  // 等 meta 就绪（拿到真 token 再起 MCP——spawn env 值会被字符串化，null 变 'null'）
  for (let i = 0; i < 50; i++) {
    if (bridge.store.get('deadlens.meta')) break
    await new Promise((r) => setTimeout(r, 200))
  }
  const token0 = (bridge.store.get('deadlens.meta') || {}).token
  // 2) 起 MCP（env 直连服务，绕过 kv 发现——house 测试钩子先例）
  const mcp = spawn(process.execPath, [MCP, cfg], {
    env: {
      ...process.env,
      DEADLENS_SERVICE_URL: `http://127.0.0.1:${svcPort}`,
      DEADLENS_SERVICE_TOKEN: token0 || '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let mcpErr = ''
  mcp.stderr.on('data', (c) => { mcpErr += c })

  const lines = []
  let pending = []
  let resolvers = []
  mcp.stdout.setEncoding('utf8')
  mcp.stdout.on('data', (chunk) => {
    pending.push(chunk)
    let all = pending.join('')
    let idx
    while ((idx = all.indexOf('\n')) >= 0) {
      const line = all.slice(0, idx).trim()
      all = all.slice(idx + 1)
      if (line) {
        try { lines.push(JSON.parse(line)); resolvers.shift()?.(lines[lines.length - 1]) } catch (_) { /* 忽略 */ }
      }
    }
    pending = [all]
  })

  function rpc(method, params, timeoutMs = 70_000) {
    return new Promise((resolve, reject) => {
      const id = `i${Date.now()}${Math.random().toString(36).slice(2, 5)}`
      const timer = setTimeout(() => reject(new Error(`RPC 超时 ${method}（stderr: ${mcpErr.slice(-300)}）`)), timeoutMs)
      resolvers.push((msg) => { clearTimeout(timer); resolve(msg) })
      mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      void id
    })
  }

  try {
    // 等服务健康
    for (let i = 0; i < 50; i++) {
      try { if ((await jsonHttp(svcPort, '/__health')).ok) break } catch (_) { /* 重试 */ }
      await new Promise((r) => setTimeout(r, 200))
    }
    const token = (bridge.store.get('deadlens.meta') || {}).token
    assert.ok(token, 'meta 应就绪')

    // initialize
    const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test' } })
    assert.equal(init.result.serverInfo.name, 'deadcode-lens')

    // tools/list：六工具
    const list = await rpc('tools/list', {})
    const names = list.result.tools.map((t) => t.name).sort()
    assert.deepEqual(names, ['dl_findings', 'dl_report', 'dl_runs', 'dl_scan', 'dl_selftest', 'dl_why'])

    // dl_scan（同步等待完成）
    const scan = await rpc('tools/call', { name: 'dl_scan', arguments: { root: fixture } })
    const scanOut = JSON.parse(scan.result.content[0].text)
    assert.equal(scanOut.counts.orphanFiles, 1)
    assert.ok(scanOut.topFiles.some((f) => f.path === 'orphan.js'))

    // dl_findings：files / exports / deps / 未指定 kind
    const fFiles = JSON.parse((await rpc('tools/call', { name: 'dl_findings', arguments: { kind: 'files' } })).result.content[0].text)
    assert.equal(fFiles.total, 1)
    assert.equal(fFiles.items[0].path, 'orphan.js')
    const fDeps = JSON.parse((await rpc('tools/call', { name: 'dl_findings', arguments: { kind: 'deps' } })).result.content[0].text)
    assert.ok(fDeps.items.some((d) => d.name === 'deaddep'))
    const fQ = JSON.parse((await rpc('tools/call', { name: 'dl_findings', arguments: { kind: 'exports', q: 'unusedThing' } })).result.content[0].text)
    assert.equal(fQ.total, 1)
    assert.equal(fQ.items[0].path, 'extra.js')
    const fNone = JSON.parse((await rpc('tools/call', { name: 'dl_findings', arguments: {} })).result.content[0].text)
    assert.ok(fNone.counts)

    // dl_why：死文件与活文件
    const whyDead = JSON.parse((await rpc('tools/call', { name: 'dl_why', arguments: { path: 'orphan.js' } })).result.content[0].text)
    assert.equal(whyDead.verdict, '死文件（零引用）')
    const whyLive = JSON.parse((await rpc('tools/call', { name: 'dl_why', arguments: { path: 'lib.js' } })).result.content[0].text)
    assert.equal(whyLive.verdict, '可达')
    assert.ok(whyLive.exportsUsed.includes('a'))

    // dl_report / dl_runs / dl_selftest
    const rep = JSON.parse((await rpc('tools/call', { name: 'dl_report', arguments: {} })).result.content[0].text)
    assert.equal(rep.report.counts.files, 5)
    const runs = JSON.parse((await rpc('tools/call', { name: 'dl_runs', arguments: {} })).result.content[0].text)
    assert.ok(runs.runs.length >= 1)
    const st = JSON.parse((await rpc('tools/call', { name: 'dl_selftest', arguments: {} })).result.content[0].text)
    assert.equal(st.ok, true)
    assert.equal(st.total, 15)

    // 未知工具 → JSON-RPC error
    const bad = await rpc('tools/call', { name: 'nope', arguments: {} })
    assert.ok(bad.error)

    // 缺参数 → error
    const missing = await rpc('tools/call', { name: 'dl_scan', arguments: {} })
    assert.ok(missing.error)
  } finally {
    mcp.kill()
    svc.kill()
    bridge.srv.close()
    rmSync(fixture, { recursive: true, force: true })
    rmSync(cfg, { recursive: true, force: true })
  }
})
