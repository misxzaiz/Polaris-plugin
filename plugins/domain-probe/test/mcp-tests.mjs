// MCP 协议全链路测试：内存假桥 + mock DoH + 真实服务子进程 + 真实 mcp/server.js（stdio JSON-RPC）
// 运行：node test/mcp-tests.mjs
import http from 'node:http'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }) }
  catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

// ── 与 service-tests.mjs 同一套 mock（保持独立，便于单独跑）──────────────────
const A = (data, ttl = 300) => ({ name: '', TTL: ttl, type: 1, data })
const TXT = (data, ttl = 300) => ({ name: '', TTL: ttl, type: 16, data: `"${data}"` })
const MX = (data, ttl = 600) => ({ name: '', TTL: ttl, type: 15, data })
const NS = (data, ttl = 3600) => ({ name: '', TTL: ttl, type: 2, data })
const SOA = (data, ttl = 3600) => ({ name: '', TTL: ttl, type: 6, data })
const CAA = (data, ttl = 3600) => ({ name: '', TTL: ttl, type: 257, data })

const FIXTURES = [
  [/^mailtest\.test$/, 1, { Status: 0, Answer: [A('127.0.0.1')] }],
  [/^mailtest\.test$/, 2, { Status: 0, Answer: [NS('ns1.mailtest.test'), NS('ns2.mailtest.test')] }],
  [/^mailtest\.test$/, 6, { Status: 0, Answer: [SOA('ns1.mailtest.test hostmaster.mailtest.test 1 7200 900 1209600 86400')] }],
  [/^mailtest\.test$/, 15, { Status: 0, Answer: [MX('10 mx1.mailtest.test')] }],
  [/^mailtest\.test$/, 16, { Status: 0, Answer: [TXT('v=spf1 include:_spf.provider.test ~all')] }],
  [/^mailtest\.test$/, 257, { Status: 0, Answer: [CAA('0 issue "letsencrypt.org"')] }],
  [/^_spf\.provider\.test$/, 16, { Status: 0, Answer: [TXT('v=spf1 ip4:192.0.2.0/24 -all')] }],
  [/^_dmarc\.mailtest\.test$/, 16, { Status: 0, Answer: [TXT('v=DMARC1; p=quarantine; rua=mailto:agg@mailtest.test')] }],
  [/^google\._domainkey\.mailtest\.test$/, 16, { Status: 0, Answer: [TXT('v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA')] }],
]

const dohServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const name = (url.searchParams.get('name') || '').toLowerCase()
  const type = Number(url.searchParams.get('type') || 1)
  const hit = FIXTURES.find(([re, t2]) => re.test(name) && t2 === type)
  res.writeHead(200, { 'Content-Type': 'application/dns-json' })
  res.end(JSON.stringify(hit ? hit[2] : { Status: 0 }))
})

const kvStore = new Map()
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') { res.writeHead(200); res.end('ok'); return }
  if (req.method !== 'POST' || !req.url.startsWith('/api/router-dispatch')) { res.writeHead(404); res.end(); return }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let payload
    try { payload = JSON.parse(body).req } catch (_) { res.writeHead(400); res.end(); return }
    const { target, payload: inner } = payload
    if (target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `假桥未实现 ${target}` })); return }
    const { action, key, value } = inner || {}
    if (action === 'get') { res.writeHead(200); res.end(JSON.stringify({ ok: true, result: kvStore.has(key) ? { value: kvStore.get(key) } : {} })) }
    else if (action === 'set') { kvStore.set(key, value === undefined ? null : value); res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} })) }
    else if (action === 'delete') { kvStore.delete(key); res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} })) }
    else if (action === 'list') { res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { keys: [...kvStore.keys()] } })) }
    else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 kv action ${action}` })) }
  })
})

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await Promise.resolve().then(fn).catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`等待超时：${label}`)
}

// ── 进程编排 ────────────────────────────────────────────────────────────────
let svc, mcp, tmpDir, mcpBuf = '', mcpWaiters = []

function mcpSend(obj) {
  mcp.stdin.write(JSON.stringify(obj) + '\n')
}
function mcpNext(id, ms = 60000) {
  return waitFor(() => {
    const lines = mcpBuf.split('\n').filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      try {
        const msg = JSON.parse(lines[i])
        if (msg.id === id) {
          mcpBuf = lines.slice(i + 1).join('\n')
          return msg
        }
      } catch (_) { /* 半行 */ }
    }
    return null
  }, ms, `MCP 响应 id=${id}`)
}

async function setup() {
  await new Promise((r) => dohServer.listen(0, '127.0.0.1', r))
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r))
  const dohPort = dohServer.address().port
  const bridgePort = bridge.address().port
  tmpDir = mkdtempSync(join(tmpdir(), 'domprobe-mcp-'))
  const env = {
    ...process.env,
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridgePort),
    POLARIS_TOKEN: 'test-token',
    DOMPROBE_DOH_OVERRIDES: JSON.stringify({
      alidns: `http://127.0.0.1:${dohPort}/dns`,
      dnspod: `http://127.0.0.1:${dohPort}/dns`,
      cloudflare: `http://127.0.0.1:${dohPort}/dns`,
      google: `http://127.0.0.1:${dohPort}/dns`,
    }),
  }
  svc = spawn(process.execPath, [join(ROOT, 'service', 'main.js'), '0', tmpDir], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  await waitFor(() => kvStore.has('dom.meta'), 15000, 'dom.meta 心跳')
  mcp = spawn(process.execPath, [join(ROOT, 'mcp', 'server.js'), tmpDir], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  mcp.stdout.setEncoding('utf8')
  mcp.stdout.on('data', (c) => { mcpBuf += c; })
  await waitFor(() => mcp.pid && mcpBuf.length >= 0, 5000, 'MCP 起动')
}

function textOf(resp) {
  const c = resp.result && resp.result.content
  return c && c[0] && c[0].text ? c[0].text : ''
}

// ── 用例 ────────────────────────────────────────────────────────────────────
await t('initialize: serverInfo 名称与协议版本', async () => {
  await setup()
  mcpSend({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  const resp = await mcpNext(1)
  assert.equal(resp.result.serverInfo.name, 'domain-probe')
  assert.equal(resp.result.protocolVersion, '2024-11-05')
})

await t('tools/list: 六工具且 description 写适用句式', async () => {
  mcpSend({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  const resp = await mcpNext(2)
  const names = resp.result.tools.map((x) => x.name)
  assert.deepEqual(names, ['dom_diagnose', 'dom_emailauth', 'dom_cert', 'dom_lookup', 'dom_report', 'dom_history'])
  for (const tool of resp.result.tools) assert.ok(tool.description.length > 30, `${tool.name} description 太短`)
})

await t('tools/call dom_lookup: 四解析器对比 + MX 优先级拆分', async () => {
  mcpSend({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dom_lookup', arguments: { domain: 'mailtest.test', type: 'MX', allResolvers: true } } })
  const resp = await mcpNext(3)
  const text = textOf(resp)
  assert.ok(text.includes('mx1.mailtest.test'), text)
  assert.ok(text.includes('一致 ✓'), text)
  assert.ok(text.includes('10 mx1.mailtest.test'), `MX 优先级应在文本里：${text}`)
})

await t('tools/call dom_diagnose: 评分与守卫拒绝回到对话', async () => {
  mcpSend({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'dom_diagnose', arguments: { domain: 'mailtest.test' } } })
  const resp = await mcpNext(4)
  const text = textOf(resp)
  assert.ok(text.includes('95/100'), `评分应在文本里：${text}`)
  assert.ok(text.includes('未取到证书信息'), text)
  assert.ok(text.includes('v=spf1 include:_spf.provider.test ~all'), text)
  assert.ok(text.includes('quarantine'), text)
})

await t('tools/call dom_emailauth: SPF/DMARC 细节', async () => {
  mcpSend({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'dom_emailauth', arguments: { domain: 'mailtest.test' } } })
  const resp = await mcpNext(5)
  const text = textOf(resp)
  assert.ok(text.includes('DMARC1'), text)
  assert.ok(text.includes('agg@mailtest.test'), text)
})

await t('tools/call dom_history / dom_report: 历史与最近报告', async () => {
  mcpSend({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'dom_history', arguments: { limit: 5 } } })
  const hResp = await mcpNext(6)
  assert.ok(textOf(hResp).includes('mailtest.test'), textOf(hResp))
  mcpSend({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'dom_report', arguments: {} } })
  const rResp = await mcpNext(7)
  assert.ok(textOf(rResp).includes('mailtest.test'), textOf(rResp))
})

await t('未知工具: -32602 错误码', async () => {
  mcpSend({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'nope', arguments: {} } })
  const resp = await mcpNext(8)
  assert.equal(resp.error.code, -32602)
})

// ── 收尾 ────────────────────────────────────────────────────────────────────
function cleanup() {
  try { mcp && mcp.kill() } catch (_) { /* noop */ }
  try { svc && svc.kill() } catch (_) { /* noop */ }
  try { dohServer.close() } catch (_) { /* noop */ }
  try { bridge.close() } catch (_) { /* noop */ }
  try { tmpDir && rmSync(tmpDir, { recursive: true, force: true }) } catch (_) { /* noop */ }
}
process.on('exit', cleanup)
process.on('unhandledRejection', (e) => { console.error('未处理拒绝：', e); cleanup(); process.exit(1) })

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
cleanup()
process.exit(bad.length ? 1 : 0)
