/**
 * realbridge.test.mjs —— 真桥冒烟（第四层：真实宿主 cap.kv + 真实 OSV 网络）
 *
 * 仅在 env DEP_PROBE_REAL=1 时执行（默认跳过，保证 npm test 离线稳定）。
 * 流程：spawn 真实 service（appConfigDir=真实配置目录 → kvclient 自发现宿主；
 * 不注入 DEPPROBE_OSV_BASE → 真实 api.osv.dev）→ 确认 depprobe.meta 落真实 kv
 * （经宿主 9820 HTTP cap.kv 直查）→ 扫描 lodash@4.17.15 夹具 → 断言真实漏洞
 * （GHSA/CVE 形态 + fixed ≥4.17.x）→ 杀服务 → 清扫 depprobe.* 键（不留残留）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const REAL = process.env.DEP_PROBE_REAL === '1'
const APP_CONFIG_DIR = process.env.DEP_PROBE_REAL_APPCONFIG
  || path.join(process.env.APPDATA || '', 'Polaris')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 60_000, step = 400, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

// ── 宿主直查（cap.kv 经 /api/router-dispatch，Bearer md5(token)）────────────
let hostInfo = null
function hostDispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } })
    const req = http.request({
      hostname: hostInfo.host, port: hostInfo.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: `Bearer ${crypto.createHash('md5').update(hostInfo.token).digest('hex')}` },
      timeout: 10_000,
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
async function realKvKeys() {
  const r = await hostDispatch('cap.kv', { action: 'list' })
  return r && r.ok && Array.isArray(r.result && r.result.keys) ? r.result.keys : []
}

// ── 夹具：lodash 4.17.15（真实世界已知多漏洞）───────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-probe-real-'))
fs.writeFileSync(path.join(TMP, 'package-lock.json'), JSON.stringify({
  lockfileVersion: 3,
  packages: { '': { version: '0.0.0' }, 'node_modules/lodash': { version: '4.17.15' }, 'node_modules/react': { version: '18.3.1' } },
}))

let svcProc = null
const SERVICE_PORT = 29876

before(async () => {
  if (!REAL) return
  // 读真实 web 配置（hostDispatch 用）
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
  await sleep(300)
  // 清扫：本插件首次交付，真实 kv 中 depprobe.* 全部是本次冒烟产生的
  try {
    const keys = await realKvKeys()
    const mine = keys.filter((k) => /^depprobe\./.test(k))
    for (const k of mine) await realKvDel(k)
    if (mine.length) console.log(`[realbridge] 清扫 depprobe.* 键 ${mine.length} 个`)
  } catch (_) { /* 清扫失败如实留痕 */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (_) { /* 忽略 */ }
})

test('真桥：meta 落真实 kv + 真实 OSV 命中已知漏洞 + 报告落真实 kv', { skip: !REAL && '需要 DEP_PROBE_REAL=1 与真实宿主' }, async () => {
  // 前置：真实 kv 中无本插件残留（首次交付）
  const preKeys = (await realKvKeys()).filter((k) => /^depprobe\./.test(k))
  assert.equal(preKeys.length, 0, `真实 kv 已有 depprobe.* 残留：${preKeys.join(',')}`)

  // 真实发现路径：appConfigDir → anchor/config → 宿主；真实 OSV（无环境覆盖）
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(SERVICE_PORT), APP_CONFIG_DIR], {
    env: { ...process.env, DEP_PROBE_REAL: undefined }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  svcProc.stderr.on('data', () => { /* 静默；失败断言会说明 */ })

  // meta 落真实 kv（经宿主 cap.kv 直查——完整生产链路：service→kvclient→router_dispatch→SqliteStorage）
  const meta = await waitFor(async () => (await realKvGet('depprobe.meta')) || null, { label: 'meta 落真实 kv', timeoutMs: 30_000 })
  assert.equal(meta.port, SERVICE_PORT)
  assert.ok(meta.token && meta.token.length >= 32)

  // 真实扫描（真实 api.osv.dev）
  const scanRes = await fetch(`http://127.0.0.1:${SERVICE_PORT}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` },
    body: JSON.stringify({ paths: [TMP] }),
  })
  assert.equal(scanRes.status, 200)
  const { runId } = await scanRes.json()
  const st = await waitFor(async () => {
    const r = await (await fetch(`http://127.0.0.1:${SERVICE_PORT}/api/scan/${runId}`, { headers: { Authorization: `Bearer ${meta.token}` } })).json()
    return ['done', 'error'].includes(r.status) ? r : null
  }, { label: '真实扫描完成', timeoutMs: 120_000 })
  assert.equal(st.status, 'done', `真实扫描失败：${JSON.stringify(st.progress || st.error)}`)
  const rep = st.report
  assert.equal(rep.packageCount, 2)
  const lodash = rep.findings.filter((f) => f.pkg === 'lodash')
  assert.ok(lodash.length >= 1, 'lodash@4.17.15 在真实 OSV 必有多条已知漏洞')
  const ids = lodash.map((f) => f.vulnId)
  assert.ok(ids.some((id) => /^(GHSA|CVE)-/.test(id)), `漏洞 ID 应为 GHSA/CVE 形态：${ids.join(',')}`)
  assert.ok(lodash.some((f) => f.fixed && f.fixed.length), '真实公告应给出 fixed 版本')
  assert.ok(lodash.every((f) => f.detailOk), '真实详情应全部补全')
  // react 18.3.1 应干净（截至 2026-11 无已知 vuln 命中）
  assert.ok(!rep.findings.some((f) => f.pkg === 'react'), 'react 18.3.1 不应有发现（若 OSV 新增公告则更新夹具版本）')

  // 报告落真实 kv + 真桥自检
  const kvRep = await waitFor(async () => (await realKvGet(`depprobe.report.${runId}`)) || null, { label: 'report 落真实 kv' })
  assert.equal(kvRep.runId, runId)
  assert.equal(kvRep.findingCount, rep.findingCount)
  const selftest = await (await fetch(`http://127.0.0.1:${SERVICE_PORT}/api/selftest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` }, body: '{}' })).json()
  assert.equal(selftest.ok, true)
})
