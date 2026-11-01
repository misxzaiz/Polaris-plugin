#!/usr/bin/env node
/**
 * 离线单测（零依赖，node test/run-tests.mjs）
 *
 * 覆盖：parser 四格式+多行归并 / reader 正读·反读·readBack 分页·watch 增量·
 * 轮转·过滤·扫描上限 / analyze 聚类归一化·直方图 / charset BOM·UTF-16LE·GBK /
 * core 设置归一化·路径校验·脱敏 / 安全断言（服务与 MCP 零写文件、零外联）。
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const parser = require('../service/parser.js')
const reader = require('../service/reader.js')
const analyze = require('../service/analyze.js')
const charset = require('../service/charset.js')
const core = require('../shared/core.js')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'log-lens-test-'))
let pass = 0, fail = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    pass++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    fail++
    failures.push({ name, e })
    console.error(`  ✗ ${name}\n    ${e.stack || e.message}`)
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${label || 'assert'} 不相等\n      实际: ${a}\n      期望: ${b}`)
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败')
}

// ── 造数据 ──────────────────────────────────────────────────────────────────
function writeText(name, text) {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, text, 'utf8')
  return p
}
function makeTracing(n, opts = {}) {
  const levels = ['INFO', 'INFO', 'INFO', 'WARN', 'DEBUG', 'ERROR', 'INFO', 'INFO', 'TRACE', 'INFO']
  const lines = []
  for (let i = 0; i < n; i++) {
    const lv = levels[i % levels.length]
    const ts = new Date(Date.UTC(2026, 10, 1, 8, 0, 0) + i * 1000).toISOString()
    let msg = `第${i}号事件 code=${1000 + i}`
    lines.push(`${ts}  ${lv} polaris.test.mod${i % 3}: ${msg}`)
    if (opts.continuations && i % 50 === 0) {
      lines.push('  at polaris.test.func (mod.rs:42)')
      lines.push('  at polaris.test.caller (main.rs:7)')
    }
  }
  return `${lines.join('\n')}\n`
}

const tracingPath = writeText('tracing.log', makeTracing(1000, { continuations: true }))
const nolfPath = writeText('nolf.log', makeTracing(100).trimEnd()) // 末行无换行
const crlfPath = writeText('crlf.log', makeTracing(50).replace(/\n/g, '\r\n'))

// GBK fixture（硬编码 GBK 字节序列：中文日志= D6D0 CEC4 C8D5 D6BE；错误= B4ED CEF3）
{
  const gbkHead = Buffer.from('2026-11-01 10:00:00 [main] INFO app - ', 'utf8')
  const gbkBody = Buffer.concat([
    Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xc8, 0xd5, 0xd6, 0xbe]), // 中文日志
    Buffer.from(' msg=', 'utf8'),
    Buffer.from([0xb4, 0xed, 0xce, 0xf3]), // 错误
    Buffer.from('\n', 'utf8'),
  ])
  fs.writeFileSync(path.join(TMP, 'gbk.log'), Buffer.concat([gbkHead, gbkBody]))
}
// UTF-16LE fixture（带 BOM）
{
  const text = makeTracing(30)
  const bom = Buffer.from([0xff, 0xfe])
  fs.writeFileSync(path.join(TMP, 'utf16.log'), Buffer.concat([bom, Buffer.from(text, 'utf16le')]))
}
const jsonlPath = writeText('jsonl.log', [
  '{"ts":"2026-11-01T09:00:00Z","level":"info","logger":"svc.a","msg":"started"}',
  '{"ts":1793547600000,"level":"error","logger":"svc.b","msg":"db timeout","code":504}',
  '{"timestamp":"2026-11-01T09:00:02Z","severity":"warning","message":"retry 3/5"}',
  'not json line',
].join('\n') + '\n')
const plainPath = writeText('plain.log', [
  'something happened',
  'FATAL: cannot continue',
  'recovered with warning state',
  'all good now',
].join('\n') + '\n')

// ── parser ──────────────────────────────────────────────────────────────────
console.log('parser:')
test('tracing 头行解析', () => {
  const e = parser.parseTracingLine('2026-11-01T00:04:41.052513Z  INFO polaris_lib::x: [FileWatcher] 停止监听')
  ok(e && e.level === 'INFO' && e.target === 'polaris_lib::x', 'level/target')
  ok(e.ts === Date.parse('2026-11-01T00:04:41.052513Z'), 'ts')
})
test('common 头行解析（含线程与级别别名）', () => {
  const e = parser.parseCommonLine('2026-11-01 10:00:00.123 [main] WARNING com.foo.Bar - something bad')
  ok(e && e.level === 'WARN' && e.target === 'com.foo.Bar', 'level/target')
  ok(e.message === 'something bad', 'message')
})
test('jsonl 字段自适应 + 非法行拒绝', () => {
  const e1 = parser.parseJsonlLine('{"ts":1793547600000,"level":"error","logger":"svc.b","msg":"db timeout"}')
  ok(e1 && e1.level === 'ERROR' && e1.target === 'svc.b', '数字秒/别名')
  const e2 = parser.parseJsonlLine('{"timestamp":"2026-11-01T09:00:02Z","severity":"warning","message":"retry"}')
  ok(e2 && e2.level === 'WARN', 'severity 别名')
  ok(parser.parseJsonlLine('not json') === null, '非法行')
})
test('多行归并：continuation 并入上一条，entry 原子分页', () => {
  const p = parser.createParser('tracing')
  const l1 = '2026-11-01T00:00:00Z  ERROR t: boom'
  const l2 = '  at f (a.rs:1)'
  const l3 = '2026-11-01T00:00:01Z  INFO t: ok'
  ok(p.addLine(l1, 0, 33) === null, '头行暂存')
  ok(p.addLine(l2, 33, 50) === null, '续行归并')
  const e1 = p.addLine(l3, 50, 83)
  ok(e1 && e1.message === 'boom\n  at f (a.rs:1)', '归并含换行')
  ok(e1.endOffset === 50, 'endOffset 止于下一头行行首')
  const e2 = p.flush()
  ok(e2 && e2.level === 'INFO', 'flush 吐出末条')
})
test('detectFormat 四格式', () => {
  const lines = fs.readFileSync(tracingPath, 'utf8').split('\n')
  eq(parser.detectFormat(lines), 'tracing', 'tracing')
  eq(parser.detectFormat(fs.readFileSync(jsonlPath, 'utf8').split('\n')), 'jsonl', 'jsonl')
  eq(parser.detectFormat(fs.readFileSync(plainPath, 'utf8').split('\n')), 'plain', 'plain')
})
test('plain 级别推断', () => {
  eq(parser.inferLevel('FATAL: cannot continue'), 'FATAL', 'fatal')
  eq(parser.inferLevel('recovered with warning state'), 'WARN', 'warn')
  eq(parser.inferLevel('all good now'), 'INFO', 'info')
})

// ── charset ─────────────────────────────────────────────────────────────────
console.log('charset:')
test('BOM：UTF-8 与 UTF-16LE', () => {
  eq(charset.detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'utf8', 'utf8 bom')
  eq(charset.detectEncoding(Buffer.from([0xff, 0xfe, 0x61, 0x00])), 'utf16le', 'utf16le bom')
})
test('GBK 探测（无 BOM 中文）', () => {
  const buf = fs.readFileSync(path.join(TMP, 'gbk.log'))
  eq(charset.detectEncoding(buf), 'gbk', 'gbk')
  const dec = charset.lineDecoder('gbk')
  ok(dec(buf).includes('中文日志'), 'GBK 解码还原中文')
})
test('纯 ASCII 判 utf8', () => {
  eq(charset.detectEncoding(Buffer.from('hello log\n')), 'utf8', 'ascii')
})

// ── reader ──────────────────────────────────────────────────────────────────
console.log('reader:')
test('forwardRead 全量 + 字节偏移正确', () => {
  const r = reader.forwardRead(tracingPath, { limit: 500 })
  eq(r.entries.length, 500, 'limit 封顶')
  eq(r.truncated, true, 'truncated 标注')
  eq(r.format, 'tracing', 'format')
  ok(r.entries[0].offset === 0, '首行 offset=0')
  const raw = fs.readFileSync(tracingPath)
  ok(raw.subarray(r.entries[1].offset, r.entries[1].offset + 4).toString() === '2026', '第 2 行 offset 指向行首')
})
test('forwardRead 扫描上限耗尽 ≠ EOF', () => {
  // 长行 fixture：64KB 反读下限内 <500 行，才能触发「扫描上限先于 limit 耗尽」
  const pad = 'x'.repeat(260)
  const longLines = Array.from({ length: 1000 }, (_, i) =>
    `2026-11-01T08:00:${String(i % 60).padStart(2, '0')}.000Z  ${i % 7 === 5 ? 'ERROR' : 'INFO'} t.m: 第${i}号 ${pad}`)
  const longPath = writeText('long-lines.log', `${longLines.join('\n')}\n`)
  const r = reader.forwardRead(longPath, { limit: 500, scanCap: 64 * 1024 })
  ok(r.entries.length > 0 && r.entries.length < 500, `窗口内 ${r.entries.length} 条`)
  eq(r.eof, false, 'eof=false')
  eq(r.truncated, true, 'truncated=true')
  // 从 nextOffset 续读可继续前进
  const r2 = reader.forwardRead(longPath, { offset: r.nextOffset, limit: 500, scanCap: 64 * 1024 })
  ok(r2.entries[0].offset >= r.nextOffset, '续读不回退')
})
test('tailRead 末 N 行（含无尾换行与 CRLF）', () => {
  const r = reader.tailRead(tracingPath, { maxLines: 7 })
  eq(r.entries.length, 7, '条数')
  ok(r.entries[6].message.includes('第999号'), '最后一条是第 999 号')
  const r2 = reader.tailRead(nolfPath, { maxLines: 5 })
  ok(r2.entries[r2.entries.length - 1].message.includes('第99号'), '无尾换行末行不丢')
  const r3 = reader.tailRead(crlfPath, { maxLines: 5 })
  ok(r3.entries[0].message.startsWith('第'), 'CRLF 不留 \\r')
})
test('tailRead 过滤（级别/关键词/正则）', () => {
  const r = reader.tailRead(tracingPath, { maxLines: 500, levels: ['ERROR'] })
  ok(r.entries.length >= 5 && r.entries.every((e) => e.level === 'ERROR'), '级别过滤')
  const r2 = reader.forwardRead(tracingPath, { limit: 50, q: '第9号' })
  ok(r2.entries.every((e) => e.message.includes('第9号')), '关键词过滤')
  const r3 = reader.forwardRead(tracingPath, { limit: 50, regex: 'code=10\\d\\d' })
  ok(r3.entries.every((e) => /code=10\d\d/.test(e.message)), '正则过滤')
  let threw = false
  try { reader.makeFilter({ regex: '(' }) } catch (_) { threw = true }
  ok(threw, '非法正则抛错')
})
test('readBack 分页链：不重不漏拼齐全文件', () => {
  const pages = [] // 每页内部时间序；页之间新→旧
  let bof = false
  let beforeOffset
  let guard = 0
  while (!bof && guard++ < 200) {
    const r = beforeOffset === undefined
      ? reader.tailRead(tracingPath, { maxLines: 233 })
      : reader.tailRead(tracingPath, { beforeOffset, maxLines: 233 })
    pages.push(r.entries)
    bof = r.bofReached
    beforeOffset = r.oldestOffset
    if (beforeOffset === 0) break
  }
  const all = pages.reverse().flat() // 页序反转后整体时间序
  const offsets = all.map((e) => e.offset)
  ok(new Set(offsets).size === offsets.length, '无重复')
  eq(offsets.length, 1000, '拼齐全量')
  eq(offsets[0], 0, '首条 offset=0')
  ok(offsets.every((o, i) => i === 0 || o > offsets[i - 1]), '严格递增')
})
test('跨 chunk 反读（110KB 文件 > 64KB 反读块，maxLines 钳位 500）', () => {
  const big = writeText('big-lines.log', makeTracing(1400))
  const r = reader.tailRead(big, { maxLines: 1400 })
  eq(r.entries.length, 500, '钳位到 500')
  eq(r.hasMore, true, 'hasMore 标注')
  ok(r.entries[499].message.includes('第1399号'), '最新一条正确')
  ok(r.entries[0].message.includes('第900号'), '窗口最旧一条正确（跨 64KB 块边界无错位）')
  const r2 = reader.tailRead(big, { maxLines: 200 })
  eq(r2.entries.length, 200, '常规窗口')
  ok(r2.entries[199].message.includes('第1399号') && r2.entries[0].message.includes('第1200号'), '窗口内容正确')
})
test('watchIncrement：增量/无增长/半行/轮转', () => {
  const p = writeText('watch.log', makeTracing(10))
  const meta0 = reader.fileMeta(p)
  const r0 = reader.watchIncrement(p, meta0.size)
  eq(r0.grown, false, '无增长')
  // 追加完整行
  fs.appendFileSync(p, '2026-11-01T09:00:00Z  ERROR t: appended\n')
  const r1 = reader.watchIncrement(p, meta0.size)
  eq(r1.grown, true, '有增长')
  eq(r1.entries.length, 1, '恰好 1 条')
  ok(r1.entries[0].message === 'appended', '内容正确')
  // 追加半行（无换行）→ 不吐
  fs.appendFileSync(p, '2026-11-01T09:00:01Z  INFO t: half-writ')
  const r2 = reader.watchIncrement(p, r1.newOffset)
  eq(r2.grown, true, '尺寸增长')
  eq(r2.entries.length, 0, '半行不吐')
  eq(r2.newOffset, r1.newOffset, 'offset 不推进')
  // 补上换行 → 吐出
  fs.appendFileSync(p, 'ten\n')
  const r3 = reader.watchIncrement(p, r2.newOffset)
  eq(r3.entries.length, 1, '补全后吐出')
  ok(r3.entries[0].message === 'half-written', '半行补全内容正确')
  // 轮转（文件变小）
  fs.writeFileSync(p, 'x')
  const r4 = reader.watchIncrement(p, r3.newOffset)
  eq(r4.rotated, true, '检测轮转')
  eq(r4.newOffset, 0, '轮转归零')
})
test('utf16le 文件读取', () => {
  const p = path.join(TMP, 'utf16.log')
  const meta = reader.fileMeta(p)
  eq(meta.encoding, 'utf16le', '编码识别')
  const r = reader.tailRead(p, { maxLines: 10 })
  eq(r.entries.length, 10, '行数')
  ok(r.entries[9].message.includes('第29号'), '内容正确')
})
test('searchFiles 多文件 + 容错', () => {
  const r = reader.searchFiles([tracingPath, path.join(TMP, '不存在的文件.log')], { q: '第5号', limitPerFile: 10 })
  eq(r.length, 2, '两个结果')
  ok(r[0].matches.length > 0, '命中')
  ok(r[1].error && r[1].matches.length === 0, '错误文件容错')
})

// ── analyze ─────────────────────────────────────────────────────────────────
console.log('analyze:')
test('normalizeMessage 归一化口径', () => {
  eq(analyze.normalizeMessage('connect 10.1.2.3:8080 failed after 3 ms (attempt 42)'), 'connect <ip> failed after <dur> (attempt <n>)', 'ip/dur/n')
  eq(analyze.normalizeMessage('uuid 550e8400-e29b-41d4-a716-446655440000 gone'), 'uuid <uuid> gone', 'uuid')
  eq(analyze.normalizeMessage('open "D:\\x\\y z\\file.txt" failed'), 'open <str> failed', '引号串（含路径）')
  eq(analyze.normalizeMessage('GET https://a.b/c?d=1 -> 200'), 'GET <url> -> <n>', 'url')
})
test('聚类：同类归并不同类分开', () => {
  const agg = analyze.createClusterAggregator(10)
  agg.add({ level: 'ERROR', message: 'connect 10.0.0.1 failed (attempt 1)', ts: 1000, offset: 0 })
  agg.add({ level: 'ERROR', message: 'connect 10.0.0.2 failed (attempt 2)', ts: 2000, offset: 100 })
  agg.add({ level: 'ERROR', message: 'disk full', ts: 3000, offset: 200 })
  agg.add({ level: 'WARN', message: 'connect 10.0.0.3 failed (attempt 3)', ts: 4000, offset: 300 })
  const { clusters } = agg.top()
  eq(clusters.length, 3, '3 类（同模板 ERROR 合并、WARN 分开）')
  eq(clusters[0].count, 2, 'ERROR 网络类 ×2')
})
test('statsForFile 直方图/时间线/聚类', () => {
  const r = analyze.statsForFile(tracingPath, {})
  eq(r.totalEntries, 1000, '总条数')
  eq(r.levels.ERROR, 1000 / 10, 'ERROR 计数（每 10 条 1 个）')
  ok(r.hourly.length >= 1 && r.hourly[0].problems === r.levels.WARN + r.levels.ERROR, '时间线问题数')
  ok(r.clusters.length >= 1, '有聚类')
  ok(r.clusters[0].count >= 1, '聚类计数')
})

// ── core ────────────────────────────────────────────────────────────────────
console.log('core:')
test('normalizeSettings 容错与钳位', () => {
  const s = core.normalizeSettings({ sources: [{ path: ' D:\\x ', kind: 'weird', addedAt: 'x' }, null, {}], liveIntervalMs: 1 })
  eq(s.sources.length, 1, '脏项过滤')
  eq(s.sources[0].kind, 'dir', 'kind 归一化')
  eq(s.liveIntervalMs, 500, '间隔下限钳位')
})
test('sanitizePath 拒绝非法输入', () => {
  const cases = ['', '   ', 'x'.repeat(501), 'a\0b', 'http://x/y']
  for (const c of cases) {
    let threw = false
    try { core.sanitizePath(c) } catch (_) { threw = true }
    ok(threw, `拒绝: ${c.slice(0, 20)}`)
  }
  ok(core.sanitizePath(' D:\\a\\b.log ') === 'D:\\a\\b.log', '正常路径 trim')
})
test('maskSensitive 掩码', () => {
  ok(!core.maskSensitive('token=abcdefgh1234').includes('abcdefgh1234'), 'token 掩码')
  ok(core.maskSensitive('Authorization: Bearer abcdefgh123456').includes('***'), 'bearer 掩码')
  ok(core.maskSensitive('normal text stays').includes('normal text stays'), '普通文本不动')
})

// ── 安全断言（静态扫描）─────────────────────────────────────────────────────
console.log('安全断言:')
test('服务与 MCP 源码零写文件调用', () => {
  const files = [
    'service/main.js', 'service/reader.js', 'service/parser.js',
    'service/analyze.js', 'service/charset.js', 'shared/core.js', 'mcp/server.js',
  ]
  const banned = ['writeFile', 'writeFileSync', 'appendFile', 'createWriteStream', 'unlink', 'rename', 'truncate', 'rmdir', 'rmSync']
  for (const f of files) {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8')
    for (const b of banned) {
      // 以调用形态匹配（\b 名称( ），避免误伤 truncatedByBytes 等标识符
      const callRe = new RegExp(`\\b${b}\\s*\\(`)
      ok(!callRe.test(src), `${f} 不得调用 ${b}`)
    }
  }
})
test('服务与 MCP 零外部网络调用（仅回环 + 宿主桥）', () => {
  const files = ['service/main.js', 'service/reader.js', 'service/parser.js', 'service/analyze.js', 'service/charset.js', 'shared/core.js', 'mcp/server.js']
  for (const f of files) {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') // 去注释
    ok(!/https:\/\//.test(src), `${f} 不得含 https URL`)
    const httpHits = src.match(/http:\/\/[^'"`\s]+/g) || []
    const nonLoopback = httpHits.filter((u) => !u.startsWith('http://127.0.0.1'))
    eq(nonLoopback, [], `${f} 仅允许 127.0.0.1 回环 URL`)
  }
})

// ── 收尾 ────────────────────────────────────────────────────────────────────
fs.rmSync(TMP, { recursive: true, force: true })
console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) {
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.e.message}`)
  process.exit(1)
}
