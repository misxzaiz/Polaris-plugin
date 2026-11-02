/**
 * mcp.test.mjs —— MCP 全链路（stdio JSON-RPC + env 测试钩子 + 真实服务 + 真实 git 夹具）
 *
 * 链路：spawn mcp/server.js（env REPOLENS_SERVICE_URL/TOKEN 指向真实 service 子进程）
 *   → initialize / tools/list（八工具）→ tools/call repo_scan（同步等待真实扫描完成）
 *   → repo_hotspots / repo_file / repo_couples / repo_hygiene / repo_runs / repo_selftest
 *   全部断言返回 isError=false 且关键数据与夹具形态对上。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { buildFixtureRepo, rmRfForce } from './fixtures.mjs'

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

const PORT_BRIDGE = 29510 + Math.floor(Math.random() * 100)
const PORT_SVC = 29610 + Math.floor(Math.random() * 100)

const FIXTURE = buildFixtureRepo()

// mock bridge（生产 kvclient 契约）
const kvStore = new Map()
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') { res.writeHead(200); res.end(JSON.stringify({ ok: true })); return }
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
      else if (p.action === 'list') result = { keys: [...kvStore.keys()] }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result }))
    })
    return
  }
  res.writeHead(404); res.end()
})

let svcProc = null
let mcpProc = null
let nextId = 1
const pending = new Map() // id → resolve
let mcpBuf = ''

function mcpRequest(method, params, timeoutMs = 300_000) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP 请求超时：${method}`)) }, timeoutMs)
    pending.set(id, (res) => { clearTimeout(timer); resolve(res) })
    mcpProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function callTool(name, args) {
  const res = await mcpRequest('tools/call', { name, arguments: args || {} })
  assert.equal(res.error, undefined, `${name} 不应返回协议错误`)
  const text = res.result.content[0].text
  if (res.result.isError) throw new Error(`${name} 工具错误：${text}`)
  return JSON.parse(text)
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC), ''], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${PORT_SVC}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
  const meta = kvStore.get('repolens.meta')
  assert.ok(meta, 'meta 已落 kv')

  mcpProc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), ''], {
    env: {
      ...process.env,
      REPOLENS_SERVICE_URL: `http://127.0.0.1:${PORT_SVC}`,
      REPOLENS_SERVICE_TOKEN: meta.token,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const rl = readline.createInterface({ input: mcpProc.stdout })
  rl.on('line', (line) => {
    if (!line.trim()) return
    let msg
    try { msg = JSON.parse(line) } catch (_) { return }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  })
  mcpProc.stderr.on('data', () => { /* MCP 日志 */ })
  await waitFor(() => mcpProc.pid && !mcpProc.killed, { label: 'mcp spawn' })
  await sleep(400)
})

after(async () => {
  try { if (mcpProc) mcpProc.kill() } catch (_) { /* 忽略 */ }
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  rmRfForce(FIXTURE.dir)
})

// ── 用例 ────────────────────────────────────────────────────────────────────

test('initialize + tools/list：八工具齐备', async () => {
  const init = await mcpRequest('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
  assert.equal(init.result.serverInfo.name, 'repo-lens')
  const list = await mcpRequest('tools/list', {})
  const names = list.result.tools.map((t) => t.name)
  assert.deepEqual(names.sort(), ['repo_couples', 'repo_file', 'repo_hotspots', 'repo_hygiene', 'repo_report', 'repo_runs', 'repo_scan', 'repo_selftest'])
  for (const t of list.result.tools) {
    assert.ok(t.description && t.description.length > 10, `${t.name} 有描述`)
    assert.ok(t.inputSchema, `${t.name} 有 schema`)
  }
})

test('repo_scan：同步等待真实扫描并返回摘要', async () => {
  const out = await callTool('repo_scan', { path: FIXTURE.dir, days: 365, maxCommits: 500 })
  assert.ok(out.reading.includes('健康分'), `reading 文本含健康分：${out.reading.slice(0, 120)}`)
  assert.equal(out.repo.branch, 'main')
  assert.ok(out.totals.commits >= 6)
  assert.ok(out.topHotspots.length >= 5)
  assert.ok(out.topHotspots.some((h) => h.path === 'src/util.ts'))
})

test('repo_hotspots / repo_couples：排行与共变对', async () => {
  const hot = await callTool('repo_hotspots', { topN: 5 })
  assert.ok(hot.hotspots.length <= 5)
  assert.ok(hot.hotspots[0].score >= hot.hotspots[hot.hotspots.length - 1].score, '降序')
  const cou = await callTool('repo_couples', { topN: 10 })
  assert.ok(cou.couples.some((c) => c.a.includes('util') || c.b.includes('util')), '含 util 共变对')
})

test('repo_file：下钻数据形状', async () => {
  const d = await callTool('repo_file', { path: 'src/util.ts' })
  assert.equal(d.path, 'src/util.ts')
  assert.equal(d.timeline.length, 52)
  assert.ok(d.summary.score >= 0)
})

test('repo_hygiene：卫生/巴士/大对象/陈旧分支', async () => {
  const h = await callTool('repo_hygiene', {})
  assert.ok(h.hygiene.sloppy >= 1)
  assert.ok(h.busFactor.totalAuthors >= 3)
  assert.ok(h.blobs.some((b) => b.path === 'big/blob.bin'))
  assert.ok(h.staleBranches.some((b) => b.branch === 'feature/stale'), '陈旧分支被点名')
})

test('repo_runs + repo_report（缺省最近一次）+ repo_selftest', async () => {
  const runs = await callTool('repo_runs', {})
  assert.ok(runs.runs.length >= 1)
  const rep = await callTool('repo_report', {})
  assert.equal(rep.repo.branch, 'main')
  const st = await callTool('repo_selftest', {})
  assert.equal(st.ok, true, JSON.stringify(st.failed || []))
})

test('repo_scan 对不存在的路径：isError=true 且错误可读', async () => {
  const res = await mcpRequest('tools/call', { name: 'repo_scan', arguments: { path: 'Z:\\definitely\\not\\a\\repo' } })
  assert.equal(res.result.isError, true)
  assert.ok(res.result.content[0].text.includes('错误'), '错误文本可读')
})
