/**
 * SSR 渲染断言：esbuild 打包 render-entry.tsx → 动态 import → react-dom/server 输出断言
 * （四 Tab 结构 / 有数据态内容 / 空态 / 护栏文案 / 离线态）
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

const tmp = mkdtempSync(path.join(os.tmpdir(), 'har-render-'))
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
  try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, detail: e.message }); }
}
/** SSR 输出里 react-dom/server 会在相邻文本节点间插 <!-- --> 注释，断言前剥掉 */
const clean = (h) => h.replace(/<!-- -->/g, '')

// ── 面板骨架 ───────────────────────────────────────────────────────────────
t('面板：标题 + 四 Tab + 导出指引', () => {
  const h = clean(entry.renderPanelRunning())
  assert.match(h, /HAR 分析台/)
  for (const x of ['分析', '审计', '对比', '自检']) assert.ok(h.includes(x), `缺 Tab ${x}`)
  assert.match(h, /Export HAR/)
  assert.match(h, /150MB/)
})
t('面板：SSR 首帧=加载态（宿主 invoke 客户端才有）', () => {
  const h = clean(entry.renderPanelOffline())
  assert.match(h, /读取数据中…/)
  assert.match(h, /服务离线/)
})
t('面板：底部护栏行（无网络请求/投影脱敏/上限）', () => {
  const h = clean(entry.renderPanelRunning())
  assert.match(h, /全程无网络请求/)
  assert.match(h, /明文密钥不落 kv/)
  assert.match(h, /2 万条/)
})

// ── 分析 Tab ───────────────────────────────────────────────────────────────
t('分析：概览卡（条目/跨度/p95/错误）+ 状态分布 + 重复警示', () => {
  const h = clean(entry.renderAnalyzeTab())
  assert.match(h, /跨度/)
  assert.match(h, /p50 \/ p95/)
  assert.match(h, /状态分布/)
  assert.match(h, /疑似无缓存重复/)
  assert.match(h, /缓存命中 1 · 重定向 1/)
})
t('分析：空态给出三步导出指引', () => {
  const h = clean(entry.renderAnalyzeEmpty())
  assert.match(h, /还没有打开 HAR/)
  assert.match(h, /Save all as HAR/)
  assert.match(h, /全在本机完成/)
})
t('分析：过滤按钮组 + SSR 不泄露明文', () => {
  const h = clean(entry.renderAnalyzeTab())
  for (const x of ['全部', '错误', '最慢', '最大', '重复']) assert.ok(h.includes(x), `缺过滤 ${x}`)
  assert.ok(!h.includes('SECRET123'), 'SSR 泄露明文 token')
})

// ── 审计 Tab ───────────────────────────────────────────────────────────────
t('审计：高危/中危分类 + 脱敏导出区（预检按钮 + 六开关）', () => {
  const h = clean(entry.renderAuditTab())
  assert.match(h, /高危 · 鉴权头/)
  assert.match(h, /中危 · URL 敏感参数/)
  assert.match(h, /脱敏导出（分享安全版）/)
  assert.match(h, /预检（不写盘）/)
  assert.match(h, /导出脱敏版/)
  assert.ok(!h.includes('SECRET123'))
})
t('审计：零命中时显示通过态', () => {
  const h = clean(entry.renderAuditClean())
  assert.match(h, /未发现敏感信息命中/)
})

// ── 对比 Tab ───────────────────────────────────────────────────────────────
t('对比：摘要卡（新增/消失/变慢/状态翻转/总耗时）+ 分组按钮', () => {
  const h = clean(entry.renderCompareTab())
  assert.match(h, /变慢/)
  assert.match(h, /状态翻转/)
  assert.match(h, /2\.40s → 3\.54s/)
  assert.match(h, /基准: trace\.har vs 对比件: after\.har/)
})

// ── 自检 Tab ───────────────────────────────────────────────────────────────
t('自检：试金石说明 + 全绿报告', () => {
  const h = clean(entry.renderSelftestTab())
  assert.match(h, /试金石自检/)
  assert.match(h, /零网络、不碰你的真实文件/)
  assert.match(h, /17\/17 通过/)
  assert.match(h, /fixture 结构校验/)
})

rmSync(tmp, { recursive: true, force: true })

const failed = results.filter((r) => !r.pass)
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`)
console.log(`\nSSR 渲染: ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
