// 面板渲染 + 数据层冒烟：node test/render-verify.mjs
// house 配方（cdn-audit/domain-probe 同构）：esbuild 把 react-dom/server 与组件打进
// 同一 bundle（单 React 实例），SSR 断言骨架与关键文案——防「构建过了但首屏运行时崩」。
// 数据层：stub 宿主 invoke → cap.http → hermetic service（9870）。
import assert from 'node:assert'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getFreePort } from './helpers.mjs'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(import.meta.url)

let SVC_PORT = 9870
const TOKEN = 'render-0123456789abcdef'

const tmp = mkdtempSync(path.join(tmpdir(), 'qpl-render-'))
const outFile = path.join(tmp, 'render-entry.cjs')
await build({
  entryPoints: [path.join(PLUGIN_ROOT, 'test', 'render-entry.tsx')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  outfile: outFile,
  external: ['crypto'],
  logLevel: 'silent',
})
const entry = require2(outFile)

let svc = null
let svcTmp = null
const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
const clean = (h) => h.replace(/<!-- -->/g, '')

// ── 起 hermetic service 供数据层冒烟 ──
SVC_PORT = await getFreePort()
svcTmp = mkdtempSync(path.join(tmpdir(), 'qpl-render-svc-'))
svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(SVC_PORT), svcTmp], {
  env: { ...process.env, QPL_NO_KV: '1', QPL_TOKEN: TOKEN },
  stdio: ['ignore', 'ignore', 'ignore'],
})
const t0 = Date.now()
for (;;) {
  try { if ((await fetch(`http://127.0.0.1:${SVC_PORT}/__health`)).ok) break; } catch (_) { /* wait */ }
  if (Date.now() - t0 > 10000) { console.error('service 未就绪'); process.exit(1) }
  await new Promise((r) => setTimeout(r, 120))
}

await t('面板首帧：加载态（SSR 下 useEffect 未跑，首帧即加载态）', () => {
  const h = clean(entry.renderPanel())
  assert.match(h, /服务未就绪/)
  assert.match(h, /正在读取服务元数据/)
  assert.match(h, /重试/)
})

await t('结果视图：统计条/发现卡/计划树/详情区', () => {
  const h = clean(entry.renderResultView())
  for (const x of ['实际执行 ANALYZE', '17.4', '全表扫描：orders', '计划树', 'Sort', 'Seq Scan', '5.0k', '原始计划输出']) {
    assert.ok(h.includes(x), `缺文案 ${x}`)
  }
})

await t('节点详情：MySQL 表节点键值与 flags', () => {
  const h = clean(entry.renderNodeDetail())
  for (const x of ['全表扫描 (ALL)', 'orders', '每扫检查', '过滤保留', 'filesort', 'attached_condition']) {
    assert.ok(h.includes(x), `缺文案 ${x}`)
  }
})

await t('发现卡：critical 默认展开 + 建议动作', () => {
  const h = clean(entry.renderFinding())
  assert.ok(h.includes('严重'), 'severity 标签')
  assert.ok(h.includes('外排磁盘'))
  assert.ok(h.includes('work_mem'))
})

await t('数据层：meta 发现 + conns.list + plan.parse 全链路', async () => {
  const r = await entry.smokeDataLayer(SVC_PORT, TOKEN)
  assert.equal(r.metaOk, true, `metaOk ${JSON.stringify(r)}`)
  assert.equal(r.connsOk, true, `connsOk ${JSON.stringify(r)}`)
  assert.equal(r.parseOk, true, `parseOk ${JSON.stringify(r)}`)
  assert.equal(r.guardThrows, true, `guardThrows ${JSON.stringify(r)}`)
})

svc.kill()
await new Promise((r) => setTimeout(r, 200))
rmSync(tmp, { recursive: true, force: true })
rmSync(svcTmp, { recursive: true, force: true })

let failed = 0
for (const r of results) {
  if (r.pass) console.log(`  ✔ ${r.name}`)
  else { failed += 1; console.error(`  ✖ ${r.name} — ${r.detail}`) }
}
if (failed) { console.error(`\n渲染冒烟失败 ${failed} 项`); process.exit(1) }
console.log('\n面板渲染 + 数据层冒烟全部通过 ✔')
process.exit(0) // Windows 退出期 libuv 偶发句柄断言，显式收口
