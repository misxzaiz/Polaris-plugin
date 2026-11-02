// service.test.mjs —— 服务集成测试：mock bridge（kv）+ 真实子进程 + HTTP 全链路
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SERVICE = join(import.meta.dirname, '..', 'service', 'main.js')

// ── mock cap.kv bridge（内存 kv，应答 /api/router-dispatch） ────────────────
function startMockBridge() {
  const store = new Map()
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const { req: inner } = JSON.parse(body || '{}')
        if (inner && inner.target === 'cap.kv') {
          const { action, key, value } = inner.payload || {}
          if (action === 'get') {
            const v = store.has(key) ? store.get(key) : null
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, result: { value: v } }))
          } else if (action === 'set') {
            store.set(key, value === undefined ? null : value)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, result: { ok: true } }))
          } else if (action === 'delete') {
            store.delete(key)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, result: { ok: true } }))
          } else if (action === 'list') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, result: { keys: [...store.keys()] } }))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: `未知 action ${action}` }))
          }
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'mock bridge 只支持 cap.kv' }))
      } catch (e) {
        res.writeHead(500)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
  })
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, store }))
  })
}

function httpJson(base, path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data) }
    const req = http.request({ hostname: '127.0.0.1', port: base, path, method, headers }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }) }
        catch (_) { resolve({ status: res.statusCode, json: null }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function waitHealth(port, timeoutMs = 10_000) {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      httpJson(port, '/__health').then((r) => {
        if (r.status === 200) return resolve(r.json)
        if (Date.now() - t0 > timeoutMs) return reject(new Error('健康检查超时'))
        setTimeout(tick, 300)
      }).catch(() => {
        if (Date.now() - t0 > timeoutMs) return reject(new Error('健康检查超时'))
        setTimeout(tick, 300)
      })
    }
    tick()
  })
}

// 磁盘 fixture（真实 fs——服务走真走查）
function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dcl-svc-'))
  const w = (rel, content) => {
    const p = join(dir, rel)
    mkdirSync(p.slice(0, p.lastIndexOf(join.sep)), { recursive: true })
    writeFileSync(p, content)
  }
  w('package.json', JSON.stringify({ name: 'svcfix', main: 'index.js', dependencies: { unusedpkg: '^1.0.0' } }))
  w('index.js', "import { a } from './lib'\nimport { ghost } from './nope'\nimport { a as ca } from './cycle-a'\nexport const main = a + ghost + ca()")
  w('lib.js', 'export const a = 1')
  w('orphan.js', 'export const dead = 2')
  w('cycle-a.js', "import { b } from './cycle-b'\nexport const a = () => b()")
  w('cycle-b.js', "import { a } from './cycle-a'\nexport const b = () => a()")
  return dir
}

test('服务集成：健康/鉴权/扫描/进度/报告/kv 投影/why/自检/设置', { timeout: 60_000 }, async () => {
  const bridge = await startMockBridge()
  const fixture = buildFixture()
  const cfgDir = mkdtempSync(join(tmpdir(), 'dcl-cfg-'))
  const svcPort = 9884 + Math.floor(Math.random() * 500) // 避开固定端口冲突（与真实宿主服务错开）

  const child = spawn(process.execPath, [SERVICE, String(svcPort), cfgDir], {
    env: {
      ...process.env,
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: String(bridge.port),
      POLARIS_TOKEN: 'test-token',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (c) => { stderr += c })

  try {
    // 健康检查（免鉴权）
    const health = await waitHealth(svcPort)
    assert.equal(health.ok, true)
    assert.equal(health.live, true)

    // 未授权 → 401
    const unauth = await httpJson(svcPort, '/api/latest')
    assert.equal(unauth.status, 401)

    // 错误 token → 401
    const badTok = await httpJson(svcPort, '/api/latest', { token: 'wrong' })
    assert.equal(badTok.status, 401)

    // 等 meta 写入 mock kv（服务启动时异步写入）
    let meta = null
    for (let i = 0; i < 40; i++) {
      meta = bridge.store.get('deadlens.meta') || null
      if (meta) break
      await new Promise((r) => setTimeout(r, 250))
    }
    assert.ok(meta, 'deadlens.meta 应写入 kv')
    assert.equal(meta.port, svcPort)

    // 缺参数 → 400
    const noRoot = await httpJson(svcPort, '/api/scan', { method: 'POST', body: {}, token: meta.token })
    assert.equal(noRoot.status, 400)

    // 不存在的根 → 扫描失败终态
    const badRoot = await httpJson(svcPort, '/api/scan', { method: 'POST', body: { root: 'Z:/definitely/not/exists' }, token: meta.token })
    assert.equal(badRoot.status, 202)
    let st = null
    for (let i = 0; i < 40; i++) {
      st = (await httpJson(svcPort, `/api/run/${badRoot.json.runId}`, { token: meta.token })).json.run
      if (st.status === 'error') break
      await new Promise((r) => setTimeout(r, 300))
    }
    assert.equal(st.status, 'error')

    // 正常扫描
    const scan = await httpJson(svcPort, '/api/scan', { method: 'POST', body: { root: fixture }, token: meta.token })
    assert.equal(scan.status, 202)
    let done = null
    for (let i = 0; i < 80; i++) {
      done = (await httpJson(svcPort, `/api/run/${scan.json.runId}`, { token: meta.token })).json.run
      if (done.status === 'done' || done.status === 'error') break
      await new Promise((r) => setTimeout(r, 300))
    }
    assert.equal(done.status, 'done', `扫描应完成: ${stderr.slice(-500)}`)

    // 报告内容
    const rep = (await httpJson(svcPort, `/api/report/${scan.json.runId}`, { token: meta.token })).json.report
    assert.equal(rep.counts.orphanFiles, 1, '只有 orphan.js 是死文件')
    assert.ok(rep.orphanFiles.some((o) => o.path === 'orphan.js' && o.reason === 'no-importer'))
    assert.ok(rep.unresolvedImports.some((u) => u.specifier === './nope'))
    assert.equal(rep.cycles.length, 1, 'cycle-a/b 应成环')
    assert.ok(rep.deps.unused.some((d) => d.name === 'unusedpkg'))
    assert.ok(rep.meta.entries.some((e) => e.path === 'index.js'))

    // kv 投影：latest / runs / report.<id>
    for (let i = 0; i < 20; i++) {
      if (bridge.store.get('deadlens.latest') === scan.json.runId) break
      await new Promise((r) => setTimeout(r, 300))
    }
    if (process.env.DCL_DBG) {
      console.log('DBG store keys:', [...bridge.store.keys()])
      console.log('DBG latest:', bridge.store.get('deadlens.latest'), 'want:', scan.json.runId)
      console.log('DBG svc stderr:', stderr.slice(-800))
    }
    assert.equal(bridge.store.get('deadlens.latest'), scan.json.runId)
    const runsKv = bridge.store.get('deadlens.runs')
    assert.ok(Array.isArray(runsKv) && runsKv.some((x) => x.id === scan.json.runId))
    assert.ok(bridge.store.has(`deadlens.report.${scan.json.runId}`))

    // latest 路由返回该 runId
    const latest = (await httpJson(svcPort, '/api/latest', { token: meta.token })).json
    assert.equal(latest.runId, scan.json.runId)

    // why：死文件证据
    const why = (await httpJson(svcPort, '/api/why', { method: 'POST', body: { path: 'orphan.js' }, token: meta.token })).json.why
    assert.equal(why.verdict, '死文件（零引用）')
    assert.equal(why.reachable, false)
    // why：活文件证据
    const whyLib = (await httpJson(svcPort, '/api/why', { method: 'POST', body: { path: 'lib.js' }, token: meta.token })).json.why
    assert.equal(whyLib.verdict, '可达')
    assert.ok(whyLib.exportsUsed.includes('a'))

    // 自检
    const st2 = (await httpJson(svcPort, '/api/selftest', { method: 'POST', body: {}, token: meta.token })).json.selftest
    assert.equal(st2.ok, true)

    // 设置 roundtrip
    const save = await httpJson(svcPort, '/api/settings', { method: 'POST', body: { root: fixture, ignorePrefixes: ['vendor/'] }, token: meta.token })
    assert.equal(save.json.settings.recentRoots[0], fixture)
    const load = (await httpJson(svcPort, '/api/settings', { token: meta.token })).json.settings
    assert.deepEqual(load.ignorePrefixes, ['vendor/'])
  } finally {
    child.kill()
    bridge.srv.close()
    rmSync(fixture, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
  }
})
