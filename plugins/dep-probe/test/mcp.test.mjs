/**
 * mcp.test.mjs —— MCP 全链路（第四层离线验证）
 *
 * spawn 真实 MCP server + 真实服务子进程（mock bridge + mock OSV），
 * MCP 不带测试钩子 → 走 kv→meta→127.0.0.1 直连的完整生产发现链。
 * 七工具逐个调用断言：dep_scan / dep_report / dep_findings / dep_fix_plan /
 * dep_check_pkg / dep_runs / dep_selftest；外加 tools/list 形状与坏 runId 错误呈现。
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

const PORT_BRIDGE = 29310 + Math.floor(Math.random() * 100)
const PORT_SVC = 29410 + Math.floor(Math.random() * 100)
const PORT_OSV = 29210 + Math.floor(Math.random() * 100)

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-probe-mcp-'))
function mk(rel, content) {
  const full = path.join(TMP, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}
mk('myrepo/package-lock.json', JSON.stringify({
  lockfileVersion: 3,
  packages: { '': { version: '0.0.0' }, 'node_modules/lodash': { version: '4.17.15' }, 'node_modules/react': { version: '18.2.0' } },
}))

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
      else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'bad action' })); return }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result }))
    })
    return
  }
  res.writeHead(404); res.end()
})

const VULN_L = { id: 'GHSA-mcp-lodash', summary: 'Prototype pollution in lodash', aliases: ['CVE-2020-8203'], database_specific: { severity: 'HIGH' }, affected: [{ ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] }] }
const mockOsv = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/querybatch') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const parsed = JSON.parse(body)
      const results = (parsed.queries || []).map((q) => (`${q.package.ecosystem}:${q.package.name}@${q.version}` === 'npm:lodash@4.17.15' ? { vulns: [{ id: VULN_L.id }] } : {}))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results }))
    })
    return
  }
  const m = /^\/v1\/vulns\/(.+)$/.exec(req.url || '')
  if (req.method === 'GET' && m) {
    if (m[1] === VULN_L.id) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(VULN_L)); return }
    res.writeHead(404); res.end()
    return
  }
  res.writeHead(404); res.end()
})

const svcEnv = {
  ...process.env,
  POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token',
  DEPPROBE_OSV_BASE: `http://127.0.0.1:${PORT_OSV}`,
}
let svcProc = null
let mcp = null

// ── MCP stdio 客户端 ────────────────────────────────────────────────────────
const pending = new Map()
let buf = ''
let rpcId = 0
function call(method, params, timeoutMs = 40_000) {
  return new Promise((resolve, reject) => {
    const rid = ++rpcId
    const t = setTimeout(() => { pending.delete(rid); reject(new Error(`MCP 超时: ${method}`)) }, timeoutMs)
    pending.set(rid, (msg) => { clearTimeout(t); resolve(msg) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n')
  })
}
const callTool = async (name, args) => {
  const r = await call('tools/call', { name, arguments: args || {} })
  const text = r.result && r.result.content && r.result.content[0] ? r.result.content[0].text : JSON.stringify(r)
  return { isError: !!(r.result && r.result.isError), text }
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  await new Promise((r) => mockOsv.listen(PORT_OSV, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC)], { env: svcEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitFor(async () => kvStore.get('depprobe.meta') || false, { label: 'meta 落 kv' })
  mcp = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js')], { env: svcEnv, stdio: ['pipe', 'pipe', 'pipe'] })
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
  await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } })
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
})

after(async () => {
  try { if (mcp) mcp.kill() } catch (_) { /* 忽略 */ }
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  try { mockOsv.close() } catch (_) { /* 忽略 */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (_) { /* 忽略 */ }
  await sleep(120)
})

// ── 用例 ────────────────────────────────────────────────────────────────────

test('tools/list：七工具 + schema 形状', async () => {
  const r = await call('tools/list', {})
  const names = r.result.tools.map((t) => t.name).sort()
  assert.deepEqual(names, ['dep_check_pkg', 'dep_findings', 'dep_fix_plan', 'dep_report', 'dep_runs', 'dep_scan', 'dep_selftest'])
  const scan = r.result.tools.find((t) => t.name === 'dep_scan')
  assert.deepEqual(scan.inputSchema.required, ['paths'])
})

test('dep_scan：同步扫完，摘要含分级/修复方案/包数', async () => {
  const { isError, text } = await callTool('dep_scan', { paths: [TMP] })
  assert.ok(!isError, text)
  assert.ok(text.includes('完成'), text)
  assert.ok(text.includes('1 个仓库'), text)
  assert.ok(text.includes('2 个包'), text)
  assert.ok(text.includes('高 1'), text)
  assert.ok(text.includes('4.17.19'), '修复版本应出现')
  assert.ok(text.includes('GHSA-mcp-lodash'), '发现 ID 应出现')
})

test('dep_report / dep_findings / dep_fix_plan：读最近报告，过滤生效', async () => {
  const rep = await callTool('dep_report', {})
  assert.ok(!rep.isError)
  assert.ok(rep.text.includes('myrepo'), rep.text)
  const f1 = await callTool('dep_findings', { severity: 'high' })
  assert.ok(f1.text.includes('lodash@4.17.15') && f1.text.includes('GHSA-mcp-lodash'), f1.text)
  const f2 = await callTool('dep_findings', { pkg: 'react' })
  assert.ok(f2.text.includes('无匹配发现'), f2.text)
  const plan = await callTool('dep_fix_plan', {})
  assert.ok(!plan.isError)
  assert.ok(plan.text.includes('4.17.19'), plan.text)
  assert.ok(plan.text.includes('消除 1 个漏洞'), plan.text)
})

test('dep_check_pkg：单包即时查询（命中与干净两态）', async () => {
  const hit = await callTool('dep_check_pkg', { ecosystem: 'npm', pkg: 'lodash', version: '4.17.15' })
  assert.ok(!hit.isError)
  assert.ok(hit.text.includes('1 条已知漏洞'), hit.text)
  const clean = await callTool('dep_check_pkg', { ecosystem: 'npm', pkg: 'left-pad', version: '1.3.0' })
  assert.ok(clean.text.includes('未发现已知漏洞'), clean.text)
})

test('dep_runs：历史可见；dep_selftest：通过；坏 runId 如实报错', async () => {
  const runs = await callTool('dep_runs', {})
  assert.ok(runs.text.includes('/'), `应至少一条历史：${runs.text}`)
  const st = await callTool('dep_selftest', {})
  assert.ok(st.text.includes('✅ 自检通过'), st.text)
  const bad = await callTool('dep_report', { runId: 'rnonexistent' })
  assert.ok(bad.isError && bad.text.includes('暂无可用报告'), bad.text)
})
