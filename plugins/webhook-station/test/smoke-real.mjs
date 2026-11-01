/**
 * 真实桥冒烟（对运行中的生产 Polaris 全链路验证）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）
 * 护栏：真实 kv 已有 whs.* 业务键 → 拒跑（防冒烟毁生产数据）
 * 隔离：服务存储走 WHS_STORE_DIR 临时目录，日志走临时 appConfigDir；
 *       kv 键用真实前缀（服务硬编码），结束 100% 清理。
 *
 * 流程：发现桥 → 护栏 → spawn 服务 → /__health → 默认桶引导 → 未知 secret 404 →
 *       伪造支付回调捕获（JSON+头+GET）→ rec/文件落痕 → 大 body 截断 →
 *       转发模式镜像上游（本地 mock）→ 命令键 drop_capture →
 *       spawn MCP：initialize/tools/list/hook_recent/hook_get/hook_search/
 *       hook_replay(confirm 门+真实重放)/hook_overview/hook_clear(confirm 门+清空) →
 *       meta 心跳 → 清场 → N/N 报告
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
const core = require(path.join(ROOT, 'shared', 'core.js'))

const results = []
const t = (name, fn) => results.push({ name, fn })
const SERVICE_PORT = 19877
const MOCK_PORT = 19878
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
const asJson = (r) => {
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
    setTimeout(() => { rl.off('line', onLine); reject(new Error(`MCP ${method} 超时`)) }, 35000)
  })
}

async function main() {
  // 1. 发现真实桥
  const ep = await resolveEndpoint('')
  const probe = await httpJson('GET', ep.port, '/api/health').catch(() => null)
  assert.ok(probe && probe.status === 200, `真实桥不可达 127.0.0.1:${ep.port}`)
  const kv = createKvClient({ appConfigDir: '', log: () => {} })

  // 2. 护栏：已有业务键拒跑
  const existing = (await kv.kvKeys()).filter((k) => k.startsWith('whs.'))
  assert.strictEqual(existing.length, 0, `真实 kv 已存在 whs.* 键（${existing.join(', ')}）——插件可能已在使用，拒绝冒烟`)

  // 3. 临时目录 + 本地转发目标 mock + spawn 服务
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'whs-smoke-'))
  const tmpCfg = path.join(tmpBase, 'cfg')
  const tmpStore = path.join(tmpBase, 'store')
  fs.mkdirSync(tmpCfg, { recursive: true })

  const mockHits = []
  const mock = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      mockHits.push({ method: req.method, path: req.url, body: Buffer.concat(chunks).toString('utf8') })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'SUCCESS', got: req.url }))
    })
  })
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r))

  const svc = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(SERVICE_PORT), tmpCfg], {
    env: { ...process.env, WHS_STORE_DIR: tmpStore, WHS_DEBUG: '1' },
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
      const r = await httpJson('GET', SERVICE_PORT, '/__health').then(asJson).catch(() => null)
      return r && r.status === 200 && r.json && r.json.ok === true
    }, BRIDGE_TIMEOUT_MS, '服务 /__health')
    t('服务 /__health 200', () => {})

    // 5. 默认桶引导（服务首 tick 写 settings）
    const settings = await waitFor(async () => {
      const v = await kv.kvGet('whs.settings').catch(() => null)
      return v && Array.isArray(v.buckets) && v.buckets.length > 0 ? v : null
    }, BRIDGE_TIMEOUT_MS, 'settings 默认桶引导')
    const bucket = settings.buckets[0]
    t('首次运行自动建默认桶（secret 合法）', () => {
      assert.strictEqual(bucket.id, 'default')
      assert.ok(core.isValidSecret(bucket.secret))
    })

    // 6. 未知 secret 404
    const nf = await httpJson('POST', SERVICE_PORT, '/hook/000000000000', { body: '{"x":1}' })
    assert.strictEqual(nf.status, 404)
    t('未知 secret 捕获地址 404', () => {})

    // 7. 伪造微信支付回调（JSON + 签名头）→ 200 + received
    const payBody = JSON.stringify({
      id: 'evt-1', resource: { ciphertext: 'fake', out_trade_no: 'PO20261101001', amount: { total: 9900 } },
    })
    const post = asJson(await httpJson('POST', SERVICE_PORT, `/hook/${bucket.secret}/wechat/pay`, {
      body: payBody,
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payBody),
        'Wechatpay-Signature': 'sig-abc', 'Wechatpay-Timestamp': '1730000000', 'User-Agent': 'WeChat-Pay-HttpClient',
      },
    }))
    assert.strictEqual(post.status, 200, `捕获应答异常: ${post.status} ${post.buf && post.buf.toString()}`)
    assert.ok(post.json && post.json.received === true && post.json.id, 'fixed 应答应为 {received:true,id}')
    t('POST 回调捕获 + 固定应答 {received:true}', () => {})

    // 8. 捕获进 rec 镜像与留痕文件（头在、体在、来源在）
    const rec = await waitFor(async () => {
      const idx = await kv.kvGet('whs.idx').catch(() => null)
      if (!idx || !idx.chunkCount) return null
      const arr = await kv.kvGet('whs.rec.0').catch(() => null)
      return Array.isArray(arr) && arr.length ? arr : null
    }, BRIDGE_TIMEOUT_MS, 'rec 镜像')
    const captured = rec.find((r) => r.method === 'POST')
    t('捕获镜像 kv：头/体/来源/路径完整', () => {
      assert.strictEqual(captured.path, `/hook/${bucket.secret}/wechat/pay`)
      assert.strictEqual(captured.headers['wechatpay-signature'], 'sig-abc')
      assert.ok(captured.bodyText.includes('out_trade_no'))
      assert.ok(captured.sourceIp)
      assert.strictEqual(captured.responded.status, 200)
    })

    // 9. 留痕文件全文可读（MCP 同路径）
    const meta0 = await waitFor(async () => {
      const v = await kv.kvGet('whs.meta').catch(() => null)
      return v && v.filePath ? v : null
    }, BRIDGE_TIMEOUT_MS, 'meta 心跳')
    assert.ok(meta0.filePath.startsWith(tmpStore), `留痕应在临时目录: ${meta0.filePath}`)
    const fileRaw = fs.readFileSync(meta0.filePath, 'utf8')
    const fileRec = core.parseJsonlLine(fileRaw.split('\n').find((l) => l.includes('out_trade_no') || l.includes('evt-1')) || '')
    t('JSONL 留痕文件含全量记录', () => assert.ok(fileRec && fileRec.id === captured.id))

    // 10. GET 回调也捕获
    await httpJson('GET', SERVICE_PORT, `/hook/${bucket.secret}/health-check?probe=1`)
    await waitFor(async () => {
      const arr = await kv.kvGet('whs.rec.0').catch(() => null)
      return Array.isArray(arr) && arr.some((r) => r.method === 'GET') ? true : null
    }, BRIDGE_TIMEOUT_MS, 'GET 回调入镜像')
    t('GET 回调同样捕获', () => {})

    // 11. 大 body 截断（默认 256KB 存储上限）
    const big = 'x'.repeat(400 * 1024)
    await httpJson('POST', SERVICE_PORT, `/hook/${bucket.secret}/big`, {
      body: big, headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(big) },
    })
    await waitFor(async () => {
      const arr = await kv.kvGet('whs.rec.0').catch(() => null)
      return Array.isArray(arr) && arr.some((r) => r.path.endsWith('/big')) ? arr.find((r) => r.path.endsWith('/big')) : null
    }, BRIDGE_TIMEOUT_MS, '大 body 入镜像')
      .then((bigRec) => t('大 body 捕获且标记截断', () => assert.strictEqual(bigRec.truncated, true)))

    // 12. 转发模式：改 settings → 等 5s 热更 → 再发回调 → mock 收到 + 上游响应镜像回调用方
    const fwdSettings = {
      ...settings,
      buckets: settings.buckets.map((b) => (b.id === 'default'
        ? { ...b, responseMode: 'forward', forwardUrl: `http://127.0.0.1:${MOCK_PORT}/api/pay/notify` }
        : b)),
      updatedAt: Date.now(),
    }
    await kv.kvSet('whs.settings', fwdSettings)
    await new Promise((r) => setTimeout(r, 6500)) // > SETTINGS_REREAD_MS(5s)
    const fwdBody = JSON.stringify({ out_trade_no: 'PO20261101002', event: 'PAYMENT.SUCCESS' })
    const fwdPost = asJson(await httpJson('POST', SERVICE_PORT, `/hook/${bucket.secret}/wechat/pay`, {
      body: fwdBody, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fwdBody) },
    }))
    assert.strictEqual(fwdPost.status, 200, `转发模式应答应为上游状态: ${fwdPost.status} ${fwdPost.buf && fwdPost.buf.toString()}`)
    t('转发模式：上游响应镜像给调用方', () => {
      assert.ok(fwdPost.json && fwdPost.json.code === 'SUCCESS', `响应体应来自 mock: ${fwdPost.buf && fwdPost.buf.toString()}`)
    })
    await waitFor(async () => mockHits.length >= 1 ? true : null, BRIDGE_TIMEOUT_MS, 'mock 收到转发')
    t('转发到达本地应用（路径/体一致）', () => {
      assert.strictEqual(mockHits[0].path, `/api/pay/notify`)
      assert.ok(mockHits[0].body.includes('PO20261101002'))
      assert.strictEqual(mockHits[0].method, 'POST')
    })
    const fwdRec = await waitFor(async () => {
      const arr = await kv.kvGet('whs.rec.0').catch(() => null)
      return Array.isArray(arr) ? arr.find((r) => r.forward) : null
    }, BRIDGE_TIMEOUT_MS, 'forward 结果入镜像')
    t('捕获记录带转发结果（状态/延迟）', () => {
      assert.strictEqual(fwdRec.forward.ok, true)
      assert.strictEqual(fwdRec.forward.status, 200)
      assert.ok(typeof fwdRec.forward.latencyMs === 'number')
    })

    // 13. 命令键 drop_capture（先删后做）
    const nonce1 = `smoke${Date.now().toString(36)}`
    await kv.kvSet(`whs.cmd.drop_capture.${nonce1}`, { op: 'drop_capture', nonce: nonce1, captureId: captured.id, at: Date.now() })
    await waitFor(async () => {
      const v = await kv.kvGet(`whs.result.${nonce1}`).catch(() => null)
      return v && v.ok === true ? v : null
    }, BRIDGE_TIMEOUT_MS, 'drop_capture 结果')
    t('命令键 drop_capture 生效（先删后做）', async () => {
      const arr = await kv.kvGet('whs.rec.0').catch(() => null)
      assert.ok(!arr.some((r) => r.id === captured.id), '目标记录应已从镜像删除')
    })

    // 14. MCP 全闭环
    const init = await mcpCall(mcp, mcpRl, 'initialize', {}, 1)
    assert.ok(init.result && init.result.serverInfo.name === 'webhook-station')
    const tools = await mcpCall(mcp, mcpRl, 'tools/list', {}, 2)
    assert.strictEqual(tools.result.tools.length, 6, `工具数=${tools.result.tools.length}`)
    assert.ok(tools.result.tools.every((x) => x.name.startsWith('hook_')))
    t('MCP initialize + tools/list（6 工具）', () => {})

    const recent = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'hook_recent', arguments: { limit: 5 } }, 3)
    assert.ok(!recent.result.isError, `hook_recent 失败: ${recent.result.content[0].text}`)
    assert.ok(recent.result.content[0].text.includes('GET'), 'recent 应含 GET 记录')
    t('MCP hook_recent 列出捕获', () => {})

    const getResult = await mcpCall(mcp, mcpRl, 'tools/call', {
      name: 'hook_get', arguments: { id: fwdRec.id },
    }, 4)
    assert.ok(!getResult.result.isError, `hook_get 失败: ${getResult.result.content[0].text}`)
    t('MCP hook_get 全文 + 敏感头脱敏', () => {
      const txt = getResult.result.content[0].text
      assert.ok(txt.includes('PO20261101002') || txt.includes('PAYMENT.SUCCESS'), '应含请求体内容')
      assert.ok(!txt.includes('sig-abc'), '签名值应被脱敏')
    })

    const search = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'hook_search', arguments: { q: 'PO20261101002' } }, 5)
    assert.ok(!search.result.isError && search.result.content[0].text.includes(fwdRec.id), `hook_search 失败: ${search.result.content[0].text}`)
    t('MCP hook_search 全文检索', () => {})

    // replay：无 confirm 拒绝；confirm 后真实重放到 mock
    const replayNo = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'hook_replay', arguments: { captureId: fwdRec.id } }, 6)
    assert.ok(replayNo.result.isError, '无 confirm 应被拒绝')
    const mockHitsBefore = mockHits.length
    const replayYes = await mcpCall(mcp, mcpRl, 'tools/call', {
      name: 'hook_replay', arguments: { captureId: fwdRec.id, confirm: true },
    }, 7)
    assert.ok(!replayYes.result.isError, `hook_replay 失败: ${replayYes.result.content[0].text}`)
    await waitFor(async () => mockHits.length > mockHitsBefore ? true : null, BRIDGE_TIMEOUT_MS, '重放到达 mock')
    t('MCP hook_replay：confirm 门 + 真实重放到达', () => {})

    const overview = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'hook_overview', arguments: {} }, 8)
    assert.ok(!overview.result.isError && overview.result.content[0].text.includes(String(SERVICE_PORT)), `hook_overview 失败: ${overview.result.content[0].text}`)
    t('MCP hook_overview 输出捕获地址', () => {})

    const clearNo = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'hook_clear', arguments: {} }, 9)
    assert.ok(clearNo.result.isError, '无 confirm 的 clear 应被拒绝')
    const clearYes = await mcpCall(mcp, mcpRl, 'tools/call', { name: 'hook_clear', arguments: { bucketId: 'default', confirm: true } }, 10)
    assert.ok(!clearYes.result.isError, `hook_clear 失败: ${clearYes.result.content[0].text}`)
    await waitFor(async () => {
      const arr = await kv.kvGet('whs.rec.0').catch(() => null)
      // 清空后 rec.0 被删除（kvDel）而非留空数组，两者都算清空
      return arr === null || (Array.isArray(arr) && arr.length === 0) ? true : null
    }, BRIDGE_TIMEOUT_MS, 'clear 后镜像清空')
    t('MCP hook_clear：confirm 门 + 清空生效', () => {})

    // 15. meta 心跳字段
    const meta1 = await kv.kvGet('whs.meta').catch(() => null)
    t('meta 心跳含端口/留痕/统计', () => {
      assert.strictEqual(meta1.port, SERVICE_PORT)
      assert.ok(meta1.filePath && typeof meta1.fileBytes === 'number')
      assert.ok(Array.isArray(meta1.lanUrls))
    })
  } catch (e) {
    const cur = results[results.length - 1]
    const entry = cur || { name: '（前置步骤失败）' }
    if (!cur) results.push(entry)
    entry.failed = true
    entry.err = `${e.message}\n--- 服务日志尾部 ---\n${svcErr.split('\n').slice(-12).join('\n')}\n--- MCP 日志尾部 ---\n${mcpErr.split('\n').slice(-6).join('\n')}`
  } finally {
    // 清场：杀进程 + 删临时目录 + 删全部 whs.* 键 + 关 mock
    for (const child of [svc, mcp]) {
      try { child.kill() } catch (_) { /* 已退出 */ }
    }
    try { mock.close() } catch (_) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 800))
    try { fs.rmSync(tmpBase, { recursive: true, force: true }) } catch (_) { /* Windows 句柄延迟 */ }
    try {
      const keys = (await kv.kvKeys()).filter((k) => k.startsWith('whs.'))
      for (const k of keys) await kv.kvDel(k).catch(() => {})
      console.log(`\n清场: 已删除 ${keys.length} 个 whs.* 测试键`)
    } catch (e) {
      console.log(`\n清场警告: kv 清理失败 ${e.message}（请手动删除 whs.* 键）`)
    }
  }
  report()
}

main().catch((e) => {
  console.error(`冒烟框架错误: ${e.stack || e.message}`)
  process.exit(1)
})
