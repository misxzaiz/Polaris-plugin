/**
 * SSR 渲染断言：esbuild 打包 render-entry.tsx → 动态 import → react-dom/server 输出断言
 * （五 Tab 结构 / 运行态 / 空态 / 报告分级与修复建议 / 护栏文案）
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

const tmp = mkdtempSync(path.join(os.tmpdir(), 'domprobe-render-'))
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

// ── 面板骨架 ────────────────────────────────────────────────────────────────
t('面板：标题 + 五 Tab + 离线态提示', () => {
  const h = clean(entry.renderPanelOffline())
  assert.match(h, /域名诊断台/)
  for (const x of ['体检', '邮件身份', '传播', '历史', '设置']) assert.ok(h.includes(x), `缺 Tab ${x}`)
  assert.match(h, /服务未连接/)
})
t('体检 Tab：输入占位 + 全只读护栏文案 + SSR 首帧加载态', () => {
  const h = clean(entry.renderDiagnoseTab())
  assert.match(h, /要体检的域名/)
  assert.match(h, /全只读查询/)
  assert.match(h, /加载最近报告…/)   // SSR 首帧 loadingLatest=true；AI 话术空态属运行时帧
})
t('体检 Tab：运行态显示域名与阶段', () => {
  const h = clean(entry.renderDiagnoseRunning())
  assert.match(h, /正在体检 example\.com/)
  assert.match(h, /cert/)
})
t('邮件 Tab：发信域名占位 + 拒信场景文案', () => {
  const h = clean(entry.renderEmailTab())
  assert.match(h, /发信域名/)
  assert.match(h, /垃圾箱/)
})
t('传播 Tab：对比说明 + 类型选择器', () => {
  const h = clean(entry.renderPropagateTab())
  assert.match(h, /国内外解析器/)
  assert.ok(h.includes('AAAA') && h.includes('MX'), '类型下拉应含 AAAA/MX')
})
t('历史 Tab：空态', () => {
  const h = clean(entry.renderHistoryTab())
  assert.match(h, /体检历史/)
})
t('设置 Tab：服务卡三钮 + 至少保留一个解析器的纪律文案', () => {
  const h = clean(entry.renderSettingsTab())
  assert.match(h, /诊断服务/)
  assert.ok(h.includes('启动') && h.includes('重启') && h.includes('停止'))
  assert.match(h, /唯一执行者/)
})
t('报告：评分 95 + 红黄计数 + findings 分级 + 修复建议 + 守卫拒绝文案', () => {
  const h = clean(entry.renderReport())
  assert.match(h, /mailtest\.test/)
  assert.match(h, /95/)
  assert.match(h, /优秀：没有发现需要处理的问题/)
  assert.match(h, /未取到证书信息/)
  assert.match(h, /DMARC 策略为 p=quarantine/)
  assert.match(h, /DNS 查询计数/)
  assert.match(h, /1\/10/)
  assert.match(h, /agg@mailtest\.test/)
})

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
rmSync(tmp, { recursive: true, force: true })
process.exit(bad.length ? 1 : 0)
