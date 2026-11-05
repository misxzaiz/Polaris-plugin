/**
 * 文件魔数透视台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：魔数表识别（构造头部样本）/ 扩展名一致性 / 熵 / hex dump 格式 /
 * 切片边界 / 短文件防御。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/hex-core.js'

const hex = (s) => Buffer.from(s.replace(/\s+/g, ''), 'hex')

test('魔数表：≥20 条且 magic 均为合法十六进制模板（?? 通配）', () => {
  assert.ok(core.MAGIC_TABLE.length >= 20)
  for (const m of core.MAGIC_TABLE) {
    const clean = m.magic.toLowerCase().replace(/\s+/g, '')
    assert.ok(/^[0-9a-f?]+$/.test(clean), `${m.name} magic 非法: ${m.magic}`)
    assert.ok(clean.length % 2 === 0, `${m.name} magic 奇数长度`)
  }
})

test('PNG 头识别 + 扩展名一致', () => {
  const hits = core.identifyMagic(hex('89504e470d0a1a0a'))
  assert.equal(hits.length, 1)
  assert.equal(hits[0].name, 'PNG 图像')
  const c = core.extConsistency(hits, 'photo.png')
  assert.equal(c.consistent, true)
})

test('伪装扩展名：PNG 内容 + .jpg 扩展名 → 警告', () => {
  const hits = core.identifyMagic(hex('89504e470d0a1a0a'))
  const c = core.extConsistency(hits, 'photo.jpg')
  assert.equal(c.consistent, false)
  assert.ok(c.warning.includes('伪装'))
})

test('PE（MZ）与 ELF 识别', () => {
  assert.ok(core.identifyMagic(hex('4d5a9000')).some((h) => h.name.includes('PE')))
  assert.ok(core.identifyMagic(hex('7f454c460201')).some((h) => h.name.includes('ELF')))
})

test('带通配与偏移的签名：RIFF....WEBP 与 ustar@257', () => {
  const webp = hex('52494646' + '00112233' + '57454250')
  assert.ok(core.identifyMagic(webp).some((h) => h.name.includes('WebP')))
  // tar：偏移 257 处 ustar
  const buf = Buffer.alloc(600)
  buf.write('ustar', 257, 'latin1')
  assert.ok(core.identifyMagic(buf).some((h) => h.name.includes('TAR')))
})

test('短文件防御：不足签名字节不误判不炸', () => {
  assert.deepEqual(core.identifyMagic(hex('8950')), [])
  assert.deepEqual(core.identifyMagic(new Uint8Array(0)), [])
})

test('熵：常数 0 / 均匀 8 / 文本中低', () => {
  assert.equal(core.shannonEntropy(Buffer.alloc(64, 0x41)), 0)
  const uniform = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
  assert.equal(core.shannonEntropy(uniform), 8)
  const ascii = Buffer.from('the quick brown fox '.repeat(10))
  const h = core.shannonEntropy(ascii)
  assert.ok(h > 3 && h < 6, `文本熵异常: ${h}`)
})

test('hexDump：偏移列/HEX 中缝/ASCII 侧栏/不可打印点号', () => {
  const buf = Buffer.concat([hex('89504e47'), Buffer.from('ABC'), Buffer.alloc(9, 0)])
  const dump = core.hexDump(buf)
  const first = dump.split('\n')[0]
  assert.ok(first.startsWith('00000000'))
  assert.ok(first.includes('|·PNGABC'), `ASCII 侧栏异常: ${first}`)
  assert.ok(first.includes('|'))
})

test('slice：边界夹紧（超界/负偏移/零长）', () => {
  const buf = Buffer.from('abcdefgh')
  assert.equal(core.slice(buf, 2, 3).toString(), 'cde')
  assert.equal(core.slice(buf, 100, 5).length, 0)
  assert.equal(core.slice(buf, -5, 2).toString(), 'ab')
  assert.equal(core.slice(buf, 5, 999).toString(), 'fgh')
})

test('renderInspectReport：含大小/熵/识别/警告/dump', () => {
  const buf = hex('89504e470d0a1a0a')
  const r = {
    filename: 'x.png',
    size: buf.length,
    readBytes: buf.length,
    entropy: core.shannonEntropy(buf),
    hits: core.identifyMagic(buf),
    isTextLike: false,
    extWarning: null,
    headDump: core.hexDump(buf),
  }
  const report = core.renderInspectReport(r)
  assert.ok(report.includes('x.png') && report.includes('PNG 图像') && report.includes('hex dump'))
})
