// realbridge.test.mjs —— 真桥冒烟（env 门控：REAL_BRIDGE=1 才跑）
//
// 前置：真实 Polaris 宿主在跑（Web 端口 + token 可发现）。测试内容：
//   1. kvclient 直连真实宿主：deadlens.test 写/读/删往返
//   2. 真服务子进程 + 真实 kv 投影：扫一个临时目录 → deadlens.latest/runs/report 落真实 kv
//   3. 清扫全部 deadlens.* 测试键（除 meta——服务心跳键，服务停止后由下次心跳覆盖；
//      为做到零残留，测试服务用专用 appConfigDir 不影响真服务，全部键测后清除）
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createKvClient } = require('../service/kvclient.js')
const SERVICE = join(import.meta.dirname, '..', 'service', 'main.js')

const RUN = process.env.REAL_BRIDGE === '1'

test('真桥冒烟：kv 往返 + 真服务投影 + 零残留', { timeout: 120_000 }, async (t) => {
  if (!RUN) {
    t.skip('需真实宿主：设 REAL_BRIDGE=1 运行（桌面/Web 宿主须在跑）')
    return
  }
  // 真实宿主发现：锚点/config 自发现（kvclient 内建）；POLARIS_* env 优先
  const appConfigDir = process.env.DCL_APP_CONFIG_DIR || ''
  const kv = createKvClient({ appConfigDir, log: () => {} })

  // 1) kv 写读删往返
  const probeKey = `deadlens.test.${Date.now().toString(36)}`
  await kv.kvSet(probeKey, { hello: 'bridge', n: 42 })
  const back = await kv.kvGet(probeKey)
  assert.deepEqual(back, { hello: 'bridge', n: 42 })
  await kv.kvDel(probeKey)
  assert.equal(await kv.kvGet(probeKey), null)

  // 2) 真服务扫临时目录 → 投影进真实 kv
  const fixture = mkdtempSync(join(tmpdir(), 'dcl-real-'))
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'realfix', main: 'index.js' }))
  writeFileSync(join(fixture, 'index.js'), "import { a } from './lib'\nexport const m = a")
  writeFileSync(join(fixture, 'lib.js'), 'export const a = 1')
  writeFileSync(join(fixture, 'ghost.js'), 'export const dead = 1')
  const cfgDir = mkdtempSync(join(tmpdir(), 'dcl-real-cfg-'))
  const svcPort = 10800 + Math.floor(Math.random() * 300)

  const child = spawn(process.execPath, [SERVICE, String(svcPort), cfgDir], {
    // 注意：不给 POLARIS_* env → kvclient 走真实自发现（这才是真桥）
    env: { ...process.env, POLARIS_HOST: '', POLARIS_PORT: '', POLARIS_TOKEN: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (c) => { stderr += c })
  const addedKeys = []

  try {
    // 等服务健康 + meta（经真实自发现写入真实 kv）
    let meta = null
    for (let i = 0; i < 100; i++) {
      meta = await kv.kvGet('deadlens.meta')
      if (meta && typeof meta.port === 'number' && meta.port === svcPort) break
      await new Promise((r) => setTimeout(r, 300))
    }
    assert.ok(meta && meta.port === svcPort, `meta 应就绪且端口正确: ${stderr.slice(-400)}`)

    function svcJson(path, opt = {}) {
      return new Promise((resolve, reject) => {
        const data = opt.body ? JSON.stringify(opt.body) : null
        const headers = { Authorization: `Bearer ${meta.token}` }
        if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data) }
        const req = http.request({ hostname: '127.0.0.1', port: svcPort, path, method: opt.method || 'GET', headers }, (res) => {
          let buf = ''
          res.on('data', (c) => { buf += c })
          res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (_) { resolve(null) } })
        })
        req.on('error', reject)
        if (data) req.write(data)
        req.end()
      })
    }

    const scan = await svcJson('/api/scan', { method: 'POST', body: { root: fixture } })
    assert.equal(scan && scan.ok, true, `发起扫描应成功: ${JSON.stringify(scan)}`)
    let done = null
    for (let i = 0; i < 100; i++) {
      done = (await svcJson(`/api/run/${scan.runId}`)).run
      if (done && (done.status === 'done' || done.status === 'error')) break
      await new Promise((r) => setTimeout(r, 300))
    }
    assert.equal(done.status, 'done', `真桥扫描应完成: ${stderr.slice(-400)}`)
    assert.equal(done.counts.orphanFiles, 1)

    // 投影进真实 kv
    addedKeys.push('deadlens.latest', 'deadlens.runs', `deadlens.report.${scan.runId}`)
    let latest = null
    for (let i = 0; i < 30; i++) {
      latest = await kv.kvGet('deadlens.latest')
      if (latest === scan.runId) break
      await new Promise((r) => setTimeout(r, 300))
    }
    assert.equal(latest, scan.runId, 'latest 应投影到真实 kv')
    const runs = await kv.kvGet('deadlens.runs')
    assert.ok(Array.isArray(runs) && runs.some((x) => x.id === scan.runId))
    const report = await kv.kvGet(`deadlens.report.${scan.runId}`)
    assert.ok(report && report.counts && report.counts.files === 4, '报告应投影到真实 kv')

    // 3) 自检（走真服务）
    const st = await svcJson('/api/selftest', { method: 'POST', body: {} })
    assert.equal(st.selftest.ok, true)
  } finally {
    child.kill()
    // 清扫测试键（含 meta 与本次新增的全部键；meta 由真服务的下次心跳重写，不影响在线插件）
    const keys = await kv.kvKeys()
    for (const key of keys) {
      if (key === 'deadlens.meta' || key.startsWith('deadlens.test.') || key.startsWith('deadlens.report.')
        || key === 'deadlens.latest' || key === 'deadlens.runs' || key === 'deadlens.settings') {
        await kv.kvDel(key).catch(() => {})
      }
    }
    rmSync(fixture, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
    void addedKeys
  }
})
