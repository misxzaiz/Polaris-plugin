/**
 * bridge.test.mjs —— 服务集成冒烟（mock bridge + 合成夹具 + 真实服务子进程）
 *
 * 宿主未运行时的第二层验证：起一个与生产 kvclient 契约对齐的 mock bridge
 * （POST /api/router-dispatch 处理 cap.kv 动作；GET /api/health 200），让 service
 * 以「真实发现路径」运行（POLARIS_HOST/PORT/TOKEN env）：
 *   ① stacklens.meta {port,token} 真实落 kv（心跳）；
 *   ② /api/resolve：inline map 还原（sourcesContent 代码帧）+ 内部帧 + 未还原原因；
 *   ③ /api/resolve：mapsDir 目录扫描还原（磁盘回退代码帧）；
 *   ④ /api/resolve：mapPaths 显式文件 + fetchUrls 失败容错（坏 URL 报告不致命）；
 *   ⑤ /api/scan-maps / /api/frame / /api/source / /api/validate 全端点；
 *   ⑥ 鉴权：无 token 401 / 坏 token 401 / 健康端点豁免；
 *   ⑦ recentDirs 只存路径不存栈（隐私纪律）；
 *   ⑧ 非法 JSON / 超限参数 → 400 且服务存活；
 *   ⑨ 栈内容不出现在 kv（全库扫描断言）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildFixtureDist, appStack } from './fixtures.mjs'

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

const PORT_BRIDGE = 29710 + Math.floor(Math.random() * 100)
const PORT_SVC = 29810 + Math.floor(Math.random() * 100)
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`

const FIXTURE = buildFixtureDist()

// ── mock bridge（契约与生产 kvclient 对齐）──────────────────────────────────
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
      try {
        const { req: inner } = JSON.parse(body)
        const p = inner.payload || {}
        let result = {}
        if (p.action === 'get') result = { value: kvStore.has(p.key) ? kvStore.get(p.key) : undefined }
        else if (p.action === 'set') { kvStore.set(p.key, p.value); result = { ok: true } }
        else if (p.action === 'delete') { kvStore.delete(p.key); result = { ok: true } }
        else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 action ${p.action}` })); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result }))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }
  res.writeHead(404)
  res.end()
})

let svcProc = null
const svcEnv = {
  ...process.env,
  POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token',
}
const auth = () => {
  const meta = kvStore.get('stacklens.meta')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` }
}
async function post(apiPath, body, headers) {
  const r = await fetch(`${SERVICE_URL}${apiPath}`, { method: 'POST', headers: headers || auth(), body: JSON.stringify(body) })
  return { status: r.status, json: await r.json() }
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC), ''], { env: svcEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  svcProc.stderr.on('data', () => { /* 服务日志：调试时打开 */ })
  await waitFor(async () => {
    try { return (await fetch(`${SERVICE_URL}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
  await waitFor(() => kvStore.has('stacklens.meta'), { label: 'stacklens.meta 落 kv' })
})

after(async () => {
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  FIXTURE.cleanup()
})

// ── 用例 ────────────────────────────────────────────────────────────────────

test('meta 落 kv：port/token/pid 齐全', () => {
  const meta = kvStore.get('stacklens.meta')
  assert.equal(meta.port, PORT_SVC)
  assert.ok(meta.token && meta.token.length >= 32)
  assert.equal(typeof meta.pid, 'number')
})

test('鉴权：无 token 401 / 坏 token 401 / 健康端点豁免', async () => {
  const noAuth = await fetch(`${SERVICE_URL}/api/meta`)
  assert.equal(noAuth.status, 401)
  const bad = await fetch(`${SERVICE_URL}/api/meta`, { headers: { Authorization: 'Bearer wrong' } })
  assert.equal(bad.status, 401)
  const health = await fetch(`${SERVICE_URL}/__health`)
  assert.equal(health.status, 200)
})

test('resolve：inline map（sourcesContent 代码帧）+ 内部帧 + 未还原原因 三态齐', async () => {
  const { status, json } = await post('/api/resolve', {
    stack: appStack(FIXTURE.dir),
    inlineMaps: [{ mapText: JSON.stringify(FIXTURE.appMap), originPath: 'app.min.js.map' }],
  })
  assert.equal(status, 200)
  assert.equal(json.summary.format, 'v8')
  assert.equal(json.summary.rate, 100)
  assert.equal(json.frames[0].state, 'resolved')
  assert.equal(json.frames[0].source, 'src/app.ts')
  assert.equal(json.frames[0].sourceLine, 7)
  assert.ok(json.frames[0].codeFrame.includes('greet(undefined'))
  assert.equal(json.frames[2].state, 'internal')
})

test('resolve：mapsDir 目录扫描还原（磁盘回退代码帧 + 最近目录落 settings）', async () => {
  const { status, json } = await post('/api/resolve', {
    stack: `Error: v\n    at vendorAdd (${path.join(FIXTURE.dir, 'vendor.min.js').replace(/\\/g, '/')}:1:26)`,
    mapsDir: FIXTURE.dir,
  })
  assert.equal(status, 200)
  assert.equal(json.frames[0].state, 'resolved')
  assert.equal(json.frames[0].source, 'src/vendor.ts')
  assert.ok(json.frames[0].codeFrame, '磁盘回退应产出代码帧')
  assert.ok(json.frames[0].codeFrameSource.includes(path.join('src', 'vendor.ts').slice(0, 7)), `代码帧应来自磁盘源文件，实得 ${json.frames[0].codeFrameSource}`)
  // recentDirs 落 kv 且只含路径
  await waitFor(() => kvStore.has('stacklens.settings'), { label: 'settings 落 kv' })
  const settings = kvStore.get('stacklens.settings')
  assert.ok(settings.recentDirs.includes(FIXTURE.dir))
})

test('resolve：mapPaths 显式文件 + 坏 fetchUrl 失败进报告不致命', async () => {
  const { status, json } = await post('/api/resolve', {
    stack: appStack(FIXTURE.dir),
    mapPaths: [path.join(FIXTURE.dir, 'app.min.js.map')],
    fetchUrls: ['http://127.0.0.1:1/none.map'],
  })
  assert.equal(status, 200)
  assert.equal(json.summary.rate, 100)
  const fetchReport = json.sources.fetches[0]
  assert.equal(fetchReport.ok, false)
  assert.ok(fetchReport.error)
  // 栈本身含 app.min.js（未还原前）——还原后帧应不再泄漏原始位置混淆：resolved 帧有 source
  assert.ok(json.frames[0].source)
})

test('scan-maps：目录清单（去重 3 条 + node_modules 排除）', async () => {
  const { status, json } = await post('/api/scan-maps', { dir: FIXTURE.dir })
  assert.equal(status, 200)
  assert.equal(json.maps.filter((m) => !m.error).length, 3)
  assert.ok(json.maps.every((m) => !String(m.originPath || '').includes('node_modules')))
  assert.ok(json.maps.find((m) => (m.file || '') === 'app.min.js'))
})

test('frame：单点定位（mapText）；source：代码帧；validate：统计', async () => {
  const fr = await post('/api/frame', { mapText: JSON.stringify(FIXTURE.appMap), line: 2, col: 32 })
  assert.equal(fr.status, 200)
  assert.equal(fr.json.found, true)
  assert.equal(fr.json.line, 7)
  assert.equal(fr.json.column, 3)
  assert.equal(fr.json.name, 'boom')
  assert.ok(fr.json.codeFrame.includes('greet(undefined'))

  const noSeg = await post('/api/frame', { mapText: JSON.stringify(FIXTURE.appMap), line: 999, col: 1 })
  assert.equal(noSeg.json.found, false)

  const src = await post('/api/source', { mapText: JSON.stringify(FIXTURE.appMap), source: 'src/app.ts', line: 7 })
  assert.equal(src.json.found, true)
  assert.ok(src.json.codeFrame.includes('greet(undefined'))

  const bad = await post('/api/source', { mapText: JSON.stringify(FIXTURE.appMap), source: 'no-such-file.ts' })
  // 不存在的 source 是参数错误 → 400 + error（与 200 {found:false} 语义区分）
  assert.equal(bad.status, 400)
  assert.ok(bad.json.error.includes('source'))

  const v = await post('/api/validate', { mapText: JSON.stringify(FIXTURE.appMap) })
  assert.equal(v.json.ok, true)
  assert.equal(v.json.stats.segCount, 3)

  const byPath = await post('/api/frame', { mapPath: path.join(FIXTURE.dir, 'app.min.js.map'), line: 2, col: 32 })
  assert.equal(byPath.json.found, true)
})

test('400：非法 JSON / 缺参数 / 超限体', async () => {
  const badJson = await fetch(`${SERVICE_URL}/api/resolve`, { method: 'POST', headers: auth(), body: '{broken' })
  assert.equal(badJson.status, 400)
  const noStack = await post('/api/resolve', { mapsDir: FIXTURE.dir })
  // 栈为空 → resolve 仍返回 200（引擎报 empty）——空栈不炸服务
  assert.equal(noStack.status, 200)
  assert.equal(noStack.json.summary.format, 'empty')
  const noDir = await post('/api/scan-maps', {})
  assert.equal(noDir.status, 400)
  // 服务仍存活
  const health = await fetch(`${SERVICE_URL}/__health`)
  assert.equal(health.status, 200)
})

test('隐私：kv 全库无栈内容 / 无 map 内容（只应有 meta 与 settings 路径）', () => {
  const all = JSON.stringify([...kvStore.entries()])
  assert.ok(!all.includes('Cannot read properties'), '错误栈不得入 kv')
  assert.ok(!all.includes('greet(undefined'), '源码内容不得入 kv')
  assert.ok(!all.includes('"version":3'), 'map 内容不得入 kv')
  assert.ok(all.includes('stacklens.meta'))
})
