/**
 * 磁盘雷达真实桥冒烟：node test/smoke-real.mjs
 *
 * 对运行中的生产 Polaris 做全链路验证（page-sentinel/pocket-host 同配方）：
 *   1. 自发现真实桥端点
 *   2. 防误伤护栏：真实 kv 已有本插件业务键（diskrad.snap.* 等）→ 拒跑
 *   3. 临时目录造树（node_modules/target/普通文件，含可计量字节）
 *   4. spawn 真实服务进程（无 env 注入）→ 等心跳键
 *   5. roots_add → scan → 断言快照/垃圾/state
 *   6. quarantine → restore → purge 全链路（磁盘真实移动/恢复/删除）
 *   7. spawn 真实 mcp/server.js（stdio JSON-RPC）→ initialize/tools/list/tools/call 闭环
 *   8. finally：杀进程 + 删光 diskrad.* 键 + 删临时树 → 报告 N/N
 */
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveEndpoint, md5 } = require('../service/kvclient.js')
const core = require('../shared/disk-core.js')

const PLUGIN_PREFIX = 'diskrad.'
const results = []
let failed = false

function pass(name) { results.push(`✓ ${name}`) }
function fail(name, detail) { failed = true; results.push(`✗ ${name}\n    ${detail}`) }

async function t(name, fn) {
  try { await fn(); pass(name) } catch (e) { fail(name, e.message) }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function waitFor(fn, ms, step = 600, label = '') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  throw new Error(`冒烟超时：${label}`)
}

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)) })
  })
}

let EP = null
function dispatch(target, payload, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } })
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`
    const req = http.request(
      { hostname: EP.host, port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('dispatch timeout')) })
    req.write(data)
    req.end()
  })
}

async function kvGet(key) {
  const r = await dispatch('cap.kv', { action: 'get', key }).catch(() => null)
  return r && r.ok && r.result && r.result.value !== undefined ? r.result.value : null
}
async function kvSet(key, value) {
  const r = await dispatch('cap.kv', { action: 'set', key, value })
  if (!r || !r.ok) throw new Error(`kvSet ${key}: ${r && r.error}`)
}
async function kvDel(key) {
  await dispatch('cap.kv', { action: 'delete', key }).catch(() => {})
}
async function kvKeys() {
  const r = await dispatch('cap.kv', { action: 'list' })
  return r && r.ok && r.result && Array.isArray(r.result.keys) ? r.result.keys : []
}

// ── MCP stdio 客户端 ────────────────────────────────────────────────────────
function startMcp(appConfigDir) {
  const child = spawn('node', [path.join(process.cwd(), 'mcp', 'server.js'), appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stderr.on('data', () => {}) // stderr 仅诊断
  let buf = ''
  const pending = new Map()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buf += chunk
    for (;;) {
      const i = buf.indexOf('\n')
      if (i === -1) break
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch (_) { continue }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    }
  })
  let rpcId = 0
  const rpc = (method, params) => new Promise((resolve) => {
    const id = ++rpcId
    pending.set(id, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return { child, rpc }
}

// ── 临时树 ──────────────────────────────────────────────────────────────────
let tmpBase = ''
function buildTree() {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'diskrad-smoke-'))
  const big = (p, size) => {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, Buffer.alloc(size, 1))
  }
  // 项目 A：node_modules（锚定 package.json）+ 普通源码
  big(path.join(tmpBase, 'project-a', 'package.json'), 300)
  big(path.join(tmpBase, 'project-a', 'node_modules', 'left-pad', 'index.js'), 200 * 1024)
  big(path.join(tmpBase, 'project-a', 'node_modules', 'left-pad', 'package.json'), 200)
  big(path.join(tmpBase, 'project-a', 'src', 'main.ts'), 4096)
  // 项目 B：target（锚定 Cargo.toml）+ 不锚定的同名目录（不应判垃圾）
  big(path.join(tmpBase, 'project-b', 'Cargo.toml'), 300)
  big(path.join(tmpBase, 'project-b', 'target', 'debug', 'app.exe'), 150 * 1024)
  big(path.join(tmpBase, 'project-c', 'target', 'data.bin'), 64 * 1024) // 无 Cargo.toml → 非垃圾
  // 普通照片目录
  big(path.join(tmpBase, 'photos', 'img1.bin'), 100 * 1024)
  big(path.join(tmpBase, 'photos', 'img2.bin'), 100 * 1024)
  return tmpBase
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
const proc = { svc: null, mcp: null }
try {
  // 1. 自发现
  EP = await resolveEndpoint('')
  const health = await new Promise((resolve) => {
    http.get({ hostname: EP.host, port: EP.port, path: '/api/health', timeout: 2000 }, (r) => resolve(r.statusCode)).on('error', () => resolve(0))
  })
  if (health !== 200) throw new Error(`真实桥不可达（${EP.host}:${EP.port} health=${health}）——请先启动 Polaris`)
  pass(`自发现真实桥 ${EP.host}:${EP.port}（via ${EP.via}，health 200）`)

  // 2. 护栏
  const existing = (await kvKeys()).filter((k) =>
    k.startsWith('diskrad.snap.') || k.startsWith('diskrad.junk.') || k.startsWith('diskrad.qman.') || k === 'diskrad.roots')
  if (existing.length) throw new Error(`真实 kv 已有磁盘雷达业务键（${existing.length} 个）——疑为生产数据，拒跑`)
  pass('防误伤护栏：真实 kv 无本插件业务键')

  // 3. 造树
  const treeRoot = buildTree()
  // 期望字节以实际写入为准（逐文件求和，避免常量算错假失败）
  const expectMinBytes = (() => {
    let sum = 0
    const walk = (p) => {
      for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
        const cp = path.join(p, ent.name)
        if (ent.isDirectory()) walk(cp)
        else sum += fs.statSync(cp).size
      }
    }
    walk(treeRoot)
    return sum
  })()
  pass(`临时树就绪 ${treeRoot}（实测写入 ${core.fmtBytes(expectMinBytes)}）`)

  // 4. spawn 真实服务
  const port = await freePort()
  proc.svc = spawn('node', [path.join(process.cwd(), 'service', 'radar.js'), String(port), ''], { stdio: ['ignore', 'ignore', 'pipe'] })
  proc.svc.stderr.on('data', (d) => { if (process.env.SMOKE_DEBUG) process.stderr.write(`[svc] ${d}`) })
  await waitFor(async () => {
    const meta = await kvGet('diskrad.meta').catch(() => null)
    return meta && meta.pid && Date.now() - meta.lastTickAt < 30000
  }, 30000, 800, '服务心跳键 diskrad.meta')
  pass(`真实服务进程启动（health 端口 ${port}，心跳已写入）`)

  // 5. roots_add + scan
  const addNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  await kvSet(core.K.cmd('roots_add', addNonce), { path: treeRoot, at: Date.now() })
  const addRes = await waitFor(async () => {
    const r = await kvGet(core.K.result(addNonce)).catch(() => null)
    if (r) { await kvDel(core.K.result(addNonce)); return r }
    return null
  }, 15000, 500, 'roots_add 结果')
  assert.equal(addRes.ok, true, `roots_add 失败：${addRes.error}`)
  const rid = addRes.payload.rid
  assert.equal(rid.length, 10, 'rid 长度 10')
  pass(`roots_add → rid=${rid}`)

  const scanNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  await kvSet(core.K.cmd('scan', scanNonce), { path: treeRoot, deep: true, at: Date.now() })
  const snapKey = await waitFor(async () => {
    const keys = await kvKeys()
    return keys.find((k) => k.startsWith(`diskrad.snap.${rid}.`)) || null
  }, 60000, 800, '首份快照')
  pass(`扫描完成，快照 ${snapKey}`)

  // 6. 快照/垃圾/state 断言
  await t('快照总量 ≥ 写入字节（lstat 口径）', async () => {
    const snap = await kvGet(snapKey)
    assert.ok(snap, '快照存在')
    assert.ok(snap.total >= expectMinBytes, `total=${snap.total} < 期望 ${expectMinBytes}`)
    assert.equal(snap.partial, false)
    assert.ok(snap.files >= 9, `files=${snap.files}`)
    assert.ok(snap.dirs.length >= 3, `顶层目录数=${snap.dirs.length}（project-a/b/c、photos…）`)
    assert.ok(snap.volume && snap.volume.total > 0, '卷空间已记录')
  })
  await t('垃圾清单：node_modules 命中、未锚定 target 不误报', async () => {
    const junk = await kvGet(`diskrad.junk.${rid}`)
    assert.ok(junk && Array.isArray(junk.items), 'junk 键存在')
    const names = junk.items.map((it) => it.relPath.replace(/\\/g, '/'))
    assert.ok(names.includes('project-a/node_modules'), `应含 project-a/node_modules，实际 ${JSON.stringify(names)}`)
    assert.ok(names.includes('project-b/target'), '应含 project-b/target（Cargo.toml 锚定）')
    assert.ok(!names.includes('project-c/target'), 'project-c/target 无锚定不应误报')
    const nm = junk.items.find((it) => it.relPath.replace(/\\/g, '/') === 'project-a/node_modules')
    assert.equal(nm.id, core.junkItemId('project-a/node_modules'), 'id 稳定')
    assert.ok(nm.bytes >= 200 * 1024, `垃圾条目字节 ${nm.bytes}`)
    assert.ok(junk.partial === false, '完整扫描 partial=false')
  })
  await t('state 汇总：total/junkBytes/volume 三方一致', async () => {
    const state = await kvGet('diskrad.state')
    const st = state.roots && state.roots[rid]
    assert.ok(st, 'state 含本根')
    const snap = await kvGet(snapKey)
    assert.equal(st.total, snap.total)
    assert.equal(st.junkCount, 2)
    assert.equal(st.deltaBytes, null, '首扫无增量')
    assert.ok(st.free != null && st.free < st.volumeTotal, '卷余量合理')
  })
  await t('扫描进度键已清理（空闲态）', async () => {
    const keys = await kvKeys()
    assert.equal(keys.includes('diskrad.scan'), false, 'scan 键应在扫描结束后删除')
  })

  // 7. 隔离 → 恢复 → 彻底删除 全链路
  const nmId = core.junkItemId('project-a/node_modules')
  const origDir = path.join(treeRoot, 'project-a', 'node_modules')
  const trashDir = path.join(treeRoot, core.TRASH_DIR, nmId)
  await t('quarantine：目录真实移入隔离区，清单/垃圾键同步', async () => {
    assert.ok(fs.existsSync(origDir), '移动前存在')
    const qNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    await kvSet(core.K.cmd('quarantine', qNonce), { rootId: rid, itemIds: [nmId], at: Date.now() })
    const r = await waitFor(async () => {
      const v = await kvGet(core.K.result(qNonce)).catch(() => null)
      if (v) { await kvDel(core.K.result(qNonce)); return v }
      return null
    }, 20000, 500, 'quarantine 结果')
    assert.equal(r.ok, true, `quarantine 失败：${JSON.stringify(r.error)}`)
    assert.equal(r.payload.moved, 1, `moved=${r.payload.moved}`)
    assert.ok(!fs.existsSync(origDir), '原位置已不在')
    assert.ok(fs.existsSync(trashDir), '隔离区存在')
    const qman = await kvGet(`diskrad.qman.${rid}`)
    assert.ok(qman.items.some((it) => it.id === nmId), '隔离清单已记录')
    const junk = await kvGet(`diskrad.junk.${rid}`)
    assert.ok(!junk.items.some((it) => it.id === nmId), '垃圾清单已移除该条')
  })
  await t('restore：恢复回原位，双清单同步', async () => {
    const rNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    await kvSet(core.K.cmd('restore', rNonce), { rootId: rid, itemIds: [nmId], at: Date.now() })
    const r = await waitFor(async () => {
      const v = await kvGet(core.K.result(rNonce)).catch(() => null)
      if (v) { await kvDel(core.K.result(rNonce)); return v }
      return null
    }, 20000, 500, 'restore 结果')
    assert.equal(r.ok, true)
    assert.equal(r.payload.restored, 1)
    assert.ok(fs.existsSync(origDir), '已恢复原位')
    assert.ok(!fs.existsSync(trashDir), '隔离区已清出')
    const junk = await kvGet(`diskrad.junk.${rid}`)
    assert.ok(junk.items.some((it) => it.id === nmId), '垃圾清单已恢复条目')
  })
  await t('purge 无 confirm 被拒（危险操作护栏）', async () => {
    // 先再隔离一次
    const qNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    await kvSet(core.K.cmd('quarantine', qNonce), { rootId: rid, itemIds: [nmId], at: Date.now() })
    await waitFor(async () => {
      const q = await kvGet(`diskrad.qman.${rid}`)
      return !!(q && q.items.some((it) => it.id === nmId))
    }, 20000, 500, 'quarantine 二次入区')
    const pNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    await kvSet(core.K.cmd('purge', pNonce), { rootId: rid, itemIds: [nmId], at: Date.now() }) // 无 confirm
    const r = await waitFor(async () => {
      const v = await kvGet(core.K.result(pNonce)).catch(() => null)
      if (v) { await kvDel(core.K.result(pNonce)); return v }
      return null
    }, 20000, 500, 'purge 结果')
    assert.equal(r.ok, false, '无 confirm 应失败')
    assert.ok((r.error || '').includes('confirm'), `错误应提示 confirm：${r.error}`)
    assert.ok(fs.existsSync(trashDir), '未确认时文件仍在隔离区')
  })
  await t('purge confirm：真实删除并释放记账', async () => {
    const pNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    await kvSet(core.K.cmd('purge', pNonce), { rootId: rid, itemIds: [nmId], confirm: true, at: Date.now() })
    const r = await waitFor(async () => {
      const v = await kvGet(core.K.result(pNonce)).catch(() => null)
      if (v) { await kvDel(core.K.result(pNonce)); return v }
      return null
    }, 30000, 500, 'purge confirm 结果')
    assert.equal(r.ok, true)
    assert.equal(r.payload.purged, 1)
    assert.ok(r.payload.freed >= 200 * 1024, `freed=${r.payload.freed}`)
    assert.ok(!fs.existsSync(trashDir), '隔离区目录已删除')
  })

  // 8. MCP 闭环
  await t('MCP：initialize → tools/list（6 个全只读）', async () => {
    proc.mcp = startMcp('')
    const init = await proc.mcp.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } })
    assert.equal(init.result.serverInfo.name, 'disk-radar')
    proc.mcp.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    const list = await proc.mcp.rpc('tools/list', {})
    const names = list.result.tools.map((x) => x.name)
    assert.deepEqual(names.sort(), ['disk_growth', 'disk_junk', 'disk_overview', 'disk_report', 'disk_scan_start', 'disk_top'])
    for (const tool of list.result.tools) {
      assert.ok(!/删除|remove|delete/i.test(tool.name), '工具名不得含删除语义')
    }
  })
  await t('MCP disk_overview：读出根与垃圾汇总', async () => {
    const r = await proc.mcp.rpc('tools/call', { name: 'disk_overview', arguments: {} })
    assert.notEqual(r.result.isError, true, r.result.content?.[0]?.text)
    const text = r.result.content[0].text
    assert.ok(text.includes(treeRoot), `应含根路径：${text.slice(0, 200)}`)
    assert.ok(text.includes('垃圾'), '应含垃圾汇总')
  })
  await t('MCP disk_junk：报告剩余 target 且不提供删除', async () => {
    const r = await proc.mcp.rpc('tools/call', { name: 'disk_junk', arguments: { rootPath: treeRoot } })
    assert.notEqual(r.result.isError, true, r.result.content?.[0]?.text)
    const text = r.result.content[0].text
    assert.ok(text.includes('project-b/target'), '应含 project-b/target')
    assert.ok(text.includes('隔离区') || text.includes('面板'), '应指引到面板两步删除')
  })
  await t('MCP disk_report：细查子目录返回树与垃圾标记', async () => {
    // 注意：node_modules 在前面的 purge 用例里已被真实删除——这里细查 project-b（target 仍在）
    const r = await proc.mcp.rpc('tools/call', { name: 'disk_report', arguments: { path: path.join(treeRoot, 'project-b'), maxDepth: 2 } })
    assert.notEqual(r.result.isError, true, r.result.content?.[0]?.text)
    const text = r.result.content[0].text
    assert.ok(text.includes('target'), `应含 target：${text.slice(0, 300)}`)
    assert.ok(text.includes('构建产物'), '应标出垃圾类型')
  })
  await t('MCP disk_growth：有增量给归因，无两份快照给指引', async () => {
    const r = await proc.mcp.rpc('tools/call', { name: 'disk_growth', arguments: { rootPath: treeRoot } })
    assert.notEqual(r.result.isError, true)
    const text = r.result.content[0].text
    assert.ok(text.includes('增量归因') || text.includes('不足两份'), text.slice(0, 160))
  })
  await t('MCP disk_scan_start：对已登记根入队并返回指引', async () => {
    const r = await proc.mcp.rpc('tools/call', { name: 'disk_scan_start', arguments: { path: treeRoot } })
    assert.notEqual(r.result.isError, true, r.result.content?.[0]?.text)
    assert.ok(r.result.content[0].text.includes('disk_overview'), '应指引跟进度')
    // 等这份快扫落盘，制造第二份快照（供后续增量语义）
    await waitFor(async () => {
      const keys = await kvKeys()
      return keys.filter((k) => k.startsWith(`diskrad.snap.${rid}.`)).length >= 2
    }, 60000, 1000, '第二份快照')
  })
  await t('快照保留：多份在档且 seq 严格递增（auto/deep/manual 交错也成立）', async () => {
    const keys = (await kvKeys()).filter((k) => k.startsWith(`diskrad.snap.${rid}.`)).sort()
    assert.ok(keys.length >= 2, `至少两份快照，实际 ${keys.length}`)
    let prevSeq = 0
    for (const k of keys) {
      const v = await kvGet(k)
      assert.ok(v.seq > prevSeq, `seq 递增：${v.seq} > ${prevSeq}`)
      prevSeq = v.seq
    }
  })

  // 9. roots_remove 清理派生键
  await t('roots_remove：登记与派生键一并清理', async () => {
    const dNonce = 'sm' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    await kvSet(core.K.cmd('roots_remove', dNonce), { rootId: rid, at: Date.now() })
    await waitFor(async () => {
      const r = await kvGet(core.K.result(dNonce)).catch(() => null)
      if (r) { await kvDel(core.K.result(dNonce)); return r }
      return null
    }, 15000, 500, 'roots_remove 结果')
    const keys = await kvKeys()
    assert.equal(keys.some((k) => k.startsWith(`diskrad.snap.${rid}.`)), false)
    assert.equal(keys.some((k) => k === `diskrad.junk.${rid}`), false)
    assert.equal(keys.some((k) => k === 'diskrad.roots'), false, '空 roots 应整键删除')
  })
} catch (e) {
  fail('冒烟主流程', e.stack || e.message)
} finally {
  // 清理：杀进程 + 删光键 + 删临时树
  try { if (proc.svc) { proc.svc.kill('SIGTERM'); proc.svc.kill() } } catch (_) {}
  try { if (proc.mcp) proc.mcp.child.kill() } catch (_) {}
  await sleep(400)
  try {
    const keys = await kvKeys()
    const mine = keys.filter((k) => k.startsWith(PLUGIN_PREFIX))
    for (const k of mine) await kvDel(k)
    results.push(`清理：删除 ${mine.length} 个 diskrad.* 键`)
  } catch (e) {
    results.push(`⚠ 键清理失败：${e.message}（请手动清 diskrad.* 前缀）`)
  }
  try {
    if (tmpBase) fs.rmSync(tmpBase, { recursive: true, force: true, maxRetries: 2 })
    results.push('清理：临时树已删除')
  } catch (_) { results.push('⚠ 临时树删除失败（可手动删 os.tmpdir 下 diskrad-smoke-*）') }
}

console.log('\n' + results.join('\n'))
const nFail = results.filter((r) => r.startsWith('✗') || r.startsWith('⚠')).length
console.log(`\n冒烟：${results.filter((r) => r.startsWith('✓')).length} 通过 / ${results.filter((r) => r.startsWith('✗')).length} 失败${nFail ? '（含清理警告）' : ''}`)
process.exit(failed ? 1 : 0)
