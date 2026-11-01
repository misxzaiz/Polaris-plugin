/**
 * 真宿主冒烟：node test/smoke-real.mjs
 * 前置：Polaris 宿主在跑（web/桌面均可），context-pack 插件已安装且服务已启动。
 * 链路：bridge 端点自发现 → cpk.meta 心跳 → 命令键 scan → 轮询索引键 → 读树分块 →
 *       命令键 pack（2 文件）→ 校验索引/分块/文件落盘 → cpk.idx 投影 → MCP stdio 三工具。
 */
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { createKvClient } = require(path.join(pluginDir, 'shared', 'kvclient.js'))

const kv = createKvClient({ appConfigDir: process.env.POLARIS_SMOKE_CONFIG_DIR || '', log: () => {} })
let pass = 0
let fail = 0
const t = (name, fn) => {
  const r = typeof fn === 'function' ? fn() : fn
  return Promise.resolve(r).then(
    () => { pass++; console.log(`✅ ${name}`) },
    (e) => { fail++; console.log(`❌ ${name} —— ${e.message}`) },
  )
}

console.log('1) bridge 端点解析…')
await t('bridge 可达（/api/health）', async () => {
  const ep = await kv.refreshEndpoint()
  assert.ok(ep && ep.port, `未解析到宿主端点: ${JSON.stringify(ep)}`)
})

console.log('2) 服务心跳…')
await t('cpk.meta 心跳新鲜（≤120s）', async () => {
  const meta = await kv.kvGet('cpk.meta')
  assert.ok(meta && meta.lastTickAt, `无心跳: ${JSON.stringify(meta)}`)
  assert.ok(Date.now() - meta.lastTickAt < 120 * 1000, `心跳过期 ${Math.round((Date.now() - meta.lastTickAt) / 1000)}s`)
  assert.ok(meta.version, '心跳应含版本')
})

const scanId = `smoke-${Date.now().toString(36)}`
console.log('3) 扫描链路…')
await t('scan 命令 ack（先删后做）', async () => {
  await kv.kvSet(`cpk.cmd.scan.${scanId}`, { op: 'scan', nonce: scanId, path: pluginDir, id: scanId, at: Date.now() })
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const r = await kv.kvGet(`cpk.result.${scanId}`)
    if (r) {
      await kv.kvDel(`cpk.result.${scanId}`)
      assert.ok(r.ok === true, `ack 失败: ${JSON.stringify(r)}`)
      assert.strictEqual(r.id, scanId)
      return
    }
    await new Promise((res) => setTimeout(res, 800))
  }
  throw new Error('20s 内未收到 ack')
})
let scanMeta = null
await t('cpk.scan.<id> 完成且树分块可读', async () => {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    scanMeta = await kv.kvGet(`cpk.scan.${scanId}`)
    if (scanMeta && (scanMeta.state === 'done' || scanMeta.state === 'error')) break
    await new Promise((res) => setTimeout(res, 1000))
  }
  assert.ok(scanMeta, '60s 内无扫描结果')
  assert.strictEqual(scanMeta.state, 'done', `扫描失败: ${scanMeta && scanMeta.error}`)
  assert.ok(scanMeta.fileCount > 0, '文件数应 > 0')
  assert.ok(scanMeta.treeChunks > 0)
  let rows = 0
  for (let i = 0; i < scanMeta.treeChunks; i++) {
    const chunk = await kv.kvGet(`cpk.scan.${scanId}.t.${i}`)
    assert.ok(typeof chunk === 'string' && chunk.length > 0, `树分块 ${i} 不可读`)
    rows += chunk.split('\n').filter((l) => l.trim()).length
  }
  assert.ok(rows >= scanMeta.fileCount + scanMeta.dirCount, `行数 ${rows} 应 ≥ 文件+目录数`)
})

console.log('4) 打包链路…')
const packId = `smoke-${Date.now().toString(36)}`
await t('pack 命令 → 索引/分块/文件三者一致', async () => {
  await kv.kvSet(`cpk.cmd.pack.${packId}`, {
    op: 'pack', nonce: packId, path: pluginDir, id: packId,
    include: ['plugin.json', 'shared/core.js'], header: '真宿主冒烟包', at: Date.now(),
  })
  const deadline = Date.now() + 60000
  let idx = null
  while (Date.now() < deadline) {
    idx = await kv.kvGet(`cpk.pack.${packId}`)
    if (idx && (idx.state === 'done' || idx.state === 'error')) break
    await new Promise((res) => setTimeout(res, 1000))
  }
  assert.ok(idx, '60s 内无打包结果')
  assert.strictEqual(idx.state, 'done', `打包失败: ${idx && idx.error}`)
  assert.strictEqual(idx.stats.files, 2)
  assert.ok(idx.fileBytes > 0 && idx.chunks > 0)
  assert.ok(fs.existsSync(idx.file), 'bundle 文件应存在')
  let text = ''
  for (let i = 0; i < idx.chunks; i++) {
    const c = await kv.kvGet(`cpk.pack.${packId}.c.${i}`)
    assert.ok(typeof c === 'string', `内容分块 ${i} 不可读`)
    text += c
  }
  assert.ok(text.includes('真宿主冒烟包'), '包头应写入')
  assert.ok(text.includes('"id": "context-pack"'), 'plugin.json 内容应进包')
  assert.ok(text.includes('createIgnoreEngine'), 'core.js 内容应进包')
  const onDisk = fs.readFileSync(idx.file, 'utf8')
  assert.strictEqual(onDisk, text, '分块镜像应与文件一致')
})
await t('cpk.idx 投影含该 pack', async () => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const idx = await kv.kvGet('cpk.idx')
    if (idx && Array.isArray(idx.packs) && idx.packs.some((p) => p.id === packId)) return
    await new Promise((res) => setTimeout(res, 1500))
  }
  throw new Error('cpk.idx 未投影该 pack')
})
await t('清理冒烟键', async () => {
  await kv.kvDel(`cpk.scan.${scanId}`)
  for (let i = 0; i < (scanMeta?.treeChunks || 0); i++) await kv.kvDel(`cpk.scan.${scanId}.t.${i}`)
  await kv.kvDel(`cpk.pack.${packId}`)
  for (let i = 0; i < 16; i++) await kv.kvDel(`cpk.pack.${packId}.c.${i}`)
})

console.log('5) MCP stdio 三工具…')
await t('MCP initialize/tools/list/ctx_pack 全通', async () => {
  const child = spawn('node', [path.join(pluginDir, 'mcp', 'server.js'), ''], { stdio: ['pipe', 'pipe', 'pipe'] })
  const result = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('MCP 冒烟超时')), 30000)
    child.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
        } else if (msg.id === 2) {
          assert.ok(msg.result.tools.length === 3)
          child.stdin.write(JSON.stringify({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'ctx_pack', arguments: { path: pluginDir, include: ['README.md'], inlineBytes: 999999 } },
          }) + '\n')
        } else if (msg.id === 3) {
          clearTimeout(timer)
          child.kill()
          resolve(msg)
        }
      }
    })
    child.on('exit', () => reject(new Error('MCP 进程提前退出')))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
  })
  const text = result.result.content[0].text
  assert.ok(!result.result.isError, `ctx_pack 报错: ${text.slice(0, 200)}`)
  assert.ok(text.includes('打包完成'), '应返回打包统计')
  assert.ok(text.includes('bundle 文件:'), '应返回 bundle 路径')
})

console.log(`\n${pass + fail} 项冒烟：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
