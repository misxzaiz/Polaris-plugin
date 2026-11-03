/**
 * 面板渲染冒烟：node test/render-verify.mjs
 * house 配方（cdn-audit/domain-probe 同构）：单 React 实例 SSR，断言首屏骨架
 * ——防「构建过了但首屏运行时崩」。
 */
import assert from 'node:assert'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(import.meta.url)

const tmp = mkdtempSync(path.join(os.tmpdir(), 'swarm-lab-render-'))
const outFile = path.join(tmp, 'render-entry.cjs')
await build({
  entryPoints: [path.join(PLUGIN_ROOT, 'test', 'render-entry.tsx')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  outfile: outFile,
  logLevel: 'silent',
})
const entry = require2(outFile)

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
/** SSR 输出里 react-dom/server 会在相邻文本节点间插 <!-- --> 注释，断言前剥掉 */
const clean = (h) => h.replace(/<!-- -->/g, '')

let html = ''
t('SSR 渲染不抛（首屏运行时存活）', () => { html = clean(entry.renderPanel()) })
t('面板骨架：标题 + 画布容器 + 样式随行', () => {
  assert.match(html, /蜂群实验台/)
  assert.match(html, /class="sw-canvas"/)
  assert.match(html, /\.sw-root\{/)
})
t('场景芯片：蜂群鸟群 / 蚁群觅食', () => {
  assert.ok(html.includes('蜂群鸟群'), '缺场景芯片 蜂群鸟群')
  assert.ok(html.includes('蚁群觅食'), '缺场景芯片 蚁群觅食')
})
t('控制区：播放/单步/重置/新种子/速度', () => {
  for (const label of ['暂停', '单步', '重置', '新种子', '速度']) assert.ok(html.includes(label), `缺控制项 ${label}`)
})
t('boids 默认场景：参数滑杆与主指标', () => {
  for (const label of ['个体数', '分离权重', '对齐权重', '聚合权重', '极化指数（秩序）']) assert.ok(html.includes(label), `缺 ${label}`)
})
t('实时指标区：四指标键与说明渲染', () => {
  for (const key of ['polarization', 'meanNND', 'clusters', 'catches']) assert.ok(html.includes(key), `缺指标 ${key}`)
})
t('尾注：AI 对照实验指引', () => {
  assert.match(html, /swarmlab_compare/)
})

let pass = 0
for (const r of results) {
  if (r.pass) { pass++; console.log(`  ✓ ${r.name}`) }
  else console.log(`  ✗ ${r.name}\n    ${r.detail}`)
}
console.log(`\n${pass}/${results.length} 通过`)
try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
if (pass !== results.length) process.exit(1)
