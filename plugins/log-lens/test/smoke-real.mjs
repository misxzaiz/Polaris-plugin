#!/usr/bin/env node
/**
 * 真桥冒烟（node test/smoke-real.mjs）
 *
 * A. 服务 HTTP 全端点：合成日志精确断言 + 真实 Polaris 日志语料 + 性能预算
 * B. MCP stdio：全握手 + 六工具逐个真调（LOGLENS_PORT 测试钩子注入端口）
 * C. 宿主桥（条件段）：宿主在跑时验证 lls.meta 心跳真写入（跑完清理）
 *
 * 不依赖宿主是否运行；跑完自清理（临时目录 / 子进程 / kv lls.meta）。
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const require = createRequire(import.meta.url)
const { createKvClient } = require('../service/kvclient.js')
const { fileMeta } = require('../service/reader.js')

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'log-lens-smoke-'))
const TMP_CFG = path.join(TMP, 'appconfig')
fs.mkdirSync(TMP_CFG, { recursive: true })
const TMP_LOGS = path.join(TMP, 'myapp-logs')
fs.mkdirSync(TMP_LOGS, { recursive: true })

let pass = 0, fail = 0
const failures = []
const childProcs = []
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`  ✓ ${name}`) })
    .catch((e) => { fail++; failures.push(name); console.error(`  ✗ ${name}\n    ${e.stack || e.message}`) })
}
function ok(cond, label) { if (!cond) throw new Error(label || '断言失败') }

// ── 合成日志（精确可断言）───────────────────────────────────────────────────
const lines = []
for (let i = 0; i < 300; i++) {
  const lv = ['INFO', 'INFO', 'WARN', 'ERROR', 'INFO', 'DEBUG'][i % 6]
  lines.push(`2026-11-01T09:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z  ${lv} smoke.mod${i % 3}: event ${i} db_timeout=${i % 17 === 0} token=secretvalue${i}`)
}
const synthetic = path.join(TMP_LOGS, 'smoke-app.log.2026-11-01')
fs.writeFileSync(synthetic, `${lines.join('\n')}\n`, 'utf8')
const synthetic2 = path.join(TMP_LOGS, 'smoke-worker.log')
fs.writeFileSync(synthetic2, `${lines.slice(0, 100).join('\n')}\n`, 'utf8')

// ── HTTP 小客户端 ───────────────────────────────────────────────────────────
const PORT = 19870
function request(method, pathname, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: pathname, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      timeout: timeoutMs,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }) }
        catch (_) { resolve({ status: res.statusCode, json: null, raw: buf }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('请求超时')) })
    if (data) req.write(data)
    req.end()
  })
}

// ── 启动服务（env 指向死端口，避免写真实 kv；桥接段单独验证）────────────────
const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(PORT), TMP_CFG], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
childProcs.push(svc)
svc.stderr.on('data', (d) => { process.stderr.write(`[svc] ${d}`) })

async function waitHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await request('GET', '/__health')
      if (r.status === 200 && r.json?.ok) return r.json
    } catch (_) { /* 服务未起 */ }
    await new Promise((res) => setTimeout(res, 250))
  }
  throw new Error('服务健康检查超时')
}

// ── 真实语料定位 ────────────────────────────────────────────────────────────
function findRealLogs() {
  const roots = []
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, 'Polaris', 'logs'))
    roots.push(path.join(process.env.APPDATA, 'Polaris-dev', 'logs'))
  }
  const out = []
  for (const dir of roots) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/^app\.log\.\d{4}-\d{2}-\d{2}$/.test(f)) {
          const full = path.join(dir, f)
          out.push({ path: full, size: fs.statSync(full).size })
        }
      }
    } catch (_) { /* 目录不存在 */ }
  }
  return out.sort((a, b) => b.size - a.size)
}
const realLogs = findRealLogs()

console.log(`服务启动中（:${PORT}）…`)
await waitHealth()
console.log(`服务就绪。真实语料 ${realLogs.length} 个文件（最大 ${realLogs[0] ? Math.round(realLogs[0].size / 1024) : 0}KB）`)

// ── A. 服务 HTTP 端点 ───────────────────────────────────────────────────────
console.log('A. 服务 HTTP:')
await test('GET /api/sources：结构 + 默认发现', async () => {
  const r = await request('GET', '/api/sources')
  ok(r.json?.ok === true, `ok 字段: ${JSON.stringify(r.json).slice(0, 120)}`)
  ok(Array.isArray(r.json.files), 'files 数组')
  ok(typeof r.json.dataRoot === 'string', 'dataRoot 字段')
  ok(r.json.files.some((f) => f.source === 'dataRoot' && /app\.log\./.test(f.path)), `默认源含数据根日志（发现 ${r.json.files.length} 个）`)
})
await test('POST sources/add + remove（临时目录进/出清单）', async () => {
  const r1 = await request('POST', '/api/sources/add', { path: TMP_LOGS })
  ok(r1.json?.ok === true, `add: ${r1.raw?.slice(0, 120)}`)
  ok(r1.json.files.some((f) => f.path === synthetic && f.source === 'user'), '合成文件以 user 源被发现')
  const r2 = await request('POST', '/api/sources/remove', { path: TMP_LOGS })
  ok(r2.json?.ok === true, 'remove ok')
  ok(!r2.json.files.some((f) => f.path === synthetic), '移除后不再出现')
  // 重新加回，供后续段使用
  await request('POST', '/api/sources/add', { path: TMP_LOGS })
})
await test('GET /api/tail：精确断言末 10 行', async () => {
  const r = await request('GET', `/api/tail?file=${encodeURIComponent(synthetic)}&maxLines=10`)
  ok(r.json?.ok === true, 'ok')
  ok(r.json.entries.length === 10, `10 条，实际 ${r.json.entries?.length}`)
  ok(r.json.entries[9].message.includes('event 299'), `末条=第299号，实际: ${r.json.entries[9]?.message?.slice(0, 60)}`)
  ok(r.json.format === 'tracing' && r.json.encoding === 'utf8', `格式 ${r.json.format}/${r.json.encoding}`)
})
await test('GET /api/read：级别过滤全命中', async () => {
  const r = await request('GET', `/api/read?file=${encodeURIComponent(synthetic)}&offset=0&limit=50&levels=ERROR`)
  ok(r.json?.ok === true, 'ok')
  ok(r.json.entries.length === 50, `50 条 ERROR，实际 ${r.json.entries?.length}`)
  ok(r.json.entries.every((e) => e.level === 'ERROR'), '全为 ERROR')
})
await test('GET /api/search：双文件 + 关键词（含过滤真实性负例）', async () => {
  const r = await request('GET', `/api/search?files=${encodeURIComponent(synthetic)}|${encodeURIComponent(synthetic2)}&q=db_timeout=true&limitPerFile=5`)
  ok(r.json?.ok === true, 'ok')
  ok(r.json.totalMatches > 0, `命中 ${r.json.totalMatches}`)
  ok(r.json.results.length === 2, '两文件结果')
  // 过滤真实性：命中行必须真的含关键词（防 parseFilters 静默失效的假阳性）
  for (const res of r.json.results) {
    ok((res.matches || []).every((m) => m.message.includes('db_timeout=true')), '命中行全含关键词')
  }
  const r0 = await request('GET', `/api/search?files=${encodeURIComponent(synthetic)}&q=${encodeURIComponent('绝不存在的词xyzzy')}`)
  ok(r0.json?.totalMatches === 0, `负例应为 0，实际 ${r0.json?.totalMatches}`)
})
await test('GET /api/stats：级别直方图与聚类', async () => {
  const r = await request('GET', `/api/stats?file=${encodeURIComponent(synthetic)}`)
  ok(r.json?.ok === true, 'ok')
  ok(r.json.totalEntries === 300, `300 条，实际 ${r.json.totalEntries}`)
  ok(r.json.levels.ERROR === 50 && r.json.levels.WARN === 50, `ERROR/WARN 各 50，实际 ${r.json.levels.ERROR}/${r.json.levels.WARN}`)
  ok(r.json.clusters.length >= 1, '有聚类')
})
await test('GET /api/context：锚点前后窗口', async () => {
  const anchor = 0 // 从 read 拿一个真实 offset
  const r0 = await request('GET', `/api/read?file=${encodeURIComponent(synthetic)}&offset=0&limit=10`)
  const target = r0.json.entries[5]
  const r = await request('GET', `/api/context?file=${encodeURIComponent(synthetic)}&offset=${target.offset}&before=2&after=2`)
  ok(r.json?.ok === true, 'ok')
  ok(r.json.entries.length === 5, `5 条窗口，实际 ${r.json.entries?.length}`)
  ok(r.json.entries.some((e) => e.offset === target.offset), '含锚点行')
})
await test('性能预算：真实语料 tail < 2s（止损线）', async () => {
  if (!realLogs.length) { console.log('    （本机无真实 Polaris 日志，跳过）'); return }
  const biggest = realLogs[0].path
  const t0 = Date.now()
  const r = await request('GET', `/api/tail?file=${encodeURIComponent(biggest)}&maxLines=300`)
  const ms = Date.now() - t0
  ok(r.json?.ok === true, 'ok')
  ok(r.json.entries.length === 300, '300 条')
  ok(ms < 2000, `tail 耗时 ${ms}ms（预算 <2000ms）`)
  console.log(`    实测: ${Math.round(realLogs[0].size / 1024)}KB 文件 tail 300 行 = ${ms}ms, 格式=${r.json.format}/${r.json.encoding}`)
})
await test('性能预算：真实语料 stats 全扫', async () => {
  if (!realLogs.length) { console.log('    （跳过）'); return }
  const biggest = realLogs[0].path
  const t0 = Date.now()
  const r = await request('GET', `/api/stats?file=${encodeURIComponent(biggest)}`, undefined, 120000)
  const ms = Date.now() - t0
  ok(r.json?.ok === true, 'ok')
  ok(r.json.totalEntries > 100, `真实日志 ${r.json.totalEntries} 条`)
  console.log(`    实测: stats = ${ms}ms, 级别=${JSON.stringify(r.json.levels)}, 错误聚类 ${r.json.clusters.length} 类`)
})
await test('响应字节封顶：大文件 read 500 条 < 2MB+余量', async () => {
  if (!realLogs.length) { console.log('    （跳过）'); return }
  const biggest = realLogs[0].path
  const t0 = Date.now()
  const r = await request('GET', `/api/read?file=${encodeURIComponent(biggest)}&offset=0&limit=500`)
  const ms = Date.now() - t0
  const bodyBytes = Buffer.byteLength(JSON.stringify(r.json))
  ok(r.json.entries.length <= 500, '条数封顶')
  ok(bodyBytes < 2 * 1024 * 1024 + 256 * 1024, `响应 ${Math.round(bodyBytes / 1024)}KB（封顶 2MB+余量）`)
  console.log(`    实测: read 500 = ${ms}ms, ${Math.round(bodyBytes / 1024)}KB`)
})

// ── B. MCP stdio 六工具 ─────────────────────────────────────────────────────
console.log('B. MCP stdio:')
function mcpRoundTrip(proc, msg, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP 响应超时: ${msg.method}`)), timeoutMs)
    const onData = (d) => {
      proc.stdout._buf = (proc.stdout._buf || '') + d.toString()
      const lines = proc.stdout._buf.split('\n')
      proc.stdout._buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.id === msg.id) {
            clearTimeout(timer)
            proc.stdout.off('data', onData)
            resolve(parsed)
            return
          }
        } catch (_) { /* 半行 */ }
      }
    }
    proc.stdout.on('data', onData)
    proc.stdin.write(`${JSON.stringify(msg)}\n`)
  })
}

// notification 无响应（协议语义），只等待一小段以防误读旧响应
async function mcpNotify(proc, msg) {
  const before = proc.stdout._buf || ''
  proc.stdin.write(`${JSON.stringify(msg)}\n`)
  await new Promise((res) => setTimeout(res, 150))
  if ((proc.stdout._buf || '') !== before) throw new Error('notification 不应有响应')
}

const mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), TMP_CFG], {
  env: { ...process.env, LOGLENS_PORT: String(PORT) },
  stdio: ['pipe', 'pipe', 'pipe'],
})
childProcs.push(mcp)
mcp.stderr.on('data', (d) => { process.stderr.write(`[mcp] ${d}`) })
let mcpId = 0
await test('initialize + tools/list（6 工具）', async () => {
  await new Promise((res) => setTimeout(res, 500)) // 等 MCP 进程就绪
  const init = await mcpRoundTrip(mcp, { jsonrpc: '2.0', id: ++mcpId, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } })
  ok(init.result?.serverInfo?.name === 'log-lens', `serverInfo: ${JSON.stringify(init.result?.serverInfo)}`)
  await mcpNotify(mcp, { jsonrpc: '2.0', method: 'notifications/initialized' })
  const list = await mcpRoundTrip(mcp, { jsonrpc: '2.0', id: ++mcpId, method: 'tools/list' })
  const names = (list.result?.tools || []).map((t) => t.name)
  ok(names.length === 6, `6 工具，实际 ${names.length}: ${names.join(',')}`)
  for (const n of ['log_overview', 'log_tail', 'log_search', 'log_stats', 'log_errors', 'log_context']) {
    ok(names.includes(n), `缺工具 ${n}`)
  }
})
async function callTool(name, args) {
  const r = await mcpRoundTrip(mcp, { jsonrpc: '2.0', id: ++mcpId, method: 'tools/call', params: { name, arguments: args } }, 60000)
  const text = r.result?.content?.[0]?.text || ''
  return { text, isError: r.result?.isError === true }
}
await test('log_overview 返回文件清单', async () => {
  const { text, isError } = await callTool('log_overview', {})
  ok(!isError, `isError: ${text.slice(0, 120)}`)
  ok(text.includes('日志透视台服务正常') || text.includes('发现日志文件'), text.slice(0, 120))
  ok(text.includes('smoke-app.log'), '含合成文件')
})
await test('log_tail 返回末尾行', async () => {
  const { text, isError } = await callTool('log_tail', { file: synthetic, maxLines: 5 })
  ok(!isError, text.slice(0, 120))
  ok(text.includes('event 299'), text.slice(0, 200))
})
await test('log_search 命中关键词', async () => {
  const { text, isError } = await callTool('log_search', { q: 'db_timeout=true', files: [synthetic] })
  ok(!isError, text.slice(0, 120))
  ok(text.includes('命中'), text.slice(0, 200))
  ok(text.includes('提示：日志可能含密钥'), '输出附脱敏提示（原文行保留诊断价值，摘要由 AI 按提示脱敏）')
})
await test('log_stats 直方图+聚类文本', async () => {
  const { text, isError } = await callTool('log_stats', { file: synthetic })
  ok(!isError, text.slice(0, 120))
  ok(text.includes('ERROR=50') && text.includes('错误聚类'), text.slice(0, 240))
})
await test('log_errors 聚类分组', async () => {
  const { text, isError } = await callTool('log_errors', { file: synthetic })
  ok(!isError, text.slice(0, 120))
  ok(text.includes('归并为') && text.includes('×'), text.slice(0, 240))
})
await test('log_context 锚点窗口', async () => {
  const r0 = await request('GET', `/api/read?file=${encodeURIComponent(synthetic)}&offset=0&limit=10`)
  const target = r0.json.entries[5]
  const { text, isError } = await callTool('log_context', { file: synthetic, offset: target.offset, before: 2, after: 2 })
  ok(!isError, text.slice(0, 120))
  ok(text.includes('▶'), '含锚点标记')
})
await test('服务离线时 MCP 给出引导（不猜测）', async () => {
  // 用一个必然没人监听的端口起新 MCP 实例
  const mcp2 = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), TMP_CFG], {
    env: { ...process.env, LOGLENS_PORT: '19999' },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  childProcs.push(mcp2)
  await new Promise((res) => setTimeout(res, 400))
  const r = await mcpRoundTrip(mcp2, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 's', version: '0' } } })
  ok(r.result?.serverInfo, 'init ok')
  await mcpNotify(mcp2, { jsonrpc: '2.0', method: 'notifications/initialized' })
  const c = await mcpRoundTrip(mcp2, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'log_overview', arguments: {} } }, 20000)
  const text = c.result?.content?.[0]?.text || ''
  ok(c.result?.isError === true, 'isError 标注')
  ok(text.includes('服务未运行'), `引导文案: ${text.slice(0, 120)}`)
})

// ── C. 宿主桥（条件段）──────────────────────────────────────────────────────
console.log('C. 宿主桥:')
await test('lls.meta 心跳真写入（宿主在跑时）', async () => {
  const bridge = createKvClient({ appConfigDir: '', log: () => {} })
  let hostUp = false
  try {
    const res = await bridge.dispatchOk('cap.kv', { action: 'list' })
    hostUp = res && Array.isArray(res.keys)
  } catch (_) { hostUp = false }
  if (!hostUp) { console.log('    宿主未运行或 bridge 不可达，跳过（不影响三层验证判定）'); return }
  // 不带 env 覆盖再起一个服务实例（换端口），等它把 lls.meta 写进真实 kv
  const PORT2 = 19871
  const svc2 = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(PORT2), TMP_CFG], {
    env: { ...process.env }, stdio: ['ignore', 'ignore', 'ignore'],
  })
  childProcs.push(svc2)
  let meta = null
  for (let i = 0; i < 30; i++) {
    meta = await bridge.kvGet('lls.meta').catch(() => null)
    if (meta && Number(meta.port) === PORT2) break
    await new Promise((res) => setTimeout(res, 500))
  }
  ok(meta && Number(meta.port) === PORT2, `lls.meta.port=${meta?.port}`)
  ok(meta?.dataRoot, 'meta 含 dataRoot')
  // 清理 kv 心跳（服务被 kill 时 Windows 下不跑优雅退出）
  await bridge.kvDel('lls.meta').catch(() => {})
  svc2.kill()
})

// ── 清理 ────────────────────────────────────────────────────────────────────
console.log('清理…')
for (const p of childProcs) { try { p.kill() } catch (_) { /* 忽略 */ } }
await new Promise((res) => setTimeout(res, 300))
fs.rmSync(TMP, { recursive: true, force: true })
console.log(`\n结果: ${pass} 通过, ${fail} 失败${fail ? '\n失败项: ' + failures.join(' / ') : ''}`)
process.exit(fail > 0 ? 1 : 0)
