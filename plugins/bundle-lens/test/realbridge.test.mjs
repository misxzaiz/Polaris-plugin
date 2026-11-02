/**
 * realbridge.test.mjs —— 真桥冒烟（第四层：真实宿主 cap.kv + 真实构建产物）
 *
 * 仅在 env BUNDLELENS_REAL=1 时执行（默认跳过，保证 npm test 离线稳定）。
 * 流程：spawn 真实 service（appConfigDir=真实配置目录 → kvclient 自发现宿主）
 *   → 确认 bundlelens.meta 落真实 kv（经宿主 /api/router-dispatch 直查）
 *   → 扫描真实构建产物目录（BUNDLELENS_REAL_DIST，默认 Polaris 主仓 dist）
 *   → 断言：ok 终态、报告维度齐备、report.<runId> 落真实 kv
 *   → 杀服务 → 清扫 bundlelens.* 键（不留残留）。
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

const REAL = process.env.BUNDLELENS_REAL === '1'
const APP_CONFIG_DIR = process.env.BUNDLELENS_REAL_APPCONFIG || path.join(process.env.APPDATA || '', 'Polaris')
const REAL_DIST = process.env.BUNDLELENS_REAL_DIST || 'D:\\space\\base\\Polaris\\dist'

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
async function realKvSet(key, value) {
  const r = await hostDispatch('cap.kv', { action: 'set', key, value })
  return r && r.ok
}

function loadHostConfig() {
  const cfgPath = path.join(APP_CONFIG_DIR, 'config.json')
  const root = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const web = root.web || {}
  if (typeof web.port !== 'number') throw new Error(`config.json 缺 web.port：${cfgPath}`)
  return { host: web.host || '127.0.0.1', port: web.port, token: web.token || '' }
}

let svcProc = null
let META = null
const SvcAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${META.token}` })

test('真桥：meta 落真实 kv + 扫描真实产物 + 投影落真实 kv', { skip: !REAL && '需 BUNDLELENS_REAL=1（真桥冒烟默认关闭）' }, async (t) => {
  hostInfo = loadHostConfig()
  // 探活真实宿主
  const alive = await new Promise((resolve) => {
    const req = http.get({ hostname: hostInfo.host, port: hostInfo.port, path: '/api/health', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200) })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
  if (!alive) { t.skip('真实宿主未运行，跳过真桥冒烟'); return }
  if (!fs.existsSync(REAL_DIST)) { t.skip(`真实产物目录不存在：${REAL_DIST}`); return }

  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), '0', APP_CONFIG_DIR], { stdio: ['ignore', 'pipe', 'pipe'] })
  svcProc.stderr.on('data', () => { /* 调试时打开 */ })
  // 先清掉可能残留的旧 meta（指向已死端口），等新服务注册的新 meta（比对 pid 变化）
  const stale = await realKvGet('bundlelens.meta')
  await hostDispatch('cap.kv', { action: 'delete', key: 'bundlelens.meta' })
  META = await waitFor(async () => {
    const m = await realKvGet('bundlelens.meta')
    return m && (!stale || m.pid !== stale.pid) ? m : null
  }, { label: 'bundlelens.meta 落真实 kv（新 pid）' })
  assert.ok(META && typeof META.port === 'number' && META.token)

  // 清扫上次残留的 runs/latest，保证本次断言纯净
  await realKvSet('bundlelens.runs', [])

  const r = await fetch(`http://127.0.0.1:${META.port}/api/scan`, {
    method: 'POST', headers: SvcAuth(), body: JSON.stringify({ path: REAL_DIST }),
  })
  assert.equal(r.status, 200)
  const { runId } = await r.json()
  const st = await waitFor(async () => {
    const s = await (await fetch(`http://127.0.0.1:${META.port}/api/scan/${runId}`, { headers: SvcAuth() })).json()
    return s.status && s.status !== 'running' ? s : null
  }, { timeoutMs: 300_000, label: '真实产物扫描完成' })
  assert.equal(st.status, 'ok', st.error || '')
  const rep = (await (await fetch(`http://127.0.0.1:${META.port}/api/report/${runId}`, { headers: SvcAuth() })).json()).report
  assert.ok(rep.totals.totalBytes > 10_000, '真实产物总体积合理')
  assert.ok(rep.totals.chunks >= 1, '至少一个 chunk')
  if (rep.totals.chunksNoMap === rep.totals.chunks) {
    // 产物没开 sourcemap（如 vite 默认）：诚实降级为文件级，且必须给出 no-map 建议
    assert.ok(rep.suggestions.some((s) => s.id === 'no-map'), '无 map 时应给出开启 sourcemap 建议')
  } else {
    assert.ok(rep.packages.length >= 1, '有 map 时至少解析出一个包')
  }
  assert.ok(Array.isArray(rep.suggestions))
  const proj = await realKvGet(`bundlelens.report.${runId}`)
  assert.ok(proj && proj.totals && proj.totals.totalBytes > 10_000, 'report 落真实 kv')
  const latest = await waitFor(async () => (await realKvGet('bundlelens.latest')) === runId ? true : null, { timeoutMs: 20_000, label: 'latest 落真实 kv' })
  assert.ok(latest)

  // 清扫：不留残留键
  await realKvSet(`bundlelens.report.${runId}`, null)
  await realKvSet('bundlelens.latest', null)
  await realKvSet('bundlelens.runs', [])
})

after(async () => {
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
})
