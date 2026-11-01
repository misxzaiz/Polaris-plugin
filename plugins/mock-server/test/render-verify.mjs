/**
 * SSR 渲染断言：esbuild 打包 render-entry.tsx → 动态 import → react-dom/server 输出断言
 * （四 Tab 结构 / 有数据态内容 / 空态 / 护栏文案 / 离线态）
 */
import assert from 'node:assert'
import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(import.meta.url)

const tmp = mkdtempSync(path.join(os.tmpdir(), 'mck-render-'))
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
t('面板：标题 + 四 Tab + 基线提示', () => {
  const h = clean(entry.renderPanelRunning())
  assert.match(h, /Mock 接口台/);
  ['路由', '历史', '自检', '设置'].forEach((x) => assert.ok(h.includes(x), `缺 Tab ${x}`));
  assert.match(h, /baseURL/);
});
t('面板：SSR 首帧=加载态（宿主 invoke 客户端才有；离线/在线徽章属运行时状态）', () => {
  const h = clean(entry.renderPanelOffline())
  assert.match(h, /读取数据中…/);
  assert.match(h, /服务离线/);
});
t('面板：基线提示卡显示默认入口 9868 + 404 诊断说明', () => {
  const h = clean(entry.renderPanelRunning())
  assert.match(h, /http:\/\/127\.0\.0\.1:9868/);
  assert.match(h, /404 诊断体/);
  assert.match(h, /3 秒内生效/);
});
t('面板：底部护栏行（仅 127.0.0.1/历史 500 条/数据不出本机）', () => {
  const h = clean(entry.renderPanelRunning())
  assert.match(h, /仅监听 127\.0\.0\.1/);
  assert.match(h, /500 条/);
  assert.match(h, /数据不出本机/);
});

// ── 路由 Tab ──────────────────────────────────────────────────────────────
t('路由 Tab：方法徽章/路径/状态码/延迟与错误率角标', () => {
  const h = clean(entry.renderRoutesTab())
  assert.match(h, /GET/);
  assert.match(h, /\/mockdemo\/users/);
  assert.match(h, /\/api\/users\/:id/);
  assert.match(h, /慢 500ms/);
  assert.match(h, /错 20%/);
  assert.match(h, /示例/);
});
t('路由 Tab：操作按钮齐全 + 新建入口 + 模板速查', () => {
  const h = clean(entry.renderRoutesTab());
  ['新建路由', '试一发', '编辑', '复制', '删除', '模板速查'].forEach((x) => assert.ok(h.includes(x), `缺 ${x}`));
});
t('路由 Tab：完整地址展示（服务入口+路径）', () => {
  const h = clean(entry.renderRoutesTab())
  assert.match(h, /127\.0\.0\.1:9868/);
});

// ── 历史 Tab ──────────────────────────────────────────────────────────────
t('历史 Tab：记录行（方法/路径/状态/耗时/路由名）', () => {
  const h = clean(entry.renderHistoryTab())
  assert.match(h, /\/api\/pay/);
  assert.match(h, /201/);
  assert.match(h, /512ms/);
  assert.match(h, /路由\[支付\]/);
});
t('历史详情：脱敏请求头 + 请求体预览 + 来源行', () => {
  const h = clean(entry.renderHistDetail())
  assert.match(h, /已脱敏/);
  assert.match(h, /请求体/);
  assert.match(h, /amount/);
  assert.match(h, /来源/);
});
t('历史 Tab：清空按钮 + 500 条口径', () => {
  const h = clean(entry.renderHistoryTab())
  assert.match(h, /清空/);
  assert.match(h, /最近 500 条/);
});

// ── 自检 Tab ──────────────────────────────────────────────────────────────
t('自检 Tab：全绿报告 7/7 + 检查项明细 + 现场跑通文案', () => {
  const h = clean(entry.renderSelftestTab())
  assert.match(h, /7\/7/);
  assert.match(h, /模板引擎/);
  assert.match(h, /真实 HTTP 请求/);
  assert.match(h, /不是「代码写完了」，是「现场跑通了」/);
});
t('自检 Tab：失败报告红显 + 运行按钮', () => {
  const h = clean(entry.renderSelftestFailed())
  assert.match(h, /6\/7/);
  assert.match(h, /CORS 预检/);
  assert.match(h, /ACAO=undefined/);
  assert.match(h, /运行自检/);
});

// ── 设置 Tab ──────────────────────────────────────────────────────────────
t('设置 Tab：CORS 三模式 + fallback + 导入导出 + 护栏边界', () => {
  const h = clean(entry.renderSettingsTab());
  ['echo', 'star', 'off', 'fallback', '导入', '导出', '已知边界'].forEach((x) => assert.ok(h.includes(x), `缺 ${x}`));
  assert.match(h, /未匹配返回 404 诊断体/);
  assert.match(h, /404 诊断体，更早暴露路径拼写问题/);
});
t('设置 Tab：服务入口与面板不直接发请求说明', () => {
  const h = clean(entry.renderSettingsTab())
  assert.match(h, /127\.0\.0\.1:9868/);
  assert.match(h, /面板不直接发请求/);
});

rmSync(tmp, { recursive: true, force: true })

let fail = 0
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`)
  if (!r.pass) fail += 1
}
console.log(`\nSSR 渲染测试: ${results.length - fail}/${results.length} 通过`)
process.exit(fail ? 1 : 0)
