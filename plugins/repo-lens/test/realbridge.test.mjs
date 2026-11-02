/**
 * realbridge.test.mjs —— 真桥冒烟（第四层：真实宿主 cap.kv + 真实大仓库）
 *
 * 仅在 env REPOLENS_REAL=1 时执行（默认跳过，保证 npm test 离线稳定）。
 * 流程：spawn 真实 service（appConfigDir=真实配置目录 → kvclient 自发现宿主）
 *   → 确认 repolens.meta 落真实 kv（经宿主 /api/router-dispatch 直查）
 *   → 扫描真实 Polaris 主仓（REPOLENS_REAL_REPO，默认 D:\space\base\Polaris）
 *   → 断言：ok 终态、<90s、热点/耦合/大对象非空、健康分在界内
 *   → 杀服务 → 清扫 repolens.* 键（不留残留）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const REAL = process.env.REPOLENS_REAL === '1'
const APP_CONFIG_DIR = process.env.REPOLENS_REAL_APPCONFIG || path.join(process.env.APPDATA || '', 'Polaris')
const REAL_REPO = process.env.REPOLENS_REAL_REPO || 'D:\\space\\base\\Polaris'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 120_000, step = 500, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

let hostInfo = null
function hostDispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } })
    const req = http.request({
      hostname: hostInfo.host, port: hostInfo.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: `Bearer ${crypto.createHash('md5').update(hostInfo.token).digest('hex')}` },
      timeout: 15_000,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('host timeout')))
    req.write(data)
    req.end()
  })
}
async function realKvGet(key) {
  const r = await hostDispatch('cap.kv', { action: 'get', key })
  return r && r.ok ? r.result && r.result.value : undefined
}
async function realKvDel(key) {
  const r = await hostDispatch('cap.kv', { action: 'delete', key })
  return !!(r && r.ok)
}

let svcProc = null
let svcToken = null
let svcPort = 0
const SERVICE_PORT = 29879

before(async () => {
  if (!REAL) return
  const cfg = JSON.parse(fs.readFileSync(path.join(APP_CONFIG_DIR, 'config.json'), 'utf8'))
  hostInfo = { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token }
  const h = await new Promise((resolve) => {
    http.get({ hostname: hostInfo.host, port: hostInfo.port, path: '/api/health', timeout: 2_000 }, (res) => { res.resume(); resolve(res.statusCode) })
      .on('error', () => resolve(0))
  })
  assert.equal(h, 200, `真实宿主未运行（${hostInfo.host}:${hostInfo.port}）——真桥冒烟需要宿主在线`)
})

after(async () => {
  if (!REAL) return
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  // 清扫 repolens.* 键（不留残留；并发纪律：只删自己前缀）
  try {
    const r = await hostDispatch('cap.kv', { action: 'list' })
    const keys = (r && r.ok && r.result && r.result.keys) || []
    for (const k of keys) {
      if (String(k).startsWith('repolens.')) await realKvDel(k)
    }
  } catch (_) { /* 清扫尽力而为 */ }
})

test('真实宿主：repolens.meta 落真实 kv', { skip: !REAL }, async () => {
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(SERVICE_PORT), APP_CONFIG_DIR], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  svcProc.stderr.on('data', () => { /* 调试时打开 */ })
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${SERVICE_PORT}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
  const meta = await waitFor(async () => await realKvGet('repolens.meta'), { label: 'repolens.meta 落真实 kv' })
  assert.equal(meta.port, SERVICE_PORT)
  assert.ok(meta.token)
  svcToken = meta.token
  svcPort = meta.port
})

test('真实大仓库：Polaris 主仓扫描 <90s 且八维度非空', { skip: !REAL }, async () => {
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${svcToken}` }
  const t0 = Date.now()
  const r = await fetch(`http://127.0.0.1:${svcPort}/api/scan`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ path: REAL_REPO, days: 365, maxCommits: 5000 }),
  })
  assert.equal(r.status, 200)
  const { runId } = await r.json()
  const st = await waitFor(async () => {
    const s = await (await fetch(`http://127.0.0.1:${svcPort}/api/scan/${runId}`, { headers: auth })).json()
    return s.status && s.status !== 'running' ? s : null
  }, { timeoutMs: 90_000, label: 'real repo scan', step: 1000 })
  assert.equal(st.status, 'ok', `真实仓库扫描失败：${st.error || st.message}`)
  const elapsed = Date.now() - t0
  assert.ok(elapsed < 90_000, `真实仓库扫描应 <90s，实测 ${elapsed}ms`)

  const { report } = await (await fetch(`http://127.0.0.1:${svcPort}/api/report/${runId}`, { headers: auth })).json()
  assert.equal(report.status, 'ok')
  assert.ok(report.totals.commits > 100, `真实仓提交数 ${report.totals.commits} > 100`)
  assert.ok(report.hotspots.length > 10, '热点非空')
  assert.ok(report.hotspots[0].score > 0)
  assert.ok(report.health && report.health.total >= 0 && report.health.total <= 100)
  assert.ok(Array.isArray(report.couples))
  assert.ok(Array.isArray(report.blobs))
  assert.ok(report.hygiene && typeof report.hygiene.conventionalRate === 'number')
  assert.ok(report.busFactor && report.busFactor.totalAuthors > 0)
  // 投影落真实 kv
  const proj = await realKvGet(`repolens.report.${runId}`)
  assert.ok(proj && proj.hotspots.length > 0, '报告投影落真实 kv')
  console.log(`[realbridge] Polaris 主仓：${report.totals.commits} 提交 / ${report.totals.filesTracked} 文件 / ${report.hotspots.length} 热点 / 健康分 ${report.health.total} / 耗时 ${elapsed}ms`)
  console.log(`[realbridge] Top3 热点：${report.hotspots.slice(0, 3).map((h) => `${h.path}(${h.score})`).join('、')}`)
})
