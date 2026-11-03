#!/usr/bin/env node
/**
 * MCP server 真实喂包验证：spawn stdio 服务端，JSON-RPC 逐行喂包断言响应。
 * 覆盖：initialize / tools/list / 四工具各至少一次真实调用（含中文链路）。
 * 纪律：notifications/initialized 是通知不等待回包（cron-lens 实证坑）；
 * tools/call 参数 { name, arguments } 平铺（exec-sandbox 实证坑）；
 * 断言含反斜杠字面量的产物用 includes 不用正则（csv-lens 实证坑）。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.join(here, '..', 'mcp', 'server.js')

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] })
const pending = new Map()
let buf = ''
let nextId = 1

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buf += chunk
  for (;;) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch (_) { continue }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id)
      pending.delete(msg.id)
      resolve(msg)
    }
  }
})
child.stderr.on('data', () => { /* 日志只走 stderr，冒烟不喂出来 */ })

function rpc(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve })
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc 超时：${method}`)) }, 10000)
    resolve = ((fn) => (v) => { clearTimeout(timer); fn(v) })(resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n') // 通知不进 pending
}

async function callTool(name, args) {
  const res = await rpc('tools/call', { name, arguments: args })
  assert.ok(res.result, `tools/call ${name} 无 result：${JSON.stringify(res)}`)
  return res.result
}
const textOf = (r) => r.content.map((c) => c.text).join('\n')

const results = { pass: 0, fail: 0 }
async function step(name, fn) {
  try { await fn(); results.pass++; console.log(`  ✓ ${name}`) }
  catch (e) { results.fail++; console.error(`  ✗ ${name}: ${e.message}`) }
}

try {
  console.log('cookie-lens MCP 真实喂包验证')
  await step('initialize 握手', async () => {
    const res = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } })
    assert.equal(res.result.serverInfo.name, 'cookie-lens')
  })
  notify('notifications/initialized', {}) // 通知不等待回包

  let toolNames = []
  await step('tools/list 四工具齐全', async () => {
    const res = await rpc('tools/list', {})
    toolNames = res.result.tools.map((t) => t.name)
    assert.deepEqual(toolNames, ['cookielens_parse_set_cookie', 'cookielens_parse_request_cookie', 'cookielens_judge_cors', 'cookielens_generate'])
  })

  await step('parse_set_cookie: 规范头解析', async () => {
    const r = await callTool('cookielens_parse_set_cookie', { setCookie: 'sid=abc123; Path=/; Domain=.example.com; Secure; HttpOnly; SameSite=None', requestUrl: 'https://api.example.com/v1/login' })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('name = sid') && textOf(r).includes('value = abc123'))
    assert.ok(textOf(r).includes('接受'))
  })

  await step('parse_set_cookie: SameSite=None 无 Secure 拒收 + 中文诊断', async () => {
    const r = await callTool('cookielens_parse_set_cookie', { setCookie: '登录态=x9; SameSite=None', requestUrl: 'https://api.example.com/login' })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('拒收'))
    assert.ok(textOf(r).includes('SAMESITE_NONE_NO_SECURE'))
  })

  await step('parse_set_cookie: __Host- 违规拒收', async () => {
    const r = await callTool('cookielens_parse_set_cookie', { setCookie: '__Host-sid=abc; Secure', requestUrl: 'https://x.com/' })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('HOST_PREFIX_PATH'))
  })

  await step('parse_set_cookie: 非法 URL 如实报错', async () => {
    const r = await callTool('cookielens_parse_set_cookie', { setCookie: 'a=1', requestUrl: 'nope' })
    assert.equal(r.isError, true)
    assert.ok(textOf(r).includes('URL'))
  })

  await step('parse_request_cookie: 键值展开 + 重复键中文诊断', async () => {
    const r = await callTool('cookielens_parse_request_cookie', { header: 'sid=a; 主题=dark; sid=b' })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('主题 = dark'))
    assert.ok(textOf(r).includes('DUP_NAME'))
  })

  await step('judge_cors: credentials + 通配符失败判定', async () => {
    const r = await callTool('cookielens_judge_cors', {
      origin: 'https://app.example.com',
      method: 'POST',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer xxx' }],
      responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Credentials', value: 'true' }, { name: 'Access-Control-Allow-Methods', value: 'POST' }],
      withCredentials: true,
    })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('拦截'))
    assert.ok(textOf(r).includes('credentials'))
  })

  await step('judge_cors: 简单请求通过', async () => {
    const r = await callTool('cookielens_judge_cors', {
      origin: 'https://app.example.com',
      responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' }],
    })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('放行'))
  })

  await step('judge_cors: 缺 origin 如实报错', async () => {
    const r = await callTool('cookielens_judge_cors', { responseHeaders: [] })
    assert.equal(r.isError, true)
  })

  await step('generate: set-cookie round-trip + None 自动补 Secure', async () => {
    const r = await callTool('cookielens_generate', { kind: 'set-cookie', spec: { name: 'sid', value: 'v1', sameSite: 'None', domain: 'example.com', requestUrl: 'https://api.example.com/' } })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('Secure'))
    assert.ok(textOf(r).includes('自检'))
  })

  await step('generate: set-cookie 非法 value 如实报错', async () => {
    const r = await callTool('cookielens_generate', { kind: 'set-cookie', spec: { name: 'a', value: 'bad value' } })
    assert.equal(r.isError, true)
  })

  await step('generate: cors-advice 预检建议含 ACAM/Vary', async () => {
    const r = await callTool('cookielens_generate', { kind: 'cors-advice', spec: { origin: 'https://app.example.com', method: 'PATCH', requestHeaders: [{ name: 'X-Trace', value: '1' }] } })
    assert.equal(r.isError, false)
    assert.ok(textOf(r).includes('Access-Control-Allow-Methods: PATCH'))
    assert.ok(textOf(r).includes('Vary: Origin'))
  })

  await step('generate: 未知 kind 如实报错', async () => {
    const r = await callTool('cookielens_generate', { kind: 'nope', spec: {} })
    assert.equal(r.isError, true)
  })

  await step('未知工具如实报错', async () => {
    const r = await callTool('cookielens_nope', {})
    assert.ok(textOf(r).includes('未知工具'))
  })
} finally {
  child.kill()
}

console.log(`\n结果：${results.pass} 通过 / ${results.fail} 失败`)
process.exit(results.fail > 0 ? 1 : 0)
