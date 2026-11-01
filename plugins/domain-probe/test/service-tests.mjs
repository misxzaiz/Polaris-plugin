// 服务集成测试：内存假桥（cap.kv）+ 本地 mock DoH + 真实服务子进程
// 运行：node test/service-tests.mjs
// 钩子：POLARIS_HOST/PORT/TOKEN（kvclient env 分支）+ DOMPROBE_DOH_OVERRIDES（仅 127.0.0.1）
import http from 'node:http'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }) }
  catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

// ── mock DoH：fixture 按名字匹配，默认 NOERROR 空答案 ─────────────────────────
const A = (data, ttl = 300) => ({ name: '', TTL: ttl, type: 1, data })
const TXT = (data, ttl = 300) => ({ name: '', TTL: ttl, type: 16, data: `"${data}"` })
const MX = (data, ttl = 600) => ({ name: '', TTL: ttl, type: 15, data })
const NS = (data, ttl = 3600) => ({ name: '', TTL: ttl, type: 2, data })
const SOA = (data, ttl = 3600) => ({ name: '', TTL: ttl, type: 6, data })
const CAA = (data, ttl = 3600) => ({ name: '', TTL: ttl, type: 257, data })

// mailtest.test 的 A 指向 127.0.0.1 —— 故意触发证书探测守卫（拒非公网），兼测守卫路径
const FIXTURES = [
  [/^mailtest\.test$/, 1, { Status: 0, Answer: [A('127.0.0.1')] }],
  [/^mailtest\.test$/, 2, { Status: 0, Answer: [NS('ns1.mailtest.test'), NS('ns2.mailtest.test')] }],
  [/^mailtest\.test$/, 6, { Status: 0, Answer: [SOA('ns1.mailtest.test hostmaster.mailtest.test 1 7200 900 1209600 86400')] }],
  [/^mailtest\.test$/, 15, { Status: 0, Answer: [MX('10 mx1.mailtest.test')] }],
  [/^mailtest\.test$/, 16, { Status: 0, Answer: [TXT('v=spf1 include:_spf.provider.test ~all')] }],
  [/^mailtest\.test$/, 257, { Status: 0, Answer: [CAA('0 issue "letsencrypt.org"')] }],
  [/^_spf\.provider\.test$/, 16, { Status: 0, Answer: [TXT('v=spf1 ip4:192.0.2.0/24 -all')] }],
  [/^_dmarc\.mailtest\.test$/, 16, { Status: 0, Answer: [TXT('v=DMARC1; p=quarantine; rua=mailto:agg@mailtest.test')] }],
  [/^google\._domainkey\.mailtest\.test$/, 16, { Status: 0, Answer: [TXT('v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA')] }],
  [/^ghost\.test$/, -1, { Status: 3 }],
]

const dohServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const name = (url.searchParams.get('name') || '').toLowerCase()
  const type = Number(url.searchParams.get('type') || 1)
  const hit = FIXTURES.find(([re, t2]) => re.test(name) && (t2 === -1 || t2 === type))
  const body = hit ? hit[2] : { Status: 0 }
  res.writeHead(200, { 'Content-Type': 'application/dns-json' })
  res.end(JSON.stringify(body))
})

// ── 假桥：cap.kv 内存实现 ────────────────────────────────────────────────────
const kvStore = new Map()
const bridge = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') { res.writeHead(200); res.end('ok'); return }
  if (req.method !== 'POST' || !req.url.startsWith('/api/router-dispatch')) { res.writeHead(404); res.end(); return }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let payload
    try { payload = JSON.parse(body).req } catch (_) { res.writeHead(400); res.end(); return }
    const { target, payload: inner } = payload
    if (target === 'cap.kv') {
      const { action, key, value } = inner || {}
      if (action === 'get') { res.writeHead(200); res.end(JSON.stringify({ ok: true, result: kvStore.has(key) ? { value: kvStore.get(key) } : {} })) }
      else if (action === 'set') { kvStore.set(key, value === undefined ? null : value); res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} })) }
      else if (action === 'delete') { kvStore.delete(key); res.writeHead(200); res.end(JSON.stringify({ ok: true, result: {} })) }
      else if (action === 'list') { res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { keys: [...kvStore.keys()] } })) }
      else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `未知 kv action ${action}` })) }
      return
    }
    res.writeHead(200); res.end(JSON.stringify({ ok: false, error: `假桥未实现 ${target}` }))
  })
})

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await fn().catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`等待超时：${label}`)
}

// ── 启动 ────────────────────────────────────────────────────────────────────
let dohPort, bridgePort, svc, tmpDir, healthPort = 0, svcLog = ''

async function setup() {
  await new Promise((r) => dohServer.listen(0, '127.0.0.1', r))
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r))
  dohPort = dohServer.address().port
  bridgePort = bridge.address().port
  tmpDir = mkdtempSync(join(tmpdir(), 'domprobe-test-'))
  svc = spawn(process.execPath, [join(ROOT, 'service', 'main.js'), '0', tmpDir], {
    env: {
      ...process.env,
      POLARIS_HOST: '127.0.0.1',
      POLARIS_PORT: String(bridgePort),
      POLARIS_TOKEN: 'test-token',
      DOMPROBE_DOH_OVERRIDES: JSON.stringify({
        alidns: `http://127.0.0.1:${dohPort}/dns`,
        dnspod: `http://127.0.0.1:${dohPort}/dns`,
        cloudflare: `http://127.0.0.1:${dohPort}/dns`,
        google: `http://127.0.0.1:${dohPort}/dns`,
      }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  svc.stderr.on('data', (c) => {
    svcLog += String(c)
    const m = /健康端点就绪 127\.0\.0\.1:(\d+)/.exec(svcLog)
    if (m) healthPort = Number(m[1])
  })
  await waitFor(async () => kvStore.has('dom.meta'), 15000, 'dom.meta 心跳')
}

async function sendCmd(action, payload, waitMs = 90000) {
  const nonce = `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  kvStore.set('dom.cmd', { nonce, action, payload, at: new Date().toISOString() })
  return waitFor(async () => {
    const res = kvStore.get('dom.res')
    if (res && res.nonce === nonce) { kvStore.delete('dom.res'); return res.result }
    return null
  }, waitMs, `命令 ${action} 回执`)
}

// ── 用例 ────────────────────────────────────────────────────────────────────
await t('setup: 服务起、心跳写、健康端点 200', async () => {
  await setup()
  assert.ok(healthPort > 0, `应能从服务日志解析健康端口：${svcLog.slice(0, 200)}`)
  const res = await fetch(`http://127.0.0.1:${healthPort}/__health`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
})

await t('get_state: 返回元数据与解析器清单', async () => {
  const r = await sendCmd('get_state', {})
  assert.equal(r.ok, true)
  assert.equal(r.meta.degraded, false)
  assert.equal(r.resolvers.length, 4)
  assert.ok(r.resolvers.every((x) => x.overridden === true))
})

await t('full: mailtest.test 全链路体检（报告结构+findings 分级+评分）', async () => {
  const r = await sendCmd('full', { domain: 'mailtest.test' })
  assert.equal(r.ok, true)
  const rep = r.report
  assert.equal(rep.kind, 'full')
  assert.equal(rep.domain, 'mailtest.test')
  assert.ok(rep.finishedAt, '报告应有完成时间')
  // 守卫路径：A=127.0.0.1 → 证书探测拒绝（不真连）
  assert.equal(rep.sections.cert.refused.includes('非公网'), true, `cert 应被守卫拒绝：${JSON.stringify(rep.sections.cert)}`)
  // mail 细节
  assert.equal(rep.sections.mail.spf.records.length, 1)
  assert.equal(rep.sections.mail.spf.lookup.count, 1)
  assert.equal(rep.sections.mail.dmarc.record.tags.p, 'quarantine')
  assert.ok(rep.sections.mail.dkim.some((x) => x.found && x.selector === 'google'))
  assert.equal(rep.sections.mail.mx.answers.length, 1)
  assert.equal(rep.sections.mail.mx.answers[0].pref, 10)
  // findings 分级
  const by = {}
  for (const f of rep.findings) by[f.code] = f.sev
  assert.equal(by['spf.softfail'], 'info')
  assert.equal(by['dmarc.p-quarantine'], 'green')
  assert.equal(by['dkim.found'], 'green')
  assert.equal(by['caa.present'], 'green')
  assert.equal(by['dnssec.off'], 'info')
  assert.equal(by['cert.unavailable'], 'yellow')
  assert.equal(rep.score.counts.yellow, 1, `应恰有 1 黄：${JSON.stringify(rep.counts)}`)
  assert.equal(rep.score.total, 95)
  // 持久化：latest/runs/history
  assert.equal(kvStore.has('dom.latest'), true)
  assert.equal(Array.isArray(kvStore.get('dom.runs')) && kvStore.get('dom.runs').length >= 1, true)
  assert.equal(kvStore.get('dom.history')[0].domain, 'mailtest.test')
})

await t('full: ghost.test NXDOMAIN 结构（不炸、有 red）', async () => {
  const r = await sendCmd('full', { domain: 'ghost.test' })
  assert.equal(r.ok, true)
  const rep = r.report
  const codes = rep.findings.map((f) => f.code)
  assert.ok(codes.includes('dns.no-ns'))
  assert.equal(rep.findings.find((f) => f.code === 'dns.no-ns').sev, 'red')
  assert.ok(rep.findings.some((f) => f.code === 'dmarc.missing'))
})

await t('lookup: allResolvers 四解析器对比一致', async () => {
  const r = await sendCmd('lookup', { domain: 'mailtest.test', type: 'MX', allResolvers: true })
  assert.equal(r.ok, true)
  const rep = r.report
  assert.equal(rep.kind, 'lookup')
  assert.equal(rep.sections.per.length, 4)
  assert.ok(rep.sections.per.every((x) => x.ok && x.status === 0))
  assert.equal(rep.sections.diff.consistent, true)
  // MX rdata 应拆出优先级
  const mx = rep.sections.per[0].answers.find((a) => a.typeName === 'MX')
  assert.equal(mx.pref, 10)
  assert.equal(mx.data, 'mx1.mailtest.test')
})

await t('lookup: 非法类型被拒绝并给人话', async () => {
  const r = await sendCmd('lookup', { domain: 'mailtest.test', type: 'BOGUS' })
  assert.equal(r.ok, false)
  assert.ok(r.error.includes('不支持'))
})

await t('full: 输入为 IP 字面量时规范层直接拒绝', async () => {
  const r = await sendCmd('full', { domain: '127.0.0.1' })
  assert.equal(r.ok, false)
  assert.ok(r.error.includes('域名'))
})

await t('settings_set: 归一回写（坏主解析器回落/selector 清洗）', async () => {
  const r = await sendCmd('settings_set', { primary: 'not-a-resolver', timeoutMs: 99, dkimSelectorsExtra: ['My Sel', 'ok-sel', 'x'.repeat(70)] })
  assert.equal(r.ok, true)
  assert.equal(r.settings.primary, 'alidns')       // 坏值回落默认
  assert.equal(r.settings.timeoutMs, 8000)          // 坏值回落默认
  assert.deepEqual(r.settings.dkimSelectorsExtra, ['ok-sel'])  // 空格剔除/超长剔除
  assert.equal(kvStore.get('dom.settings').primary, 'alidns')
})

await t('get_report: 按 runId 读回', async () => {
  const runId = kvStore.get('dom.runs')[0]
  const r = await sendCmd('get_report', { runId })
  assert.equal(r.ok, true)
  assert.equal(r.report.runId, runId)
  const bad = await sendCmd('get_report', { runId: 'nope' })
  assert.equal(bad.ok, false)
})

await t('cancel: 空闲时取消给人话错误', async () => {
  const r = await sendCmd('cancel', {})
  assert.equal(r.ok, false)
  assert.ok(r.error.includes('没有运行中的任务'))
})

// ── 收尾 ────────────────────────────────────────────────────────────────────
function cleanup() {
  try { svc && svc.kill() } catch (_) { /* noop */ }
  try { dohServer.close() } catch (_) { /* noop */ }
  try { bridge.close() } catch (_) { /* noop */ }
  try { tmpDir && rmSync(tmpDir, { recursive: true, force: true }) } catch (_) { /* noop */ }
}
process.on('exit', cleanup)
process.on('unhandledRejection', (e) => { console.error('未处理拒绝：', e); cleanup(); process.exit(1) })

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
if (bad.length && svc) {
  // 打印服务 stderr 尾部助排障
  console.error('（存在失败用例）')
}
cleanup()
process.exit(bad.length ? 1 : 0)
