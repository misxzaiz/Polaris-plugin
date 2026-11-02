/**
 * bridge.test.mjs —— 服务集成冒烟（mock bridge + mock OSV + 真实子进程）
 *
 * 宿主未运行时的第三层验证：起一个与生产 kvclient 契约逐字节对齐的
 * mock bridge（POST /api/router-dispatch 处理 cap.kv 四动作，{ok,result} 信封；
 * GET /api/health 200）+ 一个 mock OSV 服务器（querybatch/vulns 固定响应），
 * 让 service 以「真实发现路径」运行（POLARIS_HOST/PORT env + DEPPROBE_OSV_BASE env）：
 *   ① depprobe.meta {port,token} 真实落 kv；
 *   ② 真实扫描编排全链路：临时目录夹具（六仓库 + node_modules 干扰项）→
 *      发现→解析→querybatch→详情→报告，findings/fixPlan/warnings 逐项断言；
 *   ③ node_modules 下的 lockfile 必须被跳过（不把 vendored 副本当权威）；
 *   ④ 忽略规则落 kv settings 并在重扫后真实生效（ignoredCount）；
 *   ⑤ runs 索引与 report.<runId> 落 kv；
 *   ⑥ /api/check 单包即时查询路径可用。
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

// ── 端口与夹具 ──────────────────────────────────────────────────────────────
const PORT_BRIDGE = 29510 + Math.floor(Math.random() * 100)
const PORT_SVC = 29610 + Math.floor(Math.random() * 100)
const PORT_OSV = 29710 + Math.floor(Math.random() * 100)
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-probe-test-'))
function mk(rel, content) {
  const full = path.join(TMP, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}
mk('repoA/package-lock.json', JSON.stringify({
  lockfileVersion: 3,
  packages: { '': { version: '0.0.0' }, 'node_modules/lodash': { version: '4.17.15' }, 'node_modules/react': { version: '18.2.0' } },
}))
mk('repoA/sub/pnpm-lock.yaml', ['lockfileVersion: \'9.0\'', '', 'packages:', '', '  /chalk@2.4.2:', '    resolution: {integrity: sha512-x}', ''].join('\n'))
mk('repoA/node_modules/fake/pkg/package-lock.json', JSON.stringify({ packages: { 'node_modules/evil-vendored': { version: '0.0.1' } } }))
mk('repoB/Cargo.lock', ['version = 3', '', '[[package]]', 'name = "serde"', 'version = "1.0.100"', 'source = "registry+https://github.com/rust-lang/crates.io-index"', '', '[[package]]', 'name = "libc"', 'version = "0.2.100"'].join('\n'))
mk('repoC/requirements.txt', ['requests==2.28.0', 'flask==2.0.1', ''].join('\n'))
mk('repoC/go.mod', ['module example.com/m', '', 'require golang.org/x/crypto v0.14.0', ''].join('\n'))

// ── mock bridge（契约与生产 kvclient 对齐）──────────────────────────────────
const kvStore = new Map()
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'POST' && req.url === '/api/router-dispatch') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const { req: inner } = JSON.parse(body)
        const p = inner.payload || {}
        let result = {}
        if (p.action === 'get') result = { value: kvStore.has(p.key) ? kvStore.get(p.key) : undefined }
        else if (p.action === 'set') { kvStore.set(p.key, p.value); result = { ok: true } }
        else if (p.action === 'delete') { kvStore.delete(p.key); result = { ok: true } }
        else if (p.action === 'list') result = { keys: [...kvStore.keys()] }
        else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 action ${p.action}` })); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result }))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }
  res.writeHead(404); res.end()
})

// ── mock OSV（固定响应；断言请求形状）───────────────────────────────────────
const osvHits = { batch: 0, vuln: 0 }
const VULN_L = { id: 'GHSA-mock-lodash', summary: 'Prototype pollution in lodash', aliases: ['CVE-2020-8203'], database_specific: { severity: 'HIGH' }, affected: [{ ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] }] }
const VULN_S = { id: 'RUSTSEC-mock-serde', summary: 'serde issue', aliases: [], database_specific: { severity: 'CRITICAL' }, affected: [{ ranges: [{ type: 'SEMVER', events: [{ fixed: '1.0.200' }] }] }] }
let batchQueriesSeen = 0
const mockOsv = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/querybatch') {
    osvHits.batch += 1
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const parsed = JSON.parse(body)
      batchQueriesSeen += (parsed.queries || []).length
      const results = (parsed.queries || []).map((q) => {
        const key = `${q.package.ecosystem}:${q.package.name}@${q.version}`
        if (key === 'npm:lodash@4.17.15') return { vulns: [{ id: VULN_L.id }] }
        if (key === 'crates.io:serde@1.0.100') return { vulns: [{ id: VULN_S.id }] }
        return {}
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results }))
    })
    return
  }
  const m = /^\/v1\/vulns\/(.+)$/.exec(req.url || '')
  if (req.method === 'GET' && m) {
    osvHits.vuln += 1
    if (m[1] === VULN_L.id) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(VULN_L)); return }
    if (m[1] === VULN_S.id) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(VULN_S)); return }
    res.writeHead(404); res.end()
    return
  }
  res.writeHead(404); res.end()
})

let svcProc = null
const svcEnv = {
  ...process.env,
  POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token',
  DEPPROBE_OSV_BASE: `http://127.0.0.1:${PORT_OSV}`,
}
const auth = () => {
  const meta = kvStore.get('depprobe.meta')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` }
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  await new Promise((r) => mockOsv.listen(PORT_OSV, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC)], { env: svcEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitFor(async () => {
    try { return (await fetch(`${SERVICE_URL}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
})

after(async () => {
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  try { mockOsv.close() } catch (_) { /* 忽略 */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (_) { /* 忽略 */ }
  await sleep(120)
})

// ── 用例 ────────────────────────────────────────────────────────────────────

test('meta 真实落 kv；/api/meta 自报 OSV 基址', async () => {
  const meta = await waitFor(() => kvStore.get('depprobe.meta') || null, { label: 'meta 落 kv' })
  assert.equal(meta.port, PORT_SVC)
  assert.ok(typeof meta.token === 'string' && meta.token.length >= 32)
  const health = await (await fetch(`${SERVICE_URL}/__health`)).json()
  assert.equal(health.degraded, false)
  const m = await (await fetch(`${SERVICE_URL}/api/meta`, { headers: auth() })).json()
  assert.equal(m.osvBase, `http://127.0.0.1:${PORT_OSV}`)
})

test('扫描全链路：发现（跳过 node_modules）→解析→OSV→报告→kv 投影', async () => {
  const post = await fetch(`${SERVICE_URL}/api/scan`, { method: 'POST', headers: auth(), body: JSON.stringify({ paths: [TMP] }) })
  assert.equal(post.status, 200)
  const { runId } = await post.json()
  assert.ok(runId)

  const st = await waitFor(async () => {
    const r = await (await fetch(`${SERVICE_URL}/api/scan/${runId}`, { headers: auth() })).json()
    return ['done', 'error'].includes(r.status) ? r : null
  }, { label: '扫描完成', timeoutMs: 30_000 })
  assert.equal(st.status, 'done', `扫描应成功：${JSON.stringify(st.progress)}`)
  const rep = st.report
  assert.ok(rep, 'done 状态必须带报告')

  // 范围：5 个 lockfile，分布 4 个目录（repoA 与 repoA/sub 各自成仓），node_modules 内的 fake/pkg 被跳过
  assert.equal(rep.lockfileCount, 5, `发现数：${JSON.stringify(rep.repos)}`)
  assert.equal(rep.repos.length, 4)
  // 解析正确性：repoA 3 包（lodash/react/chalk）+ repoB 2 包 + repoC 3 包（requests/flask/x-crypto）= 8
  assert.equal(rep.packageCount, 8)
  // node_modules 干扰项绝不能出现
  assert.ok(!JSON.stringify(rep).includes('evil-vendored'), 'node_modules 下的 vendored 包不得进报告')
  // 发现与修复方案
  const lodash = rep.findings.find((f) => f.pkg === 'lodash')
  assert.ok(lodash, 'lodash 4.17.15 应命中 mock 漏洞')
  assert.equal(lodash.severity, 'high')
  assert.deepEqual(lodash.fixed, ['4.17.19'])
  assert.equal(lodash.repoDir, path.join(TMP, 'repoA'))
  const serde = rep.findings.find((f) => f.pkg === 'serde')
  assert.ok(serde && serde.severity === 'critical' && serde.fixed[0] === '1.0.200')
  assert.equal(rep.findingCount, 2)
  assert.equal(rep.counts.high, 1)
  assert.equal(rep.counts.critical, 1)
  const fix = rep.fixPlan.find((p) => p.pkg === 'lodash')
  assert.equal(fix.to, '4.17.19')
  // kv 投影
  await waitFor(() => kvStore.get(`depprobe.report.${runId}`) || null, { label: 'report 落 kv' })
  const runs = await waitFor(() => (kvStore.get('depprobe.runs') || []).some((x) => x.runId === runId) ? kvStore.get('depprobe.runs') : null, { label: 'runs 落 kv' })
  assert.ok(runs[0].packageCount >= 7)
  assert.equal(kvStore.get('depprobe.latest'), runId)
  // osv 调用形状
  assert.ok(osvHits.batch >= 1)
  assert.ok(osvHits.vuln >= 2)
})

test('忽略规则：落 kv settings 并在重扫后真实生效（ignoredCount）', async () => {
  const cur = kvStore.get('depprobe.settings') || { ignores: [], recentPaths: [] }
  cur.ignores = [{ pkg: 'lodash', vulnId: 'GHSA-mock-lodash', reason: '测试忽略', at: Date.now() }]
  const put = await fetch(`${SERVICE_URL}/api/settings`, { method: 'POST', headers: auth(), body: JSON.stringify(cur) })
  assert.equal(put.status, 200)

  const post = await fetch(`${SERVICE_URL}/api/scan`, { method: 'POST', headers: auth(), body: JSON.stringify({ paths: [path.join(TMP, 'repoA')] }) })
  const { runId } = await post.json()
  const st = await waitFor(async () => {
    const r = await (await fetch(`${SERVICE_URL}/api/scan/${runId}`, { headers: auth() })).json()
    return ['done', 'error'].includes(r.status) ? r : null
  }, { label: '重扫完成', timeoutMs: 30_000 })
  assert.equal(st.status, 'done')
  const rep = st.report
  assert.ok(!rep.findings.some((f) => f.pkg === 'lodash'), '被忽略的发现不得出现在 findings')
  assert.equal(rep.ignoredCount, 1)
  assert.ok(rep.findings.some((f) => f.pkg === 'serde' || f.pkg === 'chalk') === false) // repoA 只有 lodash/react/chalk
  // recentPaths 已记录
  const settings = kvStore.get('depprobe.settings')
  assert.ok(settings.recentPaths.some((p) => p.includes('repoA')))
})

test('护栏：不存在路径→警告；并发扫描→409；错误文件→report.error', async () => {
  // 409：先起一个真实扫描占位（小夹具很快，用大一点的等待窗口竞争）
  const post = await fetch(`${SERVICE_URL}/api/scan`, { method: 'POST', headers: auth(), body: JSON.stringify({ paths: [TMP] }) })
  const { runId } = await post.json()
  const dup = await fetch(`${SERVICE_URL}/api/scan`, { method: 'POST', headers: auth(), body: JSON.stringify({ paths: [TMP] }) })
  if (dup.status === 409) {
    const j = await dup.json()
    assert.ok(j.error.includes('进行中'))
  } else {
    assert.equal(dup.status, 200) // 首扫已完成的竞态窗口，允许
  }
  await waitFor(async () => {
    const r = await (await fetch(`${SERVICE_URL}/api/scan/${runId}`, { headers: auth() })).json()
    return ['done', 'error'].includes(r.status)
  }, { label: '占位扫描完成', timeoutMs: 30_000 })

  const bad = await fetch(`${SERVICE_URL}/api/scan`, { method: 'POST', headers: auth(), body: JSON.stringify({ paths: ['D:\\definitely-not-exist-12345'] }) })
  const { runId: badId } = await bad.json()
  const st = await waitFor(async () => {
    const r = await (await fetch(`${SERVICE_URL}/api/scan/${badId}`, { headers: auth() })).json()
    return ['done', 'error'].includes(r.status) ? r : null
  }, { label: '坏路径扫描结束', timeoutMs: 30_000 })
  assert.equal(st.status, 'error')
  assert.ok(st.progress.error.includes('未发现任何受支持的 lockfile'))
  // 鉴权：无 token 401
  const un = await fetch(`${SERVICE_URL}/api/meta`)
  assert.equal(un.status, 401)
  // 空路径 400
  const empty = await fetch(`${SERVICE_URL}/api/scan`, { method: 'POST', headers: auth(), body: JSON.stringify({ paths: ['   '] }) })
  assert.equal(empty.status, 400)
})

test('单包即时查询 /api/check', async () => {
  const r = await (await fetch(`${SERVICE_URL}/api/check`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ ecosystem: 'npm', pkg: 'lodash', version: '4.17.15' }),
  })).json()
  assert.equal(r.findings.length, 1)
  assert.equal(r.findings[0].vulnId, 'GHSA-mock-lodash')
  const clean = await (await fetch(`${SERVICE_URL}/api/check`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ ecosystem: 'npm', pkg: 'left-pad', version: '1.3.0' }),
  })).json()
  assert.equal(clean.findings.length, 0)
  const badEco = await fetch(`${SERVICE_URL}/api/check`, { method: 'POST', headers: auth(), body: JSON.stringify({ ecosystem: 'maven', pkg: 'x', version: '1' }) })
  assert.equal(badEco.status, 502)
})

test('离线自检（服务内 core）通过', async () => {
  const r = await (await fetch(`${SERVICE_URL}/api/selftest`, { method: 'POST', headers: auth(), body: '{}' })).json()
  assert.equal(r.ok, true, r.checks.join('\n'))
})
