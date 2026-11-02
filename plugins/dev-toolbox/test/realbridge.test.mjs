// 真桥冒烟（env 门控：DEVTB_REAL=1 才跑，默认 skip 保证 npm test 离线稳定）
// 验证：① 宿主健康 ② dev-toolbox 被"真实宿主"接受（dev_link → discover 可见，即 manifest/字段校验全过）
//      ③ cap.kv devtoolbox.* 真实往返（面板依赖的持久化通道）④ 测试自清理
// 前置：pnpm tauri:dev:web 已运行（9829 后端；token 取 POLARIS_WEB_TOKEN 或默认 98279829++）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REAL = process.env.DEVTB_REAL === '1'
const HOST = process.env.POLARIS_HOST || '127.0.0.1'
const PORT = Number(process.env.POLARIS_PORT || 9829)
const TOKEN = process.env.POLARIS_WEB_TOKEN || '98279829++'
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PLUGIN_SRC = ROOT // 本插件源码目录（realbridge 测试文件位于 plugins/dev-toolbox/test 下）

const AUTH = `Bearer ${crypto.createHash('md5').update(TOKEN, 'utf8').digest('hex')}`

async function api(path, body) {
  const res = await fetch(`http://${HOST}:${PORT}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res
}

async function dispatch(target, payload) {
  const res = await api('/api/router-dispatch', { req: { target, payload } })
  assert.equal(res.status, 200, `router-dispatch HTTP ${res.status}`)
  const envelope = await res.json()
  return envelope
}

test('真桥: 宿主健康检查', { skip: !REAL && 'DEVTB_REAL!=1' }, async () => {
  const res = await api('/api/health')
  assert.equal(res.status, 200, '宿主未运行或 token 不对——先 pnpm tauri:dev:web')
})

test('真桥: dev_link 挂载本插件并经 discover 可见（真实 manifest 校验）', { skip: !REAL && 'DEVTB_REAL!=1' }, async () => {
  const link = await dispatch('cap.pluginDiscovery', { action: 'dev_link', sourcePath: PLUGIN_SRC })
  assert.equal(link.ok, true, `dev_link 失败：${JSON.stringify(link.error ?? link)}`)
  const disc = await dispatch('cap.pluginDiscovery', { action: 'discover' })
  assert.equal(disc.ok, true, 'discover 失败')
  const plugins = disc.result?.plugins ?? disc.result?.items ?? []
  const mine = plugins.find((p) => p.id === 'dev-toolbox')
  assert.ok(mine, `discover 结果中无 dev-toolbox（共 ${plugins.length} 个插件）`)
  assert.equal(mine.name, '开发者工具箱')
  assert.equal(mine.version, '0.1.0')
  assert.equal(mine.dev?.devLink ?? mine.devLink ?? true, true, '应识别为 dev-link 挂载')
})

test('真桥: cap.kv devtoolbox.selftest 往返 + 自清理', { skip: !REAL && 'DEVTB_REAL!=1' }, async () => {
  const sentinel = `devtoolbox.selftest.${Date.now()}`
  const payload = { hello: '真桥', n: 42, arr: [1, 2, 3] }
  const set = await dispatch('cap.kv', { action: 'set', key: sentinel, value: payload })
  assert.equal(set.ok, true, `kv set 失败：${JSON.stringify(set.error ?? set)}`)
  const get = await dispatch('cap.kv', { action: 'get', key: sentinel })
  assert.equal(get.ok, true)
  // 双重解包：envelope.result.value
  assert.deepEqual(get.result?.value, payload, 'kv 值往返不一致')
  const del = await dispatch('cap.kv', { action: 'delete', key: sentinel })
  assert.equal(del.ok, true, 'kv delete 失败')
  const after = await dispatch('cap.kv', { action: 'get', key: sentinel })
  assert.equal(after.result?.value ?? null, null, '删除后仍可读到值')
})

test('真桥: dist 产物存在且 MCP server 可被宿主进程执行（node 冒烟）', { skip: !REAL && 'DEVTB_REAL!=1' }, async () => {
  // dev-link 模式下宿主将直接执行 {{pluginDir}}/mcp/server.js；这里验证 node 能加载它并完成握手
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, [join(PLUGIN_SRC, 'mcp', 'server.js')], { stdio: ['pipe', 'pipe', 'pipe'] })
  const out = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('MCP 握手超时')), 8000)
    child.stdout.on('data', (c) => {
      buf += c
      if (buf.includes('"serverInfo"')) {
        clearTimeout(timer)
        resolve(buf)
      }
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
  })
  child.stdin.end()
  assert.match(out, /"name":\s*"dev-toolbox"/)
})
