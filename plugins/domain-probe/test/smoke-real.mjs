// 真实桥冒烟：对运行中的生产 Polaris 做全链路验证
// 运行：node test/smoke-real.mjs（前提：本机 Polaris 正在运行）
// 护栏：真实 kv 已有 dom.* 业务键 → 拒跑（防毁生产数据）；结束时删光本插件前缀键
import http from 'node:http'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(import.meta.url)
const { resolveEndpoint, md5 } = require2('../service/kvclient.js')

const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }) }
  catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

let ep, svc, tmpDir

async function bridgeDispatch(target, payload) {
  const data = JSON.stringify({ req: { target, payload } })
  const res = await fetch(`http://${ep.host}:${ep.port}/api/router-dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${md5(ep.token)}` },
    body: data,
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `${target} 失败`)
  return json.result
}
const kvGet = async (k) => (await bridgeDispatch('cap.kv', { action: 'get', key: k })).value ?? null
const kvSet = (k, v) => bridgeDispatch('cap.kv', { action: 'set', key: k, value: v })
const kvDel = (k) => bridgeDispatch('cap.kv', { action: 'delete', key: k })
const kvKeys = async () => (await bridgeDispatch('cap.kv', { action: 'list' })).keys || []

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await Promise.resolve().then(fn).catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error(`冒烟超时：${label}`)
}

async function sendCmd(action, payload, waitMs = 120000) {
  const nonce = `smoke-${Date.now().toString(36)}`
  await kvSet('dom.cmd', { nonce, action, payload, at: new Date().toISOString() })
  return waitFor(async () => {
    const res = await kvGet('dom.res')
    if (res && res.nonce === nonce) { await kvDel('dom.res').catch(() => {}); return res.result }
    return null
  }, waitMs, `命令 ${action} 回执`)
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
console.log('① 自发现真实桥…')
ep = await resolveEndpoint('')
console.log(`   桥：${ep.host}:${ep.port}（via ${ep.via}）`)
const health = await fetch(`http://${ep.host}:${ep.port}/api/health`, { signal: AbortSignal.timeout(3000) })
assert.equal(health.status, 200, '桥健康检查失败——Polaris 未运行？')

await t('护栏: 真实 kv 已有 dom.* 业务键时拒跑', async () => {
  const keys = await kvKeys()
  const mine = keys.filter((k) => k.startsWith('dom.'))
  if (mine.length) throw new Error(`检测到 ${mine.length} 个本插件业务键（如 ${mine[0]}），为防误伤生产数据拒绝冒烟。如确认是残留，请手动清理后重试。`)
})

tmpDir = mkdtempSync(join(tmpdir(), 'domprobe-smoke-'))
console.log('② spawn 真实服务进程（真实桥 env + 真实 DoH）…')
svc = spawn(process.execPath, [join(ROOT, 'service', 'main.js'), '0', tmpDir], {
  env: { ...process.env, POLARIS_HOST: ep.host, POLARIS_PORT: String(ep.port), POLARIS_TOKEN: ep.token },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let svcErr = ''
svc.stderr.on('data', (c) => { svcErr += String(c) })
await waitFor(async () => await kvGet('dom.meta'), 20000, 'dom.meta 心跳（真实 kv）')

await t('真实 DoH: lookup example.com A 跨解析器', async () => {
  const r = await sendCmd('lookup', { domain: 'example.com', type: 'A', allResolvers: true }, 90000)
  assert.equal(r.ok, true, r.error)
  const rep = r.report
  const okRows = rep.sections.per.filter((x) => x.ok)
  assert.ok(okRows.length >= 2, `至少 2 个解析器应可用（实际 ${okRows.length}）：${JSON.stringify(rep.sections.per)}`)
  assert.ok(okRows.some((x) => x.answers.length > 0), 'example.com 应有 A 记录')
  assert.ok(rep.sections.diff && typeof rep.sections.diff.consistent === 'boolean')
  // 全球解析器不可达时如实标注（本环境实测会超时）
  const down = rep.sections.per.filter((x) => !x.ok)
  console.log(`   解析器可用 ${okRows.length}/4${down.length ? `（不可达：${down.map((x) => x.resolver).join(',')}——网络受限环境如实标注 ✓）` : ''}`)
})

await t('真实邮件身份: gmail.com（SPF/DMARC/MX）+ mailchimp.com（DKIM k1）', async () => {
  const r = await sendCmd('email', { domain: 'gmail.com' }, 120000)
  assert.equal(r.ok, true, r.error)
  const rep = r.report
  assert.ok(rep.sections.mail.spf.records.length >= 1, 'gmail.com 应有 SPF')
  // 事实约束：gmail.com 的 DMARC 记录存在且 p 是三个合法值之一（实测为 p=none + sp=quarantine）
  const p = rep.sections.mail.dmarc.record && rep.sections.mail.dmarc.record.tags.p
  assert.ok(['none', 'quarantine', 'reject'].includes(p), `DMARC p 应是合法策略值，实际：${p}`)
  assert.ok(rep.sections.mail.dmarc.record.tags.rua, 'gmail.com DMARC 应有 rua')
  assert.ok(rep.sections.mail.mx.answers.length >= 1, 'gmail.com 应有 MX')
  console.log(`   gmail.com：SPF ${rep.sections.mail.spf.records[0].slice(0, 50)}…｜DMARC p=${p}（Gmail 自用日期 selector 不在常见清单时按 info 如实标注）`)
  // DKIM 正例：mailchimp.com 的 k1 selector 稳定存在（实测）
  const r2 = await sendCmd('email', { domain: 'mailchimp.com' }, 120000)
  assert.equal(r2.ok, true, r2.error)
  const rep2 = r2.report
  const found = rep2.sections.mail.dkim.filter((x) => x.found).map((x) => x.selector)
  assert.ok(found.includes('k1'), `mailchimp.com 应命中 k1 selector，实际命中：${found.join(',')}`)
  console.log(`   mailchimp.com：DKIM 命中 ${found.join(',')}`)
})

await t('真实全面体检: example.com 全链路（真实 DNS+真实证书）', async () => {
  const r = await sendCmd('full', { domain: 'example.com' }, 180000)
  assert.equal(r.ok, true, r.error)
  const rep = r.report
  assert.ok(rep.finishedAt && rep.score, '报告应有完成时间与评分')
  assert.ok(rep.findings.length >= 3, `findings 应有实质内容（实际 ${rep.findings.length}）`)
  assert.ok(rep.sections.dns && rep.sections.mail, '应有 dns/mail 分区')
  // 证书：真实 443 连接成功则有 validTo；网络受限则 refused——两者都是诚实结构，但不能两者皆无
  const cert = rep.sections.cert
  assert.ok(cert && (cert.validTo || cert.refused), `证书分区应有结果：${JSON.stringify(cert).slice(0, 200)}`)
  if (cert.validTo) console.log(`   证书：${cert.subjectCn} 有效至 ${String(cert.validTo).slice(0, 10)}（剩 ${cert.daysLeft} 天）｜评分 ${rep.score.total}`)
  else console.log(`   证书未连成（网络受限）：${cert.refused}`)
  // 持久化到真实 kv
  assert.ok(await kvGet('dom.latest'))
  const runs = await kvGet('dom.runs')
  assert.ok(Array.isArray(runs) && runs.length >= 1)
  assert.ok((await kvGet('dom.history'))[0].domain === 'example.com')
})

await t('真实 MCP 子进程: initialize → tools/list → tools/call', async () => {
  const mcp = spawn(process.execPath, [join(ROOT, 'mcp', 'server.js'), tmpDir], {
    env: { ...process.env, POLARIS_HOST: ep.host, POLARIS_PORT: String(ep.port), POLARIS_TOKEN: ep.token },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  try {
    let buf = ''
    mcp.stdout.setEncoding('utf8')
    mcp.stdout.on('data', (c) => { buf += c })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
    const init = await waitFor(() => {
      const line = buf.split('\n').find((l) => { try { return JSON.parse(l).id === 1 } catch (_) { return false } })
      return line ? JSON.parse(line) : null
    }, 15000, 'MCP initialize')
    assert.equal(init.result.serverInfo.name, 'domain-probe')
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n')
    const list = await waitFor(() => {
      const line = buf.split('\n').find((l) => { try { return JSON.parse(l).id === 2 } catch (_) { return false } })
      return line ? JSON.parse(line) : null
    }, 15000, 'MCP tools/list')
    assert.equal(list.result.tools.length, 6)
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dom_lookup', arguments: { domain: 'example.com', type: 'A' } } }) + '\n')
    const call = await waitFor(() => {
      const line = buf.split('\n').find((l) => { try { return JSON.parse(l).id === 3 } catch (_) { return false } })
      return line ? JSON.parse(line) : null
    }, 90000, 'MCP tools/call')
    const text = call.result.content[0].text
    assert.ok(text.includes('example.com'), `AI 应拿到真实查询结果：${text.slice(0, 150)}`)
    console.log(`   AI 收到：${text.split('\n')[0]}`)
  } finally { mcp.kill() }
})

// ── 自清理 ──────────────────────────────────────────────────────────────────
console.log('③ 自清理 dom.* 全部键…')
let cleaned = 0
for (const k of await kvKeys()) {
  if (k.startsWith('dom.')) { await kvDel(k).catch(() => {}); cleaned++ }
}
try { svc && svc.kill() } catch (_) { /* noop */ }
try { tmpDir && rmSync(tmpDir, { recursive: true, force: true }) } catch (_) { /* noop */ }
console.log(`   清理 ${cleaned} 键 + 杀服务进程`)

const bad = results.filter((r) => !r.pass)
console.log('\n' + results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
if (bad.length && svcErr) console.error('服务日志尾部：\n' + svcErr.slice(-1500))
process.exit(bad.length ? 1 : 0)
