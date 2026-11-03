/**
 * CSV 检查台 MCP harness（stdio JSON-RPC 真进程冒烟）
 *
 * 覆盖：initialize / tools list / 四工具 text+filePath 双入口（真实参数名，
 * 防 schema 声明与实现漂移——unicode-lens 实证坑）/ 错误分支 / normalize
 * round-trip / delimiter 参数。通知（notifications/initialized）写后不等待回包。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const SERVER = resolve(process.cwd(), 'mcp/server.js')
const tmpRoot = mkdtempSync(join(tmpdir(), 'csv-lens-verify-'))

let passed = 0
let failed = 0
const failures = []

function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(`${name}${extra ? ` :: ${extra}` : ''}`); console.log(`  ✗ ${name}${extra ? ` :: ${extra}` : ''}`) }
}

// ── stdio 客户端 ──
const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] })
let bufIn = ''
const pending = new Map()
let nextId = 1
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  bufIn += chunk
  for (;;) {
    const i = bufIn.indexOf('\n')
    if (i === -1) break
    const line = bufIn.slice(0, i).trim()
    bufIn = bufIn.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve: res } = pending.get(msg.id)
      pending.delete(msg.id)
      res(msg)
    }
  }
})
let stderrTail = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', (c) => { stderrTail = (stderrTail + c).slice(-2000) })

function rpc(method, params, timeoutMs = 10000) {
  const id = nextId++
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      rej(new Error(`rpc 超时: ${method}`))
    }, timeoutMs)
    pending.set(id, { resolve: (m) => { clearTimeout(timer); res(m) } })
    child.stdin.write(payload)
  })
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n') // 通知无 id，服务端不回包
}

function toolText(res) {
  const c = res && res.result && res.result.content
  if (!c || !c[0]) return null
  return { text: c[0].text, isError: !!res.result.isError }
}

async function main() {
  // 1. initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'csv-lens-verify', version: '0' } })
  check('initialize 回包 serverInfo=csv-lens', init.result && init.result.serverInfo && init.result.serverInfo.name === 'csv-lens')
  notify('notifications/initialized') // 写后不等待（通知无回包，等待会挂死）

  // 2. tools/list
  const list = await rpc('tools/list', {})
  const names = (list.result.tools || []).map((t) => t.name)
  check('tools/list 恰好四工具且前缀正确', JSON.stringify(names) === JSON.stringify(['csv_lens_parse', 'csv_lens_infer', 'csv_lens_convert', 'csv_lens_normalize']), names.join(','))

  // 3. parse text 入口（刁钻样本）
  const tricky = 'name,qty\n扳手,3\nab"c,2\n'
  const p1 = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: { text: tricky } }))
  check('parse text 入口报 bare-quote 定位', p1 && !p1.isError && p1.text.includes('未加引号的字段'), p1 && p1.text.slice(0, 120))
  check('parse 报告含数据行统计', p1 && /数据行 2/.test(p1.text), p1 && p1.text.slice(0, 80))

  // 4. parse filePath 入口（与 text 等价 + 来源标注）
  const csvFile = join(tmpRoot, 'sample.csv')
  writeFileSync(csvFile, tricky, 'utf8')
  const p2 = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: { filePath: csvFile } }))
  check('parse filePath 入口与 text 等价（含同一 bare-quote 问题）', p2 && !p2.isError && p2.text.includes('未加引号的字段'), p2 && p2.text.slice(0, 120))
  check('parse filePath 报告标注来源文件', p2 && p2.text.includes('来源文件') && p2.text.includes('sample.csv'))

  // 5. 错误分支：双参数同传 / 文件不存在
  const e1 = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: { text: 'a,b', filePath: csvFile } }))
  check('text+filePath 同传被拒（参数一义）', e1 && e1.isError && e1.text.includes('二选一'), e1 && e1.text)
  const e2 = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: { filePath: join(tmpRoot, 'nope.csv') } }))
  check('不存在的文件如实报错', e2 && e2.isError && e2.text.includes('不存在'), e2 && e2.text)
  const e3 = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: {} }))
  check('零入口被拒', e3 && e3.isError && e3.text.includes('二选一'))

  // 6. delimiter 参数
  const semi = 'a;b\n1;2\n'
  const p3 = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: { text: semi, delimiter: ';' } }))
  check('delimiter=; 生效（2 列）', p3 && !p3.isError && p3.text.includes('列 2'), p3 && p3.text.slice(0, 100))

  // 7. infer（filePath 入口，真实参数名）
  const typedFile = join(tmpRoot, 'typed.csv')
  writeFileSync(typedFile, 'id,score,ok,day,note\n1,1.5,true,2026-01-02,文字\n2,2.75,false,2026-03-04,"a,b"\n', 'utf8')
  const inf = toolText(await rpc('tools/call', { name: 'csv_lens_infer', arguments: { filePath: typedFile } }))
  check('infer filePath：int/float/bool/date/string 全判定', inf && inf.text.includes('int') && inf.text.includes('float') && inf.text.includes('bool') && inf.text.includes('date') && inf.text.includes('string'), inf && inf.text.slice(0, 200))
  check('infer 数字列统计（min/max/sum）', inf && inf.text.includes('min=1.5') && inf.text.includes('max=2.75'))

  // 8. convert：json_records 可解析 + sql 转义
  const cj = toolText(await rpc('tools/call', { name: 'csv_lens_convert', arguments: { text: 'id,name\n1,"a,b"\n2,it\'s\n', format: 'json_records' } }))
  let parsedOk = false, obj = null
  try {
    const m = cj.text.match(/\[[\s\S]*\]/)
    obj = JSON.parse(m[0])
    parsedOk = Array.isArray(obj) && obj.length === 2 && obj[0].name === 'a,b'
  } catch { parsedOk = false }
  check('convert json_records 输出可解析且结构正确', parsedOk, cj.text.slice(0, 200))
  const cs = toolText(await rpc('tools/call', { name: 'csv_lens_convert', arguments: { text: "id,name\n1,it's\n", format: 'sql', tableName: 'parts' } }))
  check('convert sql 转义单引号', cs && cs.text.includes("'it''s'") && cs.text.includes('INSERT INTO "parts"'), cs && cs.text.slice(0, 200))

  // 9. normalize round-trip（harness 侧独立验证）
  const messy = 'name;city\n"公开;招标";"多行\n城市"\n尾行,无换行'
  const nz = toolText(await rpc('tools/call', { name: 'csv_lens_normalize', arguments: { text: messy, delimiter: ';' } }))
  check('normalize 输出 CRLF 规范 CSV', nz && !nz.isError && nz.text.includes('\r\n'), nz && nz.text.slice(0, 120))
  if (nz && !nz.isError) {
    const outCsv = nz.text.split('\n\n')[1] || ''
    const rt = toolText(await rpc('tools/call', { name: 'csv_lens_parse', arguments: { text: outCsv } }))
    check('normalize 产物回喂 parse：字段矩阵守恒（5 字段×3 行）', rt && !rt.isError && rt.text.includes('列 2') && rt.text.includes('数据行 2'), rt && rt.text.slice(0, 120))
  }

  // 10. 未知工具
  const unk = toolText(await rpc('tools/call', { name: 'csv_lens_unknown', arguments: {} }))
  check('未知工具报错', unk && unk.isError && unk.text.includes('未知工具'))
}

main().then(async () => {
  child.kill()
  await cleanup()
  console.log(`\nMCP harness: ${passed} 通过 / ${failed} 失败`)
  if (stderrTail && failed > 0) console.log('server stderr 尾部:', stderrTail)
  if (failures.length) { console.log('失败清单:'); failures.forEach((f) => console.log('  - ' + f)) }
  process.exitCode = failed > 0 ? 1 : 0 // 退出码在 finally 清理之后赋值（不跳过清理）
}).catch(async (e) => {
  child.kill()
  await cleanup()
  console.error('harness 异常:', e)
  console.error('server stderr 尾部:', stderrTail)
  process.exitCode = 1
})

async function cleanup() {
  for (let i = 0; i < 5; i++) {
    try { rmSync(tmpRoot, { recursive: true, force: true }); return } catch { await delay(200) }
  }
}
