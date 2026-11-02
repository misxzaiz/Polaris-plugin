/**
 * smoke-real.mjs —— 真宿主桥冒烟（不在 node --test 自动发现内，需 Polaris 宿主运行）
 *
 * 用法：node test/smoke-real.mjs [distDir]
 * 链路（全部生产配置，零测试钩子）：
 *   真服务（9890）→ kvclient 真发现宿主（anchor/config/端口扫描）→ stacklens.meta 落真 kv
 *   真 MCP（无 env 钩子）→ kvclient 读真 kv meta → 127.0.0.1 直连真服务
 * 验证：
 *   ① /__health + 真 kv meta（经 MCP 间接证明）；
 *   ② tools/list 六工具（真 MCP stdio）；
 *   ③ maps_scan 扫真构建产物目录；
 *   ④ stack_resolve 还原真实 map 的已知映射段（期望值由 core 独立计算交叉验证）。
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const core = require(path.join(ROOT, 'shared', 'core.js'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 30_000, step = 300, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

const DIST = process.argv[2] || 'D:\\space\\base\\Polaris\\dist'
const PORT_SVC = 9890
const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); console.log(`  ✓ ${name}`) }
  catch (e) { results.push({ name, pass: false }); console.log(`  ✗ ${name}\n    ${e.message}`) }
}

let svcProc = null
let mcpProc = null
let mcpBuf = ''
const pending = new Map()

function mcpSend(msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP 响应超时：${msg.method}`)), 60_000)
    pending.set(msg.id, (m) => { clearTimeout(timer); resolve(m) })
    mcpProc.stdin.write(JSON.stringify(msg) + '\n')
  })
}

// ── 启动 ────────────────────────────────────────────────────────────────────
console.log(`真桥冒烟：服务 127.0.0.1:${PORT_SVC}，MCP 无钩子真发现，dist=${DIST}`)
svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC), ''], { stdio: ['ignore', 'pipe', 'pipe'] })
svcProc.stderr.on('data', (d) => { if (process.env.SMOKE_DEBUG) process.stderr.write(d) })
await waitFor(async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT_SVC}/__health`)).status === 200 } catch (_) { return false }
}, { label: '真服务 /__health' })
console.log('  · 真服务已就绪')

mcpProc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), ''], { stdio: ['pipe', 'pipe', 'pipe'] })
mcpProc.stdout.setEncoding('utf8')
mcpProc.stdout.on('data', (chunk) => {
  mcpBuf += chunk
  let idx
  while ((idx = mcpBuf.indexOf('\n')) >= 0) {
    const line = mcpBuf.slice(0, idx).trim()
    mcpBuf = mcpBuf.slice(idx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg) }
    } catch (_) { /* 忽略 */ }
  }
})
mcpProc.stderr.on('data', () => {})

const init = await mcpSend({ jsonrpc: '2.0', id: 'i0', method: 'initialize', params: {} })
mcpProc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
console.log(`  · MCP 握手完成（${init.result.serverInfo.name} v${init.result.serverInfo.version}）`)

async function call(name, args) {
  const res = await mcpSend({ jsonrpc: '2.0', id: `c-${Math.random().toString(36).slice(2, 8)}`, method: 'tools/call', params: { name, arguments: args || {} } })
  if (res.error) throw new Error(`RPC 错误 ${res.error.code}: ${res.error.message}`)
  const text = res.result.content[0].text
  if (res.result.isError) throw new Error(`工具错误：${text}`)
  return JSON.parse(text)
}

// ── 用例 ────────────────────────────────────────────────────────────────────

await t('真 MCP 发现链：kvclient 真发现 → stacklens.meta → 服务直连', async () => {
  const res = await mcpSend({ jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} })
  const names = res.result.tools.map((x) => x.name)
  if (names.length !== 6) throw new Error(`六工具齐：${names.join(',')}`)
})

await t('maps_scan：真构建产物目录扫描', async () => {
  const out = await call('maps_scan', { dir: DIST })
  if (!(out.maps.length >= 3)) throw new Error(`真 dist 应有 ≥3 个 map，实得 ${out.maps.length}`)
  const withContent = out.maps.filter((m) => m.hasContent).length
  console.log(`    （发现 ${out.maps.length} 个 map，其中 ${withContent} 个含 sourcesContent）`)
})

await t('stack_resolve：真实 map 已知映射段交叉验证', async () => {
  // 挑一个真实 map，用 core 独立算出「第一个可还原的生成位置」，再经 MCP 全链路还原对比
  const mapDir = fs.existsSync(path.join(DIST, 'assets')) ? path.join(DIST, 'assets') : DIST
  const maps = fs.readdirSync(mapDir).filter((f) => f.endsWith('.js.map'))
  if (!maps.length) throw new Error('dist 下无 .js.map')
  let picked = null
  for (const f of maps.slice(0, 12)) {
    const mapPath = path.join(mapDir, f)
    const jsPath = mapPath.replace(/\.map$/, '')
    if (!fs.existsSync(jsPath)) continue
    const parsed = core.parseSourceMap(fs.readFileSync(mapPath, 'utf8'), f)
    if (parsed.error) continue
    // 找第一个带源映射段
    for (const [genLine, arr] of parsed.lines) {
      if (arr[1] >= 0) {
        picked = { mapPath, jsPath, genLine, seg: arr, parsed }
        break
      }
    }
    if (picked) break
  }
  if (!picked) throw new Error('前 12 个 map 里没找到可还原段')
  const { mapPath, jsPath, genLine, seg, parsed } = picked
  const genCol = seg[0]
  const expected = core.originalPositionFor(parsed, genLine, genCol)
  const jsName = path.basename(jsPath)
  const stack = `Error: real-smoke\n    at fn (${jsPath.split(path.sep).join('/')}:${genLine + 1}:${genCol + 1})`
  const out = await call('stack_resolve', { stack, mapPaths: [mapPath] })
  const f0 = out.frames[0]
  if (f0.state !== 'resolved') throw new Error(`帧未还原：${f0.reason}`)
  if (f0.source !== expected.source || f0.sourceLine !== expected.line + 1) {
    throw new Error(`交叉验证不一致：MCP=${f0.source}:${f0.sourceLine} vs core=${expected.source}:${expected.line + 1}`)
  }
  console.log(`    （${jsName}:${genLine + 1}:${genCol + 1} → ${f0.source}:${f0.sourceLine}:${f0.sourceCol}${f0.displayName ? `，原名 ${f0.displayName}` : ''}）`)
})

await t('map_validate：真实 map 体检', async () => {
  const mapDir = fs.existsSync(path.join(DIST, 'assets')) ? path.join(DIST, 'assets') : DIST
  const maps = fs.readdirSync(mapDir).filter((f) => f.endsWith('.js.map'))
  const out = await call('map_validate', { mapPath: path.join(mapDir, maps[0]) })
  if (!out.ok) throw new Error(out.error || '体检失败')
  if (!(out.stats.segCount > 0)) throw new Error('真 map 不应有 0 映射段')
  console.log(`    （${maps[0]}：${out.stats.segCount} 段 / ${out.stats.sources} 源 / sourcesContent ${out.stats.sourcesContentCount}）`)
})

// ── 收尾 ────────────────────────────────────────────────────────────────────
try { if (mcpProc) mcpProc.kill() } catch (_) {}
try { if (svcProc) svcProc.kill() } catch (_) {}
const pass = results.filter((r) => r.pass).length
console.log(`\n${pass}/${results.length} 通过`)
process.exit(pass === results.length ? 0 : 1)
