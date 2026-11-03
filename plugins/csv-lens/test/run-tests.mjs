/**
 * CSV 检查台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：RFC 4180 状态机（引号内逗号/换行/""转义）/ round-trip
 * 字段矩阵不变式 / 方言诊断定位（裸引号/尾随字符/未闭合/列数漂移/空行/BOM/换行混杂）/
 * 分隔符检测 / 类型推断 / 转换输出（JSON/SQL/Markdown）/ 规范化。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/csv-core.js'

test('parseCsv: 基本解析（表头+数据行）', () => {
  const r = core.parseCsv('name,qty\n扳手,3\n螺丝刀,7\n')
  assert.ok(r.ok)
  assert.deepEqual(r.header, ['name', 'qty'])
  assert.equal(r.stats.dataRows, 2)
  assert.deepEqual(r.rows[1], ['扳手', '3'])
  assert.equal(r.issues.length, 0)
})

test('parseCsv: 引号内逗号/换行/双引号转义（刁钻样本）', () => {
  const r = core.parseCsv('"a,""b""","多行\n字段",3\n')
  assert.ok(r.ok)
  assert.deepEqual(r.rows[0], ['a,"b"', '多行\n字段', '3'])
  assert.equal(r.issues.filter((x) => x.severity === 'error').length, 0)
})

test('round-trip: 刁钻样本 serialize→再解析 字段矩阵相等（非平凡断言）', () => {
  const samples = [
    '"a,""b""\nc","x,y",plain\n末行无换行', // 引号内逗号+换行+转义+EOF
    '中文,english,123\n"引号""内",,末\n', // 空字段+中文
    'a,b\n,,\n1,2\n', // 全空字段行（不是空行）
  ]
  for (const s of samples) {
    const p1 = core.parseCsv(s)
    const ser = core.serialize(p1.rows)
    assert.ok(ser.ok)
    const p2 = core.parseCsv(ser.output)
    assert.deepEqual(p2.rows, p1.rows) // 字段矩阵不变式
    assert.ok(p1.rows.length >= 1 && p1.rows[0].length >= 1) // 非平凡守卫
  }
})

test('parseCsv: 空行跳过并报告（保留全空字段行）', () => {
  const r = core.parseCsv('a,b\n1,2\n\n\n3,4\n')
  assert.ok(r.ok)
  assert.equal(r.stats.dataRows, 2)
  assert.equal(r.stats.emptyLines, 2)
  const r2 = core.parseCsv('a,b\n,,\n1,2\n')
  assert.equal(r2.stats.dataRows, 2) // ",," 是 3 空字段行，不是空行
})

test('parseCsv: 裸引号定位（行号+字段索引）', () => {
  const r = core.parseCsv('a,b\nab"c,2\n')
  assert.ok(r.ok)
  const bare = r.issues.filter((x) => x.type === 'bare-quote')
  assert.equal(bare.length, 1)
  assert.equal(bare[0].line, 2)
  assert.equal(bare[0].field, 0) // ab"c 是该行第 1 个字段（0-based）
})

test('parseCsv: 引号后尾随字符定位', () => {
  const r = core.parseCsv('"ok"x,2\n')
  assert.ok(r.ok)
  const t = r.issues.filter((x) => x.type === 'trailing-after-quote')
  assert.equal(t.length, 1)
  assert.equal(t[0].line, 1)
  assert.deepEqual(r.rows[0][0], 'okx') // 容错：所见即所得保留原字符并报告（Excel 丢字符，这里不丢信息）
  const r2 = core.parseCsv('"ok" "tail",2\n') // 关闭后隔空格再引号：真 trailing 场景（"ok""tail" 是合法转义，零 issue）
  const t2 = r2.issues.filter((x) => x.type === 'trailing-after-quote')
  assert.equal(t2.length, 1)
  assert.deepEqual(r2.rows[0][0], 'ok "tail"') // 所见即所得（此样本另有裸引号 issue，两处都如实报告）
  const r3 = core.parseCsv('"ok""tail",2\n') // 合法转义对照：零 issue
  assert.equal(r3.issues.length, 0)
  assert.deepEqual(r3.rows[0][0], 'ok"tail')
})

test('parseCsv: 未闭合引号定位', () => {
  const r = core.parseCsv('a,"未闭合\nb,2\n')
  assert.ok(r.ok)
  const u = r.issues.filter((x) => x.type === 'unterminated-quote')
  assert.equal(u.length, 1)
  assert.equal(u[0].line, 1)
})

test('parseCsv: 列数漂移行定位（ragged-row）', () => {
  const r = core.parseCsv('a,b,c\n1,2\n3,4,5\n6,7,8,9\n')
  assert.ok(r.ok)
  const ragged = r.issues.filter((x) => x.type === 'ragged-row')
  assert.equal(ragged.length, 2)
  assert.match(ragged[0].message, /字段数 2 ≠ 表头 3/)
  assert.match(ragged[1].message, /字段数 4 ≠ 表头 3/)
})

test('parseCsv: BOM 剥离 + 报告', () => {
  const r = core.parseCsv('\uFEFFname,qty\n1,2\n')
  assert.ok(r.ok)
  assert.equal(r.header[0], 'name')
  assert.ok(r.stats.hadBom)
  assert.ok(r.issues.some((x) => x.type === 'bom'))
})

test('parseCsv: 换行风格混杂检测', () => {
  const r = core.parseCsv('a,b\r\n1,2\n3,4\r\n')
  assert.ok(r.ok)
  assert.ok(r.issues.some((x) => x.type === 'mixed-line-endings'))
  assert.ok(r.stats.lineEndings.crlf >= 2 && r.stats.lineEndings.lf >= 1)
})

test('parseCsv: 末行无换行提示', () => {
  const r = core.parseCsv('a,b\n1,2')
  assert.ok(r.ok)
  assert.equal(r.stats.dataRows, 1)
  assert.ok(r.issues.some((x) => x.type === 'no-trailing-newline'))
})

test('detectDelimiter: 分号/制表符检出', () => {
  assert.equal(core.detectDelimiter('a;b;c\n1;2;3\n').detected, ';')
  assert.equal(core.detectDelimiter('a\tb\tc\n1\t2\t3\n').detected, '\t')
  // 引号内分隔符不计数
  assert.equal(core.detectDelimiter('"a;b",c\n"d;e",f\n').detected, ',')
})

test('parseCsv: delimiter 参数生效（分号 CSV 指定分号）', () => {
  const r = core.parseCsv('name;qty\n扳手;3\n', { delimiter: ';' })
  assert.ok(r.ok)
  assert.deepEqual(r.header, ['name', 'qty'])
  assert.deepEqual(r.rows[1], ['扳手', '3'])
})

test('inferColumns: 全类型覆盖 + 数字列统计', () => {
  const r = core.parseCsv('id,score,ok,day,note,blank\n1,1.5,true,2026-01-02,文字,\n2,2.75,false,2026/03/04,"a,b",\n')
  assert.ok(r.ok)
  const inf = core.inferColumns(r.rows)
  assert.ok(inf.ok)
  const byName = Object.fromEntries(inf.columns.map((c) => [c.name, c]))
  assert.equal(byName.id.inferred, 'int')
  assert.equal(byName.score.inferred, 'float')
  assert.equal(byName.ok.inferred, 'bool')
  assert.equal(byName.day.inferred, 'date')
  assert.equal(byName.note.inferred, 'string')
  assert.equal(byName.blank.inferred, 'empty')
  assert.equal(byName.score.min, 1.5)
  assert.equal(byName.score.max, 2.75)
  assert.ok(Math.abs(byName.score.sum - 4.25) < 1e-9)
})

test('inferColumns: int+float 混列归并为 float', () => {
  const r = core.parseCsv('v\n1\n2.5\n')
  const inf = core.inferColumns(r.rows)
  assert.equal(inf.columns[0].inferred, 'float')
})

test('toJson: records 重名表头加后缀 + rows 模式', () => {
  const r = core.parseCsv('id,name,id\n1,a,2\n')
  const rec = core.toJson(r.rows, 'records')
  assert.ok(rec.ok)
  const arr = JSON.parse(rec.output)
  assert.deepEqual(arr, [{ id: '1', name: 'a', id_2: '2' }])
  assert.equal(rec.renamed.length, 1)
  const rows = core.toJson(r.rows, 'rows')
  assert.deepEqual(JSON.parse(rows.output), [['id', 'name', 'id'], ['1', 'a', '2']])
})

test('toSql: 转义/NULL/数字裸值/表名转义', () => {
  const r = core.parseCsv('id,name,score\n1,"it\'s",1.5\n2,,\n')
  const s = core.toSql(r.rows, { tableName: 'parts' })
  assert.ok(s.ok)
  assert.match(s.output, /INSERT INTO "parts" \("id", "name", "score"\) VALUES/)
  assert.match(s.output, /\(1, 'it''s', 1\.5\)/) // 已有单引号被转义
  assert.match(s.output, /\(2, NULL, NULL\)/)
  const s2 = core.toSql(r.rows, { tableName: 'ta"ble' })
  assert.match(s2.output, /INSERT INTO "ta""ble"/)
})

test('toMarkdown: 管道转义 + 换行折空格', () => {
  const r = core.parseCsv('a,b\n"x|y","l1\nl2"\n')
  const m = core.toMarkdown(r.rows)
  assert.ok(m.ok)
  assert.ok(m.output.includes('x\\|y')) // | 被转义为 \|（字面反斜杠+竖线）
  assert.ok(m.output.includes('l1 l2'))
  assert.match(m.output, /^\| a \| b \|/m)
})

test('serialize: minimal 引号 + CRLF 输出 + 转义', () => {
  const s = core.serialize([['a', 'b,c'], ['plain', 'x"y"z']])
  assert.ok(s.ok)
  assert.ok(s.output.endsWith('\r\n'))
  assert.match(s.output, /^a,"b,c"\r\nplain,"x""y""z"\r\n$/) // 含逗号字段才加引号；" → ""
})

test('防御: 空输入/坏输入如实报错不炸', () => {
  assert.equal(core.parseCsv('').ok, false)
  assert.equal(core.parseCsv(null).ok, false)
  assert.equal(core.toJson([], 'records').ok, false)
  assert.equal(core.serialize([]).ok, false)
  const r = core.parseCsv('a,b\n1\n') // ragged 也有 ok:true（容错解析），issues 承载错误
  assert.ok(r.ok && r.hasError)
})
