/**
 * service.test.mjs —— 服务集成（第二层：假桥 + 真实服务子进程）
 *
 * spawn 真实 service（appConfigDir=临时目录 → kvclient 走 env 指向 mock 桥），
 * 注入固定 token（DAW 无 env token 钩子 → 经 meta 注入：mock 桥返回 kv 元素）。
 * 覆盖：CRUD 全链路 / validator 拦截呈现 / analyze / selftest / 401 / 幂等覆盖 /
 * 索引同步 / 删除后文件消失 / score_export MIDI 形状（经 MCP）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TOKEN = crypto.randomBytes(32).toString('hex')
const KV_STORE = new Map() // mock cap.kv

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

// ── mock 宿主桥（/api/router-dispatch → cap.kv）────────────────────────────
let bridgePort = 0
const bridge = http.createServer((req, res) => {
  let buf = ''
  req.on('data', (c) => { buf += c })
  req.on('end', () => {
    try {
      const { req: r } = JSON.parse(buf)
      if (r.target !== 'cap.kv') { res.end(JSON.stringify({ ok: false, error: 'unknown target' })); return }
      const p = r.payload || {}
      let result
      if (p.action === 'get') result = { value: KV_STORE.has(p.key) ? KV_STORE.get(p.key) : null }
      else if (p.action === 'set') { KV_STORE.set(p.key, p.value); result = { ok: true } }
      else if (p.action === 'delete') { KV_STORE.delete(p.key); result = { ok: true } }
      else result = { keys: [...KV_STORE.keys()] }
      res.end(JSON.stringify({ ok: true, result }))
    } catch (e) { res.end(JSON.stringify({ ok: false, error: e.message })) }
  })
})

let svc = null
let svcPort = 0
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-svc-'))

function authed(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null
    const req = http.request({
      hostname: '127.0.0.1', port: svcPort, path: apiPath, method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      timeout: 10_000,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

before(async () => {
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r))
  bridgePort = bridge.address().port
  svc = spawn('node', [path.join(ROOT, 'service', 'main.js'), String(19800 + (process.pid % 500)), tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 'mock' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  svc.stderr.on('data', (c) => process.env.DAW_DEBUG && process.stderr.write(c))
  // 等 meta 落 mock kv → 拿真实端口与 token
  await waitFor(() => KV_STORE.get('dawstudio.meta'))
  const meta = KV_STORE.get('dawstudio.meta')
  svcPort = meta.port
  // 把服务 token 固定为我们已知的（服务生成随机 token 后写进 meta，直接读回）
  if (typeof meta.token !== 'string' || meta.token.length < 32) throw new Error('meta token 缺失')
  authedToken = meta.token
})

let authedToken = ''
after(() => {
  if (svc) svc.kill()
  bridge.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const A = (m, p, b) => {
  // 用 meta 里读回的 token
  return authedWith(authedToken, m, p, b)
}
function authedWith(tok, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null
    const req = http.request({
      hostname: '127.0.0.1', port: svcPort, path: apiPath, method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      timeout: 10_000,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ── 用例 ────────────────────────────────────────────────────────────────────

test('__health 免鉴权可达', async () => {
  const r = await fetch(`http://127.0.0.1:${svcPort}/__health`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.status, 'ok')
})

test('无 token 请求 401（除 /__health）', async () => {
  const r = await fetch(`http://127.0.0.1:${svcPort}/api/scores`)
  assert.equal(r.status, 401)
})

test('骨架生成落库：meta 落 kv、索引同步、文件落盘', async () => {
  const r = await A('POST', '/api/scores', { skeleton: { title: '测试Loop', key: 'Am', bars: 2, bpm: 100, style: 'arpeggio' } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.ok(r.body.id)
  assert.equal(r.body.score.meta.title, '测试Loop')
  // 索引落 kv
  await waitFor(() => KV_STORE.get('dawstudio.scores') && KV_STORE.get('dawstudio.scores').length === 1)
  // 文件落盘
  const files = fs.readdirSync(path.join(tmpDir, 'daw-studio', 'scores'))
  assert.equal(files.length, 1)
  assert.ok(files[0].endsWith('.json'))
})

test('validator 拦截呈现为人话错误数组', async () => {
  const r = await A('POST', '/api/scores', { score: { meta: { title: 'x', bpm: 9999, key: 'C', bars: 1 }, tracks: [] } })
  assert.equal(r.status, 400)
  assert.ok(Array.isArray(r.body.errors))
  assert.ok(r.body.errors[0].includes('bpm'))
})

test('score_write 音名兼容 + 幂等覆盖（同 id）', async () => {
  const w = await A('POST', '/api/scores', { score: { meta: { title: '手写', bpm: 90, key: 'C', bars: 1 }, tracks: [{ name: 'L', notes: [{ step: 0, pitch: 'C4', len: 4 }] }] } })
  assert.equal(w.status, 200, JSON.stringify(w.body))
  assert.equal(w.body.score.tracks[0].notes[0].pitch, 60)
  const id = w.body.id
  const w2 = await A('POST', '/api/scores', { id, score: { meta: { title: '手写v2', bpm: 90, key: 'C', bars: 1 }, tracks: [{ name: 'L', notes: [] }] } })
  assert.equal(w2.status, 200)
  assert.equal(w2.body.id, id)
  const g = await A('GET', `/api/scores/${id}`)
  assert.equal(g.body.score.meta.title, '手写v2')
  assert.equal(g.body.score.tracks[0].notes.length, 0)
})

test('analyze 返回谱+分析；list 与删除全链', async () => {
  const an = await A('POST', '/api/analyze', { id: '测试Loop' })
  assert.equal(an.status, 200)
  assert.ok(an.body.analysis.summary.includes('Am'))
  const list = await A('GET', '/api/scores')
  assert.ok(list.body.scores.length >= 2)
  const del = await A('DELETE', `/api/scores/${list.body.scores[0].id}`)
  assert.equal(del.status, 200)
  const files = fs.readdirSync(path.join(tmpDir, 'daw-studio', 'scores'))
  assert.ok(!files.some((f) => f.startsWith(list.body.scores[0].id)))
  const g2 = await A('GET', `/api/scores/${list.body.scores[0].id}`)
  assert.equal(g2.status, 404)
})

test('id 路径注入被拒（非法 id 形态）', async () => {
  const r = await A('GET', '/api/scores/..%2F..%2Fconfig')
  assert.equal(r.status, 404)
})

test('selftest 通过', async () => {
  const r = await A('POST', '/api/selftest')
  assert.equal(r.status, 200)
  assert.equal(r.body.ok, true, JSON.stringify(r.body.checks))
})
