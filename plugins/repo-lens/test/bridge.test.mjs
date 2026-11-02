/**
 * bridge.test.mjs —— 服务集成冒烟（mock bridge + 真实 git 夹具仓库 + 真实服务子进程）
 *
 * 宿主未运行时的第三层验证：起一个与生产 kvclient 契约逐字节对齐的
 * mock bridge（POST /api/router-dispatch 处理 cap.kv 四动作，{ok,result} 信封；
 * GET /api/health 200），让 service 以「真实发现路径」运行
 * （POLARIS_HOST/PORT/TOKEN env），对 fixtures.mjs 构建的真实 git 仓库做完整扫描：
 *   ① repolens.meta {port,token} 真实落 kv；
 *   ② 真实扫描编排全链路：churn/热点/耦合/重复/大对象/分支/卫生/健康分逐项断言
 *      （夹具形态见 fixtures.mjs 头注：co=3 的共变对、10 行重复块、rename、
 *       2MB 大对象、40 天陈旧分支、wip 草率消息、巨提交）；
 *   ③ 文件下钻端点（时间线 52 桶 + 共变伙伴）；
 *   ④ 鉴权：无 token 401 / 坏 token 401；
 *   ⑤ 非仓库路径扫描 → error 终态而非挂死；
 *   ⑥ runs 索引与 report.<runId> 落 kv（投影封顶后仍含关键维度）；
 *   ⑦ /api/selftest 离线自检通过 + git 版本可见。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildFixtureRepo, rmRfForce } from './fixtures.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, { timeoutMs = 30_000, step = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`)
    await sleep(step)
  }
}

const PORT_BRIDGE = 29510 + Math.floor(Math.random() * 100)
const PORT_SVC = 29610 + Math.floor(Math.random() * 100)
const SERVICE_URL = `http://127.0.0.1:${PORT_SVC}`

const FIXTURE = buildFixtureRepo()

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

let svcProc = null
const svcEnv = {
  ...process.env,
  POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(PORT_BRIDGE), POLARIS_TOKEN: 'mock-bridge-token',
}
const auth = () => {
  const meta = kvStore.get('repolens.meta')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` }
}

before(async () => {
  await new Promise((r) => bridge.listen(PORT_BRIDGE, '127.0.0.1', r))
  svcProc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT_SVC), ''], { env: svcEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  svcProc.stderr.on('data', () => { /* 服务日志：调试时打开 */ })
  await waitFor(async () => {
    try { return (await fetch(`${SERVICE_URL}/__health`)).status === 200 } catch (_) { return false }
  }, { label: 'service health' })
  await waitFor(() => kvStore.has('repolens.meta'), { label: 'repolens.meta 落 kv' })
})

after(async () => {
  try { if (svcProc) svcProc.kill() } catch (_) { /* 忽略 */ }
  try { bridge.close() } catch (_) { /* 忽略 */ }
  rmRfForce(FIXTURE.dir)
})

// ── 用例 ────────────────────────────────────────────────────────────────────

let RUN_ID = null
let REPORT = null

test('meta 落 kv：port/token/pid 齐全', () => {
  const meta = kvStore.get('repolens.meta')
  assert.equal(meta.port, PORT_SVC)
  assert.ok(meta.token && meta.token.length >= 32)
  assert.equal(typeof meta.pid, 'number')
})

test('鉴权：无 token 401 / 坏 token 401 / 健康端点豁免', async () => {
  const noAuth = await fetch(`${SERVICE_URL}/api/meta`)
  assert.equal(noAuth.status, 401)
  const bad = await fetch(`${SERVICE_URL}/api/meta`, { headers: { Authorization: 'Bearer wrong' } })
  assert.equal(bad.status, 401)
  const health = await fetch(`${SERVICE_URL}/__health`)
  assert.equal(health.status, 200)
})

/** 轮询直至扫描离开 running 态（终态对象才返回，running 返回 null 继续 wait） */
async function pollScan(runId, label, timeoutMs = 60_000) {
  return waitFor(async () => {
    const st = await (await fetch(`${SERVICE_URL}/api/scan/${runId}`, { headers: auth() })).json()
    return st.status && st.status !== 'running' ? st : null
  }, { timeoutMs, label, step: 500 })
}

test('扫描发起 → 轮询 → ok 终态', async () => {
  const r = await fetch(`${SERVICE_URL}/api/scan`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ path: FIXTURE.dir, days: 365, maxCommits: 500 }),
  })
  assert.equal(r.status, 200)
  const { runId } = await r.json()
  RUN_ID = runId
  const st = await pollScan(runId, 'scan finish')
  assert.equal(st.status, 'ok')
})

test('报告：八维度齐备且与夹具形态逐项对上', async () => {
  const r = await fetch(`${SERVICE_URL}/api/report/${RUN_ID}`, { headers: auth() })
  const body = await r.json()
  assert.equal(r.status, 200, `报告应可取：${JSON.stringify(body).slice(0, 200)}`)
  const { report } = body
  REPORT = report
  assert.equal(report.status, 'ok')
  assert.equal(report.repo.branch, 'main')
  assert.ok(report.totals.commits >= 6, `提交数 ${report.totals.commits} ≥ 6`)
  assert.ok(report.totals.filesTracked >= 25, `工作区文件 ${report.totals.filesTracked} ≥ 25（22 个 gen/ + 源码）`)

  // 热点：util.ts 三次修改应在前列；rename 后 core/parser.ts 归因到新路径
  const paths = report.hotspots.map((h) => h.path)
  assert.ok(paths.includes('src/util.ts'), '热点含 src/util.ts')
  assert.ok(paths.some((p) => p === 'src/core/parser.ts'), 'rename 归因到新路径 src/core/parser.ts')
  const util = report.hotspots.find((h) => h.path === 'src/util.ts')
  assert.equal(util.commits, 5, `util.ts 提交 5 次（c1 初始/c2/c3/c4/c6），实测 ${util.commits}`)
  assert.ok(util.cxScore > 0, '复杂度已读内容')
  const parser = report.hotspots.find((h) => h.path === 'src/core/parser.ts')
  // 归因语义（文档明示）：rename 提交（c5）计入新路径；改名前的历史留在旧路径名下
  assert.ok(parser && parser.commits === 1, `parser（新路径）应只含 c5 rename 提交，实测 ${parser ? parser.commits : '无'}`)

  // 时间耦合：util ⇄ parser 共变（历史路径名下 c1-c4 全部同窗，co=4）
  const couple = report.couples.find((c) =>
    (c.a === 'src/util.ts' && (c.b === 'src/parser.ts' || c.b === 'src/core/parser.ts')) ||
    (c.b === 'src/util.ts' && (c.a === 'src/parser.ts' || c.a === 'src/core/parser.ts')))
  assert.ok(couple, `应有 util⇄parser 耦合对，实际: ${JSON.stringify(report.couples.slice(0, 3))}`)
  assert.ok(couple.co >= 3)

  // 重复：dupA ⇄ dupB
  const dup = report.duplications.pairs.find((p) =>
    (p.a === 'src/dupA.ts' && p.b === 'src/dupB.ts') || (p.a === 'src/dupB.ts' && p.b === 'src/dupA.ts'))
  assert.ok(dup, `应检出 dupA⇄dupB 重复，实际: ${JSON.stringify(report.duplications.pairs.slice(0, 2))}`)
  assert.ok(dup.lines >= 6)

  // 大对象：big/blob.bin 2MB 居首（二进制不被扩展名过滤）
  assert.ok(report.blobs.length >= 1)
  assert.equal(report.blobs[0].path, 'big/blob.bin')
  assert.ok(report.blobs[0].mb >= 1.9 && report.blobs[0].mb <= 2.1, `大对象 ${report.blobs[0].mb}MB ≈ 2MB`)

  // 分支：feature/stale 停在 30 天前
  const stale = report.branches.find((b) => b.branch === 'feature/stale')
  assert.ok(stale, '分支列表含 feature/stale')
  assert.ok(Date.now() / 1000 - stale.date > 29 * 86400, 'feature/stale 陈旧（≥29 天）')

  // 卫生：wip 草率 + 巨提交（23 文件）
  assert.ok(report.hygiene.sloppy >= 1, 'wip 判草率')
  assert.ok(report.hygiene.bigCommits >= 1, '巨提交计数')

  // 巴士因子与健康分
  assert.ok(report.busFactor.totalAuthors >= 3)
  assert.ok(report.health && report.health.total >= 0 && report.health.total <= 100)

  // 二进制按契约不进热点榜（热点=代码文件；churn 内部仍计入）
  const logo = report.hotspots.find((h) => h.path === 'assets/logo.png')
  assert.equal(logo, undefined, '二进制资产不应出现在热点榜')
})

test('文件下钻：util.ts 时间线 52 桶 + 共变伙伴含 parser', async () => {
  const r = await fetch(`${SERVICE_URL}/api/file?runId=${RUN_ID}&path=${encodeURIComponent('src/util.ts')}`, { headers: auth() })
  assert.equal(r.status, 200)
  const d = await r.json()
  assert.equal(d.path, 'src/util.ts')
  assert.equal(d.timeline.length, 52)
  assert.ok(d.timeline.some((b) => b.commits > 0), '时间线有提交活动')
  assert.ok(d.coPartners.some((p) => p.path.includes('parser')), '共变伙伴含 parser')
  assert.ok(d.summary && d.summary.score >= 0)
})

test('非仓库路径：error 终态且服务存活', async () => {
  const r = await fetch(`${SERVICE_URL}/api/scan`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ path: process.env.TEMP || 'C:\\Windows\\Temp', days: 30 }),
  })
  const { runId } = await r.json()
  const st = await pollScan(runId, 'bad path scan', 30_000)
  assert.equal(st.status, 'error')
  const health = await fetch(`${SERVICE_URL}/__health`)
  assert.equal(health.status, 200, '扫描失败后服务仍健康')
})

test('runs 索引与 kv 投影：report.<runId> 落 kv 且含关键维度', async () => {
  const r = await fetch(`${SERVICE_URL}/api/runs`, { headers: auth() })
  const { runs } = await r.json()
  assert.ok(runs.length >= 2)
  const mine = runs.find((x) => x.runId === RUN_ID)
  assert.ok(mine && mine.status === 'ok', '本次扫描在 runs 索引中且为 ok')
  assert.ok(kvStore.has(`repolens.report.${RUN_ID}`))
  const proj = kvStore.get(`repolens.report.${RUN_ID}`)
  assert.ok(proj.hotspots.length >= 5)
  assert.ok(Array.isArray(proj.couples))
  assert.ok(proj.health && typeof proj.health.total === 'number')
  assert.ok(kvStore.get('repolens.latest') === RUN_ID)
  // recentPaths 应记录成功路径
  const settings = kvStore.get('repolens.settings')
  assert.ok(settings.recentPaths.includes(FIXTURE.dir), '成功路径进 recentPaths')
})

test('settings 读写与 defaults 夹取', async () => {
  const r = await fetch(`${SERVICE_URL}/api/settings`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ defaults: { days: 999999, maxCommits: 50 } }),
  })
  const { settings } = await r.json()
  assert.equal(settings.defaults.days, 3650, 'days 夹到上限 3650')
  assert.equal(settings.defaults.maxCommits, 100, 'maxCommits 夹到下限 100')
  const r2 = await fetch(`${SERVICE_URL}/api/settings`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ defaults: { days: 0, maxCommits: 0 } }),
  })
  const s2 = await r2.json()
  assert.equal(s2.settings.defaults.days, 365, 'days=0 视为未设回默认 365')
  assert.equal(s2.settings.defaults.maxCommits, 5000, 'maxCommits=0 视为未设回默认 5000')
})

test('自检：离线 fixture 全绿 + git 版本可见', async () => {
  const r = await fetch(`${SERVICE_URL}/api/selftest`, { method: 'POST', headers: auth() })
  const st = await r.json()
  assert.equal(st.ok, true, JSON.stringify(st.failed || []))
  assert.match(st.git, /git version/)
})
