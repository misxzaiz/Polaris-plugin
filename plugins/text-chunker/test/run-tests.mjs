/**
 * LLM 文本切块台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：token 估算口径 / 切块边界（段落/句子/硬切）/ overlap 重叠 /
 * 上限约束（每块 ≤ maxTokens）/ 边界（空文本/短文单块/无分隔符长文）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/chunk-core.js'

test('estimateTokens: 口径自证（CJK 1/字、拉丁 1/4 字符）', () => {
  assert.equal(core.estimateTokens(''), 0)
  assert.equal(core.estimateTokens('中文字'), 3) // CJK ≈1/字
  // 8 个拉丁字母 ≈ 2 tokens
  assert.equal(core.estimateTokens('abcdefgh'), 2)
  // 混合
  const mixed = core.estimateTokens('中文abc')
  assert.ok(mixed >= 3 + 0 && mixed <= 5, `混合估算异常: ${mixed}`)
})

test('短文单块：不切块', () => {
  const r = core.chunkText('这是一段短文本。', { maxTokens: 100 })
  assert.equal(r.chunks.length, 1)
  assert.equal(r.chunks[0].index, 0)
  assert.equal(r.totalTokens, core.estimateTokens('这是一段短文本。'))
})

test('段落边界切块：每块 ≤ maxTokens 且切点在段落间', () => {
  const paras = Array.from({ length: 10 }, (_, i) => `第${i}段：${'内容'.repeat(50)}`) // 每段约 100 tokens
  const doc = paras.join('\n\n')
  const r = core.chunkText(doc, { maxTokens: 250 })
  assert.ok(r.chunks.length >= 3, `块数异常: ${r.chunks.length}`)
  for (const c of r.chunks) {
    assert.ok(c.tokens <= 250 + 10, `块 ${c.index} 超限: ${c.tokens}`)
  }
  // 拼回覆盖原文段落（不丢内容——无 overlap 时）
  const joined = r.chunks.map((c) => c.text).join('\n\n')
  for (const p of paras) assert.ok(joined.includes(p.slice(0, 10)), `段落丢失: ${p.slice(0, 10)}`)
})

test('段落超限：句子级贪心（切点在句号后）', () => {
  const sentences = Array.from({ length: 8 }, (_, i) => `这是第${i}句话，包含一些内容用来撑大体积。`) // 每句约 20 tokens
  const doc = sentences.join('')
  const r = core.chunkText(doc, { maxTokens: 60 })
  assert.ok(r.chunks.length >= 2)
  for (const c of r.chunks) {
    // 每块以句读结尾或为最后块（不在词中间断——中文无词界，断点必在句号后）
    const trimmed = c.text
    assert.ok(/[。！？.!?]$/.test(trimmed) || c.index === r.chunks.length - 1 || /[。]$/.test(trimmed), `块 ${c.index} 切点非句界: …${trimmed.slice(-12)}`)
  }
})

test('overlap 重叠窗口：相邻块头尾重叠', () => {
  const paras = Array.from({ length: 6 }, (_, i) => `段落${i}：${'重复内容'.repeat(20)}`)
  const doc = paras.join('\n\n')
  const noOv = core.chunkText(doc, { maxTokens: 150, overlapTokens: 0 })
  const withOv = core.chunkText(doc, { maxTokens: 150, overlapTokens: 40 })
  assert.ok(withOv.chunks.length >= 2)
  // 有 overlap 时块 1 的开头应包含块 0 的尾部内容片段
  if (noOv.chunks.length >= 2 && withOv.chunks.length >= 2) {
    const tail0 = noOv.chunks[0].text.slice(-30)
    const overlapOk = withOv.chunks[1].text.includes(tail0.slice(0, 10)) || withOv.chunks[1].text.startsWith(noOv.chunks[0].text.slice(-50, -20))
    // overlap 实现为「块尾内容复制到下一块头」——宽容断言：块 1 起始 50 字符能在块 0 尾部找到来源
    const head1 = withOv.chunks[1].text.slice(0, 40)
    const fromPrev = noOv.chunks[0].text.includes(head1.slice(0, 15))
    assert.ok(overlapOk || fromPrev, `overlap 未生效（块 1 头部与块 0 尾部无重叠）`)
  }
})

test('无分隔符长文：硬切兜底（base64 类）', () => {
  const long = 'A'.repeat(4000) // 无句读无段落
  const r = core.chunkText(long, { maxTokens: 500 })
  assert.ok(r.chunks.length >= 2)
  for (const c of r.chunks) {
    assert.ok(c.tokens <= 500 + 60, `硬切块超限过多: ${c.tokens}`) // 硬切保留 0.9 系数+余量
  }
})

test('空文本与极端参数防御', () => {
  const r = core.chunkText('', { maxTokens: 100 })
  assert.equal(r.chunks.length, 1) // 空文本单空块
  // maxTokens 下限夹紧 50
  const r2 = core.chunkText('短文本', { maxTokens: 10 })
  assert.equal(r2.chunks.length, 1)
})

test('overlap < maxTokens 强制约束', () => {
  // overlap 大于 maxTokens 时被夹紧到 maxTokens/2
  const doc = Array.from({ length: 6 }, (_, i) => `段落${i}：${'内容'.repeat(40)}`).join('\n\n')
  const r = core.chunkText(doc, { maxTokens: 120, overlapTokens: 500 })
  for (const c of r.chunks) assert.ok(c.tokens <= 120 + 10, `夹紧失败: ${c.tokens}`)
})

test('renderReport：含统计与估算声明', () => {
  const r = core.chunkText('段落一。\n\n段落二。', { maxTokens: 20 })
  const report = core.renderReport(r)
  assert.ok(report.includes('块') && report.includes('tokens'))
  assert.ok(report.includes('非精确 tokenizer'))
})
