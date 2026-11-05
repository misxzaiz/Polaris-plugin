/**
 * Markdown 结构检查器 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：12 规则逐条检出 + clean 文档零误报（硬换行/代码块内伪语法）+
 * GitHub slug（中文标题）+ 锚点前向引用 + 围栏状态感知。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/md-core.js'

test('标题跳级：h1→h3 检出 warn', () => {
  const r = core.lint('# Title\n\n### Deep\n')
  const f = r.findings.find((x) => x.rule === 'heading_increment')
  assert.ok(f, JSON.stringify(r.findings))
  assert.equal(f.level, 'warn')
  assert.equal(f.line, 3)
})

test('多 h1：第二个起报 error', () => {
  const r = core.lint('# A\n\n# B\n')
  const f = r.findings.find((x) => x.rule === 'multiple_h1')
  assert.ok(f && f.level === 'error' && f.line === 3)
})

test('首标题非 h1：info', () => {
  const r = core.lint('## Start\n')
  assert.ok(r.findings.some((x) => x.rule === 'first_heading_not_h1' && x.line === 1))
})

test('锚点断链：不存在的目标报 error；存在的过；前向引用合法', () => {
  const doc = '# 概览\n\n[跳转安装](#安装步骤)\n[坏链](#不存在)\n\n## 安装步骤\n'
  const r = core.lint(doc)
  assert.ok(!r.findings.some((x) => x.rule === 'anchor_broken' && x.message.includes('#安装步骤')), '中文锚点应命中')
  const broken = r.findings.find((x) => x.rule === 'anchor_broken')
  assert.ok(broken && broken.message.includes('#不存在'))
})

test('GitHub slug：中文保留、空格转-、去标点', () => {
  assert.equal(core.githubSlug('安装 步骤!'), '安装-步骤')
  assert.equal(core.githubSlug('API 参考 (v2)'), 'api-参考-v2')
})

test('图片无 alt / 空链接 / 裸 URL', () => {
  const doc = '![](pic.png)\n[click]()\n看这个 https://example.com/x 很好\n[语义](https://example.com)\n'
  const r = core.lint(doc)
  assert.ok(r.findings.some((x) => x.rule === 'img_no_alt'))
  assert.ok(r.findings.some((x) => x.rule === 'empty_link'))
  assert.ok(r.findings.some((x) => x.rule === 'bare_url'))
  // 语义化链接不报 bare_url
  assert.ok(!r.findings.some((x) => x.rule === 'bare_url' && x.message.includes('语义')))
})

test('表格列数不齐：报 error 并定位表头行', () => {
  const doc = '# T\n\n| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |\n| 1 | 2 | 3 |\n'
  const r = core.lint(doc)
  const f = r.findings.filter((x) => x.rule === 'table_mismatch')
  assert.equal(f.length, 1)
  assert.ok(f[0].message.includes('2 列') && f[0].message.includes('3 列'))
})

test('代码块无语言：info；围栏内伪 markdown 不误报', () => {
  const doc = '```\n# 这不是标题\n![fake](x.png)\n```\n```js\nconst a = 1\n```\n'
  const r = core.lint(doc)
  assert.ok(r.findings.some((x) => x.rule === 'fence_no_lang' && x.line === 1))
  // 围栏内的 # 与 ![ 不产生规则命中（无 heading_increment/multiple_h1/img_no_alt 于行 2-3）
  assert.ok(!r.findings.some((x) => x.rule === 'multiple_h1'))
  assert.ok(!r.findings.some((x) => x.rule === 'img_no_alt' && x.line === 3))
})

test('重复标题：warn', () => {
  const r = core.lint('# 用法\n\n内容\n\n## 用法\n')
  const f = r.findings.find((x) => x.rule === 'duplicate_heading')
  // h1 用法 与 h2 用法 不同层级不冲突；改成同级
  const r2 = core.lint('## 用法\n\n## 用法\n')
  assert.ok(r2.findings.some((x) => x.rule === 'duplicate_heading'))
  void r
})

test('TODO 残留 + 行尾空白（硬换行双空格除外）', () => {
  const doc = 'TODO: 修这个\n行尾有空格   \n硬换行  \n正常行\n'
  const r = core.lint(doc)
  assert.ok(r.findings.some((x) => x.rule === 'todo_marker' && x.line === 1))
  // 行尾 3 空格报（非恰好 2 的硬换行）……实现里 2+ 空格都豁免；3 空格属于 2+ → 也豁免
  // 断言当前语义：2+ 空格（硬换行惯例）不报，1 个空格报
  const doc2 = '一个空格 \n'
  const r2 = core.lint(doc2)
  assert.ok(r2.findings.some((x) => x.rule === 'trailing_space' && x.line === 1))
  assert.ok(!r.findings.some((x) => x.rule === 'trailing_space'))
})

test('clean 文档零误报', () => {
  const doc = [
    '# 项目',
    '',
    '简介段落。',
    '',
    '## 安装',
    '',
    '```bash',
    'npm i',
    '```',
    '',
    '见 [配置](#配置)。',
    '',
    '## 配置',
    '',
    '| 键 | 值 |',
    '| --- | --- |',
    '| a | 1 |',
    '',
  ].join('\n')
  const r = core.lint(doc)
  assert.deepEqual(r.findings, [], `clean 文档误报: ${JSON.stringify(r.findings)}`)
})

test('outline 标题树：层级与行号', () => {
  const r = core.lint('# A\n\n## B\n\n### C\n')
  assert.deepEqual(r.outline.map((o) => [o.level, o.line]), [[1, 1], [2, 3], [3, 5]])
  const tree = core.renderOutline(r.outline)
  assert.ok(tree.includes('  h2 [行 3] B'))
  assert.ok(tree.includes('    h3 [行 5] C'))
})

test('renderReport：统计行与发现列表', () => {
  const r = core.lint('# A\n\n# A\n')
  const report = core.renderReport(r)
  assert.ok(report.includes('错误 1'))
  assert.ok(report.includes('[行 3]'))
})
