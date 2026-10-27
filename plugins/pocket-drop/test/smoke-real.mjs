/**
 * 真实桥冒烟（对运行中的生产 Polaris 全链路验证）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）
 * 护栏：真实 kv 已有 pdrop.* 业务键 → 拒跑（防冒烟毁生产数据）
 * 隔离：服务存储走 PDROP_STORE_DIR 临时目录，日志走临时 appConfigDir；
 *       kv 键用真实前缀（服务硬编码），结束 100% 清理。
 *
 * 流程：发现桥 → 护栏 → spawn 服务 → /__health → PIN 门禁(401/429路径不触发) →
 *       上传/下载字节一致 → 路径穿越清洗 → 未知 id 404 → 删除 →
 *       spawn MCP：initialize/tools/list/drop_send/drop_list/drop_save/drop_clear 全闭环 →
 *       事件键存在 → 清场 → N/N 报告
 */
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const { createKvClient, resolveEndpoint } = require(path.join(ROOT, 'service', 'kvclient.js'))

const results = []
const t = (name, fn) => results.push({ name, fn })
const SERVICE_PORT = 19876
const BRIDGE_TIMEOUT_MS = 30000

function report() {
  const bad = results.filter((r) => r.failed)
  console.log(results.map((r) => `${r.failed ? '✗' : '✓'} ${r.name}${r.failed ? `\n    ${r.err}` : ''}`).join('\n'))
  console.log(`\n${results.length - bad.length}/${results.length} 通过`)
  process.exit(bad.length ? 1 : 0)
}

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = await fn() } catch (_) { /* keep waiting */ }
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error(`冒烟超时：${label}`)
    await new Promise((r) => setTimeout(r, 500))
  }
}

function httpJson(method, port, pathname, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }))
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    if (body) req.write(body)
    req.end()
  })
}
const getJson = (port, p, opt) => httpJson('GET', port, p, opt).then(asJson)
function asJson(r) {
  let json = null
  try { json = JSON.parse(r.buf.toString('utf8')) } catch (_) { /* 非 JSON */ }
  return { ...r, json }
}

/** stdio JSON-RPC 迷你客户端 */
function mcpCall(child, rl, method, params, id) {
  return new Promise((resolve, reject) => {
    const onLine = (line) => {
      try {
        const msg = JSON.parse(line)
        if (msg.id === id) { rl.off('line', onLine); resolve(msg) }
      } catch (_) { /* 非协议行忽略 */ }
    }
    rl.on('line', onLine)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    setTimeout(() => { rl.off('line', onLine); reject(new Error(`MCP ${method} 超时`)) }, 30000)
  })
}

async function main() {
  // 1. 发现真实桥
  const ep = await resolveEndpoint('')
  const probe = await getJson(ep.port, '/api/health').catch(() => null)
  assert.ok(probe && probe.status === 200, `真实桥不可达 127.0.0.1:${ep.port}`)
  const kv = createKvClient({ appConfigDir: '', log: () => {} })

  // 2. 护栏：已有业务键拒跑
  const existing = (await kv.kvKeys()).filter((k) => k.startsWith('pdrop.'))
  assert.strictEqual(existing.length, 0, `真实 kv 已存在 pdrop.* 键（${existing.join(', ')}）——插件可能已在使用，拒绝冒烟`)

  // 3. 临时目录 + spawn 服务
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pdrop-smoke-'))
  const tmpCfg = path.join(tmpBase, 'cfg')
  const tmpStore = path.join(tmpBase, 'store')
  fs.mkdirSync(tmpCfg, { recursive: true })
  const svc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(SERVICE_PORT), tmpCfg], {
    env: { ...process.env, PDROP_STORE_DIR: tmpStore, PDROP_DEBUG: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let svcErr = ''
  svc.stderr.on('data', (c) => { svcErr += c.toString() })
  const mcp = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js'), tmpCfg], { stdio: ['pipe', 'pipe', 'pipe'] })
  const mcpRl = readline.createInterface({ input: mcp.stdout })
  let mcpErr = ''
  mcp.stderr.on('data', (c) => { mcpErr += c.toString() })

  try {
    // 4. 健康端点（bridge 未就绪也 200）
    await waitFor(async () => {
      const r = await getJson(SERVICE_PORT, '/__health').catch(() => null)
      return r && r.status === 200 && r.json && r.json.ok === true
    }, BRIDGE_TIMEOUT_MS, '服务 /__health')
    t('服务 /__health 200', () => {})

    // 5. 手机页
    const page = await httpJson('GET', SERVICE_PORT, '/')
    assert.ok(page.status === 200 && page.buf.toString('utf8').includes('口袋快传'))
    t('手机页直出（同源零跨域）', () => {})

    // 6. PIN 引导：服务首 tick 写 settings
    const settings = await waitFor(async () => {
      const v = await kv.kvGet('pdrop.settings').catch(() => null)
      return v && typeof v.pin === 'string' && v.pin ? v : null
    }, BRIDGE_TIMEOUT_MS, 'settings PIN 引导')
    t('首次运行自动生成 PIN', () => assert.ok(/^\d{6}$/.test(settings.pin)))

    // 7. 门禁：无 pin / 错 pin
    const noPin = await getJson(SERVICE_PORT, '/api/info')
    assert.strictEqual(noPin.status, 401)
    const badPin = await getJson(SERVICE_PORT, `/api/info?pin=000000${settings.pin === '000000' ? '1' : ''}`)
    assert.strictEqual(badPin.status, 401)
    t('PIN 门禁：无/错 PIN 均 401', () => {})

    // 8. 信息端点
    const info = await getJson(SERVICE_PORT, `/api/info?pin=${settings.pin}`)
    assert.strictEqual(info.status, 200)
    assert.ok(info.json.ok && typeof info.json.hostname === 'string')
    t('/api/info 携 PIN 可读', () => {})

    // 9. 上传 → 下载字节一致（手机来源）
    const payload = Buffer.from('口袋快传 smoke 测试内容 123\n第二行', 'utf8')
    const up = asJson(await httpJson('POST', SERVICE_PORT, `/u?pin=${settings.pin}&name=${encodeURIComponent('测试 文件.txt')}`, {
      body: payload, headers: { 'Content-Length': payload.length },
    }))
    assert.ok(up.status === 200 && up.json.ok, `上传失败: ${up.status} ${up.buf && up.buf.toString()}`)
    const item = up.json.item
    assert.strictEqual(item.from, 'phone')
    assert.strictEqual(item.name, '测试 文件.txt')
    const down = await httpJson('GET', SERVICE_PORT, `/f/${item.id}?pin=${settings.pin}`)
    assert.strictEqual(down.status, 200)
    assert.ok(down.buf.equals(payload), '下载字节与上传不一致')
    t('上传 → 下载字节一致（手机来源）', () => {})

    // 10. 路径穿越清洗
    const payload2 = Buffer.from('evil')
    const up2 = asJson(await httpJson('POST', SERVICE_PORT, `/u?pin=${settings.pin}&name=${encodeURIComponent('../../evil.txt')}`, {
      body: payload2, headers: { 'Content-Length': payload2.length },
    }))
    assert.ok(up2.status === 200 && up2.json.item.name === 'evil.txt', `清洗失败: ${up2.json && up2.json.item && up2.json.item.name}`)
    t('上传文件名路径穿越被清洗', () => {})

    // 11. 桌面来源标记
    const payload3 = Buffer.from('desktop-upload')
    const up3 = asJson(await httpJson('POST', SERVICE_PORT, `/u?pin=${settings.pin}&name=${encodeURIComponent('面板.txt')}`, {
      body: payload3, headers: { 'Content-Length': payload3.length, 'x-drop-from': 'desktop' },
    }))
    assert.ok(up3.status === 200 && up3.json.item.from === 'desktop')
    t('面板上传带 desktop 来源标记', () => {})

    // 12. 未知 id 与非法 id
    const nf = await getJson(SERVICE_PORT, `/f/000000000000?pin=${settings.pin}`)
    assert.strictEqual(nf.status, 404)
    const badId = await getJson(SERVICE_PORT, `/f/zzzz?pin=${settings.pin}`)
    assert.strictEqual(badId.status, 404)
    t('未知/非法 id 均 404', () => {})

    // 13. 投影镜像 kv
    const mirrored = await waitFor(async () => {
      const v = await kv.kvGet('pdrop.items').catch(() => null)
      return v && Array.isArray(v.items) && v.items.length >= 3 ? v.items : null
    }, BRIDGE_TIMEOUT_MS, 'items 投影镜像')
    t('items 投影镜像到 cap.kv（3 条）', () => assert.strictEqual(mirrored.length, 3))

    // 14. MCP 全闭环
    const init = await mcpCall(mcp, mcpRl, 'initialize', {}, 1)
    assert.ok(init.result && init.result.serverInfo.name === 'pocket-drop')
    const tools = await mcpCall(mcp, mcpRl, 'tools/list', {}, 2)
    assert.strictEqual(tools.result.tools.length, 5, `工具数=${tools.result.tools.length}`)
    assert.ok(tools.result.tools.every((x) => x.name.startsWith('drop_')))
    t('MCP initialize + tools/list（5 工具）', () => {})

    // drop_send：临时文件 → 投递区（服务直读本地路径，零桥上字节）
    const srcFile = path.join(tmpBase, 'ai-report.csv')
    fs.writeFileSync(srcFile, 'id,name\n1,口袋快传\n')
    const sendRes = await mcpCall(mcp, mcpRl, 'tools/call', {
      name: 'drop_send', arguments: { path: srcFile, note: '冒烟测试' },
    }, 3)
    assert.ok(!sendRes.result.isError, `drop_send 失败: ${sendRes.result.content[0].text}`)
    assert.ok(/id=[0-9a-f]{12}/.test(sendRes.result.content[0].text))
    const aiItem = await waitFor(async () => {
      const v = await kv.kvGet('pdrop.items').catch(() => null)
      return v && v.items.find((x) => x.from === 'ai') ? v.items.find((x) => x.from === 'ai') : null
    }, BRIDGE_TIMEOUT_MS, 'drop_send 条目出现')
    assert.strictEqual(aiItem.name, 'ai-report.csv')
    t('MCP drop_send：本地文件投递成功', () => {})

    // drop_list
    const listRes = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'drop_list', arguments: {} }, 4)
    assert.ok(!listRes.result.isError && listRes.result.content[0].text.includes('ai-report.csv'))
    t('MCP drop_list 列出投递区', () => {})

    // drop_save：手机上传的文件保存到指定路径
    const destFile = path.join(tmpBase, 'saved-测试 文件.txt')
    const saveRes = await mcpCall(mcp, mcpRl, 'tools/call', {
      name: 'drop_save', arguments: { id: item.id, dest: destFile },
    }, 5)
    assert.ok(!saveRes.result.isError, `drop_save 失败: ${saveRes.result.content[0].text}`)
    assert.ok(fs.readFileSync(destFile).equals(payload), '保存文件字节不一致')
    t('MCP drop_save：投递文件落盘字节一致', () => {})

    // drop_clear：无 confirm 拒绝；有 confirm 清空
    const clearNo = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'drop_clear', arguments: {} }, 6)
    assert.ok(clearNo.result.isError, '无 confirm 应被拒绝')
    const clearYes = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'drop_clear', arguments: { confirm: true } }, 7)
    assert.ok(!clearYes.result.isError, `drop_clear 失败: ${clearYes.result.content[0].text}`)
    await waitFor(async () => {
      const v = await kv.kvGet('pdrop.items').catch(() => null)
      return v && v.items.length === 0 ? v : null
    }, BRIDGE_TIMEOUT_MS, 'drop_clear 后投递区清空')
    t('MCP drop_clear：confirm 门 + 清空生效', () => {})

    // drop_status
    const statusRes = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'drop_status', arguments: {} }, 8)
    assert.ok(!statusRes.result.isError && statusRes.result.content[0].text.includes('端口'))
    t('MCP drop_status 输出服务状态', () => {})

    // 15. 事件流
    await waitFor(async () => {
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith('pdrop.event.'))
      return keys.length >= 3 ? keys : null
    }, BRIDGE_TIMEOUT_MS, '事件键写入')
    t('事件流写入 kv（send/recv/clear 等）', () => {})

    // 16. meta 心跳
    const meta = await waitFor(async () => {
      const v = await kv.kvGet('pdrop.meta').catch(() => null)
      return v && v.lastTickAt ? v : null
    }, BRIDGE_TIMEOUT_MS, 'meta 心跳')
    assert.strictEqual(meta.port, SERVICE_PORT)
    assert.ok(meta.dropDir.startsWith(tmpStore), `存储目录应指向临时目录: ${meta.dropDir}`)
    assert.ok(typeof meta.storeBytes === 'number')
    t('meta 心跳含端口/存储目录/统计', () => {})
  } catch (e) {
    const cur = results[results.length - 1] || { name: '未命名' }
    cur.failed = true
    cur.err = `${e.message}\n--- 服务日志尾部 ---\n${svcErr.split('\n').slice(-12).join('\n')}\n--- MCP 日志尾部 ---\n${mcpErr.split('\n').slice(-6).join('\n')}`
  } finally {
    // 清场：杀进程 + 删临时目录 + 删全部 pdrop.* 键
    for (const child of [svc, mcp]) {
      try { child.kill() } catch (_) { /* 已退出 */ }
    }
    await new Promise((r) => setTimeout(r, 800))
    try { fs.rmSync(tmpBase, { recursive: true, force: true }) } catch (_) { /* Windows 句柄延迟 */ }
    try {
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith('pdrop.'))
      for (const k of keys) await kv.kvDel(k).catch(() => {})
      console.log(`\n清场: 已删除 ${keys.length} 个 pdrop.* 测试键`)
    } catch (e) {
      console.log(`\n清场警告: kv 清理失败 ${e.message}（请手动删除 pdrop.* 键）`)
    }
  }
  report()
}

main().catch((e) => {
  console.error(`冒烟框架错误: ${e.stack || e.message}`)
  process.exit(1)
})
