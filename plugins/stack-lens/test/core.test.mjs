/**
 * core.test.mjs —— 引擎单元测试（离线，第一层验证）
 *
 * 覆盖：VLQ 解码（正负 delta/多段/1字段段/稀疏行）、parseSourceMap（段式合并/sourcesContent
 * 不齐告警）、originalPositionFor（精确/区间取 ≤/越界/无源段）、parseStack（V8 全格式族/
 * SpiderMonkey 族/message/内部帧/eval 帧/别名/async）、matchMap 三级配对、scanMapsDir
 * （node_modules 排除/sourceMappingURL 解析/上限）、codeFrame（列指针/CRLF/越界）、
 * resolveStack 端到端（还原/未还原原因/内部帧/汇总口径）、validateMap/mapBrief。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildMappings, buildFixtureDist, appStack, APP_TS } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = require(path.join(__dirname, '..', 'shared', 'core.js'))

// ── VLQ / mappings ──────────────────────────────────────────────────────────

test('VLQ 解码：buildMappings 往返一致（含负 delta 与 nameIdx）', () => {
  const lines = [
    [[0, 0, 0, 0, 0], [10, 1, 5, 2, 1]],
    [[0, 0, 6, 3], [4, 0, 1, 0]],
    [[7, 1, 2, 1, 0]],
  ]
  const mappings = buildMappings(lines)
  const decoded = core.decodeMappings(mappings, 0, 0)
  assert.equal(decoded.size, 3)
  // 行0 段1：genCol=10, src=1, srcLine=5, srcCol=2, name=1
  assert.deepEqual(decoded.get(0), [0, 0, 0, 0, 0, 10, 1, 5, 2, 1])
  // 行1 段2：src 回到 0、srcLine 6、srcCol 3
  assert.deepEqual(decoded.get(1), [0, 0, 6, 3, -1, 4, 0, 1, 0, -1])
  assert.deepEqual(decoded.get(2), [7, 1, 2, 1, 0])
})

test('VLQ 解码：1 字段段（无源映射）占位 -1', () => {
  const decoded = core.decodeMappings('AAAA,C;AAAA', 0, 0)
  // 段2 是 1 字段：col=1, 无源
  assert.deepEqual(decoded.get(0), [0, 0, 0, 0, -1, 1, -1, 0, 0, -1])
  assert.deepEqual(decoded.get(1), [0, 0, 0, 0, -1])
})

test('VLQ 解码：段式偏移（lineOffset/firstColOffset）', () => {
  const decoded = core.decodeMappings('AAAA', 5, 3)
  assert.deepEqual(decoded.get(5), [3, 0, 0, 0, -1])
})

test('VLQ 解码：非法字符与截断抛错（尾逗号容忍——生态惯例）', () => {
  // 'g' 带 continuation 位但序列结束 → 截断
  assert.throws(() => core.decodeMappings('AAg', 0, 0), /截断/)
  assert.throws(() => core.decodeMappings('AA*A', 0, 0), /非法 VLQ/)
  // 尾逗号：主流解析器均容忍，不应抛
  assert.doesNotThrow(() => core.decodeMappings('AAAA,', 0, 0))
})

// ── parseSourceMap ──────────────────────────────────────────────────────────

test('parseSourceMap：正常 v3 + sourcesContent', () => {
  const m = core.parseSourceMap(JSON.stringify({
    version: 3, file: 'a.js', sources: ['webpack://x/./src/a.ts', 'b.ts'], sourcesContent: ['const a=1;', null], names: ['foo'],
    mappings: buildMappings([[[0, 0, 0, 0, 0]], [[0, 1, 2, 3]]]),
  }), 'a.map')
  assert.equal(m.error, null)
  assert.equal(m.sources[0], 'x/./src/a.ts') // scheme 剥离
  assert.equal(m.sourcesContent[0], 'const a=1;')
  assert.equal(m.segCount, 2)
})

test('parseSourceMap：坏 JSON / 非 v3 报 error 不抛', () => {
  assert.ok(core.parseSourceMap('{broken', 'x').error)
  assert.match(core.parseSourceMap(JSON.stringify({ version: 2, sources: [], mappings: '' }), 'x').error, /版本/)
})

test('parseSourceMap：段式 index map 合并（sources/names 重定位）', () => {
  const sectioned = {
    version: 3,
    sections: [
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: ['a.ts'], sourcesContent: ['A'], names: ['fa'], mappings: buildMappings([[[0, 0, 0, 0, 0]]]) } },
      { offset: { line: 3, column: 0 }, map: { version: 3, sources: ['b.ts'], sourcesContent: ['B'], names: ['fb'], mappings: buildMappings([[[0, 0, 0, 0, 0]]]) } },
    ],
  }
  const m = core.parseSourceMap(JSON.stringify(sectioned), 'sec.map')
  assert.equal(m.error, null)
  assert.equal(m.sections, 2)
  assert.deepEqual(m.sources, ['a.ts', 'b.ts'])
  assert.deepEqual(m.names, ['fa', 'fb'])
  // 行3 的段：srcIdx 应重定位到 1（b.ts），nameIdx 到 1（fb）
  const pos = core.originalPositionFor(m, 3, 0)
  assert.equal(pos.source, 'b.ts')
  assert.equal(pos.name, 'fb')
  assert.deepEqual(m.sourcesContent, ['A', 'B'])
})

test('parseSourceMap：sourcesContent 与 sources 数量不齐 → 告警', () => {
  const m = core.parseSourceMap(JSON.stringify({
    version: 3, sources: ['a.ts', 'b.ts'], sourcesContent: ['A'], names: [], mappings: 'AAAA',
  }), 'x')
  assert.equal(m.error, null)
  assert.ok(m.warnings.some((w) => /数量不一致/.test(w)))
})

// ── originalPositionFor ─────────────────────────────────────────────────────

function miniMap() {
  return core.parseSourceMap(JSON.stringify({
    version: 3, sources: ['a.ts'], names: ['n0', 'n1'],
    mappings: buildMappings([
      [[0, 0, 0, 0, 0], [10, 0, 4, 2, 1], [20, 0, 8, 0]],
    ]),
  }), 'm')
}

test('originalPositionFor：精确列命中 / 区间内取 ≤ 查询列的最大段', () => {
  const m = miniMap()
  assert.deepEqual(
    { s: core.originalPositionFor(m, 0, 0).line, n: core.originalPositionFor(m, 0, 0).name },
    { s: 0, n: 'n0' },
  )
  // 列 15 落在 [10,20) 区间 → 取 col10 段（srcLine 4, name n1）
  const mid = core.originalPositionFor(m, 0, 15)
  assert.equal(mid.line, 4)
  assert.equal(mid.name, 'n1')
  // 列 20 → 精确命中第三段
  assert.equal(core.originalPositionFor(m, 0, 20).line, 8)
  // 列 999 → 仍取最后一段（左闭右开末段延伸）
  assert.equal(core.originalPositionFor(m, 0, 999).line, 8)
})

test('originalPositionFor：无映射行 / 无带源段 → null', () => {
  const m = miniMap()
  assert.equal(core.originalPositionFor(m, 5, 0), null)
  const noSrc = core.parseSourceMap(JSON.stringify({ version: 3, sources: [], names: [], mappings: 'A' }), 'x')
  assert.equal(core.originalPositionFor(noSrc, 0, 0), null)
})

// ── parseStack ──────────────────────────────────────────────────────────────

test('parseStack：V8 家族全格式', () => {
  const p = core.parseStack([
    'TypeError: boom failed',
    '    at greet (http://x.com/assets/app.8f2a.js:1:88423)',
    '    at Object.<anonymous> (D:\\proj\\dist\\app.min.js:3:1)',
    '    at Runner.run [as run] (node:internal/timers:478:9)',
    '    at async H (eval at run (http://x.com/a.js:5:10), <anonymous>:2:33)',
    '    at http://x.com/b.js:9:1',
  ].join('\n'))
  assert.equal(p.format, 'v8')
  assert.equal(p.message, 'TypeError: boom failed')
  assert.equal(p.frames.length, 5)
  const [f0, f1, f2, f3, f4] = p.frames
  assert.equal(f0.fn, 'greet')
  assert.equal(f0.url, 'http://x.com/assets/app.8f2a.js')
  assert.equal(f0.line, 1)
  assert.equal(f0.col, 88423)
  assert.equal(f1.fn, 'Object.<anonymous>')
  assert.equal(f2.isInternal, true)
  assert.equal(f2.fn, 'Runner.run') // [as run] 剥掉别名
  assert.equal(f3.evalFrame, true)
  assert.equal(f3.url, '<anonymous>')
  assert.equal(f3.line, 2)
  assert.equal(f3.fn, 'H')
  assert.equal(f4.fn, null) // 无函数名帧
  assert.equal(f4.line, 9)
})

test('parseStack：SpiderMonkey 家族（Safari/Firefox）', () => {
  const p = core.parseStack('greet@https://x.com/a.js:12:34\nfoo@https://x.com/b.js:2\nanonymous@resource://gre/x.js:1:1')
  assert.equal(p.format, 'spidermonkey')
  assert.equal(p.frames[0].fn, 'greet')
  assert.equal(p.frames[0].col, 34)
  assert.equal(p.frames[1].col, null) // 旧 Safari 无列
  assert.equal(p.frames[2].isInternal, true) // resource:// 视为内部
})

test('parseStack：空输入与未知行', () => {
  assert.equal(core.parseStack('   ').format, 'empty')
  const p = core.parseStack('随便一行文字\n    at f (http://x/a.js:1:2)')
  assert.equal(p.frames.length, 1)
  assert.equal(p.frames[0].state ?? 'ok', 'ok')
})

test('parseStack：超长截断并记 notes', () => {
  const long = 'at f (http://x/a.js:1:2)\n'.repeat(2000) + 'x'.repeat(600 * 1024)
  const p = core.parseStack(long)
  assert.equal(p.truncated, true)
  assert.ok(p.notes.some((n) => /截断/.test(n)))
  assert.ok(p.frames.length <= core.LIMITS.maxStackFrames)
})

// ── matchMap / scanMapsDir ──────────────────────────────────────────────────

test('matchMap 三级配对：file 字段 → basename → sourceMappingURL', () => {
  const mk = (label, file, originPath, fromJs) => ({ map: { file, sources: [], names: [], lines: new Map() }, label, originPath, fromJs })
  const url = 'http://x.com/assets/app.abc.js'
  // ① file 字段精确
  const byFile = [mk('m1', 'app.abc.js', '/elsewhere/x.map', null)]
  assert.equal(core.matchMap(byFile, url), byFile[0])
  // ② originPath basename
  const byBase = [mk('m2', 'other.js', '/dist/app.abc.js.map', null)]
  assert.equal(core.matchMap(byBase, url), byBase[0])
  // ③ sourceMappingURL 显式指向：fromFile（来自哪个 js）与 fromJs 值两条路
  const byFromJs = [mk('m3', null, null, 'app.abc.js.map')]
  assert.equal(core.matchMap(byFromJs, url), byFromJs[0])
  const byFromFile = [mk('m3b', null, null, 'maps/app.abc.js.map')]
  byFromFile[0].fromFile = 'app.abc.js'
  assert.equal(core.matchMap(byFromFile, url), byFromFile[0])
  // ④ 无匹配
  assert.equal(core.matchMap([byFile[0]], 'http://x.com/other.js'), null)
})

test('scanMapsDir：夹具目录全量扫描（node_modules 排除/去重/子目录/中文路径）', () => {
  const fx = buildFixtureDist()
  try {
    const scan = core.scanMapsDir(fx.dir)
    assert.deepEqual(scan.warnings, [])
    // 直读 .map：app.min.js.map / vendor.min.js.map / maps/lazy.min.js.map（子目录遍历）
    // sourceMappingURL 命中同一文件时去重（app 与 lazy 各有注释但目标已直读）→ 共 3 条
    assert.equal(scan.maps.length, 3)
    const names = scan.maps.map((m) => path.basename(m.originPath || '')).sort()
    assert.deepEqual(names, ['app.min.js.map', 'lazy.min.js.map', 'vendor.min.js.map'])
    // node_modules 噪音不应出现
    assert.ok(!scan.maps.some((m) => String(m.originPath).includes('node_modules')))
    // 中文目录文件不崩（非 .map/.js 不收集，但 walked 计数包含）
    assert.ok(scan.walked >= 8)
  } finally { fx.cleanup() }
})

test('scanMapsDir：不存在目录 → warnings 不抛', () => {
  const r = core.scanMapsDir(path.join(os.tmpdir(), 'stack-lens-not-exist-xyz'))
  assert.equal(r.maps.length, 0)
  assert.ok(r.warnings.length >= 1)
})

// ── codeFrame ───────────────────────────────────────────────────────────────

test('codeFrame：命中行 + 列指针 + 上下文 + CRLF 归一', () => {
  const src = 'line1\r\nline2\r\nline3 target here\r\nline4\r\nline5'
  const frame = core.codeFrame(src, 3, 7, 1)
  assert.ok(frame.includes('line2'))
  assert.ok(frame.includes('line4'))
  assert.ok(!frame.includes('line1'))
  const lines = frame.split('\n')
  assert.equal(lines[1], '3 | line3 target here')
  assert.equal(lines[2], '  |       ^') // col 7 → 6 空格（行号宽 1 + ' | '）
})

test('codeFrame：越界行 / 空内容 → null', () => {
  assert.equal(core.codeFrame('abc', 9, 1, 2), null)
  assert.equal(core.codeFrame('', 1, 1, 2), null)
  assert.equal(core.codeFrame('abc', 0, 1, 2), null)
})

// ── resolveStack 端到端 ─────────────────────────────────────────────────────

test('resolveStack 端到端：还原 + 函数原名 + sourcesContent 代码帧 + 内部帧 + 未还原原因', () => {
  const fx = buildFixtureDist()
  try {
    const stack = appStack(fx.dir) // 3 帧：boom(:2:32) / 入口(:3:1) / node:internal
    const report = core.resolveStack(stack, [{ jsonText: JSON.stringify(fx.appMap), originPath: path.join(fx.dir, 'app.min.js.map') }], { fsReader: () => null })
    // 帧1：boom → app.ts 行7 列3，名字 boom
    const f0 = report.frames[0]
    assert.equal(f0.state, 'resolved')
    assert.equal(f0.source, 'src/app.ts')
    assert.equal(f0.sourceLine, 7)
    assert.equal(f0.sourceCol, 3)
    assert.equal(f0.displayName, 'boom')
    assert.ok(f0.codeFrame.includes('greet(undefined'))
    assert.equal(f0.codeFrameSource, 'sourcesContent')
    // 帧2：行3 col1 → 精确段（src 行0）
    const f1 = report.frames[1]
    assert.equal(f1.state, 'resolved')
    assert.equal(f1.sourceLine, 1)
    // 帧3：内部帧跳过
    const f2 = report.frames[2]
    assert.equal(f2.state, 'internal')
    // 汇总：eligible=2，resolved=2 → 100%
    assert.deepEqual(
      { r: report.summary.resolved, e: report.summary.eligible, i: report.summary.internal, rate: report.summary.rate },
      { r: 2, e: 2, i: 1, rate: 100 },
    )
    assert.equal(report.summary.format, 'v8')
    assert.ok(report.summary.message.includes('trim'))
  } finally { fx.cleanup() }
})

test('resolveStack：无匹配 map → 未还原带原因；生成行无映射段 → 带 map 标签的原因', () => {
  const fx = buildFixtureDist()
  try {
    const stack = `Error: x\n    at boom (${path.join(fx.dir, 'app.min.js')}:99:1)`
    // 不给任何 map
    const r0 = core.resolveStack(stack, [], { fsReader: null })
    assert.equal(r0.frames[0].state, 'unresolved')
    assert.equal(r0.frames[0].reason, '未找到匹配的 sourcemap')
    assert.equal(r0.summary.noMap, 1)
    // 给 map 但行号远超映射范围（map 只有 3 行映射）
    const r1 = core.resolveStack(stack, [{ jsonText: JSON.stringify(fx.appMap), originPath: path.join(fx.dir, 'app.min.js.map') }], { fsReader: null })
    assert.equal(r1.frames[0].state, 'unresolved')
    assert.match(r1.frames[0].reason, /无带源映射的段/)
  } finally { fx.cleanup() }
})

test('resolveStack：sourcesContent 缺失 → 磁盘回退（vendor 场景 + webpack:// 前缀）', () => {
  const fx = buildFixtureDist()
  try {
    // vendor：磁盘读（map 在 dir 根，sources 'src/vendor.ts'）
    // 生成行1只有一个 col0 段 → 该行任意列都取它（左闭右开）→ sourceCol 1
    const vendorJs = path.join(fx.dir, 'vendor.min.js')
    const r1 = core.resolveStack(`Error: v\n    at vendorAdd (${vendorJs}:1:26)`, [{ jsonText: JSON.stringify(fx.vendorMap), originPath: path.join(fx.dir, 'vendor.min.js.map') }], { fsReader: (p) => { try { return fs.readFileSync(p, 'utf8') } catch (_) { return null } } })
    const f = r1.frames[0]
    assert.equal(f.state, 'resolved')
    assert.equal(f.source, 'src/vendor.ts')
    assert.equal(f.sourceLine, 1)
    assert.equal(f.sourceCol, 1)
    assert.ok(f.codeFrame.includes('vendorAdd'))
    assert.ok(f.codeFrameSource.includes('src'), `磁盘来源应为绝对路径，实得 ${f.codeFrameSource}`)
    // lazy：webpack:// 前缀 + sourcesContent 存在（不依赖磁盘）
    const lazyJs = path.join(fx.dir, 'lazy.min.js')
    const r2 = core.resolveStack(`Error: l\n    at Lazy (${lazyJs}:2:1)`, [{ jsonText: JSON.stringify(fx.lazyMap), originPath: path.join(fx.dir, 'maps', 'lazy.min.js.map') }], { fsReader: () => { throw new Error('不应走磁盘') } })
    const f2 = r2.frames[0]
    assert.equal(f2.state, 'resolved')
    assert.equal(f2.source, 'app/./src/lazy.tsx') // webpack:// 剥离后
    assert.ok(f2.codeFrame.includes('lazy-here'))
  } finally { fx.cleanup() }
})

test('resolveStack：APP_TS 夹具自身与 map 声称的内容一致（防夹具漂移）', () => {
  // appMap 行7 col3 应落在 greet(undefined 调用上
  const lines = APP_TS.split('\n')
  assert.equal(lines[6], '  return greet(undefined as unknown as string).trim();')
})

// ── validateMap / mapBrief ──────────────────────────────────────────────────

test('validateMap：正常 map 统计齐；空 mappings 告警', () => {
  const fx = buildFixtureDist()
  try {
    const v = core.validateMap(JSON.stringify(fx.appMap), 'app')
    assert.equal(v.ok, true)
    assert.equal(v.stats.segCount, 3)
    assert.equal(v.stats.sources, 1)
    assert.equal(v.stats.hasSourcesContent, true)
    const v2 = core.validateMap(JSON.stringify({ version: 3, sources: [], names: [], mappings: '' }), 'empty')
    assert.equal(v2.ok, true)
    assert.ok(v2.warnings.some((w) => /mappings 为空/.test(w)))
    assert.equal(core.validateMap('not json', 'x').ok, false)
  } finally { fx.cleanup() }
})

test('mapBrief：头字段速览（不展开 mappings）', () => {
  const fx = buildFixtureDist()
  try {
    const b = core.mapBrief(JSON.stringify(fx.appMap), '/x/app.min.js.map')
    assert.equal(b.file, 'app.min.js')
    assert.equal(b.sources, 1)
    assert.equal(b.hasContent, true)
    assert.equal(b.names, 2)
    assert.ok(b.bytes > 0)
    assert.ok(core.mapBrief('broken', null).error)
  } finally { fx.cleanup() }
})
