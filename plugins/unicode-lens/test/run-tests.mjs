/**
 * unicode-lens core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：隐形注入载体五族（零宽/双向控制/Tag/填充/变体）、
 * 同形字四源（西里尔/希腊/全角/数学变体）、混排、NFC、控制字符、
 * emoji ZWJ 豁免、清洗策略、报告渲染（诚实断言：无 undefined/NaN 泄漏）。
 * fixture 全部用 \uXXXX / String.fromCodePoint 构造，源码保持 ASCII 安全。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/unicode-core.js'

const CP = (n) => String.fromCodePoint(n)

test('scanText: 干净中文/英文零误报', () => {
  const s = core.scanText('你好世界，普通文本 Hello World 123\n第二行正常内容')
  assert.equal(s.verdict, 'clean')
  assert.equal(s.findings.length, 0)
  assert.deepEqual(s.counts, {})
})

test('scanText: 零宽字符族（ZWSP/ZWNJ/WJ/BOM）→ 中危', () => {
  const s = core.scanText(`a\u200Bb\u200Cc${CP(0x2060)}d\uFEFFe`)
  assert.equal(s.counts.zerowidth, 4)
  assert.equal(s.verdict, 'medium')
  assert.equal(s.riskCounts.medium, 4)
})

test('scanText: 双向控制（RLO/LRI）→ 高危 + 报告点名 Trojan Source', () => {
  const s = core.scanText(`accessLevel != "admin${CP(0x202E)} ${CP(0x2066)}) {${CP(0x2069)}`)
  assert.equal(s.counts.bidi, 3)
  assert.equal(s.verdict, 'high')
  const report = core.renderReport(s)
  assert.ok(report.includes('Trojan Source'), report.slice(0, 300))
})

test('scanText: Unicode Tag 隐形标签 → 高危 + 隐藏内容解码', () => {
  const s = core.scanText(`hi${CP(0xE0041)}${CP(0xE0042)}${CP(0xE0043)}!`)
  assert.equal(s.counts.tag, 3)
  assert.equal(s.verdict, 'high')
  assert.deepEqual(s.hiddenMessages, ['ABC'])
  assert.ok(core.renderReport(s).includes('隐藏内容解码: "ABC"'))
})

test('scanText: 不可见填充（韩文填充符/盲文空白）→ 高危', () => {
  const s = core.scanText(`${CP(0x3164)}admin${CP(0x2800)}root`)
  assert.equal(s.counts.filler, 2)
  assert.equal(s.verdict, 'high')
})

test('scanText: NBSP → 低提示，清洗替换为普通空格', () => {
  const s = core.scanText('a\u00A0b')
  assert.equal(s.counts.space, 1)
  assert.equal(s.verdict, 'low')
  const r = core.scrubText('a\u00A0b')
  assert.equal(r.cleaned, 'a b')
})

test('scanText: emoji 序列 ZWJ 豁免为低提示且清洗保留', () => {
  const family = `👨${CP(0x200D)}👩${CP(0x200D)}👧`
  const s = core.scanText(`family: ${family} ok`)
  assert.equal(s.counts.zwj, 2)
  assert.equal(s.verdict, 'low')
  const r = core.scrubText(`family: ${family} ok`)
  assert.equal(r.cleaned, `family: ${family} ok`) // emoji ZWJ 保留
})

test('scanText: 孤立 ZWJ（非 emoji 上下文）→ 中危且清洗删除', () => {
  const s = core.scanText(`a${CP(0x200D)}b`)
  assert.equal(s.counts.zwj, 1)
  assert.equal(s.verdict, 'medium')
  const r = core.scrubText(`a${CP(0x200D)}b`)
  assert.equal(r.cleaned, 'ab')
  assert.equal(r.deleted.zwj, 1)
})

test('scanText: 西里尔同形字（pаypal）→ 中危 + 建议映射', () => {
  const s = core.scanText(`p${CP(0x0430)}ypal`)
  assert.equal(s.counts.homoglyph, 1)
  assert.equal(s.verdict, 'medium')
  const f = s.findings[0]
  assert.equal(f.suggest, 'a')
  // 默认清洗只删隐形不改语义
  assert.equal(core.scrubText(`p${CP(0x0430)}ypal`).cleaned, `p${CP(0x0430)}ypal`)
  // fixHomoglyph 映射回 ASCII
  const r = core.scrubText(`p${CP(0x0430)}ypal`, { fixHomoglyph: true })
  assert.equal(r.cleaned, 'paypal')
  assert.equal(r.homoglyphFixed, 1)
})

test('scanText: 混合文字系统（拉丁×西里尔同段混排）→ 中危', () => {
  // привет 中 р/е 是同形字（归 homoglyph），и/в/т 归混排统计
  const s = core.scanText('pay привет')
  assert.equal(s.counts.mixed_script, 1)
  assert.equal(s.counts.homoglyph, 2)
  assert.equal(s.verdict, 'medium')
})

test('scanText: 全角字母/数字 → 同形字；全角标点（中文合法）不报', () => {
  const s = core.scanText('ＡＢＣ１２３')
  assert.equal(s.counts.homoglyph, 6)
  assert.equal(s.verdict, 'medium')
  const punct = core.scanText('中文：标点！全角？合法。')
  assert.equal(punct.findings.length, 0)
  assert.equal(punct.verdict, 'clean')
})

test('scanText: 数学字母变体（Word/公式复制）→ 同形字 + NFKC 建议', () => {
  const s = core.scanText(CP(0x1D400)) // 𝐀 MATHEMATICAL BOLD CAPITAL A
  assert.equal(s.counts.homoglyph, 1)
  assert.equal(s.findings[0].sub, 'math')
  assert.equal(s.findings[0].suggest, 'A')
})

test('scanText: NFC 未归一化（e + 组合锐音符）→ 低提示，nfcNormalize 归一', () => {
  const s = core.scanText('e\u0301xample')
  assert.equal(s.counts.nonnormal, 1)
  assert.equal(s.verdict, 'low')
  const r = core.scrubText('e\u0301xample', { nfcNormalize: true })
  assert.equal(r.cleaned, 'éxample') // e + U+0301 合并为 é，其余不变
  assert.equal(r.normalized, true)
})

test('scanText: 控制字符 → 中危；Tab/换行/回车豁免', () => {
  const s = core.scanText('a\u0001b\u007Fc')
  assert.equal(s.counts.control, 2)
  assert.equal(s.verdict, 'medium')
  const okCtl = core.scanText('a\tb\nc\rd')
  assert.equal(okCtl.findings.length, 0)
})

test('scanText: U+FFFD → 编码损坏中危提示', () => {
  const s = core.scanText('中文\uFFFD乱码')
  assert.equal(s.counts.replacement, 1)
  assert.equal(s.verdict, 'medium')
})

test('scanText: 私有使用区 → 低提示；dropPua 删除 / 默认保留', () => {
  const s = core.scanText(`a${CP(0xE000)}b`)
  assert.equal(s.counts.pua, 1)
  assert.equal(s.verdict, 'low')
  assert.equal(core.scrubText(`a${CP(0xE000)}b`).cleaned, `a${CP(0xE000)}b`)
  assert.equal(core.scrubText(`a${CP(0xE000)}b`, { dropPua: true }).cleaned, 'ab')
})

test('scanText: 全角空格默认保留（中文排版合法），关选项才替换', () => {
  const s = core.scanText('中文\u3000空格')
  assert.equal(s.counts.space, 1)
  assert.equal(s.verdict, 'low')
  assert.equal(core.scrubText('中文\u3000空格').cleaned, '中文\u3000空格')
  assert.equal(core.scrubText('中文\u3000空格', { keepIdeographicSpace: false }).cleaned, '中文 空格')
})

test('scanText: 综合攻击夹具聚合为高危 + 计数精确', () => {
  const atk = `pay\u200Bpal${CP(0x202E)}admin${CP(0xE0041)}${CP(0xE0042)}${CP(0x0440)}aypal\u00A0end`
  const s = core.scanText(atk)
  assert.equal(s.verdict, 'high')
  assert.equal(s.counts.zerowidth, 1)
  assert.equal(s.counts.bidi, 1)
  assert.equal(s.counts.tag, 2)
  assert.equal(s.counts.homoglyph, 1)
  assert.equal(s.counts.space, 1)
  // 清洗：删 4 项隐形 + NBSP 替换 + 同形字映射
  const r = core.scrubText(atk, { fixHomoglyph: true })
  assert.equal(r.cleaned, 'paypaladminpaypal end')
})

test('scanText: 行列定位正确（第二行的字符行号=2）', () => {
  const s = core.scanText('line1\n\u200Bline2')
  assert.equal(s.findings[0].line, 2)
  assert.equal(s.findings[0].col, 1)
})

test('scanText: 超长文本拒绝（2M 上限护栏）', () => {
  assert.throws(() => core.scanText('x'.repeat(core.MAX_CHARS + 1)), /过长/)
})

test('scanText: 明细截断护栏（对抗性输入）', () => {
  const s = core.scanText('\u200B'.repeat(6000))
  assert.equal(s.counts.zerowidth, 6000) // 计数全量
  assert.equal(s.truncated, true)
  assert.ok(s.findings.length <= core.MAX_FINDINGS)
})

test('buildContext: 不可见字符渲染为 {U+XXXX}', () => {
  const ctx = core.buildContext('ab\u200Bcd', 0, 5)
  assert.ok(ctx.includes('{U+200B}'))
})

test('renderReport: 含判定/统计/建议，且无 undefined/NaN 泄漏', () => {
  const atk = `pay\u200Bpal${CP(0x202E)}admin${CP(0xE0041)}${CP(0xE0042)}${CP(0x0440)}aypal\u00A0end`
  const report = core.renderReport(core.scanText(atk))
  assert.ok(report.includes('判定'))
  assert.ok(report.includes('高危'))
  assert.ok(report.includes('双向控制字符'))
  assert.ok(report.includes('建议'))
  assert.ok(!report.includes('undefined'), '报告不得泄漏 undefined')
  assert.ok(!report.includes('NaN'), '报告不得泄漏 NaN')
})

test('renderConfusablesReport: 同形混淆专项输出', () => {
  const report = core.renderConfusablesReport(core.scanText(`p${CP(0x0430)}ypal vs paypal`))
  assert.ok(report.includes('同形'))
  assert.ok(report.includes('建议替换为 "a"'))
})

test('charInfo: 逐字符解释（正常字符 + 零宽 + 同形字）', () => {
  const info = core.charInfo(`a\u200B${CP(0x0440)}`)
  assert.equal(info.items.length, 3)
  assert.equal(info.items[0].cat, 'ok')
  assert.equal(info.items[1].cat, 'zerowidth')
  assert.ok(info.items[1].desc.includes('零宽'))
  assert.equal(info.items[2].cat, 'homoglyph')
  assert.equal(info.items[2].suggest, 'p')
})

test('charInfo: 超过 32 个截断计数', () => {
  const info = core.charInfo('x'.repeat(40))
  assert.equal(info.items.length, 32)
  assert.equal(info.total, 40)
  assert.equal(info.truncated, true)
})

test('truncate: 截尾带省略号', () => {
  assert.equal(core.truncate('abc', 10), 'abc')
  assert.equal(core.truncate('x'.repeat(70), 60).length, 61)
})
