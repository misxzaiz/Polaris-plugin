// 面板渲染冒烟：node test/render-verify.mjs
// house 配方（domain-probe 同构）：esbuild 把 react-dom/server 与组件打进同一 bundle
// （单 React 实例），SSR 断言六 Tab 骨架与关键文案——防「构建过了但首屏运行时崩」。
import assert from 'node:assert'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(import.meta.url)

const tmp = mkdtempSync(path.join(os.tmpdir(), 'cdn-audit-render-'))
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

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
/** SSR 输出里 react-dom/server 会在相邻文本节点间插 <!-- --> 注释，断言前剥掉 */
const clean = (h) => h.replace(/<!-- -->/g, '')

t('面板骨架：六 Tab + 状态条', () => {
  const h = clean(entry.renderPanel())
  assert.equal((h.match(/class="tab-btn/g) || []).length, 6, '应有六个 Tab 按钮')
  assert.match(h, /连接中…/)
  for (const x of ['核验', '镜像', 'SRI', '传播', '历史', '设置']) assert.ok(h.includes(x), `缺 Tab ${x}`)
})
t('核验 Tab：双模式切换 + URL 占位 + 核验按钮', () => {
  const h = clean(entry.renderCheckTab())
  assert.match(h, /URL 列表/)
  assert.match(h, /HTML 页面/)
  assert.match(h, /cdn\.jsdelivr\.net\/npm\/jquery@3\.7\.1/)
  assert.match(h, /开始核验/)
})
t('镜像 Tab：输入占位与矩阵说明', () => {
  const h = clean(entry.renderMirrorTab())
  assert.match(h, /镜像矩阵/)
  assert.match(h, /从你的网络实测/)
})
t('SRI Tab：官方口径提示（标签块为结果帧，SSR 首帧只有表单）', () => {
  const h = clean(entry.renderSriTab())
  assert.match(h, /生成 SRI 标签/)
  assert.match(h, /绝不给篡改内容背书/)
})
t('传播 Tab：观测表单 + purge 冷却说明', () => {
  const h = clean(entry.renderWatchTab())
  assert.match(h, /origin/)
  assert.match(h, /edge/)
  assert.match(h, /冷却/)
})
t('FindingsList：undefined 容错渲染空态', () => {
  const h = clean(entry.renderFindingsEmpty())
  assert.match(h, /无结论项/)
})

let pass = 0
for (const r of results) {
  if (r.pass) { pass++; console.log(`  ✓ ${r.name}`) }
  else console.log(`  ✗ ${r.name}\n    ${r.detail}`)
}
console.log(`\n${pass}/${results.length} 通过`)
try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
if (pass !== results.length) process.exit(1)
