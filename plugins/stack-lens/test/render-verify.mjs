// 面板渲染冒烟：node test/render-verify.mjs
// house 配方（cdn-audit/domain-probe 同构）：esbuild 把 react-dom/server 与组件打进同一 bundle
// （单 React 实例），SSR 断言三 Tab 骨架与关键文案——防「构建过了但首屏运行时崩」。
import assert from 'node:assert'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(import.meta.url)

const tmp = mkdtempSync(path.join(os.tmpdir(), 'stack-lens-render-'))
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

t('面板骨架：三 Tab 切换', () => {
  const h = clean(entry.renderPanel())
  for (const x of ['还原', '地图', '服务']) assert.ok(h.includes(x), `缺 Tab ${x}`)
})
t('还原 Tab：栈输入 + 四种 map 来源 + 还原按钮', () => {
  const h = clean(entry.renderResolveTab())
  assert.match(h, /minified 错误栈/)
  assert.match(h, /构建产物目录/)
  assert.match(h, /拖到这里/)
  assert.match(h, /从 URL 抓 map/)
  assert.match(h, /还原/)
})
t('地图 Tab：目录扫描 + 体检入口', () => {
  const h = clean(entry.renderMapsTab())
  assert.match(h, /扫描构建产物目录/)
  assert.match(h, /体检单个 map/)
})
t('服务 Tab：状态与帮助文案（含隐私声明）', () => {
  const h = clean(entry.renderAboutTab())
  assert.match(h, /服务状态/)
  assert.match(h, /src\/api\/user\.ts:42:10/)
  assert.match(h, /隐私/)
})

let pass = 0
for (const r of results) {
  if (r.pass) { pass++; console.log(`  ✓ ${r.name}`) }
  else console.log(`  ✗ ${r.name}\n    ${r.detail}`)
}
console.log(`\n${pass}/${results.length} 通过`)
try { rmSync(tmp, { recursive: true, force: true }) } catch (_) { /* 忽略 */ }
if (pass !== results.length) process.exit(1)
