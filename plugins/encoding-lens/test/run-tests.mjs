/**
 * encoding-lens core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：编码识别（UTF-8/GBK/Big5/SJIS/EUC-KR/UTF-16/ASCII/西文/BOM
 * 十二语种矩阵）、mojibake 修复六链（fixed/uncertain/clean 语义 + 四条终验不变式）、
 * 乱码指纹、转换 round-trip、hex/base64 工具。
 *
 * fixture 构造纪律：乱码样本一律由「TextDecoder 误读操作」生成（平台 API 真值），
 * 不手推字形；另配少量人工已知锚点（如 â€œ → " ）作为外部真值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/encoding-core.js'

const td = (cs) => new TextDecoder(cs)
const ZH = '编码识别是开发者的日常痛点，Windows 中文环境下文件打开全是乱码，需要诊断哪一层错了。'
const ZH_SHORT = '中文测试，数据文件'

function gbkBytes(s) {
  const r = core.encodeText(s, 'gbk')
  assert.equal(r.unsupported.length, 0, `GBK 编码应全覆盖：${r.unsupported.join('')}`)
  return r.bytes
}

test('hex/base64 工具 round-trip', () => {
  const bytes = core.U8('中文abc123')
  const hex = core.bytesToHex(bytes)
  assert.ok(hex.match(/^[0-9a-f]{2}( [0-9a-f]{2})*$/), 'hex 格式')
  assert.deepEqual(core.hexToBytes(hex), bytes)
  assert.deepEqual(core.hexToBytes(core.bytesToHex(bytes, '')), bytes)
  assert.deepEqual(core.hexToBytes('0xE4, 0xB8 0xAD'), core.U8('中'))
  const b64 = core.base64Encode(bytes)
  assert.deepEqual(core.base64Decode(b64), bytes)
  assert.equal(core.hexToBytes('abc'), null, '奇数长度 hex 拒绝')
  assert.equal(core.hexToBytes('zz'), null, '非 hex 字符拒绝')
  assert.equal(core.base64Decode('!!!!'), null, 'base64 非法字符拒绝')
})

test('encodeText: GBK 反推表零缺字 + bytesToText 还原', () => {
  const sample = '编码识别常用三千五百汉字全覆盖测试，包括「引号」与——破折号、①②③符号。'
  const enc = core.encodeText(sample, 'gbk')
  assert.equal(enc.unsupported.length, 0)
  const dec = core.strictDecode(enc.bytes, 'gbk')
  assert.ok(dec.ok, dec.error)
  assert.equal(dec.text, sample, 'GBK round-trip 还原原文')
})

test('encodeText: latin1 超域字符如实报告不静默替换', () => {
  const r = core.encodeText('中文', 'latin1')
  assert.deepEqual(r.unsupported, ['中', '文'])
  assert.equal(r.bytes.length, 2) // 全部替换为 0x3f
})

test('detectEncoding: 十二语种矩阵', () => {
  const det = (bytes) => core.detectEncoding(bytes)
  assert.equal(det(core.U8('Hello World, plain ASCII text only.')).best.charset, 'utf-8')
  assert.equal(det(core.U8(ZH)).best.charset, 'utf-8')
  assert.equal(det(gbkBytes(ZH)).best.charset, 'gbk')
  assert.equal(det(core.encodeText('編碼識別是開發者的日常痛點，需要診斷哪一層錯了。', 'big5').bytes).best.charset, 'big5')
  assert.equal(det(core.encodeText('文字コードの判定は開発者の日常的な悩みです。', 'shift_jis').bytes).best.charset, 'shift_jis')
  assert.equal(det(core.encodeText('인코딩 판별은 개발자의 일상적인 고민입니다 잘 해결되길 바랍니다.', 'euc-kr').bytes).best.charset, 'euc-kr')
  assert.equal(det(core.U8('Café naïve résumé – déjà vu')).best.charset, 'utf-8', '真西文不被 latin1 抢走')
  // UTF-16LE（含 ASCII 段 → 零字节奇偶聚集）
  const t = '中文UTF16测试内容'
  const u16 = new Uint8Array(t.length * 2)
  for (let i = 0; i < t.length; i++) { u16[i * 2] = t.charCodeAt(i) & 0xff; u16[i * 2 + 1] = t.charCodeAt(i) >> 8 }
  assert.equal(det(u16).best.charset, 'utf-16le')
  // BOM 确定性
  const bomRes = det(new Uint8Array([0xef, 0xbb, 0xbf, ...core.U8('中文内容')]))
  assert.equal(bomRes.best.charset, 'utf-8')
  assert.equal(bomRes.bom, 'utf-8')
  assert.equal(bomRes.best.confidence, '确定')
  // 无 BOM 纯 CJK UTF-16 是已知漏判边界（零字节稀疏）——如实断言现状并保证不误报 utf-16
  const pure = '中文测试数据文件编码识别诊断'
  const pu = new Uint8Array(pure.length * 2)
  for (let i = 0; i < pure.length; i++) { pu[i * 2] = pure.charCodeAt(i) & 0xff; pu[i * 2 + 1] = pure.charCodeAt(i) >> 8 }
  assert.notEqual(det(pu).best.charset, 'utf-16le')
})

test('detectEncoding: 输出结构契约（无 undefined/NaN 泄漏）', () => {
  const d = core.detectEncoding(gbkBytes(ZH))
  assert.equal(d.size, gbkBytes(ZH).length)
  for (const c of d.candidates) {
    assert.equal(typeof c.score, 'number')
    assert.ok(Number.isFinite(c.score))
    assert.equal(typeof c.label, 'string')
    assert.ok(!c.label.includes('undefined'))
  }
  assert.ok(['确定', '高', '中', '低'].includes(d.best.confidence))
})

test('analyzeText: 干净文本 clean 零误报', () => {
  const fp = core.analyzeText('你好世界，普通文本 Hello World 123\n第二行正常内容')
  assert.equal(fp.verdict, 'clean')
  assert.equal(fp.findings.length, 0)
})

test('analyzeText: latin1 误读产物命中指纹 + mojibake 判定', () => {
  const fp = core.analyzeText(td('latin1').decode(core.U8(ZH_SHORT)))
  assert.equal(fp.verdict, 'mojibake')
  assert.ok(fp.findings.some((f) => f.fix.startsWith('可自动修复')))
})

test('analyzeText: 锟斤拷 → damaged（不可逆如实报告）', () => {
  const fp = core.analyzeText('数据被锟斤拷破坏了')
  assert.ok(fp.findings.some((f) => f.name === '锟斤拷'))
  assert.ok(fp.findings[0].cause.includes('U+FFFD'))
})

test('analyzeText: 烫烫烫 → 非编码问题建议查源码', () => {
  const fp = core.analyzeText('输出：烫烫烫烫烫')
  const f = fp.findings.find((x) => x.name === '烫烫烫')
  assert.ok(f, '应命中烫烫烫')
  assert.ok(f.fix.includes('未初始化内存'))
})

test('fixMojibake: GBK 偶数字节流完整还原', () => {
  const garbled = td('gbk').decode(core.U8('中文测试数据'))
  const f = core.fixMojibake(garbled)
  assert.equal(f.status, 'fixed')
  assert.equal(f.best.fixed, '中文测试数据')
  assert.equal(f.best.roundtrip, true)
  assert.equal(f.best.fffd, 0)
  assert.ok(f.best.gain >= 8)
})

test('fixMojibake: GBK 奇数字节流尾部缺失 → uncertain + 如实注记', () => {
  const garbled = td('gbk').decode(core.U8(ZH_SHORT)) // 21 字节奇数 → 尾部孤立 lead
  const f = core.fixMojibake(garbled)
  assert.equal(f.status, 'uncertain', '尾部缺字节不得报 fixed')
  assert.equal(f.best.tailLoss, 1)
  assert.ok(f.note.includes('尾部'), '注记须说明尾部缺失')
  // 主体还原正确：缺的只是最后一个字符
  assert.equal(f.best.fixed, ZH_SHORT.slice(0, -1))
})

test('fixMojibake: GBK 长文主体还原（尾部缺失注记）', () => {
  const garbled = td('gbk').decode(core.U8(ZH))
  const f = core.fixMojibake(garbled)
  assert.equal(f.status, 'uncertain')
  assert.ok(ZH.startsWith(f.best.fixed), '主体必须是原文前缀')
})

test('fixMojibake: latin1 / cp1252 西文链（外部真值锚点）', () => {
  // 锚点：â€œhiâ€\u009d 是 "hi" 的 UTF-8 按 CP1252 误读的公认形态
  const f = core.fixMojibake('â€œhiâ€\u009d')
  assert.equal(f.status, 'fixed')
  assert.equal(f.best.fixed, '\u201Chi\u201d')
  const f2 = core.fixMojibake(td('latin1').decode(core.U8(ZH_SHORT)))
  assert.equal(f2.status, 'fixed')
  assert.equal(f2.best.fixed, ZH_SHORT)
})

test('fixMojibake: 干净文本 clean 不乱修', () => {
  assert.equal(core.fixMojibake('你好世界，普通文本 Hello World 123').status, 'clean')
  assert.equal(core.fixMojibake('function main() { console.log("hi"); }').status, 'clean')
})

test('fixMojibake: 锟斤拷文本 → unrepairable（拒绝半成品）', () => {
  const f = core.fixMojibake('数据被锟斤拷破坏了')
  assert.equal(f.status, 'unrepairable')
})

test('fixMojibake: 修复产物终验不变式（所有 fixed 候选无 FFFD/C1）', () => {
  for (const sample of [td('gbk').decode(core.U8('中文测试数据')), td('latin1').decode(core.U8(ZH_SHORT)), td('windows-1252').decode(core.U8('“hi” — dash'))]) {
    const f = core.fixMojibake(sample)
    if (f.status === 'fixed') {
      assert.equal(f.best.fffd, 0)
      assert.equal(f.best.c1ctrl, 0)
      assert.equal(f.best.roundtrip, true)
      assert.ok(Number.isFinite(f.best.score))
    }
  }
})

test('inspectBytes: GBK 文件全链路（识别→解码→判定干净）', () => {
  const r = core.inspectBytes(gbkBytes(ZH))
  assert.equal(r.detect.best.charset, 'gbk')
  assert.ok(r.decodeNote.includes('gbk'))
  assert.equal(r.fingerprint.verdict, 'clean', '正确解码后内容应干净')
})

test('inspectBytes: UTF-8 双重损坏文件全链路（识别→fix 链）', () => {
  // 模拟：UTF-8 文件曾被按 latin1 读出又存回（双重 mojibake 文件）
  // 注意：detect（字节视角）判 gbk 是合理行为——GB2312 区与 EUC 系码域重叠，
  // gbk 确实能读出假汉字；inspectBytes 的终态裁决（via）必须选 utf-8 路径
  const twice = Buffer.from(td('latin1').decode(core.U8(ZH_SHORT)), 'utf8')
  const r = core.inspectBytes(new Uint8Array(twice))
  assert.equal(r.via, 'utf-8', '终态评分应选 utf-8 路径：' + JSON.stringify(r.paths))
  assert.equal(r.fingerprint.verdict, 'mojibake')
  assert.equal(r.fix.status, 'fixed')
  assert.equal(r.fix.best.fixed, ZH_SHORT)
})

test('convertText 语义: convert 往返（textToBytes → bytesToText）', () => {
  const sample = '转换测试 Conversion 123'
  const enc = core.encodeText(sample, 'utf-8')
  const dec = core.strictDecode(enc.bytes, 'utf-8')
  assert.ok(dec.ok)
  assert.equal(dec.text, sample)
})

test('getDoubleByteMap: GBK 反推表规模与无 U+FFFD 键', () => {
  const m = core.getDoubleByteMap('gbk')
  assert.ok(m.size > 20000, `GBK 表应覆盖 2 万+ 码位，实测 ${m.size}`)
  assert.ok(!m.has('\ufffd'), '反推表不得收录 U+FFFD')
  assert.ok(m.has('€'), '单字节欧元特例必须收录（误读产物含 € 时链才通）')
})
