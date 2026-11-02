/**
 * core.test.mjs —— 分析引擎离线单测（零 IO 为主 + 合成 Buffer 归因）
 *
 * 覆盖：VLQ 编解码往返 / UTF-16 列→字节表（多字节+代理对）/ 逐段归因与守恒 /
 * sourcemap 路径归一（webpack://、file://、反斜杠、查询串）/ 包解析（npm 嵌套、
 * pnpm 版本、scope、yarn workspace）/ sections 段式 map / treemap 面积守恒与
 * 单调性 / diffReports 对齐语义 / buildSuggestions 规则触发。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = require(path.join(__dirname, '..', 'shared', 'core.js'))

// ── VLQ 编解码往返 ────────────────────────────────────────────────────────────
test('VLQ：单值往返（0、±1、±15、±16、±1000）', () => {
  for (const v of [0, 1, -1, 15, -15, 16, -16, 1000, -1000]) {
    const fields = []
    core.decodeVlqLine(core.encodeVlqValue(v), 0, core.encodeVlqValue(v).length, fields)
    assert.equal(fields[0], v, `值 ${v} 往返`)
  }
})

test('VLQ：多字段一行解码', () => {
  const enc = [1, 2, 3, 4].map(core.encodeVlqValue).join('')
  const fields = []
  core.decodeVlqLine(enc, 0, enc.length, fields)
  assert.deepEqual(fields, [1, 2, 3, 4])
})

// ── buildMappings ↔ decodeMappings 往返 ──────────────────────────────────────
test('buildMappings ↔ decodeMappings：多行多段往返保真', () => {
  const lines = [
    [[0, 0, 0, 0], [10, 1, 5, 3]],
    [],
    [[0, 2, 9, 1], [7, 0, 1, 2], [20, 1, 2, 4]],
  ]
  const decoded = core.decodeMappings(core.buildMappings(lines), 0, 0)
  assert.equal(decoded.get(0).length, 4)
  assert.equal((decoded.get(1) || []).length, 0, '空行无段（Map 不落键）')
  assert.equal(decoded.get(2).length, 6)
  assert.deepEqual([...decoded.get(0)], [0, 0, 10, 1])
  assert.deepEqual([...decoded.get(2)], [0, 2, 7, 0, 20, 1])
})

// ── UTF-16 列 → 字节表 ────────────────────────────────────────────────────────
test('col→byte 表：ASCII 恒等 / CJK 3 字节 / 代理对 4 字节', () => {
  const ascii = core.buildColByteTable('abcde', 5)
  assert.equal(ascii[5], 5)
  const cjk = core.buildColByteTable('中文a', Buffer.byteLength('中文a'))
  assert.equal(cjk[0], 0)   // '中' 起点字节 0
  assert.equal(cjk[1], 3)   // '文' 起点
  assert.equal(cjk[2], 6)   // 'a' 起点
  assert.equal(cjk[3], 7)   // 行尾哨兵（中文 3+3 + a 1）
  const astral = '𝄞ab' // U+1D11E 两列
  const t = core.buildColByteTable(astral, Buffer.byteLength(astral))
  assert.equal(t[0], 0)
  assert.equal(t[2], 4) // 代理对占 4 字节，'a' 从 4 开始
  assert.equal(t[3], 5) // 行尾
})

// ── 逐段归因与守恒 ────────────────────────────────────────────────────────────
test('attributeChunk：跨源归因精确 + mapped/unmapped 守恒到文件字节', () => {
  const lines = ['a'.repeat(50), '中文'.repeat(10) + 'xyz', 'tail-unmapped'.repeat(3)]
  const buf = Buffer.from(lines.join('\n') + '\n')
  const mappings = core.decodeMappings(core.buildMappings([
    [[0, 0, 0, 0], [25, 1, 1, 0]],
    [[0, 1, 2, 0]],
    [],
  ]), 0, 0)
  const r = core.attributeChunk(buf, mappings, 2)
  assert.equal(r.perSource[0], 25)
  assert.equal(r.perSource[1], 25 + Buffer.byteLength('中文'.repeat(10) + 'xyz'))
  const total = buf.length
  assert.equal(r.mappedBytes + r.unmappedBytes, total, `守恒 ${r.mappedBytes}+${r.unmappedBytes}=${total}`)
})

test('attributeChunk：段式 sections map 合并归因', () => {
  // 两个 section：第 0 行来自 sec1（源0），第 1-2 行来自 sec2（源1/无映射）
  const mapObj = {
    version: 3,
    sections: [
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: ['a.ts'], mappings: core.buildMappings([[[0, 0, 0, 0]]]) } },
      { offset: { line: 1, column: 3 }, map: { version: 3, sources: ['b.ts'], mappings: core.buildMappings([[[0, 0, 0, 0]]]) } },
    ],
  }
  const linesMap = core.decodeMapLines(mapObj)
  assert.equal(linesMap.get(0)[1], 0)  // sec1 srcIdx 0 → 主图源 0
  assert.equal(linesMap.get(1)[0], 3)  // 首行带列偏移
  assert.equal(linesMap.get(1)[1], 1)  // sec2 srcIdx 0 → 主图源 1（sources 偏移重映射）
  const buf = Buffer.from('aaaaaa\nxxbbbb\ncccc\n')
  const r = core.attributeChunk(buf, linesMap, 2)
  assert.equal(r.perSource[0], 6)  // a.ts 吃掉第一行
  assert.equal(r.perSource[1], 3)  // b.ts 吃掉第二行列 3 之后（bbb）
  assert.ok(r.mappedBytes + r.unmappedBytes === buf.length)
})

// ── 源路径归一 ────────────────────────────────────────────────────────────────
test('normalizeSourcePath：webpack:// / file:// / 反斜杠 / 查询串', () => {
  assert.equal(core.normalizeSourcePath('webpack://my-app/./src/index.js'), 'src/index.js')
  assert.equal(core.normalizeSourcePath('webpack://my-app/node_modules/lodash/lodash.js'), 'node_modules/lodash/lodash.js')
  assert.equal(core.normalizeSourcePath('webpack-internal:///./src/a.ts'), 'src/a.ts')
  assert.equal(core.normalizeSourcePath('file:///D:/proj/src/b.ts'), 'D:/proj/src/b.ts')
  assert.equal(core.normalizeSourcePath('..\\..\\src\\c.ts?v=123'), 'src/c.ts')
  assert.equal(core.normalizeSourcePath('../src/deep/d.ts'), 'src/deep/d.ts')
  assert.equal(core.normalizeSourcePath(''), '(anonymous)')
})

// ── 包解析 ────────────────────────────────────────────────────────────────────
test('parseSourcePackage：pnpm 版本提取 / scope / 嵌套 node_modules / 纯应用为 null', () => {
  const p1 = core.parseSourcePackage('node_modules/.pnpm/react-dom@18.2.0_react@18.2.0/node_modules/react-dom/index.js')
  assert.equal(p1.name, 'react-dom')
  assert.equal(p1.version, '18.2.0')
  const p2 = core.parseSourcePackage('node_modules/.pnpm/@babel+core@7.23.0_@babel+types@7.24.0/node_modules/@babel/core/lib/index.js')
  assert.equal(p2.name, '@babel/core')
  assert.equal(p2.version, '7.23.0')
  const p3 = core.parseSourcePackage('packages/app/node_modules/lodash/lodash.js')
  assert.equal(p3.name, 'lodash')
  assert.equal(p3.version, '')
  assert.ok(p3.rootKey.endsWith('node_modules/lodash'))
  const p4 = core.parseSourcePackage('node_modules/moment/locale/zh-cn.js')
  assert.equal(p4.name, 'moment')
  assert.equal(p4.version, '')
  assert.equal(core.parseSourcePackage('src/main.tsx'), null)
  // 嵌套 node_modules 取最内层
  const p5 = core.parseSourcePackage('node_modules/foo/node_modules/bar/index.js')
  assert.equal(p5.name, 'bar')
})

// ── treemap ──────────────────────────────────────────────────────────────────
test('treemapLayout：面积守恒 + 无零值 + 位置不越界', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, value: (20 - i) * 1000 }))
  const rects = core.treemapLayout(items, 0, 0, 300, 200)
  const area = rects.reduce((a, r) => a + r.w * r.h, 0)
  assert.ok(Math.abs(area - 60000) / 60000 < 0.01, `面积 ${area} ≈ 60000`)
  for (const r of rects) {
    assert.ok(r.w > 0 && r.h > 0)
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 300.01 && r.y + r.h <= 200.01)
  }
  assert.equal(core.treemapLayout([], 0, 0, 100, 100).length, 0)
  assert.equal(core.treemapLayout([{ key: 'a', value: 0 }], 0, 0, 100, 100).length, 0)
})

// ── diff ─────────────────────────────────────────────────────────────────────
test('diffReports：同名对齐 / 新增 / 移除 / 排序', () => {
  const prev = {
    runId: 'r1',
    totals: { totalBytes: 300 },
    packages: [{ name: 'a', bytes: 100 }, { name: 'b', bytes: 200 }],
  }
  const cur = {
    runId: 'r2',
    totals: { totalBytes: 380 },
    packages: [{ name: 'a', bytes: 160 }, { name: 'c', bytes: 220 }],
  }
  const d = core.diffReports(prev, cur)
  assert.equal(d.totalDelta, 80)
  assert.deepEqual(d.added, [{ name: 'c', bytes: 220 }])
  assert.deepEqual(d.removed, [{ name: 'b', bytes: 200 }])
  assert.equal(d.packages[0].name, 'a')
  assert.equal(d.packages[0].delta, 60)
  assert.equal(d.packages[0].pct, 0.6)
})

// ── 建议规则 ──────────────────────────────────────────────────────────────────
test('buildSuggestions：版本冲突 / moment 全量 locale / 无 map 触发对应规则', () => {
  const chunks = [
    { relPath: 'a.js', bytes: 100_000, hasMap: true, mappedBytes: 90_000, unmappedBytes: 10_000, pkgCount: 2, sourceBytes: new Map(), sources: [{ source: 'node_modules/moment/locale/zh-cn.js', bytes: 3000, pkg: { name: 'moment', rootKey: 'x', version: '' } }] },
    { relPath: 'b.js', bytes: 50_000, hasMap: false, mappedBytes: 0, unmappedBytes: 50_000, pkgCount: 0, sourceBytes: new Map(), sources: [] },
  ]
  const agg = {
    packages: [{ name: 'lodash', bytes: 400_000, fileCount: 2, roots: ['r1', 'r2'], versions: ['1.0.0', '1.0.1'] }],
    vendorBytes: 420_000, appBytes: 30_000,
    versionConflicts: [{ name: 'lodash', bytes: 400_000, roots: 2, versions: ['1.0.0', '1.0.1'], files: 2 }],
    chunkDupes: [], contentDupes: [],
    modules: Array.from({ length: 12 }, (_, i) => ({ source: `node_modules/moment/locale/l${i}.js`, pkg: 'moment', bytes: 100, chunks: [0] })),
  }
  const totals = { totalBytes: 450_000, mappedBytes: 400_000, vendorBytes: 420_000, appBytes: 30_000 }
  const ids = core.buildSuggestions(chunks, agg, totals, []).map((s) => s.id)
  assert.ok(ids.includes('dup-version'), '版本冲突建议')
  assert.ok(ids.includes('moment-locale'), 'moment locale 建议')
  assert.ok(ids.includes('partial-map'), '部分无 map 建议')
  assert.ok(ids.includes('vendor-heavy'), '依赖占比建议')
})

test('LIMITS 与 VERSION 存在且自洽', () => {
  assert.ok(core.VERSION)
  assert.ok(core.LIMITS.maxChunks > 0)
  assert.equal(core.KV_PREFIX, 'bundlelens.')
})
