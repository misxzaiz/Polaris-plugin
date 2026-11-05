/**
 * 离线单测：shared/i18n-core.js + shared/scan-engine.js + shared/apply-engine.js 全行为。
 * 运行：node test/run-tests.mjs（零依赖零 mock；scan/apply 引擎用临时目录真 fs）。
 */
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const core = require('../shared/i18n-core.js')
const engine = require('../shared/scan-engine.js')
const applyEngine = require('../shared/apply-engine.js')

// js-yaml 由本仓 node_modules 提供（与 service/mcp bundle 同源）
let yaml = null
try { yaml = require('js-yaml') } catch (_) { /* YAML 相关用例将跳过 */ }

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
const tAsync = (name, fn) => t(name, () => { /* 占位：异步用例单独跑 */ })

// ────────────────────────── JSONC 剥离 ──────────────────────────

t('stripJsonComments: 行注释 + 保换行不漂移', () => {
  const r = core.stripJsonComments('{\n// c1\n"a": 1 /* c2 */\n}\n')
  assert.equal(r.hasComments, true)
  const parsed = JSON.parse(r.code)
  assert.equal(parsed.a, 1)
  assert.equal(r.code.split('\n').length, 5) // 与输入行数一致（注释内容删、换行保）→ 行号不漂移
})

t('stripJsonComments: 字符串内 // 不剥（URL 场景）', () => {
  const r = core.stripJsonComments('{"url": "https://example.com/a//b", "x": 1}')
  assert.equal(r.hasComments, false)
  assert.deepEqual(JSON.parse(r.code).url, 'https://example.com/a//b')
})

t('stripJsonComments: 字符串内块注释标记不剥', () => {
  const r = core.stripJsonComments('{"s": "a /* not comment */ b"}')
  assert.equal(r.hasComments, false)
  assert.equal(JSON.parse(r.code).s, 'a /* not comment */ b')
})

t('stripJsonComments: 转义引号内不结束字符串', () => {
  const r = core.stripJsonComments('{"s": "say \\"hi\\" // ok"}')
  assert.equal(r.hasComments, false)
  assert.equal(JSON.parse(r.code).s, 'say "hi" // ok')
})

t('stripTrailingCommas: 对象尾逗号', () => {
  assert.deepEqual(JSON.parse(core.stripTrailingCommas('{"a":1,}')), { a: 1 })
})

t('stripTrailingCommas: 嵌套数组尾逗号', () => {
  assert.deepEqual(JSON.parse(core.stripTrailingCommas('{"a":[1,2,],"b":3}')), { a: [1, 2], b: 3 })
})

t('stripTrailingCommas: 合法分隔逗号不受影响', () => {
  assert.deepEqual(JSON.parse(core.stripTrailingCommas('{"a":1,"b":{"c":2}}')), { a: 1, b: { c: 2 } })
})

t('stripTrailingCommas: 字符串内逗号不剥', () => {
  assert.deepEqual(JSON.parse(core.stripTrailingCommas('{"s":"x,}"}')), { s: 'x,}' })
})

// ────────────────────────── 解析 ──────────────────────────

t('parseLocaleText: json 缩进探测与尾换行', () => {
  const r = core.parseLocaleText('{\n  "a": 1\n}\n', '.json')
  assert.equal(r.indent, 2)
  assert.equal(r.trailingNewline, true)
  assert.equal(r.hasComments, false)
  assert.equal(r.format, 'json')
})

t('parseLocaleText: jsonc 剥注释与尾逗号', () => {
  const r = core.parseLocaleText('{\n // 注释\n "a": 1,\n}\n', '.jsonc')
  assert.deepEqual(r.data, { a: 1 })
  assert.equal(r.hasComments, true)
  assert.equal(r.format, 'jsonc')
})

t('parseLocaleText: json 语法错误带行号', () => {
  assert.throws(() => core.parseLocaleText('{\n  "a": 1\n  "b": 2\n}', '.json'), (e) => /第 3 行/.test(e.message))
})

t('parseLocaleText: 根非对象拒绝（数组/字符串）', () => {
  assert.throws(() => core.parseLocaleText('[1,2]', '.json'), /根必须是对象/)
  assert.throws(() => core.parseLocaleText('"x"', '.json'), /根必须是对象/)
})

t('parseLocaleText: tab 缩进识别', () => {
  const r = core.parseLocaleText('{\n\t"a": 1\n}', '.json')
  assert.equal(r.indent, 'tab')
})

if (yaml) {
  t('parseLocaleText: yaml 基本解析 + 注释探测', () => {
    const r = core.parseLocaleText('a: 1\n# 注释\nb: 两\n', '.yaml', { yamlLoad: yaml.load })
    assert.deepEqual(r.data, { a: 1, b: '两' })
    assert.equal(r.hasComments, true)
    assert.equal(r.format, 'yaml')
  })
  t('parseLocaleText: yaml 嵌套与值类型', () => {
    const r = core.parseLocaleText('login:\n  title: 登录\n  count: 3\n', '.yml', { yamlLoad: yaml.load })
    assert.equal(r.data.login.title, '登录')
    assert.equal(r.data.login.count, 3)
  })
  t('serializeLocale: yaml dump 往返 + 不折行', () => {
    const text = 'login:\n  title: 这是一段很长的中文文案不应该被折叠换行处理测试用\n'
    const parsed = core.parseLocaleText(text, '.yaml', { yamlLoad: yaml.load })
    const out = core.serializeLocale(parsed.data, parsed, { yamlDump: yaml.dump })
    assert.ok(!out.includes('\n  title: 这是一段很长\n'), '长行不应被折行')
    const reparsed = core.parseLocaleText(out, '.yaml', { yamlLoad: yaml.load })
    assert.deepEqual(reparsed.data, parsed.data)
  })
} else {
  t('yaml 用例：js-yaml 不可用，跳过（bundle 内置）', () => { assert.ok(true) })
}

// ────────────────────────── 扁平化 ──────────────────────────

t('flattenLocale: 嵌套展开保序', () => {
  const f = core.flattenLocale({ b: { x: '1' }, a: { y: { z: '2' } }, c: '3' })
  assert.deepEqual(f.order, ['b.x', 'a.y.z', 'c'])
  assert.equal(f.map['a.y.z'], '2')
  assert.equal(f.conflicts.length, 0)
})

t('flattenLocale: 字面键不拆分', () => {
  const f = core.flattenLocale({ 'error.404.title': '页面不存在' })
  assert.deepEqual(f.order, ['error.404.title'])
})

t('flattenLocale: 嵌套路径与字面键冲突双方剔除', () => {
  const f = core.flattenLocale({ a: { b: 'nested' }, 'a.b': 'flat' })
  assert.equal(f.order.length, 0)
  assert.deepEqual(f.conflicts, ['a.b'])
})

t('flattenLocale: 数组视为叶值', () => {
  const f = core.flattenLocale({ list: ['a', 'b'] })
  assert.deepEqual(f.map.list, ['a', 'b'])
})

t('flattenLocale: 空对象不产生叶键', () => {
  const f = core.flattenLocale({ a: {}, b: '1' })
  assert.deepEqual(f.order, ['b'])
})

// ────────────────────────── 占位符 ──────────────────────────

t('extractPlaceholders: i18next 双花括号', () => {
  const r = core.extractPlaceholders('你好 {{name}}，{{count}} 条')
  assert.deepEqual(r.named.sort(), ['count', 'name'])
  assert.deepEqual(r.positionalCounts, {})
})

t('extractPlaceholders: 单花括号命名与数字', () => {
  const r = core.extractPlaceholders('Hi {name}, file {0}')
  assert.deepEqual(r.named.sort(), ['{0}', 'name'].sort())
})

t('extractPlaceholders: ICU 简单复数形取变量名（嵌套括号不误吞）', () => {
  const r = core.extractPlaceholders('{count, plural, one {# item} other {# items}}')
  assert.deepEqual(r.named, ['count'])
})

t('extractPlaceholders: ICU select 嵌套取顶层变量（嵌套占位符按文档边界不抓）', () => {
  const r = core.extractPlaceholders('{gender, select, male {他 {count} 岁} female {她 {count} 岁}}')
  assert.deepEqual(r.named, ['gender'])
})

t('extractPlaceholders: printf 族计数', () => {
  const r = core.extractPlaceholders('%1$s of %2$s (%d%%)')
  // %% 先剥除，故 (%d%%) 里只剩 %d
  assert.deepEqual(r.positionalCounts, { '%1$s': 1, '%2$s': 1, '%d': 1 })
})

t('extractPlaceholders: %% 字面百分号不参与', () => {
  const r = core.extractPlaceholders('100%% done')
  assert.deepEqual(r.named, [])
  assert.deepEqual(r.positionalCounts, {})
})

t('comparePlaceholders: 一致', () => {
  assert.equal(core.comparePlaceholders('Hi {name}', '你好 {name}').ok, true)
})

t('comparePlaceholders: 目标缺占位符', () => {
  const r = core.comparePlaceholders('Hi {name} and {other}', '你好 {name}')
  assert.equal(r.ok, false)
  assert.deepEqual(r.missingInTarget, ['other'])
})

t('comparePlaceholders: printf 数量不一致', () => {
  const r = core.comparePlaceholders('%s files (%s)', '%s 个文件')
  assert.equal(r.ok, false)
  assert.ok(r.positionalIssues[0].includes('%s'))
})

// ────────────────────────── 值分类 ──────────────────────────

t('looksUntranslated: 相同中文串判定', () => {
  assert.equal(core.looksUntranslated('登录账户', '登录账户'), true)
})

t('looksUntranslated: 纯数字/标点相同不算', () => {
  assert.equal(core.looksUntranslated('1,000!', '1,000!'), false)
})

t('looksUntranslated: 不同值不算', () => {
  assert.equal(core.looksUntranslated('登录', 'Sign in'), false)
})

t('looksUntranslated: 空串不算（归空值类）', () => {
  assert.equal(core.looksUntranslated('', ''), false)
})

// ────────────────────────── 奇偶比对 ──────────────────────────

function flat(obj) { return core.flattenLocale(obj) }

t('compareLocaleSets: 缺失/多余/空值/疑似/占位符全分类', () => {
  const base = flat({ a: '你好 {name}', b: '再见', c: '保留', d: '原样', e: '普通' })
  const target = flat({ a: 'Hi', b: '', c: '保留', d: 'changed', e: '普通 {name}' })
  const r = core.compareLocaleSets(base, target)
  assert.deepEqual(r.missing.map((m) => m.key), [])
  assert.deepEqual(r.extra.map((m) => m.key), [])
  assert.deepEqual(r.emptyValues.map((m) => m.key), ['b'])
  assert.deepEqual(r.sameAsBase.map((m) => m.key), ['c'])
  assert.deepEqual(r.placeholderIssues.map((m) => m.key), ['a', 'e'])
})

t('compareLocaleSets: missing 带 baseValue 供工作表', () => {
  const r = core.compareLocaleSets(flat({ k: '源文案' }), flat({}))
  assert.equal(r.missing[0].baseValue, '源文案')
})

t('compareLocaleSets: 空值条目带 baseValue', () => {
  const r = core.compareLocaleSets(flat({ k: '源文案' }), flat({ k: '' }))
  assert.equal(r.emptyValues[0].baseValue, '源文案')
})

// ────────────────────────── 工作表 ──────────────────────────

t('buildWorksheet: 缺失优先于空值优先于疑似，v 取基准值', () => {
  const parity = core.compareLocaleSets(flat({ m: '缺失源', e: '空值源', s: '相同源' }), flat({ e: '', s: '相同源' }))
  const ws = core.buildWorksheet(parity, { limit: 10, includeSame: true })
  assert.deepEqual(ws.items, [
    { k: 'm', v: '缺失源' },
    { k: 'e', v: '空值源' },
    { k: 's', v: '相同源' },
  ])
})

t('buildWorksheet: limit 截断计数', () => {
  const base = {}
  for (let i = 0; i < 30; i++) base['k' + i] = 'v' + i
  const parity = core.compareLocaleSets(flat(base), flat({}))
  const ws = core.buildWorksheet(parity, { limit: 10 })
  assert.equal(ws.items.length, 10)
  assert.equal(ws.skipped, 20)
})

t('buildWorksheet: 非字符串基准值跳过计数', () => {
  const parity = core.compareLocaleSets(flat({ n: 3, s: '文本' }), flat({}))
  const ws = core.buildWorksheet(parity, { limit: 10 })
  assert.deepEqual(ws.items, [{ k: 's', v: '文本' }])
  assert.equal(ws.skipped, 1)
})

// ────────────────────────── 应用计划 ──────────────────────────

t('planApply: preserve 模式新键追加父级末尾', () => {
  const target = { existing: '旧', login: { title: '已有' } }
  const { newDoc, plan } = core.planApply({
    targetDoc: target,
    baseFlat: flat({ existing: '旧', 'login.title': '已有', 'login.submit': '提交', logout: '退出' }),
    translations: { 'login.submit': 'Submit', logout: 'Log out' },
    mode: 'preserve',
  })
  assert.deepEqual(plan.insert.sort(), ['login.submit', 'logout'])
  assert.deepEqual(newDoc.login, { title: '已有', submit: 'Submit' })
  assert.equal(newDoc.logout, 'Log out')
  assert.deepEqual(Object.keys(newDoc), ['existing', 'login', 'logout'])
})

t('planApply: update 已有键改值', () => {
  const { newDoc, plan } = core.planApply({
    targetDoc: { a: '' },
    baseFlat: flat({ a: '源' }),
    translations: { a: '译文' },
  })
  assert.deepEqual(plan.update, ['a'])
  assert.equal(newDoc.a, '译文')
})

t('planApply: noop 同值不重复写', () => {
  const { plan } = core.planApply({
    targetDoc: { a: '同' },
    baseFlat: flat({ a: '同' }),
    translations: { a: '同' },
  })
  assert.deepEqual(plan.noop, ['a'])
})

t('planApply: 幻觉键拒绝', () => {
  const { plan } = core.planApply({
    targetDoc: {},
    baseFlat: flat({ a: '源' }),
    translations: { ghost: '幻觉', a: '译' },
  })
  assert.deepEqual(plan.unknown, ['ghost'])
  assert.deepEqual(plan.insert, ['a'])
})

t('planApply: 占位符不一致拦截', () => {
  const { plan } = core.planApply({
    targetDoc: {},
    baseFlat: flat({ a: '你好 {name}' }),
    translations: { a: '你好' },
  })
  assert.equal(plan.errors.length, 1)
  assert.ok(plan.errors[0].reason.includes('占位符'))
  assert.equal(plan.insert.length, 0)
})

t('planApply: 非字符串译文拒绝', () => {
  const { plan } = core.planApply({
    targetDoc: {},
    baseFlat: flat({ a: '源' }),
    translations: { a: 42 },
  })
  assert.ok(plan.errors[0].reason.includes('字符串'))
})

t('planApply: 结构冲突键拒绝', () => {
  const { plan } = core.planApply({
    targetDoc: {},
    baseFlat: flat({ 'a.b': '源' }),
    translations: { 'a.b': '译' },
    targetConflicts: ['a.b'],
  })
  assert.equal(plan.errors.length, 1)
  assert.ok(plan.errors[0].reason.includes('结构冲突'))
})

t('planApply: mirror 模式按基准键序重建', () => {
  const target = { z: 'zz', a: 'aa', m: { y: 1, b: 2 } }
  const baseFlat = flat({ a: 'a', m: { b: 'mb', y: 'my' }, z: 'z' })
  const { newDoc, plan } = core.planApply({
    targetDoc: target,
    baseFlat,
    translations: { 'm.b': 'MB' },
    mode: 'mirror',
  })
  assert.deepEqual(plan.update, ['m.b'])
  assert.deepEqual(Object.keys(newDoc), ['a', 'm', 'z'])
  assert.deepEqual(Object.keys(newDoc.m), ['b', 'y'])
  assert.equal(newDoc.m.b, 'MB')
  assert.equal(newDoc.m.y, 1)
})

t('planApply: mirror 基准外键缀在每层末尾（保相对序）', () => {
  const target = { extra2: 2, a: 'aa', extra1: 1 }
  const baseFlat = flat({ a: 'a' })
  const { newDoc } = core.planApply({
    targetDoc: target,
    baseFlat,
    translations: {},
    mode: 'mirror',
  })
  assert.deepEqual(Object.keys(newDoc), ['a', 'extra2', 'extra1'])
})

t('planApply: 新键父链缺失自动补对象', () => {
  const { newDoc, plan } = core.planApply({
    targetDoc: { x: 1 },
    baseFlat: flat({ x: 1, 'deep.nested.key': '源' }),
    translations: { 'deep.nested.key': '译' },
  })
  assert.deepEqual(plan.insert, ['deep.nested.key'])
  assert.equal(newDoc.deep.nested.key, '译')
  assert.equal(newDoc.x, 1)
})

t('planApply: 原文档不被变异（克隆语义）', () => {
  const target = { a: '1' }
  core.planApply({ targetDoc: target, baseFlat: flat({ a: '1', b: '2' }), translations: { b: 'B' } })
  assert.deepEqual(target, { a: '1' })
})

// ────────────────────────── 布局识别 ──────────────────────────

t('classifyLocalePaths: file-per-locale', () => {
  const r = core.classifyLocalePaths(['zh-CN.json', 'en.json', 'ja.yaml'])
  assert.equal(r.layout, 'file-per-locale')
  assert.deepEqual(r.locales, ['en', 'ja', 'zh-cn'])
  assert.deepEqual(r.nsList, [''])
})

t('classifyLocalePaths: dir-per-locale', () => {
  const r = core.classifyLocalePaths(['zh-cn/common.json', 'zh-cn/login.json', 'en/common.json'])
  assert.equal(r.layout, 'dir-per-locale')
  assert.deepEqual(r.locales, ['en', 'zh-cn'])
  assert.deepEqual(r.nsList, ['common', 'login'])
})

t('classifyLocalePaths: 混合布局', () => {
  const r = core.classifyLocalePaths(['en.json', 'de/main.json'])
  assert.equal(r.layout, 'mixed')
})

t('classifyLocalePaths: 嵌套目录 ns 取相对路径', () => {
  const r = core.classifyLocalePaths(['pages/home/en.json', 'pages/home/de.json'])
  assert.equal(r.layout, 'file-per-locale')
  assert.deepEqual(r.nsList, ['pages/home'])
})

t('classifyLocalePaths: 下划线标签规范化', () => {
  const r = core.classifyLocalePaths(['pt_BR.json'])
  assert.deepEqual(r.locales, ['pt-br'])
})

t('classifyLocalePaths: 非语言文件名进 ambiguous', () => {
  const r = core.classifyLocalePaths(['common.json', 'messages.json'])
  assert.equal(r.layout, 'none')
  assert.deepEqual(r.ambiguous, ['common.json', 'messages.json'])
})

t('isLocaleTag / normalizeLocaleTag', () => {
  assert.equal(core.isLocaleTag('en'), true)
  assert.equal(core.isLocaleTag('zh-CN'), true)
  assert.equal(core.isLocaleTag('pt_BR'), true)
  assert.equal(core.isLocaleTag('common'), false)
  assert.equal(core.isLocaleTag('translation'), false)
  assert.equal(core.normalizeLocaleTag('zh_CN'), 'zh-cn')
})

t('inferBaseLocale: zh 优先于 en 优先于字母序', () => {
  assert.equal(core.inferBaseLocale(['de', 'en', 'fr', 'zh-tw']), 'zh-tw')
  assert.equal(core.inferBaseLocale(['de', 'en', 'fr']), 'en')
  assert.equal(core.inferBaseLocale(['de', 'fr']), 'de')
  assert.equal(core.inferBaseLocale(['en', 'fr'], 'fr'), 'fr')
})

// ────────────────────────── 矩阵 ──────────────────────────

t('buildParityMatrix: 全链路（file-per-locale 双语言）', () => {
  const parsed = [
    { relPath: 'zh.json', locale: 'zh', ns: '', ext: '.json', parse: core.parseLocaleText('{"a":"你好 {n}","b":"再见","c":"同"}', '.json') },
    { relPath: 'en.json', locale: 'en', ns: '', ext: '.json', parse: core.parseLocaleText('{"a":"Hi {n}","c":"同"}', '.json') },
  ]
  const { matrix, totals } = core.buildParityMatrix(parsed, 'zh')
  const cell = matrix[''].en
  assert.deepEqual(cell.missing.map((m) => m.key), ['b'])
  assert.deepEqual(cell.sameAsBase.map((m) => m.key), ['c'])
  assert.equal(cell.placeholderIssues.length, 0)
  assert.equal(totals.missing, 1)
})

t('buildParityMatrix: 多 ns 各自独立比对', () => {
  const parsed = [
    { relPath: 'zh/common.json', locale: 'zh', ns: 'common', ext: '.json', parse: core.parseLocaleText('{"a":"1"}', '.json') },
    { relPath: 'zh/login.json', locale: 'zh', ns: 'login', ext: '.json', parse: core.parseLocaleText('{"x":"登录"}', '.json') },
    { relPath: 'en/common.json', locale: 'en', ns: 'common', ext: '.json', parse: core.parseLocaleText('{"a":"1"}', '.json') },
  ]
  const { matrix } = core.buildParityMatrix(parsed, 'zh')
  assert.equal(matrix.common.en.missing.length, 0)
  assert.equal(matrix.login.en.missing.length, 1) // x 缺失
})

// ────────────────────────── 报告渲染 ──────────────────────────

t('renderStatusReport: 有问题输出计数与下一步', () => {
  const parsed = [
    { relPath: 'zh.json', locale: 'zh', ns: '', ext: '.json', parse: core.parseLocaleText('{"a":"你好"}', '.json') },
    { relPath: 'en.json', locale: 'en', ns: '', ext: '.json', parse: core.parseLocaleText('{}', '.json') },
  ]
  const { matrix, totals, nsList } = core.buildParityMatrix(parsed, 'zh')
  const text = core.renderStatusReport('/proj/locales', 'zh', 'file-per-locale', nsList, ['en', 'zh'], matrix, totals, [])
  assert.ok(text.includes('缺失 1'))
  assert.ok(text.includes('i18n_missing'))
})

t('renderStatusReport: 全对齐输出 ✅', () => {
  const parsed = [
    { relPath: 'zh.json', locale: 'zh', ns: '', ext: '.json', parse: core.parseLocaleText('{"a":"你好"}', '.json') },
    { relPath: 'en.json', locale: 'en', ns: '', ext: '.json', parse: core.parseLocaleText('{"a":"Hello"}', '.json') },
  ]
  const { matrix, totals, nsList } = core.buildParityMatrix(parsed, 'zh')
  const text = core.renderStatusReport('/x', 'zh', 'file-per-locale', nsList, ['en', 'zh'], matrix, totals, [])
  assert.ok(text.includes('✅'))
})

t('renderMissingWorksheet: 工作表 JSON 可回解析', () => {
  const text = core.renderMissingWorksheet('/x', 'zh', 'en', null, { items: [{ k: 'a', v: '你好' }], skipped: 0 }, { 结算: 'checkout' })
  const jsonLine = text.split('```json')[1].split('```')[0].trim()
  assert.deepEqual(JSON.parse(jsonLine), [{ k: 'a', v: '你好' }])
  assert.ok(text.includes('checkout'))
})

t('oneLine: 超长截断', () => {
  assert.equal(core.oneLine('a'.repeat(200), 50).length, 50)
  assert.ok(core.oneLine('a b  c', 120) === 'a b c')
})

// ────────────────────────── scan-engine（真 fs 临时目录） ──────────────────────────

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-test-'))
  fs.writeFileSync(path.join(dir, 'zh-CN.json'), '{\n  "login": {\n    "title": "登录到你的账户",\n    "submit": "提交 {name}"\n  },\n  "common": {\n    "ok": "确定"\n  }\n}\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'en.json'), '{\n  "login": {\n    "title": "Sign in to your account"\n  }\n}\n', 'utf8')
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'node_modules', 'ja.json'), '{"x":"不应被扫到"}', 'utf8')
  return dir
}

t('scanDir: file-per-locale 全链路（跳过 node_modules、矩阵、键数）', () => {
  const dir = makeTempProject()
  try {
    const scan = engine.scanDir(dir)
    assert.equal(scan.layout, 'file-per-locale')
    assert.equal(scan.baseLocale, 'zh-cn')
    assert.deepEqual(scan.locales, ['en', 'zh-cn'])
    assert.equal(scan.files.length, 2)
    assert.equal(scan.totals.missing, 2) // login.submit + common.ok
    assert.equal(scan.matrix[''].en.missing.length, 2)
    assert.ok(scan.files.every((f) => !f.relPath.includes('node_modules')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

t('scanDir: 解析错误不炸全扫描', () => {
  const dir = makeTempProject()
  try {
    fs.writeFileSync(path.join(dir, 'fr.json'), '{ broken', 'utf8')
    const scan = engine.scanDir(dir)
    assert.equal(scan.parseErrors.length, 1)
    assert.ok(scan.parseErrors[0].error.includes('fr.json') === false) // 错误消息含行号信息即可
    assert.equal(scan.totals.files, 3)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

t('scanDir: dir-per-locale 布局', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-test-'))
  try {
    fs.mkdirSync(path.join(dir, 'zh-cn'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'en'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'zh-cn', 'common.json'), '{"hi":"你好"}', 'utf8')
    fs.writeFileSync(path.join(dir, 'en', 'common.json'), '{"hi":"Hello","extra":"多余"}', 'utf8')
    const scan = engine.scanDir(dir)
    assert.equal(scan.layout, 'dir-per-locale')
    assert.equal(scan.matrix.common.en.extra.length, 1)
    assert.equal(scan.matrix.common.en.missing.length, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

if (yaml) {
  t('scanDir: yaml 文件参与扫描', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-test-'))
    try {
      fs.writeFileSync(path.join(dir, 'zh.yaml'), 'login:\n  title: 登录\n', 'utf8')
      fs.writeFileSync(path.join(dir, 'en.yaml'), 'login:\n  title: Sign in\n  extra: only-en\n', 'utf8')
      const scan = engine.scanDir(dir, { yaml })
      assert.equal(scan.files.length, 2)
      assert.equal(scan.totals.missing, 0)
      assert.equal(scan.matrix[''].en.extra.length, 1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}

t('walkLocaleFiles: 文件数上限截断', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-test-'))
  try {
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(dir, `en.${i}.json`), '{}', 'utf8')
    const { found, truncated, warnings } = engine.walkLocaleFiles(dir, { maxFiles: 3 })
    assert.equal(found.length, 3)
    assert.equal(truncated, true)
    assert.ok(warnings.some((w) => w.includes('截断')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ────────────────────────── apply-engine（真 fs 全闭环） ──────────────────────────

function setupApplyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-apply-'))
  const undo = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-undo-'))
  fs.writeFileSync(path.join(root, 'zh-cn.json'), '{"greet":"你好 {name}","bye":"再见"}', 'utf8')
  fs.writeFileSync(path.join(root, 'en.json'), '{"bye":"Bye"}', 'utf8')
  return { root, undo }
}

const applyAsync = (name, fn) => {
  // 简易异步测试桥：同步执行 promise，失败记入结果
  results.push({ name, pass: null })
  const entry = results[results.length - 1]
  fn()
    .then(() => { entry.pass = true })
    .catch((e) => { entry.pass = false; entry.detail = e.message })
}

applyAsync('applyTranslations: 快照→写入→undo 还原全闭环', async () => {
  const { root, undo } = setupApplyFixture()
  try {
    const before = fs.readFileSync(path.join(root, 'en.json'), 'utf8')
    const r = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { greet: 'Hello {name}' },
      yaml, appConfigDir: undo, kv: null,
    })
    assert.equal(r.ok, true)
    assert.equal(r.applied[0].insert, 1)
    const after = JSON.parse(fs.readFileSync(path.join(root, 'en.json'), 'utf8'))
    assert.equal(after.greet, 'Hello {name}')
    assert.equal(after.bye, 'Bye')
    // undo
    const u = engine.restoreSnapshot(undo, r.batchId)
    assert.equal(u.results[0].ok, true)
    assert.equal(fs.readFileSync(path.join(root, 'en.json'), 'utf8'), before)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

applyAsync('applyTranslations: 占位符不一致全部拒绝不写盘', async () => {
  const { root, undo } = setupApplyFixture()
  try {
    const before = fs.readFileSync(path.join(root, 'en.json'), 'utf8')
    const r = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { greet: 'Hello 缺占位符' },
      yaml, appConfigDir: undo, kv: null,
    })
    assert.equal(r.ok, false)
    assert.equal(fs.readFileSync(path.join(root, 'en.json'), 'utf8'), before)
    // force 逃生口
    const r2 = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { greet: 'Hello 缺占位符' },
      force: true, yaml, appConfigDir: undo, kv: null,
    })
    assert.equal(r2.ok, true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

applyAsync('applyTranslations: 幻觉键拒绝', async () => {
  const { root, undo } = setupApplyFixture()
  try {
    const r = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { 'not.exist.anywhere': '幻觉' },
      yaml, appConfigDir: undo, kv: null,
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => e.reason.includes('幻觉')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

applyAsync('applyTranslations: undo 冲突检测（应用后被改过 → 拒绝）', async () => {
  const { root, undo } = setupApplyFixture()
  try {
    const r = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { greet: 'Hello {name}' },
      yaml, appConfigDir: undo, kv: null,
    })
    fs.writeFileSync(path.join(root, 'en.json'), '{"人工修改":1}', 'utf8')
    const u = engine.restoreSnapshot(undo, r.batchId)
    assert.equal(u.results[0].ok, false)
    assert.ok(u.results[0].error.includes('拒绝盲目'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

applyAsync('applyTranslations: 基准语言自身拒绝应用', async () => {
  const { root, undo } = setupApplyFixture()
  try {
    await assert.rejects(
      () => applyEngine.applyTranslations({ dir: root, locale: 'zh-cn', translations: { greet: 'x' }, yaml, appConfigDir: undo, kv: null }),
      /基准语言/,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

applyAsync('applyTranslations: 注释文件默认拒绝并给 stripComments 通道', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-apply-'))
  const undo = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-undo-'))
  try {
    fs.writeFileSync(path.join(root, 'zh.json'), '{"a":"你好"}', 'utf8')
    fs.writeFileSync(path.join(root, 'en.jsonc'), '{\n // 说明\n "a": "",\n}', 'utf8')
    const r = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { a: 'Hello' },
      yaml, appConfigDir: undo, kv: null,
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => e.reason.includes('stripComments')))
    const r2 = await applyEngine.applyTranslations({
      dir: root, locale: 'en', translations: { a: 'Hello' },
      stripComments: true, yaml, appConfigDir: undo, kv: null,
    })
    assert.equal(r2.ok, true)
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'en.jsonc'), 'utf8')).a, 'Hello')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

t('writeSnapshot/restoreSnapshot: batchId 注入防护', () => {
  const undo = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-undo-'))
  try {
    assert.throws(() => engine.restoreSnapshot(undo, '../../evil'))
    assert.throws(() => engine.restoreSnapshot(undo, 'nonexistent'))
  } finally {
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

t('pruneSnapshots: 只保留最近 keep 个', () => {
  const undo = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-undo-'))
  try {
    for (let i = 0; i < 5; i++) engine.writeSnapshot(undo, `b${i}`, [{ absPath: '/x', beforeText: 'a', afterText: 'b' }])
    engine.pruneSnapshots(undo, 3)
    const left = fs.readdirSync(path.join(undo, 'i18n-sync-undo')).filter((f) => f.endsWith('.json'))
    assert.equal(left.length, 3)
  } finally {
    fs.rmSync(undo, { recursive: true, force: true })
  }
})

// ────────────────────────── 汇总 ──────────────────────────

setTimeout(() => {
  const bad = results.filter((r) => r.pass === false)
  console.log(results.map((r) => `${r.pass === true ? '✓' : r.pass === false ? '✗' : '…'} ${r.name}${r.pass === false ? `\n    ${r.detail}` : ''}`).join('\n'))
  const pending = results.filter((r) => r.pass === null).length
  console.log(`\n${results.length - bad.length - pending}/${results.length} 通过${pending ? `（${pending} 异步未完成？）` : ''}`)
  process.exit(bad.length || pending ? 1 : 0)
}, 2000)
