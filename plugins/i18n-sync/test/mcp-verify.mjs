/**
 * MCP 协议全闭环验证：spawn 真实 mcp/server.js（bundle）stdio 直连，
 * initialize → tools/list → 五工具全调用（临时夹具，自清理）。
 * 运行：node test/mcp-verify.mjs（需先 npm run build:mcp）
 */
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverJs = path.join(here, '..', 'mcp', 'server.js')
if (!fs.existsSync(serverJs)) {
  console.error('✗ 未找到 mcp/server.js——先 npm run build:mcp')
  process.exit(1)
}

const results = []
const t = (name, fn) => { try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) } }

// ── 临时夹具 ──
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-mcp-'))
const undo = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-mcp-undo-'))
fs.writeFileSync(path.join(root, 'zh-cn.json'), '{"login":{"title":"登录到你的账户","submit":"提交 {name}"}}', 'utf8')
fs.writeFileSync(path.join(root, 'en.json'), '{"login":{"title":"Sign in to your account"}}', 'utf8')

const proc = spawn('node', [serverJs, undo], { stdio: ['pipe', 'pipe', 'pipe'] })
let stderr = ''
proc.stderr.on('data', (d) => { stderr += d })

let seq = 0
const pending = new Map()
let buf = ''
proc.stdout.setEncoding('utf8')
proc.stdout.on('data', (chunk) => {
  buf += chunk
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch (_) { /* 忽略坏行 */ }
  }
})

function rpc(method, params) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时：${method}`)) }, 15000)
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

const TOOL = (name, args) => rpc('tools/call', { name, arguments: args })

try {
  // initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mcp-verify', version: '0.0.1' } })
  t('initialize: 返回 serverInfo=i18n-sync', () => {
    assert.equal(init.result.serverInfo.name, 'i18n-sync')
    assert.ok(init.result.capabilities.tools)
  })

  // tools/list
  const list = await rpc('tools/list', {})
  t('tools/list: 五工具齐全', () => {
    const names = list.result.tools.map((x) => x.name).sort()
    assert.deepEqual(names, ['i18n_apply', 'i18n_glossary', 'i18n_missing', 'i18n_status', 'i18n_undo'])
  })

  // i18n_status
  const st = await TOOL('i18n_status', { dir: root })
  t('i18n_status: 体检输出含缺失与占位符提示', () => {
    const text = st.result.content[0].text
    assert.ok(!st.result.isError)
    assert.ok(text.includes('en'))
    assert.ok(text.includes('缺失 1'))
    assert.ok(text.includes('login.submit'))
  })

  // i18n_missing
  const miss = await TOOL('i18n_missing', { dir: root, locale: 'en' })
  t('i18n_missing: 工作表含源文案与 apply 指引', () => {
    const text = miss.result.content[0].text
    assert.ok(!miss.result.isError)
    assert.ok(text.includes('登录到你的账户'))
    assert.ok(text.includes('i18n_apply'))
    const jsonLine = text.split('```json')[1].split('```')[0].trim()
    const items = JSON.parse(jsonLine)
    assert.ok(items.some((it) => it.k === 'login.submit'))
  })

  // i18n_apply 无 confirm → isError
  const noConfirm = await TOOL('i18n_apply', { dir: root, locale: 'en', translations: { 'login.submit': 'Submit {name}' } })
  t('i18n_apply: 缺 confirm 拒绝执行', () => {
    assert.equal(noConfirm.result.isError, true)
    assert.ok(noConfirm.result.content[0].text.includes('confirm'))
  })

  // i18n_apply 占位符不一致 → 拒绝列表明细
  const badPh = await TOOL('i18n_apply', { dir: root, locale: 'en', translations: { 'login.submit': 'Submit 无占位符' }, confirm: true })
  t('i18n_apply: 占位符不一致全拒（isError=false 但 ok:false 报告）', () => {
    const text = badPh.result.content[0].text
    assert.ok(text.includes('占位符'))
    assert.ok(text.includes('未写盘'))
  })

  // i18n_apply 正确译文 → 写入
  const good = await TOOL('i18n_apply', { dir: root, locale: 'en', translations: { 'login.submit': 'Submit {name}' }, confirm: true })
  let batchId = ''
  t('i18n_apply: 正确译文写入返回 batchId', () => {
    const text = good.result.content[0].text
    assert.ok(text.includes('已写入'))
    batchId = /batchId=(\S+)/.exec(text)[1]
    const en = JSON.parse(fs.readFileSync(path.join(root, 'en.json'), 'utf8'))
    assert.equal(en.login.submit, 'Submit {name}')
  })

  // 重扫验证闭环
  const st2 = await TOOL('i18n_status', { dir: root })
  t('应用后重扫：✅ 全对齐', () => {
    assert.ok(st2.result.content[0].text.includes('✅'))
  })

  // i18n_undo 无 confirm 拒绝 → 有 confirm 恢复
  const undoNo = await TOOL('i18n_undo', {})
  t('i18n_undo: 缺 confirm 拒绝', () => {
    assert.equal(undoNo.result.isError, true)
  })
  const undoOk = await TOOL('i18n_undo', { batchId, confirm: true })
  t('i18n_undo: 恢复原文件', () => {
    assert.ok(undoOk.result.content[0].text.includes('✓'))
    const en = JSON.parse(fs.readFileSync(path.join(root, 'en.json'), 'utf8'))
    assert.equal(en.login.submit, undefined)
  })

  // i18n_glossary set → get → missing 注入
  const gset = await TOOL('i18n_glossary', { action: 'set', terms: { 账户: 'account' } })
  t('i18n_glossary: set 生效', () => {
    assert.ok(gset.result.content[0].text.includes('account'))
  })
  const gget = await TOOL('i18n_glossary', { action: 'get' })
  t('i18n_glossary: get 回读', () => {
    assert.ok(gget.result.content[0].text.includes('账户 → account'))
  })
  const miss2 = await TOOL('i18n_missing', { dir: root, locale: 'en' })
  t('i18n_missing: 自动注入术语表', () => {
    assert.ok(miss2.result.content[0].text.includes('账户 → account'))
  })
  const gclear = await TOOL('i18n_glossary', { action: 'clear' })
  t('i18n_glossary: clear', () => {
    assert.ok(gclear.result.content[0].text.includes('已清空'))
  })

  // 幻觉键拒绝
  const ghost = await TOOL('i18n_apply', { dir: root, locale: 'en', translations: { 'fake.ghost.key': '幻觉' }, confirm: true })
  t('i18n_apply: 幻觉键拒绝', () => {
    assert.ok(ghost.result.content[0].text.includes('幻觉'))
  })

  // 未知工具
  const unknown = await rpc('tools/call', { name: 'nope', arguments: {} })
  t('未知工具返回 -32602', () => {
    assert.equal(unknown.error.code, -32602)
  })
} catch (e) {
  t(`执行中断: ${e.message}`, () => { assert.fail(e.stack || e.message) })
} finally {
  proc.kill()
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(undo, { recursive: true, force: true })
}

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'))
if (stderr) console.log('\n[stderr]\n' + stderr.split('\n').slice(0, 8).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
process.exit(bad.length ? 1 : 0)
