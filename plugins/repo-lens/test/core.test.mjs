/**
 * core.test.mjs —— shared/core 纯函数层单测（node --test，零依赖零网络）
 * 覆盖：numstat 解析（rename 全部语法/二进制/坏行）、rename 花括号空段双斜杠、
 * 复杂度启发式（花括号/缩进语言）、churn 归并与 rename 归因、热点评分与豁免、
 * 时间耦合过滤、重复检测（跨文件/归一化/平移噪声）、卫生、巴士因子、
 * git 其余输出解析、大对象归并（二进制不过滤）、健康分、kv 投影封顶、语言判定。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const core = require('../shared/core.js')

const MARK = core.COMMIT_MARK
const SEP = core.FIELD_SEP
function header(hash, author, email, at, subject) {
  return MARK + [hash, author, email, at, subject].join(SEP)
}

// ── numstat 解析 ────────────────────────────────────────────────────────────

test('numstat：基本解析 + 二进制行', () => {
  const text = [
    header('a1', '甲', 'j@x', 1700000000, 'feat: x'),
    '10\t2\tsrc/a.ts',
    '-\t-\timg/logo.png',
  ].join('\n')
  const { commits, warnings } = core.parseNumstatLog(text)
  assert.equal(warnings.length, 0)
  assert.equal(commits.length, 1)
  assert.equal(commits[0].hash, 'a1')
  assert.equal(commits[0].author, '甲')
  assert.equal(commits[0].date, 1700000000)
  assert.equal(commits[0].files[0].adds, 10)
  assert.equal(commits[0].files[0].dels, 2)
  assert.equal(commits[0].files[1].binary, true)
})

test('numstat：rename 全形式（纯路径 / 花括号 / 空段花括号双斜杠折叠）', () => {
  const text = [
    header('b1', '甲', 'j@x', 1700000000, 'r'),
    '1\t0\told/name.ts => new/name.ts',
    '2\t1\tsrc/{old => new}/util.ts',
    '3\t1\tsrc/{ => core}/parser.ts',
  ].join('\n')
  const { commits } = core.parseNumstatLog(text)
  const f = commits[0].files
  assert.deepEqual([f[0].path, f[0].oldPath], ['new/name.ts', 'old/name.ts'])
  assert.deepEqual([f[1].path, f[1].oldPath], ['src/new/util.ts', 'src/old/util.ts'])
  assert.deepEqual([f[2].path, f[2].oldPath], ['src/core/parser.ts', 'src/parser.ts'])
})

test('numstat：subject 含分隔符时不断裂；坏行计数入警告', () => {
  const text = [
    header('c1', '甲', 'j@x', 1700000000, `feat: 带${SEP}分隔符的消息`),
    '1\t0\ta.ts',
    '这不是numstat行',
  ].join('\n')
  const { commits, warnings } = core.parseNumstatLog(text)
  assert.equal(commits.length, 1)
  assert.ok(commits[0].subject.includes(SEP))
  assert.equal(commits[0].files.length, 1)
  assert.equal(warnings.length, 1)
})

test('numstat：空输入与首行杂散行安全', () => {
  assert.deepEqual(core.parseNumstatLog('').commits, [])
  const { commits } = core.parseNumstatLog('warning: some note\n' + header('d1', '甲', 'j', 1, 's') + '\n1\t0\a.ts'.replace('\a', '\t'))
  assert.equal(commits.length, 1)
})

// ── 复杂度 ──────────────────────────────────────────────────────────────────

test('复杂度：go/rust 关键词表各自生效', () => {
  const go = core.analyzeComplexity('x.go', 'if a && b {\n for range x {\n }\n}')
  assert.equal(go.branchCount, 3) // if && for
  const rs = core.analyzeComplexity('x.rs', 'if a { match b { } }')
  assert.equal(rs.branchCount, 2) // if match
})

test('复杂度：缩进语言（rb/sh）与未知扩展降级', () => {
  const rb = core.analyzeComplexity('x.rb', 'if x\n  unless y\n    z\n  end\nend')
  assert.equal(rb.maxDepth, 3)
  const unk = core.analyzeComplexity('x.weird', 'plain text here')
  assert.equal(unk.branchCount, 0)
  assert.equal(unk.lang, 'weird')
})

test('复杂度：空文件', () => {
  const cx = core.analyzeComplexity('a.ts', '')
  assert.equal(cx.lines, 1)
  assert.equal(cx.codeLines, 0)
  assert.equal(cx.cxScore, 0)
})

// ── 语言判定与豁免 ──────────────────────────────────────────────────────────

test('语言判定：锁文件/压缩产物优先于扩展名表', () => {
  assert.equal(core.detectLanguage('package-lock.json').kind, 'skip-content')
  assert.equal(core.detectLanguage('app.min.js').kind, 'skip-content')
  assert.equal(core.detectLanguage('foo.chunk.js').kind, 'skip-content')
  assert.equal(core.detectLanguage('src/app.min.js').kind, 'skip-content')
  assert.equal(core.detectLanguage('src/util.ts').kind, 'code')
  assert.equal(core.detectLanguage('a.png').kind, 'binary')
})

test('skipContent：目录豁免 + 正常代码不豁免', () => {
  assert.equal(core.skipContent('node_modules/x/index.js'), true)
  assert.equal(core.skipContent('apps/web/dist/assets/index-abc.js'), true)
  assert.equal(core.skipContent('src/util.ts'), false)
  assert.equal(core.skipContent('vendor/lib/go.go'), true)
})

// ── churn / 热点 ────────────────────────────────────────────────────────────

function fixtureCommits() {
  const text = [
    header('h1', '张三', 'z@x', 1700000000, 'feat: a'),
    '10\t2\tsrc/util.ts',
    '5\t1\tsrc/parser.ts',
    header('h2', '李四', 'l@x', 1700001000, 'fix: b'),
    '3\t1\tsrc/util.ts',
    '2\t0\tsrc/parser.ts',
    '8\t0\tsrc/other.ts',
  ].join('\n')
  return core.parseNumstatLog(text).commits
}

test('churn：多作者计数与首末触点', () => {
  const churn = core.buildChurn(fixtureCommits())
  const u = churn.get('src/util.ts')
  assert.equal(u.commits, 2)
  assert.equal(u.adds, 13)
  assert.deepEqual(Object.keys(u.authors).sort(), ['张三', '李四'])
  assert.equal(u.firstTouch, 1700000000)
  assert.equal(u.lastTouch, 1700001000)
})

test('热点：无复杂度数据也能排（churnN 分量保底）；线性归一单调', () => {
  const churn = core.buildChurn(fixtureCommits())
  const rows = core.buildHotspots(churn, new Map(), new Map())
  assert.equal(rows.length, 3)
  const util = rows.find((r) => r.path === 'src/util.ts')
  const other = rows.find((r) => r.path === 'src/other.ts')
  assert.ok(util.score > other.score, '提交多的文件分应更高')
  assert.equal(util.complexityKnown, false)
})

test('热点分数公式：与手算一致', () => {
  const commits = [header('h1', 'a', 'a@x', 1, 's'), '1\t0\tf1.ts', header('h2', 'a', 'a@x', 2, 's'), '1\t0\tf2.ts']
  const churn = core.buildChurn(core.parseNumstatLog(commits.join('\n')).commits)
  const cx = new Map([
    ['f1.ts', { lang: 'ts', cxRaw: 20, cxScore: 40, codeLines: 10 }],
    ['f2.ts', { lang: 'ts', cxRaw: 60, cxScore: 100, codeLines: 10 }],
  ])
  const rows = core.buildHotspots(churn, cx, new Map())
  const f1 = rows.find((r) => r.path === 'f1.ts')
  const f2 = rows.find((r) => r.path === 'f2.ts')
  // churnN 都是 1；f1 cxN=20/60，f2 cxN=1
  assert.equal(f1.score, Math.round(100 * (0.25 + 0.25 * (20 / 60) + 0.5 * Math.sqrt(20 / 60))))
  assert.equal(f2.score, 100)
})

// ── 时间耦合 ────────────────────────────────────────────────────────────────

test('耦合：minCo 与 minRatio 双闸', () => {
  const commits = []
  for (let i = 0; i < 3; i++) {
    commits.push({ hash: String(i), author: 'a', date: i, files: [{ path: 'a.ts' }, { path: 'b.ts' }] })
  }
  commits.push({ hash: 'x', author: 'a', date: 9, files: [{ path: 'a.ts' }, { path: 'c.ts' }] })
  const churn = core.buildChurn(commits)
  const pairs = core.buildCoChange(commits, churn, { minCo: 3, minRatio: 0.5 })
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].co, 3)
  assert.equal(pairs[0].ratio, 1)
  const strict = core.buildCoChange(commits, churn, { minCo: 4, minRatio: 0.5 })
  assert.equal(strict.length, 0)
})

// ── 重复 ────────────────────────────────────────────────────────────────────

test('重复：归一化忽略空白大小写与行注释；http:// 不被误剥', () => {
  const a = [
    'const cache = new Map();',
    'function fetchUser(id) {',
    '  const url = "http://api.test/users/" + id; // 内部地址',
    '  const res = httpGet(url);',
    '  if (!res.ok) return null;',
    '  cache.set(id, res.data);',
    '  return res.data;',
    '}',
  ].join('\n')
  const b = [
    '// copied from a.ts',
    'const cache = new Map();',
    'function fetchUser(id) {',
    '   const url = "http://api.test/users/" + id;',
    '   const res = httpGet(url);',
    '   if (!res.ok) return null;',
    '   cache.set(id, res.data);',
    '   return res.data;',
    '}',
  ].join('\n')
  const r = core.findDuplication([
    { path: 'a.ts', content: a, lang: 'ts' },
    { path: 'b.ts', content: b, lang: 'ts' },
  ])
  assert.ok(r.pairs.length >= 1, '应检出跨文件重复')
  assert.ok(r.totalDupLines >= 6, `重复行数应 ≥6，得 ${r.totalDupLines}`)
})

test('重复：normalizeLine 短行与 http:// 不被误剥', () => {
  assert.equal(core.normalizeLine('ab', 'ts'), null)
  assert.equal(core.normalizeLine('const u = "http://x/y"', 'ts'), 'const u = "http://x/y"')
  assert.equal(core.normalizeLine('  If  X: ', 'py'), 'if x:')
})

test('重复：单文件内部远距复制计入', () => {
  // 每份拷贝需 ≥6 条有效行（'}' 归一化后过短会被丢弃——这正是窗口噪声控制的设计）
  const block = [
    'function calcRank(scores, weight) {',
    '  const scaled = scores.map((s) => s * weight);',
    '  const sorted = scaled.sort((x, y) => y - x);',
    '  if (sorted.length === 0) return 0;',
    '  const top = sorted.slice(0, 10);',
    '  const sum = top.reduce((acc, s) => acc + s, 0);',
    '  return sum / Math.max(1, top.length);',
    '}',
  ].join('\n')
  const filler = Array.from({ length: 14 }, (_, i) => `const filler${i} = ${i};`).join('\n')
  const content = block + '\n' + filler + '\n' + block + '\n' // 真复制粘贴，隔着 filler
  const r = core.findDuplication([{ path: 's.ts', content, lang: 'ts' }])
  assert.ok(r.totalDupLines >= 6, `应检出同文件远距复制，得 ${r.totalDupLines}`)
})

// ── 卫生 / 巴士因子 ─────────────────────────────────────────────────────────

test('卫生：merge 单列、conventional、草率、巨提交', () => {
  const commits = [
    { hash: '1', author: 'a', date: 1, subject: 'feat(x): ok', files: [{}] },
    { hash: '2', author: 'a', date: 2, subject: 'Merge branch main', files: [{}] },
    { hash: '3', author: 'a', date: 3, subject: 'wip', files: new Array(25).fill({}) },
  ]
  const h = core.analyzeHygiene(commits)
  assert.equal(h.total, 3)
  assert.equal(h.merges, 1)
  assert.equal(h.conventional, 1)
  assert.equal(h.conventionalRate, 0.5)
  assert.equal(h.sloppy, 1)
  assert.equal(h.bigCommits, 1)
})

test('巴士因子：双作者对半 → 1；一人主导 → 1 且 share 高', () => {
  const commits = fixtureCommits()
  const bf = core.buildBusFactor(commits)
  assert.equal(bf.totalAuthors, 2)
  assert.equal(bf.busFactor, 1) // 张三1/李四1 → 50% 需 1 人
})

// ── git 其余输出解析 ────────────────────────────────────────────────────────

test('for-each-ref 解析与最旧在前排序', () => {
  const br = core.parseBranches([
    '1700000000\tfeat/a\t张三\twip x',
    '1699990000\tmain\t李四\tfeat: y',
  ].join('\n'))
  assert.equal(br[0].branch, 'main')
  assert.equal(br.length, 2)
})

test('rev-list/batch-check/大对象归并：二进制资产不因扩展名被滤掉', () => {
  const objects = core.parseRevObjects('aaa big/blob.bin\nbbb src/a.ts\nccc')
  assert.equal(objects.length, 2)
  assert.equal(objects[1].path, 'src/a.ts')
  const checks = core.parseBatchCheck('aaa blob 2097152 big/blob.bin\nbbb blob 100 src/a.ts\nccc commit 200\n')
  const rows = core.aggregateBlobs(objects, checks, { topN: 10 })
  assert.equal(rows[0].path, 'big/blob.bin')
  assert.equal(rows[0].mb, 2)
  assert.equal(rows[0].versions, 1)
})

// ── 健康分 / 投影 ───────────────────────────────────────────────────────────

test('健康分：全好=高分，全差=低分，且分量各有贡献', () => {
  const good = core.healthScore({
    hotspotRows: Array.from({ length: 50 }, (_, i) => ({ commits: 1 })),
    totalCodeLines: 10000, totalDupLines: 50, conventionalRate: 0.95, busFactor: 5, blobs: [],
  })
  const bad = core.healthScore({
    hotspotRows: [{ commits: 100 }, { commits: 1 }],
    totalCodeLines: 1000, totalDupLines: 300, conventionalRate: 0.1, busFactor: 1,
    blobs: [{ mb: 40 }],
  })
  assert.ok(good.total >= 75, `好仓应 ≥75，得 ${good.total}`)
  assert.ok(bad.total <= 35, `差仓应 ≤35，得 ${bad.total}`)
})

test('健康分：边界输入不越界不炸', () => {
  const z = core.healthScore({ hotspotRows: [], totalCodeLines: 0, totalDupLines: 0, conventionalRate: 0, busFactor: 0, blobs: [] })
  assert.ok(z.total >= 0 && z.total <= 100)
})

test('kv 投影：热点/耦合/重复/分支封顶与字符串截断', () => {
  const big = {
    runId: 'r1', status: 'ok', startedAt: 1, finishedAt: 2,
    repo: { top: 'D:/x', branch: 'main', commitHead: 'abc' },
    window: { days: 365, maxCommits: 100, sinceIso: '2025-11-02' },
    totals: { commits: 1 },
    languages: [],
    health: { total: 80, parts: {}, weights: {} },
    hotspots: Array.from({ length: 400 }, (_, i) => ({ path: 'p'.repeat(300) + i, score: i, topAuthor: 'n' })),
    couples: Array.from({ length: 200 }, (_, i) => ({ a: 'a', b: 'b', co: i, ratio: 1 })),
    duplications: { pairs: Array.from({ length: 150 }, () => ({ a: 'x', b: 'y', lines: 6, preview: ['l'.repeat(200)] })) },
    dupSummary: { totalDupLines: 900, ratio: 0.09 },
    blobs: [], branches: Array.from({ length: 150 }, () => ({ branch: 'b', date: 1, author: 'a', subject: 's' })),
    hygiene: {}, busFactor: { authors: [] }, warnings: ['w'.repeat(400)],
  }
  const p = core.projectReport(big)
  assert.equal(p.hotspots.length, 300)
  assert.ok(p.hotspots[0].path.length <= 260)
  assert.equal(p.couples.length, 100)
  assert.equal(p.duplications.length, 100)
  assert.ok(p.duplications[0].preview[0].length <= 120)
  assert.equal(p.branches.length, 100)
  assert.ok(p.warnings[0].length <= 300)
})

// ── 内置自检 ────────────────────────────────────────────────────────────────

test('core.selftest 全绿', () => {
  const st = core.selftest()
  assert.equal(st.ok, true, JSON.stringify(st.failed))
})
