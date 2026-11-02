/**
 * mcp.test.mjs —— MCP 全链路（第三层离线验证）
 *
 * spawn 真实 MCP server + 真实服务子进程（mock 桥 + 临时数据根），
 * MCP 不带测试钩子 → 走 kv→meta→127.0.0.1 直连的完整生产发现链。
 * 七工具逐个调用断言：score_create / score_write / score_get / score_list /
 * score_analyze / score_delete / score_export（midi 形状 + json）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const KV_STORE = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 20_000, step = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

// ── mock 宿主桥 ─────────────────────────────────────────────────────────────
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
let mcp = null
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-mcp-'))

// MCP stdio 客户端（生产发现链：不注入 DAW_SERVICE_URL）
let mcpBuf = ''
const pending = new Map()
let rpcId = 0

function mcpCall(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId
    pending.set(id, { resolve, reject })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`MCP 调用超时: ${method}`)) } }, 15_000)
  })
}

before(async () => {
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r))
  bridgePort = bridge.address().port
  const env = { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 'mock' }
  svc = spawn('node', [path.join(ROOT, 'service', 'main.js'), String(24800 + (process.pid % 500)), tmpDir], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  svc.stderr.on('data', () => { /* 安静 */ })
  await waitFor(() => KV_STORE.get('dawstudio.meta'), { label: 'service meta' })

  mcp = spawn('node', [path.join(ROOT, 'mcp', 'server.js'), tmpDir], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  mcp.stdout.setEncoding('utf8')
  mcp.stdout.on('data', (c) => {
    mcpBuf += c
    for (;;) {
      const i = mcpBuf.indexOf('\n')
      if (i < 0) break
      const line = mcpBuf.slice(0, i).trim()
      mcpBuf = mcpBuf.slice(i + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id).resolve(msg); pending.delete(msg.id) }
      } catch (_) { /* 忽略 */ }
    }
  })
  await mcpCall('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
})

after(() => {
  if (mcp) mcp.kill()
  if (svc) svc.kill()
  bridge.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function textOf(msg) {
  assert.ok(msg.result && msg.result.content, JSON.stringify(msg))
  assert.equal(msg.result.isError, undefined, msg.result.content[0].text)
  return msg.result.content[0].text
}

// ── 用例 ────────────────────────────────────────────────────────────────────

test('tools/list：七工具且 schema 齐全', async () => {
  const msg = await mcpCall('tools/list', {})
  const names = msg.result.tools.map((t) => t.name)
  assert.deepEqual(names, ['score_create', 'score_write', 'score_get', 'score_list', 'score_analyze', 'score_delete', 'score_export'])
  for (const t of msg.result.tools) {
    assert.ok(t.description, `${t.name} 缺 description`)
    assert.ok(t.inputSchema, `${t.name} 缺 inputSchema`)
  }
})

test('score_create → analyze → 自查闭环（轨外音报出）', async () => {
  const msg = await mcpCall('tools/call', { name: 'score_create', arguments: { title: 'AI旋律', key: 'Am', bars: 4, style: 'melody' } })
  const r = JSON.parse(textOf(msg))
  assert.ok(r.id)
  assert.equal(r.score.meta.key, 'Am')
  const an = JSON.parse(textOf(await mcpCall('tools/call', { name: 'score_analyze', arguments: { id: r.id } })))
  assert.ok(an.summary.includes('Am'))
  assert.deepEqual(an.outOfScale, [])
})

test('score_write 拦截幻觉 → 人话错误呈现为 isError', async () => {
  const msg = await mcpCall('tools/call', {
    name: 'score_write',
    arguments: { score: { meta: { title: '幻觉', bpm: 120, key: 'C', bars: 1 }, tracks: [{ name: 'L', notes: [{ step: 999, pitch: 200, len: 1 }] }] } },
  })
  assert.equal(msg.result.isError, true, '应报错')
  // validator 对 notes 逐项短路：step 先错先报（pitch 断言由 service.test 覆盖）
  assert.ok(msg.result.content[0].text.includes('step'), msg.result.content[0].text)
})

test('score_get / score_list 全链', async () => {
  const g = JSON.parse(textOf(await mcpCall('tools/call', { name: 'score_get', arguments: { id: 'AI旋律' } })))
  assert.equal(g.meta.title, 'AI旋律')
  const list = JSON.parse(textOf(await mcpCall('tools/call', { name: 'score_list', arguments: {} })))
  assert.ok(list.count >= 1)
  assert.ok(list.scores.some((s) => s.includes('AI旋律')))
})

test('score_export midi：base64 可解码且为 SMF 头 + json 直返', async () => {
  const m = JSON.parse(textOf(await mcpCall('tools/call', { name: 'score_export', arguments: { id: 'AI旋律', format: 'midi' } })))
  assert.equal(m.format, 'midi')
  assert.ok(m.bytes > 100)
  const buf = Buffer.from(m.midiBase64, 'base64')
  assert.equal(buf.slice(0, 4).toString(), 'MThd')   // SMF 头
  assert.equal(buf.readUInt32BE(4), 6)               // header len
  assert.equal(buf.slice(14, 18).toString(), 'MTrk') // track 头
  const j = JSON.parse(textOf(await mcpCall('tools/call', { name: 'score_export', arguments: { id: 'AI旋律', format: 'json' } })))
  assert.equal(j.format, 'json')
  assert.equal(j.score.meta.title, 'AI旋律')
})

test('score_delete → get 404 呈现', async () => {
  textOf(await mcpCall('tools/call', { name: 'score_delete', arguments: { id: 'AI旋律' } }))
  const msg = await mcpCall('tools/call', { name: 'score_get', arguments: { id: 'AI旋律' } })
  assert.equal(msg.result.isError, true)
  const t = msg.result.content[0].text
  assert.ok(t.includes('不存在') || t.includes('曲谱库为空'), t)
})
