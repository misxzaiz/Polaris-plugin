// MCP 协议测试：spawn mcp/server.js 真子进程，stdin/stdout 走 JSON-RPC 行协议
// 前置：npm run build（server 依赖 dist/core.cjs）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function startServer() {
  const child = spawn(process.execPath, [join(ROOT, 'mcp', 'server.js')], { stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let nextId = 1
  let buf = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (c) => {
    buf += c
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      const resolve = pending.get(msg.id)
      if (resolve) {
        pending.delete(msg.id)
        resolve(msg)
      }
    }
  })
  child.stderr.on('data', () => {}) // 服务端 stderr 日志，静默
  const request = (method, params) => {
    const id = nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`请求超时：${method}`))
      }, 10000)
      pending.set(id, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
    })
    child.stdin.write(frame)
    return p
  }
  const close = () => {
    child.stdin.end()
  }
  return { child, request, close }
}

const textOf = (res) => res.result.content[0].text

test('mcp: initialize 握手', async () => {
  const srv = startServer()
  try {
    const res = await srv.request('initialize', { protocolVersion: '2024-11-05' })
    assert.equal(res.jsonrpc, '2.0')
    assert.equal(res.result.protocolVersion, '2024-11-05')
    assert.equal(res.result.serverInfo.name, 'dev-toolbox')
    assert.equal(res.result.serverInfo.version, '0.1.0')
  } finally {
    srv.close()
  }
})

test('mcp: tools/list 返回 11 个工具且 schema 完整', async () => {
  const srv = startServer()
  try {
    await srv.request('initialize', {})
    const res = await srv.request('tools/list', {})
    const names = res.result.tools.map((t) => t.name)
    assert.deepEqual(
      [...names].sort(),
      [
        'base64_decode', 'base64_encode', 'cron_next_runs', 'hash_text', 'iso_to_timestamp',
        'jwt_decode', 'regex_test', 'timestamp_to_iso', 'url_parse', 'uuid_generate', 'yaml_convert',
      ].sort(),
    )
    for (const t of res.result.tools) {
      assert.ok(t.description && t.description.length > 10, `${t.name} 缺描述`)
      assert.equal(t.inputSchema.type, 'object')
    }
  } finally {
    srv.close()
  }
})

test('mcp: hash_text 与 node:crypto 对齐（md5/sha256/HMAC）', async () => {
  const srv = startServer()
  try {
    await srv.request('initialize', {})
    const md5 = await srv.request('tools/call', { name: 'hash_text', arguments: { text: 'abc', algorithm: 'md5' } })
    const md5Out = JSON.parse(textOf(md5))
    assert.equal(md5.result.isError, false)
    assert.equal(md5Out.hex, crypto.createHash('md5').update('abc').digest('hex'))
    const sha = await srv.request('tools/call', { name: 'hash_text', arguments: { text: '中文内容', algorithm: 'sha256' } })
    assert.equal(JSON.parse(textOf(sha)).hex, crypto.createHash('sha256').update('中文内容', 'utf8').digest('hex'))
    const hmac = await srv.request('tools/call', {
      name: 'hash_text',
      arguments: { text: 'msg', algorithm: 'sha256', hmacSecret: 'k3y' },
    })
    assert.equal(JSON.parse(textOf(hmac)).hex, crypto.createHmac('sha256', 'k3y').update('msg', 'utf8').digest('hex'))
  } finally {
    srv.close()
  }
})

test('mcp: uuid_generate 批量且格式/唯一', async () => {
  const srv = startServer()
  try {
    await srv.request('initialize', {})
    const res = await srv.request('tools/call', { name: 'uuid_generate', arguments: { count: 5, version: 'v7' } })
    const out = JSON.parse(textOf(res))
    assert.equal(out.count, 5)
    assert.equal(new Set(out.uuids).size, 5)
    for (const u of out.uuids) assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/)
  } finally {
    srv.close()
  }
})

test('mcp: jwt_decode / cron_next_runs / timestamp_to_iso 语义正确', async () => {
  const srv = startServer()
  try {
    await srv.request('initialize', {})
    const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')
    const exp = Math.floor(Date.now() / 1000) - 7200
    const token = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp })}.sig`
    const jwt = JSON.parse(textOf(await srv.request('tools/call', { name: 'jwt_decode', arguments: { token } })))
    assert.equal(jwt.payload.sub, 'u1')
    assert.equal(jwt.time.expiryState, 'expired')
    const cron = JSON.parse(textOf(await srv.request('tools/call', { name: 'cron_next_runs', arguments: { expression: '*/5 * * * *', count: 3 } })))
    assert.equal(cron.description, '每 5 分钟')
    assert.equal(cron.nextRuns.length, 3)
    const ts = JSON.parse(textOf(await srv.request('tools/call', { name: 'timestamp_to_iso', arguments: { value: '1700000000' } })))
    assert.equal(ts.isoUtc, '2023-11-14T22:13:20.000Z')
    assert.equal(ts.unit, 's')
    const iso = JSON.parse(textOf(await srv.request('tools/call', { name: 'iso_to_timestamp', arguments: { iso: '2023-11-14T22:13:20Z' } })))
    assert.equal(iso.epochSeconds, 1700000000)
  } finally {
    srv.close()
  }
})

test('mcp: base64/yaml/regex/url 正常与错误路径', async () => {
  const srv = startServer()
  try {
    await srv.request('initialize', {})
    const enc = JSON.parse(textOf(await srv.request('tools/call', { name: 'base64_encode', arguments: { text: '你好' } })))
    assert.equal(enc.base64, Buffer.from('你好', 'utf8').toString('base64'))
    const dec = JSON.parse(textOf(await srv.request('tools/call', { name: 'base64_decode', arguments: { base64: enc.base64 } })))
    assert.equal(dec.text, '你好')
    const bad = await srv.request('tools/call', { name: 'base64_decode', arguments: { base64: 'A@C=' } })
    assert.equal(bad.result.isError, true, '非法 base64 应 isError')
    const y2j = JSON.parse(textOf(await srv.request('tools/call', { name: 'yaml_convert', arguments: { text: 'a: 1\nb:\n  - x\n  - y' } })))
    assert.deepEqual(JSON.parse(y2j.output), { a: 1, b: ['x', 'y'] })
    const j2y = JSON.parse(textOf(await srv.request('tools/call', { name: 'yaml_convert', arguments: { text: '{"a":[1,2]}', direction: 'json2yaml' } })))
    assert.ok(j2y.output.includes('a:'))
    const re = JSON.parse(textOf(await srv.request('tools/call', { name: 'regex_test', arguments: { pattern: '(\\w+)@(\\w+)\\.com', text: 'a@b.com c@d.com' } })))
    assert.equal(re.matchCount, 2)
    assert.deepEqual(re.matches[0].groups, ['a', 'b'])
    const up = JSON.parse(textOf(await srv.request('tools/call', { name: 'url_parse', arguments: { url: 'https://x.io/p?q=1&q=2#f' } })))
    assert.equal(up.hostname, 'x.io')
    assert.deepEqual(up.params, [{ name: 'q', values: ['1', '2'] }])
    // 未知工具 → JSON-RPC error
    const unknown = await srv.request('tools/call', { name: 'nope', arguments: {} })
    assert.equal(unknown.error.code, -32602)
  } finally {
    srv.close()
  }
})
